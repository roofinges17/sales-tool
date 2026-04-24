"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Tabs";
import { Table } from "@/components/ui/Table";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { toast } from "sonner";
import type { Column } from "@/components/ui/Table";

interface Sale {
  id: string;
  name: string;
  contract_number?: string | null;
  status: "PENDING" | "ACTIVE" | "CANCELLED" | "COMPLETED";
  contract_value: number;
  contract_date?: string | null;
  department_id?: string | null;
  created_at: string;
  account?: { id: string; name: string } | null;
  primary_seller?: { id: string; name: string } | null;
  department?: { id: string; name: string } | null;
  workflow_stage?: { id: string; name: string; color?: string | null } | null;
}

interface Department {
  id: string;
  name: string;
}

type TabKey = "all" | "PENDING" | "ACTIVE" | "COMPLETED" | "CANCELLED";

const tabs = [
  { key: "all", label: "All" },
  { key: "PENDING", label: "Pending" },
  { key: "ACTIVE", label: "Active" },
  { key: "COMPLETED", label: "Completed" },
  { key: "CANCELLED", label: "Cancelled" },
];

const statusVariant: Record<string, "gray" | "orange" | "blue" | "green" | "red"> = {
  PENDING: "orange",
  ACTIVE: "blue",
  COMPLETED: "green",
  CANCELLED: "red",
};

