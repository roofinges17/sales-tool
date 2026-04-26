# API Auth Matrix — CF Pages Functions

**Generated:** 2026-04-25  
**Total endpoints:** 19 files → 21 routes (some files export multiple methods)  
**Auth framework:** `functions/api/_guard.ts` (JWT via Supabase `/auth/v1/user`)  
**Phase 6.5:** Added `guard()` to address-intel, solar, perimeter-detect, invite-user, admin/purge-user — previously these returned 400 on anon; they now return 401.

---

## Full Inventory

> **Auth column key:**  
> `guard()` — uses shared `_guard.ts` wrapper (JWT + optional rate limit + body cap)  
> `manual JWT` — own `getUserId()` / Bearer parse, same Supabase `/auth/v1/user` call  
> `token` — validates opaque token from request body against DB column  
> `HMAC` — validates `x-wh-signature` HMAC-SHA256 against webhook secret  
> `none` — fully public, zero auth check  

| # | Endpoint | Methods | Auth | Required role | Rate limit | Body cap | Anon | Seller | Admin | Upstream API | Notes |
|---|----------|---------|------|--------------|-----------|---------|------|--------|-------|-------------|-------|
| 1 | `/api/address-intel` | POST, OPTIONS | `guard()` | any authenticated | none (rateLimit:0) | none | **401** | 200 | 200 | Google Solar, Miami-Dade ArcGIS, FEMA | Phase 6.5 added auth. Healthcheck probe 21 expects 400 — **DRIFT** |
| 2 | `/api/solar` | GET, OPTIONS | `guard()` | any authenticated | none (rateLimit:0) | none | **401** | 200 | 200 | Google Solar API | Phase 6.5 added auth. Not probed by healthcheck — **GAP** |
| 3 | `/api/visualize/roof` | POST, OPTIONS | `manual JWT` | any authenticated | per-user daily cap (20/day via DB log) | none | **401** | 200 | 200 | Gemini 2.5 Flash Image | ⚠️ PAID — ~$0.04/call. Daily cap enforced in `visualizer_render_log`. Only paid endpoint. |
| 4 | `/api/vision/damage-detect` | POST, OPTIONS | `guard()` | any authenticated | 20 req/min | 8 MB | **401** | 200 | 200 | OpenAI Vision (GPT-4o) | Paid API. Rate limited. |
| 5 | `/api/vision/material-detect` | POST, OPTIONS | `guard()` | any authenticated | 20 req/min | 8 MB | **401** | 200 | 200 | OpenAI Vision | Paid API. Rate limited. |
| 6 | `/api/vision/perimeter-detect` | POST, OPTIONS | `guard()` | any authenticated | none (rateLimit:0) | none | **401** | 200 | 200 | OpenAI Vision | Phase 6.5 added auth. Healthcheck probe 24 expects 400 — **DRIFT** |
| 7 | `/api/voice/transcribe-estimate` | POST, OPTIONS | `guard()` | any authenticated | 20 req/min | 25 MB | **401** | 200 | 200 | OpenAI Whisper | Paid API. 25 MB audio cap. Not probed by healthcheck — **GAP** |
| 8 | `/api/email/send-quote-link` | POST, OPTIONS | `manual JWT` | any authenticated | none | none | **401** | 200 | 200 | Resend | Manual auth (not guard()). Healthcheck probe 18 correct ✓ |
| 9 | `/api/email/send-quote-pdf` | POST, OPTIONS | `manual JWT` | any authenticated | none | none | **401** | 200 | 200 | Resend | Manual auth (not guard()). Healthcheck probe 19 correct ✓ |
| 10 | `/api/ghl-proxy` | POST, GET, OPTIONS | `guard()` | any authenticated | none (rateLimit:0) | none | **401** | 200 | 200 | GHL (GoHighLevel) | Healthcheck probe 15 expects 500 — **DRIFT** (guard returns 401, not 500) |
| 11 | `/api/ghl/webhook` | POST | `HMAC` | n/a (external system) | none | none | **401** | 401 | 401 | GHL → internal | HMAC-SHA256 on `x-wh-signature`. Not user auth. All requests without valid HMAC = 401. Not probed by healthcheck — **GAP** |
| 12 | `/api/quickbooks/sync` | POST, OPTIONS | `guard()` | any authenticated | none (rateLimit:0) | none | **401** | 200 | 200 | QuickBooks API | Healthcheck probe 16 expects 400 "no auth guard!" — **DRIFT** (guard() was added, returns 401) |
| 13 | `/api/quickbooks/connect` | GET | `none` | n/a | none | none | 302 | 302 | 302 | QuickBooks OAuth | Redirects to QB OAuth. No auth required to initiate. Healthcheck probe 17 correct ✓ |
| 14 | `/api/quickbooks/callback` | GET | `none` (CSRF state token) | n/a | none | none | 200/400 | 200/400 | 200/400 | QuickBooks OAuth | CSRF state token in KV. No user JWT. Not probed by healthcheck — **GAP** |
| 15 | `/api/invite-user` | POST, OPTIONS | `guard()` + role check | **admin or owner** | none | none | **401** | **403** | 200 | Supabase Auth (invite) | Phase 6.5 added auth. Healthcheck probe 26 expects 400 — **DRIFT** |
| 16 | `/api/admin/purge-user` | POST, OPTIONS | `guard()` + role check | **admin or owner** | none | none | **401** | **403** | 200 | Supabase Auth (delete) | Phase 6.5 added auth. Healthcheck probe 27 expects 400 — **DRIFT** |
| 17 | `/api/admin/solar-usage` | GET, OPTIONS | `guard()` + role check | **admin or owner** | none | none | **401** | **403** | 200 | Supabase DB | Not probed by healthcheck — **GAP** |
| 18 | `/api/folio-lookup` | POST, OPTIONS | **`none`** | n/a | none | none | 200 | 200 | 200 | Miami-Dade / Broward ArcGIS | ⚠️ **FULLY PUBLIC — no auth, no rate limit.** See security note below. Healthcheck probe 14 expects 400 (empty body → 400 from validation, not auth). |
| 19 | `/api/accept-automate` | POST, OPTIONS | `token` | n/a (customer flow) | none | none | 400 | 400 | 400 | Supabase DB | Validates `accept_token` from body against `quotes.accept_token`. No JWT. Anon = 400 (no token). With valid token = 200. Healthcheck probe 20 correct ✓ |

