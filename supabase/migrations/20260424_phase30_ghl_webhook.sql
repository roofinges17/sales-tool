-- Phase 3.0: GHL contact webhook — auto-create customers from GHL ContactCreate events

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS ghl_location_id TEXT;

CREATE INDEX IF NOT EXISTS idx_accounts_ghl_contact_id
  ON accounts (ghl_contact_id)
  WHERE ghl_contact_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS ghl_webhook_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  received_at TIMESTAMPTZ DEFAULT now(),
  event_type TEXT,
  location_id TEXT,
  contact_id TEXT,
  action TEXT,
  customer_id UUID,
  payload JSONB,
  error TEXT
);
