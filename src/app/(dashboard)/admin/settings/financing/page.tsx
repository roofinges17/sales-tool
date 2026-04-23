"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Table } from "@/components/ui/Table";
import type { Column } from "@/components/ui/Table";

interface FinancingPlan {
  id: string;
  name: string;
  provider_id: string;
  provider_name: string;
  term_months: number;
  apr: number;
  dealer_fee_percentage: number;
  is_active: boolean;
  created_at: string;
}

const emptyPlan = (): Omit<FinancingPlan, "id" | "created_at"> => ({
  name: "",
  provider_id: "",
  provider_name: "",
  term_months: 60,
  apr: 9.99,
  dealer_fee_percentage: 3.0,
  is_active: true,
});

export default function FinancingPage() {
  const [plans, setPlans] = useState<FinancingPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editPlan, setEditPlan] = useState<Partial<FinancingPlan> | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase().from("financing_plans").select("*").order("provider_name");
    setPlans((data as FinancingPlan[]) ?? []);
    setLoading(false);
  }

  function openNew() {
    setEditPlan(emptyPlan());
    setErrors({});
    setModalOpen(true);
  }

  function openEdit(p: FinancingPlan) {
    setEditPlan({ ...p });
    setErrors({});
    setModalOpen(true);
  }

  async function handleSave() {
    if (!editPlan) return;
    const errs: Record<string, string> = {};
    if (!editPlan.name?.trim()) errs.name = "Plan name is required";
    if (!editPlan.provider_name?.trim()) errs.provider_name = "Provider name is required";
    if (!editPlan.term_months) errs.term_months = "Term is required";
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setSaving(true);
    const payload = {
      name: editPlan.name,
      provider_id: editPlan.provider_id || editPlan.provider_name?.toLowerCase().replace(/\s+/g, "_") || "",
      provider_name: editPlan.provider_name,
      term_months: editPlan.term_months,
      apr: editPlan.apr ?? 0,
      dealer_fee_percentage: editPlan.dealer_fee_percentage ?? 0,
      is_active: editPlan.is_active ?? true,
    };

    if ((editPlan as FinancingPlan).id) {
      await supabase().from("financing_plans").update(payload).eq("id", (editPlan as FinancingPlan).id);
    } else {
      await supabase().from("financing_plans").insert(payload);
    }
    setSaving(false);
    setModalOpen(false);
    load();
  }

  async function toggleActive(p: FinancingPlan) {
    await supabase().from("financing_plans").update({ is_active: !p.is_active }).eq("id", p.id);
    setPlans((prev) => prev.map((x) => x.id === p.id ? { ...x, is_active: !x.is_active } : x));
  }

  const columns: Column<FinancingPlan>[] = [
    {
      key: "provider",
      header: "Provider",
      render: (row) => <span className="font-medium text-zinc-100">{row.provider_name}</span>,
    },
    {
      key: "name",
      header: "Plan Name",
      render: (row) => <span className="text-zinc-300">{row.name}</span>,
    },
    {
      key: "term",
      header: "Term",
      render: (row) => <span className="text-zinc-400">{row.term_months} mo</span>,
    },
    {
      key: "apr",
      header: "APR",
      render: (row) => <span className="text-zinc-300">{row.apr}%</span>,
    },
    {
      key: "dealer_fee",
      header: "Dealer Fee",
      render: (row) => <span className="text-zinc-300">{row.dealer_fee_percentage}%</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (row) => <Badge variant={row.is_active ? "green" : "gray"}>{row.is_active ? "Active" : "Inactive"}</Badge>,
    },
    {
      key: "toggle",
      header: "",
      render: (row) => (
        <button
          onClick={(e) => { e.stopPropagation(); toggleActive(row); }}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${row.is_active ? "bg-green-500" : "bg-zinc-700"}`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${row.is_active ? "translate-x-5" : "translate-x-0.5"}`} />
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-50">Financing Plans</h1>
          <p className="mt-1 text-sm text-zinc-500">Manage available financing options.</p>
        </div>
        <Button
          leftIcon={<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>}
          onClick={openNew}
        >
          New Plan
        </Button>
      </div>

      <Card>
        <Table columns={columns} data={plans} loading={loading} keyExtractor={(r) => r.id} onRowClick={openEdit} emptyMessage="No financing plans configured." />
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={(editPlan as FinancingPlan)?.id ? "Edit Financing Plan" : "New Financing Plan"}>
        {editPlan && (
          <div className="space-y-4">
            <Input label="Provider Name *" value={editPlan.provider_name ?? ""} onChange={(e) => setEditPlan((p) => ({ ...p!, provider_name: e.target.value }))} error={errors.provider_name} />
            <Input label="Plan Name *" value={editPlan.name ?? ""} onChange={(e) => setEditPlan((p) => ({ ...p!, name: e.target.value }))} error={errors.name} hint="e.g. 60-Month Standard" />
            <div className="grid grid-cols-3 gap-4">
              <Input label="Term (months) *" type="number" value={editPlan.term_months ?? ""} onChange={(e) => setEditPlan((p) => ({ ...p!, term_months: parseInt(e.target.value) }))} error={errors.term_months} />
              <Input label="APR (%)" type="number" step="0.01" value={editPlan.apr ?? ""} onChange={(e) => setEditPlan((p) => ({ ...p!, apr: parseFloat(e.target.value) }))} />
              <Input label="Dealer Fee (%)" type="number" step="0.01" value={editPlan.dealer_fee_percentage ?? ""} onChange={(e) => setEditPlan((p) => ({ ...p!, dealer_fee_percentage: parseFloat(e.target.value) }))} />
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setEditPlan((p) => ({ ...p!, is_active: !p!.is_active }))}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${editPlan.is_active ? "bg-green-500" : "bg-zinc-700"}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${editPlan.is_active ? "translate-x-5" : "translate-x-0.5"}`} />
              </button>
              <span className="text-sm text-zinc-300">Active</span>
            </div>
            <div className="flex justify-end gap-3 pt-2 border-t border-zinc-800">
              <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} loading={saving}>Save</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
