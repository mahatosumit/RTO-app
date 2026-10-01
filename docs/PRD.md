# RTO AUTOPSY — Product Requirements Document

> "Don't just count returned orders. Find out why they failed."

## 1. Vision
An operational-intelligence and forensic layer for Indian D2C / e-commerce operators. It ingests shipment exports, reconstructs each shipment's lifecycle, classifies RTO / NDR outcomes deterministically, ranks *investigation candidates* with transparent scoring, and lets operators simulate policy changes using **observed historical data** only. It does not replace a courier or shipping platform.

## 2. Problem statement
Operators know their RTO count but not *why* orders fail, *where*, *which pattern matters most*, or *what to change first*. Data lives in courier-portal CSV exports with inconsistent columns. Existing tools show counts, not evidence.

## 3. Target users / personas
| Persona | Description | Needs |
|---|---|---|
| Asha — Ops Manager | Runs fulfilment for a 20k orders/month D2C brand. Non-technical. | Know what to investigate first; talk to courier account managers with evidence. |
| Rohan — Founder | Sees RTO eating margin. | One-page summary of value at risk and what a policy change could recover. |
| Meera — Analyst/CX lead | Owns NDR follow-up. | NDR reason patterns, address/phone problems, repeat failures. |

## 4. Jobs-to-be-done
1. When my RTO rate rises, tell me where and since when.
2. When I talk to a courier, give me segment-level evidence (pincode × payment × week).
3. Before changing COD policy, estimate what it would do, with visible assumptions.
4. Hand a written investigation report to my team.

## 5. User journeys
**Primary**: Import CSV → review column mapping → validate (quality score, rejected rows) → commit → Dashboard → anomaly banner → finding → segment drill → shipment timeline → open investigation → simulate intervention → export report.
**Demo**: Landing → "Load demo dataset" → Dashboard → same loop.

## 6. Functional requirements
- FR1 CSV import: upload, inspect columns, suggested mapping (explicit, editable), validate, normalize, import valid rows, report rejected rows, provenance (import job, file name, hash, row numbers).
- FR2 Data-quality engine with score and inspectable errors (downloadable CSV).
- FR3 Deterministic shipment classification: DELIVERED, IN_TRANSIT, NDR, RTO, CANCELLED, LOST, UNKNOWN; lifecycle timeline preserved.
- FR4 Metrics A–O (see ANALYTICS_SPEC): RTO rate (overall / COD / prepaid), by courier, pincode, product, category, value band, time, attempts, NDR reason, region, customer segment; cost; recoverable value.
- FR5 Root-cause engine: transparent ranked investigation candidates with "why surfaced".
- FR6 Anomaly detection: rolling baseline + binomial z-test + minimum sample.
- FR7 Intervention simulator: 5 scenarios, visible assumptions, labelled estimates.
- FR8 Courier analysis (context-filtered, no "best courier" claim) and pincode/geography analysis.
- FR9 Shipment explorer (server-side pagination/filter) and shipment forensic timeline.
- FR10 Findings → investigations (OPEN / INVESTIGATING / RESOLVED / DISMISSED) with notes.
- FR11 Reports: Markdown / HTML-print / JSON export of an investigation.
- FR12 Optional AI provider abstraction with deterministic fallbacks.
- FR13 Demo mode (one click, clearly labelled) and seed script.
- FR14 Settings: cost assumptions, dataset management, AI status.

## 7. Non-functional requirements
- Handles ≥100k shipments: server-side aggregation, pagination, indexes, batched inserts.
- No secrets in browser; safe errors; audit log on mutations; file limits (10 MB default, `.csv` only).
- Accessible: semantic HTML, labels, focus states, keyboard navigation.
- Works with no AI key.

## 8. Success metrics
- Import of a 6k-row CSV commits in < 15 s.
- Dashboard renders in < 1.5 s on the 6k demo dataset.
- Every displayed metric is reproducible from a formula in ANALYTICS_SPEC.
- User can go aggregate → segment → shipment in ≤ 3 clicks.
- Report export produces a document containing evidence, affected value, contributing factors, simulation, recommended actions.

## 9. MVP scope
Everything in §6. Single-tenant organisation with optional shared access key.

## 10. Excluded scope
Courier API integrations, live tracking, real-time webhooks, maps, multi-user RBAC UI, Excel parsing (export to CSV), ML models, automated actions on orders, causal inference.

## 11. Edge cases
Zero shipments; all delivered; all RTO; missing pincode; duplicate shipment IDs; invalid dates; unknown courier; repeated NDRs; shipments with no events; huge order values; negative/invalid values; empty CSV; BOM, quoted commas, CSV formula injection.

## 12. Assumptions
- Naive timestamps are IST (Asia/Kolkata).
- Cost model defaults (forward ₹70, reverse ₹70, handling ₹25, write-off 5% of COGS at 40% COGS ratio) are editable in Settings.
- "Recent window" = last 7 days ending at the dataset's latest order date.

## 13. Acceptance criteria
See FEATURE_TICKETS.md; each P0 ticket has explicit criteria, and the E2E suite covers the full loop.
