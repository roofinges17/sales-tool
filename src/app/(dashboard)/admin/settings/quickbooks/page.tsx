"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Table } from "@/components/ui/Table";
import type { Column } from "@/components/ui/Table";
import { toast } from "sonner";

interface ConnectionStatus {
  qb_realm_id: string | null;
  qb_token_expires_at: string | null;
  qb_sync_customers: boolean;
  qb_sync_products: boolean;
  qb_sync_invoices: boolean;
}

interface SyncLog {
  id: string;
  created_at: string;
  sync_type: string;
  status: string;
  records_synced: number;
  error_message: string | null;
}

const STATUS_VARIANT: Record<string, "green" | "red" | "gray" | "orange"> = {
  success: "green",
  error: "red",
  pending: "orange",
  running: "orange",
};

export default function QuickBooksPage() {
  const searchParams = useSearchParams();
  const [conn, setConn] = useState<ConnectionStatus | null>(null);
  const [syncLog, setSyncLog] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    if (searchParams.get("qb_connected") === "1") {
      toast.success("QuickBooks connected successfully.");
    } else if (searchParams.get("qb_error")) {
      toast.error("QuickBooks connection failed: " + searchParams.get("qb_error"));
    }
    loadAll();
  }, [searchParams]);

  async function loadAll() {
    setLoading(true);
    const [{ data: cs }, { data: logs }] = await Promise.all([
      supabase()
        .from("company_settings")
        .select("qb_realm_id, qb_token_expires_at, qb_sync_customers, qb_sync_products, qb_sync_invoices")
        .limit(1)
        .maybeSingle(),
      supabase()
        .from("qb_sync_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    setConn((cs as ConnectionStatus | null) ?? null);
    setSyncLog((logs as SyncLog[]) ?? []);
    setLoading(false);
  }

  async function handleConnect() {
    // Navigate to the CF Function which redirects to Intuit OAuth
    window.location.href = "/api/quickbooks/connect";
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    const { error } = await supabase()
      .from("company_settings")
      .update({
        qb_realm_id: null,
        qb_access_token: null,
        qb_refresh_token: null,
        qb_token_expires_at: null,
      })
      .limit(1);
    setDisconnecting(false);
    if (error) { toast.error("Disconnect failed: " + error.message); return; }
    toast.success("QuickBooks disconnected.");
    loadAll();
  }

  async function handleSync(syncType: string) {
    setSyncing(true);
    const res = await fetch("/api/quickbooks/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sync_type: syncType }),
    });
    const json = (await res.json()) as { ok?: boolean; error?: string };
    setSyncing(false);
    if (!res.ok || json.error) { toast.error(json.error ?? "Sync failed"); return; }
    toast.success("Sync queued — check the log below.");
    loadAll();
  }

  async function updateSyncSetting(field: keyof Pick<ConnectionStatus, "qb_sync_customers" | "qb_sync_products" | "qb_sync_invoices">, value: boolean) {
    const { error } = await supabase().from("company_settings").update({ [field]: value }).limit(1);
    if (error) { toast.error("Update failed: " + error.message); return; }
    setConn((prev) => prev ? { ...prev, [field]: value } : prev);
  }

  const isConnected = !!(conn?.qb_realm_id);

  const logColumns: Column<SyncLog>[] = [
    {
      key: "created_at",
      header: "Date",
      render: (row) => (
        <span className="text-zinc-400 text-sm">
          {new Date(row.created_at).toLocaleString()}
        </span>
      ),
    },
    {
      key: "sync_type",
      header: "Type",
      render: (row) => <span className="text-zinc-300 capitalize">{row.sync_type}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (row) => <Badge variant={STATUS_VARIANT[row.status] ?? "gray"}>{row.status}</Badge>,
    },
    {
      key: "records_synced",
      header: "Records",
      render: (row) => <span className="text-zinc-400">{row.records_synced}</span>,
    },
    {
      key: "error_message",
      header: "Notes",
      render: (row) => (
        <span className="text-zinc-500 text-xs truncate max-w-xs block">
          {row.error_message ?? "—"}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-50">QuickBooks Integration</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Sync customers, products, and invoices with QuickBooks Online.
        </p>
      </div>

      {/* Connection status */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              {/* QB logo placeholder */}
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#2CA01C]/10 text-[#2CA01C]">
                <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15v-4H7l5-8v4h4l-5 8z" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-zinc-100">QuickBooks Online</p>
                {loading ? (
                  <div className="mt-1 h-4 w-40 animate-pulse rounded bg-zinc-800" />
                ) : isConnected ? (
                  <p className="text-sm text-zinc-400">
                    Connected · Realm {conn!.qb_realm_id}
                    {conn!.qb_token_expires_at && (
                      <> · Expires {new Date(conn!.qb_token_expires_at).toLocaleDateString()}</>
                    )}
                  </p>
                ) : (
                  <p className="text-sm text-zinc-500">Not connected</p>
                )}
              </div>
            </div>
            <div>
              {loading ? null : isConnected ? (
                <Button variant="secondary" loading={disconnecting} onClick={handleDisconnect}>
                  Disconnect
                </Button>
              ) : (
                <Button onClick={handleConnect}>
                  Connect to QuickBooks
                </Button>
              )}
            </div>
          </div>

          {!loading && !isConnected && (
            <div className="mt-4 rounded-xl border border-amber-800/30 bg-amber-950/20 px-4 py-3 text-sm text-amber-300">
              <strong>ACTION REQUIRED:</strong> Create an Intuit Developer sandbox app at{" "}
              <a href="https://developer.intuit.com" target="_blank" rel="noreferrer" className="underline">
                developer.intuit.com
              </a>{" "}
              and add <code className="bg-amber-900/40 px-1 rounded">QB_CLIENT_ID</code> and{" "}
              <code className="bg-amber-900/40 px-1 rounded">QB_CLIENT_SECRET</code> to Cloudflare Pages environment variables.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sync settings (only shown when connected) */}
      {isConnected && (
        <Card>
          <CardContent className="p-6 space-y-4">
            <p className="font-semibold text-zinc-100">Sync Settings</p>

            {[
              { field: "qb_sync_customers" as const, label: "Customers", description: "Sync customer accounts to QuickBooks contacts" },
              { field: "qb_sync_products" as const, label: "Products & Services", description: "Sync product catalog to QuickBooks items" },
              { field: "qb_sync_invoices" as const, label: "Invoices", description: "Push accepted estimates as QuickBooks invoices" },
            ].map(({ field, label, description }) => (
              <div key={field} className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-zinc-200">{label}</p>
                  <p className="text-xs text-zinc-500">{description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => updateSyncSetting(field, !(conn?.[field] ?? true))}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${conn?.[field] ? "bg-green-500" : "bg-zinc-700"}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${conn?.[field] ? "translate-x-5" : "translate-x-0.5"}`} />
                </button>
              </div>
            ))}

            <div className="pt-2 border-t border-zinc-800 flex items-center gap-3">
              <Button loading={syncing} onClick={() => handleSync("full")}>Sync Now (All)</Button>
              <Button variant="secondary" loading={syncing} onClick={() => handleSync("customers")}>Sync Customers</Button>
              <Button variant="secondary" loading={syncing} onClick={() => handleSync("invoices")}>Sync Invoices</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sync history */}
      <div>
        <h2 className="text-lg font-semibold text-zinc-100 mb-3">Sync History</h2>
        <Card>
          <Table
            columns={logColumns}
            data={syncLog}
            loading={loading}
            keyExtractor={(r) => r.id}
            emptyMessage="No sync runs yet."
          />
        </Card>
      </div>
    </div>
  );
}
