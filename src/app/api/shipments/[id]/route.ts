import { ApiError, apiError } from "@/lib/api";
import { getShipmentDetail } from "@/lib/shipments";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const d = await getShipmentDetail(id);
    if (!d) throw new ApiError(404, "NOT_FOUND", "Shipment not found.");
    return Response.json(d);
  } catch (e) {
    return apiError(e);
  }
}
