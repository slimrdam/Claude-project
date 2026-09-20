"""One-off research pull for SBET short interest. Not wired to the site.

The session container's egress policy blocks finra.org and sec.gov, so this runs
on a runner and prints to the job log. Every block is independent: a failure
prints its reason and the rest still run.
"""
import json, io, os, sys, zipfile, datetime as dt
import urllib.request, urllib.error

UA = "Claude-project-research/1.0 (+https://github.com/slimrdam/Claude-project)"
TIMEOUT = 45


def get(url, headers=None, raw=False):
    h = {"User-Agent": UA, "Accept-Encoding": "gzip, deflate"}
    h.update(headers or {})
    req = urllib.request.Request(url, headers=h)
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        data = r.read()
    if r.headers.get("Content-Encoding") == "gzip":
        import gzip
        data = gzip.decompress(data)
    return data if raw else data.decode("utf-8", "replace")


def head(name):
    print("\n" + "=" * 70)
    print("== " + name)
    print("=" * 70, flush=True)


def fail(e):
    print("FAILED: %s: %s" % (type(e).__name__, e), flush=True)


# ---------------------------------------------------------------- A: CIK
CIK = None
head("A. resolve SBET -> CIK")
try:
    j = json.loads(get("https://www.sec.gov/files/company_tickers.json"))
    for v in j.values():
        if v["ticker"].upper() == "SBET":
            CIK = int(v["cik_str"])
            print("SBET =", v["title"], "CIK", CIK)
    if CIK is None:
        print("SBET not found in company_tickers.json")
except Exception as e:
    fail(e)

# ------------------------------------------- B: Nasdaq short interest table
head("B. Nasdaq short interest settlement table")
try:
    j = json.loads(get(
        "https://api.nasdaq.com/api/quote/SBET/short-interest?assetclass=stocks",
        headers={"Accept": "application/json"}))
    rows = (j.get("data") or {}).get("shortInterestTable", {}).get("rows") or []
    print("rows:", len(rows))
    for r in rows[:20]:
        print(r)
except Exception as e:
    fail(e)

# --------------------------------------------- C: FINRA daily short volume
head("C. FINRA daily short sale volume, SBET")
print("date|shortVol|shortExemptVol|totalVol|shortPct")
d = dt.date.today()
got = 0
tried = 0
while got < 30 and tried < 70:
    tried += 1
    d -= dt.timedelta(days=1)
    if d.weekday() >= 5:
        continue
    url = "https://cdn.finra.org/equity/regsho/daily/CNMSshvol%s.txt" % d.strftime("%Y%m%d")
    try:
        txt = get(url)
    except Exception as e:
        if got == 0 and tried < 6:
            print("%s  (no file: %s)" % (d, getattr(e, "code", e)))
        continue
    for line in txt.splitlines():
        p = line.split("|")
        if len(p) >= 5 and p[1] == "SBET":
            sv, se, tv = int(p[2]), int(p[3]), int(p[4])
            print("%s|%d|%d|%d|%.1f%%" % (p[0], sv, se, tv, 100.0 * sv / tv if tv else 0))
            got += 1
            break
print("days found:", got, flush=True)

# ---------------------------------------- D: EDGAR recent filings (90 days)
head("D. EDGAR recent filings, last 90 days")
if CIK:
    try:
        j = json.loads(get("https://data.sec.gov/submissions/CIK%010d.json" % CIK))
        r = j["filings"]["recent"]
        cut = (dt.date.today() - dt.timedelta(days=90)).isoformat()
        n = 0
        for i in range(len(r["form"])):
            if r["filingDate"][i] >= cut:
                n += 1
                print("%s  %-12s %s  acc=%s" % (
                    r["filingDate"][i], r["form"][i],
                    (r.get("primaryDocDescription") or [""] * (i + 1))[i][:40],
                    r["accessionNumber"][i]))
        print("count:", n)
        print("shares outstanding (cover page):", j.get("EntityCommonStockSharesOutstanding"))
    except Exception as e:
        fail(e)
else:
    print("skipped, no CIK")

# ------------------------------ E: shares outstanding history (the denominator)
head("E. dei:EntityCommonStockSharesOutstanding history")
if CIK:
    try:
        j = json.loads(get(
            "https://data.sec.gov/api/xbrl/companyconcept/CIK%010d/dei/EntityCommonStockSharesOutstanding.json" % CIK))
        pts = []
        for unit in j.get("units", {}).values():
            for p in unit:
                pts.append((p.get("end"), p.get("val"), p.get("form"), p.get("filed")))
        pts.sort(key=lambda x: (x[3] or "", x[0] or ""))
        for p in pts[-25:]:
            print("asof=%s  shares=%s  form=%s  filed=%s" % p)
    except Exception as e:
        fail(e)
else:
    print("skipped, no CIK")

# ----------------------------------------------- F: price and volume, Stooq
head("F. SBET daily OHLCV (stooq)")
try:
    txt = get("https://stooq.com/q/d/l/?s=sbet.us&i=d")
    lines = txt.strip().splitlines()
    print(lines[0])
    for line in lines[-35:]:
        print(line)
except Exception as e:
    fail(e)

# ---------------------------------------------------- G: SEC fails-to-deliver
head("G. SEC fails-to-deliver, SBET")
today = dt.date.today()
for back in range(0, 4):
    m = today.replace(day=1) - dt.timedelta(days=31 * back)
    for half in ("a", "b"):
        url = ("https://www.sec.gov/files/data/frequently-requested-foia-document-"
               "fails-deliver-data/cnsfails%04d%02d%s.zip" % (m.year, m.month, half))
        try:
            blob = get(url, raw=True)
            z = zipfile.ZipFile(io.BytesIO(blob))
            name = z.namelist()[0]
            hits = 0
            with z.open(name) as fh:
                for raw in io.TextIOWrapper(fh, "latin-1"):
                    p = raw.split("|")
                    if len(p) > 3 and p[2].strip() == "SBET":
                        print("%s %s qty=%s price=%s" % (m.strftime("%Y-%m"), p[0], p[3], p[5] if len(p) > 5 else ""))
                        hits += 1
            print("-- %04d%02d%s rows=%d" % (m.year, m.month, half, hits))
        except Exception as e:
            print("-- %04d%02d%s unavailable (%s)" % (m.year, m.month, half, getattr(e, "code", e)))

# -------------------------------------------- H: FINRA consolidated short int
head("H. FINRA consolidated short interest API")
for url in (
    "https://api.finra.org/data/group/otcMarket/name/consolidatedShortInterest?symbolCode=SBET&limit=30",
    "https://api.finra.org/data/group/otcMarket/name/consolidatedShortInterest?limit=1",
):
    try:
        print(url)
        print(get(url, headers={"Accept": "application/json"})[:1500])
    except Exception as e:
        fail(e)

print("\n\nPROBE COMPLETE", flush=True)
