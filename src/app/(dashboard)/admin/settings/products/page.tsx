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
import { toast } from "sonner";

interface Department {
  id: string;
  name: string;
  code: string;
}

interface Product {
  id: string;
  name: string;
  code?: string | null;
  description?: string | null;
  product_type: "PRODUCT" | "SERVICE";
  price?: number | null;
  cost?: number | null;
  min_price?: number | null;
  max_price?: number | null;
  default_price?: number | null;
  unit?: string | null;
  is_active: boolean;
  department_id?: string | null;
  department?: { name: string } | null;
  created_at: string;
}

const emptyProduct = (): Omit<Product, "id" | "created_at"> => ({
  name: "",
  code: "",
  description: "",
  product_type: "PRODUCT",
  price: null,
  cost: null,
  min_price: null,
  max_price: null,
  default_price: null,
  unit: "",
  is_active: true,
  department_id: null,
});

function formatCurrency(v: number | null | undefined) {
  if (v == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<Partial<Product> | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteRefCount, setDeleteRefCount] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    const [{ data: prods }, { data: depts }] = await Promise.all([
      supabase().from("products").select("*, department:department_id(name)").order("name"),
      supabase().from("departments").select("id, name, code").eq("is_active", true).order("name"),
    ]);
    setProducts((prods as Product[]) ?? []);
    setDepartments((depts as Department[]) ?? []);
    setLoading(false);
  }

  const filtered = products.filter((p) => {
    const matchSearch =
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.code ?? "").toLowerCase().includes(search.toLowerCase());
    const matchDept = !deptFilter || p.department_id === deptFilter;
    return matchSearch && matchDept;
  });

  function openNew() {
    setEditProduct(emptyProduct());
    setErrors({});
    setDeleteConfirm(false);
    setDeleteRefCount(null);
    setModalOpen(true);
  }

  function openEdit(p: Product) {
    setEditProduct({ ...p });
    setErrors({});
    setDeleteConfirm(false);
    setDeleteRefCount(null);
    setModalOpen(true);
  }

  async function checkAndShowDelete() {
    const productId = (editProduct as Product)?.id;
    if (!productId) return;
    setDeleting(true);
    const { count } = await supabase()
      .from("quote_line_items")
      .select("id", { count: "exact", head: true })
      .eq("product_id", productId);
    setDeleting(false);
    setDeleteRefCount(count ?? 0);
    setDeleteConfirm(true);
  }

  async function handleDeactivate() {
    const productId = (editProduct as Product)?.id;
    if (!productId) return;
    setDeleting(true);
    const { error } = await supabase().from("products").update({ is_active: false }).eq("id", productId);
    setDeleting(false);
    if (error) { toast.error("Update failed: " + error.message); return; }
    toast.success("Product deactivated");
    setDeleteConfirm(false);
    setModalOpen(false);
    loadAll();
  }

  async function handleDelete() {
    const productId = (editProduct as Product)?.id;
    if (!productId) return;
    setDeleting(true);
    const { error } = await supabase().from("products").delete().eq("id", productId);
    setDeleting(false);
    if (error) { toast.error("Delete failed: " + error.message); return; }
    toast.success("Product deleted");
    setDeleteConfirm(false);
    setModalOpen(false);
    loadAll();
  }

  async function handleSave() {
    if (!editProduct) return;
    const errs: Record<string, string> = {};
    if (!editProduct.name?.trim()) errs.name = "Name is required";
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setSaving(true);
    const payload = {
      name: editProduct.name,
      code: editProduct.code || null,
      description: editProduct.description || null,
      product_type: editProduct.product_type ?? "PRODUCT",
      price: editProduct.price ?? null,
      cost: editProduct.cost ?? null,
      min_price: editProduct.min_price ?? null,
      max_price: editProduct.max_price ?? null,
      default_price: editProduct.default_price ?? null,
      unit: editProduct.unit || null,
      is_active: editProduct.is_active ?? true,
      department_id: editProduct.department_id || null,
    };

    if ((editProduct as Product).id) {
      const { error } = await supabase().from("products").update(payload).eq("id", (editProduct as Product).id);
      if (error) { toast.error("Save failed: " + error.message); setSaving(false); return; }
    } else {
      const { error } = await supabase().from("products").insert(payload);
      if (error) { toast.error("Save failed: " + error.message); setSaving(false); return; }
    }
    toast.success("Saved");
    setSaving(false);
    setModalOpen(false);
    loadAll();
  }

  async function toggleActive(p: Product) {
    const { error } = await supabase().from("products").update({ is_active: !p.is_active }).eq("id", p.id);
    if (error) { toast.error("Update failed: " + error.message); return; }
    setProducts((prev) => prev.map((x) => x.id === p.id ? { ...x, is_active: !x.is_active } : x));
  }

  const columns: Column<Product>[] = [
    {
      key: "name",
      header: "Name",
      render: (row) => (
        <div>
          <p className="font-medium text-zinc-100">{row.name}</p>
          {row.code && <p className="text-xs text-zinc-500">{row.code}</p>}
        </div>
      ),
    },
    {
      key: "type",
      header: "Type",
      render: (row) => (
        <Badge variant={row.product_type === "PRODUCT" ? "blue" : "orange"}>
          {row.product_type}
        </Badge>
      ),
    },
    {
      key: "default_price",
      header: "Default Price",
      render: (row) => <span className="text-zinc-200">{formatCurrency(row.default_price ?? row.price)}</span>,
    },
    {
      key: "cost",
      header: "Cost",
      render: (row) => <span className="text-zinc-400">{formatCurrency(row.cost)}</span>,
    },
    {
      key: "min_price",
      header: "Min Price",
      render: (row) => <span className="text-zinc-400">{formatCurrency(row.min_price)}</span>,
    },
    {
      key: "unit",
      header: "Unit",
      render: (row) => <span className="text-zinc-400">{row.unit ?? "—"}</span>,
    },
    {
      key: "department",
      header: "Dept",
      render: (row) => (
        <span className="text-zinc-400">
          {(row.department as { name?: string } | null)?.name ?? "—"}
        </span>
      ),
    },
    {
      key: "is_active",
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
          <h1 className="text-2xl font-bold text-zinc-50">Product Catalog</h1>
          <p className="mt-1 text-sm text-zinc-500">Manage products and services in your catalog.</p>
        </div>
        <Button
          leftIcon={<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>}
          onClick={openNew}
        >
          New Product
        </Button>
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-3 p-4 border-b border-zinc-800">
          <div className="flex-1 min-w-[200px]">
            <Input
              placeholder="Search by name or code…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="w-48">
            <Select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              placeholder="All departments"
              options={departments.map((d) => ({ value: d.id, label: d.name }))}
            />
          </div>
        </div>
        <Table
          columns={columns}
          data={filtered}
          loading={loading}
          keyExtractor={(r) => r.id}
          onRowClick={openEdit}
          emptyMessage="No products found."
        />
        <div className="px-6 py-3 text-xs text-zinc-500 border-t border-zinc-800">
          {filtered.length} of {products.length} products
        </div>
      </Card>

      {/* Product Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={(editProduct as Product)?.id ? "Edit Product" : "New Product"}
        maxWidth="max-w-2xl"
      >
        {editProduct && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Input
                  label="Name *"
                  value={editProduct.name ?? ""}
                  onChange={(e) => setEditProduct((p) => ({ ...p!, name: e.target.value }))}
                  error={errors.name}
                />
              </div>
              <Input
                label="Code / SKU"
                value={editProduct.code ?? ""}
                onChange={(e) => setEditProduct((p) => ({ ...p!, code: e.target.value }))}
              />
              <Select
                label="Type"
                value={editProduct.product_type ?? "PRODUCT"}
                onChange={(e) => setEditProduct((p) => ({ ...p!, product_type: e.target.value as "PRODUCT" | "SERVICE" }))}
                options={[
                  { value: "PRODUCT", label: "Product" },
                  { value: "SERVICE", label: "Service" },
                ]}
              />
            </div>

            <Select
              label="Department"
              value={editProduct.department_id ?? ""}
              onChange={(e) => setEditProduct((p) => ({ ...p!, department_id: e.target.value || null }))}
              placeholder="No department"
              options={departments.map((d) => ({ value: d.id, label: d.name }))}
            />

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Default Price ($)"
                type="number"
                step="0.01"
                value={editProduct.default_price ?? ""}
                onChange={(e) => setEditProduct((p) => ({ ...p!, default_price: e.target.value ? parseFloat(e.target.value) : null }))}
              />
              <Input
                label="Cost ($)"
                type="number"
                step="0.01"
                value={editProduct.cost ?? ""}
                onChange={(e) => setEditProduct((p) => ({ ...p!, cost: e.target.value ? parseFloat(e.target.value) : null }))}
              />
              <Input
                label="Min Price ($)"
                type="number"
                step="0.01"
                value={editProduct.min_price ?? ""}
                onChange={(e) => setEditProduct((p) => ({ ...p!, min_price: e.target.value ? parseFloat(e.target.value) : null }))}
              />
              <Input
                label="Max Price ($)"
                type="number"
                step="0.01"
                value={editProduct.max_price ?? ""}
                onChange={(e) => setEditProduct((p) => ({ ...p!, max_price: e.target.value ? parseFloat(e.target.value) : null }))}
              />
              <Input
                label="Unit (sq, ft, ea…)"
                value={editProduct.unit ?? ""}
                onChange={(e) => setEditProduct((p) => ({ ...p!, unit: e.target.value }))}
              />
            </div>

            <div>
              <label className="text-sm font-medium text-zinc-300">Description</label>
              <textarea
                rows={3}
                className="mt-1.5 w-full rounded-xl border border-zinc-700 bg-zinc-950/80 px-4 py-2.5 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-brand focus:ring-2 focus:ring-brand/30"
                value={editProduct.description ?? ""}
                onChange={(e) => setEditProduct((p) => ({ ...p!, description: e.target.value }))}
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setEditProduct((p) => ({ ...p!, is_active: !p!.is_active }))}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${editProduct.is_active ? "bg-green-500" : "bg-zinc-700"}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${editProduct.is_active ? "translate-x-5" : "translate-x-0.5"}`} />
              </button>
              <span className="text-sm text-zinc-300">Active</span>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
              {(editProduct as Product)?.id ? (
                deleteConfirm ? (
                  <div className="space-y-2">
                    {(deleteRefCount ?? 0) > 0 ? (
                      <p className="text-sm text-amber-400">
                        Used in {deleteRefCount} line item{deleteRefCount === 1 ? "" : "s"} across quotes — deactivating preserves history.
                      </p>
                    ) : (
                      <p className="text-sm text-zinc-400">Not used in any quotes. Safe to delete.</p>
                    )}
                    <div className="flex items-center gap-2">
                      <Button variant="secondary" loading={deleting} onClick={handleDeactivate}>Deactivate</Button>
                      <Button variant="danger" loading={deleting} onClick={handleDelete}>Delete Anyway</Button>
                      <Button variant="secondary" onClick={() => setDeleteConfirm(false)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <Button variant="danger" loading={deleting} onClick={checkAndShowDelete}>Delete</Button>
                )
              ) : <span />}
              <div className="flex gap-3">
                <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
                <Button onClick={handleSave} loading={saving}>
                  {saving ? "Saving…" : "Save Product"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
