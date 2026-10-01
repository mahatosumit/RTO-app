"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { buttonClass } from "./ui";

export function GenerateFindingsButton({ label = "Generate findings", variant = "secondary" }: { label?: string; variant?: "primary" | "secondary" }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  const [msg, setMsg] = useState("");
  return (
    <span>
      <button
        className={buttonClass(variant)}
        disabled={state === "busy"}
        onClick={async () => {
          setState("busy");
          const res = await fetch("/api/findings", { method: "POST" });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            setState("error");
            setMsg(data?.error?.message ?? "Could not generate findings.");
            return;
          }
          setState("idle");
          router.refresh();
        }}
      >
        {state === "busy" ? "Analysing…" : label}
      </button>
      {state === "error" && <span role="alert" className="ml-2 text-sm text-rust">{msg}</span>}
    </span>
  );
}
