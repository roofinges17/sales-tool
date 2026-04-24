"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";

type PageStatus = "loading" | "pending_sign" | "success" | "already_accepted" | "error";
type SignMode = "electronic" | "manual";

interface QuoteRow {
  id: string;
  name: string;
  estimate_number: string;
  total_amount: number;
  status: string;
  accepted_at: string | null;
  signed_at: string | null;
  customer_signature_data_url: string | null;
  accept_token: string | null;
  accounts?: { name: string } | null | { name: string }[];
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

// ── Signature canvas ──────────────────────────────────────────────────────────

interface SignaturePadProps {
  onSignature: (dataUrl: string | null) => void;
}

function SignaturePad({ onSignature }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [isEmpty, setIsEmpty] = useState(true);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);

  const getPos = (e: MouseEvent | TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ("touches" in e) {
      const t = e.touches[0];
      return { x: (t.clientX - rect.left) * scaleX, y: (t.clientY - rect.top) * scaleY };
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  };

  const startDraw = useCallback((e: MouseEvent | TouchEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawing.current = true;
    const pos = getPos(e, canvas);
    lastPoint.current = pos;
    const ctx = canvas.getContext("2d")!;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 1, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    setIsEmpty(false);
  }, []);

  const draw = useCallback((e: MouseEvent | TouchEvent) => {
    e.preventDefault();
    if (!drawing.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const pos = getPos(e, canvas);
    if (lastPoint.current) {
      ctx.beginPath();
      ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();
    }
    lastPoint.current = pos;
  }, []);

  const endDraw = useCallback(() => {
    drawing.current = false;
    lastPoint.current = null;
    const canvas = canvasRef.current;
    if (!canvas || isEmpty) return;
    onSignature(canvas.toDataURL("image/png"));
  }, [isEmpty, onSignature]);

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setIsEmpty(true);
    onSignature(null);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Resize canvas to match display size
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * window.devicePixelRatio);
    canvas.height = Math.round(rect.height * window.devicePixelRatio);
    const ctx = canvas.getContext("2d")!;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    canvas.addEventListener("mousedown", startDraw);
    canvas.addEventListener("mousemove", draw);
    canvas.addEventListener("mouseup", endDraw);
    canvas.addEventListener("mouseleave", endDraw);
    canvas.addEventListener("touchstart", startDraw, { passive: false });
    canvas.addEventListener("touchmove", draw, { passive: false });
    canvas.addEventListener("touchend", endDraw);
    return () => {
      canvas.removeEventListener("mousedown", startDraw);
      canvas.removeEventListener("mousemove", draw);
      canvas.removeEventListener("mouseup", endDraw);
      canvas.removeEventListener("mouseleave", endDraw);
      canvas.removeEventListener("touchstart", startDraw);
      canvas.removeEventListener("touchmove", draw);
      canvas.removeEventListener("touchend", endDraw);
    };
  }, [startDraw, draw, endDraw]);

  return (
    <div className="space-y-2">
      <div className="relative rounded-xl border-2 border-dashed border-zinc-700 bg-zinc-900 overflow-hidden" style={{ touchAction: "none" }}>
        <canvas
          ref={canvasRef}
          className="w-full"
          style={{ height: "160px", display: "block", cursor: "crosshair" }}
        />
        {isEmpty && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p className="text-sm text-zinc-600">Sign here with your finger or mouse</p>
          </div>
        )}
      </div>
      <button
        onClick={clear}
        className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors underline"
      >
        Clear
      </button>
    </div>
  );
}

// ── Accept page ────────────────────────────────────────────────────────────────

