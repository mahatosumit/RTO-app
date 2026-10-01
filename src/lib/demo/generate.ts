/**
 * Deterministic synthetic data generator — DEMO MODE ONLY.
 * Produces two CSV strings (shipments + courier scan events) with messy headers and deliberately
 * imperfect rows, which are then pushed through the same import pipeline a customer file would use.
 *
 * Embedded, discoverable patterns:
 *  A. Pincode cluster 562xxx (Bengaluru outskirts): very high COD RTO rate, mostly customer unavailable/refused.
 *  B. RoadRunner Logistics in the North region: elevated RTO, mostly address / out-of-area problems.
 *  C. Apparel category: higher RTO, especially high-value COD.
 *  D. Last 7 order-days: Kestrel Couriers spikes (courier-side "could not attempt"), volume and COD mix rise.
 */
import { toCsv } from "@/lib/csv/sanitize";

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Pin = { pin: string; city: string };
const CLUSTER_A: Pin[] = ["562107", "562125", "562149", "562110", "562114", "562130"].map((pin) => ({ pin, city: "Bengaluru Rural" }));
const POOL: Record<string, Pin[]> = {
  North: [["110001", "New Delhi"], ["110017", "New Delhi"], ["110045", "New Delhi"], ["110092", "New Delhi"], ["122001", "Gurugram"], ["122018", "Gurugram"], ["201301", "Noida"], ["201305", "Noida"], ["226001", "Lucknow"], ["226010", "Lucknow"], ["302001", "Jaipur"], ["302017", "Jaipur"], ["160017", "Chandigarh"], ["141001", "Ludhiana"]].map(([pin, city]) => ({ pin, city })),
  West: [["400001", "Mumbai"], ["400053", "Mumbai"], ["400070", "Mumbai"], ["400092", "Mumbai"], ["411001", "Pune"], ["411045", "Pune"], ["380001", "Ahmedabad"], ["380015", "Ahmedabad"], ["395003", "Surat"], ["440010", "Nagpur"]].map(([pin, city]) => ({ pin, city })),
  South: [["560001", "Bengaluru"], ["560034", "Bengaluru"], ["560068", "Bengaluru"], ["560102", "Bengaluru"], ["500001", "Hyderabad"], ["500032", "Hyderabad"], ["500081", "Hyderabad"], ["600001", "Chennai"], ["600042", "Chennai"], ["600096", "Chennai"], ["682001", "Kochi"], ["641001", "Coimbatore"]].map(([pin, city]) => ({ pin, city })),
  East: [["700001", "Kolkata"], ["700019", "Kolkata"], ["700091", "Kolkata"], ["800001", "Patna"], ["751001", "Bhubaneswar"], ["781001", "Guwahati"], ["834001", "Ranchi"]].map(([pin, city]) => ({ pin, city })),
  Central: [["462001", "Bhopal"], ["452001", "Indore"], ["492001", "Raipur"]].map(([pin, city]) => ({ pin, city })),
};

const PRODUCTS: Array<{ name: string; category: string; lo: number; hi: number; w: number }> = [
  { name: "Cotton Kurta Set", category: "Apparel", lo: 899, hi: 1799, w: 11 },
  { name: "Denim Jacket", category: "Apparel", lo: 1999, hi: 3499, w: 9 },
  { name: "Running Tee", category: "Apparel", lo: 499, hi: 899, w: 10 },
  { name: "Sneakers Classic", category: "Footwear", lo: 1499, hi: 2999, w: 9 },
  { name: "Leather Sandals", category: "Footwear", lo: 799, hi: 1499, w: 6 },
  { name: "Vitamin C Serum", category: "Beauty", lo: 399, hi: 799, w: 11 },
  { name: "Hair Oil Combo", category: "Beauty", lo: 349, hi: 699, w: 9 },
  { name: "Ceramic Mug Set", category: "Home", lo: 499, hi: 999, w: 8 },
  { name: "Bedsheet Set", category: "Home", lo: 999, hi: 2199, w: 7 },
  { name: "Bluetooth Earbuds", category: "Electronics", lo: 1299, hi: 2499, w: 9 },
  { name: "Power Bank 10000", category: "Electronics", lo: 899, hi: 1499, w: 8 },
  { name: "Smartwatch Pro", category: "Electronics", lo: 3999, hi: 8999, w: 3 },
];
const CAT_MULT: Record<string, number> = { Apparel: 1.5, Footwear: 1.2, Beauty: 0.7, Home: 0.9, Electronics: 0.8 };

