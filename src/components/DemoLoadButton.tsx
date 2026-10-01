"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { buttonClass } from "./ui";

export function DemoLoadButton({ variant = "primary", label = "Load demo dataset" }: { variant?: "primary" | "secondary"; label?: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [msg, setMsg] = useState("");
  return (
    <div>
      <button
        className={buttonClass(variant)}
        disabled={state === "loading"}
        onClick={async () => {
          setState("loading");
          try {
            const res = await fetch("/api/demo/load", { method: "POST" });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error?.message ?? "Failed");
            router.push("/dashboard");
            router.refresh();
          } catch (e) {
            setState("error");
            setMsg(e instanceof Error ? e.message : "Failed to load demo data.");
          }
        }}
      >
        {state === "loading" ? "Generating & importing ~6,000 shipments…" : label}
      </button>
      {state === "error" && <p role="alert" className="mt-2 text-sm text-rust">{msg}</p>}
      {state === "loading" && <p role="status" className="mt-2 text-xs text-muted">Running the real import pipeline on a synthetic CSV. This takes a few seconds.</p>}
    </div>
  );
}
