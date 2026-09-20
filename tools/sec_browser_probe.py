"""Runner-side browser pull. Not wired to the site."""
from playwright.sync_api import sync_playwright

# SEC's 403 page says: declare your traffic with company-specific info.
SEC_UA = ("SharpLink-thesis-research/1.0 (slimrdam; "
          "slimrdam@users.noreply.github.com)")
CHROME_UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
             "(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36")


def run(p, name, url, ua, wait_ms, full=False, tries=1):
    print("\n" + "=" * 66)
    print("== " + name)
    print("=" * 66, flush=True)
    b = p.chromium.launch(args=["--no-sandbox",
                                "--disable-blink-features=AutomationControlled"])
    ctx = b.new_context(user_agent=ua, locale="en-US",
                        viewport={"width": 1400, "height": 1000})
    pg = ctx.new_page()
    for attempt in range(1, tries + 1):
        try:
            r = pg.goto(url, timeout=60000, wait_until="domcontentloaded")
            status = r.status if r else 0
            pg.wait_for_timeout(wait_ms)
            title = (pg.title() or "")[:80]
            body = pg.inner_text("body")
            print(f"attempt {attempt}: HTTP {status}  title={title!r}  len={len(body)}")
            if status == 200:
                print(body if full else body[:900])
                break
            if attempt < tries:
                pg.wait_for_timeout(20000)
        except Exception as e:
            print(f"attempt {attempt}: FAILED {type(e).__name__}: "
                  f"{str(e).splitlines()[0][:120]}")
    b.close()


with sync_playwright() as p:
    run(p, "stockanalysis SBET statistics",
        "https://stockanalysis.com/stocks/sbet/statistics/",
        CHROME_UA, 5000, full=True)
    run(p, "SEC company_tickers, declared UA",
        "https://www.sec.gov/files/company_tickers.json",
        SEC_UA, 3000, tries=3)
    run(p, "fintel SBET, long challenge wait",
        "https://fintel.io/ss/us/sbet", CHROME_UA, 20000, full=True)

print("\n\nBROWSER PROBE COMPLETE", flush=True)
