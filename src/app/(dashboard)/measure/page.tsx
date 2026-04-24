"use client";

import { useState, useCallback } from "react";
import { geocodeAddress, MAPS_KEY_CONFIGURED } from "@/lib/maps";
import { supabase } from "@/lib/supabase";
import MapDrawingCanvas, { type DrawnSection } from "@/components/MapDrawingCanvas";
import { PlacesAutocompleteInput, type PlaceResult } from "@/components/ui/PlacesAutocompleteInput";

interface Product {
  id: string;
  name: string;
  code: string;
  default_price: number;
}

export default function MeasurePage() {
  const [address, setAddress] = useState("");
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState("");
  const [geoResult, setGeoResult] = useState<{ lat: number; lng: number; formattedAddress: string } | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [sections, setSections] = useState<DrawnSection[]>([]);
  const [canvasOpen, setCanvasOpen] = useState(false);
  const [saved, setSaved] = useState(false);

  async function openCanvas(result: { lat: number; lng: number; formattedAddress: string }) {
    setGeoResult(result);
    const { data } = await supabase().from("products").select("id, name, code, default_price").eq("is_active", true).order("name");
    setProducts(((data ?? []) as Product[]).filter((p) => p.default_price != null));
    setCanvasOpen(true);
  }

  async function handleMeasure() {
    if (!address.trim()) return;
    setGeoLoading(true);
    setGeoError("");
    const result = await geocodeAddress(address.trim());
    setGeoLoading(false);
    if (!result) {
      setGeoError("Address not found. Check the address and try again.");
      return;
    }
    await openCanvas(result);
  }

  const handlePlaceSelect = useCallback(async (place: PlaceResult) => {
    setGeoError("");
    setGeoLoading(true);
    await openCanvas(place);
    setGeoLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSave(updatedSections: DrawnSection[]) {
    setSections(updatedSections);
    setCanvasOpen(false);
    if (updatedSections.length > 0) setSaved(true);
  }

  const totalSqft = Math.round(sections.reduce((s, x) => s + x.actualSqft, 0));
  const totalCost = sections.reduce((s, x) => s + x.lineTotal, 0);

  return (
    <div className="mx-auto max-w-3xl py-8 px-4">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent/20 to-status-teal/20 flex items-center justify-center">
            <svg className="w-5 h-5 text-status-teal" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h1 className="text-heading-lg text-text-primary">Roof Measurement</h1>
            <p className="text-body text-text-tertiary">Measure roof sections from satellite imagery</p>
          </div>
          <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-status-teal/10 text-status-teal border-status-teal/20">Satellite</span>
        </div>
      </div>

      {/* Address input card */}
      <div className="rounded-xl border border-border-subtle bg-surface-1 overflow-hidden mb-6">
        <div className="px-5 py-4 border-b border-border-subtle bg-surface-2">
          <h2 className="text-heading-sm text-text-primary">Property Address</h2>
          <p className="text-caption text-text-tertiary">Enter the property address to load satellite imagery</p>
        </div>
        <div className="p-5">
          {!MAPS_KEY_CONFIGURED && (
            <div className="mb-4 rounded-md bg-amber-400/10 border border-amber-400/20 px-4 py-3 text-sm text-amber-300">
              Satellite imagery is currently unavailable. Contact your administrator to enable it.
            </div>
          )}
          <div className="flex gap-3">
            <PlacesAutocompleteInput
              value={address}
              onChange={(v) => { setAddress(v); setGeoError(""); }}
              onSelect={handlePlaceSelect}
              placeholder="e.g. 1234 Oak St, Orlando, FL 32801"
              className="flex-1"
            />
            <button
              onClick={handleMeasure}
              disabled={!address.trim() || geoLoading || !MAPS_KEY_CONFIGURED}
              className="inline-flex items-center gap-2 px-5 h-10 rounded-lg font-medium text-sm bg-gradient-accent text-white shadow-glow-sm hover:shadow-glow hover:brightness-110 disabled:opacity-50 disabled:pointer-events-none transition-all"
            >
              {geoLoading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Locating…
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                  </svg>
                  Measure
                </>
              )}
            </button>
          </div>
          {geoError && <p className="mt-2 text-sm text-red-400">{geoError}</p>}
          {geoResult && !canvasOpen && (
            <p className="mt-2 text-caption text-status-green">
              ✓ Located: {geoResult.formattedAddress}
            </p>
          )}
        </div>
      </div>

      {/* Results */}
      {saved && sections.length > 0 && (
        <div className="rounded-xl border border-border-subtle bg-surface-1 overflow-hidden">
          <div className="px-5 py-4 border-b border-border-subtle bg-surface-2 flex items-center justify-between">
            <div>
              <h2 className="text-heading-sm text-text-primary">Measurement Results</h2>
              <p className="text-caption text-text-tertiary">{sections.length} section{sections.length !== 1 ? "s" : ""} · {totalSqft} sf total</p>
            </div>
            <button
              onClick={() => setCanvasOpen(true)}
              className="text-sm text-accent hover:text-accent-light transition-colors"
            >
              Edit
            </button>
          </div>
          <div className="divide-y divide-border-subtle">
            {sections.map((sec) => (
              <div key={sec.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium mr-2 ${sec.sectionType === "FLAT" ? "bg-blue-500/20 text-blue-300" : "bg-orange-500/20 text-orange-300"}`}>
                    {sec.sectionType}
                  </span>
                  <span className="text-body-sm text-text-primary">{sec.productName}</span>
                  {sec.sectionType === "SLOPED" && <span className="text-caption text-text-muted ml-2">{sec.pitch}</span>}
                </div>
                <div className="text-right">
                  <p className="text-body-sm text-text-primary font-semibold">${sec.lineTotal.toFixed(2)}</p>
                  <p className="text-caption text-text-muted">{Math.round(sec.actualSqft)} sf</p>
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between px-5 py-3 bg-surface-2">
              <span className="text-body-sm font-semibold text-text-primary">Total</span>
              <div className="text-right">
                <p className="text-body-sm font-bold text-text-primary">${totalCost.toFixed(2)}</p>
                <p className="text-caption text-text-muted">{totalSqft} sf</p>
              </div>
            </div>
          </div>
          <div className="p-5">
            <a
              href="/quotes/builder"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-sm bg-gradient-accent text-white shadow-glow-sm hover:shadow-glow hover:brightness-110 transition-all"
            >
              Use in Quote Builder
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </a>
          </div>
        </div>
      )}

      {/* MapDrawingCanvas */}
      {canvasOpen && geoResult && (
        <MapDrawingCanvas
          lat={geoResult.lat}
          lng={geoResult.lng}
          zoom={20}
          products={products}
          sections={sections}
          onChange={setSections}
          onClose={() => handleSave(sections)}
        />
      )}
    </div>
  );
}
