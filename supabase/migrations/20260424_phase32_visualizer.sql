-- Phase 3.2: Gemini AI roof visualizer — new columns + render log table
--
-- roof_color: required for metal-roof quotes; enforced at app layer (Step2 validation)
-- visualizer_image_url: Supabase storage URL of the Gemini-rendered image
-- visualizer_color: the color used in the AI render (may differ from roof_color if rep regenerated)
-- visualizer_finish: "matte" | "satin" | "textured"
--
-- Old columns (visualization_color_id, visualization_image) remain intact for
-- backward compatibility with existing quotes.

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS roof_color text;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS visualizer_image_url text;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS visualizer_color text;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS visualizer_finish text;

CREATE TABLE IF NOT EXISTS visualizer_render_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id),
  quote_id uuid REFERENCES quotes(id) ON DELETE SET NULL,
  color text,
  finish text,
  prompt text,
  status text,        -- 'success' | 'error' | 'rate_limited'
  error text,
  render_url text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_visualizer_log_user_day
  ON visualizer_render_log (user_id, created_at);

ALTER TABLE visualizer_render_log ENABLE ROW LEVEL SECURITY;

-- Sellers see their own render history; managers/admins/owners see all
CREATE POLICY visualizer_log_select_own ON visualizer_render_log
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid() OR
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('manager', 'admin', 'owner')
  );
-- INSERT is done by the CF Function via service role — no authenticated INSERT policy needed
