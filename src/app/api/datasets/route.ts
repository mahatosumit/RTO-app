import { cookies } from "next/headers";
import { z } from "zod";
import { ApiError, apiError, readJson } from "@/lib/api";
import { DATASET_COOKIE } from "@/lib/active";
import { getDatasetById, listDatasets } from "@/lib/org";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json({ datasets: await listDatasets() });
  } catch (e) {
    return apiError(e);
  }
}

/** POST {id} selects the active dataset (stored in an HttpOnly cookie). */
export async function POST(req: Request) {
  try {
    const { id } = z.object({ id: z.string().uuid() }).parse(await readJson(req));
    if (!(await getDatasetById(id))) throw new ApiError(404, "DATASET_NOT_FOUND", "Dataset not found.");
    (await cookies()).set(DATASET_COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/" });
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
