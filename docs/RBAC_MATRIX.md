# RBAC Matrix — Sales Tool

**Generated:** 2026-04-25 (Themis QA audit — task_1777161573195_495)  
**Scope:** Every UI route + every `/api/*` CF Function endpoint  
**Role hierarchy:** `owner` > `admin` > `manager` (sales_manager) > `seller` > `anon`

---

## Auth Architecture

### UI Layer
All `(dashboard)/*` routes are wrapped by `DashboardShell` (`src/components/layout/DashboardShell.tsx`):
- Calls `supabase().auth.getUser()` on mount
- If no session → `window.location.href = "/login/"` (client-side redirect)
- Does **not** do role-based gating — role filtering is per-page or per-layout

`admin/settings/*` routes additionally wrapped by `AdminSettingsLayout` (`src/app/(dashboard)/admin/settings/layout.tsx`):
- `seller` → `router.replace("/")` (hard redirect to dashboard home)
- `manager` → nav shows Sales section only (no General / Integrations links)
- `owner` / `admin` → full nav

> ⚠️ **Gap**: `AdminSettingsLayout` hides General/Integrations nav items from `manager` but does **not** block direct URL navigation. A manager who manually visits `/admin/settings/users/` will see and can interact with the Users & Roles page. No 403 is returned. See Findings section.

### API Layer
See `functions/api/_guard.ts` for the shared auth guard:
- Validates Supabase JWT via `${SUPABASE_URL}/auth/v1/user` (Bearer token in `Authorization` header)
- Returns `401` if token missing or invalid
- Optional rate-limit via KV; optional body-size cap
- Skipped entirely when `SUPABASE_URL` env var is unset (dev/CI)

---

## UI Pages Matrix

> **Column key:**  
> `anon` = not logged in (no Supabase session)  
> `seller` = role "seller"  
> `manager` = role "sales_manager"  
> `admin` = role "admin"  
> `owner` = role "owner"  
> ✅ = full access  ⚠️ = access with caveats  ❌ = blocked/redirected

| # | Route | anon | seller | manager | admin | owner | Notes |
|---|-------|------|--------|---------|-------|-------|-------|
| 1 | `/` (dashboard home) | ❌ → /login/ | ✅ | ✅ | ✅ | ✅ | DashboardShell gate |
| 2 | `/accounts/` | ❌ → /login/ | ✅ | ✅ | ✅ | ✅ | No role filter |
| 3 | `/accounts/new/` | ❌ → /login/ | ✅ | ✅ | ✅ | ✅ | Queries sellers+managers for assignment |
| 4 | `/accounts/detail/` | ❌ → /login/ | ✅ | ✅ | ✅ | ✅ | No role filter |
| 5 | `/sales/` | ❌ → /login/ | ✅ | ✅ | ✅ | ✅ | No role filter |
| 6 | `/sales/detail/` | ❌ → /login/ | ✅ | ✅ | ✅ | ✅ | No role filter |
| 7 | `/quotes/` | ❌ → /login/ | ✅ | ✅ | ✅ | ✅ | No role filter |
| 8 | `/quotes/builder/` | ❌ → /login/ | ✅ | ✅ | ✅ | ✅ | No role filter |
| 9 | `/quotes/detail/` | ❌ → /login/ | ✅ | ✅ | ✅ | ✅ | No role filter |
| 10 | `/commissions/` | ❌ → /login/ | ✅ | ✅ | ✅ | ✅ | No role filter |
| 11 | `/pipeline/` | ❌ → /login/ | ✅ | ✅ | ✅ | ✅ | No role filter |
| 12 | `/measure/` | ❌ → /login/ | ✅ | ✅ | ✅ | ✅ | No role filter |
| 13 | `/admin/settings/` (Company) | ❌ → /login/ | ❌ → / | ⚠️ | ✅ | ✅ | Manager: not in nav, **no hard block** |
| 14 | `/admin/settings/departments/` | ❌ → /login/ | ❌ → / | ⚠️ | ✅ | ✅ | Manager: not in nav, **no hard block** |
| 15 | `/admin/settings/users/` | ❌ → /login/ | ❌ → / | ⚠️ | ✅ | ✅ | Manager: not in nav, **no hard block** |
| 16 | `/admin/settings/products/` | ❌ → /login/ | ❌ → / | ✅ | ✅ | ✅ | In manager nav |
| 17 | `/admin/settings/commissions/` | ❌ → /login/ | ❌ → / | ✅ | ✅ | ✅ | In manager nav |
| 18 | `/admin/settings/workflows/` | ❌ → /login/ | ❌ → / | ✅ | ✅ | ✅ | In manager nav |
| 19 | `/admin/settings/lead-sources/` | ❌ → /login/ | ❌ → / | ✅ | ✅ | ✅ | In manager nav |
| 20 | `/admin/settings/financing/` | ❌ → /login/ | ❌ → / | ✅ | ✅ | ✅ | In manager nav |
| 21 | `/admin/settings/quickbooks/` | ❌ → /login/ | ❌ → / | ⚠️ | ✅ | ✅ | Manager: not in nav, **no hard block** |
| 22 | `/admin/settings/gohighlevel/` | ❌ → /login/ | ❌ → / | ⚠️ | ✅ | ✅ | Manager: not in nav, **no hard block** |
| 23 | `/admin/settings/google-maps/` | ❌ → /login/ | ❌ → / | ⚠️ | ✅ | ✅ | Manager: not in nav, **no hard block** |
| 24 | `/admin/settings/ai-vision/` | ❌ → /login/ | ❌ → / | ⚠️ | ✅ | ✅ | Manager: not in nav, **no hard block** |
| 25 | `/admin/settings/resend/` | ❌ → /login/ | ❌ → / | ⚠️ | ✅ | ✅ | Manager: not in nav, **no hard block** |

