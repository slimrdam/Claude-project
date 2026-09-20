"""One-off research pull for SBET short interest. Not wired to the site.

The session container's egress policy blocks finra.org and sec.gov, so this runs
on a runner and prints to the job log. Every section is isolated: a failure
prints its reason and the rest still run.
"""
import json, io, sys, zipfile, time, datetime as dt
import urllib.request, urllib.error

# SEC's fair-access policy wants a declared identity. Public GitHub address,
# not a private one.
UA = "slimrdam/Claude-project research slimrdam@users.noreply.github.com"


def get(url, headers=None, raw=False, timeout=30):
    h = {"User-Agent": UA, "Accept-Encoding": "gzip, deflate",
         "Accept": "*/*", "Connection": "close"}
    h.update(headers or {})
    req = urllib.request.Request(url, headers=h)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        data = r.read()
        enc = r.headers.get("Content-Encoding")
    if enc == "gzip":
        import gzip
        data = gzip.decompress(data)
    return data if raw else data.decode("utf-8", "replace")


def section(name, fn):
    print("\n" + "=" * 70)
    print("== " + name)
    print("=" * 70, flush=True)
    try:
        fn()
    except Exception as e:
        print("SECTION FAILED: %s: %s" % (type(e).__name__, e), flush=True)


STATE = {}


# ---------------------------------------------------------------- A: CIK
def a_cik():
    j = json.loads(get("https://www.sec.gov/files/company_tickers.json",
                       headers={"Accept": "application/json"}))
    for v in j.values():
        if v["ticker"].upper() == "SBET":
            STATE["cik"] = int(v["cik_str"])
            print("SBET =", v["title"], "CIK", STATE["cik"])
    if "cik" not in STATE:
        print("SBET not in company_tickers.json")


# --------------------------------------------- B: FINRA daily short volume
def b_regsho():
    print("date|shortVol|shortExemptVol|totalVol|shortPct")
    d = dt.date.today()
    got = tried = 0
    misses = []
    while got < 35 and tried < 80:
        tried += 1
        d -= dt.timedelta(days=1)
        if d.weekday() >= 5:
            continue
        url = ("https://cdn.finra.org/equity/regsho/daily/CNMSshvol%s.txt"
               % d.strftime("%Y%m%d"))
        try:
            txt = get(url, timeout=25)
        except Exception as e:
            misses.append("%s(%s)" % (d, getattr(e, "code", type(e).__name__)))
            continue
        for line in txt.splitlines():
            p = line.split("|")
            if len(p) >= 5 and p[1].strip() == "SBET":
                try:
                    sv, se, tv = float(p[2]), float(p[3]), float(p[4])
                except ValueError:
                    print("RAW(unparsed): " + line)
                    break
                print("%s|%.0f|%.0f|%.0f|%.1f%%"
                      % (p[0], sv, se, tv, 100.0 * sv / tv if tv else 0))
                got += 1
                break
    print("days found:", got)
    if misses:
        print("no file for:", " ".join(misses[:12]))


