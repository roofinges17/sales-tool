// POST /api/address-intel
// One-shot address intelligence: Solar roof data + folio + FEMA flood zone + property details.
// Parallel where possible; EnerGov property lookup is sequential after folio returns.
//
// Input:  { address: string, lat: number, lng: number, zip?: string }
// Output: { roof?, folio?, floodZone?, property?, hvhz }

import { guard } from "./_guard";
import {
  SOLAR_QUOTA, SOLAR_WARN_AT, SOLAR_CRITICAL_AT,
  solarCacheKey, solarMonthTag, solarUsageKey, solarHitsKey, solarResetDate,
} from "./_solar-cache";
import { lookupFolio, detectCounty as countyFromZip, type FolioData } from "./_folio";

export interface Env {
  GOOGLE_API_KEY: string;
  FOLIO_CACHE?: KVNamespace;
  SOLAR_CACHE?: KVNamespace;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const SQ_M_TO_SQ_FT = 10.7639;
const WASTE_FACTOR = 1.02;
const FLAT_PITCH_THRESHOLD_DEG = 9.5;

// ── Solar / roof measurement ─────────────────────────────────────────────────

interface RoofSegment {
  pitchDegrees: number;
  azimuthDegrees: number;
  stats?: { areaMeters2: number };
  areaMeters2?: number;
}

interface RoofResult {
  totalSqft: number;
  slopedSqft: number;
  flatSqft: number;
  pitch: string;
  segmentCount: number;
}

async function fetchRoofData(
  lat: number,
  lng: number,
  apiKey: string,
  solarCache?: KVNamespace,
): Promise<RoofResult | "quota_exhausted" | null> {
  const month = solarMonthTag();
  const cKey = solarCacheKey(lat, lng);
  const usageKey = solarUsageKey(month);
  const hitsKey = solarHitsKey(month);

  // Cache hit — free, no quota consumed
  if (solarCache) {
    const cached = await solarCache.get(cKey, "json") as RoofResult | null;
    if (cached) {
      solarCache.get(hitsKey).then((v) =>
        solarCache.put(hitsKey, String(parseInt(v ?? "0", 10) + 1))
      );
      return cached;
    }
  }

  // Quota check
  if (solarCache) {
    const countStr = await solarCache.get(usageKey);
    const count = parseInt(countStr ?? "0", 10);
    if (count >= SOLAR_QUOTA) {
      console.error(`[address-intel] solar quota_exhausted: ${count}/${SOLAR_QUOTA} for ${month}`);
      return "quota_exhausted";
    }
    if (count >= SOLAR_CRITICAL_AT) {
      console.error(`[address-intel] solar quota_critical: ${count + 1}/${SOLAR_QUOTA} for ${month}`);
      solarCache.put(`SOLAR_CRITICAL_${month}`, "1");
    } else if (count >= SOLAR_WARN_AT) {
      console.warn(`[address-intel] solar quota_warning: ${count + 1}/${SOLAR_QUOTA} for ${month}`);
    }
  }

  try {
    for (const quality of ["HIGH", "MEDIUM"]) {
      const url =
        `https://solar.googleapis.com/v1/buildingInsights:findClosest` +
        `?location.latitude=${lat}&location.longitude=${lng}` +
        `&requiredQuality=${quality}&key=${apiKey}`;
      const res = await fetch(url);
      if (!res.ok) {
        if (res.status === 404 && quality === "HIGH") continue;
        return null;
      }
      const data = (await res.json()) as {
        solarPotential?: { roofSegmentStats?: RoofSegment[] };
      };
      const segments = data?.solarPotential?.roofSegmentStats;
      if (!segments) return null;

      let slopedSqFt = 0, flatSqFt = 0;
      const pitchVals: number[] = [];
      for (const seg of segments) {
        const areaM2 = seg.stats?.areaMeters2 ?? seg.areaMeters2 ?? 0;
        const areaSqFt = areaM2 * SQ_M_TO_SQ_FT;
        if (seg.pitchDegrees <= FLAT_PITCH_THRESHOLD_DEG) {
          flatSqFt += areaSqFt;
        } else {
          slopedSqFt += areaSqFt;
          pitchVals.push(seg.pitchDegrees);
        }
      }
      const avgPitchDeg = pitchVals.length
        ? pitchVals.reduce((a, b) => a + b, 0) / pitchVals.length
        : 0;
      const pitchRatio = Math.round(Math.tan((avgPitchDeg * Math.PI) / 180) * 12);
      const pitch = pitchRatio > 0 ? `${pitchRatio}/12` : "0/12";
      const slopedWithWaste = Math.round(slopedSqFt * WASTE_FACTOR);
      const flatWithWaste = Math.round(flatSqFt * WASTE_FACTOR);
      const result: RoofResult = {
        totalSqft: slopedWithWaste + flatWithWaste,
        slopedSqft: slopedWithWaste,
        flatSqft: flatWithWaste,
        pitch,
        segmentCount: segments.length,
      };

      // Cache result + increment counter
      if (solarCache) {
        const countStr = await solarCache.get(usageKey);
        const count = parseInt(countStr ?? "0", 10);
        await Promise.all([
          solarCache.put(usageKey, String(count + 1)),
          solarCache.put(cKey, JSON.stringify(result)),
        ]);
      }

      return result;
    }
    return null;
  } catch {
    return null;
  }
}

// ── Folio lookup (multi-county) ──────────────────────────────────────────────

async function fetchFolioWithCache(
  address: string,
  zip: string | undefined,
  lat: number,
  lng: number,
  cache?: KVNamespace,
): Promise<FolioData> {
  const county = zip ? countyFromZip(zip) : "miami-dade";
  if (cache) {
    const key = `folio:${county}:${address.toLowerCase().replace(/\s+/g, " ").trim()}`;
    const cached = await cache.get(key, "json") as FolioData | null;
    if (cached) return cached;
  }
  const result = await lookupFolio(address, zip, lat, lng);
  if (result.folio && cache) {
    const key = `folio:${county}:${address.toLowerCase().replace(/\s+/g, " ").trim()}`;
    cache.put(key, JSON.stringify(result), { expirationTtl: 60 * 60 * 24 * 30 });
  }
  return result;
}

// ── EnerGov property details ─────────────────────────────────────────────────

interface PropertyDetails {
  owner: string | null;
  yearBuilt: number | null;
  lotSizeSqft: number | null;
}

async function fetchPropertyDetails(folio: string): Promise<PropertyDetails | null> {
  try {
    const params = new URLSearchParams({
      where: `FOLIO='${folio}'`,
      outFields: "TRUE_OWNER1,YEAR_BUILT,LOT_SIZE",
      returnGeometry: "false",
      resultRecordCount: "1",
      f: "json",
    });
    const url = `https://gis.miamidade.gov/arcgis/rest/services/EnerGov/MD_LandMgtViewer/MapServer/12/query?${params}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; RoofingExperts-SalesTool/1.0)" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      features?: Array<{
        attributes: {
          TRUE_OWNER1?: string;
          YEAR_BUILT?: number;
          LOT_SIZE?: number;
        };
      }>;
    };
    const attrs = data?.features?.[0]?.attributes;
    if (!attrs) return null;
    return {
      owner: attrs.TRUE_OWNER1 ?? null,
      yearBuilt: attrs.YEAR_BUILT || null,
      lotSizeSqft: attrs.LOT_SIZE || null,
    };
  } catch {
    return null;
  }
}

// ── FEMA flood zone ──────────────────────────────────────────────────────────

async function fetchFloodZone(lat: number, lng: number): Promise<string | null> {
  try {
    const params = new URLSearchParams({
      geometry: `${lng},${lat}`,
      geometryType: "esriGeometryPoint",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: "FLD_ZONE,ZONE_SUBTY",
      returnGeometry: "false",
      f: "json",
    });
    const url = `https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query?${params}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      features?: Array<{ attributes: { FLD_ZONE?: string; ZONE_SUBTY?: string } }>;
    };
    const attrs = data?.features?.[0]?.attributes;
    if (!attrs?.FLD_ZONE) return null;
    return attrs.ZONE_SUBTY
      ? `${attrs.FLD_ZONE} (${attrs.ZONE_SUBTY})`
      : attrs.FLD_ZONE;
  } catch {
    return null;
  }
}

