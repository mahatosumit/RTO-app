import Link from "next/link";
import { FilterBar } from "@/components/FilterBar";
import { BarList, heat } from "@/components/charts";
import { Badge, DataTable, Kpi, NoDataset, PageHeader, Panel } from "@/components/ui";
import { getActiveDataset } from "@/lib/active";
import { aggregateBy, aggregateTotal } from "@/lib/analytics/aggregate";
import { filtersToParams, parseFilters } from "@/lib/analytics/filters";
import { getFilterOptions } from "@/lib/analytics/options";
import { computeMetrics, MIN_SAMPLE } from "@/lib/analytics/metrics";
import type { AggRow } from "@/lib/analytics/types";
import { formatINR, pct } from "@/lib/domain/cost";
import { getCostModel } from "@/lib/org";

export const dynamic = "force-dynamic";

export default async function ProductsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const ds = await getActiveDataset();
  if (!ds) return <NoDataset />;
  const filters = parseFilters(sp);
  const [products, categories, total, options, cost] = await Promise.all([
    aggregateBy(ds.id, ["product"], filters, { orderBy: "rto", limit: 200 }),
    aggregateBy(ds.id, ["category"], filters, { orderBy: "rto", limit: 100 }),
    aggregateTotal(ds.id, filters),
    getFilterOptions(ds.id),
    getCostModel(),
  ]);
  const baseline = total.eligible > 0 ? total.rto / total.eligible : null;
  const fp = filtersToParams(filters);
  const productRows = products.filter((p) => p.key !== "(unknown)");
  const top3 = productRows.slice(0, 3);
  const top3Share = total.rto > 0 ? top3.reduce((s, p) => s + p.rto, 0) / total.rto : 0;
  const hottest = productRows.filter((p) => p.eligible >= MIN_SAMPLE).sort((a, b) => b.rto / b.eligible - a.rto / a.eligible)[0];
  const worstValue = [...productRows].sort((a, b) => b.rtoValue - a.rtoValue)[0];

  const withFilter = (key: string, value: string) => {
    const p = new URLSearchParams(fp);
    p.set(key, value);
    p.set("status", "RTO");
    return `/shipments?${p.toString()}`;
  };
  const drill = (key: string) => withFilter("product", key);
  const drillCategory = (key: string) => withFilter("category", key);
  const rateCell = (r: AggRow) => {
    const rate = r.eligible ? r.rto / r.eligible : null;
    return <span className="rounded px-1.5 py-0.5" style={{ background: heat(rate, baseline, r.eligible) }}>{pct(rate)}</span>;
  };

  return (
    <>
      <PageHeader
        eyebrow="Investigate"
        title="Product analysis"
        headline={
          total.eligible === 0
            ? "No resolved shipments match these filters."
            : top3.length
              ? `${top3.length} product${top3.length === 1 ? "" : "s"} (${top3.map((p) => p.key).join(", ")}) hold ${pct(top3Share, 0)} of all RTOs${hottest ? `; the highest rate with adequate sample is ${hottest.key} at ${pct(hottest.rto / hottest.eligible)}` : ""}.`
              : `RTO rate is ${pct(baseline)} across ${total.eligible.toLocaleString("en-IN")} resolved shipments.`
        }
      />
      <FilterBar
        dates
        fields={[
          { key: "courier", label: "Courier", options: options.courier },
          { key: "payment", label: "Payment", options: options.payment },
          { key: "state", label: "State", options: options.state },
          { key: "category", label: "Category", options: options.category },
          { key: "valueBand", label: "Order value", options: options.valueBand },
        ]}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Products with RTOs" value={productRows.filter((p) => p.rto > 0).length.toLocaleString("en-IN")} sub={`${productRows.length.toLocaleString("en-IN")} products under filters`} />
        <Kpi label="Baseline RTO rate" value={pct(baseline)} sub={`${total.rto.toLocaleString("en-IN")} RTOs / ${total.eligible.toLocaleString("en-IN")} resolved`} />
        <Kpi label="Top-3 RTO share" value={pct(top3Share, 0)} sub={top3.map((p) => p.key).join(", ") || "—"} tone="warn" />
        <Kpi label="Largest RTO value" value={formatINR(worstValue?.rtoValue ?? 0)} sub={worstValue ? worstValue.key : "—"} tone="bad" />
      </div>

      {productRows.length > 0 && (
        <Panel className="mt-4" title="Share of all RTOs by product" headline="Where the RTO volume concentrates">
          <BarList
            ariaLabel="RTO share by product"
            rows={productRows.slice(0, 10).map((p) => ({ label: p.key, value: p.rto, display: `${pct(total.rto ? p.rto / total.rto : null)} · ${p.rto}`, sub: p.eligible < MIN_SAMPLE ? "low sample" : undefined }))}
          />
        </Panel>
      )}

      <Panel className="mt-4" title="Product detail" headline={`Baseline RTO rate ${pct(baseline)} · shaded = above 1.1× baseline with n ≥ ${MIN_SAMPLE}`}>
        <DataTable
          caption="RTO by product"
          dense
          rows={productRows}
          rowKey={(r) => r.key}
          empty={<p className="text-[13px] text-muted">No products under the current filters.</p>}
          columns={[
            { key: "k", header: "Product", cell: (r) => <Link className="font-medium text-link hover:underline" href={drill(r.key)}>{r.key}</Link> },
            { key: "s", header: "Shipments", align: "right", cell: (r) => r.shipments.toLocaleString("en-IN") },
            { key: "e", header: "Resolved", align: "right", cell: (r) => r.eligible.toLocaleString("en-IN") },
            { key: "r", header: "RTOs", align: "right", cell: (r) => r.rto.toLocaleString("en-IN") },
            { key: "rt", header: "RTO rate", align: "right", cell: rateCell },
            { key: "l", header: "vs baseline", align: "right", cell: (r) => (r.eligible && baseline ? `${(r.rto / r.eligible / baseline).toFixed(2)}×` : "—") },
            { key: "c", header: "COD RTO", align: "right", cell: (r) => pct(computeMetrics(r, cost).codRtoRate) },
            { key: "p", header: "Prepaid RTO", align: "right", cell: (r) => pct(computeMetrics(r, cost).prepaidRtoRate) },
            { key: "v", header: "RTO value", align: "right", cell: (r) => formatINR(r.rtoValue) },
            { key: "ec", header: "Est. RTO cost", align: "right", cell: (r) => formatINR(computeMetrics(r, cost).rtoCost) },
            { key: "f", header: "", cell: (r) => (r.eligible < MIN_SAMPLE && r.rto > 0 ? <Badge title={`Fewer than ${MIN_SAMPLE} resolved shipments`}>low sample</Badge> : null) },
          ]}
        />
      </Panel>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Categories" headline="RTO rate by product category">
          <DataTable
            caption="RTO by category"
            rows={categories}
            rowKey={(r) => r.key}
            empty={<p className="text-[13px] text-muted">No categories under the current filters.</p>}
            columns={[
              { key: "k", header: "Category", cell: (r) => <Link className="font-medium text-link hover:underline" href={drillCategory(r.key)}>{r.key}</Link> },
              { key: "s", header: "Shipments", align: "right", cell: (r) => r.shipments.toLocaleString("en-IN") },
              { key: "r", header: "RTOs", align: "right", cell: (r) => r.rto.toLocaleString("en-IN") },
              { key: "rt", header: "RTO rate", align: "right", cell: rateCell },
              { key: "v", header: "RTO value", align: "right", cell: (r) => formatINR(r.rtoValue) },
            ]}
          />
        </Panel>
        <Panel title="Share of all RTOs by category" headline="Category concentration">
          {categories.length === 0 ? (
            <p className="text-[13px] text-muted">No category data.</p>
          ) : (
            <BarList
              ariaLabel="RTO share by category"
              rows={categories.slice(0, 10).map((c) => ({ label: c.key, value: c.rto, display: `${pct(total.rto ? c.rto / total.rto : null)} · ${c.rto}`, sub: c.eligible < MIN_SAMPLE ? "low sample" : undefined }))}
            />
          )}
        </Panel>
      </div>

      <p className="mt-3 text-xs text-muted">RTO rate = RTO ÷ resolved shipments (delivered + RTO + lost). Products with fewer than {MIN_SAMPLE} resolved shipments are flagged low sample and excluded from the &ldquo;highest rate&rdquo; statement. Concentration describes association, not proven cause.</p>
    </>
  );
}
