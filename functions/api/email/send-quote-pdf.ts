// POST /api/email/send-quote-pdf
// Emails the estimate PDF (base64) as an attachment via Resend.
// Auth: requires valid Supabase JWT in Authorization header.
// Does NOT flip quote status — this is review-only, not acceptance.

import { createClient } from "@supabase/supabase-js";

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  RESEND_API_KEY: string;
}

const CORS = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
const MAX_PDF_B64_LEN = 5 * 1024 * 1024 * 1.4; // 5 MB raw → ~7 MB base64

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY } = ctx.env;

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

  let body: { quoteId?: string; recipientEmail?: string; pdfBase64?: string };
  try {
    body = (await ctx.request.json()) as { quoteId?: string; recipientEmail?: string; pdfBase64?: string };
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: CORS });
  }

  const { quoteId, recipientEmail: recipientOverride, pdfBase64 } = body;
  if (!quoteId || !pdfBase64) {
    return new Response(JSON.stringify({ error: "quoteId and pdfBase64 required" }), { status: 400, headers: CORS });
  }
  if (pdfBase64.length > MAX_PDF_B64_LEN) {
    return new Response(JSON.stringify({ error: "PDF too large (max 5 MB)" }), { status: 413, headers: CORS });
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: quoteRow, error: qErr } = await sb
    .from("quotes")
    .select("id, name, total, account:account_id(id, name, email)")
    .eq("id", quoteId)
    .maybeSingle();

  if (qErr || !quoteRow) {
    return new Response(JSON.stringify({ error: "Quote not found" }), { status: 404, headers: CORS });
  }

  const q = quoteRow as {
    id: string;
    name: string;
    total: number | null;
    account: { id: string; name: string; email: string | null } | null;
  };

  const recipient = recipientOverride || q.account?.email || null;
  if (!recipient) {
    return new Response(
      JSON.stringify({ error: "No recipient email — add one to the customer record" }),
      { status: 400, headers: CORS },
    );
  }

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
<p style="margin:4px 0 0;font-size:13px;color:#a1a1aa;">Your estimate PDF is attached</p>
</td></tr>
<tr><td style="padding:32px 40px;">
<p style="margin:0 0 8px;font-size:15px;color:#d4d4d8;">Hi ${customerName},</p>
<p style="margin:0 0 24px;font-size:15px;color:#a1a1aa;line-height:1.6;">Please find your roofing estimate <strong style="color:#fafafa;">${estimateNumber}</strong> attached to this email.</p>
<div style="padding:20px;background:#09090b;border-radius:8px;border:1px solid #3f3f46;margin-bottom:24px;">
<p style="margin:0 0 4px;font-size:12px;color:#71717a;text-transform:uppercase;letter-spacing:0.05em;">Estimate Total</p>
<p style="margin:0;font-size:22px;font-weight:700;color:#fafafa;">${formattedTotal}</p>
</div>
<p style="margin:0;font-size:15px;color:#a1a1aa;line-height:1.6;">Review the attached PDF and reply with any questions. We&apos;re happy to walk you through the details.</p>
</td></tr>
<tr><td style="padding:20px 40px;border-top:1px solid #3f3f46;">
<p style="margin:0;font-size:12px;color:#52525b;">Questions? Reply to this email or contact us directly.</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const textBody = `Hi ${customerName},\n\nYour roofing estimate ${estimateNumber} (${formattedTotal}) is attached to this email.\n\nReview the PDF and reply with any questions.\n\nRoofing Experts`;

  const resendRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Roofing Experts <noreply@roofingex.com>",
      to: [recipient],
      reply_to: "info@roofingex.com",
      subject: `Your roofing estimate ${estimateNumber} — PDF attached`,
      html,
      text: textBody,
      attachments: [{ filename: `Estimate-${estimateNumber}.pdf`, content: pdfBase64 }],
    }),
  });

  if (!resendRes.ok) {
    const errBody = await resendRes.text();
    console.error("[send-quote-pdf] Resend error:", resendRes.status, errBody);
    return new Response(JSON.stringify({ ok: false, error: "Email delivery failed", detail: errBody }), { status: 502, headers: CORS });
  }

  const resendData = (await resendRes.json()) as { id?: string };
  const messageId = resendData.id ?? null;
  console.log("[send-quote-pdf]", { quoteId, recipient, messageId });

  return new Response(JSON.stringify({ ok: true, messageId, recipient }), { status: 200, headers: CORS });
};

export const onRequestOptions: PagesFunction<Env> = async () =>
  new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
