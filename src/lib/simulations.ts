import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { simulationResults, simulations } from "@/db/schema";
import { audit } from "@/lib/org";
import type { SimResult } from "@/lib/analytics/simulate";
import type { ResolvedTarget } from "@/lib/analytics/insights";

export async function saveSimulation(datasetId: string, findingId: string | null, scenario: string, params: unknown, target: ResolvedTarget, result: SimResult): Promise<string> {
  const [sim] = await db
    .insert(simulations)
    .values({ datasetId, findingId, scenario, params: params as never, target: { ...target, riskPincodes: target.riskPincodes.slice(0, 100) } as never })
    .returning();
  await db.insert(simulationResults).values({ simulationId: sim.id, result: result as never });
  await audit("simulation.save", "simulation", sim.id, { scenario, findingId });
  return sim.id;
}

export async function latestSimulationForFinding(findingId: string): Promise<{ id: string; scenario: string; params: Record<string, number>; target: ResolvedTarget; result: SimResult; createdAt: Date } | null> {
  const rows = await db
    .select({ sim: simulations, res: simulationResults })
    .from(simulations)
    .innerJoin(simulationResults, eq(simulationResults.simulationId, simulations.id))
    .where(eq(simulations.findingId, findingId))
    .orderBy(desc(simulations.createdAt))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  return { id: r.sim.id, scenario: r.sim.scenario, params: r.sim.params as Record<string, number>, target: r.sim.target as ResolvedTarget, result: r.res.result as SimResult, createdAt: r.res.createdAt };
}
