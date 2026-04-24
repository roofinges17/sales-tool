"use client";

import { useState, useRef } from "react";
import { PlacesAutocompleteInput, type PlaceResult } from "@/components/ui/PlacesAutocompleteInput";
import { Button } from "@/components/ui/Button";

export interface RoofData {
  totalSqft: number;
  slopedSqft: number;
  flatSqft: number;
  pitchRatio: string;
  segmentCount: number;
  hasFlat: boolean;
  lat: number;
  lng: number;
}

interface ServerRoofResponse {
  pitchedArea: number;
  flatArea: number;
  totalArea: number;
  pitch: string;
  segmentCount: number;
  segments: { pitchDegrees: number; azimuthDegrees: number; areaSqFt: number }[];
}

interface RoofMeasureProps {
  onMeasured?: (data: RoofData) => void;
  className?: string;
}

const MAPS_STATIC_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_STATIC_KEY ?? "";

function fmt(n: number) {
  return new Intl.NumberFormat("en-US").format(n);
}

export function RoofMeasure({ onMeasured, className }: RoofMeasureProps) {
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState("");
  const [roofData, setRoofData] = useState<RoofData | null>(null);
  const [satelliteUrl, setSatelliteUrl] = useState("");
  const latRef = useRef<number | null>(null);
  const lngRef = useRef<number | null>(null);

  function handlePlaceSelect(place: PlaceResult) {
    setAddress(place.formattedAddress);
    latRef.current = place.lat;
    lngRef.current = place.lng;
    setError("");
  }

  async function measure() {
    if (!address.trim()) return;
    setLoading(true);
    setError("");
    setLoadingStep(1);

    try {
      let lat = latRef.current;
      let lng = lngRef.current;

      if (!lat || !lng) {
        // Fallback geocode via static maps API (browser-safe)
        const geoRes = await fetch(
          `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${MAPS_STATIC_KEY}`
        );
        const geoData = await geoRes.json();
        if (!geoData.results?.length) throw new Error("Address not found");
        lat = geoData.results[0].geometry.location.lat as number;
        lng = geoData.results[0].geometry.location.lng as number;
      }

      setLoadingStep(2);

      const res = await fetch(`/api/solar?lat=${lat}&lng=${lng}`);

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error || "Failed to measure roof");
      }

      const serverData = await res.json() as ServerRoofResponse;

      setLoadingStep(3);

      const data: RoofData = {
        totalSqft: serverData.totalArea,
        slopedSqft: serverData.pitchedArea,
        flatSqft: serverData.flatArea,
        pitchRatio: serverData.pitch,
        segmentCount: serverData.segmentCount,
        hasFlat: serverData.flatArea > 0,
        lat: lat!,
        lng: lng!,
      };

      setRoofData(data);
      if (MAPS_STATIC_KEY) {
        setSatelliteUrl(
          `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=20&size=600x300&maptype=satellite&key=${MAPS_STATIC_KEY}`
        );
      }
      onMeasured?.(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Measurement failed");
    } finally {
      setLoading(false);
      setLoadingStep(0);
    }
  }

  function reset() {
    setRoofData(null);
    setSatelliteUrl("");
    setAddress("");
    setError("");
    latRef.current = null;
    lngRef.current = null;
  }

  return (
    <div className={`rounded-lg border border-border-subtle bg-surface-1 overflow-hidden${className ? ` ${className}` : ""}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-border-subtle bg-gradient-to-r from-accent/10 to-status-teal/10 flex items-center gap-2">
        <svg className="w-4 h-4 text-status-teal flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <h3 className="text-body-sm font-semibold text-text-primary">AI Roof Measurement</h3>
        <span className="inline-flex items-center whitespace-nowrap px-2 py-0.5 rounded-full font-medium border bg-status-teal/10 text-status-teal border-status-teal/20 text-xs">
          Satellite
        </span>
      </div>

      <div className="p-4">
        {!roofData ? (
          <div className="space-y-3">
            <p className="text-caption text-text-tertiary">
              Enter property address to measure roof area using satellite imagery
            </p>
            <div className="flex gap-2">
              <PlacesAutocompleteInput
                value={address}
                onChange={(v) => { setAddress(v); latRef.current = null; lngRef.current = null; }}
                onSelect={handlePlaceSelect}
                placeholder="Enter property address..."
                className="flex-1"
              />
              <Button
                onClick={measure}
                loading={loading}
                disabled={!address.trim() || loading}
              >
                {loading ? "Measuring" : "Measure"}
              </Button>
            </div>

            {loading && (
              <div className="space-y-2 pt-1">
                {([
                  { step: 1, label: "Finding location…" },
                  { step: 2, label: "Analyzing satellite imagery…" },
                  { step: 3, label: "Calculating roof area…" },
                ] as const).map(({ step, label }) => (
                  <div key={step} className="flex items-center gap-2 text-caption">
                    {loadingStep > step ? (
                      <svg className="w-4 h-4 text-status-green flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : loadingStep === step ? (
                      <svg className="w-4 h-4 text-accent animate-spin flex-shrink-0" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    ) : (
                      <div className="w-4 h-4 rounded-full border border-border flex-shrink-0" />
                    )}
                    <span className={loadingStep >= step ? "text-text-secondary" : "text-text-muted"}>
                      {label}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {error && (
              <p className="text-caption text-red-400">{error}</p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {/* Satellite image */}
            {satelliteUrl && (
              <div className="rounded-md overflow-hidden border border-border-subtle">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={satelliteUrl} alt="Satellite view" className="w-full h-36 object-cover" />
              </div>
            )}

            {/* Measurements */}
            <div className="space-y-2">
              <div className="flex items-center justify-between px-3 py-2 rounded-md bg-surface-2">
                <span className="text-caption text-text-tertiary">Total Roof Area</span>
                <span className="text-body-sm font-semibold text-text-primary">{fmt(roofData.totalSqft)} sq ft</span>
              </div>

              <div className="flex items-center justify-between px-3 py-2 rounded-md bg-surface-2">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-accent flex-shrink-0" />
                  <span className="text-caption text-text-tertiary">Sloped Area</span>
                </div>
                <span className="text-body-sm font-medium text-accent">{fmt(roofData.slopedSqft)} sq ft</span>
              </div>

              {roofData.hasFlat && (
                <div className="flex items-center justify-between px-3 py-2 rounded-md bg-surface-2">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-status-orange flex-shrink-0" />
                    <span className="text-caption text-text-tertiary">Flat Area</span>
                  </div>
                  <span className="text-body-sm font-medium text-status-orange">{fmt(roofData.flatSqft)} sq ft</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div className="px-3 py-2 rounded-md bg-surface-2">
                  <p className="text-[10px] text-text-muted">Avg Pitch</p>
                  <p className="text-body-sm font-medium text-text-primary">{roofData.pitchRatio}</p>
                </div>
                <div className="px-3 py-2 rounded-md bg-surface-2">
                  <p className="text-[10px] text-text-muted">Segments</p>
                  <p className="text-body-sm font-medium text-text-primary">{roofData.segmentCount}</p>
                </div>
              </div>
            </div>

            <p className="text-[10px] text-text-muted">
              Includes 2% waste factor · {roofData.segmentCount} segments detected
            </p>

            <Button variant="ghost" onClick={reset} className="w-full text-text-tertiary text-sm">
              Measure Different Address
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
