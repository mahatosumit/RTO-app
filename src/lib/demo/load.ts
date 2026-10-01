import { eq } from "drizzle-orm";
import { db } from "@/db";
import { datasets, importJobs } from "@/db/schema";
import { commitImportJob, createImportJob, validateImportJob } from "@/lib/csv/pipeline";
import { generateDemoData } from "./generate";
import { generateFindings } from "@/lib/findings";
import { asOfString, audit, getDatasetById, getOrgId } from "@/lib/org";

export const DEMO_DATASET_NAME = "DEMO — Synthetic D2C shipments (not customer data)";

/** Replaces any existing demo dataset, then imports freshly generated CSVs through the real pipeline. */
export async function loadDemoDataset(): Promise<{ datasetId: string; shipments: number; rejected: number; findings: number }> {
  const orgId = await getOrgId();
  const old = await db.select({ id: datasets.id }).from(datasets).where(eq(datasets.isDemo, true));
  for (const d of old) {
    await db.delete(importJobs).where(eq(importJobs.datasetId, d.id));
    await db.delete(datasets).where(eq(datasets.id, d.id));
  }
  const { shipmentsCsv, eventsCsv } = generateDemoData();
  const j1 = await createImportJob({ fileName: "demo_shipments.csv", content: shipmentsCsv, size: Buffer.byteLength(shipmentsCsv), kind: "SHIPMENTS", datasetName: DEMO_DATASET_NAME });
  await validateImportJob(j1.id, j1.suggestedMapping);
  const c1 = await commitImportJob(j1.id, { isDemo: true });
  const j2 = await createImportJob({ fileName: "demo_events.csv", content: eventsCsv, size: Buffer.byteLength(eventsCsv), kind: "EVENTS", targetDatasetId: c1.datasetId });
  await validateImportJob(j2.id, j2.suggestedMapping);
  await commitImportJob(j2.id);
  const ds = await getDatasetById(c1.datasetId);
  const gen = ds ? await generateFindings(ds, asOfString(ds)) : { total: 0 };
  await audit("demo.load", "dataset", c1.datasetId, { orgId });
  return { datasetId: c1.datasetId, shipments: c1.imported, rejected: c1.rejected, findings: gen.total };
}
