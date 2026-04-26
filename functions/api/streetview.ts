// GET /api/streetview?address=...
// Server-side Street View proxy. Fetches the Google Street View image with a
// trusted Referer header so the Maps API key's Website restriction is satisfied
// regardless of which CF Pages domain (prod, preview, branch) the client is on.
//
// Returns: { base64: string, mime_type: string } or { error: string, no_imagery: true }
//
// Auth: requires valid sales-tool JWT (same guard pattern as other endpoints).

const CORS = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
const SV_REFERER = "https://roofing-experts-sales-tool.pages.dev/";

interface Env {
  NEXT_PUBLIC_GOOGLE_MAPS_STATIC_KEY?: string;
  GOOGLE_API_KEY?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

async function getUserId(request: Request, env: Env): Promise<string | null> {
  const auth = request.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;
  try {
    const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      },
    });
    if (!res.ok) return null;
    const user = (await res.json()) as { id?: string };
    return user.id ?? null;
  } catch {
    return null;
  }
}

export async function onRequestGet(ctx: { request: Request; env: Env }) {
  const { request, env } = ctx;

  const userId = await getUserId(request, env);
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: CORS });
  }

  const url = new URL(request.url);
  const address = url.searchParams.get("address");
  if (!address) {
    return Response.json({ error: "address query param required" }, { status: 400, headers: CORS });
  }

  const apiKey = env.NEXT_PUBLIC_GOOGLE_MAPS_STATIC_KEY ?? env.GOOGLE_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "Maps API key not configured" }, { status: 500, headers: CORS });
  }

  const svUrl = `https://maps.googleapis.com/maps/api/streetview?size=1024x768&location=${encodeURIComponent(address)}&fov=80&pitch=0&key=${apiKey}`;

  try {
    const svRes = await fetch(svUrl, { headers: { Referer: SV_REFERER } });

    if (!svRes.ok) {
      return Response.json({ error: `Street View API error: ${svRes.status}`, no_imagery: true }, { status: 502, headers: CORS });
    }

    const contentType = svRes.headers.get("content-type") ?? "image/jpeg";
    const buffer = await svRes.arrayBuffer();

    // Google returns a grey placeholder (~4KB) when no imagery exists
    if (!contentType.startsWith("image/") || buffer.byteLength < 5000) {
      return Response.json({ error: "No Street View imagery available", no_imagery: true }, { status: 404, headers: CORS });
    }

    // Chunked base64 to avoid call-stack overflow on large images
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 8192) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    }

    return Response.json(
      { base64: btoa(binary), mime_type: contentType },
      { headers: CORS },
    );
  } catch (err) {
    return Response.json(
      { error: `Street View fetch failed: ${err instanceof Error ? err.message : "unknown"}`, no_imagery: true },
      { status: 502, headers: CORS },
    );
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      ...CORS,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
