"use client";

// Reusable card for integration status pages under /admin/settings/.
// Renders a status badge, last-check timestamp, recheck button, and
// an optional config/docs section below.

export type IntegrationStatus = "connected" | "partial" | "disconnected" | "unconfigured" | "checking";

interface IntegrationStatusCardProps {
  name: string;
  description: string;
  status: IntegrationStatus;
  statusLabel?: string;
  lastChecked?: Date | null;
  onRecheck: () => void;
  checking: boolean;
  children?: React.ReactNode;
}

const STATUS_STYLES: Record<IntegrationStatus, { dot: string; text: string; label: string }> = {
  connected:    { dot: "bg-emerald-400", text: "text-emerald-400", label: "Connected" },
  partial:      { dot: "bg-amber-400",   text: "text-amber-400",   label: "Partial / Mock" },
  disconnected: { dot: "bg-red-400",     text: "text-red-400",     label: "Disconnected" },
  unconfigured: { dot: "bg-zinc-500",    text: "text-zinc-500",    label: "Not configured" },
  checking:     { dot: "bg-zinc-500 animate-pulse", text: "text-zinc-500", label: "Checking…" },
};

export default function IntegrationStatusCard({
  name,
  description,
  status,
  statusLabel,
  lastChecked,
  onRecheck,
  checking,
  children,
}: IntegrationStatusCardProps) {
  const s = STATUS_STYLES[status];
  const label = statusLabel ?? s.label;

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-zinc-800 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-zinc-100">{name}</h2>
          <p className="text-sm text-zinc-500 mt-0.5">{description}</p>
        </div>
        {/* Status badge */}
        <div className="flex items-center gap-2 shrink-0">
          <span className={`w-2 h-2 rounded-full ${s.dot}`} />
          <span className={`text-sm font-medium ${s.text}`}>{label}</span>
        </div>
      </div>

      {/* Footer: last check + recheck button */}
      <div className="px-6 py-3 border-b border-zinc-800 flex items-center justify-between gap-4 bg-zinc-900/30">
        <span className="text-xs text-zinc-600">
          {lastChecked
            ? `Last checked ${lastChecked.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
            : "Not yet checked"}
        </span>
        <button
          onClick={onRecheck}
          disabled={checking}
          className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 disabled:opacity-50 transition-colors"
        >
          <svg
            className={`w-3.5 h-3.5 ${checking ? "animate-spin" : ""}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {checking ? "Checking…" : "Recheck"}
        </button>
      </div>

      {/* Content slot */}
      {children && <div className="p-6 space-y-6">{children}</div>}
    </div>
  );
}
