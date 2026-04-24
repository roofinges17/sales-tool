const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_STATIC_KEY ?? "";

// Earth circumference constant for meters-per-pixel formula
const EARTH_CIRCUMFERENCE_M = 156543.03392;

/**
 * Meters per pixel at a given zoom level and latitude.
 * scale=2 halves the value (HiDPI: each canvas pixel covers less ground).
 */
export function metersPerPixel(latDeg: number, zoom: number, scale: 1 | 2 = 2): number {
  const latRad = (latDeg * Math.PI) / 180;
  const base = (EARTH_CIRCUMFERENCE_M * Math.cos(latRad)) / Math.pow(2, zoom);
  return base / scale;
}

/**
 * Google Maps Static API URL for a satellite image.
 * Returns empty string if the API key is not configured.
 */
export function staticMapUrl(
  lat: number,
  lng: number,
  zoom = 20,
  size = 640,
  scale: 1 | 2 = 2,
): string {
  if (!MAPS_KEY) return "";
  const params = new URLSearchParams({
    center: `${lat},${lng}`,
    zoom: String(zoom),
    size: `${size}x${size}`,
    scale: String(scale),
    maptype: "satellite",
    key: MAPS_KEY,
  });
  return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
}

/**
 * Geocode a free-text address using the Google Geocoding API.
 * Returns null if the key is missing or no result is found.
 */
export async function geocodeAddress(
  address: string,
): Promise<{ lat: number; lng: number; formattedAddress: string } | null> {
  if (!MAPS_KEY) return null;
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${MAPS_KEY}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = (await res.json()) as {
    status: string;
    results: Array<{
      geometry: { location: { lat: number; lng: number } };
      formatted_address: string;
    }>;
  };
  if (data.status !== "OK" || !data.results[0]) return null;
  const { lat, lng } = data.results[0].geometry.location;
  return { lat, lng, formattedAddress: data.results[0].formatted_address };
}

/**
 * Compute the planar area in sq ft of a polygon defined by pixel coordinates,
 * given the meters-per-pixel scale of the underlying satellite image.
 * Uses the shoelace formula.
 */
export function polygonAreaSqft(
  points: { x: number; y: number }[],
  mPerPx: number,
): number {
  if (points.length < 3) return 0;
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  const pixelArea = Math.abs(area) / 2;
  const sqMeters = pixelArea * mPerPx * mPerPx;
  return sqMeters * 10.7639; // m² → ft²
}

export const MAPS_KEY_CONFIGURED = Boolean(MAPS_KEY);
