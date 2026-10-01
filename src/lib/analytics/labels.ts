import { NDR_LABELS, type NdrReason } from "@/lib/domain/ndr";
import type { DimKey } from "./types";

export function segLabel(dim: DimKey, key: string): string {
  if (dim === "pin3") return key === "(missing)" ? key : `${key}xxx`;
  if (dim === "ndrReason") return key === "NONE" ? "No NDR" : NDR_LABELS[key as NdrReason] ?? key;
  if (dim === "repeat") return key === "repeat" ? "Repeat customers" : key === "new" ? "New customers" : "Unknown";
  if (dim === "attempts") return `${key} attempt${key === "1" ? "" : "s"}`;
  if (dim === "week") return `Week of ${key}`;
  return key;
}
