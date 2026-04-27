// POST /api/social/instagram
// Meta (Instagram) Lead Ads webhook handler.
//
// Instagram Lead Ads use the same Meta Graph API + webhook subscription as Facebook.
// The payload object type is "instagram" instead of "page".
// Signature verification and leadgen fetch are identical to the Facebook handler.
//
// Thin wrapper: re-uses all Facebook logic, only the platform value differs.

import { CORS, verifyHmacSha256, normalizePhone, processSocialLead, constantTimeEqual } from "./_social-shared";

interface Env {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  META_APP_SECRET?: string;
  META_PAGE_ACCESS_TOKEN?: string;
  GHL_PIT?: string;
  META_VERIFY_TOKEN?: string;
}

interface MetaLeadgenValue {
  leadgen_id: string;
  page_id?: string;
  form_id?: string;
  ig_account_id?: string;
  created_time?: number;
}

interface MetaEntry {
  id: string;
  changes?: Array<{ field: string; value: MetaLeadgenValue }>;
}

interface MetaPayload {
  object?: string;
  entry?: MetaEntry[];
}

interface LeadField {
  name: string;
  values: string[];
}

interface LeadgenData {
  id: string;
  field_data?: LeadField[];
}

async function fetchLeadgenFields(
  leadgenId: string,
  pageToken: string,
): Promise<{ firstName: string | null; lastName: string | null; phone: string | null; email: string | null }> {
  try {
    const url = `https://graph.facebook.com/v19.0/${leadgenId}?fields=field_data&access_token=${pageToken}`;
    const res = await fetch(url);
    if (!res.ok) return { firstName: null, lastName: null, phone: null, email: null };
    const data = (await res.json()) as LeadgenData;
    const fields = data.field_data ?? [];

    const get = (names: string[]): string | null => {
      for (const name of names) {
        const f = fields.find((f) => f.name.toLowerCase() === name.toLowerCase());
        if (f?.values?.[0]) return f.values[0];
      }
      return null;
    };

    const fullName = get(["full_name", "name"]);
    let firstName: string | null = null;
    let lastName: string | null = null;
    if (fullName) {
      const parts = fullName.trim().split(/\s+/);
      firstName = parts[0] ?? null;
      lastName = parts.length > 1 ? parts.slice(1).join(" ") : null;
    } else {
      firstName = get(["first_name"]);
      lastName = get(["last_name"]);
    }

    return {
      firstName,
      lastName,
      phone: normalizePhone(get(["phone_number", "phone"])),
      email: get(["email"]),
    };
  } catch {
    return { firstName: null, lastName: null, phone: null, email: null };
  }
}

export async function onRequestGet(ctx: { request: Request; env: Env }) {
  const url = new URL(ctx.request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const verifyToken = ctx.env.META_VERIFY_TOKEN ?? ctx.env.META_APP_SECRET ?? "";

  if (mode === "subscribe" && token && constantTimeEqual(token, verifyToken)) {
    return new Response(challenge ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function onRequestPost(ctx: { request: Request; env: Env }) {
  const { request, env } = ctx;

  const appSecret = env.META_APP_SECRET;
  if (!appSecret) {
    return Response.json({ error: "META_APP_SECRET not configured" }, { status: 500, headers: CORS });
  }

  const rawBody = await request.text();

  const sigHeader = request.headers.get("x-hub-signature-256");
  if (!sigHeader || !(await verifyHmacSha256(appSecret, rawBody, sigHeader))) {
    return Response.json({ error: "invalid_signature" }, { status: 401, headers: CORS });
  }

  let payload: MetaPayload;
  try {
    payload = JSON.parse(rawBody) as MetaPayload;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400, headers: CORS });
  }

  // Instagram webhooks use object = "instagram"
  if (payload.object !== "instagram") {
    return Response.json({ skipped: "not_instagram_object" }, { headers: CORS });
  }

  const results = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "leadgen") continue;
      const { leadgen_id, page_id, form_id, ig_account_id } = change.value;
      if (!leadgen_id) continue;

      const pageToken = env.META_PAGE_ACCESS_TOKEN;
      let leadFields = { firstName: null as string | null, lastName: null as string | null, phone: null as string | null, email: null as string | null };
      let isPending = true;

      if (pageToken) {
        leadFields = await fetchLeadgenFields(leadgen_id, pageToken);
        isPending = false;
      }

      const result = await processSocialLead(env, {
        platform: "instagram",
        platformLeadId: leadgen_id,
        ...leadFields,
        isPending,
        rawPayload: { leadgen_id, page_id, form_id, ig_account_id, entry_id: entry.id },
      });

      results.push(await result.json());
    }
  }

  return Response.json({ ok: true, processed: results.length, results }, { headers: CORS });
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      ...CORS,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
