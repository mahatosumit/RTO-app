import { createHash, randomUUID } from "node:crypto";
import Papa from "papaparse";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { couriers, customers, datasets, importErrors, importJobs, ndrRecords, pincodes, products, rtoRecords, shipmentEvents, shipments } from "@/db/schema";
import { ApiError } from "@/lib/api-error";
import { audit, getCostModel, getOrgId } from "@/lib/org";
import { rtoCostForShipment } from "@/lib/domain/cost";
import { findImpossibleTransitions } from "@/lib/domain/classify";
import { normalizeNdrReason } from "@/lib/domain/ndr";
import { geoFromPincode } from "@/lib/domain/geo";
import { fieldsFor, missingRequired, sanitizeMapping, suggestMapping } from "./mapping";
import { computeQuality, type QualityReport } from "./quality";
import {
  createContext,
  validateEventRow,
  validateShipmentRow,
  type Issue,
  type NormalizedEvent,
  type NormalizedShipment,
  type Severity,
} from "./validate";

export const MAX_UPLOAD_BYTES = () => Math.max(1, Number(process.env.MAX_UPLOAD_MB ?? 10)) * 1024 * 1024;
export const MAX_IMPORT_ROWS = () => Math.max(1, Number(process.env.MAX_IMPORT_ROWS ?? 500000));
const MAX_STORED_ERRORS = 5000;

export type ImportKind = "SHIPMENTS" | "EVENTS";

export interface ErrRow {
  rowNumber: number;
  severity: Severity;
  code: string;
  field?: string;
  message: string;
  raw?: Record<string, string>;
}

export function parseCsvText(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const res = Papa.parse<Record<string, string>>(text.replace(/^\uFEFF/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.replace(/^\uFEFF/, "").trim(),
    dynamicTyping: false,
  });
  const headers = (res.meta.fields ?? []).filter((h) => h !== "");
  // Row-level structural errors (e.g. too many/few fields) are tolerated; papaparse pads/truncates.
  return { headers, rows: res.data.filter((r) => r && typeof r === "object") };
}

export interface ProcessResult {
  total: number;
  shipments: NormalizedShipment[];
  events: NormalizedEvent[];
  errors: ErrRow[];
  rejected: number;
  codeCounts: Record<string, number>;
  courierAliases: Record<string, string[]>;
}

function record(codeCounts: Record<string, number>, issues: Issue[]) {
  for (const code of new Set(issues.map((i) => i.code))) codeCounts[code] = (codeCounts[code] ?? 0) + 1;
}

export function processShipmentRows(rows: Record<string, string>[], mapping: Record<string, string | null>): ProcessResult {
  const ctx = createContext();
  const out: ProcessResult = { total: rows.length, shipments: [], events: [], errors: [], rejected: 0, codeCounts: {}, courierAliases: {} };
  rows.forEach((raw, i) => {
    const rowNumber = i + 2;
    const res = validateShipmentRow(raw, mapping, rowNumber, ctx);
    const issues = res.ok ? res.warnings : [...res.errors, ...res.warnings];
    record(out.codeCounts, issues);
    for (const is of issues) out.errors.push({ rowNumber, severity: is.severity, code: is.code, field: is.field, message: is.message, raw: is.severity === "ERROR" ? raw : undefined });
    if (res.ok) out.shipments.push(res.row);
    else out.rejected++;
  });
  for (const s of out.shipments) {
    s.courierName = ctx.couriers.finalName(s.courierName);
    if (!out.courierAliases[s.courierName]) out.courierAliases[s.courierName] = ctx.couriers.aliasesFor(s.courierName);
  }
  return out;
}

