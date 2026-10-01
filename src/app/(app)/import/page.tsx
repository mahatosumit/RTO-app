import { ImportWizard } from "@/components/ImportWizard";
import { PageHeader } from "@/components/ui";
import { listDatasets } from "@/lib/org";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const datasets = await listDatasets();
  return (
    <>
      <PageHeader eyebrow="Data" title="Import data" headline="Upload a courier/shipment CSV, review the column mapping, validate every row, then import. Bad rows are reported, never silently dropped." />
      <ImportWizard datasets={datasets.filter((d) => !d.isDemo).map((d) => ({ id: d.id, name: d.name }))} />
    </>
  );
}
