import { guard } from "./_guard";
import {
  SOLAR_QUOTA, SOLAR_WARN_AT, SOLAR_CRITICAL_AT,
  solarCacheKey, solarMonthTag, solarUsageKey, solarHitsKey, solarResetDate,
} from "./_solar-cache";

export interface Env {
  GOOGLE_API_KEY: string;
  SOLAR_CACHE?: KVNamespace;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

const SQ_M_TO_SQ_FT = 10.7639;
const WASTE_FACTOR = 1.02;
const FLAT_PITCH_THRESHOLD_DEG = 9.5;

interface SizeAndSunshineStats {
  areaMeters2: number;
  groundAreaMeters2?: number;
}

interface RoofSegment {
  pitchDegrees: number;
  azimuthDegrees: number;
  stats: SizeAndSunshineStats;
  areaMeters2?: number;
}

interface SolarResponse {
  solarPotential?: {
    roofSegmentStats?: RoofSegment[];
  };
}

function processSegments(segments: RoofSegment[]) {
  let pitchedAreaSqFt = 0;
  let flatAreaSqFt = 0;
  const pitchValues: number[] = [];

  for (const seg of segments) {
    const areaM2 = seg.stats?.areaMeters2 ?? seg.areaMeters2 ?? 0;
    const areaSqFt = areaM2 * SQ_M_TO_SQ_FT;
    if (seg.pitchDegrees <= FLAT_PITCH_THRESHOLD_DEG) {
      flatAreaSqFt += areaSqFt;
    } else {
      pitchedAreaSqFt += areaSqFt;
      pitchValues.push(seg.pitchDegrees);
    }
  }

  let predominantPitchDeg = 0;
  if (pitchValues.length > 0) {
    predominantPitchDeg = pitchValues.reduce((a, b) => a + b, 0) / pitchValues.length;
  }
  const pitchRatio = Math.round(Math.tan((predominantPitchDeg * Math.PI) / 180) * 12);
  const pitchLabel = pitchRatio > 0 ? `${pitchRatio}/12` : "0/12";

  const pitchedWithWaste = Math.round(pitchedAreaSqFt * WASTE_FACTOR);
  const flatWithWaste = Math.round(flatAreaSqFt * WASTE_FACTOR);

  return {
    pitchedArea: pitchedWithWaste,
    flatArea: flatWithWaste,
    totalArea: pitchedWithWaste + flatWithWaste,
    pitch: pitchLabel,
    segmentCount: segments.length,
    segments: segments.map((s) => ({
      pitchDegrees: Math.round(s.pitchDegrees * 10) / 10,
      azimuthDegrees: Math.round(s.azimuthDegrees),
      areaSqFt: Math.round((s.stats?.areaMeters2 ?? s.areaMeters2 ?? 0) * SQ_M_TO_SQ_FT),
    })),
  };
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const { error: guardErr } = await guard(ctx.request, ctx.env, {
    maxBodyBytes: 0,
    ratePrefix: "solar",
    rateLimit: 0,
  });
  if (guardErr) return guardErr;

  const url = new URL(ctx.request.url);
  const lat = url.searchParams.get("lat");
  const lng = url.searchParams.get("lng");

  if (!lat || !lng) {
    return new Response(JSON.stringify({ error: "Missing lat and lng query parameters" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const apiKey = ctx.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Google API key not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const cors: Record<string, string> = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  };

  const latN = parseFloat(lat);
  const lngN = parseFloat(lng);
  const solarCache = ctx.env.SOLAR_CACHE;
  const month = solarMonthTag();
  const cacheKey = solarCacheKey(latN, lngN);
  const usageKey = solarUsageKey(month);
  const hitsKey = solarHitsKey(month);

  // ── Cache hit ────────────────────────────────────────────────────────────────
  if (solarCache) {
    const cached = await solarCache.get(cacheKey, "json");
    if (cached) {
      // Increment hit counter (fire-and-forget)
      solarCache.get(hitsKey).then((v) =>
        solarCache.put(hitsKey, String((parseInt(v ?? "0", 10)) + 1))
      );
      return new Response(JSON.stringify(cached), {
        status: 200,
        headers: { ...cors, "X-Solar-Cache": "HIT" },
      });
    }
  }

  // ── Quota check ──────────────────────────────────────────────────────────────
  if (solarCache) {
    const countStr = await solarCache.get(usageKey);
    const count = parseInt(countStr ?? "0", 10);

    if (count >= SOLAR_QUOTA) {
      console.error(`[solar] quota_exhausted: ${count}/${SOLAR_QUOTA} for ${month}`);
      return new Response(
        JSON.stringify({ error: "solar_quota_exhausted", resetDate: solarResetDate() }),
        { status: 429, headers: cors },
      );
    }

    if (count >= SOLAR_CRITICAL_AT) {
      console.error(`[solar] quota_critical: ${count + 1}/${SOLAR_QUOTA} for ${month}`);
      // Store flag for admin endpoint to surface; Telegram requires external webhook (Phase 7)
      solarCache.put(`SOLAR_CRITICAL_${month}`, "1");
    } else if (count >= SOLAR_WARN_AT) {
      console.warn(`[solar] quota_warning: ${count + 1}/${SOLAR_QUOTA} for ${month}`);
    }
  }

  // ── Live Solar API call ───────────────────────────────────────────────────────
  try {
    let data: SolarResponse | null = null;

    for (const quality of ["HIGH", "MEDIUM"]) {
      const solarUrl =
        `https://solar.googleapis.com/v1/buildingInsights:findClosest` +
        `?location.latitude=${lat}&location.longitude=${lng}` +
        `&requiredQuality=${quality}&key=${apiKey}`;

      const res = await fetch(solarUrl);

      if (res.ok) {
        data = (await res.json()) as SolarResponse;
        break;
      }

      if (res.status === 404 && quality === "HIGH") {
        continue;
      }

      const errorBody = await res.text();
      console.error(`Google Solar API error (${quality}):`, res.status, errorBody);
      throw new Error(`Google Solar API ${res.status}: ${errorBody}`);
    }

    if (!data?.solarPotential?.roofSegmentStats) {
      return new Response(
        JSON.stringify({ error: "No roof data available for this location" }),
        { status: 404, headers: cors },
      );
    }

    const result = processSegments(data.solarPotential.roofSegmentStats);

    // Increment usage counter + cache result
    if (solarCache) {
      const countStr = await solarCache.get(usageKey);
      const count = parseInt(countStr ?? "0", 10);
      await Promise.all([
        solarCache.put(usageKey, String(count + 1)),
        solarCache.put(cacheKey, JSON.stringify(result)),
      ]);
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...cors, "X-Solar-Cache": "MISS" },
    });
  } catch (err) {
    console.error("Solar API error:", err);
    const message = err instanceof Error ? err.message : "Failed to fetch roof measurements";
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: cors });
  }
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
