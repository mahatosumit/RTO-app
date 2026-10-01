import { describe, expect, it } from "vitest";
import { computeMetrics, rate, recoverableValue, wilson } from "@/lib/analytics/metrics";
import { detectRateAnomaly, zScore, type WeekCount } from "@/lib/analytics/anomaly";
import { recurrenceFromWeeks, scoreCandidate, selectShortlist, type SegmentInput } from "@/lib/analytics/rootcause";
import { simulate, type SimInputs } from "@/lib/analytics/simulate";
import { emptyAgg, type AggRow } from "@/lib/analytics/types";
import { parseFilters, filtersToQuery, buildWhere } from "@/lib/analytics/filters";
import { DEFAULT_COST_MODEL } from "@/lib/domain/cost";
import { MockProvider, getProvider, aiStatus } from "@/lib/ai/provider";
import { aiNormalizeNdrReasons, aiSuggestMapping, aiSummarize } from "@/lib/ai/assist";

const agg = (o: Partial<AggRow>): AggRow => ({ ...emptyAgg(), ...o });

describe("metrics", () => {
  it("never divides by zero", () => {
    expect(rate(0, 0)).toBeNull();
    expect(wilson(0, 0)).toBeNull();
    const m = computeMetrics(emptyAgg(), DEFAULT_COST_MODEL);
    expect(m.rtoRate).toBeNull();
    expect(m.codRtoRate).toBeNull();
    expect(m.rtoCost).toBe(0);
    expect(m.recoverableValue).toBe(0);
  });
  it("handles all-delivered and all-RTO populations", () => {
    expect(computeMetrics(agg({ shipments: 10, dispatched: 10, eligible: 10, delivered: 10 }), DEFAULT_COST_MODEL).rtoRate).toBe(0);
    const all = computeMetrics(agg({ shipments: 10, dispatched: 10, eligible: 10, rto: 10, rtoValue: 10000 }), DEFAULT_COST_MODEL);
    expect(all.rtoRate).toBe(1);
    expect(all.rtoCost).toBeCloseTo(10 * 165 + 10000 * 0.4 * 0.05, 6);
  });
  it("computes COD/prepaid/NDR rates with the documented populations", () => {
    const m = computeMetrics(agg({ shipments: 100, dispatched: 90, eligible: 80, rto: 16, codEligible: 50, codRto: 15, prepaidEligible: 30, prepaidRto: 1, ndrShipments: 27, ndrResolved: 20, ndrDelivered: 15 }), DEFAULT_COST_MODEL);
    expect(m.rtoRate).toBeCloseTo(0.2);
    expect(m.codRtoRate).toBeCloseTo(0.3);
    expect(m.prepaidRtoRate).toBeCloseTo(1 / 30);
    expect(m.ndrRate).toBeCloseTo(0.3);
    expect(m.ndrRecoveryRate).toBeCloseTo(0.75);
  });
  it("estimates recoverable value from observed recovery and clamps", () => {
    expect(recoverableValue({ addressableRtoValue: 1000, addrDelivered: 30, addrResolved: 100 })).toBeCloseTo(300);
    expect(recoverableValue({ addressableRtoValue: 1000, addrDelivered: 0, addrResolved: 0 })).toBe(0);
  });
  it("computes Wilson intervals", () => {
    const w = wilson(50, 100)!;
    expect(w.lower).toBeCloseTo(0.404, 2);
    expect(w.upper).toBeCloseTo(0.596, 2);
  });
});

