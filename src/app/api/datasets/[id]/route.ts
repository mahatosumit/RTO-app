import { ApiError, apiError } from "@/lib/api";
import { isUuid } from "@/lib/analytics/filters";
import { audit, deleteDataset, getDatasetById } from "@/lib/org";

export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!isUuid(id)) throw new ApiError(400, "INVALID_ID", "Invalid dataset id.");
    const ds = await getDatasetById(id);
    if (!ds) throw new ApiError(404, "DATASET_NOT_FOUND", "Dataset not found.");
    await deleteDataset(id);
    await audit("dataset.delete", "dataset", id, { name: ds.name, shipments: ds.shipmentCount });
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
