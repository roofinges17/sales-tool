"use client";

import { useEffect, useState } from "react";
import { authedFetch } from "@/lib/api";
import IntegrationStatusCard, { type IntegrationStatus } from "@/components/settings/IntegrationStatusCard";

const FEATURES = [
  { name: "AI Damage Analysis", description: "Detect roof damage from photos", endpoint: "/admin/settings/openai" },
  { name: "AI Material Analysis", description: "Detect soffit · fascia · gutter condition from photos", endpoint: "/admin/settings/openai" },
  { name: "Voice Estimate", description: "Transcribe spoken estimate line items (Whisper + GPT-4o)", endpoint: "/admin/settings/openai" },
];

export default function OpenAIPage() {
  const [status, setStatus] = useState<IntegrationStatus>("checking");
  const [statusLabel, setStatusLabel] = useState("");
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    checkStatus();
  }, []);

  async function checkStatus() {
    setChecking(true);
    setStatus("checking");
    try {
      // Send an empty photos array — if GEMINI_API_KEY is set, damage-detect returns 400
      // (no photos). If unset, it returns the mock response with mock: true.
      const res = await authedFetch("/api/vision/damage-detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photos: [] }),
      });

      if (res.status === 400) {
        // Endpoint reached the "no photos" validation — API key IS configured
        setStatus("connected");
        setStatusLabel("API key configured — real GPT-4o active");
      } else if (res.ok) {
        const json = (await res.json()) as { mock?: boolean };
        if (json.mock) {
          setStatus("partial");
          setStatusLabel("Mock mode — OPENAI_API_KEY not set");
        } else {
          setStatus("connected");
          setStatusLabel("Connected");
        }
      } else {
        setStatus("disconnected");
        setStatusLabel(`Error ${res.status}`);
      }
    } catch {
      setStatus("disconnected");
      setStatusLabel("Network error");
    }
    setLastChecked(new Date());
    setChecking(false);
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold text-zinc-100">OpenAI Vision & Voice</h1>
        <p className="text-sm text-zinc-500 mt-1">
          GPT-4o and Whisper power damage detection, material analysis, and voice estimate transcription.
        </p>
      </div>

      <IntegrationStatusCard
        name="OpenAI API"
        description="GPT-4o vision + Whisper speech-to-text"
        status={status}
        statusLabel={statusLabel}
        lastChecked={lastChecked}
        onRecheck={checkStatus}
        checking={checking}
      >
        {/* Feature list */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-zinc-300">Features powered by OpenAI</h3>
          <div className="space-y-2">
            {FEATURES.map((f) => (
              <div
                key={f.name}
                className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3"
              >
                <div
                  className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${
                    status === "connected" ? "bg-emerald-400" : status === "partial" ? "bg-amber-400" : "bg-zinc-600"
                  }`}
                />
                <div>
                  <p className="text-sm font-medium text-zinc-200">{f.name}</p>
                  <p className="text-xs text-zinc-500">{f.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Config note */}
        <div className="space-y-2 text-sm text-zinc-400">
          <p>
            Configure via <code className="text-zinc-300">OPENAI_API_KEY</code> environment variable in
            Cloudflare Pages. Changing the key requires a redeploy.
          </p>
          {status === "partial" && (
            <div className="rounded-xl border border-amber-800/40 bg-amber-950/20 px-4 py-3 text-xs text-amber-400">
              Running in demo mode — all vision and voice features return sample data. Add{" "}
              <code>OPENAI_API_KEY</code> in Cloudflare Pages env and redeploy to enable real AI analysis.
            </div>
          )}
          <a
            href="https://platform.openai.com/usage"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-brand hover:underline"
          >
            View OpenAI usage dashboard →
          </a>
        </div>
      </IntegrationStatusCard>
    </div>
  );
}
