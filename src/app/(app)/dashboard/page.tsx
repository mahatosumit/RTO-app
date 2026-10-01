import Link from "next/link";
import { GenerateFindingsButton } from "@/components/GenerateFindingsButton";
import { TrendChart } from "@/components/charts";
import { Alert, Badge, DataTable, EmptyState, Kpi, LinkButton, NoDataset, PageHeader, Panel, SeverityBadge } from "@/components/ui";
import { getActiveDataset } from "@/lib/active";
import { filtersToQuery } from "@/lib/analytics/filters";
import { getDashboard, type AnomalyItem } from "@/lib/analytics/insights";
import { formatINR, pct } from "@/lib/domain/cost";
import { formatIST } from "@/lib/domain/dates";
import { listFindings } from "@/lib/findings";
import { asOfString, getCostModel } from "@/lib/org";

export const dynamic = "force-dynamic";

const fmt = (n: number) => n.toLocaleString("en-IN");

function shiftDays(day: string, delta: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** 7-day RTO shipments matching this segment — the drill-down from an anomaly. */
function investigateHref(a: AnomalyItem, asOf: string): string {
  return `/shipments${filtersToQuery({ ...a.filters, status: ["RTO"], from: shiftDays(asOf, -6), to: asOf })}`;
}

function SeverityDot({ severity }: { severity: string }) {
  const cls = severity === "CRITICAL" ? "bg-rust" : severity === "WARNING" || severity === "MEDIUM" ? "bg-warn" : "bg-muted";
  return <span aria-hidden className={`inline-block h-2 w-2 rounded-full ${cls}`} />;
}

export default async function DashboardPage() {
  const ds = await getActiveDataset();
  if (!ds) return <NoDataset />;
  const asOf = asOfString(ds);
  const cost = await getCostModel();
  const [d, findings] = await Promise.all([getDashboard(ds, asOf, cost), listFindings(ds.id)]);
  const m = d.metrics;
  const overall = d.overall;
  const res = overall?.result ?? null;
  const overallFinding = findings.find((f) => f.dedupeKey === "A:all:all");
  const segmentAnomalies = d.anomalies.filter((a) => a.dims.length > 0);

  if (m.shipments === 0) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <EmptyState title="This dataset has no shipments" action={<LinkButton href="/import" variant="primary">Import data</LinkButton>}>Import a CSV to see analysis.</EmptyState>
      </>
    );
  }

  const flagged = res?.flagged ?? false;
  const heroTone = flagged && res?.severity === "CRITICAL" ? "border-rust/50" : flagged ? "border-warn/50" : "border-line";

  return (
    <>
      <PageHeader
        eyebrow={`Data as of ${formatIST(d.dataset.asOf, false)}`}
        title="Dashboard"
        headline={
          m.rtoRate === null
            ? "No shipments have a resolved outcome yet, so rates cannot be computed."
            : `${pct(m.rtoRate)} of resolved shipments ended in RTO (${fmt(m.rto)} of ${fmt(m.eligible)}), tying up ${formatINR(m.rtoValue)} of order value.`
        }
        actions={<LinkButton href="/reports" variant="secondary">Export report</LinkButton>}
      />

      {/* RTO condition — the dominant reading on the page. */}
      <section aria-label="Current RTO condition" className={`rounded border bg-panel ${heroTone}`}>
        <div className="grid gap-5 p-5 lg:grid-cols-[1.35fr_1fr]">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">RTO rate · last 7 days</p>
            <div className="mt-1 flex flex-wrap items-end gap-x-3 gap-y-1">
              <span className={`num text-5xl font-semibold leading-none tracking-tight ${flagged ? "text-rust" : "text-ink"}`}>{pct(res?.current.rate ?? m.rtoRate)}</span>
              <span className="num pb-1 text-[13px] text-muted">vs {pct(res?.baseline.rate ?? null)} baseline</span>
            </div>
            <p className="mt-3 max-w-xl text-[13px] text-ink/85">
              {flagged && res ? (
                <>
                  RTO is <strong className="num">{res.ratio?.toFixed(2)}×</strong> the prior {res.baseline.weeks}-week baseline
                  {res.baseline.minWeekRate !== null && <> (prior weekly range {pct(res.baseline.minWeekRate, 0)}–{pct(res.baseline.maxWeekRate, 0)})</>}. This is an elevated,
                  investigation-worthy pattern — an association in your data, not a proven cause.
                </>
              ) : res ? (
                <>The last-7-day RTO rate is within its recent baseline; no unusual increase is flagged.</>
              ) : (
                <>Not enough recent resolved shipments to establish a 7-day baseline.</>
              )}
            </p>
            <p className="mt-3 text-xs text-muted">
              Total shipments {fmt(m.shipments)} · {fmt(m.eligible)} resolved · baseline RTO {pct(d.baselineRate)} · window ends {asOf}
            </p>
          </div>
          <dl className="grid grid-cols-3 gap-3 self-center border-t border-line-soft pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-widest text-muted">Multiplier</dt>
              <dd className="num mt-1 text-2xl font-semibold">{res?.ratio ? `${res.ratio.toFixed(2)}×` : "—"}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-widest text-muted">z-score</dt>
              <dd className="num mt-1 text-2xl font-semibold">{res?.z != null ? res.z.toFixed(1) : "—"}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-widest text-muted">7-day sample</dt>
              <dd className="num mt-1 text-2xl font-semibold">{res ? fmt(res.current.n) : "—"}</dd>
              <dd className="text-xs text-muted">{res ? `${fmt(res.current.rto)} RTOs` : "no window"}</dd>
            </div>
          </dl>
        </div>
        {flagged && res && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft bg-canvas/60 px-5 py-3">
            <p className="flex items-center gap-2 text-[13px]">
              <SeverityDot severity={res.severity} />
              <SeverityBadge severity={res.severity} />
              <span className="text-muted">RTO rate elevated relative to baseline.</span>
            </p>
            <div className="flex flex-wrap gap-2">
              <LinkButton size="sm" href={`/shipments${filtersToQuery({ status: ["RTO"], from: shiftDays(asOf, -6), to: asOf })}`}>View 7-day RTO shipments</LinkButton>
              <LinkButton size="sm" variant="primary" href={overallFinding ? `/findings/${overallFinding.id}` : "/findings"}>Open finding</LinkButton>
            </div>
          </div>
        )}
      </section>

      {/* Primary indicators. */}
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="RTO rate" value={pct(m.rtoRate)} tone="bad" sub={`${fmt(m.rto)} of ${fmt(m.eligible)} resolved`} hint="RTO ÷ resolved shipments (delivered + RTO + lost)" />
        <Kpi label="7-day RTO" value={pct(res?.current.rate ?? null)} tone={flagged ? "bad" : "neutral"} sub={`vs ${pct(res?.baseline.rate ?? null)} baseline`} hint="Latest 7-day window vs prior baseline" />
        <Kpi label="Value at risk (RTO)" value={formatINR(m.rtoValue)} tone="bad" sub={`Est. RTO cost ${formatINR(m.rtoCost)}`} hint="Order value of RTO shipments; cost model in Settings" />
        <Kpi label="NDR rate" value={pct(m.ndrRate)} sub={`${pct(m.ndrRecoveryRate)} of NDR shipments delivered`} hint="Shipments with ≥1 failed attempt ÷ dispatched" />
        <Kpi label="Data quality" value={<Link className="hover:underline" href="/validation">{ds.qualityScore ?? "—"}<span className="text-lg font-normal text-muted">/100</span></Link>} sub="Rejected and incomplete rows at import" hint="Quality reflects rejected rows and missing fields" />
      </div>

      <Panel
        className="mt-4"
        title="Active anomalies"
        headline={segmentAnomalies.length ? "Segments whose last-7-day RTO rate is elevated relative to their own baseline — investigation candidates" : "No segment is elevated relative to its own baseline in the last 7 days"}
        actions={<Link href="/anomalies" className="text-[13px] text-link hover:underline">Open anomaly workstation →</Link>}
      >
        {segmentAnomalies.length === 0 ? (
          <p className="text-[13px] text-muted">Anomaly detection compares each segment&apos;s latest 7 days against its own pooled baseline (minimum sample and z thresholds). Nothing crossed the threshold.</p>
        ) : (
          <DataTable
            caption="Active anomalies"
            dense
            rows={segmentAnomalies.slice(0, 8)}
            rowKey={(a) => a.key}
            columns={[
              { key: "s", header: "Segment", cell: (a) => <Link className="font-medium text-link hover:underline" href={investigateHref(a, asOf)}>{a.label}</Link> },
              { key: "c", header: "Last 7 days", align: "right", cell: (a) => `${pct(a.result.current.rate)} (n=${fmt(a.result.current.n)})` },
              { key: "b", header: "Baseline", align: "right", cell: (a) => `${pct(a.result.baseline.rate)}${a.result.baseline.minWeekRate !== null ? ` (${pct(a.result.baseline.minWeekRate, 0)}–${pct(a.result.baseline.maxWeekRate, 0)})` : ""}` },
              { key: "r", header: "Multiplier", align: "right", cell: (a) => `${a.result.ratio?.toFixed(2)}×` },
              { key: "z", header: "z", align: "right", cell: (a) => (a.result.z != null ? a.result.z.toFixed(1) : "—") },
              { key: "sev", header: "Severity", cell: (a) => <SeverityBadge severity={a.result.severity} /> },
            ]}
          />
        )}
      </Panel>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Panel title="Trend" headline={res?.current.rate != null && res.baseline.rate != null ? `Latest week RTO rate ${pct(res.current.rate)} vs ${pct(res.baseline.rate)} in the prior 8 weeks.` : "Weekly RTO rate"}>
          <TrendChart
            ariaLabel="Weekly RTO rate"
            baseline={d.baselineRate}
            points={d.weekly.map((w) => ({ label: w.key, rate: w.eligible > 0 ? w.rto / w.eligible : null, n: w.eligible }))}
          />
        </Panel>
        <Panel title="Potential recoverable value" headline={formatINR(m.recoverableValue)}>
          <p className="text-[13px] text-muted">
            Estimated from RTOs whose recorded reason is operationally addressable (customer unavailable, phone unreachable, address incomplete, reschedule) multiplied by the
            recovery rate actually observed on those shipments. It is an estimate, not a collection guarantee.
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-[13px]">
            <div>
              <dt className="text-[11px] uppercase tracking-wider text-muted">Addressable RTOs</dt>
              <dd className="num font-medium">{fmt(d.total.addressableRto)} <span className="font-normal text-muted">of {fmt(m.rto)}</span></dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wider text-muted">Observed recovery rate</dt>
              <dd className="num font-medium">{pct(m.addressRecoveryRate)}</dd>
            </div>
          </dl>
          <p className="mt-3">
            <Link className="text-[13px] text-link hover:underline" href="/simulator">Simulate an intervention to reduce it →</Link>
          </p>
        </Panel>
      </div>

      <Panel
        className="mt-4"
        title="Investigation findings"
        headline={findings.length ? "Highest-scoring findings — start here" : "No findings generated yet"}
        actions={<GenerateFindingsButton label={findings.length ? "Refresh findings" : "Generate findings"} variant={findings.length ? "secondary" : "primary"} />}
      >
        {findings.length === 0 ? (
          <EmptyState title="Run the root-cause scan">Findings are ranked investigation candidates with transparent scoring. Generate them for this dataset.</EmptyState>
        ) : (
          <DataTable
            caption="Top findings"
            rows={findings.slice(0, 6)}
            rowKey={(f) => f.id}
            columns={[
              { key: "c", header: "ID", cell: (f) => <span className="font-mono text-xs">{f.code}</span> },
              { key: "t", header: "Finding", cell: (f) => <Link className="font-medium text-link hover:underline" href={`/findings/${f.id}`}>{f.title}</Link> },
              { key: "s", header: "Severity", cell: (f) => <SeverityBadge severity={f.severity} /> },
              { key: "v", header: "RTO value", align: "right", cell: (f) => formatINR(f.affectedValue) },
              { key: "n", header: "Shipments", align: "right", cell: (f) => fmt(f.affectedShipments) },
              { key: "st", header: "Status", cell: (f) => <Badge tone={f.status ? "info" : "neutral"}>{f.status ?? "Not opened"}</Badge> },
            ]}
          />
        )}
      </Panel>

      {d.candidates.length > 0 && (
        <Panel className="mt-4" title="Root-cause candidates" headline="Ranked by a transparent 0–100 score; each shows why it surfaced" actions={<Link href="/root-cause" className="text-[13px] text-link hover:underline">Full analysis →</Link>}>
          <ol className="grid gap-2 md:grid-cols-2">
            {d.candidates.slice(0, 4).map((c, i) => (
              <li key={c.key + c.dims.join()} className="rounded border border-line-soft px-3 py-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium">{c.label}</p>
                    <p className="num text-xs text-muted">{pct(c.rate)} · {c.liftRatio.toFixed(1)}× baseline · {fmt(c.rto)} RTOs</p>
                  </div>
                  <span className="num shrink-0 text-lg font-semibold">{c.score}<span className="text-xs font-normal text-muted">/100</span></span>
                </div>
                <p className="mt-1 text-xs text-muted">#{i + 1}{c.reasons[0] ? ` — ${c.reasons[0]}` : ""}</p>
              </li>
            ))}
          </ol>
        </Panel>
      )}

      {flagged && res && (
        <div className="mt-4">
          <Alert tone={res.severity === "CRITICAL" ? "bad" : "warn"} title={`Anomaly method`}>
            A segment is flagged when its latest 7-day RTO rate is at least 1.5× its own pooled baseline with z ≥ 2.5 and a minimum sample, computed with a binomial z-test. Ratios and
            z-scores describe how unusual the observed rate is — they do not establish cause.
          </Alert>
        </div>
      )}
    </>
  );
}
