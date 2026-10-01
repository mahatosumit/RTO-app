# Backend Schema (PostgreSQL / Drizzle) — source of truth: `src/db/schema.ts`

## Entities
| Table | Purpose | Notes |
|---|---|---|
| organizations | Tenant root | single default org today |
| users | Future auth identities | role: OWNER/ANALYST/VIEWER |
| datasets | A named, imported body of shipments | `is_demo`, `source`, counts, quality score, `as_of` |
| import_jobs | One upload → validate → commit lifecycle | file name, sha256, kind (SHIPMENTS/EVENTS), mapping jsonb, report jsonb, status, raw_content (cleared on commit) |
| import_errors | Rejected/warned rows | row_number, severity, code, field, message, raw jsonb |
| customers | Customer dimension | external id, order_count |
| products | Product dimension | name, category |
| couriers | Normalised courier names | name, raw aliases |
| pincodes | Pincode dimension | state, city, region, pin3 |
| shipments | Fact table (read-model columns denormalised) | see below |
| shipment_events | Timeline | (shipment_pk, ts, event_type, location, status, description, metadata) |
| ndr_records | One row per NDR attempt failure | attempt_no, reason_raw, reason_code, ts |
| rto_records | One row per RTO shipment | initiated_at, reason_raw, reason_code, ndr_count, cost estimate |
| findings | Deterministic findings (concentration / anomaly) | code `INV-####`, evidence jsonb, filters jsonb, score |
| investigations | Workflow on a finding | status OPEN/INVESTIGATING/RESOLVED/DISMISSED, owner |
| investigation_notes | Notes | |
| simulations | Saved scenario + assumptions | |
| simulation_results | Result snapshot | current/scenario/diff jsonb |
| cost_settings | Per-org cost assumptions | |
| audit_logs | Mutations | actor, action, entity, detail jsonb |

## shipments
`id (uuid pk)`, `dataset_id`, `import_job_id`, `source_row`, `shipment_id`, `order_id`, `customer_id`, `product_id`, `courier_id`, `pincode`, `order_value`, `payment_type` (COD/PREPAID/UNKNOWN), `order_date`, `dispatch_date`, `expected_delivery_date`, `actual_delivery_date`, `delivery_status` (raw), `final_status` (canonical: DELIVERED, IN_TRANSIT, NDR, RTO, CANCELLED, LOST, UNKNOWN), `attempts`, `ndr_count`, `rto_flag`, `rto_reason`, `ndr_reason_code`, `source_dataset` (file name),
read-model: `courier_name`, `product_name`, `category`, `state`, `city`, `region`, `pin3`, `value_band`, `is_repeat_customer`, `transit_hours`, `is_eligible`.

## Indexes
unique(dataset_id, shipment_id); (dataset_id, final_status); (dataset_id, order_date); (dataset_id, courier_name); (dataset_id, pincode); (dataset_id, state); (dataset_id, payment_type); (dataset_id, category); events (shipment_pk, ts); ndr_records (dataset_id, reason_code).

## Scale
Facts are append-only per dataset; deletes cascade by `dataset_id`. 1M rows ≈ 400 MB with indexes. Aggregations are `GROUP BY` on indexed columns scoped by dataset.
