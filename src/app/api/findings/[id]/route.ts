import { z } from "zod";
import { ApiError, apiError, readJson } from "@/lib/api";
import { aiSummarize } from "@/lib/ai/assist";
import { isUuid } from "@/lib/analytics/filters";
import { addNote, getFinding, INVESTIGATION_STATUSES, openInvestigation, setInvestigationStatus } from "@/lib/findings";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function id(ctx: Ctx) {
  const { id } = await ctx.params;
  if (!isUuid(id)) throw new ApiError(400, "INVALID_ID", "Invalid id.");
  return id;
}

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const f = await getFinding(await id(ctx));
    if (!f) throw new ApiError(404, "NOT_FOUND", "Finding not found.");
    return Response.json({ finding: f });
  } catch (e) {
    return apiError(e);
  }
}

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("investigate") }),
  z.object({ action: z.literal("status"), status: z.enum(INVESTIGATION_STATUSES) }),
  z.object({ action: z.literal("note"), body: z.string().trim().min(1).max(4000) }),
  z.object({ action: z.literal("summarize") }),
]);

/** Mutations on a finding's investigation: investigate | status | note | summarize (optional AI). */
export async function POST(req: Request, ctx: Ctx) {
  try {
    const findingId = await id(ctx);
    const b = body.parse(await readJson(req));
    const f = await getFinding(findingId);
    if (!f) throw new ApiError(404, "NOT_FOUND", "Finding not found.");
    if (b.action === "summarize") {
      const r = await aiSummarize({ title: f.title, evidence: f.evidence, affectedValue: f.affectedValue });
      if (!r) return Response.json({ ok: true, ai: false, message: "AI is not configured or unavailable — the deterministic summary is shown instead." });
      return Response.json({ ok: true, ai: true, text: r.text, label: r.label });
    }
    const invId = await openInvestigation(findingId);
    if (b.action === "status") await setInvestigationStatus(invId, b.status);
    if (b.action === "note") await addNote(invId, b.body);
    return Response.json({ ok: true, investigationId: invId });
  } catch (e) {
    return apiError(e);
  }
}
