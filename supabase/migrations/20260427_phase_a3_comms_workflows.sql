-- Phase A-3: Conversations + Twilio SMS + Resend Email + Workflow Engine
-- Creates: workflows, workflow_steps, workflow_runs, message_templates,
--          conversations, messages tables.
-- All idempotent (IF NOT EXISTS / DO NOTHING).

-- ─── 1. Workflow definitions ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.workflows (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT        NOT NULL,
  ghl_name      TEXT,                       -- original GHL workflow name for traceability
  trigger_type  TEXT        NOT NULL
                            CHECK (trigger_type IN (
                              'stage_enter','time_delay','inbound_lead','manual','payment_event'
                            )),
  trigger_meta  JSONB       NOT NULL DEFAULT '{}',
  -- e.g. {"stage_ghl_id": "...", "delay_minutes": 60}
  is_active     BOOLEAN     NOT NULL DEFAULT false,
  priority      TEXT        NOT NULL DEFAULT 'P1'
                            CHECK (priority IN ('P0','P1','P2')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.workflows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "workflows_read" ON public.workflows;
CREATE POLICY "workflows_read" ON public.workflows
  FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "workflows_write" ON public.workflows;
CREATE POLICY "workflows_write" ON public.workflows
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('owner','admin','manager'))
  );

-- ─── 2. Workflow steps ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.workflow_steps (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id   UUID        NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  step_order    INT         NOT NULL,
  action_type   TEXT        NOT NULL
                            CHECK (action_type IN (
                              'send_sms','send_email','update_stage',
                              'assign_rep','wait','branch','notify_rep'
                            )),
  action_config JSONB       NOT NULL DEFAULT '{}',
  -- e.g. {"template_slug": "new_lead_welcome", "lang_field": "preferred_language"}
  -- e.g. {"delay_minutes": 60}
  -- e.g. {"stage_ghl_id": "..."}
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workflow_id, step_order)
);

CREATE INDEX IF NOT EXISTS idx_workflow_steps_workflow_id
  ON public.workflow_steps (workflow_id, step_order);

ALTER TABLE public.workflow_steps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "workflow_steps_read" ON public.workflow_steps;
CREATE POLICY "workflow_steps_read" ON public.workflow_steps
  FOR SELECT USING (auth.role() = 'authenticated');

-- ─── 3. Workflow execution log ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.workflow_runs (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id    UUID        NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  contact_id     UUID        NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  opportunity_id UUID        REFERENCES public.opportunities(id) ON DELETE SET NULL,
  status         TEXT        NOT NULL DEFAULT 'running'
                             CHECK (status IN ('running','completed','failed','cancelled')),
  current_step   INT         NOT NULL DEFAULT 0,
  started_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at   TIMESTAMPTZ,
  error          TEXT
);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_contact
  ON public.workflow_runs (contact_id, workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_status
  ON public.workflow_runs (status) WHERE status = 'running';

ALTER TABLE public.workflow_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "workflow_runs_read" ON public.workflow_runs;
CREATE POLICY "workflow_runs_read" ON public.workflow_runs
  FOR SELECT USING (auth.role() = 'authenticated');

-- ─── 4. Message templates (bilingual) ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.message_templates (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT        NOT NULL,
  channel     TEXT        NOT NULL CHECK (channel IN ('sms','email')),
  lang        TEXT        NOT NULL CHECK (lang IN ('en','es')),
  subject     TEXT,                   -- email only
  body        TEXT        NOT NULL,   -- {{contact.first_name}} Handlebars-lite vars
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (slug, channel, lang)
);

ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "message_templates_read" ON public.message_templates;
CREATE POLICY "message_templates_read" ON public.message_templates
  FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "message_templates_write" ON public.message_templates;
CREATE POLICY "message_templates_write" ON public.message_templates
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('owner','admin','manager'))
  );

-- ─── 5. Conversations (3-channel unified threads) ─────────────────────────────

CREATE TABLE IF NOT EXISTS public.conversations (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id      UUID        NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  channel         TEXT        NOT NULL CHECK (channel IN ('sms','email','voice')),
  ghl_convo_id    TEXT        UNIQUE,   -- original GHL conversation ID (for future backfill)
  last_message_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (contact_id, channel)          -- one thread per channel per contact
);

CREATE INDEX IF NOT EXISTS idx_conversations_contact
  ON public.conversations (contact_id, channel);