function formatCurrency(v: number | null | undefined) {
  if (v == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function SalesPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Sale | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    const [{ data: s }, { data: depts }] = await Promise.all([
      supabase()
        .from("sales")
        .select("*, account:account_id(id, name), primary_seller:primary_seller_id(id, name), department:department_id(id, name), workflow_stage:workflow_stage_id(id, name, color)")
        .order("created_at", { ascending: false }),
      supabase().from("departments").select("id, name").eq("is_active", true).order("name"),
    ]);
    setSales((s as Sale[]) ?? []);
    setDepartments((depts as Department[]) ?? []);
    setLoading(false);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    if (deleteTarget.status === "COMPLETED") {
      toast.error("Cannot delete a completed contract.");
      setDeleteTarget(null);
      return;
    }
    setDeleting(true);
    const { error } = await supabase().from("sales").delete().eq("id", deleteTarget.id);
    if (error) {
      toast.error(error.message ?? "Delete failed");
    } else {
      setSales((prev) => prev.filter((s) => s.id !== deleteTarget.id));
      toast.success(`${deleteTarget.contract_number ?? deleteTarget.name} deleted`);
      setDeleteTarget(null);
    }
    setDeleting(false);
  }

  const filtered = sales.filter((s) => {
    const matchTab = activeTab === "all" || s.status === activeTab;
    const matchSearch =
      !search ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      (s.contract_number ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (s.account as { name?: string } | null)?.name?.toLowerCase().includes(search.toLowerCase());
    const matchDept = !deptFilter || s.department_id === deptFilter;
    return matchTab && matchSearch && matchDept;
  });

  const counts = {
    all: sales.length,
    PENDING: sales.filter((s) => s.status === "PENDING").length,
    ACTIVE: sales.filter((s) => s.status === "ACTIVE").length,
    COMPLETED: sales.filter((s) => s.status === "COMPLETED").length,
    CANCELLED: sales.filter((s) => s.status === "CANCELLED").length,
  };
  const tabsWithCounts = tabs.map((t) => ({ ...t, count: counts[t.key as TabKey] }));

  const totalValue = sales
    .filter((s) => s.status !== "CANCELLED")
    .reduce((sum, s) => sum + (s.contract_value ?? 0), 0);
  const thisMonth = sales.filter((s) => {
    if (!s.contract_date) return false;
    const d = new Date(s.contract_date);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  const columns: Column<Sale>[] = [
    {
      key: "contract_date",
      header: "Date",
      render: (row) => <span className="text-xs text-zinc-500">{formatDate(row.contract_date ?? row.created_at)}</span>,
    },
    {
      key: "name",
      header: "Contract #",
      render: (row) => (
        <a href={`/sales/detail/?id=${row.id}`} className="font-medium text-zinc-100 hover:text-brand">
          {row.contract_number ?? row.name}
        </a>
      ),
    },
    {
      key: "account",
      header: "Client",
      render: (row) => (
        <span className="text-zinc-300">
          {(row.account as { name?: string } | null)?.name ?? "—"}
        </span>
      ),
    },
    {
      key: "seller",
      header: "Seller",
      render: (row) => (
        <span className="text-zinc-400">
          {(row.primary_seller as { name?: string } | null)?.name ?? "—"}
        </span>
      ),
    },
    {
      key: "contract_value",
      header: "Total",
      render: (row) => <span className="font-medium text-zinc-200">{formatCurrency(row.contract_value)}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (row) => <Badge variant={statusVariant[row.status] ?? "gray"}>{row.status}</Badge>,
    },
    {
      key: "stage",
      header: "Stage",
      render: (row) => {
        const stage = row.workflow_stage as { name?: string; color?: string | null } | null;
        if (!stage?.name) return <span className="text-zinc-600">—</span>;
        return (
          <span
            className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium"
            style={{
              background: stage.color ? `${stage.color}22` : undefined,
              borderColor: stage.color ? `${stage.color}44` : undefined,
              color: stage.color ?? undefined,
            }}
          >
            {stage.name}
          </span>
        );
      },
    },
    {
      key: "actions",
      header: "",
      render: (row) => (
        <button
          onClick={(e) => { e.stopPropagation(); setDeleteTarget(row); }}
          className="p-1.5 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-400/10 transition-colors"
          title="Delete contract"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-50">Contracts</h1>
          <p className="mt-1 text-sm text-zinc-500">Track active and completed contracts.</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        {[
          { label: "Total", value: counts.all, color: "text-zinc-50" },
          { label: "Total Value", value: formatCurrency(totalValue), color: "text-zinc-50", isText: true },
          { label: "Active", value: counts.ACTIVE, color: "text-blue-400" },
          { label: "Pending", value: counts.PENDING, color: "text-orange-400" },
          { label: "This Month", value: thisMonth, color: "text-green-400" },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="py-4">
              <p className="text-xs text-zinc-500">{stat.label}</p>
              <p className={`text-xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <div className="px-6 pt-4">
          <Tabs tabs={tabsWithCounts} activeTab={activeTab} onChange={(k) => setActiveTab(k as TabKey)} />
        </div>
        <div className="flex flex-wrap items-center gap-3 px-6 py-4">
          <div className="flex-1 min-w-[200px]">
            <Input
              placeholder="Search by contract # or client…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="w-48">
            <Select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              placeholder="All departments"
              options={departments.map((d) => ({ value: d.id, label: d.name }))}
            />
          </div>
        </div>
        <Table
          columns={columns}
          data={filtered}
          loading={loading}
          keyExtractor={(r) => r.id}
          onRowClick={(row) => { window.location.href = `/sales/detail/?id=${row.id}`; }}
          emptyMessage="No contracts yet. Contracts are created by converting accepted estimates."
        />
        <div className="px-6 py-3 text-xs text-zinc-500 border-t border-zinc-800">
          {filtered.length} of {sales.length} contracts
        </div>
      </Card>

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete contract?" maxWidth="sm">
        {deleteTarget && (
          <div className="space-y-4">
            <p className="text-sm text-zinc-300">
              Delete <span className="font-semibold text-zinc-100">{deleteTarget.contract_number ?? deleteTarget.name}</span> permanently? This cannot be undone.
              All payments, commission entries, and workflow history for this contract will also be deleted.
            </p>
            {deleteTarget.status === "COMPLETED" && (
              <div className="rounded-xl border border-amber-800/40 bg-amber-950/20 px-4 py-3 text-xs text-amber-300">
                This contract is marked as completed — it cannot be deleted.
              </div>
            )}
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button variant="danger" loading={deleting} onClick={handleDelete} disabled={deleteTarget.status === "COMPLETED"}>
                Delete permanently
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
