// POST /api/sms/send
// Send an outbound SMS via GHL Conversations API. Checks sms_opt_out before sending.
// Logs conversation + message row on success.
//
// Auth: Supabase JWT (user-facing) OR service secret header (workflow engine).
// Input:  { contact_id, body, template_slug? }
// Output: { ok, message_id, ghl_message_id }

import { createClient } from "@supabase/supabase-js";
import { guard } from "../_guard";

const CORS = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
const GHL_BASE = "https://services.leadconnectorhq.com";
const GHL_FROM = "+17867860361";
const GHL_LOC = "DfkEocSccdPsDcgqrJug";

interface Env {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  GHL_PIT?: string;
  WORKFLOW_SERVICE_SECRET?: string;
}

interface SendBody {
  contact_id: string;
  body: string;
  template_slug?: string;
}

function renderTemplate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{([^}]+)\}\}/g, (_, key) => vars[key.trim()] ?? `{{${key}}}`);
}

async function ghlPost(pit: string, path: string, body: unknown): Promise<Response> {
  return fetch(`${GHL_BASE}/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${pit}`,
      Version: "2021-04-15",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

export async function onRequestPost(ctx: { request: Request; env: Env }) {
  const { request, env } = ctx;

  const authHeader = request.headers.get("Authorization") ?? "";
  const serviceSecret = env.WORKFLOW_SERVICE_SECRET ?? env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const isServiceCall = authHeader.startsWith("Bearer ") && authHeader.slice(7) === serviceSecret;

  if (!isServiceCall) {
    const { error: guardErr } = await guard(request, env, { maxBodyBytes: 4096, ratePrefix: "sms-send", rateLimit: 20 });
    if (guardErr) return guardErr;
  }

  if (!env.GHL_PIT) {
    return Response.json({ error: "GHL_PIT not configured" }, { status: 503, headers: CORS });
  }

  const supabaseUrl = env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return Response.json({ error: "Server misconfigured" }, { status: 500, headers: CORS });
  }

  let body: SendBody;
  try {
    body = (await request.json()) as SendBody;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400, headers: CORS });
  }

  if (!body.contact_id || !body.body?.trim()) {
    return Response.json({ error: "contact_id and body are required" }, { status: 400, headers: CORS });
  }

  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { data: contact } = await sb
    .from("contacts")
    .select("id, phone, first_name, last_name, preferred_language, sms_opt_out, ghl_contact_id")
    .eq("id", body.contact_id)
    .single();

  if (!contact) return Response.json({ error: "Contact not found" }, { status: 404, headers: CORS });
  if (contact.sms_opt_out) return Response.json({ error: "Contact has opted out of SMS" }, { status: 400, headers: CORS });
  if (!contact.phone) return Response.json({ error: "Contact has no phone number" }, { status: 400, headers: CORS });

  let messageText = body.body;

  if (body.template_slug) {
    const lang = (contact.preferred_language as "en" | "es") ?? "es";
    const { data: tpl } = await sb
      .from("message_templates")
      .select("body")
      .eq("slug", body.template_slug)
      .eq("channel", "sms")
      .eq("lang", lang)
      .maybeSingle();

    if (tpl) {
      messageText = renderTemplate(tpl.body, {
        "contact.first_name": contact.first_name ?? "",
        "contact.last_name": contact.last_name ?? "",
      });
    }
  }

  // Ensure GHL contact exists — create if missing
  let ghlContactId = contact.ghl_contact_id as string | null;
  if (!ghlContactId) {
    const digits = contact.phone.replace(/\D/g, "");
    const e164 = digits.length === 10 ? `+1${digits}` : `+${digits}`;
    const createRes = await ghlPost(env.GHL_PIT, "contacts/", {
      locationId: GHL_LOC,
      firstName: contact.first_name ?? "",
      lastName: contact.last_name ?? "",
      phone: e164,
    });
    if (createRes.ok) {
      const created = await createRes.json() as { contact?: { id?: string } };
      ghlContactId = created.contact?.id ?? null;
      if (ghlContactId) {
        await sb.from("contacts").update({ ghl_contact_id: ghlContactId }).eq("id", body.contact_id);
      }
    }
  }

  if (!ghlContactId) {
    return Response.json({ error: "Could not resolve GHL contact" }, { status: 502, headers: CORS });
  }

  const ghlRes = await ghlPost(env.GHL_PIT, "conversations/messages", {
    type: "SMS",
    contactId: ghlContactId,
    message: messageText,
    fromNumber: GHL_FROM,
  });

  const ghlData = await ghlRes.json() as {
    conversationId?: string;
    messageIds?: string[];
    message?: { id?: string };
    msg?: string;
  };

  if (!ghlRes.ok) {
    return Response.json({ error: ghlData.msg ?? "GHL send failed" }, { status: 502, headers: CORS });
  }

  const ghlMessageId = ghlData.messageIds?.[0] ?? ghlData.message?.id ?? null;
  const ghlConversationId = ghlData.conversationId ?? null;
  const now = new Date().toISOString();

  const { data: convo } = await sb
    .from("conversations")
    .upsert(
      {
        contact_id: body.contact_id,
        channel: "sms",
        last_message_at: now,
        status: "open",
        ...(ghlConversationId ? { ghl_conversation_id: ghlConversationId } : {}),
      },
      { onConflict: "contact_id,channel" }
    )
    .select("id")
    .single();

  let messageId: string | null = null;
  if (convo) {
    const { data: msg } = await sb
      .from("messages")
      .insert({
        conversation_id: convo.id,
        direction: "outbound",
        body: messageText,
        status: "sent",
        twilio_sid: ghlMessageId,
        sent_at: now,
      })
      .select("id")
      .single();
    messageId = msg?.id ?? null;
  }

  return Response.json({ ok: true, message_id: messageId, ghl_message_id: ghlMessageId }, { headers: CORS });
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
