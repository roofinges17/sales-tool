// GET /api/comms/conversations?contact_id=<uuid>[&channel=sms|email|voice]
// Returns 3-channel merged conversation threads for a contact.
// Each channel returns the thread + last 50 messages.
//
// Output: { conversations: [{ channel, last_message_at, messages: [...] }] }

import { createClient } from "@supabase/supabase-js";
import { guard } from "../_guard";

const CORS = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };

interface Env {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

export async function onRequestGet(ctx: { request: Request; env: Env }) {
  const { request, env } = ctx;

  const { error: guardErr } = await guard(request, env, {
    maxBodyBytes: 0,
    ratePrefix: "comms-conversations",
    rateLimit: 0,
  });
  if (guardErr) return guardErr;

  const supabaseUrl = env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return Response.json({ error: "Server misconfigured" }, { status: 500, headers: CORS });
  }

  const url = new URL(request.url);
  const contactId = url.searchParams.get("contact_id");
  const channelFilter = url.searchParams.get("channel"); // optional

  if (!contactId) {
    return Response.json({ error: "contact_id is required" }, { status: 400, headers: CORS });
  }

  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  let query = sb
    .from("conversations")
    .select(`
      id,
      channel,
      last_message_at,
      messages (
        id,
        direction,
        body,
        subject,
        status,
        twilio_sid,
        resend_id,
        sent_at,
        sent_by_id,
        workflow_step_id
      )
    `)
    .eq("contact_id", contactId)
    .order("last_message_at", { ascending: false });

  if (channelFilter) {
    query = query.eq("channel", channelFilter);
  }

  const { data, error } = await query;

  if (error) {
    return Response.json({ error: error.message }, { status: 500, headers: CORS });
  }

  // Sort messages within each thread newest-first, cap at 50
  const conversations = (data ?? []).map((convo) => ({
    ...convo,
    messages: ((convo.messages as unknown[]) ?? [])
      .sort((a: unknown, b: unknown) => {
        const ta = (a as { sent_at: string }).sent_at;
        const tb = (b as { sent_at: string }).sent_at;
        return new Date(tb).getTime() - new Date(ta).getTime();
      })
      .slice(0, 50),
  }));

  return Response.json({ conversations }, { headers: CORS });
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
