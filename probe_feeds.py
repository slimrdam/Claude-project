#!/usr/bin/env python3
"""Probe the three requested sources, and robust alternatives for the same figures.

Requested: SharpLink's own dashboard (mNAV), Strategy's STRC page (price),
Fintel (SBET short interest). All three are likely JS-rendered or bot-guarded,
so this reports exactly what a server can see, and checks whether the same
numbers are available from sources already trusted by update.py.
"""
import json, re, requests

UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/125.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9"}

def show(name, url, headers=None, want_json=False, dig=None):
    print(f"\n=== {name}\n    {url}")
    try:
        r = requests.get(url, headers=headers or UA, timeout=30)
        ct = r.headers.get("content-type", "")[:48]
        print(f"    HTTP {r.status_code}  len={len(r.content)}  ct={ct}")
        srv = r.headers.get("server", "")
        cf  = r.headers.get("cf-mitigated") or r.headers.get("cf-ray")
        if srv or cf: print(f"    server={srv!r} cf={cf!r}")
        if r.status_code != 200:
            print(f"    body: {r.text[:200]!r}"); return None
        if want_json:
            j = r.json()
            print(f"    dug: {str(dig(j) if dig else j)[:300]}")
            return j
        t = r.text
        # is the payload actually rendered, or an empty app shell?
        for marker in ("__NEXT_DATA__", "__NUXT__", "window.__INITIAL", "application/ld+json",
                       "self.__next_f"):
            if marker in t: print(f"    embeds {marker}")
        nums = re.findall(r'\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b|\bmNAV\b|\b\d\.\d{2,4}\b', t)
        print(f"    numeric-looking tokens: {len(nums)}  sample={nums[:8]}")
        for kw in ("mNAV", "mnav", "NAV", "ETH Held", "ethHeld", "short interest",
                   "Short Interest", "Days to Cover", "STRC", "dividend"):
            if kw in t: print(f"    mentions {kw!r}")
        head = re.sub(r"\s+", " ", t[:220])
        print("    head: " + repr(head))
        return t
    except Exception as e:
        print(f"    EXC {type(e).__name__}: {e}")
        return None

print("########## 1. requested sources")
show("SharpLink dashboard", "https://www.sharplink.com/dashboard")
show("SharpLink root",      "https://www.sharplink.com/")
show("Strategy STRC",       "https://www.strategy.com/strc")
show("Fintel SBET short",   "https://fintel.io/ss/us/sbet")
show("robots.txt fintel",   "https://fintel.io/robots.txt")
show("robots.txt sharplink","https://www.sharplink.com/robots.txt")
show("robots.txt strategy", "https://www.strategy.com/robots.txt")

print("\n########## 2. alternatives already trusted by update.py")
show("stockanalysis STRC quote",
     "https://stockanalysis.com/api/symbol/s/STRC/history?range=1M&period=Daily",
     want_json=True, dig=lambda j: (j.get("status"), (j.get("data") or [])[:2]))
show("nasdaq STRC",
     "https://api.nasdaq.com/api/quote/STRC/info?assetclass=stocks",
     headers={**UA, "Accept": "application/json"}, want_json=True,
     dig=lambda j: ((j.get("data") or {}).get("primaryData")))
show("nasdaq SBET short interest",
     "https://api.nasdaq.com/api/quote/SBET/short-interest?assetclass=stocks",
     headers={**UA, "Accept": "application/json"}, want_json=True,
     dig=lambda j: str(j)[:400])
show("stockanalysis SBET statistics",
     "https://stockanalysis.com/api/symbol/s/SBET/overview",
     want_json=True, dig=lambda j: str(j)[:400])
