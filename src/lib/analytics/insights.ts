import { aggregateBy, aggregateTotal, weeklyCounts } from "./aggregate";
import { detectRateAnomaly, type AnomalyResult, type WeekCount } from "./anomaly";
import { computeMetrics, type Metrics } from "./metrics";
import {
  filtersFromParts,
  labelFor,
  parseKey,
  recurrenceFromWeeks,
  scoreCandidate,
  selectShortlist,
  type Candidate,
} from "./rootcause";
import { simulate, type ScenarioType, type SimInputs, type SimParams, type SimResult } from "./simulate";
import type { CostModel } from "@/lib/domain/cost";
import type { AggRow, DatasetInfo, DimKey, Filters } from "./types";

export const SCANS: DimKey[][] = [
  ["pincode"],
  ["pin3"],
  ["state"],
  ["courier"],
  ["product"],
  ["category"],
  ["valueBand"],
  ["courier", "region"],
  ["courier", "state"],
  ["courier", "payment"],
  ["payment", "pin3"],
  ["payment", "category"],
];

function groupWeeks(cells: Array<{ key: string; w: number; n: number; rto: number }>): Map<string, WeekCount[]> {
  const m = new Map<string, WeekCount[]>();
  for (const c of cells) {
    const arr = m.get(c.key) ?? [];
    arr.push({ w: c.w, n: c.n, rto: c.rto });
    m.set(c.key, arr);
  }
  return m;
}

export async function findCandidates(
  datasetId: string,
  asOf: string,
  filters: Filters = {},
): Promise<{ candidates: Candidate[]; baselineRate: number | null; totals: AggRow }> {
  const totals = await aggregateTotal(datasetId, filters);
  if (totals.eligible === 0 || totals.rto === 0) return { candidates: [], baselineRate: null, totals };
  const t = { eligible: totals.eligible, rto: totals.rto, rtoValue: totals.rtoValue };
  const baseline = t.rto / t.eligible;
  const perScan = await Promise.all(
    SCANS.map(async (dims) => {
      const rows = await aggregateBy(datasetId, dims, filters, { minEligible: 30, minRto: 5, limit: 3000, orderBy: "rto" });
      const first = rows
        .map((r) => ({ r, c: scoreCandidate({ key: r.key, dims, eligible: r.eligible, rto: r.rto, rtoValue: r.rtoValue, codRto: r.codRto }, t, null) }))
        .filter((x) => x.c !== null);
      if (first.length === 0) return [] as Candidate[];
      const weeks = groupWeeks(await weeklyCounts(datasetId, dims, asOf, filters, 12));
      const out: Candidate[] = [];
      for (const { r } of first) {
        const rec = recurrenceFromWeeks(weeks.get(r.key) ?? [], baseline);
        const c = scoreCandidate({ key: r.key, dims, eligible: r.eligible, rto: r.rto, rtoValue: r.rtoValue, codRto: r.codRto }, t, rec);
        if (c) out.push(c);
      }
      return out;
    }),
  );
  const candidates = perScan.flat().sort((a, b) => b.score - a.score);
  return { candidates, baselineRate: baseline, totals };
}

export interface AnomalyItem {
  key: string;
  dims: DimKey[];
  label: string;
  filters: Filters;
  result: AnomalyResult;
}

const ANOMALY_SCANS: DimKey[][] = [[], ["courier"], ["payment"], ["state"], ["category"]];

export async function scanAnomalies(datasetId: string, asOf: string, filters: Filters = {}): Promise<AnomalyItem[]> {
  const out: AnomalyItem[] = [];
  const all = await Promise.all(ANOMALY_SCANS.map((dims) => weeklyCounts(datasetId, dims, asOf, filters, 9).then((c) => ({ dims, c }))));
  for (const { dims, c } of all) {
    const groups = groupWeeks(c);
    for (const [key, weeks] of groups) {
      const result = detectRateAnomaly(weeks);
      const parts = dims.length ? parseKey(dims, key) : {};
      out.push({
        key: `${dims.join("+") || "all"}:${key}`,
        dims,
        label: dims.length ? labelFor(dims, parts) : "All shipments",
        filters: { ...filters, ...filtersFromParts(parts) },
        result,
      });
    }
  }
  return out.sort((a, b) => (b.result.ratio ?? 0) - (a.result.ratio ?? 0));
}

