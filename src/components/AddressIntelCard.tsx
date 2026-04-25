"use client";

// Displays the result of /api/address-intel in a compact info card.
// Shown in Step 3 Customer (after address select) and on /measure.

import { useState } from "react";

export interface AddressIntelResult {
  roof?: {
    totalSqft: number | null;
    slopedSqft: number | null;
    flatSqft: number | null;
    pitch: string | null;
    segmentCount: number | null;
    source?: string;
    resetDate?: string;
  } | null;
  folio?: string | null;
  floodZone?: string | null;
  property?: {
    owner: string | null;
    yearBuilt: number | null;
    lotSizeSqft: number | null;
  } | null;
  permits?: Array<{
    permitNo: string;
    permitType: string;
    status: string;
    issueDate: string | null;
  }>;
  hvhz?: boolean;
  cached?: boolean;
}

interface AddressIntelCardProps {
  data: AddressIntelResult;
  onApplyMeasurements?: (sqft: { slopedSqft: number; flatSqft: number }) => void;
  loading?: boolean;
}

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US").format(Math.round(n));
}

function FloodZoneBadge({ zone }: { zone: string }) {
  const z = zone.split(" ")[0].toUpperCase();
  let color = "bg-zinc-800 text-zinc-400";
  if (z === "AE" || z === "A") color = "bg-amber-900/60 text-amber-300 border border-amber-700/40";
  if (z === "VE" || z === "V") color = "bg-red-900/60 text-red-300 border border-red-700/40";
  if (z === "X" || z === "C") color = "bg-green-900/40 text-green-400 border border-green-700/30";
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold ${color}`}>
      Flood Zone {zone}
    </span>
  );
}

export function AddressIntelCard({ data, onApplyMeasurements, loading }: AddressIntelCardProps) {
  const { roof, folio, floodZone, property, permits, hvhz } = data;
  const [manualSqft, setManualSqft] = useState("");
  const hasData = roof || folio || floodZone || property;
  const isManualEntry = roof?.source === "manual_entry_required";

  if (loading) {
    return (
      <div className="rounded-xl border border-zinc-700/50 bg-zinc-900/60 p-4">
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Gathering address intelligence…
        </div>
      </div>
    );
  }

  if (!hasData) return null;

  return (
    <div className="rounded-xl border border-zinc-700/50 bg-zinc-900/60 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-zinc-800 bg-zinc-800/40">
        <svg className="h-3.5 w-3.5 text-brand" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2L2 9.5V22h7v-6h6v6h7V9.5L12 2z" />
        </svg>
        <span className="text-xs font-semibold text-zinc-300 tracking-wide uppercase">Address Intelligence</span>
        {hvhz && (
          <span className="ml-auto inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold bg-red-900/50 text-red-300 border border-red-700/40 uppercase tracking-wider">
            HVHZ
          </span>
        )}
      </div>

      <div className="p-4 space-y-4">
        {/* Roof measurements — auto-filled */}
        {roof && !isManualEntry && (
          <div className="space-y-2">
            <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Roof Measurements</p>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg bg-zinc-800/60 px-3 py-2 text-center">
                <p className="text-[10px] text-zinc-500">Total</p>
                <p className="text-sm font-bold text-zinc-100">{fmt(roof.totalSqft)}</p>
                <p className="text-[10px] text-zinc-600">sq ft</p>
              </div>
              <div className="rounded-lg bg-zinc-800/60 px-3 py-2 text-center">
                <p className="text-[10px] text-zinc-500">Sloped</p>
                <p className="text-sm font-bold text-brand">{fmt(roof.slopedSqft)}</p>
                <p className="text-[10px] text-zinc-600">sq ft</p>
              </div>
              {(roof.flatSqft ?? 0) > 0 ? (
                <div className="rounded-lg bg-zinc-800/60 px-3 py-2 text-center">
                  <p className="text-[10px] text-zinc-500">Flat</p>
                  <p className="text-sm font-bold text-amber-400">{fmt(roof.flatSqft)}</p>
                  <p className="text-[10px] text-zinc-600">sq ft</p>
                </div>
              ) : (
                <div className="rounded-lg bg-zinc-800/60 px-3 py-2 text-center">
                  <p className="text-[10px] text-zinc-500">Pitch</p>
                  <p className="text-sm font-bold text-zinc-100">{roof.pitch ?? "—"}</p>
                  <p className="text-[10px] text-zinc-600">{roof.segmentCount} seg</p>
                </div>
              )}
            </div>
            {(roof.flatSqft ?? 0) > 0 && (
              <p className="text-[10px] text-zinc-500">Avg pitch: {roof.pitch} · {roof.segmentCount} segments · incl. 2% waste</p>
            )}
            {!(roof.flatSqft ?? 0) && (
              <p className="text-[10px] text-zinc-500">Incl. 2% waste</p>
            )}
            {onApplyMeasurements && (
              <button
                onClick={() => onApplyMeasurements({ slopedSqft: roof.slopedSqft ?? 0, flatSqft: roof.flatSqft ?? 0 })}
                className="w-full rounded-lg border border-brand/40 bg-brand/10 px-3 py-2 text-xs font-semibold text-brand hover:bg-brand/20 transition-colors"
              >
                Apply measurements to quote
              </button>
            )}
          </div>
        )}

        {/* Roof measurements — manual entry (solar quota exhausted) */}
        {isManualEntry && (
          <div className="space-y-2">
            <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Roof Measurements</p>
            <div className="rounded-lg border border-amber-700/40 bg-amber-900/20 px-3 py-2.5 space-y-1">
              <p className="text-xs font-semibold text-amber-300">Solar auto-measure unavailable</p>
              <p className="text-[10px] text-amber-400/70">
                Monthly Solar API quota reached. Enter roof sqft manually.
                {roof.resetDate && ` Auto-measure resets ${roof.resetDate}.`}
              </p>
            </div>
            <div className="flex gap-2 items-center">
              <input
                type="number"
                min="0"
                placeholder="e.g. 1800"
                value={manualSqft}
                onChange={(e) => setManualSqft(e.target.value)}
                className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-brand focus:outline-none"
              />
              <span className="text-xs text-zinc-500 shrink-0">sq ft</span>
            </div>
            {onApplyMeasurements && (
              <button
                disabled={!manualSqft || parseInt(manualSqft, 10) <= 0}
                onClick={() => {
                  const sqft = parseInt(manualSqft, 10);
                  if (sqft > 0) onApplyMeasurements({ slopedSqft: sqft, flatSqft: 0 });
                }}
                className="w-full rounded-lg border border-brand/40 bg-brand/10 px-3 py-2 text-xs font-semibold text-brand hover:bg-brand/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Apply manual measurement to quote
              </button>
            )}
          </div>
        )}

        {/* Property + folio row */}
        {(folio || property || floodZone) && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Property Details</p>
            <div className="space-y-1">
              {folio && (
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-500">Folio</span>
                  <span className="font-mono text-zinc-300">{folio}</span>
                </div>
              )}
              {property?.owner && (
                <div className="flex justify-between text-xs gap-4">
                  <span className="text-zinc-500 shrink-0">Owner</span>
                  <span className="text-zinc-300 text-right truncate max-w-[180px]">{property.owner}</span>
                </div>
              )}
              {property?.yearBuilt && property.yearBuilt > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-500">Year Built</span>
                  <span className="text-zinc-300">{property.yearBuilt}</span>
                </div>
              )}
              {property?.lotSizeSqft && property.lotSizeSqft > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-500">Lot Size</span>
                  <span className="text-zinc-300">{fmt(property.lotSizeSqft)} sq ft</span>
                </div>
              )}
              {floodZone && (
                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-500">Flood Zone</span>
                  <FloodZoneBadge zone={floodZone} />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Permits */}
        {permits && permits.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Recent Permits</p>
            <div className="space-y-1">
              {permits.map((p) => (
                <div key={p.permitNo} className="flex justify-between text-xs">
                  <span className="font-mono text-zinc-400">{p.permitNo}</span>
                  <span className="text-zinc-500">{p.permitType}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
