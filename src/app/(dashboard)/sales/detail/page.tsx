"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Tabs } from "@/components/ui/Tabs";
import { Modal } from "@/components/ui/Modal";
import { toast } from "sonner";
import { isUuid } from "@/lib/uuid";

interface SaleLineItem {
  id: string;
  product_name: string;
  product_sku?: string | null;
  quantity: number;
  unit_price: number;
  unit_cost?: number | null;
  line_total: number;
}

interface SalePayment {
  id: string;
  amount: number;
  payment_date: string;
  payment_method?: string | null;
  reference_number?: string | null;
  notes?: string | null;
}

interface WorkflowLog {
  id: string;
  from_stage?: { name: string } | null;
  to_stage: { name: string };
  moved_by_name?: string | null;
  notes?: string | null;
  created_at: string;
}

interface WorkflowStage {
  id: string;
  name: string;
  color?: string | null;
  sort_order: number;
}

interface CommissionEntry {
  id: string;
  amount: number;
  role: string;
  status: string;
  recipient?: { name: string } | null;
}

interface SaleDetail {
  id: string;
  name: string;
  contract_number?: string | null;
  status: "PENDING" | "ACTIVE" | "CANCELLED" | "COMPLETED";
  contract_value: number;
  subtotal?: number | null;
  discount_type?: string | null;
  discount_value?: number | null;
  discount_total?: number | null;
  tax_rate?: number | null;
  tax_amount?: number | null;
  financing_provider?: string | null;
  financing_term?: number | null;
  financing_rate?: number | null;
  monthly_payment?: number | null;
  cost_of_goods?: number | null;
  gross_profit?: number | null;
  contract_date?: string | null;
  notes?: string | null;
  created_at: string;
  account?: { id: string; name: string } | null;
  primary_seller?: { id: string; name: string } | null;
  department?: { id: string; name: string } | null;
  workflow_stage?: WorkflowStage | null;
  sale_line_items?: SaleLineItem[];
  sale_payments?: SalePayment[];
  commission_entries?: CommissionEntry[];
}

