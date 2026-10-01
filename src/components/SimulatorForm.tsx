"use client";

import { useState } from "react";
import { Alert, Badge, buttonClass, Kpi, SimulationBanner } from "./ui";
import { formatINR, pct } from "@/lib/domain/cost";
import { SCENARIO_META, SCENARIO_TYPES, type ScenarioType, type SimResult } from "@/lib/analytics/simulate";

interface Props {
  couriers: Array<{ name: string; codRate: number | null; n: number }>;
  states: string[];
  regions: string[];
  categories: string[];
  initialFilters: Record<string, string[] | string | number | undefined>;
  findingId: string | null;
  findingTitle: string | null;
  defaultAlt: string | null;
  initialScenario: ScenarioType;
}

const sel = "w-full rounded border border-line bg-panel px-2 py-1.5 text-[13px]";
const lab = "mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted";

/** Compact labels for the scenario picker so the selected option is never truncated. The full
 *  label from SCENARIO_META is still used as the result heading, and the description follows below. */
const SHORT_LABEL: Record<ScenarioType, string> = {
  COD_REDUCTION: "Reduce COD exposure",
  ADDRESS_VERIFICATION: "Require address verification",
  CHANGE_COURIER: "Route through a different courier",
  EXTRA_ATTEMPT: "Add one delivery attempt",
  PREPAID_NUDGE: "Move high-value COD to prepaid",
};

