import { ImportWizard } from "@/components/ImportWizard";
import { Alert, PageHeader } from "@/components/ui";
import { listDatasets } from "@/lib/org";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  let datasets: Awaited<ReturnType<typeof listDatasets>> = [];
  let databaseUnavailable = false;
  try {
    datasets = await listDatasets();
  } catch {
    databaseUnavailable = true;
  }
  return (
    <>
      <PageHeader eyebrow="Data" title="Import data" headline="Upload a courier/shipment CSV, review the column mapping, validate every row, then import. Bad rows are reported, never silently dropped." />
      {databaseUnavailable && (
        <div className="mb-5 max-w-2xl">
          <Alert tone="warn" title="Database setup required">
            Add a valid DATABASE_URL in Vercel, then run the Drizzle schema migration against that PostgreSQL database. Uploads and demo data cannot be stored until the database is ready.
          </Alert>
        </div>
      )}
      <ImportWizard datasets={datasets.filter((d) => !d.isDemo).map((d) => ({ id: d.id, name: d.name }))} />
    </>
  );
}
