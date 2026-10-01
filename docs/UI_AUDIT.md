# UI Audit — RTO Autopsy

Date: 2026-10-01. Scope: frontend/UI only. Backend, schema, analytics, API contracts, findings, simulation and reports are preserved.

Legend — severity: **H** = blocks the "operational workstation" read; **M** = meaningful friction; **L** = polish.

| # | Route / component | Current problem | Severity | Proposed improvement |
|---|---|---|---|---|
| 1 | `components/Shell.tsx` | Nav groups (Overview / Analysis / Act / Data) don't express the DETECT → INVESTIGATE → SIMULATE → REPORT workflow; **no active-route state** (`aria-current`) so the user cannot tell where they are; no Anomalies or Products entry despite anomaly detection being a headline engine; on mobile the full grouped list renders as a tall block above content. | **H** | Regroup to Overview / Investigate / Simulate / Report / Data / Settings; add a client `NavLinks` with `usePathname` + `aria-current`; add Anomalies and Products; horizontal scroll rail on mobile. |
| 2 | `app/(app)/dashboard/page.tsx` | The primary RTO condition is a plain `Alert` plus five equal-weight KPI cards; the "current vs baseline vs multiplier" evidence is not dominant; segment anomalies are a peripheral table; no explicit 7-day RTO or value-at-risk KPI. | **H** | Dominant "RTO condition" block (7-day rate, baseline, multiplier, severity, z, sample) sourced from the existing `/api/analytics/anomalies` `overall` result; rebalanced primary KPI strip (RTO rate, 7-day RTO, value at risk, NDR rate, data quality); full "Active anomalies" table with drill links. |
| 3 | *(missing route)* `/anomalies` | Anomaly detection is a first-class deterministic engine but has no workstation screen — it is only partially surfaced on the dashboard. | **H** | New `/anomalies` page listing every flagged segment with current rate, baseline range, multiplier, z, sample size and severity, each linking straight into filtered shipments. Reuses `scanAnomalies`. |
| 4 | *(missing route)* `/products` | Product/category is a selectable dimension in RTO analysis but has no entry in the requested information architecture. | **M** | New `/products` page: RTO by product and by category with the same metric contract as the other analysis pages. Reuses `aggregateBy`. |
| 5 | `components/ui.tsx` `DataTable` | Flat row treatment (no zebra), transparent header, no density control; severity conveyed inconsistently across pages. | **M** | Zebra rows + header background; optional `dense` density; shared `SeverityBadge`. API stays backward compatible. |
| 6 | `components/SimulatorForm.tsx` | Observed and simulated values share one table; the brief's OBSERVED → SIMULATION → DISCLAIMER separation is implicit rather than explicit. | **M** | Explicit "Observed (from your data)" block, a full-width "SIMULATION — NOT A GUARANTEED OUTCOME" divider, then a "Simulated outcome" block. Calculations and API calls unchanged. |
| 7 | `app/(app)/shipments/[id]/page.tsx`, `components/Timeline.tsx` | Already strong (facts grid + chronological timeline with derived labelling). | **L** | Left as-is; only inherits the shared table/severity polish. |
| 8 | `app/(app)/root-cause/page.tsx`, `findings/[id]` | Wording already careful ("associated with", "surfaced", "candidate"); no causal claims. | **L** | Left as-is. |
| 9 | Loading / error / empty | Global `(app)/loading.tsx` + `(app)/error.tsx` cover all app routes; pages have empty states. | **L** | New pages include empty states; no change to the global behaviour. |
| 10 | Responsiveness | Desktop-first grid is fine at 1280–1920; mobile renders a tall nav block. | **M** | Mobile nav becomes a horizontal scroller; tables already scroll horizontally. |
| 11 | Accessibility | Active nav state absent; severity is communicated by badge text (good) and by printed values in heat cells (good), not by colour alone. | **M** | `aria-current="page"` on the active nav item; semantic `<section>`/`<dl>` in the new blocks. |

## Explicitly not changed

- Database schema, API contracts, analytics/anomaly/root-cause/simulation calculations, findings engine, report generation, seed/demo data, and all existing tests.
- No new runtime dependencies.
- No fabricated metrics: every figure on the redesigned screens comes from the existing server-side aggregations.
