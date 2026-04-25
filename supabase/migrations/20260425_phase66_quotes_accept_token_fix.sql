-- Phase 6.6: Close quotes accept_token enumeration leak
--
-- Root cause: anon_read_by_accept_token policy used USING(accept_token IS NOT NULL)
-- which allowed any anon user to paginate ALL quotes where accept_token is set
-- (i.e. every SENT quote). Exploit: GET /rest/v1/quotes?select=id,accept_token
-- returned real quote IDs and tokens without any filter.
--
-- Fix: Replace open anon policy with SECURITY DEFINER function that enforces
-- exact-token match server-side. Anon loses all direct quotes table access.
-- /accept page updated to use .rpc() instead of direct table query.

DROP POLICY IF EXISTS "anon_read_by_accept_token" ON public.quotes;
DROP POLICY IF EXISTS "quotes_select" ON public.quotes;

-- Single-row lookup by accept_token — no enumeration possible
-- search_path locked to prevent search_path injection
-- REVOKE PUBLIC then GRANT to anon only
CREATE OR REPLACE FUNCTION public.get_quote_by_accept_token(p_token uuid)
RETURNS TABLE (
  id                          uuid,
  name                        text,
  total                       numeric,
  status                      text,
  accepted_at                 timestamptz,
  signed_at                   timestamptz,
  customer_signature_data_url text,
  roof_color                  text,
  visualizer_image_url        text,
  account_name                text
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
    SELECT
      q.id,
      q.name,
      q.total,
      q.status,
      q.accepted_at,
      q.signed_at,
      q.customer_signature_data_url,
      q.roof_color,
      q.visualizer_image_url,
      a.name AS account_name
    FROM quotes q
    LEFT JOIN accounts a ON a.id = q.account_id
    WHERE q.accept_token = p_token
    LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.get_quote_by_accept_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_quote_by_accept_token(uuid) TO anon;

-- quotes_read and quotes_write remain unchanged (role-gated, correct)
