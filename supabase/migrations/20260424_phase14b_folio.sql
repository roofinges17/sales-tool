-- Phase 14b: Add folio column to roof_measurements
ALTER TABLE roof_measurements ADD COLUMN IF NOT EXISTS folio text;
COMMENT ON COLUMN roof_measurements.folio IS 'Miami-Dade or Broward county property folio number, auto-looked up at PDF download';
