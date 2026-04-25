-- Phase 6: Tighten USING(true) catch-all RLS policies on 5 critical tables
--
-- Root cause: sales, contacts, properties, quote_notes, and sale_payments had
-- permissive USING(true) policies from earlier phases, allowing any authenticated
-- user to read and write ALL records across all reps/customers.
--
-- Fix pattern: ADD role-gated _v2 policy → DROP old USING(true) policy.
-- Mirrors the proven accounts_read/quotes_read policy structure.
--
-- Helper functions used (already in DB):
--   current_user_role()          → TEXT role for auth.uid()
--   current_user_department_id() → UUID dept for auth.uid()
--   current_dept_user_ids()      → TABLE of UUIDs in same dept as auth.uid()

-- ============================================================
-- SALES
-- ============================================================
CREATE POLICY sales_read_v2 ON public.sales
  FOR SELECT TO authenticated
  USING (
    current_user_role() IN ('owner', 'admin')
    OR (current_user_role() = 'manager' AND department_id = current_user_department_id())
    OR (current_user_role() = 'seller' AND (
      primary_seller_id = auth.uid() OR secondary_seller_id = auth.uid()
    ))
  );

CREATE POLICY sales_write_v2 ON public.sales
  FOR ALL TO authenticated
  USING (
    current_user_role() IN ('owner', 'admin')
    OR (current_user_role() = 'manager' AND department_id = current_user_department_id())
    OR (current_user_role() = 'seller' AND (
      primary_seller_id = auth.uid() OR secondary_seller_id = auth.uid()
    ))
  );

DROP POLICY IF EXISTS "sales_select" ON public.sales;
DROP POLICY IF EXISTS "sales_write"  ON public.sales;

-- ============================================================
-- CONTACTS (scoped via parent account ownership)
-- ============================================================
CREATE POLICY contacts_read_v2 ON public.contacts
  FOR SELECT TO authenticated
  USING (
    current_user_role() IN ('owner', 'admin')
    OR EXISTS (
      SELECT 1 FROM public.accounts a WHERE a.id = account_id
      AND (
        (current_user_role() = 'manager' AND (
          a.assigned_to_id IN (SELECT current_dept_user_ids()) OR
          a.created_by_id  IN (SELECT current_dept_user_ids())
        ))
        OR (current_user_role() = 'seller' AND (
          a.created_by_id = auth.uid() OR a.assigned_to_id = auth.uid()
        ))
      )
    )
  );

CREATE POLICY contacts_write_v2 ON public.contacts
  FOR ALL TO authenticated
  USING (
    current_user_role() IN ('owner', 'admin')
    OR EXISTS (
      SELECT 1 FROM public.accounts a WHERE a.id = account_id
      AND (
        (current_user_role() = 'manager' AND (
          a.assigned_to_id IN (SELECT current_dept_user_ids()) OR
          a.created_by_id  IN (SELECT current_dept_user_ids())
        ))
        OR (current_user_role() = 'seller' AND (
          a.created_by_id = auth.uid() OR a.assigned_to_id = auth.uid()
        ))
      )
    )
  );

DROP POLICY IF EXISTS "contacts_select" ON public.contacts;
DROP POLICY IF EXISTS "contacts_write"  ON public.contacts;

-- ============================================================
-- PROPERTIES (same account ownership pattern as contacts)
-- ============================================================
CREATE POLICY properties_read_v2 ON public.properties
  FOR SELECT TO authenticated
  USING (
    current_user_role() IN ('owner', 'admin')
    OR EXISTS (
      SELECT 1 FROM public.accounts a WHERE a.id = account_id
      AND (
        (current_user_role() = 'manager' AND (
          a.assigned_to_id IN (SELECT current_dept_user_ids()) OR
          a.created_by_id  IN (SELECT current_dept_user_ids())
        ))
        OR (current_user_role() = 'seller' AND (
          a.created_by_id = auth.uid() OR a.assigned_to_id = auth.uid()
        ))
      )
    )
  );

