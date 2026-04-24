"use client";

// Expandable material analysis panel for Step 2 Products.
// Accepts exterior house photos → calls /api/vision/material-detect → shows soffit/fascia/gutter
// estimates with color swatches, damage badges, and linear footage for cart auto-fill.

import { useRef, useState } from "react";

export interface MaterialItem {
  material_type: "soffit" | "fascia" | "gutter";
  linear_feet: number;
  damage_severity: "none" | "minor" | "moderate" | "severe";
  color_hex: string;
  recommended_action: string;
  suggested_sku: string | null;
  notes: string;
  confidence: "low" | "medium" | "high";
}

interface Product {
  id: string;
  name: string;
  code?: string | null;
  default_price?: number | null;
  price?: number | null;
  cost?: number | null;
  min_price?: number | null;
  max_price?: number | null;
  unit?: string | null;
  product_type: "PRODUCT" | "SERVICE";
}

interface MaterialAnalysisProps {
  products: Product[];
  onAddToCart: (items: Array<{
    product: Product;
    quantity: number;
    materialItem: MaterialItem;
  }>) => void;
}

const SEVERITY_COLOR: Record<string, string> = {
  none: "bg-emerald-900/40 text-emerald-300 border border-emerald-700/30",
  minor: "bg-amber-900/40 text-amber-300 border border-amber-700/30",
  moderate: "bg-orange-900/40 text-orange-300 border border-orange-700/30",
  severe: "bg-red-900/40 text-red-300 border border-red-700/30",
};

const CONFIDENCE_LABEL: Record<string, string> = {
  low: "~",
  medium: "",
  high: "",
};

const MATERIAL_LABEL: Record<string, string> = {
  soffit: "Soffit",
  fascia: "Fascia",
  gutter: "Gutters",
};

function matchProduct(sku: string | null, products: Product[]): Product | null {
  if (!sku) return null;
  const target = sku.toUpperCase();
  return products.find((p) => (p.code ?? "").toUpperCase() === target) ?? null;
}

