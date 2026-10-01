import { Badge } from "./ui";
import type { QualityReport } from "@/lib/csv/quality";

/** Presentational data-quality summary shared by the import wizard and the validation page. */
export function ValidationSummary({ quality }: { quality: QualityReport }) {
  const tone = quality.score >= 90 ? "text-good" : quality.score >= 70 ? "text-warn" : "text-rust";
  return (
    <div>
      <div className="flex flex-wrap items-end gap-6">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">Dataset quality</p>
          <p className={`num text-4xl font-semibold ${tone}`}>{quality.score}<span className="text-lg font-normal text-muted">/100</span></p>
        </div>
        <dl className="flex gap-6 text-[13px]">
          <div><dt className="text-muted">Rows</dt><dd className="num font-medium">{quality.total.toLocaleString("en-IN")}</dd></div>
          <div><dt className="text-muted">Accepted</dt><dd className="num font-medium text-good">{quality.accepted.toLocaleString("en-IN")}</dd></div>
          <div><dt className="text-muted">Rejected</dt><dd className="num font-medium text-rust">{quality.rejected.toLocaleString("en-IN")}</dd></div>
        </dl>
      </div>
      {quality.warnings.length > 0 ? (
        <ul className="mt-4 space-y-1 text-[13px]" aria-label="Data quality warnings">
          {quality.warnings.map((w) => (
            <li key={w.code} className="flex items-center gap-2">
              <Badge tone={w.severity === "ERROR" ? "bad" : "warn"}>{w.severity === "ERROR" ? "rejected" : "warning"}</Badge>
              <span className="num">{w.pct < 0.1 ? "<0.1" : w.pct.toFixed(1)}%</span>
              <span>{w.label}</span>
              <span className="text-xs text-muted">({w.count.toLocaleString("en-IN")} rows)</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-[13px] text-good">No data-quality issues detected.</p>
      )}
    </div>
  );
}