describe("anomaly detection", () => {
  const weeks = (cur: { n: number; rto: number }, base = { n: 100, rto: 10 }): WeekCount[] => [{ w: 0, ...cur }, ...Array.from({ length: 8 }, (_, i) => ({ w: i + 1, ...base }))];
  it("flags an unusual increase with baseline and current values", () => {
    const r = detectRateAnomaly(weeks({ n: 100, rto: 30 }));
    expect(r.flagged).toBe(true);
    expect(r.severity).toBe("CRITICAL");
    expect(r.ratio).toBeCloseTo(3);
    expect(r.baseline.rate).toBeCloseTo(0.1);
    expect(r.baseline.minWeekRate).toBeCloseTo(0.1);
    expect(r.current.rate).toBeCloseTo(0.3);
  });
  it("does not flag normal variation or small samples", () => {
    expect(detectRateAnomaly(weeks({ n: 100, rto: 12 })).flagged).toBe(false);
    expect(detectRateAnomaly(weeks({ n: 10, rto: 9 })).reason).toBe("insufficient_current_sample");
    expect(detectRateAnomaly(weeks({ n: 100, rto: 30 }, { n: 10, rto: 1 })).reason).toBe("insufficient_baseline_sample");
    expect(detectRateAnomaly([]).flagged).toBe(false);
  });
  it("handles zero baseline rate", () => {
    expect(detectRateAnomaly(weeks({ n: 100, rto: 30 }, { n: 100, rto: 0 })).reason).toBe("no_baseline_rate");
  });
  it("z-score helper", () => {
    expect(zScore(10, [1, 1, 1])).toBeNull();
    expect(zScore(5, [1, 2, 3])).toBeCloseTo(3);
  });
});

describe("root-cause scoring", () => {
  const totals = { eligible: 1000, rto: 100, rtoValue: 100000 };
  const seg = (o: Partial<SegmentInput> = {}): SegmentInput => ({ key: "560067", dims: ["pincode"], eligible: 100, rto: 40, rtoValue: 40000, codRto: 35, ...o });
  it("surfaces a concentrated segment and explains why", () => {
    const c = scoreCandidate(seg(), totals, { above: 10, weeks: 12, share: 10 / 12 })!;
    expect(c).not.toBeNull();
    expect(c.liftRatio).toBeCloseTo(4);
    expect(c.volumeShare).toBeCloseTo(0.4);
    expect(c.codShare).toBeCloseTo(0.875);
    expect(c.score).toBeGreaterThan(50);
    expect(c.score).toBeLessThanOrEqual(100);
    expect(c.reasons.join(" ")).toContain("sample size = 100");
    expect(c.reasons.join(" ")).toContain("% of failures are COD");
    expect(c.filters).toEqual({ pincode: ["560067"] });
  });
  it("applies gates: sample, RTO count, lift, significance", () => {
    expect(scoreCandidate(seg({ eligible: 20, rto: 10 }), totals, null)).toBeNull();
    expect(scoreCandidate(seg({ eligible: 100, rto: 4 }), totals, null)).toBeNull();
    expect(scoreCandidate(seg({ eligible: 100, rto: 10 }), totals, null)).toBeNull();
    expect(scoreCandidate(seg({ eligible: 32, rto: 6 }), totals, null)).toBeNull(); // 18.7% — lift 1.87 but interval includes baseline
    expect(scoreCandidate(seg(), { eligible: 0, rto: 0, rtoValue: 0 }, null)).toBeNull();
  });
  it("ranks bigger excess higher and de-duplicates overlapping refinements", () => {
    const a = scoreCandidate(seg(), totals, null)!;
    const b = scoreCandidate(seg({ key: "560068", eligible: 60, rto: 20, rtoValue: 20000, codRto: 10 }), totals, null)!;
    expect(a.score).toBeGreaterThan(b.score);
    const pair = scoreCandidate({ ...seg({ key: "COD | 560", dims: ["payment", "pin3"], rto: 38 }) }, totals, null)!;
    const single = scoreCandidate({ ...seg({ key: "560", dims: ["pin3"], rto: 40 }) }, totals, null)!;
    const short = selectShortlist([pair, single], 5);
    expect(short).toHaveLength(1);
  });
  it("computes recurrence over weeks with enough data", () => {
    const r = recurrenceFromWeeks([{ w: 1, n: 10, rto: 5 }, { w: 2, n: 10, rto: 0 }, { w: 3, n: 2, rto: 2 }], 0.1)!;
    expect(r).toEqual({ above: 1, weeks: 2, share: 0.5 });
    expect(recurrenceFromWeeks([], 0.1)).toBeNull();
  });
});

