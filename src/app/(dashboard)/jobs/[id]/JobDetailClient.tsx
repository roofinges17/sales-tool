"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { authedFetch } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { toast } from "sonner";

interface PaymentSummary {
  payment_number: number;
  percentage: number;
  amount: number | null;
  collected_at: string | null;
}

interface Crew {
  id: string;
  name: string;
}

interface JobDetail {
  id: string;
  job_type: "standard" | "reroofing";
  stage: number;
  address: string | null;
  contract_price: number | null;
  roof_type: string | null;
  roof_color: string | null;
  roof_size_sqft: number | null;
  scheduled_date: string | null;
  notes: string | null;
  crew_id: string | null;
  contact_id: string | null;
  quote_id: string | null;
  ghl_opportunity_id: string | null;
  created_at: string;
  updated_at: string;
  crew: { id: string; name: string } | null;
  contact: { id: string; first_name: string; last_name: string; phone: string | null } | null;
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

function stageList(jobType: "standard" | "reroofing") {
  return jobType === "reroofing" ? REROOFING_STAGES : STANDARD_STAGES;
}

function formatCurrency(v: number | null | undefined) {
  if (v == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatPhone(p: string | null | undefined) {
  if (!p) return null;
  const d = p.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) return `(${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
  return p;
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2.5 border-b border-zinc-800/60 last:border-0">
      <span className="text-sm text-zinc-500 shrink-0">{label}</span>
      <span className="text-sm text-zinc-100 text-right">{value ?? "—"}</span>
    </div>
  );
}

export default function JobDetailClient() {
  const [job, setJob] = useState<JobDetail | null>(null);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [payments, setPayments] = useState<PaymentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedCrew, setSelectedCrew] = useState<string>("");
  const [scheduledDate, setScheduledDate] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  const jobId = typeof window !== "undefined"
    ? window.location.pathname.replace(/\/$/, "").split("/").pop() ?? ""
    : "";

  useEffect(() => {
    if (!jobId || jobId === "stub") return;
    loadJob();
    loadCrews();
    loadPayments();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  async function loadJob() {
    setLoading(true);
    const { data, error } = await supabase()
      .from("jobs")
      .select(`
        id, job_type, stage, address, contract_price,
        roof_type, roof_color, roof_size_sqft,
        scheduled_date, notes, crew_id, contact_id, quote_id,
        ghl_opportunity_id, created_at, updated_at,
        crew:crew_id(id, name),
        contact:contact_id(id, first_name, last_name, phone)
      `)
      .eq("id", jobId)
      .single();
    if (error) {
      toast.error("Job not found");
      setLoading(false);
      return;
    }
    const j = data as unknown as JobDetail;
    setJob(j);
    setSelectedCrew(j.crew_id ?? "");
    setScheduledDate(j.scheduled_date ?? "");
    setNotes(j.notes ?? "");
    setLoading(false);
  }

  async function loadCrews() {
    const { data } = await supabase()
      .from("crews")
      .select("id, name")
      .eq("is_active", true)
      .order("name");
    setCrews((data as Crew[]) ?? []);
  }

  async function loadPayments() {
    const { data } = await supabase()
      .from("job_payments")
      .select("payment_number, percentage, amount, collected_at")
      .eq("job_id", jobId)
      .order("payment_number");
    setPayments((data as PaymentSummary[]) ?? []);
  }

  async function advanceStage() {
    if (!job) return;
    const stages = stageList(job.job_type);
    if (job.stage >= stages.length - 1) return;
    setSaving(true);
    const newStage = job.stage + 1;
    const { error } = await supabase()
      .from("jobs")
      .update({ stage: newStage, updated_at: new Date().toISOString() })
      .eq("id", job.id);
    if (error) {
      toast.error("Failed to advance stage");
      setSaving(false);
      return;
    }
    setJob({ ...job, stage: newStage });
    toast.success(`Moved to: ${stages[newStage]}`);
    // Best-effort GHL sync — don't block UI on failure
    authedFetch("/api/ghl/sync-job-stage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_id: job.id, stage: newStage, job_type: job.job_type }),
    }).catch(() => { /* silently ignore */ });
    setSaving(false);
  }

  async function saveAssignment() {
    if (!job) return;
    setSaving(true);
    const { error } = await supabase()
      .from("jobs")
      .update({
        crew_id: selectedCrew || null,
        scheduled_date: scheduledDate || null,
        notes: notes || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    if (error) {
      toast.error("Save failed: " + error.message);
    } else {
      toast.success("Job updated");
      await loadJob();
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32 text-zinc-500 text-sm">
        Loading job…
      </div>
    );
  }

  if (!job) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center">
        <p className="text-zinc-400">Job not found</p>
        <a href="/jobs/" className="mt-3 text-brand text-sm underline">Back to Jobs</a>
      </div>
    );
  }

  const stages = stageList(job.job_type);
  const isLastStage = job.stage >= stages.length - 1;
  const contactName = job.contact
    ? `${job.contact.first_name} ${job.contact.last_name}`
    : "Unknown";

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Back */}
      <a href="/jobs/" className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200 transition">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Jobs
      </a>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">{contactName}</h1>
          <p className="mt-0.5 text-sm text-zinc-400">{job.address ?? "No address"}</p>
        </div>
        <Badge variant={job.job_type === "reroofing" ? "purple" : "gray"}>
          {job.job_type === "reroofing" ? "Re-Roofing" : "Standard"}
        </Badge>
      </div>

      {/* Stage Stepper */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">Stage</h2>
          <span className="text-xs text-zinc-500">{job.stage + 1} of {stages.length}</span>
        </div>

        {/* Progress bar */}
        <div className="relative h-1.5 rounded-full bg-zinc-800">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-brand transition-all"
            style={{ width: `${((job.stage) / (stages.length - 1)) * 100}%` }}
          />
        </div>

        {/* Stage pills */}
        <div className="flex flex-wrap gap-1.5">
          {stages.map((s, i) => (
            <span
              key={i}
              className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium transition ${
                i < job.stage
                  ? "bg-brand/10 text-brand/60"
                  : i === job.stage
                  ? "bg-brand text-white shadow-sm"
                  : "bg-zinc-800 text-zinc-500"
              }`}
            >
              {i < job.stage && (
                <svg className="mr-1 h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
              {s}
            </span>
          ))}
        </div>

