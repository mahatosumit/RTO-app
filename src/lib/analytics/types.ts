export const DIMENSIONS = [
  "courier",
  "pincode",
  "pin3",
  "state",
  "region",
  "product",
  "category",
  "valueBand",
  "payment",
  "repeat",
  "ndrReason",
  "attempts",
  "status",
  "week",
  "month",
  "day",
] as const;
export type DimKey = (typeof DIMENSIONS)[number];

export const DIM_LABELS: Record<DimKey, string> = {
  courier: "Courier",
  pincode: "Pincode",
  pin3: "Pincode cluster",
  state: "State",
  region: "Region",
  product: "Product",
  category: "Category",
  valueBand: "Order value",
  payment: "Payment type",
  repeat: "Customer segment",
  ndrReason: "NDR reason",
  attempts: "Delivery attempts",
  status: "Status",
  week: "Week",
  month: "Month",
  day: "Day",
};

/** Raw aggregate counts/sums for one segment. All rates are derived in metrics.ts. */
export interface AggRow {
  key: string;
  shipments: number;
  dispatched: number;
  eligible: number;
  delivered: number;
  rto: number;
  lost: number;
  inTransit: number;
  ndrOpen: number;
  cancelled: number;
  ndrShipments: number;
  ndrResolved: number;
  ndrDelivered: number;
  codShipments: number;
  codEligible: number;
  codRto: number;
  prepaidEligible: number;
  prepaidRto: number;
  totalValue: number;
  rtoValue: number;
  deliveredValue: number;
  codRtoValue: number;
  avgAttempts: number | null;
  avgTransitHours: number | null;
  addressableRto: number;
  addressableRtoValue: number;
  addrResolved: number;
  addrDelivered: number;
}

export function emptyAgg(key = "all"): AggRow {
  return {
    key, shipments: 0, dispatched: 0, eligible: 0, delivered: 0, rto: 0, lost: 0, inTransit: 0, ndrOpen: 0,
    cancelled: 0, ndrShipments: 0, ndrResolved: 0, ndrDelivered: 0, codShipments: 0, codEligible: 0, codRto: 0,
    prepaidEligible: 0, prepaidRto: 0, totalValue: 0, rtoValue: 0, deliveredValue: 0, codRtoValue: 0,
    avgAttempts: null, avgTransitHours: null, addressableRto: 0, addressableRtoValue: 0, addrResolved: 0, addrDelivered: 0,
  };
}

export interface Filters {
  courier?: string[];
  payment?: string[];
  state?: string[];
  region?: string[];
  pincode?: string[];
  pin3?: string[];
  product?: string[];
  category?: string[];
  valueBand?: string[];
  repeat?: string[];
  ndrReason?: string[];
  status?: string[];
  attempts?: string[];
  from?: string;
  to?: string;
  minValue?: number;
  q?: string;
}

export const FILTER_LIST_KEYS = [
  "courier", "payment", "state", "region", "pincode", "pin3", "product", "category", "valueBand", "repeat", "ndrReason", "status", "attempts",
] as const;

export interface DatasetInfo {
  id: string;
  name: string;
  isDemo: boolean;
  shipmentCount: number;
  qualityScore: number | null;
  asOf: Date | null;
  createdAt: Date;
}