describe("intervention simulation", () => {
  const target = agg({ shipments: 200, dispatched: 195, eligible: 180, rto: 60, rtoValue: 60000, totalValue: 200000, deliveredValue: 120000, addressableRto: 30, addressableRtoValue: 30000 });
  const inputs = (o: Partial<SimInputs> = {}): SimInputs => ({
    baseline: agg({ shipments: 1200, eligible: 1000, rto: 100, rtoValue: 100000 }),
    target,
    targetCod: target,
    targetCodHigh: agg({ shipments: 100, eligible: 90, rto: 36, totalValue: 150000 }),
    prepaidRef: { eligible: 300, rto: 15, source: "target" },
    alt: { eligible: 100, rto: 5, source: "test", name: "Beta" },
    attempts: [{ attempts: 1, delivered: 100, rto: 5 }, { attempts: 3, delivered: 10, rto: 40 }],
    cost: DEFAULT_COST_MODEL,
    ...o,
  });
  it("COD reduction removes exposure and converts some to prepaid", () => {
    const r = simulate("COD_REDUCTION", { reductionPct: 50, conversionPct: 30 }, inputs());
    expect(r.simulated.rto).toBeCloseTo(100 - 30 + 1.35, 5);
    expect(r.simulated.eligible).toBeCloseTo(1000 - 90 + 27, 5);
    expect(r.simulated.rtoRate!).toBeLessThan(r.current.rtoRate!);
    expect(r.diff.lostMargin).toBeGreaterThan(0);
  });
  it("address verification avoids a share of addressable RTOs at a program cost", () => {
    const r = simulate("ADDRESS_VERIFICATION", { fixPct: 25, costPerCheck: 3 }, inputs());
    expect(r.diff.rtoAvoided).toBeCloseTo(7.5);
    expect(r.diff.programCost).toBeCloseTo(195 * 3);
    expect(r.diff.valueRecovered).toBeCloseTo(7500);
  });
  it("change courier applies the alternative courier's observed rate and warns on low sample", () => {
    const r = simulate("CHANGE_COURIER", {}, inputs());
    expect(r.diff.rtoAvoided).toBeCloseTo(60 - 180 * 0.05);
    const low = simulate("CHANGE_COURIER", {}, inputs({ alt: { eligible: 10, rto: 1, source: "x", name: "Beta" } }));
    expect(low.warnings.join(" ")).toContain("Low sample");
    const none = simulate("CHANGE_COURIER", {}, inputs({ alt: null }));
    expect(none.diff.rtoAvoided).toBe(0);
    expect(none.warnings.length).toBeGreaterThan(0);
    const worse = simulate("CHANGE_COURIER", {}, inputs({ alt: { eligible: 100, rto: 90, source: "x", name: "Bad" } }));
    expect(worse.diff.rtoAvoided).toBeLessThan(0);
    expect(worse.warnings.join(" ")).toContain("worse");
  });
  it("extra attempt uses the discounted observed last-attempt success", () => {
    const r = simulate("EXTRA_ATTEMPT", { decayPct: 60, costPerAttempt: 40 }, inputs());
    expect(r.diff.rtoAvoided).toBeCloseTo(60 * 0.5 * 0.2 * 0.6);
    expect(r.observed.some((o) => o.label.includes("Attempt count"))).toBe(true);
  });
  it("prepaid nudge converts qualifying COD orders at the observed prepaid rate", () => {
    const r = simulate("PREPAID_NUDGE", { minValue: 1500, conversionPct: 25, discountPct: 3 }, inputs());
    expect(r.diff.rtoAvoided).toBeCloseTo(22.5 * (0.4 - 0.05));
    expect(r.diff.programCost).toBeCloseTo(22.5 * 1500 * 0.03);
  });
  it("is honest about empty targets and always labels assumptions", () => {
    const empty = agg({});
    for (const s of ["COD_REDUCTION", "ADDRESS_VERIFICATION", "CHANGE_COURIER", "EXTRA_ATTEMPT", "PREPAID_NUDGE"] as const) {
      const r = simulate(s, {}, inputs({ target: empty, targetCod: empty, targetCodHigh: empty, attempts: [] }));
      expect(r.diff.rtoAvoided).toBeCloseTo(0);
      expect(r.warnings.length).toBeGreaterThan(0);
      expect(r.assumptions.length).toBeGreaterThan(0);
      expect(r.disclaimer).toContain("NOT A GUARANTEED OUTCOME");
    }
  });
  it("handles zero-baseline datasets without NaN", () => {
    const r = simulate("ADDRESS_VERIFICATION", {}, inputs({ baseline: emptyAgg(), target: emptyAgg() }));
    expect(r.current.rtoRate).toBeNull();
    expect(Number.isNaN(r.diff.netBenefit)).toBe(false);
  });
});

