#!/usr/bin/env python3
"""End-to-end smoke suite for the portfolio site.

Two layers:
  1. Static integrity  — every local asset referenced by index.html / 404.html
     returns 200 (catches dangling <script>/<link> after refactors).
  2. Runtime behavior  — drives real Chrome (Playwright, system channel) and
     asserts the JS-driven features work AND that the page throws no console
     errors or uncaught exceptions.

Usage:  smoke_test.py [BASE_URL]
        BASE_URL defaults to http://127.0.0.1:8137 (the local gh_pages_server).
        Pass https://saile.codes to run it against the live deployment instead.

Exit code 0 = all green; 1 = at least one failure (so it can gate a push).
"""
import re
import ssl
import sys
import time
import posixpath
import urllib.request
import urllib.error

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8137").rstrip("/")

# Framework Python on macOS ships without a usable CA store, so urllib can't
# verify HTTPS (Chrome/curl are fine). Use certifi's bundle when testing the live
# https:// site; plain http:// localhost doesn't need it.
try:
    import certifi
    SSL_CTX = ssl.create_default_context(cafile=certifi.where())
except Exception:  # noqa: BLE001
    SSL_CTX = ssl.create_default_context()

# hosts we intentionally don't fail on (external, not part of the repo)
EXTERNAL_OK = ("gc.zgo.at", "fonts.googleapis.com", "fonts.gstatic.com")

results = []  # (name, ok, detail)


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    return bool(ok)


def http_status(url):
    try:
        with urllib.request.urlopen(url, timeout=15, context=SSL_CTX) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code
    except Exception as e:  # noqa: BLE001
        return f"ERR:{e}"


def fetch_text(path):
    with urllib.request.urlopen(BASE + path, timeout=15, context=SSL_CTX) as r:
        return r.read().decode("utf-8", "replace")


# ---------------------------------------------------------------- 1. static integrity
def static_integrity():
    ref_pat = re.compile(r'(?:src|href)\s*=\s*"([^"]+)"')
    comment_pat = re.compile(r"<!--.*?-->", re.S)
    for page in ("/index.html", "/404.html"):
        html = comment_pat.sub("", fetch_text(page))  # ignore refs inside HTML comments
        pagedir = posixpath.dirname(page)
        seen = set()
        for raw in ref_pat.findall(html):
            ref = raw.split("?")[0].split("#")[0]
            if not ref or ref.startswith(("http", "//", "data:", "mailto:", "#", "javascript:")):
                continue
            if not ref.endswith((".css", ".js", ".png", ".ico", ".svg", ".webmanifest")):
                continue
            resolved = ref if ref.startswith("/") else "/" + posixpath.normpath(posixpath.join(pagedir, ref)).lstrip("/")
            if resolved in seen:
                continue
            seen.add(resolved)
            st = http_status(BASE + resolved)
            check(f"[asset] {page} -> {resolved}", st == 200, f"HTTP {st}")


# ---------------------------------------------------------------- 2. runtime behavior
def runtime_behavior():
    import os
    from playwright.sync_api import sync_playwright

    # Which Chrome to drive. Locally we default to system Google Chrome
    # (channel="chrome", no browser download). CI sets SMOKE_CHROME_CHANNEL=""
    # to fall back to Playwright's bundled Chromium (installed via
    # `playwright install chromium`).
    channel = os.environ.get("SMOKE_CHROME_CHANNEL", "chrome")
    launch_kwargs = {"headless": True}
    if channel:
        launch_kwargs["channel"] = channel

    console_errors, page_errors, req_failed = [], [], []
    with sync_playwright() as p:
        browser = p.chromium.launch(**launch_kwargs)
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.on("console", lambda m: console_errors.append(f"{m.type}: {m.text}") if m.type == "error" else None)
        page.on("pageerror", lambda e: page_errors.append(str(e)))
        page.on("requestfailed",
                lambda r: req_failed.append(r.url) if not any(h in r.url for h in EXTERNAL_OK) else None)

        page.goto(BASE + "/", wait_until="networkidle", timeout=30000)
        time.sleep(2.5)  # allow typewriter / reveal / marquee to run

        check("Hero headline renders",
              "story" in page.locator("h1").first.inner_text().lower())
        check("Footer #year filled by JS",
              page.locator("#year").count() and page.locator("#year").inner_text().strip().isdigit())
        check("Marquee items duplicated by JS",
              page.locator(".marquee__item").count() > 12,
              f"count={page.locator('.marquee__item').count()}")
        check("Terminal typing engine ran",
              page.locator("#typed").count() and len(page.locator("#typed").inner_text().strip()) > 0)
        check("Scroll-reveal added .is-in",
              page.locator("[data-reveal].is-in").count() > 0)

        # work card -> plane opens, Escape closes
        card = page.locator(".card--link").first
        if card.count():
            card.scroll_into_view_if_needed()
            card.click()
            time.sleep(1.2)
            check("Work card opens a project plane",
                  page.evaluate("document.body.classList.contains('is-planed')"))
            page.keyboard.press("Escape")
            time.sleep(0.8)
            check("Escape closes the plane",
                  page.evaluate("!document.body.classList.contains('is-planed')"))
        else:
            check("Work card present", False, "no .card--link")

        # theme toggle
        if page.locator("#themeToggle").count():
            before = page.evaluate("document.documentElement.getAttribute('data-theme')")
            page.locator("#themeToggle").click()
            time.sleep(0.4)
            after = page.evaluate("document.documentElement.getAttribute('data-theme')")
            check("Theme toggle flips data-theme", before != after, f"{before}->{after}")
        else:
            check("Theme toggle present", False)

        # deep-link routing through the 404 shim (needs GH-Pages-like 404.html)
        dp = browser.new_page()
        dp.on("pageerror", lambda e: page_errors.append("deep-link: " + str(e)))
        dp.goto(BASE + "/f1", wait_until="networkidle", timeout=30000)
        time.sleep(2.0)
        check("Deep link /f1 opens the plane",
              dp.url.endswith("/f1") and dp.evaluate("document.body.classList.contains('is-planed')"),
              f"url={dp.url}")

        browser.close()

    check("No console errors", not console_errors, "; ".join(console_errors))
    check("No uncaught exceptions", not page_errors, "; ".join(page_errors))
    check("No failed (local) requests", not req_failed, "; ".join(req_failed))


def main():
    print(f"# smoke test against {BASE}\n")
    try:
        static_integrity()
    except Exception as e:  # noqa: BLE001
        check("static integrity phase", False, repr(e))
    try:
        runtime_behavior()
    except Exception as e:  # noqa: BLE001
        check("runtime behavior phase", False, repr(e))

    passed = sum(1 for _, ok, _ in results if ok)
    for name, ok, detail in results:
        line = f"  [{'PASS' if ok else 'FAIL'}] {name}"
        if detail and not ok:
            line += f"  -> {detail}"
        print(line)
    print(f"\n{passed}/{len(results)} checks passed")
    ok_all = all(ok for _, ok, _ in results) and len(results) > 0
    print("RESULT:", "ALL GREEN ✅" if ok_all else "FAILURES ❌")
    return 0 if ok_all else 1


if __name__ == "__main__":
    sys.exit(main())
