-- project_photos table
CREATE TABLE IF NOT EXISTS project_photos (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id       UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  photo_url      TEXT NOT NULL,
  stage          TEXT NOT NULL CHECK (stage IN ('BEFORE','DURING','AFTER','OTHER')),
  caption        TEXT,
  uploaded_by    UUID REFERENCES profiles(id),
  uploaded_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  geotag_lat     NUMERIC,
  geotag_lng     NUMERIC
);

CREATE INDEX IF NOT EXISTS project_photos_quote_id_idx ON project_photos(quote_id);

-- RLS
ALTER TABLE project_photos ENABLE ROW LEVEL SECURITY;

-- owner + admin: see all
CREATE POLICY "photos_owner_admin_all" ON project_photos
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('owner','admin')
    )
  );

-- manager: photos for quotes in their department
CREATE POLICY "photos_manager_dept" ON project_photos
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM quotes q
      JOIN profiles p ON p.id = auth.uid()
      WHERE q.id = project_photos.quote_id
        AND p.role = 'manager'
        AND q.department_id = p.department_id
    )
  );

-- seller: photos for their own quotes only
CREATE POLICY "photos_seller_own" ON project_photos
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM quotes q
      JOIN profiles p ON p.id = auth.uid()
      WHERE q.id = project_photos.quote_id
        AND p.role = 'seller'
        AND q.assigned_to_id = p.id
    )
  );

-- any authenticated user can insert (the quote-access check happens in app layer)
CREATE POLICY "photos_insert_authenticated" ON project_photos
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- uploader or owner/admin can delete
CREATE POLICY "photos_delete" ON project_photos
  FOR DELETE
  USING (
    uploaded_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('owner','admin')
    )
  );

-- Storage bucket 'project-photos' — created via API, policies via SQL below
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'project-photos',
  'project-photos',
  false,
  10485760,  -- 10 MB
  ARRAY['image/jpeg','image/png','image/webp','image/heic','image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: authenticated users can upload
CREATE POLICY "storage_photos_insert" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'project-photos'
    AND auth.uid() IS NOT NULL
  );

-- Storage RLS: authenticated users can read
CREATE POLICY "storage_photos_select" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'project-photos'
    AND auth.uid() IS NOT NULL
  );

-- Storage RLS: uploader or owner/admin can delete
CREATE POLICY "storage_photos_delete" ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'project-photos'
    AND (
      owner = auth.uid()
      OR EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
          AND profiles.role IN ('owner','admin')
      )
    )
  );
