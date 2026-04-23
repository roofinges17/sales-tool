"use client";

import { Card, CardContent } from "@/components/ui/Card";

export default function SalesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-50">Contracts</h1>
        <p className="mt-1 text-sm text-zinc-500">Track active and completed contracts.</p>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-20 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-800">
            <svg className="h-7 w-7 text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-zinc-200">Contracts — Coming in Phase 6</h2>
          <p className="mt-2 max-w-md text-sm text-zinc-500">
            Contract list, detail view, payment tracking, and workflow stage management will be available in Phase 6.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
