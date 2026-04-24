# Phase 14 — Roof Measurement + Render + Estimate Generator

**Decision (Alejandro, 2026-04-23):** Option C — Google Maps Static API + manual polygon drawing. Free MVP. Pitch is manual per-section input (not auto-detected).

**Target:** https://roofing-experts-sales-tool.pages.dev

---

## 1. User Flow

1. User enters property address on new **Measure** tab inside Quote Builder (or standalone route `/measure`).
2. Address is geocoded; Google Maps Static API renders a satellite image centered on the property (zoom ~20, size 1280x1280 scale=2).
3. User draws one or more polygons directly over the satellite image (Canvas/SVG overlay).
4. Per polygon, user selects:
   - **Section type** — `FLAT` or `SLOPED`
   - **Pitch** (sloped only) — dropdown: 2:12, 3:12, 4:12, 5:12, 6:12, 7:12, 8:12, 9:12, 10:12, 11:12, 12:12 (default 4:12)
   - **Product** — pick from seeded products (ALUMINUM, METAL, SHINGLE, TILE, FLAT, FLAT INSULATIONS)
5. App computes:
   - **Planar area** (polygon area in ft² from pixel geometry + map scale meters-per-pixel)
   - **Actual area** = planar_area × pitch_multiplier
   - **Line total** = actual_area × product.default_price (allow override within min/max)
6. User clicks **Generate Estimate** → PDF matching the source format is produced, persisted to Supabase Storage, and a customer **Accept** link is minted (reuses `quotes.accept_token` from Phase 13).

---

## 2. Pitch Multiplier Table (canonical)

| Pitch | Multiplier |
|---|---|
| FLAT (0:12) | 1.000 |
| 2:12 | 1.014 |
| 3:12 | 1.031 |
| 4:12 | 1.054 |
| 5:12 | 1.083 |
| 6:12 | 1.118 |
| 7:12 | 1.158 |
| 8:12 | 1.202 |
| 9:12 | 1.250 |
| 10:12 | 1.302 |
| 11:12 | 1.357 |
| 12:12 | 1.414 |

Store as `const PITCH_MULTIPLIERS` in `src/lib/pitch.ts`. Export a helper `pitchMultiplier(pitch: string): number`.

---

## 3. Satellite Imagery (Google Maps Static API)

- **API endpoint:** `https://maps.googleapis.com/maps/api/staticmap`
- **Params:** `center={lat},{lng}&zoom=20&size=640x640&scale=2&maptype=satellite&key={key}`
- **Meters-per-pixel formula at zoom z, lat φ:** `156543.03392 * cos(φ * π / 180) / 2^z`
  - At zoom 20, Miami lat ~25.8: ~0.141 m/px at scale=1. With scale=2 (1280x1280 HiDPI), px density doubles → 0.0705 m/px.
  - Polygon area in m² = planar_pixel_area × (meters_per_px)². Convert to ft² via × 10.7639.
- **Env var:** `NEXT_PUBLIC_GOOGLE_MAPS_STATIC_KEY` — Alejandro needs to provision a Google Cloud key with Maps Static API enabled. Flag to me if missing.
- **Geocoding:** Google Geocoding API (`https://maps.googleapis.com/maps/api/geocode/json?address=...&key=...`) — same key, must enable Geocoding API too.
- **Cost:** $2 / 1000 static maps, $5 / 1000 geocodes. Free tier covers ~28k/month combined. No immediate cost concern.

---

## 4. Polygon Drawing (client-side)

- Render map as `<img>` with a same-size `<canvas>` overlay (absolute position).
- Mouse/touch events to add vertices; close polygon on double-click or click near start vertex.
- Allow multiple polygons per session (list view beside the map).
- Shoelace formula for pixel area: `abs(Σ(x_i · y_{i+1} − x_{i+1} · y_i)) / 2`.
- Render each polygon with a translucent fill color coded by section type (blue for flat, orange for sloped).
- Per-polygon sidebar: product selector, pitch selector (disabled if FLAT), computed ft² + line total.

---

## 5. Estimate PDF — Default Language (source: `Estimate_M2026042012257_from_Roofing_Experts_Services_Inc_CCC1331656.pdf`)

### Header (every page)

```
Roofing Experts Services Inc  CCC1331656
17587 Homestead Ave
Miami, FL 33157 US
+17867189593
roofinges@gmail.com
```

Logo: red rectangle with white roof-chevron mark + "USA" badge (use existing brand asset or placeholder).

### Metadata block

```
ADDRESS:  {customer name + street + city state zip}
SHIP TO:  {same, or override}
ESTIMATE #: M{YYYYMMDD}{sequence}
DATE: MM/DD/YYYY
FOLIO #: {miami-dade folio from customer record, optional}
```

### Activity rows (one per polygon group)

For each SLOPED section using METAL product, insert this block — substitute `{slope_size}` with sum of sloped ft² rounded to nearest integer, `{price}` with rounded line total:

