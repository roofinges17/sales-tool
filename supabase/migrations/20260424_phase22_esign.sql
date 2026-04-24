-- Phase 22: Electronic signature on the customer accept page.
-- customer_signature_data_url stores the base64 PNG of the customer's drawn signature.
-- signed_at records when the signature was captured (null = accepted without e-sign).

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS customer_signature_data_url TEXT,
  ADD COLUMN IF NOT EXISTS signed_at                   TIMESTAMPTZ;
