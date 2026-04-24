-- Phase 17: Qty vs sq-ft UX
--
-- Roof products (ALUMINUM, FLAT, FLAT INSULATIONS, METAL, SHINGLE, TILE) are
-- area-based — added via satellite measurement canvas, unit stays "sq ft".
--
-- Standalone Insulation and other add-on products are qty-based (ea/unit).
-- Flip the unit for the standalone Insulation product(s) from "sq ft" to "ea"
-- so the quote builder renders the integer qty stepper instead of the area path.

UPDATE products
SET unit = 'ea'
WHERE unit IN ('sq ft', 'sqft', 'SF')
  AND LOWER(code) NOT IN ('aluminum', 'flat', 'flat insulations', 'metal', 'shingle', 'tile')
  AND (
    LOWER(name) LIKE '%insulation%'
    OR LOWER(code) LIKE '%insulation%'
  );
