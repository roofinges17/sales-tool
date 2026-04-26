# Pre-Monday Backend Audit
**Generated:** 2026-04-25 (Hephaestus, task_1777183998827_199)  
**Scope:** CF Pages Functions, Supabase schema, RLS policies, KV/storage, external integrations  
**Verdict:** **GO-WITH-CAVEATS** (2 pre-Monday fixes recommended, 0 blockers)

---

## Summary

| Category | ✅ Healthy | ⚠️ Minor | ❌ Risk |
|----------|-----------|---------|--------|
| Auth / guard coverage | 9 | 3 | 0 |
| Rate limiting | 5 | 2 | 0 |
| Migration drift | 8 | 0 | 0 |
| RLS policies | all tightened | 0 | 0 |
| CF Pages env / KV | 2 KV bound | 1 unverified | 0 |
| Storage buckets | 1 confirmed | 0 | 0 |
| Cost controls | 3 | 0 | 0 |
| External integrations | 4 | 1 | 0 |
| Smoke infra | ready (on hold) | 0 | 0 |
| Healthcheck drift | 8 correct | 0 | **6 wrong** |

---

## Category 1 — Auth & Guard Coverage

### ✅ Healthy

| Endpoint | Auth | Live status |
|----------|------|------------|
| `/api/address-intel` | `guard()` | 401 anon ✓ |
| `/api/solar` | `guard()` | 401 anon ✓ |
| `/api/vision/damage-detect` | `guard()` 20 req/min | 401 anon ✓ |
| `/api/vision/material-detect` | `guard()` 20 req/min | 401 anon ✓ |
| `/api/vision/perimeter-detect` | `guard()` | 401 anon ✓ |
| `/api/invite-user` | `guard()` + admin/owner | 401 anon ✓ |
| `/api/admin/purge-user` | `guard()` + admin/owner | 401 anon ✓ |
| `/api/ghl-proxy` | `guard()` | 401 anon ✓ |
| `/api/quickbooks/sync` | `guard()` | 401 anon ✓ |

Phase 6.5 additions all confirmed live: address-intel, solar, perimeter-detect, invite-user, admin/purge-user.

### ⚠️ Minor — Manual JWT (not guard())

Three endpoints implement their own Bearer token validation instead of `guard()`:
- `functions/api/visualize/roof.ts` — manual `getUserId()`
- `functions/api/email/send-quote-link.ts` — manual Bearer parse
- `functions/api/email/send-quote-pdf.ts` — manual Bearer parse

**Risk:** Logic is equivalent to `guard()` today. Future changes to JWT behavior in `_guard.ts` won't auto-propagate to these three. Recommend migrating to `guard()` in a post-Monday cleanup phase.

### ❌ Healthcheck Drift (fix before Monday)

6 probes in `scripts/healthcheck.sh` still expect HTTP 400. Phase 6.5 changed these endpoints to return 401. The healthcheck will fail on any post-6.5 deploy:

| Probe | Endpoint | HC expects | Reality |
|-------|----------|-----------|---------|
| P15 | `/api/ghl-proxy` | 500 | **401** |
| P16 | `/api/quickbooks/sync` | 400 | **401** |
| P21 | `/api/address-intel` | 400 | **401** |
| P24 | `/api/vision/perimeter-detect` | 400 | **401** |
| P26 | `/api/invite-user` | 400 | **401** |
| P27 | `/api/admin/purge-user` | 400 | **401** |

**Fix:** Change expected code from `400` → `401` for each probe above in `scripts/healthcheck.sh`.

---

## Category 2 — Rate Limiting

### ✅ Healthy

| Endpoint | Limit | Mechanism |
|----------|-------|-----------|
| `/api/vision/damage-detect` | 20 req/min | `guard()` KV |
| `/api/vision/material-detect` | 20 req/min | `guard()` KV |
| `/api/vision/perimeter-detect` | 20 req/min | `guard()` KV |
| `/api/voice/transcribe-estimate` | 20 req/min + 25 MB cap | `guard()` KV |
| `/api/folio-lookup` | 30 req/hr per IP | KV `FOLIO_CACHE` (Sunday deploy) |

### ⚠️ Minor — No per-user rate limit (auth-gated only)

- **`/api/address-intel`**: `rateLimit: 0` (`functions/api/address-intel.ts:353`). A valid JWT can call Google Solar + Miami-Dade ArcGIS + FEMA without throttle. Auth-only protection.
- **`/api/solar`**: `rateLimit: 0` (`functions/api/solar.ts:80`). Same concern — Google Solar API call per request, no per-user limit.

