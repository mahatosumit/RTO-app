# FINAL IMPLEMENTATION REPORT — RTO Autopsy

## 1. What was built
A complete Next.js + PostgreSQL application that takes raw courier/shipment CSV exports through **import → validation → normalisation → lifecycle timelines → RTO/NDR classification → segmentation → root-cause candidates → anomaly detection → findings/investigations → intervention simulation → exportable report**. A one-click, clearly labelled demo dataset (~6,000 synthetic shipments with embedded patterns and imperfect records) runs through the same import pipeline a customer file uses.

## 2. Architecture
Single Next.js 16 app (App Router, Server Components for data pages, small client islands for filters/wizard/simulator/dialogs), route handlers for JSON APIs, pure TypeScript domain modules (`src/lib/domain`, `src/lib/analytics`, `src/lib/csv`), Drizzle + Postgres. Optional access-key gate in `src/proxy.ts`. See `docs/TAD.md`, `docs/TRD.md`.

## 3. Database
20 tables (organizations, users, cost_settings, datasets, import_jobs, import_errors, customers, products, couriers, pincodes, shipments, shipment_events, ndr_records, rto_records, findings, investigations, investigation_notes, simulations, simulation_results, audit_logs). `shipments` carries denormalised read-model columns and composite indexes `(dataset_id, …)` for server-side aggregation; unique `(dataset_id, shipment_id)`. Schema applies from a clean DB with `npx drizzle-kit push` (verified). See `docs/BACKEND_SCHEMA.md`.

## 4. Analytics engine (deterministic, no LLM)
Generic whitelisted-dimension SQL aggregation (`aggregateBy`) feeding pure functions: metrics A–O (`metrics.ts`), Wilson intervals, rolling-baseline binomial z-test anomalies (`anomaly.ts`), gated and scored root-cause candidates with "why surfaced" (`rootcause.ts`), five simulation scenarios with visible assumptions (`simulate.ts`). Formulas: `docs/ANALYTICS_SPEC.md`.

## 5. AI integration
Provider abstraction (OpenAI-compatible incl. local Ollama/vLLM via base URL, Anthropic, mock, none). Used only for optional column-mapping hints (validated against whitelists), NDR-text classification suggestions, and narrative wording; always labelled, always with deterministic fallback. Never computes metrics. The app runs fully with no AI key (tested).

## 6. Main features
Landing + one-click demo; dashboard (KPIs, anomaly banner, weekly trend with baseline, findings); 4-step import wizard with editable mapping; dataset validation page with quality score, provenance and downloadable error CSV; shipment explorer + forensic timeline (derived timeline clearly labelled when no scans exist); RTO analysis across 13 dimensions; NDR analysis; root-cause ranking with score breakdown; geography (region/state/cluster/pincode with courier mix); courier comparison by context with courier×region matrix (no "best courier" claim); intervention simulator (5 scenarios); findings with OPEN/INVESTIGATING/RESOLVED/DISMISSED workflow and notes; reports (md / printable html / json); settings (cost model, datasets, AI status); optional access-key gate.

## 7. Tests
Unit (67), integration against real Postgres (18), HTTP-level E2E against the production server (11): import → validate → commit → events → dashboard → RTO analysis → drill-down → shipment detail → findings → investigation → simulation → report → settings. Edge cases covered: zero shipments, all delivered, all RTO, missing pincode, duplicate shipment, invalid date, unknown courier, repeated NDR, shipment with no events, extreme order value, negative/invalid values, empty CSV, binary/oversized/wrong-type uploads, hostile filter input.

## 8. Test results (verified run — 2026-10-01, PostgreSQL 16.14)
- `npm test` → **4 files, 85 passed** (unit + integration, `tests/unit` + `tests/integration`).
- `npm run test:e2e` → **1 file, 11 passed** (HTTP flow against the running production server).
- `npm run typecheck` → **PASS** (0 errors). `npm run lint` → **PASS** (0 errors, 0 warnings).
- `npm run build` → **PASS**. `npm run db:push` on a clean DB → **PASS** (20 tables). `npm run seed` → **PASS** (5,962 shipments, 59 rejected, 38,160 events, 14 findings).
- Live demo verification over HTTP: dashboard banner flagged (last 7 days **21.1%** vs **11.4%** baseline = **1.85×**, z = 7.0); 9 of 33 scanned segments flagged; `CHANGE_COURIER` simulated on the 7 auto-selected high-risk COD pincodes returned an estimate with visible assumptions (`SIMULATION — NOT A GUARANTEED OUTCOME`); report export returned all required sections.

## 9. Build result
Production build succeeds via `next build` (Turbopack); 34 routes; Proxy (middleware) registered. Verified from a clean `.next`.

## 10. Demo instructions
1. Open `/` → **Load demo dataset** (or `npx tsx src/db/seed.ts`).
2. Dashboard: KPIs and the banner "RTO rate is N× baseline in the last 7 days" — verified at **1.85×** (last 7 days 21.1% vs 11.4% baseline, z = 7.0) on the seeded dataset. The ratio is computed from the data and never hard-coded.
3. **Open finding** → evidence: pincode cluster 562xxx, COD share, courier, product/category, NDR reasons, value bands.
4. **View shipments** → open one → scan-by-scan timeline with repeated NDRs → RTO.
5. **Open investigation** → status + note.
6. **Simulate intervention** (default: route high-risk COD shipments through another courier) → Current vs Scenario vs Difference with the banner "SIMULATION — NOT A GUARANTEED OUTCOME".
7. **Printable report** / **Export .md**.
Try `/import` with "Download a synthetic sample CSV" to see mapping, rejected rows and the error report.

