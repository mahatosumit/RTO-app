import { generateDemoData } from "@/lib/demo/generate";

export const dynamic = "force-dynamic";

/** A small synthetic CSV (messy headers on purpose) for trying the import wizard. */
export async function GET() {
  const { shipmentsCsv } = generateDemoData({ count: 400, seed: 7 });
  return new Response(shipmentsCsv, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="sample_shipments_synthetic.csv"' },
  });
}
