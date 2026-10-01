import type { ReactNode } from "react";
import { Shell } from "@/components/Shell";
import { getActiveDataset } from "@/lib/active";
import { listDatasets } from "@/lib/org";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  let dataset = null;
  let datasets: Awaited<ReturnType<typeof listDatasets>> = [];
  try {
    [dataset, datasets] = await Promise.all([getActiveDataset(), listDatasets()]);
  } catch {
    // Render the shell so database setup errors can be shown by the current page.
  }
  return (
    <Shell dataset={dataset} datasets={datasets}>
      {children}
    </Shell>
  );
}
