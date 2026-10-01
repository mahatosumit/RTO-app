import { VALUE_BANDS } from "@/lib/domain/cost";
import { FINAL_STATUSES } from "@/lib/domain/classify";
import { aggregateBy } from "./aggregate";

export interface FilterOptions {
  courier: string[];
  state: string[];
  region: string[];
  category: string[];
  payment: string[];
  valueBand: string[];
  status: string[];
}

export async function getFilterOptions(datasetId: string): Promise<FilterOptions> {
  const [courier, state, region, category] = await Promise.all(
    (["courier", "state", "region", "category"] as const).map((d) => aggregateBy(datasetId, [d], {}, { limit: 200, orderBy: "shipments" })),
  );
  const keys = (rows: Array<{ key: string }>) => rows.map((r) => r.key);
  return {
    courier: keys(courier),
    state: keys(state).sort(),
    region: keys(region).sort(),
    category: keys(category).sort(),
    payment: ["COD", "PREPAID", "UNKNOWN"],
    valueBand: [...VALUE_BANDS],
    status: [...FINAL_STATUSES],
  };
}
