"use client";

import { useState } from "react";
import { authedFetch } from "@/lib/api";
import { PlacesAutocompleteInput, type PlaceResult } from "@/components/ui/PlacesAutocompleteInput";
import { Button } from "@/components/ui/Button";
import { AddressIntelCard, type AddressIntelResult } from "@/components/AddressIntelCard";

type Step = "idle" | "loading" | "done" | "error";

const LOAD_STEPS = [
  { step: 1, label: "Locating address…" },
  { step: 2, label: "Measuring roof from satellite…" },
  { step: 3, label: "Looking up property records…" },
  { step: 4, label: "Checking flood zone…" },
];

export default function MeasurePage() {
  const [address, setAddress] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [zip, setZip] = useState("");
  const [step, setStep] = useState<Step>("idle");
  const [loadStep, setLoadStep] = useState(0);
  const [intel, setIntel] = useState<AddressIntelResult | null>(null);
  const [error, setError] = useState("");

  function handlePlaceSelect(place: PlaceResult) {
    setAddress(place.formattedAddress);
    setLat(place.lat);
    setLng(place.lng);
    // Extract ZIP from formatted address
    const zipMatch = place.formattedAddress.match(/\b(\d{5})\b/);
    setZip(zipMatch?.[1] ?? "");
    setIntel(null);
    setStep("idle");
    setError("");
  }

  async function analyze() {
    if (!address || lat == null || lng == null) return;
    setStep("loading");
    setError("");
    setIntel(null);

    // Simulate step progression for UX (parallel calls inside CF Function)
    const stepTimer = setInterval(() => {
      setLoadStep((s) => Math.min(s + 1, LOAD_STEPS.length));
    }, 700);

    try {
      setLoadStep(1);
      const res = await authedFetch("/api/address-intel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, lat, lng, zip }),
      });
      clearInterval(stepTimer);
      setLoadStep(LOAD_STEPS.length + 1);

      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = (await res.json()) as AddressIntelResult;
      setIntel(data);
      setStep("done");
    } catch (err) {
      clearInterval(stepTimer);
      setError(err instanceof Error ? err.message : "Analysis failed — please try again.");
      setStep("error");
    } finally {
      setLoadStep(0);
    }
  }

  function reset() {
    setAddress("");
    setLat(null);
    setLng(null);
    setZip("");
    setIntel(null);
    setStep("idle");
    setError("");
    setLoadStep(0);
  }

  return (
    <div className="mx-auto max-w-2xl py-8 px-4">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand/20 to-status-teal/20 flex items-center justify-center">
            <svg className="w-5 h-5 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h1 className="text-heading-lg text-text-primary">Address Intelligence</h1>
            <p className="text-body text-text-tertiary">Roof area · folio · flood zone · property records — one address</p>
          </div>
        </div>
      </div>

      {/* Search card */}
      <div className="rounded-xl border border-border-subtle bg-surface-1 p-5 mb-4">
        <p className="text-caption text-text-tertiary mb-3">
          Enter a South Florida property address to analyze
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <PlacesAutocompleteInput
            value={address}
            onChange={(v) => { setAddress(v); setLat(null); setLng(null); }}
            onSelect={handlePlaceSelect}
            placeholder="Enter property address…"
            className="flex-1 min-w-0"
          />
          <Button
            onClick={analyze}
            loading={step === "loading"}
            disabled={!address.trim() || lat == null || step === "loading"}
            className="w-full sm:w-auto shrink-0"
          >
            {step === "loading" ? "Analyzing" : "Analyze"}
          </Button>
        </div>

        {/* Load step progress */}
        {step === "loading" && (
          <div className="mt-4 space-y-1.5">
            {LOAD_STEPS.map(({ step: s, label }) => (
              <div key={s} className="flex items-center gap-2 text-caption">
                {loadStep > s ? (
                  <svg className="w-4 h-4 text-status-green shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : loadStep === s ? (
                  <svg className="w-4 h-4 text-brand animate-spin shrink-0" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <div className="w-4 h-4 rounded-full border border-border shrink-0" />
                )}
                <span className={loadStep >= s ? "text-text-secondary" : "text-text-muted"}>{label}</span>
              </div>
            ))}
          </div>
        )}

        {error && (
          <p className="mt-3 text-caption text-red-400">{error}</p>
        )}
      </div>

      {/* Satellite thumbnail — shown as soon as lat/lng are known */}
      {lat !== null && lng !== null && step === "done" && (
        <div className="mb-4 rounded-xl overflow-hidden border border-border-subtle">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=20&size=600x400&maptype=satellite&markers=color:red%7C${lat},${lng}&key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_STATIC_KEY ?? ""}`}
            alt="Satellite view of property"
            className="w-full max-h-64 object-cover"
            style={{ display: "block" }}
          />
          <div className="px-3 py-1.5 bg-surface-1 border-t border-border-subtle">
            <p className="text-xs text-text-tertiary truncate">{address}</p>
          </div>
        </div>
      )}

      {/* Results */}
      {intel && step === "done" && (
        <div className="space-y-4">
          <AddressIntelCard data={intel} />

          <div className="flex gap-2">
            <a
              href="/quotes/builder/"
              className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg font-medium text-sm bg-gradient-accent text-white shadow-glow-sm hover:shadow-glow hover:brightness-110 transition-all"
            >
              Use in Quote Builder
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </a>
            <Button variant="ghost" onClick={reset} className="text-text-tertiary text-sm">
              New Search
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
