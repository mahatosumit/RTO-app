import { rtoCostFromAggregate, type CostModel } from "@/lib/domain/cost";
import type { AggRow } from "./types";

/** num/den, or null when the population is empty (never NaN/Infinity). */
export function rate(num: number, den: number): number | null {
  return den > 0 ? num / den : null;
}

/** Wilson score interval (95% by default). Returns null for n = 0. */
export function wilson(k: number, n: number, z = 1.96): { lower: number; upper: number } | null {
  if (n <= 0) return null;
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = p + z2 / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return { lower: Math.max(0, (centre - margin) / denom), upper: Math.min(1, (centre + margin) / denom) };
}

export interface Metrics {
  shipments: number;
  dispatched: number;
  eligible: number;
  delivered: number;
  rto: number;
  lost: number;
  rtoRate: number | null;
  codRtoRate: number | null;
  prepaidRtoRate: number | null;
  ndrRate: number | null;
  ndrRecoveryRate: number | null;
  deliveryRate: number | null;
  avgAttempts: number | null;
  avgTransitHours: number | null;
  totalValue: number;
  rtoValue: number;
  rtoCost: number;
  recoverableValue: number;
  addressRecoveryRate: number | null;
  codShare: number | null;
  lowSample: boolean;
}

export const MIN_SAMPLE = 30;

/** Recovery rate observed on shipments whose NDR reason was operationally addressable, clamped to [0,1]. */
export function addressRecoveryRate(a: Pick<AggRow, "addrDelivered" | "addrResolved">): number | null {
  const r = rate(a.addrDelivered, a.addrResolved);
  return r === null ? null : Math.min(1, Math.max(0, r));
}

/** Estimated recoverable value = RTO value with addressable NDR reasons × observed recovery rate. */
export function recoverableValue(a: Pick<AggRow, "addressableRtoValue" | "addrDelivered" | "addrResolved">): number {
  const r = addressRecoveryRate(a);
  return r === null ? 0 : a.addressableRtoValue * r;
}

export function computeMetrics(a: AggRow, cost: CostModel): Metrics {
  return {
    shipments: a.shipments,
    dispatched: a.dispatched,
    eligible: a.eligible,
    delivered: a.delivered,
    rto: a.rto,
    lost: a.lost,
    rtoRate: rate(a.rto, a.eligible),
    codRtoRate: rate(a.codRto, a.codEligible),
    prepaidRtoRate: rate(a.prepaidRto, a.prepaidEligible),
    ndrRate: rate(a.ndrShipments, a.dispatched),
    ndrRecoveryRate: rate(a.ndrDelivered, a.ndrResolved),
    deliveryRate: rate(a.delivered, a.eligible),
    avgAttempts: a.avgAttempts,
    avgTransitHours: a.avgTransitHours,
    totalValue: a.totalValue,
    rtoValue: a.rtoValue,
    rtoCost: rtoCostFromAggregate(a.rto, a.rtoValue, cost),
    recoverableValue: recoverableValue(a),
    addressRecoveryRate: addressRecoveryRate(a),
    codShare: rate(a.codShipments, a.shipments),
    lowSample: a.eligible < MIN_SAMPLE,
  };
}