const COURIERS = [
  { name: "SwiftExpress", variants: ["SwiftExpress", "SwiftExpress", "swiftexpress", "Swift Express"], w: 30 },
  { name: "RoadRunner Logistics", variants: ["RoadRunner Logistics", "RoadRunner Logistics", "ROADRUNNER LOGISTICS", "Roadrunner Logistics"], w: 25 },
  { name: "Kestrel Couriers", variants: ["Kestrel Couriers", "Kestrel Couriers", "kestrel couriers"], w: 25 },
  { name: "MetroPost", variants: ["MetroPost", "MetroPost", "Metro Post"], w: 20 },
];

const NDR_TEXT: Record<string, string[]> = {
  CUSTOMER_UNAVAILABLE: ["Customer not available at address", "Door locked / customer unavailable", "Consignee not available"],
  PHONE_UNREACHABLE: ["Customer not reachable on phone", "Phone switched off", "No response on call"],
  ADDRESS_INCOMPLETE: ["Incomplete address", "Incorrect address - landmark not found", "Address not found"],
  CUSTOMER_REFUSED: ["Customer refused to accept", "Consignee refused delivery"],
  RESCHEDULE_REQUESTED: ["Customer requested reschedule", "Delivery rescheduled on customer request"],
  CHANGE_OF_MIND: ["Order not required / changed mind", "Customer cancelled the order"],
  OUT_OF_DELIVERY_AREA: ["Out of delivery area (ODA)", "Non serviceable pincode"],
  PAYMENT_ISSUE: ["COD amount not ready", "Customer asked to come back with cash"],
  COURIER_ISSUE: ["Could not attempt - hub delay", "Vehicle breakdown / no time to attempt", "Delivery agent could not attempt"],
};

type Dist = Array<[string, number]>;
const D_DEFAULT: Dist = [["CUSTOMER_UNAVAILABLE", 30], ["PHONE_UNREACHABLE", 18], ["ADDRESS_INCOMPLETE", 15], ["CUSTOMER_REFUSED", 12], ["CHANGE_OF_MIND", 10], ["RESCHEDULE_REQUESTED", 8], ["COURIER_ISSUE", 5], ["PAYMENT_ISSUE", 2]];
const D_CLUSTER: Dist = [["CUSTOMER_UNAVAILABLE", 35], ["CUSTOMER_REFUSED", 25], ["PHONE_UNREACHABLE", 15], ["ADDRESS_INCOMPLETE", 15], ["CHANGE_OF_MIND", 10]];
const D_ROADRUNNER: Dist = [["ADDRESS_INCOMPLETE", 30], ["CUSTOMER_UNAVAILABLE", 28], ["OUT_OF_DELIVERY_AREA", 15], ["COURIER_ISSUE", 15], ["PHONE_UNREACHABLE", 12]];
const D_KESTREL_RECENT: Dist = [["COURIER_ISSUE", 40], ["CUSTOMER_UNAVAILABLE", 30], ["PHONE_UNREACHABLE", 15], ["ADDRESS_INCOMPLETE", 15]];
const D_RECOVERABLE: Dist = [["CUSTOMER_UNAVAILABLE", 45], ["PHONE_UNREACHABLE", 25], ["RESCHEDULE_REQUESTED", 20], ["ADDRESS_INCOMPLETE", 10]];

const DAY = 86400000;
const HOUR = 3600000;

