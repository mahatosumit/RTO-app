import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, costSettings, datasets, importJobs, organizations } from "@/db/schema";
import { DEFAULT_COST_MODEL, type CostModel } from "@/lib/domain/cost";
import type { DatasetInfo } from "@/lib/analytics/types";

let cachedOrgId: string | null = null;

/** Single-tenant default organisation (schema supports more). */
export async function getOrgId(): Promise<string> {
  if (cachedOrgId) return cachedOrgId;
  const existing = await db.select().from(organizations).where(eq(organizations.slug, "default")).limit(1);
  if (existing[0]) {
    cachedOrgId = existing[0].id;
    return cachedOrgId;
  }
  const inserted = await db
    .insert(organizations)
    .values({ name: "My Store", slug: "default" })
    .onConflictDoNothing()
    .returning();
  const row = inserted[0] ?? (await db.select().from(organizations).where(eq(organizations.slug, "default")).limit(1))[0];
  cachedOrgId = row.id;
  return cachedOrgId;
}

export async function getCostModel(orgId?: string): Promise<CostModel> {
  const id = orgId ?? (await getOrgId());
  const rows = await db.select().from(costSettings).where(eq(costSettings.orgId, id)).limit(1);
  const r = rows[0];
  if (!r) return { ...DEFAULT_COST_MODEL };
  return {
    forwardCost: r.forwardCost,
    reverseCost: r.reverseCost,
    handlingCost: r.handlingCost,
    cogsRatio: r.cogsRatio,
    writeoffRate: r.writeoffRate,
    marginRate: r.marginRate,
  };
}

function toInfo(d: typeof datasets.$inferSelect): DatasetInfo {
  return {
    id: d.id,
    name: d.name,
    isDemo: d.isDemo,
    shipmentCount: d.shipmentCount,
    qualityScore: d.qualityScore,
    asOf: d.asOf,
    createdAt: d.createdAt,
  };
}

export async function listDatasets(): Promise<DatasetInfo[]> {
  const orgId = await getOrgId();
  const rows = await db.select().from(datasets).where(eq(datasets.orgId, orgId)).orderBy(desc(datasets.createdAt));
  return rows.map(toInfo);
}

export async function getDatasetById(id: string): Promise<DatasetInfo | null> {
  const orgId = await getOrgId();
  const rows = await db.select().from(datasets).where(eq(datasets.id, id)).limit(1);
  const d = rows[0];
  return d && d.orgId === orgId ? toInfo(d) : null;
}

export function asOfString(d: DatasetInfo): string {
  const date = d.asOf ?? d.createdAt;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(date);
}

export async function deleteDataset(id: string): Promise<void> {
  await db.delete(importJobs).where(eq(importJobs.datasetId, id));
  await db.delete(datasets).where(eq(datasets.id, id));
}

export async function audit(action: string, entity?: string, entityId?: string, detail?: unknown, actor = "operator"): Promise<void> {
  try {
    const orgId = await getOrgId();
    await db.insert(auditLogs).values({ orgId, actor, action, entity, entityId, detail: detail as never });
  } catch (e) {
    console.error(JSON.stringify({ level: "error", msg: "audit failed", action, err: String(e) }));
  }
}
