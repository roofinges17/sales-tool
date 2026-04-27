// POST /api/setup/social-webhooks
// Setup helper: returns webhook URLs + configuration instructions for all 4 social channels.
// Requires manager+ role (uses _guard auth).
//
// Output: { channels: [{ platform, webhook_url, auth_method, setup_steps, secret_configured }] }

import { guard } from "../_guard";

interface Env {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  META_APP_SECRET?: string;
  META_PAGE_ACCESS_TOKEN?: string;
  META_VERIFY_TOKEN?: string;
  TIKTOK_WEBHOOK_SECRET?: string;
  GOOGLE_ADS_WEBHOOK_SECRET?: string;
}

export async function onRequestPost(ctx: { request: Request; env: Env }) {
  const { request, env } = ctx;

  const { error: guardErr } = await guard(request, env, {
    maxBodyBytes: 0,
    ratePrefix: "setup-social-webhooks",
    rateLimit: 0,
  });
  if (guardErr) return guardErr;

  const origin = new URL(request.url).origin;

  const channels = [
    {
      platform: "facebook",
      webhook_url: `${origin}/api/social/facebook`,
      verify_url: `${origin}/api/social/facebook`,
      auth_method: "X-Hub-Signature-256 HMAC-SHA256 (Meta App Secret)",
      secret_configured: Boolean(env.META_APP_SECRET),
      page_token_configured: Boolean(env.META_PAGE_ACCESS_TOKEN),
      verify_token_configured: Boolean(env.META_VERIFY_TOKEN),
      pending_fetch_mode: !env.META_PAGE_ACCESS_TOKEN,
      setup_steps: [
        "1. Go to developers.facebook.com → Your App → Webhooks",
        "2. Add product: Webhooks → Subscribe to 'page' object",
        "3. Callback URL: " + `${origin}/api/social/facebook`,
        "4. Verify Token: value of META_VERIFY_TOKEN env var (or META_APP_SECRET as fallback)",
        "5. Subscribe to field: leadgen",
        "6. Add META_APP_SECRET to CF Pages env (from App → Settings → Basic → App Secret)",
        "7. Add META_PAGE_ACCESS_TOKEN to CF Pages env (long-lived page token from Meta Business)",
        "8. Subscribe your Facebook Page to the app's webhook",
      ],
    },
    {
      platform: "instagram",
      webhook_url: `${origin}/api/social/instagram`,
      verify_url: `${origin}/api/social/instagram`,
      auth_method: "X-Hub-Signature-256 HMAC-SHA256 (shared META_APP_SECRET)",
      secret_configured: Boolean(env.META_APP_SECRET),
      page_token_configured: Boolean(env.META_PAGE_ACCESS_TOKEN),
      verify_token_configured: Boolean(env.META_VERIFY_TOKEN),
      pending_fetch_mode: !env.META_PAGE_ACCESS_TOKEN,
      setup_steps: [
        "1. Same Meta app as Facebook — add 'instagram' object subscription",
        "2. Callback URL: " + `${origin}/api/social/instagram`,
        "3. Verify Token: same META_VERIFY_TOKEN as Facebook",
        "4. Subscribe to field: leadgen",
        "5. META_APP_SECRET is shared with Facebook — no additional env var needed",
        "6. Connect Instagram Business Account to the Meta app",
      ],
    },
    {
      platform: "tiktok",
      webhook_url: `${origin}/api/social/tiktok`,
      auth_method: "X-Tt-Webhook-Signature-Hmac-Sha256 (HMAC-SHA256 of timestamp+nonce+body)",
      secret_configured: Boolean(env.TIKTOK_WEBHOOK_SECRET),
      setup_steps: [
        "1. Go to TikTok Business Center → Lead Generation → Webhook Settings",
        "2. Add webhook URL: " + `${origin}/api/social/tiktok`,
        "3. Select event: Lead Form Submit",
        "4. Copy the generated Webhook Secret",
        "5. Add TIKTOK_WEBHOOK_SECRET to CF Pages env",
        "6. TikTok delivers full lead fields inline — no additional token needed",
      ],
    },
    {
      platform: "google_ads",
      webhook_url: `${origin}/api/social/google-ads`,
      auth_method: "?google_key=<secret> query param OR X-Goog-Signature header",
      secret_configured: Boolean(env.GOOGLE_ADS_WEBHOOK_SECRET),
      setup_steps: [
        "1. Go to Google Ads → Assets → Lead Form Assets",
        "2. In the lead form, click 'Webhook integration'",
        "3. Webhook URL: " + `${origin}/api/social/google-ads?google_key=<GOOGLE_ADS_WEBHOOK_SECRET>`,
        "4. Generate a strong random secret and set it as GOOGLE_ADS_WEBHOOK_SECRET in CF Pages env",
        "5. Replace <GOOGLE_ADS_WEBHOOK_SECRET> in the URL with that secret value",
        "6. Google delivers full lead fields inline — no additional token needed",
        "7. Send a test submission from Google Ads UI to verify",
      ],
    },
  ];

  const allConfigured = channels.every((c) => c.secret_configured);

  return Response.json({
    ok: true,
    all_secrets_configured: allConfigured,
    channels,
    migration_required: "supabase/migrations/20260427_phase_a2_social_lead_intake.sql",
    round_robin_pool: "profiles WHERE role=seller AND status=active",
    entry_stage: "Contact Created (index 0)",
    ghl_push: "enabled (bridge period — service role pushes to GHL via ghl-proxy)",
  });
}
