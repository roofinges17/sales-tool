-- Phase A-2: Social Lead Intake
-- Adds social_lead_log (idempotency + status) and round-robin pointer to profiles.
-- Covers: Facebook, Instagram, TikTok, Google Ads webhook intake.

-- ─── 1. Round-robin assignment state on profiles ──────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS social_lead_last_assigned_at TIMESTAMPTZ;

-- ─── 2. Social lead log (idempotency + async fetch tracking) ──────────────────

CREATE TABLE IF NOT EXISTS public.social_lead_log (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  platform          TEXT        NOT NULL CHECK (platform IN ('facebook','instagram','tiktok','google_ads')),
  platform_lead_id  TEXT        NOT NULL,
  -- pending_lead_fetch: FB/IG leadgen_id stored; contact fields backfilled once PAGE_ACCESS_TOKEN arrives
  status            TEXT        NOT NULL DEFAULT 'complete'
                                CHECK (status IN ('pending_lead_fetch','complete','error')),
  contact_id        UUID        REFERENCES public.contacts(id) ON DELETE SET NULL,
  opportunity_id    UUID        REFERENCES public.opportunities(id) ON DELETE SET NULL,
  assigned_to_id    UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  raw_payload       JSONB,
  error             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (platform, platform_lead_id)
);

CREATE INDEX IF NOT EXISTS idx_social_lead_log_platform_id
  ON public.social_lead_log (platform, platform_lead_id);

CREATE INDEX IF NOT EXISTS idx_social_lead_log_pending
  ON public.social_lead_log (status)
  WHERE status = 'pending_lead_fetch';

ALTER TABLE public.social_lead_log ENABLE ROW LEVEL SECURITY;

-- Service role (webhook handlers) can write; authenticated users can read for pipeline visibility
DROP POLICY IF EXISTS "social_lead_log_read" ON public.social_lead_log;
CREATE POLICY "social_lead_log_read" ON public.social_lead_log
  FOR SELECT USING (auth.role() = 'authenticated');

-- ─── 3. Verification ──────────────────────────────────────────────────────────
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name='profiles' AND column_name='social_lead_last_assigned_at';
-- SELECT count(*) FROM public.social_lead_log;  -- expect 0 (empty)
