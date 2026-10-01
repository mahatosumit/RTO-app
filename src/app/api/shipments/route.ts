import { apiError, datasetFromRequest } from "@/lib/api";
import { parseFilters } from "@/lib/analytics/filters";
import { listShipments } from "@/lib/shipments";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const ds = await datasetFromRequest(req);
    const url = new URL(req.url);
    const filters = parseFilters(Object.fromEntries(url.searchParams));
    const res = await listShipments(ds.id, filters, Number(url.searchParams.get("page") ?? 1) || 1, Number(url.searchParams.get("pageSize") ?? 25) || 25, url.searchParams.get("sort") ?? "date");
    return Response.json(res);
  } catch (e) {
    return apiError(e);
  }
}
