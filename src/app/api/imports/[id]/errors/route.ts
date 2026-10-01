import { ApiError, apiError } from "@/lib/api";
import { isUuid } from "@/lib/analytics/filters";
import { getImportErrors } from "@/lib/csv/pipeline";
import { toCsv } from "@/lib/csv/sanitize";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!isUuid(id)) throw new ApiError(400, "INVALID_ID", "Invalid import id.");
    const url = new URL(req.url);
    const severity = url.searchParams.get("severity") ?? undefined;
    const code = url.searchParams.get("code") ?? undefined;
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 100) || 100, 5000);
    const offset = Math.max(Number(url.searchParams.get("offset") ?? 0) || 0, 0);
    const rows = await getImportErrors(id, { severity, code, limit, offset });
    if (url.searchParams.get("format") === "csv") {
      const csv = toCsv(["row", "severity", "code", "field", "message", "raw_row"], rows.map((r) => ({ row: r.rowNumber, severity: r.severity, code: r.code, field: r.field, message: r.message, raw_row: r.raw ? JSON.stringify(r.raw) : "" })));
      return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="import_errors_${id.slice(0, 8)}.csv"` } });
    }
    return Response.json({ errors: rows });
  } catch (e) {
    return apiError(e);
  }
}
