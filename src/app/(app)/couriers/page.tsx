import { FilterBar } from "@/components/FilterBar";
import { heat } from "@/components/charts";
import { Alert, DataTable, NoDataset, PageHeader, Panel } from "@/components/ui";
import { getActiveDataset } from "@/lib/active";
import { aggregateBy, aggregateTotal } from "@/lib/analytics/aggregate";
import { parseFilters } from "@/lib/analytics/filters";
import { getFilterOptions } from "@/lib/analytics/options";
import { MIN_SAMPLE, rate, wilson } from "@/lib/analytics/metrics";
import { pct } from "@/lib/domain/cost";

export const dynamic = "force-dynamic";

export default async function CouriersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const ds = await getActiveDataset();
  if (!ds) return <NoDataset />;
  const filters = parseFilters(sp);
  const [rows, hv, matrix, total, options] = await Promise.all([
    aggregateBy(ds.id, ["courier"], filters, { orderBy: "shipments" }),
    aggregateBy(ds.id, ["courier"], { ...filters, valueBand: ["2,000–3,999", "4,000+"] }, { orderBy: "shipments" }),
    aggregateBy(ds.id, ["courier", "region"], filters, { limit: 500 }),
    aggregateTotal(ds.id, filters),
    getFilterOptions(ds.id),
  ]);
  const base = rate(total.rto, total.eligible);
  const hvMap = new Map(hv.map((r) => [r.key, r]));
  const couriers = rows.map((r) => r.key);
  const regions = [...new Set(matrix.map((r) => r.key.split(" | ")[1]))].filter((r) => r !== "(unknown)").sort();
  const cell = new Map(matrix.map((r) => [r.key, r]));

  // Largest context-dependent spread between couriers (adequate samples only).
  let spread: { region: string; lo: { c: string; r: number }; hi: { c: string; r: number } } | null = null;
  for (const region of regions) {
    const items = couriers.map((c) => ({ c, row: cell.get(`${c} | ${region}`) })).filter((x) => x.row && x.row.eligible >= MIN_SAMPLE).map((x) => ({ c: x.c, r: x.row!.rto / x.row!.eligible }));
    if (items.length < 2) continue;
    items.sort((a, b) => a.r - b.r);
    const cand = { region, lo: items[0], hi: items[items.length - 1] };
    if (!spread || cand.hi.r - cand.lo.r > spread.hi.r - spread.lo.r) spread = cand;
  }
  const overallRates = rows.filter((r) => r.eligible >= MIN_SAMPLE).map((r) => r.rto / r.eligible);

  return (
    <>
      <PageHeader
        title="Courier analysis"
        eyebrow="How do couriers perform in context?"
        headline={
          spread
            ? `In ${spread.region}, courier RTO rates range from ${pct(spread.lo.r)} (${spread.lo.c}) to ${pct(spread.hi.r)} (${spread.hi.c}) — performance depends on region, payment type and order value.`
            : overallRates.length > 1
              ? `Courier RTO rates range from ${pct(Math.min(...overallRates))} to ${pct(Math.max(...overallRates))} under the current filters.`
              : "Not enough resolved shipments per courier under the current filters."
        }
      />
      <div className="mb-4">
        <Alert tone="info" title="No single “best courier”">Differences below are observed in your data for the chosen context and are not guarantees. Low-sample cells (n &lt; {MIN_SAMPLE}) are greyed and excluded from comparisons.</Alert>
      </div>
      <FilterBar dates fields={[{ key: "payment", label: "Payment", options: options.payment }, { key: "state", label: "State", options: options.state }, { key: "region", label: "Region", options: options.region }, { key: "category", label: "Category", options: options.category }, { key: "valueBand", label: "Order value", options: options.valueBand }]} />

      <Panel title="Comparison" headline={`Baseline RTO rate ${pct(base)} under current filters`}>
        <DataTable
          caption="Courier comparison"
          rows={rows}
          rowKey={(r) => r.key}
          columns={[
            { key: "k", header: "Courier", cell: (r) => <span className="font-medium">{r.key}</span> },
            { key: "s", header: "Volume", align: "right", cell: (r) => r.shipments.toLocaleString("en-IN") },
            { key: "dr", header: "Delivery rate", align: "right", cell: (r) => pct(rate(r.delivered, r.eligible)) },
            {
              key: "rt", header: "RTO rate (95% range)", align: "right",
              cell: (r) => {
                const w = wilson(r.rto, r.eligible);
                return (
                  <span>
                    <span className="rounded px-1.5 py-0.5" style={{ background: heat(rate(r.rto, r.eligible), base, r.eligible) }}>{pct(rate(r.rto, r.eligible))}</span>
                    {w && <span className="ml-1 text-xs text-muted">{pct(w.lower, 0)}–{pct(w.upper, 0)}</span>}
                  </span>
                );
              },
            },
            { key: "n", header: "NDR rate", align: "right", cell: (r) => pct(rate(r.ndrShipments, r.dispatched)) },
            { key: "a", header: "Avg attempts", align: "right", cell: (r) => (r.avgAttempts === null ? "—" : r.avgAttempts.toFixed(2)) },
            { key: "t", header: "Avg delivery time", align: "right", cell: (r) => (r.avgTransitHours === null ? "—" : `${(r.avgTransitHours / 24).toFixed(1)} d`) },
            { key: "c", header: "COD RTO", align: "right", cell: (r) => pct(rate(r.codRto, r.codEligible)) },
            { key: "p", header: "Prepaid RTO", align: "right", cell: (r) => pct(rate(r.prepaidRto, r.prepaidEligible)) },
            { key: "h", header: "High-value (≥₹2,000) RTO", align: "right", cell: (r) => { const h = hvMap.get(r.key); return h && h.eligible ? `${pct(rate(h.rto, h.eligible))} (n=${h.eligible})` : "—"; } },
          ]}
        />
      </Panel>

      <Panel className="mt-4" title="Courier × region" headline="RTO rate and resolved shipments (n) by courier and destination region">
        {regions.length === 0 ? (
          <p className="text-[13px] text-muted">No regional data available.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <caption className="sr-only">RTO rate by courier and region</caption>
              <thead>
                <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-muted">
                  <th scope="col" className="px-2 py-2">Courier</th>
                  {regions.map((g) => <th key={g} scope="col" className="px-2 py-2 text-right">{g}</th>)}
                </tr>
              </thead>
              <tbody>
                {couriers.map((c) => (
                  <tr key={c} className="border-b border-line-soft">
                    <th scope="row" className="px-2 py-1.5 text-left font-medium">{c}</th>
                    {regions.map((g) => {
                      const r = cell.get(`${c} | ${g}`);
                      const low = !r || r.eligible < MIN_SAMPLE;
                      return (
                        <td key={g} className={`num px-2 py-1.5 text-right ${low ? "text-muted/60" : ""}`} style={{ background: r ? heat(rate(r.rto, r.eligible), base, r.eligible) : undefined }}>
                          {r && r.eligible ? `${pct(rate(r.rto, r.eligible))} ` : "—"}
                          <span className="text-xs text-muted">{r ? `n=${r.eligible}` : ""}</span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
