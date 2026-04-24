-- C4: Company Settings extension + per-dept GHL sub-account fields
ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS license_number TEXT;

ALTER TABLE departments
  ADD COLUMN IF NOT EXISTS ghl_location_id TEXT,
  ADD COLUMN IF NOT EXISTS ghl_api_key TEXT;
