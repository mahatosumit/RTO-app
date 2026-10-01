import Link from "next/link";
import type { ReactNode } from "react";
import type { DatasetInfo } from "@/lib/analytics/types";
import { DatasetSwitcher } from "./DatasetSwitcher";
import { NavLinks, type NavGroup } from "./NavLinks";
import { DemoBanner } from "./ui";

const NAV: NavGroup[] = [
  {
    group: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard" },
      { href: "/findings", label: "Findings" },
    ],
  },
  {
    group: "Investigate",
    items: [
      { href: "/shipments", label: "Shipments" },
      { href: "/rto", label: "RTO analysis" },
      { href: "/ndr", label: "NDR analysis" },
      { href: "/anomalies", label: "Anomalies" },
      { href: "/geo", label: "Geography" },
      { href: "/couriers", label: "Couriers" },
      { href: "/products", label: "Products" },
    ],
  },
  { group: "Simulate", items: [{ href: "/simulator", label: "Intervention simulator" }] },
  { group: "Report", items: [{ href: "/reports", label: "Reports" }] },
  {
    group: "Data",
    items: [
      { href: "/import", label: "Import" },
      { href: "/validation", label: "Validation" },
    ],
  },
  { group: "Settings", items: [{ href: "/settings", label: "Settings" }] },
];

export function Shell({ dataset, datasets, children }: { dataset: DatasetInfo | null; datasets: DatasetInfo[]; children: ReactNode }) {
  return (
    <div className="min-h-screen md:grid md:grid-cols-[224px_1fr]">
      <aside className="no-print bg-rail text-white md:sticky md:top-0 md:h-screen md:overflow-y-auto">
        <div className="px-4 py-4">
          <Link href="/" className="block text-[15px] font-bold tracking-tight">RTO AUTOPSY</Link>
          <p className="mt-0.5 text-[11px] leading-snug text-white/60">Find out why they failed.</p>
        </div>
        <div className="px-3 pb-3">
          <DatasetSwitcher datasets={datasets.map((d) => ({ id: d.id, name: d.name, isDemo: d.isDemo }))} activeId={dataset?.id ?? null} />
        </div>
        <NavLinks groups={NAV} />
      </aside>
      <div className="min-w-0">
        {dataset?.isDemo && <DemoBanner />}
        <main id="main" className="mx-auto max-w-[1400px] px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
