import Link from "next/link";
import type { ReactNode } from "react";

export type Tone = "neutral" | "bad" | "warn" | "good" | "info";

const TONE_BADGE: Record<Tone, string> = {
  neutral: "bg-line-soft text-muted",
  bad: "bg-rust-soft text-rust",
  warn: "bg-warn-soft text-warn",
  good: "bg-good-soft text-good",
  info: "bg-link-soft text-link",
};

export function Badge({ tone = "neutral", children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${TONE_BADGE[tone]}`}>
      {children}
    </span>
  );
}

const SEVERITY_TONE: Record<string, Tone> = {
  CRITICAL: "bad",
  HIGH: "bad",
  MEDIUM: "warn",
  WARNING: "warn",
  LOW: "neutral",
  NONE: "neutral",
};

/** Single mapping for finding/anomaly severity so every screen reads the same. */
export function SeverityBadge({ severity }: { severity: string }) {
  return <Badge tone={SEVERITY_TONE[severity] ?? "neutral"}>{severity}</Badge>;
}

export function buttonClass(variant: "primary" | "secondary" | "danger" | "ghost" = "secondary", size: "sm" | "md" = "md") {
  const base = "inline-flex items-center justify-center gap-1.5 rounded border font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";
  const sz = size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-2 text-sm";
  const v = {
    primary: "border-ink bg-ink text-white hover:bg-black",
    secondary: "border-line bg-panel text-ink hover:bg-line-soft",
    danger: "border-rust bg-rust text-white hover:bg-[#9a3a23]",
    ghost: "border-transparent bg-transparent text-link hover:bg-link-soft",
  }[variant];
  return `${base} ${sz} ${v}`;
}

export function LinkButton({ href, children, variant = "secondary", size = "md", prefetch }: { href: string; children: ReactNode; variant?: "primary" | "secondary" | "danger" | "ghost"; size?: "sm" | "md"; prefetch?: boolean }) {
  return (
    <Link href={href} prefetch={prefetch} className={buttonClass(variant, size)}>
      {children}
    </Link>
  );
}

export function Alert({ tone = "info", title, children, action }: { tone?: Tone; title?: string; children?: ReactNode; action?: ReactNode }) {
  const styles: Record<Tone, string> = {
    neutral: "border-line bg-panel",
    bad: "border-rust/40 bg-rust-soft",
    warn: "border-warn/40 bg-warn-soft",
    good: "border-good/40 bg-good-soft",
    info: "border-link/30 bg-link-soft",
  };
  return (
    <div role={tone === "bad" ? "alert" : "status"} className={`flex items-start justify-between gap-4 rounded border px-4 py-3 ${styles[tone]}`}>
      <div>
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="text-[13px] text-ink/85">{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, headline, actions, eyebrow }: { title: string; headline?: ReactNode; actions?: ReactNode; eyebrow?: string }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-line pb-4">
      <div className="max-w-3xl">
        {eyebrow && <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">{eyebrow}</p>}
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {headline && <p className="mt-1 text-[15px] text-ink/90">{headline}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Panel({ title, headline, actions, children, className = "", id }: { title?: string; headline?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={`rounded border border-line bg-panel ${className}`} aria-label={title}>
      {(title || headline || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-line-soft px-4 py-3">
          <div>
            {title && <h2 className="text-[11px] font-semibold uppercase tracking-widest text-muted">{title}</h2>}
            {headline && <p className="mt-0.5 text-[15px] font-medium">{headline}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Kpi({ label, value, sub, tone = "neutral", hint }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone; hint?: string }) {
  const color = tone === "bad" ? "text-rust" : tone === "good" ? "text-good" : tone === "warn" ? "text-warn" : "text-ink";
  return (
    <div className="rounded border border-line bg-panel px-4 py-3" title={hint}>
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">{label}</p>
      <p className={`num mt-1 text-2xl font-semibold tracking-tight ${color}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}

export interface Column<T> {
  key: string;
  header: ReactNode;
  align?: "left" | "right";
  cell: (row: T) => ReactNode;
  className?: string;
}

export function DataTable<T>({ columns, rows, rowKey, caption, empty, dense = false }: { columns: Column<T>[]; rows: T[]; rowKey: (r: T) => string; caption?: string; empty?: ReactNode; dense?: boolean }) {
  if (rows.length === 0) return <>{empty ?? <EmptyState title="No rows match.">Try widening the filters.</EmptyState>}</>;
  const padY = dense ? "py-1" : "py-1.5";
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="border-b border-line bg-canvas/60 text-left text-[11px] uppercase tracking-wider text-muted">
            {columns.map((c) => (
              <th key={c.key} scope="col" className={`px-2 py-2 font-semibold ${c.align === "right" ? "text-right" : ""} ${c.className ?? ""}`}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={rowKey(r)} className="border-b border-line-soft even:bg-canvas/40 hover:bg-canvas/70">
              {columns.map((c) => (
                <td key={c.key} className={`px-2 ${padY} align-top ${c.align === "right" ? "num text-right" : ""} ${c.className ?? ""}`}>
                  {c.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded border border-dashed border-line px-6 py-10 text-center">
      <p className="font-semibold">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-md text-[13px] text-muted">{children}</div>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", message, action }: { title?: string; message: string; action?: ReactNode }) {
  return (
    <div role="alert" className="rounded border border-rust/40 bg-rust-soft px-6 py-8 text-center">
      <p className="font-semibold text-rust">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-[13px]">{message}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-sm text-muted">
      <span aria-hidden className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-ink" />
      {label}
    </span>
  );
}

export function Tabs({ items, label }: { items: Array<{ href: string; label: string; active: boolean }>; label: string }) {
  return (
    <nav aria-label={label} className="mb-4 flex flex-wrap gap-1 border-b border-line">
      {items.map((t) => (
        <Link key={t.href} href={t.href} aria-current={t.active ? "page" : undefined} className={`-mb-px border-b-2 px-3 py-1.5 text-[13px] font-medium ${t.active ? "border-rust text-ink" : "border-transparent text-muted hover:text-ink"}`}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

export function DemoBanner() {
  return (
    <div role="note" className="border-b border-warn/40 bg-warn-soft px-6 py-1.5 text-center text-xs font-semibold text-warn">
      DEMO DATASET — synthetic data generated for demonstration. Not customer data.
    </div>
  );
}

export function SimulationBanner() {
  return (
    <div role="note" className="rounded border border-warn/50 bg-warn-soft px-4 py-2 text-[13px] font-bold uppercase tracking-wide text-warn">
      Simulation — not a guaranteed outcome
    </div>
  );
}

export function NoDataset() {
  return (
    <EmptyState
      title="No dataset yet"
      action={
        <div className="flex gap-2">
          <LinkButton href="/import" variant="primary">Import a CSV</LinkButton>
          <LinkButton href="/">Load demo dataset</LinkButton>
        </div>
      }
    >
      Import your shipment export, or load the labelled demo dataset from the home page to explore the product.
    </EmptyState>
  );
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wider text-muted">{label}</dt>
      <dd className="num font-medium">{value}</dd>
    </div>
  );
}
