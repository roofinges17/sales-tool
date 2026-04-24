// Shared guard for vision + voice CF Functions.
// Enforces: body size cap, Supabase JWT auth, per-user KV rate limit.
// Auth is skipped when SUPABASE_URL is unset (pure local dev / CI).

export interface GuardEnv {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  FOLIO_CACHE?: KVNamespace;
}

export interface GuardOptions {
  maxBodyBytes: number;  // content-length cap; 0 = skip
  ratePrefix: string;   // KV key prefix, e.g. "vision" → rl:vision:{uid}:{min}
  rateLimit: number;    // requests per minute; 0 = skip
}

const CORS = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };

export async function guard(
  request: Request,
  env: GuardEnv,
  opts: GuardOptions,
): Promise<{ userId: string | null; error: Response | null }> {

  // 1. Body size cap
  if (opts.maxBodyBytes > 0) {
    const cl = parseInt(request.headers.get("content-length") ?? "0");
    if (cl > opts.maxBodyBytes) {
      return { userId: null, error: new Response(JSON.stringify({ error: "Request too large" }), { status: 413, headers: CORS }) };
    }
  }

  // 2. Supabase JWT auth (skipped when SUPABASE_URL is not configured)
  let userId: string | null = null;
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    const auth = request.headers.get("Authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) {
      return { userId: null, error: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: CORS }) };
    }
    try {
      const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        },
      });
      if (!res.ok) {
        return { userId: null, error: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: CORS }) };
      }
      const user = (await res.json()) as { id?: string };
      userId = user.id ?? null;
    } catch {
      return { userId: null, error: new Response(JSON.stringify({ error: "Auth check failed" }), { status: 500, headers: CORS }) };
    }
  }

  // 3. Per-user rate limit via KV
  if (env.FOLIO_CACHE && opts.rateLimit > 0) {
    const ratePart = userId ?? (request.headers.get("CF-Connecting-IP") ?? "unknown");
    const windowKey = `rl:${opts.ratePrefix}:${ratePart}:${Math.floor(Date.now() / 60000)}`;
    const count = parseInt((await env.FOLIO_CACHE.get(windowKey)) ?? "0");
    if (count >= opts.rateLimit) {
      return { userId, error: new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429, headers: CORS }) };
    }
    await env.FOLIO_CACHE.put(windowKey, String(count + 1), { expirationTtl: 120 });
  }

  return { userId, error: null };
}
