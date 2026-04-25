-- Phase 6.7: Ownership-scoped and admin-gate RLS for Groups 1 + 2 (24 DROPs + 22 _v2 policies)
--
-- Group 1 — sensitive cross-seller (ownership via parent join):
--   commission_entries, commission_plans, sale_line_items, quote_line_items,
--   account_documents, quote_documents
--
-- Group 2 — admin-gate with seller SELECT (all-authenticated read, admin/owner write):
--   company_settings, departments, financing_plans, workflow_templates, workflow_stages
--
-- Also drops 4 orphan policies from prior phases:
--   commission_plans_read  (qual: auth.role()='authenticated' — same risk as USING(true))
--   commission_plans_write (duplicate of commission_plans_write_v2)
--   quote_line_items_read  (already ownership-scoped from prior phase, duplicates _v2)
--   quote_line_items_write (same)

-- ── Drop orphan / stale policies ──────────────────────────────────────────────

DROP POLICY IF EXISTS "commission_entries_read"      ON public.commission_entries;
DROP POLICY IF EXISTS "commission_entries_write"     ON public.commission_entries;
DROP POLICY IF EXISTS "commission_plans_read"        ON public.commission_plans;
DROP POLICY IF EXISTS "commission_plans_write"       ON public.commission_plans;
DROP POLICY IF EXISTS "sale_line_items_read"         ON public.sale_line_items;
DROP POLICY IF EXISTS "sale_line_items_write"        ON public.sale_line_items;
DROP POLICY IF EXISTS "quote_line_items_read"        ON public.quote_line_items;
DROP POLICY IF EXISTS "quote_line_items_write"       ON public.quote_line_items;
DROP POLICY IF EXISTS "account_documents_read"       ON public.account_documents;
DROP POLICY IF EXISTS "account_documents_write"      ON public.account_documents;
DROP POLICY IF EXISTS "quote_documents_read"         ON public.quote_documents;
DROP POLICY IF EXISTS "quote_documents_write"        ON public.quote_documents;
DROP POLICY IF EXISTS "company_settings_read"        ON public.company_settings;
DROP POLICY IF EXISTS "company_settings_write"       ON public.company_settings;
DROP POLICY IF EXISTS "departments_read"             ON public.departments;
DROP POLICY IF EXISTS "departments_write"            ON public.departments;
DROP POLICY IF EXISTS "financing_plans_read"         ON public.financing_plans;
DROP POLICY IF EXISTS "financing_plans_write"        ON public.financing_plans;
DROP POLICY IF EXISTS "workflow_templates_read"      ON public.workflow_templates;
DROP POLICY IF EXISTS "workflow_templates_write"     ON public.workflow_templates;
DROP POLICY IF EXISTS "workflow_stages_read"         ON public.workflow_stages;
DROP POLICY IF EXISTS "workflow_stages_write"        ON public.workflow_stages;

-- ── Group 1: commission_entries ───────────────────────────────────────────────
-- Sellers see their own entries; managers see their dept's entries.

CREATE POLICY "commission_entries_read_v2" ON public.commission_entries
  FOR SELECT TO authenticated
  USING (
    current_user_role() = ANY (ARRAY['owner','admin'])
    OR (current_user_role() = 'manager' AND recipient_id IN (SELECT current_dept_user_ids()))
    OR (current_user_role() = 'seller' AND recipient_id = auth.uid())
  );

CREATE POLICY "commission_entries_write_v2" ON public.commission_entries
  FOR ALL TO authenticated
  USING (
    current_user_role() = ANY (ARRAY['owner','admin'])
    OR (current_user_role() = 'manager' AND recipient_id IN (SELECT current_dept_user_ids()))
    OR (current_user_role() = 'seller' AND recipient_id = auth.uid())
  );

-- ── Group 1: commission_plans ─────────────────────────────────────────────────
-- Managers + above read; owner/admin write only.

CREATE POLICY "commission_plans_read_v2" ON public.commission_plans
  FOR SELECT TO authenticated
  USING (current_user_role() = ANY (ARRAY['owner','admin','manager']));

