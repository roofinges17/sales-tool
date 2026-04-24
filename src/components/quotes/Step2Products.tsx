"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useQuoteBuilder } from "@/lib/contexts/QuoteBuilderContext";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { geocodeAddress, MAPS_KEY_CONFIGURED } from "@/lib/maps";
import { PlacesAutocompleteInput, type PlaceResult } from "@/components/ui/PlacesAutocompleteInput";
import { pitchMultiplier } from "@/lib/pitch";
import MapDrawingCanvas, { type DrawnSection } from "@/components/MapDrawingCanvas";
import type { CartItem } from "@/lib/contexts/QuoteBuilderContext";

interface Product {
  id: string;
  name: string;
  code?: string | null;
  description?: string | null;
  product_type: "PRODUCT" | "SERVICE";
  default_price?: number | null;
  price?: number | null;
  cost?: number | null;
  min_price?: number | null;
  max_price?: number | null;
  unit?: string | null;
}

function fmt(v: number | null | undefined) {
  if (v == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);
}

type FilterTab = "All" | "Roof Type" | "Extra";
const FILTER_TABS: FilterTab[] = ["All", "Roof Type", "Extra"];
const ROOF_CODES = ["ALUMINUM", "FLAT", "FLAT INSULATIONS", "METAL", "SHINGLE", "TILE"];

function isRoofCode(code: string | null | undefined) {
  return ROOF_CODES.includes((code ?? "").toUpperCase());
}

