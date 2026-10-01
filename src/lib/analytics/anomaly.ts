export interface WeekCount {
  w: number; // 0 = current week, 1.. = previous weeks
  n: number; // eligible shipments
  rto: number;
}

export interface AnomalyOptions {
  baselineWeeks?: number;
  minCurrent?: number;
  minBaseline?: number;
  minRatio?: number;
  minZ?: number;
}

export interface AnomalyResult {
  flagged: boolean;
  severity: "NONE" | "WARNING" | "CRITICAL";
  reason: "ok" | "insufficient_current_sample" | "insufficient_baseline_sample" | "within_baseline" | "no_baseline_rate";
  current: { n: number; rto: number; rate: number | null };
  baseline: { n: number; rto: number; rate: number | null; minWeekRate: number | null; maxWeekRate: number | null; weeks: number };
  ratio: number | null;
  z: number | null;
}

/**
 * Rolling-baseline anomaly test. Current window (w=0) versus pooled baseline of windows 1..baselineWeeks.
 * z = (p_cur − p0) / sqrt(p0 (1 − p0) / n_cur); flag when sample thresholds are met, ratio ≥ minRatio and z ≥ minZ.
 */
export function detectRateAnomaly(weeks: WeekCount[], opts: AnomalyOptions = {}): AnomalyResult {
  const { baselineWeeks = 8, minCurrent = 30, minBaseline = 100, minRatio = 1.5, minZ = 2.5 } = opts;
  const cur = weeks.find((x) => x.w === 0) ?? { w: 0, n: 0, rto: 0 };
  const base = weeks.filter((x) => x.w >= 1 && x.w <= baselineWeeks);
  const bn = base.reduce((s, x) => s + x.n, 0);
  const br = base.reduce((s, x) => s + x.rto, 0);
  const p0 = bn > 0 ? br / bn : null;
  const weekRates = base.filter((x) => x.n >= 10).map((x) => x.rto / x.n);
  const pc = cur.n > 0 ? cur.rto / cur.n : null;
  const result: AnomalyResult = {
    flagged: false,
    severity: "NONE",
    reason: "ok",
    current: { n: cur.n, rto: cur.rto, rate: pc },
    baseline: {
      n: bn,
      rto: br,
      rate: p0,
      minWeekRate: weekRates.length ? Math.min(...weekRates) : null,
      maxWeekRate: weekRates.length ? Math.max(...weekRates) : null,
      weeks: base.length,
    },
    ratio: null,
    z: null,
  };
  if (cur.n < minCurrent) return { ...result, reason: "insufficient_current_sample" };
  if (bn < minBaseline) return { ...result, reason: "insufficient_baseline_sample" };
  if (p0 === null || p0 <= 0 || p0 >= 1 || pc === null) return { ...result, reason: "no_baseline_rate" };
  const ratio = pc / p0;
  const z = (pc - p0) / Math.sqrt((p0 * (1 - p0)) / cur.n);
  result.ratio = ratio;
  result.z = z;
  if (ratio >= minRatio && z >= minZ) {
    result.flagged = true;
    result.severity = ratio >= 2 && z >= 3.5 ? "CRITICAL" : "WARNING";
    return result;
  }
  return { ...result, reason: "within_baseline" };
}

/** Simple z-score of a value against a sample of values (used for diagnostics/tests). */
export function zScore(value: number, sample: number[]): number | null {
  if (sample.length < 2) return null;
  const mean = sample.reduce((a, b) => a + b, 0) / sample.length;
  const variance = sample.reduce((a, b) => a + (b - mean) ** 2, 0) / (sample.length - 1);
  const sd = Math.sqrt(variance);
  return sd === 0 ? null : (value - mean) / sd;
}
