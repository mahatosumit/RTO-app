export type FieldDef = { key: string; label: string; required: boolean; synonyms: string[] };

export const SHIPMENT_FIELDS: FieldDef[] = [
  { key: "shipment_id", label: "Shipment ID / AWB", required: true, synonyms: ["awb", "awb_number", "awb_no", "tracking_number", "tracking_no", "tracking_id", "waybill", "waybill_number", "lr_number", "shipment_id", "shipment_no"] },
  { key: "order_id", label: "Order ID", required: false, synonyms: ["order_id", "order_no", "order_number", "order_ref", "channel_order_id"] },
  { key: "customer_id", label: "Customer ID", required: false, synonyms: ["customer_id", "customer", "buyer_id", "customer_ref", "user_id", "customer_hash", "phone_hash"] },
  { key: "product_name", label: "Product / SKU", required: false, synonyms: ["product", "product_name", "sku", "item", "item_name", "product_title"] },
  { key: "category", label: "Product category", required: false, synonyms: ["category", "product_category", "item_category", "collection", "department"] },
  { key: "courier", label: "Courier", required: false, synonyms: ["courier", "courier_name", "courier_partner", "carrier", "logistics_partner", "shipping_partner", "shipping_provider", "delivery_partner"] },
  { key: "pincode", label: "Delivery pincode", required: false, synonyms: ["pincode", "pin_code", "pin", "zip", "zipcode", "zip_code", "postal_code", "delivery_pincode", "shipping_pincode", "customer_pincode", "destination_pincode"] },
  { key: "city", label: "City", required: false, synonyms: ["city", "delivery_city", "shipping_city", "destination_city"] },
  { key: "state", label: "State", required: false, synonyms: ["state", "delivery_state", "shipping_state", "destination_state"] },
  { key: "order_value", label: "Order value (₹)", required: true, synonyms: ["order_value", "order_amount", "amount", "total", "order_total", "invoice_value", "value", "gmv", "price", "cod_amount", "declared_value"] },
  { key: "payment_type", label: "Payment type (COD/Prepaid)", required: false, synonyms: ["payment_type", "payment_mode", "payment_method", "payment", "cod", "is_cod", "mode_of_payment"] },
  { key: "order_date", label: "Order date", required: true, synonyms: ["order_date", "ordered_at", "order_created", "order_created_at", "order_time", "order_placed", "created_at", "created_date", "order_datetime"] },
  { key: "dispatch_date", label: "Dispatch date", required: false, synonyms: ["dispatch_date", "dispatched_at", "shipped_date", "shipped_at", "pickup_date", "picked_up_at", "manifest_date", "ship_date"] },
  { key: "expected_delivery_date", label: "Expected delivery date", required: false, synonyms: ["edd", "expected_delivery_date", "expected_delivery", "estimated_delivery_date", "promised_date", "promised_delivery"] },
  { key: "actual_delivery_date", label: "Actual delivery date", required: false, synonyms: ["actual_delivery_date", "delivered_date", "delivered_at", "delivery_date", "actual_delivery", "delivered_on"] },
  { key: "delivery_status", label: "Delivery status", required: false, synonyms: ["delivery_status", "status", "shipment_status", "current_status", "final_status", "order_status", "courier_status"] },
  { key: "attempts", label: "Delivery attempts", required: false, synonyms: ["attempts", "attempt_count", "delivery_attempts", "no_of_attempts", "number_of_attempts"] },
  { key: "ndr_count", label: "NDR count", required: false, synonyms: ["ndr_count", "ndr_attempts", "ndr_raised", "num_ndr", "no_of_ndr"] },
  { key: "ndr_reason", label: "NDR reason", required: false, synonyms: ["ndr_reason", "ndr_remarks", "failure_reason", "undelivered_reason", "last_ndr_reason", "non_delivery_reason", "ndr_status"] },
  { key: "rto_flag", label: "RTO flag", required: false, synonyms: ["rto_flag", "is_rto", "rto", "returned", "is_returned", "rto_status"] },
  { key: "rto_reason", label: "RTO reason", required: false, synonyms: ["rto_reason", "return_reason", "rto_remarks", "reason_for_rto"] },
  { key: "rto_date", label: "RTO initiated date", required: false, synonyms: ["rto_date", "rto_initiated_date", "rto_initiated_at", "return_date", "returned_at"] },
];

