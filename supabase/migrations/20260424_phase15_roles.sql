-- Phase 15: Role tier enforcement (owner / admin / manager / seller)

-- ── 1. Profiles: update role CHECK to canonical 4-tier set ───────────────────
-- Drop old constraint (may have been named differently across envs)
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- Add permissive constraint first so we can migrate rows without violating it
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('owner', 'admin', 'manager', 'seller', 'sales_manager', 'finance'));

-- Rename legacy role values
UPDATE profiles SET role = 'manager' WHERE role = 'sales_manager';
UPDATE profiles SET role = 'admin'   WHERE role = 'finance';

-- Now tighten to the 4 canonical tiers
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('owner', 'admin', 'manager', 'seller'));

-- ── 2. Accounts: tiered RLS ───────────────────────────────────────────────────
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "accounts_read"  ON accounts;
DROP POLICY IF EXISTS "accounts_write" ON accounts;
DROP POLICY IF EXISTS "accounts_all"   ON accounts;

-- Tiered read: owner/admin see all; manager sees accounts in their dept's user pool;
-- seller sees only accounts they created or are assigned to.
CREATE POLICY "accounts_read" ON accounts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND (
        p.role IN ('owner', 'admin')
        OR (
          p.role = 'manager'
          AND (
            accounts.assigned_to_id IN (
              SELECT id FROM profiles WHERE department_id = p.department_id
            )
            OR accounts.created_by_id IN (
              SELECT id FROM profiles WHERE department_id = p.department_id
            )
          )
        )
        OR (
          p.role = 'seller'
          AND (accounts.created_by_id = auth.uid() OR accounts.assigned_to_id = auth.uid())
        )
      )
    )
  );

-- Tiered write: mirrors read scope.
CREATE POLICY "accounts_write" ON accounts
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND (
        p.role IN ('owner', 'admin')
        OR (
          p.role = 'manager'
          AND (
            accounts.assigned_to_id IN (
              SELECT id FROM profiles WHERE department_id = p.department_id
            )
            OR accounts.created_by_id IN (
              SELECT id FROM profiles WHERE department_id = p.department_id
            )
          )
        )
        OR (
          p.role = 'seller'
          AND (accounts.created_by_id = auth.uid() OR accounts.assigned_to_id = auth.uid())
        )
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND (
        p.role IN ('owner', 'admin')
        OR p.role = 'manager'
        OR (
          p.role = 'seller'
          AND (accounts.created_by_id = auth.uid() OR accounts.assigned_to_id = auth.uid())
        )
      )
    )
  );

-- ── 3. Quotes: tiered RLS ────────────────────────────────────────────────────
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quotes_read"  ON quotes;
DROP POLICY IF EXISTS "quotes_write" ON quotes;
DROP POLICY IF EXISTS "quotes_all"   ON quotes;

-- quotes has department_id directly — clean manager scope
CREATE POLICY "quotes_read" ON quotes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND (
        p.role IN ('owner', 'admin')
        OR (p.role = 'manager' AND quotes.department_id = p.department_id)
        OR (
          p.role = 'seller'
          AND (quotes.created_by_id = auth.uid() OR quotes.assigned_to_id = auth.uid())
        )
      )
    )
  );

CREATE POLICY "quotes_write" ON quotes
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND (
        p.role IN ('owner', 'admin')
        OR (p.role = 'manager' AND quotes.department_id = p.department_id)
        OR (
          p.role = 'seller'
          AND (quotes.created_by_id = auth.uid() OR quotes.assigned_to_id = auth.uid())
        )
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND (
        p.role IN ('owner', 'admin')
        OR p.role = 'manager'
        OR (
          p.role = 'seller'
          AND (quotes.created_by_id = auth.uid() OR quotes.assigned_to_id = auth.uid())
        )
      )
    )
  );

-- ── 4. Quote line items: inherit quote access via parent quote ─────────────────
ALTER TABLE quote_line_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quote_line_items_read"  ON quote_line_items;
DROP POLICY IF EXISTS "quote_line_items_write" ON quote_line_items;

CREATE POLICY "quote_line_items_read" ON quote_line_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM quotes q
      JOIN profiles p ON p.id = auth.uid()
      WHERE q.id = quote_line_items.quote_id AND (
        p.role IN ('owner', 'admin')
        OR (p.role = 'manager' AND q.department_id = p.department_id)
        OR (p.role = 'seller' AND (q.created_by_id = auth.uid() OR q.assigned_to_id = auth.uid()))
      )
    )
  );

CREATE POLICY "quote_line_items_write" ON quote_line_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM quotes q
      JOIN profiles p ON p.id = auth.uid()
      WHERE q.id = quote_line_items.quote_id AND (
        p.role IN ('owner', 'admin')
        OR (p.role = 'manager' AND q.department_id = p.department_id)
        OR (p.role = 'seller' AND (q.created_by_id = auth.uid() OR q.assigned_to_id = auth.uid()))
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM quotes q
      JOIN profiles p ON p.id = auth.uid()
      WHERE q.id = quote_line_items.quote_id AND (
        p.role IN ('owner', 'admin')
        OR p.role = 'manager'
        OR (p.role = 'seller' AND (q.created_by_id = auth.uid() OR q.assigned_to_id = auth.uid()))
      )
    )
  );

-- ── 5. Profiles: all authenticated users can read profiles (needed for joins) ──
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_read"  ON profiles;
DROP POLICY IF EXISTS "profiles_write" ON profiles;

CREATE POLICY "profiles_read" ON profiles
  FOR SELECT USING (auth.role() = 'authenticated');

-- Only owner/admin can manage user records; users can update their own profile
CREATE POLICY "profiles_write" ON profiles
  FOR ALL USING (
    auth.uid() = profiles.id
    OR EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    auth.uid() = profiles.id
    OR EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('owner', 'admin')
    )
  );
