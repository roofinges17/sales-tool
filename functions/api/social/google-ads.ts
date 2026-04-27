// POST /api/social/google-ads
// Google Ads Lead Form Extensions webhook handler.
//
// Auth: static secret via ?google_key=<secret> query param OR X-Goog-Signature header.
// Google delivers full lead fields inline — no second API call required.
//
// Payload: { google_key, lead_id, user_column_data: [{column_name, string_value}] }

import { CORS, normalizePhone, processSocialLead, constantTimeEqual } from "./_social-shared";

interface Env {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  GOOGLE_ADS_WEBHOOK_SECRET?: string;
  GHL_PIT?: string;
}

interface GoogleLeadColumn {
  column_name: string;
  string_value?: string;
}

interface GoogleAdsPayload {
  google_key?: string;
  lead_id?: string;
  user_column_data?: GoogleLeadColumn[];
  campaign_id?: string;
  form_id?: string;
  adgroup_id?: string;
  creative_id?: string;
  api_version?: string;
}

export async function onRequestPost(ctx: { request: Request; env: Env }) {
  const { request, env } = ctx;

  const secret = env.GOOGLE_ADS_WEBHOOK_SECRET;
  if (!secret) {
    return Response.json({ error: "GOOGLE_ADS_WEBHOOK_SECRET not configured" }, { status: 500, headers: CORS });
  }

  const rawBody = await request.text();

  // Auth: query param takes priority, then header, then payload field
  const url = new URL(request.url);
  const queryKey = url.searchParams.get("google_key");
  const headerKey = request.headers.get("x-goog-signature");

  let authorized = false;
  if (queryKey) {
    authorized = constantTimeEqual(queryKey, secret);
  } else if (headerKey) {
    authorized = constantTimeEqual(headerKey, secret);
  } else {
    // Try payload field (Google sends google_key in body for some integrations)
    try {
      const parsed = JSON.parse(rawBody) as { google_key?: string };
      if (parsed.google_key) authorized = constantTimeEqual(parsed.google_key, secret);
    } catch {
      // fall through to 401
    }
  }

  if (!authorized) {
    return Response.json({ error: "invalid_signature" }, { status: 401, headers: CORS });
  }

  let payload: GoogleAdsPayload;
  try {
    payload = JSON.parse(rawBody) as GoogleAdsPayload;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400, headers: CORS });
  }

  if (!payload.lead_id) {
    return Response.json({ skipped: "missing_lead_id" }, { headers: CORS });
  }

  const columns = payload.user_column_data ?? [];
  const get = (names: string[]): string | null => {
    for (const name of names) {
      const col = columns.find((c) => c.column_name.toUpperCase() === name.toUpperCase());
      if (col?.string_value) return col.string_value;
    }
    return null;
  };

  const fullName = get(["FULL_NAME"]);
  let firstName: string | null = null;
  let lastName: string | null = null;
  if (fullName) {
    const parts = fullName.trim().split(/\s+/);
    firstName = parts[0] ?? null;
    lastName = parts.length > 1 ? parts.slice(1).join(" ") : null;
  } else {
    firstName = get(["FIRST_NAME"]);
    lastName = get(["LAST_NAME"]);
  }

  const result = await processSocialLead(env, {
    platform: "google_ads",
    platformLeadId: payload.lead_id,
    firstName,
    lastName,
    phone: normalizePhone(get(["PHONE_NUMBER", "PHONE"])),
    email: get(["EMAIL"]),
    isPending: false,
    rawPayload: payload as unknown as Record<string, unknown>,
  });

  return result;
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      ...CORS,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Goog-Signature",
    },
  });
}
