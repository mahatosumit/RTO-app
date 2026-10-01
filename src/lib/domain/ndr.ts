export const NDR_REASONS = [
  "CUSTOMER_UNAVAILABLE",
  "PHONE_UNREACHABLE",
  "ADDRESS_INCOMPLETE",
  "CUSTOMER_REFUSED",
  "RESCHEDULE_REQUESTED",
  "CHANGE_OF_MIND",
  "OUT_OF_DELIVERY_AREA",
  "PAYMENT_ISSUE",
  "COURIER_ISSUE",
  "OTHER",
  "UNKNOWN",
] as const;
export type NdrReason = (typeof NDR_REASONS)[number];

export const NDR_LABELS: Record<NdrReason, string> = {
  CUSTOMER_UNAVAILABLE: "Customer unavailable",
  PHONE_UNREACHABLE: "Phone unreachable",
  ADDRESS_INCOMPLETE: "Address incomplete / incorrect",
  CUSTOMER_REFUSED: "Customer refused delivery",
  RESCHEDULE_REQUESTED: "Reschedule requested",
  CHANGE_OF_MIND: "Change of mind / not required",
  OUT_OF_DELIVERY_AREA: "Out of delivery area",
  PAYMENT_ISSUE: "Payment (COD cash) issue",
  COURIER_ISSUE: "Courier-side issue",
  OTHER: "Other",
  UNKNOWN: "Reason not recorded",
};

/** Reasons where an operational intervention (verification, re-attempt) plausibly helps. */
export const ADDRESSABLE_REASONS: readonly NdrReason[] = [
  "CUSTOMER_UNAVAILABLE",
  "PHONE_UNREACHABLE",
  "ADDRESS_INCOMPLETE",
  "RESCHEDULE_REQUESTED",
];

const RULES: Array<[RegExp, NdrReason]> = [
  [/refus|reject|not accept|denied|declin/, "CUSTOMER_REFUSED"],
  [/reschedul|future date|later date|requested (delivery )?(on|for)/, "RESCHEDULE_REQUESTED"],
  [/not (required|needed|interested|want)|cancel|chang(ed|e of) mind|duplicate order|by mistake|wrong item|no longer/, "CHANGE_OF_MIND"],
  [/unavailable|not available|not at home|door lock|shop closed|premises closed|office closed|not home|absent|closed/, "CUSTOMER_UNAVAILABLE"],
  [/phone|mobile|contact|unreachable|not reachable|not answer|no response|switched off|not picking|call/, "PHONE_UNREACHABLE"],
  [/out of (delivery|serviceable)|\boda\b|not serviceable|non.?serviceable/, "OUT_OF_DELIVERY_AREA"],
  [/address|landmark|incomplete|house no|locality|street|pin ?code/, "ADDRESS_INCOMPLETE"],
  [/\bcod\b|cash|payment|amount|money/, "PAYMENT_ISSUE"],
  [/vehicle|weather|rain|strike|delay|hub|damag|late|bike|rider|agent|no time|not attempted|could not attempt|network|flood|holiday/, "COURIER_ISSUE"],
];

export function normalizeNdrReason(raw: string | null | undefined): NdrReason {
  if (raw === null || raw === undefined) return "UNKNOWN";
  const s = String(raw).trim();
  if (!s || ["na", "n/a", "null", "none", "-", "nan"].includes(s.toLowerCase())) return "UNKNOWN";
  const upper = s.toUpperCase().replace(/[\s-]+/g, "_");
  if ((NDR_REASONS as readonly string[]).includes(upper)) return upper as NdrReason;
  const lower = s.toLowerCase();
  for (const [re, code] of RULES) if (re.test(lower)) return code;
  return "OTHER";
}
