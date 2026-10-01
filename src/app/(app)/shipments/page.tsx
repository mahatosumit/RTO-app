import Link from "next/link";
import { FilterBar } from "@/components/FilterBar";
import { Badge, DataTable, EmptyState, NoDataset, PageHeader, Panel } from "@/components/ui";
import { STATUS_TONE } from "@/lib/status";
import { getActiveDataset } from "@/lib/active";
import { filtersToParams, parseFilters } from "@/lib/analytics/filters";
import { segLabel } from "@/lib/analytics/labels";
import { getFilterOptions } from "@/lib/analytics/options";
import { FILTER_LIST_KEYS, type DimKey } from "@/lib/analytics/types";
import { formatINR } from "@/lib/domain/cost";
import { formatIST } from "@/lib/domain/dates";
import { listShipments } from "@/lib/shipments";

export const dynamic = "force-dynamic";

const SHOWN = new Set(["courier", "payment", "state", "category", "status", "valueBand"]);

export default async function ShipmentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const ds = await getActiveDataset();
  if (!ds) return <NoDataset />;
  const filters = parseFilters(sp);
  const page = Math.max(1, Number(Array.isArray(sp.page) ? sp.page[0] : sp.page) || 1);
  const sort = (Array.isArray(sp.sort) ? sp.sort[0] : sp.sort) ?? "date";
  const [res, options] = await Promise.all([listShipments(ds.id, filters, page, 25, sort), getFilterOptions(ds.id)]);
  const pages = Math.max(1, Math.ceil(res.total / res.pageSize));
  const base = filtersToParams(filters);
  if (sort !== "date") base.set("sort", sort);
  const href = (p: number) => {
    const q = new URLSearchParams(base);
    q.set("page", String(p));
    return `/shipments?${q.toString()}`;
  };
  const chips = FILTER_LIST_KEYS.filter((k) => !SHOWN.has(k) && filters[k]?.length);

  return (
    <>
      <PageHeader title="Shipment explorer" eyebrow="Drill to the evidence" headline={`${res.total.toLocaleString("en-IN")} shipments match the current filters.`} />
      <FilterBar
        search
        dates
        fields={[
          { key: "status", label: "Status", options: options.status },
          { key: "courier", label: "Courier", options: options.courier },
          { key: "payment", label: "Payment", options: options.payment },
          { key: "state", label: "State", options: options.state },
          { key: "category", label: "Category", options: options.category },
          { key: "valueBand", label: "Order value", options: options.valueBand },
        ]}
      />
      {chips.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-[13px]" aria-label="Active drill-down filters">
          <span className="text-muted">Drill-down:</span>
          {chips.map((k) => {
            const rest = new URLSearchParams(base);
            rest.delete(k);
            rest.delete("page");
            const vals = filters[k]!;
            return (
              <Link key={k} href={`/shipments?${rest.toString()}`} className="rounded border border-line bg-panel px-2 py-0.5 hover:bg-line-soft" title="Remove filter">
                {k}: {vals.slice(0, 3).map((v) => segLabel(k as DimKey, v)).join(", ")}{vals.length > 3 ? ` +${vals.length - 3}` : ""} ×
              </Link>
            );
          })}
        </div>
      )}
      <Panel>
        <DataTable
          caption="Shipments"
          rows={res.rows}
          rowKey={(r) => r.id}
          empty={<EmptyState title="No shipments match">Adjust or clear the filters.</EmptyState>}
          columns={[
            { key: "id", header: "Shipment", cell: (r) => <Link className="font-mono text-xs text-link hover:underline" href={`/shipments/${r.id}`}>{r.shipmentId}</Link> },
            { key: "d", header: "Ordered", cell: (r) => formatIST(r.orderDate, false) },
            { key: "c", header: "Courier", cell: (r) => r.courier ?? "—" },
            { key: "p", header: "Pincode", cell: (r) => <span className="font-mono text-xs">{r.pincode ?? "—"}</span> },
            { key: "pr", header: "Product", cell: (r) => r.product ?? "—" },
            { key: "pay", header: "Pay", cell: (r) => r.payment },
            { key: "v", header: "Value", align: "right", cell: (r) => formatINR(r.value, false) },
            { key: "s", header: "Status", cell: (r) => <Badge tone={STATUS_TONE[r.status] ?? "neutral"}>{r.status.replace("_", " ")}</Badge> },
            { key: "a", header: "Attempts", align: "right", cell: (r) => r.attempts },
            { key: "n", header: "NDR reason", cell: (r) => (r.ndrReason ? segLabel("ndrReason", r.ndrReason) : "—") },
          ]}
        />
        <nav aria-label="Pagination" className="mt-3 flex items-center justify-between text-[13px]">
          <span className="text-muted">Page {res.page} of {pages.toLocaleString("en-IN")}</span>
          <span className="flex gap-2">
            {res.page > 1 ? <Link className="rounded border border-line px-3 py-1 hover:bg-line-soft" href={href(res.page - 1)}>← Previous</Link> : <span className="px-3 py-1 text-muted/50">← Previous</span>}
            {res.page < pages ? <Link className="rounded border border-line px-3 py-1 hover:bg-line-soft" href={href(res.page + 1)}>Next →</Link> : <span className="px-3 py-1 text-muted/50">Next →</span>}
          </span>
        </nav>
      </Panel>
    </>
  );
}
