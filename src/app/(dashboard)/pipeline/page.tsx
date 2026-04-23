"use client";

import { Card, CardContent } from "@/components/ui/Card";

export default function PipelinePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-50">Pipeline</h1>
        <p className="mt-1 text-sm text-zinc-500">Kanban view of your sales pipeline.</p>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-20 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-800">
            <svg className="h-7 w-7 text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-zinc-200">Pipeline Kanban — Coming in Phase 7</h2>
          <p className="mt-2 max-w-md text-sm text-zinc-500">
            Drag-and-drop Kanban board with workflow stages, stuck contract alerts, and department filtering will be available in Phase 7.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
