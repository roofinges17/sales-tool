"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

interface CompanySettings {
  id?: string;
  company_name?: string;
  legal_name?: string;
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
}

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<CompanySettings>({
    company_name: "",
    legal_name: "",
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
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    setLoading(true);
    const { data } = await supabase()
      .from("company_settings")
      .select("*")
      .limit(1)
      .maybeSingle();
    if (data) setSettings(data);
    setLoading(false);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = { ...settings };
    if (settings.id) {
      await supabase().from("company_settings").update(payload).eq("id", settings.id);
    } else {
      const { data } = await supabase().from("company_settings").insert(payload).select().single();
      if (data) setSettings(data);
    }
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
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
