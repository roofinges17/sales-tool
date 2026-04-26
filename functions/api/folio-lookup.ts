import { lookupFolio, detectCounty, type FolioData } from "./_folio";

export interface Env {
  FOLIO_CACHE: KVNamespace;
}

function cacheKey(address: string, county: string): string {
  return `folio:${county}:${address.toLowerCase().replace(/\s+/g, " ").trim()}`;
}

const FOLIO_RATE_LIMIT = 30; // requests per hour per IP

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };

  // IP-based rate limit — no auth required (anon accept flow)
  const ip = ctx.request.headers.get("CF-Connecting-IP") ?? "unknown";
  const rlKey = `folio:ip:${ip}:${Math.floor(Date.now() / 3600000)}`;
  const rlCount = parseInt((await ctx.env.FOLIO_CACHE.get(rlKey)) ?? "0");
  if (rlCount >= FOLIO_RATE_LIMIT) {
    return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
      status: 429,
      headers: corsHeaders,
    });
  }
  await ctx.env.FOLIO_CACHE.put(rlKey, String(rlCount + 1), { expirationTtl: 7200 });

  try {
    const body = (await ctx.request.json()) as {
      address?: string;
      city?: string;
      zip?: string;
      lat?: number;
      lng?: number;
    };
    const { address, city, zip, lat, lng } = body;
    if (!address) {
      return new Response(JSON.stringify({ error: "address required" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const fullAddress = [address, city].filter(Boolean).join(", ");
    const county = zip ? detectCounty(zip) : "miami-dade";
    const key = cacheKey(fullAddress, county);

    // Check KV cache
    const cached = await ctx.env.FOLIO_CACHE.get(key, "json") as FolioData | null;
    if (cached) {
      return new Response(JSON.stringify({ ...cached, cached: true }), {
        headers: corsHeaders,
      });
    }

    const result = await lookupFolio(fullAddress, zip, lat, lng);

    // Only cache on a real hit — don't cache no-match (no-match may resolve later)
    if (result.folio) {
      await ctx.env.FOLIO_CACHE.put(key, JSON.stringify(result), {
        expirationTtl: 60 * 60 * 24 * 30,
      });
    }

    return new Response(JSON.stringify(result), { headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: corsHeaders,
    });
  }
};

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
};
