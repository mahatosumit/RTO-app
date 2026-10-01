import { SimulatorForm } from "@/components/SimulatorForm";
import { NoDataset, PageHeader } from "@/components/ui";
import { getActiveDataset } from "@/lib/active";
import { aggregateBy } from "@/lib/analytics/aggregate";
import { isUuid, parseFilters } from "@/lib/analytics/filters";
import { getFilterOptions } from "@/lib/analytics/options";
import { SCENARIO_TYPES, type ScenarioType } from "@/lib/analytics/simulate";
import { getFinding } from "@/lib/findings";

export const dynamic = "force-dynamic";

export default async function SimulatorPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const ds = await getActiveDataset();
  if (!ds) return <NoDataset />;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const findingParam = one(sp.finding);
  const finding = findingParam && isUuid(findingParam) ? await getFinding(findingParam) : null;
  const filters = parseFilters(sp);
  const [rows, options] = await Promise.all([aggregateBy(ds.id, ["courier"], {}, { limit: 50 }), getFilterOptions(ds.id)]);
  const couriers = rows.filter((r) => r.key !== "Unknown").map((r) => ({ name: r.key, codRate: r.codEligible ? r.codRto / r.codEligible : null, n: r.codEligible }));
  const candidates = couriers.filter((c) => c.n >= 100 && c.codRate !== null).sort((a, b) => (a.codRate ?? 1) - (b.codRate ?? 1));
  const sc = one(sp.scenario);
  const initialScenario: ScenarioType = (SCENARIO_TYPES as readonly string[]).includes(sc ?? "") ? (sc as ScenarioType) : "CHANGE_COURIER";
  return (
    <>
      <PageHeader
        eyebrow="What could happen if I change a policy?"
        title="Intervention simulator"
        headline="Estimate the effect of a policy change using your own historical rates. Every assumption is visible and editable; nothing here is a guaranteed outcome."
      />
      <SimulatorForm
        couriers={couriers}
        states={options.state}
        regions={options.region}
        categories={options.category}
        initialFilters={filters as Record<string, string[] | string | number | undefined>}
        findingId={finding?.id ?? null}
        findingTitle={finding ? `${finding.code} — ${finding.title}` : null}
        defaultAlt={candidates[0]?.name ?? couriers[0]?.name ?? null}
        initialScenario={initialScenario}
      />
    </>
  );
}
