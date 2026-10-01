import Link from "next/link";
import { Badge, EmptyState, Kpi, LinkButton, NoDataset, PageHeader, Panel, SeverityBadge } from "@/components/ui";
import { getActiveDataset } from "@/lib/active";
import { filtersToQuery } from "@/lib/analytics/filters";
import { scanAnomalies, type AnomalyItem } from "@/lib/analytics/insights";
import { DIM_LABELS } from "@/lib/analytics/types";
import { pct } from "@/lib/domain/cost";
import { asOfString } from "@/lib/org";

export const dynamic = "force-dynamic";

const fmt = (n: number) => n.toLocaleString("en-IN");

function shiftDays(day: string, delta: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function investigateHref(a: AnomalyItem, asOf: string): string {
  return `/shipments${filtersToQuery({ ...a.filters, status: ["RTO"], from: shiftDays(asOf, -6), to: asOf })}`;
}

function dimLabel(a: AnomalyItem): string {
  return a.dims.length ? a.dims.map((d) => DIM_LABELS[d]).join(" × ") : "All shipments";
}

export default async function AnomaliesPage() {
  const ds = await getActiveDataset();
  if (!ds) return <NoDataset />;
  const asOf = asOfString(ds);
  const all = await scanAnomalies(ds.id, asOf);
  const flagged = all.filter((a) => a.result.flagged);
  const overall = all.find((a) => a.dims.length === 0) ?? null;
  const segments = flagged.filter((a) => a.dims.length > 0);
  const critical = flagged.filter((a) => a.result.severity === "CRITICAL").length;

  return (
    <>
      <PageHeader
        eyebrow="Detect"
        title="Anomalies"
        headline={
          segments.length
            ? `${segments.length} segment${segments.length === 1 ? "" : "s"} are elevated relative to their own baseline in the last 7 days${critical ? `, ${critical} of them critical` : ""}. Each is an investigation candidate — a statistical association, not a proven cause.`
            : "No segment is elevated relative to its own baseline in the last 7 days."
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Overall 7-day RTO" value={pct(overall?.result.current.rate ?? null)} sub={`vs ${pct(overall?.result.baseline.rate ?? null)} baseline`} tone={overall?.result.flagged ? "bad" : "neutral"} />
        <Kpi label="Overall multiplier" value={overall?.result.ratio ? `${overall.result.ratio.toFixed(2)}×` : "—"} sub={overall?.result.z != null ? `z = ${overall.result.z.toFixed(1)}` : "not enough data"} tone={overall?.result.flagged ? "bad" : "neutral"} />
        <Kpi label="Flagged segments" value={fmt(segments.length)} sub={`of ${fmt(all.length)} scanned`} tone={segments.length ? "warn" : "good"} />
        <Kpi label="Critical" value={fmt(critical)} sub="Latest 7 days ≥ 2× baseline and z ≥ 3.5" tone={critical ? "bad" : "neutral"} />
      </div>

      <div className="mt-4">
        <Panel title="How anomalies are detected">
          <p className="text-[13px] text-muted">
            For each segment (and for the dataset as a whole) the latest 7-day RTO rate is compared with the pooled baseline of the prior 8 weeks using a binomial z-test. A segment is
            flagged when it has at least 30 resolved shipments in the window, a baseline of at least 100, a rate at least 1.5× baseline and z ≥ 2.5. Ratios and z-scores describe how
            unusual the observed rate is; they do <em>not</em> establish causation. Values come from the deterministic analytics engine, not a language model.
          </p>
        </Panel>
      </div>

      <Panel className="mt-4" title="Flagged segments" headline={segments.length ? "Ordered by multiplier over baseline" : undefined}>
        {segments.length === 0 ? (
          <EmptyState title="Nothing is flagged right now">
            Either RTO is stable across segments, or there is not yet enough recent data to establish a baseline. As more shipments resolve, this page fills in automatically.
          </EmptyState>
        ) : (
          <ul className="space-y-3">
            {segments.map((a) => (
              <li key={a.key} className="rounded border border-line">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line-soft px-4 py-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">{dimLabel(a)}</p>
                    <h2 className="text-[15px] font-semibold">{a.label}</h2>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>investigation candidate</Badge>
                    <SeverityBadge severity={a.result.severity} />
                    <span className="num text-2xl font-semibold">{a.result.ratio?.toFixed(2)}×</span>
                  </div>
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-3 text-[13px] md:grid-cols-4">
                  <div>
                    <dt className="text-[11px] uppercase tracking-wider text-muted">Last 7 days</dt>
                    <dd className="num font-medium">{pct(a.result.current.rate)} <span className="font-normal text-muted">(n={fmt(a.result.current.n)})</span></dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wider text-muted">Baseline ({a.result.baseline.weeks}w)</dt>
                    <dd className="num font-medium">{pct(a.result.baseline.rate)}{a.result.baseline.minWeekRate !== null && <span className="font-normal text-muted"> ({pct(a.result.baseline.minWeekRate, 0)}–{pct(a.result.baseline.maxWeekRate, 0)})</span>}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wider text-muted">z-score</dt>
                    <dd className="num font-medium">{a.result.z != null ? a.result.z.toFixed(1) : "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wider text-muted">7-day RTOs</dt>
                    <dd className="num font-medium">{fmt(a.result.current.rto)}</dd>
                  </div>
                </dl>
                <div className="flex flex-wrap items-center gap-2 border-t border-line-soft px-4 py-2">
                  <LinkButton size="sm" href={investigateHref(a, asOf)}>View 7-day RTO shipments</LinkButton>
                  <LinkButton size="sm" href={`/simulator${filtersToQuery(a.filters)}`}>Simulate an intervention</LinkButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <p className="mt-4 text-[13px] text-muted">
        Promote a pattern into a tracked, exportable investigation from <Link className="text-link hover:underline" href="/findings">Findings</Link>, or rank concentration candidates in{" "}
        <Link className="text-link hover:underline" href="/root-cause">Root cause</Link>.
      </p>
    </>
  );
}