function fileToBase64(file: File): Promise<{ base64: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const [header, base64] = result.split(",");
      const mediaType = header.match(/data:([^;]+);/)?.[1] ?? "image/jpeg";
      resolve({ base64, mediaType });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function MaterialAnalysis({ products, onAddToCart }: MaterialAnalysisProps) {
  const [expanded, setExpanded] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [items, setItems] = useState<MaterialItem[]>([]);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [mock, setMock] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFiles(files: FileList | null) {
    if (!files) return;
    const valid = Array.from(files)
      .filter((f) => f.type.startsWith("image/"))
      .slice(0, 4 - photos.length);
    if (!valid.length) return;

    const newPhotos = [...photos, ...valid].slice(0, 4);
    setPhotos(newPhotos);
    setPreviews(newPhotos.map((f) => URL.createObjectURL(f)));
    setItems([]);
    setChecked(new Set());
    setError("");
  }

  async function analyze() {
    if (!photos.length) return;
    setAnalyzing(true);
    setError("");
    setItems([]);

    try {
      const photoData = await Promise.all(photos.map(fileToBase64));
      const res = await fetch("/api/vision/material-detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photos: photoData }),
      });
      if (!res.ok) throw new Error(`Analysis failed (${res.status})`);
      const data = (await res.json()) as { items: MaterialItem[]; mock?: boolean };
      setItems(data.items ?? []);
      setMock(data.mock === true);
      setChecked(new Set(data.items.map((_, i) => i)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    }
    setAnalyzing(false);
  }

  function toggleCheck(i: number) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  function handleAddToCart() {
    const toAdd = items
      .map((item, i) => ({ item, i }))
      .filter(({ i }) => checked.has(i))
      .map(({ item }) => {
        const product = matchProduct(item.suggested_sku, products);
        return product
          ? { product, quantity: item.linear_feet, materialItem: item }
          : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    if (!toAdd.length) return;
    onAddToCart(toAdd);
    setItems([]);
    setPhotos([]);
    setPreviews([]);
    setChecked(new Set());
    setError("");
  }

  const matchedCount = items.filter(
    (item, i) => checked.has(i) && matchProduct(item.suggested_sku, products)
  ).length;

  return (
    <div className="rounded-lg border border-border-subtle bg-surface-1 overflow-hidden">
      {/* Toggle header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-surface-2 hover:bg-surface-3 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
          </svg>
          <span className="text-heading-sm text-text-primary">AI Material Analysis</span>
          <span className="text-caption text-text-muted">(soffit · fascia · gutters)</span>
        </div>
        <svg
          className={`w-4 h-4 text-text-tertiary transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="p-4 space-y-4">
          {/* Upload area */}
          <div>
            <p className="text-caption text-text-tertiary mb-2">
              Upload up to 4 exterior photos — GPT-4o detects soffit, fascia, and gutter condition,
              color, and linear footage.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />

            {photos.length === 0 ? (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full rounded-lg border-2 border-dashed border-border hover:border-brand transition-colors p-6 text-center"
              >
                <svg className="w-8 h-8 text-text-muted mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="text-body-sm text-text-tertiary">Click to upload exterior photos</p>
              </button>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-4 gap-2">
                  {previews.map((url, i) => (
                    <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-border-subtle">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                      <button
                        onClick={() => {
                          const newPhotos = photos.filter((_, pi) => pi !== i);
                          const newPreviews = previews.filter((_, pi) => pi !== i);
                          setPhotos(newPhotos);
                          setPreviews(newPreviews);
                          setItems([]);
                        }}
                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 text-xs"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  {photos.length < 4 && (
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="aspect-square rounded-lg border-2 border-dashed border-border hover:border-brand transition-colors flex items-center justify-center"
                    >
                      <svg className="w-5 h-5 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    </button>
                  )}
                </div>

                <button
                  onClick={analyze}
                  disabled={analyzing}
                  className="w-full flex items-center justify-center gap-2 rounded-lg bg-brand text-white px-4 py-2.5 text-sm font-semibold hover:brightness-110 disabled:opacity-60 transition"
                >
                  {analyzing ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Analyzing materials…
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                      </svg>
                      Analyze Materials
                    </>
                  )}
                </button>
              </div>
            )}

            {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
          </div>

          {/* Results */}
          {items.length > 0 && (
            <div className="space-y-3">
              {mock && (
                <div className="rounded-lg border border-amber-800/40 bg-amber-950/20 px-3 py-2 text-xs text-amber-400">
                  Demo mode — add OPENAI_API_KEY to Cloudflare Pages env to enable real analysis.
                </div>
              )}

              <p className="text-xs font-semibold text-text-secondary">
                {items.length} material{items.length !== 1 ? "s" : ""} detected — select items to add to quote:
              </p>

              <div className="space-y-2">
                {items.map((item, i) => {
                  const product = matchProduct(item.suggested_sku, products);
                  return (
                    <label
                      key={i}
                      className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${
                        checked.has(i)
                          ? "border-brand/40 bg-brand/5"
                          : "border-border-subtle bg-surface-2"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked.has(i)}
                        onChange={() => toggleCheck(i)}
                        className="mt-0.5 h-4 w-4 accent-brand"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 mb-1">
                          <span className="text-xs font-semibold text-text-primary">
                            {MATERIAL_LABEL[item.material_type] ?? item.material_type}
                          </span>
                          <span
                            className={`text-[10px] font-bold rounded px-1.5 py-0.5 uppercase ${
                              SEVERITY_COLOR[item.damage_severity] ?? ""
                            }`}
                          >
                            {item.damage_severity}
                          </span>
                          <span className="text-[10px] text-text-muted uppercase tracking-wide">
                            {item.confidence} confidence
                          </span>
                          {/* Color swatch */}
                          <span
                            className="inline-block w-4 h-4 rounded-sm border border-border-subtle flex-shrink-0"
                            style={{ backgroundColor: item.color_hex }}
                            title={item.color_hex}
                          />
                          <span className="text-[10px] text-text-muted font-mono">{item.color_hex}</span>
                        </div>
                        <p className="text-[11px] text-text-tertiary">{item.notes}</p>
                        <p className="text-[11px] text-text-muted">{item.recommended_action}</p>
                        <div className="mt-1 flex items-center gap-2">
                          <span className="text-xs font-medium text-text-secondary">
                            {CONFIDENCE_LABEL[item.confidence]}{item.linear_feet} lf
                          </span>
                          {product ? (
                            <span className="text-[10px] text-status-green">→ {product.name}</span>
                          ) : (
                            <span className="text-[10px] text-text-muted">→ no product match</span>
                          )}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>

              <button
                onClick={handleAddToCart}
                disabled={matchedCount === 0}
                className="w-full rounded-lg bg-status-green/20 border border-status-green/30 text-status-green px-4 py-2 text-sm font-semibold hover:bg-status-green/30 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                Add {matchedCount} item{matchedCount !== 1 ? "s" : ""} to quote
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
