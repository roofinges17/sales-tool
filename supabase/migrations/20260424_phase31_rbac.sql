-- Phase 3.1: Activate role-based data scoping
--
-- Root cause: Phase 15 and 16b wrote correct tiered policies (accounts_read,
-- quotes_read) but two earlier permissive policies still exist:
--   accounts_select: USING (true)   ← overrides accounts_read for all users
--   quotes_select:   USING (true)   ← overrides quotes_read for all users
--
-- In PostgreSQL permissive-policy mode, any TRUE policy grants access regardless
-- of other restrictive policies. Dropping these two unlocks the 4-tier RLS.

-- 1. Remove permissive override policies
DROP POLICY IF EXISTS "accounts_select" ON accounts;
DROP POLICY IF EXISTS "quotes_select"   ON quotes;

-- 2. Backfill: profiles with NULL role become seller (least-privilege)
UPDATE profiles SET role = 'seller' WHERE role IS NULL;

-- 3. Audit log for blocked seller actions (discount cap, etc.)
CREATE TABLE IF NOT EXISTS rbac_block_log (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at    timestamptz DEFAULT now(),
  user_id       uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  role          text,
  action        text        NOT NULL,
  blocked_value text
);
