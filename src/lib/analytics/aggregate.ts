import { sql } from "drizzle-orm";
import { db } from "@/db";
import { ADDRESSABLE_REASONS } from "@/lib/domain/ndr";
import { buildWhere, dimExpr } from "./filters";
import type { AggRow, DimKey, Filters } from "./types";

const ADDR = sql.raw(ADDRESSABLE_REASONS.map((r) => `'${r}'`).join(","));

export interface AggregateOptions {
  limit?: number;
  orderBy?: "shipments" | "rto" | "key" | "keyDesc" | "rtoRate";
  minEligible?: number;
  minRto?: number;
}

type Raw = Record<string, unknown>;
const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
const numOrNull = (v: unknown) => (v === null || v === undefined ? null : Number(v));

function toAgg(r: Raw): AggRow {
  return {
    key: String(r.key),
    shipments: num(r.shipments), dispatched: num(r.dispatched), eligible: num(r.eligible), delivered: num(r.delivered),
    rto: num(r.rto), lost: num(r.lost), inTransit: num(r.in_transit), ndrOpen: num(r.ndr_open), cancelled: num(r.cancelled),
    ndrShipments: num(r.ndr_shipments), ndrResolved: num(r.ndr_resolved), ndrDelivered: num(r.ndr_delivered),
    codShipments: num(r.cod_shipments), codEligible: num(r.cod_eligible), codRto: num(r.cod_rto),
    prepaidEligible: num(r.prepaid_eligible), prepaidRto: num(r.prepaid_rto),
    totalValue: num(r.total_value), rtoValue: num(r.rto_value), deliveredValue: num(r.delivered_value), codRtoValue: num(r.cod_rto_value),
    avgAttempts: numOrNull(r.avg_attempts), avgTransitHours: numOrNull(r.avg_transit_hours),
    addressableRto: num(r.addressable_rto), addressableRtoValue: num(r.addressable_rto_value),
    addrResolved: num(r.addr_resolved), addrDelivered: num(r.addr_delivered),
  };
}

