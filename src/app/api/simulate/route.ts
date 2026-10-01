import { z } from "zod";
import { ApiError, apiError, asOfString, datasetFromRequest, readJson } from "@/lib/api";
import { runSimulation } from "@/lib/analytics/insights";
import { SCENARIO_TYPES } from "@/lib/analytics/simulate";
import { FILTER_LIST_KEYS, type Filters } from "@/lib/analytics/types";
import { isUuid } from "@/lib/analytics/filters";
import { getCostModel } from "@/lib/org";
import { saveSimulation } from "@/lib/simulations";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const list = z.array(z.string().max(120)).max(500).optional();
const body = z.object({
  scenario: z.enum(SCENARIO_TYPES),
  params: z.record(z.string(), z.number().finite()).default({}),
  target: z
    .object({
      filters: z
        .object({
          courier: list, payment: list, state: list, region: list, pincode: list, pin3: list, product: list, category: list, valueBand: list, repeat: list, ndrReason: list, status: list, attempts: list,
          from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
          to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
          minValue: z.number().min(0).optional(),
        })
        .default({}),
      autoHighRisk: z.boolean().optional(),
      autoMax: z.number().int().min(1).max(100).optional(),
      altCourier: z.string().max(120).optional(),
    })
    .default({ filters: {} }),
  findingId: z.string().optional(),
  save: z.boolean().optional(),
});

export async function POST(req: Request) {
  try {
    const ds = await datasetFromRequest(req);
    const b = body.parse(await readJson(req));
    if (b.scenario === "CHANGE_COURIER" && !b.target.altCourier) throw new ApiError(400, "INVALID_INPUT", "Choose the courier to route the target shipments through.");
    const filters: Filters = {};
    for (const k of FILTER_LIST_KEYS) if (b.target.filters[k]?.length) filters[k] = b.target.filters[k];
    if (b.target.filters.from) filters.from = b.target.filters.from;
    if (b.target.filters.to) filters.to = b.target.filters.to;
    if (b.target.filters.minValue !== undefined) filters.minValue = b.target.filters.minValue;
    const cost = await getCostModel();
    const { result, target } = await runSimulation(ds.id, asOfString(ds), b.scenario, b.params, { ...b.target, filters }, cost);
    let simulationId: string | null = null;
    if (b.save) {
      if (b.findingId && !isUuid(b.findingId)) throw new ApiError(400, "INVALID_ID", "Invalid finding id.");
      simulationId = await saveSimulation(ds.id, b.findingId ?? null, b.scenario, b.params, target, result);
    }
    return Response.json({ ok: true, result, target, simulationId });
  } catch (e) {
    return apiError(e);
  }
}