export const EVENT_FIELDS: FieldDef[] = [
  { key: "shipment_id", label: "Shipment ID / AWB", required: true, synonyms: ["awb", "awb_number", "tracking_number", "tracking_no", "waybill", "shipment_id", "lr_number"] },
  { key: "timestamp", label: "Event timestamp", required: true, synonyms: ["timestamp", "event_time", "event_timestamp", "event_date", "scan_time", "scan_date", "datetime", "time", "created_at"] },
  { key: "event_type", label: "Event type", required: true, synonyms: ["event_type", "event", "scan_type", "activity", "scan", "event_name"] },
  { key: "status", label: "Status text", required: false, synonyms: ["status", "scan_status", "event_status", "courier_status"] },
  { key: "location", label: "Location / hub", required: false, synonyms: ["location", "hub", "scan_location", "city", "facility"] },
  { key: "description", label: "Description", required: false, synonyms: ["description", "remarks", "scan_remarks", "activity_description", "details", "comment"] },
  { key: "event_id", label: "Event ID", required: false, synonyms: ["event_id", "scan_id", "id"] },
];

export function fieldsFor(kind: "SHIPMENTS" | "EVENTS"): FieldDef[] {
  return kind === "EVENTS" ? EVENT_FIELDS : SHIPMENT_FIELDS;
}

export function normalizeHeader(h: string): string {
  return h
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function tokens(s: string): string[] {
  return s.split("_").filter(Boolean);
}

function jaccard(a: string[], b: string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function scoreHeaderForField(header: string, field: FieldDef): number {
  const nh = normalizeHeader(header);
  if (!nh) return 0;
  const squashed = nh.replace(/_/g, "");
  let best = 0;
  for (const syn of [field.key, ...field.synonyms]) {
    const ns = normalizeHeader(syn);
    if (nh === ns || squashed === ns.replace(/_/g, "")) return 1;
    const j = jaccard(tokens(nh), tokens(ns));
    if (j >= 0.5) best = Math.max(best, 0.9 * j);
    if (ns.length >= 6 && squashed.includes(ns.replace(/_/g, ""))) best = Math.max(best, 0.7);
  }
  return best;
}

export const MAPPING_THRESHOLD = 0.6;

/** Returns field key → header (or null). Greedy best-score assignment, each header used once. */
export function suggestMapping(headers: string[], kind: "SHIPMENTS" | "EVENTS"): Record<string, string | null> {
  const fields = fieldsFor(kind);
  const cands: Array<{ field: string; header: string; score: number }> = [];
  for (const f of fields) for (const h of headers) {
    const score = scoreHeaderForField(h, f);
    if (score >= MAPPING_THRESHOLD) cands.push({ field: f.key, header: h, score });
  }
  cands.sort((a, b) => b.score - a.score);
  const result: Record<string, string | null> = Object.fromEntries(fields.map((f) => [f.key, null]));
  const usedHeaders = new Set<string>();
  for (const c of cands) {
    if (result[c.field] !== null || usedHeaders.has(c.header)) continue;
    result[c.field] = c.header;
    usedHeaders.add(c.header);
  }
  return result;
}

export function missingRequired(mapping: Record<string, string | null>, kind: "SHIPMENTS" | "EVENTS"): string[] {
  return fieldsFor(kind).filter((f) => f.required && !mapping[f.key]).map((f) => f.key);
}

/** Mapping values must be real headers; unknown/duplicate assignments are dropped. */
export function sanitizeMapping(
  mapping: Record<string, string | null | undefined>,
  headers: string[],
  kind: "SHIPMENTS" | "EVENTS",
): Record<string, string | null> {
  const valid = new Set(headers);
  const out: Record<string, string | null> = {};
  for (const f of fieldsFor(kind)) {
    const h = mapping[f.key];
    out[f.key] = h && valid.has(h) ? h : null;
  }
  return out;
}
