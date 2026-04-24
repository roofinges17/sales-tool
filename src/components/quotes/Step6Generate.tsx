"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/hooks/useAuth";
import { useQuoteBuilder } from "@/lib/contexts/QuoteBuilderContext";
import { Button } from "@/components/ui/Button";

function formatCurrency(v: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);
}

async function getNextEstimateNumber(prefix: string): Promise<string> {
  const { data } = await supabase()
    .from("quotes")
    .select("name")
    .ilike("name", `${prefix}%`)
    .order("created_at", { ascending: false })
    .limit(1);

  let nextNum = 1;
  if (data && data.length > 0) {
    const lastName = (data[0] as { name: string }).name;
    const numPart = parseInt(lastName.replace(prefix, "")) || 0;
    nextNum = numPart + 1;
  }
  return `${prefix}${String(nextNum).padStart(4, "0")}`;
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
  } = useQuoteBuilder();
  const visualizationColorId = state.visualizationColorId;
  const compositeImageDataUrl = state.compositeImageDataUrl;
  const folioNumber = state.folioNumber;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);

    try {
      // Get company settings for prefix
      const { data: settings } = await supabase()
        .from("company_settings")
        .select("estimate_prefix")
        .limit(1)
        .maybeSingle();
      const prefix = (settings as { estimate_prefix?: string } | null)?.estimate_prefix ?? "EST-";
      const estimateName = await getNextEstimateNumber(prefix);

      // If new customer, create account first
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

      // Valid until date
      const validUntil = new Date();
      validUntil.setDate(validUntil.getDate() + state.validDays);

      // Insert quote
      const { data: quote, error: quoteErr } = await supabase()
        .from("quotes")
        .insert({
          name: estimateName,
          status: "DRAFT",
          subtotal,
          discount_type: state.discountType,
          discount_value: state.discountValue || null,
          discount_amount: discountAmount || null,
          tax_rate: state.taxRate,
          tax_amount: taxAmount,
          total,
          financing_provider: state.selectedFinancingPlan?.provider_name ?? null,
          financing_term: state.selectedFinancingPlan?.term_months ?? null,
          financing_rate: state.selectedFinancingPlan?.apr ?? null,
          monthly_payment: monthlyPayment || null,
          valid_until: validUntil.toISOString().split("T")[0],
          notes: state.notes || null,
          account_id: accountId,
          department_id: state.departmentId,
          created_by_id: user?.id ?? null,
          assigned_to_id: user?.id ?? null,
          visualization_color_id: visualizationColorId ?? null,
          visualization_image: compositeImageDataUrl ?? null,
          folio_number: folioNumber || null,
        })
        .select()
        .single();
      if (quoteErr) throw new Error(quoteErr.message);

      const quoteId = (quote as { id: string }).id;

      // Insert line items
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

      // GHL contact sync — fire-and-forget, never blocks save
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
            // GHL sync failure never surfaces to user
          }
        })();
      }

      reset();
      window.location.href = `/quotes/detail/?id=${quoteId}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save estimate");
      setSaving(false);
    }
  }

  const customerName = state.existingAccountName || state.newCustomer.name;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-100">Estimate Preview</h2>
        <p className="text-sm text-zinc-500 mt-1">Review the estimate before saving.</p>
      </div>

      {/* Estimate Preview Document */}
      <div className="rounded-2xl border border-zinc-700 bg-zinc-900 overflow-hidden">
        {/* Header */}
        <div className="bg-zinc-800 px-8 py-6 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-zinc-50">ESTIMATE</h1>
            <p className="text-sm text-zinc-400 mt-1">
              Valid for {state.validDays} days from issue date
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium text-zinc-300">Roofing Experts</p>
            <p className="text-xs text-zinc-500">Estimate prepared for:</p>
            <p className="text-sm font-semibold text-zinc-100 mt-0.5">{customerName || "Customer"}</p>
            {folioNumber && (
              <p className="text-xs text-zinc-500 mt-1">Folio: <span className="text-zinc-300 font-mono">{folioNumber}</span></p>
            )}
          </div>
        </div>

        {/* Line items */}
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
                return (
                  <tr key={item.product_id}>
                    <td className="py-3">
                      <p className="font-medium text-zinc-100">{item.product_name}</p>
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

          {/* Totals */}
          <div className="mt-6 ml-auto w-64 space-y-2">
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
              <span className="text-zinc-400">Tax ({(state.taxRate * 100).toFixed(1)}%)</span>
              <span className="text-zinc-200">{formatCurrency(taxAmount)}</span>
            </div>
            <div className="border-t border-zinc-700 pt-2 flex justify-between">
              <span className="font-bold text-zinc-100">Total</span>
              <span className="text-xl font-bold text-zinc-50">{formatCurrency(total)}</span>
            </div>
          </div>

          {/* Financing disclosure */}
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

        {/* Commission summary */}
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

      {error && (
        <div className="rounded-xl border border-red-800/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <Button variant="secondary" onClick={() => setStep(5)}>Back</Button>
        <Button
          className="flex-1"
          onClick={handleSave}
          loading={saving}
        >
          {saving ? "Saving Estimate…" : "Save Estimate"}
        </Button>
      </div>
    </div>
  );
}
