-- Phase 3.1.2: Products RLS — block seller direct access to base products table
--
-- Phase 3.1.1 routed sellers through products_seller_view (no cost column),
-- but sellers could still do sb.from('products').select('cost') in devtools and
-- see cost values directly from the base table.
--
-- This migration closes that gap with RLS:
--   - Enable RLS on products
--   - Drop any stale open SELECT policy from earlier phases
--   - Add SELECT policy: only manager/admin/owner can query base table (includes cost)
--   - Add INSERT/UPDATE/DELETE policies: same manager/admin/owner guard
--   - Sellers querying products directly get 0 rows (RLS filters everything)
--   - Sellers querying products_seller_view still get rows: the view owner
--     (postgres superuser) bypasses RLS when resolving the view body
--   - Step2Products branches by role: seller → products_seller_view, manager+ → products
--   - /admin/settings/products page unchanged — manager/admin/owner pass all policies

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Drop any stale open policies that may exist from earlier phases
DROP POLICY IF EXISTS "products_select" ON public.products;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.products;
DROP POLICY IF EXISTS "Allow authenticated select" ON public.products;
-- products_write is an ALL USING(true) catch-all that overrides role-gated policies
DROP POLICY IF EXISTS products_write ON public.products;

-- SELECT: manager/admin/owner only (sellers get 0 rows — no cost column exposure)
CREATE POLICY products_select_manager_plus ON public.products
  FOR SELECT
  TO authenticated
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('manager', 'admin', 'owner')
  );

-- INSERT: manager/admin/owner only (admin settings page)
CREATE POLICY products_insert_manager_plus ON public.products
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('manager', 'admin', 'owner')
  );

-- UPDATE: manager/admin/owner only (admin settings page)
CREATE POLICY products_update_manager_plus ON public.products
  FOR UPDATE
  TO authenticated
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('manager', 'admin', 'owner')
  )
  WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('manager', 'admin', 'owner')
  );

-- DELETE: manager/admin/owner only (admin settings page)
CREATE POLICY products_delete_manager_plus ON public.products
  FOR DELETE
  TO authenticated
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('manager', 'admin', 'owner')
  );

-- products_seller_view already has GRANT SELECT to authenticated (Phase 3.1.1).
-- The view is owned by the postgres superuser which bypasses RLS on the base table,
-- so seller queries to the view still resolve and return cost-stripped rows.
