# Test Plan

Stack: Vitest. Run with `npx vitest run` (unit+integration) and `npx vitest run --config vitest.e2e.config.ts` (E2E, needs a running server at `E2E_BASE_URL`, default `http://localhost:3100`).

## Unit (no DB) — `tests/unit/*`
- dates parsing (ISO, dd/mm/yyyy, "10 Sep 2025 09:12", invalid)
- classification: delivered, RTO via flag, repeated NDR → RTO, NDR open, cancelled, lost, unknown, contradictions
- NDR reason normalisation
- courier-name normalisation
- column mapping suggestions
- row validation: missing id, invalid date, negative value, missing pincode (warn), unknown courier (warn), duplicate detection, impossible status transitions, extreme value
- quality score
- metrics: rates with zero, all delivered, all RTO; cost; recoverable value; Wilson
- anomaly detection: flagged / not flagged / low sample
- root-cause scoring and gates
- simulation: each scenario, zero target, no-improvement cases, assumptions present
- CSV export sanitisation

## Integration (real Postgres) — `tests/integration/*`
- import pipeline: parse → validate → commit a fixture CSV with bad rows; counts, provenance, rejected rows persisted
- analytics SQL: aggregateBy totals equal fixture-expected counts; filters
- findings generation + investigation status + notes
- simulation gather + save
- report builder output contains evidence, value, simulation, actions
- edge cases: empty dataset, shipment with no events

## E2E (HTTP against production server) — `tests/e2e/flow.test.ts`
upload CSV → mapping → validate → commit → dashboard page renders → RTO analysis API → drill-down filter → shipment detail page → generate findings → open investigation → add note → simulate → report export (md/html) → demo load endpoint.

## Gates
Typegen, `tsc --noEmit`, `eslint`, production build, `build_and_start` health check. Results are recorded in FINAL_IMPLEMENTATION_REPORT.md.

## Recorded results (last full run)
- Unit: 67 tests PASS (`tests/unit`). Integration: 18 tests PASS against real Postgres (`tests/integration`). HTTP E2E: 11 tests PASS against the production build (`tests/e2e`).
- `next typegen`, `tsc --noEmit`, `eslint .`, `npm run build`: PASS.
- Known test-scope note: E2E is HTTP-level (fetch against the production server, asserting rendered HTML and API responses). No headless browser is used, so client-side interactions (wizard clicks, dialogs) are covered by component logic + API tests, not by a browser driver.
