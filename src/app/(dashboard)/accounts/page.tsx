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
import type { Account } from "@/types";
import type { Column } from "@/components/ui/Table";

type TabKey = "all" | "active" | "inactive" | "prospect";

const tabs = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "inactive", label: "Inactive" },
  { key: "prospect", label: "Prospect" },
];

function typeBadge(type: string | null | undefined) {
  const map: Record<string, "blue" | "purple" | "teal"> = {
    RESIDENTIAL: "blue",
    COMMERCIAL: "purple",
    MULTIFAMILY: "teal",
  };
  return <Badge variant={map[type ?? ""] ?? "default"}>{type ?? "—"}</Badge>;
}

function statusBadge(status: string | null | undefined) {
  const map: Record<string, "green" | "red" | "orange"> = {
    ACTIVE: "green",
    INACTIVE: "red",
    PROSPECT: "orange",
  };
  return <Badge variant={map[status ?? ""] ?? "default"}>{status ?? "—"}</Badge>;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  useEffect(() => {
    loadAccounts();
  }, []);

  async function loadAccounts() {
    setLoading(true);
    const { data } = await supabase()
      .from("accounts")
      .select("*, assigned_to:assigned_to_id(id, name, email)")
      .order("created_at", { ascending: false });
    setAccounts((data as Account[]) ?? []);
    setLoading(false);
  }

  const filtered = accounts.filter((a) => {
    const matchSearch =
      !search ||
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      (a.email ?? "").toLowerCase().includes(search.toLowerCase());
    const matchType = !typeFilter || a.type === typeFilter;
    const matchTab =
      activeTab === "all" ||
      (activeTab === "active" && a.status === "ACTIVE") ||
      (activeTab === "inactive" && a.status === "INACTIVE") ||
      (activeTab === "prospect" && a.status === "PROSPECT");
    return matchSearch && matchType && matchTab;
  });

  const counts = {
    all: accounts.length,
    active: accounts.filter((a) => a.status === "ACTIVE").length,
    inactive: accounts.filter((a) => a.status === "INACTIVE").length,
    prospect: accounts.filter((a) => a.status === "PROSPECT").length,
  };

  const tabsWithCounts = tabs.map((t) => ({ ...t, count: counts[t.key as TabKey] }));

  const total = accounts.length;
  const active = counts.active;
  const inactive = counts.inactive;

  const columns: Column<Account>[] = [
    {
      key: "name",
      header: "Name",
      render: (row) => (
        <a href={`/accounts/detail/?id=${row.id}`} className="font-medium text-zinc-100 hover:text-brand">
          {row.name}
        </a>
      ),
    },
    {
      key: "type",
      header: "Type",
      render: (row) => typeBadge(row.type),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => statusBadge(row.status),
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
      key: "email",
      header: "Email",
      render: (row) => <span className="text-zinc-400">{row.email ?? "—"}</span>,
    },
    {
      key: "phone",
      header: "Phone",
      render: (row) => <span className="text-zinc-400">{row.phone ?? "—"}</span>,
    },
    {
      key: "lead_source",
      header: "Lead Source",
      render: (row) => <span className="text-zinc-400 capitalize">{row.lead_source ?? "—"}</span>,
    },
    {
      key: "created_at",
      header: "Created",
      render: (row) => <span className="text-zinc-500 text-xs">{formatDate(row.created_at)}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-50">Customers</h1>
          <p className="mt-1 text-sm text-zinc-500">Manage your customer accounts.</p>
        </div>
        <Button
          leftIcon={
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          }
          onClick={() => { window.location.href = "/accounts/new/"; }}
        >
          New Customer
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-800 text-zinc-400">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <p className="text-xs text-zinc-500">Total</p>
              <p className="text-xl font-bold text-zinc-50">{total}</p>
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
              <p className="text-xs text-zinc-500">Active</p>
              <p className="text-xl font-bold text-green-400">{active}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-950/60 text-red-400">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            </div>
            <div>
              <p className="text-xs text-zinc-500">Inactive</p>
              <p className="text-xl font-bold text-red-400">{inactive}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters + Table */}
      <Card>
        <div className="px-6 pt-4">
          <Tabs
            tabs={tabsWithCounts}
            activeTab={activeTab}
            onChange={(k) => setActiveTab(k as TabKey)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3 px-6 py-4">
          <div className="flex-1 min-w-[200px]">
            <Input
              placeholder="Search by name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="w-48">
            <Select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              placeholder="All types"
              options={[
                { value: "RESIDENTIAL", label: "Residential" },
                { value: "COMMERCIAL", label: "Commercial" },
                { value: "MULTIFAMILY", label: "Multi-Family" },
              ]}
            />
          </div>
        </div>
        <Table
          columns={columns}
          data={filtered}
          loading={loading}
          keyExtractor={(r) => r.id}
          onRowClick={(row) => { window.location.href = `/accounts/detail/?id=${row.id}`; }}
          emptyMessage="No customers found. Try adjusting your filters or create a new customer."
        />
        <div className="px-6 py-3 text-xs text-zinc-500 border-t border-zinc-800">
          {filtered.length} of {accounts.length} customers
        </div>
      </Card>
    </div>
  );
}