/** Server-side aggregation: one grouped query, all metrics in a single pass. */
export async function aggregateBy(
  datasetId: string,
  dims: DimKey[],
  filters: Filters = {},
  opts: AggregateOptions = {},
): Promise<AggRow[]> {
  const where = buildWhere(datasetId, filters);
  const limit = Math.min(Math.max(opts.limit ?? 1000, 1), 5000);
  const having: string[] = [];
  if (opts.minEligible) having.push(`count(*) FILTER (WHERE s.is_eligible) >= ${Math.floor(opts.minEligible)}`);
  if (opts.minRto) having.push(`count(*) FILTER (WHERE s.final_status = 'RTO') >= ${Math.floor(opts.minRto)}`);
  const order =
    opts.orderBy === "key" ? "key ASC"
    : opts.orderBy === "keyDesc" ? "key DESC"
    : opts.orderBy === "rto" ? "rto DESC, shipments DESC"
    : opts.orderBy === "rtoRate" ? "(rto::float8 / NULLIF(eligible,0)) DESC NULLS LAST, shipments DESC"
    : "shipments DESC";
  const started = Date.now();
  const res = await db.execute(sql`
    SELECT ${dimExpr(dims)} AS key,
      count(*)::int AS shipments,
      count(*) FILTER (WHERE s.final_status NOT IN ('CANCELLED','UNKNOWN'))::int AS dispatched,
      count(*) FILTER (WHERE s.is_eligible)::int AS eligible,
      count(*) FILTER (WHERE s.final_status = 'DELIVERED')::int AS delivered,
      count(*) FILTER (WHERE s.final_status = 'RTO')::int AS rto,
      count(*) FILTER (WHERE s.final_status = 'LOST')::int AS lost,
      count(*) FILTER (WHERE s.final_status = 'IN_TRANSIT')::int AS in_transit,
      count(*) FILTER (WHERE s.final_status = 'NDR')::int AS ndr_open,
      count(*) FILTER (WHERE s.final_status = 'CANCELLED')::int AS cancelled,
      count(*) FILTER (WHERE s.ndr_count >= 1 AND s.final_status NOT IN ('CANCELLED','UNKNOWN'))::int AS ndr_shipments,
      count(*) FILTER (WHERE s.ndr_count >= 1 AND s.is_eligible)::int AS ndr_resolved,
      count(*) FILTER (WHERE s.ndr_count >= 1 AND s.final_status = 'DELIVERED')::int AS ndr_delivered,
      count(*) FILTER (WHERE s.payment_type = 'COD')::int AS cod_shipments,
      count(*) FILTER (WHERE s.payment_type = 'COD' AND s.is_eligible)::int AS cod_eligible,
      count(*) FILTER (WHERE s.payment_type = 'COD' AND s.final_status = 'RTO')::int AS cod_rto,
      count(*) FILTER (WHERE s.payment_type = 'PREPAID' AND s.is_eligible)::int AS prepaid_eligible,
      count(*) FILTER (WHERE s.payment_type = 'PREPAID' AND s.final_status = 'RTO')::int AS prepaid_rto,
      COALESCE(sum(s.order_value),0)::float8 AS total_value,
      COALESCE(sum(s.order_value) FILTER (WHERE s.final_status = 'RTO'),0)::float8 AS rto_value,
      COALESCE(sum(s.order_value) FILTER (WHERE s.final_status = 'DELIVERED'),0)::float8 AS delivered_value,
      COALESCE(sum(s.order_value) FILTER (WHERE s.payment_type = 'COD' AND s.final_status = 'RTO'),0)::float8 AS cod_rto_value,
      avg(s.attempts) FILTER (WHERE s.is_eligible AND s.attempts > 0)::float8 AS avg_attempts,
      avg(s.transit_hours) FILTER (WHERE s.final_status = 'DELIVERED')::float8 AS avg_transit_hours,
      count(*) FILTER (WHERE s.final_status = 'RTO' AND s.ndr_reason_code IN (${ADDR}))::int AS addressable_rto,
      COALESCE(sum(s.order_value) FILTER (WHERE s.final_status = 'RTO' AND s.ndr_reason_code IN (${ADDR})),0)::float8 AS addressable_rto_value,
      count(*) FILTER (WHERE s.ndr_reason_code IN (${ADDR}) AND s.is_eligible)::int AS addr_resolved,
      count(*) FILTER (WHERE s.ndr_reason_code IN (${ADDR}) AND s.final_status = 'DELIVERED')::int AS addr_delivered
    FROM shipments s
    WHERE ${where}
    GROUP BY 1
    ${having.length ? sql.raw(`HAVING ${having.join(" AND ")}`) : sql``}
    ORDER BY ${sql.raw(order)}
    LIMIT ${limit}
  `);
  const ms = Date.now() - started;
  if (ms > 1500) console.warn(JSON.stringify({ level: "warn", msg: "slow aggregate", dims, ms }));
  return (res.rows as Raw[]).map(toAgg);
}

export async function aggregateTotal(datasetId: string, filters: Filters = {}): Promise<AggRow> {
  const rows = await aggregateBy(datasetId, [], filters, { limit: 1 });
  return rows[0] ?? { ...(await import("./types")).emptyAgg() };
}

export interface WeekCell {
  key: string;
  w: number;
  n: number;
  rto: number;
}

/** Eligible/RTO counts per segment per 7-day window counted backwards from `asOf` (YYYY-MM-DD). w=0 is the latest week. */
export async function weeklyCounts(
  datasetId: string,
  dims: DimKey[],
  asOf: string,
  filters: Filters = {},
  weeks = 13,
): Promise<WeekCell[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) throw new Error("Invalid asOf");
  const where = buildWhere(datasetId, filters);
  const maxDays = Math.max(1, Math.floor(weeks)) * 7 - 1;
  const res = await db.execute(sql`
    SELECT ${dimExpr(dims)} AS key,
      (((${asOf}::text)::date - (s.order_date AT TIME ZONE 'Asia/Kolkata')::date) / 7)::int AS w,
      count(*) FILTER (WHERE s.is_eligible)::int AS n,
      count(*) FILTER (WHERE s.final_status = 'RTO')::int AS rto
    FROM shipments s
    WHERE ${where}
      AND ((${asOf}::text)::date - (s.order_date AT TIME ZONE 'Asia/Kolkata')::date) BETWEEN 0 AND ${maxDays}
    GROUP BY 1, 2
  `);
  return (res.rows as Raw[]).map((r) => ({ key: String(r.key), w: num(r.w), n: num(r.n), rto: num(r.rto) }));
}
