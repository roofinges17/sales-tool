#!/usr/bin/env bash
# /scripts/smoke-test.sh — CF Pages Functions smoke test
# Exit 0 = all green. Exit 1 = first failure with message to stderr.
#
# Required env:   (none — public endpoints)
# Optional env:
#   BASE_URL    override target (default: prod pages.dev)
#   TIMEOUT     curl timeout in seconds (default: 15)
#   TEST_IDX    force address index 0|1|2 (default: random)
#
# Usage:
#   ./scripts/smoke-test.sh
#   BASE_URL=https://staging.example.com ./scripts/smoke-test.sh

set -euo pipefail

BASE_URL="${BASE_URL:-https://roofing-experts-sales-tool.pages.dev}"
TIMEOUT="${TIMEOUT:-15}"

# ── Test address pool ─────────────────────────────────────────────────────────
# Three known-good Miami-Dade residential addresses across different ZIPs.
# Script picks one randomly per run to reduce correlated GIS/Solar WARN storms.
# All three are HVHZ (33xxx) and have confirmed ArcGIS folio coverage.
# If a run warns consistently on folio/roof for one address, update that entry.
ADDRESSES=(
  "8800 SW 107th Ave, Miami, FL 33176|25.6854|-80.3817|33176"
  "3901 SW 89th Ave, Miami, FL 33165|25.7195|-80.3446|33165"
  "7400 SW 50th Ter, Miami, FL 33155|25.7257|-80.3236|33155"
)
IDX="${TEST_IDX:-$((RANDOM % ${#ADDRESSES[@]}))}"
IFS='|' read -r TEST_ADDRESS TEST_LAT TEST_LNG TEST_ZIP <<< "${ADDRESSES[$IDX]}"

PASS=0; FAIL=0; ERRORS=()
pass() { echo "  PASS  $1"; ((PASS++)); }
fail() { echo "  FAIL  $1 -- $2" >&2; ((FAIL++)); ERRORS+=("$1: $2"); }

check_deps() {
  for cmd in curl jq; do
    command -v "$cmd" &>/dev/null || { echo "ERROR: $cmd required but not installed" >&2; exit 2; }
  done
}

# ── 1: /api/address-intel — auth guard only ───────────────────────────────────
# Phase 6.5 added JWT requirement. Smoke runs unauthenticated so we assert 401.
# Full functional test (with JWT) requires a live Supabase user — run ad-hoc only.

test_address_intel() {
  echo ""; echo "=== /api/address-intel (auth guard) ==="
  local raw http_code body
  raw=$(curl -s --max-time "$TIMEOUT" -w "\n%{http_code}" \
    -H "Content-Type: application/json" \
    -d '{"address":"123 Main St","lat":25.7617,"lng":-80.1918,"zip":"33101"}' \
    "${BASE_URL}/api/address-intel")
  http_code=$(echo "$raw" | tail -1)
  body=$(echo "$raw" | head -n -1)

  [[ "$http_code" == "401" ]] && pass "address-intel 401 without auth token" \
    || fail "address-intel auth guard" "expected 401, got $http_code (auth middleware may be broken or removed)"

  echo "$body" | jq -e 'has("error")' &>/dev/null \
    && pass "address-intel 401 body has error field" \
    || fail "address-intel 401 body" "expected {\"error\":\"...\"}, got: ${body:0:100}"
}

# ── 2: /api/solar — auth guard only ──────────────────────────────────────────
# Phase 6.5 added JWT requirement. Smoke runs unauthenticated so we assert 401.

test_solar() {
  echo ""; echo "=== /api/solar (auth guard) ==="
  local raw http_code body
  raw=$(curl -s --max-time "$TIMEOUT" -w "\n%{http_code}" \
    "${BASE_URL}/api/solar?lat=25.7617&lng=-80.1918")
  http_code=$(echo "$raw" | tail -1)
  body=$(echo "$raw" | head -n -1)

  [[ "$http_code" == "401" ]] && pass "solar 401 without auth token" \
    || fail "solar auth guard" "expected 401, got $http_code (auth middleware may be broken or removed)"

  echo "$body" | jq -e 'has("error")' &>/dev/null \
    && pass "solar 401 body has error field" \
    || fail "solar 401 body" "expected {\"error\":\"...\"}, got: ${body:0:100}"
}

# ── 3: /api/visualize/roof — auth guard only ──────────────────────────────────
# INTENTIONALLY does not send a real image. See docs/smoke-test-runbook.md for
# the manual full-visualize test procedure (requires admin JWT, run ad-hoc only).
#
# Why auth-guard-only for cron:
#   a) Gemini 2.5 Flash image generation costs ~$0.04 per call
#   b) Depletes the per-user daily rate cap (default 20/day)
#   c) Requires a live Supabase user JWT unavailable in cron context
# Asserting 401 on an unauthenticated request proves: Function deployed, routing
# correct, auth middleware wired, no accidental public exposure.

test_visualize_auth() {
  echo ""; echo "=== /api/visualize/roof (auth guard) ==="
  local raw http_code body
  raw=$(curl -s --max-time "$TIMEOUT" -w "\n%{http_code}" \
    -H "Content-Type: application/json" \
    -d '{"color":"Charcoal","photo_url":"https://example.com/test.jpg"}' \
    "${BASE_URL}/api/visualize/roof")
  http_code=$(echo "$raw" | tail -1)
  body=$(echo "$raw" | head -n -1)

  [[ "$http_code" == "401" ]] && pass "visualize/roof 401 without auth token" \
    || fail "visualize/roof auth guard" "expected 401, got $http_code (auth middleware may be broken or removed)"

  echo "$body" | jq -e 'has("error")' &>/dev/null \
    && pass "visualize/roof 401 body has error field" \
    || fail "visualize/roof 401 body" "expected {\"error\":\"...\"}, got: ${body:0:100}"
}

# ── Summary ───────────────────────────────────────────────────────────────────

check_deps
echo "Smoke: $BASE_URL"
echo "Address [$IDX]: $TEST_ADDRESS ($TEST_LAT, $TEST_LNG)"

test_address_intel
test_solar
test_visualize_auth

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