**Risk:** A compromised seller JWT can exhaust Google Solar/GIS quota. Low operational risk (these are read-only external calls with no write path), but worth adding `rateLimit: 60` in a post-Monday pass.

---

## Category 3 — Migration Drift

All 8 columns verified against live Supabase REST API. **Zero drift.**

| Migration | Column | Status |
|-----------|--------|--------|
| phase17 | `quotes.folio_number` | 200 ✓ |
| phase19 | `company_settings.legal_name` | 200 ✓ |
| phase18 | `project_photos.photo_url` | 200 ✓ |
| phase31 | `rbac_block_log.action` | 200 ✓ |
| phase30 | `accounts.ghl_contact_id` | 200 ✓ |
| phase_accept | `quotes.accept_token` | 200 ✓ |
| phase_visualize | `visualizer_render_log.status` | 200 ✓ |
| phase_qb | `qb_sync_log.status` | 200 ✓ |

No committed migration is undeployed. No live column is missing from schema.

---

## Category 4 — RLS Policies

### ✅ All USING(true) policies eliminated

Three migration phases progressively removed all permissive catch-all policies:

| Phase | Tables affected | Change |
|-------|----------------|--------|
| 6 (`phase6_rls_tighten.sql`) | sales, contacts, properties, quote_notes, sale_payments | USING(true) → role-scoped _v2 policies |
| 6.7 (`phase67_rls_authenticated_scope.sql`) | commission_entries, commission_plans, sale_line_items, + more | Role-scoped |
| 6.7b (`phase67b_rls_group3_reference_tables.sql`) | lead_sources, product_categories, workflow_logs | Role-scoped |
| 3.1 (`phase31_rbac.sql`) | accounts, quotes | Dropped `accounts_select`/`quotes_select` USING(true) that bypassed tiered policies |

**No USING(true) permissive overrides remain.** 4-tier RLS (owner > admin > manager > seller) is active for all key tables.

---

## Category 5 — CF Pages Environment / KV Namespaces

### ✅ KV Namespaces bound

Both KV namespaces confirmed in `wrangler.toml` and CF Pages dashboard:

| Binding | ID |
|---------|-----|
| `FOLIO_CACHE` | `3bc545a3f04c4623a4499cdeb2c972ba` |
| `SOLAR_CACHE` | `a738737b292240eb8943d86aa7bd7465` |

### ⚠️ SUPABASE_URL — Hardcoded Fallback (Phase 7.1)

`functions/api/visualize/roof.ts:78`:
```typescript
const supabaseUrl = env.SUPABASE_URL ?? "https://hlmmwtehabwywajuhghi.supabase.co";
```

If `SUPABASE_URL` is not explicitly bound in CF Pages dashboard, the function silently uses the hardcoded URL. Smoke tests pass (auth guard works) but a Supabase org migration would silently route to the old project.

**Fix (Phase 7.1, task_1777142040004_336):**
1. Verify CF Pages dashboard has `SUPABASE_URL` explicitly bound (not just `NEXT_PUBLIC_SUPABASE_URL`)
2. Replace fallback with explicit 500:
```typescript
const supabaseUrl = env.SUPABASE_URL;
if (!supabaseUrl) return Response.json({ error: "Server misconfigured" }, { status: 500, headers: CORS });
```

---

## Category 6 — Storage Buckets

### ✅ `project-photos` bucket confirmed

- **Source:** `20260424_phase18_project_photos.sql`
- File size limit: 10 MB
- Allowed MIME types: `image/jpeg`, `image/png`, `image/webp`, `image/heic`, `image/gif`
- Storage RLS: authenticated-only read/write; uploader or owner/admin delete
- Private bucket (not public)

---

## Category 7 — Cost Controls

### ✅ Gemini (visualize/roof)

- Per-user daily cap: 20 renders/day via `visualizer_render_log` table
- Cost: ~$0.04/call, max ~$0.80/user/day
- Auth-gated (no anon access). Smoke test is auth-guard-only (no Gemini calls in cron)
- No GEMINI_API_KEY mock fallback in visualize/roof.ts — returns 500 if key missing (intentional fail-loud)

### ✅ OpenAI Vision (damage-detect, material-detect, perimeter-detect)

- 20 req/min rate limit + 8 MB body cap on all three
- Mock fallback present in each: if `OPENAI_API_KEY` is missing, returns 503 (no real API call)

### ✅ OpenAI Whisper (voice/transcribe-estimate)

- 20 req/min + 25 MB body cap
- Mock fallback present: returns 503 if key missing

---

## Category 8 — External Integrations

### ✅ GHL (GoHighLevel)

