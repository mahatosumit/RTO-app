"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavItem {
  href: string;
  label: string;
}

export interface NavGroup {
  group: string;
  items: NavItem[];
}

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Primary navigation. Highlights the current route with aria-current, and collapses
 * from a grouped vertical list (md+) to a horizontal scroll rail on small screens.
 */
export function NavLinks({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary" className="px-2 pb-2 md:pb-6">
      <div className="flex gap-2 overflow-x-auto md:block md:overflow-visible">
        {groups.map((g) => (
          <div key={g.group} className="shrink-0 md:mb-3">
            <p className="hidden px-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-white/45 md:block">{g.group}</p>
            <ul className="flex gap-1 md:block">
              {g.items.map((i) => {
                const active = isActive(pathname, i.href);
                return (
                  <li key={i.href}>
                    <Link
                      href={i.href}
                      aria-current={active ? "page" : undefined}
                      className={`block whitespace-nowrap rounded px-2 py-1.5 text-[13px] ${
                        active ? "bg-white/15 font-semibold text-white" : "text-white/85 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      {i.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