function formatCurrency(v: number | null | undefined) {
  if (v == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const statusVariant: Record<string, "gray" | "orange" | "blue" | "green" | "red"> = {
  PENDING: "orange",
  ACTIVE: "blue",
  COMPLETED: "green",
  CANCELLED: "red",
};

type TabKey = "overview" | "payments" | "workflow" | "commission";

function SaleDetailContent() {
  const searchParams = useSearchParams();
  const rawId = searchParams.get("id");
  const saleId = isUuid(rawId) ? rawId : null;
  const invalidId = rawId !== null && saleId === null;
  const { user } = useAuth();
  const [sale, setSale] = useState<SaleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [workflowLogs, setWorkflowLogs] = useState<WorkflowLog[]>([]);
  const [availableStages, setAvailableStages] = useState<WorkflowStage[]>([]);
  const [paymentModal, setPaymentModal] = useState(false);
  const [newPayment, setNewPayment] = useState({ amount: "", payment_date: new Date().toISOString().split("T")[0], payment_method: "CHECK", reference_number: "", notes: "" });
  const [savingPayment, setSavingPayment] = useState(false);
  const [movingStage, setMovingStage] = useState(false);
  const [selectedStageId, setSelectedStageId] = useState("");
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editModal, setEditModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editDraft, setEditDraft] = useState({ name: "", contract_date: "", status: "", notes: "", primary_seller_id: "", department_id: "" });
  const [editUsers, setEditUsers] = useState<Array<{ id: string; name: string }>>([]);
  const [editDepts, setEditDepts] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    if (!saleId) return;
    loadSale();
    loadWorkflowLogs();
  }, [saleId]);

  async function loadSale() {
    setLoading(true);
    const { data, error } = await supabase()
      .from("sales")
      .select("*, account:account_id(id, name), primary_seller:primary_seller_id(id, name), department:department_id(id, name), workflow_stage:workflow_stage_id(id, name, color, sort_order), sale_line_items(*), sale_payments(*), commission_entries(*, recipient:recipient_id(name))")
      .eq("id", saleId!)
      .single();
    if (error && error.code !== "PGRST116") toast.error("Failed to load contract: " + error.message);
    const s = data as SaleDetail | null;
    setSale(s);
    if (s?.department) {
      loadStages((s.department as { id: string }).id);
    }
    setLoading(false);
  }

  async function loadWorkflowLogs() {
    const { data, error } = await supabase()
      .from("workflow_logs")
      .select("*, from_stage:from_stage_id(name), to_stage:to_stage_id(name)")
      .eq("sale_id", saleId!)
      .order("created_at", { ascending: false });
    if (error) toast.error("Failed to load workflow history: " + error.message);
    setWorkflowLogs((data as WorkflowLog[]) ?? []);
  }

  async function loadStages(deptId: string) {
    const { data: templates, error: tmplErr } = await supabase()
      .from("workflow_templates")
      .select("id")
      .eq("department_id", deptId)
      .eq("is_active", true)
      .limit(1);
    if (tmplErr) { console.error("[sales/detail] workflow_templates load failed:", tmplErr.message); return; }
    if (!templates?.length) return;
    const { data: stages, error: stagesErr } = await supabase()
      .from("workflow_stages")
      .select("*")
      .eq("template_id", (templates[0] as { id: string }).id)
      .eq("is_active", true)
      .order("sort_order");
    if (stagesErr) { console.error("[sales/detail] workflow_stages load failed:", stagesErr.message); return; }
    setAvailableStages((stages as WorkflowStage[]) ?? []);
  }

  async function handleMoveStage() {
    if (!selectedStageId || !sale) return;
    setMovingStage(true);
    const currentStageId = (sale.workflow_stage as { id?: string } | null)?.id;
    const { error: stageErr } = await supabase().from("sales").update({ workflow_stage_id: selectedStageId }).eq("id", saleId!);
    if (stageErr) { toast.error("Failed to move stage: " + stageErr.message); setMovingStage(false); return; }
    const { error: logErr } = await supabase().from("workflow_logs").insert({
      sale_id: saleId,
      from_stage_id: currentStageId ?? null,
      to_stage_id: selectedStageId,
      moved_by_id: user?.id,
      moved_by_name: "You",
    });
    if (logErr) console.error("workflow_logs insert failed:", logErr.message);
    setSelectedStageId("");
    await loadSale();
    await loadWorkflowLogs();
    setMovingStage(false);
  }

  async function handleAddPayment() {
    setSavingPayment(true);
    await supabase().from("sale_payments").insert({
      sale_id: saleId,
      amount: parseFloat(newPayment.amount),
      payment_date: newPayment.payment_date,
      payment_method: newPayment.payment_method,
      reference_number: newPayment.reference_number || null,
      notes: newPayment.notes || null,
      recorded_by_id: user?.id,
    });
    setSavingPayment(false);
    setPaymentModal(false);
    setNewPayment({ amount: "", payment_date: new Date().toISOString().split("T")[0], payment_method: "CHECK", reference_number: "", notes: "" });
    loadSale();
  }

  async function openEditModal() {
    if (!sale) return;
    setEditDraft({
      name: sale.name,
      contract_date: sale.contract_date?.split("T")[0] ?? "",
      status: sale.status,
      notes: sale.notes ?? "",
      primary_seller_id: (sale.primary_seller as { id: string } | null)?.id ?? "",
      department_id: (sale.department as { id: string } | null)?.id ?? "",
    });
    if (editUsers.length === 0) {
      const [{ data: u }, { data: d }] = await Promise.all([
        supabase().from("users").select("id, name").order("name"),
        supabase().from("departments").select("id, name").eq("is_active", true).order("name"),
      ]);
      setEditUsers((u as Array<{ id: string; name: string }>) ?? []);
      setEditDepts((d as Array<{ id: string; name: string }>) ?? []);
    }
    setEditModal(true);
  }

  async function handleDelete() {
    if (!sale) return;
    if (sale.status === "COMPLETED") {
      toast.error("Cannot delete a completed contract.");
      setDeleteModal(false);
      return;
    }
    setDeleting(true);
    const { error } = await supabase().from("sales").delete().eq("id", sale.id);
    if (error) {
      toast.error(error.message ?? "Delete failed");
      setDeleting(false);
      return;
    }
    window.location.href = "/sales/";
  }

  async function handleSave() {
    if (!sale) return;
    setSaving(true);
    const { error } = await supabase()
      .from("sales")
      .update({
        name: editDraft.name.trim(),
        contract_date: editDraft.contract_date || null,
        status: editDraft.status as SaleDetail["status"],
        notes: editDraft.notes.trim() || null,
        primary_seller_id: editDraft.primary_seller_id || null,
        department_id: editDraft.department_id || null,
      })
      .eq("id", sale.id);
    if (error) {
      toast.error(error.message ?? "Save failed");
    } else {
      toast.success("Contract updated");
      setEditModal(false);
      await loadSale();
    }
    setSaving(false);
  }

  if (invalidId) {
    return (
      <div className="rounded-xl border border-amber-800/50 bg-amber-950/30 px-6 py-8 text-center">
        <p className="text-amber-300 font-medium">Invalid contract ID</p>
        <p className="text-sm text-zinc-400 mt-1">The link you followed doesn&apos;t point to a valid contract.</p>
        <a href="/sales/" className="text-brand text-sm hover:underline mt-3 inline-block">Back to Contracts</a>
      </div>
    );
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

  if (!sale) {
    return (
      <div className="text-center py-16">
        <p className="text-zinc-400">Contract not found.</p>
        <a href="/sales/" className="text-brand text-sm hover:underline mt-2 block">Back to Contracts</a>
      </div>
    );
  }

  const payments = (sale.sale_payments ?? []) as SalePayment[];
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const balance = (sale.contract_value ?? 0) - totalPaid;
  const lineItems = sale.sale_line_items ?? [];
  const commissions = sale.commission_entries ?? [];

  const tabList: Array<{ key: TabKey; label: string }> = [
    { key: "overview", label: "Overview" },
    { key: "payments", label: `Payments (${payments.length})` },
    { key: "workflow", label: "Workflow" },
    { key: "commission", label: "Commission" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <a href="/sales/" className="text-zinc-500 hover:text-zinc-300 text-sm">Contracts</a>
            <span className="text-zinc-700">/</span>
            <h1 className="text-2xl font-bold text-zinc-50">{sale.contract_number ?? sale.name}</h1>
            <Badge variant={statusVariant[sale.status] ?? "gray"}>{sale.status}</Badge>
            {sale.workflow_stage && (
              <span
                className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium"
                style={{
                  background: (sale.workflow_stage as WorkflowStage).color ? `${(sale.workflow_stage as WorkflowStage).color}22` : undefined,
                  borderColor: (sale.workflow_stage as WorkflowStage).color ? `${(sale.workflow_stage as WorkflowStage).color}44` : undefined,
                  color: (sale.workflow_stage as WorkflowStage).color ?? undefined,
                }}
              >
                {(sale.workflow_stage as WorkflowStage).name}
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-4 text-sm text-zinc-500 flex-wrap">
            <span>Client: <span className="text-zinc-300">{(sale.account as { name?: string } | null)?.name ?? "—"}</span></span>
            <span>Date: <span className="text-zinc-300">{formatDate(sale.contract_date)}</span></span>
            <span>Value: <span className="text-zinc-100 font-semibold">{formatCurrency(sale.contract_value)}</span></span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="secondary" onClick={openEditModal} title="Edit contract">
            <svg className="mr-1.5 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Edit
          </Button>
          <Button variant="danger" onClick={() => setDeleteModal(true)} title="Delete contract">
            <svg className="mr-1.5 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Delete
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Card>
        <div className="px-6 pt-4">
          <Tabs tabs={tabList} activeTab={activeTab} onChange={(k) => setActiveTab(k as TabKey)} />
        </div>

        {activeTab === "overview" && (
          <div className="p-6 space-y-6">
            {/* Line items */}
            <div>
              <h3 className="text-sm font-semibold text-zinc-300 mb-3">Line Items</h3>
              <div className="rounded-xl border border-zinc-800 overflow-hidden overflow-x-auto">
                <table className="w-full text-sm min-w-[320px]">
                  <thead className="border-b border-zinc-800 bg-zinc-900/60">
                    <tr className="text-xs uppercase tracking-wider text-zinc-500">
                      <th className="px-4 py-3 text-left">Item</th>
                      <th className="px-4 py-3 text-center w-16">Qty</th>
                      <th className="px-4 py-3 text-right w-28">Unit Price</th>
                      <th className="px-4 py-3 text-right w-28">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {lineItems.map((item) => (
                      <tr key={item.id}>
                        <td className="px-4 py-3 font-medium text-zinc-100">{item.product_name}</td>
                        <td className="px-4 py-3 text-center text-zinc-400">{item.quantity}</td>
                        <td className="px-4 py-3 text-right text-zinc-300">{formatCurrency(item.unit_price)}</td>
                        <td className="px-4 py-3 text-right font-medium text-zinc-100">{formatCurrency(item.line_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Financial summary */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                { label: "Contract Value", value: formatCurrency(sale.contract_value), color: "text-zinc-50" },
                { label: "Cost of Goods", value: formatCurrency(sale.cost_of_goods), color: "text-zinc-300" },
                { label: "Gross Profit", value: formatCurrency(sale.gross_profit), color: "text-green-400" },
                { label: "Balance Due", value: formatCurrency(balance), color: balance > 0 ? "text-orange-400" : "text-green-400" },
              ].map((stat) => (
                <Card key={stat.label}>
                  <CardContent className="py-4">
                    <p className="text-xs text-zinc-500">{stat.label}</p>
                    <p className={`text-xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {sale.financing_provider && (
              <div className="rounded-xl border border-brand/30 bg-brand/5 p-4">
                <p className="text-sm font-semibold text-brand mb-1">Financing</p>
                <p className="text-sm text-zinc-300">{sale.financing_provider} · {sale.financing_term} months · {sale.financing_rate}% APR</p>
                <p className="text-sm font-bold text-brand mt-1">{formatCurrency(sale.monthly_payment)}/month</p>
              </div>
            )}
          </div>
        )}

        {activeTab === "payments" && (
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-zinc-400">
                Paid: <span className="text-green-400 font-semibold">{formatCurrency(totalPaid)}</span>
                {" · "}Balance: <span className={balance > 0 ? "text-orange-400 font-semibold" : "text-green-400 font-semibold"}>{formatCurrency(balance)}</span>
              </div>
              <Button
                leftIcon={<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>}
                onClick={() => setPaymentModal(true)}
              >
                Add Payment
              </Button>
            </div>
            {payments.length === 0 ? (
              <p className="text-sm text-zinc-500 text-center py-8">No payments recorded yet.</p>
            ) : (
              <div className="rounded-xl border border-zinc-800 divide-y divide-zinc-800 bg-zinc-900/60">
                {payments.map((p) => (
                  <div key={p.id} className="px-4 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-zinc-100">{formatCurrency(p.amount)}</p>
                      <p className="text-xs text-zinc-500">{p.payment_method} · {formatDate(p.payment_date)}</p>
                    </div>
                    {p.reference_number && (
                      <span className="text-xs text-zinc-500">Ref: {p.reference_number}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "workflow" && (
          <div className="p-6 space-y-6">
            {availableStages.length > 0 && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-3">
                <p className="text-sm font-semibold text-zinc-300">Move to Stage</p>
                <div className="flex gap-3">
                  <Select
                    value={selectedStageId}
                    onChange={(e) => setSelectedStageId(e.target.value)}
                    placeholder="Select stage…"
                    options={availableStages.map((s) => ({ value: s.id, label: s.name }))}
                    className="flex-1"
                  />
                  <Button
                    onClick={handleMoveStage}
                    disabled={!selectedStageId}
                    loading={movingStage}
                  >
                    Move
                  </Button>
                </div>
              </div>
            )}

            {workflowLogs.length === 0 ? (
              <p className="text-sm text-zinc-500 text-center py-8">No workflow history yet.</p>
            ) : (
              <div className="space-y-2">
                {workflowLogs.map((log) => (
                  <div key={log.id} className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3 flex items-start gap-3">
                    <div className="mt-0.5 h-2 w-2 rounded-full bg-brand shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-zinc-200">
                        Moved to <span className="font-medium">{(log.to_stage as { name: string }).name}</span>
                        {(log.from_stage as { name?: string } | null)?.name && (
                          <span className="text-zinc-500"> from {(log.from_stage as { name: string }).name}</span>
                        )}
                      </p>
                      <p className="text-xs text-zinc-500 mt-0.5">{log.moved_by_name ?? "Unknown"} · {formatDate(log.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "commission" && (
          <div className="p-6 space-y-4">
            {commissions.length === 0 ? (
              <p className="text-sm text-zinc-500 text-center py-8">No commission entries.</p>
            ) : (
              <div className="rounded-xl border border-zinc-800 divide-y divide-zinc-800 bg-zinc-900/60">
                {commissions.map((c) => (
                  <div key={c.id} className="px-4 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-zinc-100">
                        {(c.recipient as { name?: string } | null)?.name ?? "Unknown"}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant={
                          c.role === "PRIMARY_SELLER" ? "blue" :
                          c.role === "MANAGER" ? "purple" :
                          "gray"
                        }>
                          {c.role.replace("_", " ")}
                        </Badge>
                        <Badge variant={c.status === "PAID" ? "green" : c.status === "PENDING" ? "orange" : "gray"}>
                          {c.status}
                        </Badge>
                      </div>
                    </div>
                    <span className="text-lg font-bold text-zinc-100">{formatCurrency(c.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Delete confirmation modal */}
      <Modal open={deleteModal} onClose={() => setDeleteModal(false)} title="Delete contract?" maxWidth="sm">
        <div className="space-y-4">
          <p className="text-sm text-zinc-300">
            Delete <span className="font-semibold text-zinc-100">{sale.contract_number ?? sale.name}</span> permanently? This cannot be undone.
            All payments, commission entries, and workflow history for this contract will also be deleted.
          </p>
          {sale.status === "COMPLETED" && (
            <div className="rounded-xl border border-amber-800/40 bg-amber-950/20 px-4 py-3 text-xs text-amber-300">
              This contract is marked as completed — it cannot be deleted.
            </div>
          )}
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setDeleteModal(false)}>Cancel</Button>
            <Button variant="danger" loading={deleting} onClick={handleDelete} disabled={sale.status === "COMPLETED"}>
              Delete permanently
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit modal */}
      <Modal open={editModal} onClose={() => setEditModal(false)} title={`Edit ${sale.contract_number ?? sale.name}`} maxWidth="md">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label htmlFor="sc-name" className="block text-xs font-medium text-zinc-400 mb-1">Name</label>
              <input
                id="sc-name"
                type="text"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-brand focus:ring-1 focus:ring-brand/30"
                value={editDraft.name}
                onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))}
              />
            </div>
            <div>
              <label htmlFor="sc-contract-date" className="block text-xs font-medium text-zinc-400 mb-1">Contract Date</label>
              <input
                id="sc-contract-date"
                type="date"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-brand focus:ring-1 focus:ring-brand/30"
                value={editDraft.contract_date}
                onChange={(e) => setEditDraft((d) => ({ ...d, contract_date: e.target.value }))}
              />
            </div>
            <div>
              <label htmlFor="sc-status" className="block text-xs font-medium text-zinc-400 mb-1">Status</label>
              <select
                id="sc-status"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-brand focus:ring-1 focus:ring-brand/30"
                value={editDraft.status}
                onChange={(e) => setEditDraft((d) => ({ ...d, status: e.target.value }))}
              >
                {["PENDING", "ACTIVE", "CANCELLED", "COMPLETED"].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="sc-seller" className="block text-xs font-medium text-zinc-400 mb-1">Primary Seller</label>
              <select
                id="sc-seller"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-brand focus:ring-1 focus:ring-brand/30"
                value={editDraft.primary_seller_id}
                onChange={(e) => setEditDraft((d) => ({ ...d, primary_seller_id: e.target.value }))}
              >
                <option value="">— Unassigned —</option>
                {editUsers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="sc-department" className="block text-xs font-medium text-zinc-400 mb-1">Department</label>
              <select
                id="sc-department"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-brand focus:ring-1 focus:ring-brand/30"
                value={editDraft.department_id}
                onChange={(e) => setEditDraft((d) => ({ ...d, department_id: e.target.value }))}
              >
                <option value="">— None —</option>
                {editDepts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label htmlFor="sc-notes" className="block text-xs font-medium text-zinc-400 mb-1">Notes</label>
              <textarea
                id="sc-notes"
                rows={3}
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-brand focus:ring-1 focus:ring-brand/30 placeholder:text-zinc-600"
                placeholder="Internal notes…"
                value={editDraft.notes}
                onChange={(e) => setEditDraft((d) => ({ ...d, notes: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setEditModal(false)}>Cancel</Button>
            <Button loading={saving} onClick={handleSave} disabled={!editDraft.name.trim()}>Save changes</Button>
          </div>
        </div>
      </Modal>

      {/* Payment Modal */}
      <Modal open={paymentModal} onClose={() => setPaymentModal(false)} title="Add Payment">
        <div className="space-y-4">
          <Input
            label="Amount ($)"
            type="number"
            step="0.01"
            value={newPayment.amount}
            onChange={(e) => setNewPayment((p) => ({ ...p, amount: e.target.value }))}
          />
          <Input
            label="Payment Date"
            type="date"
            value={newPayment.payment_date}
            onChange={(e) => setNewPayment((p) => ({ ...p, payment_date: e.target.value }))}
          />
          <Select
            label="Payment Method"
            value={newPayment.payment_method}
            onChange={(e) => setNewPayment((p) => ({ ...p, payment_method: e.target.value }))}
            options={[
              { value: "CASH", label: "Cash" },
              { value: "CHECK", label: "Check" },
              { value: "CREDIT_CARD", label: "Credit Card" },
              { value: "ACH", label: "ACH" },
              { value: "WIRE", label: "Wire" },
              { value: "FINANCING", label: "Financing" },
              { value: "OTHER", label: "Other" },
            ]}
          />
          <Input
            label="Reference # (optional)"
            value={newPayment.reference_number}
            onChange={(e) => setNewPayment((p) => ({ ...p, reference_number: e.target.value }))}
          />
          <div className="flex justify-end gap-3 pt-2 border-t border-zinc-800">
            <Button variant="secondary" onClick={() => setPaymentModal(false)}>Cancel</Button>
            <Button onClick={handleAddPayment} loading={savingPayment} disabled={!newPayment.amount}>
              Save Payment
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default function SaleDetailPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-16 text-zinc-500">
        <svg className="mr-2 h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Loading…
      </div>
    }>
      <SaleDetailContent />
    </Suspense>
  );
}