**Outside dashboard (no DashboardShell):**

| # | Route | Auth | Notes |
|---|-------|------|-------|
| 26 | `/login/` | None | Public login page |
| 27 | `/accept/` | `accept_token` (URL param) | Customer-facing quote acceptance; no user JWT |

---

## API Endpoints Matrix

> Full details, healthcheck drift analysis, and upstream API notes: `docs/API_AUTH_MATRIX.md`  
> **Auth column key:**  
> `guard()` = shared `_guard.ts` (JWT + optional rate limit)  
> `manual JWT` = own Bearer parse → Supabase `/auth/v1/user`  
> `token` = opaque `accept_token` from DB  
> `HMAC` = webhook secret verification  
> `none` = fully public

| # | Endpoint | Methods | Auth | Min role | Rate limit | anon | seller | manager | admin | owner | Finding |
|---|----------|---------|------|----------|-----------|------|--------|---------|-------|-------|---------|
| 1 | `/api/folio-lookup` | POST | **none** | — | none | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ **FULLY PUBLIC — no auth, no rate limit** |
| 2 | `/api/accept-automate` | POST | token | — (customer) | none | ✅† | ✅† | ✅† | ✅† | ✅† | †Valid `accept_token` required; anon w/o token → 400. Intentional. |
| 3 | `/api/ghl/webhook` | POST | HMAC | — (external) | none | ❌ 401 | ❌ 401 | ❌ 401 | ❌ 401 | ❌ 401 | HMAC-SHA256 on `x-wh-signature`. Not user JWT. |
| 4 | `/api/quickbooks/connect` | GET | none | — | none | ✅ | ✅ | ✅ | ✅ | ✅ | Intentional — OAuth flow initiation |
| 5 | `/api/quickbooks/callback` | GET | none (CSRF state) | — | none | ✅ | ✅ | ✅ | ✅ | ✅ | Intentional — OAuth redirect; CSRF state in KV |
| 6 | `/api/quickbooks/sync` | POST | `guard()` | any authed | none | ❌ 401 | ✅ | ✅ | ✅ | ✅ | No role check beyond auth |
| 7 | `/api/ghl-proxy` | POST/GET | `guard()` | any authed | none | ❌ 401 | ✅ | ✅ | ✅ | ✅ | No role check beyond auth |
| 8 | `/api/solar` | GET | `guard()` | any authed | none | ❌ 401 | ✅ | ✅ | ✅ | ✅ | Phase 6.5 added auth |
| 9 | `/api/address-intel` | POST | `guard()` | any authed | none | ❌ 401 | ✅ | ✅ | ✅ | ✅ | Phase 6.5 added auth |
| 10 | `/api/email/send-quote-link` | POST | manual JWT | any authed | none | ❌ 401 | ✅ | ✅ | ✅ | ✅ | Not using `_guard` helper |
| 11 | `/api/email/send-quote-pdf` | POST | manual JWT | any authed | none | ❌ 401 | ✅ | ✅ | ✅ | ✅ | Not using `_guard` helper |
| 12 | `/api/visualize/roof` | POST | manual JWT | any authed | 20/user/day (DB) | ❌ 401 | ✅ | ✅ | ✅ | ✅ | Only paid CF endpoint (~$0.04/call). Not using `_guard` helper. |
| 13 | `/api/vision/damage-detect` | POST | `guard()` | any authed | 20 req/min | ❌ 401 | ✅ | ✅ | ✅ | ✅ | 8 MB body cap |
| 14 | `/api/vision/material-detect` | POST | `guard()` | any authed | 20 req/min | ❌ 401 | ✅ | ✅ | ✅ | ✅ | 8 MB body cap |
| 15 | `/api/vision/perimeter-detect` | POST | `guard()` | any authed | none | ❌ 401 | ✅ | ✅ | ✅ | ✅ | Phase 6.5 added auth |
| 16 | `/api/voice/transcribe-estimate` | POST | `guard()` | any authed | 20 req/min | ❌ 401 | ✅ | ✅ | ✅ | ✅ | 25 MB audio cap |
| 17 | `/api/invite-user` | POST | `guard()` + role | **admin/owner** | none | ❌ 401 | ❌ 403 | ❌ 403 | ✅ | ✅ | Phase 6.5 added auth |
| 18 | `/api/admin/purge-user` | POST | `guard()` + role | **admin/owner** | none | ❌ 401 | ❌ 403 | ❌ 403 | ✅ | ✅ | Phase 6.5 added auth |
| 19 | `/api/admin/solar-usage` | GET | `guard()` + role | **admin/owner** | none | ❌ 401 | ❌ 403 | ❌ 403 | ✅ | ✅ | — |

