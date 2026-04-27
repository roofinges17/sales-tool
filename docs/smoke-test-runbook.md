# Smoke Test Runbook

## Overview

Two scripts provide infrastructure monitoring for the sales-tool:

| Script | Targets | Interval | Auth needed |
|--------|---------|----------|-------------|
| `scripts/smoke-test.sh` | CF Pages Functions (auth guards) | on push to main only (GH Actions cron removed 2026-04-26) | None (all 3 endpoints assert 401) |
| `scripts/supabase-smoke.sh` | Supabase tables | on push to main + watchdog 5m (GH Actions cron removed 2026-04-26) | Service role key |

Both exit 0 = green, non-zero = failure with message on stderr.

**Phase 6.5 note:** `/api/address-intel` and `/api/solar` had JWT auth added in Phase 6.5.
All three CF Functions endpoints are now auth-gated. The smoke test asserts 401 on all three —
no public endpoint functional tests remain. Functional coverage (folio lookup, totalArea assertions,
etc.) requires a live user JWT and must be run ad-hoc (see Full Functional Test section below).

---

## Alert Format

All automated failures emit alerts in this format so res can pattern-match on `SMOKE_FAIL[`:

```
SMOKE_FAIL[<source>]: <endpoint_or_table> -- <error_summary>
```

Examples:
```
SMOKE_FAIL[watchdog]: roof_measurements -- HTTP 502 {"code":"PGRST116"}
SMOKE_FAIL[gh-actions]: /api/address-intel -- HTTP 500 got 500
SMOKE_FAIL[watchdog]: accounts -- curl failed (network error)
```

Sources: `watchdog` | `gh-actions` | `manual`

res pattern-matches on `SMOKE_FAIL[` and forwards to Telegram with severity tagging.

---

## Cron Sources

### GitHub Actions (primary, external vantage)

- `smoke-functions.yml` — push to main only (GH Actions schedule cron removed 2026-04-26; periodic smoke is now the themis healthcheck)
- `smoke-supabase.yml` — push to main only (GH Actions schedule cron removed 2026-04-26; periodic coverage via cortextos watchdog 5m cron)
- Failure notification: GitHub sends email on job failure; also configure a GH Actions
  notification step (see below) to push to the bus.

