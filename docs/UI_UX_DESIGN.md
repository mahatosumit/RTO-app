# UI / UX Design

## Direction
Restrained light analytical UI: warm neutral canvas (`#f6f5f2`), near-black ink, hairline borders, a single rust accent (`#b4442a`) for failure/RTO emphasis, a calm blue (`#1f4e8c`) for interaction, green/amber/red only as status colours. Tabular numerals, monospace for IDs. Left rail navigation, dense tables, headline-first sections. No gradients, no decorative charts, no animations beyond focus rings.

## Principles
1. Every visualisation is preceded by a *finding-style headline* computed from data ("3 pincode clusters hold 38% of RTOs").
2. Correlation language only: "associated with", "investigation candidate".
3. Simulations always carry the banner **SIMULATION — NOT A GUARANTEED OUTCOME**.
4. Demo data always carries a **DEMO DATASET** banner.
5. Every async region has loading / empty / error / success states.

## Screens
| # | Screen | Route | Key content |
|---|---|---|---|
| 1 | Landing | `/` | Purpose, import CTA, one-click demo, dataset status |
| 2 | Dashboard | `/dashboard` | KPIs (shipments, RTO rate, NDR rate, RTO value, recoverable), anomaly banner, weekly trend w/ baseline, top candidates, data quality |
| 3 | Data Import | `/import` | 4-step wizard: upload → mapping → validation → commit |
| 4 | Dataset Validation | `/validation` | Quality score, warnings, rejected rows, downloadable error CSV, import provenance |
| 5 | Shipment Explorer | `/shipments` | Filterable paginated table, CSV-safe search |
| 6 | Shipment Detail | `/shipments/[id]` | Facts, lifecycle timeline, attempts, NDR events |
| 7 | RTO Analysis | `/rto` | Dimension tabs (courier, pincode, product, category, value, attempts, NDR reason, region, payment, customer) + trend |
| 8 | NDR Analysis | `/ndr` | Reason mix, NDR→outcome conversion, by courier/attempt |
| 9 | Root Cause | `/root-cause` | Ranked candidates with score breakdown and "why surfaced" |
| 10 | Geography | `/geo` | State/region table + bar heat, pincode cluster and pincode tables |
| 11 | Couriers | `/couriers` | Context-filtered comparison, courier × region matrix |
| 12 | Simulator | `/simulator` | Scenario form, visible assumptions, current vs scenario vs difference |
| 13 | Findings | `/findings`, `/findings/[id]` | Generated findings, evidence, investigation status, notes, simulation, report |
| 14 | Reports | `/reports` | Investigation reports, dataset summary, exports |
| 15 | Settings | `/settings` | Cost assumptions, datasets, AI status, demo |

## Component inventory
Button/LinkButton, Input, Select, Badge, Alert, Tabs (link-based), DataTable, FilterBar (client), KpiBlock, EmptyState, Spinner/loading, ErrorState, ConfirmDialog (native `<dialog>`), Drawer, Timeline, BarList, TrendChart, SimulationBanner, DemoBanner.

## Accessibility
Semantic landmarks (`nav`, `main`), labelled inputs, `aria-current` on nav, `role=status/alert` for messages, visible focus rings, charts expose text equivalents (values printed alongside bars), colour never the sole signal.