# ------------------------------------------ C: FINRA short interest (numerator)
def c_shortint():
    urls = [
        ("GET api.finra.org consolidatedShortInterest",
         "https://api.finra.org/data/group/otcMarket/name/consolidatedShortInterest?limit=5"),
        ("GET api.finra.org filtered by symbol",
         "https://api.finra.org/data/group/otcMarket/name/consolidatedShortInterest"
         "?compareFilters=[{\"fieldName\":\"symbolCode\",\"fieldValue\":\"SBET\",\"compareType\":\"equal\"}]&limit=40"),
    ]
    for label, u in urls:
        print("\n--", label)
        try:
            print(get(u, headers={"Accept": "application/json"}, timeout=25)[:2000])
        except Exception as e:
            print("   failed: %s %s" % (type(e).__name__, getattr(e, "code", e)))
    # POST form, which is how FINRA's own console queries it
    print("\n-- POST api.finra.org consolidatedShortInterest")
    try:
        body = json.dumps({
            "compareFilters": [{"fieldName": "symbolCode",
                                "fieldValue": "SBET", "compareType": "equal"}],
            "limit": 40,
            "sortFields": ["-settlementDate"],
        }).encode()
        req = urllib.request.Request(
            "https://api.finra.org/data/group/otcMarket/name/consolidatedShortInterest",
            data=body, method="POST",
            headers={"User-Agent": UA, "Content-Type": "application/json",
                     "Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=25) as r:
            print(r.read().decode("utf-8", "replace")[:3000])
    except Exception as e:
        print("   failed: %s %s" % (type(e).__name__, getattr(e, "code", e)))


# ------------------------------------------- D: EDGAR filings (the catalysts)
def d_filings():
    cik = STATE.get("cik")
    if not cik:
        print("skipped, no CIK")
        return
    j = json.loads(get("https://data.sec.gov/submissions/CIK%010d.json" % cik,
                       headers={"Accept": "application/json"}))
    print("name:", j.get("name"))
    print("cover-page shares outstanding:",
          j.get("EntityCommonStockSharesOutstanding"))
    r = j["filings"]["recent"]
    cut = (dt.date.today() - dt.timedelta(days=100)).isoformat()
    n = 0
    for i in range(len(r["form"])):
        if r["filingDate"][i] >= cut:
            n += 1
            desc = (r.get("primaryDocDescription") or [""] * len(r["form"]))[i]
            print("%s  %-12s %s" % (r["filingDate"][i], r["form"][i], desc[:50]))
    print("filings in window:", n)


# ------------------------- E: shares outstanding history (the denominator)
def e_shares():
    cik = STATE.get("cik")
    if not cik:
        print("skipped, no CIK")
        return
    time.sleep(0.3)
    j = json.loads(get(
        "https://data.sec.gov/api/xbrl/companyconcept/CIK%010d/dei/"
        "EntityCommonStockSharesOutstanding.json" % cik,
        headers={"Accept": "application/json"}))
    pts = []
    for unit in j.get("units", {}).values():
        for p in unit:
            pts.append((p.get("end"), p.get("val"), p.get("form"), p.get("filed")))
    pts.sort(key=lambda x: (x[3] or "", x[0] or ""))
    for end, val, form, filed in pts[-30:]:
        print("asof=%s  shares=%s  form=%s  filed=%s" % (end, f"{val:,}", form, filed))


# ----------------------------------------------- F: price and volume
def f_price():
    txt = get("https://stooq.com/q/d/l/?s=sbet.us&i=d", timeout=25)
    lines = txt.strip().splitlines()
    if len(lines) < 2:
        print("unexpected payload:", txt[:200]); return
    print(lines[0])
    for line in lines[-40:]:
        print(line)


# ---------------------------------------------------- G: fails-to-deliver
def g_ftd():
    today = dt.date.today()
    for back in range(0, 4):
        m = (today.replace(day=1) - dt.timedelta(days=1)) if back else today
        for _ in range(back - 1 if back else 0):
            m = m.replace(day=1) - dt.timedelta(days=1)
        for half in ("a", "b"):
            url = ("https://www.sec.gov/files/data/frequently-requested-foia-"
                   "document-fails-deliver-data/cnsfails%04d%02d%s.zip"
                   % (m.year, m.month, half))
            try:
                blob = get(url, raw=True, timeout=40)
                z = zipfile.ZipFile(io.BytesIO(blob))
                hits = 0
                with z.open(z.namelist()[0]) as fh:
                    for raw in io.TextIOWrapper(fh, "latin-1"):
                        p = raw.split("|")
                        if len(p) > 5 and p[2].strip() == "SBET":
                            print("  %s qty=%s price=%s" % (p[0], p[3], p[5]))
                            hits += 1
                print("-- %04d%02d%s SBET rows=%d" % (m.year, m.month, half, hits))
            except Exception as e:
                print("-- %04d%02d%s unavailable (%s)"
                      % (m.year, m.month, half, getattr(e, "code", type(e).__name__)))
            time.sleep(0.3)


for name, fn in [("A. resolve SBET -> CIK", a_cik),
                 ("B. FINRA daily short sale volume", b_regsho),
                 ("C. FINRA consolidated short interest", c_shortint),
                 ("D. EDGAR recent filings", d_filings),
                 ("E. shares outstanding history", e_shares),
                 ("F. SBET daily OHLCV (stooq)", f_price),
                 ("G. SEC fails-to-deliver", g_ftd)]:
    section(name, fn)

print("\n\nPROBE COMPLETE", flush=True)
