import { DemoLoadButton } from "@/components/DemoLoadButton";
import { CostForm, DatasetActions } from "@/components/SettingsForms";
import { Badge, DataTable, PageHeader, Panel } from "@/components/ui";
import { getActiveDataset } from "@/lib/active";
import { aiStatus } from "@/lib/ai/provider";
import { formatIST } from "@/lib/domain/dates";
import { getCostModel, listDatasets } from "@/lib/org";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [cost, all, active] = await Promise.all([getCostModel(), listDatasets(), getActiveDataset()]);
  const ai = aiStatus();
  return (
    <>
      <PageHeader eyebrow="Configuration" title="Settings" headline="Cost assumptions drive every cost and simulation figure. They are estimates — edit them to match your contracts." />
      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Panel title="RTO cost model" headline="cost per RTO = forward + reverse + handling + order value × COGS × write-off"><CostForm initial={cost} /></Panel>
        <div className="space-y-4">
          <Panel title="AI assistance (optional)">
            <p className="text-[13px]">
              Status: {ai.configured ? <Badge tone="info">{ai.provider} / {ai.model}</Badge> : <Badge>not configured</Badge>}
            </p>
            <p className="mt-2 text-[13px] text-muted">
              AI is only used for column-mapping hints and narrative wording, and every AI output is labelled. All metrics, scoring, anomalies and simulations are deterministic and work without it. Configure with <code>AI_PROVIDER</code>, <code>AI_API_KEY</code>, <code>AI_MODEL</code>, <code>AI_BASE_URL</code> on the server.
            </p>
          </Panel>
          <Panel title="Security">
            <p className="text-[13px] text-muted">Access key gate: {process.env.APP_ACCESS_KEY ? "enabled" : "disabled (set APP_ACCESS_KEY to require sign-in)"}. Uploads: CSV only, max {process.env.MAX_UPLOAD_MB ?? 10} MB.</p>
          </Panel>
        </div>
      </div>
      <Panel className="mt-4" title="Datasets" actions={<DemoLoadButton variant="secondary" label="Reload demo dataset" />}>
        <DataTable
          caption="Datasets"
          rows={all}
          rowKey={(d) => d.id}
          empty={<p className="text-[13px] text-muted">No datasets yet.</p>}
          columns={[
            { key: "n", header: "Name", cell: (d) => <span className="font-medium">{d.name}</span> },
            { key: "t", header: "Type", cell: (d) => (d.isDemo ? <Badge tone="warn">demo</Badge> : <Badge tone="info">imported</Badge>) },
            { key: "s", header: "Shipments", align: "right", cell: (d) => d.shipmentCount.toLocaleString("en-IN") },
            { key: "q", header: "Quality", align: "right", cell: (d) => d.qualityScore ?? "—" },
            { key: "c", header: "Created", cell: (d) => formatIST(d.createdAt) },
            { key: "a", header: "", cell: (d) => <DatasetActions id={d.id} name={d.name} active={active?.id === d.id} /> },
          ]}
        />
      </Panel>
    </>
  );
}
