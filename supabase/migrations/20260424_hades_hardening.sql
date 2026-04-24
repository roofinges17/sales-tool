-- Hades hardening pass — C2 + C5 schema changes.

-- C2: DB-level idempotency backstop on accept-automate.
-- Prevents duplicate sales rows if KV idempotency cache is bypassed
-- (e.g. two simultaneous accept requests both read accepted_at = NULL).
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_quote_id_unique
  ON sales (quote_id)
  WHERE quote_id IS NOT NULL;

-- C5: sanitised view so browser clients never see encrypted token columns.
-- accept-automate reads company_settings via service role (fine — it needs the tokens).
-- All other browser-side reads should query this view instead.
CREATE OR REPLACE VIEW company_settings_safe AS
SELECT
  id,
  company_name,
  company_email,
  company_phone,
  company_address,
  company_website,
  company_logo_url,
  company_license,
  contract_prefix,
  default_tax_rate,
  default_financing_provider,
  ghl_pipeline_id,
  ghl_won_stage_id,
  qb_realm_id,
  qb_token_expires_at,
  qb_last_sync_at,
  qb_sync_customers,
  qb_sync_invoices,
  qb_sync_payments,
  -- expose connected flag only; never expose the encrypted ciphertext
  (qb_access_token IS NOT NULL)::boolean AS qb_connected,
  created_at,
  updated_at
FROM company_settings;

GRANT SELECT ON company_settings_safe TO anon, authenticated;

COMMENT ON COLUMN company_settings.qb_access_token  IS 'AES-GCM ciphertext encrypted by QB_TOKEN_KEK CF env var';
COMMENT ON COLUMN company_settings.qb_refresh_token IS 'AES-GCM ciphertext encrypted by QB_TOKEN_KEK CF env var';
