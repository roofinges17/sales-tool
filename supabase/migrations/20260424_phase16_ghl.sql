-- Phase 16: GHL integration columns

-- accounts: GHL contact link
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS ghl_contact_id TEXT,
  ADD COLUMN IF NOT EXISTS ghl_last_sync_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS accounts_ghl_contact_id_idx ON accounts(ghl_contact_id)
  WHERE ghl_contact_id IS NOT NULL;

-- quotes: GHL opportunity link
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS ghl_opportunity_id TEXT,
  ADD COLUMN IF NOT EXISTS ghl_last_sync_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS quotes_ghl_opportunity_id_idx ON quotes(ghl_opportunity_id)
  WHERE ghl_opportunity_id IS NOT NULL;

-- company_settings: GHL pipeline configuration
ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS ghl_pipeline_id TEXT,
  ADD COLUMN IF NOT EXISTS ghl_sent_stage_id TEXT,
  ADD COLUMN IF NOT EXISTS ghl_won_stage_id TEXT;
