"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DatasetSwitcher({ datasets, activeId }: { datasets: Array<{ id: string; name: string; isDemo: boolean }>; activeId: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (datasets.length === 0) return <p className="rounded border border-white/15 px-2 py-1.5 text-xs text-white/60">No dataset loaded</p>;
  return (
    <div>
      <label htmlFor="dataset-switch" className="block pb-1 text-[10px] font-semibold uppercase tracking-widest text-white/45">Active dataset</label>
      <select
        id="dataset-switch"
        value={activeId ?? ""}
        disabled={busy}
        onChange={async (e) => {
          setBusy(true);
          await fetch("/api/datasets", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: e.target.value }) });
          router.refresh();
          setBusy(false);
        }}
        className="w-full rounded border border-white/20 bg-rail px-2 py-1.5 text-xs text-white"
      >
        {datasets.map((d) => (
          <option key={d.id} value={d.id}>
            {d.isDemo ? "[DEMO] " : ""}
            {d.name.slice(0, 40)}
          </option>
        ))}
      </select>
    </div>
  );
}
