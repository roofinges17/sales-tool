// POST /api/sms/status
// GHL OutboundMessage status webhook — updates messages.status as delivery progresses.
//
// Auth: GHL_WEBHOOK_SECRET (x-wh-signature HMAC-SHA256, x-wh-secret header, or ?secret= query param).

import { createClient } from "@supabase/supabase-js";

const CORS = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };

interface Env {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  GHL_WEBHOOK_SECRET?: string;
}

interface GhlOutboundPayload {
  type?: string;
  locationId?: string;
  contactId?: string;
  conversationId?: string;
  messageType?: string;
  status?: string;
  id?: string;
}

const STATUS_MAP: Record<string, string> = {
  sent: "sent",
  delivered: "delivered",
  failed: "failed",
  undelivered: "failed",
  pending: "queued",
  scheduled: "queued",
};

async function verifySignature(secret: string, rawBody: string, sigHeader: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const computed = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const normalized = sigHeader.toLowerCase().replace(/^sha256=/, "");
  if (computed.length !== normalized.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) diff |= computed.charCodeAt(i) ^ normalized.charCodeAt(i);
  return diff === 0;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function onRequestPost(ctx: { request: Request; env: Env }) {
  const { request, env } = ctx;

  const webhookSecret = env.GHL_WEBHOOK_SECRET;
  const supabaseUrl = env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!webhookSecret || !supabaseUrl || !serviceKey) {
    return Response.json({ error: "Server misconfigured" }, { status: 500, headers: CORS });
  }

  const rawBody = await request.text();

  const sigHeader = request.headers.get("x-wh-signature") ?? request.headers.get("x-signature");
  const staticSecretHeader = request.headers.get("x-wh-secret");
  const querySecret = new URL(request.url).searchParams.get("secret");

  let authorized = false;
  if (sigHeader) {
    authorized = await verifySignature(webhookSecret, rawBody, sigHeader);
  } else if (staticSecretHeader) {
    authorized = constantTimeEqual(staticSecretHeader, webhookSecret);
  } else if (querySecret) {
    authorized = constantTimeEqual(querySecret, webhookSecret);
  }

  if (!authorized) {
    return Response.json({ error: "invalid_signature" }, { status: 401, headers: CORS });
  }

  let payload: GhlOutboundPayload;
  try {
    payload = JSON.parse(rawBody) as GhlOutboundPayload;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400, headers: CORS });
  }

  if (payload.type !== "OutboundMessage" || payload.messageType !== "SMS") {
    return Response.json({ ok: true, skipped: "not_sms_outbound" }, { headers: CORS });
  }

  const messageId = payload.id ?? null;
  const rawStatus = payload.status?.toLowerCase() ?? "";

  if (!messageId || !rawStatus) {
    return Response.json({ error: "Missing id or status" }, { status: 400, headers: CORS });
  }

  const mappedStatus = STATUS_MAP[rawStatus] ?? "queued";

  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { error } = await sb
    .from("messages")
    .update({ status: mappedStatus })
    .eq("twilio_sid", messageId);

  if (error) {
    return Response.json({ error: error.message }, { status: 500, headers: CORS });
  }

  return Response.json({ ok: true }, { headers: CORS });
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      ...CORS,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
