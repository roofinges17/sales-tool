#!/usr/bin/env node
/**
 * CRUD-completeness audit for admin settings pages.
 *
 * Scans each settings page for Supabase CRUD calls and reports coverage.
 * Run with: node scripts/crud-audit.mjs
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

const ROOT = new URL("..", import.meta.url).pathname;
const SETTINGS_DIR = join(ROOT, "src/app/(dashboard)/admin/settings");

// Supabase operation patterns to detect
const PATTERNS = {
  Create: [/\.insert\s*\(/g],
  Read:   [/\.select\s*\(/g, /\.maybeSingle\s*\(/g, /\.single\s*\(/g],
  Update: [/\.update\s*\(/g, /\.upsert\s*\(/g],
  Delete: [/\.delete\s*\(/g],
};

// Known referential-integrity risks: tables that are FK'd from others
const FK_RISKS = {
  financing:    "financing_plans rows may be referenced by quotes (no cascade check)",
  products:     "products rows may be referenced by quote_line_items (no cascade check)",
  workflows:    "workflow_stages delete has no confirmation dialog",
  commissions:  null,
  departments:  "hard delete blocked if users assigned (correct), but no soft-delete path",
  "lead-sources": null,
  users:        "soft-delete via status='deleted'; email stays locked in auth — cannot re-invite",
};

function findPageFiles(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const pages = [];
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      const sub = join(full, "page.tsx");
      try { statSync(sub); pages.push({ name: e.name, path: sub }); } catch { /* no page.tsx */ }
    } else if (e.name === "page.tsx") {
      pages.push({ name: "(company-settings)", path: full });
    }
  }
  return pages;
}

function detect(source, patterns) {
  return patterns.some((rx) => { rx.lastIndex = 0; return rx.test(source); });
}

const pages = findPageFiles(SETTINGS_DIR);

const rows = [];
let hasGap = false;

for (const { name, path } of pages) {
  const src = readFileSync(path, "utf-8");
  const ops = {};
  for (const [op, pats] of Object.entries(PATTERNS)) {
    ops[op] = detect(src, pats);
  }
  const allPresent = Object.values(ops).every(Boolean);
  if (!allPresent) hasGap = true;
  rows.push({ name, ops, risk: FK_RISKS[name] ?? null, path });
}

// ── Output ────────────────────────────────────────────────────────────────────

const COL = 18;
const pad = (s, n) => s.padEnd(n);

console.log("\nCRUD-Completeness Audit — Admin Settings Pages");
console.log("=".repeat(70));
console.log(`${pad("Page", COL)}  C   R   U   D   Notes`);
console.log("-".repeat(70));

for (const { name, ops, risk } of rows) {
  const c = ops.Create ? "✅" : "❌";
  const r = ops.Read   ? "✅" : "❌";
  const u = ops.Update ? "✅" : "❌";
  const d = ops.Delete ? "✅" : "❌";
  const gap = Object.values(ops).every(Boolean) ? "" : "⚠ missing ops";
  const note = risk ? `⚠ ${risk}` : gap || "—";
  console.log(`${pad(name, COL)}  ${c}  ${r}  ${u}  ${d}  ${note}`);
}

console.log("-".repeat(70));
console.log("\nKey:");
console.log("  ✅ = Supabase operation detected in page source");
console.log("  ❌ = Not found (may be intentional for singleton pages)");
console.log("  ⚠ = Referential integrity or UX risk flagged\n");

if (!hasGap) {
  console.log("All pages have full CRUD coverage.\n");
} else {
  console.log("Pages with ❌ or ⚠ need review. See notes above.\n");
}

// ── Action items ──────────────────────────────────────────────────────────────

console.log("Recommended action items:");
console.log("  1. financing — add soft-delete or referential check before hard delete");
console.log("  2. products  — add referential check before hard delete (blocks if used in quotes)");
console.log("  3. workflows — add confirmation dialog before stage delete");
console.log("  4. users     — document that deleted emails can't be re-invited; consider hard-delete path for admins");
console.log("  5. company-settings — singleton by design; C/D intentionally omitted\n");
