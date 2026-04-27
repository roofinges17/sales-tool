// POST /api/ghl/project-pipeline-webhook
// Inbound: GHL Project Pipeline stage change → UPDATE jobs.stage
// Services Inc sub-account only.
//
// Auth: GHL_WEBHOOK_SECRET — HMAC-SHA256 (x-wh-signature) or static (x-wh-secret / ?secret=)

import { createClient } from "@supabase/supabase-js";

const CORS = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };

interface Env {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  GHL_WEBHOOK_SECRET?: string;
  GHL_SERVICES_INC_LOCATION_ID?: string;
}

interface GhlProjectPipelinePayload {
  type?: string;
  locationId?: string;
  location_id?: string;
  opportunity?: {
    id?: string;
    pipelineId?: string;
    pipelineStageId?: string;
  };
  pipeline_stage_id?: string;
}

// GHL pipeline stage ID → jobs.stage integer
// TODO: Replace placeholder keys with actual GHL Project Pipeline stage IDs from
// Services Inc sub-account → Settings → Pipelines → Project Pipeline.
const STANDARD_GHL_TO_STAGE: Record<string, number> = {
  "GHL_PROJ_STD_0_INTAKE": 0,
  "GHL_PROJ_STD_1_SURVEY_SCHED": 1,
  "GHL_PROJ_STD_2_SURVEY_DONE": 2,
  "GHL_PROJ_STD_3_PERMIT_APPLIED": 3,
  "GHL_PROJ_STD_4_PERMIT_APPROVED": 4,
  "GHL_PROJ_STD_5_MATERIAL_ORDERED": 5,
  "GHL_PROJ_STD_6_CREW_SCHED": 6,
  "GHL_PROJ_STD_7_JOB_STARTED": 7,
  "GHL_PROJ_STD_8_JOB_COMPLETE": 8,
  "GHL_PROJ_STD_9_PUNCH_OUT": 9,
  "GHL_PROJ_STD_10_FINAL_INSPECTION": 10,
  "GHL_PROJ_STD_11_CLOSED": 11,
};

const REROOFING_GHL_TO_STAGE: Record<string, number> = {
  "GHL_PROJ_RR_0_INTAKE": 0,
  "GHL_PROJ_RR_1_SCHEDULED": 1,
  "GHL_PROJ_RR_2_IN_PROGRESS": 2,
  "GHL_PROJ_RR_3_COMPLETE": 3,
  "GHL_PROJ_RR_4_CLOSED": 4,
};

// Combined reverse map (all stage IDs → integer)
const ALL_GHL_TO_STAGE: Record<string, { stage: number; job_type: "standard" | "reroofing" }> = {
  ...Object.fromEntries(Object.entries(STANDARD_GHL_TO_STAGE).map(([k, v]) => [k, { stage: v, job_type: "standard" as const }])),
  ...Object.fromEntries(Object.entries(REROOFING_GHL_TO_STAGE).map(([k, v]) => [k, { stage: v, job_type: "reroofing" as const }])),
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
  const servicesIncLocationId = env.GHL_SERVICES_INC_LOCATION_ID ?? "DfkEocSccdPsDcgqrJug";

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

  let payload: GhlProjectPipelinePayload;
  try {
    payload = JSON.parse(rawBody) as GhlProjectPipelinePayload;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400, headers: CORS });
  }

  // Only handle stage-change events from Services Inc
  const locationId = payload.locationId ?? payload.location_id;
  if (locationId && locationId !== servicesIncLocationId) {
    return Response.json({ ok: true, skipped: "wrong_location" }, { headers: CORS });
  }

  if (payload.type !== "OpportunityStageUpdate") {
    return Response.json({ ok: true, skipped: "not_stage_update" }, { headers: CORS });
  }

  const ghlOppId = payload.opportunity?.id;
  const ghlStageId = payload.opportunity?.pipelineStageId ?? payload.pipeline_stage_id;

  if (!ghlOppId || !ghlStageId) {
    return Response.json({ error: "Missing opportunity.id or pipelineStageId" }, { status: 400, headers: CORS });
  }

  const mapped = ALL_GHL_TO_STAGE[ghlStageId];
  if (!mapped) {
    // Unknown stage ID — may be from sales pipeline or unmapped project pipeline; skip
    return Response.json({ ok: true, skipped: "unknown_ghl_stage_id" }, { headers: CORS });
  }

  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { error } = await sb
    .from("jobs")
    .update({ stage: mapped.stage, updated_at: new Date().toISOString() })
    .eq("ghl_opportunity_id", ghlOppId);

  if (error) {
    console.error("[project-pipeline-webhook] DB update error:", error.message);
    return Response.json({ error: error.message }, { status: 500, headers: CORS });
  }

  return Response.json({ ok: true, stage: mapped.stage }, { headers: CORS });
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
