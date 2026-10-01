import { rtoCostFromAggregate, type CostModel } from "@/lib/domain/cost";
import type { AggRow } from "./types";

export const SCENARIO_TYPES = ["COD_REDUCTION", "ADDRESS_VERIFICATION", "CHANGE_COURIER", "EXTRA_ATTEMPT", "PREPAID_NUDGE"] as const;
export type ScenarioType = (typeof SCENARIO_TYPES)[number];

export interface ParamDef {
  key: string;
  label: string;
  default: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  help: string;
}

export const SCENARIO_META: Record<ScenarioType, { label: string; description: string; params: ParamDef[] }> = {
  COD_REDUCTION: {
    label: "Reduce COD exposure in the target segment",
    description: "A share of COD orders in the target segment are no longer offered COD; some of those customers pay prepaid instead.",
    params: [
      { key: "reductionPct", label: "COD orders no longer shipped as COD", default: 50, min: 0, max: 100, step: 5, unit: "%", help: "Assumption: share of target COD orders that lose the COD option." },
      { key: "conversionPct", label: "…of which convert to prepaid", default: 30, min: 0, max: 100, step: 5, unit: "%", help: "Assumption: the rest abandon the order (their margin is counted as lost)." },
    ],
  },
  ADDRESS_VERIFICATION: {
    label: "Require address / phone verification for the target segment",
    description: "Verify address and phone before dispatch; estimates how many addressable failures (address, phone, customer-unavailable) could be prevented.",
    params: [
      { key: "fixPct", label: "Addressable RTOs prevented by verification", default: 25, min: 0, max: 100, step: 5, unit: "%", help: "Assumption — no verification data exists in the dataset." },
      { key: "costPerCheck", label: "Verification cost per shipment", default: 3, min: 0, max: 100, step: 1, unit: "₹", help: "Assumption: cost of an IVR/WhatsApp check." },
    ],
  },
  CHANGE_COURIER: {
    label: "Route the target segment through a different courier",
    description: "Moves target shipments to the selected courier and applies that courier's OBSERVED RTO rate in comparable context (same payment type and regions).",
    params: [],
  },
  EXTRA_ATTEMPT: {
    label: "Add one additional delivery attempt",
    description: "Uses the observed success rate of the last attempt, discounted, on RTOs whose NDR reason is re-attemptable.",
    params: [
      { key: "decayPct", label: "Success of an extra attempt relative to the last observed attempt", default: 60, min: 0, max: 100, step: 5, unit: "%", help: "Assumption — a further attempt has never been observed in this data." },
      { key: "costPerAttempt", label: "Cost per extra attempt", default: 40, min: 0, max: 500, step: 5, unit: "₹", help: "Assumption." },
    ],
  },
  PREPAID_NUDGE: {
    label: "Move high-value COD orders to prepaid",
    description: "Offers a prepaid incentive on COD orders above a value threshold in the target segment; converted orders follow the observed prepaid RTO rate.",
    params: [
      { key: "minValue", label: "Only orders at or above", default: 1500, min: 0, max: 100000, step: 100, unit: "₹", help: "Order-value threshold." },
      { key: "conversionPct", label: "COD orders converting to prepaid", default: 25, min: 0, max: 100, step: 5, unit: "%", help: "Assumption." },
      { key: "discountPct", label: "Prepaid incentive", default: 3, min: 0, max: 50, step: 1, unit: "%", help: "Assumption: discount given on converted orders." },
    ],
  },
};

export type SimParams = Record<string, number>;

export interface SimInputs {
  baseline: AggRow;
  target: AggRow;
  targetCod: AggRow;
  targetCodHigh: AggRow;
  prepaidRef: { eligible: number; rto: number; source: "target" | "dataset" };
  alt: { eligible: number; rto: number; source: string; name: string } | null;
  attempts: Array<{ attempts: number; delivered: number; rto: number }>;
  cost: CostModel;
}

export interface SimSide {
  eligible: number;
  rto: number;
  rtoRate: number | null;
  rtoValue: number;
  rtoCost: number;
}

export interface SimResult {
  scenario: ScenarioType;
  label: string;
  disclaimer: string;
  current: SimSide;
  simulated: SimSide;
  diff: {
    rtoAvoided: number;
    rateDeltaPts: number | null;
    costSaved: number;
    valueRecovered: number;
    lostMargin: number;
    programCost: number;
    netBenefit: number;
  };
  targetSize: { shipments: number; eligible: number; rto: number };
  assumptions: string[];
  observed: Array<{ label: string; value: string }>;
  warnings: string[];
}

export const DISCLAIMER = "SIMULATION — NOT A GUARANTEED OUTCOME. Estimates use historical observed rates and the visible assumptions.";

const clampPct = (v: number | undefined, def: number) => Math.min(100, Math.max(0, Number.isFinite(v as number) ? (v as number) : def)) / 100;
const num = (v: number | undefined, def: number) => (Number.isFinite(v as number) ? (v as number) : def);
const r = (n: number, d: number) => (d > 0 ? n / d : 0);
const fmtPct = (x: number) => `${(x * 100).toFixed(1)}%`;