export interface SegmentProfile {
  total: AggRow;
  groups: Record<string, AggRow[]>;
}

export async function segmentProfile(datasetId: string, filters: Filters): Promise<SegmentProfile> {
  const dims: DimKey[] = ["payment", "courier", "category", "ndrReason", "valueBand", "state"];
  const [total, ...rest] = await Promise.all([
    aggregateTotal(datasetId, filters),
    ...dims.map((d) => aggregateBy(datasetId, [d], filters, { limit: 8, orderBy: "rto" })),
  ]);
  return { total, groups: Object.fromEntries(dims.map((d, i) => [d, rest[i]])) };
}

export interface DashboardData {
  dataset: DatasetInfo;
  total: AggRow;
  metrics: Metrics;
  weekly: AggRow[];
  anomalies: AnomalyItem[];
  overall: AnomalyItem | null;
  candidates: Candidate[];
  baselineRate: number | null;
}

export async function getDashboard(dataset: DatasetInfo, asOf: string, cost: CostModel): Promise<DashboardData> {
  const [total, weekly, anomalies, cands] = await Promise.all([
    aggregateTotal(dataset.id),
    aggregateBy(dataset.id, ["week"], {}, { orderBy: "keyDesc", limit: 16 }),
    scanAnomalies(dataset.id, asOf),
    findCandidates(dataset.id, asOf),
  ]);
  return {
    dataset,
    total,
    metrics: computeMetrics(total, cost),
    weekly: weekly.reverse(),
    anomalies: anomalies.filter((a) => a.result.flagged),
    overall: anomalies.find((a) => a.dims.length === 0) ?? null,
    candidates: selectShortlist(cands.candidates, 5),
    baselineRate: cands.baselineRate,
  };
}

// ------------------------------------------------------------------ simulation

export interface TargetSpec {
  filters: Filters;
  autoHighRisk?: boolean;
  autoMax?: number;
  altCourier?: string;
}

export interface ResolvedTarget {
  filters: Filters;
  riskPincodes: string[];
  riskClusters: string[];
  description: string;
}

function describeFilters(f: Filters, risk: string[], clusters: string[]): string {
  const bits: string[] = [];
  for (const [k, v] of Object.entries(f)) {
    if (Array.isArray(v) && v.length && k !== "pincode" && k !== "pin3") bits.push(`${k}: ${v.join(", ")}`);
  }
  if (f.minValue) bits.push(`value ≥ ₹${f.minValue}`);
  if (risk.length) bits.push(`${risk.length} high-risk pincodes`);
  else if (clusters.length) bits.push(`${clusters.length} high-risk pincode clusters`);
  else if (f.pincode?.length) bits.push(`pincodes: ${f.pincode.slice(0, 5).join(", ")}${f.pincode.length > 5 ? "…" : ""}`);
  return bits.length ? bits.join(" · ") : "all shipments";
}

export async function resolveTarget(datasetId: string, asOf: string, spec: TargetSpec): Promise<ResolvedTarget> {
  let filters: Filters = { ...spec.filters };
  let riskPincodes: string[] = [];
  let riskClusters: string[] = [];
  if (spec.autoHighRisk) {
    const { candidates } = await findCandidates(datasetId, asOf, {});
    const max = spec.autoMax ?? 25;
    riskPincodes = candidates.filter((c) => c.dims.length === 1 && c.dims[0] === "pincode").slice(0, max).map((c) => c.parts.pincode);
    if (riskPincodes.length === 0) riskClusters = candidates.filter((c) => c.dims.length === 1 && c.dims[0] === "pin3").slice(0, max).map((c) => c.parts.pin3);
    if (riskPincodes.length) filters = { ...filters, pincode: riskPincodes };
    else if (riskClusters.length) filters = { ...filters, pin3: riskClusters };
  }
  return { filters, riskPincodes, riskClusters, description: describeFilters(filters, riskPincodes, riskClusters) };
}