- `/api/ghl-proxy`: auth-gated via `guard()` — 401 anon ✓
- `/api/ghl/webhook`: HMAC-SHA256 on `x-wh-signature`. All requests without valid HMAC → 401

### ⚠️ GHL Webhook — Static Header Fallback

The GHL webhook also accepts `x-wh-secret` static header as a fallback credential. This is simpler to leak than HMAC. Confirm `GHL_WEBHOOK_SECRET` is set in CF Pages env and that the static fallback is intentional. If not intentional, remove the fallback path in `functions/api/ghl/webhook.ts`.

### ✅ QuickBooks OAuth

- `/api/quickbooks/connect`: public (302 redirect to Intuit OAuth) — correct
- `/api/quickbooks/callback`: CSRF state token in KV — no JWT required (OAuth flow)
- `/api/quickbooks/sync`: `guard()` auth-gated — 401 anon ✓

### ✅ Resend Email

- `/api/email/send-quote-link`: manual JWT auth — 401 anon ✓
- `/api/email/send-quote-pdf`: manual JWT auth — 401 anon ✓

### ✅ Supabase Storage

- Bucket `project-photos` confirmed with authenticated-only access policy

---

## Category 9 — Smoke Test Infrastructure (Monday Hold)

5 files staged in working tree, hold for Hermes commit Monday 2026-04-27:

| File | Status | Purpose |
|------|--------|---------|
| `scripts/smoke-test.sh` | Ready | CF Functions auth-guard tests (401 checks) |
| `scripts/supabase-smoke.sh` | Ready | 5 Supabase table health checks |
| `.github/workflows/smoke-functions.yml` | Ready | GH Actions every 30min + push to main |
| `.github/workflows/smoke-supabase.yml` | Ready | GH Actions every 5min + push to main |
| `docs/smoke-test-runbook.md` | Ready | Alert format, watchdog cron, test pool, manual procedure |

**Pre-commit prerequisite** (verify before Monday commit):
```bash
WATCHDOG_ENV="/Users/alejandroperez/Sage/orgs/roofingexperts/agents/watchdog/.env"
grep -q "SUPABASE_URL=" "$WATCHDOG_ENV" && grep -q "SUPABASE_SERVICE_ROLE_KEY=" "$WATCHDOG_ENV" \
  && echo "OK" || echo "MISSING"
```

---

## Category 10 — Open Issues Ranked by Priority

| Priority | Issue | Fix | Owner |
|----------|-------|-----|-------|
| **P0 (before Monday)** | healthcheck.sh: P15,P16,P21,P24,P26,P27 expect 400, reality 401 | Update 6 probe expected codes | Hermes/Hephaestus |
| **P1 (Monday with smoke commit)** | SUPABASE_URL hardcoded fallback in visualize/roof.ts:78 | Verify CF Pages env, remove fallback | Hephaestus (task_1777142040004_336) |
| **P2 (post-Monday)** | address-intel + solar: rateLimit:0 (no per-user KV rate limit) | Add rateLimit:60 or similar | Hephaestus |
| **P3 (post-Monday)** | 3 endpoints using manual JWT instead of guard() | Migrate visualize/roof, send-quote-link, send-quote-pdf to guard() | Hephaestus |
| **P4 (review)** | GHL webhook static header fallback (x-wh-secret) | Confirm intentional or remove | res/Alejandro |

---

## Cost Burn Projection

| Endpoint | Unit cost | Daily max | Monthly max |
|----------|-----------|-----------|-------------|
| `/api/visualize/roof` (Gemini) | ~$0.04/call | $0.80/user (20 cap) | ~$24/user |
| `/api/vision/*` (OpenAI GPT-4o) | ~$0.002-0.005/call | Rate-limited | Low |
| `/api/voice/transcribe-estimate` (Whisper) | ~$0.006/min audio | Rate-limited | Low |

**Under current auth + rate limiting:** No pathway for anon cost burn. A seller with a valid JWT is the maximum threat surface. The 20/day Gemini cap keeps cost bounded at ~$0.80/user/day. Well under any reasonable $25/day budget cap with fewer than 30 active sellers.

---

## Net Verdict

**GO-WITH-CAVEATS**

- **Blocker count:** 0
- **Pre-Monday fix required:** Update healthcheck.sh 6 drifted probes (10-minute task)
- **Monday commit:** Smoke test infra (5 files) — requires watchdog .env prereq check first
- **Post-Monday:** Phase 7.1 SUPABASE_URL fallback, rate limit additions, manual JWT consolidation
- **Schema:** Zero migration drift. All 8 spot-checked columns confirmed in live DB.
- **Auth:** All 19 endpoints audited. Phase 6.5 additions confirmed live. RLS fully tightened.
