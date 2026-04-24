"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import type { LeadSource, Profile } from "@/types";

interface FormData {
  name: string;
  type: string;
  status: string;
  email: string;
  phone: string;
  lead_source: string;
  assigned_to_id: string;
  billing_address_line1: string;
  billing_address_line2: string;
  billing_city: string;
  billing_state: string;
  billing_zip: string;
  notes: string;
}

const initialForm: FormData = {
  name: "",
  type: "RESIDENTIAL",
  status: "PROSPECT",
  email: "",
  phone: "",
  lead_source: "",
  assigned_to_id: "",
  billing_address_line1: "",
  billing_address_line2: "",
  billing_city: "",
  billing_state: "",
  billing_zip: "",
  notes: "",
};

export default function NewAccountPage() {
  const [form, setForm] = useState<FormData>(initialForm);
  const [leadSources, setLeadSources] = useState<LeadSource[]>([]);
  const [sellers, setSellers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadRefs() {
      const [{ data: lsData }, { data: sellersData }] = await Promise.all([
        supabase().from("lead_sources").select("*").eq("is_active", true).order("name"),
        supabase()
          .from("profiles")
          .select("*")
          .in("role", ["seller", "sales_manager"])
          .eq("status", "active"),
      ]);
      setLeadSources((lsData as LeadSource[]) ?? []);
      setSellers((sellersData as Profile[]) ?? []);
    }
    loadRefs();
  }, []);

  function update(field: keyof FormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("Customer name is required.");
      return;
    }
    setLoading(true);
    setError(null);

    const { data: { user } } = await supabase().auth.getUser();
    if (!user) {
      setError("Your session expired. Please sign in again.");
      setLoading(false);
      return;
    }

    const payload = {
      name: form.name.trim(),
      type: form.type || null,
      status: form.status || "PROSPECT",
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      lead_source: form.lead_source || null,
      assigned_to_id: form.assigned_to_id || null,
      billing_address_line1: form.billing_address_line1.trim() || null,
      billing_address_line2: form.billing_address_line2.trim() || null,
      billing_city: form.billing_city.trim() || null,
      billing_state: form.billing_state.trim() || null,
      billing_zip: form.billing_zip.trim() || null,
      notes: form.notes.trim() || null,
      created_by_id: user?.id ?? null,
    };

    const { data, error: insertError } = await supabase()
      .from("accounts")
      .insert(payload)
      .select("id")
      .single();

    setLoading(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    window.location.href = `/accounts/${data.id}/`;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => window.history.back()}
          className="rounded-lg p-2 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>
        <div>
          <h1 className="text-2xl font-bold text-zinc-50">New Customer</h1>
          <p className="mt-0.5 text-sm text-zinc-500">Add a new customer account.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        <Card>
          <CardContent className="space-y-5">
            <h2 className="text-sm font-semibold text-zinc-200">Basic Information</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Input
                  label="Name *"
                  value={form.name}
                  onChange={(e) => update("name", e.target.value)}
                  placeholder="John Smith"
                  required
                />
              </div>
              <Select
                label="Type"
                value={form.type}
                onChange={(e) => update("type", e.target.value)}
                options={[
                  { value: "RESIDENTIAL", label: "Residential" },
                  { value: "COMMERCIAL", label: "Commercial" },
                  { value: "MULTIFAMILY", label: "Multi-Family" },
                ]}
              />
              <Select
                label="Status"
                value={form.status}
                onChange={(e) => update("status", e.target.value)}
                options={[
                  { value: "PROSPECT", label: "Prospect" },
                  { value: "ACTIVE", label: "Active" },
                  { value: "INACTIVE", label: "Inactive" },
                ]}
              />
              <Input
                label="Email"
                type="email"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                placeholder="john@example.com"
              />
              <Input
                label="Phone"
                type="tel"
                value={form.phone}
                onChange={(e) => update("phone", e.target.value)}
                placeholder="(555) 000-0000"
              />
              <Select
                label="Lead Source"
                value={form.lead_source}
                onChange={(e) => update("lead_source", e.target.value)}
                placeholder="Select source…"
                options={leadSources.map((ls) => ({ value: ls.value, label: ls.name }))}
              />
              <Select
                label="Assigned To"
                value={form.assigned_to_id}
                onChange={(e) => update("assigned_to_id", e.target.value)}
                placeholder="Unassigned"
                options={sellers.map((s) => ({ value: s.id, label: s.name }))}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-5">
            <h2 className="text-sm font-semibold text-zinc-200">Billing Address</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Input
                  label="Address Line 1"
                  value={form.billing_address_line1}
                  onChange={(e) => update("billing_address_line1", e.target.value)}
                  placeholder="123 Main St"
                />
              </div>
              <div className="sm:col-span-2">
                <Input
                  label="Address Line 2"
                  value={form.billing_address_line2}
                  onChange={(e) => update("billing_address_line2", e.target.value)}
                  placeholder="Apt, suite, etc."
                />
              </div>
              <Input
                label="City"
                value={form.billing_city}
                onChange={(e) => update("billing_city", e.target.value)}
                placeholder="Columbus"
              />
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="State"
                  value={form.billing_state}
                  onChange={(e) => update("billing_state", e.target.value)}
                  placeholder="OH"
                  maxLength={2}
                />
                <Input
                  label="ZIP"
                  value={form.billing_zip}
                  onChange={(e) => update("billing_zip", e.target.value)}
                  placeholder="43215"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4">
            <h2 className="text-sm font-semibold text-zinc-200">Notes</h2>
            <textarea
              value={form.notes}
              onChange={(e) => update("notes", e.target.value)}
              placeholder="Any notes about this customer…"
              rows={4}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950/80 px-4 py-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-brand focus:ring-2 focus:ring-brand/30"
            />
          </CardContent>
        </Card>

        <div className="flex items-center justify-end gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={() => window.history.back()}
          >
            Cancel
          </Button>
          <Button type="submit" loading={loading}>
            Create Customer
          </Button>
        </div>
      </form>
    </div>
  );
}
