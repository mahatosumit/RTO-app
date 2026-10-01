import { parseDateDetailed } from "@/lib/domain/dates";
import { classifyShipment, isEligibleStatus, normalizeStatusText, normalizeEventType, type EventType, type FinalStatus } from "@/lib/domain/classify";
import { normalizeNdrReason, type NdrReason } from "@/lib/domain/ndr";
import { CourierRegistry } from "@/lib/domain/courier";
import { canonicalState, geoFromPincode, isValidPincode, regionForState } from "@/lib/domain/geo";
import { valueBand } from "@/lib/domain/cost";

export type Severity = "ERROR" | "WARNING";
export interface Issue {
  severity: Severity;
  code: string;
  field?: string;
  message: string;
}

export interface NormalizedShipment {
  sourceRow: number;
  shipmentId: string;
  orderId: string | null;
  customerExternalId: string | null;
  productName: string | null;
  category: string | null;
  courierName: string;
  pincode: string | null;
  city: string | null;
  state: string | null;
  region: string | null;
  pin3: string | null;
  orderValue: number;
  paymentType: "COD" | "PREPAID" | "UNKNOWN";
  orderDate: Date;
  dispatchDate: Date | null;
  expectedDeliveryDate: Date | null;
  actualDeliveryDate: Date | null;
  rawStatus: string | null;
  finalStatus: FinalStatus;
  attempts: number;
  ndrCount: number;
  rtoFlag: boolean;
  rtoReason: string | null;
  ndrReasonRaw: string | null;
  ndrReasonCode: NdrReason | null;
  rtoDate: Date | null;
  valueBand: string;
  transitHours: number | null;
  isEligible: boolean;
}

export type RowResult =
  | { ok: true; row: NormalizedShipment; warnings: Issue[] }
  | { ok: false; errors: Issue[]; warnings: Issue[] };

export const EXTREME_ORDER_VALUE = 500_000;
const MAX_CELL = 2000;

export interface ValidationContext {
  seenIds: Set<string>;
  couriers: CourierRegistry;
}

export function createContext(): ValidationContext {
  return { seenIds: new Set(), couriers: new CourierRegistry() };
}

function clean(v: string | undefined | null): string {
  if (v === undefined || v === null) return "";
  return String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, MAX_CELL);
}

function cell(raw: Record<string, string>, mapping: Record<string, string | null>, key: string): string {
  const h = mapping[key];
  return h ? clean(raw[h]) : "";
}

