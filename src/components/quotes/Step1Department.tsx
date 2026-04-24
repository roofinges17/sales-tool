"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useQuoteBuilder } from "@/lib/contexts/QuoteBuilderContext";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";

interface Department {
  id: string;
  name: string;
  code: string;
  color?: string | null;
  description?: string | null;
}

export default function Step1Department() {
  const { state, setDepartment, setStep } = useQuoteBuilder();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    supabase()
      .from("departments")
      .select("*")
      .eq("is_active", true)
      .order("name")
      .then(({ data, error }) => {
        if (error) {
          console.error("[Step1Department] load failed:", error);
          setLoadError(error.message);
        }
        setDepartments((data as Department[]) ?? []);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-zinc-500">
        <svg className="mr-2 h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Loading departments…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-100">Select Department</h2>
        <p className="text-sm text-zinc-500 mt-1">Choose the department for this estimate.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {departments.map((dept) => {
          const isSelected = state.departmentId === dept.id;
          return (
            <button
              key={dept.id}
              onClick={() => setDepartment(dept.id, dept.name)}
              className={`text-left rounded-2xl border p-6 transition-all ${
                isSelected
                  ? "border-brand bg-brand/10 ring-1 ring-brand"
                  : "border-zinc-800 bg-zinc-900/60 hover:border-zinc-600 hover:bg-zinc-800/60"
              }`}
            >
              <div
                className="mb-3 h-10 w-10 rounded-xl flex items-center justify-center text-lg font-bold"
                style={{ background: dept.color ? `${dept.color}22` : "#27272a", color: dept.color ?? "#a1a1aa" }}
              >
                {dept.code.charAt(0).toUpperCase()}
              </div>
              <p className="font-semibold text-zinc-100">{dept.name}</p>
              <p className="text-xs text-zinc-500 mt-1">{dept.code}</p>
              {dept.description && (
                <p className="text-xs text-zinc-500 mt-1">{dept.description}</p>
              )}
            </button>
          );
        })}
      </div>

      {loadError && (
        <Card>
          <CardContent className="py-6 text-center">
            <p className="text-red-400 text-sm">Could not load departments: {loadError}</p>
            <p className="text-xs text-zinc-500 mt-1">Try refreshing. If it persists, contact support.</p>
          </CardContent>
        </Card>
      )}

      {!loadError && departments.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-zinc-400">No departments configured yet.</p>
            <p className="text-sm text-zinc-500 mt-1">
              Go to <a href="/admin/settings/departments/" className="text-brand hover:underline">Admin → Departments</a> to add departments.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end">
        <Button
          disabled={!state.departmentId}
          onClick={() => setStep(2)}
        >
          Next: Products
        </Button>
      </div>
    </div>
  );
}
