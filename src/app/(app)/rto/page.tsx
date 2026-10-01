import Link from "next/link";
import { FilterBar } from "@/components/FilterBar";
import { BarList, TrendChart, heat } from "@/components/charts";
import { Badge, DataTable, NoDataset, PageHeader, Panel, Tabs } from "@/components/ui";
import { getActiveDataset } from "@/lib/active";
import { aggregateBy, aggregateTotal } from "@/lib/analytics/aggregate";
import { filtersToParams, parseFilters } from "@/lib/analytics/filters";
import { segLabel } from "@/lib/analytics/labels";
import { getFilterOptions } from "@/lib/analytics/options";
import { computeMetrics, MIN_SAMPLE } from "@/lib/analytics/metrics";
import { DIM_LABELS, type DimKey } from "@/lib/analytics/types";
import { formatINR, pct } from "@/lib/domain/cost";
import { getCostModel } from "@/lib/org";

export const dynamic = "force-dynamic";

const TABS: DimKey[] = ["courier", "pincode", "pin3", "product", "category", "valueBand", "week", "attempts", "ndrReason", "state", "region", "payment", "repeat"];

function drill(dim: DimKey, key: string, base: URLSearchParams): string {
  const p = new URLSearchParams(base);
  p.set("status", "RTO");
  if (dim === "week") {
    p.set("from", key);
    const d = new Date(`${key}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 6);
    p.set("to", d.toISOString().slice(0, 10));
  } else if (dim !== "month" && dim !== "day") p.set(dim, key);
  return `/shipments?${p.toString()}`;
}

export default async function RtoPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const ds = await getActiveDataset();
  if (!ds) return <NoDataset />;
  const dim = (TABS as string[]).includes(String(sp.dim)) ? (sp.dim as DimKey) : "courier";
  const filters = parseFilters(sp);
  const [rows, total, options, cost] = await Promise.all([
    aggregateBy(ds.id, [dim], filters, { orderBy: dim === "week" ? "key" : "rto", limit: dim === "week" ? 60 : 300 }),
    aggregateTotal(ds.id, filters),
    getFilterOptions(ds.id),
    getCostModel(),
  ]);
  const baseline = total.eligible > 0 ? total.rto / total.eligible : null;
  const fp = filtersToParams(filters);
  const isTime = dim === "week";
  const ranked = rows.filter((r) => r.rto > 0 && !["(missing)", "(unknown)", "NONE"].includes(r.key));
  const top3 = ranked.slice(0, 3);
  const top3Share = total.rto > 0 ? top3.reduce((s, r) => s + r.rto, 0) / total.rto : 0;
  const hottest = rows.filter((r) => r.eligible >= MIN_SAMPLE && r.rto > 0).sort((a, b) => b.rto / b.eligible - a.rto / a.eligible)[0];

  let headline: string;
  if (total.eligible === 0) headline = "No resolved shipments match these filters.";
  else if (isTime) {
    const last = rows[rows.length - 1];
    headline = last ? `RTO rate in the latest week (${last.key}) was ${pct(last.eligible ? last.rto / last.eligible : null)} versus ${pct(baseline)} overall.` : "No weekly data.";
  } else if (top3.length >= 2) {
    headline = `${top3.length} ${DIM_LABELS[dim].toLowerCase()} segments (${top3.map((r) => segLabel(dim, r.key)).join(", ")}) hold ${pct(top3Share, 0)} of all RTOs${hottest ? `; the highest rate with adequate sample is ${segLabel(dim, hottest.key)} at ${pct(hottest.rto / hottest.eligible)}.` : "."}`;
  } else headline = `RTO rate is ${pct(baseline)} across ${total.eligible.toLocaleString("en-IN")} resolved shipments.`;

  const tabHref = (d: DimKey) => {
    const p = new URLSearchParams(fp);
    p.set("dim", d);
    return `/rto?${p.toString()}`;
  };

  return (
    <>
      <PageHeader title="RTO analysis" headline={headline} eyebrow="Where are orders failing?" />
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
      <Tabs label="Break down by" items={TABS.map((d) => ({ href: tabHref(d), label: DIM_LABELS[d], active: d === dim }))} />

      {isTime ? (
        <Panel title="RTO rate by order week" className="mb-4">
          <TrendChart ariaLabel="Weekly RTO rate" baseline={baseline} points={rows.map((r) => ({ label: r.key, rate: r.eligible ? r.rto / r.eligible : null, n: r.eligible }))} />
        </Panel>
      ) : (
        ranked.length > 0 && (
          <Panel title={`Share of all RTOs by ${DIM_LABELS[dim].toLowerCase()}`} className="mb-4">
            <BarList
              ariaLabel={`RTO share by ${dim}`}
              rows={ranked.slice(0, 10).map((r) => ({ label: segLabel(dim, r.key), value: r.rto, display: `${pct(total.rto ? r.rto / total.rto : null)} · ${r.rto}`, sub: r.eligible < MIN_SAMPLE ? "low sample" : undefined }))}
            />
          </Panel>
        )
      )}

      <Panel title="Segment detail" headline={`Baseline RTO rate ${pct(baseline)} · ${total.rto.toLocaleString("en-IN")} RTOs · RTO rate = RTO ÷ resolved shipments`}>
        <DataTable
          caption={`RTO by ${dim}`}
          rows={rows}
          rowKey={(r) => r.key}
          columns={[
            { key: "k", header: DIM_LABELS[dim], cell: (r) => <Link className="font-medium text-link hover:underline" href={drill(dim, r.key, fp)}>{segLabel(dim, r.key)}</Link> },
            { key: "s", header: "Shipments", align: "right", cell: (r) => r.shipments.toLocaleString("en-IN") },
            { key: "e", header: "Resolved", align: "right", cell: (r) => r.eligible.toLocaleString("en-IN") },
            { key: "r", header: "RTOs", align: "right", cell: (r) => r.rto.toLocaleString("en-IN") },
            {
              key: "rt", header: "RTO rate", align: "right",
              cell: (r) => {
                const rate = r.eligible ? r.rto / r.eligible : null;
                return <span className="rounded px-1.5 py-0.5" style={{ background: heat(rate, baseline, r.eligible) }}>{pct(rate)}</span>;
              },
            },
            { key: "l", header: "vs baseline", align: "right", cell: (r) => (r.eligible && baseline ? `${(r.rto / r.eligible / baseline).toFixed(2)}×` : "—") },
            { key: "c", header: "COD RTO", align: "right", cell: (r) => pct(computeMetrics(r, cost).codRtoRate) },
            { key: "p", header: "Prepaid RTO", align: "right", cell: (r) => pct(computeMetrics(r, cost).prepaidRtoRate) },
            { key: "v", header: "RTO value", align: "right", cell: (r) => formatINR(r.rtoValue) },
            { key: "ec", header: "Est. RTO cost", align: "right", cell: (r) => formatINR(computeMetrics(r, cost).rtoCost) },
            { key: "f", header: "", cell: (r) => (r.eligible < MIN_SAMPLE ? <Badge title={`Fewer than ${MIN_SAMPLE} resolved shipments`}>low sample</Badge> : null) },
          ]}
        />
      </Panel>
    </>
  );
}