function parseNumber(s: string): number | null {
  if (!s) return null;
  const t = s.replace(/[₹,\s]/g, "").replace(/^rs\.?/i, "");
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

export function parsePayment(s: string): "COD" | "PREPAID" | "UNKNOWN" {
  const v = s.trim().toLowerCase();
  if (!v) return "UNKNOWN";
  if (["1", "true", "yes", "y"].includes(v)) return "COD";
  if (["0", "false", "no", "n"].includes(v)) return "PREPAID";
  if (/cod|cash on delivery|pay on delivery|postpaid|cash/.test(v)) return "COD";
  if (/prepaid|pre-paid|paid|online|upi|card|netbanking|net banking|wallet|razorpay|prepay|credit|debit/.test(v)) return "PREPAID";
  return "UNKNOWN";
}

function parseBool(s: string): boolean {
  return ["1", "true", "yes", "y", "rto", "returned"].includes(s.trim().toLowerCase());
}

export function validateShipmentRow(
  raw: Record<string, string>,
  mapping: Record<string, string | null>,
  rowNumber: number,
  ctx: ValidationContext,
): RowResult {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const err = (code: string, message: string, field?: string) => errors.push({ severity: "ERROR", code, field, message });
  const warn = (code: string, message: string, field?: string) => warnings.push({ severity: "WARNING", code, field, message });

  // --- identity
  const shipmentId = cell(raw, mapping, "shipment_id");
  if (!shipmentId) err("MISSING_SHIPMENT_ID", "Shipment ID is empty.", "shipment_id");
  else if (ctx.seenIds.has(shipmentId)) err("DUPLICATE_SHIPMENT_ID", `Shipment ID "${shipmentId}" already appeared earlier in this file.`, "shipment_id");

  // --- order value
  const valueRaw = cell(raw, mapping, "order_value");
  const orderValue = parseNumber(valueRaw);
  if (orderValue === null) err("INVALID_ORDER_VALUE", valueRaw ? `Order value "${valueRaw}" is not a number.` : "Order value is empty.", "order_value");
  else if (orderValue < 0) err("INVALID_ORDER_VALUE", `Order value ${orderValue} is negative.`, "order_value");
  else if (orderValue > EXTREME_ORDER_VALUE) warn("EXTREME_VALUE", `Order value ₹${orderValue.toLocaleString("en-IN")} is unusually high; please verify.`, "order_value");

  // --- dates
  const od = parseDateDetailed(cell(raw, mapping, "order_date"));
  if (od.status !== "ok") err("INVALID_ORDER_DATE", od.status === "missing" ? "Order date is empty." : `Order date "${cell(raw, mapping, "order_date")}" is not a recognised date.`, "order_date");

  const optDate = (key: string, code: string, label: string) => {
    const s = cell(raw, mapping, key);
    const r = parseDateDetailed(s);
    if (r.status === "invalid") warn(code, `${label} "${s}" is not a recognised date; ignored.`, key);
    return r.status === "ok" ? r.value : null;
  };
  const dispatchDate = optDate("dispatch_date", "INVALID_TIMESTAMP", "Dispatch date");
  const expectedDate = optDate("expected_delivery_date", "INVALID_TIMESTAMP", "Expected delivery date");
  const deliveredDate = optDate("actual_delivery_date", "INVALID_TIMESTAMP", "Delivery date");
  const rtoDate = optDate("rto_date", "INVALID_TIMESTAMP", "RTO date");

  if (od.status === "ok" && dispatchDate && dispatchDate.getTime() < od.value.getTime() - 86400000) {
    warn("DISPATCH_BEFORE_ORDER", "Dispatch date is earlier than the order date.", "dispatch_date");
  }
  if (deliveredDate) {
    const ref = dispatchDate ?? (od.status === "ok" ? od.value : null);
    if (ref && deliveredDate.getTime() < ref.getTime() - 3600000) {
      err("IMPOSSIBLE_TIMELINE", "Delivery date is earlier than the dispatch/order date (impossible status transition).", "actual_delivery_date");
    }
  }

  // --- status
  const rawStatus = cell(raw, mapping, "delivery_status");
  const rtoFlagRaw = cell(raw, mapping, "rto_flag");
  let rtoFlag = parseBool(rtoFlagRaw);
  const textStatus = normalizeStatusText(rawStatus);
  if (rawStatus && textStatus === "UNKNOWN") warn("UNRECOGNISED_STATUS", `Status "${rawStatus}" is not recognised; outcome inferred from other fields.`, "delivery_status");
  if (!rawStatus && !rtoFlagRaw && !deliveredDate) warn("MISSING_STATUS", "No status information; shipment classified from available dates.", "delivery_status");
  if (textStatus === "DELIVERED" && rtoFlag) err("IMPOSSIBLE_STATUS", "Shipment is marked delivered and RTO at the same time.", "rto_flag");
  if (textStatus === "RTO" && deliveredDate && !rtoFlag && /deliver/.test(rawStatus.toLowerCase()) === false) {
    warn("STATUS_DATE_CONFLICT", "RTO status but a customer delivery date is present; delivery date ignored.", "actual_delivery_date");
  }

  // --- geography
  let pincode: string | null = clean(cell(raw, mapping, "pincode")).replace(/\.0$/, "").replace(/\s+/g, "");
  if (!pincode) {
    warn("MISSING_PINCODE", "Delivery pincode is missing.", "pincode");
    pincode = null;
  } else if (!isValidPincode(pincode)) {
    warn("INVALID_PINCODE", `Pincode "${pincode}" is not a valid 6-digit Indian pincode; ignored.`, "pincode");
    pincode = null;
  }
  const geo = pincode ? geoFromPincode(pincode) : null;
  const stateRaw = cell(raw, mapping, "state");
  const state = canonicalState(stateRaw) ?? geo?.state ?? null;
  const region = regionForState(state) ?? geo?.region ?? null;
  const city = cell(raw, mapping, "city") || null;

  // --- courier
  const courierRaw = cell(raw, mapping, "courier");
  const courier = ctx.couriers.resolve(courierRaw);
  if (!courier.known) warn("UNKNOWN_COURIER", courierRaw ? `Courier "${courierRaw}" treated as unknown.` : "Courier name is missing.", "courier");

  // --- payment
  const paymentRaw = cell(raw, mapping, "payment_type");
  const paymentType = parsePayment(paymentRaw);
  if (paymentType === "UNKNOWN") warn("UNKNOWN_PAYMENT", paymentRaw ? `Payment type "${paymentRaw}" not recognised.` : "Payment type is missing.", "payment_type");

  // --- attempts / NDR
  const ndrReasonRaw = cell(raw, mapping, "ndr_reason") || null;
  const rtoReason = cell(raw, mapping, "rto_reason") || null;
  let ndrCount = 0;
  const ndrCountRaw = cell(raw, mapping, "ndr_count");
  if (ndrCountRaw) {
    const n = parseNumber(ndrCountRaw);
    if (n === null || n < 0 || !Number.isInteger(n)) warn("INVALID_COUNT", `NDR count "${ndrCountRaw}" is invalid; derived instead.`, "ndr_count");
    else ndrCount = n;
  }
  const attemptsRaw = cell(raw, mapping, "attempts");
  let attempts: number | null = null;
  if (attemptsRaw) {
    const n = parseNumber(attemptsRaw);
    if (n === null || n < 0 || !Number.isInteger(n) || n > 20) warn("INVALID_COUNT", `Attempts "${attemptsRaw}" is invalid; derived instead.`, "attempts");
    else attempts = n;
  }

  if (errors.length > 0) return { ok: false, errors, warnings };

  ctx.seenIds.add(shipmentId);

  let finalStatus = classifyShipment({
    rawStatus,
    rtoFlag,
    actualDeliveryDate: deliveredDate,
    dispatchDate,
    ndrCount,
  });
  if (finalStatus === "RTO") rtoFlag = true;
  const effectiveDelivered = finalStatus === "DELIVERED" ? deliveredDate : null;
  if (finalStatus === "RTO" && ndrCount === 0 && (ndrReasonRaw || (attempts ?? 0) > 0)) ndrCount = Math.max(1, (attempts ?? 1));
  if (ndrReasonRaw && ndrCount === 0 && (finalStatus === "NDR" || finalStatus === "RTO")) ndrCount = 1;
  if (attempts === null) attempts = finalStatus === "DELIVERED" ? ndrCount + 1 : finalStatus === "RTO" || finalStatus === "NDR" ? Math.max(ndrCount, 1) : ndrCount;
  if (finalStatus === "UNKNOWN") finalStatus = "UNKNOWN";

  const reasonSource = ndrReasonRaw ?? rtoReason;
  const ndrReasonCode: NdrReason | null = ndrCount > 0 || finalStatus === "RTO" || finalStatus === "NDR" ? normalizeNdrReason(reasonSource) : null;

  const orderDate = (od as { value: Date }).value;
  const transitHours = effectiveDelivered && dispatchDate ? Math.max(0, (effectiveDelivered.getTime() - dispatchDate.getTime()) / 3.6e6) : null;

  const row: NormalizedShipment = {
    sourceRow: rowNumber,
    shipmentId,
    orderId: cell(raw, mapping, "order_id") || null,
    customerExternalId: cell(raw, mapping, "customer_id") || null,
    productName: cell(raw, mapping, "product_name") || null,
    category: cell(raw, mapping, "category") || null,
    courierName: courier.name,
    pincode,
    city,
    state,
    region,
    pin3: pincode ? pincode.slice(0, 3) : null,
    orderValue: orderValue as number,
    paymentType,
    orderDate,
    dispatchDate,
    expectedDeliveryDate: expectedDate,
    actualDeliveryDate: effectiveDelivered,
    rawStatus: rawStatus || null,
    finalStatus,
    attempts,
    ndrCount,
    rtoFlag,
    rtoReason,
    ndrReasonRaw,
    ndrReasonCode,
    rtoDate,
    valueBand: valueBand(orderValue as number),
    transitHours,
    isEligible: isEligibleStatus(finalStatus),
  };
  return { ok: true, row, warnings };
}

// ---------------------------------------------------------------- events

export interface NormalizedEvent {
  sourceRow: number;
  shipmentId: string;
  ts: Date;
  eventType: EventType;
  status: string | null;
  location: string | null;
  description: string | null;
  eventId: string | null;
}

export type EventRowResult = { ok: true; event: NormalizedEvent } | { ok: false; errors: Issue[] };

export function validateEventRow(raw: Record<string, string>, mapping: Record<string, string | null>, rowNumber: number): EventRowResult {
  const errors: Issue[] = [];
  const shipmentId = cell(raw, mapping, "shipment_id");
  if (!shipmentId) errors.push({ severity: "ERROR", code: "MISSING_SHIPMENT_ID", field: "shipment_id", message: "Shipment ID is empty." });
  const tsRaw = cell(raw, mapping, "timestamp");
  const ts = parseDateDetailed(tsRaw);
  if (ts.status !== "ok") errors.push({ severity: "ERROR", code: "INVALID_TIMESTAMP", field: "timestamp", message: ts.status === "missing" ? "Event timestamp is empty." : `Timestamp "${tsRaw}" is not a recognised date.` });
  const typeRaw = cell(raw, mapping, "event_type");
  const statusRaw = cell(raw, mapping, "status");
  const eventType = normalizeEventType(typeRaw || statusRaw);
  if (!typeRaw && !statusRaw) errors.push({ severity: "ERROR", code: "MISSING_EVENT_TYPE", field: "event_type", message: "Event type is empty." });
  if (errors.length || ts.status !== "ok") return { ok: false, errors };
  return {
    ok: true,
    event: {
      sourceRow: rowNumber,
      shipmentId,
      ts: ts.value,
      eventType,
      status: statusRaw || typeRaw || null,
      location: cell(raw, mapping, "location") || null,
      description: cell(raw, mapping, "description") || null,
      eventId: cell(raw, mapping, "event_id") || null,
    },
  };
}
