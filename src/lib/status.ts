import type { Tone } from "@/components/ui";

export const STATUS_TONE: Record<string, Tone> = { DELIVERED: "good", RTO: "bad", NDR: "warn", IN_TRANSIT: "info", LOST: "bad", CANCELLED: "neutral", UNKNOWN: "neutral" };