export function SimulatorForm({ couriers, states, regions, categories, initialFilters, findingId, findingTitle, defaultAlt, initialScenario }: Props) {
  const hasPreset = Object.keys(initialFilters).length > 0;
  const [scenario, setScenario] = useState<ScenarioType>(initialScenario);
  const [params, setParams] = useState<Record<string, number>>({});
  const [payment, setPayment] = useState<string>((initialFilters.payment as string[] | undefined)?.[0] ?? (hasPreset ? "" : "COD"));
  const [state, setState] = useState<string>((initialFilters.state as string[] | undefined)?.[0] ?? "");
  const [region, setRegion] = useState<string>((initialFilters.region as string[] | undefined)?.[0] ?? "");
  const [category, setCategory] = useState<string>((initialFilters.category as string[] | undefined)?.[0] ?? "");
  const [courier, setCourier] = useState<string>((initialFilters.courier as string[] | undefined)?.[0] ?? "");
  const [auto, setAuto] = useState<boolean>(!hasPreset);
  const [alt, setAlt] = useState<string>(defaultAlt ?? couriers[0]?.name ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [out, setOut] = useState<{ result: SimResult; target: { description: string }; simulationId: string | null } | null>(null);

  const meta = SCENARIO_META[scenario];
  const value = (k: string, def: number) => params[`${scenario}.${k}`] ?? def;
  // Filters passed through from a root-cause/finding link that the controls above do not expose.
  const preserved: Record<string, unknown> = {};
  for (const k of ["pincode", "pin3", "product", "valueBand", "repeat", "ndrReason", "status", "attempts", "from", "to", "minValue"]) if (initialFilters[k] !== undefined) preserved[k] = initialFilters[k];

  async function run() {
    setBusy(true);
    setError("");
    try {
      const filters: Record<string, unknown> = { ...preserved };
      if (payment) filters.payment = [payment];
      if (state) filters.state = [state];
      if (region) filters.region = [region];
      if (category) filters.category = [category];
      if (courier && scenario !== "CHANGE_COURIER") filters.courier = [courier];
      const p: Record<string, number> = {};
      for (const d of meta.params) p[d.key] = value(d.key, d.default);
      const res = await fetch("/api/simulate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scenario, params: p, target: { filters, autoHighRisk: auto, altCourier: scenario === "CHANGE_COURIER" ? alt : undefined }, findingId: findingId ?? undefined, save: !!findingId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? "Simulation failed");
      setOut(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Simulation failed");
      setOut(null);
    } finally {
      setBusy(false);
    }
  }

  const r = out?.result;
  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <form className="space-y-4 self-start rounded border border-line bg-panel p-4" onSubmit={(e) => { e.preventDefault(); void run(); }} aria-label="Scenario setup">
        {findingId && <Alert tone="info" title="Linked to a finding">{findingTitle}. Results are saved to this investigation and included in its report.</Alert>}
        <div>
          <label htmlFor="sc" className={lab}>Scenario</label>
          <select id="sc" className={sel} value={scenario} onChange={(e) => { setScenario(e.target.value as ScenarioType); setOut(null); }}>
            {SCENARIO_TYPES.map((s) => <option key={s} value={s}>{SHORT_LABEL[s]}</option>)}
          </select>
          <p className="mt-1 text-xs text-muted">{meta.description}</p>
        </div>

        <fieldset className="space-y-3 rounded border border-line-soft p-3">
          <legend className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted">Target segment</legend>
          <label className="flex items-start gap-2 text-[13px]">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="mt-0.5" />
            <span>Restrict to <strong>high-risk pincodes</strong> found by the root-cause engine<span className="block text-xs text-muted">Pincodes statistically above the baseline RTO rate (recomputed from data).</span></span>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div><label htmlFor="t-pay" className={lab}>Payment</label><select id="t-pay" className={sel} value={payment} onChange={(e) => setPayment(e.target.value)}><option value="">Any</option><option>COD</option><option>PREPAID</option></select></div>
            <div><label htmlFor="t-reg" className={lab}>Region</label><select id="t-reg" className={sel} value={region} onChange={(e) => setRegion(e.target.value)}><option value="">Any</option>{regions.map((x) => <option key={x}>{x}</option>)}</select></div>
            <div><label htmlFor="t-state" className={lab}>State</label><select id="t-state" className={sel} value={state} onChange={(e) => setState(e.target.value)}><option value="">Any</option>{states.map((x) => <option key={x}>{x}</option>)}</select></div>
            <div><label htmlFor="t-cat" className={lab}>Category</label><select id="t-cat" className={sel} value={category} onChange={(e) => setCategory(e.target.value)}><option value="">Any</option>{categories.map((x) => <option key={x}>{x}</option>)}</select></div>
            {scenario !== "CHANGE_COURIER" && <div className="col-span-2"><label htmlFor="t-cour" className={lab}>Current courier</label><select id="t-cour" className={sel} value={courier} onChange={(e) => setCourier(e.target.value)}><option value="">Any</option>{couriers.map((x) => <option key={x.name}>{x.name}</option>)}</select></div>}
          </div>
          {Object.keys(preserved).length > 0 && <p className="text-xs text-muted">Also applied from link: {Object.entries(preserved).map(([k, v]) => `${k}=${Array.isArray(v) ? v.slice(0, 3).join(",") + (v.length > 3 ? "…" : "") : String(v)}`).join("; ")}</p>}
        </fieldset>

        {scenario === "CHANGE_COURIER" && (
          <div>
            <label htmlFor="alt" className={lab}>Route through courier</label>
            <select id="alt" className={sel} value={alt} onChange={(e) => setAlt(e.target.value)}>
              {couriers.map((c) => <option key={c.name} value={c.name}>{c.name} — COD RTO {pct(c.codRate)} (n={c.n})</option>)}
            </select>
            <p className="mt-1 text-xs text-muted">Overall rates shown for orientation only; the simulation uses the courier&apos;s observed rate in comparable context. Default = lowest overall COD RTO rate with adequate volume — not a claim that it is best.</p>
          </div>
        )}

        {meta.params.length > 0 && (
          <fieldset className="space-y-3 rounded border border-line-soft p-3">
            <legend className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted">Assumptions (editable)</legend>
            {meta.params.map((d) => (
              <div key={d.key}>
                <label htmlFor={`p-${d.key}`} className={lab}>{d.label} ({d.unit})</label>
                <input id={`p-${d.key}`} type="number" min={d.min} max={d.max} step={d.step} className={sel} value={value(d.key, d.default)} onChange={(e) => setParams({ ...params, [`${scenario}.${d.key}`]: Number(e.target.value) })} />
                <p className="mt-0.5 text-xs text-muted">{d.help}</p>
              </div>
            ))}
          </fieldset>
        )}
        <button type="submit" className={`${buttonClass("primary")} w-full`} disabled={busy}>{busy ? "Simulating…" : "Run simulation"}</button>
      </form>

      <div aria-live="polite" className="space-y-4">
        {error && <Alert tone="bad" title="Simulation could not run">{error}</Alert>}
        {!r && !error && <div className="rounded border border-dashed border-line px-6 py-16 text-center text-[13px] text-muted">Choose a scenario and run it. Results are estimates computed from your historical data with the assumptions you can see and edit.</div>}
        {r && out && (
          <>
            <div className="rounded border border-line bg-panel">
              <div className="border-b border-line-soft px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">Observed — from your data</p>
                <h2 className="text-[15px] font-semibold">{r.label}</h2>
                <p className="text-[13px] text-muted">Target: {out.target.description} · {r.targetSize.shipments.toLocaleString("en-IN")} shipments ({r.targetSize.eligible.toLocaleString("en-IN")} resolved, {r.targetSize.rto.toLocaleString("en-IN")} RTO)</p>
                {out.simulationId && <p className="mt-1 text-xs text-good">Saved to the linked investigation.</p>}
              </div>
              <div className="grid gap-4 p-4 lg:grid-cols-[auto_1fr]">
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-muted">Current RTO rate · whole dataset</p>
                  <p className="num text-4xl font-semibold leading-none">{pct(r.current.rtoRate)}</p>
                  <p className="mt-1"><Badge>observed</Badge></p>
                </div>
                <div className="grid grid-cols-3 gap-3 self-center">
                  <Kpi label="RTOs" value={r.current.rto.toLocaleString("en-IN")} />
                  <Kpi label="Est. RTO cost" value={formatINR(r.current.rtoCost)} />
                  <Kpi label="RTO value" value={formatINR(r.current.rtoValue)} />
                </div>
              </div>
              <div className="border-t border-line-soft px-4 py-3">
                <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted">Observed in your data</h3>
                <dl className="mt-2 space-y-1 text-[13px]">{r.observed.map((o) => <div key={o.label} className="flex justify-between gap-3"><dt className="text-muted">{o.label}</dt><dd className="num font-medium">{o.value}</dd></div>)}</dl>
              </div>
            </div>

            <SimulationBanner />

            <div className="rounded border border-line bg-panel">
              <div className="border-b border-line-soft px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">Simulated outcome — whole dataset (estimate)</p>
                <div className="mt-1 flex flex-wrap items-end gap-3">
                  <span className="num text-4xl font-semibold leading-none">{pct(r.simulated.rtoRate)}</span>
                  <span className={`num pb-0.5 text-[15px] font-semibold ${(r.diff.rateDeltaPts ?? 0) < 0 ? "text-good" : "text-rust"}`}>
                    {r.diff.rateDeltaPts === null ? "—" : `${r.diff.rateDeltaPts > 0 ? "+" : ""}${r.diff.rateDeltaPts.toFixed(2)} pts`}
                  </span>
                  <span className="pb-0.5 text-[13px] text-muted">vs {pct(r.current.rtoRate)} observed</span>
                </div>
              </div>
              <div className="overflow-x-auto p-4">
                <table className="w-full text-[13px]">
                  <caption className="sr-only">Observed versus simulated RTO figures</caption>
                  <thead><tr className="border-b border-line bg-canvas/60 text-left text-[11px] uppercase tracking-wider text-muted"><th className="px-2 py-2" /><th className="px-2 py-2 text-right">RTO rate</th><th className="px-2 py-2 text-right">RTOs</th><th className="px-2 py-2 text-right">Est. RTO cost</th><th className="px-2 py-2 text-right">RTO value</th></tr></thead>
                  <tbody>
                    <tr className="border-b border-line-soft"><th scope="row" className="px-2 py-2 text-left font-medium">Observed <Badge>actual</Badge></th><td className="num px-2 py-2 text-right">{pct(r.current.rtoRate)}</td><td className="num px-2 py-2 text-right">{r.current.rto.toLocaleString("en-IN")}</td><td className="num px-2 py-2 text-right">{formatINR(r.current.rtoCost)}</td><td className="num px-2 py-2 text-right">{formatINR(r.current.rtoValue)}</td></tr>
                    <tr className="border-b border-line-soft"><th scope="row" className="px-2 py-2 text-left font-medium">Simulated <Badge tone="warn">estimate</Badge></th><td className="num px-2 py-2 text-right font-semibold">{pct(r.simulated.rtoRate)}</td><td className="num px-2 py-2 text-right">{r.simulated.rto.toFixed(0)}</td><td className="num px-2 py-2 text-right">{formatINR(r.simulated.rtoCost)}</td><td className="num px-2 py-2 text-right">{formatINR(r.simulated.rtoValue)}</td></tr>
                  </tbody>
                </table>
              </div>
              <div className="grid grid-cols-2 gap-3 border-t border-line-soft p-4 lg:grid-cols-4">
                <Kpi label="Est. RTOs avoided" value={r.diff.rtoAvoided.toFixed(1)} />
                <Kpi label="Est. cost saved" value={formatINR(r.diff.costSaved)} tone={r.diff.costSaved >= 0 ? "good" : "bad"} />
                <Kpi label="Est. value recovered (GMV)" value={formatINR(r.diff.valueRecovered)} />
                <Kpi label="Program cost" value={formatINR(r.diff.programCost)} />
                <Kpi label="Lost margin" value={formatINR(r.diff.lostMargin)} />
                <div className="col-span-2"><Kpi label="Estimated net benefit" value={formatINR(r.diff.netBenefit)} tone={r.diff.netBenefit >= 0 ? "good" : "bad"} sub="Cost saved + recovered margin − program cost − lost margin" /></div>
              </div>
            </div>

            {r.warnings.length > 0 && <Alert tone="warn" title="Read with care"><ul className="list-disc pl-4">{r.warnings.map((w) => <li key={w}>{w}</li>)}</ul></Alert>}
            <div className="rounded border border-line bg-panel p-4">
              <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted">Assumptions used (editable above)</h3>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-[13px]">{r.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
            </div>
            <p className="text-xs text-muted">{r.disclaimer}</p>
          </>
        )}
      </div>
    </div>
  );
}
