"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Status = "loading" | "success" | "already_accepted" | "error";

interface QuoteRow {
  id: string;
  estimate_number: string;
  total_amount: number;
  status: string;
  accepted_at: string | null;
  accept_token: string | null;
  accounts?: { name: string } | null | { name: string }[];
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

export default function AcceptPage() {
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState("");
  const [quote, setQuote] = useState<QuoteRow | null>(null);

  useEffect(() => {
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const token = params.get("token");
      if (!token) {
        setStatus("error");
        setMessage("Invalid or missing acceptance token.");
        return;
      }

      const { data, error } = await supabase()
        .from("quotes")
        .select("id, estimate_number, total_amount, status, accepted_at, accept_token, accounts(name)")
        .eq("accept_token", token)
        .maybeSingle();

      if (error || !data) {
        setStatus("error");
        setMessage("This acceptance link is invalid or has expired.");
        return;
      }

      const row = data as unknown as QuoteRow;

      if (row.accepted_at) {
        setQuote(row);
        setStatus("already_accepted");
        return;
      }

      const { error: updateErr } = await supabase()
        .from("quotes")
        .update({ status: "accepted", accepted_at: new Date().toISOString() })
        .eq("id", row.id);

      if (updateErr) {
        setStatus("error");
        setMessage("Failed to record your acceptance. Please try again or contact us.");
        return;
      }

      setQuote({ ...row, accepted_at: new Date().toISOString() });
      setStatus("success");
    })();
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8 text-center shadow-2xl shadow-black/40">
        {/* Brand */}
        <div className="mb-6 flex justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/15 ring-1 ring-brand/20">
            <svg viewBox="0 0 24 24" className="h-6 w-6 text-brand" fill="currentColor">
              <path d="M12 2L2 9.5V22h7v-6h6v6h7V9.5L12 2z" />
            </svg>
          </div>
        </div>
        <p className="mb-6 text-xs font-semibold uppercase tracking-wider text-zinc-500">Roofing Experts</p>

        {status === "loading" && (
          <div className="flex flex-col items-center gap-3">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-brand" />
            <p className="text-sm text-zinc-400">Processing your acceptance…</p>
          </div>
        )}

        {status === "success" && (
          <>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-400/10">
              <svg className="h-8 w-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="mb-2 text-xl font-bold text-zinc-50">Estimate Accepted</h1>
            {quote && (
              <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/50 p-4 text-left">
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500">Estimate</span>
                  <span className="font-medium text-zinc-200">{quote.estimate_number}</span>
                </div>
                {quote.accounts && !Array.isArray(quote.accounts) && (quote.accounts as { name: string }).name && (
                  <div className="mt-1.5 flex justify-between text-sm">
                    <span className="text-zinc-500">Customer</span>
                    <span className="font-medium text-zinc-200">{(quote.accounts as { name: string }).name}</span>
                  </div>
                )}
                <div className="mt-1.5 flex justify-between text-sm">
                  <span className="text-zinc-500">Total</span>
                  <span className="font-bold text-zinc-50">{formatCurrency(quote.total_amount)}</span>
                </div>
              </div>
            )}
            <p className="mt-4 text-sm text-zinc-400">
              Thank you! We&apos;ll be in touch shortly to schedule the next steps.
            </p>
          </>
        )}

        {status === "already_accepted" && (
          <>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-sky-400/10">
              <svg className="h-8 w-8 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="mb-2 text-xl font-bold text-zinc-50">Already Accepted</h1>
            <p className="text-sm text-zinc-400">
              This estimate was accepted on{" "}
              {quote?.accepted_at
                ? new Date(quote.accepted_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
                : "a prior date"}
              . No further action needed.
            </p>
          </>
        )}

        {status === "error" && (
          <>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-400/10">
              <svg className="h-8 w-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="mb-2 text-xl font-bold text-zinc-50">Link Invalid</h1>
            <p className="text-sm text-zinc-400">{message}</p>
            <p className="mt-3 text-xs text-zinc-600">Please contact us if you believe this is an error.</p>
          </>
        )}

        <p className="mt-8 text-xs text-zinc-600">Roofing Experts · roofingex.com</p>
      </div>
    </div>
  );
}
