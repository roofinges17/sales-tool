"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

export interface Profile {
  id: string;
  email: string;
  name: string;
  phone?: string | null;
  role: "owner" | "admin" | "manager" | "seller";
  department_id?: string | null;
  status: string;
}

interface AuthState {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function load() {
      const { data: { user } } = await supabase().auth.getUser();
      if (!mounted) return;

      setUser(user);

      if (user) {
        const { data } = await supabase()
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single();
        if (mounted) setProfile(data as Profile | null);
      }

      if (mounted) setLoading(false);
    }

    load();

    const { data: { subscription } } = supabase().auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setUser(session?.user ?? null);
      if (!session?.user) {
        setProfile(null);
        setLoading(false);
      } else {
        supabase()
          .from("profiles")
          .select("*")
          .eq("id", session.user.id)
          .single()
          .then(({ data }) => {
            if (mounted) {
              setProfile(data as Profile | null);
              setLoading(false);
            }
          });
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return { user, profile, loading };
}
