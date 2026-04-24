-- Add folio_number column to quotes table
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS folio_number TEXT;