export function processEventRows(rows: Record<string, string>[], mapping: Record<string, string | null>, knownShipmentIds: Set<string>): ProcessResult {
  const out: ProcessResult = { total: rows.length, shipments: [], events: [], errors: [], rejected: 0, codeCounts: {}, courierAliases: {} };
  const parsed: Array<{ ev: NormalizedEvent; raw: Record<string, string>; idx: number }> = [];
  const reject = (rowNumber: number, issue: Issue, raw: Record<string, string>) => {
    out.rejected++;
    record(out.codeCounts, [issue]);
    out.errors.push({ rowNumber, severity: "ERROR", code: issue.code, field: issue.field, message: issue.message, raw });
  };
  rows.forEach((raw, i) => {
    const rowNumber = i + 2;
    const res = validateEventRow(raw, mapping, rowNumber);
    if (!res.ok) {
      record(out.codeCounts, res.errors);
      out.rejected++;
      for (const e of res.errors) out.errors.push({ rowNumber, severity: "ERROR", code: e.code, field: e.field, message: e.message, raw });
      return;
    }
    if (!knownShipmentIds.has(res.event.shipmentId)) {
      reject(rowNumber, { severity: "ERROR", code: "UNKNOWN_SHIPMENT", field: "shipment_id", message: `Shipment "${res.event.shipmentId}" does not exist in the target dataset.` }, raw);
      return;
    }
    parsed.push({ ev: res.event, raw, idx: i });
  });
  const groups = new Map<string, typeof parsed>();
  for (const p of parsed) {
    const g = groups.get(p.ev.shipmentId) ?? [];
    g.push(p);
    groups.set(p.ev.shipmentId, g);
  }
  for (const g of groups.values()) {
    g.sort((a, b) => a.ev.ts.getTime() - b.ev.ts.getTime() || a.idx - b.idx);
    const bad = new Set(findImpossibleTransitions(g.map((x) => x.ev.eventType)).map((x) => x.index));
    g.forEach((p, i) => {
      if (bad.has(i)) reject(p.ev.sourceRow, { severity: "ERROR", code: "IMPOSSIBLE_TRANSITION", field: "event_type", message: `Event "${p.ev.eventType}" cannot follow the preceding events for this shipment.` }, p.raw);
      else out.events.push(p.ev);
    });
  }
  return out;
}

// ------------------------------------------------------------------ job lifecycle

export interface JobSummary {
  id: string;
  kind: ImportKind;
  status: string;
  fileName: string;
  headers: string[];
  sampleRows: Record<string, string>[];
  suggestedMapping: Record<string, string | null>;
  rowCount: number;
  fields: Array<{ key: string; label: string; required: boolean }>;
}

export async function createImportJob(input: {
  fileName: string;
  content: string;
  size: number;
  kind: ImportKind;
  datasetName?: string;
  targetDatasetId?: string;
}): Promise<JobSummary> {
  if (input.size > MAX_UPLOAD_BYTES()) throw new ApiError(413, "FILE_TOO_LARGE", `File is larger than the ${Math.round(MAX_UPLOAD_BYTES() / 1048576)} MB limit.`);
  if (!/\.csv$/i.test(input.fileName)) throw new ApiError(400, "INVALID_FILE_TYPE", "Only .csv files are supported. Export your report as CSV.");
  if (input.content.includes("\u0000")) throw new ApiError(400, "INVALID_FILE_TYPE", "This file looks binary, not a text CSV.");
  if (!input.content.trim()) throw new ApiError(400, "EMPTY_FILE", "The file is empty.");
  const { headers, rows } = parseCsvText(input.content);
  if (headers.length === 0) throw new ApiError(400, "NO_HEADERS", "No header row was found in the CSV.");
  if (rows.length === 0) throw new ApiError(400, "NO_ROWS", "The CSV has a header but no data rows.");
  if (rows.length > MAX_IMPORT_ROWS()) throw new ApiError(413, "TOO_MANY_ROWS", `The file has more than ${MAX_IMPORT_ROWS().toLocaleString("en-IN")} rows.`);
  const orgId = await getOrgId();
  const suggested = suggestMapping(headers, input.kind);
  const [job] = await db
    .insert(importJobs)
    .values({
      orgId,
      kind: input.kind,
      status: "UPLOADED",
      fileName: input.fileName.slice(0, 200),
      fileSize: input.size,
      fileHash: createHash("sha256").update(input.content).digest("hex"),
      datasetName: (input.datasetName ?? input.fileName).slice(0, 120),
      datasetId: input.targetDatasetId ?? null,
      headers,
      sampleRows: rows.slice(0, 5),
      suggestedMapping: suggested,
      mapping: suggested,
      rowCount: rows.length,
      rawContent: input.content,
    })
    .returning();
  return {
    id: job.id,
    kind: input.kind,
    status: job.status,
    fileName: job.fileName,
    headers,
    sampleRows: rows.slice(0, 5),
    suggestedMapping: suggested,
    rowCount: rows.length,
    fields: fieldsFor(input.kind).map((f) => ({ key: f.key, label: f.label, required: f.required })),
  };
}

