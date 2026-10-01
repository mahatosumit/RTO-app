import type { ReactNode } from "react";
import { Shell } from "@/components/Shell";
import { getActiveDataset } from "@/lib/active";
import { listDatasets } from "@/lib/org";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const [dataset, datasets] = await Promise.all([getActiveDataset(), listDatasets()]);
  return (
    <Shell dataset={dataset} datasets={datasets}>
      {children}
    </Shell>
  );
}
