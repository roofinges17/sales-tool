-- Phase 13 migrations
-- Run in Supabase SQL editor or via Management API

-- 1. Add accept_token to quotes
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS accept_token UUID UNIQUE DEFAULT NULL;

CREATE INDEX IF NOT EXISTS quotes_accept_token_idx ON quotes(accept_token) WHERE accept_token IS NOT NULL;

-- 2. RLS for commission_plans (table created in Phase 4)
ALTER TABLE commission_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "commission_plans_read" ON commission_plans;
CREATE POLICY "commission_plans_read" ON commission_plans
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "commission_plans_write" ON commission_plans;
CREATE POLICY "commission_plans_write" ON commission_plans
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Add UNIQUE on commission_plans.name (needed for ON CONFLICT)
-- Postgres doesn't support ADD CONSTRAINT IF NOT EXISTS — use DO block
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'commission_plans_name_key'
  ) THEN
    ALTER TABLE commission_plans
      ADD CONSTRAINT commission_plans_name_key UNIQUE (name);
  END IF;
END $$;

-- 2b. Widen percentage columns from NUMERIC(6,4) to NUMERIC(7,4) so 100.0000 fits
ALTER TABLE commission_plans
  ALTER COLUMN seller_percentage         TYPE NUMERIC(7,4),
  ALTER COLUMN secondary_seller_percentage TYPE NUMERIC(7,4),
  ALTER COLUMN manager_percentage        TYPE NUMERIC(7,4),
  ALTER COLUMN owner_percentage          TYPE NUMERIC(7,4),
  ALTER COLUMN company_percentage        TYPE NUMERIC(7,4),
  ALTER COLUMN primary_split_ratio       TYPE NUMERIC(7,4),
  ALTER COLUMN secondary_split_ratio     TYPE NUMERIC(7,4),
  ALTER COLUMN upfront_percentage        TYPE NUMERIC(7,4),
  ALTER COLUMN monthly_percentage        TYPE NUMERIC(7,4);

-- 3. Seed commission plans (idempotent via ON CONFLICT on name)
INSERT INTO commission_plans (
  name, description, lead_source, department_id,
  manager_percentage, owner_percentage, seller_percentage, secondary_seller_percentage, company_percentage,
  primary_split_ratio, secondary_split_ratio,
  upfront_percentage, is_active
)
SELECT
  'Standard Roofing', 'Default plan for roofing sales', 'ALL', d.id,
  18, 5, 5, 0, 72, 70, 30, NULL, true
FROM departments d WHERE d.name = 'Roofing'
ON CONFLICT (name) DO NOTHING;

INSERT INTO commission_plans (
  name, description, lead_source, department_id,
  manager_percentage, owner_percentage, seller_percentage, secondary_seller_percentage, company_percentage,
  primary_split_ratio, secondary_split_ratio,
  upfront_percentage, is_active
)
SELECT
  'Referral Plan', 'For referral-sourced leads', 'Referral', d.id,
  18, 5, 5, 0, 72, 100, 0, NULL, true
FROM departments d WHERE d.name = 'Roofing'
ON CONFLICT (name) DO NOTHING;

INSERT INTO commission_plans (
  name, description, lead_source, department_id,
  manager_percentage, owner_percentage, seller_percentage, secondary_seller_percentage, company_percentage,
  primary_split_ratio, secondary_split_ratio,
  upfront_percentage, is_active
)
SELECT
  'Door Knock Plan', 'Self-generated leads', 'Door Knock', d.id,
  18, 5, 5, 0, 72, 100, 0, NULL, true
FROM departments d WHERE d.name = 'Roofing'
ON CONFLICT (name) DO NOTHING;

-- 4. Seed products (actual columns: product_type, department_id FK, no UNIQUE on code → WHERE NOT EXISTS)
INSERT INTO products (name, code, description, product_type, department_id, default_price, min_price, max_price, unit, is_active)
SELECT 'ALUMINUM ROOF', 'ALUMINUM', 'Aluminum roofing', 'PRODUCT', d.id, 1500.00, 1400.00, 1500.00, 'sq ft', true
FROM departments d WHERE d.name = 'Roofing' AND NOT EXISTS (SELECT 1 FROM products WHERE code = 'ALUMINUM');

