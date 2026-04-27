"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { toast } from "sonner";

interface Crew {
  id: string;
  name: string;
}

interface JobRow {
  id: string;
  job_type: "standard" | "reroofing";
  stage: number;
  address: string | null;
  contract_price: number | null;
  scheduled_date: string | null;
  created_at: string;
  crew: { id: string; name: string } | null;
  contact: { id: string; first_name: string; last_name: string } | null;
  job_payments: { id: string; collected_at: string | null }[];
}

const STANDARD_STAGES = [
  "Intake",
  "Survey Scheduled",
  "Survey Done",
  "Permit Applied",
  "Permit Approved",
  "Material Ordered",
  "Crew Scheduled",
  "Job Started",
  "Job Complete",
  "Punch-Out",
  "Final Inspection",
  "Closed",
];

const REROOFING_STAGES = [
  "Intake",
  "Scheduled",
  "In Progress",
  "Complete",
  "Closed",
];

function stageName(job: JobRow) {
  const stages = job.job_type === "reroofing" ? REROOFING_STAGES : STANDARD_STAGES;
  return stages[job.stage] ?? `Stage ${job.stage}`;
}

function stageVariant(job: JobRow): "gray" | "blue" | "orange" | "green" | "teal" {
  const total = job.job_type === "reroofing" ? REROOFING_STAGES.length : STANDARD_STAGES.length;
  const pct = job.stage / (total - 1);
  if (pct === 0) return "gray";
  if (pct < 0.33) return "blue";
  if (pct < 0.67) return "orange";
  if (pct < 1) return "teal";
  return "green";
}

function paymentStatus(payments: { collected_at: string | null }[]) {
  const collected = payments.filter((p) => p.collected_at).length;
  const total = payments.length;
  if (total === 0) return null;
  return `${collected}/${total}`;
}

