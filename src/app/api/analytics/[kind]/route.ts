import { ApiError, apiError, asOfString, datasetFromRequest } from "@/lib/api";
import { aggregateBy, aggregateTotal } from "@/lib/analytics/aggregate";
import { parseFilters } from "@/lib/analytics/filters";
import { findCandidates, scanAnomalies } from "@/lib/analytics/insights";
import { computeMetrics } from "@/lib/analytics/metrics";
import { DIMENSIONS, type DimKey } from "@/lib/analytics/types";
import { getCostModel } from "@/lib/org";

export const dynamic = "force-dynamic";

/** GET /api/analytics/{summary|segments|candidates|anomalies}?dim=&<filters> */
export async function GET(req: Request, ctx: { params: Promise<{ kind: string }> }) {
  try {
    const { kind } = await ctx.params;
    const ds = await datasetFromRequest(req);
    const url = new URL(req.url);
    const filters = parseFilters(Object.fromEntries(url.searchParams));
    const cost = await getCostModel();
    if (kind === "summary") {
      const total = await aggregateTotal(ds.id, filters);
      return Response.json({ dataset: { id: ds.id, name: ds.name, isDemo: ds.isDemo }, asOf: asOfString(ds), totals: total, metrics: computeMetrics(total, cost) });
    }
    if (kind === "segments") {
      const dim = url.searchParams.get("dim") ?? "courier";
      if (!(DIMENSIONS as readonly string[]).includes(dim)) throw new ApiError(400, "INVALID_DIMENSION", "Unknown dimension.");
      const limit = Math.min(Number(url.searchParams.get("limit") ?? 200) || 200, 1000);
      const rows = await aggregateBy(ds.id, [dim as DimKey], filters, { limit, orderBy: dim === "week" || dim === "month" || dim === "day" ? "key" : "rto" });
      return Response.json({ dim, rows: rows.map((r) => ({ ...r, metrics: computeMetrics(r, cost) })) });
    }
    if (kind === "candidates") {
      const res = await findCandidates(ds.id, asOfString(ds), filters);
      return Response.json({ baselineRate: res.baselineRate, candidates: res.candidates.slice(0, 50) });
    }
    if (kind === "anomalies") {
      const all = await scanAnomalies(ds.id, asOfString(ds), filters);
      return Response.json({ anomalies: all.filter((a) => a.result.flagged), scanned: all.length });
    }
    throw new ApiError(404, "NOT_FOUND", "Unknown analytics endpoint.");
  } catch (e) {
    return apiError(e);
  }
}
