# Technical Architecture Document

```
Browser ── RSC pages / client islands
   │
Next.js (single process)
   ├─ src/proxy.ts                 optional access-key gate
   ├─ src/app/**                   pages (server components) + /api route handlers
   └─ src/lib
       ├─ csv/        parse, column mapping, row validation, quality score, import pipeline
       ├─ domain/     classification, ndr reasons, courier normalisation, geo, dates, costs
       ├─ analytics/  filters → SQL, segment aggregation, metrics, anomaly, rootcause, simulate
       ├─ findings/   generation + persistence, report builder
       ├─ ai/         provider abstraction + fallbacks
       └─ demo/       deterministic synthetic data generator (demo mode only)
   │
PostgreSQL (Drizzle)
```

## Key flows
**Import**: `POST /api/imports` (multipart; size/type checks; parse headers; suggest mapping; store raw) → `POST /api/imports/:id` with `{action:"validate", mapping}` (dry run → report + quality score + error rows) → `POST /api/imports/:id` with `{action:"commit"}` (create dataset, batched insert shipments, ndr/rto records, events, refresh customer/repeat flags, audit log, purge raw).
**Analytics**: pure TypeScript functions (`metrics.ts`, `anomaly.ts`, `rootcause.ts`, `simulate.ts`) consume plain aggregate rows produced by one generic SQL function `aggregateBy(dimension, filters)`. Math is unit-testable without a DB.
**Findings**: `generateFindings(dataset)` runs root-cause + anomaly scans and upserts findings keyed by segment. `Investigation` is created explicitly by the user.
**Simulation**: `gatherSimulationInputs` (SQL via aggregateBy) → `simulate(scenario, inputs)` (pure) → optional persistence.

## Design rules
Whitelisted dimensions (never interpolated from input); denormalised read model; deterministic core; AI only for text/mapping assist and always validated.
