# Security Audit: Client Storage / CORS / accept_token / Service-Role Surface
**Date:** 2026-04-27  
**Agent:** Themis (QA)  
**Scope:** localStorage/sessionStorage, /accept token entropy + enumeration, CORS headers on all CF Functions, service-role functions without role gating

---

## Summary

| # | Area | Severity | Status |
|---|------|----------|--------|
| 1 | SQL injection into ArcGIS GIS API via unescaped street name | **MEDIUM** | FIXED (a6bd5fa) |
| 2 | localStorage stores customer PII | LOW | Open |
| 3 | /api/setup/register-webhooks unauthenticated | LOW | Open |
| 4 | quickbooks/sync: no owner/admin role gate (stub) | LOW | Open |
| 5 | accept_token entropy | — | CLEAN |
| 6 | accept_token enumeration | — | FIXED (Phase 6.6) |
| 7 | CORS wildcard | — | ACCEPTABLE |
| 8 | Admin endpoints role gating | — | CLEAN |
| 9 | accept-automate service-role gate | — | CLEAN |
| 10 | GHL webhook verification | — | CLEAN |

---

## Finding 1 — SQL injection into Miami-Dade and Palm Beach ArcGIS APIs (MEDIUM)

**Files:** `functions/api/_folio.ts:93`, `functions/api/_folio.ts:174`  
**Endpoint:** `POST /api/folio-lookup` (unauthenticated, IP rate-limited 30/hr)

### What's happening

`lookupMiamiDade` and `lookupPalmBeach` build SQL WHERE clauses by string-interpolating the parsed street name directly:

```typescript
// Miami-Dade (_folio.ts:93)
const conditions = [`HSE_NUM=${hseNum}`, `ST_NAME LIKE '${stName}%'`];

// Palm Beach (_folio.ts:174)
const conditions = [`STREET_NUMBER='${hseNum}'`, `STREET_NAME='${stName}'`];
```

`parseStreetAddress` does `toUpperCase()` and whitespace-splits but does not strip or escape single quotes. An address containing a quote (e.g. `15216 SW 169TH' OR 1=1--`) produces:

```sql
ST_NAME LIKE '' OR 1=1--%'
```

This WHERE clause is sent to the public Miami-Dade GIS / PBCGov ArcGIS REST services.

### Impact

- **Data exposed:** Public property records only (both GIS APIs are public read-only). No internal DB is touched.
- **Functional impact:** Injected WHERE returns unexpected features → wrong folio/owner data written to FOLIO_CACHE KV for up to 30 days (TTL). Subsequent legitimate lookups for real addresses return the poisoned cached value.
- **Third-party abuse:** Well-crafted query can scan large swaths of the county GIS database, abusing Miami-Dade / PBCGov rate limits.
- **Attack surface:** `/api/folio-lookup` is public (no JWT required). IP rate limit is 30 req/hr — trivially bypassed with rotating IPs or from CF workers.

### Fix

Escape single quotes in `stName` before interpolating:

```typescript
function escapeArcGIS(s: string): string {
  return s.replace(/'/g, "''");
}

// Miami-Dade
const conditions = [`HSE_NUM=${hseNum}`, `ST_NAME LIKE '${escapeArcGIS(stName)}%'`];
if (preDir) conditions.push(`PRE_DIR='${escapeArcGIS(preDir)}'`);
if (stType) conditions.push(`ST_TYPE='${escapeArcGIS(stType)}'`);

// Palm Beach
const conditions = [`STREET_NUMBER='${hseNum}'`, `STREET_NAME='${escapeArcGIS(stName)}'`];
if (preDir) conditions.push(`PRE_DIR='${escapeArcGIS(preDir)}'`);
```

Note: `hseNum` is `parseInt(parts[0], 10)` — already a number, safe. `preDir` is validated against the `DIRECTIONALS` set (no quotes possible). `stType` is validated against `STREET_TYPES` dict (no quotes possible). Only `stName` is the actual injection vector, but escaping all three is good practice.

---

## Finding 2 — localStorage stores customer PII (LOW)

**File:** `src/lib/contexts/QuoteBuilderContext.tsx:204`

`QuoteBuilderState` (which includes `newCustomer: NewCustomer`) is autosaved to localStorage under `quoteBuilder:draft:{userId}` every 500ms after the user fills in the form. `NewCustomer` contains: `name`, `email`, `phone`, `billing_address_line1`, `billing_city`, `billing_state`, `billing_zip`.

