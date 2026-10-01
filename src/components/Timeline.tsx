import { Badge, type Tone } from "./ui";
import { formatIST } from "@/lib/domain/dates";
import type { TimelineItem } from "@/lib/shipments";

const TONE: Record<string, Tone> = {
  DELIVERED: "good",
  NDR: "warn",
  RTO_INITIATED: "bad",
  RTO_IN_TRANSIT: "bad",
  RTO_DELIVERED: "bad",
  LOST: "bad",
  CANCELLED: "neutral",
  OUT_FOR_DELIVERY: "info",
};

function gap(a: Date, b: Date): string {
  const h = (b.getTime() - a.getTime()) / 3.6e6;
  if (h < 1) return "<1h later";
  if (h < 48) return `+${Math.round(h)}h`;
  return `+${(h / 24).toFixed(1)}d`;
}

export function Timeline({ items }: { items: TimelineItem[] }) {
  if (items.length === 0) return <p className="text-[13px] text-muted">No timeline information is available for this shipment.</p>;
  let ndrNo = 0;
  return (
    <ol className="relative ml-2 border-l border-line pl-5" aria-label="Shipment timeline">
      {items.map((t, i) => {
        if (t.type === "NDR") ndrNo++;
        return (
          <li key={i} className="relative pb-4 last:pb-0">
            <span aria-hidden className={`absolute -left-[27px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-panel ${t.type === "DELIVERED" ? "bg-good" : t.type === "NDR" || t.type.startsWith("RTO") || t.type === "LOST" ? "bg-rust" : "bg-muted"}`} />
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <time dateTime={t.ts.toISOString()} className="num font-mono text-xs text-muted">{formatIST(t.ts)}</time>
              <Badge tone={TONE[t.type] ?? "neutral"}>{t.type === "NDR" ? `NDR #${ndrNo}` : t.label}</Badge>
              {i > 0 && <span className="text-[11px] text-muted">{gap(items[i - 1].ts, t.ts)}</span>}
              {t.derived && <Badge title="No scan events were imported; reconstructed from shipment dates">derived</Badge>}
            </div>
            {(t.location || t.description) && <p className="mt-0.5 text-[13px]">{[t.location, t.description].filter(Boolean).join(" — ")}</p>}
          </li>
        );
      })}
    </ol>
  );
}
