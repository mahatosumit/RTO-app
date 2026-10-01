"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Badge, buttonClass, Spinner } from "./ui";
import { ValidationSummary } from "./ValidationSummary";
import type { QualityReport } from "@/lib/csv/quality";

interface Job {
  id: string;
  kind: "SHIPMENTS" | "EVENTS";
  fileName: string;
  headers: string[];
  sampleRows: Record<string, string>[];
  suggestedMapping: Record<string, string | null>;
  rowCount: number;
  fields: Array<{ key: string; label: string; required: boolean }>;
}
interface Report {
  quality: QualityReport;
  rowCount: number;
  acceptedCount: number;
  rejectedCount: number;
  examples: Array<{ rowNumber: number; code: string; message: string }>;
  truncated: boolean;
}

const inp = "w-full rounded border border-line bg-panel px-2 py-1.5 text-[13px]";
const lab = "mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted";

export function ImportWizard({ datasets }: { datasets: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [kind, setKind] = useState<"SHIPMENTS" | "EVENTS">("SHIPMENTS");
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [target, setTarget] = useState(datasets[0]?.id ?? "");
  const [job, setJob] = useState<Job | null>(null);
  const [mapping, setMapping] = useState<Record<string, string | null>>({});
  const [aiFields, setAiFields] = useState<string[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [result, setResult] = useState<{ imported: number; rejected: number; datasetId: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function call(url: string, init: RequestInit) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(url, init);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message ?? "Request failed");
      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function upload() {
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    fd.set("kind", kind);
    if (name.trim()) fd.set("datasetName", name.trim());
    if (kind === "EVENTS") fd.set("targetDatasetId", target);
    const data = await call("/api/imports", { method: "POST", body: fd });
    if (!data) return;
    setJob(data.job);
    setMapping(data.job.suggestedMapping);
    setAiFields(data.ai?.suggestedFields ?? []);
    setStep(2);
  }

  async function validate() {
    if (!job) return;
    const data = await call(`/api/imports/${job.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "validate", mapping }) });
    if (!data) return;
    setReport(data.report);
    setStep(3);
  }

  async function commit() {
    if (!job) return;
    const data = await call(`/api/imports/${job.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "commit" }) });
    if (!data) return;
    setResult(data.result);
    setStep(4);
    router.refresh();
  }

  const missing = job ? job.fields.filter((f) => f.required && !mapping[f.key]) : [];
  const steps = ["Upload", "Map columns", "Validate", "Import"];

  return (
    <div>
      <ol className="mb-5 flex flex-wrap gap-2 text-[13px]" aria-label="Import steps">
        {steps.map((s, i) => (
          <li key={s} aria-current={step === i + 1 ? "step" : undefined} className={`rounded border px-3 py-1 ${step === i + 1 ? "border-ink bg-ink text-white" : step > i + 1 ? "border-good/40 bg-good-soft text-good" : "border-line bg-panel text-muted"}`}>
            {i + 1}. {s}
          </li>
        ))}
      </ol>
      {error && <div className="mb-4"><Alert tone="bad" title="Something needs attention">{error}</Alert></div>}

      {step === 1 && (
        <form className="max-w-2xl space-y-4 rounded border border-line bg-panel p-5" onSubmit={(e) => { e.preventDefault(); void upload(); }}>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="kind" className={lab}>File contains</label>
              <select id="kind" className={inp} value={kind} onChange={(e) => setKind(e.target.value as "SHIPMENTS" | "EVENTS")}>
                <option value="SHIPMENTS">Shipments (one row per shipment)</option>
                <option value="EVENTS" disabled={datasets.length === 0}>Scan events (one row per event)</option>
              </select>
            </div>
            {kind === "SHIPMENTS" ? (
              <div>
                <label htmlFor="dsname" className={lab}>Dataset name</label>
                <input id="dsname" className={inp} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sep 2025 courier export" />
              </div>
            ) : (
              <div>
                <label htmlFor="target" className={lab}>Attach events to dataset</label>
                <select id="target" className={inp} value={target} onChange={(e) => setTarget(e.target.value)}>
                  {datasets.map((d) => <option key={d.id} value={d.id}>{d.name.slice(0, 50)}</option>)}
                </select>
              </div>
            )}
          </div>
          <div>
            <label htmlFor="file" className={lab}>CSV file (max 10 MB)</label>
            <input id="file" type="file" accept=".csv,text/csv" className={inp} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <p className="mt-1 text-xs text-muted">Headers like <code>AWB</code>, <code>Payment Mode</code>, <code>Delivery Pincode</code> are recognised automatically; you review the mapping next. Events are matched to shipments by shipment ID.</p>
          </div>
          <div className="flex items-center gap-3">
            <button type="submit" className={buttonClass("primary")} disabled={!file || busy}>{busy ? "Uploading…" : "Upload and inspect"}</button>
            {busy && <Spinner label="Reading file…" />}
            <a className="text-[13px] text-link hover:underline" href="/api/demo/sample-csv">Download a synthetic sample CSV</a>
          </div>
        </form>
      )}

      {step === 2 && job && (
        <div className="space-y-4">
          <div className="rounded border border-line bg-panel p-4">
            <p className="text-[13px]"><strong>{job.fileName}</strong> · {job.rowCount.toLocaleString("en-IN")} data rows · {job.headers.length} columns. Review how each column maps to a canonical field. Nothing is imported yet.</p>
          </div>
          <div className="overflow-x-auto rounded border border-line bg-panel">
            <table className="w-full text-[13px]">
              <caption className="sr-only">Column mapping</caption>
              <thead><tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-muted"><th className="px-3 py-2">Canonical field</th><th className="px-3 py-2">Your column</th><th className="px-3 py-2">Sample values</th></tr></thead>
              <tbody>
                {job.fields.map((f) => {
                  const h = mapping[f.key];
                  return (
                    <tr key={f.key} className="border-b border-line-soft">
                      <th scope="row" className="px-3 py-1.5 text-left font-medium">
                        <label htmlFor={`m-${f.key}`}>{f.label}</label> {f.required && <Badge tone="bad">required</Badge>} {aiFields.includes(f.key) && <Badge tone="info" title="Suggested by the optional AI provider; please verify">AI suggested</Badge>}
                      </th>
                      <td className="px-3 py-1.5">
                        <select id={`m-${f.key}`} className={inp} value={h ?? ""} onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value || null })}>
                          <option value="">— not mapped —</option>
                          {job.headers.map((x) => <option key={x} value={x}>{x}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-1.5 font-mono text-xs text-muted">{h ? job.sampleRows.slice(0, 3).map((r) => String(r[h] ?? "").slice(0, 24)).join(" | ") : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {missing.length > 0 && <Alert tone="warn" title="Required fields are not mapped">{missing.map((m) => m.label).join(", ")}</Alert>}
          <div className="flex gap-2">
            <button className={buttonClass("secondary")} onClick={() => setStep(1)}>Back</button>
            <button className={buttonClass("primary")} disabled={missing.length > 0 || busy} onClick={validate}>{busy ? "Validating…" : "Validate data"}</button>
            {busy && <Spinner label="Validating every row…" />}
          </div>
        </div>
      )}

      {step === 3 && job && report && (
        <div className="space-y-4">
          <div className="rounded border border-line bg-panel p-5"><ValidationSummary quality={report.quality} /></div>
          {report.rejectedCount > 0 && (
            <div className="rounded border border-line bg-panel p-4">
              <p className="mb-2 text-[13px] font-semibold">Rejected rows ({report.rejectedCount.toLocaleString("en-IN")}) — examples</p>
              <ul className="space-y-1 text-[13px]">
                {report.examples.map((e, i) => <li key={i}><span className="font-mono text-xs text-muted">row {e.rowNumber}</span> · <Badge tone="bad">{e.code}</Badge> {e.message}</li>)}
              </ul>
              <p className="mt-2 text-xs text-muted">
                Rejected rows are kept for review, not silently discarded.{" "}
                <a className="text-link hover:underline" href={`/api/imports/${job.id}/errors?format=csv&limit=5000`}>Download error report (CSV)</a> ·{" "}
                <Link className="text-link hover:underline" href={`/validation?job=${job.id}`}>Browse all issues</Link>
              </p>
            </div>
          )}
          <div className="flex gap-2">
            <button className={buttonClass("secondary")} onClick={() => setStep(2)}>Adjust mapping</button>
            <button className={buttonClass("primary")} disabled={busy || report.acceptedCount === 0} onClick={commit}>{busy ? "Importing…" : `Import ${report.acceptedCount.toLocaleString("en-IN")} valid ${job.kind === "EVENTS" ? "events" : "shipments"}`}</button>
            {busy && <Spinner label="Importing in batches…" />}
          </div>
          {report.acceptedCount === 0 && <Alert tone="bad" title="Nothing to import">Every row was rejected. Fix the file or the mapping and try again.</Alert>}
        </div>
      )}

      {step === 4 && result && (
        <div className="max-w-2xl space-y-3">
          <Alert tone="good" title="Import complete">
            {result.imported.toLocaleString("en-IN")} {job?.kind === "EVENTS" ? "events" : "shipments"} imported, {result.rejected.toLocaleString("en-IN")} rejected. Provenance (file name, hash, row numbers) is stored with the import.
          </Alert>
          <div className="flex gap-2">
            <Link className={buttonClass("primary")} href="/dashboard">Open dashboard</Link>
            <Link className={buttonClass("secondary")} href="/validation">View validation</Link>
            <button className={buttonClass("ghost")} onClick={() => { setStep(1); setFile(null); setJob(null); setReport(null); setResult(null); }}>Import another file</button>
          </div>
        </div>
      )}
    </div>
  );
}
