"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { Table, type Column } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { toast } from "sonner";

// Actual DB columns per information_schema (Phase 4 schema)
interface CommissionPlan {
  id: string;
  name: string;
  description: string | null;
  lead_source: string | null;
  department_id: string | null;
  manager_percentage: number;
  owner_percentage: number;
  seller_percentage: number;
  secondary_seller_percentage: number;
  company_percentage: number;
  primary_split_ratio: number;
  secondary_split_ratio: number;
  upfront_percentage: number | null;
  is_active: boolean;
  // joined
  departments?: { id: string; name: string } | null;
}

interface Department {
  id: string;
  name: string;
}

const EMPTY: Omit<CommissionPlan, "id" | "departments"> = {
  name: "",
  description: "",
  lead_source: "ALL",
  department_id: null,
  manager_percentage: 18,
  owner_percentage: 5,
  seller_percentage: 5,
  secondary_seller_percentage: 0,
  company_percentage: 72,
  primary_split_ratio: 70,
  secondary_split_ratio: 30,
  upfront_percentage: null,
  is_active: true,
};

const LEAD_SOURCE_OPTIONS = [
  { value: "ALL", label: "ALL (default)" },
  { value: "Website", label: "Website" },
  { value: "Referral", label: "Referral" },
  { value: "Door Knock", label: "Door Knock" },
  { value: "Insurance Claim", label: "Insurance Claim" },
  { value: "Social Media", label: "Social Media" },
];

function pct(n: number | null | undefined) {
  return n != null ? `${Number(n).toFixed(1)}%` : "—";
}

