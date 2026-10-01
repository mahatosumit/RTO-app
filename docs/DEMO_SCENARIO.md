# Demo Scenario

The demo dataset (`is_demo = true`, banner shown everywhere) contains ~6,000 synthetic shipments over ~120 days with deliberately embedded, discoverable patterns and imperfect records (missing pincodes, blank/variant courier names, a few invalid values).

## Embedded patterns
1. **Pincode cluster A** (Bengaluru outskirts, `560xxx/562xxx`): COD RTO ≈ 35–40% vs ≈ 10% baseline, mostly "customer unavailable / refused".
2. **RoadRunner Logistics** in the North region: RTO ≈ 24% vs ≈ 9% elsewhere.
3. **Apparel** category: elevated RTO with high-value COD orders.
4. **Recent 7-day anomaly**: Kestrel Couriers RTO spikes vs its 8–11% weekly baseline; overall RTO rate rises vs baseline.
5. Imperfect data: ~2% missing pincode, blank/odd courier names, a few duplicate ids and bad dates in the CSV fixture.

## Judge walkthrough (≈3 min)
1. `/` → **Load demo dataset** → Dashboard: shipments, RTO rate, NDR rate, RTO value, recoverable value.
2. Anomaly banner: "RTO rate is N× baseline in the last 7 days".
3. Click top finding → evidence: pincode, courier, COD share, product, value pattern.
4. **View shipments** → open one → timeline with repeated NDRs → RTO.
5. **Open investigation** → add note → status INVESTIGATING.
6. **Simulate** → "Route high-risk COD shipments through Courier X".
7. Current vs simulated RTO and estimated value impact with the SIMULATION banner.
8. **Export report** (Markdown / print HTML).

CSV import demo: `/import` → "Download sample CSV" (messy headers like `AWB`, `Payment Mode`) → mapping → validation with rejected rows → commit.
