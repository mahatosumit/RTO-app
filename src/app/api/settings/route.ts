import { z } from "zod";
import { apiError, readJson } from "@/lib/api";
import { db } from "@/db";
import { costSettings } from "@/db/schema";
import { aiStatus } from "@/lib/ai/provider";
import { audit, getCostModel, getOrgId } from "@/lib/org";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json({ cost: await getCostModel(), ai: aiStatus(), limits: { maxUploadMb: Number(process.env.MAX_UPLOAD_MB ?? 10), maxRows: Number(process.env.MAX_IMPORT_ROWS ?? 500000) }, accessKeyEnabled: !!process.env.APP_ACCESS_KEY });
  } catch (e) {
    return apiError(e);
  }
}

const body = z.object({
  forwardCost: z.number().min(0).max(100000),
  reverseCost: z.number().min(0).max(100000),
  handlingCost: z.number().min(0).max(100000),
  cogsRatio: z.number().min(0).max(1),
  writeoffRate: z.number().min(0).max(1),
  marginRate: z.number().min(0).max(1),
});

export async function PUT(req: Request) {
  try {
    const v = body.parse(await readJson(req));
    const orgId = await getOrgId();
    await db.insert(costSettings).values({ orgId, ...v }).onConflictDoUpdate({ target: costSettings.orgId, set: { ...v, updatedAt: new Date() } });
    await audit("settings.update", "cost_settings", orgId, v);
    return Response.json({ ok: true, cost: await getCostModel() });
  } catch (e) {
    return apiError(e);
  }
}
