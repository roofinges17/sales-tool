#!/usr/bin/env bash
# Sales-Tool 30-probe healthcheck
# Usage: ./scripts/healthcheck.sh [PROD_URL]
# Default target: https://roofing-experts-sales-tool.pages.dev

set -euo pipefail

PROD="${1:-https://roofing-experts-sales-tool.pages.dev}"
PASS=0
FAIL=0
WARN=0
RESULTS=()

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

probe() {
  local id="$1" desc="$2" method="$3" path="$4" want_status="$5"
  local extra_flags="${6:-}"
  local url="$PROD$path"

  local status
  status=$(curl -s -o /tmp/hc_body.txt -w "%{http_code}" -X "$method" \
    -H "Content-Type: application/json" \
    --max-time 15 \
    $extra_flags \
    "$url" 2>/dev/null) || status="000"

  local body
  body=$(cat /tmp/hc_body.txt 2>/dev/null | head -c 500)

  if [[ "$status" == "$want_status" ]]; then
    echo -e "${GREEN}PASS${NC} [P$id] $desc — HTTP $status"
    PASS=$((PASS+1))
    RESULTS+=("PASS|P$id|$desc|$status|")
  else
    echo -e "${RED}FAIL${NC} [P$id] $desc — expected HTTP $want_status, got HTTP $status"
    echo "      body: ${body:0:200}"
    FAIL=$((FAIL+1))
    RESULTS+=("FAIL|P$id|$desc|$status|expected $want_status — body: ${body:0:200}")
  fi
}

probe_contains() {
  local id="$1" desc="$2" method="$3" path="$4" fragment="$5"
  local extra_flags="${6:-}"
  local url="$PROD$path"

  local body
  body=$(curl -s -X "$method" \
    -H "Content-Type: application/json" \
    --max-time 15 \
    $extra_flags \
    "$url" 2>/dev/null || echo "")

  if echo "$body" | grep -q "$fragment"; then
    echo -e "${GREEN}PASS${NC} [P$id] $desc — response contains '$fragment'"
    PASS=$((PASS+1))
    RESULTS+=("PASS|P$id|$desc||contains '$fragment'")
  else
    echo -e "${RED}FAIL${NC} [P$id] $desc — response missing '$fragment'"
    echo "      body: ${body:0:300}"
    FAIL=$((FAIL+1))
    RESULTS+=("FAIL|P$id|$desc||missing '$fragment' — body: ${body:0:300}")
  fi
}

echo ""
echo "================================================="
echo " Sales-Tool Healthcheck — $(date)"
echo " Target: $PROD"
echo "================================================="
echo ""
echo "── PAGE PROBES (static HTML) ───────────────────"

# Static pages — static export, so all return 200 HTML
probe  1  "Login page loads"                          GET  "/login/"                    200
probe  2  "Dashboard root loads"                      GET  "/"                          200
probe  3  "Accounts list loads"                       GET  "/accounts/"                 200
probe  4  "Quotes list loads"                         GET  "/quotes/"                   200
probe  5  "Quote builder loads"                       GET  "/quotes/builder/"           200
probe  6  "Sales list loads"                          GET  "/sales/"                    200
probe  7  "Pipeline loads"                            GET  "/pipeline/"                 200
probe  8  "Commissions loads"                         GET  "/commissions/"              200
probe  9  "Measure page loads"                        GET  "/measure/"                  200
probe 10  "Admin settings root loads"                 GET  "/admin/settings/"           200
probe 11  "Admin products loads"                      GET  "/admin/settings/products/"  200
probe 12  "Admin users loads"                         GET  "/admin/settings/users/"     200
probe 13  "Accept page (anon) loads"                  GET  "/accept/"                   200

echo ""
echo "── API ENDPOINT PROBES (auth/error guards) ─────"

