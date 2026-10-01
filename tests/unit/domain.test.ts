import { describe, expect, it } from "vitest";
import { parseDate, parseDateDetailed } from "@/lib/domain/dates";
import { classifyShipment, findImpossibleTransitions, isEligibleStatus, normalizeEventType, normalizeStatusText } from "@/lib/domain/classify";
import { normalizeNdrReason } from "@/lib/domain/ndr";
import { CourierRegistry, courierKey, prettyCourier } from "@/lib/domain/courier";
import { geoFromPincode, isValidPincode } from "@/lib/domain/geo";
import { formatINR, rtoCostForShipment, rtoCostFromAggregate, DEFAULT_COST_MODEL, valueBand } from "@/lib/domain/cost";

describe("date parsing", () => {
  const expected = "2025-09-10T03:42:00.000Z"; // 09:12 IST
  it("parses ISO, day-first and text-month formats as IST", () => {
    expect(parseDate("2025-09-10 09:12")?.toISOString()).toBe(expected);
    expect(parseDate("10/09/2025 09:12")?.toISOString()).toBe(expected);
    expect(parseDate("10-09-2025 09:12")?.toISOString()).toBe(expected);
    expect(parseDate("10 Sep 2025 09:12")?.toISOString()).toBe(expected);
    expect(parseDate("2025-09-10T09:12:00Z")?.toISOString()).toBe("2025-09-10T09:12:00.000Z");
    expect(parseDate("10/09/2025 09:12 AM")?.toISOString()).toBe(expected);
  });
  it("distinguishes missing from invalid", () => {
    expect(parseDateDetailed("").status).toBe("missing");
    expect(parseDateDetailed("N/A").status).toBe("missing");
    expect(parseDateDetailed("31/02/2025").status).toBe("invalid");
    expect(parseDateDetailed("32/13/2025").status).toBe("invalid");
    expect(parseDateDetailed("garbage").status).toBe("invalid");
    expect(parseDate("1999-01-01")).toBeNull();
  });
});

describe("status and event classification", () => {
  it("normalises status text", () => {
    expect(normalizeStatusText("Delivered")).toBe("DELIVERED");
    expect(normalizeStatusText("Undelivered")).toBe("NDR");
    expect(normalizeStatusText("RTO Delivered")).toBe("RTO");
    expect(normalizeStatusText("Returned to Origin")).toBe("RTO");
    expect(normalizeStatusText("Out For Delivery")).toBe("IN_TRANSIT");
    expect(normalizeStatusText("Cancelled")).toBe("CANCELLED");
    expect(normalizeStatusText("Lost")).toBe("LOST");
    expect(normalizeStatusText("something odd")).toBe("UNKNOWN");
    expect(normalizeStatusText("")).toBe("UNKNOWN");
  });
  it("normalises event types", () => {
    expect(normalizeEventType("Order Created")).toBe("ORDERED");
    expect(normalizeEventType("Picked Up")).toBe("DISPATCHED");
    expect(normalizeEventType("Arrived at Hub")).toBe("IN_TRANSIT");
    expect(normalizeEventType("Undelivered - Attempt Failed")).toBe("NDR");
    expect(normalizeEventType("RTO Initiated")).toBe("RTO_INITIATED");
    expect(normalizeEventType("RTO In Transit")).toBe("RTO_IN_TRANSIT");
    expect(normalizeEventType("RTO Delivered")).toBe("RTO_DELIVERED");
    expect(normalizeEventType("Delivered")).toBe("DELIVERED");
  });
  it("classifies repeated NDR before RTO from events", () => {
    expect(classifyShipment({ eventTypes: ["ORDERED", "DISPATCHED", "OUT_FOR_DELIVERY", "NDR", "OUT_FOR_DELIVERY", "NDR", "RTO_INITIATED"] })).toBe("RTO");
  });
  it("classifies open NDR, delivered, flagged RTO and unknown", () => {
    expect(classifyShipment({ eventTypes: ["DISPATCHED", "OUT_FOR_DELIVERY", "NDR"] })).toBe("NDR");
    expect(classifyShipment({ rawStatus: "Delivered" })).toBe("DELIVERED");
    expect(classifyShipment({ rawStatus: "", actualDeliveryDate: new Date() })).toBe("DELIVERED");
    expect(classifyShipment({ rawStatus: "Delivered", rtoFlag: true })).toBe("RTO");
    expect(classifyShipment({ dispatchDate: new Date() })).toBe("IN_TRANSIT");
    expect(classifyShipment({})).toBe("UNKNOWN");
  });
  it("only resolved statuses are eligible", () => {
    expect(["DELIVERED", "RTO", "LOST"].every((s) => isEligibleStatus(s as never))).toBe(true);
    expect(["NDR", "IN_TRANSIT", "CANCELLED", "UNKNOWN"].some((s) => isEligibleStatus(s as never))).toBe(false);
  });
  it("detects impossible transitions", () => {
    expect(findImpossibleTransitions(["ORDERED", "DISPATCHED", "NDR", "OUT_FOR_DELIVERY", "DELIVERED"])).toHaveLength(0);
    expect(findImpossibleTransitions(["DELIVERED", "NDR"])).toHaveLength(1);
    expect(findImpossibleTransitions(["RTO_INITIATED", "DELIVERED"])).toHaveLength(1);
    expect(findImpossibleTransitions(["DISPATCHED", "ORDERED"])).toHaveLength(1);
    expect(findImpossibleTransitions(["RTO_INITIATED", "RTO_IN_TRANSIT", "RTO_DELIVERED"])).toHaveLength(0);
  });
});

