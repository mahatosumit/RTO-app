import Link from "next/link";
import { Badge, DataTable, EmptyState, NoDataset, PageHeader, Panel } from "@/components/ui";
import { ValidationSummary } from "@/components/ValidationSummary";
import { getActiveDataset } from "@/lib/active";
import { isUuid } from "@/lib/analytics/filters";
import { getImportErrors, listImportJobs } from "@/lib/csv/pipeline";
import type { QualityReport } from "@/lib/csv/quality";
import { formatIST } from "@/lib/domain/dates";
import { db } from "@/db";
import { datasets } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function ValidationPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const ds = await getActiveDataset();
  if (!ds) return <NoDataset />;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const [row] = await db.select({ q: datasets.qualityReport, rejected: datasets.rejectedCount }).from(datasets).where(eq(datasets.id, ds.id)).limit(1);
  const quality = row?.q as QualityReport | null;
  const jobs = await listImportJobs(ds.id);
  const jobParam = one(sp.job);
  const selected = jobParam && isUuid(jobParam) ? jobParam : jobs.find((j) => j.kind === "SHIPMENTS")?.id;
  const code = one(sp.code);
  const errors = selected ? await getImportErrors(selected, { code: code || undefined, limit: 200 }) : [];

  return (
    <>
      <PageHeader eyebrow="Data" title="Dataset validation" headline={quality ? `${ds.name}: quality ${quality.score}/100 — ${quality.rejected.toLocaleString("en-IN")} of ${quality.total.toLocaleString("en-IN")} rows were rejected at import.` : "No quality report stored for this dataset."} />
      {quality && <Panel title="Data quality"><ValidationSummary quality={quality} /></Panel>}

      <Panel className="mt-4" title="Import provenance" headline="Every row in this dataset traces back to one of these uploads">
        <DataTable
          caption="Import jobs"
          rows={jobs}
          rowKey={(j) => j.id}
          empty={<EmptyState title="No import jobs recorded" />}
          columns={[
            { key: "f", header: "File", cell: (j) => <Link className="text-link hover:underline" href={`/validation?job=${j.id}`}>{j.fileName}</Link> },
            { key: "k", header: "Kind", cell: (j) => <Badge>{j.kind}</Badge> },
            { key: "st", header: "Status", cell: (j) => <Badge tone={j.status === "COMMITTED" ? "good" : j.status === "FAILED" ? "bad" : "neutral"}>{j.status}</Badge> },
            { key: "r", header: "Rows", align: "right", cell: (j) => j.rowCount.toLocaleString("en-IN") },
            { key: "rej", header: "Rejected", align: "right", cell: (j) => ((j.report as { rejectedCount?: number } | null)?.rejectedCount ?? 0).toLocaleString("en-IN") },
            { key: "h", header: "SHA-256", cell: (j) => <span className="font-mono text-xs">{j.fileHash.slice(0, 12)}…</span> },
            { key: "d", header: "Uploaded", cell: (j) => formatIST(j.createdAt) },
          ]}
        />
      </Panel>

      <Panel className="mt-4" title="Rejected rows and warnings" headline={selected ? "Inspect the exact rows and reasons" : "Select an import"} actions={selected ? <a className="text-[13px] text-link hover:underline" href={`/api/imports/${selected}/errors?format=csv&limit=5000${code ? `&code=${code}` : ""}`}>Download error report (CSV)</a> : undefined}>
        {selected && (
          <div className="mb-3 flex flex-wrap gap-2 text-[13px]">
            <Link href={`/validation?job=${selected}`} className={`rounded border px-2 py-0.5 ${!code ? "border-ink" : "border-line"}`}>All</Link>
            {(quality?.warnings ?? []).map((w) => (
              <Link key={w.code} href={`/validation?job=${selected}&code=${w.code}`} className={`rounded border px-2 py-0.5 ${code === w.code ? "border-ink" : "border-line"}`}>{w.code.toLowerCase().replace(/_/g, " ")} ({w.count})</Link>
            ))}
          </div>
        )}
        <DataTable
          caption="Import issues"
          rows={errors}
          rowKey={(e) => String(e.id)}
          empty={<EmptyState title="No issues recorded for this selection">Either the file was clean or no validation has been run for it.</EmptyState>}
          columns={[
            { key: "r", header: "Row", align: "right", cell: (e) => e.rowNumber },
            { key: "s", header: "Severity", cell: (e) => <Badge tone={e.severity === "ERROR" ? "bad" : "warn"}>{e.severity === "ERROR" ? "rejected" : "warning"}</Badge> },
            { key: "c", header: "Code", cell: (e) => <span className="font-mono text-xs">{e.code}</span> },
            { key: "f", header: "Field", cell: (e) => e.field ?? "—" },
            { key: "m", header: "Reason", cell: (e) => e.message },
          ]}
        />
        {errors.length === 200 && <p className="mt-2 text-xs text-muted">Showing the first 200; download the CSV for the full list.</p>}
      </Panel>
    </>
  );
}
