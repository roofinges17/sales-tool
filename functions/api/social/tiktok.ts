// POST /api/social/tiktok
// TikTok Lead Ads webhook handler.
//
// Signature: HMAC-SHA256 of "{timestamp}\n{nonce}\n{body}" keyed with TIKTOK_WEBHOOK_SECRET.
// Result is base64-encoded and sent in X-Tt-Webhook-Signature-Hmac-Sha256.
// TikTok delivers full lead fields inline — no second API call required.
//
// Payload: { event: "LeadFormSubmit", data: { lead_id, form_id, advertiser_id, fields: [{name, value}] } }

import { CORS, normalizePhone, processSocialLead } from "./_social-shared";

interface Env {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  TIKTOK_WEBHOOK_SECRET?: string;
  GHL_PIT?: string;
}

interface TikTokField {
  name: string;
  value: string;
}

interface TikTokLeadData {
  lead_id: string;
  form_id?: string;
  advertiser_id?: string;
  fields?: TikTokField[];
}

interface TikTokPayload {
  event?: string;
  data?: TikTokLeadData;
}

async function verifyTikTokSignature(
  secret: string,
  rawBody: string,
  timestamp: string,
  nonce: string,
  signature: string,
): Promise<boolean> {
  const message = `${timestamp}\n${nonce}\n${rawBody}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  const computed = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return computed === signature;
}

export async function onRequestPost(ctx: { request: Request; env: Env }) {
  const { request, env } = ctx;

  const secret = env.TIKTOK_WEBHOOK_SECRET;
  if (!secret) {
    return Response.json({ error: "TIKTOK_WEBHOOK_SECRET not configured" }, { status: 500, headers: CORS });
  }

  const rawBody = await request.text();
  const timestamp = request.headers.get("x-tt-webhook-timestamp") ?? "";
  const nonce = request.headers.get("x-tt-webhook-nonce") ?? "";
  const signature = request.headers.get("x-tt-webhook-signature-hmac-sha256") ?? "";

  if (!signature || !(await verifyTikTokSignature(secret, rawBody, timestamp, nonce, signature))) {
    return Response.json({ error: "invalid_signature" }, { status: 401, headers: CORS });
  }

  let payload: TikTokPayload;
  try {
    payload = JSON.parse(rawBody) as TikTokPayload;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400, headers: CORS });
  }

  if (payload.event !== "LeadFormSubmit") {
    return Response.json({ skipped: `unsupported_event:${payload.event}` }, { headers: CORS });
  }

  const data = payload.data;
  if (!data?.lead_id) {
    return Response.json({ skipped: "missing_lead_id" }, { headers: CORS });
  }

  const fields = data.fields ?? [];
  const get = (names: string[]): string | null => {
    for (const name of names) {
      const f = fields.find((f) => f.name.toUpperCase() === name.toUpperCase());
      if (f?.value) return f.value;
    }
    return null;
  };

  const fullName = get(["FULL_NAME"]);
  let firstName: string | null = null;
  let lastName: string | null = null;
  if (fullName) {
    const parts = fullName.trim().split(/\s+/);
    firstName = parts[0] ?? null;
    lastName = parts.length > 1 ? parts.slice(1).join(" ") : null;
  } else {
    firstName = get(["FIRST_NAME"]);
    lastName = get(["LAST_NAME"]);
  }

  const result = await processSocialLead(env, {
    platform: "tiktok",
    platformLeadId: data.lead_id,
    firstName,
    lastName,
    phone: normalizePhone(get(["PHONE_NUMBER", "PHONE"])),
    email: get(["EMAIL"]),
    isPending: false,
    rawPayload: payload as unknown as Record<string, unknown>,
  });

  return result;
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      ...CORS,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Tt-Webhook-Timestamp, X-Tt-Webhook-Nonce, X-Tt-Webhook-Signature-Hmac-Sha256",
    },
  });
}
