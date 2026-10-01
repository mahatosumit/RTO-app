import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { rtoRecords, shipmentEvents, shipments } from "@/db/schema";
import { buildWhere, isUuid } from "@/lib/analytics/filters";
import type { Filters } from "@/lib/analytics/types";
import { EVENT_LABELS, type EventType } from "@/lib/domain/classify";

export interface ShipmentListRow {
  id: string;
  shipmentId: string;
  orderId: string | null;
  orderDate: Date;
  courier: string | null;
  pincode: string | null;
  state: string | null;
  product: string | null;
  category: string | null;
  value: number;
  payment: string;
  status: string;
  attempts: number;
  ndrCount: number;
  ndrReason: string | null;
}

const SORTS: Record<string, string> = {
  date: "s.order_date DESC, s.id",
  dateAsc: "s.order_date ASC, s.id",
  value: "s.order_value DESC, s.id",
  attempts: "s.attempts DESC, s.order_date DESC",
};

export async function listShipments(
  datasetId: string,
  filters: Filters,
  page = 1,
  pageSize = 25,
  sort = "date",
): Promise<{ rows: ShipmentListRow[]; total: number; page: number; pageSize: number }> {
  const size = Math.min(Math.max(Math.floor(pageSize), 1), 100);
  const pg = Math.max(Math.floor(page), 1);
  const where = buildWhere(datasetId, filters);
  const order = sql.raw(SORTS[sort] ?? SORTS.date);
  const [list, count] = await Promise.all([
    db.execute(sql`
      SELECT s.id, s.shipment_id, s.order_id, s.order_date, s.courier_name, s.pincode, s.state, s.product_name, s.category,
             s.order_value, s.payment_type, s.final_status, s.attempts, s.ndr_count, s.ndr_reason_code
      FROM shipments s WHERE ${where} ORDER BY ${order} LIMIT ${size} OFFSET ${(pg - 1) * size}`),
    db.execute(sql`SELECT count(*)::int AS n FROM shipments s WHERE ${where}`),
  ]);
  const rows = (list.rows as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    shipmentId: String(r.shipment_id),
    orderId: (r.order_id as string | null) ?? null,
    orderDate: new Date(r.order_date as string),
    courier: (r.courier_name as string | null) ?? null,
    pincode: (r.pincode as string | null) ?? null,
    state: (r.state as string | null) ?? null,
    product: (r.product_name as string | null) ?? null,
    category: (r.category as string | null) ?? null,
    value: Number(r.order_value),
    payment: String(r.payment_type),
    status: String(r.final_status),
    attempts: Number(r.attempts),
    ndrCount: Number(r.ndr_count),
    ndrReason: (r.ndr_reason_code as string | null) ?? null,
  }));
  return { rows, total: Number((count.rows[0] as { n: number }).n), page: pg, pageSize: size };
}

export interface TimelineItem {
  ts: Date;
  type: EventType;
  label: string;
  location: string | null;
  description: string | null;
  derived: boolean;
}

export async function getShipmentDetail(id: string) {
  if (!isUuid(id)) return null;
  const [s] = await db.select().from(shipments).where(eq(shipments.id, id)).limit(1);
  if (!s) return null;
  const events = await db.select().from(shipmentEvents).where(eq(shipmentEvents.shipmentPk, id)).orderBy(shipmentEvents.ts, shipmentEvents.id);
  const [rto] = await db.select().from(rtoRecords).where(eq(rtoRecords.shipmentPk, id)).limit(1);
  let timeline: TimelineItem[] = events.map((e) => ({
    ts: e.ts,
    type: e.eventType as EventType,
    label: EVENT_LABELS[e.eventType as EventType] ?? e.eventType,
    location: e.location,
    description: e.description,
    derived: false,
  }));
  const hasEvents = timeline.length > 0;
  if (!hasEvents) {
    // No scan history: reconstruct a coarse timeline from shipment dates; clearly flagged as derived.
    const push = (ts: Date | null, type: EventType, description: string) => ts && timeline.push({ ts, type, label: EVENT_LABELS[type], location: null, description, derived: true });
    push(s.orderDate, "ORDERED", "Derived from order date");
    push(s.dispatchDate, "DISPATCHED", "Derived from dispatch date");
    push(s.actualDeliveryDate, "DELIVERED", "Derived from delivery date");
    if (s.finalStatus === "RTO") push(rto?.initiatedAt ?? null, "RTO_INITIATED", "Derived from RTO date");
    timeline = timeline.sort((a, b) => a.ts.getTime() - b.ts.getTime());
  }
  const first = timeline[0]?.ts ?? s.orderDate;
  const last = timeline[timeline.length - 1]?.ts ?? s.orderDate;
  return {
    shipment: s,
    timeline,
    hasEvents,
    totalHours: (last.getTime() - first.getTime()) / 3.6e6,
    ndrEvents: timeline.filter((t) => t.type === "NDR"),
    rto: rto ?? null,
  };
}