CREATE POLICY properties_write_v2 ON public.properties
  FOR ALL TO authenticated
  USING (
    current_user_role() IN ('owner', 'admin')
    OR EXISTS (
      SELECT 1 FROM public.accounts a WHERE a.id = account_id
      AND (
        (current_user_role() = 'manager' AND (
          a.assigned_to_id IN (SELECT current_dept_user_ids()) OR
          a.created_by_id  IN (SELECT current_dept_user_ids())
        ))
        OR (current_user_role() = 'seller' AND (
          a.created_by_id = auth.uid() OR a.assigned_to_id = auth.uid()
        ))
      )
    )
  );

DROP POLICY IF EXISTS "properties_select" ON public.properties;
DROP POLICY IF EXISTS "properties_write"  ON public.properties;

-- ============================================================
-- QUOTE_NOTES (scoped via parent quote ownership)
-- ============================================================
CREATE POLICY quote_notes_read_v2 ON public.quote_notes
  FOR SELECT TO authenticated
  USING (
    current_user_role() IN ('owner', 'admin')
    OR EXISTS (
      SELECT 1 FROM public.quotes q WHERE q.id = quote_id
      AND (
        (current_user_role() = 'manager' AND q.department_id = current_user_department_id())
        OR (current_user_role() = 'seller' AND (
          q.created_by_id = auth.uid() OR q.assigned_to_id = auth.uid()
        ))
      )
    )
  );

CREATE POLICY quote_notes_write_v2 ON public.quote_notes
  FOR ALL TO authenticated
  USING (
    current_user_role() IN ('owner', 'admin')
    OR EXISTS (
      SELECT 1 FROM public.quotes q WHERE q.id = quote_id
      AND (
        (current_user_role() = 'manager' AND q.department_id = current_user_department_id())
        OR (current_user_role() = 'seller' AND (
          q.created_by_id = auth.uid() OR q.assigned_to_id = auth.uid()
        ))
      )
    )
  );

DROP POLICY IF EXISTS "quote_notes_select" ON public.quote_notes;
DROP POLICY IF EXISTS "quote_notes_write"  ON public.quote_notes;

-- ============================================================
-- SALE_PAYMENTS (scoped via parent sale ownership)
-- ============================================================
CREATE POLICY sale_payments_read_v2 ON public.sale_payments
  FOR SELECT TO authenticated
  USING (
    current_user_role() IN ('owner', 'admin')
    OR EXISTS (
      SELECT 1 FROM public.sales s WHERE s.id = sale_id
      AND (
        (current_user_role() = 'manager' AND s.department_id = current_user_department_id())
        OR (current_user_role() = 'seller' AND (
          s.primary_seller_id = auth.uid() OR s.secondary_seller_id = auth.uid()
        ))
      )
    )
  );

CREATE POLICY sale_payments_write_v2 ON public.sale_payments
  FOR ALL TO authenticated
  USING (
    current_user_role() IN ('owner', 'admin')
    OR EXISTS (
      SELECT 1 FROM public.sales s WHERE s.id = sale_id
      AND (
        (current_user_role() = 'manager' AND s.department_id = current_user_department_id())
        OR (current_user_role() = 'seller' AND (
          s.primary_seller_id = auth.uid() OR s.secondary_seller_id = auth.uid()
        ))
      )
    )
  );

DROP POLICY IF EXISTS "sale_payments_select" ON public.sale_payments;
DROP POLICY IF EXISTS "sale_payments_write"  ON public.sale_payments;

-- ============================================================
-- PROFILES: phone column present → defer to Phase 7
-- profiles_read (USING authenticated) grants cross-user phone access.
-- Phase 7: create profiles_public_view (id, name, role), update
-- accounts/new assign-to dropdown to use view, then drop profiles_read.
-- ============================================================