        {/* Advance button */}
        {!isLastStage && (
          <Button
            onClick={advanceStage}
            disabled={saving}
            className="mt-1"
          >
            Advance → {stages[job.stage + 1]}
          </Button>
        )}
        {isLastStage && (
          <p className="text-xs text-green-400 font-medium">Job closed</p>
        )}
      </div>

      {/* Payment Progress */}
      {(() => {
        const MILESTONE_PERCENTAGES: Record<number, number> = { 1: 30, 2: 30, 3: 30, 4: 10 };
        const totalCollected = payments.reduce((s, p) => s + (p.collected_at ? (p.amount ?? 0) : 0), 0);
        const pctCollected = job.contract_price ? Math.round((totalCollected / job.contract_price) * 100) : 0;
        const nextDue = [1, 2, 3, 4].find((n) => !payments.find((p) => p.payment_number === n && p.collected_at));
        const collectedCount = payments.filter((p) => p.collected_at).length;
        return (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">Payments</h2>
              <a href={`/jobs/${job.id}/payments/`} className="text-xs text-brand hover:underline">
                Manage →
              </a>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-400">{collectedCount} of 4 collected</span>
              <span className="text-zinc-200 font-medium">{pctCollected}%</span>
            </div>
            {/* 4-segment bar */}
            <div className="flex h-2 gap-0.5 rounded-full overflow-hidden">
              {[1, 2, 3, 4].map((n) => {
                const pmt = payments.find((p) => p.payment_number === n);
                const collected = !!pmt?.collected_at;
                const pct = MILESTONE_PERCENTAGES[n];
                return (
                  <div
                    key={n}
                    className={`transition-all ${collected ? "bg-brand" : "bg-zinc-800"}`}
                    style={{ flex: pct }}
                  />
                );
              })}
            </div>
            {nextDue && (
              <p className="text-xs text-zinc-500">
                Next due: Payment {nextDue} ({MILESTONE_PERCENTAGES[nextDue]}%)
              </p>
            )}
            {!nextDue && collectedCount === 4 && (
              <p className="text-xs text-green-400 font-medium">All payments collected</p>
            )}
          </div>
        );
      })()}

      {/* Assignment + Schedule */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">Assignment</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-zinc-300">Crew</label>
            <select
              value={selectedCrew}
              onChange={(e) => setSelectedCrew(e.target.value)}
              className="rounded-xl border border-zinc-700 bg-zinc-950/80 px-4 py-2.5 text-sm text-zinc-100 outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
            >
              <option value="">Unassigned</option>
              {crews.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-zinc-300">Scheduled Date</label>
            <input
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
              className="rounded-xl border border-zinc-700 bg-zinc-950/80 px-4 py-2.5 text-sm text-zinc-100 outline-none focus:border-brand focus:ring-2 focus:ring-brand/30 [color-scheme:dark]"
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-zinc-300">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Job notes…"
            className="rounded-xl border border-zinc-700 bg-zinc-950/80 px-4 py-2.5 text-sm text-zinc-100 outline-none focus:border-brand focus:ring-2 focus:ring-brand/30 resize-none"
          />
        </div>
        <Button onClick={saveAssignment} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>

      {/* Job Details (readonly from quote) */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
        <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide mb-3">Job Details</h2>
        <DetailRow label="Customer" value={
          job.contact ? (
            <a href={`/contacts/${job.contact.id}/`} className="text-brand hover:underline">
              {contactName}
            </a>
          ) : "—"
        } />
        <DetailRow label="Phone" value={formatPhone(job.contact?.phone)} />
        <DetailRow label="Address" value={job.address} />
        <DetailRow label="Contract Price" value={formatCurrency(job.contract_price)} />
        <DetailRow label="Roof Type" value={job.roof_type} />
        <DetailRow label="Roof Color" value={job.roof_color} />
        <DetailRow label="Roof Size" value={job.roof_size_sqft ? `${job.roof_size_sqft.toLocaleString()} sqft` : null} />
        <DetailRow label="Scheduled" value={formatDate(job.scheduled_date)} />
        <DetailRow label="Created" value={formatDate(job.created_at)} />
        {job.quote_id && (
          <DetailRow label="Estimate" value={
            <a href={`/quotes/detail/?id=${job.quote_id}`} className="text-brand hover:underline text-sm">
              View estimate
            </a>
          } />
        )}
      </div>
    </div>
  );
}
