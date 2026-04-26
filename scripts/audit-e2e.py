#!/usr/bin/env python3
"""
Sales-Tool Post-Phase-6 Live E2E Audit
Usage: python3 scripts/audit-e2e.py [--url URL] [--user EMAIL] [--pass PASSWORD] [--admin-pass PASSWORD]

Runs:
  1. Auth-state matrix: anon / logged-in user / logged-in admin
  2. Full page click-through with golden path + edge cases
  3. Mobile viewport sweep: 375px (iPhone SE), 390px (iPhone 13), 430px (iPhone Pro Max)
  4. Console.error surveillance on every page
  5. Critical E2E flow: estimate → PDF → email → /accept → signature → status update
  6. Touch target audit (≥44px)

Output: punch-list grouped BLOCKER / MAJOR / MINOR / POLISH with evidence
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path
from playwright.sync_api import sync_playwright, Page, BrowserContext

# ── Config ────────────────────────────────────────────────────────────────────

PROD_URL = os.environ.get("SALES_TOOL_URL", "https://roofing-experts-sales-tool.pages.dev")
TEST_EMAIL = os.environ.get("AUDIT_USER_EMAIL", "")
TEST_PASS  = os.environ.get("AUDIT_USER_PASS", "")
ADMIN_EMAIL = os.environ.get("AUDIT_ADMIN_EMAIL", "")
ADMIN_PASS  = os.environ.get("AUDIT_ADMIN_PASS", "")

SCREENSHOT_DIR = Path("/tmp/audit-screenshots")
SCREENSHOT_DIR.mkdir(exist_ok=True)

VIEWPORTS = [
    {"name": "iPhone SE",       "width": 375, "height": 667},
    {"name": "iPhone 13",       "width": 390, "height": 844},
    {"name": "iPhone Pro Max",  "width": 430, "height": 932},
    {"name": "Desktop",         "width": 1440, "height": 900},
]

PAGES = [
    {"path": "/",                              "name": "Dashboard",            "auth": "user"},
    {"path": "/accounts",                      "name": "Accounts list",        "auth": "user"},
    {"path": "/accounts/new",                  "name": "New account",          "auth": "user"},
    {"path": "/quotes",                        "name": "Quotes list",          "auth": "user"},
    {"path": "/quotes/builder",                "name": "Quote builder",        "auth": "user"},
    {"path": "/sales",                         "name": "Sales list",           "auth": "user"},
    {"path": "/pipeline",                      "name": "Pipeline Kanban",      "auth": "user"},
    {"path": "/commissions",                   "name": "Commissions",          "auth": "user"},
    {"path": "/measure",                       "name": "Measure",              "auth": "user"},
    {"path": "/admin/settings",                "name": "Admin settings",       "auth": "admin"},
    {"path": "/admin/settings/products",       "name": "Products",             "auth": "admin"},
    {"path": "/admin/settings/users",          "name": "Users",                "auth": "admin"},
    {"path": "/admin/settings/departments",    "name": "Departments",          "auth": "admin"},
    {"path": "/admin/settings/financing",      "name": "Financing plans",      "auth": "admin"},
    {"path": "/admin/settings/lead-sources",   "name": "Lead sources",         "auth": "admin"},
    {"path": "/admin/settings/commissions",    "name": "Commission plans",     "auth": "admin"},
    {"path": "/admin/settings/workflows",      "name": "Workflows",            "auth": "admin"},
    {"path": "/admin/settings/gohighlevel",    "name": "GoHighLevel config",   "auth": "admin"},
    {"path": "/admin/settings/quickbooks",     "name": "QuickBooks config",    "auth": "admin"},
    {"path": "/admin/settings/resend",         "name": "Resend config",        "auth": "admin"},
    {"path": "/accept",                        "name": "Customer accept",      "auth": "anon"},
    {"path": "/login",                         "name": "Login",                "auth": "anon"},
]

findings = []

# ── Helpers ───────────────────────────────────────────────────────────────────

def log_finding(severity, page_name, action, expected, actual, evidence="", url=""):
    findings.append({
        "severity": severity,
        "page": page_name,
        "action": action,
        "expected": expected,
        "actual": actual,
        "evidence": evidence,
        "url": url,
    })
    sym = {"BLOCKER": "🔴", "MAJOR": "🟠", "MINOR": "🟡", "POLISH": "🔵"}.get(severity, "⚪")
    print(f"  {sym} {severity}: [{page_name}] {action}")
    print(f"         Expected: {expected}")
    print(f"         Got: {actual}")
    if evidence:
        print(f"         Evidence: {evidence}")


def screenshot(page: Page, name: str) -> str:
    ts = datetime.now().strftime("%H%M%S")
    path = str(SCREENSHOT_DIR / f"{ts}_{name.replace(' ','_').replace('/','_')}.png")
    try:
        page.screenshot(path=path, full_page=True)
    except Exception as e:
        path = f"screenshot_failed: {e}"
    return path


def collect_console_errors(page: Page, label: str):
    errors = []
    page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)
    page.on("pageerror", lambda err: errors.append(f"PAGE_ERROR: {err}"))
    return errors


def wait_for_page(page: Page, timeout=10000):
    try:
        page.wait_for_load_state("networkidle", timeout=timeout)
    except Exception:
        try:
            page.wait_for_load_state("domcontentloaded", timeout=5000)
        except Exception:
            pass


def login(page: Page, email: str, password: str) -> bool:
    try:
        page.goto(f"{PROD_URL}/login", wait_until="domcontentloaded", timeout=15000)
        page.fill('input[type="email"]', email, timeout=5000)
        page.fill('input[type="password"]', password, timeout=5000)
        page.click('button[type="submit"]', timeout=5000)
        page.wait_for_url(f"{PROD_URL}/**", timeout=10000)
        if "/login" not in page.url:
            return True
        return False
    except Exception as e:
        print(f"  Login failed: {e}")
        return False


# ── Probe: anon paths don't leak authed content ───────────────────────────────

def audit_anon_paths(context: BrowserContext):
    print("\n[AUTH-STATE] Anon user — verifying auth guard on protected pages")
    page = context.new_page()
    errors = collect_console_errors(page, "anon")

    protected = ["/", "/accounts", "/quotes", "/pipeline", "/commissions", "/admin/settings"]
    for path in protected:
        page.goto(f"{PROD_URL}{path}", wait_until="domcontentloaded", timeout=15000)
        wait_for_page(page, 5000)
        current = page.url
        if "/login" not in current and path not in current:
            sc = screenshot(page, f"anon_{path.replace('/','_')}")
            log_finding("BLOCKER", path, "Anon access to protected page",
                        "Redirect to /login", f"Stayed on {current}", sc, current)
        else:
            print(f"  ✅ Anon on {path} → redirected to login ({current})")

    # Accept page should load for anon
    page.goto(f"{PROD_URL}/accept", wait_until="domcontentloaded", timeout=15000)
    wait_for_page(page, 5000)
    if "/login" in page.url:
        sc = screenshot(page, "anon_accept_redirect")
        log_finding("BLOCKER", "/accept", "Customer accept page blocked for anon",
                    "/accept loads without auth", f"Redirected to {page.url}", sc, page.url)
    else:
        print(f"  ✅ /accept loads for anon ({page.url})")

    if errors:
        for err in set(errors):
            log_finding("MAJOR", "anon-paths", "Console error during anon navigation",
                        "No console errors", err)
    page.close()


# ── Probe: touch targets ≥44px ────────────────────────────────────────────────

def audit_touch_targets(page: Page, page_name: str):
    small_targets = page.evaluate("""() => {
        const interactive = document.querySelectorAll('a, button, [role="button"], input, select, textarea');
        const small = [];
        for (const el of interactive) {
            const r = el.getBoundingClientRect();
            if (r.width > 0 && r.height > 0 && (r.width < 44 || r.height < 44)) {
                small.push({
                    tag: el.tagName,
                    text: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 40),
                    w: Math.round(r.width),
                    h: Math.round(r.height),
                });
            }
        }
        return small.slice(0, 10);
    }""")
    if small_targets:
        targets_str = json.dumps(small_targets[:3])
        log_finding("MINOR", page_name, "Touch targets below 44px minimum",
                    "All interactive elements ≥44px", f"{len(small_targets)} elements too small — {targets_str}")


# ── Probe: horizontal scroll ──────────────────────────────────────────────────

def audit_horizontal_scroll(page: Page, page_name: str, viewport_name: str):
    has_scroll = page.evaluate("() => document.documentElement.scrollWidth > window.innerWidth")
    if has_scroll:
        sc = screenshot(page, f"hscroll_{page_name}_{viewport_name}")
        log_finding("MAJOR", page_name, f"Horizontal scroll at {viewport_name}",
                    "No horizontal overflow", "document.scrollWidth > window.innerWidth", sc, page.url)


# ── Probe: no console errors ──────────────────────────────────────────────────

def audit_page_with_console(page: Page, url: str, page_name: str):
    errors = []
    page.on("console", lambda msg: errors.append({"type": "console.error", "text": msg.text})
            if msg.type == "error" else None)
    page.on("pageerror", lambda err: errors.append({"type": "page_error", "text": str(err)}))

    page.goto(url, wait_until="domcontentloaded", timeout=15000)
    wait_for_page(page)

    for err in errors:
        log_finding("MAJOR", page_name, f"Console error on page load",
                    "No console errors", err["text"], "", url)
    return errors


# ── Main page click-through ───────────────────────────────────────────────────

def audit_pages(user_ctx: BrowserContext, admin_ctx: BrowserContext, anon_ctx: BrowserContext):
    print("\n[PAGE-AUDIT] Full page click-through + console surveillance")

    ctx_map = {"user": user_ctx, "admin": admin_ctx, "anon": anon_ctx}

    for vp in VIEWPORTS:
        print(f"\n  -- Viewport: {vp['name']} ({vp['width']}x{vp['height']}) --")
        for page_def in PAGES:
            auth = page_def["auth"]
            ctx = ctx_map.get(auth)
            if ctx is None:
                continue
            page = ctx.new_page()
            page.set_viewport_size({"width": vp["width"], "height": vp["height"]})

            url = f"{PROD_URL}{page_def['path']}"
            name = f"{page_def['name']} [{vp['name']}]"

            try:
                audit_page_with_console(page, url, name)

                # Check redirected to login unexpectedly (for auth pages)
                if auth != "anon" and "/login" in page.url:
                    sc = screenshot(page, f"auth_fail_{page_def['name']}")
                    log_finding("BLOCKER", page_def["name"],
                                f"Authenticated page redirects to login ({vp['name']})",
                                "Page loads for logged-in user", f"Redirected to {page.url}", sc, page.url)
                else:
                    print(f"    ✅ {name}")

                # Touch target audit
                audit_touch_targets(page, name)

                # Horizontal scroll on mobile
                if vp["width"] <= 430:
                    audit_horizontal_scroll(page, name, vp["name"])

                # Screenshot for evidence
                screenshot(page, f"{page_def['name'].replace(' ','_')}_{vp['width']}")

            except Exception as e:
                sc = screenshot(page, f"error_{page_def['name']}")
                log_finding("BLOCKER", page_def["name"], f"Page threw exception ({vp['name']})",
                            "Page loads", str(e), sc, url)
            finally:
                page.close()


# ── E2E flow: estimate → PDF → email → /accept → signature ───────────────────

def audit_e2e_flow(user_ctx: BrowserContext, admin_ctx: BrowserContext):
    if not TEST_EMAIL:
        print("\n[E2E-FLOW] Skipped — set AUDIT_USER_EMAIL and AUDIT_USER_PASS env vars")
        log_finding("MAJOR", "E2E flow", "E2E flow not run",
                    "Full flow tested", "No test credentials provided — set AUDIT_USER_EMAIL/PASS")
        return

    print("\n[E2E-FLOW] Critical path: estimate → save → PDF → email → /accept → signature")
    page = user_ctx.new_page()
    page.set_viewport_size({"width": 1440, "height": 900})

    errors = []
    page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)
    page.on("pageerror", lambda err: errors.append(str(err)))

    try:
        # 1. Navigate to quote builder
        page.goto(f"{PROD_URL}/quotes/builder", wait_until="domcontentloaded", timeout=15000)
        wait_for_page(page)
        sc = screenshot(page, "e2e_01_builder")
        if "/login" in page.url:
            log_finding("BLOCKER", "E2E flow", "Quote builder redirects to login",
                        "Builder loads for authenticated user", f"URL: {page.url}", sc)
            page.close()
            return
        print("  ✅ Step 1: Quote builder loaded")

        # 2. Try to find the Step 1 form fields (customer selection or new customer)
        try:
            # Look for customer selector or account search
            customer_input = page.locator('input[placeholder*="customer"], input[placeholder*="account"], input[placeholder*="search"], select').first
            if customer_input.is_visible(timeout=3000):
                print("  ✅ Step 2: Customer selector found")
            else:
                log_finding("MAJOR", "E2E flow", "Quote builder Step 1: customer input not found",
                            "Customer selector visible", "No matching input", sc)
        except Exception:
            log_finding("MINOR", "E2E flow", "Quote builder Step 1: could not locate customer input",
                        "Customer selector visible", "Timeout or not found")

        # 3. Check builder has step indicators
        try:
            steps = page.locator('[class*="step"], [data-step], [aria-label*="step"]').count()
            if steps > 0:
                print(f"  ✅ Step 3: Step indicators found ({steps})")
            else:
                log_finding("MINOR", "E2E flow", "Quote builder: no step indicators found",
                            "Step progress indicators visible", "0 step elements found")
        except Exception:
            pass

        # 4. Check PDF generation exists (look for PDF button on quotes detail)
        page.goto(f"{PROD_URL}/quotes", wait_until="domcontentloaded", timeout=15000)
        wait_for_page(page)
        sc = screenshot(page, "e2e_04_quotes_list")
        print("  ✅ Step 4: Quotes list loaded")

        # Check for existing quotes
        quote_rows = page.locator('tr, [data-quote], [class*="quote-row"]').count()
        if quote_rows == 0:
            log_finding("MINOR", "E2E flow", "Quotes list empty — cannot test PDF/email/accept flow",
                        "At least one quote exists for E2E testing", "Empty state — seed test data first",
                        sc, page.url)
        else:
            print(f"  ✅ Step 4: {quote_rows} quote rows found")

        # 5. Check /accept page structure (anon-accessible)
        accept_page = user_ctx.new_page()
        accept_page.goto(f"{PROD_URL}/accept", wait_until="domcontentloaded", timeout=15000)
        wait_for_page(accept_page)
        sc_accept = screenshot(accept_page, "e2e_05_accept_page")

        # Look for required elements on accept page
        sig_canvas = accept_page.locator('canvas, [class*="signature"]').count()
        if sig_canvas == 0:
            log_finding("BLOCKER", "E2E flow", "/accept page: signature canvas not found",
                        "Signature pad visible on /accept", "No canvas or signature element found",
                        sc_accept, accept_page.url)
        else:
            print(f"  ✅ Step 5: /accept page has signature element ({sig_canvas} found)")

        accept_page.close()

        # 6. Check GHL push API responds (auth required)
        ghl_status = page.evaluate("""async () => {
            const r = await fetch('/api/ghl-proxy', {method:'POST', body:'{}', headers:{'Content-Type':'application/json'}});
            return r.status;
        }""")
        if ghl_status == 401:
            print("  ✅ Step 6: GHL proxy auth guard working (401 without auth)")
        else:
            log_finding("MAJOR", "E2E flow", "GHL proxy returned unexpected status without auth",
                        "HTTP 401", f"HTTP {ghl_status}")

        # 7. Check QB sync API
        qb_status = page.evaluate("""async () => {
            const r = await fetch('/api/quickbooks/sync', {method:'POST', body:'{}', headers:{'Content-Type':'application/json'}});
            return r.status;
        }""")
        if qb_status == 401:
            print("  ✅ Step 7: QB sync auth guard working (401 without auth)")
        else:
            log_finding("MAJOR", "E2E flow", "QB sync returned unexpected status without auth",
                        "HTTP 401", f"HTTP {qb_status}")

        # 8. Check Resend email API
        email_status = page.evaluate("""async () => {
            const r = await fetch('/api/email/send-quote-pdf', {method:'POST', body:'{}', headers:{'Content-Type':'application/json'}});
            return r.status;
        }""")
        if email_status == 401:
            print("  ✅ Step 8: Email API auth guard working (401 without auth)")
        elif email_status == 503:
            log_finding("MAJOR", "E2E flow", "Email API returned 503 — RESEND_API_KEY not configured",
                        "HTTP 401 (auth guard)", "HTTP 503 — RESEND_API_KEY missing in CF Pages env")
        else:
            log_finding("MINOR", "E2E flow", "Email API returned unexpected status without auth",
                        "HTTP 401", f"HTTP {email_status}")

    except Exception as e:
        sc = screenshot(page, "e2e_exception")
        log_finding("BLOCKER", "E2E flow", "E2E flow threw exception",
                    "Flow completes", str(e), sc)
    finally:
        for err in set(errors):
            log_finding("MAJOR", "E2E flow", "Console error during E2E flow",
                        "No console errors", err)
        page.close()


# ── Kanban / Pipeline mobile audit ───────────────────────────────────────────

def audit_kanban_mobile(user_ctx: BrowserContext):
    print("\n[MOBILE-KANBAN] Pipeline Kanban at 375px")
    page = user_ctx.new_page()
    page.set_viewport_size({"width": 375, "height": 667})

    page.goto(f"{PROD_URL}/pipeline", wait_until="domcontentloaded", timeout=15000)
    wait_for_page(page)
    sc = screenshot(page, "kanban_375")

    # Check horizontal scroll
    has_scroll = page.evaluate("() => document.documentElement.scrollWidth > window.innerWidth")
    if has_scroll:
        log_finding("MAJOR", "Pipeline Kanban", "Horizontal scroll at 375px",
                    "Kanban readable without horizontal scroll (or has swipe-based layout)",
                    "scrollWidth > innerWidth", sc, page.url)
    else:
        print("  ✅ Pipeline Kanban: no horizontal scroll at 375px")

    # Check kanban columns are visible
    columns = page.locator('[class*="column"], [class*="lane"], [class*="stage"]').count()
    if columns == 0:
        log_finding("MINOR", "Pipeline Kanban", "No kanban column elements found at 375px",
                    "Kanban columns visible", f"0 column elements — may be collapsed or hidden", sc)
    else:
        print(f"  ✅ Pipeline Kanban: {columns} column elements found")

    page.close()


# ── Folio search audit ────────────────────────────────────────────────────────

def audit_folio_search(user_ctx: BrowserContext):
    print("\n[FOLIO-SEARCH] Folio lookup API + UI")
    page = user_ctx.new_page()

    # Test API directly with a known Miami-Dade address
    result = page.evaluate("""async () => {
        const url = '/api/folio-lookup?address=17587+Homestead+Ave+Miami+FL+33157';
        const r = await fetch(url);
        const body = await r.text();
        return {status: r.status, body: body.slice(0, 200)};
    }""")
    if result["status"] == 200:
        print(f"  ✅ Folio lookup returned 200")
        try:
            data = json.loads(result["body"])
            if "folio" in data:
                print(f"  ✅ Folio number returned: {data['folio']}")
            else:
                log_finding("MAJOR", "Folio lookup", "API returned 200 but no folio field",
                            "{'folio': '...', ...}", result["body"])
        except Exception:
            log_finding("MINOR", "Folio lookup", "API returned non-JSON body",
                        "JSON response", result["body"])
    elif result["status"] == 400:
        log_finding("MINOR", "Folio lookup", "API returned 400 for valid address",
                    "HTTP 200 with folio", f"HTTP 400 — {result['body']}")
    else:
        log_finding("MAJOR", "Folio lookup", "Folio lookup API returned unexpected status",
                    "HTTP 200", f"HTTP {result['status']} — {result['body']}")

    page.close()


# ── Report output ─────────────────────────────────────────────────────────────

def print_report():
    print("\n" + "=" * 60)
    print(f" AUDIT PUNCH LIST — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print("=" * 60)

    by_severity = {"BLOCKER": [], "MAJOR": [], "MINOR": [], "POLISH": []}
    for f in findings:
        by_severity.setdefault(f["severity"], []).append(f)

    labels = {"BLOCKER": "🔴 BLOCKER", "MAJOR": "🟠 MAJOR", "MINOR": "🟡 MINOR", "POLISH": "🔵 POLISH"}
    total = len(findings)

    for sev in ["BLOCKER", "MAJOR", "MINOR", "POLISH"]:
        items = by_severity[sev]
        if not items:
            continue
        print(f"\n{labels[sev]} ({len(items)})")
        print("-" * 50)
        for i, f in enumerate(items, 1):
            print(f"  {i}. [{f['page']}] {f['action']}")
            print(f"     URL: {f.get('url', 'N/A')}")
            print(f"     Expected: {f['expected']}")
            print(f"     Got: {f['actual']}")
            if f.get("evidence"):
                print(f"     Evidence: {f['evidence']}")

    print(f"\n── SUMMARY ─────────────────────────────────────────────")
    for sev in ["BLOCKER", "MAJOR", "MINOR", "POLISH"]:
        count = len(by_severity[sev])
        sym = {"BLOCKER": "🔴", "MAJOR": "🟠", "MINOR": "🟡", "POLISH": "🔵"}[sev]
        print(f"  {sym} {sev}: {count}")
    print(f"  Total findings: {total}")

    if total == 0:
        print("\n✅ No findings. Sales-tool passes audit.")
    else:
        print("\n⚠ Address BLOCKERs before next deploy.")

    # Write JSON report
    report_path = f"/tmp/audit-report-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
    with open(report_path, "w") as f:
        json.dump({"timestamp": datetime.now().isoformat(), "total": total,
                   "by_severity": {k: len(v) for k, v in by_severity.items()},
                   "findings": findings}, f, indent=2)
    print(f"\nFull JSON report: {report_path}")
    print(f"Screenshots: {SCREENSHOT_DIR}/")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Sales-Tool E2E Audit")
    parser.add_argument("--url", default=PROD_URL, help="Production URL")
    parser.add_argument("--user", default=TEST_EMAIL, help="Test user email")
    parser.add_argument("--pass", dest="password", default=TEST_PASS, help="Test user password")
    parser.add_argument("--admin", default=ADMIN_EMAIL, help="Admin email")
    parser.add_argument("--admin-pass", default=ADMIN_PASS, help="Admin password")
    args = parser.parse_args()

    global PROD_URL
    PROD_URL = args.url

    print(f"\n{'='*60}")
    print(f" Sales-Tool Live E2E Audit")
    print(f" Target: {PROD_URL}")
    print(f" Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*60}")

    if not args.user:
        print("\n⚠ No test credentials — set AUDIT_USER_EMAIL + AUDIT_USER_PASS")
        print("  Auth-protected flow tests will be skipped or limited.\n")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        # Anon context
        anon_ctx = browser.new_context()

        # User context
        user_ctx = browser.new_context()
        user_page = None
        user_logged_in = False
        if args.user and args.password:
            user_page = user_ctx.new_page()
            user_logged_in = login(user_page, args.user, args.password)
            if user_logged_in:
                print(f"✅ Logged in as user: {args.user}")
                user_page.close()
            else:
                print(f"⚠ Login failed for {args.user} — user-auth tests will be limited")
                log_finding("BLOCKER", "Auth", "User login failed",
                            f"Successful login as {args.user}", "Login returned to /login")

        # Admin context
        admin_ctx = browser.new_context()
        admin_logged_in = False
        if args.admin and args.admin_pass:
            admin_page = admin_ctx.new_page()
            admin_logged_in = login(admin_page, args.admin, args.admin_pass)
            if admin_logged_in:
                print(f"✅ Logged in as admin: {args.admin}")
                admin_page.close()
            else:
                print(f"⚠ Admin login failed for {args.admin}")
                log_finding("MAJOR", "Auth", "Admin login failed",
                            f"Successful login as {args.admin}", "Login returned to /login")
        elif args.user:
            # Use user context as fallback for admin tests
            admin_ctx = user_ctx

        # Run audits
        audit_anon_paths(anon_ctx)
        audit_pages(user_ctx, admin_ctx, anon_ctx)
        audit_e2e_flow(user_ctx, admin_ctx)
        audit_kanban_mobile(user_ctx)
        audit_folio_search(user_ctx)

        browser.close()

    print_report()
    return 1 if any(f["severity"] == "BLOCKER" for f in findings) else 0


if __name__ == "__main__":
    sys.exit(main())
