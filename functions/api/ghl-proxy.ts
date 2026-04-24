// Cloudflare Pages Function — GHL API proxy
// Keeps the PIT token server-side; client posts intent, we forward to GHL.

interface Env {
  GHL_PIT: string;
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

export async function onRequestPost(ctx: { request: Request; env: Env }) {
  const { env, request } = ctx;
  const pit = env.GHL_PIT;

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
  const pit = env.GHL_PIT;
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
