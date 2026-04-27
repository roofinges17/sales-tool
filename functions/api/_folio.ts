// Shared multi-county folio / property lookup.
// Imported by folio-lookup.ts (public endpoint) and address-intel.ts (intel pipeline).

export type County = "miami-dade" | "broward" | "palm-beach" | "lee" | "collier" | "monroe";

export interface FolioData {
  folio: string | null;
  owner: string | null;
  yearBuilt: number | null;
  hvhz: boolean;
  county: County;
  source: string;
}

const NULL_RESULT = (county: County): FolioData => ({
  folio: null, owner: null, yearBuilt: null,
  hvhz: county === "miami-dade" || county === "broward",
  county, source: "no-match",
});

// ── County detection ──────────────────────────────────────────────────────────

export function detectCounty(zip: string): County {
  const z = parseInt(zip.replace(/\D/g, "").slice(0, 5), 10);
  // Monroe (Florida Keys) — ZIPs before Broward overlap
  if (z === 33001 || (z >= 33036 && z <= 33044) || (z >= 33050 && z <= 33052) || z === 33070)
    return "monroe";
  // Broward
  if (z === 33004 || (z >= 33009 && z <= 33010) || (z >= 33019 && z <= 33029) ||
      (z >= 33060 && z <= 33076) || (z >= 33301 && z <= 33340) || z === 33388 || z === 33394)
    return "broward";
  // Palm Beach
  if ((z >= 33401 && z <= 33499) || (z >= 34990 && z <= 34999))
    return "palm-beach";
  // Collier (Naples, Marco Island)
  if (z >= 34101 && z <= 34145)
    return "collier";
  // Lee (Fort Myers, Cape Coral)
  if ((z >= 33901 && z <= 33994) || z === 33991 || z === 33993)
    return "lee";
  return "miami-dade";
}

// ── Address parser (shared by MD, Broward, Palm Beach) ────────────────────────

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
  TRL: "TRL", TRAIL: "TRL",
};

export function parseStreetAddress(raw: string) {
  const street = raw.split(",")[0].trim().toUpperCase();
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
  return { hseNum, preDir, stName, stType };
}

// ── ArcGIS SQL escape ─────────────────────────────────────────────────────────
// ArcGIS WHERE clause uses standard SQL string literals. Escape single quotes
// by doubling them so user-supplied address components can't break out of the
// string context (e.g. a street name like "O'Brien" or a crafted injection).

function escapeArcGIS(s: string): string {
  return s.replace(/'/g, "''");
}

// ── Miami-Dade ────────────────────────────────────────────────────────────────

async function lookupMiamiDade(address: string): Promise<FolioData | null> {
  const parsed = parseStreetAddress(address);
  if (!parsed) return null;
  const { hseNum, preDir, stName, stType } = parsed;

  const conditions = [`HSE_NUM=${hseNum}`, `ST_NAME LIKE '${escapeArcGIS(stName)}%'`];
  if (preDir) conditions.push(`PRE_DIR='${escapeArcGIS(preDir)}'`);
  if (stType) conditions.push(`ST_TYPE='${escapeArcGIS(stType)}'`);

  const params = new URLSearchParams({
    where: conditions.join(" AND "),
    outFields: "FOLIO",
    returnGeometry: "false",
    resultRecordCount: "1",
    f: "json",
  });

  try {
    const res = await fetch(
      `https://gis.miamidade.gov/arcgis/rest/services/AddressSearchMap_PropertiesWithZip/MapServer/0/query?${params}`,
      { headers: { "User-Agent": "Mozilla/5.0 (compatible; RoofingExperts-SalesTool/1.0)" } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { features?: Array<{ attributes: { FOLIO?: string } }> };
    const folio = data?.features?.[0]?.attributes?.FOLIO?.trim() ?? null;
    if (!folio) return null;
    return { folio, owner: null, yearBuilt: null, hvhz: true, county: "miami-dade", source: "Miami-Dade GIS" };
  } catch { return null; }
}

// ── Broward (BCPA REST) ───────────────────────────────────────────────────────

async function lookupBroward(address: string): Promise<FolioData | null> {
  try {
    // Step 1: search by address
    const searchRes = await fetch("https://web.bcpa.net/bcpaclient/search.aspx/GetData", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; RoofingExperts-SalesTool/1.0)",
        Referer: "https://web.bcpa.net/",
      },
      body: JSON.stringify({
        value: address.split(",")[0].trim(),
        cities: "", orderBy: "", pageNumber: "1", pageCount: "5",
        arrayOfValues: "", selectedFromList: "false", totalCount: "N",
      }),
    });
    if (!searchRes.ok) return null;
    const searchJson = (await searchRes.json()) as {
      d?: { resultListk__BackingField?: Array<{ folioNumber?: string }> };
    };
    const folioNumber = searchJson?.d?.resultListk__BackingField?.[0]?.folioNumber;
    if (!folioNumber) return null;

    // Step 2: get detail (owner, year built)
    const detailRes = await fetch("https://web.bcpa.net/bcpaclient/search.aspx/getParcelInformation", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; RoofingExperts-SalesTool/1.0)",
        Referer: "https://web.bcpa.net/",
      },
      body: JSON.stringify({ folioNumber, taxyear: new Date().getFullYear().toString(), action: "CURRENT", use: "" }),
    });
    if (!detailRes.ok) {
      return { folio: folioNumber, owner: null, yearBuilt: null, hvhz: true, county: "broward", source: "BCPA" };
    }
    const detailJson = (await detailRes.json()) as {
      d?: { parcelInfok__BackingField?: Array<{ ownerName1?: string; actualAge?: string }> };
    };
    const info = detailJson?.d?.parcelInfok__BackingField?.[0];
    const yearBuilt = info?.actualAge ? parseInt(info.actualAge, 10) : null;
    return {
      folio: folioNumber,
      owner: info?.ownerName1?.trim() || null,
      yearBuilt: (yearBuilt && !isNaN(yearBuilt)) ? yearBuilt : null,
      hvhz: true,
      county: "broward",
      source: "BCPA",
    };
  } catch { return null; }
}