interface Partial {
  eligibleAfter: number;
  rtoAfter: number;
  rtoValueAfter: number;
  valueRecovered: number;
  lostMargin: number;
  programCost: number;
  assumptions: string[];
  observed: Array<{ label: string; value: string }>;
  warnings: string[];
}

export function simulate(scenario: ScenarioType, params: SimParams, inp: SimInputs): SimResult {
  const { baseline: b, target: t, cost } = inp;
  const E = b.eligible;
  const R = b.rto;
  const V = b.rtoValue;
  const avgRtoValue = t.rto > 0 ? t.rtoValue / t.rto : r(t.totalValue, t.shipments);
  const prepaidRate = r(inp.prepaidRef.rto, inp.prepaidRef.eligible);
  const warnings: string[] = [];
  if (t.shipments === 0) warnings.push("The target segment contains no shipments — nothing to simulate.");
  if (t.eligible > 0 && t.eligible < 30) warnings.push(`Low sample: only ${t.eligible} resolved shipments in the target segment.`);

  let p: Partial = {
    eligibleAfter: E, rtoAfter: R, rtoValueAfter: V, valueRecovered: 0, lostMargin: 0, programCost: 0,
    assumptions: [], observed: [], warnings,
  };

  if (scenario === "COD_REDUCTION") {
    const red = clampPct(params.reductionPct, 50);
    const conv = clampPct(params.conversionPct, 30);
    const tc = inp.targetCod;
    const removedE = tc.eligible * red;
    const removedR = tc.rto * red;
    const removedRV = tc.rtoValue * red;
    const convE = removedE * conv;
    const convR = convE * prepaidRate;
    const lostDelivered = tc.deliveredValue * red * (1 - conv);
    p = {
      ...p,
      eligibleAfter: E - removedE + convE,
      rtoAfter: R - removedR + convR,
      rtoValueAfter: V - removedRV + convR * avgRtoValue,
      lostMargin: lostDelivered * cost.marginRate,
      assumptions: [
        `${(red * 100).toFixed(0)}% of COD orders in the target lose the COD option (assumption).`,
        `${(conv * 100).toFixed(0)}% of those customers switch to prepaid and then fail at the observed prepaid rate (assumption); the rest abandon.`,
        `Margin on abandoned delivered orders is counted as lost at ${(cost.marginRate * 100).toFixed(0)}% of order value (Settings).`,
      ],
      observed: [
        { label: "Target COD resolved shipments", value: tc.eligible.toLocaleString("en-IN") },
        { label: "Target COD RTO rate (observed)", value: fmtPct(r(tc.rto, tc.eligible)) },
        { label: `Prepaid RTO rate (${inp.prepaidRef.source === "target" ? "in target" : "whole dataset"}, n=${inp.prepaidRef.eligible})`, value: fmtPct(prepaidRate) },
      ],
    };
    if (tc.eligible === 0) warnings.push("No resolved COD shipments in the target segment.");
  } else if (scenario === "ADDRESS_VERIFICATION") {
    const fix = clampPct(params.fixPct, 25);
    const costPer = num(params.costPerCheck, 3);
    const avoided = t.addressableRto * fix;
    const avoidedValue = t.addressableRtoValue * fix;
    p = {
      ...p,
      rtoAfter: R - avoided,
      rtoValueAfter: V - avoidedValue,
      valueRecovered: avoidedValue,
      programCost: t.dispatched * costPer,
      assumptions: [
        `Verification prevents ${(fix * 100).toFixed(0)}% of RTOs whose NDR reason is addressable (assumption).`,
        `Verification costs ₹${costPer} per dispatched shipment in the target (assumption).`,
        "Addressable reasons: customer unavailable, phone unreachable, address incomplete, reschedule requested.",
      ],
      observed: [
        { label: "Target RTOs", value: t.rto.toLocaleString("en-IN") },
        { label: "…with addressable NDR reason (observed)", value: `${t.addressableRto.toLocaleString("en-IN")} (${fmtPct(r(t.addressableRto, t.rto))})` },
      ],
    };
  } else if (scenario === "CHANGE_COURIER") {
    if (!inp.alt || inp.alt.eligible === 0) {
      warnings.push("The selected courier has no resolved shipments in a comparable context; no estimate can be made.");
    } else {
      const altRate = r(inp.alt.rto, inp.alt.eligible);
      const newRto = t.eligible * altRate;
      const avoided = t.rto - newRto;
      p = {
        ...p,
        rtoAfter: R - avoided,
        rtoValueAfter: V - avoided * avgRtoValue,
        valueRecovered: avoided * avgRtoValue,
        assumptions: [
          `Target shipments move to ${inp.alt.name} and fail at that courier's observed rate in comparable context (${inp.alt.source}).`,
          "Assumes the courier can absorb the extra volume at its current performance and pricing.",
        ],
        observed: [
          { label: "Target current RTO rate (observed)", value: fmtPct(r(t.rto, t.eligible)) },
          { label: `${inp.alt.name} RTO rate in comparable context (n=${inp.alt.eligible})`, value: fmtPct(altRate) },
        ],
      };
      if (inp.alt.eligible < 30) warnings.push(`Low sample for ${inp.alt.name} in comparable context (n=${inp.alt.eligible}); treat the estimate as weak evidence.`);
      if (avoided < 0) warnings.push(`${inp.alt.name} performed worse than the current couriers in this context — the estimate shows an increase in RTO.`);
    }
  } else if (scenario === "EXTRA_ATTEMPT") {
    const decay = clampPct(params.decayPct, 60);
    const costPer = num(params.costPerAttempt, 40);
    const rows = inp.attempts.filter((a) => a.rto > 0).sort((a, c) => c.rto - a.rto || c.attempts - a.attempts);
    const top = rows[0];
    const s = top ? r(top.delivered, top.delivered + top.rto) : 0;
    const reShare = r(t.addressableRto, t.rto);
    const avoided = t.rto * reShare * s * decay;
    p = {
      ...p,
      rtoAfter: R - avoided,
      rtoValueAfter: V - avoided * avgRtoValue,
      valueRecovered: avoided * avgRtoValue,
      programCost: t.rto * reShare * costPer,
      assumptions: [
        `An extra attempt succeeds at ${(decay * 100).toFixed(0)}% of the observed last-attempt success rate (assumption).`,
        `Extra attempts are made only on RTOs with re-attemptable reasons; each costs ₹${costPer} (assumption).`,
      ],
      observed: [
        { label: "Attempt count where most RTOs end", value: top ? String(top.attempts) : "—" },
        { label: "Observed success at that attempt", value: top ? `${fmtPct(s)} (${top.delivered} delivered vs ${top.rto} RTO)` : "—" },
        { label: "Share of RTOs with re-attemptable reason", value: fmtPct(reShare) },
      ],
    };
    if (!top) warnings.push("No RTO shipments in the target segment.");
  } else {
    const conv = clampPct(params.conversionPct, 25);
    const disc = clampPct(params.discountPct, 3);
    const hv = inp.targetCodHigh;
    const convE = hv.eligible * conv;
    const codRate = r(hv.rto, hv.eligible);
    const avoided = convE * (codRate - prepaidRate);
    const avgOrder = r(hv.totalValue, hv.shipments);
    p = {
      ...p,
      rtoAfter: R - avoided,
      rtoValueAfter: V - avoided * avgRtoValue,
      valueRecovered: avoided * avgRtoValue,
      programCost: convE * avgOrder * disc,
      assumptions: [
        `${(conv * 100).toFixed(0)}% of qualifying COD orders switch to prepaid (assumption) and then fail at the observed prepaid rate.`,
        `A ${(disc * 100).toFixed(0)}% prepaid incentive is paid on converted orders (assumption).`,
        `Qualifying orders: COD, ≥ ₹${num(params.minValue, 1500).toLocaleString("en-IN")}, inside the target segment.`,
      ],
      observed: [
        { label: "Qualifying COD resolved shipments", value: hv.eligible.toLocaleString("en-IN") },
        { label: "Their RTO rate (observed)", value: fmtPct(codRate) },
        { label: `Prepaid RTO rate (${inp.prepaidRef.source === "target" ? "in target" : "whole dataset"}, n=${inp.prepaidRef.eligible})`, value: fmtPct(prepaidRate) },
      ],
    };
    if (hv.eligible === 0) warnings.push("No qualifying COD shipments in the target segment for this value threshold.");
  }

  const rtoAfter = Math.max(0, p.rtoAfter);
  const rtoValueAfter = Math.max(0, p.rtoValueAfter);
  const side = (eligible: number, rto: number, rtoValue: number): SimSide => ({
    eligible,
    rto,
    rtoRate: eligible > 0 ? rto / eligible : null,
    rtoValue,
    rtoCost: rtoCostFromAggregate(rto, rtoValue, cost),
  });
  const current = side(E, R, V);
  const simulated = side(p.eligibleAfter, rtoAfter, rtoValueAfter);
  const costSaved = current.rtoCost - simulated.rtoCost;
  return {
    scenario,
    label: SCENARIO_META[scenario].label,
    disclaimer: DISCLAIMER,
    current,
    simulated,
    diff: {
      rtoAvoided: R - rtoAfter,
      rateDeltaPts: current.rtoRate !== null && simulated.rtoRate !== null ? (simulated.rtoRate - current.rtoRate) * 100 : null,
      costSaved,
      valueRecovered: p.valueRecovered,
      lostMargin: p.lostMargin,
      programCost: p.programCost,
      netBenefit: costSaved + p.valueRecovered * cost.marginRate - p.lostMargin - p.programCost,
    },
    targetSize: { shipments: t.shipments, eligible: t.eligible, rto: t.rto },
    assumptions: [...p.assumptions, `RTO cost model: ₹${cost.forwardCost} forward + ₹${cost.reverseCost} reverse + ₹${cost.handlingCost} handling + ${(cost.cogsRatio * cost.writeoffRate * 100).toFixed(1)}% of order value write-off (Settings).`],
    observed: p.observed,
    warnings: p.warnings,
  };
}