describe("filters", () => {
  it("parses and serialises query filters; rejects malformed dates", () => {
    const f = parseFilters({ courier: "A|B", payment: "COD", from: "2025-01-01", to: "garbage", minValue: "1500" });
    expect(f).toEqual({ courier: ["A", "B"], payment: ["COD"], from: "2025-01-01", minValue: 1500 });
    expect(filtersToQuery(f)).toContain("courier=A%7CB");
    expect(filtersToQuery({})).toBe("");
  });
  it("rejects invalid dataset ids before building SQL", () => {
    expect(() => buildWhere("not-a-uuid", {})).toThrow();
  });
});

describe("AI provider abstraction", () => {
  it("is optional and never exposes keys", () => {
    expect(getProvider({} as NodeJS.ProcessEnv)).toBeNull();
    expect(getProvider({ AI_PROVIDER: "none", AI_API_KEY: "x" } as unknown as NodeJS.ProcessEnv)).toBeNull();
    expect(getProvider({ AI_PROVIDER: "mock" } as unknown as NodeJS.ProcessEnv)?.name).toBe("mock");
    expect(getProvider({ OPENAI_API_KEY: "sk-secret" } as unknown as NodeJS.ProcessEnv)?.name).toBe("openai-compatible");
    expect(getProvider({ ANTHROPIC_API_KEY: "sk-ant" } as unknown as NodeJS.ProcessEnv)?.name).toBe("anthropic");
    expect(JSON.stringify(aiStatus({ OPENAI_API_KEY: "sk-secret" } as unknown as NodeJS.ProcessEnv))).not.toContain("sk-secret");
  });
  it("validates AI column-mapping output against whitelists", async () => {
    const p = new MockProvider(() => JSON.stringify({ mapping: { customer_id: "buyer", category: "NOT_A_HEADER", shipment_id: "buyer" } }));
    const current = { shipment_id: "awb", customer_id: null, category: null } as Record<string, string | null>;
    const r = await aiSuggestMapping(["awb", "buyer"], [{ awb: "1", buyer: "x" }], "SHIPMENTS", current, p);
    expect(r.mapping.customer_id).toBe("buyer");
    expect(r.mapping.category).toBeNull();
    expect(r.mapping.shipment_id).toBe("awb");
    expect(r.aiSuggested).toEqual(["customer_id"]);
  });
  it("falls back deterministically when no provider or the provider fails", async () => {
    const cur = { shipment_id: null } as Record<string, string | null>;
    expect((await aiSuggestMapping(["a"], [], "SHIPMENTS", cur, null)).mapping).toEqual(cur);
    const bad = new MockProvider(() => { throw new Error("down"); });
    const r = await aiSuggestMapping(["a"], [], "SHIPMENTS", cur, bad);
    expect(r.mapping).toEqual(cur);
    expect(r.error).toBeTruthy();
    expect(await aiSummarize({ x: 1 }, bad)).toBeNull();
    expect(await aiSummarize({ x: 1 }, null)).toBeNull();
  });
  it("restricts NDR classification to the taxonomy and labels the provider", async () => {
    const p = new MockProvider(() => JSON.stringify({ classes: { "door was shut": "CUSTOMER_UNAVAILABLE", "weird": "MADE_UP" } }));
    const r = await aiNormalizeNdrReasons(["door was shut", "weird"], p);
    expect(r.suggestions).toEqual({ "door was shut": "CUSTOMER_UNAVAILABLE" });
    expect(r.label?.provider).toBe("mock");
    const s = await aiSummarize({ a: 1 }, new MockProvider());
    expect(s?.text).toContain("MOCK PROVIDER");
  });
});
