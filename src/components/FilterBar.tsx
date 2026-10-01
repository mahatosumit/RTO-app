"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { buttonClass } from "./ui";

export interface FilterField {
  key: string;
  label: string;
  options: string[];
}

const inputCls = "w-full rounded border border-line bg-panel px-2 py-1.5 text-[13px]";

/** URL-driven filters: every change rewrites the query string, so views are shareable and server-rendered. */
export function FilterBar({ fields, dates = false, search = false }: { fields: FilterField[]; dates?: boolean; search?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");

  function update(key: string, value: string) {
    const p = new URLSearchParams(sp.toString());
    if (value) p.set(key, value);
    else p.delete(key);
    p.delete("page");
    router.replace(`${pathname}?${p.toString()}`);
  }
  const keys = [...fields.map((f) => f.key), ...(dates ? ["from", "to"] : []), ...(search ? ["q"] : [])];
  const active = keys.filter((k) => sp.get(k)).length;

  return (
    <form
      role="search"
      aria-label="Filters"
      className="no-print mb-4 rounded border border-line bg-panel p-3"
      onSubmit={(e) => {
        e.preventDefault();
        update("q", q.trim());
      }}
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        {search && (
          <div className="col-span-2">
            <label htmlFor="f-q" className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted">Shipment / order ID</label>
            <input id="f-q" className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Starts with…" maxLength={64} />
          </div>
        )}
        {fields.map((f) => (
          <div key={f.key}>
            <label htmlFor={`f-${f.key}`} className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted">{f.label}</label>
            <select id={`f-${f.key}`} className={inputCls} value={sp.get(f.key) ?? ""} onChange={(e) => update(f.key, e.target.value)}>
              <option value="">All</option>
              {f.options.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>
        ))}
        {dates && (
          <>
            <div>
              <label htmlFor="f-from" className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted">Ordered from</label>
              <input id="f-from" type="date" className={inputCls} value={sp.get("from") ?? ""} onChange={(e) => update("from", e.target.value)} />
            </div>
            <div>
              <label htmlFor="f-to" className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted">Ordered to</label>
              <input id="f-to" type="date" className={inputCls} value={sp.get("to") ?? ""} onChange={(e) => update("to", e.target.value)} />
            </div>
          </>
        )}
      </div>
      <div className="mt-3 flex items-center gap-2">
        {search && <button type="submit" className={buttonClass("primary", "sm")}>Search</button>}
        {active > 0 && (
          <button
            type="button"
            className={buttonClass("ghost", "sm")}
            onClick={() => {
              const p = new URLSearchParams(sp.toString());
              keys.forEach((k) => p.delete(k));
              p.delete("page");
              setQ("");
              router.replace(`${pathname}?${p.toString()}`);
            }}
          >
            Clear {active} filter{active > 1 ? "s" : ""}
          </button>
        )}
      </div>
    </form>
  );
}