describe("NDR reason normalisation", () => {
  it.each([
    ["Customer not available at address", "CUSTOMER_UNAVAILABLE"],
    ["Incorrect address - landmark not found", "ADDRESS_INCOMPLETE"],
    ["Customer refused to accept", "CUSTOMER_REFUSED"],
    ["Non serviceable pincode", "OUT_OF_DELIVERY_AREA"],
    ["Phone switched off", "PHONE_UNREACHABLE"],
    ["COD amount not ready", "PAYMENT_ISSUE"],
    ["Could not attempt - hub delay", "COURIER_ISSUE"],
    ["Delivery rescheduled on customer request", "RESCHEDULE_REQUESTED"],
    ["Order not required / changed mind", "CHANGE_OF_MIND"],
    ["PHONE_UNREACHABLE", "PHONE_UNREACHABLE"],
    ["", "UNKNOWN"],
    [null, "UNKNOWN"],
    ["zzz qqq", "OTHER"],
  ])("%s → %s", (raw, code) => expect(normalizeNdrReason(raw as string | null)).toBe(code));
});

describe("courier names and geography", () => {
  it("merges spelling variants and prefers mixed-case display", () => {
    const r = new CourierRegistry();
    expect(courierKey("Swift Express ")).toBe("swiftexpress");
    r.resolve("swiftexpress");
    const b = r.resolve("SwiftExpress");
    expect(r.finalName(b.name)).toBe("SwiftExpress");
    expect(r.finalName(r.resolve("swiftexpress").name)).toBe("SwiftExpress");
    expect(prettyCourier("  metro   post ")).toBe("Metro Post");
  });
  it("treats blanks as Unknown", () => {
    const r = new CourierRegistry();
    expect(r.resolve("")).toEqual({ name: "Unknown", known: false });
    expect(r.resolve("N/A").known).toBe(false);
  });
  it("derives state, region and cluster from pincode", () => {
    expect(geoFromPincode("560067")).toMatchObject({ state: "Karnataka", region: "South", pin3: "560" });
    expect(geoFromPincode("110001")).toMatchObject({ state: "Delhi", region: "North" });
    expect(geoFromPincode("248001").state).toBe("Uttarakhand");
    expect(isValidPincode("012345")).toBe(false);
    expect(isValidPincode("56006")).toBe(false);
    expect(isValidPincode("560067")).toBe(true);
  });
});

describe("cost model", () => {
  it("computes per-shipment and aggregate RTO cost", () => {
    expect(rtoCostForShipment(1000, DEFAULT_COST_MODEL)).toBeCloseTo(185, 5);
    expect(rtoCostFromAggregate(10, 10000, DEFAULT_COST_MODEL)).toBeCloseTo(1850 + 0, 5);
    expect(rtoCostFromAggregate(0, 0, DEFAULT_COST_MODEL)).toBe(0);
    expect(rtoCostForShipment(-50, DEFAULT_COST_MODEL)).toBe(165);
  });
  it("bands order values and formats INR", () => {
    expect(valueBand(499)).toBe("<500");
    expect(valueBand(1000)).toBe("1,000–1,999");
    expect(valueBand(999999)).toBe("4,000+");
    expect(formatINR(150000)).toBe("₹1.50L");
    expect(formatINR(null)).toBe("—");
  });
});
