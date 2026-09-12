#!/usr/bin/env python3
"""Probe 5: the exact shape of SharpLink's dashboard API, fetched with plain
requests (no browser), plus the two replacement feeds."""
import json, requests
UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/125.0 Safari/537.36",
      "Accept": "application/json"}

j = requests.get("https://www.sharplink.com/api/dashboard/impact3-data",
                 headers=UA, timeout=30).json()
print("plain requests works:", list(j))
for k, v in j.items():
    if isinstance(v, list):
        print(f"\n{k}: list[{len(v)}]")
        for row in v[:2]: print("   first:", row)
        for row in v[-2:]: print("   last :", row)
    else:
        print(f"\n{k}: {type(v).__name__} -> {str(v)[:300]}")

print("\n########## STRC")
s = requests.get("https://stockanalysis.com/api/symbol/s/STRC/history?range=1Y&period=Daily",
                 headers=UA, timeout=30).json()
d = s.get("data") or []
print(f"  rows={len(d)} newest={d[0] if d else None}")

print("\n########## SBET short interest")
n = requests.get("https://api.nasdaq.com/api/quote/SBET/short-interest?assetclass=stocks",
                 headers=UA, timeout=30).json()
rows = (((n.get("data") or {}).get("shortInterestTable") or {}).get("rows") or [])
print(f"  rows={len(rows)}")
for r in rows[:3]: print("   ", r)
