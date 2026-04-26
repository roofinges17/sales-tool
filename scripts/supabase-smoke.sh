#!/usr/bin/env bash
# /scripts/supabase-smoke.sh — Supabase table health check
# Uses service role key (bypasses RLS — intentional for infra smoke test).
# Exit 0 = all tables readable. Exit 1 = first failure.
#
# Required env:
#   SUPABASE_URL              e.g. https://hlmmwtehabwywajuhghi.supabase.co
#   SUPABASE_SERVICE_ROLE_KEY service role JWT
# Optional env:
#   TIMEOUT                   curl timeout in seconds (default: 10)
#
# Usage:
#   SUPABASE_URL=https://... SUPABASE_SERVICE_ROLE_KEY=... ./scripts/supabase-smoke.sh
#   source .env && ./scripts/supabase-smoke.sh

set -euo pipefail

SUPABASE_URL="${SUPABASE_URL:-}"
SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-}"
TIMEOUT="${TIMEOUT:-10}"

[[ -z "$SUPABASE_URL" || -z "$SUPABASE_SERVICE_ROLE_KEY" ]] && {
  echo "ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set" >&2
  exit 2
}

PASS=0; FAIL=0; ERRORS=()
pass() { echo "  PASS  $1"; ((PASS++)); }
fail() { echo "  FAIL  $1 -- $2" >&2; ((FAIL++)); ERRORS+=("$1: $2"); }

test_table() {
  local label="$1" table="$2"
  echo ""; echo "=== $label ($table) ==="

  local raw http_code body
  raw=$(curl -s --max-time "$TIMEOUT" \
    -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Prefer: count=exact" \
    -w "\n%{http_code}" \
    "${SUPABASE_URL}/rest/v1/${table}?select=id&limit=1") || {
      fail "$label readable" "curl failed (network error)"
      return
    }
  http_code=$(echo "$raw" | tail -1)
  body=$(echo "$raw" | head -n -1)

  [[ "$http_code" == "200" ]] && pass "$label HTTP 200" \
    || { fail "$label" "expected 200, got $http_code -- ${body:0:200}"; return; }

  echo "$body" | jq -e 'type=="array"' &>/dev/null \
    && pass "$label returns JSON array ($(echo "$body"|jq 'length') row(s) in page)" \
    || fail "$label shape" "expected JSON array, got: ${body:0:100}"
}

echo "Supabase smoke: $SUPABASE_URL"

test_table "accounts"  "accounts"
test_table "contacts"  "contacts"
test_table "quotes"    "quotes"
# NOTE: The UI "Estimates" tab reads from `quotes` filtered by status —
# there is no separate `estimates` table in migrations. Uncomment if added:
# test_table "estimates" "estimates"
test_table "sales"     "sales"
test_table "roofs"     "roof_measurements"
# Next-tier tables — uncomment if issues surface:
# test_table "line_items"  "quote_line_items"
# test_table "profiles"    "profiles"

echo ""
echo "---------------------------------"
echo "  $PASS passed, $FAIL failed"
if (( FAIL > 0 )); then
  echo "  Failures:" >&2
  for e in "${ERRORS[@]}"; do echo "    * $e" >&2; done
  echo "---------------------------------"
  exit 1
fi
echo "---------------------------------"
