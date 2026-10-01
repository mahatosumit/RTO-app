"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  return (
    <main id="main" className="grid min-h-screen place-items-center px-4">
      <form
        className="w-full max-w-sm space-y-4 rounded border border-line bg-panel p-6"
        onSubmit={async (e) => {
          e.preventDefault();
          const res = await fetch("/api/auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key }) });
          if (res.ok) router.replace("/dashboard");
          else setError("Incorrect access key.");
        }}
      >
        <h1 className="text-lg font-semibold">RTO Autopsy</h1>
        <div>
          <label htmlFor="key" className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted">Access key</label>
          <input id="key" type="password" autoComplete="current-password" className="w-full rounded border border-line px-2 py-1.5" value={key} onChange={(e) => setKey(e.target.value)} />
        </div>
        {error && <p role="alert" className="text-sm text-rust">{error}</p>}
        <button className="w-full rounded border border-ink bg-ink px-3 py-2 text-sm font-medium text-white" type="submit">Sign in</button>
      </form>
    </main>
  );
}
