import { FilterBar } from "@/components/FilterBar";
import { BarList } from "@/components/charts";
import { DataTable, Kpi, NoDataset, PageHeader, Panel } from "@/components/ui";
import { getActiveDataset } from "@/lib/active";
import { aggregateBy, aggregateTotal } from "@/lib/analytics/aggregate";
import { parseFilters } from "@/lib/analytics/filters";
import { segLabel } from "@/lib/analytics/labels";
import { getFilterOptions } from "@/lib/analytics/options";
import { computeMetrics } from "@/lib/analytics/metrics";
import { pct } from "@/lib/domain/cost";
import { ADDRESSABLE_REASONS, NDR_REASONS, type NdrReason } from "@/lib/domain/ndr";
import { getCostModel } from "@/lib/org";

export const dynamic = "force-dynamic";

export default async function NdrPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const ds = await getActiveDataset();
  if (!ds) return <NoDataset />;
  const filters = parseFilters(sp);
  const ndrFilters = { ...filters, ndrReason: [...NDR_REASONS] as string[] };
  const [total, reasons, attempts, couriers, options, cost] = await Promise.all([
    aggregateTotal(ds.id, filters),
    aggregateBy(ds.id, ["ndrReason"], ndrFilters, { orderBy: "shipments" }),
    aggregateBy(ds.id, ["attempts"], ndrFilters, { orderBy: "key" }),
    aggregateBy(ds.id, ["courier"], filters, { orderBy: "shipments" }),
    getFilterOptions(ds.id),
    getCostModel(),
  ]);
  const m = computeMetrics(total, cost);
  const ndrTotal = reasons.reduce((s, r) => s + r.shipments, 0);
  const top = reasons[0];
  const rec = (d: number, r: number) => (d + r > 0 ? d / (d + r) : null);

  const headline =
    m.ndrRate === null
      ? "No dispatched shipments match these filters."
      : `${pct(m.ndrRate)} of dispatched shipments had at least one failed delivery attempt; ${pct(m.ndrRecoveryRate)} of resolved NDR shipments were still delivered.${top && ndrTotal ? ` Most common recorded reason: ${segLabel("ndrReason", top.key)} (${pct(top.shipments / ndrTotal, 0)}).` : ""}`;

  return (
    <>
      <PageHeader title="NDR analysis" headline={headline} eyebrow="Why do delivery attempts fail?" />
      <FilterBar
        dates
        fields={[
          { key: "courier", label: "Courier", options: options.courier },
          { key: "payment", label: "Payment", options: options.payment },
          { key: "state", label: "State", options: options.state },
          { key: "category", label: "Category", options: options.category },
        ]}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="NDR rate" value={pct(m.ndrRate)} sub={`${total.ndrShipments.toLocaleString("en-IN")} shipments with ≥1 NDR`} />
        <Kpi label="NDR recovery" value={pct(m.ndrRecoveryRate)} tone="good" sub="Delivered after an NDR ÷ resolved NDR shipments" />
        <Kpi label="Open NDR" value={total.ndrOpen.toLocaleString("en-IN")} sub="Currently in NDR, unresolved" />
        <Kpi label="Avg attempts" value={m.avgAttempts === null ? "—" : m.avgAttempts.toFixed(2)} sub="Resolved shipments" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Recorded NDR reasons" headline="Share of NDR-affected shipments by normalised reason">
          {reasons.length === 0 ? (
            <p className="text-[13px] text-muted">No NDR reasons recorded for these filters.</p>
          ) : (
            <BarList ariaLabel="NDR reasons" rows={reasons.map((r) => ({ label: segLabel("ndrReason", r.key), value: r.shipments, display: `${pct(ndrTotal ? r.shipments / ndrTotal : null, 0)} · ${r.shipments}`, tone: (ADDRESSABLE_REASONS as readonly string[]).includes(r.key) ? "link" : "rust" }))} />
          )}
          <p className="mt-3 text-xs text-muted">Blue bars = operationally addressable reasons (verification or re-attempt may help). Reasons are normalised from free text with deterministic keyword rules.</p>
        </Panel>
        <Panel title="Outcome by reason" headline="Which failure reasons still end in delivery?">
          <DataTable
            caption="NDR reason outcomes"
            rows={reasons}
            rowKey={(r) => r.key}
            columns={[
              { key: "k", header: "Reason", cell: (r) => segLabel("ndrReason", r.key) },
              { key: "s", header: "Shipments", align: "right", cell: (r) => r.shipments },
              { key: "d", header: "Delivered", align: "right", cell: (r) => r.delivered },
              { key: "r", header: "RTO", align: "right", cell: (r) => r.rto },
              { key: "rc", header: "Recovery", align: "right", cell: (r) => pct(rec(r.delivered, r.rto), 0) },
            ]}
          />
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="By attempts" headline="How many attempts do NDR shipments get before they resolve?">
          <DataTable
            caption="Outcome by attempts"
            rows={attempts}
            rowKey={(r) => r.key}
            columns={[
              { key: "k", header: "Attempts", cell: (r) => segLabel("attempts", r.key) },
              { key: "s", header: "Shipments", align: "right", cell: (r) => r.shipments },
              { key: "d", header: "Delivered", align: "right", cell: (r) => r.delivered },
              { key: "r", header: "RTO", align: "right", cell: (r) => r.rto },
              { key: "rc", header: "Delivered share", align: "right", cell: (r) => pct(rec(r.delivered, r.rto), 0) },
            ]}
          />
        </Panel>
        <Panel title="By courier" headline="NDR exposure and recovery differ by courier — context matters">
          <DataTable
            caption="NDR by courier"
            rows={couriers}
            rowKey={(r) => r.key}
            columns={[
              { key: "k", header: "Courier", cell: (r) => r.key },
              { key: "s", header: "Dispatched", align: "right", cell: (r) => r.dispatched.toLocaleString("en-IN") },
              { key: "n", header: "NDR rate", align: "right", cell: (r) => pct(r.dispatched ? r.ndrShipments / r.dispatched : null) },
              { key: "rc", header: "NDR recovery", align: "right", cell: (r) => pct(r.ndrResolved ? r.ndrDelivered / r.ndrResolved : null, 0) },
            ]}
          />
        </Panel>
      </div>
      <p className="mt-3 text-xs text-muted">Addressable reasons: {(ADDRESSABLE_REASONS as readonly NdrReason[]).map((r) => segLabel("ndrReason", r)).join(", ")}.</p>
    </>
  );
}
