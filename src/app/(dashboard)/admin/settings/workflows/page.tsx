"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

interface Department {
  id: string;
  name: string;
}

interface WorkflowTemplate {
  id: string;
  name: string;
  department_id: string;
  is_active: boolean;
}

interface WorkflowStage {
  id: string;
  template_id: string;
  name: string;
  color?: string | null;
  description?: string | null;
  sort_order: number;
  is_terminal: boolean;
  is_active: boolean;
}

export default function WorkflowsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDeptId, setSelectedDeptId] = useState("");
  const [template, setTemplate] = useState<WorkflowTemplate | null>(null);
  const [stages, setStages] = useState<WorkflowStage[]>([]);
  const [loading, setLoading] = useState(false);
  const [newStageName, setNewStageName] = useState("");
  const [newStageColor, setNewStageColor] = useState("#3b82f6");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase()
      .from("departments")
      .select("id, name")
      .eq("is_active", true)
      .order("name")
      .then(({ data }) => {
        const depts = (data as Department[]) ?? [];
        setDepartments(depts);
        if (depts.length > 0) setSelectedDeptId(depts[0].id);
      });
  }, []);

  useEffect(() => {
    if (!selectedDeptId) return;
    loadWorkflow(selectedDeptId);
  }, [selectedDeptId]);

  async function loadWorkflow(deptId: string) {
    setLoading(true);
    const { data: templates } = await supabase()
      .from("workflow_templates")
      .select("*")
      .eq("department_id", deptId)
      .limit(1);

    const tmpl = templates?.[0] as WorkflowTemplate | undefined ?? null;
    setTemplate(tmpl);

    if (tmpl) {
      const { data: stagesData } = await supabase()
        .from("workflow_stages")
        .select("*")
        .eq("template_id", tmpl.id)
        .order("sort_order");
      setStages((stagesData as WorkflowStage[]) ?? []);
    } else {
      setStages([]);
    }
    setLoading(false);
  }

  async function createTemplate() {
    const dept = departments.find((d) => d.id === selectedDeptId);
    if (!dept) return;
    setSaving(true);
    const { data } = await supabase()
      .from("workflow_templates")
      .insert({ name: `${dept.name} Workflow`, department_id: selectedDeptId, is_active: true })
      .select()
      .single();
    setTemplate(data as WorkflowTemplate);
    setSaving(false);
  }

  async function addStage() {
    if (!newStageName.trim() || !template) return;
    setSaving(true);
    const newOrder = stages.length;
    const { data } = await supabase()
      .from("workflow_stages")
      .insert({
        template_id: template.id,
        name: newStageName.trim(),
        color: newStageColor,
        sort_order: newOrder,
        is_terminal: false,
        is_active: true,
      })
      .select()
      .single();
    setStages((prev) => [...prev, data as WorkflowStage]);
    setNewStageName("");
    setSaving(false);
  }

  async function updateStage(stage: WorkflowStage, updates: Partial<WorkflowStage>) {
    await supabase().from("workflow_stages").update(updates).eq("id", stage.id);
    setStages((prev) => prev.map((s) => s.id === stage.id ? { ...s, ...updates } : s));
  }

  async function deleteStage(stageId: string) {
    await supabase().from("workflow_stages").delete().eq("id", stageId);
    setStages((prev) => prev.filter((s) => s.id !== stageId));
  }

  async function moveStage(stageId: string, direction: "up" | "down") {
    const idx = stages.findIndex((s) => s.id === stageId);
    if (direction === "up" && idx === 0) return;
    if (direction === "down" && idx === stages.length - 1) return;

    const newStages = [...stages];
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    [newStages[idx], newStages[swapIdx]] = [newStages[swapIdx], newStages[idx]];

    // Update sort orders
    const updates = newStages.map((s, i) => ({ id: s.id, sort_order: i }));
    setStages(newStages.map((s, i) => ({ ...s, sort_order: i })));
    await Promise.all(updates.map((u) => supabase().from("workflow_stages").update({ sort_order: u.sort_order }).eq("id", u.id)));
  }

  if (departments.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-50">Workflows</h1>
          <p className="mt-1 text-sm text-zinc-500">Design the pipeline workflow stages for each department.</p>
        </div>
        <Card>
          <CardContent className="py-12 text-center text-zinc-500 text-sm">
            No departments yet. <a href="/admin/settings/departments/" className="text-brand hover:underline">Add departments first.</a>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-50">Workflows</h1>
          <p className="mt-1 text-sm text-zinc-500">Design pipeline stages for each department.</p>
        </div>
        <div className="w-48">
          <Select
            value={selectedDeptId}
            onChange={(e) => setSelectedDeptId(e.target.value)}
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
          Loading…
        </div>
      ) : !template ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-zinc-400 mb-4">No workflow configured for this department.</p>
            <Button onClick={createTemplate} loading={saving}>Create Workflow</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Existing stages */}
          {stages.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-zinc-500 text-sm">
                No stages yet. Add the first stage below.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {stages.map((stage, i) => (
                <div
                  key={stage.id}
                  className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3"
                >
                  <div className="h-3 w-3 rounded-full shrink-0" style={{ background: stage.color ?? "#3f3f46" }} />
                  <span className="flex-1 font-medium text-zinc-100">{stage.name}</span>
                  {stage.is_terminal && <Badge variant="purple">Terminal</Badge>}
                  {!stage.is_active && <Badge variant="gray">Inactive</Badge>}

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => moveStage(stage.id, "up")}
                      disabled={i === 0}
                      className="p-1 text-zinc-500 hover:text-zinc-300 disabled:opacity-30"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                      </svg>
                    </button>
                    <button
                      onClick={() => moveStage(stage.id, "down")}
                      disabled={i === stages.length - 1}
                      className="p-1 text-zinc-500 hover:text-zinc-300 disabled:opacity-30"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    <button
                      onClick={() => updateStage(stage, { is_terminal: !stage.is_terminal })}
                      className="text-xs text-zinc-500 hover:text-zinc-300 px-2 py-1 rounded border border-zinc-700 hover:border-zinc-500"
                    >
                      {stage.is_terminal ? "Unset Terminal" : "Set Terminal"}
                    </button>
                    <button
                      onClick={() => deleteStage(stage.id)}
                      className="p-1 text-zinc-600 hover:text-red-400"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add new stage */}
          <Card>
            <CardContent className="space-y-3">
              <p className="text-sm font-semibold text-zinc-300">Add Stage</p>
              <div className="flex gap-3">
                <Input
                  placeholder="Stage name…"
                  value={newStageName}
                  onChange={(e) => setNewStageName(e.target.value)}
                  className="flex-1"
                />
                <div className="flex items-end gap-2">
                  <input
                    type="color"
                    value={newStageColor}
                    onChange={(e) => setNewStageColor(e.target.value)}
                    className="h-10 w-12 rounded-xl border border-zinc-700 bg-zinc-950 cursor-pointer"
                  />
                  <Button onClick={addStage} loading={saving} disabled={!newStageName.trim()}>
                    Add
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
