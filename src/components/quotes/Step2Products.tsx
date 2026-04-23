"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useQuoteBuilder } from "@/lib/contexts/QuoteBuilderContext";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
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

function formatCurrency(v: number | null | undefined) {
  if (v == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);
}

export default function Step2Products() {
  const { state, addToCart, removeFromCart, updateCartQty, updateCartPrice, setStep, subtotal } = useQuoteBuilder();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [priceInput, setPriceInput] = useState("");

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

  const filtered = products.filter(
    (p) =>
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.code ?? "").toLowerCase().includes(search.toLowerCase())
  );

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

  function startEditPrice(item: CartItem) {
    setEditingPriceId(item.product_id);
    setPriceInput(item.unit_price.toString());
  }

  function commitPrice(productId: string) {
    const val = parseFloat(priceInput);
    if (!isNaN(val)) updateCartPrice(productId, val);
    setEditingPriceId(null);
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Left: Product Catalog */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">Product Catalog</h2>
          <p className="text-sm text-zinc-500 mt-1">{state.departmentName} products</p>
        </div>
        <Input
          placeholder="Search products…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {loading ? (
          <div className="flex items-center justify-center py-12 text-zinc-500">
            <svg className="mr-2 h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-zinc-500 text-sm">
            No products found for this department.
            <br />
            <a href="/admin/settings/products/" className="text-brand hover:underline mt-1 block">
              Add products in Admin Settings
            </a>
          </div>
        ) : (
          <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
            {filtered.map((product) => {
              const inCart = state.cart.find((c) => c.product_id === product.id);
              return (
                <div
                  key={product.id}
                  className={`rounded-xl border p-4 transition-colors ${
                    inCart ? "border-brand/40 bg-brand/5" : "border-zinc-800 bg-zinc-900/60"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-zinc-100 text-sm">{product.name}</p>
                        <Badge variant={product.product_type === "PRODUCT" ? "blue" : "orange"} className="text-xs">
                          {product.product_type}
                        </Badge>
                      </div>
                      {product.code && <p className="text-xs text-zinc-500 mt-0.5">{product.code}</p>}
                      <p className="text-sm text-zinc-300 mt-1">
                        {formatCurrency(product.default_price ?? product.price)}
                        {product.unit && <span className="text-zinc-500"> / {product.unit}</span>}
                      </p>
                    </div>
                    <button
                      onClick={() => handleAddProduct(product)}
                      className="shrink-0 flex items-center gap-1 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-zinc-700"
                    >
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                      {inCart ? `Add (${inCart.quantity})` : "Add"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Right: Cart */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">Quote Cart</h2>
          <p className="text-sm text-zinc-500 mt-1">{state.cart.length} item{state.cart.length !== 1 ? "s" : ""} added</p>
        </div>
        {state.cart.length === 0 ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 py-12 text-center text-zinc-500 text-sm">
            No items added yet. Browse the catalog and click "Add".
          </div>
        ) : (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 divide-y divide-zinc-800">
            {state.cart.map((item) => (
              <div key={item.product_id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-100 truncate">{item.product_name}</p>
                    {item.unit && <p className="text-xs text-zinc-500">{item.unit}</p>}
                  </div>
                  <button
                    onClick={() => removeFromCart(item.product_id)}
                    className="shrink-0 text-zinc-600 hover:text-red-400 transition p-1"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => updateCartQty(item.product_id, item.quantity - 1)}
                      disabled={item.quantity <= 1}
                      className="h-7 w-7 rounded-lg bg-zinc-800 text-zinc-300 flex items-center justify-center text-sm hover:bg-zinc-700 disabled:opacity-40"
                    >−</button>
                    <input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) => updateCartQty(item.product_id, parseInt(e.target.value) || 1)}
                      className="w-12 text-center rounded-lg border border-zinc-700 bg-zinc-950 py-1 text-sm text-zinc-100 outline-none"
                    />
                    <button
                      onClick={() => updateCartQty(item.product_id, item.quantity + 1)}
                      className="h-7 w-7 rounded-lg bg-zinc-800 text-zinc-300 flex items-center justify-center text-sm hover:bg-zinc-700"
                    >+</button>
                  </div>
                  <span className="text-zinc-500 text-xs">@</span>
                  {editingPriceId === item.product_id ? (
                    <input
                      type="number"
                      step="0.01"
                      value={priceInput}
                      onChange={(e) => setPriceInput(e.target.value)}
                      onBlur={() => commitPrice(item.product_id)}
                      onKeyDown={(e) => e.key === "Enter" && commitPrice(item.product_id)}
                      autoFocus
                      className="w-24 rounded-lg border border-brand bg-zinc-950 px-2 py-1 text-sm text-zinc-100 outline-none"
                    />
                  ) : (
                    <button
                      onClick={() => startEditPrice(item)}
                      className="text-sm text-zinc-200 hover:text-brand transition font-medium"
                      title={item.min_price ? `Min: ${formatCurrency(item.min_price)}` : undefined}
                    >
                      {formatCurrency(item.unit_price)}
                    </button>
                  )}
                  <span className="ml-auto text-sm font-semibold text-zinc-100">
                    {formatCurrency(item.line_total)}
                  </span>
                </div>
                {item.min_price && item.unit_price < item.min_price && (
                  <p className="text-xs text-red-400 mt-1">Below minimum price ({formatCurrency(item.min_price)})</p>
                )}
              </div>
            ))}
            <div className="p-4 flex items-center justify-between">
              <span className="text-sm font-medium text-zinc-300">Subtotal</span>
              <span className="text-lg font-bold text-zinc-50">{formatCurrency(subtotal)}</span>
            </div>
          </div>
        )}

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
      </div>
    </div>
  );
}
