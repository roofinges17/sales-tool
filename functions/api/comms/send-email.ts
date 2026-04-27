// POST /api/comms/send-email
// Generalized outbound email via Resend.
// Selects bilingual template by contact.preferred_language, renders vars, sends.
//
// Input:  { contact_id, template_slug, vars?, subject_override?, html_override? }
// Output: { ok, message_id, resend_id }
//
// Domain noreply@roofingex.com is verified in Resend.
// Existing quote senders (email/send-quote-link.ts, email/send-quote-pdf.ts) remain unchanged.

import { createClient } from "@supabase/supabase-js";
import { guard } from "../_guard";

const CORS = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
const FROM = "Roofing Experts <noreply@roofingex.com>";

interface Env {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  RESEND_API_KEY?: string;
}

interface RequestBody {
  contact_id: string;
  template_slug?: string;
  vars?: Record<string, string>;
  subject_override?: string;
  html_override?: string;
  plain_text?: string;
}

function renderTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{([^}]+)\}\}/g, (_, key) => vars[key.trim()] ?? `{{${key}}}`);
}

export async function onRequestPost(ctx: { request: Request; env: Env }) {
  const { request, env } = ctx;

  const { error: guardErr } = await guard(request, env, {
    maxBodyBytes: 0,
    ratePrefix: "comms-send-email",
    rateLimit: 0,
  });
  if (guardErr) return guardErr;

  const resendKey = env.RESEND_API_KEY;
  if (!resendKey) {
    return Response.json({ error: "RESEND_API_KEY not configured" }, { status: 500, headers: CORS });
  }

  const supabaseUrl = env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return Response.json({ error: "Server misconfigured" }, { status: 500, headers: CORS });
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400, headers: CORS });
  }

  if (!body.contact_id) {
    return Response.json({ error: "contact_id is required" }, { status: 400, headers: CORS });
  }
  if (!body.template_slug && (!body.subject_override || !body.html_override)) {
    return Response.json(
      { error: "template_slug or (subject_override + html_override) is required" },
      { status: 400, headers: CORS },
    );
  }

  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // Fetch contact (email + language)
  const { data: contact, error: contactErr } = await sb
    .from("contacts")
    .select("id, first_name, last_name, email, preferred_language")
    .eq("id", body.contact_id)
    .single();

  if (contactErr || !contact) {
    return Response.json({ error: "Contact not found" }, { status: 404, headers: CORS });
  }
  if (!contact.email) {
    return Response.json({ error: "Contact has no email address" }, { status: 422, headers: CORS });
  }

  const lang = (contact.preferred_language as "en" | "es") ?? "es";

  let subject: string;
  let htmlBody: string;

  if (body.template_slug) {
    const { data: template } = await sb
      .from("message_templates")
      .select("subject, body")
      .eq("slug", body.template_slug)
      .eq("channel", "email")
      .eq("lang", lang)
      .maybeSingle();

    // Fallback to 'es' if preferred lang template missing
    const { data: fallback } = !template
      ? await sb
          .from("message_templates")
          .select("subject, body")
          .eq("slug", body.template_slug)
          .eq("channel", "email")
          .eq("lang", "es")
          .maybeSingle()
      : { data: null };

    const tpl = template ?? fallback;
    if (!tpl) {
      return Response.json(
        { error: `Template not found: ${body.template_slug} (email, ${lang})` },
        { status: 404, headers: CORS },
      );
    }

    const vars: Record<string, string> = {
      "contact.first_name": contact.first_name ?? "",
      "contact.last_name": contact.last_name ?? "",
      "contact.email": contact.email,
      ...(body.vars ?? {}),
    };

    subject = tpl.subject ? renderTemplate(tpl.subject, vars) : (body.subject_override ?? "(no subject)");
    htmlBody = `<p>${renderTemplate(tpl.body, vars).replace(/\n/g, "</p><p>")}</p>`;
  } else {
    subject = body.subject_override!;
    htmlBody = body.html_override!;
  }

  // Send via Resend
  const resendRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM,
      to: [contact.email],
      subject,
      html: htmlBody,
      ...(body.plain_text ? { text: body.plain_text } : {}),
    }),
  });

  if (!resendRes.ok) {
    const errText = await resendRes.text();
    return Response.json(
      { error: `Resend API error (${resendRes.status})`, detail: errText.slice(0, 200) },
      { status: 502, headers: CORS },
    );
  }

  const resendData = (await resendRes.json()) as { id?: string };
  const resendId = resendData.id ?? null;
  const now = new Date().toISOString();

  // Upsert conversation thread
  const { data: convo } = await sb
    .from("conversations")
    .upsert(
      { contact_id: body.contact_id, channel: "email", last_message_at: now },
      { onConflict: "contact_id,channel" },
    )
    .select("id")
    .single();

  let messageDbId: string | null = null;
  if (convo) {
    const { data: msg } = await sb
      .from("messages")
      .insert({
        conversation_id: convo.id,
        direction: "outbound",
        subject,
        body: htmlBody,
        status: "sent",
        resend_id: resendId,
        sent_at: now,
      })
      .select("id")
      .single();
    messageDbId = msg?.id ?? null;
  }

  return Response.json(
    { ok: true, message_id: messageDbId, resend_id: resendId },
    { headers: CORS },
  );
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
