"use client";

import { useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { authedFetch } from "@/lib/api";
import { useAuth } from "@/lib/hooks/useAuth";
import { useQuoteBuilder } from "@/lib/contexts/QuoteBuilderContext";
import { Button } from "@/components/ui/Button";
import { ENGLERT_COLORS, VISUALIZER_FINISHES, type VisualizerFinish, findEnglertColor } from "@/lib/visualizer-config";

function formatCurrency(v: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);
}

async function getNextEstimateNumber(prefix: string): Promise<string> {
  const { data, error } = await supabase()
    .from("quotes")
    .select("name")
    .ilike("name", `${prefix}%`)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) console.error("[getNextEstimateNumber]", error.message);

  let nextNum = 1;
  if (data && data.length > 0) {
    const lastName = (data[0] as { name: string }).name;
    const numPart = parseInt(lastName.replace(prefix, "")) || 0;
    nextNum = numPart + 1;
  }
  return `${prefix}${String(nextNum).padStart(4, "0")}`;
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the data URL prefix — Gemini wants raw base64
      resolve(result.split(",")[1] ?? result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function Step6Generate() {
  const { user } = useAuth();
  const {
    state,
    setStep,
    subtotal,
    discountAmount,
    dealerFee,
    taxAmount,
    total,
    monthlyPayment,
    commissions,
    reset,
    clearDraft,
    editingQuoteId,
    setVisualizerState,
  } = useQuoteBuilder();

  const folioNumber = state.folioNumber;
  const roofColor = state.roofColor;

  // Visualizer state
  const [vizEnabled, setVizEnabled] = useState(state.visualizerEnabled);
  const [vizPhotoFile, setVizPhotoFile] = useState<File | null>(null);
  const [vizPhotoPreview, setVizPhotoPreview] = useState<string | null>(null);
  const [vizColor, setVizColor] = useState<string>(state.visualizerColor ?? roofColor ?? ENGLERT_COLORS[0].name);
  const [vizFinish, setVizFinish] = useState<VisualizerFinish>(
    (state.visualizerFinish as VisualizerFinish | null) ?? "Matte",
  );
  const [vizRendering, setVizRendering] = useState(false);
  const [vizError, setVizError] = useState<string | null>(null);
  const [vizRenderUrl, setVizRenderUrl] = useState<string | null>(state.visualizerImageUrl ?? null);
  const [vizModelId, setVizModelId] = useState<string | null>(null);
  const [vizStreetViewLoading, setVizStreetViewLoading] = useState(false);
  const [vizStreetViewBase64, setVizStreetViewBase64] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Save state
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setVizPhotoFile(file);
    setVizPhotoPreview(URL.createObjectURL(file));
    setVizStreetViewBase64(null);
    setVizRenderUrl(null);
    setVizError(null);
  }

  async function handleFetchStreetView() {
    setVizStreetViewLoading(true);
    setVizError(null);

    try {
      // Resolve address — new customer from state, existing customer from Supabase
      let address: string | null = null;
      if (state.isNewCustomer) {
        const parts = [
          state.newCustomer.billing_address_line1,
          state.newCustomer.billing_city,
          state.newCustomer.billing_state,
        ].filter(Boolean);
        address = parts.length > 0 ? parts.join(", ") : null;
      } else if (state.existingAccountId) {
        const { data, error: addrErr } = await supabase()
          .from("accounts")
          .select("billing_address_line1, billing_city, billing_state")
          .eq("id", state.existingAccountId)
          .single();
        if (addrErr) { setVizError("Could not load customer address. Try again."); return; }
        if (data) {
          const d = data as { billing_address_line1?: string | null; billing_city?: string | null; billing_state?: string | null };
          const parts = [d.billing_address_line1, d.billing_city, d.billing_state].filter(Boolean);
          address = parts.length > 0 ? parts.join(", ") : null;
        }
      }

      if (!address) {
        setVizError("Add an address in Step 3 (Customer) to use Street View.");
        return;
      }

      const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_STATIC_KEY;
      if (!apiKey) {
        setVizError("Maps API key not configured.");
        return;
      }

      const svUrl = `https://maps.googleapis.com/maps/api/streetview?size=1024x768&location=${encodeURIComponent(address)}&fov=80&pitch=0&key=${apiKey}`;
      const svRes = await fetch(svUrl);

      if (!svRes.ok) {
        setVizError("Street View request failed. Please upload a photo instead.");
        return;
      }

      const contentType = svRes.headers.get("content-type") ?? "";
      const blob = await svRes.blob();

      // Google returns a grey placeholder (~4KB) when no imagery exists
      if (!contentType.startsWith("image/") || blob.size < 5000) {
        setVizError("No Street View imagery available for this address. Please upload a photo instead.");
        return;
      }

      // Convert to base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1] ?? result);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      const dataUrl = `data:${contentType};base64,${base64}`;
      setVizStreetViewBase64(base64);
      setVizPhotoFile(null);
      setVizPhotoPreview(dataUrl);
      setVizRenderUrl(null);
    } catch (err) {
      setVizError(err instanceof Error ? err.message : "Street View fetch failed.");
    } finally {
      setVizStreetViewLoading(false);
    }
  }

  async function handleGenerateRender() {
    if (!vizPhotoFile && !vizPhotoPreview) {
      setVizError("Upload a photo first.");
      return;
    }
    if (!vizColor) {
      setVizError("Select a color first.");
      return;
    }

    setVizRendering(true);
    setVizError(null);

    try {
      let photoBase64: string | undefined;
      let mimeType = "image/jpeg";
      if (vizPhotoFile) {
        photoBase64 = await fileToBase64(vizPhotoFile);
        mimeType = vizPhotoFile.type || "image/jpeg";
      } else if (vizStreetViewBase64) {
        photoBase64 = vizStreetViewBase64;
        mimeType = "image/jpeg";
      }

      const res = await authedFetch("/api/visualize/roof", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          photo_base64: photoBase64,
          mime_type: mimeType,
          color: vizColor,
          finish: vizFinish,
          quote_id: editingQuoteId ?? undefined,
        }),
      });

      const json = (await res.json()) as { render_url?: string; error?: string; model_id?: string };
      if (!res.ok || !json.render_url) {
        throw new Error(json.error ?? "Render failed");
      }

      setVizRenderUrl(json.render_url);
      setVizModelId(json.model_id ?? null);
      setVisualizerState({ imageUrl: json.render_url, color: vizColor, finish: vizFinish });
    } catch (err) {
      setVizError(err instanceof Error ? err.message : "Render failed");
    } finally {
      setVizRendering(false);
    }
  }

  function handleUseRender() {
    if (!vizRenderUrl) return;
    setVisualizerState({ enabled: true, imageUrl: vizRenderUrl, color: vizColor, finish: vizFinish });
  }

  function handleToggleViz(on: boolean) {
    setVizEnabled(on);
    setVisualizerState({ enabled: on });
    if (!on) {
      setVisualizerState({ enabled: false, imageUrl: null });
      setVizRenderUrl(null);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);

    try {
      const isEditing = !!editingQuoteId;
      const validUntil = new Date();
      validUntil.setDate(validUntil.getDate() + state.validDays);

      const basePayload = {
        subtotal,
        discount_type: state.discountType,
        discount_value: state.discountValue || null,
        discount_amount: discountAmount || null,
        tax_rate: state.taxRate,
        tax_exempt: state.taxExempt,
        tax_amount: taxAmount,
        total,
        financing_provider: state.selectedFinancingPlan?.provider_name ?? null,
        financing_term: state.selectedFinancingPlan?.term_months ?? null,
        financing_rate: state.selectedFinancingPlan?.apr ?? null,
        monthly_payment: monthlyPayment || null,
        valid_until: validUntil.toISOString().split("T")[0],
        notes: state.notes || null,
        account_id: state.existingAccountId,
        department_id: state.departmentId,
        folio_number: folioNumber || null,
        roof_color: roofColor ?? null,
        visualizer_image_url: vizEnabled && vizRenderUrl ? vizRenderUrl : null,
        visualizer_color: vizEnabled && vizRenderUrl ? vizColor : null,
        visualizer_finish: vizEnabled && vizRenderUrl ? vizFinish : null,
        // Keep legacy fields for backward compat with existing quotes
        visualization_color_id: state.visualizationColorId ?? null,
        visualization_image: state.compositeImageDataUrl ?? null,
      };

      if (isEditing) {
        const { error: updateErr } = await supabase()
          .from("quotes")
          .update(basePayload)
          .eq("id", editingQuoteId!);
        if (updateErr) throw new Error(updateErr.message);

        await supabase().from("quote_line_items").delete().eq("quote_id", editingQuoteId!);
        const lineItems = state.cart.map((item, i) => ({
          quote_id: editingQuoteId!,
          product_id: item.product_id,
          product_name: item.product_name,
          product_sku: item.product_sku ?? null,
          product_description: item.product_description ?? null,
          quantity: item.quantity,
          unit_price: item.unit_price,
          unit_cost: item.unit_cost ?? null,
          line_total: item.line_total,
          sort_order: i,
        }));
        const { error: lineErr } = await supabase().from("quote_line_items").insert(lineItems);
        if (lineErr) throw new Error(lineErr.message);

        clearDraft();
        reset();
        window.location.href = `/quotes/detail/?id=${editingQuoteId}`;
        return;
      }

      // New quote
      const { data: settings } = await supabase()
        .from("company_settings")
        .select("estimate_prefix")
        .limit(1)
        .maybeSingle();
      const prefix = (settings as { estimate_prefix?: string } | null)?.estimate_prefix ?? "EST-";
      const estimateName = await getNextEstimateNumber(prefix);

      let accountId = state.existingAccountId;
      if (state.isNewCustomer) {
        const { data: newAcc, error: accErr } = await supabase()
          .from("accounts")
          .insert({
            name: state.newCustomer.name,
            email: state.newCustomer.email || null,
            phone: state.newCustomer.phone || null,
            billing_address_line1: state.newCustomer.billing_address_line1 || null,
            billing_city: state.newCustomer.billing_city || null,
            billing_state: state.newCustomer.billing_state || null,
            billing_zip: state.newCustomer.billing_zip || null,
            lead_source: state.newCustomer.lead_source || null,
            status: "PROSPECT",
            created_by_id: user?.id ?? null,
          })
          .select()
          .single();
        if (accErr) throw new Error(accErr.message);
        accountId = (newAcc as { id: string }).id;
      }

      const { data: quote, error: quoteErr } = await supabase()
        .from("quotes")
        .insert({
          name: estimateName,
          status: "DRAFT",
          ...basePayload,
          created_by_id: user?.id ?? null,
          assigned_to_id: user?.id ?? null,
          account_id: accountId,
        })
        .select()
        .single();
      if (quoteErr) throw new Error(quoteErr.message);

      const quoteId = (quote as { id: string }).id;

      const lineItems = state.cart.map((item, i) => ({
        quote_id: quoteId,
        product_id: item.product_id,
        product_name: item.product_name,
        product_sku: item.product_sku ?? null,
        product_description: item.product_description ?? null,
        quantity: item.quantity,
        unit_price: item.unit_price,
        unit_cost: item.unit_cost ?? null,
        line_total: item.line_total,
        sort_order: i,
      }));
      const { error: lineErr } = await supabase().from("quote_line_items").insert(lineItems);
      if (lineErr) throw new Error(lineErr.message);

      // GHL sync — fire-and-forget
      if (accountId) {
        (async () => {
          try {
            const { syncGhlContact } = await import("@/lib/ghl");
            const ghlContactId = await syncGhlContact({
              name: state.isNewCustomer ? state.newCustomer.name : (state.existingAccountName ?? ""),
              email: state.isNewCustomer ? state.newCustomer.email : null,
              phone: state.isNewCustomer ? state.newCustomer.phone : null,
            });
            if (ghlContactId) {
              await supabase()
                .from("accounts")
                .update({ ghl_contact_id: ghlContactId, ghl_last_sync_at: new Date().toISOString() })
                .eq("id", accountId!);
            }
          } catch {
            // GHL sync never blocks save
          }
        })();
      }

      clearDraft();
      reset();
      window.location.href = `/quotes/detail/?id=${quoteId}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save estimate");
      setSaving(false);
    }
  }

  const customerName = state.existingAccountName || state.newCustomer.name;
  const selectedVizColor = findEnglertColor(vizColor);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-100">Estimate Preview</h2>
        <p className="text-sm text-zinc-500 mt-1">Review the estimate before saving.</p>
      </div>

      {/* Estimate Preview */}
      <div className="rounded-2xl border border-zinc-700 bg-zinc-900 overflow-hidden">
        <div className="bg-zinc-800 px-8 py-6 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-zinc-50">ESTIMATE</h1>
            <p className="text-sm text-zinc-400 mt-1">Valid for {state.validDays} days from issue date</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium text-zinc-300">Roofing Experts</p>
            <p className="text-xs text-zinc-500">Estimate prepared for:</p>
            <p className="text-sm font-semibold text-zinc-100 mt-0.5">{customerName || "Customer"}</p>
            {folioNumber && (
              <p className="text-xs text-zinc-500 mt-1">
                Folio: <span className="text-zinc-300 font-mono">{folioNumber}</span>
              </p>
            )}
          </div>
        </div>

        <div className="px-8 py-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-700 text-xs uppercase tracking-wider text-zinc-500">
                <th className="pb-3 text-left">Item</th>
                <th className="pb-3 text-center w-20">Qty / Area</th>
                <th className="pb-3 text-right w-28">Unit Price</th>
                <th className="pb-3 text-right w-28">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {state.cart.map((item) => {
                const isMeasured = item.unit === "section";
                const isMetalItem = ["ALUMINUM", "METAL"].includes((item.product_sku ?? "").toUpperCase());
                return (
                  <tr key={item.product_id}>
                    <td className="py-3">
                      <p className="font-medium text-zinc-100">{item.product_name}</p>
                      {isMetalItem && roofColor && (
                        <p className="text-xs text-zinc-400 mt-0.5 flex items-center gap-1.5">
                          <span
                            className="inline-block h-3 w-3 rounded-sm border border-zinc-600"
                            style={{ backgroundColor: findEnglertColor(roofColor)?.hex ?? "#888" }}
                          />
                          Color: {roofColor}
                        </p>
                      )}
                      {item.product_description && (
                        <p className="text-xs text-zinc-500">{item.product_description}</p>
                      )}
                    </td>
                    <td className="py-3 text-center text-zinc-300">
                      {isMeasured ? <span className="text-xs text-zinc-500">measured</span> : item.quantity}
                    </td>
                    <td className="py-3 text-right text-zinc-300">
                      {isMeasured ? "—" : formatCurrency(item.unit_price)}
                    </td>
                    <td className="py-3 text-right font-medium text-zinc-100">{formatCurrency(item.line_total)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="mt-6 ml-auto w-72 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-zinc-400">Subtotal</span>
              <span className="text-zinc-200">{formatCurrency(subtotal)}</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400">Discount</span>
                <span className="text-green-400">−{formatCurrency(discountAmount)}</span>
              </div>
            )}
            {dealerFee > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400">Dealer Fee</span>
                <span className="text-zinc-200">{formatCurrency(dealerFee)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              {state.taxExempt ? (
                <>
                  <span className="text-zinc-500">Tax (exempt)</span>
                  <span className="text-zinc-500">$0.00</span>
                </>
              ) : (
                <>
                  <span className="text-zinc-400">Tax ({(state.taxRate * 100).toFixed(1)}%)</span>
                  <span className="text-zinc-200">{formatCurrency(taxAmount)}</span>
                </>
              )}
            </div>
            <div className="border-t border-zinc-700 pt-2 flex justify-between">
              <span className="font-bold text-zinc-100">Total</span>
              <span className="text-xl font-bold text-zinc-50">{formatCurrency(total)}</span>
            </div>
          </div>

          {state.useFinancing && state.selectedFinancingPlan && (
            <div className="mt-6 rounded-xl border border-brand/30 bg-brand/5 p-4">
              <p className="text-sm font-semibold text-brand mb-1">Financing Option</p>
              <p className="text-sm text-zinc-300">
                {state.selectedFinancingPlan.provider_name} — {state.selectedFinancingPlan.name}
              </p>
              <p className="text-sm text-zinc-400 mt-0.5">
                {state.selectedFinancingPlan.term_months} months at {state.selectedFinancingPlan.apr}% APR —{" "}
                <span className="font-semibold text-brand">{formatCurrency(monthlyPayment)}/month</span>
              </p>
              <p className="text-xs text-zinc-500 mt-1">
                *Financing subject to credit approval. Monthly payment is an estimate.
              </p>
            </div>
          )}

          {state.notes && (
            <div className="mt-6 border-t border-zinc-800 pt-4">
              <p className="text-xs font-medium uppercase tracking-wider text-zinc-500 mb-1">Notes</p>
              <p className="text-sm text-zinc-300">{state.notes}</p>
            </div>
          )}
        </div>

        <div className="border-t border-zinc-800 bg-zinc-950/50 px-8 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Internal Commission Summary</p>
          <div className="flex gap-8 text-sm">
            <div>
              <p className="text-zinc-500 text-xs">Seller Markup</p>
              <p className="text-blue-400 font-medium">{formatCurrency(commissions.sellerMarkup)}</p>
            </div>
            <div>
              <p className="text-zinc-500 text-xs">Manager (18%)</p>
              <p className="text-purple-400 font-medium">{formatCurrency(commissions.managerCommission)}</p>
            </div>
            <div>
              <p className="text-zinc-500 text-xs">Base Profit</p>
              <p className="text-zinc-300 font-medium">{formatCurrency(commissions.baseProfit)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* AI Roof Visualization */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-zinc-100">AI Roof Visualization</p>
            <p className="text-xs text-zinc-500 mt-0.5">
              Include a photoreal AI-rendered roof preview in this estimate.
            </p>
          </div>
          <button
            role="switch"
            aria-checked={vizEnabled}
            onClick={() => handleToggleViz(!vizEnabled)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
              vizEnabled ? "bg-brand" : "bg-zinc-700"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform ${
                vizEnabled ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        {vizEnabled && (
          <div className="space-y-4">
            {/* Photo input */}
            <div>
              <p className="text-xs font-medium text-zinc-400 mb-2">House Photo</p>
              {vizPhotoPreview ? (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={vizPhotoPreview}
                    alt="Selected house photo"
                    className="w-full max-h-48 object-cover rounded-xl border border-zinc-700"
                  />
                  {vizStreetViewBase64 && (
                    <span className="absolute top-2 left-2 rounded-lg bg-zinc-900/80 px-2 py-1 text-xs text-zinc-400">
                      Street View
                    </span>
                  )}
                  <button
                    onClick={() => {
                      setVizPhotoFile(null);
                      setVizPhotoPreview(null);
                      setVizStreetViewBase64(null);
                      setVizRenderUrl(null);
                    }}
                    className="absolute top-2 right-2 rounded-lg bg-zinc-900/80 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800 transition"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {/* Street View auto-fetch */}
                  <button
                    onClick={handleFetchStreetView}
                    disabled={vizStreetViewLoading}
                    className="w-full flex items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-300 hover:border-brand hover:text-zinc-100 disabled:opacity-50 transition-colors"
                  >
                    {vizStreetViewLoading ? (
                      <>
                        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Fetching Street View…
                      </>
                    ) : (
                      <>
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                        </svg>
                        Use Street View for this address
                      </>
                    )}
                  </button>

                  <div className="flex items-center gap-2">
                    <div className="h-px flex-1 bg-zinc-800" />
                    <span className="text-xs text-zinc-600">or</span>
                    <div className="h-px flex-1 bg-zinc-800" />
                  </div>

                  <label className="block w-full rounded-xl border-2 border-dashed border-zinc-700 hover:border-brand transition-colors p-6 text-center cursor-pointer">
                    <svg className="w-8 h-8 text-zinc-600 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <p className="text-sm text-zinc-400">Upload house exterior photo</p>
                    <p className="text-xs text-zinc-600 mt-1">JPG or PNG</p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={handlePhotoSelect}
                    />
                  </label>
                </div>
              )}
            </div>

            {/* Color picker */}
            <div>
              <p className="text-xs font-medium text-zinc-400 mb-2">
                Render Color{" "}
                {roofColor && roofColor !== vizColor && (
                  <button
                    onClick={() => setVizColor(roofColor)}
                    className="text-brand hover:underline"
                  >
                    (use quote color: {roofColor})
                  </button>
                )}
              </p>
              <div className="flex flex-wrap gap-2">
                {ENGLERT_COLORS.filter((c) => c.isBestSeller).map((color) => (
                  <button
                    key={color.name}
                    title={color.name}
                    onClick={() => setVizColor(color.name)}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs border transition-all ${
                      vizColor === color.name
                        ? "border-white bg-zinc-800 text-zinc-100"
                        : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-500"
                    }`}
                  >
                    <span className="inline-block h-3 w-3 rounded-sm border border-zinc-600" style={{ backgroundColor: color.hex }} />
                    {color.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Finish */}
            <div className="flex gap-2">
              {VISUALIZER_FINISHES.map((f) => (
                <button
                  key={f}
                  onClick={() => setVizFinish(f)}
                  className={`rounded-lg px-3 py-2.5 text-xs font-medium border transition-all min-h-[40px] ${
                    vizFinish === f
                      ? "border-white bg-zinc-800 text-zinc-100"
                      : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-500"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>

            {/* Generate / result */}
            {vizError && (
              <p className="text-xs text-red-400 rounded-lg border border-red-900/40 bg-red-950/20 px-3 py-2">
                {vizError}
              </p>
            )}

            {!vizRenderUrl ? (
              <Button
                onClick={handleGenerateRender}
                loading={vizRendering}
                disabled={!vizPhotoPreview || vizRendering}
                className="w-full"
              >
                {vizRendering ? "Generating… (10–20 sec)" : "Generate Preview"}
              </Button>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-zinc-500">Before / After</p>
                <div className="grid grid-cols-2 gap-3">
                  {vizPhotoPreview && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={vizPhotoPreview} alt="Before" className="rounded-xl border border-zinc-700 w-full object-cover" />
                  )}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={vizRenderUrl} alt="After" className="rounded-xl border border-brand/40 w-full object-cover" />
                </div>
                {vizModelId && (
                  <p className="text-xs text-zinc-600">Model: {vizModelId}</p>
                )}
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => { setVizRenderUrl(null); setVizError(null); }}
                  >
                    Regenerate
                  </Button>
                  <Button onClick={handleUseRender} className="flex-1">
                    ✓ Use This Render
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-red-800/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <Button variant="secondary" onClick={() => setStep(5)}>Back</Button>
        <Button className="flex-1" onClick={handleSave} loading={saving}>
          {saving
            ? editingQuoteId ? "Saving Changes…" : "Saving Estimate…"
            : editingQuoteId ? "Save Changes" : "Save Estimate"}
        </Button>
      </div>

      {/* Suppress unused variable warning */}
      {selectedVizColor && null}
    </div>
  );
}
