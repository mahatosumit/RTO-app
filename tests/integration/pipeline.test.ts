import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, pool } from "@/db";
import { auditLogs, datasets, importJobs, shipments } from "@/db/schema";
import { commitImportJob, createImportJob, getImportErrors, validateImportJob } from "@/lib/csv/pipeline";
import { aggregateBy, aggregateTotal, weeklyCounts } from "@/lib/analytics/aggregate";
import { findCandidates, runSimulation, getDashboard } from "@/lib/analytics/insights";
import { computeMetrics } from "@/lib/analytics/metrics";
import { SCENARIO_TYPES } from "@/lib/analytics/simulate";
import { addNote, generateFindings, getFinding, listFindings, openInvestigation, setInvestigationStatus } from "@/lib/findings";
import { asOfString, deleteDataset, getCostModel, getDatasetById } from "@/lib/org";
import { buildDatasetReport, buildInvestigationReport } from "@/lib/report";
import { listShipments, getShipmentDetail } from "@/lib/shipments";
import { latestSimulationForFinding, saveSimulation } from "@/lib/simulations";
import { buildEventsCsv, buildFixture } from "../fixtures";
import { ApiError } from "@/lib/api-error";

const fx = buildFixture("IT");
let jobId = "";
let datasetId = "";
let emptyDatasetId = "";
let asOf = "";
let findingId = "";

const mk = (content: string, fileName = "f.csv", size?: number) => createImportJob({ fileName, content, size: size ?? Buffer.byteLength(content), kind: "SHIPMENTS" });
const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return null;
  } catch (e) {
    return e instanceof ApiError ? e.code : "OTHER";
  }
};

afterAll(async () => {
  if (datasetId) await deleteDataset(datasetId);
  if (emptyDatasetId) await deleteDataset(emptyDatasetId);
  await pool.end();
});

