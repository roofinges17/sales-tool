export interface Env {
  FOLIO_CACHE: KVNamespace;
}

interface FolioResult {
  folio: string;
  county: "miami-dade" | "broward";
  owner_name?: string;
  legal_description?: string;
}

// South Florida ZIP → county
function detectCounty(zip: string): "miami-dade" | "broward" {
  const z = parseInt(zip.replace(/\D/g, "").slice(0, 5), 10);
  if (
    z === 33004 ||
    (z >= 33009 && z <= 33010) ||
    (z >= 33019 && z <= 33029) ||
    (z >= 33060 && z <= 33076) ||
    (z >= 33301 && z <= 33340) ||
    z === 33388 ||
    z === 33394
  )
    return "broward";
  return "miami-dade";
}

// Miami-Dade PA public API (www.miamidade.gov) is discontinued.
// Use Miami-Dade GIS ArcGIS FeatureServer instead.
const DIRECTIONALS = new Set(["N", "S", "E", "W", "NE", "NW", "SE", "SW"]);
const STREET_TYPES: Record<string, string> = {
  ST: "ST", STREET: "ST",
  AVE: "AVE", AV: "AVE", AVENUE: "AVE",
  BLVD: "BLVD", BOULEVARD: "BLVD",
  DR: "DR", DRIVE: "DR",
  CT: "CT", COURT: "CT",
  PL: "PL", PLACE: "PL",
  RD: "RD", ROAD: "RD",
  LN: "LN", LANE: "LN",
  WAY: "WAY",
  TER: "TER", TERRACE: "TER",
  CIR: "CIR", CIRCLE: "CIR",
  HWY: "HWY", HIGHWAY: "HWY",
  PKWY: "PKWY", PARKWAY: "PKWY",
};

function parseStreetAddress(raw: string): { hseNum: number; preDir: string | null; stName: string; stType: string | null } | null {
  const street = raw.split(",")[0].trim().toUpperCase();
  const parts = street.split(/\s+/);
  if (parts.length < 2) return null;
  const hseNum = parseInt(parts[0], 10);
  if (isNaN(hseNum)) return null;
  let idx = 1;
  let preDir: string | null = null;
  if (idx < parts.length && DIRECTIONALS.has(parts[idx])) {
    preDir = parts[idx++];
  }
  const lastPart = parts[parts.length - 1];
  const stType = STREET_TYPES[lastPart] ?? null;
  const nameEnd = stType ? parts.length - 1 : parts.length;
  const stName = parts.slice(idx, nameEnd).join(" ");
  if (!stName) return null;
  return { hseNum, preDir, stName, stType };
}

async function lookupMiamiDade(address: string): Promise<FolioResult | null> {
  const parsed = parseStreetAddress(address);
  if (!parsed) return null;
  const { hseNum, preDir, stName, stType } = parsed;

  // Build WHERE clause — street names stored with ordinal suffixes (53 → 53RD), use LIKE
  const conditions = [`HSE_NUM=${hseNum}`, `ST_NAME LIKE '${stName}%'`];
  if (preDir) conditions.push(`PRE_DIR='${preDir}'`);
  if (stType) conditions.push(`ST_TYPE='${stType}'`);

  const params = new URLSearchParams({
    where: conditions.join(" AND "),
    outFields: "FOLIO,HSE_NUM,PRE_DIR,ST_NAME,ST_TYPE",
    returnGeometry: "false",
    resultRecordCount: "1",
    f: "json",
  });

  const url = `https://gis.miamidade.gov/arcgis/rest/services/AddressSearchMap_PropertiesWithZip/MapServer/0/query?${params}`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; RoofingExperts-SalesTool/1.0)" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      features?: Array<{ attributes: { FOLIO?: string } }>;
    };
    const folio = data?.features?.[0]?.attributes?.FOLIO?.trim();
    if (!folio) return null;
    return { folio, county: "miami-dade" };
  } catch {
    return null;
  }
}

async function lookupBroward(address: string): Promise<FolioResult | null> {
  // BCPA address search API
  const encoded = encodeURIComponent(address.trim());
  const url = `https://bcpa.net/PropertySearch.asp?SearchType=address&Address=${encoded}&ShowAll=Y&OutputType=JSON`;
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json, text/html",
        "User-Agent": "Mozilla/5.0 (compatible; RoofingExperts-SalesTool/1.0)",
        Referer: "https://bcpa.net/",
      },
    });
    if (!res.ok) return null;
    const text = await res.text();
    // BCPA may return HTML or JSON — look for folio pattern in either
    // Broward folio format: "494234 01 0060" or "XX-XXXX-XX-XXXX"
    const folioMatch = text.match(/(?:Folio|FOLIO|folio)[:\s#]*([0-9\-\s]{10,20})/i);
    if (folioMatch?.[1]) {
      return { folio: folioMatch[1].trim(), county: "broward" };
    }
    return null;
  } catch {
    return null;
  }
}

function cacheKey(address: string, county: string): string {
  return `folio:${county}:${address.toLowerCase().replace(/\s+/g, " ").trim()}`;
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };

  try {
    const body = (await ctx.request.json()) as {
      address?: string;
      city?: string;
      zip?: string;
    };
    const { address, city, zip } = body;
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
    const cached = await ctx.env.FOLIO_CACHE.get(key, "json");
    if (cached) {
      return new Response(JSON.stringify({ ...cached, cached: true }), {
        headers: corsHeaders,
      });
    }

    // Live lookup
    const result =
      county === "broward"
        ? await lookupBroward(fullAddress)
        : await lookupMiamiDade(fullAddress);

    if (!result) {
      // Try the other county as fallback
      const fallback =
        county === "broward"
          ? await lookupMiamiDade(fullAddress)
          : await lookupBroward(fullAddress);
      if (!fallback) {
        return new Response(JSON.stringify({ folio: null, county }), {
          status: 200,
          headers: corsHeaders,
        });
      }
      // Cache fallback result 30 days
      await ctx.env.FOLIO_CACHE.put(
        cacheKey(fullAddress, fallback.county),
        JSON.stringify(fallback),
        { expirationTtl: 60 * 60 * 24 * 30 }
      );
      return new Response(JSON.stringify(fallback), { headers: corsHeaders });
    }

    // Cache 30 days
    await ctx.env.FOLIO_CACHE.put(key, JSON.stringify(result), {
      expirationTtl: 60 * 60 * 24 * 30,
    });

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
