// GET /api/setup/register-project-pipeline-webhook
// Returns manual registration steps for the GHL Project Pipeline webhook.
// PIT tokens cannot auto-register webhooks — manual UI step required.

interface Env {
  GHL_WEBHOOK_SECRET?: string;
}

const CORS = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };

export async function onRequestGet(ctx: { request: Request; env: Env }) {
  const host = new URL(ctx.request.url).origin;
  const webhookUrl = `${host}/api/ghl/project-pipeline-webhook`;

  return Response.json({
    ok: true,
    webhook_url: webhookUrl,
    secret_env_var: "GHL_WEBHOOK_SECRET",
    secret_configured: !!ctx.env.GHL_WEBHOOK_SECRET,
    manual_steps: [
      "1. Log in to GHL → Services Inc sub-account",
      "2. Go to Settings → Integrations → Webhooks",
      "3. Click 'Add New Webhook'",
      "4. Set URL: " + webhookUrl,
      "5. Select event: OpportunityStageUpdate",
      "6. Under 'Custom Headers', add: x-wh-secret = <value of GHL_WEBHOOK_SECRET env var>",
      "7. Save. GHL will ping the URL to verify.",
      "8. Copy the GHL Project Pipeline stage IDs from Settings → Pipelines → Project Pipeline",
      "9. Update STANDARD_STAGE_MAP and REROOFING_STAGE_MAP in functions/api/ghl/project-pipeline-webhook.ts",
      "10. Redeploy.",
    ],
    notes: [
      "GHL_WEBHOOK_SECRET must match the x-wh-secret header value configured in GHL UI.",
      "Stage IDs in the mapping consts are placeholders — replace with real GHL stage UUIDs.",
      "Outbound sync (stage advance → GHL) is also a no-op until stage IDs are populated.",
    ],
  }, { headers: CORS });
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      ...CORS,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
