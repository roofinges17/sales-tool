"use client";

import { QuoteBuilderProvider, useQuoteBuilder } from "@/lib/contexts/QuoteBuilderContext";
import Step1Department from "@/components/quotes/Step1Department";
import Step2Products from "@/components/quotes/Step2Products";
import Step3Customer from "@/components/quotes/Step3Customer";
import Step4Review from "@/components/quotes/Step4Review";
import Step5Financing from "@/components/quotes/Step5Financing";
import Step6Generate from "@/components/quotes/Step6Generate";

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
              className={`hidden sm:block text-sm font-medium ${
                step.number === currentStep ? "text-zinc-100" : "text-zinc-500"
              }`}
            >
              {step.label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div
              className={`mx-1 h-px w-4 sm:mx-3 sm:w-12 md:w-20 transition-colors ${
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
  const { state } = useQuoteBuilder();
  const step = state.step;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-50">New Estimate</h1>
        <p className="mt-1 text-sm text-zinc-500">Build a professional estimate in 6 steps.</p>
      </div>
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
