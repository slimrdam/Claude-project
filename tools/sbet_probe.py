"""Can the nightly job reach stockanalysis without a browser? Runner-side."""
import json, re, urllib.request, urllib.error

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36")
FIELDS = ("Short Interest", "Short Previous Month", "Short % of Shares Out",
          "Short % of Float", "Short Ratio", "Shares Outstanding")


def get(url, timeout=30):
    req = urllib.request.Request(url, headers={
        "User-Agent": UA, "Accept": "text/html,application/json,*/*",
        "Accept-Language": "en-US,en;q=0.9", "Accept-Encoding": "identity"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, r.read().decode("utf-8", "replace")


for label, url in [
    ("statistics page (plain HTTP)", "https://stockanalysis.com/stocks/sbet/statistics/"),
    ("sveltekit __data.json", "https://stockanalysis.com/stocks/sbet/statistics/__data.json"),
    ("api symbol statistics", "https://stockanalysis.com/api/symbol/s/SBET/statistics"),
    ("api quotes", "https://stockanalysis.com/api/quotes/s/SBET"),
]:
    print("\n" + "=" * 64)
    print("== " + label)
    print("=" * 64, flush=True)
    try:
        status, body = get(url)
    except urllib.error.HTTPError as e:
        print("HTTP %s" % e.code); continue
    except Exception as e:
        print("%s: %s" % (type(e).__name__, e)); continue
    print("HTTP %s  len=%d" % (status, len(body)))
    hits = [f for f in FIELDS if f in body]
    print("field labels present:", hits or "none")
    for f in FIELDS:
        # the value sits near its label in the markup
        m = re.search(re.escape(f) + r'.{0,160}?', body, re.S)
        if m:
            txt = re.sub(r"<[^>]+>", " ", m.group(0))
            txt = re.sub(r"\s+", " ", txt).strip()
            print("   %-24s | %s" % (f, txt[:110]))
    if not hits:
        print("---- head ----")
        print(body[:400])

print("\n\nPROBE COMPLETE", flush=True)
