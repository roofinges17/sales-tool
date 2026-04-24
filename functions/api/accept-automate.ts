// POST /api/accept-automate
// Called by the customer accept page after they sign.
// Uses service role to run all post-accept automations server-side:
//   1. Flip quote → ACCEPTED + store signature
//   2. Snapshot to sales + sale_line_items (replicates convertToContract from detail page)
//   3. Seed commission_entries (PRIMARY_SELLER + MANAGER)
//   4. Assign first workflow stage to the new sale
//   5. Advance GHL opportunity to "won" stage (graceful no-op if unconfigured)
//   6. Create GHL follow-up task (graceful no-op if unconfigured)
//   7. Log QB sync entry (graceful no-op — "skipped" if QB not yet connected)

import { createClient } from "@supabase/supabase-js";

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  GHL_PIT?: string;
}

const GHL_BASE = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";
const GHL_LOCATION_ID = "DfkEocSccdPsDcgqrJug";

// ── GHL helpers (inline — CF Function can't import @/lib/ghl which calls /api/ghl-proxy) ──

async function ghlFetch(pit: string, method: string, path: string, body?: unknown): Promise<unknown> {
  try {
    const res = await fetch(`${GHL_BASE}/${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${pit}`,
        Version: GHL_VERSION,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return await res.json();
  } catch {
    return null;
  }
}

async function ghlMoveOpportunity(pit: string, oppId: string, stageId: string): Promise<void> {
  await ghlFetch(pit, "PUT", `opportunities/${oppId}`, { pipelineStageId: stageId });
}

async function ghlCreateOpportunity(
  pit: string,
  contactId: string,
  title: string,
  pipelineId: string,
  stageId: string,
  value: number,
): Promise<string | null> {
  const result = (await ghlFetch(pit, "POST", "opportunities/", {
    locationId: GHL_LOCATION_ID,
    contact_id: contactId,
    name: title,
    pipelineId,
    pipelineStageId: stageId,
    monetaryValue: value,
    status: "won",
  })) as { opportunity?: { id: string }; id?: string } | null;
  return result?.opportunity?.id ?? result?.id ?? null;
}

async function ghlCreateTask(pit: string, contactId: string, title: string): Promise<void> {
  await ghlFetch(pit, "POST", `contacts/${contactId}/tasks`, {
    title,
    dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // +1 day
    completed: false,
    assignedTo: GHL_LOCATION_ID,
  });
}

// ── Contract number ──────────────────────────────────────────────────────────

async function getNextContractNumber(
  sb: ReturnType<typeof createClient>,
  prefix: string,
): Promise<string> {
  const { data } = await sb
    .from("sales")
    .select("contract_number")
    .ilike("contract_number", `${prefix}%`)
    .order("created_at", { ascending: false })
    .limit(1);

  let nextNum = 1;
  if (data && data.length > 0) {
    const last = (data[0] as { contract_number?: string | null }).contract_number ?? "";
    const numPart = parseInt(last.replace(prefix, "")) || 0;
    nextNum = numPart + 1;
  }
  return `${prefix}${String(nextNum).padStart(4, "0")}`;
}

// ── Main handler ─────────────────────────────────────────────────────────────

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GHL_PIT } = ctx.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: "Server misconfigured" }), { status: 500, headers: corsHeaders });
  }

  let body: { token?: string; signatureDataUrl?: string };
  try {
    body = (await ctx.request.json()) as { token?: string; signatureDataUrl?: string };
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: corsHeaders });
  }

  const { token, signatureDataUrl } = body;
  if (!token) {
    return new Response(JSON.stringify({ error: "token required" }), { status: 400, headers: corsHeaders });
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const now = new Date().toISOString();

  // ── 1. Load quote ────────────────────────────────────────────────────────

  const { data: quoteRow, error: quoteErr } = await sb
    .from("quotes")
    .select(`
      id, name, status, accepted_at,
      subtotal, discount_type, discount_value, discount_amount,
      tax_rate, tax_amount, total,
      financing_provider, financing_term, financing_rate, monthly_payment,
      assigned_to_id, department_id,
      ghl_opportunity_id,
      account:account_id (
        id, name, email, phone,
        billing_address_line1, billing_city, billing_state, billing_zip,
        ghl_contact_id
      ),
      quote_line_items (
        id, product_name, product_sku, quantity, unit_price, unit_cost, line_total
      )
    `)
    .eq("accept_token", token)
    .maybeSingle();

  if (quoteErr || !quoteRow) {
    return new Response(JSON.stringify({ error: "Invalid or expired token" }), { status: 404, headers: corsHeaders });
  }

  // Idempotency — already processed
  if ((quoteRow as { accepted_at: string | null }).accepted_at) {
    const existingSale = await sb
      .from("sales")
      .select("id")
      .eq("quote_id", (quoteRow as { id: string }).id)
      .maybeSingle();
    const saleId = (existingSale.data as { id: string } | null)?.id ?? null;
    return new Response(JSON.stringify({ ok: true, alreadyAccepted: true, sale_id: saleId }), {
      status: 200,
      headers: corsHeaders,
    });
  }

  const quote = quoteRow as {
    id: string;
    name: string;
    status: string;
    accepted_at: string | null;
    subtotal: number | null;
    discount_type: string | null;
    discount_value: number | null;
    discount_amount: number | null;
    tax_rate: number | null;
    tax_amount: number | null;
    total: number | null;
    financing_provider: string | null;
    financing_term: number | null;
    financing_rate: number | null;
    monthly_payment: number | null;
    assigned_to_id: string | null;
    department_id: string | null;
    ghl_opportunity_id: string | null;
    account: {
      id: string;
      name: string;
      email: string | null;
      phone: string | null;
      billing_address_line1: string | null;
      billing_city: string | null;
      billing_state: string | null;
      billing_zip: string | null;
      ghl_contact_id: string | null;
    } | null;
    quote_line_items: Array<{
      id: string;
      product_name: string;
      product_sku: string | null;
      quantity: number;
      unit_price: number;
      unit_cost: number | null;
      line_total: number;
    }>;
  };

  // ── 2. Flip quote → ACCEPTED ─────────────────────────────────────────────

  const quoteUpdate: Record<string, unknown> = {
    status: "ACCEPTED",
    accepted_at: now,
  };
  if (signatureDataUrl) {
    quoteUpdate.customer_signature_data_url = signatureDataUrl;
    quoteUpdate.signed_at = now;
  }

  await sb.from("quotes").update(quoteUpdate).eq("id", quote.id);

  // ── 3. Company settings ──────────────────────────────────────────────────

  const { data: settingsRow } = await sb
    .from("company_settings")
    .select("contract_prefix, ghl_pipeline_id, ghl_won_stage_id, qb_realm_id, qb_access_token")
    .limit(1)
    .maybeSingle();

  const settings = settingsRow as {
    contract_prefix?: string | null;
    ghl_pipeline_id?: string | null;
    ghl_won_stage_id?: string | null;
    qb_realm_id?: string | null;
    qb_access_token?: string | null;
  } | null;

  const prefix = settings?.contract_prefix ?? "RE-";

  // ── 4. Snapshot to sales ─────────────────────────────────────────────────

  const contractNumber = await getNextContractNumber(sb, prefix);
  const lineItems = quote.quote_line_items ?? [];

  const sellerMarkup = lineItems.reduce(
    (sum, item) => sum + item.unit_price * item.quantity - (item.unit_cost ?? 0) * item.quantity,
    0,
  );
  const costOfGoods = lineItems.reduce(
    (sum, item) => sum + (item.unit_cost ?? 0) * item.quantity,
    0,
  );

  const { data: sale, error: saleErr } = await sb
    .from("sales")
    .insert({
      name: contractNumber,
      contract_number: contractNumber,
      status: "PENDING",
      contract_value: quote.total ?? 0,
      subtotal: quote.subtotal,
      discount_type: quote.discount_type,
      discount_value: quote.discount_value,
      discount_total: quote.discount_amount,
      tax_rate: quote.tax_rate,
      tax_amount: quote.tax_amount,
      financing_provider: quote.financing_provider,
      financing_term: quote.financing_term,
      financing_rate: quote.financing_rate,
      monthly_payment: quote.monthly_payment,
      contract_date: now.split("T")[0],
      quote_id: quote.id,
      account_id: quote.account?.id ?? null,
      primary_seller_id: quote.assigned_to_id,
      department_id: quote.department_id,
      cost_of_goods: costOfGoods,
      gross_profit: (quote.total ?? 0) - costOfGoods,
    })
    .select()
    .single();

  if (saleErr || !sale) {
    console.error("[accept-automate] sale insert failed:", saleErr);
    return new Response(
      JSON.stringify({ error: "Failed to create contract record", detail: saleErr?.message }),
      { status: 500, headers: corsHeaders },
    );
  }

  const saleId = (sale as { id: string }).id;

  // ── 5. Sale line items ───────────────────────────────────────────────────

  if (lineItems.length > 0) {
    await sb.from("sale_line_items").insert(
      lineItems.map((item, i) => ({
        sale_id: saleId,
        product_id: null,
        product_name: item.product_name,
        product_sku: item.product_sku ?? null,
        quantity: item.quantity,
        unit_price: item.unit_price,
        unit_cost: item.unit_cost ?? null,
        line_total: item.line_total,
        sort_order: i,
      })),
    );
  }

  // ── 6. Commission entries ────────────────────────────────────────────────

  const sellerId = quote.assigned_to_id;
  if (sellerId) {
    await sb.from("commission_entries").insert([
      {
        sale_id: saleId,
        recipient_id: sellerId,
        amount: sellerMarkup,
        type: "UPFRONT",
        status: "PENDING",
        role: "PRIMARY_SELLER",
      },
      {
        sale_id: saleId,
        recipient_id: sellerId,
        amount: costOfGoods * 0.18,
        type: "UPFRONT",
        status: "PENDING",
        role: "MANAGER",
      },
    ]);
  }

  // ── 7. Assign first workflow stage ───────────────────────────────────────

  const { data: firstStage } = await sb
    .from("workflow_stages")
    .select("id")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (firstStage) {
    await sb
      .from("sales")
      .update({ workflow_stage_id: (firstStage as { id: string }).id })
      .eq("id", saleId);
  }

  // ── 8. GHL automations (graceful no-op) ──────────────────────────────────

  if (GHL_PIT && settings?.ghl_pipeline_id) {
    try {
      const pipelineId = settings.ghl_pipeline_id;
      const wonStageId = settings.ghl_won_stage_id ?? "";
      const acct = quote.account;
      let contactId = acct?.ghl_contact_id ?? null;

      // Ensure GHL contact exists
      if (!contactId && acct) {
        const [firstName, ...rest] = (acct.name ?? "").split(" ");
        const created = (await ghlFetch(GHL_PIT, "POST", "contacts/", {
          locationId: GHL_LOCATION_ID,
          firstName: firstName ?? acct.name,
          lastName: rest.join(" ") || undefined,
          email: acct.email ?? undefined,
          phone: acct.phone ?? undefined,
        })) as { contact?: { id: string } } | null;
        contactId = created?.contact?.id ?? null;
        if (contactId) {
          await sb.from("accounts").update({ ghl_contact_id: contactId }).eq("id", acct.id);
        }
      }

      if (contactId && wonStageId) {
        // Move or create opportunity
        let oppId = quote.ghl_opportunity_id;
        if (oppId) {
          await ghlMoveOpportunity(GHL_PIT, oppId, wonStageId);
        } else {
          oppId = await ghlCreateOpportunity(
            GHL_PIT,
            contactId,
            quote.name,
            pipelineId,
            wonStageId,
            quote.total ?? 0,
          );
          if (oppId) {
            await sb
              .from("quotes")
              .update({ ghl_opportunity_id: oppId, ghl_last_sync_at: now })
              .eq("id", quote.id);
          }
        }

        // Create follow-up task in GHL
        await ghlCreateTask(GHL_PIT, contactId, `Follow up — ${quote.name} signed & converted`);
      }
    } catch {
      // GHL failure never blocks the accept flow
    }
  }

  // ── 9. QB sync log (graceful no-op) ─────────────────────────────────────
  // Only log when QB is connected — log row signals the invoice is pending push.
  // When QB is not yet configured we skip silently (no junk rows in the history table).

  const qbConnected = !!(settings?.qb_realm_id && settings?.qb_access_token);
  if (qbConnected) {
    await sb.from("qb_sync_log").insert({
      sync_type: "invoices",
      status: "pending",
      records_synced: 0,
      error_message: `Auto-queued on customer accept — sale ${contractNumber} (${saleId})`,
    });
  }

  // ── Done ─────────────────────────────────────────────────────────────────

  return new Response(
    JSON.stringify({ ok: true, sale_id: saleId, contract_number: contractNumber }),
    { status: 200, headers: corsHeaders },
  );
};

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
};
