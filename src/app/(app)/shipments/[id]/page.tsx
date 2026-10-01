import Link from "next/link";
import { notFound } from "next/navigation";
import { Timeline } from "@/components/Timeline";
import { Alert, Badge, Kpi, PageHeader, Panel, Stat } from "@/components/ui";
import { segLabel } from "@/lib/analytics/labels";
import { formatINR } from "@/lib/domain/cost";
import { formatIST } from "@/lib/domain/dates";
import { getShipmentDetail } from "@/lib/shipments";
import { STATUS_TONE } from "@/lib/status";

export const dynamic = "force-dynamic";

export default async function ShipmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await getShipmentDetail(id);
  if (!d) notFound();
  const s = d.shipment;
  const hours = d.totalHours;
  return (
    <>
      <PageHeader
        eyebrow="Shipment forensics"
        title={`Shipment ${s.shipmentId}`}
        headline={
          <>
            <Badge tone={STATUS_TONE[s.finalStatus] ?? "neutral"}>{s.finalStatus.replace("_", " ")}</Badge>{" "}
            {s.finalStatus === "RTO" ? `Returned to origin after ${s.ndrCount} failed attempt${s.ndrCount === 1 ? "" : "s"}.` : s.finalStatus === "DELIVERED" ? `Delivered${s.ndrCount ? ` after ${s.ndrCount} failed attempt${s.ndrCount === 1 ? "" : "s"}` : " on first attempt"}.` : ""}
          </>
        }
        actions={<Link href="/shipments" className="text-[13px] text-link hover:underline">← Back to explorer</Link>}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="Total elapsed" value={hours < 48 ? `${hours.toFixed(0)}h` : `${(hours / 24).toFixed(1)}d`} sub="First to last recorded event" />
        <Kpi label="Attempts" value={s.attempts} />
        <Kpi label="NDR events" value={d.hasEvents ? d.ndrEvents.length : s.ndrCount} sub={d.hasEvents ? "From scan events" : "From shipment record"} />
        <Kpi label="Order value" value={formatINR(s.orderValue, false)} sub={s.paymentType} />
        <Kpi label="Outcome" value={s.finalStatus.replace("_", " ")} tone={s.finalStatus === "RTO" ? "bad" : s.finalStatus === "DELIVERED" ? "good" : "neutral"} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Panel title="Lifecycle timeline" headline={d.hasEvents ? `${d.timeline.length} recorded events` : "No scan events imported"}>
          {!d.hasEvents && <div className="mb-3"><Alert tone="warn" title="Timeline is derived">No scan events exist for this shipment. The entries below are reconstructed from the order, dispatch and delivery dates only.</Alert></div>}
          <Timeline items={d.timeline} />
        </Panel>
        <Panel title="Facts">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]">
            <Stat label="Courier" value={s.courierName ?? "—"} />
            <Stat label="Pincode" value={<span className="font-mono">{s.pincode ?? "—"}</span>} />
            <Stat label="State / region" value={`${s.state ?? "—"} / ${s.region ?? "—"}`} />
            <Stat label="City" value={s.city ?? "—"} />
            <Stat label="Product" value={s.productName ?? "—"} />
            <Stat label="Category" value={s.category ?? "—"} />
            <Stat label="Ordered" value={formatIST(s.orderDate)} />
            <Stat label="Dispatched" value={formatIST(s.dispatchDate)} />
            <Stat label="Expected delivery" value={formatIST(s.expectedDeliveryDate, false)} />
            <Stat label="Delivered" value={s.actualDeliveryDate ? formatIST(s.actualDeliveryDate) : s.finalStatus === "DELIVERED" ? "—" : "Not delivered"} />
            <Stat label="Raw status" value={s.deliveryStatus ?? "—"} />
            <Stat label="NDR reason" value={s.ndrReasonCode ? segLabel("ndrReason", s.ndrReasonCode) : "—"} />
            <Stat label="Order ID" value={s.orderId ?? "—"} />
            <Stat label="Source file" value={<span className="break-all">{s.sourceDataset ?? "—"}{s.sourceRow ? ` (row ${s.sourceRow})` : ""}</span>} />
          </dl>
          {d.rto && (
            <p className="mt-4 rounded border border-rust/30 bg-rust-soft px-3 py-2 text-[13px]">
              Estimated RTO cost for this shipment: <strong className="num">{formatINR(d.rto.estimatedCost ?? 0, false)}</strong> (freight both ways, handling and write-off per Settings).
            </p>
          )}
        </Panel>
      </div>
    </>
  );
}
