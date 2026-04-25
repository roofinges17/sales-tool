"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import IntegrationStatusCard, { type IntegrationStatus } from "@/components/settings/IntegrationStatusCard";

const TEST_LAT = 25.7617;
const TEST_LNG = -80.1918; // Miami — typical service area

interface SolarUsage {
  month: string;
  used: number;
  remaining: number;
  quota: number;
  resetDate: string;
  cacheHits: number;
  cacheMisses: number;
  criticalFlagged: boolean;
}

export default function GoogleMapsPage() {
  const [solarStatus, setSolarStatus] = useState<IntegrationStatus>("checking");
  const [solarLabel, setSolarLabel] = useState("");
  const [solarChecked, setSolarChecked] = useState<Date | null>(null);
  const [solarChecking, setSolarChecking] = useState(false);
  const [solarUsage, setSolarUsage] = useState<SolarUsage | null>(null);
  const [usageError, setUsageError] = useState<string | null>(null);

  useEffect(() => {
    checkSolar();
    fetchUsage();
  }, []);

  async function fetchUsage() {
    try {
      const { data: { session } } = await supabase().auth.getSession();
      const res = await fetch("/api/admin/solar-usage", {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      if (res.ok) {
        setSolarUsage(await res.json() as SolarUsage);
      } else {
        setUsageError(`Error ${res.status}`);
      }
    } catch {
      setUsageError("Failed to load usage");
    }
  }

  async function checkSolar() {
    setSolarChecking(true);
    setSolarStatus("checking");
    try {
      const { data: { session } } = await supabase().auth.getSession();
      const res = await fetch(
        `/api/solar?lat=${TEST_LAT}&lng=${TEST_LNG}`,
        {
          headers: session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {},
        },
      );
      if (res.ok) {
        const json = (await res.json()) as { mock?: boolean };
        if (json.mock) {
          setSolarStatus("partial");
          setSolarLabel("Mock mode — GOOGLE_SOLAR_API_KEY not set");
        } else {
          setSolarStatus("connected");
          setSolarLabel("Connected — real Solar API data");
        }
      } else if (res.status === 404 || res.status === 500) {
        setSolarStatus("disconnected");
        setSolarLabel(`Error ${res.status}`);
      } else {
        setSolarStatus("unconfigured");
        setSolarLabel("Not configured");
      }
    } catch {
      setSolarStatus("disconnected");
      setSolarLabel("Network error");
    }
    setSolarChecked(new Date());
    setSolarChecking(false);
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold text-zinc-100">Google Maps</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Address autocomplete, satellite imagery, and Solar API for roof measurements.
        </p>
      </div>

      {/* Solar API */}
      <IntegrationStatusCard
        name="Google Solar API"
        description="Roof area estimation + solar irradiance data via Google Cloud"
        status={solarStatus}
        statusLabel={solarLabel}
        lastChecked={solarChecked}
        onRecheck={checkSolar}
        checking={solarChecking}
      >
        <div className="space-y-3 text-sm text-zinc-400">
          <p>
            Key configured via <code className="text-zinc-300">GOOGLE_SOLAR_API_KEY</code> environment variable
            in Cloudflare Pages. Changing the key requires a redeploy.
          </p>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-1">
            <p className="text-xs font-medium text-zinc-300 uppercase tracking-wide">Test coordinates</p>
            <p className="text-xs text-zinc-500">
              Miami, FL ({TEST_LAT}, {TEST_LNG}) — used to verify the Solar API is live.
            </p>
          </div>
          <a
            href="https://console.cloud.google.com/apis/api/solar.googleapis.com/quotas"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-brand hover:underline"
          >
            View GCP Solar API usage →
          </a>
        </div>
      </IntegrationStatusCard>

      {/* Solar API Quota */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 overflow-hidden">
        <div className="px-6 py-5 border-b border-zinc-800 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">Solar API Quota</h2>
            <p className="text-sm text-zinc-500 mt-0.5">Free tier · 100 calls/month · resets {solarUsage?.resetDate ?? "—"}</p>
          </div>
          {solarUsage?.criticalFlagged && (
            <span className="shrink-0 inline-flex items-center rounded px-2 py-1 text-xs font-bold bg-red-900/50 text-red-300 border border-red-700/40">
              CRITICAL
            </span>
          )}
        </div>
        <div className="p-6 space-y-4">
          {usageError ? (
            <p className="text-sm text-red-400">{usageError}</p>
          ) : !solarUsage ? (
            <p className="text-sm text-zinc-500">Loading…</p>
          ) : (
            <>
              {/* Usage bar */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-400">{solarUsage.used} / {solarUsage.quota} API calls used</span>
                  <span className={solarUsage.remaining <= 5 ? "text-red-400 font-semibold" : solarUsage.remaining <= 20 ? "text-amber-400" : "text-green-400"}>
                    {solarUsage.remaining} remaining
                  </span>
                </div>
                <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      solarUsage.used >= 95 ? "bg-red-500" : solarUsage.used >= 80 ? "bg-amber-500" : "bg-green-500"
                    }`}
                    style={{ width: `${Math.min(100, (solarUsage.used / solarUsage.quota) * 100)}%` }}
                  />
                </div>
              </div>
              {/* Cache stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg bg-zinc-800/60 px-3 py-2 text-center">
                  <p className="text-[10px] text-zinc-500">Cache Hits</p>
                  <p className="text-sm font-bold text-green-400">{solarUsage.cacheHits}</p>
                </div>
                <div className="rounded-lg bg-zinc-800/60 px-3 py-2 text-center">
                  <p className="text-[10px] text-zinc-500">API Calls</p>
                  <p className="text-sm font-bold text-zinc-100">{solarUsage.cacheMisses}</p>
                </div>
                <div className="rounded-lg bg-zinc-800/60 px-3 py-2 text-center">
                  <p className="text-[10px] text-zinc-500">Month</p>
                  <p className="text-sm font-bold text-zinc-100">{solarUsage.month}</p>
                </div>
              </div>
              {solarUsage.criticalFlagged && (
                <p className="text-xs text-red-400">
                  95+ calls reached. New roof lookups return manual-entry prompt until {solarUsage.resetDate}.
                </p>
              )}
              <button
                onClick={fetchUsage}
                className="text-xs font-medium text-brand hover:underline"
              >
                Refresh usage →
              </button>
            </>
          )}
        </div>
      </div>

      {/* Places API */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 overflow-hidden">
        <div className="px-6 py-5 border-b border-zinc-800 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">Google Places API</h2>
            <p className="text-sm text-zinc-500 mt-0.5">Address autocomplete on account create / quote forms</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="w-2 h-2 rounded-full bg-zinc-500" />
            <span className="text-sm font-medium text-zinc-500">Build-time config</span>
          </div>
        </div>
        <div className="p-6 space-y-3 text-sm text-zinc-400">
          <p>
            Configured at build time via{" "}
            <code className="text-zinc-300">NEXT_PUBLIC_GOOGLE_MAPS_STATIC_KEY</code>.
            Runtime status cannot be checked from this panel — the key is baked into the
            Next.js static export.
          </p>
          <a
            href="https://console.cloud.google.com/apis/api/places-backend.googleapis.com/quotas"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-brand hover:underline"
          >
            View GCP Places API usage →
          </a>
        </div>
      </div>
    </div>
  );
}
