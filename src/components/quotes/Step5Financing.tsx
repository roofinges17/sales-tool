"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useQuoteBuilder } from "@/lib/contexts/QuoteBuilderContext";
import { Button } from "@/components/ui/Button";
import type { FinancingPlan } from "@/lib/contexts/QuoteBuilderContext";

function formatCurrency(v: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);
}

export default function Step5Financing() {
  const { state, setStep, setFinancing, total, monthlyPayment } = useQuoteBuilder();
  const [plans, setPlans] = useState<FinancingPlan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase()
      .from("financing_plans")
      .select("*")
      .eq("is_active", true)
      .order("term_months")
      .then(({ data }) => {
        setPlans((data as FinancingPlan[]) ?? []);
        setLoading(false);
      });
  }, []);

  function calcMonthly(plan: FinancingPlan, amount: number) {
    const P = amount;
    const n = plan.term_months;
    const annualRate = plan.apr / 100;
    if (annualRate === 0) return P / n;
    const r = annualRate / 12;
    return (P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-lg font-semibold text-zinc-100">Financing</h2>
        <p className="text-sm text-zinc-500 mt-1">Offer the customer cash or a financing plan.</p>
      </div>

      {/* Cash vs Financing toggle */}
      <div className="flex gap-3">
        <button
          onClick={() => setFinancing(null, false)}
          className={`flex-1 rounded-2xl border p-4 text-left transition ${
            !state.useFinancing
              ? "border-brand bg-brand/10 ring-1 ring-brand"
              : "border-zinc-800 bg-zinc-900/60 hover:border-zinc-600"
          }`}
        >
          <p className="font-semibold text-zinc-100">Cash / Check</p>
          <p className="text-sm text-zinc-500 mt-1">Pay in full: {formatCurrency(total)}</p>
        </button>
        <button
          onClick={() => setFinancing(state.selectedFinancingPlan, true)}
          className={`flex-1 rounded-2xl border p-4 text-left transition ${
            state.useFinancing
              ? "border-brand bg-brand/10 ring-1 ring-brand"
              : "border-zinc-800 bg-zinc-900/60 hover:border-zinc-600"
          }`}
        >
          <p className="font-semibold text-zinc-100">Financing</p>
          <p className="text-sm text-zinc-500 mt-1">Monthly payment options available</p>
        </button>
      </div>

      {state.useFinancing && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-zinc-300">Select a plan:</p>
          {loading ? (
            <div className="text-sm text-zinc-500">Loading plans…</div>
          ) : plans.length === 0 ? (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 text-center text-sm text-zinc-500">
              No financing plans configured.{" "}
              <a href="/admin/settings/financing/" className="text-brand hover:underline">
                Add plans in Admin Settings.
              </a>
            </div>
          ) : (
            <div className="space-y-2">
              {plans.map((plan) => {
                const monthly = calcMonthly(plan, total);
                const dealerFeeAmt = total * (plan.dealer_fee_percentage / 100);
                const isSelected = state.financingPlanId === plan.id;
                return (
                  <button
                    key={plan.id}
                    onClick={() => setFinancing(plan, true)}
                    className={`w-full text-left rounded-2xl border p-4 transition ${
                      isSelected
                        ? "border-brand bg-brand/10 ring-1 ring-brand"
                        : "border-zinc-800 bg-zinc-900/60 hover:border-zinc-600"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold text-zinc-100">{plan.provider_name} — {plan.name}</p>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          {plan.term_months} months · {plan.apr}% APR · {plan.dealer_fee_percentage}% dealer fee
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-brand">{formatCurrency(monthly)}/mo</p>
                        <p className="text-xs text-zinc-500">+{formatCurrency(dealerFeeAmt)} dealer fee</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {state.selectedFinancingPlan && (
            <div className="rounded-xl border border-brand/30 bg-brand/5 p-4 space-y-1">
              <p className="text-xs font-semibold text-brand uppercase tracking-wider">Selected Plan Summary</p>
              <div className="grid grid-cols-2 gap-2 text-sm mt-2">
                <div>
                  <p className="text-zinc-500 text-xs">Amount Financed</p>
                  <p className="text-zinc-100 font-medium">{formatCurrency(total)}</p>
                </div>
                <div>
                  <p className="text-zinc-500 text-xs">Monthly Payment</p>
                  <p className="text-brand font-bold">{formatCurrency(monthlyPayment)}</p>
                </div>
                <div>
                  <p className="text-zinc-500 text-xs">Term</p>
                  <p className="text-zinc-100">{state.selectedFinancingPlan.term_months} months</p>
                </div>
                <div>
                  <p className="text-zinc-500 text-xs">APR</p>
                  <p className="text-zinc-100">{state.selectedFinancingPlan.apr}%</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-3">
        <Button variant="secondary" onClick={() => setStep(4)}>Back</Button>
        <Button className="flex-1" onClick={() => setStep(6)}>
          Next: Generate Estimate
        </Button>
      </div>
    </div>
  );
}
