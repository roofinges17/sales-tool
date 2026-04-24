"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { toast } from "sonner";
import type { GhlPipeline } from "@/lib/ghl";

interface CompanySettings {
  id?: string;
  company_name?: string;
  legal_name?: string;
  license_number?: string;
  email?: string;
  phone?: string;
  website?: string;
  tax_id?: string;
  address?: string;
  default_tax_rate?: number;
  quote_validity_days?: number;
  contract_prefix?: string;
  estimate_prefix?: string;
  terms_and_conditions?: string;
  ghl_pipeline_id?: string;
  ghl_sent_stage_id?: string;
  ghl_won_stage_id?: string;
}

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<CompanySettings>({
    company_name: "",
    legal_name: "",
    license_number: "",
    email: "",
    phone: "",
    website: "",
    tax_id: "",
    address: "",
    default_tax_rate: 0.07,
    quote_validity_days: 30,
    contract_prefix: "RE-",
    estimate_prefix: "EST-",
    terms_and_conditions: "",
    ghl_pipeline_id: "",
    ghl_sent_stage_id: "",
    ghl_won_stage_id: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [ghlPipelines, setGhlPipelines] = useState<GhlPipeline[] | null>(null);
  const [ghlLoadError, setGhlLoadError] = useState<string | null>(null);
  const [ghlLoading, setGhlLoading] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    setLoading(true);
    const { data, error } = await supabase()
      .from("company_settings")
      .select("*")
      .limit(1)
      .maybeSingle();
    if (error) toast.error("Failed to load settings: " + error.message);
    if (data) setSettings(data);
    setLoading(false);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    // Strip id from the write payload — send it separately for upsert conflict resolution
    const { id, ...fields } = settings;
    const { data, error } = await supabase()
      .from("company_settings")
      .upsert(id ? { id, ...fields } : fields, { onConflict: "id" })
      .select()
      .single();
    if (error) { toast.error("Save failed: " + error.message); setSaving(false); return; }
    if (data) setSettings(data as CompanySettings);
    setSaving(false);
    setSaved(true);
    toast.success("Settings saved");
    setTimeout(() => setSaved(false), 3000);
  }

  async function loadGhlPipelines() {
    setGhlLoading(true);
    setGhlLoadError(null);
    const { fetchGhlPipelines } = await import("@/lib/ghl");
    const { pipelines, error } = await fetchGhlPipelines();
    setGhlPipelines(pipelines);
    setGhlLoadError(error);
    setGhlLoading(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-zinc-500">
        <svg className="mr-2 h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Loading…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-50">Company Settings</h1>
        <p className="mt-1 text-sm text-zinc-500">Configure your company information and defaults.</p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        <Card>
          <CardContent className="space-y-6">
            <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">Company Info</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Company Name"
                value={settings.company_name ?? ""}
                onChange={(e) => setSettings((s) => ({ ...s, company_name: e.target.value }))}
              />
              <Input
                label="Legal Name"
                value={settings.legal_name ?? ""}
                onChange={(e) => setSettings((s) => ({ ...s, legal_name: e.target.value }))}
              />
              <Input
                label="License Number (e.g. CCC1331656)"
                value={settings.license_number ?? ""}
                onChange={(e) => setSettings((s) => ({ ...s, license_number: e.target.value }))}
              />
              <Input
                label="Email"
                type="email"
                value={settings.email ?? ""}
                onChange={(e) => setSettings((s) => ({ ...s, email: e.target.value }))}
              />
              <Input
                label="Phone"
                value={settings.phone ?? ""}
                onChange={(e) => setSettings((s) => ({ ...s, phone: e.target.value }))}
              />
              <Input
                label="Website"
                value={settings.website ?? ""}
                onChange={(e) => setSettings((s) => ({ ...s, website: e.target.value }))}
              />
              <Input
                label="Tax ID / EIN"
                value={settings.tax_id ?? ""}
                onChange={(e) => setSettings((s) => ({ ...s, tax_id: e.target.value }))}
              />
            </div>
            <Input
              label="Address"
              value={settings.address ?? ""}
              onChange={(e) => setSettings((s) => ({ ...s, address: e.target.value }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-6">
            <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">Defaults</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Default Tax Rate (%)"
                type="number"
                step="0.01"
                value={((settings.default_tax_rate ?? 0.07) * 100).toFixed(2)}
                onChange={(e) => setSettings((s) => ({ ...s, default_tax_rate: parseFloat(e.target.value) / 100 }))}
              />
              <Input
                label="Quote Validity (Days)"
                type="number"
                value={settings.quote_validity_days ?? 30}
                onChange={(e) => setSettings((s) => ({ ...s, quote_validity_days: parseInt(e.target.value) }))}
              />
              <Input
                label="Contract Prefix"
                value={settings.contract_prefix ?? "RE-"}
                onChange={(e) => setSettings((s) => ({ ...s, contract_prefix: e.target.value }))}
              />
              <Input
                label="Estimate Prefix"
                value={settings.estimate_prefix ?? "EST-"}
                onChange={(e) => setSettings((s) => ({ ...s, estimate_prefix: e.target.value }))}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4">
            <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">Terms & Conditions</h2>
            <textarea
              rows={8}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950/80 px-4 py-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-brand focus:ring-2 focus:ring-brand/30"
              placeholder="Enter your terms and conditions..."
              value={settings.terms_and_conditions ?? ""}
              onChange={(e) => setSettings((s) => ({ ...s, terms_and_conditions: e.target.value }))}
            />
          </CardContent>
        </Card>

        {/* GoHighLevel Integration */}
        <Card>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">GoHighLevel CRM</h2>
                <p className="text-xs text-zinc-500 mt-0.5">Sync contacts and opportunities to your GHL location.</p>
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={loadGhlPipelines}
                loading={ghlLoading}
              >
                {ghlLoading ? "Loading…" : "Load Pipelines"}
              </Button>
            </div>

            {ghlLoadError && (
              <div className="rounded-xl border border-yellow-700/50 bg-yellow-950/30 px-4 py-3 text-sm text-yellow-300">
                <p className="font-semibold mb-1">GHL token missing required scopes</p>
                <p className="text-yellow-400/80 text-xs">{ghlLoadError}</p>
                <p className="text-yellow-400/80 text-xs mt-2">You can still enter pipeline and stage IDs manually below (copy them from the GHL URL when viewing a pipeline).</p>
              </div>
            )}

            {ghlPipelines !== null && ghlPipelines.length === 0 && !ghlLoadError && (
              <div className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-400">
                No pipelines found in GHL. Create one at{" "}
                <a href="https://app.gohighlevel.com" target="_blank" rel="noreferrer" className="text-brand underline">
                  app.gohighlevel.com
                </a>{" "}
                first.
              </div>
            )}

            {ghlPipelines && ghlPipelines.length > 0 && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Pipeline</label>
                  <select
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-950/80 px-4 py-2.5 text-sm text-zinc-100 focus:border-brand focus:outline-none"
                    value={settings.ghl_pipeline_id ?? ""}
                    onChange={(e) => {
                      setSettings((s) => ({ ...s, ghl_pipeline_id: e.target.value, ghl_sent_stage_id: "", ghl_won_stage_id: "" }));
                    }}
                  >
                    <option value="">— Select pipeline —</option>
                    {ghlPipelines.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                {settings.ghl_pipeline_id && (() => {
                  const pipeline = ghlPipelines.find((p) => p.id === settings.ghl_pipeline_id);
                  if (!pipeline) return null;
                  return (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-zinc-400 mb-1">Quote Sent stage</label>
                        <select
                          className="w-full rounded-xl border border-zinc-700 bg-zinc-950/80 px-4 py-2.5 text-sm text-zinc-100 focus:border-brand focus:outline-none"
                          value={settings.ghl_sent_stage_id ?? ""}
                          onChange={(e) => setSettings((s) => ({ ...s, ghl_sent_stage_id: e.target.value }))}
                        >
                          <option value="">— Select stage —</option>
                          {pipeline.stages.map((st) => (
                            <option key={st.id} value={st.id}>{st.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-zinc-400 mb-1">Quote Accepted (Won) stage</label>
                        <select
                          className="w-full rounded-xl border border-zinc-700 bg-zinc-950/80 px-4 py-2.5 text-sm text-zinc-100 focus:border-brand focus:outline-none"
                          value={settings.ghl_won_stage_id ?? ""}
                          onChange={(e) => setSettings((s) => ({ ...s, ghl_won_stage_id: e.target.value }))}
                        >
                          <option value="">— Select stage —</option>
                          {pipeline.stages.map((st) => (
                            <option key={st.id} value={st.id}>{st.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Manual fallback inputs always visible */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Input
                label="Pipeline ID (manual)"
                placeholder="GHL pipeline ID"
                value={settings.ghl_pipeline_id ?? ""}
                onChange={(e) => setSettings((s) => ({ ...s, ghl_pipeline_id: e.target.value }))}
              />
              <Input
                label="Sent Stage ID"
                placeholder="GHL stage ID"
                value={settings.ghl_sent_stage_id ?? ""}
                onChange={(e) => setSettings((s) => ({ ...s, ghl_sent_stage_id: e.target.value }))}
              />
              <Input
                label="Won Stage ID"
                placeholder="GHL stage ID"
                value={settings.ghl_won_stage_id ?? ""}
                onChange={(e) => setSettings((s) => ({ ...s, ghl_won_stage_id: e.target.value }))}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center gap-3">
          <Button type="submit" loading={saving}>
            {saving ? "Saving…" : "Save Settings"}
          </Button>
          {saved && (
            <span className="text-sm text-green-400">Settings saved successfully.</span>
          )}
        </div>
      </form>
    </div>
  );
}
