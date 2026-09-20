"""Does a real browser get past what plain HTTP could not? Runner-side test."""
import json
from playwright.sync_api import sync_playwright

TARGETS = [
    ("SEC company_tickers", "https://www.sec.gov/files/company_tickers.json"),
    ("SEC EDGAR SBET",
     "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=SBET&type=&dateb=&owner=include&count=40"),
    ("fintel SBET short", "https://fintel.io/ss/us/sbet"),
    ("stockanalysis SBET", "https://stockanalysis.com/stocks/sbet/statistics/"),
]

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    ctx = b.new_context(
        user_agent=("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"),
        locale="en-US", viewport={"width": 1400, "height": 900})
    pg = ctx.new_page()
    for name, url in TARGETS:
        print("\n" + "=" * 66)
        print("== " + name)
        print("=" * 66, flush=True)
        try:
            r = pg.goto(url, timeout=45000, wait_until="domcontentloaded")
            print("HTTP", r.status if r else "??")
            try:
                pg.wait_for_timeout(4000)          # let any JS challenge resolve
            except Exception:
                pass
            print("title:", (pg.title() or "")[:90])
            body = pg.inner_text("body")
            print("body length:", len(body))
            print("---- first 1200 chars ----")
            print(body[:1200])
        except Exception as e:
            print("FAILED %s: %s" % (type(e).__name__, str(e).splitlines()[0][:150]))
    b.close()
print("\n\nBROWSER PROBE COMPLETE", flush=True)
