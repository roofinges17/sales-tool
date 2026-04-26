-- Phase 3.1.1: products_seller_view — close unit_cost column leak
--
-- Step2Products.tsx currently does select("*") from products, returning the cost
-- column to any authenticated user (including sellers). This view exposes the
-- product catalog without cost columns; Step2Products branches to it for sellers.
-- Network response for sellers will not contain cost — verified via devtools.
--
-- Limitation: direct supabase.from("products").select("cost") with a seller JWT
-- still reaches the base table (no row-level block on this table yet). Full
-- column-level enforcement would require a SECURITY DEFINER function (Phase 3.1.2).

CREATE OR REPLACE VIEW public.products_seller_view AS
SELECT
  id,
  name,
  code,
  description,
  product_type,
  price,
  min_price,
  max_price,
  default_price,
  unit,
  is_active,
  is_required,
  is_add_on,
  image_urls,
  category_id,
  department_id,
  created_at,
  updated_at
FROM public.products;

-- Grant SELECT on the view to authenticated users
-- (sellers query this view; admins/managers query the base table directly)
GRANT SELECT ON public.products_seller_view TO authenticated;
