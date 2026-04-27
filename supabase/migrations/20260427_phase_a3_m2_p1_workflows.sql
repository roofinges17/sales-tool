-- Phase A-3 M2: P1 workflow seeds + SMS counter view
-- Seeds 15 P1 workflows (all inactive pending Twilio SID).
-- Adds monthly_sms_count view for 600/mo guardrail.
-- All idempotent (ON CONFLICT DO NOTHING).

-- ─── 1. Seed P1 workflows ─────────────────────────────────────────────────────

INSERT INTO public.workflows (name, ghl_name, trigger_type, trigger_meta, is_active, priority) VALUES
  ('Hot Lead Follow-Up',
   'Hot Lead',
   'stage_enter',
   '{"stage_ghl_id": "sales-5"}',
   false, 'P1'),
  ('Cold Lead Extended Nurture',
   'Cold Lead',
   'stage_enter',
   '{"stage_ghl_id": "sales-6"}',
   false, 'P1'),
  ('Estimate Workflow',
   'Estimate Workflow',
   'stage_enter',
   '{"stage_ghl_id": "sales-3"}',
   false, 'P1'),
  ('Estimate Sent Notify',
   '4. 0 Estimate Sent',
   'stage_enter',
   '{"stage_ghl_id": "sales-4"}',
   false, 'P1'),
  ('Estimate Approved',
   'Estimated approved',
   'stage_enter',
   '{"stage_ghl_id": "sales-8"}',
   false, 'P1'),
  ('Free Quote Funnel',
   'Free Quote Funnel',
   'inbound_lead',
   '{"source": "chat_widget"}',
   false, 'P1'),
  ('Lead Reactivation',
   'Reactivación de Leads',
   'time_delay',
   '{"stagnant_days": 30}',
   false, 'P1'),
  ('Appointment Reminder',
   '6.0 Appt Reminders',
   'time_delay',
   '{"hours_before": 24}',
   false, 'P1'),
  ('Vio la Promocion',
   'Vio la Promoción',
   'inbound_lead',
   '{"source": "facebook", "tag": "promo"}',
   false, 'P1'),
  ('FB Promo — Free Gutters or Insulation',
   'FB- LM Free Gutters or Insulation',
   'inbound_lead',
   '{"source": "facebook", "tag": "gutters_insulation"}',
   false, 'P1'),
  ('Promo — Free Gutters or Insulation',
   'LM Free Gutters or Insulation',
   'inbound_lead',
   '{"source": "any", "tag": "gutters_insulation"}',
   false, 'P1'),
  ('IG Anti-Fraud Checklist',
   'LM Anti Fraud CheckList IG',
   'inbound_lead',
   '{"source": "instagram"}',
   false, 'P1'),
  ('Partial Payment Received',
   'Update partial payments',
   'payment_event',
   '{"event": "payment_partial"}',
   false, 'P1'),
  ('Payment Completed',
   'pagado',
   'payment_event',
   '{"event": "payment_complete"}',
   false, 'P1'),
  ('Pre-Qualification',
   'pre-calificado',
   'stage_enter',
   '{"stage_ghl_id": "sales-0"}',
   false, 'P1')
ON CONFLICT DO NOTHING;

-- ─── 2. Monthly SMS counter view (600/mo guardrail) ──────────────────────────

CREATE OR REPLACE VIEW public.monthly_sms_count AS
SELECT
  date_trunc('month', sent_at) AS month,
  count(*)                     AS outbound_sms_count
FROM public.messages
WHERE direction = 'outbound'
  AND status IN ('sent','delivered','queued')
  AND conversation_id IN (
    SELECT id FROM public.conversations WHERE channel = 'sms'
  )
GROUP BY 1
ORDER BY 1 DESC;

-- ─── 3. Verification ──────────────────────────────────────────────────────────
-- SELECT count(*) FROM public.workflows WHERE priority = 'P1';  -- expect 15
-- SELECT * FROM public.monthly_sms_count;                       -- expect 0 rows (no SMS yet)
