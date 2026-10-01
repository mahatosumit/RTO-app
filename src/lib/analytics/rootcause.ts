import { pct } from "@/lib/domain/cost";
import { NDR_LABELS, type NdrReason } from "@/lib/domain/ndr";
import { wilson } from "./metrics";
import type { WeekCount } from "./anomaly";
import { DIM_LABELS, type DimKey, type Filters } from "./types";

export const GATES = { minEligible: 30, minRto: 5, minLift: 1.25 } as const;
export const WEIGHTS = { excess: 0.35, lift: 0.25, value: 0.2, sample: 0.1, recurrence: 0.1 } as const;

export interface SegmentInput {
  key: string;
  dims: DimKey[];
  eligible: number;
  rto: number;
  rtoValue: number;
  codRto: number;
}

export interface Totals {
  eligible: number;
  rto: number;
  rtoValue: number;
}

export interface Recurrence {
  above: number;
  weeks: number;
  share: number;
}

export interface Candidate {
  key: string;
  dims: DimKey[];
  parts: Record<string, string>;
  label: string;
  score: number;
  components: { excess: number; lift: number; value: number; sample: number; recurrence: number };
  eligible: number;
  rto: number;
  rate: number;
  baselineRate: number;
  liftRatio: number;
  volumeShare: number;
  excessRtos: number;
  affectedValue: number;
  codShare: number | null;
  wilsonLower: number;
  recurrence: Recurrence | null;
  reasons: string[];
  severity: "HIGH" | "MEDIUM" | "LOW";
  filters: Filters;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export function parseKey(dims: DimKey[], key: string): Record<string, string> {
  const vals = dims.length === 1 ? [key] : key.split(" | ");
  return Object.fromEntries(dims.map((d, i) => [d, vals[i] ?? ""]));
}

export function filtersFromParts(parts: Record<string, string>): Filters {
  const f: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(parts)) f[k] = [v];
  return f as Filters;
}

export function partLabel(dim: DimKey, value: string): string {
  switch (dim) {
    case "pin3": return `Pincode cluster ${value}xxx`;
    case "payment": return value;
    case "ndrReason": return NDR_LABELS[value as NdrReason] ?? value;
    default: return `${DIM_LABELS[dim]} ${value}`;
  }
}

export function labelFor(dims: DimKey[], parts: Record<string, string>): string {
  return dims.map((d) => partLabel(d, parts[d])).join(" · ");
}

export function recurrenceFromWeeks(weeks: WeekCount[], baselineRate: number, minN = 5): Recurrence | null {
  const valid = weeks.filter((w) => w.n >= minN);
  if (valid.length === 0) return null;
  const above = valid.filter((w) => w.rto / w.n > baselineRate).length;
  return { above, weeks: valid.length, share: above / valid.length };
}

export function suggestionFor(dims: DimKey[]): string {
  const d = dims.join("+");
  if (dims.includes("courier") && dims.length > 1) return "Review this courier's delivery performance in the affected area with its account manager, using the NDR reasons and shipment timelines as evidence.";
  if (dims.includes("pincode") || dims.includes("pin3") || dims.includes("state")) return "Review courier mix, NDR reasons and address quality for this area; consider testing address verification or a COD policy change on a small cohort.";
  if (d === "courier") return "Compare this courier's results by region and payment type, then raise the pattern with the courier's account manager.";
  if (dims.includes("product") || dims.includes("category")) return "Review listing expectations (size, description, price) and the COD share for this product group; check customer-initiated refusals.";
  if (d === "payment") return "Review COD qualification rules and consider prepaid incentives for high-risk segments.";
  if (d === "valueBand") return "Review COD exposure for this order-value band; high-value failures carry the largest reverse-logistics and write-off cost.";
  return "Inspect the underlying shipments and NDR reasons for this segment to identify the operational pattern.";
}

/**
 * Transparent candidate score (see ANALYTICS_SPEC). Returns null when the segment fails the gates
 * (sample size, RTO count, lift, statistical distinguishability).
 */
