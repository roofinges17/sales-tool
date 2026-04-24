"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Tabs } from "@/components/ui/Tabs";
import { Table } from "@/components/ui/Table";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { toast } from "sonner";
import type { Column } from "@/components/ui/Table";

interface CommissionEntry {
  id: string;
  amount: number;
  type?: string | null;
  status: "PENDING" | "EARNED" | "APPROVED" | "PAID" | "BLOCKED";
  role: "PRIMARY_SELLER" | "SECONDARY_SELLER" | "MANAGER" | "COMPANY";
  paid_date?: string | null;
  created_at: string;
  recipient?: { id: string; name: string } | null;
  sale?: {
    id: string;
    name: string;
    contract_number?: string | null;
    contract_value: number;
    status: string;
    account?: { name: string } | null;
    department?: { name: string } | null;
  } | null;
}

type TabKey = "all" | "PENDING" | "EARNED" | "PAID";

const tabs = [
  { key: "all", label: "All" },
  { key: "PENDING", label: "Pending" },
  { key: "EARNED", label: "Earned" },
  { key: "PAID", label: "Paid" },
];

const roleVariant: Record<string, "blue" | "purple" | "gray" | "teal"> = {
  PRIMARY_SELLER: "blue",
  SECONDARY_SELLER: "teal",
  MANAGER: "purple",
  COMPANY: "gray",
};

const statusVariant: Record<string, "orange" | "blue" | "green" | "red" | "gray"> = {
  PENDING: "orange",
  EARNED: "blue",
  APPROVED: "blue",
  PAID: "green",
  BLOCKED: "red",
};

