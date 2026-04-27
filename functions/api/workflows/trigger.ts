// POST /api/workflows/trigger
// Fire a workflow for a contact (service-role only — called by social handlers, GHL webhook, etc.)
// Does NOT require user JWT — verified by service secret header.
//
// Input:  { workflow_name?, trigger_type, contact_id, opportunity_id?, vars? }
// Output: { ok, run_id, steps_queued }
//
// Only sends email steps in M1 (Twilio SID pending). SMS steps are enqueued
// but marked 'queued' until send-sms.ts is activated.

import { createClient } from "@supabase/supabase-js";

const CORS = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };

interface Env {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  RESEND_API_KEY?: string;
  WORKFLOW_SERVICE_SECRET?: string;    // static secret for service-to-service calls
}

interface TriggerBody {
  trigger_type: string;
  trigger_meta?: Record<string, unknown>;
  contact_id: string;
  opportunity_id?: string;
  vars?: Record<string, string>;
}

function renderTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{([^}]+)\}\}/g, (_, key) => vars[key.trim()] ?? `{{${key}}}`);
}

export async function onRequestPost(ctx: { request: Request; env: Env }) {
  const { request, env } = ctx;

  // Service-to-service auth — service secret OR Supabase service role key in header
  const authHeader = request.headers.get("Authorization") ?? "";
  const serviceSecret = env.WORKFLOW_SERVICE_SECRET ?? env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
  if (!token || token !== serviceSecret) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: CORS });
  }

  const supabaseUrl = env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return Response.json({ error: "Server misconfigured" }, { status: 500, headers: CORS });
  }

  let body: TriggerBody;
  try {
    body = (await request.json()) as TriggerBody;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400, headers: CORS });
  }

  if (!body.trigger_type || !body.contact_id) {
    return Response.json({ error: "trigger_type and contact_id are required" }, { status: 400, headers: CORS });
  }

  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // Find matching active workflows for this trigger_type
  const { data: workflows } = await sb
    .from("workflows")
    .select("id, name, trigger_meta")
    .eq("trigger_type", body.trigger_type)
    .eq("is_active", true);

  if (!workflows?.length) {
    return Response.json({ ok: true, run_id: null, steps_queued: 0, note: "No active workflows for this trigger" }, { headers: CORS });
  }

  // Fetch contact for template rendering
  const { data: contact } = await sb
    .from("contacts")
    .select("id, first_name, last_name, email, phone, preferred_language")
    .eq("id", body.contact_id)
    .single();

  if (!contact) {
    return Response.json({ error: "Contact not found" }, { status: 404, headers: CORS });
  }

  const lang = (contact.preferred_language as "en" | "es") ?? "es";
  const vars: Record<string, string> = {
    "contact.first_name": contact.first_name ?? "",
    "contact.last_name": contact.last_name ?? "",
    "contact.email": contact.email ?? "",
    "contact.phone": contact.phone ?? "",
    ...(body.vars ?? {}),
  };

  const runIds: string[] = [];
  let totalStepsQueued = 0;

  for (const workflow of workflows) {
    // Create workflow run
    const { data: run } = await sb
      .from("workflow_runs")
      .insert({
        workflow_id: workflow.id,
        contact_id: body.contact_id,
        opportunity_id: body.opportunity_id ?? null,
        status: "running",
        current_step: 0,
      })
      .select("id")
      .single();

    if (!run) continue;
    runIds.push(run.id);

    // Fetch steps
    const { data: steps } = await sb
      .from("workflow_steps")
      .select("id, step_order, action_type, action_config")
      .eq("workflow_id", workflow.id)
      .order("step_order", { ascending: true });

    if (!steps?.length) {
      await sb.from("workflow_runs").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", run.id);
      continue;
    }

    // Execute immediate steps (send_email only in M1; SMS queued pending Twilio)
    for (const step of steps) {
      if (step.action_type === "send_email" && contact.email && env.RESEND_API_KEY) {
        const cfg = step.action_config as { template_slug?: string; subject?: string; html?: string };
        if (cfg.template_slug) {
          const { data: tpl } = await sb
            .from("message_templates")
            .select("subject, body")
            .eq("slug", cfg.template_slug)
            .eq("channel", "email")
            .eq("lang", lang)
            .maybeSingle();

          if (tpl) {
            const subject = tpl.subject ? renderTemplate(tpl.subject, vars) : (cfg.subject ?? "(no subject)");
            const html = `<p>${renderTemplate(tpl.body, vars).replace(/\n/g, "</p><p>")}</p>`;
            const resendRes = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
              body: JSON.stringify({ from: "Roofing Experts <noreply@roofingex.com>", to: [contact.email], subject, html }),
            });

            const resendData = resendRes.ok ? ((await resendRes.json()) as { id?: string }) : {};
            const { data: convo } = await sb
              .from("conversations")
              .upsert({ contact_id: body.contact_id, channel: "email", last_message_at: new Date().toISOString() }, { onConflict: "contact_id,channel" })
              .select("id").single();
            if (convo) {
              await sb.from("messages").insert({
                conversation_id: convo.id,
                direction: "outbound",
                subject,
                body: html,
                status: resendRes.ok ? "sent" : "failed",
                resend_id: resendData.id ?? null,
                workflow_step_id: step.id,
              });
            }
            totalStepsQueued++;
          }
        }
      } else if (step.action_type === "send_sms") {
        // M1: log as 'queued' — Twilio not yet activated
        const { data: convo } = await sb
          .from("conversations")
          .upsert({ contact_id: body.contact_id, channel: "sms", last_message_at: new Date().toISOString() }, { onConflict: "contact_id,channel" })
          .select("id").single();
        if (convo) {
          await sb.from("messages").insert({
            conversation_id: convo.id,
            direction: "outbound",
            body: (step.action_config as { template_slug?: string }).template_slug ?? "(sms pending twilio)",
            status: "queued",
            workflow_step_id: step.id,
          });
        }
        totalStepsQueued++;
      }
    }

    await sb.from("workflow_runs").update({ status: "completed", completed_at: new Date().toISOString(), current_step: steps.length }).eq("id", run.id);
  }

  return Response.json({ ok: true, run_ids: runIds, steps_queued: totalStepsQueued }, { headers: CORS });
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
