"use client";

import { Card, CardContent } from "@/components/ui/Card";

export default function QuotesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-50">Estimates</h1>
        <p className="mt-1 text-sm text-zinc-500">Manage customer estimates and quote builder.</p>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-20 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-800">
            <svg className="h-7 w-7 text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-zinc-200">Estimates — Coming in Phase 5</h2>
          <p className="mt-2 max-w-md text-sm text-zinc-500">
            The 6-step quote builder, product catalog, pricing table, commission preview, and estimate management will be available in Phase 5.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
