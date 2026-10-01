export interface QualityInput {
  total: number;
  rejected: number;
  /** count of rows (not issues) affected per issue code, both errors and warnings */
  codeCounts: Record<string, number>;
}

export interface QualityWarning {
  code: string;
  label: string;
  count: number;
  pct: number; // 0..100 of total rows
  severity: "ERROR" | "WARNING";
}

export interface QualityReport {
  score: number;
  total: number;
  accepted: number;
  rejected: number;
  warnings: QualityWarning[];
}

export const ISSUE_LABELS: Record<string, { label: string; severity: "ERROR" | "WARNING" }> = {
  MISSING_SHIPMENT_ID: { label: "missing shipment ID (rejected)", severity: "ERROR" },
  DUPLICATE_SHIPMENT_ID: { label: "duplicate shipment IDs (rejected)", severity: "ERROR" },
  INVALID_ORDER_VALUE: { label: "invalid or negative order value (rejected)", severity: "ERROR" },
  INVALID_ORDER_DATE: { label: "invalid or missing order date (rejected)", severity: "ERROR" },
  IMPOSSIBLE_TIMELINE: { label: "delivery before dispatch (rejected)", severity: "ERROR" },
  IMPOSSIBLE_STATUS: { label: "delivered and RTO at once (rejected)", severity: "ERROR" },
  IMPOSSIBLE_TRANSITION: { label: "impossible event transitions (rejected)", severity: "ERROR" },
  INVALID_TIMESTAMP: { label: "invalid timestamps", severity: "WARNING" },
  MISSING_EVENT_TYPE: { label: "missing event type (rejected)", severity: "ERROR" },
  UNKNOWN_SHIPMENT: { label: "events for unknown shipments (rejected)", severity: "ERROR" },
  MISSING_PINCODE: { label: "missing pincode", severity: "WARNING" },
  INVALID_PINCODE: { label: "invalid pincode", severity: "WARNING" },
  UNKNOWN_COURIER: { label: "unknown courier names", severity: "WARNING" },
  UNKNOWN_PAYMENT: { label: "unknown payment type", severity: "WARNING" },
  MISSING_STATUS: { label: "missing status information", severity: "WARNING" },
  UNRECOGNISED_STATUS: { label: "unrecognised status text", severity: "WARNING" },
  EXTREME_VALUE: { label: "extremely high order values", severity: "WARNING" },
  INVALID_COUNT: { label: "invalid attempt/NDR counts", severity: "WARNING" },
  DISPATCH_BEFORE_ORDER: { label: "dispatch earlier than order date", severity: "WARNING" },
  STATUS_DATE_CONFLICT: { label: "status/date conflicts", severity: "WARNING" },
};

/**
 * Quality score (0–100), documented in ANALYTICS_SPEC/BACKEND docs:
 *  100 − min(60, 1.2·rejected%) − min(10, 0.5·missingPincode%) − min(10, 1.0·invalidTimestamp%)
 *      − min(10, 0.5·unknownCourier%) − min(5, 0.5·unknownPayment%) − min(5, 0.25·otherWarning%)
 */
export function computeQuality(input: QualityInput): QualityReport {
  const { total, rejected, codeCounts } = input;
  const accepted = total - rejected;
  const warnings: QualityWarning[] = Object.entries(codeCounts)
    .filter(([, n]) => n > 0)
    .map(([code, count]) => ({
      code,
      label: ISSUE_LABELS[code]?.label ?? code.toLowerCase().replace(/_/g, " "),
      count,
      pct: total > 0 ? (count / total) * 100 : 0,
      severity: ISSUE_LABELS[code]?.severity ?? "WARNING",
    }))
    .sort((a, b) => b.count - a.count);
  if (total <= 0) return { score: 0, total: 0, accepted: 0, rejected: 0, warnings: [] };
  const p = (code: string) => ((codeCounts[code] ?? 0) / total) * 100;
  const known = new Set(["MISSING_PINCODE", "INVALID_PINCODE", "INVALID_TIMESTAMP", "UNKNOWN_COURIER", "UNKNOWN_PAYMENT"]);
  const otherWarn = Object.entries(codeCounts)
    .filter(([c]) => !known.has(c) && ISSUE_LABELS[c]?.severity !== "ERROR")
    .reduce((s, [, n]) => s + n, 0);
  const penalty =
    Math.min(60, 1.2 * (rejected / total) * 100) +
    Math.min(10, 0.5 * (p("MISSING_PINCODE") + p("INVALID_PINCODE"))) +
    Math.min(10, 1.0 * p("INVALID_TIMESTAMP")) +
    Math.min(10, 0.5 * p("UNKNOWN_COURIER")) +
    Math.min(5, 0.5 * p("UNKNOWN_PAYMENT")) +
    Math.min(5, 0.25 * (otherWarn / total) * 100);
  return { score: Math.round(Math.max(0, Math.min(100, 100 - penalty))), total, accepted, rejected, warnings };
}
