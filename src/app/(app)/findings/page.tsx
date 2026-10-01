import Link from "next/link";
import { GenerateFindingsButton } from "@/components/GenerateFindingsButton";
import { Badge, DataTable, EmptyState, NoDataset, PageHeader, Panel, SeverityBadge } from "@/components/ui";
import { getActiveDataset } from "@/lib/active";
import { formatINR } from "@/lib/domain/cost";
import { listFindings } from "@/lib/findings";

export const dynamic = "force-dynamic";

export default async function FindingsPage() {
  const ds = await getActiveDataset();
  if (!ds) return <NoDataset />;
  const findings = await listFindings(ds.id);
  const open = findings.filter((f) => f.status === "OPEN" || f.status === "INVESTIGATING").length;
  return (
    <>
      <PageHeader
        eyebrow="Investigations"
        title="Findings"
        headline={findings.length ? `${findings.length} findings; ${open} under active investigation. Affected RTO value across findings overlaps and should not be summed.` : "No findings yet."}
        actions={<GenerateFindingsButton label={findings.length ? "Refresh findings" : "Generate findings"} variant="primary" />}
      />
      <Panel>
        {findings.length === 0 ? (
          <EmptyState title="Generate findings for this dataset">The scan ranks concentration candidates and flags unusual increases in the last 7 days, using transparent scoring.</EmptyState>
        ) : (
          <DataTable
            caption="Findings"
            rows={findings}
            rowKey={(f) => f.id}
            columns={[
              { key: "c", header: "ID", cell: (f) => <span className="font-mono text-xs">{f.code}</span> },
              { key: "t", header: "Finding", cell: (f) => <Link className="font-medium text-link hover:underline" href={`/findings/${f.id}`}>{f.title}</Link> },
              { key: "ty", header: "Type", cell: (f) => <Badge>{f.type === "ANOMALY" ? "Anomaly" : "Concentration"}</Badge> },
              { key: "s", header: "Severity", cell: (f) => <SeverityBadge severity={f.severity} /> },
              { key: "sc", header: "Score", align: "right", cell: (f) => f.score },
              { key: "v", header: "RTO value", align: "right", cell: (f) => formatINR(f.affectedValue) },
              { key: "n", header: "Resolved shipments", align: "right", cell: (f) => f.affectedShipments.toLocaleString("en-IN") },
              { key: "st", header: "Status", cell: (f) => <Badge tone={f.status === "RESOLVED" ? "good" : f.status ? "info" : "neutral"}>{f.status ?? "Not opened"}</Badge> },
            ]}
          />
        )}
      </Panel>
    </>
  );
}
