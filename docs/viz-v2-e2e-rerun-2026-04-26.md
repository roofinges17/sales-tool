# viz-v2 5-Address E2E Re-Run — commits 0aafea7/727927c/f81458f

**Generated:** 2026-04-26 ~19:30 UTC  
**Preview:** https://viz-v2-tree-removal.roofing-experts-sales-tool.pages.dev  
**Method:** Playwright headless 1280px, network interception  
**Credential:** qa-daedalus / QAsmoke26!

---

## Verdict: 1/5 full PASS — both deploy bugs fixed, renders blocked by quota

| | Address | SV | Score | Route | Render | Notes |
|--|---------|----|----|-------|--------|-------|
| (a) | Indian Creek | 200 149KB | 3% | satellite ✅ | ✅ 25.0s | Full PASS |
| (b) | 15240 SW 169 Ln | 200 95KB | 55% | normal ✅ | ❌ 429 | Quota |
| (c) | 15216 SW 169th Ln | 200 93KB | 95% | normal ✅ | ❌ 429 | Quota |
| (d) | 17587 Homestead Ave | 200 87KB | 52% | normal ✅ | ❌ 429 | Quota |
| (e) | 8050 SW 117th Ave | 200 136KB | 0% | satellite ✅ | ❌ 429 | Quota |

**Routing: 5/5 correct. Renders: 1/5 (quota limit hit after address a).**

---

## BUG-1: FIXED ✅ — Stack Overflow in roof-satellite

Address (a) Indian Creek:
- `/api/visualize/roof-satellite` → HTTP 200
- Response: `{before_url, after_url, model_id: "gemini-2.5-flash-image"}`
- Render completed in **25.0s**
- No stack overflow, no 502

---

## BUG-2: FIXED ✅ — Street View API

New `/api/streetview` server-side proxy returns real images on all 5 addresses:

| Address | HTTP | Size |
|---------|------|------|
| Indian Creek | 200 | ~149KB |
| 15240 SW 169 Ln | 200 | ~95KB |
| 15216 SW 169th Ln | 200 | ~93KB |
| 17587 Homestead Ave | 200 | ~87KB |
| 8050 SW 117th Ave | 200 | ~136KB |

All `image/jpeg`, all well above the 5KB no-coverage threshold.

---

## Vision-Score Gate: WORKING ✅

Flash scored all 5 addresses correctly, gate logic routing as expected:

| Address | Score | Gate Decision | Correct? |
|---------|-------|---------------|----------|
| (a) Indian Creek | 3% | satellite (< 30) | ✅ Low-visibility → satellite |
| (b) 15240 SW 169 Ln | 55% | normal (≥ 30) | ✅ SV shows roof clearly |
| (c) 15216 SW 169th Ln | 95% | normal (≥ 30) | ✅ High visibility |
| (d) 17587 Homestead Ave | 52% | normal (≥ 30) | ✅ Good SV coverage |
| (e) 8050 SW 117th Ave | 0% | satellite (< 30) | ✅ Road-level angle, no roof |

**Note on pre-run expectations:** (b) and (c) were predicted satellite based on assumed tree density. Flash's actual SV assessment disagrees — 55% and 95% roof visible respectively. Routing is semantically correct; my predictions were wrong, not the router.

---

## Blocking Issue: Daily Render Quota (429)

Addresses (b)-(e) hit qa-daedalus's daily render cap after address (a) consumed the remaining quota (prior QA runs today: ~4 renders from the first test cycle). Error:

```
HTTP 429 — "Daily render limit reached. Contact your manager to increase your cap."
```

**This is not a code bug.** Need qa-daedalus render cap increased to complete the run.

---

## API Call Summary

| Endpoint | Calls | Status |
|----------|-------|--------|
| /api/streetview | 5 | 200 ✅ all |
| /api/visualize/vision-score | 5 | 200 ✅ all |
| /api/visualize/roof-satellite | 2 | 200 ✅ (a), 429 (e) |
| /api/visualize/roof (normal) | 3 | 429 ✗ (b,c,d) |

**Est. Gemini spend this run: ~$0.350**  
**Running QA total: ~$0.49**

---

## Action Required

1. Increase qa-daedalus daily render cap (or reset today's count)
2. Re-run — expect 5/5 PASS based on routing + satellite render confirmed working
3. Optional: add address with genuine tree-occlusion score < 30% to exercise satellite-via-vision-score path end-to-end (Indian Creek uses the no-SV direct-satellite path; scored-satellite path wasn't fully exercised)

---

*Themis QA — task_1777229457321_352 — 2026-04-26 ~19:30 UTC*
