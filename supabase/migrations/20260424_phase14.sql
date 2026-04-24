-- Phase 14: Roof Measurements + Sections

-- roof_measurements table
CREATE TABLE IF NOT EXISTS roof_measurements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID REFERENCES quotes(id) ON DELETE CASCADE,
  property_address TEXT NOT NULL,
  property_lat NUMERIC(10,7),
  property_lng NUMERIC(10,7),
  map_zoom INTEGER DEFAULT 20,
  map_image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE roof_measurements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "roof_measurements_read" ON roof_measurements;
CREATE POLICY "roof_measurements_read" ON roof_measurements
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "roof_measurements_write" ON roof_measurements;
CREATE POLICY "roof_measurements_write" ON roof_measurements
  FOR ALL USING (auth.role() = 'authenticated');

-- roof_sections table (one row per drawn polygon)
CREATE TABLE IF NOT EXISTS roof_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  measurement_id UUID REFERENCES roof_measurements(id) ON DELETE CASCADE,
  section_type TEXT CHECK (section_type IN ('FLAT','SLOPED')),
  pitch TEXT,
  product_id UUID REFERENCES products(id),
  polygon_points JSONB NOT NULL,
  planar_area_sqft NUMERIC(12,2),
  actual_area_sqft NUMERIC(12,2),
  unit_price NUMERIC(10,2),
  line_total NUMERIC(12,2),
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE roof_sections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "roof_sections_read" ON roof_sections;
CREATE POLICY "roof_sections_read" ON roof_sections
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "roof_sections_write" ON roof_sections;
CREATE POLICY "roof_sections_write" ON roof_sections
  FOR ALL USING (auth.role() = 'authenticated');
