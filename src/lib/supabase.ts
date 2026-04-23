"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { PUBLIC_ENV } from "./env";

let _client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (_client) return _client;
  _client = createClient(PUBLIC_ENV.SUPABASE_URL, PUBLIC_ENV.SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return _client;
}
