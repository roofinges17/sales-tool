# Changelog

All notable changes to the Roofing Experts Sales Tool.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased] - 2026-04-25

### Features

- **QuickBooks integration** — OAuth shell + sync log page under `/admin/settings/quickbooks/`. (`873bdcc`)
- **On-Site Close: hard delete with confirm** — Estimates and contracts now show edit/delete affordances; delete requires confirmation dialog. (`4cd9782`, `5eead3f`)
- **Address Intelligence** — Single address lookup pre-fills property intel, satellite imagery, solar data, and quote context in one shot. (`97bb7c0`)
- **AI Roof Damage Detector** — Photo-based damage assessment via Vision AI endpoint, accessible from the quote detail page. (`a4b060e`)
- **AI Material Analysis** — Soffit, fascia, and gutters analysis from uploaded photos (Vision Suite Phase 2). (`df683e2`)
- **Roof Color Visualizer** — Seller picks a color, Gemini image-edit re-renders the roof; result saved to the quote and included in the PDF. (`009ae2b`)
- **Voice Estimate** — Tap mic, dictate line items; Gemini Whisper + GPT-4o extract structured items with SKU suggestions; seller confirms before adding to cart. (`f525207`)
- **Tax-exempt default** — New quotes default to tax-exempt; seller can flip per job in Step 4. (`2be70ce`)

---

### Bug Fixes

- **Tax toggle UI** — Step 4 Review now shows a toggle switch (Tax Exempt / Taxable) instead of a raw rate input; totals sidebar shows "Exempt" in green or computed tax amount. (`4231829`)
- **PDF JPEG silent fail** — Roof visualizer image was silently dropped from PDFs when the canvas produced a JPEG data URL; format string now detected from the `data:image/` prefix. (`4231829`)
- **Lead source dropdown** — Lead source field in Step 3 new-customer form was a plain text input; replaced with a Select covering 8 canonical sources. (`4231829`)
- **Quote clone missing fields** — Cloning a quote now carries `roof_color` and `visualizer_image_url` forward. (`4231829`)
- **Accept page color swatch** — Roof color swatch on the client accept page now renders the actual color instead of a generic zinc placeholder. (`4231829`)
- **Voice recorder demo banner** — Mock-mode banner in VoiceEstimateRecorder incorrectly referenced `OPENAI_API_KEY`; corrected to `GEMINI_API_KEY`. (`4231829`)
- **VisionAnalysisShell demo banner** — Same `OPENAI_API_KEY` → `GEMINI_API_KEY` correction in the Vision mock banner. (`72e5301`)
- **Gemini model 404** — `gemini-2.0-flash` is blocked for newer API keys; all 4 AI endpoints upgraded to `gemini-2.5-flash`. (`a3415ba`, `b893241`)
- **Silent Supabase errors** — Data-load queries and fire-and-forget mutations across estimate builder, detail pages, and workflow views now surface errors to the UI instead of swallowing them silently. (`e585329`, and related silent-error commits)
- **Mobile 375px viewport** — Tables, Kanban columns, grids, Step 2 cart, and deferred audit items render correctly at 375px; all interactive buttons meet ≥44px touch targets. (`b894852`)
- **Auth hangs** — Added `.catch()` / try-catch to all unguarded `.then()` chains to prevent silent auth hangs on session edge cases. (Phase 6.5b bundle)

---

### Security & RLS

- **JWT required on all CF Pages Functions** — `_guard.ts` JWT validation added to every previously unguarded Cloudflare Pages Function endpoint. (`0c75748`)
- **authedFetch migration** — All 13 authenticated frontend `fetch()` call sites migrated to the `authedFetch` helper; Supabase JWT Bearer token now consistently attached on every `/api/` request. (Phase 6.5b)
- **RLS catch-all tighten** — Replaced permissive `USING(true)` catch-all policies on 5 tables with role-gated equivalents; stale catch-alls were silently overriding more specific policies. (Phase 6 RLS commits)
- **RLS ownership policies — Groups 1+2** — Ownership-scoped and admin-gated RLS policies applied; 4 orphan policies dropped. (Phase 6.7)
- **RLS reference tables — Group 3** — `lead_sources`, `product_categories`, and `workflow_logs` now have scoped policies; 13 tables total hardened this session. (Phase 6.7b)
- **Vision/voice endpoints guarded** — Auth enforcement and per-IP rate limits added to all vision and voice inference CF Functions. (Phase 6.6)
- **Quotes enumeration closed** — Unauthenticated callers could enumerate quote IDs; endpoint now requires auth. (Phase 6.6)
- **QuickBooks OAuth CSRF** — `state` parameter validated on QB OAuth callback; forged redirects rejected. (Phase 6 security commits)
- **QuickBooks token encryption** — QB OAuth tokens encrypted at rest with AES-GCM before writing to the database. (Phase 6 security commits)
- **Accept page idempotency + rate limit** — Race condition on post-accept automations fixed; endpoint rate-limited to prevent replay. (Phase 6 security commits)

---

### Refactor & Polish

- **VisionAnalysisShell** — Unified `DamageAnalysis` and `MaterialAnalysis` into a shared shell component, eliminating ~90% code duplication. (Phase 6.6)
- **Admin settings: OpenAI → Gemini AI Vision** — `/admin/settings/openai/` renamed to `/admin/settings/ai-vision/`; all UI copy updated to Google Gemini Vision & Voice branding; nav entry updated. (`880841c`)
- **Settings nav expansion** — Integrations sidebar now lists QuickBooks, GoHighLevel, Google Maps, Gemini AI, and Resend as discrete nav entries with an `IntegrationStatusCard` shared component. (Phase settings commits)
- **Address Intelligence UI polish** — Street View auto-fetch button and satellite map thumbnail above measurement results. (Phase address-intel commits)

---

### Free-Tier Sweep

- **Solar API hard cap** — Solar API requests capped at 100/month to stay within Google free tier; over-limit calls return a graceful error. (Phase 6.9)
- **Gemini Flash on all inference endpoints** — `material-detect`, `damage-detect`, `perimeter-detect`, and `transcribe-estimate` all run on Gemini Flash (free tier); no OpenAI spend for these paths. (Phase 6.8)

---

### Known Issues / Migration Pending

- **`quotes.name` UNIQUE constraint missing** — Estimate numbers are generated app-side (read max → increment → insert) with no DB-level uniqueness guard. Narrow race condition can produce duplicate estimate numbers under concurrent saves. **Alejandro must run before volume increases:**
  ```sql
  -- Check for existing dupes first:
  SELECT name, COUNT(*) FROM quotes GROUP BY name HAVING COUNT(*) > 1;
  -- Resolve any dupes manually, then:
  ALTER TABLE quotes ADD CONSTRAINT quotes_name_unique UNIQUE (name);
  ```
