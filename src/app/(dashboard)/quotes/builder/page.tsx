"use client";

import { useState, useEffect } from "react";
import { QuoteBuilderProvider, useQuoteBuilder } from "@/lib/contexts/QuoteBuilderContext";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import Step1Department from "@/components/quotes/Step1Department";
import Step2Products from "@/components/quotes/Step2Products";
import Step3Customer from "@/components/quotes/Step3Customer";
import Step4Review from "@/components/quotes/Step4Review";
import Step5Financing from "@/components/quotes/Step5Financing";
import Step6Generate from "@/components/quotes/Step6Generate";
import type { CartItem, FinancingPlan } from "@/lib/contexts/QuoteBuilderContext";

const STEPS = [
  { number: 1, label: "Department" },
  { number: 2, label: "Products" },
  { number: 3, label: "Customer" },
  { number: 4, label: "Review" },
  { number: 5, label: "Financing" },
  { number: 6, label: "Generate" },
];

function StepperHeader({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center justify-between mb-8">
      {STEPS.map((step, i) => (
        <div key={step.number} className="flex items-center">
          <div className="flex items-center gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                step.number < currentStep
                  ? "bg-green-500 text-white"
                  : step.number === currentStep
                  ? "bg-brand text-white"
                  : "bg-zinc-800 text-zinc-500"
              }`}
            >
              {step.number < currentStep ? (
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                step.number
              )}
            </div>
            <span
              className={`text-sm font-medium ${
                step.number === currentStep
                  ? "text-zinc-100"
                  : "hidden lg:block text-zinc-500"
              }`}
            >
              {step.label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div
              className={`mx-0.5 h-px w-3 sm:mx-1 sm:w-6 lg:mx-3 lg:w-20 transition-colors ${
                step.number < currentStep ? "bg-green-500" : "bg-zinc-800"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function QuoteBuilderInner() {
  const { state, hasDraft, restoreDraft, clearDraft, hydrateFromQuote, editingQuoteId } = useQuoteBuilder();
  const step = state.step;

  const [showRestoreBanner, setShowRestoreBanner] = useState(false);
  const [hydrating, setHydrating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    const urlId =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("id")
        : null;

    if (urlId) {
      // Load existing quote into builder
      setIsEditing(true);
      setHydrating(true);
      (async () => {
        try {
          const { data: q, error } = await supabase()
            .from("quotes")
            .select("*, account:account_id(id,name), department:department_id(id,name), quote_line_items(*), assigned_to:assigned_to_id(id,name)")
            .eq("id", urlId)
            .single();

          if (error) {
            toast.error("Failed to load estimate: " + error.message);
            setHydrating(false);
            return;
          }

          const qr = q as {
            id: string;
            status: string;
            discount_type?: string | null;
            discount_value?: number | null;
            tax_rate?: number | null;
            tax_exempt?: boolean | null;
            notes?: string | null;
            valid_until?: string | null;
            financing_provider?: string | null;
            visualization_color_id?: string | null;
            folio_number?: string | null;
            roof_color?: string | null;
            visualizer_image_url?: string | null;
            visualizer_color?: string | null;
            visualizer_finish?: string | null;
            account?: { id: string; name: string } | null;
            department?: { id: string; name: string } | null;
            quote_line_items?: Array<{
              id: string;
              product_id?: string | null;
              product_name: string;
              product_sku?: string | null;
              product_description?: string | null;
              quantity: number;
              unit_price: number;
              unit_cost?: number | null;
              line_total: number;
            }>;
          };

          if (qr.status === "ACCEPTED") {
            toast.error("This estimate is accepted and cannot be edited. Duplicate it instead.");
            setHydrating(false);
            setIsEditing(false);
            return;
          }

          const validDays = qr.valid_until
            ? Math.max(1, Math.round((new Date(qr.valid_until).getTime() - Date.now()) / 86400000))
            : 30;

          const cart: CartItem[] = (qr.quote_line_items ?? []).map((li) => ({
            product_id: li.product_id ?? li.id,
            product_name: li.product_name,
            product_sku: li.product_sku ?? null,
            product_description: li.product_description ?? null,
            quantity: li.quantity,
            unit_price: li.unit_price,
            unit_cost: li.unit_cost ?? null,
            min_price: null,
            max_price: null,
            default_price: null,
            product_type: "PRODUCT" as const,
            unit: null,
            line_total: li.line_total,
            is_manual_qty: true,
          }));

          hydrateFromQuote({
            id: qr.id,
            departmentId: (qr.department as { id: string } | null)?.id ?? null,
            departmentName: (qr.department as { name: string } | null)?.name ?? null,
            cart,
            existingAccountId: (qr.account as { id: string } | null)?.id ?? null,
            existingAccountName: (qr.account as { name: string } | null)?.name ?? null,
            discountType: (qr.discount_type as "PERCENTAGE" | "FIXED" | null) ?? null,
            discountValue: qr.discount_value ?? 0,
            taxRate: qr.tax_rate ?? 0.07,
            taxExempt: qr.tax_exempt ?? false,
            validDays,
            notes: qr.notes ?? "",
            financingPlanId: null,
            selectedFinancingPlan: null,
            useFinancing: !!(qr.financing_provider),
            visualizationColorId: qr.visualization_color_id ?? null,
            folioNumber: qr.folio_number ?? "",
            roofColor: qr.roof_color ?? null,
            visualizerImageUrl: qr.visualizer_image_url ?? null,
            visualizerColor: qr.visualizer_color ?? null,
            visualizerFinish: qr.visualizer_finish ?? null,
          });
        } finally {
          setHydrating(false);
        }
      })();
    } else {
      // Check for unsaved draft
      if (hasDraft()) {
        setShowRestoreBanner(true);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (hydrating) {
    return (
      <div className="flex items-center justify-center py-16 text-zinc-500">
        <svg className="mr-2 h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Loading estimate…
      </div>
    );
  }

  const pageTitle = isEditing || editingQuoteId ? "Edit Estimate" : "New Estimate";
  const pageSubtitle = isEditing || editingQuoteId
    ? "Update the estimate details below."
    : "Build a professional estimate in 6 steps.";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-50">{pageTitle}</h1>
        <p className="mt-1 text-sm text-zinc-500">{pageSubtitle}</p>
      </div>

      {showRestoreBanner && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-700/40 bg-amber-950/20 px-4 py-3 text-sm">
          <svg className="h-4 w-4 shrink-0 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <span className="flex-1 text-amber-200">You have an unsaved draft. Restore it?</span>
          <button onClick={() => { restoreDraft(); setShowRestoreBanner(false); }} className="text-xs font-semibold text-amber-300 hover:text-amber-100 underline">Restore</button>
          <button onClick={() => { clearDraft(); setShowRestoreBanner(false); }} className="text-xs text-zinc-500 hover:text-zinc-300">Discard</button>
        </div>
      )}

      <StepperHeader currentStep={step} />
      <div className="min-h-[400px]">
        {step === 1 && <Step1Department />}
        {step === 2 && <Step2Products />}
        {step === 3 && <Step3Customer />}
        {step === 4 && <Step4Review />}
        {step === 5 && <Step5Financing />}
        {step === 6 && <Step6Generate />}
      </div>
    </div>
  );
}

export default function QuoteBuilderPage() {
  return (
    <QuoteBuilderProvider>
      <QuoteBuilderInner />
    </QuoteBuilderProvider>
  );
}
