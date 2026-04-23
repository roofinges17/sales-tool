-- Phase 13 migrations
-- Run in Supabase SQL editor or via supabase db push

-- 1. Add accept_token to quotes
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS accept_token UUID UNIQUE DEFAULT NULL;

CREATE INDEX IF NOT EXISTS quotes_accept_token_idx ON quotes(accept_token) WHERE accept_token IS NOT NULL;

-- 2. Commission plans table (matches source app column names)
CREATE TABLE IF NOT EXISTS commission_plans (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL UNIQUE,
  description           TEXT,
  department            TEXT NOT NULL DEFAULT 'Roofing',
  lead_source           TEXT NOT NULL DEFAULT 'ALL',
  manager_percentage    NUMERIC(6,2) NOT NULL DEFAULT 18,
  special_percentage    NUMERIC(6,2) NOT NULL DEFAULT 5,
  system_percentage     NUMERIC(6,2) NOT NULL DEFAULT 5,
  company_percentage    NUMERIC(6,2) NOT NULL DEFAULT 72,
  primary_split_ratio   NUMERIC(6,2) NOT NULL DEFAULT 70,
  secondary_split_ratio NUMERIC(6,2) NOT NULL DEFAULT 30,
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE commission_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "commission_plans_read" ON commission_plans
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY IF NOT EXISTS "commission_plans_write" ON commission_plans
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- 3. Seed commission plans (idempotent)
INSERT INTO commission_plans (name, description, department, lead_source, manager_percentage, special_percentage, system_percentage, company_percentage, primary_split_ratio, secondary_split_ratio, is_active)
VALUES
  ('Standard Roofing', 'Default plan for roofing sales', 'Roofing', 'ALL', 18, 5, 5, 72, 70, 30, true),
  ('Referral Plan',    'For referral-sourced leads',    'Roofing', 'Referral',   18, 5, 5, 72, 100, 0, true),
  ('Door Knock Plan',  'Self-generated leads',          'Roofing', 'Door Knock', 18, 5, 5, 72, 100, 0, true)
ON CONFLICT (name) DO NOTHING;

-- 4. Seed products (exact values from Alejandro)
INSERT INTO products (name, code, type, department, default_price, min_price, max_price, unit, is_active)
VALUES
  ('ALUMINUM ROOF',           'ALUMINUM',         'PRODUCT', 'Roofing', 1500.00, 1400.00, 1500.00, 'sq ft', true),
  ('FLAT ROOF',               'FLAT',             'PRODUCT', 'Roofing',  750.00,  725.00,  850.00, 'sq ft', true),
  ('FLAT ROOF + INSULATIONS', 'FLAT INSULATIONS', 'PRODUCT', 'Roofing', 1000.00,  900.00, 1050.00, 'sq ft', true),
  ('METAL ROOF',              'METAL',            'PRODUCT', 'Roofing', 1200.00, 1175.00, 1300.00, 'sq ft', true),
  ('SHINGLE ROOF',            'SHINGLE',          'PRODUCT', 'Roofing',  700.00,  725.00,  700.00, 'sq ft', true),
  ('TILE ROOF',               'TILE',             'PRODUCT', 'Roofing', 1200.00, 1100.00, 1200.00, 'sq ft', true),
  ('SOFFIT & FASCIA',         'SOFFIT & FASCIA',  'PRODUCT', 'Roofing',   20.00,    0.00,    0.00, 'ln ft', true),
  ('METAL FASCIA',            'METAL FASCIA',     'PRODUCT', 'Roofing',   20.00,    0.00,    0.00, 'ln ft', true),
  ('GUTTERS',                 'GUTTERS',          'PRODUCT', 'Roofing',    0.00,    0.00,    0.00, 'ln ft', true),
  ('INSULATION',              'INSULATION',       'PRODUCT', 'Roofing',    0.00,    0.00,    0.00, 'sq ft', true)
ON CONFLICT (code) DO UPDATE SET
  name          = EXCLUDED.name,
  default_price = EXCLUDED.default_price,
  min_price     = EXCLUDED.min_price,
  max_price     = EXCLUDED.max_price,
  unit          = EXCLUDED.unit,
  is_active     = EXCLUDED.is_active;

-- 5. Seed lead sources
INSERT INTO lead_sources (name, code, seller_share_percent, is_active)
VALUES
  ('Website',         'WEBSITE',    100, true),
  ('Referral',        'REFERRAL',   100, true),
  ('Door Knock',      'DOOR_KNOCK', 100, true),
  ('Insurance Claim', 'INSURANCE',  100, true),
  ('Social Media',    'SOCIAL',     100, true),
  ('GHL / CRM',       'GHL',        100, true)
ON CONFLICT (code) DO NOTHING;