```
ACTIVITY: PROJECT METAL RE-ROOFING | NEW METAL INSTALLATION SYSTEM
DESCRIPTION:
  Slope Roof Size: {slope_size} SF
  Price: ${price}

  1) Pull the appropriate roofing package permit for Miami-Dade County.
  2) Register a Notice of Commencement for the State of Florida, Miami-Dade County Records.
  3) Tear off the existing roof system and pick it up at the recycling center.
  4) Replace rotten wood, and three (3) sheets of plywood or twenty (20) tongues and grooves are included in the contract price.
     (No Fascia-Soffit)
  5) Install a Polystick XFR self-adhered waterproofing underlayment.
  6) Install new 24 ga. galvalume bullnoses, 24 ga. galvalume Z-bar, flashing, and 24 ga. galvalume stucco stops.
  7) Install 24 ga. galvalume valley, valley cleat, ridge, and hip metal.
  8) Replace lead boots, roof vents, and goosenecks.
  9) Install Metal Roof Panel: REM 1.5 Clip (NOA # 22-1208.01: Roofing Experts Services Inc.)
  10) All work to be done accordingly to the Florida Building Code Compliance
  11) A twenty-five (25)-year warranty against leaks.
  12) Pick up all debris from the premises.
```

For each FLAT section, insert this block:

```
ACTIVITY: RE-ROOF NEW FLAT INSTALLATION SYSTEM
DESCRIPTION:
  FLAT ROOF: {flat_size} SF
  Price: ${price}

  Modified Bitumen
  1) Tear off the existing roof system and pick it up at the recycling center.
  2) Replace rotten wood; three sheets of plywood or 20 pieces of tongue and groove are included in the contract price.
  3) Install GAF GAFGLAS #75 Glass Base Sheet 3 SQ., nailed with 3/4" ring-shanked nails at 12" center to center and 4" at the eave, and lap the flat area over 3/4" CDX plywood with staggered joints nailed with 8dx 3" ring-shanked nails 8" 6" O.C. nails everywhere.
  4) Install GAF RUBEROID 20 Smooth 1.5 SQ hot mopped over GAF GAFGLAS #75 Glass Base Sheet 3 SQ Felt lapped two inches and turned up vertical surfaces a minimum of 4".
  5) Install GAF RUBEROID MOP GRAN WHITE 1 SQ (CAP SHEET) hot-mopped over GAF RUBEROID 20 Smooth 1.5 SQ lapped two inches and turned up vertical surfaces a minimum of 4".
  6) All work is to be done according to Florida Building Code compliance.
  7) A ten (10)-year warranty against leaks.
  8) Pick up all debris from the premises.
```

For ALUMINUM, SHINGLE, TILE — mirror the METAL template but substitute the panel line (item 9):

- **ALUMINUM**: `Install aluminum standing-seam roof panels: 24 ga. structural aluminum clip system (NOA # 22-1208.01: Roofing Experts Services Inc.)`
- **SHINGLE** (generic — no third-party brand per Alejandro 2026-04-23): `Install Class 4 impact-resistant architectural asphalt shingles (Miami-Dade NOA approved). Include ice-and-water shield at eaves and valleys.`
- **TILE** (generic — no third-party brand per Alejandro 2026-04-23): `Install concrete or clay roof tiles (Miami-Dade NOA approved), set with foam adhesive per manufacturer specification.`