export default function CommissionPlansPage() {
  const [plans, setPlans] = useState<CommissionPlan[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<CommissionPlan | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: plansData }, { data: deptData }] = await Promise.all([
      supabase()
        .from("commission_plans")
        .select("*, departments(id, name)")
        .order("name"),
      supabase().from("departments").select("id, name").eq("is_active", true).order("name"),
    ]);
    if (plansData) setPlans(plansData as CommissionPlan[]);
    if (deptData) setDepartments(deptData as Department[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    const firstDept = departments[0];
    setEditing({ id: "", ...EMPTY, department_id: firstDept?.id ?? null });
    setIsNew(true);
    setError(null);
  };

  const openEdit = (p: CommissionPlan) => {
    setEditing({ ...p });
    setIsNew(false);
    setError(null);
  };

  const close = () => { setEditing(null); setIsNew(false); setError(null); };

  function upd<K extends keyof CommissionPlan>(field: K, value: CommissionPlan[K]) {
    setEditing((prev) => {
      if (!prev) return prev;
      const next = { ...prev, [field]: value };
      if (field === "primary_split_ratio") {
        next.secondary_split_ratio = 100 - (value as number);
      }
      return next;
    });
  }

  const baseProfitTotal = editing
    ? Number(editing.manager_percentage) + Number(editing.owner_percentage) + Number(editing.seller_percentage) + Number(editing.company_percentage)
    : 0;
  const pctValid = Math.abs(baseProfitTotal - 100) < 0.01;

  const save = async () => {
    if (!editing || !pctValid) return;
    setSaving(true);
    setError(null);
    const payload = {
      name: editing.name.trim(),
      description: editing.description?.trim() || null,
      lead_source: editing.lead_source || "ALL",
      department_id: editing.department_id || null,
      manager_percentage: editing.manager_percentage,
      owner_percentage: editing.owner_percentage,
      seller_percentage: editing.seller_percentage,
      secondary_seller_percentage: editing.secondary_seller_percentage,
      company_percentage: editing.company_percentage,
      primary_split_ratio: editing.primary_split_ratio,
      secondary_split_ratio: editing.secondary_split_ratio,
      upfront_percentage: editing.upfront_percentage,
      is_active: editing.is_active,
    };
    const { error: err } = isNew
      ? await supabase().from("commission_plans").insert(payload)
      : await supabase().from("commission_plans").update(payload).eq("id", editing.id);
    if (err) { toast.error("Save failed: " + err.message); setError(err.message); setSaving(false); return; }
    toast.success("Saved");
    setSaving(false);
    close();
    load();
  };

  const remove = async () => {
    if (!editing) return;
    setSaving(true);
    const { error: err } = await supabase().from("commission_plans").delete().eq("id", editing.id);
    if (err) { toast.error("Update failed: " + err.message); setError(err.message); setSaving(false); return; }
    setSaving(false);
    close();
    load();
  };

  const deptOptions = departments.map((d) => ({ value: d.id, label: d.name }));

  const columns: Column<CommissionPlan>[] = [
    {
      key: "name", header: "Plan",
      render: (p) => (
        <div>
          <span className="font-medium text-zinc-100">{p.name}</span>
          {p.description && <p className="mt-0.5 text-xs text-zinc-500">{p.description}</p>}
        </div>
      ),
    },
    {
      key: "department_id", header: "Dept",
      render: (p) => (
        <span className="text-zinc-400">
          {(p.departments as { name?: string } | null)?.name ?? "—"}
        </span>
      ),
    },
    {
      key: "lead_source", header: "Lead Source",
      render: (p) => (
        <Badge variant={!p.lead_source || p.lead_source === "ALL" ? "default" : "blue"}>
          {p.lead_source ?? "ALL"}
        </Badge>
      ),
    },
    { key: "manager_percentage", header: "Manager", render: (p) => <span className="text-zinc-400">{pct(p.manager_percentage)}</span> },
    { key: "owner_percentage",   header: "Owner",   render: (p) => <span className="text-zinc-400">{pct(p.owner_percentage)}</span> },
    { key: "seller_percentage",  header: "Seller",  render: (p) => <span className="text-zinc-400">{pct(p.seller_percentage)}</span> },
    { key: "company_percentage", header: "Company", render: (p) => <span className="text-zinc-400">{pct(p.company_percentage)}</span> },
    {
      key: "primary_split_ratio", header: "Split",
      render: (p) => <span className="text-xs text-zinc-500">{p.primary_split_ratio}/{p.secondary_split_ratio}</span>,
    },
    {
      key: "is_active", header: "",
      render: (p) => <Badge variant={p.is_active ? "green" : "red"}>{p.is_active ? "Active" : "Off"}</Badge>,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-50">Commission Plans</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Configure how base profit (Redline − Cost) is split. Seller always earns markup above redline.
          </p>
        </div>
        <Button onClick={openNew}>
          <svg className="mr-1.5 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Plan
        </Button>
      </div>

      {/* How it works */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand/10">
              <svg className="h-4 w-4 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="space-y-1.5 text-sm text-zinc-400">
              <p className="font-medium text-zinc-200">How commissions work</p>
              <p>
                <span className="font-medium text-emerald-400">Seller markup</span> — earned above redline (Sell Price − Redline). Not a percentage of base profit.
              </p>
              <p>
                <span className="font-medium text-brand">Manager, Owner, Seller %, Company</span> split the base profit (Redline − Cost) by the percentages below. Must total 100%.
              </p>
              <p>
                <span className="font-medium text-amber-400">When is commission paid?</span> On job completion. If an upfront payment is collected, each role gets their proportional share immediately.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table
            columns={columns}
            data={plans}
            loading={loading}
            keyExtractor={(p) => p.id}
            onRowClick={openEdit}
            emptyMessage="No commission plans yet. Run the seed migration to add defaults."
          />
        </CardContent>
      </Card>

      <Modal open={!!editing} onClose={close} title={isNew ? "New Commission Plan" : "Edit Commission Plan"} maxWidth="max-w-2xl">
        {editing && (
          <div className="space-y-6">
            {/* Basic info */}
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Plan Name"
                value={editing.name}
                onChange={(e) => upd("name", e.target.value)}
                placeholder="e.g. Standard Roofing"
              />
              <Select
                label="Department"
                value={editing.department_id ?? ""}
                onChange={(e) => upd("department_id", e.target.value || null)}
                options={[{ value: "", label: "— select dept —" }, ...deptOptions]}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Select
                label="Lead Source"
                value={editing.lead_source ?? "ALL"}
                onChange={(e) => upd("lead_source", e.target.value)}
                options={LEAD_SOURCE_OPTIONS}
              />
              <Input
                label="Description"
                value={editing.description ?? ""}
                onChange={(e) => upd("description", e.target.value)}
                placeholder="Optional"
              />
            </div>

            {/* Seller markup info */}
            <div className="rounded-xl border border-emerald-900/40 bg-emerald-950/20 p-4">
              <p className="mb-1 text-sm font-semibold text-emerald-400">Seller Markup (not a percentage)</p>
              <p className="text-sm text-zinc-400">
                Seller earns <span className="font-medium text-zinc-200">Sell Price − Redline</span> on every job. The percentages below only split base profit among management.
              </p>
            </div>

            {/* Base profit split */}
            <div>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Base Profit Split (Redline − Cost)</p>
                <span className={`text-xs font-medium ${pctValid ? "text-emerald-400" : "text-red-400"}`}>
                  Total: {baseProfitTotal.toFixed(1)}%{!pctValid && " (must = 100%)"}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-3">
                <Input label="Manager %" type="number" step="0.1"
                  value={editing.manager_percentage}
                  onChange={(e) => upd("manager_percentage", Number(e.target.value))} />
                <Input label="Owner %" type="number" step="0.1"
                  value={editing.owner_percentage}
                  onChange={(e) => upd("owner_percentage", Number(e.target.value))} />
                <Input label="Seller % (base)" type="number" step="0.1"
                  value={editing.seller_percentage}
                  onChange={(e) => upd("seller_percentage", Number(e.target.value))} />
                <Input label="Company %" type="number" step="0.1"
                  value={editing.company_percentage}
                  onChange={(e) => upd("company_percentage", Number(e.target.value))} />
              </div>
              <p className="mt-2 text-xs text-zinc-600">Must total 100%.</p>
            </div>

            {/* Seller split */}
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">Seller Split (two sellers on a deal)</p>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Primary Seller %" type="number"
                  value={editing.primary_split_ratio}
                  onChange={(e) => upd("primary_split_ratio", Number(e.target.value))} />
                <Input label="Secondary Seller %" type="number"
                  value={editing.secondary_split_ratio} disabled />
              </div>
            </div>

            <label className="flex cursor-pointer items-center gap-2">
              <input type="checkbox" checked={editing.is_active}
                onChange={(e) => upd("is_active", e.target.checked)}
                className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 text-brand" />
              <span className="text-sm text-zinc-200">Active</span>
            </label>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <div className="flex items-center justify-between border-t border-zinc-800 pt-4">
              <div>
                {!isNew && (
                  <Button variant="danger" onClick={remove} loading={saving}>Delete</Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={close}>Cancel</Button>
                <Button onClick={save} disabled={!pctValid || !editing.name.trim()} loading={saving}>
                  {isNew ? "Create" : "Save"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
