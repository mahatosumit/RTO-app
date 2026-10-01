/**
 * HTTP-level end-to-end test against a running production server (E2E_BASE_URL, default http://localhost:3100).
 * IMPORT → VALIDATE → DASHBOARD → RTO ANALYSIS → DRILL-DOWN → SHIPMENT DETAIL → FINDING → SIMULATION → REPORT.
 */
import { afterAll, describe, expect, it } from "vitest";
import { buildEventsCsv, buildFixture } from "../fixtures";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3100";
const fx = buildFixture("E2");
let cookie = "";
let datasetId = "";
let jobId = "";
let shipmentPk = "";
let findingId = "";

const api = async (path: string, init: RequestInit = {}) => fetch(`${BASE}${path}`, { ...init, headers: { ...(init.headers ?? {}), cookie } });
const json = async (path: string, init: RequestInit = {}) => {
  const res = await api(path, init);
  return { res, body: await res.json().catch(() => ({})) };
};
const post = (path: string, body: unknown) => json(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const upload = async (content: string, name: string, fields: Record<string, string> = {}) => {
  const fd = new FormData();
  fd.set("file", new Blob([content], { type: "text/csv" }), name);
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return json("/api/imports", { method: "POST", body: fd });
};

afterAll(async () => {
  if (datasetId) await api(`/api/datasets/${datasetId}`, { method: "DELETE" });
});

describe("E2E: primary user journey", () => {
  it("server is healthy and the entry page renders", async () => {
    expect((await api("/api/health")).status).toBe(200);
    const home = await api("/");
    expect(home.status).toBe(200);
    expect(await home.text()).toContain("Find out why they failed");
  });

  it("rejects bad uploads with safe messages (no stack traces)", async () => {
    const empty = await upload("", "empty.csv");
    expect(empty.res.status).toBe(400);
    expect(empty.body.error.code).toBe("EMPTY_FILE");
    const wrongType = await upload("a,b\n1,2\n", "x.txt");
    expect(wrongType.body.error.code).toBe("INVALID_FILE_TYPE");
    expect(JSON.stringify(wrongType.body)).not.toMatch(/at .*\.(ts|js):\d+/);
    const noFile = await json("/api/imports", { method: "POST", body: new FormData() });
    expect(noFile.res.status).toBe(400);
  });

  it("uploads, maps, validates and commits a CSV with bad rows", async () => {
    const up = await upload(fx.csv, "e2e_fixture.csv", { datasetName: "E2E fixture" });
    expect(up.res.status).toBe(200);
    jobId = up.body.job.id;
    expect(up.body.job.suggestedMapping.shipment_id).toBe("AWB");

    const val = await post(`/api/imports/${jobId}`, { action: "validate", mapping: up.body.job.suggestedMapping });
    expect(val.res.status).toBe(200);
    expect(val.body.report.rejectedCount).toBe(fx.rejected);
    expect(val.body.report.quality.score).toBeLessThan(100);

    const errs = await api(`/api/imports/${jobId}/errors?format=csv`);
    expect(errs.headers.get("content-type")).toContain("text/csv");
    expect(await errs.text()).toContain("DUPLICATE_SHIPMENT_ID");

    const commit = await post(`/api/imports/${jobId}`, { action: "commit" });
    expect(commit.res.status).toBe(200);
    expect(commit.body.result.imported).toBe(fx.accepted);
    datasetId = commit.body.result.datasetId;
    cookie = (commit.res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
    expect(cookie).toContain("rto_ds=");
  });

  it("attaches scan events to the dataset", async () => {
    const csv = buildEventsCsv("E200001", "E200031");
    const up = await upload(csv, "e2e_events.csv", { kind: "EVENTS", targetDatasetId: datasetId });
    expect(up.res.status).toBe(200);
    const val = await post(`/api/imports/${up.body.job.id}`, { action: "validate", mapping: up.body.job.suggestedMapping });
    expect(val.body.report.rejectedCount).toBe(3);
    const commit = await post(`/api/imports/${up.body.job.id}`, { action: "commit" });
    expect(commit.body.result.imported).toBe(9);
  });

  it("dashboard shows real numbers from the database", async () => {
    const page = await api("/dashboard");
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("RTO rate");
    expect(html).toContain("Total shipments");
    expect(html).toContain(String(fx.accepted));
    const sum = await json("/api/analytics/summary");
    expect(sum.body.totals.rto).toBe(fx.rto);
    expect(sum.body.metrics.rtoRate).toBeCloseTo(fx.rto / fx.eligible, 6);
  });

  it("RTO analysis and drill-down work", async () => {
    const seg = await json("/api/analytics/segments?dim=pincode");
    const top = seg.body.rows[0];
    expect(top.key).toBe("560067");
    expect(top.rto).toBe(30);
    const page = await api("/rto?dim=pincode");
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("560067");
    const list = await json("/api/shipments?pincode=560067&status=RTO&pageSize=5");
    expect(list.body.total).toBe(30);
    shipmentPk = list.body.rows[0].id;
    const bad = await json("/api/analytics/segments?dim=__proto__;drop");
    expect(bad.res.status).toBe(400);
    for (const p of ["/shipments?status=RTO", "/ndr", "/root-cause", "/geo", "/couriers", "/validation", "/settings", "/import", "/reports", "/simulator", "/findings"]) {
      const r = await api(p);
      expect(r.status, p).toBe(200);
    }
  });

  it("shipment detail renders the forensic timeline", async () => {
    const r = await api(`/shipments/${shipmentPk}`);
    expect(r.status).toBe(200);
    expect(await r.text()).toContain("Lifecycle timeline");
    const d = await json(`/api/shipments/${shipmentPk}`);
    expect(d.body.shipment.finalStatus).toBe("RTO");
    const missing = await api("/shipments/00000000-0000-4000-8000-000000000000"); // streamed not-found UI (status is 200 because loading.tsx streams)
    expect(await missing.text()).toContain("does not exist");
  });

  it("generates findings, opens an investigation and records notes", async () => {
    const gen = await post("/api/findings", {});
    expect(gen.res.status).toBe(200);
    expect(gen.body.total).toBeGreaterThan(0);
    const list = await json("/api/findings");
    const f = list.body.findings.find((x: { title: string }) => x.title.includes("560"));
    expect(f).toBeTruthy();
    findingId = f.id;
    const page = await api(`/findings/${findingId}`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("Evidence");
    expect((await post(`/api/findings/${findingId}`, { action: "status", status: "BOGUS" })).res.status).toBe(400);
    expect((await post(`/api/findings/${findingId}`, { action: "investigate" })).res.status).toBe(200);
    expect((await post(`/api/findings/${findingId}`, { action: "status", status: "INVESTIGATING" })).res.status).toBe(200);
    expect((await post(`/api/findings/${findingId}`, { action: "note", body: "Escalated to courier." })).res.status).toBe(200);
    const after = await json(`/api/findings/${findingId}`);
    expect(after.body.finding.status).toBe("INVESTIGATING");
    expect(after.body.finding.notes).toHaveLength(1);
    const ai = await post(`/api/findings/${findingId}`, { action: "summarize" });
    expect(ai.res.status).toBe(200); // works (deterministic fallback message) with no AI configured
  });

  it("simulates an intervention with visible assumptions and saves it", async () => {
    const sim = await post("/api/simulate", { scenario: "CHANGE_COURIER", params: {}, target: { filters: { pincode: ["560067"], payment: ["COD"] }, altCourier: "Beta" }, findingId, save: true });
    expect(sim.res.status).toBe(200);
    expect(sim.body.result.disclaimer).toContain("NOT A GUARANTEED OUTCOME");
    expect(sim.body.result.simulated.rtoRate).toBeLessThan(sim.body.result.current.rtoRate);
    expect(sim.body.result.assumptions.length).toBeGreaterThan(0);
    expect(sim.body.simulationId).toBeTruthy();
    expect((await post("/api/simulate", { scenario: "NOPE" })).res.status).toBe(400);
    expect((await post("/api/simulate", { scenario: "CHANGE_COURIER", params: {}, target: { filters: {} } })).res.status).toBe(400);
    const page = await api(`/simulator?finding=${findingId}&pincode=560067`);
    expect(page.status).toBe(200);
  });

  it("exports the investigation report in md, html and json", async () => {
    const md = await api(`/api/reports/${findingId}?format=md`);
    expect(md.headers.get("content-disposition")).toContain(".md");
    const text = await md.text();
    expect(text).toContain("SIMULATION — NOT A GUARANTEED OUTCOME");
    expect(text).toContain("Escalated to courier.");
    expect(text).toContain("Recommended investigation actions");
    const html = await api(`/api/reports/${findingId}?format=html`);
    expect(html.headers.get("content-type")).toContain("text/html");
    const j = await json(`/api/reports/${findingId}?format=json`);
    expect(j.body.simulation.scenario).toBe("CHANGE_COURIER");
    const ds = await api("/api/reports/dataset?format=md");
    expect(await ds.text()).toContain("Headline numbers");
    expect((await api("/api/reports/not-a-uuid?format=md")).status).toBe(400);
  });

  it("settings update changes cost figures and validates input", async () => {
    const bad = await json("/api/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ forwardCost: -5 }) });
    expect(bad.res.status).toBe(400);
    const cur = (await json("/api/settings")).body.cost;
    const upd = await json("/api/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...cur, forwardCost: cur.forwardCost + 10 }) });
    expect(upd.res.status).toBe(200);
    await json("/api/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(cur) });
  });
});
