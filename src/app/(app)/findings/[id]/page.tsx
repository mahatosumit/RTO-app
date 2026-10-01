import Link from "next/link";
import { notFound } from "next/navigation";
import { Drawer } from "@/components/Drawer";
import { FindingActions } from "@/components/FindingActions";
import { Badge, DataTable, Kpi, LinkButton, PageHeader, Panel, SimulationBanner } from "@/components/ui";
import { filtersToParams, isUuid } from "@/lib/analytics/filters";
import { segLabel } from "@/lib/analytics/labels";
import { WEIGHTS } from "@/lib/analytics/rootcause";
import type { DimKey } from "@/lib/analytics/types";
import { aiStatus } from "@/lib/ai/provider";
import { formatINR, pct } from "@/lib/domain/cost";
import { formatIST } from "@/lib/domain/dates";
import { getFinding } from "@/lib/findings";
import { listShipments } from "@/lib/shipments";
import { latestSimulationForFinding } from "@/lib/simulations";
import { STATUS_TONE } from "@/lib/status";

export const dynamic = "force-dynamic";

type Row = { key: string; eligible: number; rto: number; rtoValue: number };
const GROUPS: Array<[string, DimKey, string]> = [["payment", "payment", "Payment type"], ["courier", "courier", "Courier"], ["category", "category", "Category"], ["ndrReason", "ndrReason", "NDR reason"], ["valueBand", "valueBand", "Order value"], ["state", "state", "State"]];

