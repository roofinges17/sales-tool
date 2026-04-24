"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Select } from "@/components/ui/Select";
import { Card, CardContent } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";

interface Department {
  id: string;
  name: string;
}

interface WorkflowStage {
  id: string;
  name: string;
  color?: string | null;
  sort_order: number;
}

interface SaleCard {
  id: string;
  name: string;
  contract_number?: string | null;
  contract_value: number;
  workflow_stage_id?: string | null;
  account?: { name: string } | null;
  primary_seller?: { name: string } | null;
}

function formatCurrency(v: number | null | undefined) {
  if (v == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);
}

export default function PipelinePage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDeptId, setSelectedDeptId] = useState("");
  const [stages, setStages] = useState<WorkflowStage[]>([]);
  const [sales, setSales] = useState<SaleCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [noWorkflow, setNoWorkflow] = useState(false);

  useEffect(() => {
    supabase()
      .from("departments")
      .select("id, name")
      .eq("is_active", true)
      .order("name")
      .then(({ data, error }) => {
        if (error) console.error("[Pipeline] departments load failed:", error);
        const depts = (data as Department[]) ?? [];
        setDepartments(depts);
        if (depts.length > 0) setSelectedDeptId(depts[0].id);
      });
  }, []);

  useEffect(() => {
    if (!selectedDeptId) return;
    loadPipeline(selectedDeptId);
  }, [selectedDeptId]);

  async function loadPipeline(deptId: string) {
    setLoading(true);
    setNoWorkflow(false);

    // Find workflow template for dept
    const { data: templates } = await supabase()
      .from("workflow_templates")
      .select("id")
      .eq("department_id", deptId)
      .eq("is_active", true)
      .limit(1);

    if (!templates?.length) {
      setStages([]);
      setSales([]);
      setNoWorkflow(true);
      setLoading(false);
      return;
    }

    const templateId = (templates[0] as { id: string }).id;

    const [{ data: stagesData }, { data: salesData }] = await Promise.all([
      supabase()
        .from("workflow_stages")
        .select("*")
        .eq("template_id", templateId)
        .eq("is_active", true)
        .order("sort_order"),
      supabase()
        .from("sales")
        .select("id, name, contract_number, contract_value, workflow_stage_id, account:account_id(name), primary_seller:primary_seller_id(name)")
        .eq("department_id", deptId)
        .not("status", "eq", "CANCELLED")
        .order("created_at", { ascending: false }),
    ]);

    setStages((stagesData as WorkflowStage[]) ?? []);
    setSales((salesData as unknown as SaleCard[]) ?? []);
    setLoading(false);
  }

  const salesByStage = (stageId: string) =>
    sales.filter((s) => s.workflow_stage_id === stageId);

  const unassigned = sales.filter((s) => !s.workflow_stage_id);

  if (departments.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-50">Pipeline</h1>
          <p className="mt-1 text-sm text-zinc-500">Kanban view of your sales pipeline.</p>
        </div>
        <Card>
          <CardContent className="py-16">
            <EmptyState
              title="No departments configured"
              description="Go to Admin Settings to add departments first."
              action={{ label: "Go to Settings", onClick: () => { window.location.href = "/admin/settings/departments/"; } }}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-50">Pipeline</h1>
          <p className="mt-1 text-sm text-zinc-500">Kanban view of contracts by workflow stage.</p>
        </div>
        <div className="w-48">
          <Select
            value={selectedDeptId}
            onChange={(e) => setSelectedDeptId(e.target.value)}
            placeholder="Select department"
            options={departments.map((d) => ({ value: d.id, label: d.name }))}
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-zinc-500">
          <svg className="mr-2 h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading pipeline…
        </div>
      ) : noWorkflow ? (
        <Card>
          <CardContent className="py-16">
            <EmptyState
              title="No workflow configured"
              description="Set up a workflow for this department to use the Pipeline view."
              action={{ label: "Go to Workflows", onClick: () => { window.location.href = "/admin/settings/workflows/"; } }}
            />
          </CardContent>
        </Card>
      ) : sales.length === 0 && stages.length > 0 ? (
        <Card>
          <CardContent className="py-16">
            <EmptyState
              title="No contracts in the pipeline"
              description="Contracts you create will appear here as Kanban cards, organized by workflow stage."
              action={{ label: "Create an Estimate", onClick: () => { window.location.href = "/quotes/builder/"; } }}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-4 min-w-max">
            {stages.map((stage) => {
              const stageSales = salesByStage(stage.id);
              return (
                <div key={stage.id} className="w-72 shrink-0">
                  {/* Column header */}
                  <div
                    className="rounded-xl px-3 py-2 mb-3 flex items-center justify-between"
                    style={{
                      background: stage.color ? `${stage.color}18` : "#1a1a1a",
                      borderLeft: `3px solid ${stage.color ?? "#3f3f46"}`,
                    }}
                  >
                    <span className="text-sm font-semibold" style={{ color: stage.color ?? "#a1a1aa" }}>
                      {stage.name}
                    </span>
                    <span className="text-xs text-zinc-500 bg-zinc-900 rounded-full px-2 py-0.5">
                      {stageSales.length}
                    </span>
                  </div>

                  {/* Cards */}
                  <div className="space-y-2">
                    {stageSales.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-zinc-800 py-6 text-center text-xs text-zinc-600">
                        Empty
                      </div>
                    ) : (
                      stageSales.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => { window.location.href = `/sales/detail/?id=${s.id}`; }}
                          className="w-full text-left rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 transition hover:border-zinc-600 hover:bg-zinc-800/60"
                        >
                          <p className="text-sm font-medium text-zinc-100 truncate">{s.contract_number ?? s.name}</p>
                          <p className="text-xs text-zinc-400 mt-0.5 truncate">
                            {(s.account as { name?: string } | null)?.name ?? "No customer"}
                          </p>
                          <div className="mt-2 flex items-center justify-between">
                            <span className="text-xs text-zinc-500">
                              {(s.primary_seller as { name?: string } | null)?.name ?? "Unassigned"}
                            </span>
                            <span className="text-sm font-semibold text-zinc-200">
                              {formatCurrency(s.contract_value)}
                            </span>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              );
            })}

            {/* Unassigned column */}
            {unassigned.length > 0 && (
              <div className="w-72 shrink-0">
                <div className="rounded-xl px-3 py-2 mb-3 flex items-center justify-between bg-zinc-900 border-l-4 border-zinc-700">
                  <span className="text-sm font-semibold text-zinc-500">Unassigned</span>
                  <span className="text-xs text-zinc-600 bg-zinc-900 rounded-full px-2 py-0.5">{unassigned.length}</span>
                </div>
                <div className="space-y-2">
                  {unassigned.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => { window.location.href = `/sales/detail/?id=${s.id}`; }}
                      className="w-full text-left rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 transition hover:border-zinc-600"
                    >
                      <p className="text-sm font-medium text-zinc-100 truncate">{s.contract_number ?? s.name}</p>
                      <p className="text-xs text-zinc-400 mt-0.5 truncate">
                        {(s.account as { name?: string } | null)?.name ?? "No customer"}
                      </p>
                      <span className="text-sm font-semibold text-zinc-200 mt-2 block">
                        {formatCurrency(s.contract_value)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
