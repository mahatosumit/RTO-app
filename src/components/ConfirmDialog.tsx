"use client";

import { useRef, useState, type ReactNode } from "react";
import { buttonClass } from "./ui";

/** Accessible confirmation built on the native <dialog> element (focus trap + Esc handled by the browser). */
export function ConfirmDialog({ triggerLabel, title, children, confirmLabel = "Confirm", onConfirm, danger = false }: { triggerLabel: string; title: string; children: ReactNode; confirmLabel?: string; onConfirm: () => Promise<void> | void; danger?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <button type="button" className={buttonClass(danger ? "danger" : "secondary", "sm")} onClick={() => ref.current?.showModal()}>
        {triggerLabel}
      </button>
      <dialog ref={ref} aria-labelledby="confirm-title" className="m-auto w-full max-w-md rounded border border-line bg-panel p-0 shadow-lg">
        <div className="p-5">
          <h2 id="confirm-title" className="text-base font-semibold">{title}</h2>
          <div className="mt-2 text-[13px] text-muted">{children}</div>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className={buttonClass("secondary", "sm")} onClick={() => ref.current?.close()}>Cancel</button>
            <button
              type="button"
              className={buttonClass(danger ? "danger" : "primary", "sm")}
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onConfirm();
                } finally {
                  setBusy(false);
                  ref.current?.close();
                }
              }}
            >
              {busy ? "Working…" : confirmLabel}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