async function loadJob(jobId: string) {
  const [job] = await db.select().from(importJobs).where(eq(importJobs.id, jobId)).limit(1);
  if (!job) throw new ApiError(404, "JOB_NOT_FOUND", "Import job not found.");
  return job;
}

async function knownShipmentIds(datasetId: string): Promise<Set<string>> {
  const rows = await db.select({ s: shipments.shipmentId }).from(shipments).where(eq(shipments.datasetId, datasetId));
  return new Set(rows.map((r) => r.s));
}

async function runProcessing(job: typeof importJobs.$inferSelect, mapping: Record<string, string | null>): Promise<ProcessResult> {
  if (!job.rawContent) throw new ApiError(409, "JOB_CLOSED", "This import has already been committed; upload the file again to re-import.");
  const { rows } = parseCsvText(job.rawContent);
  if (job.kind === "EVENTS") {
    if (!job.datasetId) throw new ApiError(400, "NO_TARGET_DATASET", "Events must be imported into an existing dataset.");
    return processEventRows(rows, mapping, await knownShipmentIds(job.datasetId));
  }
  return processShipmentRows(rows, mapping);
}

export interface ValidationReport {
  quality: QualityReport;
  rowCount: number;
  acceptedCount: number;
  rejectedCount: number;
  examples: ErrRow[];
  storedErrors: number;
  truncated: boolean;
}

export async function validateImportJob(jobId: string, mappingInput: Record<string, string | null | undefined>): Promise<ValidationReport> {
  const job = await loadJob(jobId);
  const kind = job.kind as ImportKind;
  const mapping = sanitizeMapping(mappingInput, job.headers, kind);
  const missing = missingRequired(mapping, kind);
  if (missing.length) throw new ApiError(400, "MISSING_REQUIRED_MAPPING", `Map the required field(s): ${missing.join(", ")}.`);
  const res = await runProcessing(job, mapping);
  const quality = computeQuality({ total: res.total, rejected: res.rejected, codeCounts: res.codeCounts });
  const ordered = [...res.errors.filter((e) => e.severity === "ERROR"), ...res.errors.filter((e) => e.severity === "WARNING")];
  const stored = ordered.slice(0, MAX_STORED_ERRORS);
  await db.delete(importErrors).where(eq(importErrors.importJobId, jobId));
  for (let i = 0; i < stored.length; i += 1000) {
    await db.insert(importErrors).values(
      stored.slice(i, i + 1000).map((e) => ({ importJobId: jobId, rowNumber: e.rowNumber, severity: e.severity, code: e.code, field: e.field ?? null, message: e.message, raw: (e.raw ?? null) as never })),
    );
  }
  const report: ValidationReport = {
    quality,
    rowCount: res.total,
    acceptedCount: res.total - res.rejected,
    rejectedCount: res.rejected,
    examples: stored.filter((e) => e.severity === "ERROR").slice(0, 10).map((e) => ({ ...e, raw: undefined })),
    storedErrors: stored.length,
    truncated: ordered.length > stored.length,
  };
  await db.update(importJobs).set({ mapping, report: report as never, status: "VALIDATED", error: null }).where(eq(importJobs.id, jobId));
  return report;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function chunked<T>(rows: T[], size: number, fn: (chunk: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size));
}

