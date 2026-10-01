import { apiError, asOfString, datasetFromRequest } from "@/lib/api";
import { generateFindings, listFindings } from "@/lib/findings";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  try {
    const ds = await datasetFromRequest(req);
    return Response.json({ findings: await listFindings(ds.id) });
  } catch (e) {
    return apiError(e);
  }
}

/** POST regenerates deterministic findings for the dataset (idempotent by segment key). */
export async function POST(req: Request) {
  try {
    const ds = await datasetFromRequest(req);
    const res = await generateFindings(ds, asOfString(ds));
    return Response.json({ ok: true, ...res });
  } catch (e) {
    return apiError(e);
  }
}
