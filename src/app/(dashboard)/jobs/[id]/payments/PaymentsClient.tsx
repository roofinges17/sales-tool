"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { toast } from "sonner";

interface JobPayment {
  id: string;
  job_id: string;
  payment_number: 1 | 2 | 3 | 4;
  percentage: number;
  amount: number | null;
  method: string | null;
  collected_by_id: string | null;
  collected_at: string | null;
  notes: string | null;
  collector?: { name: string } | null;
}

interface Job {
  id: string;
  contract_price: number | null;
  contact: { first_name: string; last_name: string } | null;
  address: string | null;
}

const MILESTONE_PERCENTAGES: Record<1 | 2 | 3 | 4, number> = { 1: 30, 2: 30, 3: 30, 4: 10 };
const MILESTONE_LABELS: Record<1 | 2 | 3 | 4, string> = {
  1: "Deposit",
  2: "Material Delivery",
  3: "Job Completion",
  4: "Final / Punch-Out",
};
const METHODS = ["cash", "check", "financing", "card", "other"] as const;
type Method = typeof METHODS[number];

function formatCurrency(v: number | null | undefined) {
  if (v == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);
}

function formatDateTime(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

export default function PaymentsClient() {
  const [job, setJob] = useState<Job | null>(null);
  const [payments, setPayments] = useState<JobPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<number | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Per-card form state
  const [amounts, setAmounts] = useState<Record<number, string>>({});
  const [methods, setMethods] = useState<Record<number, Method>>({});
  const [notes, setNotes] = useState<Record<number, string>>({});

  const jobId = typeof window !== "undefined"
    ? window.location.pathname.replace(/\/$/, "").split("/").slice(-2)[0] ?? ""
    : "";

  useEffect(() => {
    if (!jobId || jobId === "stub") return;
    loadAll();
    supabase().auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  async function loadAll() {
    setLoading(true);
    const [{ data: jobData }, { data: pmtData }] = await Promise.all([
      supabase()
        .from("jobs")
        .select("id, contract_price, address, contact:contact_id(first_name, last_name)")
        .eq("id", jobId)
        .single(),
      supabase()
        .from("job_payments")
        .select("*, collector:collected_by_id(name)")
        .eq("job_id", jobId)
        .order("payment_number"),
    ]);

    const j = jobData as unknown as Job | null;
    const pmts = (pmtData as unknown as JobPayment[]) ?? [];
    setJob(j);
    setPayments(pmts);

    // Pre-fill amount inputs with auto-calc or existing values
    const amtInit: Record<number, string> = {};
    const mthInit: Record<number, Method> = {};
    const notInit: Record<number, string> = {};
    for (const n of [1, 2, 3, 4] as const) {
      const existing = pmts.find((p) => p.payment_number === n);
      const pct = MILESTONE_PERCENTAGES[n];
      const autoAmt = j?.contract_price ? Math.round(j.contract_price * pct / 100) : 0;
      amtInit[n] = existing?.amount != null ? String(existing.amount) : String(autoAmt);
      mthInit[n] = (existing?.method as Method) ?? "check";
      notInit[n] = existing?.notes ?? "";
    }
    setAmounts(amtInit);
    setMethods(mthInit);
    setNotes(notInit);
    setLoading(false);
  }

  async function collectPayment(num: 1 | 2 | 3 | 4) {
    if (!job) return;
    const existing = payments.find((p) => p.payment_number === num);
    if (existing?.collected_at) return; // already collected

    setSubmitting(num);
    const amount = parseFloat(amounts[num] ?? "0") || 0;
    const method = methods[num] ?? "check";
    const note = notes[num] ?? null;
    const pct = MILESTONE_PERCENTAGES[num];

    const { error } = await supabase().from("job_payments").insert({
      job_id: job.id,
      payment_number: num,
      percentage: pct,
      amount,
      method,
      collected_by_id: currentUserId,
      collected_at: new Date().toISOString(),
      notes: note || null,
    });

    if (error) {
      if (error.code === "23505") {
        console.error("[payments] duplicate payment insert:", error.message);
        toast.error("Payment already recorded for this milestone.");
      } else {
        console.error("[payments] insert error:", error.message);
        toast.error("Failed to record payment: " + error.message);
      }
      setSubmitting(null);
      return;
    }

    toast.success(`Payment ${num} recorded — ${formatCurrency(amount)}`);
    await loadAll();
    setSubmitting(null);
  }

  if (loading) {
    return <div className="flex items-center justify-center py-32 text-zinc-500 text-sm">Loading…</div>;
  }

  if (!job) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center">
        <p className="text-zinc-400">Job not found</p>
        <a href="/jobs/" className="mt-3 text-brand text-sm underline">Back to Jobs</a>
      </div>
    );
  }

  const contactName = job.contact
    ? `${job.contact.first_name} ${job.contact.last_name}`
    : "Unknown";
  const totalCollected = payments.reduce((s, p) => s + (p.collected_at ? (p.amount ?? 0) : 0), 0);
  const pctCollected = job.contract_price ? Math.round((totalCollected / job.contract_price) * 100) : 0;

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Back */}
      <a href={`/jobs/${jobId}/`} className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200 transition">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Job Detail
      </a>

      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-zinc-100">Payments</h1>
        <p className="mt-0.5 text-sm text-zinc-400">{contactName} · {job.address ?? "—"}</p>
      </div>

      {/* Overall progress */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-zinc-300">Contract Total</span>
          <span className="text-sm font-semibold text-zinc-100">{formatCurrency(job.contract_price)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-zinc-400">Collected</span>
          <span className="text-sm text-zinc-200">{formatCurrency(totalCollected)} ({pctCollected}%)</span>
        </div>
        {/* 4-segment bar */}
        <div className="flex h-2 gap-0.5 rounded-full overflow-hidden">
          {([1, 2, 3, 4] as const).map((n) => {
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
        <div className="flex justify-between text-[10px] text-zinc-600">
          <span>30%</span><span>30%</span><span>30%</span><span>10%</span>
        </div>
      </div>

      {/* Milestone cards */}
      <div className="space-y-4">
        {([1, 2, 3, 4] as const).map((num) => {
          const existing = payments.find((p) => p.payment_number === num);
          const collected = !!existing?.collected_at;
          const pct = MILESTONE_PERCENTAGES[num];
          const autoAmt = job.contract_price ? Math.round(job.contract_price * pct / 100) : 0;

          return (
            <div
              key={num}
              className={`rounded-2xl border p-5 space-y-4 transition ${
                collected
                  ? "border-brand/30 bg-brand/5"
                  : "border-zinc-800 bg-zinc-900/60"
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-zinc-100">
                    Payment {num} — {pct}%
                  </p>
                  <p className="text-xs text-zinc-500">{MILESTONE_LABELS[num]}</p>
                </div>
                {collected ? (
                  <Badge variant="green">Collected</Badge>
                ) : (
                  <Badge variant="gray">Pending</Badge>
                )}
              </div>

              {collected ? (
                <div className="space-y-1 text-sm">
                  <p className="text-zinc-100 font-medium">{formatCurrency(existing!.amount)}</p>
                  <p className="text-zinc-400 text-xs capitalize">{existing!.method ?? "—"}</p>
                  <p className="text-zinc-500 text-xs">
                    {formatDateTime(existing!.collected_at)} · {existing!.collector?.name ?? "Unknown"}
                  </p>
                  {existing!.notes && (
                    <p className="text-zinc-400 text-xs mt-1">{existing!.notes}</p>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium text-zinc-400">Amount</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">$</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={amounts[num] ?? String(autoAmt)}
                          onChange={(e) => setAmounts((a) => ({ ...a, [num]: e.target.value }))}
                          className="w-full rounded-xl border border-zinc-700 bg-zinc-950/80 pl-7 pr-4 py-2.5 text-sm text-zinc-100 outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium text-zinc-400">Method</label>
                      <select
                        value={methods[num] ?? "check"}
                        onChange={(e) => setMethods((m) => ({ ...m, [num]: e.target.value as Method }))}
                        className="rounded-xl border border-zinc-700 bg-zinc-950/80 px-3 py-2.5 text-sm text-zinc-100 outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
                      >
                        {METHODS.map((m) => (
                          <option key={m} value={m} className="capitalize">{m.charAt(0).toUpperCase() + m.slice(1)}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-zinc-400">Notes (optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. Check #1234"
                      value={notes[num] ?? ""}
                      onChange={(e) => setNotes((n) => ({ ...n, [num]: e.target.value }))}
                      className="rounded-xl border border-zinc-700 bg-zinc-950/80 px-4 py-2.5 text-sm text-zinc-100 outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
                    />
                  </div>
                  <Button
                    onClick={() => collectPayment(num)}
                    disabled={submitting === num}
                    className="w-full sm:w-auto"
                  >
                    {submitting === num ? "Recording…" : `Record Payment ${num}`}
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
