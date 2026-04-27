// CF Pages Function — GHL → sales-tool customer auto-create
// Listens for ContactCreate events from the Roofing Experts Services Inc. sub-account only.

import { createClient } from "@supabase/supabase-js";

interface Env {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  GHL_WEBHOOK_SECRET?: string;
  GHL_SERVICES_INC_LOCATION_ID?: string;
}

interface GhlContact {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  address1?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

interface GhlPayload {
  type?: string;
  locationId?: string;
  contact?: GhlContact;
}

function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return "1" + digits;
  if (digits.length === 11 && digits.startsWith("1")) return digits;
  return digits.length >= 7 ? digits : null;
}

async function verifySignature(secret: string, rawBody: string, sigHeader: string | null): Promise<boolean> {
  if (!sigHeader) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const computed = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
  return constantTimeEqual(computed, sigHeader.toLowerCase().replace(/^sha256=/, ""));
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function onRequestPost(ctx: { request: Request; env: Env }) {
  const { request, env } = ctx;

  const supabaseUrl = env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const webhookSecret = env.GHL_WEBHOOK_SECRET;
  const servicesIncLocationId = env.GHL_SERVICES_INC_LOCATION_ID ?? "DfkEocSccdPsDcgqrJug";

  if (!supabaseUrl) {
    return Response.json({ error: "Server misconfigured: SUPABASE_URL not set" }, { status: 500 });
  }
  if (!serviceKey) {
    return Response.json({ error: "Server misconfigured: SUPABASE_SERVICE_ROLE_KEY not set" }, { status: 500 });
  }

  const rawBody = await request.text();

  // Verify HMAC-SHA256 signature — fail closed if secret is not configured
  if (!webhookSecret) {
    return Response.json({ error: "GHL_WEBHOOK_SECRET not configured" }, { status: 500 });
  }
  const sigHeader = request.headers.get("x-wh-signature") ?? request.headers.get("x-signature");
  const staticSecretHeader = request.headers.get("x-wh-secret");

  let authorized = false;
  if (sigHeader) {
    authorized = await verifySignature(webhookSecret, rawBody, sigHeader);
  } else if (staticSecretHeader) {
    authorized = constantTimeEqual(staticSecretHeader, webhookSecret);
  }

  if (!authorized) {
    return Response.json({ error: "invalid_signature" }, { status: 401 });
  }

  let payload: GhlPayload;
  try {
    payload = JSON.parse(rawBody) as GhlPayload;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // Log every incoming event
  const logBase = {
    event_type: payload.type ?? null,
    location_id: payload.locationId ?? null,
    contact_id: payload.contact?.id ?? null,
    payload: payload as unknown as Record<string, unknown>,
  };

  // Filter: only ContactCreate
  if (payload.type !== "ContactCreate") {
    await sb.from("ghl_webhook_log").insert({ ...logBase, action: "skipped_unsupported_event" });
    return Response.json({ skipped: "unsupported_event" });
  }

  // Guard: only Services Inc sub-account
  if (payload.locationId !== servicesIncLocationId) {
    await sb.from("ghl_webhook_log").insert({ ...logBase, action: "skipped_wrong_location" });
    return Response.json({ skipped: "wrong_location" });
  }

  const contact = payload.contact;
  if (!contact) {
    await sb.from("ghl_webhook_log").insert({ ...logBase, action: "skipped_no_contact" });
    return Response.json({ skipped: "no_contact_object" });
  }

  const email = contact.email?.trim() || null;
  const phone = normalizePhone(contact.phone);

  // Dedup by email first, then phone
  if (email) {
    const { data: existing } = await sb.from("accounts").select("id").eq("email", email).maybeSingle();
    if (existing) {
      await sb.from("ghl_webhook_log").insert({ ...logBase, action: "skipped_dedup_email", customer_id: existing.id });
      return Response.json({ skipped: "dedup_email", existing_id: existing.id });
    }
  }

  if (phone) {
    const { data: existing } = await sb.from("accounts").select("id").eq("phone", phone).maybeSingle();
    if (existing) {
      await sb.from("ghl_webhook_log").insert({ ...logBase, action: "skipped_dedup_phone", customer_id: existing.id });
      return Response.json({ skipped: "dedup_phone", existing_id: existing.id });
    }
  }

  // Insert new account
  const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim() || "Unknown";
  const newAccount = {
    name,
    email,
    phone,
    billing_address_line1: contact.address1 ?? null,
    billing_city: contact.city ?? null,
    billing_state: contact.state ?? null,
    billing_zip: contact.postalCode ?? null,
    status: "PROSPECT" as const,
    source: "ghl",
    ghl_contact_id: contact.id,
    ghl_location_id: payload.locationId,
    ghl_last_sync_at: new Date().toISOString(),
  };

  const { data: inserted, error: insertError } = await sb.from("accounts").insert(newAccount).select("id").single();

  if (insertError) {
    await sb.from("ghl_webhook_log").insert({ ...logBase, action: "error_insert", error: insertError.message });
    return Response.json({ error: "insert_failed", detail: insertError.message }, { status: 500 });
  }

  await sb.from("ghl_webhook_log").insert({ ...logBase, action: "created", customer_id: inserted.id });
  return Response.json({ ok: true, customer_id: inserted.id, action: "created" });
}
