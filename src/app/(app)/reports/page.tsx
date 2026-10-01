import Link from "next/link";
import { Badge, DataTable, EmptyState, LinkButton, NoDataset, PageHeader, Panel } from "@/components/ui";
import { getActiveDataset } from "@/lib/active";
import { formatINR } from "@/lib/domain/cost";
import { listFindings } from "@/lib/findings";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const ds = await getActiveDataset();
  if (!ds) return <NoDataset />;
  const findings = await listFindings(ds.id);
  return (
    <>
      <PageHeader eyebrow="Share the evidence" title="Reports" headline="Export an investigation summary or a dataset overview. Reports contain deterministic figures, evidence, simulation assumptions and caveats — no causal claims." />
      <Panel title="Dataset summary" headline={ds.name} actions={
        <>
          <LinkButton size="sm" href="/api/reports/dataset?format=md" prefetch={false}>Markdown</LinkButton>
          <LinkButton size="sm" variant="primary" href="/api/reports/dataset?format=html" prefetch={false}>Printable HTML</LinkButton>
          <LinkButton size="sm" href="/api/reports/dataset?format=json" prefetch={false}>JSON</LinkButton>
        </>
      }>
        <p className="text-[13px] text-muted">Headline numbers, anomalies in the last 7 days and the top investigation candidates. Open the printable HTML and use your browser&apos;s Print → Save as PDF.</p>
      </Panel>
      <Panel className="mt-4" title="Investigation reports" headline="One report per finding">
        {findings.length === 0 ? (
          <EmptyState title="No findings yet" action={<LinkButton href="/findings" variant="primary">Go to findings</LinkButton>}>Generate findings first, then export a report for each.</EmptyState>
        ) : (
          <DataTable
            caption="Investigation reports"
            rows={findings}
            rowKey={(f) => f.id}
            columns={[
              { key: "c", header: "ID", cell: (f) => <span className="font-mono text-xs">{f.code}</span> },
              { key: "t", header: "Finding", cell: (f) => <Link className="text-link hover:underline" href={`/findings/${f.id}`}>{f.title}</Link> },
              { key: "v", header: "RTO value", align: "right", cell: (f) => formatINR(f.affectedValue) },
              { key: "s", header: "Status", cell: (f) => <Badge tone={f.status ? "info" : "neutral"}>{f.status ?? "Not opened"}</Badge> },
              {
                key: "x", header: "Export",
                cell: (f) => (
                  <span className="flex gap-3 text-[13px]">
                    <a className="text-link hover:underline" href={`/api/reports/${f.id}?format=md`}>.md</a>
                    <a className="text-link hover:underline" href={`/api/reports/${f.id}?format=html`} target="_blank" rel="noreferrer">print</a>
                    <a className="text-link hover:underline" href={`/api/reports/${f.id}?format=json`}>json</a>
                  </span>
                ),
              },
            ]}
          />
        )}
      </Panel>
    </>
  );
}
