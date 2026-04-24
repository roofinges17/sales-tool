// Stub: QuickBooks OAuth callback — exchanges code for tokens and stores them.
// ACTION REQUIRED: set QB_CLIENT_ID, QB_CLIENT_SECRET, QB_REDIRECT_URI in
// Cloudflare Pages environment variables before going live.

import { createClient } from "@supabase/supabase-js";

interface Env {
  QB_CLIENT_ID: string;
  QB_CLIENT_SECRET: string;
  QB_REDIRECT_URI?: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const code = url.searchParams.get("code");
  const realmId = url.searchParams.get("realmId");
  const error = url.searchParams.get("error");

  const origin = url.origin;
  const settingsUrl = `${origin}/admin/settings/quickbooks/`;

  if (error || !code || !realmId) {
    return Response.redirect(`${settingsUrl}?qb_error=${encodeURIComponent(error ?? "missing_params")}`, 302);
  }

  try {
    const redirectUri = ctx.env.QB_REDIRECT_URI ?? `${origin}/api/quickbooks/callback`;

    // Exchange authorization code for tokens
    const tokenRes = await fetch("https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${btoa(`${ctx.env.QB_CLIENT_ID}:${ctx.env.QB_CLIENT_SECRET}`)}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      return Response.redirect(`${settingsUrl}?qb_error=token_exchange_failed`, 302);
    }

    const tokens = (await tokenRes.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    const supabase = createClient(ctx.env.SUPABASE_URL, ctx.env.SUPABASE_SERVICE_ROLE_KEY);
    await supabase.from("company_settings").update({
      qb_realm_id: realmId,
      qb_access_token: tokens.access_token,
      qb_refresh_token: tokens.refresh_token,
      qb_token_expires_at: expiresAt,
    }).limit(1);

    return Response.redirect(`${settingsUrl}?qb_connected=1`, 302);
  } catch {
    return Response.redirect(`${settingsUrl}?qb_error=server_error`, 302);
  }
};
