export const FINAL_STATUSES = ["DELIVERED", "IN_TRANSIT", "NDR", "RTO", "CANCELLED", "LOST", "UNKNOWN"] as const;
export type FinalStatus = (typeof FINAL_STATUSES)[number];

export const EVENT_TYPES = [
  "ORDERED",
  "DISPATCHED",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "NDR",
  "DELIVERED",
  "RTO_INITIATED",
  "RTO_IN_TRANSIT",
  "RTO_DELIVERED",
  "CANCELLED",
  "LOST",
  "OTHER",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_LABELS: Record<EventType, string> = {
  ORDERED: "Order created",
  DISPATCHED: "Dispatched",
  IN_TRANSIT: "In transit / hub scan",
  OUT_FOR_DELIVERY: "Out for delivery",
  NDR: "Delivery failed (NDR)",
  DELIVERED: "Delivered",
  RTO_INITIATED: "RTO initiated",
  RTO_IN_TRANSIT: "RTO in transit",
  RTO_DELIVERED: "RTO received at origin",
  CANCELLED: "Cancelled",
  LOST: "Lost / damaged",
  OTHER: "Other scan",
};

/** Shipments whose outcome is resolved and therefore count in rate denominators. */
export function isEligibleStatus(s: FinalStatus): boolean {
  return s === "DELIVERED" || s === "RTO" || s === "LOST";
}

export function normalizeStatusText(raw: string | null | undefined): FinalStatus {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return "UNKNOWN";
  if (/\brto\b|return(ed)? to (origin|seller|shipper|warehouse)|returned|return initiated|\brts\b|return to origin/.test(s)) return "RTO";
  if (/cancel/.test(s)) return "CANCELLED";
  if (/\blost\b|misplaced|damaged|destroyed|untraceable|missing/.test(s)) return "LOST";
  if (/undeliver|\bndr\b|attempt(ed)? (failed|unsuccessful)|delivery failed|failed delivery|not delivered|exception|delivery attempted/.test(s)) return "NDR";
  if (/out for delivery|\bofd\b/.test(s)) return "IN_TRANSIT";
  if (/deliver/.test(s)) return "DELIVERED";
  if (/transit|shipped|dispatch|picked|pickup|manifest|hub|reached|arrived|booked|processing|packed|ready|in progress/.test(s)) return "IN_TRANSIT";
  return "UNKNOWN";
}

export function normalizeEventType(raw: string | null | undefined): EventType {
  const s = String(raw ?? "").trim().toLowerCase().replace(/[_-]+/g, " ");
  if (!s) return "OTHER";
  const exact = s.toUpperCase().replace(/ /g, "_");
  if ((EVENT_TYPES as readonly string[]).includes(exact)) return exact as EventType;
  if (/rto.*(deliver|received|reached)|return.*(received|reached origin)/.test(s)) return "RTO_DELIVERED";
  if (/rto.*transit|return.*transit/.test(s)) return "RTO_IN_TRANSIT";
  if (/\brto\b|return initiated|return to origin|rts/.test(s)) return "RTO_INITIATED";
  if (/cancel/.test(s)) return "CANCELLED";
  if (/\blost\b|damaged|misplaced/.test(s)) return "LOST";
  if (/undeliver|\bndr\b|attempt(ed)? (failed|unsuccessful)|delivery failed|failed delivery|not delivered/.test(s)) return "NDR";
  if (/out for delivery|\bofd\b/.test(s)) return "OUT_FOR_DELIVERY";
  if (/deliver/.test(s)) return "DELIVERED";
  if (/order (created|placed|confirmed)|ordered|created|placed/.test(s)) return "ORDERED";
  if (/dispatch|picked|pickup|shipped|manifest|booked/.test(s)) return "DISPATCHED";
  if (/transit|hub|reached|arrived|departed|scan|facility/.test(s)) return "IN_TRANSIT";
  return "OTHER";
}

const TERMINAL: readonly EventType[] = ["DELIVERED", "RTO_DELIVERED", "CANCELLED", "LOST"];

/** True when `next` cannot follow `prev` in a real shipment lifecycle. */
export function isImpossibleTransition(prev: EventType, next: EventType): boolean {
  if (prev === "OTHER" || next === "OTHER") return false;
  if (TERMINAL.includes(prev)) return true;
  if (prev.startsWith("RTO_")) return !(next.startsWith("RTO_") || next === "LOST");
  if (next === "ORDERED") return true;
  return false;
}

export type TransitionIssue = { index: number; prev: EventType; next: EventType };

/** Checks a time-ordered list of event types. Returns offending positions (index of `next`). */
export function findImpossibleTransitions(types: EventType[]): TransitionIssue[] {
  const issues: TransitionIssue[] = [];
  let prev: EventType | null = null;
  for (let index = 0; index < types.length; index++) {
    const t = types[index];
    if (t === "OTHER") continue;
    if (prev !== null && isImpossibleTransition(prev, t)) {
      issues.push({ index, prev, next: t });
      continue;
    }
    prev = t;
  }
  return issues;
}

export interface ClassifyInput {
  rawStatus?: string | null;
  rtoFlag?: boolean;
  actualDeliveryDate?: Date | null;
  dispatchDate?: Date | null;
  ndrCount?: number;
  eventTypes?: EventType[];
}

export function classifyShipment(i: ClassifyInput): FinalStatus {
  if (i.rtoFlag) return "RTO";
  const events = i.eventTypes ?? [];
  const meaningful = events.filter((e) => e !== "OTHER");
  const last = meaningful[meaningful.length - 1];
  if (last) {
    if (last === "DELIVERED") return "DELIVERED";
    if (last.startsWith("RTO_")) return "RTO";
    if (last === "CANCELLED") return "CANCELLED";
    if (last === "LOST") return "LOST";
  }
  const fromText = normalizeStatusText(i.rawStatus);
  if (fromText !== "UNKNOWN") return fromText;
  if (i.actualDeliveryDate) return "DELIVERED";
  if (last === "NDR") return "NDR";
  if (last === "OUT_FOR_DELIVERY" || last === "IN_TRANSIT" || last === "DISPATCHED") return "IN_TRANSIT";
  if ((i.ndrCount ?? 0) > 0 && !i.dispatchDate) return "NDR";
  if (i.dispatchDate) return "IN_TRANSIT";
  return "UNKNOWN";
}