function formatCurrency(v: number | null | undefined) {
  if (v == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function CommissionsPage() {
  const [entries, setEntries] = useState<CommissionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [selectedEntry, setSelectedEntry] = useState<CommissionEntry | null>(null);

  useEffect(() => {
    loadEntries();
  }, []);

  async function loadEntries() {
    setLoading(true);
    const { data, error } = await supabase()
      .from("commission_entries")
      .select("*, recipient:recipient_id(id, name), sale:sale_id(id, name, contract_number, contract_value, status, account:account_id(name), department:department_id(name))")
      .order("created_at", { ascending: false });
    if (error) toast.error("Failed to load commissions: " + error.message);
    setEntries((data as CommissionEntry[]) ?? []);
    setLoading(false);
  }

  const filtered = entries.filter((e) => {
    const matchTab =
      activeTab === "all" ||
      (activeTab === "PENDING" && (e.status === "PENDING" || e.status === "EARNED")) ||
      (activeTab === "EARNED" && e.status === "EARNED") ||
      (activeTab === "PAID" && e.status === "PAID");
    const matchSearch =
      !search ||
      (e.sale as { name?: string } | null)?.name?.toLowerCase().includes(search.toLowerCase()) ||
      (e.recipient as { name?: string } | null)?.name?.toLowerCase().includes(search.toLowerCase());
    const matchRole = !roleFilter || e.role === roleFilter;
    return matchTab && matchSearch && matchRole;
  });

  const totalEarned = entries.reduce((sum, e) => sum + e.amount, 0);
  const totalPaid = entries.filter((e) => e.status === "PAID").reduce((sum, e) => sum + e.amount, 0);
  const totalPending = entries.filter((e) => e.status !== "PAID").reduce((sum, e) => sum + e.amount, 0);

  const tabsWithCounts = tabs.map((t) => ({
    ...t,
    count: t.key === "all"
      ? entries.length
      : t.key === "PENDING"
      ? entries.filter((e) => e.status === "PENDING" || e.status === "EARNED").length
      : entries.filter((e) => e.status === t.key).length,
  }));

  const columns: Column<CommissionEntry>[] = [
    {
      key: "sale",
      header: "Sale",
      render: (row) => (
        <div>
          <a
            href={`/sales/detail/?id=${(row.sale as { id?: string } | null)?.id}`}
            className="text-sm font-medium text-zinc-100 hover:text-brand"
          >
            {(row.sale as { contract_number?: string; name?: string } | null)?.contract_number ??
             (row.sale as { name?: string } | null)?.name ?? "—"}
          </a>
          <p className="text-xs text-zinc-500">
            {(row.sale as { account?: { name?: string } } | null)?.account?.name ?? "—"}
          </p>
        </div>
      ),
    },
    {
      key: "recipient",
      header: "Recipient",
      render: (row) => (
        <span className="text-zinc-300">{(row.recipient as { name?: string } | null)?.name ?? "—"}</span>
      ),
    },
    {
      key: "role",
      header: "Role",
      render: (row) => (
        <Badge variant={roleVariant[row.role] ?? "gray"}>
          {row.role.replace("_", " ")}
        </Badge>
      ),
    },
    {
      key: "amount",
      header: "Amount Owed",
      render: (row) => <span className="font-semibold text-zinc-100">{formatCurrency(row.amount)}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <Badge variant={statusVariant[row.status] ?? "gray"}>{row.status}</Badge>
      ),
    },
    {
      key: "job_status",
      header: "Job Status",
      render: (row) => {
        const s = (row.sale as { status?: string } | null)?.status;
        if (!s) return <span className="text-zinc-600">—</span>;
        const v: Record<string, "orange" | "blue" | "green" | "red" | "gray"> = {
          PENDING: "orange", ACTIVE: "blue", COMPLETED: "green", CANCELLED: "red",
        };
        return <Badge variant={v[s] ?? "gray"}>{s}</Badge>;
      },
    },
    {
      key: "paid_date",
      header: "Paid",
      render: (row) => (
        <span className="text-xs text-zinc-500">{row.paid_date ? formatDate(row.paid_date) : "—"}</span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-50">Commissions</h1>
        <p className="mt-1 text-sm text-zinc-500">Track seller commissions and payouts.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-800 text-zinc-400">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-xs text-zinc-500">Total Earned</p>
              <p className="text-xl font-bold text-zinc-50">{formatCurrency(totalEarned)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-950/60 text-green-400">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-xs text-zinc-500">Paid Out</p>
              <p className="text-xl font-bold text-green-400">{formatCurrency(totalPaid)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-950/60 text-orange-400">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-xs text-zinc-500">Pending</p>
              <p className="text-xl font-bold text-orange-400">{formatCurrency(totalPending)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <div className="px-6 pt-4">
          <Tabs tabs={tabsWithCounts} activeTab={activeTab} onChange={(k) => setActiveTab(k as TabKey)} />
        </div>
        <div className="flex flex-wrap items-center gap-3 px-6 py-4">
          <div className="flex-1 min-w-[200px]">
            <Input
              placeholder="Search by sale or recipient…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="w-48">
            <Select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              placeholder="All roles"
              options={[
                { value: "PRIMARY_SELLER", label: "Primary Seller" },
                { value: "SECONDARY_SELLER", label: "Secondary Seller" },
                { value: "MANAGER", label: "Manager" },
                { value: "COMPANY", label: "Company" },
              ]}
            />
          </div>
        </div>
        <Table
          columns={columns}
          data={filtered}
          loading={loading}
          keyExtractor={(r) => r.id}
          onRowClick={(row) => setSelectedEntry(row)}
          emptyMessage="No commission entries found."
        />
        <div className="px-6 py-3 text-xs text-zinc-500 border-t border-zinc-800">
          {filtered.length} of {entries.length} entries
        </div>
      </Card>

      {/* Commission Detail Modal */}
      <Modal
        open={!!selectedEntry}
        onClose={() => setSelectedEntry(null)}
        title="Commission Detail"
        maxWidth="max-w-lg"
      >
        {selectedEntry && (
          <div className="space-y-4">
            {/* Metric cards */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-center">
                <p className="text-xs text-zinc-500">Total Owed</p>
                <p className="text-lg font-bold text-zinc-50 mt-1">{formatCurrency(selectedEntry.amount)}</p>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-center">
                <p className="text-xs text-zinc-500">Paid</p>
                <p className="text-lg font-bold text-green-400 mt-1">
                  {selectedEntry.status === "PAID" ? formatCurrency(selectedEntry.amount) : "$0.00"}
                </p>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-center">
                <p className="text-xs text-zinc-500">Remaining</p>
                <p className="text-lg font-bold text-orange-400 mt-1">
                  {selectedEntry.status === "PAID" ? "$0.00" : formatCurrency(selectedEntry.amount)}
                </p>
              </div>
            </div>

            {/* Details grid */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-zinc-500">Role</span>
                <Badge variant={roleVariant[selectedEntry.role] ?? "gray"}>
                  {selectedEntry.role.replace("_", " ")}
                </Badge>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-zinc-500">Recipient</span>
                <span className="text-zinc-100">{(selectedEntry.recipient as { name?: string } | null)?.name ?? "—"}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-zinc-500">Contract Value</span>
                <span className="text-zinc-100">
                  {formatCurrency((selectedEntry.sale as { contract_value?: number } | null)?.contract_value)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-zinc-500">Department</span>
                <span className="text-zinc-100">
                  {(selectedEntry.sale as { department?: { name?: string } } | null)?.department?.name ?? "—"}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-zinc-500">Job Status</span>
                <span className="text-zinc-100">
                  {(selectedEntry.sale as { status?: string } | null)?.status ?? "—"}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-zinc-500">Payout Status</span>
                <Badge variant={statusVariant[selectedEntry.status] ?? "gray"}>{selectedEntry.status}</Badge>
              </div>
            </div>

            {/* Formula explanation */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 space-y-3">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">How it&apos;s calculated</p>
              {selectedEntry.role === "PRIMARY_SELLER" && (
                <div className="space-y-1.5">
                  <p className="text-xs text-zinc-400">Seller earns the markup above the minimum (redline) price per product item.</p>
                  <div className="rounded-lg bg-zinc-900 border border-zinc-800 divide-y divide-zinc-800 text-xs">
                    <div className="flex justify-between px-3 py-2">
                      <span className="text-zinc-500">Formula</span>
                      <span className="text-zinc-400 font-mono">Σ(sell − min_price)</span>
                    </div>
                    <div className="flex justify-between px-3 py-2">
                      <span className="text-zinc-500">Markup earned</span>
                      <span className="font-semibold text-zinc-100">{formatCurrency(selectedEntry.amount)}</span>
                    </div>
                  </div>
                </div>
              )}
              {selectedEntry.role === "MANAGER" && (() => {
                const baseProfit = selectedEntry.amount / 0.18;
                return (
                  <div className="space-y-1.5">
                    <p className="text-xs text-zinc-400">Manager earns 18% of base profit (min_price − cost) across all items.</p>
                    <div className="rounded-lg bg-zinc-900 border border-zinc-800 divide-y divide-zinc-800 text-xs">
                      <div className="flex justify-between px-3 py-2">
                        <span className="text-zinc-500">Formula</span>
                        <span className="text-zinc-400 font-mono">base_profit × 18%</span>
                      </div>
                      <div className="flex justify-between px-3 py-2">
                        <span className="text-zinc-500">Base profit</span>
                        <span className="text-zinc-300">{formatCurrency(baseProfit)}</span>
                      </div>
                      <div className="flex justify-between px-3 py-2">
                        <span className="text-zinc-500">Manager commission (18%)</span>
                        <span className="font-semibold text-zinc-100">{formatCurrency(selectedEntry.amount)}</span>
                      </div>
                    </div>
                  </div>
                );
              })()}
              {selectedEntry.role === "COMPANY" && (() => {
                const baseProfit = selectedEntry.amount / 0.05;
                return (
                  <div className="space-y-1.5">
                    <p className="text-xs text-zinc-400">Company retains 5% of base profit.</p>
                    <div className="rounded-lg bg-zinc-900 border border-zinc-800 divide-y divide-zinc-800 text-xs">
                      <div className="flex justify-between px-3 py-2">
                        <span className="text-zinc-500">Formula</span>
                        <span className="text-zinc-400 font-mono">base_profit × 5%</span>
                      </div>
                      <div className="flex justify-between px-3 py-2">
                        <span className="text-zinc-500">Base profit</span>
                        <span className="text-zinc-300">{formatCurrency(baseProfit)}</span>
                      </div>
                      <div className="flex justify-between px-3 py-2">
                        <span className="text-zinc-500">Company cut (5%)</span>
                        <span className="font-semibold text-zinc-100">{formatCurrency(selectedEntry.amount)}</span>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Quick links */}
            <div className="flex gap-3">
              {(selectedEntry.sale as { account?: { name?: string } } | null)?.account && (
                <a href="/accounts/" className="text-sm text-brand hover:underline">View Customer</a>
              )}
              {(selectedEntry.sale as { id?: string } | null)?.id && (
                <a
                  href={`/sales/detail/?id=${(selectedEntry.sale as { id: string }).id}`}
                  className="text-sm text-brand hover:underline"
                >
                  View Contract
                </a>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
