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
import { toast } from "sonner";

interface LeadSource {
  id: string;
  name: string;
  value: string;
  seller_share_percent: number;
  is_active: boolean;
  created_at: string;
}

const emptySource = (): Omit<LeadSource, "id" | "created_at"> => ({
  name: "",
  value: "",
  seller_share_percent: 100,
  is_active: true,
});

export default function LeadSourcesPage() {
  const [sources, setSources] = useState<LeadSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editSource, setEditSource] = useState<Partial<LeadSource> | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase().from("lead_sources").select("*").order("name");
    setSources((data as LeadSource[]) ?? []);
    setLoading(false);
  }

  function openNew() {
    setEditSource(emptySource());
    setErrors({});
    setDeleteConfirm(false);
    setModalOpen(true);
  }

  function openEdit(s: LeadSource) {
    setEditSource({ ...s });
    setErrors({});
    setDeleteConfirm(false);
    setModalOpen(true);
  }

  async function handleDelete() {
    const sourceId = (editSource as LeadSource)?.id;
    if (!sourceId) return;
    setDeleting(true);
    const { error } = await supabase().from("lead_sources").delete().eq("id", sourceId);
    setDeleting(false);
    if (error) { toast.error("Delete failed: " + error.message); return; }
    toast.success("Lead source deleted");
    setDeleteConfirm(false);
    setModalOpen(false);
    load();
  }

  async function handleSave() {
    if (!editSource) return;
    const errs: Record<string, string> = {};
    if (!editSource.name?.trim()) errs.name = "Name is required";
    if (!editSource.value?.trim()) errs.value = "Value/slug is required";
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setSaving(true);
    const payload = {
      name: editSource.name,
      value: editSource.value?.toLowerCase().replace(/\s+/g, "_"),
      seller_share_percent: editSource.seller_share_percent ?? 100,
      is_active: editSource.is_active ?? true,
    };

    if ((editSource as LeadSource).id) {
      const { error } = await supabase().from("lead_sources").update(payload).eq("id", (editSource as LeadSource).id);
      if (error) { toast.error("Save failed: " + error.message); setSaving(false); return; }
    } else {
      const { error } = await supabase().from("lead_sources").insert(payload);
      if (error) { toast.error("Save failed: " + error.message); setSaving(false); return; }
    }
    toast.success("Saved");
    setSaving(false);
    setModalOpen(false);
    load();
  }

  async function toggleActive(s: LeadSource) {
    const { error } = await supabase().from("lead_sources").update({ is_active: !s.is_active }).eq("id", s.id);
    if (error) { toast.error("Update failed: " + error.message); return; }
    setSources((prev) => prev.map((x) => x.id === s.id ? { ...x, is_active: !x.is_active } : x));
  }

  const columns: Column<LeadSource>[] = [
    { key: "name", header: "Name", render: (row) => <span className="font-medium text-zinc-100">{row.name}</span> },
    { key: "value", header: "Value", render: (row) => <span className="text-zinc-400 font-mono text-xs">{row.value}</span> },
    { key: "seller_share", header: "Seller Share", render: (row) => <span className="text-zinc-300">{row.seller_share_percent}%</span> },
    { key: "status", header: "Status", render: (row) => <Badge variant={row.is_active ? "green" : "gray"}>{row.is_active ? "Active" : "Inactive"}</Badge> },
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
          <h1 className="text-2xl font-bold text-zinc-50">Lead Sources</h1>
          <p className="mt-1 text-sm text-zinc-500">Manage where your leads come from.</p>
        </div>
        <Button
          leftIcon={<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>}
          onClick={openNew}
        >
          New Lead Source
        </Button>
      </div>

      <Card>
        <Table columns={columns} data={sources} loading={loading} keyExtractor={(r) => r.id} onRowClick={openEdit} emptyMessage="No lead sources configured." />
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={(editSource as LeadSource)?.id ? "Edit Lead Source" : "New Lead Source"}>
        {editSource && (
          <div className="space-y-4">
            <Input
              label="Name *"
              value={editSource.name ?? ""}
              onChange={(e) => {
                const name = e.target.value;
                setEditSource((s) => ({
                  ...s!,
                  name,
                  value: (s!.value || !(s as LeadSource).id) ? name.toLowerCase().replace(/\s+/g, "_") : s!.value,
                }));
              }}
              error={errors.name}
            />
            <Input label="Value/Slug *" value={editSource.value ?? ""} onChange={(e) => setEditSource((s) => ({ ...s!, value: e.target.value.toLowerCase().replace(/\s+/g, "_") }))} error={errors.value} hint="Used as internal identifier" />
            <Input label="Seller Share (%)" type="number" min="0" max="100" value={editSource.seller_share_percent ?? 100} onChange={(e) => setEditSource((s) => ({ ...s!, seller_share_percent: parseFloat(e.target.value) }))} hint="How much of commission goes to seller (default 100%)" />
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setEditSource((s) => ({ ...s!, is_active: !s!.is_active }))}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${editSource.is_active ? "bg-green-500" : "bg-zinc-700"}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${editSource.is_active ? "translate-x-5" : "translate-x-0.5"}`} />
              </button>
              <span className="text-sm text-zinc-300">Active</span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
              {(editSource as LeadSource)?.id ? (
                deleteConfirm ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-zinc-400">Delete this lead source?</span>
                    <Button variant="danger" loading={deleting} onClick={handleDelete}>Confirm</Button>
                    <Button variant="secondary" onClick={() => setDeleteConfirm(false)}>Cancel</Button>
                  </div>
                ) : (
                  <Button variant="danger" onClick={() => setDeleteConfirm(true)}>Delete</Button>
                )
              ) : <span />}
              <div className="flex gap-3">
                <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
                <Button onClick={handleSave} loading={saving}>Save</Button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
