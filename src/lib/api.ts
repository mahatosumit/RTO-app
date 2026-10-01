import { ZodError } from "zod";
import { getActiveDataset } from "@/lib/active";
import { isUuid } from "@/lib/analytics/filters";
import type { DatasetInfo } from "@/lib/analytics/types";
import { getDatasetById } from "@/lib/org";

import { ApiError } from "@/lib/api-error";

export { ApiError };

export function apiError(e: unknown): Response {
  if (e instanceof ApiError) return Response.json({ error: { code: e.code, message: e.message } }, { status: e.status });
  if (e instanceof ZodError) {
    return Response.json(
      { error: { code: "INVALID_INPUT", message: "Invalid input.", issues: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })) } },
      { status: 400 },
    );
  }
  console.error(JSON.stringify({ level: "error", msg: "unhandled api error", err: e instanceof Error ? e.stack : String(e) }));
  return Response.json({ error: { code: "INTERNAL", message: "Something went wrong. Please try again." } }, { status: 500 });
}

/** Resolve dataset from `?dataset=` (validated) or the active-dataset cookie. */
export async function datasetFromRequest(req: Request): Promise<DatasetInfo> {
  const url = new URL(req.url);
  const explicit = url.searchParams.get("dataset");
  if (explicit) {
    if (!isUuid(explicit)) throw new ApiError(400, "INVALID_DATASET", "Invalid dataset id.");
    const d = await getDatasetById(explicit);
    if (!d) throw new ApiError(404, "DATASET_NOT_FOUND", "Dataset not found.");
    return d;
  }
  const d = await getActiveDataset();
  if (!d) throw new ApiError(404, "NO_DATASET", "No dataset yet. Import a CSV or load the demo dataset first.");
  return d;
}

export { asOfString } from "@/lib/org";

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new ApiError(400, "INVALID_JSON", "Request body must be valid JSON.");
  }
}
