"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { Table } from "@/components/ui/Table";
import type { Column } from "@/components/ui/Table";

interface UserProfile {
  id: string;
  email: string;
  name: string;
  phone?: string | null;
  role: string;
  status: string;
  department_id?: string | null;
  created_at: string;
  department?: { name: string } | null;
}

interface Department {
  id: string;
  name: string;
}

const roleVariant: Record<string, "blue" | "purple" | "green" | "orange" | "teal"> = {
  owner: "purple",
  admin: "blue",
  sales_manager: "teal",
  seller: "green",
  finance: "orange",
};

const statusVariant: Record<string, "green" | "red" | "gray"> = {
  active: "green",
  inactive: "red",
  deleted: "gray",
};

export default function UsersPage() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editUser, setEditUser] = useState<Partial<UserProfile & { password: string }> | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const [{ data: u }, { data: d }] = await Promise.all([
      supabase().from("profiles").select("*, department:department_id(name)").order("name"),
      supabase().from("departments").select("id, name").eq("is_active", true).order("name"),
    ]);
    setUsers((u as UserProfile[]) ?? []);
    setDepartments((d as Department[]) ?? []);
    setLoading(false);
  }

  function openNew() {
    setEditUser({ name: "", email: "", password: "", role: "seller", status: "active", department_id: null, phone: "" });
    setErrors({});
    setSaveError(null);
    setModalOpen(true);
  }

  function openEdit(u: UserProfile) {
    setEditUser({ ...u, password: "" });
    setErrors({});
    setSaveError(null);
    setModalOpen(true);
  }

  async function handleSave() {
    if (!editUser) return;
    const errs: Record<string, string> = {};
    if (!editUser.name?.trim()) errs.name = "Name is required";
    if (!editUser.email?.trim()) errs.email = "Email is required";
    if (!(editUser as UserProfile).id && !editUser.password?.trim()) errs.password = "Password is required for new users";
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setSaving(true);
    setSaveError(null);

    const profilePayload = {
      name: editUser.name,
      phone: editUser.phone || null,
      role: editUser.role ?? "seller",
      status: editUser.status ?? "active",
      department_id: editUser.department_id || null,
    };

    if ((editUser as UserProfile).id) {
      // Update existing profile
      await supabase().from("profiles").update(profilePayload).eq("id", (editUser as UserProfile).id);
    } else {
      // Note: In production, admin user creation requires service role key
      // We create the profile directly — the auth user must be created via Supabase dashboard or service role
      const { error } = await supabase().from("profiles").insert({
        ...profilePayload,
        email: editUser.email,
      });
      if (error) {
        setSaveError(error.message);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    setModalOpen(false);
    loadAll();
  }

  const columns: Column<UserProfile>[] = [
    {
      key: "name",
      header: "Name",
      render: (row) => (
        <div>
          <p className="font-medium text-zinc-100">{row.name}</p>
          <p className="text-xs text-zinc-500">{row.email}</p>
        </div>
      ),
    },
    {
      key: "role",
      header: "Role",
      render: (row) => (
        <Badge variant={roleVariant[row.role] ?? "gray"}>{row.role.replace("_", " ")}</Badge>
      ),
    },
    {
      key: "department",
      header: "Department",
      render: (row) => (
        <span className="text-zinc-400">{(row.department as { name?: string } | null)?.name ?? "—"}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <Badge variant={statusVariant[row.status] ?? "gray"}>{row.status}</Badge>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-50">Users</h1>
          <p className="mt-1 text-sm text-zinc-500">Manage team member access and roles.</p>
        </div>
        <Button
          leftIcon={<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>}
          onClick={openNew}
        >
          Add User
        </Button>
      </div>

      <div className="rounded-xl border border-amber-800/30 bg-amber-950/20 px-4 py-3 text-sm text-amber-300">
        Note: Creating new auth users requires a Supabase Admin API call (service role). Use the Supabase dashboard to create auth users, then they will appear here after first login.
      </div>

      <Card>
        <Table columns={columns} data={users} loading={loading} keyExtractor={(r) => r.id} onRowClick={openEdit} emptyMessage="No users found." />
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={(editUser as UserProfile)?.id ? "Edit User" : "Add User"}>
        {editUser && (
          <div className="space-y-4">
            <Input label="Full Name *" value={editUser.name ?? ""} onChange={(e) => setEditUser((u) => ({ ...u!, name: e.target.value }))} error={errors.name} />
            <Input
              label="Email *"
              type="email"
              value={editUser.email ?? ""}
              onChange={(e) => setEditUser((u) => ({ ...u!, email: e.target.value }))}
              error={errors.email}
              disabled={!!(editUser as UserProfile).id}
            />
            {!(editUser as UserProfile).id && (
              <Input label="Password *" type="password" value={(editUser as { password?: string }).password ?? ""} onChange={(e) => setEditUser((u) => ({ ...u!, password: e.target.value }))} error={errors.password} />
            )}
            <Input label="Phone" value={editUser.phone ?? ""} onChange={(e) => setEditUser((u) => ({ ...u!, phone: e.target.value }))} />
            <Select
              label="Role"
              value={editUser.role ?? "seller"}
              onChange={(e) => setEditUser((u) => ({ ...u!, role: e.target.value }))}
              options={[
                { value: "owner", label: "Owner" },
                { value: "admin", label: "Admin" },
                { value: "sales_manager", label: "Sales Manager" },
                { value: "seller", label: "Seller" },
                { value: "finance", label: "Finance" },
              ]}
            />
            <Select
              label="Department"
              value={editUser.department_id ?? ""}
              onChange={(e) => setEditUser((u) => ({ ...u!, department_id: e.target.value || null }))}
              placeholder="No department"
              options={departments.map((d) => ({ value: d.id, label: d.name }))}
            />
            <Select
              label="Status"
              value={editUser.status ?? "active"}
              onChange={(e) => setEditUser((u) => ({ ...u!, status: e.target.value }))}
              options={[
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
              ]}
            />
            {saveError && (
              <div className="rounded-xl border border-red-800/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
                {saveError}
              </div>
            )}
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