function formatCurrency(v: number | null | undefined) {
  if (v == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

type PaymentFilter = "all" | "none" | "partial" | "full";

export default function JobsPage() {
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [crewFilter, setCrewFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("all");

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    const [{ data: jobData, error: jobErr }, { data: crewData }] = await Promise.all([
      supabase()
        .from("jobs")
        .select(`
          id, job_type, stage, address, contract_price, scheduled_date, created_at,
          crew:crew_id(id, name),
          contact:contact_id(id, first_name, last_name),
          job_payments(id, collected_at)
        `)
        .order("created_at", { ascending: false }),
      supabase().from("crews").select("id, name").eq("is_active", true).order("name"),
    ]);
    if (jobErr) toast.error("Failed to load jobs");
    setJobs((jobData as unknown as JobRow[]) ?? []);
    setCrews((crewData as Crew[]) ?? []);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    return jobs.filter((j) => {
      if (search) {
        const q = search.toLowerCase();
        const name = `${j.contact?.first_name ?? ""} ${j.contact?.last_name ?? ""}`.toLowerCase();
        const addr = (j.address ?? "").toLowerCase();
        if (!name.includes(q) && !addr.includes(q)) return false;
      }
      if (stageFilter !== "") {
        if (String(j.stage) !== stageFilter) return false;
      }
      if (crewFilter && j.crew?.id !== crewFilter) return false;
      if (typeFilter && j.job_type !== typeFilter) return false;
      if (paymentFilter !== "all") {
        const collected = j.job_payments.filter((p) => p.collected_at).length;
        const total = j.job_payments.length;
        if (paymentFilter === "none" && collected !== 0) return false;
        if (paymentFilter === "partial" && (collected === 0 || collected >= total)) return false;
        if (paymentFilter === "full" && (total === 0 || collected < total)) return false;
      }
      return true;
    });
  }, [jobs, search, stageFilter, crewFilter, typeFilter, paymentFilter]);

  const stageOptions = useMemo(() => {
    const seen = new Map<number, string>();
    jobs.forEach((j) => {
      if (!seen.has(j.stage)) seen.set(j.stage, stageName(j));
    });
    return Array.from(seen.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([v, l]) => ({ value: String(v), label: `${v} — ${l}` }));
  }, [jobs]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100">Jobs</h1>
          <p className="mt-0.5 text-sm text-zinc-400">
            {loading ? "Loading…" : `${filtered.length} of ${jobs.length} jobs`}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Search name or address…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-56"
        />
        <select
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value)}
          className="rounded-xl border border-zinc-700 bg-zinc-950/80 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
        >
          <option value="">All Stages</option>
          {stageOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          value={crewFilter}
          onChange={(e) => setCrewFilter(e.target.value)}
          className="rounded-xl border border-zinc-700 bg-zinc-950/80 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
        >
          <option value="">All Crews</option>
          {crews.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-xl border border-zinc-700 bg-zinc-950/80 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
        >
          <option value="">All Types</option>
          <option value="standard">Standard (12-stage)</option>
          <option value="reroofing">Re-Roofing (5-stage)</option>
        </select>
        <select
          value={paymentFilter}
          onChange={(e) => setPaymentFilter(e.target.value as PaymentFilter)}
          className="rounded-xl border border-zinc-700 bg-zinc-950/80 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
        >
          <option value="all">All Payments</option>
          <option value="none">No Payments</option>
          <option value="partial">Partial</option>
          <option value="full">Fully Paid</option>
        </select>
      </div>

      {/* Job list */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-zinc-500 text-sm">Loading jobs…</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900/40 py-20 text-center">
          <p className="text-zinc-400 text-sm">No jobs found</p>
          {(search || stageFilter || crewFilter || typeFilter || paymentFilter !== "all") && (
            <button
              className="mt-2 text-brand text-xs underline"
              onClick={() => { setSearch(""); setStageFilter(""); setCrewFilter(""); setTypeFilter(""); setPaymentFilter("all"); }}
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((job) => {
            const paid = paymentStatus(job.job_payments);
            const contactName = job.contact
              ? `${job.contact.first_name} ${job.contact.last_name}`
              : "Unknown";
            return (
              <a
                key={job.id}
                href={`/jobs/${job.id}/`}
                className="flex items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3.5 hover:border-zinc-700 hover:bg-zinc-900 transition group"
              >
                {/* Type pill */}
                <span className={`hidden sm:inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                  job.job_type === "reroofing"
                    ? "bg-purple-950/60 text-purple-300 ring-1 ring-purple-800/40"
                    : "bg-zinc-800 text-zinc-400 ring-1 ring-zinc-700"
                }`}>
                  {job.job_type === "reroofing" ? "Re-Roof" : "Standard"}
                </span>

                {/* Main info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-100 truncate">{contactName}</p>
                  <p className="text-xs text-zinc-500 truncate">{job.address ?? "No address"}</p>
                </div>

                {/* Stage badge */}
                <Badge variant={stageVariant(job)} className="hidden md:inline-flex shrink-0">
                  {job.stage} · {stageName(job)}
                </Badge>

                {/* Crew */}
                <span className="hidden lg:block text-xs text-zinc-400 shrink-0 w-28 truncate">
                  {job.crew?.name ?? <span className="text-zinc-600">No crew</span>}
                </span>

                {/* Scheduled date */}
                <span className="hidden lg:block text-xs text-zinc-400 shrink-0 w-24">
                  {job.scheduled_date ? formatDate(job.scheduled_date) : <span className="text-zinc-600">—</span>}
                </span>

                {/* Contract price */}
                <span className="text-sm font-medium text-zinc-200 shrink-0 w-20 text-right">
                  {formatCurrency(job.contract_price)}
                </span>

                {/* Payment status */}
                {paid && (
                  <span className="text-xs text-zinc-500 shrink-0">
                    Paid {paid}
                  </span>
                )}

                {/* Chevron */}
                <svg className="h-4 w-4 text-zinc-600 group-hover:text-zinc-400 transition shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6" />
                </svg>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