describe("import → validate → commit", () => {
  it("rejects unsafe or empty uploads with safe errors", async () => {
    expect(await code(mk(""))).toBe("EMPTY_FILE");
    expect(await code(mk("a,b\n1,2\n", "notes.txt"))).toBe("INVALID_FILE_TYPE");
    expect(await code(mk("AWB,Order Amount\n"))).toBe("NO_ROWS");
    expect(await code(mk("AWB,Order Amount\n1\u0000,2\n"))).toBe("INVALID_FILE_TYPE");
    expect(await code(mk("AWB,Order Amount\n1,2\n", "big.csv", 50 * 1024 * 1024))).toBe("FILE_TOO_LARGE");
  });

  it("inspects columns and suggests an explicit mapping", async () => {
    const job = await mk(fx.csv, "fixture.csv");
    jobId = job.id;
    expect(job.rowCount).toBe(fx.total);
    expect(job.suggestedMapping).toMatchObject({ shipment_id: "AWB", courier: "Courier Partner", pincode: "Delivery Pincode", payment_type: "Payment Mode", order_value: "Order Amount", order_date: "Order Date", ndr_reason: "Last NDR Reason" });
  });

  it("refuses to validate without required mappings", async () => {
    expect(await code(validateImportJob(jobId, { shipment_id: "AWB" }))).toBe("MISSING_REQUIRED_MAPPING");
  });

  it("validates every row and preserves rejected rows with reasons", async () => {
    const job = await db.select().from(importJobs).where(eq(importJobs.id, jobId));
    const report = await validateImportJob(jobId, job[0].suggestedMapping!);
    expect(report.rowCount).toBe(fx.total);
    expect(report.rejectedCount).toBe(fx.rejected);
    expect(report.acceptedCount).toBe(fx.accepted);
    const codes = report.quality.warnings.map((w) => w.code);
    expect(codes).toEqual(expect.arrayContaining(["DUPLICATE_SHIPMENT_ID", "INVALID_ORDER_DATE", "INVALID_ORDER_VALUE", "MISSING_SHIPMENT_ID", "IMPOSSIBLE_TIMELINE", "MISSING_PINCODE", "UNKNOWN_COURIER", "EXTREME_VALUE"]));
    expect(report.quality.score).toBeLessThan(100);
    const errs = await getImportErrors(jobId, { severity: "ERROR" });
    expect(errs.length).toBe(5);
    expect(errs.find((e) => e.code === "DUPLICATE_SHIPMENT_ID")?.raw).toBeTruthy();
  });

  it("refuses to commit before validation and commits valid rows only, with provenance", async () => {
    const fresh = await mk(fx.csv.replace(/IT/g, "IX"), "unvalidated.csv");
    expect(await code(commitImportJob(fresh.id))).toBe("NOT_VALIDATED");
    await db.delete(importJobs).where(eq(importJobs.id, fresh.id));

    const res = await commitImportJob(jobId);
    datasetId = res.datasetId;
    expect(res.imported).toBe(fx.accepted);
    expect(res.rejected).toBe(fx.rejected);
    const ds = await getDatasetById(datasetId);
    expect(ds?.shipmentCount).toBe(fx.accepted);
    expect(ds?.isDemo).toBe(false);
    asOf = asOfString(ds!);
    const [job] = await db.select().from(importJobs).where(eq(importJobs.id, jobId));
    expect(job.status).toBe("COMMITTED");
    expect(job.rawContent).toBeNull();
    expect(job.fileHash).toHaveLength(64);
    const [s] = await db.select().from(shipments).where(and(eq(shipments.datasetId, datasetId), eq(shipments.shipmentId, "IT00001")));
    expect(s.importJobId).toBe(jobId);
    expect(s.sourceRow).toBe(2);
    expect(s.sourceDataset).toBe("fixture.csv");
    expect(s.finalStatus).toBe("RTO");
    expect(s.ndrCount).toBe(2);
    expect(s.ndrReasonCode).toBe("CUSTOMER_UNAVAILABLE");
    expect(await code(commitImportJob(jobId))).toBe("ALREADY_COMMITTED");
    const audit = await db.select().from(auditLogs).where(and(eq(auditLogs.action, "import.commit"), eq(auditLogs.entityId, jobId)));
    expect(audit.length).toBe(1);
  });
});

