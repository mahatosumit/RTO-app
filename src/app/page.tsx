import Link from "next/link";
import { DemoLoadButton } from "@/components/DemoLoadButton";
import { LinkButton } from "@/components/ui";
import { getActiveDataset } from "@/lib/active";

export const dynamic = "force-dynamic";

const LOOP = ["Import CSV", "Validate & normalise", "Shipment timelines", "RTO / NDR classification", "Segmentation", "Root-cause candidates", "Anomalies", "Findings", "Simulate intervention", "Report"];

export default async function LandingPage() {
  const ds = await getActiveDataset();
  return (
    <div className="min-h-screen bg-canvas">
      <header className="flex items-center justify-between border-b border-line px-6 py-4 md:px-12">
        <span className="text-[15px] font-bold tracking-tight">RTO AUTOPSY</span>
        <nav aria-label="Entry" className="flex gap-3 text-sm">
          {ds && <Link href="/dashboard" className="text-link hover:underline">Dashboard</Link>}
          <Link href="/import" className="text-link hover:underline">Import</Link>
        </nav>
      </header>
      <main id="main" className="mx-auto max-w-5xl px-6 py-14 md:px-12">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-rust">Operational intelligence for D2C logistics</p>
        <h1 className="mt-2 max-w-3xl text-4xl font-semibold leading-tight tracking-tight">Don&apos;t just count returned orders. Find out why they failed.</h1>
        <p className="mt-4 max-w-2xl text-[16px] text-muted">
          RTO Autopsy reconstructs every shipment&apos;s lifecycle from your courier exports, classifies RTO and NDR outcomes with deterministic rules, ranks the segments most associated with failure, and lets you simulate a policy change against your own history — with every assumption visible.
        </p>
        <div className="mt-8 flex flex-wrap items-start gap-4">
          <DemoLoadButton />
          <LinkButton href="/import">Import your CSV</LinkButton>
          {ds && <LinkButton href="/dashboard" variant="ghost">Open dashboard →</LinkButton>}
        </div>
        <p className="mt-3 text-xs text-muted">The demo loads ~6,000 clearly labelled synthetic shipments with embedded patterns. It is never mixed with your data.</p>

        <section aria-label="What it does" className="mt-14 grid gap-6 border-t border-line pt-8 md:grid-cols-3">
          <div>
            <h2 className="text-sm font-semibold">Forensics, not a chatbot</h2>
            <p className="mt-1 text-[13px] text-muted">Metrics, scoring, anomaly detection and simulations are computed by deterministic code from structured data. AI is optional and only assists with mapping and wording.</p>
          </div>
          <div>
            <h2 className="text-sm font-semibold">Evidence you can defend</h2>
            <p className="mt-1 text-[13px] text-muted">Every investigation candidate shows why it surfaced: share of RTOs, lift over baseline, COD share, sample size and recurrence. Correlation is never presented as cause.</p>
          </div>
          <div>
            <h2 className="text-sm font-semibold">From aggregate to shipment</h2>
            <p className="mt-1 text-[13px] text-muted">Drill from a headline to a segment to the exact shipments and their scan-by-scan timelines, then export the investigation.</p>
          </div>
        </section>

        <section aria-label="The loop" className="mt-12">
          <h2 className="text-[11px] font-semibold uppercase tracking-widest text-muted">The loop</h2>
          <ol className="mt-3 flex flex-wrap gap-x-2 gap-y-2 text-[13px]">
            {LOOP.map((s, i) => (
              <li key={s} className="flex items-center gap-2">
                <span className="rounded border border-line bg-panel px-2 py-1">{s}</span>
                {i < LOOP.length - 1 && <span aria-hidden className="text-muted">→</span>}
              </li>
            ))}
          </ol>
        </section>
      </main>
    </div>
  );
}
