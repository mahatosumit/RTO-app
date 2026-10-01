# Security Specification

| Control | Implementation |
|---|---|
| Server-side validation | zod schemas on every API route; whitelisted enums/dimensions; UUID checks on ids |
| Upload limits | `MAX_UPLOAD_MB` (default 10), `.csv` extension and text/plain|text/csv|application/vnd.ms-excel MIME, binary sniffing (NUL bytes rejected), row cap `MAX_IMPORT_ROWS` (default 500,000) |
| Safe CSV parsing | papaparse in text mode; BOM stripped; no eval; cell length capped (2,000 chars); fields sanitised |
| CSV injection | Exports prefix cells starting with `= + - @ \t \r` with `'` |
| SQL injection | Drizzle parameterisation; dimension names mapped from a fixed whitelist; LIKE input escaped |
| XSS | React escaping; report HTML built with explicit escaping; no `dangerouslySetInnerHTML` with user data |
| Authn | Optional `APP_ACCESS_KEY` gate (`src/proxy.ts`): HMAC-signed, HttpOnly, SameSite=Lax cookie; constant-time compare |
| Authz | Dataset ids validated against the organisation; destructive actions require confirmation and are audited |
| Secrets | Read from `process.env` on the server only; AI keys never sent to the client; `/api/settings` reports only `configured: boolean` |
| Errors | Central `apiError()` returns safe messages; details only in server logs |
| Audit | `audit_logs` for import commit, dataset delete, findings generate, investigation create/status/note, simulation save, settings update, demo load |
| Privacy | Customer ids are stored as provided (recommend hashed ids); no phone/email columns are imported; AI receives aggregates only |
| Known limits | Single shared key rather than per-user accounts; no rate limiting (place behind a reverse proxy) |