export default function AcceptPage() {
  const [status, setStatus] = useState<PageStatus>("loading");
  const [message, setMessage] = useState("");
  const [quote, setQuote] = useState<QuoteRow | null>(null);
  const [signMode, setSignMode] = useState<SignMode>("electronic");
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
        .select("id, name, estimate_number, total_amount, status, accepted_at, signed_at, customer_signature_data_url, accept_token, accounts(name)")
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

      setQuote(row);
      setStatus("pending_sign");
    })();
  }, []);

  async function handleAccept() {
    if (!quote) return;
    setSubmitting(true);

    const now = new Date().toISOString();
    const payload: Record<string, unknown> = {
      status: "accepted",
      accepted_at: now,
    };

    if (signMode === "electronic" && signatureDataUrl) {
      payload.customer_signature_data_url = signatureDataUrl;
      payload.signed_at = now;
    }

    const { error } = await supabase()
      .from("quotes")
      .update(payload)
      .eq("id", quote.id);

    setSubmitting(false);

    if (error) {
      setStatus("error");
      setMessage("Failed to record your acceptance. Please try again or contact us.");
      return;
    }

    setQuote({ ...quote, ...payload as Partial<QuoteRow>, accepted_at: now });
    setStatus("success");
  }

  const customerName = quote?.accounts && !Array.isArray(quote.accounts)
    ? (quote.accounts as { name: string }).name
    : null;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-4 py-8">
      <div className="w-full max-w-md">
        {/* Brand header */}
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/15 ring-1 ring-brand/20">
            <svg viewBox="0 0 24 24" className="h-6 w-6 text-brand" fill="currentColor">
              <path d="M12 2L2 9.5V22h7v-6h6v6h7V9.5L12 2z" />
            </svg>
          </div>
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Roofing Experts</p>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 shadow-2xl shadow-black/40 overflow-hidden">
          {/* ── Loading ──────────────────────────────────────── */}
          {status === "loading" && (
            <div className="p-8 text-center">
              <div className="mx-auto flex h-10 w-10 items-center justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-brand" />
              </div>
              <p className="mt-3 text-sm text-zinc-400">Loading estimate…</p>
            </div>
          )}

          {/* ── Pending sign ─────────────────────────────────── */}
          {status === "pending_sign" && quote && (
            <div className="divide-y divide-zinc-800">
              {/* Estimate summary */}
              <div className="p-6">
                <h1 className="text-xl font-bold text-zinc-50">Review &amp; Sign</h1>
                <p className="mt-1 text-sm text-zinc-400">
                  Please review your estimate and sign below to confirm acceptance.
                </p>
                <div className="mt-4 space-y-2 rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-500">Estimate</span>
                    <span className="font-medium text-zinc-200">{quote.estimate_number}</span>
                  </div>
                  {customerName && (
                    <div className="flex justify-between text-sm">
                      <span className="text-zinc-500">Customer</span>
                      <span className="font-medium text-zinc-200">{customerName}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm border-t border-zinc-800 pt-2 mt-2">
                    <span className="text-zinc-400 font-medium">Total</span>
                    <span className="text-lg font-bold text-zinc-50">{formatCurrency(quote.total_amount)}</span>
                  </div>
                </div>
              </div>

              {/* Signature section */}
              <div className="p-6 space-y-5">
                {/* Mode picker */}
                <div>
                  <p className="text-sm font-medium text-zinc-300 mb-2">Signature method</p>
                  <div className="flex rounded-xl border border-zinc-700 overflow-hidden">
                    <button
                      onClick={() => setSignMode("electronic")}
                      className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
                        signMode === "electronic"
                          ? "bg-zinc-800 text-zinc-100"
                          : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/40"
                      }`}
                    >
                      Sign electronically
                    </button>
                    <button
                      onClick={() => setSignMode("manual")}
                      className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors border-l border-zinc-700 ${
                        signMode === "manual"
                          ? "bg-zinc-800 text-zinc-100"
                          : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/40"
                      }`}
                    >
                      I&apos;ll sign the printed copy
                    </button>
                  </div>
                </div>

                {signMode === "electronic" ? (
                  <div className="space-y-3">
                    <p className="text-xs text-zinc-500">
                      Draw your signature below using your finger or mouse. Your signature will be saved with this estimate.
                    </p>
                    <SignaturePad onSignature={setSignatureDataUrl} />
                    <button
                      onClick={handleAccept}
                      disabled={submitting || !signatureDataUrl}
                      className="w-full rounded-xl bg-brand px-4 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-brand/90 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {submitting ? "Submitting…" : "Accept &amp; Submit Signature"}
                    </button>
                    <p className="text-xs text-zinc-600 text-center">
                      By signing, you agree to the terms and conditions in your estimate.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-amber-700/30 bg-amber-950/20 px-4 py-3">
                      <p className="text-sm font-medium text-amber-300">Manual signature selected</p>
                      <p className="mt-1 text-xs text-amber-400/80">
                        Your contractor will provide a printed copy of the estimate for you to sign. Clicking below confirms you have reviewed and agree to the estimate.
                      </p>
                    </div>
                    {/* Printed signature block preview */}
                    <div className="rounded-xl border border-zinc-700 bg-zinc-950/50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">Signature Block (on printed estimate)</p>
                      <div className="grid grid-cols-2 gap-3">
                        {["Customer Signature", "Date", "Authorized Representative", "Date"].map((label) => (
                          <div key={label} className="space-y-2">
                            <p className="text-[10px] text-zinc-500">{label}</p>
                            <div className="h-8 border-b border-zinc-600" />
                          </div>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={handleAccept}
                      disabled={submitting}
                      className="w-full rounded-xl bg-brand px-4 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-brand/90 disabled:opacity-40"
                    >
                      {submitting ? "Submitting…" : "Accept Estimate (Sign Printed Copy)"}
                    </button>
                    <p className="text-xs text-zinc-600 text-center">
                      By clicking, you confirm you have reviewed this estimate and agree to proceed.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Success ───────────────────────────────────────── */}
          {status === "success" && (
            <div className="p-8 text-center space-y-4">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-400/10">
                <svg className="h-8 w-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h1 className="text-xl font-bold text-zinc-50">
                {quote?.signed_at ? "Estimate Signed & Accepted" : "Estimate Accepted"}
              </h1>
              {quote && (
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4 text-left">
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-500">Estimate</span>
                    <span className="font-medium text-zinc-200">{quote.estimate_number}</span>
                  </div>
                  {customerName && (
                    <div className="mt-1.5 flex justify-between text-sm">
                      <span className="text-zinc-500">Customer</span>
                      <span className="font-medium text-zinc-200">{customerName}</span>
                    </div>
                  )}
                  <div className="mt-1.5 flex justify-between text-sm">
                    <span className="text-zinc-500">Total</span>
                    <span className="font-bold text-zinc-50">{formatCurrency(quote.total_amount)}</span>
                  </div>
                </div>
              )}
              {/* Show captured signature */}
              {quote?.customer_signature_data_url && (
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
                  <p className="text-xs text-zinc-500 mb-2 text-left">Your signature</p>
                  <div className="rounded-lg bg-zinc-900 p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={quote.customer_signature_data_url}
                      alt="Customer signature"
                      className="mx-auto max-h-20 object-contain"
                    />
                  </div>
                </div>
              )}
              <p className="text-sm text-zinc-400">
                Thank you! We&apos;ll be in touch shortly to schedule the next steps.
              </p>
              {quote?.signed_at && (
                <p className="text-xs text-zinc-600">
                  Signed electronically · {new Date(quote.signed_at).toLocaleString()}
                </p>
              )}
            </div>
          )}

          {/* ── Already accepted ──────────────────────────────── */}
          {status === "already_accepted" && (
            <div className="p-8 text-center space-y-4">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-sky-400/10">
                <svg className="h-8 w-8 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h1 className="text-xl font-bold text-zinc-50">Already Accepted</h1>
              <p className="text-sm text-zinc-400">
                This estimate was accepted on{" "}
                {quote?.accepted_at
                  ? new Date(quote.accepted_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
                  : "a prior date"}
                . No further action needed.
              </p>
              {quote?.customer_signature_data_url && (
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
                  <p className="text-xs text-zinc-500 mb-2 text-left">Signature on file</p>
                  <div className="rounded-lg bg-zinc-900 p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={quote.customer_signature_data_url}
                      alt="Customer signature on file"
                      className="mx-auto max-h-20 object-contain"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Error ────────────────────────────────────────── */}
          {status === "error" && (
            <div className="p-8 text-center space-y-3">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-400/10">
                <svg className="h-8 w-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h1 className="text-xl font-bold text-zinc-50">Link Invalid</h1>
              <p className="text-sm text-zinc-400">{message}</p>
              <p className="text-xs text-zinc-600">Please contact us if you believe this is an error.</p>
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-zinc-600">Roofing Experts · roofingex.com</p>
      </div>
    </div>
  );
}