// ── Permit lookup (Miami-Dade EnerGov — best-effort) ─────────────────────────

interface PermitSummary {
  permitNo: string;
  permitType: string;
  status: string;
  issueDate: string | null;
  description: string | null;
}

async function fetchRecentPermits(folio: string): Promise<PermitSummary[]> {
  try {
    const url = `https://egov.miamidade.gov/buildingpermits/Default.aspx?folio=${encodeURIComponent(folio)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; RoofingExperts-SalesTool/1.0)",
        Accept: "text/html",
      },
    });
    if (!res.ok) return [];
    const html = await res.text();
    const permitPattern = /B-\d{4}-\d{6}/g;
    const matches = html.match(permitPattern);
    if (!matches) return [];
    return [...new Set(matches)].slice(0, 3).map((permitNo) => ({
      permitNo,
      permitType: "Building",
      status: "Unknown",
      issueDate: null,
      description: null,
    }));
  } catch {
    return [];
  }
}

// ── Main handler ─────────────────────────────────────────────────────────────

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
    "Cache-Control": "public, max-age=86400",
  };

  const { error: guardErr } = await guard(ctx.request, ctx.env, {
    maxBodyBytes: 0,
    ratePrefix: "address-intel",
    rateLimit: 0,
  });
  if (guardErr) return guardErr;

  const { GOOGLE_API_KEY, FOLIO_CACHE, SOLAR_CACHE } = ctx.env;

  let body: { address?: string; lat?: number; lng?: number; zip?: string };
  try {
    body = (await ctx.request.json()) as typeof body;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: corsHeaders });
  }

  const { address, lat, lng, zip } = body;
  if (!address || lat == null || lng == null) {
    return new Response(
      JSON.stringify({ error: "address, lat, and lng are required" }),
      { status: 400, headers: corsHeaders },
    );
  }

  // Full-result cache — only caches when we have real roof data (not quota_exhausted)
  const intelCacheKey = `intel:${address.toLowerCase().replace(/\s+/g, " ").trim()}`;
  const INTEL_TTL = 60 * 60 * 24;

  if (FOLIO_CACHE) {
    const cached = await FOLIO_CACHE.get(intelCacheKey, "json");
    if (cached) {
      return new Response(JSON.stringify({ ...cached as object, cached: true }), {
        status: 200,
        headers: corsHeaders,
      });
    }
  }

  const [roofResult, floodZone, folioData] = await Promise.all([
    GOOGLE_API_KEY ? fetchRoofData(lat, lng, GOOGLE_API_KEY, SOLAR_CACHE) : Promise.resolve(null),
    fetchFloodZone(lat, lng),
    fetchFolioWithCache(address, zip, lat, lng, FOLIO_CACHE),
  ]);

  let property: PropertyDetails | null = null;
  let permits: PermitSummary[] = [];
  if (folioData.folio) {
    if (folioData.county === "miami-dade") {
      [property, permits] = await Promise.all([
        fetchPropertyDetails(folioData.folio),
        fetchRecentPermits(folioData.folio),
      ]);
    } else {
      // Other county PAs already return owner + yearBuilt in FolioData
      property = { owner: folioData.owner, yearBuilt: folioData.yearBuilt, lotSizeSqft: null };
    }
  }

  const quotaExhausted = roofResult === "quota_exhausted";
  const roof = quotaExhausted
    ? { source: "manual_entry_required" as const, totalSqft: null, slopedSqft: null, flatSqft: null, pitch: null, segmentCount: null, resetDate: solarResetDate() }
    : roofResult;

  const result = { roof, folio: folioData.folio, floodZone, property, permits, hvhz: folioData.hvhz };

  // Don't cache when quota exhausted — next request should retry Solar after quota resets
  if (!quotaExhausted && FOLIO_CACHE && (roof || folioData.folio || floodZone)) {
    await FOLIO_CACHE.put(intelCacheKey, JSON.stringify(result), { expirationTtl: INTEL_TTL });
  }

  return new Response(JSON.stringify(result), { status: 200, headers: corsHeaders });
};

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
};