// ── Palm Beach (PBCGov ArcGIS) ────────────────────────────────────────────────

async function lookupPalmBeach(address: string): Promise<FolioData | null> {
  const parsed = parseStreetAddress(address);
  if (!parsed) return null;
  const { hseNum, preDir, stName } = parsed;

  const conditions = [`STREET_NUMBER='${hseNum}'`, `STREET_NAME='${escapeArcGIS(stName)}'`];
  if (preDir) conditions.push(`PRE_DIR='${escapeArcGIS(preDir)}'`);

  const params = new URLSearchParams({
    where: conditions.join(" AND "),
    outFields: "PARID,OWNER_NAME1,YEAR_ADDED",
    returnGeometry: "false",
    resultRecordCount: "1",
    f: "json",
  });

  try {
    const res = await fetch(
      `https://gis.pbcgov.org/arcgis/rest/services/Parcels/PARCEL_INFO/FeatureServer/4/query?${params}`,
      { headers: { "User-Agent": "Mozilla/5.0 (compatible; RoofingExperts-SalesTool/1.0)" } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      features?: Array<{ attributes: { PARID?: string; OWNER_NAME1?: string; YEAR_ADDED?: string } }>;
    };
    const attrs = data?.features?.[0]?.attributes;
    if (!attrs?.PARID) return null;
    const yearBuilt = attrs.YEAR_ADDED ? parseInt(attrs.YEAR_ADDED, 10) : null;
    return {
      folio: attrs.PARID,
      owner: attrs.OWNER_NAME1?.trim() || null,
      yearBuilt: (yearBuilt && !isNaN(yearBuilt)) ? yearBuilt : null,
      hvhz: false,
      county: "palm-beach",
      source: "PBCGov ArcGIS",
    };
  } catch { return null; }
}

// ── FL Statewide Cadastral (Lee=46, Collier=21, Monroe=54) ───────────────────
// Queries by lat/lng spatial intersection — requires coordinates from the caller.
// CO_NO values: Cadastral uses DOR county code + 10.

const CADASTRAL_CO_NO: Record<string, number> = {
  "lee": 46,
  "collier": 21,
  "monroe": 54,
};

const CADASTRAL_URL = "https://services9.arcgis.com/Gh9awoU677aKree0/arcgis/rest/services/Florida_Statewide_Cadastral/FeatureServer/0/query";

async function lookupCadastral(county: "lee" | "collier" | "monroe", lat: number, lng: number): Promise<FolioData | null> {
  const coNo = CADASTRAL_CO_NO[county];
  const geom = encodeURIComponent(JSON.stringify({ x: lng, y: lat, spatialReference: { wkid: 4326 } }));

  // This service rejects resultRecordCount on spatial queries — use num=1 instead
  const url = `${CADASTRAL_URL}?geometry=${geom}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&where=CO_NO%3D${coNo}&outFields=PARCEL_ID,OWN_NAME,ACT_YR_BLT&returnGeometry=false&num=1&f=json`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; RoofingExperts-SalesTool/1.0)" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      features?: Array<{ attributes: { PARCEL_ID?: string; OWN_NAME?: string; ACT_YR_BLT?: number } }>;
    };
    const attrs = data?.features?.[0]?.attributes;
    if (!attrs?.PARCEL_ID) return null;
    return {
      folio: attrs.PARCEL_ID,
      owner: attrs.OWN_NAME?.trim() || null,
      yearBuilt: (attrs.ACT_YR_BLT && attrs.ACT_YR_BLT > 0) ? attrs.ACT_YR_BLT : null,
      hvhz: false,
      county,
      source: "FL Statewide Cadastral",
    };
  } catch { return null; }
}

// ── Public entry point ────────────────────────────────────────────────────────

export async function lookupFolio(
  address: string,
  zip?: string,
  lat?: number,
  lng?: number,
): Promise<FolioData> {
  const county = zip ? detectCounty(zip) : "miami-dade";

  let result: FolioData | null = null;

  switch (county) {
    case "miami-dade":
      result = await lookupMiamiDade(address);
      break;
    case "broward":
      result = await lookupBroward(address);
      if (!result) result = await lookupMiamiDade(address); // border fallback
      break;
    case "palm-beach":
      result = await lookupPalmBeach(address);
      break;
    case "lee":
    case "collier":
    case "monroe":
      if (lat != null && lng != null) {
        result = await lookupCadastral(county, lat, lng);
      }
      break;
  }

  return result ?? NULL_RESULT(county);
}
