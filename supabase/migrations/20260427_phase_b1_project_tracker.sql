-- B-1 M1: Project Tracker foundation
-- crews / jobs / job_payments / job_documents / job_photos / job_updates
-- Pure additive — no DROP, no ALTER on existing tables.

CREATE TABLE IF NOT EXISTS public.crews (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  lead_id    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  members    UUID[] NOT NULL DEFAULT '{}',
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.jobs (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id           UUID REFERENCES public.quotes(id) ON DELETE SET NULL,
  contact_id         UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  ghl_opportunity_id TEXT,
  job_type           TEXT NOT NULL DEFAULT 'standard'
                       CHECK (job_type IN ('standard', 'reroofing')),
  stage              INTEGER NOT NULL DEFAULT 0,
  address            TEXT,
  crew_id            UUID REFERENCES public.crews(id) ON DELETE SET NULL,
  scheduled_date     DATE,
  contract_price     NUMERIC(12,2),
  roof_type          TEXT,
  roof_color         TEXT,
  roof_size_sqft     NUMERIC(10,2),
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS jobs_contact_id_idx ON public.jobs(contact_id);
CREATE INDEX IF NOT EXISTS jobs_crew_id_idx ON public.jobs(crew_id);
CREATE INDEX IF NOT EXISTS jobs_stage_idx ON public.jobs(stage);
CREATE INDEX IF NOT EXISTS jobs_ghl_opp_idx ON public.jobs(ghl_opportunity_id)
  WHERE ghl_opportunity_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.job_payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  payment_number  INTEGER NOT NULL CHECK (payment_number BETWEEN 1 AND 4),
  percentage      INTEGER NOT NULL,
  amount          NUMERIC(12,2),
  method          TEXT CHECK (method IN ('cash','check','financing','card','other')),
  collected_by_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  collected_at    TIMESTAMPTZ,
  notes           TEXT,
  UNIQUE (job_id, payment_number)
);

CREATE TABLE IF NOT EXISTS public.job_documents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id      UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  doc_type    TEXT NOT NULL CHECK (doc_type IN ('contract','permit','warranty','other')),
  url         TEXT NOT NULL,
  label       TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.job_photos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id      UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  category    TEXT NOT NULL CHECK (category IN ('before','during','after','drone','other')),
  url         TEXT NOT NULL,
  caption     TEXT,
  uploaded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  taken_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS job_photos_job_cat_idx ON public.job_photos(job_id, category);

CREATE TABLE IF NOT EXISTS public.job_updates (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id     UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  author_id  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS job_updates_job_created_idx ON public.job_updates(job_id, created_at DESC);
