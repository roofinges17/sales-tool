-- Integration settings expansion.
-- GHL PIT token stored in DB so it can be rotated via the admin UI
-- without requiring a Cloudflare env-var redeploy.

ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS ghl_pit_token TEXT,
  ADD COLUMN IF NOT EXISTS ghl_default_location_id TEXT;

COMMENT ON COLUMN company_settings.ghl_pit_token
  IS 'GoHighLevel Private Integration Token — rotatable via /admin/settings/gohighlevel/. Falls back to GHL_PIT env var if NULL.';

COMMENT ON COLUMN company_settings.ghl_default_location_id
  IS 'Active GHL sub-account location ID. Defaults to hardcoded DfkEocSccdPsDcgqrJug if NULL.';
