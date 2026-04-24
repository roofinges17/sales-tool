// POST /api/address-intel
// One-shot address intelligence: Solar roof data + folio + FEMA flood zone + property details.
// Parallel where possible; EnerGov property lookup is sequential after folio returns.
//
// Input:  { address: string, lat: number, lng: number, zip?: string }
// Output: { roof?, folio?, floodZone?, property?, hvhz }

export interface Env {
  GOOGLE_API_KEY: string;
  FOLIO_CACHE?: KVNamespace;
}

// ── Constants ────────────────────────────────────────────────────────────────

const SQ_M_TO_SQ_FT = 10.7639;
const WASTE_FACTOR = 1.02;
const FLAT_PITCH_THRESHOLD_DEG = 9.5;

// All Miami-Dade and Broward ZIP codes are HVHZ (High Velocity Hurricane Zone)
// per Florida Building Code. Detect by ZIP prefix.
function isHVHZ(zip?: string): boolean {
  if (!zip) return false;
  const z = parseInt(zip.replace(/\D/g, "").slice(0, 5), 10);
  // Miami-Dade: 33010–33299, various others; Broward: 33004, 33009–33029, 33060–33076, 33301–33394
  return (
    (z >= 33010 && z <= 33299) ||
    z === 33004 ||
    (z >= 33009 && z <= 33029) ||
    (z >= 33060 && z <= 33076) ||
    (z >= 33301 && z <= 33394)
  );
}

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

async function fetchRoofData(lat: number, lng: number, apiKey: string): Promise<RoofResult | null> {
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
      return {
        totalSqft: slopedWithWaste + flatWithWaste,
        slopedSqft: slopedWithWaste,
        flatSqft: flatWithWaste,
        pitch,
        segmentCount: segments.length,
      };
    }
    return null;
  } catch {
    return null;
  }
}

// ── Folio lookup — Miami-Dade GIS ────────────────────────────────────────────

const DIRECTIONALS = new Set(["N", "S", "E", "W", "NE", "NW", "SE", "SW"]);
const STREET_TYPES: Record<string, string> = {
  ST: "ST", STREET: "ST", AVE: "AVE", AV: "AVE", AVENUE: "AVE", BLVD: "BLVD",
  BOULEVARD: "BLVD", DR: "DR", DRIVE: "DR", CT: "CT", COURT: "CT", PL: "PL",
  PLACE: "PL", RD: "RD", ROAD: "RD", LN: "LN", LANE: "LN", WAY: "WAY",
  TER: "TER", TERRACE: "TER", CIR: "CIR", CIRCLE: "CIR",
};

function detectCounty(zip: string): "miami-dade" | "broward" {
  const z = parseInt(zip.replace(/\D/g, "").slice(0, 5), 10);
  if (
    z === 33004 || (z >= 33009 && z <= 33029) || (z >= 33060 && z <= 33076) ||
    (z >= 33301 && z <= 33340) || z === 33388 || z === 33394
  ) return "broward";
  return "miami-dade";
}

async function fetchFolio(
  address: string,
  zip?: string,
  cache?: KVNamespace,
): Promise<string | null> {
  try {
    const county = zip ? detectCounty(zip) : "miami-dade";
    const cacheKey = `folio:${county}:${address.toLowerCase().trim()}`;
    if (cache) {
      const cached = await cache.get(cacheKey, "json") as { folio: string } | null;
      if (cached?.folio) return cached.folio;
    }

    // Miami-Dade GIS ArcGIS lookup
    const street = address.split(",")[0].trim().toUpperCase();
    const parts = street.split(/\s+/);
    if (parts.length < 2) return null;
    const hseNum = parseInt(parts[0], 10);
    if (isNaN(hseNum)) return null;
    let idx = 1;
    let preDir: string | null = null;
    if (idx < parts.length && DIRECTIONALS.has(parts[idx])) preDir = parts[idx++];
    const lastPart = parts[parts.length - 1];
    const stType = STREET_TYPES[lastPart] ?? null;
    const nameEnd = stType ? parts.length - 1 : parts.length;
    const stName = parts.slice(idx, nameEnd).join(" ");
    if (!stName) return null;

    const conditions = [`HSE_NUM=${hseNum}`, `ST_NAME LIKE '${stName}%'`];
    if (preDir) conditions.push(`PRE_DIR='${preDir}'`);
    if (stType) conditions.push(`ST_TYPE='${stType}'`);

    const params = new URLSearchParams({
      where: conditions.join(" AND "),
      outFields: "FOLIO",
      returnGeometry: "false",
      resultRecordCount: "1",
      f: "json",
    });

    const url = `https://gis.miamidade.gov/arcgis/rest/services/AddressSearchMap_PropertiesWithZip/MapServer/0/query?${params}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; RoofingExperts-SalesTool/1.0)" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { features?: Array<{ attributes: { FOLIO?: string } }> };
    const folio = data?.features?.[0]?.attributes?.FOLIO?.trim() ?? null;
    if (folio && cache) {
      await cache.put(cacheKey, JSON.stringify({ folio }), { expirationTtl: 60 * 60 * 24 * 30 });
    }
    return folio;
  } catch {
    return null;
  }
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
  // Miami-Dade building department doesn't expose a public JSON REST API for permits.
  // Best-effort HTML scrape of their public permit search portal.
  // Returns empty array on any failure — never blocks the intel response.
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

    // Look for permit number patterns in the HTML: B-YYYY-NNNNNN format
    const permitPattern = /B-\d{4}-\d{6}/g;
    const matches = html.match(permitPattern);
    if (!matches) return [];

    // Deduplicate and return the most recent 3
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
    "Cache-Control": "public, max-age=86400", // 24h — property data doesn't change daily
  };

  const { GOOGLE_API_KEY, FOLIO_CACHE } = ctx.env;

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

  // Full-result cache keyed by normalized address — same KV namespace as folio cache
  const intelCacheKey = `intel:${address.toLowerCase().replace(/\s+/g, " ").trim()}`;
  const INTEL_TTL = 60 * 60 * 24; // 24h

  if (FOLIO_CACHE) {
    const cached = await FOLIO_CACHE.get(intelCacheKey, "json");
    if (cached) {
      return new Response(JSON.stringify({ ...cached as object, cached: true }), {
        status: 200,
        headers: corsHeaders,
      });
    }
  }

  // Phase 1: parallel — roof + flood zone + folio
  const [roof, floodZone, folio] = await Promise.all([
    GOOGLE_API_KEY ? fetchRoofData(lat, lng, GOOGLE_API_KEY) : Promise.resolve(null),
    fetchFloodZone(lat, lng),
    fetchFolio(address, zip, FOLIO_CACHE),
  ]);

  // Phase 2: sequential on folio — property details + permits
  let property: PropertyDetails | null = null;
  let permits: PermitSummary[] = [];
  if (folio) {
    [property, permits] = await Promise.all([
      fetchPropertyDetails(folio),
      fetchRecentPermits(folio),
    ]);
  }

  const result = {
    roof,
    folio,
    floodZone,
    property,
    permits,
    hvhz: isHVHZ(zip),
  };

  // Cache only when we got at least some data back
  if (FOLIO_CACHE && (roof || folio || floodZone)) {
    await FOLIO_CACHE.put(intelCacheKey, JSON.stringify(result), {
      expirationTtl: INTEL_TTL,
    });
  }

  return new Response(JSON.stringify(result), { status: 200, headers: corsHeaders });
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