CREATE POLICY "commission_plans_write_v2" ON public.commission_plans
  FOR ALL TO authenticated
  USING (current_user_role() = ANY (ARRAY['owner','admin']));

-- ── Group 1: sale_line_items ──────────────────────────────────────────────────
-- Scoped through parent sale ownership.

CREATE POLICY "sale_line_items_read_v2" ON public.sale_line_items
  FOR SELECT TO authenticated
  USING (
    current_user_role() = ANY (ARRAY['owner','admin'])
    OR EXISTS (
      SELECT 1 FROM sales s
      WHERE s.id = sale_line_items.sale_id
        AND (
          (current_user_role() = 'manager' AND s.department_id = current_user_department_id())
          OR (current_user_role() = 'seller' AND (s.primary_seller_id = auth.uid() OR s.secondary_seller_id = auth.uid()))
        )
    )
  );

CREATE POLICY "sale_line_items_write_v2" ON public.sale_line_items
  FOR ALL TO authenticated
  USING (
    current_user_role() = ANY (ARRAY['owner','admin'])
    OR EXISTS (
      SELECT 1 FROM sales s
      WHERE s.id = sale_line_items.sale_id
        AND (
          (current_user_role() = 'manager' AND s.department_id = current_user_department_id())
          OR (current_user_role() = 'seller' AND (s.primary_seller_id = auth.uid() OR s.secondary_seller_id = auth.uid()))
        )
    )
  );

-- ── Group 1: quote_line_items ─────────────────────────────────────────────────
-- Scoped through parent quote ownership.

CREATE POLICY "quote_line_items_read_v2" ON public.quote_line_items
  FOR SELECT TO authenticated
  USING (
    current_user_role() = ANY (ARRAY['owner','admin'])
    OR EXISTS (
      SELECT 1 FROM quotes q
      WHERE q.id = quote_line_items.quote_id
        AND (
          (current_user_role() = 'manager' AND q.department_id = current_user_department_id())
          OR (current_user_role() = 'seller' AND (q.created_by_id = auth.uid() OR q.assigned_to_id = auth.uid()))
        )
    )
  );

CREATE POLICY "quote_line_items_write_v2" ON public.quote_line_items
  FOR ALL TO authenticated
  USING (
    current_user_role() = ANY (ARRAY['owner','admin'])
    OR EXISTS (
      SELECT 1 FROM quotes q
      WHERE q.id = quote_line_items.quote_id
        AND (
          (current_user_role() = 'manager' AND q.department_id = current_user_department_id())
          OR (current_user_role() = 'seller' AND (q.created_by_id = auth.uid() OR q.assigned_to_id = auth.uid()))
        )
    )
  );

-- ── Group 1: account_documents ────────────────────────────────────────────────
-- Scoped through parent account ownership.

CREATE POLICY "account_documents_read_v2" ON public.account_documents
  FOR SELECT TO authenticated
  USING (
    current_user_role() = ANY (ARRAY['owner','admin'])
    OR EXISTS (
      SELECT 1 FROM accounts a
      WHERE a.id = account_documents.account_id
        AND (
          (current_user_role() = 'manager'
            AND (a.assigned_to_id IN (SELECT current_dept_user_ids())
                 OR a.created_by_id IN (SELECT current_dept_user_ids())))
          OR (current_user_role() = 'seller'
            AND (a.created_by_id = auth.uid() OR a.assigned_to_id = auth.uid()))
        )
    )
  );

CREATE POLICY "account_documents_write_v2" ON public.account_documents
  FOR ALL TO authenticated
  USING (
    current_user_role() = ANY (ARRAY['owner','admin'])
    OR EXISTS (
      SELECT 1 FROM accounts a
      WHERE a.id = account_documents.account_id
        AND (
          (current_user_role() = 'manager'
            AND (a.assigned_to_id IN (SELECT current_dept_user_ids())
                 OR a.created_by_id IN (SELECT current_dept_user_ids())))
          OR (current_user_role() = 'seller'
            AND (a.created_by_id = auth.uid() OR a.assigned_to_id = auth.uid()))
        )
    )
  );

