"use client";

import { useQuoteBuilder } from "@/lib/contexts/QuoteBuilderContext";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

function formatCurrency(v: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);
}

const quickPcts = [5, 10, 15, 20];
const quickFixed = [500, 1000, 2500, 5000];

export default function Step4Review() {
  const {
    state,
    setStep,
    setDiscount,
    setTaxRate,
    setTaxExempt,
    setValidDays,
    setNotes,
    subtotal,
    discountAmount,
    taxAmount,
    total,
    commissions,
  } = useQuoteBuilder();

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Main review area */}
      <div className="lg:col-span-2 space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">Review Estimate</h2>
          <p className="text-sm text-zinc-500 mt-1">Review line items and apply discounts.</p>
        </div>

        {/* Line items */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 divide-y divide-zinc-800">
          <div className="px-4 py-3 flex text-xs font-medium uppercase tracking-wider text-zinc-500">
            <span className="flex-1">Item</span>
            <span className="w-12 sm:w-16 text-center">Qty</span>
            <span className="hidden sm:block w-24 text-right">Unit Price</span>
            <span className="w-20 sm:w-24 text-right">Total</span>
          </div>
          {state.cart.map((item) => (
            <div key={item.product_id} className="px-4 py-3 flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-zinc-100 font-medium truncate">{item.product_name}</p>
                {item.unit && <p className="text-xs text-zinc-500">{item.unit}</p>}
                <p className="text-xs text-zinc-400 sm:hidden">{formatCurrency(item.unit_price)} / unit</p>
              </div>
              <span className="w-12 sm:w-16 text-center text-sm text-zinc-400">{item.quantity}</span>
              <span className="hidden sm:block w-24 text-right text-sm text-zinc-300">{formatCurrency(item.unit_price)}</span>
              <span className="w-20 sm:w-24 text-right text-sm font-medium text-zinc-100">{formatCurrency(item.line_total)}</span>
            </div>
          ))}
          <div className="px-4 py-3 flex justify-between">
            <span className="text-sm font-medium text-zinc-300">Subtotal</span>
            <span className="text-base font-bold text-zinc-50">{formatCurrency(subtotal)}</span>
          </div>
        </div>

        {/* Discount */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-3">
          <p className="text-sm font-semibold text-zinc-300">Discount</p>
          <div className="flex gap-2">
            <button
              onClick={() => setDiscount("PERCENTAGE", state.discountType === "PERCENTAGE" ? 0 : state.discountValue)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                state.discountType === "PERCENTAGE" ? "bg-brand text-white" : "bg-zinc-800 text-zinc-300"
              }`}
            >
              %
            </button>
            <button
              onClick={() => setDiscount("FIXED", state.discountType === "FIXED" ? 0 : state.discountValue)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                state.discountType === "FIXED" ? "bg-brand text-white" : "bg-zinc-800 text-zinc-300"
              }`}
            >
              $
            </button>
          </div>
          {state.discountType === "PERCENTAGE" && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {quickPcts.map((pct) => (
                  <button
                    key={pct}
                    onClick={() => setDiscount("PERCENTAGE", pct)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                      state.discountValue === pct ? "bg-brand text-white" : "bg-zinc-800 text-zinc-300"
                    }`}
                  >
                    {pct}%
                  </button>
                ))}
              </div>
              <Input
                type="number"
                placeholder="Custom %"
                value={state.discountValue || ""}
                onChange={(e) => setDiscount("PERCENTAGE", parseFloat(e.target.value) || 0)}
              />
            </div>
          )}
          {state.discountType === "FIXED" && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {quickFixed.map((amt) => (
                  <button
                    key={amt}
                    onClick={() => setDiscount("FIXED", amt)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                      state.discountValue === amt ? "bg-brand text-white" : "bg-zinc-800 text-zinc-300"
                    }`}
                  >
                    ${amt.toLocaleString()}
                  </button>
                ))}
              </div>
              <Input
                type="number"
                placeholder="Custom $"
                value={state.discountValue || ""}
                onChange={(e) => setDiscount("FIXED", parseFloat(e.target.value) || 0)}
              />
            </div>
          )}
        </div>

        {/* Settings row */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Tax</label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setTaxExempt(!state.taxExempt)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                  state.taxExempt ? "bg-green-500" : "bg-zinc-700"
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  state.taxExempt ? "translate-x-5" : "translate-x-0.5"
                }`} />
              </button>
              {state.taxExempt ? (
                <span className="text-sm text-green-400 font-medium">Tax Exempt</span>
              ) : (
                <Input
                  type="number"
                  step="0.1"
                  placeholder="Rate %"
                  value={(state.taxRate * 100).toFixed(1)}
                  onChange={(e) => setTaxRate(parseFloat(e.target.value) / 100 || 0.07)}
                  className="w-24"
                />
              )}
            </div>
          </div>
          <Input
            label="Valid for (days)"
            type="number"
            value={state.validDays}
            onChange={(e) => setValidDays(parseInt(e.target.value) || 30)}
          />
        </div>

        {/* Notes */}
        <div>
          <label className="text-sm font-medium text-zinc-300">Notes</label>
          <textarea
            rows={3}
            className="mt-1.5 w-full rounded-xl border border-zinc-700 bg-zinc-950/80 px-4 py-2.5 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-brand focus:ring-2 focus:ring-brand/30"
            placeholder="Add notes for the customer…"
            value={state.notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => setStep(3)}>Back</Button>
          <Button className="flex-1" onClick={() => setStep(5)}>
            Next: Financing
          </Button>
        </div>
      </div>

      {/* Sidebar: Totals + Commissions */}
      <div className="space-y-4">
        {/* Totals */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">Totals</p>
          <div className="flex justify-between text-sm">
            <span className="text-zinc-400">Subtotal</span>
            <span className="text-zinc-200">{formatCurrency(subtotal)}</span>
          </div>
          {discountAmount > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-zinc-400">
                Discount ({state.discountType === "PERCENTAGE" ? `${state.discountValue}%` : "Fixed"})
              </span>
              <span className="text-green-400">−{formatCurrency(discountAmount)}</span>
            </div>
          )}
          {state.taxExempt ? (
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500">Tax</span>
              <span className="text-green-500 text-xs font-medium">Exempt</span>
            </div>
          ) : (
            <div className="flex justify-between text-sm">
              <span className="text-zinc-400">Tax ({(state.taxRate * 100).toFixed(1)}%)</span>
              <span className="text-zinc-200">{formatCurrency(taxAmount)}</span>
            </div>
          )}
          <div className="border-t border-zinc-800 pt-2 flex justify-between">
            <span className="font-semibold text-zinc-100">Total</span>
            <span className="text-xl font-bold text-zinc-50">{formatCurrency(total)}</span>
          </div>
        </div>

        {/* Commission Summary */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">Commission Preview</p>
          <div className="flex justify-between text-sm">
            <span className="text-zinc-400">Seller Markup</span>
            <span className="text-blue-400">{formatCurrency(commissions.sellerMarkup)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-zinc-400">Base Profit</span>
            <span className="text-zinc-200">{formatCurrency(commissions.baseProfit)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-zinc-400">Manager (18%)</span>
            <span className="text-purple-400">{formatCurrency(commissions.managerCommission)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-zinc-400">Company (5%)</span>
            <span className="text-zinc-400">{formatCurrency(commissions.ownerCommission)}</span>
          </div>
        </div>

        {/* Customer summary */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Customer</p>
          <p className="text-sm font-medium text-zinc-100">
            {state.existingAccountName || state.newCustomer.name || "Not selected"}
          </p>
          {state.isNewCustomer && state.newCustomer.billing_city && (
            <p className="text-xs text-zinc-500 mt-0.5">
              {state.newCustomer.billing_city}, {state.newCustomer.billing_state}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