Optional GH Actions failure notification step (add to each workflow's `steps`):
```yaml
- name: Notify on failure
  if: failure()
  env:
    BUS_ENDPOINT: ${{ secrets.CORTEXTOS_BUS_WEBHOOK }}
  run: |
    curl -s -X POST "$BUS_ENDPOINT" \
      -H "Content-Type: application/json" \
      -d "{\"to\":\"res\",\"priority\":\"high\",\"body\":\"SMOKE_FAIL[gh-actions]: workflow=${{ github.workflow }} -- job failed\"}"
```

### cortextos watchdog cron (in-band, survives CF outages)

See watchdog `config.json` entry below. The watchdog runs supabase-smoke.sh on a 5-minute cycle and sends a high-priority bus message to res on failure.

---

## Watchdog Cron Entry

Add this to the watchdog agent's `config.json` under `"crons"`:

```json
{
  "name": "supabase-smoke",
  "type": "recurring",
  "interval": "5m",
  "prompt": "Run the Supabase smoke test: source /Users/alejandroperez/Sage/orgs/roofingexperts/projects/sales-tool/.env and execute bash /Users/alejandroperez/Sage/orgs/roofingexperts/projects/sales-tool/scripts/supabase-smoke.sh. Capture stdout+stderr. If exit code is non-zero, immediately run: cortextos bus send-message res high 'SMOKE_FAIL[watchdog]: <failed_table_from_stderr> -- <error_line_from_stderr>' with no reply_to. If exit code is 0, write the current UTC timestamp to /tmp/smoke_last_ok.txt (overwrite) — do NOT log a bus event on success. Do nothing else."
}
```

**Success-log design note:** The watchdog cron fires every 5 minutes = 288 runs/day.
Logging `smoke_ok` on every success would generate 288 bus events/day of pure noise.
Instead: on failure → high-priority bus message to res (signal). On success → write
timestamp to `/tmp/smoke_last_ok.txt` (local audit trail, zero bus load). GH Actions
`smoke-supabase.yml` provides the external success audit trail every 5 minutes.
If you want hourly bus-level confirmation, change the interval to `1h` for the
watchdog cron and keep 5-minute coverage on GH Actions only.

**Pre-commit prerequisite verification (run before Hermes commits on Monday):**

```bash
# Verify watchdog .env has required secrets before enabling the cron.
# Run from the watchdog agent directory:
WATCHDOG_ENV="/Users/alejandroperez/Sage/orgs/roofingexperts/agents/watchdog/.env"

grep -q "SUPABASE_URL=" "$WATCHDOG_ENV" \
  && grep -q "SUPABASE_SERVICE_ROLE_KEY=" "$WATCHDOG_ENV" \
  && echo "OK — watchdog .env has required secrets" \
  || echo "MISSING — add SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY to $WATCHDOG_ENV before enabling cron"
```

If missing, add to watchdog's `.env`:
```bash
echo 'SUPABASE_URL="https://hlmmwtehabwywajuhghi.supabase.co"' >> "$WATCHDOG_ENV"
echo 'SUPABASE_SERVICE_ROLE_KEY="<key from sales-tool .env>"' >> "$WATCHDOG_ENV"
```
The service role key is already in `projects/sales-tool/.env` — copy it, don't regenerate.

---

## Test Address Pool

`smoke-test.sh` randomly picks one of three Miami-Dade residential addresses per run.
This spreads GIS/Solar load and prevents correlated WARN storms from a single address
going stale.

| Index | Address | ZIP | Notes |
|-------|---------|-----|-------|
| 0 | 8800 SW 107th Ave, Miami, FL 33176 | 33176 | Kendall, HVHZ |
| 1 | 3901 SW 89th Ave, Miami, FL 33165 | 33165 | Westchester, HVHZ |
| 2 | 7400 SW 50th Ter, Miami, FL 33155 | 33155 | West Miami, HVHZ |

Force a specific address: `TEST_IDX=0 ./scripts/smoke-test.sh`

If an address starts producing consistent `WARN folio null` or `WARN roof null` across
multiple runs, verify it still exists in Google Maps and update the pool.

---

## False-Positive Risk Reference

| Test | Risk | Root cause | Failure class |
|------|------|-----------|---------------|
| address-intel 401 | Very low 1% | CF routing + auth middleware | FAIL |
| solar 401 | Very low 1% | CF routing + auth middleware | FAIL |
| visualize/roof 401 | Very low 1% | CF routing + auth middleware | FAIL |
| supabase any table | Very low 2% | Supabase SLA >99.9% | FAIL |

**Note (post-Phase-6.5):** `/api/address-intel` and `/api/solar` are auth-gated. The healthcheck and smoke scripts only test the auth guard (expect 401 anon). Functional tests (folio lookup, totalArea, etc.) require a live user JWT and must be run ad-hoc (see Full Functional Test section below).

Hard-failure rate on a healthy system: ~1-2% per run (auth middleware only — GIS/Solar external-dep flakiness no longer in automated path).

---

## Full Visualize Test (Manual — DO NOT add to cron)

The cron tests `/api/visualize/roof` at the **auth guard only** (no JWT → 401).

Running a full visualize test (actual Gemini image generation) requires:
- A valid Supabase user JWT (not service role key — must be a real user session)
- One render counts against that user's daily cap (default 20/day)
- Costs approximately $0.04 in Gemini API credits

**Manual procedure (run ad-hoc only, never automated):**

```bash
# Step 1: Mint a JWT for an admin user
TOKEN=$(curl -s -X POST \
  "https://hlmmwtehabwywajuhghi.supabase.co/auth/v1/token?grant_type=password" \
  -H "apikey: $(grep NEXT_PUBLIC_SUPABASE_ANON_KEY .env | cut -d= -f2 | tr -d '\"')" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"aperez@roofingex.com\",\"password\":\"<password>\"}" \
  | jq -r '.access_token')

echo "JWT: ${TOKEN:0:20}..."

# Step 2: Call visualize/roof with a real photo URL and admin token
curl -X POST "https://roofing-experts-sales-tool.pages.dev/api/visualize/roof" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "photo_url": "https://maps.googleapis.com/maps/api/staticmap?center=25.7257,-80.3236&zoom=20&size=640x640&maptype=satellite&key=<GOOGLE_KEY>",
    "color": "Charcoal",
    "finish": "Matte"
  }' | jq .

# Expected response: {"render_url": "https://hlmmwtehabwywajuhghi.supabase.co/storage/v1/...", "model_id": "gemini-2.5-flash-image"}
```

Run this test when:
- The Gemini model ID changes (currently `gemini-2.5-flash-image`)
- Supabase storage bucket policy changes
- After a major auth middleware refactor

Log the result manually as `SMOKE_FAIL[manual]` or `SMOKE_PASS[manual]` in the
activity log so there's a paper trail.

---

## Phase 7.1: Remove Hardcoded SUPABASE_URL Fallback (Post-Monday)

**Task ID:** task_1777142040004_336
**Priority:** Low — do with the smoke-test commit on Monday 2026-04-27.

**Finding:** `functions/api/visualize/roof.ts` line 78 has:
```typescript
const supabaseUrl = env.SUPABASE_URL ?? "https://hlmmwtehabwywajuhghi.supabase.co";
```
If `SUPABASE_URL` is not explicitly bound in the CF Pages dashboard, the function silently
uses the hardcoded URL. This means: smoke tests pass (auth guard works), but if the
project ever migrates to a new Supabase org, the function would silently route to the
old project and no alarm would fire.

**Two-part fix:**

**(a) Verify CF Pages dashboard has SUPABASE_URL bound:**
```bash
# Check via CF API — confirm SUPABASE_URL appears in Pages project env vars
curl -s "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/pages/projects/roofing-experts-sales-tool" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  | jq '.result.deployment_configs.production.env_vars | keys | map(select(startswith("SUPABASE")))'
```
Expected: `["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_URL"]`
If `SUPABASE_URL` is missing: add it in CF Pages dashboard before removing the fallback.

**(b) Remove hardcoded fallback from the function:**
```typescript
// Before:
const supabaseUrl = env.SUPABASE_URL ?? "https://hlmmwtehabwywajuhghi.supabase.co";

// After:
const supabaseUrl = env.SUPABASE_URL;
if (!supabaseUrl) {
  return Response.json({ error: "Server misconfigured" }, { status: 500, headers: CORS });
}
```
This makes missing config fail loudly (500) instead of silently degrading.

---

## Required Secrets Reference

### GitHub Actions secrets (Settings > Secrets and variables > Actions)

| Secret name | Purpose | Maps to CF Pages env |
|-------------|---------|---------------------|
| `SUPABASE_URL` | Supabase REST base URL | `SUPABASE_URL` (Functions) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role JWT | `SUPABASE_SERVICE_ROLE_KEY` |

**Name drift warning:** The Next.js app uses `NEXT_PUBLIC_SUPABASE_URL` (client-side).
CF Pages Functions use `SUPABASE_URL` (server-side, with a hardcoded fallback).
GH Actions secrets use `SUPABASE_URL` to match the Functions binding.
If the Supabase project URL ever changes, update all three: `.env`, CF Pages dashboard,
and GH Actions secrets.
