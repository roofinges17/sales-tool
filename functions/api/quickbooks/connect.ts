// Stub: initiate QuickBooks OAuth flow.
// ACTION REQUIRED: create an Intuit Developer sandbox app at
// https://developer.intuit.com and set QB_CLIENT_ID + QB_REDIRECT_URI
// in Cloudflare Pages environment variables.

interface Env {
  QB_CLIENT_ID: string;
  QB_REDIRECT_URI?: string;
  FOLIO_CACHE?: KVNamespace;
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const clientId = ctx.env.QB_CLIENT_ID;
  if (!clientId) {
    return new Response(
      JSON.stringify({ error: "QB_CLIENT_ID not configured — see ACTION REQUIRED in functions/api/quickbooks/connect.ts" }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  const origin = new URL(ctx.request.url).origin;
  const redirectUri = ctx.env.QB_REDIRECT_URI ?? `${origin}/api/quickbooks/callback`;
  const state = crypto.randomUUID();

  // Persist state so callback can validate it (CSRF protection).
  // TTL 600s — OAuth round-trip should complete well within 10 minutes.
  if (ctx.env.FOLIO_CACHE) {
    await ctx.env.FOLIO_CACHE.put(`qb_state:${state}`, "1", { expirationTtl: 600 });
  }

  const authUrl = new URL("https://appcenter.intuit.com/connect/oauth2");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "com.intuit.quickbooks.accounting");
  authUrl.searchParams.set("state", state);

  return Response.redirect(authUrl.toString(), 302);
};
