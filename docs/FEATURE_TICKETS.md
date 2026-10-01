# Feature Tickets

Status legend: Implementation = DONE / NOT PLANNED; Test = PASS (unit + integration + HTTP E2E, see FINAL_IMPLEMENTATION_REPORT.md). P1-001 (AI) is tested with the mock provider and validation/fallback paths; live OpenAI/Anthropic network calls were not exercised in this environment.

| ID | Title | Problem | Acceptance Criteria | Dependencies | Implementation | Test |
|---|---|---|---|---|---|---|
| P0-001 | Schema & migrations | Need normalised store | `drizzle-kit push` works on clean DB; all 20 tables; indexes | — | DONE | PASS |
| P0-002 | CSV upload & inspection | Raw exports vary | Upload ≤ limit, `.csv` only, headers + samples shown | P0-001 | DONE | PASS |
| P0-003 | Column mapping | Different column names | Suggested mapping is editable and required-field checked | P0-002 | DONE | PASS |
| P0-004 | Validation & quality score | Bad data must be visible | Missing, invalid date, duplicate, impossible transitions, negative values detected; score shown; errors downloadable | P0-003 | DONE | PASS |
| P0-005 | Normalise & commit import | Import valid rows | Valid rows inserted in batches, provenance stored, rejected rows persisted | P0-004 | DONE | PASS |
| P0-006 | Classification engine | Deterministic outcomes | 7 statuses; repeated NDR → RTO lifecycle preserved | P0-001 | DONE | PASS |
| P0-007 | Core metrics A–O | Need trustworthy numbers | Formulas match ANALYTICS_SPEC; zero-safe | P0-005 | DONE | PASS |
| P0-008 | Dashboard | Overview | KPIs, anomaly banner, trend, top candidates from DB | P0-007 | DONE | PASS |
| P0-009 | Shipment explorer & detail | Forensics | Server pagination, filters, timeline with attempts | P0-005 | DONE | PASS |
| P0-010 | RTO / NDR analysis | Where failing | Dimension tabs with headline statements | P0-007 | DONE | PASS |
| P0-011 | Root-cause engine | What to investigate | Ranked candidates, score breakdown, "why surfaced" | P0-007 | DONE | PASS |
| P0-012 | Anomaly detection | Detect spikes | Baseline range + current + z-score, min sample | P0-007 | DONE | PASS |
| P0-013 | Courier & geo analysis | Context performance | Filters; no "best courier"; pincode table | P0-007 | DONE | PASS |
| P0-014 | Findings & investigations | Workflow | Generate, open investigation, statuses, notes | P0-011 | DONE | PASS |
| P0-015 | Intervention simulator | What-if | 5 scenarios, assumptions visible, labelled estimate | P0-007 | DONE | PASS |
| P0-016 | Reports | Share findings | MD/HTML/JSON export with evidence + simulation | P0-014, P0-015 | DONE | PASS |
| P0-017 | Demo mode & seed | Judge flow | One click; 6k shipments; banner | P0-005 | DONE | PASS |
| P0-018 | Security & errors | Safe by default | Limits, zod, sanitised exports, safe errors, audit | all | DONE | PASS |
| P0-019 | Tests | Confidence | Unit, integration, E2E pass | all | DONE | PASS |
| P1-001 | AI provider abstraction | Optional assist | Providers + fallbacks; never fake AI | — | DONE | PASS |
| P1-002 | Optional access-key gate | Basic auth | Cookie gate when `APP_ACCESS_KEY` set | — | DONE | PASS |
| P1-003 | Events CSV import | Timelines from courier event exports | Events attached to existing shipments | P0-005 | DONE | PASS |
| P1-004 | Settings (cost model, datasets) | Adjust assumptions | Persisted; metrics reflect | P0-007 | DONE | PASS |
| P2-001 | Excel import | Users have xlsx | Out of scope this release | — | NOT PLANNED | N/A |
| P2-002 | Map visualisation | Geo UX | Out of scope; table/heat bars used | — | NOT PLANNED | N/A |