-- ── Group 1: quote_documents ──────────────────────────────────────────────────
-- Scoped through parent quote ownership.

CREATE POLICY "quote_documents_read_v2" ON public.quote_documents
  FOR SELECT TO authenticated
  USING (
    current_user_role() = ANY (ARRAY['owner','admin'])
    OR EXISTS (
      SELECT 1 FROM quotes q
      WHERE q.id = quote_documents.quote_id
        AND (
          (current_user_role() = 'manager' AND q.department_id = current_user_department_id())
          OR (current_user_role() = 'seller' AND (q.created_by_id = auth.uid() OR q.assigned_to_id = auth.uid()))
        )
    )
  );

CREATE POLICY "quote_documents_write_v2" ON public.quote_documents
  FOR ALL TO authenticated
  USING (
    current_user_role() = ANY (ARRAY['owner','admin'])
    OR EXISTS (
      SELECT 1 FROM quotes q
      WHERE q.id = quote_documents.quote_id
        AND (
          (current_user_role() = 'manager' AND q.department_id = current_user_department_id())
          OR (current_user_role() = 'seller' AND (q.created_by_id = auth.uid() OR q.assigned_to_id = auth.uid()))
        )
    )
  );

-- ── Group 2: company_settings ─────────────────────────────────────────────────
-- All sellers read (needed by quote builder Step6Generate); owner/admin write.

CREATE POLICY "company_settings_read_v2" ON public.company_settings
  FOR SELECT TO authenticated
  USING (current_user_role() = ANY (ARRAY['owner','admin','manager','seller']));

CREATE POLICY "company_settings_write_v2" ON public.company_settings
  FOR ALL TO authenticated
  USING (current_user_role() = ANY (ARRAY['owner','admin']));

-- ── Group 2: departments ──────────────────────────────────────────────────────
-- All sellers read (needed by Step1Department, sales, quotes, pipeline); owner/admin write.

CREATE POLICY "departments_read_v2" ON public.departments
  FOR SELECT TO authenticated
  USING (current_user_role() = ANY (ARRAY['owner','admin','manager','seller']));

CREATE POLICY "departments_write_v2" ON public.departments
  FOR ALL TO authenticated
  USING (current_user_role() = ANY (ARRAY['owner','admin']));

-- ── Group 2: financing_plans ──────────────────────────────────────────────────
-- All sellers read (shown in quote builder); owner/admin write.

CREATE POLICY "financing_plans_read_v2" ON public.financing_plans
  FOR SELECT TO authenticated
  USING (current_user_role() = ANY (ARRAY['owner','admin','manager','seller']));

CREATE POLICY "financing_plans_write_v2" ON public.financing_plans
  FOR ALL TO authenticated
  USING (current_user_role() = ANY (ARRAY['owner','admin']));

-- ── Group 2: workflow_templates ───────────────────────────────────────────────
-- All sellers read (pipeline builder dropdowns); owner/admin write.

CREATE POLICY "workflow_templates_read_v2" ON public.workflow_templates
  FOR SELECT TO authenticated
  USING (current_user_role() = ANY (ARRAY['owner','admin','manager','seller']));

CREATE POLICY "workflow_templates_write_v2" ON public.workflow_templates
  FOR ALL TO authenticated
  USING (current_user_role() = ANY (ARRAY['owner','admin']));

-- ── Group 2: workflow_stages ──────────────────────────────────────────────────
-- All sellers read (same pipeline context); owner/admin write.

CREATE POLICY "workflow_stages_read_v2" ON public.workflow_stages
  FOR SELECT TO authenticated
  USING (current_user_role() = ANY (ARRAY['owner','admin','manager','seller']));

CREATE POLICY "workflow_stages_write_v2" ON public.workflow_stages
  FOR ALL TO authenticated
  USING (current_user_role() = ANY (ARRAY['owner','admin']));
