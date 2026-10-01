import { z } from "zod";
import { ApiError, apiError, readJson } from "@/lib/api";
import { isUuid } from "@/lib/analytics/filters";
import { commitImportJob, getImportJob, validateImportJob } from "@/lib/csv/pipeline";
import { cookies } from "next/headers";
import { DATASET_COOKIE } from "@/lib/active";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

async function jobId(ctx: Ctx): Promise<string> {
  const { id } = await ctx.params;
  if (!isUuid(id)) throw new ApiError(400, "INVALID_ID", "Invalid import id.");
  return id;
}

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const job = await getImportJob(await jobId(ctx));
    if (!job) throw new ApiError(404, "JOB_NOT_FOUND", "Import job not found.");
    return Response.json({ job });
  } catch (e) {
    return apiError(e);
  }
}

const body = z.object({ action: z.enum(["validate", "commit"]), mapping: z.record(z.string(), z.string().nullable()).optional() });

/** POST {action:'validate', mapping} → dry-run validation; POST {action:'commit'} → import valid rows. */
export async function POST(req: Request, ctx: Ctx) {
  try {
    const id = await jobId(ctx);
    const b = body.parse(await readJson(req));
    if (b.action === "validate") {
      if (!b.mapping) throw new ApiError(400, "INVALID_INPUT", "A column mapping is required.");
      const report = await validateImportJob(id, b.mapping);
      return Response.json({ ok: true, report });
    }
    const res = await commitImportJob(id);
    (await cookies()).set(DATASET_COOKIE, res.datasetId, { httpOnly: true, sameSite: "lax", path: "/" });
    return Response.json({ ok: true, result: res });
  } catch (e) {
    return apiError(e);
  }
}
