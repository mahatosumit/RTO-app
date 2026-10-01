# RTO Autopsy

*Don't just count returned orders. Find out why they failed.*

Operational-intelligence layer for D2C/e-commerce RTO, NDR and delivery-failure analysis. Deterministic analytics, transparent root-cause scoring, anomaly detection, intervention simulation and exportable investigations. AI is optional.

```bash
npm ci
npx drizzle-kit push            # create schema
npx tsx src/db/seed.ts          # optional: load the labelled DEMO dataset (~6,000 synthetic shipments)
npm run build && npm run start
npx vitest run                  # unit + integration (needs DATABASE_URL)
E2E_BASE_URL=http://localhost:3000 npx vitest run --config vitest.e2e.config.ts
```
Docs live in `/docs` (PRD, TRD, TAD, schema, analytics spec, AI spec, security, deployment, test plan, demo scenario). See `FINAL_IMPLEMENTATION_REPORT.md` for status.