describe("analytics on real data", () => {
  it("computes overall, COD and prepaid RTO rates with the documented populations", async () => {
    const t = await aggregateTotal(datasetId);
    expect(t.shipments).toBe(fx.accepted);
    expect(t.rto).toBe(fx.rto);
    expect(t.eligible).toBe(fx.eligible);
    const m = computeMetrics(t, await getCostModel());
    expect(m.rtoRate).toBeCloseTo(fx.rto / fx.eligible, 6);
    expect(m.prepaidRtoRate).toBeCloseTo(5 / 100, 6);
    expect(m.codRtoRate).toBeCloseTo(40 / (t.codEligible), 6);
    expect(m.rtoCost).toBeGreaterThan(fx.rto * 165);
  });

  it("segments by courier, including unknown courier, and sums back to the total", async () => {
    const rows = await aggregateBy(datasetId, ["courier"]);
    const by = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(by.Alpha.rto).toBe(30);
    expect(by.Beta.rto).toBe(15);
    expect(by.Unknown.shipments).toBe(1);
    expect(rows.reduce((s, r) => s + r.shipments, 0)).toBe(fx.accepted);
    const bands = await aggregateBy(datasetId, ["valueBand"]);
    expect(bands.find((b) => b.key === "4,000+")?.shipments).toBe(1);
  });

  it("applies filters safely, including hostile input", async () => {
    const f = await aggregateTotal(datasetId, { payment: ["COD"], pincode: ["560067"] });
    expect(f.eligible).toBe(60);
    expect(f.rto).toBe(30);
    expect((await aggregateTotal(datasetId, { q: "IT00001" })).shipments).toBe(1);
    expect((await aggregateTotal(datasetId, { courier: ["x'; DROP TABLE shipments; --"] })).shipments).toBe(0);
    expect((await aggregateTotal(datasetId, { q: "%" })).shipments).toBe(0); // LIKE wildcards are escaped
    expect((await aggregateTotal(datasetId)).shipments).toBe(fx.accepted); // table still exists
    const week = await weeklyCounts(datasetId, [], asOf, {}, 13);
    expect(week.reduce((s, c) => s + c.n, 0)).toBe(fx.eligible);
  });

  it("returns zeros for an unknown dataset and empty datasets without errors", async () => {
    const z = await aggregateTotal("00000000-0000-4000-8000-000000000000");
    expect(z.shipments).toBe(0);
    const m = computeMetrics(z, await getCostModel());
    expect(m.rtoRate).toBeNull();
    const [d] = await db.insert(datasets).values({ orgId: (await db.select().from(datasets).where(eq(datasets.id, datasetId)))[0].orgId, name: "IT empty" }).returning();
    emptyDatasetId = d.id;
    const info = (await getDatasetById(emptyDatasetId))!;
    const dash = await getDashboard(info, asOfString(info), await getCostModel());
    expect(dash.metrics.shipments).toBe(0);
    expect(dash.candidates).toHaveLength(0);
    const gen = await generateFindings(info, asOfString(info));
    expect(gen.total).toBe(0);
    expect((await buildDatasetReport(emptyDatasetId))?.markdown).toContain("Headline numbers");
  });

  it("surfaces the embedded high-concentration segment with an explanation", async () => {
    const { candidates, baselineRate } = await findCandidates(datasetId, asOf);
    expect(baselineRate).toBeCloseTo(fx.rto / fx.eligible, 6);
    const c = candidates.find((x) => x.dims.join() === "pincode" && x.key === "560067");
    expect(c).toBeTruthy();
    expect(c!.liftRatio).toBeGreaterThan(2.5);
    expect(c!.reasons.some((r) => r.includes("COD"))).toBe(true);
    expect(candidates.find((x) => x.dims.join() === "pincode" && x.key === "110001")).toBeUndefined();
  });
});

describe("shipment explorer and forensics", () => {
  it("paginates server-side and caps page size", async () => {
    const r = await listShipments(datasetId, { status: ["RTO"] }, 1, 10);
    expect(r.total).toBe(fx.rto);
    expect(r.rows).toHaveLength(10);
    expect((await listShipments(datasetId, {}, 1, 10_000)).rows.length).toBeLessThanOrEqual(100);
  });

  it("derives a labelled timeline for shipments with no events", async () => {
    const [s] = await db.select().from(shipments).where(and(eq(shipments.datasetId, datasetId), eq(shipments.shipmentId, "IT00031")));
    const d = await getShipmentDetail(s.id);
    expect(d!.hasEvents).toBe(false);
    expect(d!.timeline.length).toBeGreaterThan(0);
    expect(d!.timeline.every((t) => t.derived)).toBe(true);
    expect(await getShipmentDetail("not-a-uuid")).toBeNull();
  });

  it("imports scan events, rejecting impossible transitions, unknown shipments and bad timestamps", async () => {
    const csv = buildEventsCsv("IT00001", "IT00031");
    const job = await createImportJob({ fileName: "events.csv", content: csv, size: csv.length, kind: "EVENTS", targetDatasetId: datasetId });
    const report = await validateImportJob(job.id, job.suggestedMapping);
    expect(report.rejectedCount).toBe(3);
    const codes = (await getImportErrors(job.id, { severity: "ERROR" })).map((e) => e.code).sort();
    expect(codes).toEqual(["IMPOSSIBLE_TRANSITION", "INVALID_TIMESTAMP", "UNKNOWN_SHIPMENT"]);
    const res = await commitImportJob(job.id);
    expect(res.imported).toBe(9);
    const [s] = await db.select().from(shipments).where(and(eq(shipments.datasetId, datasetId), eq(shipments.shipmentId, "IT00001")));
    const d = (await getShipmentDetail(s.id))!;
    expect(d.hasEvents).toBe(true);
    expect(d.ndrEvents).toHaveLength(2);
    expect(d.timeline[d.timeline.length - 1].type).toBe("RTO_INITIATED");
    expect(d.totalHours).toBeGreaterThan(48);
  });
});

