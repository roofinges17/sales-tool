# Quote Builder Viewport Regression Report

**Generated:** 2026-04-25 (Themis QA — task_1777161573403_088)  
**Target SHA:** 4231829 (https://9e3bde2f.roofing-experts-sales-tool.pages.dev)  
**Viewports tested:** 390x844 · 360x800 · 1024x768 · 1440x900  
**Method:** Static code analysis (all 6 Steps + builder page) + Playwright screenshots (public pages only)

---

## Auth Status

> **Steps 1–6 were not screenshot-captured.** The quote builder sits behind Supabase auth; no seller credentials are present in the agent environment. Playwright captured the login and /accept pages (see screenshots/ directory). Steps 1–6 were audited via full source read of every Step component.

Screenshots captured:
- `docs/screenshots/390x844/login.png`
- `docs/screenshots/390x844/accept-notoken.png`
- `docs/screenshots/360x800/login.png`
- `docs/screenshots/360x800/accept-notoken.png`
- `docs/screenshots/1024x768/login.png`
- `docs/screenshots/1024x768/accept-notoken.png`
- `docs/screenshots/1440x900/login.png`
- `docs/screenshots/1440x900/accept-notoken.png`

---

## Step-by-Step Findings

### Step 1 — Department (`Step1Department.tsx`)

**Status: PASS**

`grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3` — department cards collapse correctly to 1 column at 390px/360px, 2 columns at 640px+, 3 at 1024px+. No fixed-width overflow risks. Cards use padding-based sizing.

---

### Step 2 — Products (`Step2Products.tsx`)

**Status: WARN (2 issues)**

**W1 — Quantity ±buttons below 44px touch target** `[line 218-220]`  
Increment/decrement buttons use `w-7 h-7` (28px). WCAG 2.5.5 recommends 44×44px for pointer targets. On 390px touchscreens, small buttons cause mis-taps on adjacent cart items.  
*Fix:* `h-9 w-9` (36px) or wrap in a larger hit area.

**W2 — Color swatch button text may truncate at 360px** `[line ~440]`  
Color name buttons use `flex-wrap gap-2` (wrapping is on) but no `truncate` class on text spans. At 360px, very long color names ("Aged Copper Patina") could push beyond button bounds.  
*Fix:* Add `truncate max-w-[8rem]` to button text span.

*Note on sidebar:* `grid-cols-1 lg:grid-cols-[1fr_320px]` — sidebar stacks below content on all viewports below 1024px (correct). At 1024x768 the sidebar occupies 320px of 1024px (31%) which is acceptable.

---

### Step 3 — Customer Info (`Step3Customer.tsx`)

**Status: WARN (1 issue)**

**W3 — 2-col form triggers at sm: (640px) — tighter than needed** `[line 181]`  
`grid grid-cols-1 gap-4 sm:grid-cols-2` kicks in at 640px. On 360x800 and 390x844 this is correctly single-column. However, at 640–767px (tablet portrait) the two-column form with labels like "First Name / Last Name" side-by-side feels cramped.  
*Fix:* `md:grid-cols-2` (768px) is a safer breakpoint for this input density.

---

### Step 4 — Review (`Step4Review.tsx`)

**Status: WARN (2 issues)**

**W4 — Line-item table column allocation tight at 360px** `[lines 41–55]`  
Item row uses flex: `flex-1 min-w-0` for item name + `w-12` (48px) for qty + `w-20` (80px) for total. At 360px with 32px horizontal padding: item name gets 360 - 32 - 48 - 80 - ~16px gaps = **184px**. Long product names ("3-Tab Architectural Shingle...") will truncate after ~20 characters. The item name `<p>` has no `truncate` class, so it may overflow or wrap to 2 lines, pushing row height.  
*Fix:* Add `truncate` to product name `<p>` tag; consider `text-xs` on mobile for secondary unit text.

**W5 — Unit Price column hidden on mobile without visual replacement** `[lines 44, 54]`  
`hidden sm:block` removes the Unit Price column from both header and data rows at <640px — consistent, not a mismatch. But on mobile, customers reviewing a quote see Item / Qty / Total with no unit price visible, which could cause confusion on multi-unit line items.  
*Recommendation:* Consider inline unit price sub-text on the item name column at mobile (e.g., `@$X.XX each` appended to product name row).

---

### Step 5 — Financing (`Step5Financing.tsx`)

**Status: PASS**

Financing option cards use `flex-1` button pairs that split space correctly. Summary grid uses `grid-cols-2` with short label text that doesn't truncate. No fixed pixel widths. Fully responsive.

---

### Step 6 — Generate / PDF Preview (`Step6Generate.tsx`)

**Status: FAIL (1 issue) + WARN (1 issue)**

**F1 — PDF preview table columns leave ~46px for item name at 390px** `[lines 429–436]`  
```html
<table className="w-full text-sm">
  <th className="pb-3 text-center w-20">Qty / Area</th>     <!-- 80px -->
  <th className="pb-3 text-right w-28">Unit Price</th>      <!-- 112px -->
  <th className="pb-3 text-right w-28">Total</th>           <!-- 112px -->
```
Fixed columns total **304px**. Parent container has `overflow-hidden` (not `overflow-x-auto`). At 390px with 32px padding: item name column = 390 - 32 - 304 = **54px** — barely 6 characters wide. Product names get heavily truncated with no readable fallback.  
*Fix (immediate):* Wrap table in `<div className="overflow-x-auto">` so it scrolls rather than clips. Long-term: hide Unit Price column on mobile via `hidden sm:table-cell`.

**W6 — Before/After visualization grid 2-col at 390px** `[line 725]`  
`grid grid-cols-2 gap-3` gives each image only ~175px at 390px. Images render but are small for review purposes.  
*Fix:* `grid-cols-1 sm:grid-cols-2` — stacks on mobile for better visibility.

---

### Builder Page — Step Navigation (`quotes/builder/page.tsx`)

**Status: WARN (1 issue)**

**W7 — Stepper step labels hidden on mobile** `[lines ~48, 57]`  
Step labels use `hidden sm:block` — users on 390px/360px see only numbered circles with small connector lines. With 6 steps, the circles are readable but give no textual context about which step the user is on.  
*Fix:* Add the current step name as a subtitle below the stepper row on mobile (e.g., `<p className="sm:hidden text-xs text-center text-zinc-400">Step 2: Products</p>`).

---

## Summary Matrix

| Viewport | Step 1 | Step 2 | Step 3 | Step 4 | Step 5 | Step 6 | Nav |
|---------|--------|--------|--------|--------|--------|--------|-----|
| 360x800 (mobile S) | PASS | WARN | PASS | WARN | PASS | **FAIL** | WARN |
| 390x844 (mobile L) | PASS | WARN | PASS | WARN | PASS | **FAIL** | WARN |
| 1024x768 (tablet) | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| 1440x900 (desktop) | PASS | PASS | PASS | PASS | PASS | PASS | PASS |

---

## Finding Index

| ID | Step | Severity | File | Line(s) | Issue | Fix |
|----|------|----------|------|---------|-------|-----|
| F1 | Step 6 | **FAIL** | Step6Generate.tsx | 429–436 | PDF table fixed columns → 54px for item name at 390px | `overflow-x-auto` wrapper + `hidden sm:table-cell` on Unit Price |
| W1 | Step 2 | WARN | Step2Products.tsx | 218–220 | Qty ±buttons 28px, below 44px touch target | `h-9 w-9` |
| W2 | Step 2 | WARN | Step2Products.tsx | ~440 | Color name text may overflow at 360px | `truncate max-w-[8rem]` |
| W3 | Step 3 | WARN | Step3Customer.tsx | 181 | `sm:grid-cols-2` at 640px — too early for form density | Move to `md:grid-cols-2` |
| W4 | Step 4 | WARN | Step4Review.tsx | 41–55 | Item name 184px at 360px, no truncate class | Add `truncate` to name `<p>` |
| W5 | Step 4 | INFO | Step4Review.tsx | 44, 54 | Unit Price hidden mobile — no visible alternative | Add inline unit price sub-text |
| W6 | Step 6 | WARN | Step6Generate.tsx | 725 | Before/after grid 2-col at 390px; images too small | `grid-cols-1 sm:grid-cols-2` |
| W7 | Builder | WARN | builder/page.tsx | ~48, 57 | Step labels hidden mobile — no current-step text | Add mobile step subtitle |

---

## Recommendation Priority

1. **F1 (FAIL)** — Fix Step6Generate table overflow before next mobile user tests the PDF preview. Single-line fix: `<div className="overflow-x-auto">` wrapper.
2. **W1 (WARN)** — Touch target size; low effort, user experience impact on mobile.
3. **W4 (WARN)** — Item name truncation in Step 4 review table; add `truncate` class.
4. **W3, W6, W7** — Polish items; address in next mobile UX pass.
5. **W2, W5** — Minor; low impact.
