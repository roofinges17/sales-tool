"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useQuoteBuilder } from "@/lib/contexts/QuoteBuilderContext";
import { useAuth } from "@/lib/hooks/useAuth";
import { ENGLERT_COLORS, METAL_ROOF_CODES } from "@/lib/visualizer-config";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { RoofMeasure, type RoofData } from "@/components/RoofMeasure";
import DamageAnalysis, { type DamageItem } from "@/components/quotes/DamageAnalysis";
import MaterialAnalysis, { type MaterialItem } from "@/components/quotes/MaterialAnalysis";
import VoiceEstimateRecorder, { type VoiceItem } from "@/components/quotes/VoiceEstimateRecorder";
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
  const { state, addToCart, removeFromCart, updateCartQty, setStep, subtotal, setRoofColor } = useQuoteBuilder();
  const { profile } = useAuth();
  const isSeller = profile?.role === "seller";
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterTab, setFilterTab] = useState<FilterTab>("All");
  const [measuredRoof, setMeasuredRoof] = useState<RoofData | null>(null);

  useEffect(() => {
    if (!state.departmentId) return;
    const table = isSeller ? "products_seller_view" : "products";
    (async () => {
      try {
        const { data, error } = await supabase()
          .from(table)
          .select("*")
          .eq("department_id", state.departmentId)
          .eq("is_active", true)
          .order("name");
        if (error) console.error("[Step2Products] load failed:", error.message);
        setProducts((data as Product[]) ?? []);
      } catch (err) {
        console.error("[Step2Products] network error:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [state.departmentId, isSeller]);

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

  const hasMetalRoof = state.cart.some((item) =>
    METAL_ROOF_CODES.includes((item.product_sku ?? "").toUpperCase())
  );
  const needsColorSelection = hasMetalRoof && !state.roofColor;

  function handleRoofMeasured(data: RoofData) {
    setMeasuredRoof(data);
  }

  function getAutoSqft(code: string | null | undefined): number {
    if (!measuredRoof) return 0;
    const c = (code ?? "").toUpperCase();
    if (c === "FLAT" || c === "FLAT INSULATIONS") return measuredRoof.flatSqft;
    return measuredRoof.slopedSqft || measuredRoof.totalSqft;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        {/* Left: Product catalog */}
        <div className="space-y-4">
          <input
            className="w-full h-9 rounded-md border px-3 text-body text-text-primary placeholder:text-text-muted border-border hover:border-border-strong focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none transition-colors duration-150 bg-surface-2"
            placeholder="Search products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          {/* Category filter tabs */}
          <div className="flex gap-2 flex-wrap">
            {FILTER_TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setFilterTab(tab)}
                className={`px-4 py-2 rounded-md text-body-sm font-medium transition-colors ${
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
                {filteredProducts.map((product) => (
                  <div
                    key={product.id}
                    className="flex items-center justify-between gap-4 p-4 hover:bg-surface-3 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-body-sm font-semibold text-text-primary truncate">
                        {product.name}
                      </p>
                      {product.code && (
                        <p className="text-caption text-text-muted font-mono">{product.code}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="hidden sm:inline">
                        <Badge variant={product.product_type === "PRODUCT" ? "blue" : "purple"}>
                          {product.product_type}
                        </Badge>
                      </span>
                      {product.unit && (
                        <span className="hidden sm:inline text-caption text-text-tertiary">{product.unit}</span>
                      )}
                      <span className="text-body-sm font-medium text-status-green min-w-[4rem] text-right">
                        {fmt(product.default_price ?? product.price)}
                      </span>

                      {(() => {
                        const cartItem = state.cart.find(i => i.product_id === product.id);
                        const qty = cartItem?.quantity ?? 0;
                        const inCart = qty > 0;

                        const onPlus = () => {
                          if (!cartItem) {
                            const autoQty = isRoofCode(product.code) && measuredRoof
                              ? Math.max(1, getAutoSqft(product.code))
                              : 1;
                            addToCart({
                              product_id: product.id,
                              product_name: product.name,
                              product_sku: product.code,
                              product_description: product.description,
                              quantity: autoQty,
                              unit_price: product.default_price ?? product.price ?? 0,
                              unit_cost: product.cost,
                              min_price: product.min_price,
                              max_price: product.max_price,
                              default_price: product.default_price ?? product.price,
                              product_type: product.product_type,
                              unit: product.unit,
                            });
                          } else {
                            updateCartQty(product.id, cartItem.quantity + 1);
                          }
                        };

                        const onMinus = () => {
                          if (!cartItem) return;
                          if (cartItem.quantity <= 1) removeFromCart(product.id);
                          else updateCartQty(product.id, cartItem.quantity - 1);
                        };

                        return (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={onMinus}
                              disabled={!inCart}
                              className={`w-7 h-7 rounded flex items-center justify-center text-sm font-bold transition-colors ${
                                inCart ? "bg-accent/20 text-accent hover:bg-accent/30" : "opacity-30 bg-surface-3 text-text-muted cursor-not-allowed"
                              }`}
                              aria-label="Remove one"
                            >−</button>
                            <span className={`w-8 text-center text-sm font-medium tabular-nums ${inCart ? "text-accent" : "text-text-muted"}`}>
                              {qty}
                            </span>
                            <button
                              onClick={onPlus}
                              className={`w-7 h-7 rounded flex items-center justify-center text-sm font-bold transition-colors ${
                                inCart ? "bg-accent/20 text-accent hover:bg-accent/30" : "bg-surface-2 text-text-secondary hover:bg-accent/20 hover:text-accent"
                              }`}
                              aria-label="Add one"
                            >+</button>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: RoofMeasure + AI tools + Cart — stacks below catalog on mobile */}
        <div className="space-y-4">
          <RoofMeasure onMeasured={handleRoofMeasured} />
          <DamageAnalysis
            products={products}
            onAddToCart={(damageItems) => {
              for (const { product, quantity, damageItem } of damageItems) {
                const unitPrice = product.default_price ?? product.price ?? 0;
                addToCart({
                  product_id: product.id,
                  product_name: `${product.name} (${damageItem.location})`,
                  product_sku: product.code,
                  quantity,
                  unit_price: unitPrice * quantity,
                  unit_cost: product.cost,
                  min_price: product.min_price,
                  max_price: product.max_price,
                  default_price: product.default_price ?? product.price,
                  product_type: product.product_type,
                  unit: product.unit ?? damageItem.unit,
                  is_manual_qty: true,
                } satisfies Omit<CartItem, "line_total">);
              }
            }}
          />
          <MaterialAnalysis
            products={products}
            onAddToCart={(materialItems) => {
              for (const { product, quantity, materialItem } of materialItems) {
                const unitPrice = product.default_price ?? product.price ?? 0;
                addToCart({
                  product_id: product.id,
                  product_name: `${product.name} (${materialItem.linear_feet} lf)`,
                  product_sku: product.code,
                  quantity,
                  unit_price: unitPrice,
                  unit_cost: product.cost,
                  min_price: product.min_price,
                  max_price: product.max_price,
                  default_price: product.default_price ?? product.price,
                  product_type: product.product_type,
                  unit: "lf",
                  is_manual_qty: true,
                } satisfies Omit<CartItem, "line_total">);
              }
            }}
          />
          <VoiceEstimateRecorder
            products={products}
            onAddToCart={(voiceItems) => {
              for (const { product, quantity, voiceItem } of voiceItems) {
                const unitPrice = product.default_price ?? product.price ?? 0;
                addToCart({
                  product_id: product.id,
                  product_name: `${product.name} (${voiceItem.description})`,
                  product_sku: product.code,
                  quantity,
                  unit_price: unitPrice,
                  unit_cost: product.cost,
                  min_price: product.min_price,
                  max_price: product.max_price,
                  default_price: product.default_price ?? product.price,
                  product_type: product.product_type,
                  unit: product.unit ?? voiceItem.unit,
                  is_manual_qty: true,
                } satisfies Omit<CartItem, "line_total">);
              }
            }}
          />

          {/* Estimate Items */}
          <div className="rounded-lg border border-border-subtle bg-surface-1 overflow-hidden">
            <div className="px-4 py-3 border-b border-border-subtle bg-surface-2">
              <h3 className="text-heading-sm text-text-primary">Estimate Items</h3>
              <p className="text-caption text-text-tertiary">
                {state.cart.length} item{state.cart.length !== 1 ? "s" : ""}
              </p>
            </div>

            {state.cart.length === 0 ? (
              <div className="p-8 text-center">
                <div className="w-10 h-10 rounded-lg bg-surface-3 flex items-center justify-center mx-auto mb-3">
                  <svg className="w-5 h-5 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <p className="text-body-sm text-text-tertiary">No items added</p>
                <p className="text-caption text-text-muted">
                  Add products from the catalog to build your estimate
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border-subtle">
                {state.cart.map((item) => (
                  <div key={item.product_id} className={`p-4 ${item.product_type === "SERVICE" ? "bg-status-orange/5" : ""}`}>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0">
                        <p className="text-body-sm font-medium text-text-primary truncate">
                          {item.product_name}
                        </p>
                        {item.product_sku && (
                          <p className="text-caption text-text-muted">{item.product_sku}</p>
                        )}
                      </div>
                      <button
                        onClick={() => removeFromCart(item.product_id)}
                        className="p-1 rounded text-text-muted hover:text-status-red hover:bg-status-red/10 transition-colors flex-shrink-0"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>

                    <div className="flex items-center gap-2 text-caption">
                      <span className="text-text-tertiary">Qty:</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        defaultValue={item.quantity}
                        key={item.product_id}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "" || v === ".") return;
                          const num = Number(v);
                          if (!isNaN(num) && num > 0) updateCartQty(item.product_id, num);
                        }}
                        onBlur={(e) => {
                          const num = Number(e.target.value);
                          if (!e.target.value || isNaN(num) || num <= 0)
                            e.target.value = String(item.quantity);
                        }}
                        className="w-16 h-8 rounded border border-border bg-surface-2 px-1.5 text-caption text-text-primary text-center focus:border-accent focus:outline-none"
                      />
                      {item.unit && (
                        <span className="text-text-muted">{item.unit}</span>
                      )}
                      <span className="text-text-tertiary mx-1">@</span>
                      <span className="text-text-secondary">{fmt(item.unit_price)}</span>
                    </div>

                    <div className="text-right mt-1">
                      <span className="text-body-sm font-medium text-text-primary">
                        {fmt(item.line_total)}
                      </span>
                    </div>
                  </div>
                ))}

                <div className="px-4 py-3 bg-surface-2">
                  <div className="flex justify-between">
                    <span className="text-body-sm text-text-secondary">Subtotal</span>
                    <span className="text-body-sm font-semibold text-text-primary">{fmt(subtotal)}</span>
                  </div>
                  <p className="text-caption text-text-muted mt-1">
                    Tax and discounts calculated at checkout
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Required roof color picker for metal-roof products */}
      {hasMetalRoof && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-zinc-100">
                Roof Color <span className="text-red-400">*</span>
              </p>
              <p className="text-xs text-zinc-500 mt-0.5">
                Required — customer signs for this color. Choose the Englert color they&apos;re purchasing.
              </p>
            </div>
            {state.roofColor && (
              <div className="flex items-center gap-2">
                <div
                  className="h-5 w-5 rounded border border-zinc-600"
                  style={{ backgroundColor: ENGLERT_COLORS.find((c) => c.name === state.roofColor)?.hex ?? "#888" }}
                />
                <span className="text-sm font-medium text-zinc-100">{state.roofColor}</span>
              </div>
            )}
          </div>

          {/* Best-sellers */}
          <div>
            <p className="text-xs text-zinc-500 mb-2 font-medium">★ Best Sellers</p>
            <div className="flex flex-wrap gap-2">
              {ENGLERT_COLORS.filter((c) => c.isBestSeller).map((color) => (
                <button
                  key={color.name}
                  title={color.name}
                  onClick={() => setRoofColor(color.name)}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium border transition-all ${
                    state.roofColor === color.name
                      ? "border-white bg-zinc-800 text-zinc-100"
                      : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
                  }`}
                >
                  <span
                    className="inline-block h-3 w-3 rounded-sm border border-zinc-600"
                    style={{ backgroundColor: color.hex }}
                  />
                  {color.name}
                </button>
              ))}
            </div>
          </div>

          {/* Extended palette */}
          <details className="group">
            <summary className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-300 transition-colors list-none flex items-center gap-1">
              <svg className="h-3 w-3 transition-transform group-open:rotate-90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              More colors
            </summary>
            <div className="mt-2 flex flex-wrap gap-2">
              {ENGLERT_COLORS.filter((c) => !c.isBestSeller).map((color) => (
                <button
                  key={color.name}
                  title={color.name}
                  onClick={() => setRoofColor(color.name)}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium border transition-all ${
                    state.roofColor === color.name
                      ? "border-white bg-zinc-800 text-zinc-100"
                      : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
                  }`}
                >
                  <span
                    className="inline-block h-3 w-3 rounded-sm border border-zinc-600"
                    style={{ backgroundColor: color.hex }}
                  />
                  {color.name}
                </button>
              ))}
            </div>
          </details>

          {needsColorSelection && (
            <p className="text-xs text-red-400 rounded-lg border border-red-900/40 bg-red-950/20 px-3 py-2">
              Please select a roof color before continuing. The customer will sign for this specific color.
            </p>
          )}
        </div>
      )}

      {/* Navigation — full width below the grid */}
      <div className="flex items-center justify-between pt-2">
        <Button variant="secondary" onClick={() => setStep(1)}>
          Back
        </Button>
        <div className="flex items-center gap-3">
          {state.cart.length === 0 && (
            <p className="text-caption text-text-muted">Add at least one item to continue.</p>
          )}
          <Button disabled={state.cart.length === 0 || needsColorSelection} onClick={() => setStep(3)}>
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}