---

## Findings

### F1 — MEDIUM: Manager nav-bypass on admin settings pages

**Affected routes:** `/admin/settings/` (Company), `/admin/settings/departments/`, `/admin/settings/users/`, `/admin/settings/quickbooks/`, `/admin/settings/gohighlevel/`, `/admin/settings/google-maps/`, `/admin/settings/ai-vision/`, `/admin/settings/resend/`

**Evidence:** `AdminSettingsLayout` only removes navigation links from the manager view. It does not add a page-level role check. A `manager` who navigates directly to any of these URLs will land on the page with full read/write access.

**Highest-risk case:** `/admin/settings/users/` — a manager can invite and role-assign new users.

**Fix:** Add inline role guard to each restricted page, e.g.:
```tsx
if (profile.role !== "admin" && profile.role !== "owner") router.replace("/admin/settings/products/");
```
Or add a second role gate in `AdminSettingsLayout` that redirects managers away from non-Sales routes (cleaner single fix point).

---

### F2 — LOW: `/api/folio-lookup` fully public, no rate limit

**Evidence:** No `guard()` call, no rate limiting. Proxies Miami-Dade and Broward ArcGIS REST APIs.

**Risk:** GIS quota exhaustion; no PII exposure; no write path. An anonymous caller can enumerate property data without credentials.

**Fix:** Add `guard()` (require JWT) if this is internal-only, OR add KV-based IP rate limiting if customer-facing use is intentional (e.g., pre-login address lookup on accept flow). Confirm intent with Alejandro.

---

### F3 — INFO: Three endpoints bypass `_guard` helper

**Affected:** `/api/email/send-quote-link`, `/api/email/send-quote-pdf`, `/api/visualize/roof`

**Evidence:** Implement own Bearer token validation instead of calling `guard()`. Logic is equivalent but duplicated — future `_guard.ts` changes (rate limit policy, JWT clock tolerance, etc.) will not auto-apply here.

**Fix:** Refactor to use `guard()`. Low urgency unless `_guard.ts` changes are planned.

---

### F4 — INFO: `/api/vision/perimeter-detect` has no rate limit

**Evidence:** `rateLimit: 0` in `guard()` call. The two sibling endpoints (`damage-detect`, `material-detect`) both use 20 req/min. Likely an oversight.

**Fix:** Set `rateLimit: 20` to match siblings.

---

### F5 — INFO: Healthcheck drift (6 probes stale after Phase 6.5)

See `docs/API_AUTH_MATRIX.md` § Healthcheck Cron vs Reality Drift for full list. Six probes in `scripts/healthcheck.sh` expect pre-Phase-6.5 status codes and will FAIL against current deploy. All need `400` → `401` updates.

---

## Summary

| Category | Count | Notes |
|----------|-------|-------|
| UI pages audited | 25 | +2 outside dashboard (/login, /accept) |
| API endpoints audited | 19 | excl. `_guard.ts` and `_solar-cache.ts` helpers |
| Fully public UI pages | 2 | /login/, /accept/ — intentional |
| Fully public API endpoints | 3 | folio-lookup (⚠️), qb/connect, qb/callback |
| Role-gated API endpoints | 3 | invite-user, purge-user, admin/solar-usage — admin/owner only |
| API endpoints with manual JWT (not guard()) | 3 | send-quote-link, send-quote-pdf, visualize/roof |
| Findings flagged | 5 | 1 MEDIUM, 1 LOW, 3 INFO |
