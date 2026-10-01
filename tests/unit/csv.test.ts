import { describe, expect, it } from "vitest";
import { missingRequired, suggestMapping } from "@/lib/csv/mapping";
import { createContext, validateEventRow, validateShipmentRow } from "@/lib/csv/validate";
import { computeQuality } from "@/lib/csv/quality";
import { csvCell, escapeHtml, toCsv } from "@/lib/csv/sanitize";

const M = { shipment_id: "awb", order_value: "value", order_date: "odate", payment_type: "pay", pincode: "pin", courier: "courier", delivery_status: "status", dispatch_date: "ship", actual_delivery_date: "deliv", ndr_reason: "ndr", ndr_count: "ndrc", attempts: "att", rto_flag: "rto" };
const base = { awb: "A1", value: "999", odate: "2025-07-01 10:00", pay: "COD", pin: "560067", courier: "Alpha", status: "Delivered" };
const v = (over: Record<string, string>, ctx = createContext()) => validateShipmentRow({ ...base, ...over }, M, 2, ctx);

describe("column mapping", () => {
  it("maps messy export headers to canonical fields", () => {
    const m = suggestMapping(["AWB", "Payment Mode", "Delivery Pincode", "Order Amount", "Order Date", "Courier Partner", "Shipment Status"], "SHIPMENTS");
    expect(m).toMatchObject({ shipment_id: "AWB", payment_type: "Payment Mode", pincode: "Delivery Pincode", order_value: "Order Amount", order_date: "Order Date", courier: "Courier Partner", delivery_status: "Shipment Status" });
  });
  it("supports alternative synonyms and reports missing required fields", () => {
    const m = suggestMapping(["tracking_number", "cod", "pin_code", "total", "created_at"], "SHIPMENTS");
    expect(m.shipment_id).toBe("tracking_number");
    expect(m.payment_type).toBe("cod");
    expect(m.pincode).toBe("pin_code");
    expect(missingRequired({ ...m, order_date: null }, "SHIPMENTS")).toEqual(["order_date"]);
    expect(missingRequired(suggestMapping(["foo"], "SHIPMENTS"), "SHIPMENTS")).toEqual(["shipment_id", "order_value", "order_date"]);
  });
  it("never maps one header to two fields", () => {
    const m = suggestMapping(["status", "order_date", "awb", "amount"], "SHIPMENTS");
    const used = Object.values(m).filter(Boolean);
    expect(new Set(used).size).toBe(used.length);
  });
});