function fmt(ms: number, withTime = true): string {
  const d = new Date(ms + 330 * 60000);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const base = `${dd}-${mm}-${d.getUTCFullYear()}`;
  return withTime ? `${base} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}` : base;
}

export const SHIPMENT_HEADERS = ["AWB", "Order No", "Customer", "Product", "Product Category", "Courier Partner", "Delivery Pincode", "City", "Order Amount", "Payment Mode", "Order Date", "Shipped Date", "EDD", "Delivered Date", "Shipment Status", "Attempts", "NDR Count", "Last NDR Reason"];
export const EVENT_HEADERS = ["AWB", "Scan Time", "Scan Type", "Location", "Remarks"];

export interface DemoOptions {
  seed?: number;
  count?: number;
  /** Reference "today" (defaults to now). Last order day is 16 days before, so outcomes are resolved. */
  now?: number;
}

export function generateDemoData(opts: DemoOptions = {}): { shipmentsCsv: string; eventsCsv: string; count: number } {
  const rand = mulberry32(opts.seed ?? 42);
  const count = opts.count ?? 6000;
  const now = opts.now ?? Date.now();
  const todayIst = Math.floor((now + 330 * 60000) / DAY) * DAY - 330 * 60000;
  const lastDay = todayIst - 16 * DAY;
  const DAYS = 120;
  const firstDay = lastDay - (DAYS - 1) * DAY;
  const exportMs = lastDay + 16 * DAY;

  const pick = <T,>(items: T[], weights: number[]): T => {
    const total = weights.reduce((a, b) => a + b, 0);
    let x = rand() * total;
    for (let i = 0; i < items.length; i++) {
      x -= weights[i];
      if (x <= 0) return items[i];
    }
    return items[items.length - 1];
  };
  const pickDist = (d: Dist) => pick(d.map((x) => x[0]), d.map((x) => x[1]));
  const between = (lo: number, hi: number) => lo + rand() * (hi - lo);
  const oneOf = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];

  const dayWeights = Array.from({ length: DAYS }, (_, i) => {
    const dow = new Date(firstDay + i * DAY + 330 * 60000).getUTCDay();
    return (dow === 0 || dow === 6 ? 1.25 : 1) * (i >= DAYS - 7 ? 1.6 : 1);
  });

  const shipRows: Array<Record<string, string | number>> = [];
  const eventRows: Array<Record<string, string>> = [];
  const dupQueue: Array<Record<string, string | number>> = [];

  for (let i = 0; i < count; i++) {
    const d = pick(Array.from({ length: DAYS }, (_, k) => k), dayWeights);
    const recent = d >= DAYS - 7;
    const regionKey = pick(["North", "West", "South", "East", "Central", "ClusterA"], [27, 26, 22, 12, 8, 9]);
    const clusterA = regionKey === "ClusterA";
    const region = clusterA ? "South" : regionKey;
    const pin = oneOf(clusterA ? CLUSTER_A : POOL[region]);
    const codProb = clusterA ? 0.8 : recent ? 0.6 : 0.52;
    const cod = rand() < codProb;
    const courier = pick(COURIERS, COURIERS.map((c) => c.w));
    const product = pick(PRODUCTS, PRODUCTS.map((p) => p.w));
    let value = Math.round(between(product.lo, product.hi) / 10) * 10 - 1;
    if (i % 2000 === 1999) value = 999999; // extreme value, should trigger a warning

    let p = (cod ? 0.12 : 0.045) * CAT_MULT[product.category];
    if (cod && value >= 2000) p *= 1.3;
    if (courier.name === "RoadRunner Logistics" && region === "North") p = cod ? 0.32 : 0.16;
    if (clusterA) p = cod ? 0.42 : 0.07;
    if (courier.name === "Kestrel Couriers") {
      if (recent) p = Math.max(p, cod ? 0.55 : 0.4);
      else p *= 0.9;
    } else if (recent) p *= 1.05;
    p = Math.min(p, 0.85);

    const orderMs = firstDay + d * DAY + Math.floor(between(8, 23.5) * HOUR);
    const dispatchMs = orderMs + Math.floor(between(4, courier.name === "Kestrel Couriers" ? 40 : 28) * HOUR);
    const sameRegion = region === "South" || region === "West";
    const transitDays = (sameRegion ? 2 : 4) + Math.floor(rand() * 2);
    const hub = `${region} Sorting Hub`;
    const city = pin.city;

    const outcomeRoll = rand();
    const outcome: "CANCELLED" | "LOST" | "TRANSIT" | "RTO" | "DELIVERED" =
      outcomeRoll < 0.015 ? "CANCELLED" : outcomeRoll < 0.021 ? "LOST" : outcomeRoll < 0.036 && d >= DAYS - 20 ? "TRANSIT" : rand() < p ? "RTO" : "DELIVERED";

    const awb = `AWB${100000000 + i}`;
    const ev: Array<{ ms: number; type: string; loc: string; remark: string }> = [];
    ev.push({ ms: orderMs, type: "Order Created", loc: "Online store", remark: "Order placed" });
    let status = "Delivered";
    let deliveredMs: number | null = null;
    let ndrCount = 0;
    let attempts = 0;
    let lastReason = "";
    const reasonDist = clusterA ? D_CLUSTER : courier.name === "RoadRunner Logistics" && region === "North" ? D_ROADRUNNER : recent && courier.name === "Kestrel Couriers" ? D_KESTREL_RECENT : D_DEFAULT;

    if (outcome === "CANCELLED") {
      status = "Cancelled";
      ev.push({ ms: orderMs + Math.floor(between(1, 10) * HOUR), type: "Cancelled", loc: "Online store", remark: "Cancelled before dispatch" });
    } else {
      ev.push({ ms: dispatchMs, type: "Picked Up", loc: "Origin Warehouse - Gurugram", remark: `Shipment picked up by ${courier.name}` });
      ev.push({ ms: dispatchMs + Math.floor(between(14, 28) * HOUR), type: "Arrived at Hub", loc: hub, remark: "Arrived at sorting hub" });
      if (transitDays >= 3) ev.push({ ms: dispatchMs + Math.floor(between(32, 50) * HOUR), type: "Arrived at Hub", loc: `${city} Delivery Hub`, remark: "Reached destination hub" });
      let ofd = dispatchMs + transitDays * DAY + Math.floor(between(0, 5) * HOUR);

      if (outcome === "LOST") {
        status = "Lost";
        ev.push({ ms: dispatchMs + Math.floor(between(3, 6) * DAY), type: "Lost", loc: hub, remark: "Shipment lost in transit - claim raised" });
      } else if (outcome === "TRANSIT") {
        status = rand() < 0.5 ? "Out For Delivery" : "In Transit";
        if (status === "Out For Delivery") ev.push({ ms: ofd, type: "Out For Delivery", loc: city, remark: "Out for delivery" });
        attempts = status === "Out For Delivery" ? 1 : 0;
      } else {
        let nd: number;
        if (outcome === "DELIVERED") nd = rand() < (cod ? 0.16 : 0.1) ? (rand() < 0.8 ? 1 : 2) : 0;
        else nd = rand() < 0.1 ? 1 : rand() < 0.3 ? 2 : 3;
        const reasons: string[] = [];
        for (let k = 0; k < nd; k++) reasons.push(outcome === "DELIVERED" ? pickDist(D_RECOVERABLE) : pickDist(reasonDist));
        if (outcome === "RTO" && nd > 1 && (reasons[0] === "CUSTOMER_REFUSED" || reasons[0] === "CHANGE_OF_MIND")) {
          nd = 1;
          reasons.length = 1;
        }
        let t = ofd;
        for (let k = 0; k < nd; k++) {
          ev.push({ ms: t, type: "Out For Delivery", loc: city, remark: "Out for delivery" });
          const txt = oneOf(NDR_TEXT[reasons[k]]);
          ev.push({ ms: t + Math.floor(between(6, 11) * HOUR), type: "Undelivered - Attempt Failed", loc: city, remark: txt });
          lastReason = txt;
          t += Math.floor(between(22, 28) * HOUR);
        }
        ndrCount = nd;
        if (outcome === "DELIVERED") {
          ev.push({ ms: t, type: "Out For Delivery", loc: city, remark: "Out for delivery" });
          deliveredMs = t + Math.floor(between(3, 9) * HOUR);
          ev.push({ ms: deliveredMs, type: "Delivered", loc: city, remark: "Delivered to customer" });
          attempts = nd + 1;
          status = rand() < 0.8 ? "Delivered" : "DELIVERED";
        } else {
          attempts = nd;
          const lastNdr = t - Math.floor(between(22, 28) * HOUR) + 9 * HOUR;
          const init = lastNdr + Math.floor(between(4, 20) * HOUR);
          ev.push({ ms: init, type: "RTO Initiated", loc: city, remark: "Return to origin initiated" });
          ev.push({ ms: init + Math.floor(between(20, 40) * HOUR), type: "RTO In Transit", loc: hub, remark: "RTO in transit" });
          const rtoDel = init + Math.floor(between(3, 6) * DAY);
          if (rtoDel < exportMs) {
            ev.push({ ms: rtoDel, type: "RTO Delivered", loc: "Origin Warehouse - Gurugram", remark: "RTO received at origin" });
            status = oneOf(["RTO Delivered", "Returned to Origin", "RTO Delivered"]);
          } else status = "RTO Initiated";
        }
        ofd = t;
      }
    }

    const edd = dispatchMs + (transitDays + 1) * DAY;
    const row: Record<string, string | number> = {
      AWB: awb,
      "Order No": `ORD-${50000 + i}`,
      Customer: `CUST-${Math.floor(rand() * 4200)}`,
      Product: product.name,
      "Product Category": product.category,
      "Courier Partner": rand() < 0.015 ? "" : oneOf(courier.variants),
      "Delivery Pincode": rand() < 0.02 ? "" : pin.pin,
      City: city,
      "Order Amount": value,
      "Payment Mode": rand() < 0.01 ? "" : cod ? oneOf(["COD", "COD", "cod"]) : oneOf(["Prepaid", "PREPAID", "Prepaid"]),
      "Order Date": fmt(orderMs),
      "Shipped Date": outcome === "CANCELLED" ? "" : fmt(dispatchMs),
      EDD: outcome === "CANCELLED" ? "" : fmt(edd, false),
      "Delivered Date": deliveredMs ? fmt(deliveredMs) : "",
      "Shipment Status": status,
      Attempts: attempts,
      "NDR Count": ndrCount,
      "Last NDR Reason": lastReason,
    };
    // imperfections
    const z = rand();
    if (z < 0.003) row["Order Date"] = "32/13/2025";
    else if (z < 0.005) row["Order Amount"] = -499;
    else if (z < 0.006) row["Order Amount"] = "N/A";
    else if (z < 0.010 && deliveredMs) row["Delivered Date"] = "31/02/2025";
    if (rand() < 0.003) dupQueue.push({ ...row });

    shipRows.push(row);
    if (rand() < 0.04) continue; // ~4% of shipments have no scan history at all
    for (const e of ev.filter((x) => x.ms <= exportMs).sort((a, b) => a.ms - b.ms)) {
      eventRows.push({ AWB: awb, "Scan Time": fmt(e.ms), "Scan Type": e.type, Location: e.loc, Remarks: e.remark });
    }
  }
  for (const dup of dupQueue) shipRows.push(dup);
  return { shipmentsCsv: toCsv(SHIPMENT_HEADERS, shipRows), eventsCsv: toCsv(EVENT_HEADERS, eventRows), count: shipRows.length };
}
