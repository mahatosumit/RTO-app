import type { ReactNode } from "react";

export interface BarRow {
  label: ReactNode;
  value: number; // bar length basis
  display: string;
  sub?: ReactNode;
  tone?: "rust" | "link" | "muted";
}

/** Horizontal bar list. Values are printed beside each bar so colour is never the only signal. */
export function BarList({ rows, max, ariaLabel }: { rows: BarRow[]; max?: number; ariaLabel: string }) {
  const m = max ?? Math.max(...rows.map((r) => r.value), 0.0001);
  return (
    <ul aria-label={ariaLabel} className="space-y-2">
      {rows.map((r, i) => (
        <li key={i} className="grid grid-cols-[minmax(0,14rem)_1fr_auto] items-center gap-3 text-[13px]">
          <span className="truncate" title={typeof r.label === "string" ? r.label : undefined}>
            {r.label}
            {r.sub && <span className="ml-1 text-xs text-muted">{r.sub}</span>}
          </span>
          <span className="h-2.5 rounded-sm bg-line-soft" aria-hidden>
            <span className={`block h-full rounded-sm ${r.tone === "link" ? "bg-link" : r.tone === "muted" ? "bg-muted/60" : "bg-rust"}`} style={{ width: `${Math.max(1, Math.min(100, (r.value / m) * 100))}%` }} />
          </span>
          <span className="num text-right font-medium">{r.display}</span>
        </li>
      ))}
    </ul>
  );
}

export interface TrendPoint {
  label: string;
  rate: number | null;
  n: number;
}

/** Weekly RTO-rate columns with an optional baseline line. */
export function TrendChart({ points, baseline, ariaLabel }: { points: TrendPoint[]; baseline?: number | null; ariaLabel: string }) {
  const W = 720;
  const H = 180;
  const pad = { l: 36, r: 8, t: 10, b: 28 };
  const maxRate = Math.max(0.05, ...points.map((p) => p.rate ?? 0), baseline ?? 0) * 1.15;
  const bw = (W - pad.l - pad.r) / Math.max(points.length, 1);
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / maxRate);
  const ticks = [0, maxRate / 2, maxRate];
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} className="w-full">
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="#ebe9e2" />
            <text x={pad.l - 4} y={y(t) + 3} textAnchor="end" fontSize="10" fill="#5a616d">{(t * 100).toFixed(0)}%</text>
          </g>
        ))}
        {points.map((p, i) => {
          const h = p.rate === null ? 0 : (H - pad.t - pad.b) * (p.rate / maxRate);
          const hot = baseline != null && p.rate != null && p.n >= 30 && p.rate > baseline * 1.5;
          return (
            <g key={p.label}>
              <rect x={pad.l + i * bw + 3} y={H - pad.b - h} width={Math.max(bw - 6, 2)} height={h} fill={hot ? "#b4442a" : "#6b7a99"} opacity={p.n < 30 ? 0.4 : 1}>
                <title>{`${p.label}: ${p.rate === null ? "n/a" : (p.rate * 100).toFixed(1) + "%"} (n=${p.n})`}</title>
              </rect>
              {(points.length <= 8 || i % 2 === 0) && (
                <text x={pad.l + i * bw + bw / 2} y={H - 10} textAnchor="middle" fontSize="9" fill="#5a616d">{p.label.slice(5)}</text>
              )}
            </g>
          );
        })}
        {baseline != null && (
          <line x1={pad.l} x2={W - pad.r} y1={y(baseline)} y2={y(baseline)} stroke="#16181d" strokeDasharray="4 3" />
        )}
      </svg>
      <figcaption className="text-xs text-muted">
        Weekly RTO rate by order week (Mon start). Lighter columns have fewer than 30 resolved shipments.
        {baseline != null && <> Dashed line = dataset baseline ({(baseline * 100).toFixed(1)}%).</>}
      </figcaption>
    </figure>
  );
}

/** Heat cell background for a rate relative to baseline. */
export function heat(rate: number | null, baseline: number | null, n: number): string {
  if (rate === null || baseline === null || baseline <= 0 || n < 30) return "transparent";
  const r = rate / baseline;
  if (r < 1.1) return "transparent";
  const a = Math.min(0.55, (r - 1) * 0.25);
  return `rgba(180,68,42,${a.toFixed(2)})`;
}
