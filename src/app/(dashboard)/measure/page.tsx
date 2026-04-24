"use client";

import { useState } from "react";
import { RoofMeasure, type RoofData } from "@/components/RoofMeasure";

export default function MeasurePage() {
  const [measured, setMeasured] = useState<RoofData | null>(null);

  return (
    <div className="mx-auto max-w-2xl py-8 px-4">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent/20 to-status-teal/20 flex items-center justify-center">
            <svg className="w-5 h-5 text-status-teal" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h1 className="text-heading-lg text-text-primary">Roof Measurement</h1>
            <p className="text-body text-text-tertiary">Instant roof area from satellite imagery</p>
          </div>
        </div>
      </div>

      <RoofMeasure onMeasured={setMeasured} />

      {measured && (
        <div className="mt-4">
          <a
            href="/quotes/builder"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-sm bg-gradient-accent text-white shadow-glow-sm hover:shadow-glow hover:brightness-110 transition-all"
          >
            Use in Quote Builder
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </a>
        </div>
      )}
    </div>
  );
}
