"use client";

// Voice Estimate Recorder — tap mic, dictate line items, add to quote.
// MediaRecorder → base64 → /api/voice/transcribe-estimate (Whisper + GPT-4o).
// iOS Safari: prefers audio/mp4, falls back to audio/webm.
// Mobile-first: ≥44px mic button touch target.

import { useRef, useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";

export interface VoiceItem {
  description: string;
  quantity: number;
  unit: string;
  suggested_sku: string | null;
  notes: string;
}

interface Product {
  id: string;
  name: string;
  code?: string | null;
  default_price?: number | null;
  price?: number | null;
  cost?: number | null;
  min_price?: number | null;
  max_price?: number | null;
  unit?: string | null;
  product_type: "PRODUCT" | "SERVICE";
}

interface VoiceEstimateRecorderProps {
  products: Product[];
  onAddToCart: (items: Array<{ product: Product; quantity: number; voiceItem: VoiceItem }>) => void;
}

type Phase = "idle" | "recording" | "transcribing" | "results" | "error";

const MAX_SECONDS = 30;

function matchProduct(sku: string | null, products: Product[]): Product | null {
  if (!sku) return null;
  const target = sku.toUpperCase();
  return products.find((p) => (p.code ?? "").toUpperCase() === target) ?? null;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function preferredMimeType(): string {
  // iOS Safari supports audio/mp4; Chrome/Firefox prefer audio/webm
  const candidates = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg"];
  for (const m of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) return m;
  }
  return "audio/webm";
}

export default function VoiceEstimateRecorder({ products, onAddToCart }: VoiceEstimateRecorderProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [items, setItems] = useState<VoiceItem[]>([]);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [mock, setMock] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mimeTypeRef = useRef<string>("audio/webm");

  // Clean up timer on unmount
  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const stopRecording = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    mediaRecorderRef.current?.stop();
  }, []);

  async function startRecording() {
    setElapsed(0);
    setItems([]);
    setChecked(new Set());
    setTranscript("");
    setErrorMsg("");

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setErrorMsg("Microphone access denied. Allow mic permission and try again.");
      setPhase("error");
      return;
    }

    const mime = preferredMimeType();
    mimeTypeRef.current = mime;

    const recorder = new MediaRecorder(stream, { mimeType: mime });
    chunksRef.current = [];
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = async () => {
      // Stop all tracks
      stream.getTracks().forEach((t) => t.stop());
      setPhase("transcribing");

      const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current });
      try {
        const base64 = await blobToBase64(blob);
        const baseMime = mimeTypeRef.current.split(";")[0];
        const { data: { session } } = await supabase().auth.getSession();
        const res = await fetch("/api/voice/transcribe-estimate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
          },
          body: JSON.stringify({ audio: base64, mimeType: baseMime }),
        });
        if (!res.ok) throw new Error(`Server error ${res.status}`);
        const data = (await res.json()) as {
          transcript?: string;
          items?: VoiceItem[];
          mock?: boolean;
        };
        setTranscript(data.transcript ?? "");
        setItems(data.items ?? []);
        setMock(data.mock === true);
        setChecked(new Set((data.items ?? []).map((_, i) => i)));
        setPhase("results");
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "Transcription failed");
        setPhase("error");
      }
    };

    recorder.start();
    setPhase("recording");

    // Tick timer
    timerRef.current = setInterval(() => {
      setElapsed((s) => {
        const next = s + 1;
        if (next >= MAX_SECONDS) stopRecording();
        return next;
      });
    }, 1000);
  }

  function toggleCheck(i: number) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  }

  function handleAddToCart() {
    const toAdd = items
      .map((item, i) => ({ item, i }))
      .filter(({ i }) => checked.has(i))
      .map(({ item }) => {
        const product = matchProduct(item.suggested_sku, products);
        return product ? { product, quantity: item.quantity, voiceItem: item } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    if (!toAdd.length) return;
    onAddToCart(toAdd);
    setPhase("idle");
    setItems([]);
    setTranscript("");
    setChecked(new Set());
  }

  function reset() {
    setPhase("idle");
    setItems([]);
    setTranscript("");
    setChecked(new Set());
    setErrorMsg("");
  }

  const matchedCount = items.filter(
    (item, i) => checked.has(i) && matchProduct(item.suggested_sku, products)
  ).length;

  const progressPct = Math.min(100, (elapsed / MAX_SECONDS) * 100);

  // ── Idle: just the mic button ──────────────────────────────────────────────────
  if (phase === "idle") {
    return (
      <div className="rounded-lg border border-border-subtle bg-surface-1 overflow-hidden">
        <div className="px-4 py-3 bg-surface-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
            <span className="text-heading-sm text-text-primary">Voice Estimate</span>
            <span className="text-caption text-text-muted">(dictate line items)</span>
          </div>
          <button
            onClick={startRecording}
            className="flex items-center gap-2 rounded-lg bg-red-600 hover:bg-red-500 text-white px-3 py-2 text-sm font-semibold transition min-h-[44px] min-w-[44px]"
            aria-label="Start recording"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="12" r="8" />
            </svg>
            <span className="hidden sm:inline">Record</span>
          </button>
        </div>
      </div>
    );
  }

  // ── Recording ─────────────────────────────────────────────────────────────────
  if (phase === "recording") {
    const remaining = MAX_SECONDS - elapsed;
    return (
      <div className="rounded-lg border border-red-800/50 bg-surface-1 overflow-hidden">
        <div className="px-4 py-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-sm font-semibold text-red-400">Recording…</span>
            </div>
            <span className="text-sm font-mono text-text-tertiary">
              {remaining}s remaining
            </span>
          </div>

          {/* Progress bar */}
          <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden">
            <div
              className="h-full rounded-full bg-red-500 transition-all duration-1000"
              style={{ width: `${progressPct}%` }}
            />
          </div>

          <p className="text-xs text-text-muted">
            Speak your estimate — items, quantities, materials. Tap Stop when done.
          </p>

          <button
            onClick={stopRecording}
            className="w-full flex items-center justify-center gap-2 rounded-lg border border-red-600 bg-red-950/30 text-red-400 hover:bg-red-950/50 px-4 py-3 text-sm font-semibold transition min-h-[44px]"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10h6v4H9z" />
            </svg>
            Stop Recording
          </button>
        </div>
      </div>
    );
  }

  // ── Transcribing / analyzing ──────────────────────────────────────────────────
  if (phase === "transcribing") {
    return (
      <div className="rounded-lg border border-border-subtle bg-surface-1 overflow-hidden">
        <div className="px-4 py-6 flex flex-col items-center gap-3 text-center">
          <svg className="w-6 h-6 animate-spin text-brand" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-sm font-medium text-text-secondary">Transcribing &amp; analyzing…</p>
          <p className="text-xs text-text-muted">Whisper → GPT-4o extracting line items</p>
        </div>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────────
  if (phase === "error") {
    return (
      <div className="rounded-lg border border-red-800/40 bg-surface-1 overflow-hidden">
        <div className="px-4 py-4 space-y-3">
          <p className="text-xs text-red-400">{errorMsg}</p>
          <button
            onClick={reset}
            className="text-xs text-brand hover:underline"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  // ── Results modal ─────────────────────────────────────────────────────────────
  return (
    <div className="rounded-lg border border-border-subtle bg-surface-1 overflow-hidden">
      <div className="px-4 py-3 bg-surface-2 flex items-center justify-between">
        <span className="text-heading-sm text-text-primary">Voice Estimate Results</span>
        <button onClick={reset} className="text-caption text-text-muted hover:text-text-primary transition">
          ✕ Clear
        </button>
      </div>

      <div className="p-4 space-y-3">
        {mock && (
          <div className="rounded-lg border border-amber-800/40 bg-amber-950/20 px-3 py-2 text-xs text-amber-400">
            Demo mode — add OPENAI_API_KEY to Cloudflare Pages env to enable real transcription.
          </div>
        )}

        {/* Transcript */}
        {transcript && (
          <details className="group">
            <summary className="text-xs font-medium text-text-tertiary cursor-pointer hover:text-text-secondary transition select-none">
              Transcript <span className="group-open:hidden">▸</span><span className="hidden group-open:inline">▾</span>
            </summary>
            <p className="mt-1.5 text-xs text-text-muted leading-relaxed bg-surface-2 rounded-lg px-3 py-2">
              {transcript}
            </p>
          </details>
        )}

        {items.length === 0 ? (
          <div className="py-4 text-center">
            <p className="text-xs text-text-muted">No line items detected in the recording.</p>
            <button onClick={reset} className="text-xs text-brand hover:underline mt-2 block mx-auto">
              Try again
            </button>
          </div>
        ) : (
          <>
            <p className="text-xs font-semibold text-text-secondary">
              {items.length} item{items.length !== 1 ? "s" : ""} detected — select to add to quote:
            </p>

            <div className="space-y-2">
              {items.map((item, i) => {
                const product = matchProduct(item.suggested_sku, products);
                return (
                  <label
                    key={i}
                    className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${
                      checked.has(i)
                        ? "border-brand/40 bg-brand/5"
                        : "border-border-subtle bg-surface-2"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked.has(i)}
                      onChange={() => toggleCheck(i)}
                      className="mt-0.5 h-4 w-4 accent-brand flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-text-primary leading-snug">
                        {item.description}
                      </p>
                      {item.notes && (
                        <p className="text-[11px] text-text-muted mt-0.5">{item.notes}</p>
                      )}
                      <div className="mt-1 flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium text-text-secondary">
                          {item.quantity} {item.unit}
                        </span>
                        {item.suggested_sku && (
                          <span className="text-[10px] font-mono text-text-tertiary border border-border-subtle rounded px-1">
                            {item.suggested_sku}
                          </span>
                        )}
                        {product ? (
                          <span className="text-[10px] text-status-green">→ {product.name}</span>
                        ) : (
                          <span className="text-[10px] text-text-muted">→ no product match</span>
                        )}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleAddToCart}
                disabled={matchedCount === 0}
                className="flex-1 rounded-lg bg-status-green/20 border border-status-green/30 text-status-green px-4 py-2 text-sm font-semibold hover:bg-status-green/30 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                Add {matchedCount} item{matchedCount !== 1 ? "s" : ""} to quote
              </button>
              <button
                onClick={startRecording}
                className="rounded-lg border border-red-800/50 bg-red-950/20 text-red-400 hover:bg-red-950/40 px-3 py-2 text-sm font-medium transition min-h-[44px]"
                title="Record again"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="12" cy="12" r="8" />
                </svg>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