export function scoreCandidate(seg: SegmentInput, totals: Totals, recurrence: Recurrence | null): Candidate | null {
  if (totals.eligible <= 0 || totals.rto <= 0) return null;
  const baseline = totals.rto / totals.eligible;
  if (baseline <= 0 || seg.eligible < GATES.minEligible || seg.rto < GATES.minRto) return null;
  const rate = seg.rto / seg.eligible;
  const liftRatio = rate / baseline;
  if (liftRatio < GATES.minLift) return null;
  const w = wilson(seg.rto, seg.eligible)!;
  if (w.lower <= baseline) return null;

  const excessRtos = Math.max(0, seg.rto - seg.eligible * baseline);
  const volumeShare = seg.rto / totals.rto;
  const rtoValueShare = totals.rtoValue > 0 ? seg.rtoValue / totals.rtoValue : 0;
  const components = {
    excess: clamp01(excessRtos / totals.rto / 0.15),
    lift: clamp01((liftRatio - 1) / 2),
    value: clamp01(rtoValueShare / 0.2),
    sample: clamp01(seg.eligible / 200),
    recurrence: recurrence ? recurrence.share : 0,
  };
  const score =
    100 *
    (WEIGHTS.excess * components.excess +
      WEIGHTS.lift * components.lift +
      WEIGHTS.value * components.value +
      WEIGHTS.sample * components.sample +
      WEIGHTS.recurrence * components.recurrence);

  const parts = parseKey(seg.dims, seg.key);
  const codShare = seg.rto > 0 ? seg.codRto / seg.rto : null;
  const reasons = [
    `${pct(volumeShare)} of all RTOs originate here (${seg.rto.toLocaleString("en-IN")} of ${totals.rto.toLocaleString("en-IN")})`,
    `RTO rate is ${liftRatio.toFixed(1)}× dataset baseline (${pct(rate)} vs ${pct(baseline)})`,
  ];
  if (!seg.dims.includes("payment") && codShare !== null) reasons.push(`${Math.round(codShare * 100)}% of failures are COD`);
  reasons.push(`sample size = ${seg.eligible.toLocaleString("en-IN")} resolved shipments`);
  reasons.push(`95% interval lower bound (${pct(w.lower)}) is above baseline — unlikely to be noise alone`);
  if (recurrence) reasons.push(`rate above baseline in ${recurrence.above} of the last ${recurrence.weeks} weeks`);

  return {
    key: seg.key,
    dims: seg.dims,
    parts,
    label: labelFor(seg.dims, parts),
    score: Math.round(score * 10) / 10,
    components,
    eligible: seg.eligible,
    rto: seg.rto,
    rate,
    baselineRate: baseline,
    liftRatio,
    volumeShare,
    excessRtos,
    affectedValue: seg.rtoValue,
    codShare,
    wilsonLower: w.lower,
    recurrence,
    reasons,
    severity: score >= 60 ? "HIGH" : score >= 40 ? "MEDIUM" : "LOW",
    filters: filtersFromParts(parts),
  };
}

function partsSubset(a: Record<string, string>, b: Record<string, string>): boolean {
  return Object.entries(a).every(([k, v]) => b[k] === v);
}

/** Two candidates overlap when one is a refinement of the other and they hold nearly the same RTOs. */
export function overlaps(a: Candidate, b: Candidate): boolean {
  if (!(partsSubset(a.parts, b.parts) || partsSubset(b.parts, a.parts))) return false;
  return Math.min(a.rto, b.rto) / Math.max(a.rto, b.rto) >= 0.6;
}

/** Pick a de-duplicated shortlist: max 2 per dimension family, skip pincodes covered by a selected cluster. */
export function selectShortlist(cands: Candidate[], max = 8): Candidate[] {
  const sorted = [...cands].sort((a, b) => b.score - a.score);
  const out: Candidate[] = [];
  const perFamily = new Map<string, number>();
  for (const c of sorted) {
    if (out.length >= max) break;
    const fam = c.dims.join("+");
    if ((perFamily.get(fam) ?? 0) >= 2) continue;
    if (out.some((o) => overlaps(o, c))) continue;
    if (c.dims.length === 1 && c.dims[0] === "pincode") {
      const pin = c.parts.pincode;
      const covered = out.some((o) => o.parts.pin3 && pin.startsWith(o.parts.pin3));
      if (covered) continue;
    }
    out.push(c);
    perFamily.set(fam, (perFamily.get(fam) ?? 0) + 1);
  }
  return out;
}
