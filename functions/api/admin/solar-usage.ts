// GET /api/admin/solar-usage
// Returns current month Solar API quota consumption. Admin/owner only.

import { guard } from "../_guard";
import { SOLAR_QUOTA, solarMonthTag, solarUsageKey, solarHitsKey, solarResetDate } from "../_solar-cache";

export interface Env {
  SOLAR_CACHE?: KVNamespace;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const cors = { "Content-Type": "application/json" };

  const { error: guardErr, userId } = await guard(ctx.request, ctx.env, {
    maxBodyBytes: 0,
    ratePrefix: "admin",
    rateLimit: 0,
  });
  if (guardErr) return guardErr;

  // Admin/owner gate
  const profileRes = await fetch(
    `${ctx.env.SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=role`,
    {
      headers: {
        apikey: ctx.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${ctx.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    },
  );
  const profiles = (await profileRes.json()) as Array<{ role: string }>;
  if (!["owner", "admin"].includes(profiles[0]?.role ?? "")) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: cors });
  }

  const solarCache = ctx.env.SOLAR_CACHE;
  if (!solarCache) {
    return new Response(
      JSON.stringify({ error: "SOLAR_CACHE KV not bound" }),
      { status: 503, headers: cors },
    );
  }

  const month = solarMonthTag();
  const [usedStr, hitsStr, criticalFlag] = await Promise.all([
    solarCache.get(solarUsageKey(month)),
    solarCache.get(solarHitsKey(month)),
    solarCache.get(`SOLAR_CRITICAL_${month}`),
  ]);

  const used = parseInt(usedStr ?? "0", 10);
  const cacheHits = parseInt(hitsStr ?? "0", 10);

  return new Response(
    JSON.stringify({
      month,
      used,
      remaining: Math.max(0, SOLAR_QUOTA - used),
      quota: SOLAR_QUOTA,
      resetDate: solarResetDate(),
      cacheHits,
      cacheMisses: used,
      criticalFlagged: criticalFlag === "1",
    }),
    { status: 200, headers: cors },
  );
};

export const onRequestOptions: PagesFunction<Env> = async () =>
  new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