---

## Healthcheck Cron vs Reality Drift

Cross-referenced against `scripts/healthcheck.sh`. Probes that are wrong after Phase 6.5:

| Probe | Endpoint | HC expects | Reality | Status |
|-------|----------|-----------|---------|--------|
| P14 | `/api/folio-lookup` | 400 | 400 (validation, not auth) | ✓ Correct |
| P15 | `/api/ghl-proxy` | 500 (KNOWN BUG) | **401** (guard added) | ❌ **DRIFT** |
| P16 | `/api/quickbooks/sync` | 400 (no auth guard!) | **401** (guard added) | ❌ **DRIFT** |
| P17 | `/api/quickbooks/connect` | 302 | 302 | ✓ Correct |
| P18 | `/api/email/send-quote-link` | 401 | 401 | ✓ Correct |
| P19 | `/api/email/send-quote-pdf` | 401 | 401 | ✓ Correct |
| P20 | `/api/accept-automate` | 400 | 400 (no token) | ✓ Correct |
| P21 | `/api/address-intel` | 400 (KNOWN BUG) | **401** (Phase 6.5) | ❌ **DRIFT** |
| P22 | `/api/vision/damage-detect` | 401 | 401 | ✓ Correct |
| P23 | `/api/vision/material-detect` | 401 | 401 | ✓ Correct |
| P24 | `/api/vision/perimeter-detect` | 400 (KNOWN BUG) | **401** (Phase 6.5) | ❌ **DRIFT** |
| P25 | `/api/visualize/roof` | 401 | 401 | ✓ Correct |
| P26 | `/api/invite-user` | 400 (KNOWN BUG) | **401** (Phase 6.5) | ❌ **DRIFT** |
| P27 | `/api/admin/purge-user` | 400 (KNOWN BUG) | **401** (Phase 6.5) | ❌ **DRIFT** |