**Why it's low:** Scoped to the user's own UUID (not a shared key). No auth tokens, passwords, or financial account info stored. Data is cleared on draft clear/submission.

**Residual risks:** Physical device access, XSS extraction, shared device (no auto-expiry).

**Recommendation:** Add an expiry timestamp and clear drafts older than 24 hours on load. Consider whether billing address should be excluded from the draft payload.

---

## Finding 3 — /api/setup/register-webhooks unauthenticated (LOW)

**File:** `functions/api/setup/register-webhooks.ts`

The endpoint has no auth check. It returns:
- The full webhook URL structure including the secret placement pattern
- Whether `GHL_WEBHOOK_SECRET` is configured (boolean)
- GHL location ID

No secrets are directly leaked (the actual value of `GHL_WEBHOOK_SECRET` is not returned). But this is an unauthenticated endpoint on a production deploy that reveals infrastructure configuration.

**Recommendation:** Gate behind `_guard` (JWT required). This endpoint is only ever called by admins during setup — no reason for it to be public.

---

## Finding 4 — quickbooks/sync no role check (LOW)

**File:** `functions/api/quickbooks/sync.ts`

Requires a valid JWT (`_guard` passes) but does not check that the caller is `admin` or `owner`. Any authenticated user (including `sales` role) can POST `{ sync_type: "invoices" }` and insert a row in `qb_sync_log`.

**Current risk:** Low — this is a stub (TODO Phase 22). The only effect is a `qb_sync_log` insert with status `pending` and `records_synced: 0`. No QB API calls are made, no money moves.

**Recommendation:** Add the same role gate as `admin/solar-usage.ts` before Phase 22 real sync is implemented — otherwise the role requirement is easy to forget once real QB calls are added.

---

## Clean Items (no action needed)

### accept_token entropy
Generated via `crypto.randomUUID()` in `functions/api/email/send-quote-link.ts`. UUID v4 from Web Crypto API = 122 bits of randomness. Brute-force at 10 req/min (accept-automate rate limit) would take ~10^28 years. PASS.

### accept_token enumeration (Fixed Phase 6.6)
Migration `20260425_phase66_quotes_accept_token_fix.sql` replaced the open `anon_read_by_accept_token` RLS policy with a `SECURITY DEFINER` function `get_quote_by_accept_token(p_token uuid)`. Anon role has zero direct access to the `quotes` table. Single-row exact-UUID match — no enumeration possible. PASS.

### CORS wildcard on all CF Functions
Every CF Function returns `Access-Control-Allow-Origin: *`. Since all auth is via Bearer tokens in `Authorization` headers (not cookies), CORS `*` does NOT enable CSRF — browser CORS policy only blocks credentialed cross-origin requests. This is the correct and standard pattern for JWT-based APIs. PASS.

### Admin endpoints role gate
`admin/purge-user.ts` and `admin/solar-usage.ts` both use `_guard` (JWT validated) followed by an explicit role check (`["admin", "owner"].includes(role)`). `invite-user.ts` does the same. PASS.

### accept-automate service-role gate
No JWT required (customer-facing flow). Instead: UUID v4 accept_token verified via `eq("accept_token", token)` Supabase lookup (returns 404 on miss). Body size capped at 2 MB. IP rate-limited 10 req/min via KV. KV idempotency key prevents replay. PASS.

### GHL webhook verification
Three accepted auth modes in priority order: HMAC-SHA256 signature (`x-wh-signature`), constant-time static secret (`x-wh-secret`), constant-time query param (`?secret=`). Fails 401 if none match. Returns 500 if `GHL_WEBHOOK_SECRET` is not configured (no bypass possible). PASS.

---

## Recommended Action Priority

1. **Today (before next deploy):** Fix `_folio.ts` SQL injection — one-line `escapeArcGIS` helper + 5 call sites. Low effort, removes an ongoing data-poisoning risk.
2. **Next sprint:** Add `_guard` + role check to `quickbooks/sync.ts` before Phase 22 real QB sync lands.
3. **Next sprint:** Add `_guard` to `setup/register-webhooks.ts`.
4. **Backlog:** Add draft expiry (24h) to `QuoteBuilderContext.tsx` localStorage autosave.
