/**
 * One-shot seed script. Run with:
 *   npx ts-node --esm scripts/seed.ts
 * or via tsx:
 *   npx tsx scripts/seed.ts
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env.
 * Uses service-role key to bypass RLS.
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// ── Products ─────────────────────────────────────────────────────────────────
const PRODUCTS = [
  { name: "ALUMINUM ROOF",         code: "ALUMINUM",          type: "PRODUCT", department: "Roofing", default_price: 1500.00, min_price: 1400.00, max_price: 1500.00, unit: "sq ft", is_active: true },
  { name: "FLAT ROOF",             code: "FLAT",              type: "PRODUCT", department: "Roofing", default_price:  750.00, min_price:  725.00, max_price:  850.00, unit: "sq ft", is_active: true },
  { name: "FLAT ROOF + INSULATIONS", code: "FLAT INSULATIONS", type: "PRODUCT", department: "Roofing", default_price: 1000.00, min_price:  900.00, max_price: 1050.00, unit: "sq ft", is_active: true },
  { name: "METAL ROOF",            code: "METAL",             type: "PRODUCT", department: "Roofing", default_price: 1200.00, min_price: 1175.00, max_price: 1300.00, unit: "sq ft", is_active: true },
  { name: "SHINGLE ROOF",          code: "SHINGLE",           type: "PRODUCT", department: "Roofing", default_price:  700.00, min_price:  725.00, max_price:  700.00, unit: "sq ft", is_active: true },
  { name: "TILE ROOF",             code: "TILE",              type: "PRODUCT", department: "Roofing", default_price: 1200.00, min_price: 1100.00, max_price: 1200.00, unit: "sq ft", is_active: true },
  { name: "SOFFIT & FASCIA",       code: "SOFFIT & FASCIA",   type: "PRODUCT", department: "Roofing", default_price:   20.00, min_price:    0.00, max_price:    0.00, unit: "ln ft", is_active: true },
  { name: "METAL FASCIA",          code: "METAL FASCIA",      type: "PRODUCT", department: "Roofing", default_price:   20.00, min_price:    0.00, max_price:    0.00, unit: "ln ft", is_active: true },
  { name: "GUTTERS",               code: "GUTTERS",           type: "PRODUCT", department: "Roofing", default_price:    0.00, min_price:    0.00, max_price:    0.00, unit: "ln ft", is_active: true },
  { name: "INSULATION",            code: "INSULATION",        type: "PRODUCT", department: "Roofing", default_price:    0.00, min_price:    0.00, max_price:    0.00, unit: "sq ft", is_active: true },
];

// ── Departments ───────────────────────────────────────────────────────────────
const DEPARTMENTS = [
  { name: "Roofing", code: "ROOF", color: "#f97316", description: "Shingles, flat roofs, metal & tile", is_active: true },
];

// ── Lead Sources ──────────────────────────────────────────────────────────────
const LEAD_SOURCES = [
  { name: "Website",          code: "WEBSITE",     seller_share_percent: 100, is_active: true },
  { name: "Referral",         code: "REFERRAL",    seller_share_percent: 100, is_active: true },
  { name: "Door Knock",       code: "DOOR_KNOCK",  seller_share_percent: 100, is_active: true },
  { name: "Insurance Claim",  code: "INSURANCE",   seller_share_percent: 100, is_active: true },
  { name: "Social Media",     code: "SOCIAL",      seller_share_percent: 100, is_active: true },
  { name: "GHL / CRM",        code: "GHL",         seller_share_percent: 100, is_active: true },
];

// ── Commission Plans ──────────────────────────────────────────────────────────
const COMMISSION_PLANS = [
  {
    name: "Standard Roofing",
    description: "Default plan for roofing sales",
    department: "Roofing",
    lead_source: "ALL",
    manager_percentage: 18,
    special_percentage: 5,
    system_percentage: 5,
    company_percentage: 72,
    primary_split_ratio: 70,
    secondary_split_ratio: 30,
    is_active: true,
  },
  {
    name: "Referral Plan",
    description: "For referral-sourced leads",
    department: "Roofing",
    lead_source: "Referral",
    manager_percentage: 18,
    special_percentage: 5,
    system_percentage: 5,
    company_percentage: 72,
    primary_split_ratio: 100,
    secondary_split_ratio: 0,
    is_active: true,
  },
  {
    name: "Door Knock Plan",
    description: "Self-generated leads",
    department: "Roofing",
    lead_source: "Door Knock",
    manager_percentage: 18,
    special_percentage: 5,
    system_percentage: 5,
    company_percentage: 72,
    primary_split_ratio: 100,
    secondary_split_ratio: 0,
    is_active: true,
  },
];

// ── Workflow Stages (Roofing default) ─────────────────────────────────────────
const ROOFING_WORKFLOW_STAGES = [
  { name: "Permit & Materials", color: "#F59E0B", description: "Obtain permits and order materials", sort_order: 0, assignable_roles: ["owner", "admin"], is_terminal: false },
  { name: "Scheduling",         color: "#6366F1", description: "Schedule installation date",         sort_order: 1, assignable_roles: ["admin", "manager"], is_terminal: false },
  { name: "In Progress",        color: "#06B6D4", description: "Installation underway",              sort_order: 2, assignable_roles: ["admin", "manager"], is_terminal: false },
  { name: "Quality Check",      color: "#A855F7", description: "Inspect completed work",             sort_order: 3, assignable_roles: ["owner", "admin"], is_terminal: false },
  { name: "Final Payment",      color: "#EC4899", description: "Collect remaining balance",          sort_order: 4, assignable_roles: ["admin", "manager", "seller"], is_terminal: false },
  { name: "Complete",           color: "#22C55E", description: "Job finished",                       sort_order: 5, assignable_roles: ["owner", "admin"], is_terminal: true },
];

// ── Financing (providers + plans) ─────────────────────────────────────────────
const FINANCING_PROVIDERS = [
  {
    name: "GreenSky",
    code: "GREENSKY",
    description: "Home improvement financing",
    website_url: "https://greensky.com",
    contact_email: "",
    contact_phone: "",
    account_rep_name: "",
    is_active: true,
  },
  {
    name: "Hearth",
    code: "HEARTH",
    description: "Flexible home improvement loans",
    website_url: "https://gethearth.com",
    contact_email: "",
    contact_phone: "",
    account_rep_name: "",
    is_active: true,
  },
];

// ── Company Settings ──────────────────────────────────────────────────────────
const COMPANY_SETTINGS = {
  company_name: "Roofing Experts",
  legal_name: "",
  email: "info@roofingex.com",
  phone: "",
  website: "https://roofingex.com",
  tax_id: "",
  address: "",
  default_tax_rate: 0.07,
  quote_validity_days: 30,
  contract_prefix: "RE-",
  estimate_prefix: "EST-",
  terms_and_conditions: "This estimate is valid for 30 days from the date of issue. Work will commence upon signed contract and deposit. Final payment is due upon project completion.",
};

// ── Helpers ───────────────────────────────────────────────────────────────────
async function upsertAll(table: string, rows: Record<string, unknown>[], conflictOn?: string) {
  if (rows.length === 0) return;
  const { error } = conflictOn
    ? await db.from(table).upsert(rows, { onConflict: conflictOn, ignoreDuplicates: true })
    : await db.from(table).upsert(rows, { ignoreDuplicates: true });
  if (error) {
    console.error(`  ✗ ${table}:`, error.message);
  } else {
    console.log(`  ✓ ${table} (${rows.length} rows)`);
  }
}

async function main() {
  console.log("Seeding Roofing Experts Sales Tool…\n");

  // Company settings (single row)
  const { data: existing } = await db.from("company_settings").select("id").limit(1).maybeSingle();
  if (!existing) {
    const { error } = await db.from("company_settings").insert(COMPANY_SETTINGS);
    if (error) console.error("  ✗ company_settings:", error.message);
    else console.log("  ✓ company_settings (1 row)");
  } else {
    console.log("  ~ company_settings already seeded, skipping");
  }

  await upsertAll("departments", DEPARTMENTS, "code");
  await upsertAll("lead_sources", LEAD_SOURCES, "code");
  await upsertAll("products", PRODUCTS, "code");
  await upsertAll("commission_plans", COMMISSION_PLANS, "name");

  // Workflow — insert Roofing workflow + stages
  const { data: roofingDept } = await db.from("departments").select("id").eq("code", "ROOF").maybeSingle();
  if (roofingDept) {
    const { data: existingWf } = await db
      .from("workflow_templates")
      .select("id")
      .eq("department_id", roofingDept.id)
      .maybeSingle();

    if (!existingWf) {
      const { data: wf, error: wfErr } = await db
        .from("workflow_templates")
        .insert({ name: "Roofing Workflow", department_id: roofingDept.id, is_active: true })
        .select("id")
        .single();
      if (wfErr) {
        console.error("  ✗ workflow_templates:", wfErr.message);
      } else {
        const stages = ROOFING_WORKFLOW_STAGES.map((s) => ({ ...s, workflow_id: wf.id }));
        const { error: stageErr } = await db.from("workflow_stages").insert(stages);
        if (stageErr) console.error("  ✗ workflow_stages:", stageErr.message);
        else console.log(`  ✓ workflow_templates + workflow_stages (1 workflow, ${stages.length} stages)`);
      }
    } else {
      console.log("  ~ workflow_templates already seeded, skipping");
    }
  }

  // Financing providers
  await upsertAll("financing_providers", FINANCING_PROVIDERS, "code");

  console.log("\nSeed complete.");
}

main().catch((err) => { console.error(err); process.exit(1); });
