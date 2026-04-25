// Shared Solar API quota + cache helpers.
// Both /api/solar and /api/address-intel import from here so the 100 req/month
// cap is enforced globally against the same KV keys.

export const SOLAR_QUOTA = 100;
export const SOLAR_WARN_AT = 80;
export const SOLAR_CRITICAL_AT = 95;

export function solarCacheKey(lat: number, lng: number): string {
  return `solar:${lat.toFixed(4)}:${lng.toFixed(4)}`;
}

export function solarMonthTag(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function solarUsageKey(month: string): string {
  return `SOLAR_USAGE_${month}`;
}

export function solarHitsKey(month: string): string {
  return `SOLAR_HITS_${month}`;
}

export function solarResetDate(): string {
  const d = new Date();
  const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  return next.toISOString().split("T")[0];
}
