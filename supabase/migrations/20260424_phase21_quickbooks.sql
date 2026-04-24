-- Phase 21: QuickBooks Integration
-- Stores OAuth tokens on the singleton company_settings row.
-- qb_sync_log captures each sync run for the history table in the UI.

ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS qb_realm_id        TEXT,
  ADD COLUMN IF NOT EXISTS qb_access_token    TEXT,
  ADD COLUMN IF NOT EXISTS qb_refresh_token   TEXT,
  ADD COLUMN IF NOT EXISTS qb_token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS qb_sync_customers  BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS qb_sync_products   BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS qb_sync_invoices   BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS qb_sync_log (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sync_type      TEXT        NOT NULL,  -- 'customers' | 'products' | 'invoices' | 'full'
  status         TEXT        NOT NULL DEFAULT 'pending', -- 'pending' | 'running' | 'success' | 'error'
  records_synced INTEGER     NOT NULL DEFAULT 0,
  error_message  TEXT
);

ALTER TABLE qb_sync_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin only" ON qb_sync_log USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'admin'))
);
