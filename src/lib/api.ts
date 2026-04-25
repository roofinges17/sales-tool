import { supabase } from "@/lib/supabase";

// Wraps fetch with the signed-in user's Supabase JWT on every /api/ call.
// Guards return 401 if no token is present — using this helper ensures
// authenticated dashboard users never hit that 401.
export async function authedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const { data: { session } } = await supabase().auth.getSession();
  const headers = new Headers(init.headers as HeadersInit | undefined);
  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }
  return fetch(url, { ...init, headers });
}
