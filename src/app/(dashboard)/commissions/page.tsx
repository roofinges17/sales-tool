"use client";

import { Card, CardContent } from "@/components/ui/Card";

export default function CommissionsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-50">Commissions</h1>
        <p className="mt-1 text-sm text-zinc-500">Track seller commissions and payouts.</p>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-20 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-800">
            <svg className="h-7 w-7 text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-zinc-200">Commissions — Coming in Phase 8</h2>
          <p className="mt-2 max-w-md text-sm text-zinc-500">
            Commission tracking, approval workflow, payout management, and seller leaderboard will be available in Phase 8.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
