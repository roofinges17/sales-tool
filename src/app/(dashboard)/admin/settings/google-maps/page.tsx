"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import IntegrationStatusCard, { type IntegrationStatus } from "@/components/settings/IntegrationStatusCard";

const TEST_LAT = 25.7617;
const TEST_LNG = -80.1918; // Miami — typical service area

export default function GoogleMapsPage() {
  const [solarStatus, setSolarStatus] = useState<IntegrationStatus>("checking");
  const [solarLabel, setSolarLabel] = useState("");
  const [solarChecked, setSolarChecked] = useState<Date | null>(null);
  const [solarChecking, setSolarChecking] = useState(false);

  useEffect(() => {
    checkSolar();
  }, []);

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
