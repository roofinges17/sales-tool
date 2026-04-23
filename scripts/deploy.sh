#!/usr/bin/env bash
# Sales Tool deploy: build + push to Cloudflare Pages.

set -euo pipefail

cd "$(dirname "$0")/.."

for v in NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY \
         CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID CLOUDFLARE_PAGES_PROJECT; do
    if [[ -z "${!v:-}" ]]; then
        echo "✗ missing env: $v"
        exit 1
    fi
done

if [[ ! -d node_modules ]]; then
    npm install
fi

rm -rf out .next
npm run build

npx wrangler pages deploy out \
    --project-name="$CLOUDFLARE_PAGES_PROJECT" \
    --branch=main \
    --commit-dirty=true
