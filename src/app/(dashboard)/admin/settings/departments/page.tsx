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

interface Department {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  color?: string | null;
  is_active: boolean;
  created_at: string;
  ghl_location_id?: string | null;
  ghl_api_key?: string | null;
}

const emptyDept = (): Omit<Department, "id" | "created_at"> => ({
  name: "",
  code: "",
  description: "",
  color: "#3b82f6",
  is_active: true,
});

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editDept, setEditDept] = useState<Partial<Department> | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase().from("departments").select("*").order("name");
    setDepartments((data as Department[]) ?? []);
    setLoading(false);
  }

  function openNew() {
    setEditDept(emptyDept());
    setErrors({});
    setDeleteConfirm(false);
    setModalOpen(true);
  }

  function openEdit(d: Department) {
    setEditDept({ ...d });
    setErrors({});
    setDeleteConfirm(false);
    setModalOpen(true);
  }

  async function handleDelete() {
    const deptId = (editDept as Department)?.id;
    if (!deptId) return;
    setDeleting(true);
    const { count } = await supabase()
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("department_id", deptId);
    if (count && count > 0) {
      toast.error(`Cannot delete: ${count} user${count !== 1 ? "s are" : " is"} assigned to this department.`);
      setDeleting(false);
      setDeleteConfirm(false);
      return;
    }
    const { error } = await supabase().from("departments").delete().eq("id", deptId);
    setDeleting(false);
    if (error) { toast.error("Delete failed: " + error.message); return; }
    toast.success("Department deleted");
    setDeleteConfirm(false);
    setModalOpen(false);
    load();
  }

  async function handleSave() {
    if (!editDept) return;
    const errs: Record<string, string> = {};
    if (!editDept.name?.trim()) errs.name = "Name is required";
    if (!editDept.code?.trim()) errs.code = "Code is required";
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setSaving(true);
    const payload = {
      name: editDept.name,
      code: editDept.code,
      description: editDept.description || null,
      color: editDept.color || null,
      is_active: editDept.is_active ?? true,
      ghl_location_id: editDept.ghl_location_id || null,
      ghl_api_key: editDept.ghl_api_key || null,
    };

    if ((editDept as Department).id) {
      const { error } = await supabase().from("departments").update(payload).eq("id", (editDept as Department).id);
      if (error) { toast.error("Save failed: " + error.message); setSaving(false); return; }
    } else {
      const { error } = await supabase().from("departments").insert(payload);
      if (error) { toast.error("Save failed: " + error.message); setSaving(false); return; }
    }
    toast.success("Saved");
    setSaving(false);
    setModalOpen(false);
    load();
  }

  async function toggleActive(d: Department) {
    const { error } = await supabase().from("departments").update({ is_active: !d.is_active }).eq("id", d.id);
    if (error) { toast.error("Update failed: " + error.message); return; }
    setDepartments((prev) => prev.map((x) => x.id === d.id ? { ...x, is_active: !x.is_active } : x));
  }

  const columns: Column<Department>[] = [
    {
      key: "name",
      header: "Name",
      render: (row) => (
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full" style={{ background: row.color ?? "#3f3f46" }} />
          <span className="font-medium text-zinc-100">{row.name}</span>
        </div>
      ),
    },
    { key: "code", header: "Code", render: (row) => <span className="text-zinc-400 font-mono text-xs">{row.code}</span> },
    { key: "description", header: "Description", render: (row) => <span className="text-zinc-500 text-sm">{row.description ?? "—"}</span> },
    {
      key: "status",
      header: "Status",
      render: (row) => <Badge variant={row.is_active ? "green" : "gray"}>{row.is_active ? "Active" : "Inactive"}</Badge>,
    },
    {
      key: "toggle",
      header: "Active",
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
          <h1 className="text-2xl font-bold text-zinc-50">Departments</h1>
          <p className="mt-1 text-sm text-zinc-500">Manage your business departments.</p>
        </div>
        <Button
          leftIcon={<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>}
          onClick={openNew}
        >
          New Department
        </Button>
      </div>

      <Card>
        <Table columns={columns} data={departments} loading={loading} keyExtractor={(r) => r.id} onRowClick={openEdit} emptyMessage="No departments yet." />
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={(editDept as Department)?.id ? "Edit Department" : "New Department"}>
        {editDept && (
          <div className="space-y-4">
            <Input label="Name *" value={editDept.name ?? ""} onChange={(e) => setEditDept((d) => ({ ...d!, name: e.target.value }))} error={errors.name} />
            <Input label="Code *" value={editDept.code ?? ""} onChange={(e) => setEditDept((d) => ({ ...d!, code: e.target.value.toUpperCase() }))} error={errors.code} hint="Short identifier, e.g. ROOF" />
            <div>
              <label className="text-sm font-medium text-zinc-300">Color</label>
              <div className="mt-1.5 flex items-center gap-3">
                <input
                  type="color"
                  value={editDept.color ?? "#3b82f6"}
                  onChange={(e) => setEditDept((d) => ({ ...d!, color: e.target.value }))}
                  className="h-10 w-16 rounded-lg border border-zinc-700 bg-zinc-950 cursor-pointer"
                />
                <span className="text-sm text-zinc-400 font-mono">{editDept.color ?? "#3b82f6"}</span>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-zinc-300">Description</label>
              <textarea
                rows={2}
                className="mt-1.5 w-full rounded-xl border border-zinc-700 bg-zinc-950/80 px-4 py-2.5 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-brand focus:ring-2 focus:ring-brand/30"
                value={editDept.description ?? ""}
                onChange={(e) => setEditDept((d) => ({ ...d!, description: e.target.value }))}
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setEditDept((d) => ({ ...d!, is_active: !d!.is_active }))}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${editDept.is_active ? "bg-green-500" : "bg-zinc-700"}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${editDept.is_active ? "translate-x-5" : "translate-x-0.5"}`} />
              </button>
              <span className="text-sm text-zinc-300">Active</span>
            </div>
            {/* GHL sub-account */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 space-y-3">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">GoHighLevel Sub-Account</p>
              <p className="text-xs text-zinc-500">Override the company-level GHL with a location-specific API key for this department.</p>
              <Input
                label="GHL Location ID"
                placeholder="GHL location ID"
                value={editDept.ghl_location_id ?? ""}
                onChange={(e) => setEditDept((d) => ({ ...d!, ghl_location_id: e.target.value }))}
              />
              <Input
                label="GHL API Key"
                placeholder="Location-level API key"
                value={editDept.ghl_api_key ?? ""}
                onChange={(e) => setEditDept((d) => ({ ...d!, ghl_api_key: e.target.value }))}
              />
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
              {(editDept as Department)?.id ? (
                deleteConfirm ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-zinc-400">Delete this department?</span>
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
