// Stub: QuickBooks sync endpoint — Phase 22 will implement real sync logic.
// For now, records a pending sync log entry and returns immediately.
// TODO (Phase 22): implement token refresh, QB API calls, and per-type sync logic.

import { createClient } from "@supabase/supabase-js";

interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
};

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  try {
    const { sync_type } = (await ctx.request.json()) as { sync_type?: string };
    if (!sync_type) {
      return new Response(JSON.stringify({ error: "sync_type is required" }), { status: 400, headers: corsHeaders });
    }

    const supabase = createClient(ctx.env.SUPABASE_URL, ctx.env.SUPABASE_SERVICE_ROLE_KEY);

    const { data: logEntry, error: logErr } = await supabase
      .from("qb_sync_log")
      .insert({ sync_type, status: "pending", records_synced: 0 })
      .select()
      .single();

    if (logErr) {
      return new Response(JSON.stringify({ error: logErr.message }), { status: 500, headers: corsHeaders });
    }

    // TODO (Phase 22): kick off actual QB sync here using stored access/refresh tokens

    return new Response(JSON.stringify({ ok: true, log_id: (logEntry as { id: string }).id, status: "pending" }), { status: 200, headers: corsHeaders });
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
