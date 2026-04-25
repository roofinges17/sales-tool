"use client";

// Generic shell for expandable AI vision analysis panels.
// Handles photo upload, thumbnail grid, analyze call, KV-checked results,
// and add-to-cart flow. DamageAnalysis and MaterialAnalysis are thin wrappers.

import { useRef, useState } from "react";
import { authedFetch } from "@/lib/api";

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

export interface VisionAnalysisShellProps<TItem> {
  title: string;
  subtitle: string;
  uploadPrompt: string;
  icon: React.ReactNode;
  endpoint: string;
  extractItems: (data: Record<string, unknown>) => TItem[];
  getQuantity: (item: TItem) => number;
  getSku: (item: TItem) => string | null;
  products: Product[];
  onAddToCart: (items: Array<{ product: Product; quantity: number; source: TItem }>) => void;
  renderResult: (item: TItem, product: Product | null) => React.ReactNode;
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

export function matchProduct(sku: string | null, products: Product[]): Product | null {
  if (!sku) return null;
  const target = sku.toUpperCase();
  return products.find((p) => (p.code ?? "").toUpperCase() === target) ?? null;
}

export default function VisionAnalysisShell<TItem>({
  title,
  subtitle,
  uploadPrompt,
  icon,
  endpoint,
  extractItems,
  getQuantity,
  getSku,
  products,
  onAddToCart,
  renderResult,
}: VisionAnalysisShellProps<TItem>) {
  const [expanded, setExpanded] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [items, setItems] = useState<TItem[]>([]);
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
      const res = await authedFetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photos: photoData }),
      });
      if (!res.ok) throw new Error(`Analysis failed (${res.status})`);
      const data = (await res.json()) as Record<string, unknown>;
      const extracted = extractItems(data);
      setItems(extracted);
      setMock(data.mock === true);
      setChecked(new Set(extracted.map((_, i) => i)));
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
        const product = matchProduct(getSku(item), products);
        return product ? { product, quantity: getQuantity(item), source: item } : null;
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

  const matchedCount = items.filter((item, i) => checked.has(i) && matchProduct(getSku(item), products)).length;

  return (
    <div className="rounded-lg border border-border-subtle bg-surface-1 overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-surface-2 hover:bg-surface-3 transition-colors"
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-heading-sm text-text-primary">{title}</span>
          <span className="text-caption text-text-muted">{subtitle}</span>
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
          <div>
            <p className="text-caption text-text-tertiary mb-2">{uploadPrompt}</p>
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
                <p className="text-body-sm text-text-tertiary">Click to upload photos</p>
              </button>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {previews.map((url, i) => (
                    <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-border-subtle">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                      <button
                        onClick={() => {
                          const np = photos.filter((_, pi) => pi !== i);
                          setPhotos(np);
                          setPreviews(np.map((f) => URL.createObjectURL(f)));
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
                      Analyzing…
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.347.347a3.75 3.75 0 00-.864 3.5A2.75 2.75 0 0112 21.75a2.75 2.75 0 01-2.743-2.563 3.75 3.75 0 00-.864-3.5l-.347-.347z" />
                      </svg>
                      Analyze
                    </>
                  )}
                </button>
              </div>
            )}

            {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
          </div>

          {items.length > 0 && (
            <div className="space-y-3">
              {mock && (
                <div className="rounded-lg border border-amber-800/40 bg-amber-950/20 px-3 py-2 text-xs text-amber-400">
                  Demo mode — add OPENAI_API_KEY to Cloudflare Pages env to enable real analysis.
                </div>
              )}

              <p className="text-xs font-semibold text-text-secondary">
                {items.length} item{items.length !== 1 ? "s" : ""} detected — select to add to quote:
              </p>

              <div className="space-y-2">
                {items.map((item, i) => {
                  const product = matchProduct(getSku(item), products);
                  return (
                    <label
                      key={i}
                      className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${
                        checked.has(i) ? "border-brand/40 bg-brand/5" : "border-border-subtle bg-surface-2"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked.has(i)}
                        onChange={() => toggleCheck(i)}
                        className="mt-0.5 h-4 w-4 accent-brand flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        {renderResult(item, product)}
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
