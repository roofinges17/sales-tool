"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { authedFetch } from "@/lib/api";
import { toast } from "sonner";
import IntegrationStatusCard, { type IntegrationStatus } from "@/components/settings/IntegrationStatusCard";

const KNOWN_ACCOUNTS = [
  { id: "DfkEocSccdPsDcgqrJug", name: "Roofing Experts Services Inc." },
  { id: "C2bMuXXXxxxxxxxxGHL1", name: "Roofing Experts C&S" },
  { id: "C2bMuXXXxxxxxxxxGHL2", name: "Soffit & Siding Experts" },
] as const;

export default function GoHighLevelPage() {
  const [status, setStatus] = useState<IntegrationStatus>("checking");
  const [statusLabel, setStatusLabel] = useState("");
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [checking, setChecking] = useState(false);

  const [activeLocationId, setActiveLocationId] = useState<string>(KNOWN_ACCOUNTS[0].id);
  const [pitInput, setPitInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<"idle" | "ok" | "fail">("idle");
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    checkStatus();
    loadSettings();
  }, []);

  async function loadSettings() {
    const { data, error } = await supabase()
      .from("company_settings")
      .select("ghl_default_location_id")
      .limit(1)
      .maybeSingle();
    if (error) console.error("[GHL settings] load failed:", error.message);
    const row = data as { ghl_default_location_id?: string | null } | null;
    if (row?.ghl_default_location_id) setActiveLocationId(row.ghl_default_location_id);
  }

  async function checkStatus() {
    setChecking(true);
    setStatus("checking");
    try {
      const res = await authedFetch("/api/ghl-proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: `locations/${KNOWN_ACCOUNTS[0].id}` }),
      });
      if (res.ok) {
        setStatus("connected");
        setStatusLabel("Connected");
      } else if (res.status === 500) {
        setStatus("unconfigured");
        setStatusLabel("GHL_PIT not configured");
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

  async function savePit() {
    if (!pitInput.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase()
        .from("company_settings")
        .update({ ghl_pit_token: pitInput.trim() })
        .limit(1);
      if (error) throw error;
      toast.success("PIT token saved. Recheeking connection…");
      setPitInput("");
      await checkStatus();
    } catch (err) {
      toast.error((err as Error).message ?? "Save failed");
    }
    setSaving(false);
  }

  async function saveLocation(locationId: string) {
    setActiveLocationId(locationId);
    await supabase()
      .from("company_settings")
      .update({ ghl_default_location_id: locationId })
      .limit(1);
    toast.success("Default sub-account updated");
  }

  async function testPush() {
    setTesting(true);
    setTestResult("idle");
    try {
      const res = await authedFetch("/api/ghl-proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: `locations/${activeLocationId}`,
          method: "GET",
        }),
      });
      setTestResult(res.ok ? "ok" : "fail");
    } catch {
      setTestResult("fail");
    }
    setTesting(false);
  }

  const activeAccount = KNOWN_ACCOUNTS.find((a) => a.id === activeLocationId) ?? KNOWN_ACCOUNTS[0];

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold text-zinc-100">GoHighLevel</h1>
        <p className="text-sm text-zinc-500 mt-1">
          CRM, pipeline, and follow-up task automation. Connected via Private Integration Token (PIT).
        </p>
      </div>

      <IntegrationStatusCard
        name="GoHighLevel API"
        description="Opportunities, contacts, follow-up tasks, and pipeline stages"
        status={status}
        statusLabel={statusLabel}
        lastChecked={lastChecked}
        onRecheck={checkStatus}
        checking={checking}
      >
        {/* Sub-account selector */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-zinc-300">Active sub-account</h3>
          <div className="space-y-2">
            {KNOWN_ACCOUNTS.map((acct) => (
              <label
                key={acct.id}
                className={`flex items-center gap-3 rounded-xl border px-4 py-3 cursor-pointer transition-colors ${
                  activeLocationId === acct.id
                    ? "border-brand/40 bg-brand/5"
                    : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-700"
                }`}
              >
                <input
                  type="radio"
                  name="ghl_location"
                  value={acct.id}
                  checked={activeLocationId === acct.id}
                  onChange={() => saveLocation(acct.id)}
                  className="accent-brand"
                />
                <div>
                  <p className="text-sm font-medium text-zinc-200">{acct.name}</p>
                  <p className="text-xs text-zinc-600 font-mono">{acct.id}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Test push */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-zinc-300">Test connection</h3>
          <div className="flex items-center gap-3">
            <button
              onClick={testPush}
              disabled={testing || status === "unconfigured"}
              className="flex items-center gap-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
            >
              {testing ? (
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              )}
              Send test ping to {activeAccount.name}
            </button>
            {testResult === "ok" && (
              <span className="text-xs font-medium text-emerald-400">✓ 200 OK — connection live</span>
            )}
            {testResult === "fail" && (
              <span className="text-xs font-medium text-red-400">✕ Request failed — check PIT</span>
            )}
          </div>
        </div>

        {/* PIT rotation */}
        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-medium text-zinc-300">Rotate PIT token</h3>
            <p className="text-xs text-zinc-500 mt-1">
              Get a new token from GHL Agency Settings → Private Integrations → your integration. Paste it below to rotate without a redeploy.
            </p>
          </div>
          <div className="flex gap-2">
            <input
              type="password"
              value={pitInput}
              onChange={(e) => setPitInput(e.target.value)}
              placeholder="Paste new PIT token…"
              className="flex-1 rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-brand/40"
            />
            <button
              onClick={savePit}
              disabled={!pitInput.trim() || saving}
              className="rounded-xl bg-brand text-white px-4 py-2 text-sm font-semibold hover:brightness-110 disabled:opacity-50 transition"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
          <p className="text-xs text-zinc-600">
            Token is stored encrypted in the database. The proxy falls back to the{" "}
            <code className="text-zinc-500">GHL_PIT</code> environment variable if no DB token is set.
          </p>
        </div>
      </IntegrationStatusCard>
    </div>
  );
}
