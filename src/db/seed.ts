/**
 * Seed script: loads the labelled DEMO dataset (≈6,000 shipments + scan events) through the real import pipeline.
 * Usage: npx tsx src/db/seed.ts
 */
import "dotenv/config";

async function main() {
  const { loadDemoDataset } = await import("@/lib/demo/load");
  const { pool } = await import("@/db");
  const started = Date.now();
  const res = await loadDemoDataset();
  console.log(`Demo dataset loaded: ${JSON.stringify(res)} in ${Date.now() - started}ms`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
