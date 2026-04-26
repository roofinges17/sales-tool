// POST /api/email/send-quote-link
// Sends the customer accept link via Resend, then flips quote → SENT (if DRAFT).
// Auth: requires valid Supabase JWT in Authorization header.

import { createClient } from "@supabase/supabase-js";

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  RESEND_API_KEY: string;
  PUBLIC_BASE_URL?: string;
}

const CORS = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, PUBLIC_BASE_URL } = ctx.env;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: "Server misconfigured" }), { status: 500, headers: CORS });
  }
  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: "Email not configured — add RESEND_API_KEY to CF Pages env" }), { status: 503, headers: CORS });
  }

  // Verify Supabase JWT
  const auth = ctx.request.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: CORS });
  }
  const authRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_SERVICE_ROLE_KEY },
  });
  if (!authRes.ok) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: CORS });
  }

  let body: { quoteId?: string; recipientEmail?: string };
  try {
    body = (await ctx.request.json()) as { quoteId?: string; recipientEmail?: string };
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: CORS });
  }

  const { quoteId, recipientEmail: recipientOverride } = body;
  if (!quoteId) {
    return new Response(JSON.stringify({ error: "quoteId required" }), { status: 400, headers: CORS });
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: quoteRow, error: qErr } = await sb
    .from("quotes")
    .select("id, name, status, total, accept_token, account:account_id(id, name, email)")
    .eq("id", quoteId)
    .maybeSingle();

  if (qErr || !quoteRow) {
    return new Response(JSON.stringify({ error: "Quote not found" }), { status: 404, headers: CORS });
  }

  const q = quoteRow as {
    id: string;
    name: string;
    status: string;
    total: number | null;
    accept_token: string | null;
    account: { id: string; name: string; email: string | null } | null;
  };

  // Get or generate accept_token
  let acceptToken = q.accept_token;
  if (!acceptToken) {
    acceptToken = crypto.randomUUID();
    await sb.from("quotes").update({ accept_token: acceptToken }).eq("id", q.id);
  }

  const recipient = recipientOverride || q.account?.email || null;
  if (!recipient) {
    return new Response(
      JSON.stringify({ error: "No recipient email — add one to the customer record" }),
      { status: 400, headers: CORS },
    );
  }

  const origin = PUBLIC_BASE_URL || new URL(ctx.request.url).origin;
  const acceptUrl = `${origin}/accept/?token=${acceptToken}`;

  const estimateNumber = q.name;
  const customerName = q.account?.name ?? "Customer";
  const formattedTotal = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(q.total ?? 0);

  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#09090b;padding:40px 20px;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#18181b;border:1px solid #3f3f46;border-radius:12px;overflow:hidden;">
<tr><td style="background:#27272a;padding:32px 40px;border-bottom:1px solid #3f3f46;">
<h1 style="margin:0;font-size:20px;font-weight:700;color:#fafafa;">Roofing Experts</h1>
<p style="margin:4px 0 0;font-size:13px;color:#a1a1aa;">Your roofing estimate is ready to review</p>
</td></tr>
<tr><td style="padding:32px 40px;">
<p style="margin:0 0 8px;font-size:15px;color:#d4d4d8;">Hi ${customerName},</p>
<p style="margin:0 0 24px;font-size:15px;color:#a1a1aa;line-height:1.6;">Your estimate <strong style="color:#fafafa;">${estimateNumber}</strong> is ready for your review. Click the button below to view the details and sign electronically.</p>
<table cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
<tr><td style="background:#2563eb;border-radius:8px;">
<a href="${acceptUrl}" style="display:block;padding:14px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">Review &amp; Sign Estimate →</a>
</td></tr>
</table>
<div style="padding:20px;background:#09090b;border-radius:8px;border:1px solid #3f3f46;">
<p style="margin:0 0 4px;font-size:12px;color:#71717a;text-transform:uppercase;letter-spacing:0.05em;">Estimate Total</p>
<p style="margin:0;font-size:22px;font-weight:700;color:#fafafa;">${formattedTotal}</p>
</div>
<p style="margin:24px 0 0;font-size:12px;color:#52525b;line-height:1.6;">Or copy this link: <a href="${acceptUrl}" style="color:#60a5fa;">${acceptUrl}</a></p>
</td></tr>
<tr><td style="padding:20px 40px;border-top:1px solid #3f3f46;">
<p style="margin:0;font-size:12px;color:#52525b;">Questions? Reply to this email or contact us directly.</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const textBody = `Hi ${customerName},\n\nYour roofing estimate ${estimateNumber} (${formattedTotal}) is ready for your review.\n\nReview and sign here: ${acceptUrl}\n\nQuestions? Reply to this email.\n\nRoofing Experts`;

  const resendRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Roofing Experts <noreply@roofingex.com>",
      to: [recipient],
      reply_to: "info@roofingex.com",
      subject: `Your roofing estimate ${estimateNumber} — review & sign`,
      html,
      text: textBody,
    }),
  });

  if (!resendRes.ok) {
    const errBody = await resendRes.text();
    console.error("[send-quote-link] Resend error:", resendRes.status, errBody);
    return new Response(JSON.stringify({ ok: false, error: "Email delivery failed", detail: errBody }), { status: 502, headers: CORS });
  }

  const resendData = (await resendRes.json()) as { id?: string };
  const messageId = resendData.id ?? null;
  console.log("[send-quote-link]", { quoteId, recipient, messageId });

  // Flip to SENT if currently DRAFT; re-sends on SENT are allowed (no status change)
  if (q.status === "DRAFT") {
    await sb
      .from("quotes")
      .update({ status: "SENT", sent_at: new Date().toISOString(), accept_token: acceptToken })
      .eq("id", q.id);
  }

  return new Response(JSON.stringify({ ok: true, messageId, accept_url: acceptUrl, recipient }), { status: 200, headers: CORS });
};

export const onRequestOptions: PagesFunction<Env> = async () =>
  new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
