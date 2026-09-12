#!/usr/bin/env python3
"""Probe 4: the dashboard fills its figures in client-side, so render it in a real
browser and capture which requests supply the numbers. If a clean JSON endpoint
exists, update.py can call that directly and skip the browser entirely."""
import json, re
from playwright.sync_api import sync_playwright

calls = []
with sync_playwright() as pw:
    b = pw.chromium.launch()
    pg = b.new_page()

    def on_resp(r):
        try:
            ct = (r.headers or {}).get("content-type", "")
            if "json" in ct and "sharplink" not in r.url.split("/")[2:3][0:1] or True:
                calls.append((r.status, ct[:30], r.url))
        except Exception:
            pass
    pg.on("response", on_resp)

    pg.goto("https://www.sharplink.com/dashboard", wait_until="networkidle", timeout=60000)
    pg.wait_for_timeout(3000)

    print("########## JSON responses the page fetched")
    seen = set()
    for status, ct, url in calls:
        if "json" not in ct: continue
        if url in seen: continue
        seen.add(url)
        print(f"  {status} {ct:24} {url[:150]}")

    print("\n########## rendered figure cards")
    cards = pg.evaluate("""() => {
        const out = [];
        document.querySelectorAll('h3.title').forEach(h => {
            const card = h.closest('[class*=card]') || h.parentElement.parentElement;
            if (!card) return;
            const txt = card.innerText.split('\\n').map(s => s.trim()).filter(Boolean);
            out.push(txt.slice(0, 6));
        });
        return out;
    }""")
    for c in cards: print("   ", c)

    print("\n########## anything that still looks like an unfilled template")
    left = pg.evaluate("() => (document.body.innerText.match(/\\{\\{[^}]+\\}\\}/g) || []).slice(0,10)")
    print("   ", left or "none")
    b.close()

print("\n########## pick out the most promising endpoint")
import requests
UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36"}
for status, ct, url in calls:
    if "json" not in ct or status != 200: continue
    if not re.search(r'dashboard|treasur|eth|nav|metric|stat|holding', url, re.I): continue
    try:
        j = requests.get(url, headers=UA, timeout=30).json()
        s = json.dumps(j)
        if re.search(r'mnav|nav|holding|eth', s, re.I):
            print(f"\n  {url[:140]}\n     keys={list(j)[:14] if isinstance(j,dict) else type(j).__name__}")
            print(f"     {s[:420]}")
    except Exception as e:
        print(f"  {url[:90]} -> EXC {e}")