# API endpoints — no auth → expect 401 or 400 (never 500)
# Auth-guarded endpoints — expect 401 without auth token
probe 14  "folio-lookup: no params → 400"                    POST "/api/folio-lookup"                 400  '-d "{}"'
# 2026-04-26: post-Phase-6.5 changed to 401 (auth-gated)
probe 15  "ghl-proxy: no auth → 401"                         POST "/api/ghl-proxy"                    401  '-d "{}"'
# 2026-04-26: post-Phase-6.5 changed to 401 (auth-gated)
probe 16  "QB sync: no auth → 401"                           POST "/api/quickbooks/sync"              401  '-d "{}"'
probe 17  "QB connect: no auth → redirect"                   GET  "/api/quickbooks/connect"           302  '--max-redirs 0'
probe 18  "email send-quote-link: no auth → 401"             POST "/api/email/send-quote-link"        401  '-d "{}"'
probe 19  "email send-quote-pdf: no auth → 401"              POST "/api/email/send-quote-pdf"         401  '-d "{}"'
probe 20  "accept-automate: no token in body → 400"          POST "/api/accept-automate"              400  '-d "{}"'
# 2026-04-26: post-Phase-6.5 changed to 401 (auth-gated)
probe 21  "address-intel: no auth → 401"                     POST "/api/address-intel"               401  '-d "{}"'
probe 22  "vision damage-detect: no auth → 401"              POST "/api/vision/damage-detect"         401  '-d "{}"'
probe 23  "vision material-detect: no auth → 401"            POST "/api/vision/material-detect"       401  '-d "{}"'
# 2026-04-26: post-Phase-6.5 changed to 401 (auth-gated)
probe 24  "perimeter-detect: no auth → 401"                  POST "/api/vision/perimeter-detect"     401  '-d "{}"'
probe 25  "visualize/roof: no auth → 401"                    POST "/api/visualize/roof"               401  '-d "{}"'
# 2026-04-26: post-Phase-6.5 changed to 401 (auth-gated)
probe 26  "invite-user: no auth → 401"                       POST "/api/invite-user"                 401  '-d "{}"'
# 2026-04-26: post-Phase-6.5 changed to 401 (auth-gated)
probe 27  "admin/purge-user: no auth → 401"                  POST "/api/admin/purge-user"            401  '-d "{}"'

echo ""
echo "── CONTENT INTEGRITY PROBES ────────────────────"

# Check key HTML markers are present
probe_contains 28 "Login page has Next.js data"  GET "/login/"  "__NEXT_DATA__\|_next\|__next"
probe_contains 29 "Accept page has Next.js data" GET "/accept/" "__NEXT_DATA__\|_next\|__next"
probe_contains 30 "Root page has app shell"       GET "/"        "<html\|<!DOCTYPE"

echo ""
echo "================================================="
echo " RESULTS: $PASS PASS | $FAIL FAIL | $WARN WARN"
echo "================================================="
echo ""

if [[ $FAIL -gt 0 ]]; then
  echo -e "${RED}FAILURES:${NC}"
  for r in "${RESULTS[@]}"; do
    IFS='|' read -r status id desc code detail <<< "$r"
    if [[ "$status" == "FAIL" ]]; then
      echo "  [P$id] $desc"
      echo "         HTTP $code — $detail"
    fi
  done
  echo ""
fi

# Write machine-readable report
REPORT_FILE="/tmp/healthcheck-$(date +%Y%m%d-%H%M%S).json"
python3 -c "
import json, sys
results = []
data = '''$(printf '%s\n' "${RESULTS[@]}")'''.strip().split('\n')
for line in data:
  if not line: continue
  parts = line.split('|')
  results.append({'status': parts[0], 'id': parts[1], 'desc': parts[2], 'http': parts[3], 'detail': parts[4] if len(parts)>4 else ''})
print(json.dumps({'pass': $PASS, 'fail': $FAIL, 'results': results}, indent=2))
" > "$REPORT_FILE" 2>/dev/null && echo "Report: $REPORT_FILE" || true

exit $FAIL