CREATE INDEX IF NOT EXISTS idx_conversations_recent
  ON public.conversations (last_message_at DESC NULLS LAST);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "conversations_read" ON public.conversations;
CREATE POLICY "conversations_read" ON public.conversations
  FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "conversations_write" ON public.conversations;
CREATE POLICY "conversations_write" ON public.conversations
  FOR ALL USING (auth.role() = 'authenticated');

-- ─── 6. Messages ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.messages (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  UUID        NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  direction        TEXT        NOT NULL CHECK (direction IN ('outbound','inbound')),
  body             TEXT,
  subject          TEXT,                -- email only
  status           TEXT        NOT NULL DEFAULT 'sent'
                               CHECK (status IN ('queued','sent','delivered','failed','received')),
  twilio_sid       TEXT,                -- Twilio MessageSid for status callbacks
  resend_id        TEXT,                -- Resend message ID
  sent_by_id       UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  workflow_step_id UUID        REFERENCES public.workflow_steps(id) ON DELETE SET NULL,
  sent_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation
  ON public.messages (conversation_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_twilio_sid
  ON public.messages (twilio_sid) WHERE twilio_sid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_status
  ON public.messages (status, sent_at DESC);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "messages_read" ON public.messages;
CREATE POLICY "messages_read" ON public.messages
  FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "messages_write" ON public.messages;
CREATE POLICY "messages_write" ON public.messages
  FOR ALL USING (auth.role() = 'authenticated');

-- ─── 7. Seed: bilingual message templates (P0 batch) ─────────────────────────

INSERT INTO public.message_templates (slug, channel, lang, body) VALUES
  ('new_lead_welcome',        'sms', 'en', 'Hi {{contact.first_name}}! Thanks for reaching out to Roofing Experts. A specialist will contact you shortly to discuss your roofing needs. Reply STOP to opt out.'),
  ('new_lead_welcome',        'sms', 'es', 'Hola {{contact.first_name}}! Gracias por contactar a Roofing Experts. Un especialista te contactará pronto para hablar sobre tus necesidades de techo. Responde STOP para cancelar.'),
  ('waiting_for_address',     'sms', 'en', 'Hi {{contact.first_name}}, we need your property address to prepare your free estimate. Please reply with your address or call us at your earliest convenience.'),
  ('waiting_for_address',     'sms', 'es', 'Hola {{contact.first_name}}, necesitamos la dirección de tu propiedad para preparar tu estimado gratuito. Por favor responde con tu dirección o llámanos cuando puedas.'),
  ('estimate_sent',           'sms', 'en', 'Hi {{contact.first_name}}, your roofing estimate is ready! Check your email or click here to review: {{estimate_url}}'),
  ('estimate_sent',           'sms', 'es', 'Hola {{contact.first_name}}, ¡tu estimado de techo está listo! Revisa tu correo o haz clic aquí: {{estimate_url}}'),
  ('estimate_sent',           'email','en', 'Your Roofing Estimate Is Ready'),
  ('estimate_sent',           'email','es', 'Tu Estimado de Techo Está Listo'),
  ('estimate_approved',       'sms', 'en', 'Great news, {{contact.first_name}}! Your estimate has been approved. We will follow up shortly with next steps.'),
  ('estimate_approved',       'sms', 'es', '¡Buenas noticias, {{contact.first_name}}! Tu estimado ha sido aprobado. Te contactaremos pronto con los próximos pasos.'),
  ('appt_reminder_24h',       'sms', 'en', 'Reminder: Your roofing appointment is tomorrow. Reply to confirm or call us to reschedule.'),
  ('appt_reminder_24h',       'sms', 'es', 'Recordatorio: Tu cita de techo es mañana. Responde para confirmar o llámanos para reprogramar.'),
  ('appt_reminder_1h',        'sms', 'en', 'Your roofing appointment is in 1 hour. See you soon!'),
  ('appt_reminder_1h',        'sms', 'es', 'Tu cita de techo es en 1 hora. ¡Hasta pronto!'),
  ('hot_lead_follow_up',      'sms', 'en', 'Hi {{contact.first_name}}, just checking in! Are you still interested in a free roofing estimate? We are here to help.'),
  ('hot_lead_follow_up',      'sms', 'es', 'Hola {{contact.first_name}}, ¡solo saludando! ¿Sigues interesado en un estimado gratuito de techo? Estamos aquí para ayudarte.'),
  ('cold_lead_reactivation',  'sms', 'en', 'Hi {{contact.first_name}}, it has been a while! We have new promotions available. Interested in a free roof inspection? Reply YES to learn more.'),
  ('cold_lead_reactivation',  'sms', 'es', 'Hola {{contact.first_name}}, ¡hace tiempo! Tenemos nuevas promociones disponibles. ¿Te interesa una inspección de techo gratis? Responde SÍ para más información.'),
  ('payment_partial',         'sms', 'en', 'Hi {{contact.first_name}}, we received your payment of ${{payment_amount}}. Thank you! Remaining balance: ${{balance}}.'),
  ('payment_partial',         'sms', 'es', 'Hola {{contact.first_name}}, recibimos tu pago de ${{payment_amount}}. ¡Gracias! Saldo restante: ${{balance}}.'),
  ('payment_complete',        'sms', 'en', 'Hi {{contact.first_name}}, your account is paid in full. Thank you for choosing Roofing Experts!'),
  ('payment_complete',        'sms', 'es', 'Hola {{contact.first_name}}, tu cuenta está pagada en su totalidad. ¡Gracias por elegir Roofing Experts!'),
  ('review_request',          'sms', 'en', 'Hi {{contact.first_name}}, thank you for choosing Roofing Experts! We would love your feedback. Leave us a review: {{review_url}}'),
  ('review_request',          'sms', 'es', 'Hola {{contact.first_name}}, ¡gracias por elegir Roofing Experts! Nos encantaría tu opinión. Déjanos un review: {{review_url}}'),
  ('project_start_notify',    'sms', 'en', 'Hi {{contact.first_name}}, your roofing project starts on {{start_date}}. Our crew will arrive in the morning. Questions? Call us anytime.'),
  ('project_start_notify',    'sms', 'es', 'Hola {{contact.first_name}}, tu proyecto de techo comienza el {{start_date}}. Nuestra cuadrilla llegará por la mañana. ¿Preguntas? Llámanos cuando quieras.'),
  ('material_delivery',       'sms', 'en', 'Hi {{contact.first_name}}, materials for your roofing project are being delivered today. Please ensure access to the property.'),
  ('material_delivery',       'sms', 'es', 'Hola {{contact.first_name}}, los materiales para tu proyecto de techo se entregarán hoy. Por favor asegúrese de que haya acceso a la propiedad.')
ON CONFLICT (slug, channel, lang) DO NOTHING;

-- ─── 8. Seed: P0 workflows (7 critical workflows — inactive until Twilio SID received) ──

INSERT INTO public.workflows (name, ghl_name, trigger_type, trigger_meta, is_active, priority) VALUES
  ('New Contact Welcome',
   'New Contact',
   'inbound_lead',
   '{"source": "any"}',
   false, 'P0'),
  ('Opt In — Facebook Form',
   'Opt In - FB Form',
   'inbound_lead',
   '{"source": "facebook"}',
   false, 'P0'),
  ('Opt In — Free Quote Website',
   'Opt In - Free Quote Website',
   'inbound_lead',
   '{"source": "free_pdf_form"}',
   false, 'P0'),
  ('Opt In — Free PDF',
   'opt in (Free PDF)',
   'inbound_lead',
   '{"source": "free_pdf_form"}',
   false, 'P0'),
  ('Opportunity Assignment Notify',
   'Opportunity assignment',
   'inbound_lead',
   '{"trigger": "opportunity_created"}',
   false, 'P0'),
  ('Stagnant Opportunity Reassignment',
   'Opportunity Stage Stagnant Reassignment',
   'time_delay',
   '{"stagnant_days": 7}',
   false, 'P0'),
  ('Waiting For Address Follow-Up',
   'Waiting For Address',
   'stage_enter',
   '{"stage_ghl_id": "sales-2"}',
   false, 'P0')
ON CONFLICT DO NOTHING;

-- ─── 9. Verification ──────────────────────────────────────────────────────────
-- SELECT count(*) FROM public.workflows;             -- expect 7
-- SELECT count(*) FROM public.message_templates;    -- expect 26
-- SELECT count(*) FROM public.conversations;        -- expect 0
-- SELECT count(*) FROM public.messages;             -- expect 0