**6 probes drifted.** Healthcheck currently FAILS on P15, P16, P21, P24, P26, P27 against a post-Phase-6.5 deploy. All should be updated from their current expected code to 401.

**Endpoints not probed by healthcheck (gaps):**

| Endpoint | Gap type |
|----------|---------|
| `/api/solar` | Not probed at all |
| `/api/ghl/webhook` | Not probed (external webhook, harder to fake HMAC) |
| `/api/quickbooks/callback` | Not probed (OAuth callback, needs state token) |
| `/api/admin/solar-usage` | Not probed |
| `/api/voice/transcribe-estimate` | Not probed |

---

## Security Notes

### ⚠️ `/api/folio-lookup` — Public + No Rate Limit

**Risk:** Fully public endpoint, no auth, no rate limit. Proxies queries to Miami-Dade and Broward County ArcGIS REST APIs. An attacker can enumerate property folios by bulk-querying this endpoint without any credentials.

**Impact:** GIS API quota exhaustion (soft risk); no PII exposure (folio number is public record); no write path.

**Recommendation:** Add `guard()` with rateLimit if this endpoint is not intentionally public, OR add KV-based IP rate limiting without requiring JWT (since it's used in the customer-facing accept flow). Confirm intent with Alejandro.

### ⚠️ `/api/visualize/roof` — Only Paid Endpoint

Per-user daily cap of 20 renders/day enforced via `visualizer_render_log` table. A seller with a valid JWT can burn up to 20 Gemini image calls/day (~$0.80/user/day). This is the only endpoint where a legitimate authenticated user can generate meaningful API cost. The smoke test asserts 401 for anon — correct.

### `/api/ghl/webhook` — HMAC with static secret fallback

Inspects `x-wh-signature` (HMAC-SHA256) or falls back to `x-wh-secret` header. If the HMAC webhook secret is not configured in CF Pages env, the HMAC path fails closed. The static header fallback is a simpler credential and easier to leak. Confirm `GHL_WEBHOOK_SECRET` is set and the static fallback is intentional.

### Auth pattern inconsistency

Three endpoints (`email/send-quote-link`, `email/send-quote-pdf`, `visualize/roof`) implement their own Bearer token validation instead of using `guard()`. The logic is equivalent but duplicated — future changes to JWT validation behavior in `_guard.ts` will not propagate to these three endpoints automatically.

---

## Phase 6.5 Auth Additions Summary

Endpoints that received `guard()` in Phase 6.5 (previously unauthenticated):

| Endpoint | Before 6.5 | After 6.5 |
|----------|-----------|----------|
| `/api/address-intel` | Public (no auth, no rate limit) | `guard()` — any JWT |
| `/api/solar` | Public (no auth, no rate limit) | `guard()` — any JWT |
| `/api/vision/perimeter-detect` | Public (no auth) | `guard()` — any JWT |
| `/api/invite-user` | Public (no auth) | `guard()` + admin/owner role check |
| `/api/admin/purge-user` | Public (no auth) | `guard()` + admin/owner role check |

Remaining public endpoints (intentional or needs review):

| Endpoint | Intentional? |
|----------|-------------|
| `/api/folio-lookup` | Needs confirmation — no auth, no rate limit |
| `/api/quickbooks/connect` | Yes — OAuth initiation flow |
| `/api/quickbooks/callback` | Yes — OAuth callback (CSRF-protected) |
| `/api/accept-automate` | Yes — customer-facing token flow |
| `/api/ghl/webhook` | Yes — external system webhook (HMAC-protected) |
