import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { findings, investigationNotes, investigations } from "@/db/schema";
import { audit } from "@/lib/org";
import { pct } from "@/lib/domain/cost";
import { formatINR } from "@/lib/domain/cost";
import { findCandidates, scanAnomalies, segmentProfile, type AnomalyItem } from "@/lib/analytics/insights";
import { selectShortlist, suggestionFor, type Candidate } from "@/lib/analytics/rootcause";
import type { DatasetInfo, Filters } from "@/lib/analytics/types";

export const INVESTIGATION_STATUSES = ["OPEN", "INVESTIGATING", "RESOLVED", "DISMISSED"] as const;
export type InvestigationStatus = (typeof INVESTIGATION_STATUSES)[number];

export function findingCode(seq: number): string {
  return `INV-${String(seq).padStart(4, "0")}`;
}

function shiftDate(day: string, delta: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function compactProfile(p: Awaited<ReturnType<typeof segmentProfile>>) {
  const slim = (rows: typeof p.groups.payment) =>
    rows.slice(0, 5).map((r) => ({ key: r.key, shipments: r.shipments, eligible: r.eligible, rto: r.rto, rtoValue: r.rtoValue }));
  return {
    total: { shipments: p.total.shipments, eligible: p.total.eligible, rto: p.total.rto, rtoValue: p.total.rtoValue, codRto: p.total.codRto, addressableRto: p.total.addressableRto },
    groups: Object.fromEntries(Object.entries(p.groups).map(([k, v]) => [k, slim(v)])),
  };
}

export function summarizeConcentration(c: Candidate): string {
  return `${c.label} is an investigation candidate: it accounts for ${pct(c.volumeShare)} of all RTOs (${c.rto.toLocaleString("en-IN")} shipments) with an RTO rate of ${pct(c.rate)} versus a dataset baseline of ${pct(c.baselineRate)} (${c.liftRatio.toFixed(1)}×)${c.codShare !== null ? `; ${Math.round(c.codShare * 100)}% of these RTOs were COD` : ""}. This is an association observed in historical data, not proof of cause.`;
}

export function summarizeAnomaly(a: AnomalyItem): string {
  const r = a.result;
  const range = r.baseline.minWeekRate !== null && r.baseline.maxWeekRate !== null ? ` (weekly range ${pct(r.baseline.minWeekRate)}–${pct(r.baseline.maxWeekRate)})` : "";
  return `${a.label}: RTO rate in the last 7 days was ${pct(r.current.rate)} (n=${r.current.n}) versus a baseline of ${pct(r.baseline.rate)}${range} — ${r.ratio?.toFixed(1)}× baseline (z = ${r.z?.toFixed(1)}). The increase is statistically unusual; the cause still needs investigation.`;
}

export async function generateFindings(dataset: DatasetInfo, asOf: string): Promise<{ created: number; updated: number; total: number }> {
  const [{ candidates }, anomalies] = await Promise.all([findCandidates(dataset.id, asOf), scanAnomalies(dataset.id, asOf)]);
  const shortlist = selectShortlist(candidates, 8);
  // The overall-shipments anomaly always comes first (it backs the dashboard headline), then segments by ratio.
  const flagged = anomalies
    .filter((a) => a.result.flagged)
    .sort((a, b) => Number(b.dims.length === 0) - Number(a.dims.length === 0) || (b.result.ratio ?? 0) - (a.result.ratio ?? 0))
    .slice(0, 6);
  const rows: Array<typeof findings.$inferInsert> = [];

  for (const c of shortlist) {
    const profile = compactProfile(await segmentProfile(dataset.id, c.filters));
    rows.push({
      datasetId: dataset.id,
      type: "CONCENTRATION",
      dedupeKey: `C:${c.dims.join("+")}:${c.key}`,
      title: `High RTO concentration: ${c.label}`,
      severity: c.severity,
      score: c.score,
      affectedValue: c.affectedValue,
      affectedShipments: c.eligible,
      evidence: { kind: "CONCENTRATION", candidate: c, profile, summary: summarizeConcentration(c) },
      filters: c.filters,
      suggestion: suggestionFor(c.dims),
    });
  }
  for (const a of flagged) {
    const filters: Filters = { ...a.filters, from: shiftDate(asOf, -6), to: asOf };
    const profile = compactProfile(await segmentProfile(dataset.id, { ...filters }));
    rows.push({
      datasetId: dataset.id,
      type: "ANOMALY",
      dedupeKey: `A:${a.key}`,
      title: `Unusual RTO increase in last 7 days: ${a.label}`,
      severity: a.result.severity === "CRITICAL" ? "HIGH" : "MEDIUM",
      score: Math.round(((a.result.ratio ?? 0) * 10 + (a.result.z ?? 0)) * 10) / 10,
      affectedValue: profile.total.rtoValue,
      affectedShipments: a.result.current.n,
      evidence: { kind: "ANOMALY", anomaly: a.result, label: a.label, profile, summary: summarizeAnomaly(a) },
      filters,
      suggestion: "Compare shipment timelines and NDR reasons in the affected window against the prior weeks; check for courier operational issues, a campaign, or a change in COD mix.",
    });
  }

  let created = 0;
  let updated = 0;
  for (const row of rows) {
    const existing = await db.select({ id: findings.id }).from(findings).where(sql`${findings.datasetId} = ${row.datasetId} AND ${findings.dedupeKey} = ${row.dedupeKey}`).limit(1);
    if (existing[0]) {
      await db.update(findings).set({ title: row.title, severity: row.severity, score: row.score, affectedValue: row.affectedValue, affectedShipments: row.affectedShipments, evidence: row.evidence, filters: row.filters, suggestion: row.suggestion }).where(eq(findings.id, existing[0].id));
      updated++;
    } else {
      await db.insert(findings).values(row);
      created++;
    }
  }
  await audit("findings.generate", "dataset", dataset.id, { created, updated });
  return { created, updated, total: rows.length };
}

export interface FindingRow {
  id: string;
  dedupeKey: string;
  code: string;
  type: string;
  title: string;
  severity: string;
  score: number;
  affectedValue: number;
  affectedShipments: number;
  evidence: Record<string, unknown>;
  filters: Filters;
  suggestion: string | null;
  investigationId: string | null;
  status: string | null;
  createdAt: Date;
}

export async function listFindings(datasetId: string): Promise<FindingRow[]> {
  const rows = await db
    .select({ f: findings, inv: investigations })
    .from(findings)
    .leftJoin(investigations, eq(investigations.findingId, findings.id))
    .where(eq(findings.datasetId, datasetId))
    .orderBy(desc(findings.score));
  return rows.map(({ f, inv }) => ({
    id: f.id,
    dedupeKey: f.dedupeKey,
    code: findingCode(f.seq),
    type: f.type,
    title: f.title,
    severity: f.severity,
    score: f.score,
    affectedValue: f.affectedValue,
    affectedShipments: f.affectedShipments,
    evidence: f.evidence as Record<string, unknown>,
    filters: f.filters as Filters,
    suggestion: f.suggestion,
    investigationId: inv?.id ?? null,
    status: inv?.status ?? null,
    createdAt: f.createdAt,
  }));
}

export async function getFinding(id: string): Promise<(FindingRow & { datasetId: string; notes: Array<{ id: number; body: string; author: string | null; createdAt: Date }> }) | null> {
  const rows = await db
    .select({ f: findings, inv: investigations })
    .from(findings)
    .leftJoin(investigations, eq(investigations.findingId, findings.id))
    .where(eq(findings.id, id))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  const notes = r.inv ? await db.select().from(investigationNotes).where(eq(investigationNotes.investigationId, r.inv.id)).orderBy(desc(investigationNotes.createdAt)) : [];
  return {
    id: r.f.id,
    dedupeKey: r.f.dedupeKey,
    datasetId: r.f.datasetId,
    code: findingCode(r.f.seq),
    type: r.f.type,
    title: r.f.title,
    severity: r.f.severity,
    score: r.f.score,
    affectedValue: r.f.affectedValue,
    affectedShipments: r.f.affectedShipments,
    evidence: r.f.evidence as Record<string, unknown>,
    filters: r.f.filters as Filters,
    suggestion: r.f.suggestion,
    investigationId: r.inv?.id ?? null,
    status: r.inv?.status ?? null,
    createdAt: r.f.createdAt,
    notes: notes.map((n) => ({ id: n.id, body: n.body, author: n.author, createdAt: n.createdAt })),
  };
}

export async function openInvestigation(findingId: string): Promise<string> {
  const f = await db.select().from(findings).where(eq(findings.id, findingId)).limit(1);
  if (!f[0]) throw new Error("Finding not found");
  const existing = await db.select().from(investigations).where(eq(investigations.findingId, findingId)).limit(1);
  if (existing[0]) return existing[0].id;
  const [inv] = await db.insert(investigations).values({ datasetId: f[0].datasetId, findingId, status: "OPEN" }).returning();
  await audit("investigation.create", "investigation", inv.id, { findingId });
  return inv.id;
}

export async function setInvestigationStatus(investigationId: string, status: InvestigationStatus): Promise<void> {
  await db.update(investigations).set({ status, updatedAt: new Date() }).where(eq(investigations.id, investigationId));
  await audit("investigation.status", "investigation", investigationId, { status });
}

export async function addNote(investigationId: string, body: string, author = "operator"): Promise<void> {
  await db.insert(investigationNotes).values({ investigationId, body: body.slice(0, 4000), author });
  await audit("investigation.note", "investigation", investigationId, { length: body.length });
}

export { formatINR };
