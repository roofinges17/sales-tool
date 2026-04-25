import { createClient } from "@supabase/supabase-js";
import { guard } from "./_guard";

interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

interface InviteBody {
  email: string;
  name: string;
  role: string;
  department_id?: string | null;
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };

  // Require authenticated admin/owner — this route creates auth.users with arbitrary roles
  const { userId, error: guardErr } = await guard(ctx.request, ctx.env, {
    maxBodyBytes: 0,
    ratePrefix: "invite-user",
    rateLimit: 0,
  });
  if (guardErr) return guardErr;

  const supabase = createClient(ctx.env.SUPABASE_URL, ctx.env.SUPABASE_SERVICE_ROLE_KEY);

  // Role check: only admin/owner may invite users
  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId!)
    .single();
  const callerRole = (callerProfile as { role?: string } | null)?.role;
  if (!callerRole || !["admin", "owner"].includes(callerRole)) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
  }

  try {
    const body = (await ctx.request.json()) as InviteBody;
    const { email, name, role, department_id } = body;

    if (!email || !name || !role) {
      return new Response(JSON.stringify({ error: "email, name, and role are required" }), { status: 400, headers: corsHeaders });
    }

    const origin = new URL(ctx.request.url).origin;
    const redirectTo = `${origin}/auth/update-password`;

    const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
      data: { name, role, department_id: department_id ?? null },
      redirectTo,
    });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: corsHeaders });
    }

    // Upsert profile row so it appears in the Users list immediately
    await supabase.from("profiles").upsert(
      {
        id: data.user.id,
        email,
        name,
        role,
        department_id: department_id ?? null,
        status: "active",
      },
      { onConflict: "id" },
    );

    return new Response(JSON.stringify({ ok: true, user_id: data.user.id }), { status: 200, headers: corsHeaders });
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
