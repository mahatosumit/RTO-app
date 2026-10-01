import Link from "next/link";
import { FilterBar } from "@/components/FilterBar";
import { heat } from "@/components/charts";
import { DataTable, NoDataset, PageHeader, Panel } from "@/components/ui";
import { getActiveDataset } from "@/lib/active";
import { aggregateBy, aggregateTotal } from "@/lib/analytics/aggregate";
import { parseFilters } from "@/lib/analytics/filters";
import { getFilterOptions } from "@/lib/analytics/options";
import { computeMetrics, MIN_SAMPLE } from "@/lib/analytics/metrics";
import type { AggRow } from "@/lib/analytics/types";
import { formatINR, pct } from "@/lib/domain/cost";
import { geoFromPincode } from "@/lib/domain/geo";
import { getCostModel } from "@/lib/org";

export const dynamic = "force-dynamic";

export default async function GeoPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const ds = await getActiveDataset();
  if (!ds) return <NoDataset />;
  const filters = parseFilters(sp);
  const [total, regions, states, clusters, pins, options, cost] = await Promise.all([
    aggregateTotal(ds.id, filters),
    aggregateBy(ds.id, ["region"], filters, { orderBy: "rto" }),
    aggregateBy(ds.id, ["state"], filters, { orderBy: "rto", limit: 40 }),
    aggregateBy(ds.id, ["pin3"], filters, { orderBy: "rto", limit: 15 }),
    aggregateBy(ds.id, ["pincode"], filters, { orderBy: "rto", limit: 25 }),
    getFilterOptions(ds.id),
    getCostModel(),
  ]);
  const base = total.eligible ? total.rto / total.eligible : null;
  const pinList = pins.map((p) => p.key).filter((k) => k !== "(missing)");
  const mixRows = pinList.length ? await aggregateBy(ds.id, ["pincode", "courier"], { ...filters, pincode: pinList }, { limit: 3000 }) : [];
  const mix = new Map<string, Array<{ c: string; n: number }>>();
  for (const r of mixRows) {
    const [pin, courier] = r.key.split(" | ");
    mix.set(pin, [...(mix.get(pin) ?? []), { c: courier, n: r.shipments }]);
  }
  const realClusters = clusters.filter((c) => c.key !== "(missing)");
  const top3 = realClusters.slice(0, 3);
  const share = total.rto ? top3.reduce((s, c) => s + c.rto, 0) / total.rto : 0;
  const missing = clusters.find((c) => c.key === "(missing)");

  const rateCell = (r: AggRow) => {
    const rate = r.eligible ? r.rto / r.eligible : null;
    return <span className="rounded px-1.5 py-0.5" style={{ background: heat(rate, base, r.eligible) }}>{pct(rate)}</span>;
  };
  const link = (param: string, key: string) => `/shipments?${param}=${encodeURIComponent(key)}&status=RTO`;

  return (
    <>
      <PageHeader
        title="Geographic analysis"
        eyebrow="Where are they failing?"
        headline={top3.length ? `${top3.length} pincode clusters (${top3.map((c) => c.key + "xxx").join(", ")}) hold ${pct(share, 0)} of all RTOs.` : "No geographic concentration detected with the current filters."}
      />
      <FilterBar dates fields={[{ key: "courier", label: "Courier", options: options.courier }, { key: "payment", label: "Payment", options: options.payment }, { key: "category", label: "Category", options: options.category }]} />
      {missing && <p className="mb-3 rounded border border-warn/40 bg-warn-soft px-3 py-2 text-[13px]">{missing.shipments.toLocaleString("en-IN")} shipments have no valid pincode and cannot be placed geographically.</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Regions" headline="RTO rate by region">
          <DataTable caption="Regions" rows={regions} rowKey={(r) => r.key} columns={[
            { key: "k", header: "Region", cell: (r) => <Link className="text-link hover:underline" href={link("region", r.key)}>{r.key}</Link> },
            { key: "s", header: "Shipments", align: "right", cell: (r) => r.shipments.toLocaleString("en-IN") },
            { key: "r", header: "RTOs", align: "right", cell: (r) => r.rto },
            { key: "rt", header: "RTO rate", align: "right", cell: rateCell },
          ]} />
        </Panel>
        <Panel title="Pincode clusters" headline="First three digits of the pincode (sorting-hub level)">
          <DataTable caption="Pincode clusters" rows={clusters} rowKey={(r) => r.key} columns={[
            { key: "k", header: "Cluster", cell: (r) => <Link className="text-link hover:underline" href={link("pin3", r.key)}>{r.key === "(missing)" ? r.key : `${r.key}xxx`}</Link> },
            { key: "s", header: "Shipments", align: "right", cell: (r) => r.shipments.toLocaleString("en-IN") },
            { key: "r", header: "RTOs", align: "right", cell: (r) => r.rto },
            { key: "rt", header: "RTO rate", align: "right", cell: rateCell },
            { key: "cs", header: "COD share of RTOs", align: "right", cell: (r) => pct(r.rto ? r.codRto / r.rto : null, 0) },
          ]} />
        </Panel>
      </div>

      <Panel className="mt-4" title="Pincodes" headline="Top 25 pincodes by RTO count" actions={<span className="text-xs text-muted">Shaded = rate above 1.1× baseline with n ≥ {MIN_SAMPLE}</span>}>
        <DataTable
          caption="Pincodes"
          rows={pins}
          rowKey={(r) => r.key}
          columns={[
            { key: "k", header: "Pincode", cell: (r) => <Link className="font-mono text-link hover:underline" href={link("pincode", r.key)}>{r.key}</Link> },
            { key: "st", header: "State", cell: (r) => (r.key === "(missing)" ? "—" : geoFromPincode(r.key).state ?? "—") },
            { key: "s", header: "Shipments", align: "right", cell: (r) => r.shipments },
            { key: "d", header: "Delivered", align: "right", cell: (r) => r.delivered },
            { key: "n", header: "NDR", align: "right", cell: (r) => r.ndrShipments },
            { key: "r", header: "RTO", align: "right", cell: (r) => r.rto },
            { key: "rt", header: "RTO rate", align: "right", cell: rateCell },
            { key: "a", header: "Avg attempts", align: "right", cell: (r) => (r.avgAttempts === null ? "—" : r.avgAttempts.toFixed(1)) },
            { key: "m", header: "Courier mix", cell: (r) => (mix.get(r.key) ?? []).sort((a, b) => b.n - a.n).slice(0, 3).map((x) => `${x.c} ${Math.round((x.n / r.shipments) * 100)}%`).join(" · ") },
            { key: "c", header: "COD share", align: "right", cell: (r) => pct(r.shipments ? r.codShipments / r.shipments : null, 0) },
            { key: "v", header: "Avg order value", align: "right", cell: (r) => formatINR(r.shipments ? r.totalValue / r.shipments : 0) },
            { key: "ec", header: "Est. RTO cost", align: "right", cell: (r) => formatINR(computeMetrics(r, cost).rtoCost) },
          ]}
        />
      </Panel>

      <Panel className="mt-4" title="States" headline="RTO rate by state">
        <DataTable caption="States" rows={states} rowKey={(r) => r.key} columns={[
          { key: "k", header: "State", cell: (r) => <Link className="text-link hover:underline" href={link("state", r.key)}>{r.key}</Link> },
          { key: "s", header: "Shipments", align: "right", cell: (r) => r.shipments.toLocaleString("en-IN") },
          { key: "r", header: "RTOs", align: "right", cell: (r) => r.rto },
          { key: "rt", header: "RTO rate", align: "right", cell: rateCell },
          { key: "v", header: "RTO value", align: "right", cell: (r) => formatINR(r.rtoValue) },
        ]} />
      </Panel>
    </>
  );
}
