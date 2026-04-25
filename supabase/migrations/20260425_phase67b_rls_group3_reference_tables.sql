-- Phase 6.7b: RLS for Group 3 reference tables (lead_sources, product_categories, workflow_logs)
--
-- Spot-check result: all lead_sources callers are inside (dashboard) routes protected by
-- DashboardShell auth.getUser(). product_categories has zero app callers (table is empty).
-- No public-route / anon-path usage found for either table.
--
-- lead_sources / product_categories:
--   All-authenticated SELECT (sellers need for dropdowns); owner/admin write only.
--   Previous USING(true) write policy allowed any seller to mutate admin config — fixed.
--
-- workflow_logs:
--   Audit trail (sale stage transitions). PII-adjacent (user IDs + account activity).
--   Scoped read: owner/admin see all; manager sees their dept's sales; seller sees own moves.
--   No write policy — app writes via service role (bypasses RLS). Previous USING(true) write
--   policy allowed any seller to insert/update audit rows — fixed.

-- ── Drop stale USING(true) policies ──────────────────────────────────────────

DROP POLICY IF EXISTS "lead_sources_select"       ON public.lead_sources;
DROP POLICY IF EXISTS "lead_sources_write"        ON public.lead_sources;
DROP POLICY IF EXISTS "product_categories_select" ON public.product_categories;
DROP POLICY IF EXISTS "product_categories_write"  ON public.product_categories;
DROP POLICY IF EXISTS "workflow_logs_select"      ON public.workflow_logs;
DROP POLICY IF EXISTS "workflow_logs_write"       ON public.workflow_logs;

-- ── lead_sources ──────────────────────────────────────────────────────────────

CREATE POLICY "lead_sources_read_v2" ON public.lead_sources
  FOR SELECT TO authenticated
  USING (current_user_role() = ANY (ARRAY['owner','admin','manager','seller']));

CREATE POLICY "lead_sources_write_v2" ON public.lead_sources
  FOR ALL TO authenticated
  USING (current_user_role() = ANY (ARRAY['owner','admin']));

-- ── product_categories ────────────────────────────────────────────────────────

CREATE POLICY "product_categories_read_v2" ON public.product_categories
  FOR SELECT TO authenticated
  USING (current_user_role() = ANY (ARRAY['owner','admin','manager','seller']));

CREATE POLICY "product_categories_write_v2" ON public.product_categories
  FOR ALL TO authenticated
  USING (current_user_role() = ANY (ARRAY['owner','admin']));

-- ── workflow_logs ─────────────────────────────────────────────────────────────
-- Read-only via RLS — writes are service-role only (no write policy intentional).

CREATE POLICY "workflow_logs_read_v2" ON public.workflow_logs
  FOR SELECT TO authenticated
  USING (
    current_user_role() = ANY (ARRAY['owner','admin'])
    OR (current_user_role() = 'manager' AND EXISTS (
      SELECT 1 FROM sales s
      WHERE s.id = workflow_logs.sale_id
        AND s.department_id = current_user_department_id()
    ))
    OR (current_user_role() = 'seller' AND moved_by_id = auth.uid())
  );
