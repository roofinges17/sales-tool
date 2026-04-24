"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import type { Quote, Sale } from "@/types";

interface Stats {
  customers: number;
  pendingEstimates: number;
  activeContracts: number;
  totalRevenue: number;
}

interface PipelineItem {
  status: string;
  count: number;
}

interface ActivityItem {
  id: string;
  type: "quote" | "sale";
  name: string;
  status: string;
  customer: string;
  created_at: string;
}

function StatCard({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: string | number;
  color: string;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4">
        <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${color}`}>
          {icon}
        </div>
        <div>
          <p className="text-sm text-zinc-400">{label}</p>
          <p className="text-2xl font-bold text-zinc-50">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const statusBadge = (status: string, type: "quote" | "sale") => {
  if (type === "quote") {
    const map: Record<string, "blue" | "orange" | "green" | "red" | "gray"> = {
      DRAFT: "gray",
      SENT: "blue",
      ACCEPTED: "green",
      REJECTED: "red",
      EXPIRED: "red",
    };
    return <Badge variant={map[status] ?? "gray"}>{status}</Badge>;
  }
  const map: Record<string, "orange" | "green" | "red" | "blue"> = {
    PENDING: "orange",
    ACTIVE: "green",
    CANCELLED: "red",
    COMPLETED: "blue",
  };
  return <Badge variant={map[status] ?? "gray"}>{status}</Badge>;
};

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats>({
    customers: 0,
    pendingEstimates: 0,
    activeContracts: 0,
    totalRevenue: 0,
  });
  const [pipeline, setPipeline] = useState<PipelineItem[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      const db = supabase();

      const [
        { count: customers },
        { count: pendingEstimates },
        { count: activeContracts },
        { data: revenueData },
        { data: quotesData },
        { data: recentQuotes },
        { data: recentSales },
      ] = await Promise.all([
        db.from("accounts").select("*", { count: "exact", head: true }),
        db.from("quotes").select("*", { count: "exact", head: true }).in("status", ["DRAFT", "SENT"]),
        db.from("sales").select("*", { count: "exact", head: true }).eq("status", "ACTIVE"),
        db
          .from("sales")
          .select("contract_value")
          .in("status", ["ACTIVE", "COMPLETED"]),
        db.from("quotes").select("status"),
        db
          .from("quotes")
          .select("id, name, status, created_at, account:account_id(id, name)")
          .order("created_at", { ascending: false })
          .limit(5),
        db
          .from("sales")
          .select("id, name, status, contract_number, created_at, account:account_id(id, name)")
          .order("created_at", { ascending: false })
          .limit(5),
      ]);

      const totalRevenue = (revenueData ?? []).reduce(
        (sum: number, r: { contract_value: number }) => sum + (r.contract_value ?? 0),
        0,
      );

      // Build pipeline bar
      const statusCounts: Record<string, number> = {};
      (quotesData ?? []).forEach((q: { status: string }) => {
        statusCounts[q.status] = (statusCounts[q.status] ?? 0) + 1;
      });
      const pipelineItems = Object.entries(statusCounts).map(([status, count]) => ({
        status,
        count,
      }));

      // Merge recent activity
      const quoteActivity: ActivityItem[] = (recentQuotes ?? []).map((q: { id: string; name: string; status: string; created_at: string; account: { name: string }[] | { name: string } | null }) => ({
        id: q.id,
        type: "quote" as const,
        name: q.name,
        status: q.status,
        customer: Array.isArray(q.account) ? (q.account[0]?.name ?? "—") : (q.account?.name ?? "—"),
        created_at: q.created_at,
      }));
      const saleActivity: ActivityItem[] = (recentSales ?? []).map((s: { id: string; name: string; status: string; created_at: string; account: { name: string }[] | { name: string } | null }) => ({
        id: s.id,
        type: "sale" as const,
        name: s.name,
        status: s.status,
        customer: Array.isArray(s.account) ? (s.account[0]?.name ?? "—") : (s.account?.name ?? "—"),
        created_at: s.created_at,
      }));
      const combined = [...quoteActivity, ...saleActivity]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 10);

      setStats({
        customers: customers ?? 0,
        pendingEstimates: pendingEstimates ?? 0,
        activeContracts: activeContracts ?? 0,
        totalRevenue,
      });
      setPipeline(pipelineItems);
      setActivity(combined);
      setLoading(false);
    }

    loadData();
  }, []);

  const pipelineTotal = pipeline.reduce((s, p) => s + p.count, 0);

  const pipelineColors: Record<string, string> = {
    DRAFT: "bg-zinc-600",
    SENT: "bg-blue-500",
    ACCEPTED: "bg-green-500",
    REJECTED: "bg-red-500",
    EXPIRED: "bg-zinc-500",
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-zinc-50">Dashboard</h1>
        <p className="mt-1 text-sm text-zinc-500">Sales overview for your team.</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Customers"
          value={loading ? "—" : stats.customers}
          color="bg-blue-950/60 text-blue-400"
          icon={
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          }
        />
        <StatCard
          label="Pending Estimates"
          value={loading ? "—" : stats.pendingEstimates}
          color="bg-orange-950/60 text-orange-400"
          icon={
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          }
        />
        <StatCard
          label="Active Contracts"
          value={loading ? "—" : stats.activeContracts}
          color="bg-green-950/60 text-green-400"
          icon={
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          }
        />
        <StatCard
          label="Total Revenue"
          value={loading ? "—" : formatCurrency(stats.totalRevenue)}
          color="bg-purple-950/60 text-purple-400"
          icon={
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Pipeline */}
        <Card className="lg:col-span-2">
          <CardContent>
            <h2 className="mb-4 text-sm font-semibold text-zinc-200">Estimate Pipeline</h2>
            {!loading && pipelineTotal === 0 ? (
              <div className="flex items-center justify-center py-8 text-sm text-zinc-500">
                No estimates yet. Create your first estimate to see pipeline data.
              </div>
            ) : (
              <>
                <div className="flex h-8 w-full overflow-hidden rounded-lg">
                  {pipeline.map((item) => (
                    <div
                      key={item.status}
                      className={`${pipelineColors[item.status] ?? "bg-zinc-600"} transition-all`}
                      style={{ width: `${pipelineTotal ? (item.count / pipelineTotal) * 100 : 0}%` }}
                      title={`${item.status}: ${item.count}`}
                    />
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-4">
                  {pipeline.map((item) => (
                    <div key={item.status} className="flex items-center gap-2">
                      <div className={`h-2.5 w-2.5 rounded-full ${pipelineColors[item.status] ?? "bg-zinc-600"}`} />
                      <span className="text-xs text-zinc-400">
                        {item.status} <span className="text-zinc-200">({item.count})</span>
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardContent>
            <h2 className="mb-4 text-sm font-semibold text-zinc-200">Quick Actions</h2>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "New Customer", href: "/accounts/new/", icon: "👤" },
                { label: "New Estimate", href: "/quotes/builder/", icon: "📋" },
                { label: "Contracts", href: "/sales/", icon: "📄" },
                { label: "Commissions", href: "/commissions/", icon: "💰" },
              ].map((action) => (
                <a
                  key={action.href}
                  href={action.href}
                  className="flex flex-col items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-800/40 p-4 text-center transition hover:border-zinc-700 hover:bg-zinc-800"
                >
                  <span className="text-2xl">{action.icon}</span>
                  <span className="text-xs font-medium text-zinc-300">{action.label}</span>
                </a>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardContent>
          <h2 className="mb-4 text-sm font-semibold text-zinc-200">Recent Activity</h2>
          {!loading && activity.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-sm text-zinc-500">
              No recent activity. Start by adding a customer or creating an estimate.
            </div>
          ) : (
            <div className="divide-y divide-zinc-800/60">
              {activity.map((item) => (
                <div key={`${item.type}-${item.id}`} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold ${
                      item.type === "quote" ? "bg-blue-950/60 text-blue-400" : "bg-green-950/60 text-green-400"
                    }`}>
                      {item.type === "quote" ? "EST" : "CON"}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-zinc-200">{item.name}</p>
                      <p className="text-xs text-zinc-500">{item.customer}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {statusBadge(item.status, item.type)}
                    <span className="text-xs text-zinc-500">{formatDate(item.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
