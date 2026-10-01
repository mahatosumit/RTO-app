import { z } from "zod";
import { ApiError, apiError } from "@/lib/api";
import { aiSuggestMapping } from "@/lib/ai/assist";
import { createImportJob, MAX_UPLOAD_BYTES, parseCsvText } from "@/lib/csv/pipeline";
import { isUuid } from "@/lib/analytics/filters";
import { getDatasetById } from "@/lib/org";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const meta = z.object({
  kind: z.enum(["SHIPMENTS", "EVENTS"]).default("SHIPMENTS"),
  datasetName: z.string().trim().min(1).max(120).optional(),
  targetDatasetId: z.string().optional(),
});

const ALLOWED_TYPES = new Set(["", "text/csv", "text/plain", "application/csv", "application/vnd.ms-excel"]);

export async function POST(req: Request) {
  try {
    const form = await req.formData().catch(() => {
      throw new ApiError(400, "INVALID_FORM", "Upload a CSV file using multipart form data.");
    });
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError(400, "NO_FILE", "No file was uploaded.");
    if (file.size > MAX_UPLOAD_BYTES()) throw new ApiError(413, "FILE_TOO_LARGE", `File is larger than the ${Math.round(MAX_UPLOAD_BYTES() / 1048576)} MB limit.`);
    if (!ALLOWED_TYPES.has(file.type)) throw new ApiError(400, "INVALID_FILE_TYPE", "Only CSV files are supported.");
    const m = meta.parse({
      kind: form.get("kind") ?? undefined,
      datasetName: (form.get("datasetName") as string | null) || undefined,
      targetDatasetId: (form.get("targetDatasetId") as string | null) || undefined,
    });
    if (m.kind === "EVENTS") {
      if (!m.targetDatasetId || !isUuid(m.targetDatasetId) || !(await getDatasetById(m.targetDatasetId))) throw new ApiError(400, "NO_TARGET_DATASET", "Choose an existing dataset for the events file.");
    }
    const content = await file.text();
    const job = await createImportJob({ fileName: file.name, content, size: file.size, kind: m.kind, datasetName: m.datasetName, targetDatasetId: m.targetDatasetId });
    // Optional AI assist for columns the deterministic matcher could not map (validated, never required).
    const ai = await aiSuggestMapping(job.headers, job.sampleRows, m.kind, job.suggestedMapping);
    void parseCsvText;
    return Response.json({ ok: true, job: { ...job, suggestedMapping: ai.mapping }, ai: { used: !!ai.label, label: ai.label, suggestedFields: ai.aiSuggested, error: ai.error ?? null } });
  } catch (e) {
    return apiError(e);
  }
}