INSERT INTO products (name, code, description, product_type, department_id, default_price, min_price, max_price, unit, is_active)
SELECT 'FLAT ROOF', 'FLAT', 'Flat roof', 'PRODUCT', d.id, 750.00, 725.00, 850.00, 'sq ft', true
FROM departments d WHERE d.name = 'Roofing' AND NOT EXISTS (SELECT 1 FROM products WHERE code = 'FLAT');

INSERT INTO products (name, code, description, product_type, department_id, default_price, min_price, max_price, unit, is_active)
SELECT 'FLAT ROOF + INSULATIONS', 'FLAT INSULATIONS', 'Flat roof with insulation', 'PRODUCT', d.id, 1000.00, 900.00, 1050.00, 'sq ft', true
FROM departments d WHERE d.name = 'Roofing' AND NOT EXISTS (SELECT 1 FROM products WHERE code = 'FLAT INSULATIONS');

INSERT INTO products (name, code, description, product_type, department_id, default_price, min_price, max_price, unit, is_active)
SELECT 'METAL ROOF', 'METAL', 'Metal roofing', 'PRODUCT', d.id, 1200.00, 1175.00, 1300.00, 'sq ft', true
FROM departments d WHERE d.name = 'Roofing' AND NOT EXISTS (SELECT 1 FROM products WHERE code = 'METAL');

INSERT INTO products (name, code, description, product_type, department_id, default_price, min_price, max_price, unit, is_active)
SELECT 'SHINGLE ROOF', 'SHINGLE', 'Shingle roofing', 'PRODUCT', d.id, 700.00, 725.00, 700.00, 'sq ft', true
FROM departments d WHERE d.name = 'Roofing' AND NOT EXISTS (SELECT 1 FROM products WHERE code = 'SHINGLE');

INSERT INTO products (name, code, description, product_type, department_id, default_price, min_price, max_price, unit, is_active)
SELECT 'TILE ROOF', 'TILE', 'Tile roofing', 'PRODUCT', d.id, 1200.00, 1100.00, 1200.00, 'sq ft', true
FROM departments d WHERE d.name = 'Roofing' AND NOT EXISTS (SELECT 1 FROM products WHERE code = 'TILE');

INSERT INTO products (name, code, description, product_type, department_id, default_price, min_price, max_price, unit, is_active)
SELECT 'SOFFIT & FASCIA', 'SOFFIT & FASCIA', 'Soffit and fascia', 'PRODUCT', d.id, 20.00, 0.00, 0.00, 'ln ft', true
FROM departments d WHERE d.name = 'Roofing' AND NOT EXISTS (SELECT 1 FROM products WHERE code = 'SOFFIT & FASCIA');

INSERT INTO products (name, code, description, product_type, department_id, default_price, min_price, max_price, unit, is_active)
SELECT 'METAL FASCIA', 'METAL FASCIA', 'Metal fascia', 'PRODUCT', d.id, 20.00, 0.00, 0.00, 'ln ft', true
FROM departments d WHERE d.name = 'Roofing' AND NOT EXISTS (SELECT 1 FROM products WHERE code = 'METAL FASCIA');

INSERT INTO products (name, code, description, product_type, department_id, default_price, min_price, max_price, unit, is_active)
SELECT 'GUTTERS', 'GUTTERS', 'Gutters', 'PRODUCT', d.id, 0.00, 0.00, 0.00, 'ln ft', true
FROM departments d WHERE d.name = 'Roofing' AND NOT EXISTS (SELECT 1 FROM products WHERE code = 'GUTTERS');

INSERT INTO products (name, code, description, product_type, department_id, default_price, min_price, max_price, unit, is_active)
SELECT 'INSULATION', 'INSULATION', 'Insulation', 'PRODUCT', d.id, 0.00, 0.00, 0.00, 'sq ft', true
FROM departments d WHERE d.name = 'Roofing' AND NOT EXISTS (SELECT 1 FROM products WHERE code = 'INSULATION');

-- 5. Seed lead sources (actual column: value NOT code; UNIQUE on value)
INSERT INTO lead_sources (name, value, seller_share_percent, is_active)
VALUES
  ('Website',         'WEBSITE',    100, true),
  ('Referral',        'REFERRAL',   100, true),
  ('Door Knock',      'DOOR_KNOCK', 100, true),
  ('Insurance Claim', 'INSURANCE',  100, true),
  ('Social Media',    'SOCIAL',     100, true),
  ('GHL / CRM',       'GHL',        100, true)
ON CONFLICT (value) DO NOTHING;
