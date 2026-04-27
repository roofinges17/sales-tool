// Shared logic for all social lead intake handlers (A-2).
// Used by: facebook.ts, instagram.ts, tiktok.ts, google-ads.ts

import { createClient } from "@supabase/supabase-js";

export const CORS = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };

// Contact Created stage — social leads enter at stage 0 (form submission = first contact event)
const CONTACT_CREATED_STAGE_GHL_ID = "fd021142-ab6d-4912-ae9b-3ca399168f56";
const SALES_PIPELINE_GHL_ID = "ra29G9C6SeCPQDsFoP2o";
const GHL_BASE = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";
const GHL_LOCATION_ID = "DfkEocSccdPsDcgqrJug";

export type SocialPlatform = "facebook" | "instagram" | "tiktok" | "google_ads";

export interface NormalizedLead {
  platform: SocialPlatform;
  platformLeadId: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  rawPayload: Record<string, unknown>;
  // For FB/IG: contact fields are NULL, status = pending_lead_fetch
  isPending?: boolean;
}

export interface SharedEnv {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  GHL_PIT?: string;
}

export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return "1" + digits;
  if (digits.length === 11 && digits.startsWith("1")) return digits;
  return digits.length >= 7 ? digits : null;
}

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyHmacSha256(
  secret: string,
  message: string,
  signature: string,
): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  const computed = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const normalized = signature.toLowerCase().replace(/^sha256=/, "");
  return constantTimeEqual(computed, normalized);
}

// Atomic round-robin: pick seller with oldest social_lead_last_assigned_at, update immediately
async function assignRep(sb: ReturnType<typeof createClient>): Promise<string | null> {
  // Use rpc for atomic select+update; fallback to two-step if rpc not available
  const { data, error } = await sb.rpc("assign_social_lead_rep");
  if (!error && data) return data as string;

  // Two-step fallback (slight race risk on high concurrency, acceptable at current volume)
  const { data: seller } = await sb
    .from("profiles")
    .select("id")
    .eq("role", "seller")
    .eq("status", "active")
    .order("social_lead_last_assigned_at", { ascending: true, nullsFirst: true })
    .limit(1)
    .maybeSingle();

  if (!seller) return null;

  await sb
    .from("profiles")
    .update({ social_lead_last_assigned_at: new Date().toISOString() })
    .eq("id", seller.id);

  return seller.id;
}

async function pushToGhl(
  pit: string,
  lead: NormalizedLead,
): Promise<void> {
  const nameParts = [lead.firstName, lead.lastName].filter(Boolean);
  const body: Record<string, unknown> = {
    locationId: GHL_LOCATION_ID,
    source: lead.platform,
  };
  if (nameParts.length > 0) body.firstName = lead.firstName;
  if (lead.lastName) body.lastName = lead.lastName;
  if (lead.email) body.email = lead.email;
  if (lead.phone) body.phone = "+" + lead.phone;

  try {
    await fetch(`${GHL_BASE}/contacts/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${pit}`,
        Version: GHL_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch {
    // GHL push is best-effort in bridge period; failure logged separately
  }
}

export async function processSocialLead(
  env: SharedEnv,
  lead: NormalizedLead,
): Promise<Response> {
  const supabaseUrl = env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return Response.json({ error: "Server misconfigured" }, { status: 500, headers: CORS });
  }

  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // 1. Idempotency check
  const { data: existing } = await sb
    .from("social_lead_log")
    .select("id, contact_id, opportunity_id, status")
    .eq("platform", lead.platform)
    .eq("platform_lead_id", lead.platformLeadId)
    .maybeSingle();

  if (existing) {
    return Response.json({
      ok: true,
      action: "duplicate_skipped",
      platform: lead.platform,
      platform_lead_id: lead.platformLeadId,
      status: existing.status,
    }, { headers: CORS });
  }

  // 2. Contact upsert (by phone first, then email, then insert)
  let contactDbId: string | null = null;
  const now = new Date().toISOString();

  if (lead.phone || lead.email) {
    const { data: byPhone } = lead.phone
      ? await sb.from("contacts").select("id").eq("phone", lead.phone).maybeSingle()
      : { data: null };

    const { data: byEmail } = (!byPhone && lead.email)
      ? await sb.from("contacts").select("id").eq("email", lead.email).maybeSingle()
      : { data: null };

    const existingContact = byPhone ?? byEmail;

    if (existingContact) {
      await sb.from("contacts").update({
        first_name: lead.firstName,
        last_name: lead.lastName,
        ...(lead.email ? { email: lead.email } : {}),
        ...(lead.phone ? { phone: lead.phone } : {}),
        ghl_last_sync_at: now,
      }).eq("id", existingContact.id);
      contactDbId = existingContact.id;
    } else if (!lead.isPending) {
      const { data: inserted } = await sb.from("contacts").insert({
        first_name: lead.firstName,
        last_name: lead.lastName,
        email: lead.email,
        phone: lead.phone,
        preferred_language: "es",
        ghl_last_sync_at: now,
      }).select("id").single();
      contactDbId = inserted?.id ?? null;
    }
  }

  // 3. Round-robin rep assignment
  const assignedToId = await assignRep(sb);

  // 4. Opportunity insert (Contact Created stage)
  let opportunityDbId: string | null = null;
  if (contactDbId) {
    const { data: pipeline } = await sb
      .from("pipelines")
      .select("id")
      .eq("ghl_pipeline_id", SALES_PIPELINE_GHL_ID)
      .single();

    const { data: stage } = await sb
      .from("stages")
      .select("id")
      .eq("ghl_stage_id", CONTACT_CREATED_STAGE_GHL_ID)
      .single();

    if (pipeline && stage) {
      const { data: opp } = await sb.from("opportunities").insert({
        contact_id: contactDbId,
        pipeline_id: pipeline.id,
        stage_id: stage.id,
        source: lead.platform,
        assigned_to_id: assignedToId,
        stage_changed_at: now,
      }).select("id").single();
      opportunityDbId = opp?.id ?? null;
    }
  }

  // 5. GHL push (bridge period — best effort)
  if (env.GHL_PIT && !lead.isPending) {
    await pushToGhl(env.GHL_PIT, lead);
  }

  // 6. Log to social_lead_log
  await sb.from("social_lead_log").insert({
    platform: lead.platform,
    platform_lead_id: lead.platformLeadId,
    status: lead.isPending ? "pending_lead_fetch" : "complete",
    contact_id: contactDbId,
    opportunity_id: opportunityDbId,
    assigned_to_id: assignedToId,
    raw_payload: lead.rawPayload,
  });

  return Response.json({
    ok: true,
    action: lead.isPending ? "lead_queued_pending_fetch" : "lead_created",
    platform: lead.platform,
    platform_lead_id: lead.platformLeadId,
    contact_id: contactDbId,
    opportunity_id: opportunityDbId,
    assigned_to_id: assignedToId,
  }, { headers: CORS });
}
