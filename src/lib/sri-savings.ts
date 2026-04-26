// SRI (Solar Reflectance Index) cool-roof savings calculator.
// SRI values sourced from Englert PVDF/Kynar cool-roof color specs + ENERGY STAR database.
// Savings formula: delta_SRI / 50 × roofSqft × FL_FACTOR. Florida defaults.

const SRI_BY_COLOR: Record<string, number> = {
  // Dark cool-pigment (Englert PVDF special formulation — IR-reflective darks)
  "Matte Black":       31,
  "Charcoal Gray":     30,
  "Dark Bronze":       29,
  "Aged Bronze":       32,
  "Colonial Red":      33,
  // Medium
  "Mansard Brown":     27,
  "Forest Green":      36,
  "Royal Blue":        30,
  "Slate Gray":        44,
  "Burnished Slate":   42,
  "Terracotta":        43,
  "Patina Green":      46,
  "Copper Patina":     49,
  // Light / white
  "Dove Gray":         52,
  "Weathered Zinc":    54,
  "Bone White":        84,
  "Classic White":     92,
};

const BASELINE_SRI = 5;        // old dark asphalt shingle
const FL_FACTOR = 0.25;        // $/sqft/year per 50-point SRI delta (conservative FL CZ 1A/2A)
const SRI_DELTA_UNIT = 50;

export interface SriSavingsResult {
  savings: number;   // rounded to nearest $10
  baselineSri: 5;
  newSri: number;
}

export function calcAnnualSriSavings({
  colorName,
  roofSqft,
}: {
  colorName: string | null | undefined;
  roofSqft: number | null | undefined;
  zipOrState?: string | null;
}): SriSavingsResult | null {
  if (!colorName || !roofSqft || roofSqft <= 0) return null;
  const newSri = SRI_BY_COLOR[colorName];
  if (newSri === undefined) return null;
  const deltaSri = newSri - BASELINE_SRI;
  if (deltaSri <= 0) return null;
  const raw = (deltaSri / SRI_DELTA_UNIT) * roofSqft * FL_FACTOR;
  const savings = Math.round(raw / 10) * 10;
  if (savings <= 0) return null;
  return { savings, baselineSri: BASELINE_SRI, newSri };
}
