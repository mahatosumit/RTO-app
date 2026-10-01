import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main" className="grid min-h-screen place-items-center px-4 text-center">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">404</p>
        <h1 className="mt-1 text-xl font-semibold">That page or record does not exist</h1>
        <p className="mt-1 text-[13px] text-muted">It may belong to a dataset that was deleted.</p>
        <Link href="/dashboard" className="mt-4 inline-block rounded border border-line bg-panel px-3 py-1.5 text-sm hover:bg-line-soft">Go to dashboard</Link>
      </div>
    </main>
  );
}