describe("shipment row validation", () => {
  it("accepts and normalises a valid delivered row", () => {
    const r = v({});
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.row).toMatchObject({ finalStatus: "DELIVERED", paymentType: "COD", state: "Karnataka", region: "South", isEligible: true, valueBand: "500–999" });
      expect(r.warnings).toHaveLength(0);
    }
  });
  it("rejects missing id, invalid date, negative/invalid value", () => {
    const code = (over: Record<string, string>) => { const r = v(over); return r.ok ? null : r.errors.map((e) => e.code); };
    expect(code({ awb: "" })).toContain("MISSING_SHIPMENT_ID");
    expect(code({ odate: "32/13/2025" })).toContain("INVALID_ORDER_DATE");
    expect(code({ odate: "" })).toContain("INVALID_ORDER_DATE");
    expect(code({ value: "-100" })).toContain("INVALID_ORDER_VALUE");
    expect(code({ value: "abc" })).toContain("INVALID_ORDER_VALUE");
    expect(code({ value: "" })).toContain("INVALID_ORDER_VALUE");
  });
  it("detects duplicate shipment ids within a file", () => {
    const ctx = createContext();
    expect(v({}, ctx).ok).toBe(true);
    const r = v({}, ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].code).toBe("DUPLICATE_SHIPMENT_ID");
  });
  it("accepts rows with warnings: missing/invalid pincode, unknown courier/payment, extreme value, bad dispatch date", () => {
    const w = (over: Record<string, string>) => { const r = v(over); return r.ok ? r.warnings.map((x) => x.code) : ["REJECTED"]; };
    expect(w({ pin: "" })).toContain("MISSING_PINCODE");
    expect(w({ pin: "123" })).toContain("INVALID_PINCODE");
    expect(w({ courier: "" })).toContain("UNKNOWN_COURIER");
    expect(w({ pay: "barter" })).toContain("UNKNOWN_PAYMENT");
    expect(w({ value: "9999999" })).toContain("EXTREME_VALUE");
    expect(w({ ship: "31/02/2025" })).toContain("INVALID_TIMESTAMP");
    const r = v({ pin: "", courier: "" });
    if (r.ok) {
      expect(r.row.pincode).toBeNull();
      expect(r.row.courierName).toBe("Unknown");
    }
  });
  it("handles repeated NDR then RTO", () => {
    const r = v({ status: "RTO Delivered", ndrc: "2", att: "2", ndr: "Customer not available" });
    expect(r.ok && r.row).toMatchObject({ finalStatus: "RTO", rtoFlag: true, ndrCount: 2, attempts: 2, ndrReasonCode: "CUSTOMER_UNAVAILABLE", isEligible: true });
  });
  it("rejects impossible status combinations and timelines", () => {
    const a = v({ status: "Delivered", rto: "yes" });
    expect(!a.ok && a.errors[0].code).toBe("IMPOSSIBLE_STATUS");
    const b = v({ ship: "2025-07-05 10:00", deliv: "2025-07-02 10:00" });
    expect(!b.ok && b.errors[0].code).toBe("IMPOSSIBLE_TIMELINE");
  });
  it("derives attempts when absent and leaves in-transit ineligible", () => {
    const d = v({ ndrc: "1", ndr: "phone off" });
    expect(d.ok && d.row.attempts).toBe(2);
    const t = v({ status: "In Transit" });
    expect(t.ok && t.row).toMatchObject({ finalStatus: "IN_TRANSIT", isEligible: false });
  });
  it("parses payment variants", () => {
    const pay = (p: string) => { const r = v({ pay: p }); return r.ok ? r.row.paymentType : null; };
    expect(pay("Cash on Delivery")).toBe("COD");
    expect(pay("prepaid")).toBe("PREPAID");
    expect(pay("UPI")).toBe("PREPAID");
    expect(pay("1")).toBe("COD");
    expect(pay("0")).toBe("PREPAID");
  });
});

describe("event row validation", () => {
  const EM = { shipment_id: "awb", timestamp: "ts", event_type: "type", description: "d" };
  it("normalises valid events and rejects bad ones", () => {
    const ok = validateEventRow({ awb: "A1", ts: "10/09/2025 09:12", type: "Undelivered - Attempt Failed", d: "Door locked" }, EM, 2);
    expect(ok.ok && ok.event.eventType).toBe("NDR");
    expect(validateEventRow({ awb: "", ts: "10/09/2025", type: "x", d: "" }, EM, 2).ok).toBe(false);
    expect(validateEventRow({ awb: "A1", ts: "nope", type: "x", d: "" }, EM, 2).ok).toBe(false);
  });
});

describe("quality score", () => {
  it("scores clean data 100 and penalises rejections", () => {
    expect(computeQuality({ total: 1000, rejected: 0, codeCounts: {} }).score).toBe(100);
    expect(computeQuality({ total: 1000, rejected: 100, codeCounts: { DUPLICATE_SHIPMENT_ID: 100 } }).score).toBe(88);
    expect(computeQuality({ total: 100, rejected: 100, codeCounts: {} }).score).toBe(40);
  });
  it("lists warnings with percentages and handles zero rows", () => {
    const q = computeQuality({ total: 1000, rejected: 0, codeCounts: { MISSING_PINCODE: 21, UNKNOWN_COURIER: 12 } });
    expect(q.warnings[0]).toMatchObject({ code: "MISSING_PINCODE", count: 21 });
    expect(q.warnings[0].pct).toBeCloseTo(2.1, 5);
    expect(q.score).toBeLessThan(100);
    expect(computeQuality({ total: 0, rejected: 0, codeCounts: {} }).score).toBe(0);
  });
});

describe("export sanitisation", () => {
  it("neutralises formula injection and quotes cells", () => {
    expect(csvCell("=1+1")).toBe("'=1+1");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("-abc")).toBe("'-abc");
    expect(csvCell(-5)).toBe("-5");
    expect(csvCell('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(toCsv(["a", "b"], [{ a: 1, b: "=x" }])).toBe("a,b\n1,'=x\n");
    expect(escapeHtml(`<script>"x"</script>`)).not.toContain("<script>");
  });
});
