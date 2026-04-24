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

interface Quote {
  id: string;
  name: string;
  status: "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED" | "EXPIRED";
  total?: number | null;
  department_id?: string | null;
  created_at: string;
  account?: { id: string; name: string } | null;
  assigned_to?: { id: string; name: string } | null;
  department?: { id: string; name: string } | null;
}

interface Department {
  id: string;
  name: string;
}

type TabKey = "all" | "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED" | "EXPIRED";

const tabs = [
  { key: "all", label: "All" },
  { key: "DRAFT", label: "Draft" },
  { key: "SENT", label: "Sent" },
  { key: "ACCEPTED", label: "Accepted" },
  { key: "REJECTED", label: "Rejected" },
  { key: "EXPIRED", label: "Expired" },
];

const statusVariant: Record<string, "gray" | "orange" | "blue" | "green" | "red"> = {
  DRAFT: "gray",
  SENT: "blue",
  ACCEPTED: "green",
  REJECTED: "red",
  EXPIRED: "orange",
};

function formatCurrency(v: number | null | undefined) {
  if (v == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function QuotesPage() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Quote | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    const [{ data: qs }, { data: depts }] = await Promise.all([
      supabase()
        .from("quotes")
        .select("*, account:account_id(id, name), assigned_to:assigned_to_id(id, name), department:department_id(id, name)")
        .order("created_at", { ascending: false }),
      supabase().from("departments").select("id, name").eq("is_active", true).order("name"),
    ]);
    setQuotes((qs as Quote[]) ?? []);
    setDepartments((depts as Department[]) ?? []);
    setLoading(false);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    if (deleteTarget.status === "ACCEPTED") {
      toast.error("Cannot delete an accepted estimate.");
      setDeleteTarget(null);
      return;
    }
    setDeleting(true);
    const { error } = await supabase().from("quotes").delete().eq("id", deleteTarget.id);
    if (error) {
      toast.error(error.message ?? "Delete failed");
    } else {
      setQuotes((prev) => prev.filter((q) => q.id !== deleteTarget.id));
      toast.success(`${deleteTarget.name} deleted`);
      setDeleteTarget(null);
    }
    setDeleting(false);
  }

  const filtered = quotes.filter((q) => {
    const matchTab = activeTab === "all" || q.status === activeTab;
    const matchSearch =
      !search ||
      q.name.toLowerCase().includes(search.toLowerCase()) ||
      (q.account as { name?: string } | null)?.name?.toLowerCase().includes(search.toLowerCase());
    const matchDept = !deptFilter || q.department_id === deptFilter;
    return matchTab && matchSearch && matchDept;
  });

  const counts = {
    all: quotes.length,
    DRAFT: quotes.filter((q) => q.status === "DRAFT").length,
    SENT: quotes.filter((q) => q.status === "SENT").length,
    ACCEPTED: quotes.filter((q) => q.status === "ACCEPTED").length,
    REJECTED: quotes.filter((q) => q.status === "REJECTED").length,
    EXPIRED: quotes.filter((q) => q.status === "EXPIRED").length,
  };

  const tabsWithCounts = tabs.map((t) => ({ ...t, count: counts[t.key as TabKey] }));

  const columns: Column<Quote>[] = [
    {
      key: "name",
      header: "Estimate #",
      render: (row) => (
        <a href={`/quotes/detail/?id=${row.id}`} className="font-medium text-zinc-100 hover:text-brand">
          {row.name}
        </a>
      ),
    },
    {
      key: "account",
      header: "Customer",
      render: (row) => (
        <span className="text-zinc-300">
          {(row.account as { name?: string } | null)?.name ?? <span className="text-zinc-600">—</span>}
        </span>
      ),
    },
    {
      key: "assigned_to",
      header: "Assigned To",
      render: (row) => (
        <span className="text-zinc-400">
          {(row.assigned_to as { name?: string } | null)?.name ?? "—"}
        </span>
      ),
    },
    {
      key: "department",
      header: "Dept",
      render: (row) => (
        <span className="text-zinc-400">
          {(row.department as { name?: string } | null)?.name ?? "—"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <Badge variant={statusVariant[row.status] ?? "gray"}>{row.status}</Badge>
      ),
    },
    {
      key: "total",
      header: "Total",
      render: (row) => <span className="font-medium text-zinc-200">{formatCurrency(row.total)}</span>,
    },
    {
      key: "created_at",
      header: "Created",
      render: (row) => <span className="text-xs text-zinc-500">{formatDate(row.created_at)}</span>,
    },
    {
      key: "actions",
      header: "",
      render: (row) => (
        <button
          onClick={(e) => { e.stopPropagation(); setDeleteTarget(row); }}
          className="p-1.5 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-400/10 transition-colors"
          title="Delete estimate"
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
          <h1 className="text-2xl font-bold text-zinc-50">Estimates</h1>
          <p className="mt-1 text-sm text-zinc-500">Manage customer estimates and proposals.</p>
        </div>
        <Button
          leftIcon={<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>}
          onClick={() => { window.location.href = "/quotes/builder/"; }}
        >
          New Estimate
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Total", value: counts.all, color: "text-zinc-50" },
          { label: "Draft", value: counts.DRAFT, color: "text-zinc-400" },
          { label: "Sent", value: counts.SENT, color: "text-blue-400" },
          { label: "Accepted", value: counts.ACCEPTED, color: "text-green-400" },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="py-4">
              <p className="text-xs text-zinc-500">{stat.label}</p>
              <p className={`text-2xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <div className="px-6 pt-4">
          <Tabs tabs={tabsWithCounts} activeTab={activeTab} onChange={(k) => setActiveTab(k as TabKey)} />
        </div>
        <div className="flex flex-wrap items-center gap-3 px-6 py-4">
          <div className="flex-1 min-w-0">
            <Input
              placeholder="Search by estimate # or customer…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="w-full sm:w-48">
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
          onRowClick={(row) => { window.location.href = `/quotes/detail/?id=${row.id}`; }}
          emptyMessage="No estimates found. Create your first estimate to get started."
        />
        <div className="px-6 py-3 text-xs text-zinc-500 border-t border-zinc-800">
          {filtered.length} of {quotes.length} estimates
        </div>
      </Card>

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete estimate?" maxWidth="sm">
        {deleteTarget && (
          <div className="space-y-4">
            <p className="text-sm text-zinc-300">
              Delete <span className="font-semibold text-zinc-100">{deleteTarget.name}</span> permanently? This cannot be undone.
              All photos, line items, and notes for this estimate will also be deleted.
            </p>
            {deleteTarget.status === "ACCEPTED" && (
              <div className="rounded-xl border border-amber-800/40 bg-amber-950/20 px-4 py-3 text-xs text-amber-300">
                This estimate has been accepted — it cannot be deleted.
              </div>
            )}
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button variant="danger" loading={deleting} onClick={handleDelete} disabled={deleteTarget.status === "ACCEPTED"}>
                Delete permanently
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
