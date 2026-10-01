export interface CostModel {
  forwardCost: number;
  reverseCost: number;
  handlingCost: number;
  cogsRatio: number;
  writeoffRate: number;
  marginRate: number;
}

export const DEFAULT_COST_MODEL: CostModel = {
  forwardCost: 70,
  reverseCost: 70,
  handlingCost: 25,
  cogsRatio: 0.4,
  writeoffRate: 0.05,
  marginRate: 0.3,
};

/** Cost of one RTO: wasted forward + reverse freight + handling + expected write-off of goods. */
export function rtoCostForShipment(orderValue: number, m: CostModel): number {
  return m.forwardCost + m.reverseCost + m.handlingCost + Math.max(0, orderValue) * m.cogsRatio * m.writeoffRate;
}

export function rtoCostFromAggregate(rtoCount: number, rtoValue: number, m: CostModel): number {
  return rtoCount * (m.forwardCost + m.reverseCost + m.handlingCost) + Math.max(0, rtoValue) * m.cogsRatio * m.writeoffRate;
}

export const VALUE_BANDS = ["<500", "500–999", "1,000–1,999", "2,000–3,999", "4,000+"] as const;
export type ValueBand = (typeof VALUE_BANDS)[number];

export function valueBand(v: number): ValueBand {
  if (v < 500) return "<500";
  if (v < 1000) return "500–999";
  if (v < 2000) return "1,000–1,999";
  if (v < 4000) return "2,000–3,999";
  return "4,000+";
}

export function formatINR(v: number | null | undefined, compact = true): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (compact) {
    if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2)}Cr`;
    if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(2)}L`;
    if (abs >= 1e3) return `${sign}₹${(abs / 1e3).toFixed(1)}K`;
  }
  return `${sign}₹${Math.round(abs).toLocaleString("en-IN")}`;
}

export function pct(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${(v * 100).toFixed(digits)}%`;
}
