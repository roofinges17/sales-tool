// Cloudflare Pages Function — GHL API proxy
// Keeps the PIT token server-side; client posts intent, we forward to GHL.
// PIT resolution order: company_settings.ghl_pit_token → GHL_PIT env var.

import { createClient } from "@supabase/supabase-js";
import { guard } from "./_guard";

interface Env {
  GHL_PIT: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

interface ProxyRequest {
  endpoint: string; // e.g. "contacts", "opportunities/pipelines"
  method?: string;
  body?: Record<string, unknown>;
  queryParams?: Record<string, string>;
}

const GHL_BASE = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";
const LOCATION_ID = "DfkEocSccdPsDcgqrJug";

async function resolvePit(env: Env): Promise<string | null> {
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
      const { data } = await sb
        .from("company_settings")
        .select("ghl_pit_token, ghl_default_location_id")
        .limit(1)
        .maybeSingle();
      if ((data as { ghl_pit_token?: string | null } | null)?.ghl_pit_token) {
        return (data as { ghl_pit_token: string }).ghl_pit_token;
      }
    } catch {
      // Fall through to env
    }
  }
  return env.GHL_PIT ?? null;
}

export async function onRequestPost(ctx: { request: Request; env: Env }) {
  const { env, request } = ctx;

  const { error: guardErr } = await guard(request, env, {
    maxBodyBytes: 0,
    ratePrefix: "ghl-proxy",
    rateLimit: 0,
  });
  if (guardErr) return guardErr;

  const pit = await resolvePit(env);

  if (!pit) {
    return Response.json({ error: "GHL_PIT not configured" }, { status: 500 });
  }

  let payload: ProxyRequest;
  try {
    payload = (await request.json()) as ProxyRequest;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { endpoint, method = "GET", body, queryParams = {} } = payload;

  if (!endpoint || typeof endpoint !== "string") {
    return Response.json({ error: "endpoint is required" }, { status: 400 });
  }

  // Build URL
  const url = new URL(`${GHL_BASE}/${endpoint}`);
  // Always inject locationId unless the endpoint already has it (e.g. opportunities/{id})
  if (!url.searchParams.has("locationId") && !endpoint.includes("/")) {
    url.searchParams.set("locationId", LOCATION_ID);
  }
  for (const [k, v] of Object.entries(queryParams)) {
    url.searchParams.set(k, v);
  }

  const ghlRes = await fetch(url.toString(), {
    method,
    headers: {
      Authorization: `Bearer ${pit}`,
      Version: GHL_VERSION,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const data = await ghlRes.json();
  return Response.json(data, { status: ghlRes.status });
}

export async function onRequestGet(ctx: { request: Request; env: Env }) {
  // GET version for easy pipeline listing from settings page
  const { env, request } = ctx;

  const { error: guardErr } = await guard(request, env, {
    maxBodyBytes: 0,
    ratePrefix: "ghl-proxy-get",
    rateLimit: 0,
  });
  if (guardErr) return guardErr;

  const pit = await resolvePit(env);
  if (!pit) return Response.json({ error: "GHL_PIT not configured" }, { status: 500 });

  const url = new URL(request.url);
  const endpoint = url.searchParams.get("endpoint") ?? "opportunities/pipelines";

  const ghlUrl = new URL(`${GHL_BASE}/${endpoint}`);
  ghlUrl.searchParams.set("locationId", LOCATION_ID);

  const ghlRes = await fetch(ghlUrl.toString(), {
    headers: { Authorization: `Bearer ${pit}`, Version: GHL_VERSION },
  });

  const data = await ghlRes.json();
  return Response.json(data, { status: ghlRes.status });
}