export async function gatherSimulationInputs(
  datasetId: string,
  scenario: ScenarioType,
  target: ResolvedTarget,
  params: SimParams,
  altCourier: string | undefined,
  cost: CostModel,
): Promise<SimInputs> {
  let tf: Filters = { ...target.filters };
  if (scenario === "CHANGE_COURIER" && altCourier) {
    const couriers = (await aggregateBy(datasetId, ["courier"], {}, { limit: 200 })).map((r) => r.key);
    const allowed = tf.courier?.length ? tf.courier : couriers;
    tf = { ...tf, courier: allowed.filter((c) => c !== altCourier) };
    if (tf.courier!.length === 0) tf = { ...tf, courier: ["__none__"] };
  }
  const minValue = Number.isFinite(params.minValue) ? params.minValue : 1500;
  const [baseline, t, targetCod, targetCodHigh, prepaidT, prepaidAll, attempts] = await Promise.all([
    aggregateTotal(datasetId),
    aggregateTotal(datasetId, tf),
    aggregateTotal(datasetId, { ...tf, payment: ["COD"] }),
    aggregateTotal(datasetId, { ...tf, payment: ["COD"], minValue }),
    aggregateTotal(datasetId, { ...tf, payment: ["PREPAID"] }),
    aggregateTotal(datasetId, { payment: ["PREPAID"] }),
    aggregateBy(datasetId, ["attempts"], tf, { limit: 50 }),
  ]);
  const prepaidRef =
    prepaidT.eligible >= 30
      ? { eligible: prepaidT.eligible, rto: prepaidT.rto, source: "target" as const }
      : { eligible: prepaidAll.eligible, rto: prepaidAll.rto, source: "dataset" as const };

  let alt: SimInputs["alt"] = null;
  if (scenario === "CHANGE_COURIER" && altCourier) {
    const regions = (await aggregateBy(datasetId, ["region"], tf, { limit: 20 })).map((r) => r.key).filter((k) => k !== "(unknown)");
    const pay = tf.payment?.length ? tf.payment : undefined;
    const ctx: Filters = { courier: [altCourier], ...(pay ? { payment: pay } : {}), ...(regions.length ? { region: regions } : {}) };
    let ref = await aggregateTotal(datasetId, ctx);
    let source = `${altCourier}, ${pay ? pay.join("/") + ", " : ""}${regions.length ? "regions " + regions.join("/") : "all regions"}`;
    if (ref.eligible < 30) {
      const fallback = await aggregateTotal(datasetId, { courier: [altCourier], ...(pay ? { payment: pay } : {}) });
      if (fallback.eligible > ref.eligible) {
        ref = fallback;
        source = `${altCourier}, ${pay ? pay.join("/") + ", " : ""}all regions (fallback: too few comparable shipments)`;
      }
    }
    alt = { eligible: ref.eligible, rto: ref.rto, source, name: altCourier };
  }
  return {
    baseline,
    target: t,
    targetCod,
    targetCodHigh,
    prepaidRef,
    alt,
    attempts: attempts.filter((a) => /^\d+$/.test(a.key)).map((a) => ({ attempts: Number(a.key), delivered: a.delivered, rto: a.rto })),
    cost,
  };
}

export async function runSimulation(
  datasetId: string,
  asOf: string,
  scenario: ScenarioType,
  params: SimParams,
  spec: TargetSpec,
  cost: CostModel,
): Promise<{ result: SimResult; target: ResolvedTarget }> {
  const target = await resolveTarget(datasetId, asOf, spec);
  const inputs = await gatherSimulationInputs(datasetId, scenario, target, params, spec.altCourier, cost);
  const result = simulate(scenario, params, inputs);
  if (spec.autoHighRisk && target.riskPincodes.length === 0 && target.riskClusters.length === 0) {
    result.warnings.push("Auto high-risk selection found no statistically distinguishable pincodes; the target covers all shipments matching the other filters.");
  }
  return { result, target };
}
