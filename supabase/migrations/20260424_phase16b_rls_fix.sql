-- Phase 16b: Fix RLS infinite recursion on profiles
--
-- Root cause: policies on accounts/quotes/quote_line_items all do
--   EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (...))
-- which triggers the profiles SELECT policy, which may itself re-evaluate —
-- creating a recursive loop that errors: "infinite recursion detected in policy".
--
-- Fix: a SECURITY DEFINER function that reads profiles WITHOUT triggering RLS.
-- All policies call the function instead of querying profiles directly.

-- ── 1. Create the SECURITY DEFINER helper ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM profiles WHERE id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_user_department_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT department_id FROM profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- Helper: returns IDs of all profiles in the same department as current user
CREATE OR REPLACE FUNCTION public.current_dept_user_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM profiles
  WHERE department_id = (SELECT department_id FROM profiles WHERE id = auth.uid() LIMIT 1);
$$;

-- ── 2. Rewrite profiles policies (self-select unconditional) ──────────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_read"  ON profiles;
DROP POLICY IF EXISTS "profiles_write" ON profiles;

-- All authenticated users can read any profile (needed for joins, no recursion here
-- because this policy does NOT query profiles itself)
CREATE POLICY "profiles_read" ON profiles
  FOR SELECT USING (auth.role() = 'authenticated');

-- Users can update their own row; owner/admin can manage anyone
-- Uses SECURITY DEFINER function — no recursion
CREATE POLICY "profiles_write" ON profiles
  FOR ALL USING (
    auth.uid() = profiles.id
    OR public.current_user_role() IN ('owner', 'admin')
  )
  WITH CHECK (
    auth.uid() = profiles.id
    OR public.current_user_role() IN ('owner', 'admin')
  );

-- ── 3. Rewrite accounts policies ─────────────────────────────────────────────
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "accounts_read"  ON accounts;
DROP POLICY IF EXISTS "accounts_write" ON accounts;
DROP POLICY IF EXISTS "accounts_all"   ON accounts;

CREATE POLICY "accounts_read" ON accounts
  FOR SELECT USING (
    public.current_user_role() IN ('owner', 'admin')
    OR (
      public.current_user_role() = 'manager'
      AND (
        accounts.assigned_to_id = ANY(SELECT public.current_dept_user_ids())
        OR accounts.created_by_id = ANY(SELECT public.current_dept_user_ids())
      )
    )
    OR (
      public.current_user_role() = 'seller'
      AND (accounts.created_by_id = auth.uid() OR accounts.assigned_to_id = auth.uid())
    )
  );

CREATE POLICY "accounts_write" ON accounts
  FOR ALL USING (
    public.current_user_role() IN ('owner', 'admin')
    OR (
      public.current_user_role() = 'manager'
      AND (
        accounts.assigned_to_id = ANY(SELECT public.current_dept_user_ids())
        OR accounts.created_by_id = ANY(SELECT public.current_dept_user_ids())
      )
    )
    OR (
      public.current_user_role() = 'seller'
      AND (accounts.created_by_id = auth.uid() OR accounts.assigned_to_id = auth.uid())
    )
  )
  WITH CHECK (
    public.current_user_role() IN ('owner', 'admin', 'manager')
    OR (
      public.current_user_role() = 'seller'
      AND (accounts.created_by_id = auth.uid() OR accounts.assigned_to_id = auth.uid())
    )
  );

-- ── 4. Rewrite quotes policies ───────────────────────────────────────────────
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quotes_read"  ON quotes;
DROP POLICY IF EXISTS "quotes_write" ON quotes;
DROP POLICY IF EXISTS "quotes_all"   ON quotes;

CREATE POLICY "quotes_read" ON quotes
  FOR SELECT USING (
    public.current_user_role() IN ('owner', 'admin')
    OR (public.current_user_role() = 'manager' AND quotes.department_id = public.current_user_department_id())
    OR (
      public.current_user_role() = 'seller'
      AND (quotes.created_by_id = auth.uid() OR quotes.assigned_to_id = auth.uid())
    )
  );

CREATE POLICY "quotes_write" ON quotes
  FOR ALL USING (
    public.current_user_role() IN ('owner', 'admin')
    OR (public.current_user_role() = 'manager' AND quotes.department_id = public.current_user_department_id())
    OR (
      public.current_user_role() = 'seller'
      AND (quotes.created_by_id = auth.uid() OR quotes.assigned_to_id = auth.uid())
    )
  )
  WITH CHECK (
    public.current_user_role() IN ('owner', 'admin', 'manager')
    OR (
      public.current_user_role() = 'seller'
      AND (quotes.created_by_id = auth.uid() OR quotes.assigned_to_id = auth.uid())
    )
  );

-- ── 5. Rewrite quote_line_items policies ─────────────────────────────────────
ALTER TABLE quote_line_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quote_line_items_read"  ON quote_line_items;
DROP POLICY IF EXISTS "quote_line_items_write" ON quote_line_items;

CREATE POLICY "quote_line_items_read" ON quote_line_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM quotes q
      WHERE q.id = quote_line_items.quote_id AND (
        public.current_user_role() IN ('owner', 'admin')
        OR (public.current_user_role() = 'manager' AND q.department_id = public.current_user_department_id())
        OR (public.current_user_role() = 'seller' AND (q.created_by_id = auth.uid() OR q.assigned_to_id = auth.uid()))
      )
    )
  );

CREATE POLICY "quote_line_items_write" ON quote_line_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM quotes q
      WHERE q.id = quote_line_items.quote_id AND (
        public.current_user_role() IN ('owner', 'admin')
        OR (public.current_user_role() = 'manager' AND q.department_id = public.current_user_department_id())
        OR (public.current_user_role() = 'seller' AND (q.created_by_id = auth.uid() OR q.assigned_to_id = auth.uid()))
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM quotes q
      WHERE q.id = quote_line_items.quote_id AND (
        public.current_user_role() IN ('owner', 'admin', 'manager')
        OR (public.current_user_role() = 'seller' AND (q.created_by_id = auth.uid() OR q.assigned_to_id = auth.uid()))
      )
    )
  );

-- ── 6. Commission plans — preserve existing owner/admin-only write pattern ────
DROP POLICY IF EXISTS "commission_plans_write" ON commission_plans;
CREATE POLICY "commission_plans_write" ON commission_plans
  FOR ALL USING (public.current_user_role() IN ('owner', 'admin'));