export interface CommitResult {
  datasetId: string;
  imported: number;
  rejected: number;
  kind: ImportKind;
  qualityScore: number;
}

export async function commitImportJob(jobId: string, opts: { isDemo?: boolean } = {}): Promise<CommitResult> {
  const job = await loadJob(jobId);
  if (job.status === "COMMITTED") throw new ApiError(409, "ALREADY_COMMITTED", "This import was already committed.");
  if (!job.mapping || job.status !== "VALIDATED") throw new ApiError(409, "NOT_VALIDATED", "Validate the import before committing.");
  const kind = job.kind as ImportKind;
  const mapping = job.mapping;
  const started = Date.now();
  try {
    const res = await runProcessing(job, mapping);
    const quality = computeQuality({ total: res.total, rejected: res.rejected, codeCounts: res.codeCounts });
    if (kind === "SHIPMENTS" && res.shipments.length === 0) throw new ApiError(422, "NOTHING_TO_IMPORT", "No valid rows to import. Review the rejected rows and fix the file or mapping.");
    const orgId = job.orgId;
    const cost = await getCostModel(orgId);
    let datasetId = job.datasetId;

    await db.transaction(async (tx) => {
      if (kind === "SHIPMENTS") {
        const maxOrder = res.shipments.reduce((m, s) => Math.max(m, s.orderDate.getTime()), 0);
        const [ds] = await tx
          .insert(datasets)
          .values({ orgId, name: job.datasetName ?? job.fileName, source: opts.isDemo ? "demo" : "csv", isDemo: !!opts.isDemo, shipmentCount: res.shipments.length, rejectedCount: res.rejected, qualityScore: quality.score, qualityReport: quality as never, asOf: new Date(maxOrder) })
          .returning();
        datasetId = ds.id;
        await persistShipments(tx, ds.id, job.id, job.fileName, res, cost);
      } else {
        await persistEvents(tx, datasetId!, res.events);
        await tx.update(datasets).set({ rejectedCount: sql`${datasets.rejectedCount} + ${res.rejected}` }).where(eq(datasets.id, datasetId!));
      }
      await tx.update(importJobs).set({ status: "COMMITTED", datasetId, rawContent: null, committedAt: new Date(), report: { ...(job.report as object), quality, acceptedCount: res.total - res.rejected, rejectedCount: res.rejected } as never }).where(eq(importJobs.id, jobId));
    });
    await audit("import.commit", "import_job", jobId, { kind, datasetId, imported: kind === "SHIPMENTS" ? res.shipments.length : res.events.length, rejected: res.rejected, ms: Date.now() - started });
    console.log(JSON.stringify({ level: "info", msg: "import committed", jobId, kind, rows: res.total, rejected: res.rejected, ms: Date.now() - started }));
    return { datasetId: datasetId!, imported: kind === "SHIPMENTS" ? res.shipments.length : res.events.length, rejected: res.rejected, kind, qualityScore: quality.score };
  } catch (e) {
    await db.update(importJobs).set({ status: e instanceof ApiError ? job.status : "FAILED", error: e instanceof Error ? e.message.slice(0, 500) : "failed" }).where(eq(importJobs.id, jobId));
    throw e;
  }
}

