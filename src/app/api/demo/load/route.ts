import { cookies } from "next/headers";
import { apiError } from "@/lib/api";
import { DATASET_COOKIE } from "@/lib/active";
import { loadDemoDataset } from "@/lib/demo/load";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST() {
  try {
    const res = await loadDemoDataset();
    (await cookies()).set(DATASET_COOKIE, res.datasetId, { httpOnly: true, sameSite: "lax", path: "/" });
    return Response.json({ ok: true, ...res });
  } catch (e) {
    return apiError(e);
  }
}