export default function Step2Products() {
  const { state, addToCart, removeFromCart, updateCartQty, updateCartPrice, setStep, subtotal, setVisualization, setFolioNumber } = useQuoteBuilder();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterTab, setFilterTab] = useState<FilterTab>("All");
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [priceInput, setPriceInput] = useState("");
  const [manualSqftId, setManualSqftId] = useState<string | null>(null);
  const [manualSqftInput, setManualSqftInput] = useState("");

  // Measurement state
  const [address, setAddress] = useState("");
  const [measuring, setMeasuring] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState("");
  const [geoResult, setGeoResult] = useState<{ lat: number; lng: number; formattedAddress: string } | null>(null);
  const [canvasOpen, setCanvasOpen] = useState(false);
  const [drawnSections, setDrawnSections] = useState<DrawnSection[]>([]);

  useEffect(() => {
    if (!state.departmentId) return;
    supabase()
      .from("products")
      .select("*")
      .eq("department_id", state.departmentId)
      .eq("is_active", true)
      .order("name")
      .then(({ data }) => {
        setProducts((data as Product[]) ?? []);
        setLoading(false);
      });
  }, [state.departmentId]);

  const filteredProducts = products.filter((p) => {
    if ((p.default_price ?? p.price ?? 0) <= 0) return false;
    const matchSearch =
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.code ?? "").toLowerCase().includes(search.toLowerCase());
    const matchTab =
      filterTab === "All" ||
      (filterTab === "Roof Type" && ROOF_CODES.includes((p.code ?? "").toUpperCase())) ||
      (filterTab === "Extra" && !ROOF_CODES.includes((p.code ?? "").toUpperCase()));
    return matchSearch && matchTab;
  });

  function handleAddProduct(product: Product) {
    const unitPrice = product.default_price ?? product.price ?? 0;
    const item: Omit<CartItem, "line_total"> = {
      product_id: product.id,
      product_name: product.name,
      product_sku: product.code,
      product_description: product.description,
      quantity: 1,
      unit_price: unitPrice,
      unit_cost: product.cost,
      min_price: product.min_price,
      max_price: product.max_price,
      default_price: product.default_price ?? product.price,
      product_type: product.product_type,
      unit: product.unit,
    };
    addToCart(item);
  }

  function handleAddManual(product: Product) {
    const sqft = parseFloat(manualSqftInput);
    if (isNaN(sqft) || sqft <= 0) return;
    const pricePerSqft = product.default_price ?? product.price ?? 0;
    const lineTotal = pricePerSqft * sqft;
    const item: Omit<CartItem, "line_total"> = {
      product_id: product.id,
      product_name: product.name,
      product_sku: product.code,
      product_description: `${sqft} sq ft manual entry`,
      quantity: 1,
      unit_price: lineTotal,
      unit_cost: product.cost,
      min_price: product.min_price,
      max_price: product.max_price,
      default_price: product.default_price ?? product.price,
      product_type: product.product_type,
      unit: "sq ft",
      is_manual_qty: true,
    };
    addToCart(item);
    setManualSqftId(null);
    setManualSqftInput("");
  }

  function startEditPrice(item: CartItem) {
    setEditingPriceId(item.product_id);
    setPriceInput(item.unit_price.toString());
  }

  function commitPrice(productId: string) {
    const val = parseFloat(priceInput);
    if (!isNaN(val)) updateCartPrice(productId, val);
    setEditingPriceId(null);
  }

  async function handleMeasure() {
    if (!address.trim()) return;
    setGeoLoading(true);
    setGeoError("");
    const result = await geocodeAddress(address.trim());
    setGeoLoading(false);
    if (!result) {
      setGeoError("Address not found");
      return;
    }
    setGeoResult(result);
    setCanvasOpen(true);
  }

  const handlePlaceSelect = useCallback((place: PlaceResult) => {
    setGeoError("");
    setGeoResult(place);
    setCanvasOpen(true);
    // Fire folio lookup in background — pre-populate Step 3 field
    const addr = place.formattedAddress;
    const parts = addr.split(",").map((s) => s.trim());
    const street = parts[0] ?? addr;
    const city = parts[1] ?? "";
    const stateZip = (parts[2] ?? "").trim();
    const zip = stateZip.replace(/[^0-9]/g, "").slice(0, 5);
    fetch("/api/folio-lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: street, city, zip }),
    })
      .then((r) => r.ok ? r.json() : null)
      .then((d: { folio?: string | null } | null) => {
        if (d?.folio) setFolioNumber(d.folio);
      })
      .catch(() => {/* non-blocking */});
  }, [setFolioNumber]);

  function handleSaveSections(sections: DrawnSection[], compositeDataUrl?: string | null, colorId?: string | null) {
    setDrawnSections(sections);
    if (colorId !== undefined) setVisualization(colorId, compositeDataUrl ?? null);
    setCanvasOpen(false);

    // Add sections as cart line items
    for (const sec of sections) {
      if (!sec.productId) continue;
      const existingProduct = products.find((p) => p.id === sec.productId);
      const item: Omit<CartItem, "line_total"> = {
        product_id: `${sec.productId}_${sec.id}`, // unique per section
        product_name: `${sec.productName} (${Math.round(sec.actualSqft)} sf)`,
        product_sku: sec.productCode,
        product_description: `${sec.sectionType}${sec.sectionType === "SLOPED" ? ` · ${sec.pitch}` : ""} · ${Math.round(sec.planarSqft)} sf planar → ${Math.round(sec.actualSqft)} sf actual`,
        quantity: 1,
        unit_price: sec.lineTotal,
        unit_cost: existingProduct?.cost ?? null,
        min_price: existingProduct?.min_price ?? null,
        max_price: existingProduct?.max_price ?? null,
        default_price: sec.lineTotal,
        product_type: "PRODUCT",
        unit: "section",
      };
      addToCart(item);
    }
  }

  // Only roof products are selectable inside the drawing canvas
  const mapProducts = products
    .filter((p) => p.default_price != null && isRoofCode(p.code))
    .map((p) => ({
      id: p.id,
      name: p.name,
      code: p.code ?? "",
      default_price: p.default_price ?? 0,
    }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
      {/* Left: Product Catalog */}
      <div className="space-y-4">
        <div className="space-y-1.5">
          <div className="relative">
            <input
              className="w-full h-9 rounded-md border px-3 text-text-primary placeholder:text-text-muted border-border hover:border-border-strong focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none transition-colors duration-150 bg-surface-2"
              placeholder="Search products..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 flex-wrap">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setFilterTab(tab)}
              className={`px-4 py-2 rounded-md font-medium transition-colors text-sm ${
                filterTab === tab
                  ? "bg-accent text-white"
                  : "bg-surface-2 text-text-secondary hover:bg-surface-3"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Product list */}
        {loading ? (
          <div className="flex items-center justify-center py-12 text-text-muted text-sm">
            <svg className="mr-2 h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading…
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="py-12 text-center text-text-muted text-sm">
            No products found.{" "}
            <a href="/admin/settings/products/" className="text-accent hover:underline">
              Add products in Settings.
            </a>
          </div>
        ) : (
          <div className="rounded-lg border border-border-subtle bg-surface-1 overflow-hidden">
            <div className="divide-y divide-border-subtle">
              {filteredProducts.map((product) => {
                const inCart = state.cart.find((c) => c.product_id === product.id);
                return (
                  <div key={product.id} className="flex items-center justify-between gap-4 p-4 hover:bg-surface-3 transition-colors">
                    <div className="min-w-0 flex-1">
                      <p className="text-body-sm font-semibold text-text-primary truncate">{product.name}</p>
                      {product.code && <p className="text-caption text-text-muted font-mono">{product.code}</p>}
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="inline-flex items-center whitespace-nowrap px-2 py-0.5 rounded-full font-medium border bg-accent-subtle text-accent border-accent/20 text-xs">
                        {product.product_type}
                      </span>
                      <span className="text-caption text-text-tertiary">{product.unit ?? "sq ft"}</span>
                      <span className="text-body-sm font-medium text-status-green min-w-[4rem] text-right">
                        {fmt(product.default_price ?? product.price)}
                      </span>
                      {isRoofCode(product.code) ? (
                        <div className="flex items-center gap-1.5">
                          <span className="w-8 h-8 rounded-full bg-status-teal/10 text-status-teal flex items-center justify-center" title="Add via satellite measurement">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                            </svg>
                          </span>
                          {manualSqftId === product.id ? (
                            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="number"
                                min="1"
                                step="1"
                                autoFocus
                                value={manualSqftInput}
                                onChange={(e) => setManualSqftInput(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleAddManual(product);
                                  if (e.key === "Escape") { setManualSqftId(null); setManualSqftInput(""); }
                                }}
                                placeholder="sq ft"
                                className="w-20 rounded border border-accent bg-surface-2 px-2 py-0.5 text-xs text-text-primary outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                              <button
                                onClick={() => handleAddManual(product)}
                                className="h-6 px-2 rounded bg-accent text-white text-xs font-medium hover:brightness-110 transition"
                              >
                                Add
                              </button>
                              <button
                                onClick={() => { setManualSqftId(null); setManualSqftInput(""); }}
                                className="h-6 w-6 rounded bg-surface-3 text-text-muted text-xs flex items-center justify-center hover:bg-surface-2 transition"
                              >✕</button>
                            </div>
                          ) : (
                            <button
                              onClick={() => { setManualSqftId(product.id); setManualSqftInput(""); }}
                              className="text-xs text-text-muted hover:text-accent transition whitespace-nowrap"
                              title="Enter sq ft manually"
                            >
                              sq ft
                            </button>
                          )}
                        </div>
                      ) : (
                        <button
                          onClick={() => handleAddProduct(product)}
                          className="w-8 h-8 rounded-full bg-status-green/20 text-status-green hover:bg-status-green/30 flex items-center justify-center transition-colors"
                          aria-label={`Add ${product.name}`}
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Right sidebar */}
      <div className="space-y-4">
        {/* Roof Measurement card */}
        <div className="rounded-lg border border-border-subtle bg-surface-1 overflow-hidden">
          <div className="px-4 py-3 border-b border-border-subtle bg-gradient-to-r from-accent/10 to-status-teal/10 flex items-center gap-2">
            <svg className="w-4 h-4 text-status-teal flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="text-body-sm font-semibold text-text-primary">Roof Measurement</h3>
            <span className="inline-flex items-center whitespace-nowrap px-2 py-0.5 rounded-full font-medium border bg-status-teal/10 text-status-teal border-status-teal/20 text-xs">
              Satellite
            </span>
          </div>
          <div className="p-4">
            <div className="space-y-3">
              <p className="text-caption text-text-tertiary">
                Enter property address to measure roof area using satellite imagery
              </p>
              {!MAPS_KEY_CONFIGURED && (
                <p className="text-caption text-amber-400 bg-amber-400/10 rounded-md px-3 py-2">
                  Satellite measurement is unavailable. Contact your administrator to enable it.
                </p>
              )}
              <div className="flex gap-2">
                <PlacesAutocompleteInput
                  value={address}
                  onChange={(v) => { setAddress(v); setGeoError(""); }}
                  onSelect={handlePlaceSelect}
                  placeholder="Enter property address..."
                  className="flex-1 h-9 rounded-md border bg-surface-2 text-body text-text-primary border-border hover:border-border-strong focus-within:border-accent focus-within:ring-1 focus-within:ring-accent transition-colors overflow-hidden"
                />
                <button
                  onClick={handleMeasure}
                  disabled={!address.trim() || geoLoading || !MAPS_KEY_CONFIGURED}
                  className="inline-flex items-center justify-center font-medium rounded-md transition-all duration-150 disabled:opacity-50 disabled:pointer-events-none bg-gradient-accent shadow-glow-sm hover:shadow-glow hover:brightness-110 active:brightness-95 h-9 px-4 text-body text-white gap-2"
                >
                  {geoLoading ? (
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : "Measure"}
                </button>
              </div>
              {geoError && <p className="text-caption text-red-400">{geoError}</p>}
              {drawnSections.length > 0 && (
                <div className="rounded-md bg-surface-3 p-2 space-y-1">
                  {drawnSections.map((sec) => (
                    <div key={sec.id} className="flex justify-between text-xs">
                      <span className="text-text-tertiary">{sec.sectionType} · {Math.round(sec.actualSqft)} sf</span>
                      <span className="text-text-primary font-medium">${sec.lineTotal.toFixed(2)}</span>
                    </div>
                  ))}
                  <button
                    onClick={() => setCanvasOpen(true)}
                    className="w-full mt-1 py-1 rounded text-xs text-accent hover:text-accent-light transition-colors text-center"
                  >
                    Edit measurements
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Estimate Items card */}
        <div className="rounded-lg border border-border-subtle bg-surface-1 overflow-hidden">
          <div className="px-4 py-3 border-b border-border-subtle bg-surface-2">
            <h3 className="text-heading-sm text-text-primary">Estimate Items</h3>
            <p className="text-caption text-text-tertiary">{state.cart.length} items</p>
          </div>

          {state.cart.length === 0 ? (
            <div className="p-8 text-center">
              <div className="w-10 h-10 rounded-lg bg-surface-3 flex items-center justify-center mx-auto mb-3">
                <svg className="w-5 h-5 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="text-body-sm text-text-tertiary">No items added</p>
              <p className="text-caption text-text-muted">Add products from the catalog to build your estimate</p>
            </div>
          ) : (
            <div className="divide-y divide-border-subtle">
              {state.cart.map((item) => {
                const isMeasured = item.unit === "section";
                return (
                  <div key={item.product_id} className="p-3">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-body-sm font-medium text-text-primary truncate">{item.product_name}</p>
                        {item.product_description && (
                          <p className="text-caption text-text-muted truncate">{item.product_description}</p>
                        )}
                        {item.is_manual_qty && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30 mt-0.5">
                            MANUAL OVERRIDE
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => removeFromCart(item.product_id)}
                        className="shrink-0 text-text-muted hover:text-red-400 transition p-0.5"
                      >
                        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    {isMeasured ? (
                      // Measured roof section — area is baked into line_total, no qty control
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-caption text-text-muted">measured area</span>
                        <span className="text-xs font-semibold text-text-primary">{fmt(item.line_total)}</span>
                      </div>
                    ) : (
                      // Qty-based item — direct-entry number input + optional ±1 steppers
                      <div className="flex items-center gap-2 justify-between">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => updateCartQty(item.product_id, item.quantity - 1)}
                            disabled={item.quantity <= 1}
                            className="h-6 w-6 rounded bg-surface-3 text-text-secondary flex items-center justify-center text-xs hover:bg-surface-2 disabled:opacity-40"
                          >−</button>
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => {
                              const v = parseInt(e.target.value);
                              if (!isNaN(v) && v > 0) updateCartQty(item.product_id, v);
                            }}
                            className="w-10 text-center text-xs text-text-primary bg-surface-2 border border-border rounded px-1 py-0.5 outline-none focus:border-accent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <button
                            onClick={() => updateCartQty(item.product_id, item.quantity + 1)}
                            className="h-6 w-6 rounded bg-surface-3 text-text-secondary flex items-center justify-center text-xs hover:bg-surface-2"
                          >+</button>
                        </div>
                        {editingPriceId === item.product_id ? (
                          <input
                            type="number"
                            step="0.01"
                            value={priceInput}
                            onChange={(e) => setPriceInput(e.target.value)}
                            onBlur={() => commitPrice(item.product_id)}
                            onKeyDown={(e) => e.key === "Enter" && commitPrice(item.product_id)}
                            autoFocus
                            className="w-20 rounded border border-accent bg-surface-2 px-2 py-0.5 text-xs text-text-primary outline-none"
                          />
                        ) : (
                          <button
                            onClick={() => startEditPrice(item)}
                            className="text-xs text-text-secondary hover:text-accent transition font-medium"
                          >
                            {fmt(item.unit_price)}
                          </button>
                        )}
                        <span className="text-xs font-semibold text-text-primary">{fmt(item.line_total)}</span>
                      </div>
                    )}
                  </div>
                );
              })}
              <div className="px-3 py-2 flex justify-between items-center bg-surface-2">
                <span className="text-caption text-text-tertiary">Subtotal</span>
                <span className="text-body-sm font-bold text-text-primary">{fmt(subtotal)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="space-y-2">
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setStep(1)}>Back</Button>
            <Button
              className="flex-1"
              disabled={state.cart.length === 0}
              onClick={() => setStep(3)}
            >
              Next: Customer
            </Button>
          </div>
          {state.cart.length === 0 && (
            <p className="text-center text-caption text-text-muted">
              Add at least one item to continue.
            </p>
          )}
        </div>
      </div>

      {/* MapDrawingCanvas modal */}
      {canvasOpen && geoResult && (
        <MapDrawingCanvas
          lat={geoResult.lat}
          lng={geoResult.lng}
          zoom={20}
          products={mapProducts}
          sections={drawnSections}
          onChange={setDrawnSections}
          onClose={() => setCanvasOpen(false)}
          onSave={(dataUrl, colorId) => handleSaveSections(drawnSections, dataUrl, colorId)}
        />
      )}
    </div>
  );
}