async function persistShipments(tx: Tx, datasetId: string, jobId: string, fileName: string, res: ProcessResult, cost: Awaited<ReturnType<typeof getCostModel>>) {
  const rows = res.shipments;
  const custMap = new Map<string, string>();
  const prodMap = new Map<string, { id: string; category: string | null }>();
  const courMap = new Map<string, string>();
  const pinSeen = new Map<string, ReturnType<typeof geoFromPincode> & { city: string | null }>();
  for (const s of rows) {
    if (s.customerExternalId && !custMap.has(s.customerExternalId)) custMap.set(s.customerExternalId, randomUUID());
    if (s.productName && !prodMap.has(s.productName)) prodMap.set(s.productName, { id: randomUUID(), category: s.category });
    if (!courMap.has(s.courierName)) courMap.set(s.courierName, randomUUID());
    if (s.pincode && !pinSeen.has(s.pincode)) pinSeen.set(s.pincode, { ...geoFromPincode(s.pincode), city: s.city });
  }
  await chunked([...custMap], 2000, (c) => tx.insert(customers).values(c.map(([externalId, id]) => ({ id, datasetId, externalId }))));
  await chunked([...prodMap], 2000, (c) => tx.insert(products).values(c.map(([name, v]) => ({ id: v.id, datasetId, name, category: v.category }))));
  await chunked([...courMap], 500, (c) => tx.insert(couriers).values(c.map(([name, id]) => ({ id, datasetId, name, aliases: res.courierAliases[name] ?? [] }))));
  await chunked([...pinSeen.values()], 2000, (c) => tx.insert(pincodes).values(c.map((p) => ({ pincode: p.pincode, state: p.state, city: p.city, region: p.region, pin3: p.pin3 }))).onConflictDoNothing());

  const ids = rows.map(() => randomUUID());
  const indexed = rows.map((s, i) => ({ s, id: ids[i] }));
  await chunked(indexed, 800, (c) =>
    tx.insert(shipments).values(
      c.map(({ s, id }) => ({
        id, datasetId, importJobId: jobId, sourceRow: s.sourceRow, shipmentId: s.shipmentId, orderId: s.orderId,
        customerId: s.customerExternalId ? custMap.get(s.customerExternalId)! : null,
        productId: s.productName ? prodMap.get(s.productName)!.id : null,
        courierId: courMap.get(s.courierName)!,
        pincode: s.pincode, orderValue: s.orderValue, paymentType: s.paymentType, orderDate: s.orderDate,
        dispatchDate: s.dispatchDate, expectedDeliveryDate: s.expectedDeliveryDate, actualDeliveryDate: s.actualDeliveryDate,
        deliveryStatus: s.rawStatus, finalStatus: s.finalStatus, attempts: s.attempts, ndrCount: s.ndrCount, rtoFlag: s.rtoFlag,
        rtoReason: s.rtoReason, ndrReasonCode: s.ndrReasonCode, sourceDataset: fileName,
        courierName: s.courierName, productName: s.productName, category: s.category, state: s.state, city: s.city,
        region: s.region, pin3: s.pin3, valueBand: s.valueBand, transitHours: s.transitHours, isEligible: s.isEligible,
      })),
    ),
  );
  const ndr = indexed.filter(({ s }) => s.ndrCount > 0 && s.ndrReasonCode);
  await chunked(ndr, 2000, (c) => tx.insert(ndrRecords).values(c.map(({ s, id }) => ({ datasetId, shipmentPk: id, attemptNo: s.ndrCount, reasonRaw: s.ndrReasonRaw, reasonCode: s.ndrReasonCode!, ts: null }))));
  const rto = indexed.filter(({ s }) => s.finalStatus === "RTO");
  await chunked(rto, 2000, (c) => tx.insert(rtoRecords).values(c.map(({ s, id }) => ({ datasetId, shipmentPk: id, initiatedAt: s.rtoDate, reasonRaw: s.rtoReason ?? s.ndrReasonRaw, reasonCode: s.ndrReasonCode, ndrCount: s.ndrCount, estimatedCost: rtoCostForShipment(s.orderValue, cost) }))));

  await tx.execute(sql`
    UPDATE customers c SET order_count = x.n
    FROM (SELECT customer_id, count(*)::int AS n FROM shipments WHERE dataset_id = ${datasetId}::uuid AND customer_id IS NOT NULL GROUP BY 1) x
    WHERE c.id = x.customer_id`);
  await tx.execute(sql`
    UPDATE shipments s SET is_repeat_customer = (c.order_count >= 2)
    FROM customers c WHERE s.customer_id = c.id AND s.dataset_id = ${datasetId}::uuid`);
}

