# Analytics Specification

## Definitions
- **Resolved/eligible shipment**: `final_status ∈ {DELIVERED, RTO, LOST}`.
- **Dispatched shipment**: `final_status ∉ {CANCELLED, UNKNOWN}`.
- **Observed window**: orders in dataset; all time-based splits use `order_date` in Asia/Kolkata.
- **As-of date**: `max(order_date)` of dataset.

## Metrics
| ID | Metric | Formula | Population | Exclusions | Edge cases |
|---|---|---|---|---|---|
| A | Overall RTO rate | `RTO / eligible` | eligible | IN_TRANSIT, NDR (open), CANCELLED, UNKNOWN | eligible = 0 → `null`, shown "—" |
| B | COD RTO rate | `RTO_cod / eligible_cod` | payment = COD | same | null if 0 |
| C | Prepaid RTO rate | `RTO_prepaid / eligible_prepaid` | payment = PREPAID | same | UNKNOWN payment only in overall |
| D–M | RTO by {courier, pincode, product, category, order-value band, day/week/month of order, attempts, NDR reason, region/state, customer segment} | `RTO_seg / eligible_seg` | per segment | same | segments with < 30 eligible shown with "low sample" badge and excluded from ranking |
| — | NDR rate | `shipments with ndr_count ≥ 1 / dispatched` | dispatched | | |
| — | NDR recovery rate | `delivered with ndr_count ≥ 1 / shipments with ndr_count ≥ 1 that are resolved` | | | |
| — | Delivery rate | `DELIVERED / eligible` | | | |
| — | Avg attempts | `avg(attempts)` over resolved shipments with attempts > 0 | | | |
| — | Avg delivery time | `avg(actual_delivery − dispatch)` in hours over DELIVERED | | missing dates | null |
| N | Estimated RTO cost | `Σ_RTO (forward + reverse + handling + order_value × cogs_ratio × writeoff_rate)` | RTO shipments | | settings editable; defaults 70/70/25/0.40/0.05 |
| — | RTO value (GMV at risk) | `Σ order_value` over RTO | | | |
| O | Estimated recoverable value | `Σ order_value of RTO shipments whose ndr_reason_code ∈ ADDRESSABLE × NDR-recovery rate` where ADDRESSABLE = {CUSTOMER_UNAVAILABLE, PHONE_UNREACHABLE, ADDRESS_INCOMPLETE, RESCHEDULE_REQUESTED} and recovery rate is observed on addressable-reason shipments (delivered ÷ (delivered+RTO) among shipments with ≥1 addressable NDR, clamped to [0,1]) | | falls back to 0 when no NDR data | label: *estimate* |

Order value bands: `<500`, `500–999`, `1,000–1,999`, `2,000–3,999`, `4,000+` (INR).
Customer segment: `repeat` if customer has ≥ 2 shipments in the dataset, else `new`; `unknown` if no customer id.

## Classification (`src/lib/domain/classify.ts`)
Priority: (1) explicit `rto_flag`; (2) last terminal event; (3) raw status text normalisation (keyword rules); (4) `actual_delivery_date` ⇒ DELIVERED; (5) NDR events with no terminal event ⇒ NDR; (6) dispatch date present ⇒ IN_TRANSIT; else UNKNOWN. Contradictions (DELIVERED + RTO flag) are flagged as validation errors (impossible transition).

## Statistical confidence
Wilson 95% interval for segment RTO rate. A segment is *statistically distinguishable* if Wilson lower bound > baseline rate.

## Root-cause candidate score (0–100)
`score = 100 × (0.35·excess + 0.25·lift + 0.20·value + 0.10·sample + 0.10·recurrence)` where
- `excess = min(1, excessRtoShare / 0.15)`, `excessRtoShare = max(0, rto_seg − eligible_seg × baseline) / rto_total`
- `lift = min(1, (rate_seg/baseline − 1) / 2)` (clamped ≥ 0)
- `value = min(1, rtoValueShare / 0.20)`
- `sample = min(1, eligible_seg / 200)`
- `recurrence` = share of last 12 weeks (with ≥ 5 eligible) where segment rate > baseline.
Gates: eligible ≥ 30, RTO ≥ 5, lift ratio ≥ 1.25, Wilson lower bound > baseline. Every candidate lists volume share, lift, dominant payment type, sample size.
Dimensions scanned: pincode, pincode cluster (first 3 digits), state, courier, product, category, value band, payment, courier × state, courier × payment, payment × pincode cluster, payment × category.

## Anomaly detection
Weekly windows of 7 days ending at as-of (current = window 0; baseline = windows 1–8). `p0` = pooled baseline RTO rate; `z = (p_cur − p0)/√(p0(1−p0)/n_cur)`. Flag when `n_cur ≥ 30`, baseline n ≥ 100, `ratio = p_cur/p0 ≥ 1.5` and `z ≥ 2.5` (critical: ratio ≥ 2 and z ≥ 3.5). Output includes baseline range (min–max weekly rate), baseline pooled rate, current, ratio, z. Scanned: overall, each courier, payment type, state.

## Simulation (see `src/lib/analytics/simulate.ts`)
Every scenario: `after_rto = before_rto − avoided_rto`; costs recomputed with cost model; all assumptions and observed reference stats (with sample sizes) are returned. Scenarios:
1. **COD_REDUCTION** — `reduction%` of target COD orders not shipped as COD; `conversion%` of those pay prepaid and then follow *observed prepaid RTO rate* in target (fallback overall prepaid). Avoided RTOs = removed×rate_cod_target − converted×rate_prepaid_ref. Lost margin = delivered value lost × margin%.
2. **ADDRESS_VERIFICATION** — RTOs with addressable reasons × `fix rate`; cost = per-check cost × target shipments.
3. **CHANGE_COURIER** — target shipments moved to courier Y; new rate = Y's observed RTO rate in the same payment type and region (fallback: Y overall same payment type; warns on low sample).
4. **EXTRA_ATTEMPT** — marginal success at last observed attempt `s = delivered_k/(delivered_k+rto_k)` × `decay` (default 0.6, assumption) × addressable share of RTOs; cost per extra attempt.
5. **PREPAID_NUDGE** — COD orders ≥ value threshold in target; `conversion%` switch to prepaid (observed prepaid rate); incentive = discount% × converted value.
Result labelled "SIMULATION — NOT A GUARANTEED OUTCOME".