describe("findings, investigations, simulation and reports", () => {
  it("generates deterministic findings idempotently", async () => {
    const ds = (await getDatasetById(datasetId))!;
    const first = await generateFindings(ds, asOf);
    expect(first.total).toBeGreaterThan(0);
    const second = await generateFindings(ds, asOf);
    expect(second.created).toBe(0);
    const list = await listFindings(datasetId);
    const f = list.find((x) => x.type === "CONCENTRATION" && x.title.includes("560"));
    expect(f).toBeTruthy();
    expect(f!.code).toMatch(/^INV-\d{4}$/);
    expect(f!.status).toBeNull();
    findingId = f!.id;
  });

  it("tracks an investigation with status and notes", async () => {
    const inv = await openInvestigation(findingId);
    expect(await openInvestigation(findingId)).toBe(inv);
    await setInvestigationStatus(inv, "INVESTIGATING");
    await addNote(inv, "Asked courier Alpha about 560067 delivery attempts.");
    const f = (await getFinding(findingId))!;
    expect(f.status).toBe("INVESTIGATING");
    expect(f.notes).toHaveLength(1);
  });

  it("simulates 'route high-risk COD through another courier' from observed rates", async () => {
    const cost = await getCostModel();
    const { result, target } = await runSimulation(datasetId, asOf, "CHANGE_COURIER", {}, { filters: { pincode: ["560067"], payment: ["COD"] }, altCourier: "Beta" }, cost);
    expect(result.current.rtoRate).toBeCloseTo(fx.rto / fx.eligible, 6);
    expect(result.diff.rtoAvoided).toBeGreaterThan(23);
    expect(result.diff.rtoAvoided).toBeLessThan(25);
    expect(result.simulated.rtoRate!).toBeLessThan(result.current.rtoRate!);
    expect(result.disclaimer).toContain("NOT A GUARANTEED OUTCOME");
    expect(result.assumptions.length).toBeGreaterThan(0);
    await saveSimulation(datasetId, findingId, "CHANGE_COURIER", {}, target, result);
    const saved = await latestSimulationForFinding(findingId);
    expect(saved?.result.diff.rtoAvoided).toBeCloseTo(result.diff.rtoAvoided, 6);
  });

  it("runs every scenario and auto-selects high-risk pincodes", async () => {
    const cost = await getCostModel();
    for (const s of SCENARIO_TYPES) {
      const { result } = await runSimulation(datasetId, asOf, s, {}, { filters: { payment: ["COD"] }, autoHighRisk: true, altCourier: "Beta" }, cost);
      expect(Number.isFinite(result.simulated.rto)).toBe(true);
      expect(Number.isFinite(result.diff.netBenefit)).toBe(true);
    }
    const { target } = await runSimulation(datasetId, asOf, "COD_REDUCTION", {}, { filters: { payment: ["COD"] }, autoHighRisk: true }, cost);
    expect(target.riskPincodes).toContain("560067");
  });

  it("exports an investigation report with evidence, value, simulation, actions and no causal claims", async () => {
    const r = (await buildInvestigationReport(findingId))!;
    const md = r.markdown;
    for (const part of ["## Evidence", "## Affected shipments and value", "contributing factors", "## Intervention simulation", "SIMULATION — NOT A GUARANTEED OUTCOME", "## Recommended investigation actions", "## Investigation notes", "## Method and caveats"]) expect(md).toContain(part);
    expect(md).not.toMatch(/\bcaused by\b/i);
    expect(r.html).toContain("<table");
    expect(r.html).not.toContain("<script");
    expect(JSON.stringify(r.json)).toContain("simulation");
  });
});