## 11. Environment variables
`DATABASE_URL` (required — `src/db/index.ts` throws if unset, and `drizzle.config.ts` reads the same variable so `drizzle-kit push` needs no separate config). Optional: `APP_ACCESS_KEY`, `MAX_UPLOAD_MB` (10), `MAX_IMPORT_ROWS` (500000), `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL`, `AI_BASE_URL`, `COOKIE_INSECURE=1` (allow non-HTTPS auth cookie in production behind plain HTTP).

Local setup used for verification: a dedicated `postgres:16-alpine` container (`rto-autopsy-db`, host port 5435, db `app_db`), with `.env` containing `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5435/app_db`. The previous checked-in `drizzle.config.json` hard-coded a placeholder connection; it was replaced by `drizzle.config.ts` (env-driven) so no connection string is baked into the repo. `.env` is git-ignored; see `.env` in the repo root for the exact local values.

## 12. Deployment instructions
`npm ci` → `npx drizzle-kit push` → (optional seed) → `npm run build` → `npm run start`. Health: `/api/health`. See `docs/DEPLOYMENT.md`.

## 13. Known limitations (none block release)
- **Vitest config ESM warning**: Vitest 5 prints a forward-compatibility warning ("ESM syntax in a file loaded as CommonJS") for `vitest.config.ts`/`vitest.e2e.config.ts` because `package.json` has no `"type": "module"`. Impact: none — tests load and pass; the warning concerns a future Vite default. Left as-is to avoid changing module semantics for a cosmetic notice.
- **Missing-record HTTP status**: `/shipments/<unknown-id>` renders the not-found UI with HTTP 200 because `loading.tsx` streams the response. Impact: SEO/status semantics only; users see a clear message.
- **E2E is HTTP-level**, not browser-driven (no headless browser in this environment). Client interactions are not exercised by a browser driver.
- **AI live calls untested**: OpenAI/Anthropic HTTP integrations are implemented against documented APIs and tested only via the mock provider, validation and failure fallbacks.
- **Auth is a single shared access key** (optional), not per-user accounts; no rate limiting (use a reverse proxy).
- **Import runs synchronously** in one request (batched, transactional); very large files (>200k rows) may need a longer proxy timeout or a queue worker.
- **Finding codes (INV-####) come from a global sequence**, so they do not restart at 1 per dataset (cosmetic).
- **Segment-level anomaly scans on small states** can flag low-volume segments; thresholds (n ≥ 30, ratio ≥ 1.5×, z ≥ 2.5) are documented and conservative but not tuned per business.
- **Pincode→state mapping** uses postal-prefix rules (approximate at boundaries); a provided `state` column takes precedence.
- Excel import and map visualisation are explicitly out of scope (P2).

## 14. Future improvements
Queue-based imports, per-user auth/roles, Excel ingestion, courier API/webhook ingestion, per-dataset finding numbering, configurable anomaly thresholds, browser-level E2E (Playwright), finer pincode geocoding, saved filter views, scheduled reports.

## 15. UI/UX — investigation workstation (2026-10-01)
Frontend-only pass on the existing app (schema, APIs, analytics, findings, simulation, reports and tests untouched). Full audit in `docs/UI_AUDIT.md`.

- **Navigation** (`Shell.tsx` + new `NavLinks.tsx`): regrouped to Overview / Investigate / Simulate / Report / Data / Settings; active route highlighted with `aria-current="page"`; collapsed to a horizontal scroll rail on mobile; content width raised to 1400px for denser analytics.
- **Dashboard**: the RTO condition now dominates the first viewport — 7-day rate, baseline, multiplier, z-score, sample size, severity and drill-down CTAs, all from the existing `overall` anomaly result (`/api/analytics/anomalies`) with no hardcoded values. Primary strip rebalanced to RTO rate, 7-day RTO, value at risk, NDR rate, data quality; added an "Active anomalies" table and root-cause candidate summary.
- **New `/anomalies`**: dedicated detection workstation listing every flagged segment (current, baseline range, multiplier, z, sample, severity) with links into filtered shipments. Verified live: Kestrel Couriers 4.51×, z=12.4, CRITICAL.
- **New `/products`**: RTO by product and category with the same metric contract as the other analysis pages.
- **Simulator** (`SimulatorForm.tsx`): explicit OBSERVED block → full-width "SIMULATION — NOT A GUARANTEED OUTCOME" divider → SIMULATED outcome block. Calculation API unchanged.
- **Shared UI** (`ui.tsx`): `SeverityBadge` used consistently across dashboard/anomalies/findings; `DataTable` gained zebra rows, a header background and optional `dense` density (backward compatible).
- **Verified after the pass**: `npm test` 85/85 · `npm run test:e2e` 11/11 · `tsc --noEmit` clean · `eslint .` clean · `npm run build` PASS (36 routes). HTTP spot-checks of all screens returned 200 and the expected on-screen text.
