import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const organizations = pgTable("organizations", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: createdAt(),
});

export const users = pgTable("users", {
  id: id(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  email: text("email").notNull().unique(),
  name: text("name"),
  role: text("role").notNull().default("OWNER"), // OWNER | ANALYST | VIEWER
  createdAt: createdAt(),
});

export const costSettings = pgTable("cost_settings", {
  orgId: uuid("org_id").primaryKey().references(() => organizations.id, { onDelete: "cascade" }),
  forwardCost: doublePrecision("forward_cost").notNull().default(70),
  reverseCost: doublePrecision("reverse_cost").notNull().default(70),
  handlingCost: doublePrecision("handling_cost").notNull().default(25),
  cogsRatio: doublePrecision("cogs_ratio").notNull().default(0.4),
  writeoffRate: doublePrecision("writeoff_rate").notNull().default(0.05),
  marginRate: doublePrecision("margin_rate").notNull().default(0.3),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const datasets = pgTable(
  "datasets",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    source: text("source").notNull().default("csv"), // csv | demo
    isDemo: boolean("is_demo").notNull().default(false),
    shipmentCount: integer("shipment_count").notNull().default(0),
    rejectedCount: integer("rejected_count").notNull().default(0),
    qualityScore: integer("quality_score"),
    qualityReport: jsonb("quality_report"),
    asOf: timestamp("as_of", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("datasets_org_idx").on(t.orgId, t.createdAt)],
);

export const importJobs = pgTable(
  "import_jobs",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    datasetId: uuid("dataset_id").references(() => datasets.id, { onDelete: "set null" }),
    kind: text("kind").notNull().default("SHIPMENTS"), // SHIPMENTS | EVENTS
    status: text("status").notNull().default("UPLOADED"), // UPLOADED | VALIDATED | COMMITTED | FAILED
    fileName: text("file_name").notNull(),
    fileSize: integer("file_size").notNull(),
    fileHash: text("file_hash").notNull(),
    datasetName: text("dataset_name"),
    headers: jsonb("headers").$type<string[]>().notNull().default([]),
    sampleRows: jsonb("sample_rows").$type<Record<string, string>[]>().notNull().default([]),
    mapping: jsonb("mapping").$type<Record<string, string | null>>(),
    suggestedMapping: jsonb("suggested_mapping").$type<Record<string, string | null>>(),
    rowCount: integer("row_count").notNull().default(0),
    report: jsonb("report"),
    rawContent: text("raw_content"),
    error: text("error"),
    createdAt: createdAt(),
    committedAt: timestamp("committed_at", { withTimezone: true }),
  },
  (t) => [index("import_jobs_org_idx").on(t.orgId, t.createdAt)],
);

export const importErrors = pgTable(
  "import_errors",
  {
    id: serial("id").primaryKey(),
    importJobId: uuid("import_job_id").notNull().references(() => importJobs.id, { onDelete: "cascade" }),
    rowNumber: integer("row_number").notNull(),
    severity: text("severity").notNull(), // ERROR (rejected) | WARNING (accepted)
    code: text("code").notNull(),
    field: text("field"),
    message: text("message").notNull(),
    raw: jsonb("raw"),
  },
  (t) => [index("import_errors_job_idx").on(t.importJobId, t.severity, t.code)],
);

export const customers = pgTable(
  "customers",
  {
    id: id(),
    datasetId: uuid("dataset_id").notNull().references(() => datasets.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull(),
    orderCount: integer("order_count").notNull().default(0),
  },
  (t) => [uniqueIndex("customers_ds_ext_uq").on(t.datasetId, t.externalId)],
);

export const products = pgTable(
  "products",
  {
    id: id(),
    datasetId: uuid("dataset_id").notNull().references(() => datasets.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    category: text("category"),
  },
  (t) => [uniqueIndex("products_ds_name_uq").on(t.datasetId, t.name)],
);

export const couriers = pgTable(
  "couriers",
  {
    id: id(),
    datasetId: uuid("dataset_id").notNull().references(() => datasets.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    aliases: jsonb("aliases").$type<string[]>().notNull().default([]),
  },
  (t) => [uniqueIndex("couriers_ds_name_uq").on(t.datasetId, t.name)],
);

export const pincodes = pgTable("pincodes", {
  pincode: text("pincode").primaryKey(),
  state: text("state"),
  city: text("city"),
  region: text("region"),
  pin3: text("pin3"),
});

export const shipments = pgTable(
  "shipments",
  {
    id: id(),
    datasetId: uuid("dataset_id").notNull().references(() => datasets.id, { onDelete: "cascade" }),
    importJobId: uuid("import_job_id").references(() => importJobs.id, { onDelete: "set null" }),
    sourceRow: integer("source_row"),
    shipmentId: text("shipment_id").notNull(),
    orderId: text("order_id"),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    courierId: uuid("courier_id").references(() => couriers.id, { onDelete: "set null" }),
    pincode: text("pincode"),
    orderValue: doublePrecision("order_value").notNull().default(0),
    paymentType: text("payment_type").notNull().default("UNKNOWN"), // COD | PREPAID | UNKNOWN
    orderDate: timestamp("order_date", { withTimezone: true }).notNull(),
    dispatchDate: timestamp("dispatch_date", { withTimezone: true }),
    expectedDeliveryDate: timestamp("expected_delivery_date", { withTimezone: true }),
    actualDeliveryDate: timestamp("actual_delivery_date", { withTimezone: true }),
    deliveryStatus: text("delivery_status"), // raw text as provided
    finalStatus: text("final_status").notNull().default("UNKNOWN"),
    attempts: integer("attempts").notNull().default(0),
    ndrCount: integer("ndr_count").notNull().default(0),
    rtoFlag: boolean("rto_flag").notNull().default(false),
    rtoReason: text("rto_reason"),
    ndrReasonCode: text("ndr_reason_code"),
    sourceDataset: text("source_dataset"),
    // --- read-model columns (denormalised for aggregation speed) ---
    courierName: text("courier_name"),
    productName: text("product_name"),
    category: text("category"),
    state: text("state"),
    city: text("city"),
    region: text("region"),
    pin3: text("pin3"),
    valueBand: text("value_band"),
    isRepeatCustomer: boolean("is_repeat_customer"),
    transitHours: real("transit_hours"),
    isEligible: boolean("is_eligible").notNull().default(false),
  },
  (t) => [
    uniqueIndex("shipments_ds_ship_uq").on(t.datasetId, t.shipmentId),
    index("shipments_ds_status_idx").on(t.datasetId, t.finalStatus),
    index("shipments_ds_order_date_idx").on(t.datasetId, t.orderDate),
    index("shipments_ds_courier_idx").on(t.datasetId, t.courierName),
    index("shipments_ds_pincode_idx").on(t.datasetId, t.pincode),
    index("shipments_ds_state_idx").on(t.datasetId, t.state),
    index("shipments_ds_payment_idx").on(t.datasetId, t.paymentType, t.finalStatus),
    index("shipments_ds_category_idx").on(t.datasetId, t.category),
  ],
);

export const shipmentEvents = pgTable(
  "shipment_events",
  {
    id: serial("event_pk").primaryKey(),
    eventId: text("event_id"),
    datasetId: uuid("dataset_id").notNull().references(() => datasets.id, { onDelete: "cascade" }),
    shipmentPk: uuid("shipment_pk").notNull().references(() => shipments.id, { onDelete: "cascade" }),
    ts: timestamp("ts", { withTimezone: true }).notNull(),
    eventType: text("event_type").notNull(),
    location: text("location"),
    status: text("status"),
    description: text("description"),
    metadata: jsonb("metadata"),
  },
  (t) => [index("events_ship_ts_idx").on(t.shipmentPk, t.ts), index("events_ds_idx").on(t.datasetId)],
);

export const ndrRecords = pgTable(
  "ndr_records",
  {
    id: serial("id").primaryKey(),
    datasetId: uuid("dataset_id").notNull().references(() => datasets.id, { onDelete: "cascade" }),
    shipmentPk: uuid("shipment_pk").notNull().references(() => shipments.id, { onDelete: "cascade" }),
    attemptNo: integer("attempt_no").notNull(),
    reasonRaw: text("reason_raw"),
    reasonCode: text("reason_code").notNull(),
    ts: timestamp("ts", { withTimezone: true }),
  },
  (t) => [index("ndr_ds_reason_idx").on(t.datasetId, t.reasonCode), index("ndr_ship_idx").on(t.shipmentPk)],
);

export const rtoRecords = pgTable(
  "rto_records",
  {
    id: serial("id").primaryKey(),
    datasetId: uuid("dataset_id").notNull().references(() => datasets.id, { onDelete: "cascade" }),
    shipmentPk: uuid("shipment_pk").notNull().references(() => shipments.id, { onDelete: "cascade" }),
    initiatedAt: timestamp("initiated_at", { withTimezone: true }),
    reasonRaw: text("reason_raw"),
    reasonCode: text("reason_code"),
    ndrCount: integer("ndr_count").notNull().default(0),
    estimatedCost: doublePrecision("estimated_cost"),
  },
  (t) => [index("rto_ds_idx").on(t.datasetId), uniqueIndex("rto_ship_uq").on(t.shipmentPk)],
);

export const findings = pgTable(
  "findings",
  {
    id: id(),
    seq: serial("seq"),
    datasetId: uuid("dataset_id").notNull().references(() => datasets.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // CONCENTRATION | ANOMALY
    dedupeKey: text("dedupe_key").notNull(),
    title: text("title").notNull(),
    severity: text("severity").notNull().default("MEDIUM"),
    score: doublePrecision("score").notNull().default(0),
    affectedValue: doublePrecision("affected_value").notNull().default(0),
    affectedShipments: integer("affected_shipments").notNull().default(0),
    evidence: jsonb("evidence").notNull(),
    filters: jsonb("filters").notNull(),
    suggestion: text("suggestion"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("findings_dedupe_uq").on(t.datasetId, t.dedupeKey)],
);

export const investigations = pgTable(
  "investigations",
  {
    id: id(),
    datasetId: uuid("dataset_id").notNull().references(() => datasets.id, { onDelete: "cascade" }),
    findingId: uuid("finding_id").notNull().references(() => findings.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("OPEN"), // OPEN | INVESTIGATING | RESOLVED | DISMISSED
    owner: text("owner"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("investigations_finding_uq").on(t.findingId)],
);

export const investigationNotes = pgTable(
  "investigation_notes",
  {
    id: serial("id").primaryKey(),
    investigationId: uuid("investigation_id").notNull().references(() => investigations.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    author: text("author"),
    createdAt: createdAt(),
  },
  (t) => [index("inv_notes_idx").on(t.investigationId)],
);

export const simulations = pgTable(
  "simulations",
  {
    id: id(),
    datasetId: uuid("dataset_id").notNull().references(() => datasets.id, { onDelete: "cascade" }),
    findingId: uuid("finding_id").references(() => findings.id, { onDelete: "set null" }),
    scenario: text("scenario").notNull(),
    params: jsonb("params").notNull(),
    target: jsonb("target").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("simulations_ds_idx").on(t.datasetId, t.findingId)],
);

export const simulationResults = pgTable("simulation_results", {
  id: id(),
  simulationId: uuid("simulation_id").notNull().references(() => simulations.id, { onDelete: "cascade" }),
  result: jsonb("result").notNull(),
  createdAt: createdAt(),
});

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: serial("id").primaryKey(),
    orgId: uuid("org_id"),
    actor: text("actor").notNull().default("system"),
    action: text("action").notNull(),
    entity: text("entity"),
    entityId: text("entity_id"),
    detail: jsonb("detail"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_created_idx").on(t.createdAt)],
);