**Rule**: keep the source PDF language intact for METAL + FLAT scopes (Polystick XFR, REM 1.5 Clip NOA # 22-1208.01, GAF GAFGLAS, GAF RUBEROID — these are Alejandro's established specs and stay). Only TILE + SHINGLE go generic because those don't have an established Roofing Experts spec yet. Roofing Experts Services Inc. company name stays everywhere it appears.

### Standard Notes (appears on every estimate, after activity rows)

```
Notes:
  1) We reserve the right to subcontract any part of the labor herein proposed.
  2) Roofing Experts Services Inc. will take care of requesting all the pertinent roofing inspections.
  3) When the job is impacted by inclement weather or acts of God above and beyond the control of the contractor, the first option is at the contractor's judgment to resolve it before calling another contractor.
  4) Polystick XFR self-adhered waterproofing underlayment can only be exposed for approximately six (6) months (county regulations). After the specified time frame, another roll of Polystick XFR self-adhered waterproofing underlayment needs to be replaced. This will be at the owner's expense if the installation delays are not caused by Roofing Experts Services Inc. but by the owner.
  5) Roofing Experts Services Inc. reserves the right to close the roofing permit under its name when the owner creates unnecessary delays (monetary) that may hinder the scheduled roofing process.
  6) The contract price includes tearing off (2) two layers of underlayment tin tagged onto the roof deck. If there is more than one layer of paper or more than one existing roof underneath, there will be an additional charge to be settled while the roofing process is taking place and must be completed in writing.
  7) This contract does not include carpentry work of any kind other than the one specified above.
  8) The owner and contractor agree that the work area is dangerous and that only personnel approved by the contractor are allowed in the work area while the job is in progress. The owner's, the owner's contractor's, and the associates' access to the work area is their sole risk and expense.
  9) Contractor shall not be held accountable in any manner for preexistent damage to any area of the home prior to commencing the job, including but not limited to driveways, sidewalks, windows, landscaping, and lawns.
  10) We cannot accept responsibility for any damages done to the roof by plumbers, electricians, air conditioning men, cable men, fumigators, or any other tradesmen during the roof work installation or done after its completion.
  11) This contract does not include the removal and reinstallation of gas vent units, (*) gutters, screens, solar panels or the like, antennas, air conditioning units, satellite dishes, water heaters, or any object that may be attached to the roof in any way.
  12) In the event of existing gas vent units, the homeowner will be responsible for contracting a plumbing company to do the work without delaying the roofing progress.
  13) Roofing Experts Services Inc. runs the Miami-Dade County permits for approval.
  14) Roofing Experts Services Inc. will pay the permit fees of Miami-Dade County.
  15) The roof warranty will be effective once the final payment is made.
```

### Delinquent Payments section

```
DELINQUENT PAYMENTS, ATTORNEY FEES AND INTEREST:
  1) In the event the OWNER fails to make payments when due as specified herein.
  2) Then the owner (if applicable) shall pay, in addition to all other sums payable hereunder, the reasonable costs and expenses incurred by Roofing Experts Services Inc. in connection with all actions taken to enforce collection or to preserve and protect it under the contract, whether by legal proceedings or otherwise, including without limitation attorney's fees and court costs. In addition, the owner shall be reasonably responsible for the interest at a rate of one and a half percent (1-1/2%) per month on the amount of any unmade payment.
```

### Confidentiality section

```
THIS INFORMATION IS CONFIDENTIAL:
  This information is confidential, privileged, or exempt from disclosure under applicable federal or state law.
  This proposal/contract may be withdrawn after thirty (30) days if the conditions of this proposal/contract as outlined above are not met. Roofing Experts Services Inc., is hereby authorized to do the work as specified.
```

### Payment schedule (compute from subtotal)

```
FIRST PAYMENT:   First day of the Project (30%)       ${subtotal * 0.30}
SECOND PAYMENT:  Tin-Cap (30%)                        ${subtotal * 0.30}
THIRD PAYMENT:   In Progress Inspection (30%)         ${subtotal * 0.30}
FINAL PAYMENT:   Final Inspection (10%)               ${subtotal * 0.10}

SUBTOTAL:  ${subtotal}
TAX:       $0.00
TOTAL:     ${subtotal}
```

### Acceptance

```
Accepted By: ________________________      Accepted Date: __________
```

### Footer (every page)

```
If you have any questions, please contact:
Alejandro Perez-Madrid / 786-718-9593 / roofinges@gmail.com
Thank You For Your Business!
```

---

## 6. Schema Changes

```sql
-- New: roof_measurements table
CREATE TABLE roof_measurements (
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

-- New: roof_sections table (one row per polygon)
CREATE TABLE roof_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  measurement_id UUID REFERENCES roof_measurements(id) ON DELETE CASCADE,
  section_type TEXT CHECK (section_type IN ('FLAT','SLOPED')),
  pitch TEXT,               -- 'FLAT' or '4:12' etc.
  product_id UUID REFERENCES products(id),
  polygon_points JSONB NOT NULL,   -- [{x,y}, ...] in pixel coords
  planar_area_sqft NUMERIC(12,2),
  actual_area_sqft NUMERIC(12,2),
  unit_price NUMERIC(10,2),
  line_total NUMERIC(12,2),
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS: same pattern as other Phase 4+ tables (authenticated read, owner/admin write)
```

Emit as `supabase/migrations/20260424_phase14.sql`. I apply via Management API after you confirm clean.

---

## 7. Deliverables

1. `src/app/measure/page.tsx` — standalone measure UI (can also be embedded in Quote Builder step 2)
2. `src/lib/pitch.ts` — pitch multiplier table + helper
3. `src/lib/maps.ts` — Google Maps Static + Geocoding wrappers + meters-per-pixel calc
4. `src/components/MapDrawingCanvas.tsx` — polygon draw overlay
5. `src/components/MeasurementSidebar.tsx` — per-polygon product/pitch/price panel
6. `src/lib/estimate-pdf.ts` — jsPDF-based estimate renderer using the exact language above
7. `supabase/migrations/20260424_phase14.sql` — schema
8. Wire Quote Builder step 2 to consume measurements (auto-populate line items from roof_sections)
9. Deploy to roofing-experts-sales-tool.pages.dev; return preview URL + commit SHA.

---

## 8. Open Questions / Constraints

- **Google Maps key** — not yet provisioned. Flag me as soon as you hit the missing env var; I'll walk Alejandro through the signup.
- **Logo asset** — use a placeholder div until Alejandro uploads the real logo (red rectangle + chevrons + USA badge per the PDF).
- **Non-metal panel language (ALUMINUM / SHINGLE / TILE)** — propose language based on the METAL template; I'll route to Alejandro for sign-off before merge.
- **Multi-page PDF** — notes + confidentiality block typically span 2-3 pages. Use jsPDF autoTable or manual page breaks; header + footer on every page.
- **Estimate # format** — use `M` + estimate_date(YYYYMMDD) + 5-digit sequence (source used folio digits; we'll use a monotonic counter scoped to the estimate year).
