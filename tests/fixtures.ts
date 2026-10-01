/** Deterministic fixture CSV (messy headers, deliberate bad rows) shared by integration and E2E tests. */
export const FIXTURE_HEADER = "AWB,Order No,Customer,Product,Product Category,Courier Partner,Delivery Pincode,Order Amount,Payment Mode,Order Date,Shipped Date,Delivered Date,Shipment Status,Attempts,NDR Count,Last NDR Reason";

interface R {
  awb: string;
  courier: string;
  pin: string;
  value: string | number;
  pay: string;
  status: string;
  i: number;
  ndr?: number;
  reason?: string;
  attempts?: number;
  order?: string;
  deliveredOffsetDays?: number | null;
  delivered?: string;
  shipped?: string;
  cust?: string;
}

function row(r: R): string {
  const day = String(1 + (r.i % 20)).padStart(2, "0");
  const order = r.order ?? `2025-07-${day} 10:00`;
  const shipped = r.shipped ?? `2025-07-${day} 18:00`;
  const deliveredDay = String(1 + (r.i % 20) + 4).padStart(2, "0");
  const delivered = r.delivered ?? (r.status === "Delivered" ? `2025-07-${deliveredDay} 12:00` : "");
  return [r.awb, `ORD-${r.awb}`, r.cust ?? `C${r.i % 40}`, "Kurta", "Apparel", r.courier, r.pin, r.value, r.pay, order, shipped, delivered, r.status, r.attempts ?? (r.status === "Delivered" ? 1 : r.ndr ?? 0), r.ndr ?? 0, r.reason ?? ""].join(",");
}

export interface Fixture {
  csv: string;
  total: number;
  rejected: number;
  accepted: number;
  rto: number;
  eligible: number;
}

export function buildFixture(prefix = "FX"): Fixture {
  const rows: string[] = [];
  let i = 0;
  const id = () => `${prefix}${String(++i).padStart(5, "0")}`;
  // Group X: COD in high-risk pincode via courier Alpha — 30 of 60 RTO (repeated NDR)
  for (let k = 0; k < 60; k++) rows.push(row({ awb: id(), courier: "Alpha", pin: "560067", value: 1500, pay: "COD", i, status: k < 30 ? "RTO Delivered" : "Delivered", ndr: k < 30 ? 2 : 0, reason: k < 30 ? "Customer not available at address" : "", attempts: k < 30 ? 2 : 1 }));
  // Group Y: prepaid North via Beta — 5 of 100 RTO
  for (let k = 0; k < 100; k++) rows.push(row({ awb: id(), courier: "Beta", pin: "110001", value: 900, pay: "Prepaid", i, status: k < 5 ? "RTO Delivered" : "Delivered", ndr: k < 5 ? 1 : 0, reason: k < 5 ? "Customer refused to accept" : "" }));
  // Group Z: COD West via Beta — 10 of 100 RTO
  for (let k = 0; k < 100; k++) rows.push(row({ awb: id(), courier: "Beta", pin: "400001", value: 1100, pay: "COD", i, status: k < 10 ? "RTO Delivered" : "Delivered", ndr: k < 10 ? 2 : 0, reason: k < 10 ? "Phone switched off" : "" }));
  const firstAwb = rows[0].split(",")[0];
  // Deliberately bad / imperfect rows
  rows.push(row({ awb: firstAwb, courier: "Alpha", pin: "560067", value: 1500, pay: "COD", i: 1, status: "Delivered" })); // duplicate → rejected
  rows.push(row({ awb: id(), courier: "Alpha", pin: "560067", value: 1500, pay: "COD", i: 2, status: "Delivered", order: "32/13/2025" })); // invalid date → rejected
  rows.push(row({ awb: id(), courier: "Alpha", pin: "560067", value: -100, pay: "COD", i: 3, status: "Delivered" })); // negative value → rejected
  rows.push(row({ awb: "", courier: "Alpha", pin: "560067", value: 500, pay: "COD", i: 4, status: "Delivered" })); // empty id → rejected
  rows.push(row({ awb: id(), courier: "Alpha", pin: "560067", value: 500, pay: "COD", i: 5, status: "Delivered", shipped: "2025-07-10 10:00", delivered: "2025-07-02 10:00" })); // delivered before dispatch → rejected
  rows.push(row({ awb: id(), courier: "Alpha", pin: "", value: 500, pay: "COD", i: 6, status: "Delivered" })); // missing pincode → accepted w/ warning
  rows.push(row({ awb: id(), courier: "", pin: "400001", value: 500, pay: "COD", i: 7, status: "Delivered" })); // unknown courier → accepted w/ warning
  rows.push(row({ awb: id(), courier: "Beta", pin: "400001", value: 9999999, pay: "COD", i: 8, status: "Delivered" })); // extreme value → accepted w/ warning
  return { csv: [FIXTURE_HEADER, ...rows].join("\n") + "\n", total: rows.length, rejected: 5, accepted: rows.length - 5, rto: 45, eligible: rows.length - 5 };
}

/** Scan events for the first two shipments of the fixture + bad event rows. */
export function buildEventsCsv(awbRto: string, awbDelivered: string): string {
  return [
    "AWB,Scan Time,Scan Type,Location,Remarks",
    `${awbRto},2025-07-01 10:00,Order Created,Online store,Order placed`,
    `${awbRto},2025-07-01 18:00,Picked Up,Gurugram,Picked up`,
    `${awbRto},2025-07-03 09:00,Out For Delivery,Bengaluru,OFD`,
    `${awbRto},2025-07-03 17:00,Undelivered - Attempt Failed,Bengaluru,Customer not available at address`,
    `${awbRto},2025-07-04 09:00,Out For Delivery,Bengaluru,OFD`,
    `${awbRto},2025-07-04 17:30,Undelivered - Attempt Failed,Bengaluru,Door locked / customer unavailable`,
    `${awbRto},2025-07-05 09:00,RTO Initiated,Bengaluru,Return to origin initiated`,
    `${awbDelivered},2025-07-01 10:00,Order Created,Online store,Order placed`,
    `${awbDelivered},2025-07-03 12:00,Delivered,Bengaluru,Delivered`,
    `${awbDelivered},2025-07-03 15:00,Undelivered - Attempt Failed,Bengaluru,impossible after delivery`,
    `NOPE-0001,2025-07-01 10:00,Delivered,Mumbai,unknown shipment`,
    `${awbRto},not-a-date,Delivered,Mumbai,bad timestamp`,
  ].join("\n") + "\n";
}
