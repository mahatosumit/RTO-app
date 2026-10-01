import { ApiError, apiError, datasetFromRequest } from "@/lib/api";
import { isUuid } from "@/lib/analytics/filters";
import { aiSummarize } from "@/lib/ai/assist";
import { getFinding } from "@/lib/findings";
import { audit } from "@/lib/org";
import { buildDatasetReport, buildInvestigationReport } from "@/lib/report";

export const dynamic = "force-dynamic";

/** GET /api/reports/{findingId | dataset}?format=md|html|json&ai=1 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const url = new URL(req.url);
    const format = url.searchParams.get("format") ?? "md";
    if (!["md", "html", "json"].includes(format)) throw new ApiError(400, "INVALID_FORMAT", "format must be md, html or json.");
    let report;
    if (id === "dataset") {
      const ds = await datasetFromRequest(req);
      report = await buildDatasetReport(ds.id);
    } else {
      if (!isUuid(id)) throw new ApiError(400, "INVALID_ID", "Invalid id.");
      let ai: { text: string; provider: string; model: string } | null = null;
      if (url.searchParams.get("ai") === "1") {
        const f = await getFinding(id);
        const r = f ? await aiSummarize({ title: f.title, evidence: f.evidence }) : null;
        if (r) ai = { text: r.text, provider: r.label.provider, model: r.label.model };
      }
      report = await buildInvestigationReport(id, ai);
    }
    if (!report) throw new ApiError(404, "NOT_FOUND", "Report source not found.");
    await audit("report.export", "report", id, { format });
    const name = report.title.replace(/[^a-z0-9]+/gi, "_").slice(0, 60);
    if (format === "json") return Response.json(report.json);
    if (format === "html") return new Response(report.html, { headers: { "content-type": "text/html; charset=utf-8" } });
    return new Response(report.markdown, { headers: { "content-type": "text/markdown; charset=utf-8", "content-disposition": `attachment; filename="${name}.md"` } });
  } catch (e) {
    return apiError(e);
  }
}