export default async function FindingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const f = await getFinding(id);
  if (!f) notFound();
  const ev = f.evidence as Record<string, any>;
  const fp = filtersToParams(f.filters);
  const rtoQuery = new URLSearchParams(fp);
  rtoQuery.set("status", "RTO");
  const [sample, sim] = await Promise.all([listShipments(f.datasetId, { ...f.filters, status: ["RTO"] }, 1, 8, "value"), latestSimulationForFinding(f.id)]);
  const groups = (ev.profile?.groups ?? {}) as Record<string, Row[]>;
  const totalRto = Number(ev.profile?.total?.rto ?? 0);

  return (
    <>
      <PageHeader
        eyebrow={`${f.code} · ${f.type === "ANOMALY" ? "Anomaly" : "Concentration"} finding`}
        title={f.title}
        headline={String(ev.summary ?? "")}
        actions={
          <>
            <LinkButton href={`/shipments?${rtoQuery.toString()}`} variant="primary">View shipments</LinkButton>
            <LinkButton href={`/simulator?finding=${f.id}&${fp.toString()}`}>Simulate intervention</LinkButton>
            <LinkButton href={`/api/reports/${f.id}?format=md`} variant="secondary" prefetch={false}>Export .md</LinkButton>
            <LinkButton href={`/api/reports/${f.id}?format=html`} prefetch={false}>Printable report</LinkButton>
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Severity" value={f.severity} tone={f.severity === "HIGH" ? "bad" : f.severity === "MEDIUM" ? "warn" : "neutral"} sub={`Score ${f.score}`} />
        <Kpi label="Affected RTO value" value={formatINR(f.affectedValue)} sub={formatINR(f.affectedValue, false)} />
        <Kpi label="Resolved shipments in segment" value={f.affectedShipments.toLocaleString("en-IN")} />
        <Kpi label="Investigation" value={f.status ?? "Not opened"} tone={f.status === "RESOLVED" ? "good" : "neutral"} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <Panel title="Evidence" actions={<Drawer triggerLabel="Raw evidence" title={`${f.code} evidence (JSON)`}><pre className="whitespace-pre-wrap break-words font-mono text-[11px]">{JSON.stringify(f.evidence, null, 2)}</pre></Drawer>}>
            {ev.kind === "CONCENTRATION" ? (
              <>
                <p className="mb-2 text-[13px] text-muted">Why this segment surfaced (associations, not proven causes):</p>
                <ul className="list-disc space-y-1 pl-5 text-[13px]">{(ev.candidate.reasons as string[]).map((r) => <li key={r}>{r}</li>)}</ul>
                <div className="mt-4">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-muted">Score breakdown — {ev.candidate.score}/100</p>
                  <ul className="space-y-1 text-[12px]">
                    {(Object.keys(WEIGHTS) as Array<keyof typeof WEIGHTS>).map((k) => (
                      <li key={k} className="grid grid-cols-[8rem_1fr_3.5rem] items-center gap-2">
                        <span>{{ excess: "Excess RTOs", lift: "Rate lift", value: "Value share", sample: "Sample size", recurrence: "Recurrence" }[k]} ({(WEIGHTS[k] * 100).toFixed(0)}%)</span>
                        <span className="h-1.5 rounded bg-line-soft" aria-hidden><span className="block h-full rounded bg-link" style={{ width: `${ev.candidate.components[k] * 100}%` }} /></span>
                        <span className="num text-right text-muted">{(ev.candidate.components[k] * WEIGHTS[k] * 100).toFixed(0)}/{(WEIGHTS[k] * 100).toFixed(0)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            ) : (
              <ul className="list-disc space-y-1 pl-5 text-[13px]">
                <li>Last 7 days: <strong className="num">{pct(ev.anomaly.current.rate)}</strong> (n={ev.anomaly.current.n}, {ev.anomaly.current.rto} RTOs)</li>
                <li>Baseline (prior {ev.anomaly.baseline.weeks} weeks): <strong className="num">{pct(ev.anomaly.baseline.rate)}</strong>{ev.anomaly.baseline.minWeekRate !== null && <> · weekly range {pct(ev.anomaly.baseline.minWeekRate)}–{pct(ev.anomaly.baseline.maxWeekRate)}</>}</li>
                <li>Ratio to baseline: <strong className="num">{ev.anomaly.ratio?.toFixed(2)}×</strong> · z-score {ev.anomaly.z?.toFixed(1)} · severity {ev.anomaly.severity}</li>
                <li className="text-muted">Method: binomial z-test of the last-7-day rate against the pooled baseline, with minimum-sample and minimum-ratio thresholds.</li>
              </ul>
            )}
          </Panel>

          <Panel title="Contributing factors" headline="Composition of this segment's RTOs — associated factors, not proven causes">
            <div className="grid gap-4 md:grid-cols-2">
              {GROUPS.map(([k, dim, label]) =>
                groups[k]?.length ? (
                  <div key={k}>
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-muted">{label}</p>
                    <DataTable
                      caption={label}
                      rows={groups[k]}
                      rowKey={(r) => r.key}
                      columns={[
                        { key: "k", header: label, cell: (r) => segLabel(dim, r.key) },
                        { key: "r", header: "RTOs", align: "right", cell: (r) => `${r.rto} (${pct(totalRto ? r.rto / totalRto : null, 0)})` },
                        { key: "rt", header: "Rate", align: "right", cell: (r) => pct(r.eligible ? r.rto / r.eligible : null) },
                      ]}
                    />
                  </div>
                ) : null,
              )}
            </div>
          </Panel>

          <Panel title="Affected shipments" headline="Highest-value RTO shipments in this segment" actions={<Link className="text-[13px] text-link hover:underline" href={`/shipments?${rtoQuery.toString()}`}>All {sample.total.toLocaleString("en-IN")} →</Link>}>
            <DataTable
              caption="Sample shipments"
              rows={sample.rows}
              rowKey={(r) => r.id}
              columns={[
                { key: "id", header: "Shipment", cell: (r) => <Link className="font-mono text-xs text-link hover:underline" href={`/shipments/${r.id}`}>{r.shipmentId}</Link> },
                { key: "c", header: "Courier", cell: (r) => r.courier ?? "—" },
                { key: "p", header: "Pincode", cell: (r) => r.pincode ?? "—" },
                { key: "pay", header: "Pay", cell: (r) => r.payment },
                { key: "v", header: "Value", align: "right", cell: (r) => formatINR(r.value, false) },
                { key: "s", header: "Status", cell: (r) => <Badge tone={STATUS_TONE[r.status] ?? "neutral"}>{r.status}</Badge> },
                { key: "n", header: "NDR reason", cell: (r) => (r.ndrReason ? segLabel("ndrReason", r.ndrReason) : "—") },
              ]}
            />
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Suggested investigation"><p className="text-[13px]">{f.suggestion}</p></Panel>
          <Panel title="Investigation workflow">
            <FindingActions findingId={f.id} investigationId={f.investigationId} status={f.status} notes={f.notes.map((n) => ({ id: n.id, body: n.body, createdAt: n.createdAt.toISOString() }))} aiConfigured={aiStatus().configured} />
          </Panel>
          <Panel title="Latest simulation">
            {sim ? (
              <div className="space-y-2 text-[13px]">
                <SimulationBanner />
                <p className="font-medium">{sim.result.label}</p>
                <p className="text-muted">Target: {sim.target.description}</p>
                <p className="num">RTO rate {pct(sim.result.current.rtoRate)} → <strong>{pct(sim.result.simulated.rtoRate)}</strong> (estimate)</p>
                <p className="num">Estimated net benefit: <strong>{formatINR(sim.result.diff.netBenefit)}</strong></p>
                <p className="text-xs text-muted">Saved {formatIST(sim.createdAt)}</p>
              </div>
            ) : (
              <p className="text-[13px] text-muted">No simulation saved for this finding. <Link className="text-link hover:underline" href={`/simulator?finding=${f.id}&${fp.toString()}`}>Run one →</Link></p>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