async function persistEvents(tx: Tx, datasetId: string, events: NormalizedEvent[]) {
  if (events.length === 0) return;
  const pkRows = await tx.select({ id: shipments.id, sid: shipments.shipmentId }).from(shipments).where(eq(shipments.datasetId, datasetId));
  const pk = new Map(pkRows.map((r) => [r.sid, r.id]));
  await chunked(events, 2000, (c) =>
    tx.insert(shipmentEvents).values(
      c.map((e) => ({ eventId: e.eventId, datasetId, shipmentPk: pk.get(e.shipmentId)!, ts: e.ts, eventType: e.eventType, location: e.location, status: e.status, description: e.description })),
    ),
  );
  const existing = new Set(
    (await tx.select({ s: ndrRecords.shipmentPk }).from(ndrRecords).where(eq(ndrRecords.datasetId, datasetId))).map((r) => r.s),
  );
  const counters = new Map<string, number>();
  const ndrRows: Array<typeof ndrRecords.$inferInsert> = [];
  for (const e of events.filter((x) => x.eventType === "NDR")) {
    const shipmentPk = pk.get(e.shipmentId)!;
    if (existing.has(shipmentPk)) continue;
    const n = (counters.get(shipmentPk) ?? 0) + 1;
    counters.set(shipmentPk, n);
    ndrRows.push({ datasetId, shipmentPk, attemptNo: n, reasonRaw: e.description ?? e.status, reasonCode: normalizeNdrReason(e.description ?? e.status), ts: e.ts });
  }
  await chunked(ndrRows, 2000, (c) => tx.insert(ndrRecords).values(c));
}

// ------------------------------------------------------------------ queries for UI

export async function getImportJob(jobId: string) {
  const [job] = await db
    .select({ id: importJobs.id, kind: importJobs.kind, status: importJobs.status, fileName: importJobs.fileName, fileSize: importJobs.fileSize, fileHash: importJobs.fileHash, datasetId: importJobs.datasetId, rowCount: importJobs.rowCount, report: importJobs.report, error: importJobs.error, createdAt: importJobs.createdAt, committedAt: importJobs.committedAt })
    .from(importJobs)
    .where(eq(importJobs.id, jobId))
    .limit(1);
  return job ?? null;
}

export async function listImportJobs(datasetId?: string | null) {
  const orgId = await getOrgId();
  const rows = await db
    .select({ id: importJobs.id, kind: importJobs.kind, status: importJobs.status, fileName: importJobs.fileName, fileSize: importJobs.fileSize, fileHash: importJobs.fileHash, datasetId: importJobs.datasetId, rowCount: importJobs.rowCount, report: importJobs.report, createdAt: importJobs.createdAt, committedAt: importJobs.committedAt })
    .from(importJobs)
    .where(datasetId ? and(eq(importJobs.orgId, orgId), eq(importJobs.datasetId, datasetId)) : eq(importJobs.orgId, orgId))
    .orderBy(asc(importJobs.createdAt));
  return rows;
}

export async function getImportErrors(jobId: string, opts: { severity?: string; code?: string; limit?: number; offset?: number } = {}) {
  const conds = [eq(importErrors.importJobId, jobId)];
  if (opts.severity) conds.push(eq(importErrors.severity, opts.severity));
  if (opts.code) conds.push(eq(importErrors.code, opts.code));
  return db
    .select()
    .from(importErrors)
    .where(and(...conds))
    .orderBy(asc(importErrors.rowNumber))
    .limit(Math.min(opts.limit ?? 100, 5000))
    .offset(opts.offset ?? 0);
}
