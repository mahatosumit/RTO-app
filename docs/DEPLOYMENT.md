# Deployment

## Requirements
Node 20+ (22 tested), PostgreSQL 14+.

## Environment variables
| Var | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string |
| `APP_ACCESS_KEY` | no | Enables access-key gate |
| `MAX_UPLOAD_MB` | no | Upload cap (default 10) |
| `MAX_IMPORT_ROWS` | no | Row cap (default 500000) |
| `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL`, `AI_BASE_URL` | no | Optional AI |

## Steps
```bash
npm ci
npx drizzle-kit push          # creates schema from src/db/schema.ts on a clean DB
npx tsx src/db/seed.ts        # optional: loads the labelled demo dataset (6,000 shipments)
npm run build
npm run start                 # or: next start -p $PORT
```
Health check: `GET /api/health`.

## Tests
```bash
npx vitest run                                              # unit + integration (needs DATABASE_URL)
E2E_BASE_URL=http://localhost:3100 npx vitest run --config vitest.e2e.config.ts
```

## Operations
Backups: standard `pg_dump`. Scaling: stateless app; scale vertically first; add read replica for analytics. Large imports (>200k rows): raise `MAX_UPLOAD_MB`, run behind a proxy with extended timeouts.
