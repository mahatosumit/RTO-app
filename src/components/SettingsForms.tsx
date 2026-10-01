"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, buttonClass } from "./ui";
import { ConfirmDialog } from "./ConfirmDialog";
import type { CostModel } from "@/lib/domain/cost";

const inp = "w-full rounded border border-line bg-panel px-2 py-1.5 text-[13px]";
const lab = "mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted";

const FIELDS: Array<[keyof CostModel, string, string, number, number]> = [
  ["forwardCost", "Forward shipping cost per shipment (₹)", "Wasted on every RTO", 1, 0],
  ["reverseCost", "Reverse shipping cost per RTO (₹)", "Return freight", 1, 0],
  ["handlingCost", "Handling / restocking per RTO (₹)", "QC, repack, restock", 1, 0],
  ["cogsRatio", "Cost of goods as share of order value (0–1)", "Used for write-off estimate", 0.01, 0],
  ["writeoffRate", "Share of returned goods written off (0–1)", "Damaged / unsellable", 0.01, 0],
  ["marginRate", "Contribution margin on order value (0–1)", "Used in simulations for lost/recovered margin", 0.01, 0],
];

export function CostForm({ initial }: { initial: CostModel }) {
  const router = useRouter();
  const [v, setV] = useState<CostModel>(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [msg, setMsg] = useState("");
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setState("saving");
        const res = await fetch("/api/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(v) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setState("error");
          setMsg(data?.error?.issues?.map((i: { path: string; message: string }) => `${i.path}: ${i.message}`).join("; ") ?? data?.error?.message ?? "Could not save.");
          return;
        }
        setState("saved");
        router.refresh();
      }}
    >
      <div className="grid gap-3 md:grid-cols-2">
        {FIELDS.map(([k, label, help, step, min]) => (
          <div key={k}>
            <label htmlFor={`c-${k}`} className={lab}>{label}</label>
            <input id={`c-${k}`} type="number" step={step} min={min} className={inp} value={v[k]} onChange={(e) => setV({ ...v, [k]: Number(e.target.value) })} />
            <p className="mt-0.5 text-xs text-muted">{help}</p>
          </div>
        ))}
      </div>
      <button type="submit" className={buttonClass("primary")} disabled={state === "saving"}>{state === "saving" ? "Saving…" : "Save assumptions"}</button>
      {state === "saved" && <p role="status" className="text-sm text-good">Saved. Cost figures across the app now use these assumptions.</p>}
      {state === "error" && <Alert tone="bad" title="Not saved">{msg}</Alert>}
    </form>
  );
}

export function DatasetActions({ id, name, active }: { id: string; name: string; active: boolean }) {
  const router = useRouter();
  return (
    <span className="flex items-center gap-2">
      {!active && (
        <button
          className={buttonClass("secondary", "sm")}
          onClick={async () => {
            await fetch("/api/datasets", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
            router.refresh();
          }}
        >
          Make active
        </button>
      )}
      <ConfirmDialog
        danger
        triggerLabel="Delete"
        title="Delete this dataset?"
        confirmLabel="Delete dataset"
        onConfirm={async () => {
          await fetch(`/api/datasets/${id}`, { method: "DELETE" });
          router.refresh();
        }}
      >
        <strong>{name}</strong> and all of its shipments, events, findings and simulations will be permanently removed. This cannot be undone.
      </ConfirmDialog>
    </span>
  );
}
