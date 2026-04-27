// POST /api/sms/inbound
// GHL InboundMessage webhook — receives SMS from contacts, logs to DB.
// Handles STOP/HELP opt-out keywords before any DB write.
//
// Auth: GHL_WEBHOOK_SECRET (x-wh-signature HMAC-SHA256, x-wh-secret header, or ?secret= query param).

import { createClient } from "@supabase/supabase-js";

const CORS = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };

interface Env {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  GHL_WEBHOOK_SECRET?: string;
}

interface GhlInboundPayload {
  type?: string;
  locationId?: string;
  contactId?: string;
  conversationId?: string;
  messageType?: string;
  body?: string;
  id?: string;
  phone?: string;
  from?: string;
  attachments?: Array<{ url?: string }>;
  dateAdded?: string;
}

const STOP_KEYWORDS = ["stop", "unsubscribe", "cancel", "quit", "end"];
const HELP_KEYWORDS = ["help", "info"];

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

  let payload: GhlInboundPayload;
  try {
    payload = JSON.parse(rawBody) as GhlInboundPayload;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400, headers: CORS });
  }

  if (payload.type !== "InboundMessage" || payload.messageType !== "SMS") {
    return Response.json({ ok: true, skipped: "not_sms_inbound" }, { headers: CORS });
  }

  const ghlContactId = payload.contactId ?? null;
  const ghlConversationId = payload.conversationId ?? null;
  const messageBody = payload.body ?? "";
  const ghlMessageId = payload.id ?? null;
  const fromPhone = payload.phone ?? payload.from ?? null;
  const mediaUrls = (payload.attachments ?? []).map((a) => a.url).filter((u): u is string => Boolean(u));

  const keyword = messageBody.trim().toLowerCase();
  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // Look up contact by GHL ID first, then by phone
  let contact: { id: string; sms_opt_out: boolean } | null = null;

  if (ghlContactId) {
    const { data } = await sb
      .from("contacts")
      .select("id, sms_opt_out")
      .eq("ghl_contact_id", ghlContactId)
      .maybeSingle();
    contact = data;
  }

  if (!contact && fromPhone) {
    const digits = fromPhone.replace(/\D/g, "");
    const normalized = digits.length === 11 && digits.startsWith("1") ? digits : digits.length === 10 ? "1" + digits : digits;
    const { data } = await sb
      .from("contacts")
      .select("id, sms_opt_out")
      .eq("phone", normalized)
      .maybeSingle();
    contact = data;
  }

  // STOP opt-out — must handle before any other write
  if (STOP_KEYWORDS.includes(keyword)) {
    if (contact) {
      await sb.from("contacts").update({ sms_opt_out: true }).eq("id", contact.id);
    } else if (fromPhone) {
      const digits = fromPhone.replace(/\D/g, "");
      const normalized = digits.length === 11 && digits.startsWith("1") ? digits : digits.length === 10 ? "1" + digits : digits;
      await sb.from("contacts").update({ sms_opt_out: true }).eq("phone", normalized);
    }
    return Response.json({ ok: true, action: "opted_out" }, { headers: CORS });
  }

  if (HELP_KEYWORDS.includes(keyword)) {
    return Response.json({ ok: true, action: "help_acknowledged" }, { headers: CORS });
  }

  if (!contact || contact.sms_opt_out) {
    return Response.json({ ok: true, skipped: "no_contact_or_opted_out" }, { headers: CORS });
  }

  const now = new Date().toISOString();

  const { data: convo } = await sb
    .from("conversations")
    .upsert(
      {
        contact_id: contact.id,
        channel: "sms",
        last_message_at: now,
        status: "open",
        ...(ghlConversationId ? { ghl_conversation_id: ghlConversationId } : {}),
      },
      { onConflict: "contact_id,channel" }
    )
    .select("id")
    .single();

  if (convo) {
    await sb.from("messages").insert({
      conversation_id: convo.id,
      direction: "inbound",
      body: messageBody || null,
      status: "received",
      twilio_sid: ghlMessageId,
      media_urls: mediaUrls.length > 0 ? mediaUrls : null,
      sent_at: payload.dateAdded ?? now,
    });
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
