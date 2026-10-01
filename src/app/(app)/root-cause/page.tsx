import Link from "next/link";
import { Badge, EmptyState, LinkButton, NoDataset, PageHeader, Panel } from "@/components/ui";
import { getActiveDataset } from "@/lib/active";
import { filtersToParams } from "@/lib/analytics/filters";
import { findCandidates } from "@/lib/analytics/insights";
import { GATES, WEIGHTS, selectShortlist } from "@/lib/analytics/rootcause";
import { formatINR, pct } from "@/lib/domain/cost";
import { asOfString } from "@/lib/org";

export const dynamic = "force-dynamic";

const COMPONENTS: Array<[keyof typeof WEIGHTS, string]> = [
  ["excess", "Excess RTOs"],
  ["lift", "Rate lift"],
  ["value", "Value share"],
  ["sample", "Sample size"],
  ["recurrence", "Recurrence"],
];

export default async function RootCausePage() {
  const ds = await getActiveDataset();
  if (!ds) return <NoDataset />;
  const { candidates, baselineRate, totals } = await findCandidates(ds.id, asOfString(ds));
  const list = selectShortlist(candidates, 15);
  return (
    <>
      <PageHeader
        title="Root-cause analysis"
        eyebrow="What should I investigate first?"
        headline={
          list.length
            ? `${list.length} investigation candidates surfaced from ${candidates.length} statistically distinguishable segments. Baseline RTO rate is ${pct(baselineRate)}.`
            : "No segment met the sample-size and significance gates."
        }
      />
      <div className="mb-4 rounded border border-line bg-panel px-4 py-3 text-[13px] text-muted">
        <strong className="text-ink">How candidates are ranked.</strong> Each segment is scored 0–100: {COMPONENTS.map(([k, l]) => `${l} ${(WEIGHTS[k] * 100).toFixed(0)}%`).join(" · ")}. A segment must have ≥{GATES.minEligible} resolved shipments, ≥{GATES.minRto} RTOs, ≥{GATES.minLift}× the baseline rate, and a 95% interval lower bound above baseline. Results show what is <em>associated with</em> RTO — not proven cause.
      </div>
      {list.length === 0 ? (
        <EmptyState title="Nothing stands out">Either RTO is evenly distributed, or the dataset is too small (resolved shipments: {totals.eligible}).</EmptyState>
      ) : (
        <ol className="space-y-3">
          {list.map((c, i) => {
            const fp = filtersToParams(c.filters);
            return (
              <li key={c.key + c.dims.join()}>
                <Panel>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">Candidate #{i + 1}</p>
                      <h2 className="text-[16px] font-semibold">{c.label}</h2>
                      <p className="num mt-0.5 text-[13px] text-muted">
                        RTO rate {pct(c.rate)} · {c.liftRatio.toFixed(1)}× baseline · {c.rto} RTOs · {formatINR(c.affectedValue)} RTO value
                      </p>
                    </div>
                    <div className="text-right">
                      <Badge tone={c.severity === "HIGH" ? "bad" : c.severity === "MEDIUM" ? "warn" : "neutral"}>{c.severity}</Badge>
                      <p className="num mt-1 text-2xl font-semibold">{c.score}<span className="text-sm font-normal text-muted">/100</span></p>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-4 md:grid-cols-2">
                    <div>
                      <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-muted">Why it surfaced</p>
                      <ul className="list-disc space-y-0.5 pl-4 text-[13px]">
                        {c.reasons.map((r) => (
                          <li key={r}>{r}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-muted">Score breakdown</p>
                      <ul className="space-y-1 text-[12px]">
                        {COMPONENTS.map(([k, label]) => (
                          <li key={k} className="grid grid-cols-[6.5rem_1fr_3rem] items-center gap-2">
                            <span>{label}</span>
                            <span className="h-1.5 rounded bg-line-soft" aria-hidden><span className="block h-full rounded bg-link" style={{ width: `${c.components[k] * 100}%` }} /></span>
                            <span className="num text-right text-muted">{(c.components[k] * WEIGHTS[k] * 100).toFixed(0)}/{(WEIGHTS[k] * 100).toFixed(0)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <LinkButton size="sm" href={`/shipments?${new URLSearchParams([...fp, ["status", "RTO"]]).toString()}`}>View RTO shipments</LinkButton>
                    <LinkButton size="sm" href={`/simulator?${fp.toString()}`}>Simulate an intervention</LinkButton>
                  </div>
                </Panel>
              </li>
            );
          })}
        </ol>
      )}
      <p className="mt-4 text-xs text-muted">
        Promote candidates to tracked investigations from <Link className="text-link hover:underline" href="/findings">Findings</Link>.
      </p>
    </>
  );
}
