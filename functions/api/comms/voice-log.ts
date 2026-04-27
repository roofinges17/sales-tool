// POST /api/comms/voice-log
// Receives end-of-call summary from GHL "Voice Ai End Of Call" workflow.
// Logs the call to conversations + messages tables (voice channel, inbound direction).
//
// Called by GHL workflow webhook action (no user JWT — verified by VOICE_LOG_SECRET).
// Input:  { contact_id?, phone?, duration_seconds?, summary?, recording_url? }
// Output: { ok, message_id }

import { createClient } from "@supabase/supabase-js";
import { constantTimeEqual } from "../social/_social-shared";

const CORS = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };

interface Env {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  VOICE_LOG_SECRET?: string;
}

interface VoiceLogBody {
  contact_id?: string;
  phone?: string;
  duration_seconds?: number;
  summary?: string;
  recording_url?: string;
  ghl_conversation_id?: string;
}

export async function onRequestPost(ctx: { request: Request; env: Env }) {
  const { request, env } = ctx;

  const secret = env.VOICE_LOG_SECRET;
  if (!secret) {
    return Response.json({ error: "VOICE_LOG_SECRET not configured" }, { status: 500, headers: CORS });
  }

  const authHeader = request.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : (new URL(request.url).searchParams.get("secret") ?? "");
  if (!constantTimeEqual(token, secret)) {
    return Response.json({ error: "invalid_signature" }, { status: 401, headers: CORS });
  }

  const supabaseUrl = env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return Response.json({ error: "Server misconfigured" }, { status: 500, headers: CORS });
  }

  let body: VoiceLogBody;
  try {
    body = (await request.json()) as VoiceLogBody;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400, headers: CORS });
  }

  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  let contactId = body.contact_id ?? null;

  // Resolve contact by phone if contact_id not provided
  if (!contactId && body.phone) {
    const digits = body.phone.replace(/\D/g, "");
    const normalized = digits.length === 10 ? "1" + digits : digits;
    const { data: contact } = await sb
      .from("contacts")
      .select("id")
      .eq("phone", normalized)
      .maybeSingle();
    contactId = contact?.id ?? null;
  }

  if (!contactId) {
    return Response.json({ skipped: "contact_not_found", phone: body.phone }, { headers: CORS });
  }

  const now = new Date().toISOString();
  const messageBody = [
    body.summary ? `Summary: ${body.summary}` : null,
    body.duration_seconds ? `Duration: ${Math.round(body.duration_seconds / 60)}m ${body.duration_seconds % 60}s` : null,
    body.recording_url ? `Recording: ${body.recording_url}` : null,
  ].filter(Boolean).join("\n") || "Voice call logged";

  // Upsert conversation thread
  const { data: convo } = await sb
    .from("conversations")
    .upsert(
      {
        contact_id: contactId,
        channel: "voice",
        last_message_at: now,
        ...(body.ghl_conversation_id ? { ghl_convo_id: body.ghl_conversation_id } : {}),
      },
      { onConflict: "contact_id,channel" },
    )
    .select("id")
    .single();

  if (!convo) {
    return Response.json({ error: "Failed to upsert conversation" }, { status: 500, headers: CORS });
  }

  const { data: msg } = await sb
    .from("messages")
    .insert({
      conversation_id: convo.id,
      direction: "inbound",
      body: messageBody,
      status: "received",
      sent_at: now,
    })
    .select("id")
    .single();

  return Response.json({ ok: true, message_id: msg?.id ?? null, contact_id: contactId }, { headers: CORS });
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
