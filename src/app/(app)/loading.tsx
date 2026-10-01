import { Spinner } from "@/components/ui";

export default function Loading() {
  return (
    <div className="py-20 text-center">
      <Spinner label="Running analysis…" />
    </div>
  );
}
