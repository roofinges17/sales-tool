"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { NavBar } from "@/components/layout/NavBar";
import type { Profile } from "@/types";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function checkAuth() {
      const { data: { user } } = await supabase().auth.getUser();
      if (!user) {
        window.location.href = "/login/";
        return;
      }
      const { data } = await supabase()
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      if (mounted) {
        setProfile(data as Profile | null);
        setLoading(false);
      }
    }

    checkAuth();

    return () => { mounted = false; };
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: "var(--bg)" }}>
        <div className="flex items-center gap-3 text-zinc-400">
          <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm">Loading…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <NavBar profile={profile} />
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}
