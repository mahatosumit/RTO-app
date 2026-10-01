# Technical Requirements Document

| Area | Decision |
|---|---|
| Frontend | Next.js 16 App Router, React 19, Tailwind CSS 4. Server Components for data pages; small client components for filters, import wizard, dialogs, simulator form. |
| Backend | Next.js Route Handlers (`src/app/api/**`) + plain TypeScript domain modules in `src/lib`. No microservices. |
| Database | PostgreSQL. |
| ORM / query layer | Drizzle ORM for schema and CRUD; parameterised `sql` templates for aggregation (whitelisted dimensions only). |
| Validation | `zod` for API input; hand-written row validators for CSV rows (returning structured errors). |
| Charting | Hand-written SVG/CSS charts (`src/components/charts.tsx`): bar lists, weekly trend with baseline band. No charting dependency — fewer moving parts, fully accessible. |
| File parsing | `papaparse` (CSV only). Size cap `MAX_UPLOAD_MB` (default 10), extension + content sniffing, BOM strip, formula-injection neutralisation on export. |
| Authentication | Optional shared access key (`APP_ACCESS_KEY`). When set, `src/proxy.ts` requires a signed cookie for all pages and APIs except `/login`, `/api/auth`, `/api/health`. When unset the app runs open (local/demo). |
| Authorization | Single default organisation; every query is scoped by `dataset_id` belonging to the org. Schema has `organizations`/`users` for future multi-tenant use. |
| AI abstraction | `src/lib/ai/` — `AIProvider` interface, OpenAI-compatible (also covers local Ollama/vLLM via base URL), Anthropic, mock, and none. Always optional; outputs validated against whitelists and never used for metrics. |
| API design | JSON REST; zod-validated; errors `{error:{code,message}}`; no stack traces. |
| Background processing | Import runs synchronously in batched inserts (1,000 rows/batch) inside a request; raw upload is held on `import_jobs.raw_content` until commit. Documented upgrade path: move commit to a queue worker. |
| Logging | Structured JSON logs via `src/lib/log.ts`; audit trail in `audit_logs`. |
| Observability | `/api/health` (DB check), import job status/timings, log lines with durations for analytics queries. |
| Testing | Vitest: unit (pure modules), integration (real Postgres), HTTP-level E2E against a running production server. |
| Deployment | Single Node container + Postgres. `npx drizzle-kit push` for schema. See DEPLOYMENT.md. |

## Performance design
Denormalised read-model columns on `shipments` (courier_name, product_name, category, state, region, pin3, outcome, value_band) avoid joins for aggregation. Composite indexes on `(dataset_id, outcome)`, `(dataset_id, courier_id)`, `(dataset_id, pincode)`, `(dataset_id, order_date)`, `(dataset_id, payment_type, outcome)`; unique `(dataset_id, shipment_id)`; events indexed `(shipment_pk, ts)`. Explorer uses keyset-friendly ordering + limit/offset with a capped page size.
