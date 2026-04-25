import { createClient } from "@supabase/supabase-js";
import { guard } from "../_guard";

interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
};

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  // Require authenticated admin/owner — this route hard-deletes auth.users
  const { userId, error: guardErr } = await guard(ctx.request, ctx.env, {
    maxBodyBytes: 0,
    ratePrefix: "purge-user",
    rateLimit: 0,
  });
  if (guardErr) return guardErr;

  const supabase = createClient(ctx.env.SUPABASE_URL, ctx.env.SUPABASE_SERVICE_ROLE_KEY);

  // Role check: only admin/owner may purge users
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId!)
    .single();
  const role = (profile as { role?: string } | null)?.role;
  if (!role || !["admin", "owner"].includes(role)) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
  }

  try {
    const { user_id } = (await ctx.request.json()) as { user_id?: string };
    if (!user_id) {
      return new Response(JSON.stringify({ error: "user_id is required" }), { status: 400, headers: corsHeaders });
    }

    // Hard-delete from auth.users — frees the email address for re-invite
    const { error } = await supabase.auth.admin.deleteUser(user_id);
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: corsHeaders });
    }

    // Profile row will be cleaned up by cascade or can be left as a tombstone
    await supabase.from("profiles").delete().eq("id", user_id);

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders });
  }
};

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
