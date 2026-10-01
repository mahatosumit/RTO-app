"use client";

import { useRef, type ReactNode } from "react";
import { buttonClass } from "./ui";

/** Side drawer using <dialog>; used for raw evidence that would clutter the page. */
export function Drawer({ triggerLabel, title, children }: { triggerLabel: string; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className={buttonClass("ghost", "sm")} onClick={() => ref.current?.showModal()}>{triggerLabel}</button>
      <dialog ref={ref} aria-labelledby="drawer-title" className="m-0 ml-auto h-screen max-h-screen w-full max-w-xl border-l border-line bg-panel p-0">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 id="drawer-title" className="font-semibold">{title}</h2>
          <button type="button" className={buttonClass("secondary", "sm")} onClick={() => ref.current?.close()}>Close</button>
        </div>
        <div className="overflow-y-auto p-4 text-[13px]" style={{ maxHeight: "calc(100vh - 56px)" }}>{children}</div>
      </dialog>
    </>
  );
}
