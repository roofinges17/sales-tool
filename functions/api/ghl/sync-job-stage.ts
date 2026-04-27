// POST /api/ghl/sync-job-stage
// Outbound: jobs.stage change → GHL Project Pipeline stage update.
// Services Inc sub-account only.
//
// Input:  { job_id: string, stage: number, job_type: "standard" | "reroofing" }
// Output: { ok: true, ghl_stage_id? } or { ok: true, skipped: "reason" }

import { createClient } from "@supabase/supabase-js";
import { guard } from "../_guard";

interface Env {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  GHL_PIT?: string;
}

const GHL_BASE = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";
const CORS = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };

// Map integer stage → GHL Project Pipeline stage ID.
// TODO: Replace placeholder values with actual GHL pipeline stage IDs from
// Services Inc sub-account → Settings → Pipelines → Project Pipeline.
const STANDARD_STAGE_MAP: Record<number, string> = {
  0: "GHL_PROJ_STD_0_INTAKE",
  1: "GHL_PROJ_STD_1_SURVEY_SCHED",
  2: "GHL_PROJ_STD_2_SURVEY_DONE",
  3: "GHL_PROJ_STD_3_PERMIT_APPLIED",
  4: "GHL_PROJ_STD_4_PERMIT_APPROVED",
  5: "GHL_PROJ_STD_5_MATERIAL_ORDERED",
  6: "GHL_PROJ_STD_6_CREW_SCHED",
  7: "GHL_PROJ_STD_7_JOB_STARTED",
  8: "GHL_PROJ_STD_8_JOB_COMPLETE",
  9: "GHL_PROJ_STD_9_PUNCH_OUT",
  10: "GHL_PROJ_STD_10_FINAL_INSPECTION",
  11: "GHL_PROJ_STD_11_CLOSED",
};

const REROOFING_STAGE_MAP: Record<number, string> = {
  0: "GHL_PROJ_RR_0_INTAKE",
  1: "GHL_PROJ_RR_1_SCHEDULED",
  2: "GHL_PROJ_RR_2_IN_PROGRESS",
  3: "GHL_PROJ_RR_3_COMPLETE",
  4: "GHL_PROJ_RR_4_CLOSED",
};

export async function onRequestPost(ctx: { request: Request; env: Env }) {
  const { request, env } = ctx;

  const { error: guardErr } = await guard(request, env, {
    maxBodyBytes: 0,
    ratePrefix: "ghl-sync-job-stage",
    rateLimit: 0,
  });
  if (guardErr) return guardErr;

  const supabaseUrl = env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return Response.json({ error: "Server misconfigured" }, { status: 500, headers: CORS });
  }

  let body: { job_id?: string; stage?: number; job_type?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400, headers: CORS });
  }

  const { job_id, stage, job_type } = body;
  if (!job_id || stage == null) {
    return Response.json({ error: "job_id and stage are required" }, { status: 400, headers: CORS });
  }

  const stageMap = job_type === "reroofing" ? REROOFING_STAGE_MAP : STANDARD_STAGE_MAP;
  const ghlStageId = stageMap[stage];

  if (!ghlStageId || ghlStageId.startsWith("GHL_PROJ_")) {
    // Placeholder IDs not yet configured — skip silently
    return Response.json({ ok: true, skipped: "ghl_stage_ids_not_configured" }, { headers: CORS });
  }

  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: job } = await sb
    .from("jobs")
    .select("ghl_opportunity_id")
    .eq("id", job_id)
    .single();

  if (!job?.ghl_opportunity_id) {
    return Response.json({ ok: true, skipped: "no_ghl_opportunity_id" }, { headers: CORS });
  }

  const pit = env.GHL_PIT;
  if (!pit) {
    return Response.json({ error: "GHL_PIT not configured" }, { status: 503, headers: CORS });
  }

  const ghlRes = await fetch(`${GHL_BASE}/opportunities/${job.ghl_opportunity_id}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${pit}`,
      Version: GHL_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ pipelineStageId: ghlStageId }),
  });

  if (!ghlRes.ok) {
    const detail = await ghlRes.json().catch(() => null);
    console.error("[sync-job-stage] GHL update failed:", ghlRes.status, detail);
    return Response.json(
      { error: "ghl_update_failed", status: ghlRes.status },
      { status: 502, headers: CORS },
    );
  }

  return Response.json({ ok: true, ghl_stage_id: ghlStageId }, { headers: CORS });
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
