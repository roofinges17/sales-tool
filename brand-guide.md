# Roofing Experts — Brand Guide (Sales Tool Reference)

Extracted from roofingex.com on 2026-04-26. Canonical reference for the sales tool polish pass.

---

## A. Color Palette

| Token | Hex | Role | Frequency |
|---|---|---|---|
| `--brand` | `#CC2A2E` | Brand red — logo, trust signals, CTA hover | High |
| `--accent` | `#0072E5` | Primary CTA blue — buttons, links, highlights | High |
| White | `#FFFFFF` | Primary bg on roofingex.com, card bg | High |
| Near-black | `#1A1A1A` | Body text | High |
| Mid-gray | `#555555` | Secondary text, captions | Medium |
| Light gray | `#EBEBEB` | Section bg alternating, dividers | Medium |
| Dark gray | `#32373C` | Secondary buttons, footer bg | Medium |
| Red variant | `#CF2E2E` | Warning, urgent CTA | Low |
| Orange | `#FF6900` | Gradient accent | Low |
| Amber | `#FCB900` | Gradient accent | Low |

**HVHZ / NOA accent:** `#CC2A2E` (brand red) is used on certification badges.
**CTA button:** `#0072E5` bg, `#FFFFFF` text, fully-rounded pill shape.

---

## B. Typography

| Role | Family | Weight | Size |
|---|---|---|---|
| Display / H1 | Work Sans | 800 | 50–90px |
| H2 | Work Sans | 700 | 36–60px |
| H3 | Work Sans / Roboto | 600 | 24–34px |
| Body | Roboto | 400–500 | 14–16px |
| Button | Work Sans / any | 600–700 | 16–18px |
| Caption | Roboto | 400 | 12–14px |

**Sales tool mapping:**
- `--font-heading` (Work Sans) = roofingex.com display — **already aligned**
- `--font-body` (Public Sans) = functionally equivalent to Roboto — **acceptable**

**Letter-spacing:** Headings slightly negative (–0.01em to –0.02em). Body normal.

---

## C. Spacing & Rhythm

| Context | Value |
|---|---|
| Button padding | `calc(.667em + 2px) calc(1.333em + 2px)` ≈ 10px 22px |
| Section padding | 60–100px vertical |
| Card internal padding | 20–40px |
| Grid gap (cards) | 20–40px |
| Major section break | 120–140px margin-bottom |
| Container max-width | ~1200px |
| Nav height | ~56px |

---

## D. Component Language

**Buttons:**
- Shape: fully-rounded pill (`border-radius: 9999px`) for primary CTAs
- Shadow: `0px 4px 4px 0px rgba(0,0,0,0.08)` light
- Hover: darken bg, `inset 0 -2px 0 #0072e5` underline effect on text links

**Cards:**
- Border-radius: 8–20px
- Box-shadow: `0px 4px 4px rgba(0,0,0,0.1)` subtle elevation
- Internal padding: 20–40px

**Nav:**
- Sticky top, horizontal inline links
- Brand logo left, user/CTA right
- Height ~56px
- Backdrop blur on scroll

**Hero treatment:**
- Full-bleed image with dark overlay
- Text overlay: white on image
- Negative margin trick for section overlap

**Trust signals:**
- Badges (NOA, BBB A+, licensing number) as small pill/card elements
- Displayed in footer strip and near CTAs
- Color: brand red `#CC2A2E` outline or fill for certification badges

---

## E. Imagery & Iconography

**Photo style:** Professional drone + on-roof shots, before/after residential, South Florida homes. Square team portraits at ~140×140px.

**Icon style:** Minimal line-work in service sections. Filled icons for status/trust.

**Financing partner logos:** Goodleap, HomeRun, Ygrene, Renew Financial — displayed in a horizontal logo strip.

**Badge arrangement:** NOA badge, BBB A+, Miami-Dade certification, Google rating — grouped horizontally near CTAs or in footer.

---

## F. Voice Samples (Verbatim Headlines & CTAs)

1. *"Advanced metal roofing designed for Florida's demanding climate, strict building requirements, and high-velocity hurricane zones."*
2. *"Get Free Quote"* — primary CTA
3. *"Why we're better than the rest: Superior Metal Roofing Solutions for Your Project"*
4. *"Hurricane-Rated Metal Roofing Specialists | In-House Manufacturing and Direct Supply Advantage | Miami-Dade NOA Certified Products"*
5. *"Trusted by thousands of residential, commercial, and industrial clients across South Florida."*
6. *"No sales pressure. No obligation. Just clear information from a local roofing expert."*
7. *"Fully Licensed, Bonded & Insured"*
8. *"There are more than 2,000 roofing companies in South Florida, but only a small group manufacture metal roofing products that have earned a Miami-Dade Notice of Acceptance (NOA)."*
9. *"Services are typically scheduled within a week of your quote."*
10. *"Consistent service, clear communication, and roofing built to last."*

**Voice pillars:** NOA authority · In-house manufacturing · Local (South Florida) · Transparency · Speed

---

## G. Trust Signals (Required on Every Concept)

Per business brief #5 — must appear on all three concepts:

| Signal | Display text |
|---|---|
| Contractor license | CCC1331656 |
| BBB rating | BBB A+ Accredited |
| Miami-Dade NOA | Miami-Dade NOA Certified |
| Permit volume | 700+ Permits Issued |

---

## H. Design Token Delta: Current Sales Tool → Brand-Aligned

| Token | Current | Brand-aligned |
|---|---|---|
| `--accent` / `accent.DEFAULT` | `#3b82f6` | **`#0072E5`** |
| `--brand` / `brand.DEFAULT` | `#CC2A2E` | `#CC2A2E` ✓ |
| Heading font | Work Sans | Work Sans ✓ |
| Body font | Public Sans | Roboto-equivalent ✓ |
| Button shape | `rounded-full` on primary | `rounded-full` ✓ |
| Trust footer | Absent | **Add** |
