import { cookies } from "next/headers";
import { isUuid } from "@/lib/analytics/filters";
import type { DatasetInfo } from "@/lib/analytics/types";
import { getDatasetById, listDatasets } from "@/lib/org";

export const DATASET_COOKIE = "rto_ds";

/** Active dataset = cookie selection if valid, otherwise the most recent dataset. */
export async function getActiveDataset(): Promise<DatasetInfo | null> {
  const jar = await cookies();
  const id = jar.get(DATASET_COOKIE)?.value;
  if (id && isUuid(id)) {
    const d = await getDatasetById(id);
    if (d) return d;
  }
  const all = await listDatasets();
  return all[0] ?? null;
}
