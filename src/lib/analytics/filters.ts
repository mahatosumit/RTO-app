import { sql, type SQL } from "drizzle-orm";
import { escapeLike } from "@/lib/csv/sanitize";
import { FILTER_LIST_KEYS, type DimKey, type Filters } from "./types";

/** Whitelisted SQL expressions per dimension (alias `s` = shipments). Never built from user input. */
export const DIM_SQL: Record<DimKey, string> = {
  courier: "COALESCE(s.courier_name,'Unknown')",
  pincode: "COALESCE(s.pincode,'(missing)')",
  pin3: "COALESCE(s.pin3,'(missing)')",
  state: "COALESCE(s.state,'(unknown)')",
  region: "COALESCE(s.region,'(unknown)')",
  product: "COALESCE(s.product_name,'(unknown)')",
  category: "COALESCE(s.category,'(uncategorised)')",
  valueBand: "COALESCE(s.value_band,'(unknown)')",
  payment: "s.payment_type",
  repeat: "CASE WHEN s.is_repeat_customer IS NULL THEN 'unknown' WHEN s.is_repeat_customer THEN 'repeat' ELSE 'new' END",
  ndrReason: "COALESCE(s.ndr_reason_code,'NONE')",
  attempts: "s.attempts::text",
  status: "s.final_status",
  week: "to_char(date_trunc('week', s.order_date AT TIME ZONE 'Asia/Kolkata'),'YYYY-MM-DD')",
  month: "to_char(date_trunc('month', s.order_date AT TIME ZONE 'Asia/Kolkata'),'YYYY-MM')",
  day: "to_char((s.order_date AT TIME ZONE 'Asia/Kolkata')::date,'YYYY-MM-DD')",
};

export function dimExpr(dims: DimKey[]): SQL {
  if (dims.length === 0) return sql.raw("'all'");
  return sql.raw(dims.map((d) => `(${DIM_SQL[d]})`).join(` || ' | ' || `));
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(s: unknown): s is string {
  return typeof s === "string" && UUID_RE.test(s);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function buildWhere(datasetId: string, f: Filters = {}): SQL {
  if (!isUuid(datasetId)) throw new Error("Invalid dataset id");
  const conds: SQL[] = [sql`s.dataset_id = ${datasetId}::uuid`];
  for (const key of FILTER_LIST_KEYS) {
    const vals = f[key];
    if (vals && vals.length) {
      conds.push(sql`${sql.raw(`(${DIM_SQL[key]})`)} IN (${sql.join(vals.map((v) => sql`${v}`), sql`, `)})`);
    }
  }
  if (f.from && DATE_RE.test(f.from)) conds.push(sql`s.order_date >= ((${f.from}::text)::date::timestamp AT TIME ZONE 'Asia/Kolkata')`);
  if (f.to && DATE_RE.test(f.to)) conds.push(sql`s.order_date < (((${f.to}::text)::date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata')`);
  if (typeof f.minValue === "number" && Number.isFinite(f.minValue)) conds.push(sql`s.order_value >= ${f.minValue}`);
  if (f.q && f.q.trim()) {
    const like = `${escapeLike(f.q.trim().slice(0, 64))}%`;
    conds.push(sql`(s.shipment_id ILIKE ${like} OR s.order_id ILIKE ${like})`);
  }
  return sql.join(conds, sql` AND `);
}

type SP = Record<string, string | string[] | undefined>;

function list(v: string | string[] | undefined): string[] | undefined {
  if (v === undefined) return undefined;
  const arr = (Array.isArray(v) ? v : v.split("|")).map((x) => x.trim()).filter(Boolean).slice(0, 500);
  return arr.length ? arr : undefined;
}

/** Parse URL search params into Filters (values of a list filter are separated by `|`). */
export function parseFilters(sp: SP): Filters {
  const f: Filters = {};
  for (const k of FILTER_LIST_KEYS) {
    const v = list(sp[k]);
    if (v) f[k] = v;
  }
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const from = one(sp.from);
  const to = one(sp.to);
  if (from && DATE_RE.test(from)) f.from = from;
  if (to && DATE_RE.test(to)) f.to = to;
  const mv = one(sp.minValue);
  if (mv && Number.isFinite(Number(mv)) && Number(mv) >= 0) f.minValue = Number(mv);
  const q = one(sp.q);
  if (q) f.q = q.slice(0, 64);
  return f;
}

export function filtersToParams(f: Filters): URLSearchParams {
  const p = new URLSearchParams();
  for (const k of FILTER_LIST_KEYS) {
    const v = f[k];
    if (v && v.length) p.set(k, v.join("|"));
  }
  if (f.from) p.set("from", f.from);
  if (f.to) p.set("to", f.to);
  if (f.minValue !== undefined) p.set("minValue", String(f.minValue));
  if (f.q) p.set("q", f.q);
  return p;
}

export function filtersToQuery(f: Filters): string {
  const s = filtersToParams(f).toString();
  return s ? `?${s}` : "";
}

export function hasFilters(f: Filters): boolean {
  return filtersToParams(f).toString().length > 0;
}
