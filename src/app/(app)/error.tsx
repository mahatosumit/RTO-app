"use client";

import { ErrorState } from "@/components/ui";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <ErrorState
      title="This view could not be loaded"
      message="The analysis failed to run. Check that a dataset is loaded and try again. If the problem persists, re-import the data."
      action={
        <button onClick={reset} className="rounded border border-line bg-white px-3 py-1.5 text-sm font-medium hover:bg-line-soft">
          Try again
        </button>
      }
    />
  );
}
