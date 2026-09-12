#!/usr/bin/env python3
"""Probe 2: locate mNAV and treasury figures inside SharpLink's Nuxt payload,
and confirm the replacement sources for the two blocked pages."""
import json, re, requests

UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/125.0 Safari/537.36"}

print("########## SharpLink dashboard payload")
t = requests.get("https://www.sharplink.com/dashboard", headers=UA, timeout=40).text
print(f"  html {len(t)} bytes")

# Nuxt 3 ships a flat JSON array in a script tag; Nuxt 2 ships an IIFE.
m = re.search(r'<script[^>]+id="__NUXT_DATA__"[^>]*>(.*?)</script>', t, re.S)
print("  __NUXT_DATA__ script:", "found" if m else "absent")
if m:
    try:
        arr = json.loads(m.group(1))
        print(f"  payload is {type(arr).__name__} of {len(arr)} entries")
        # in the flat format, strings and numbers sit in one array; find labels
        strs = [(i, v) for i, v in enumerate(arr) if isinstance(v, str)]
        keys = [(i, v) for i, v in strs
                if re.fullmatch(r'[a-zA-Z][a-zA-Z0-9_]{1,28}', v or "")
                and re.search(r'nav|eth|share|hold|price|stak|supply|treasur|mnav|outstand',
                              v, re.I)]
        print(f"  {len(keys)} label-ish strings matched:")
        for i, v in keys[:40]:
            nxt = arr[i+1] if i+1 < len(arr) else None
            print(f"      [{i}] {v!r} -> {str(nxt)[:60]!r}")
    except Exception as e:
        print("  parse failed:", e)

# whatever the format, find the numbers printed next to the mNAV label
for label in ("mNAV", "mnav", "ETH Held", "Ether Held", "Shares Outstanding", "NAV"):
    for mm in re.finditer(re.escape(label), t):
        seg = t[max(0, mm.start()-160): mm.start()+220]
        seg = re.sub(r"\s+", " ", seg)
        print(f"\n  context for {label!r}:\n      ...{seg}...")
        break

print("\n########## replacements for the two blocked pages")
r = requests.get("https://api.nasdaq.com/api/quote/SBET/short-interest?assetclass=stocks",
                 headers={**UA, "Accept": "application/json"}, timeout=30)
j = r.json()
rows = (((j.get("data") or {}).get("shortInterestTable") or {}).get("rows") or [])
print(f"  nasdaq short interest: {len(rows)} rows")
for row in rows[:4]:
    print("     ", row)

for path, label in (("summary", "SBET summary (float?)"), ("info", "SBET info")):
    try:
        jj = requests.get(f"https://api.nasdaq.com/api/quote/SBET/{path}?assetclass=stocks",
                          headers={**UA, "Accept": "application/json"}, timeout=30).json()
        d = (jj.get("data") or {}).get("summaryData") or (jj.get("data") or {})
        ks = [k for k in (d or {}) if re.search(r'share|float|outstand|cap', k, re.I)]
        print(f"  {label}: keys={ks}")
        for k in ks:
            print(f"     {k} = {d[k]}")
    except Exception as e:
        print(f"  {label}: EXC {e}")

jj = requests.get("https://stockanalysis.com/api/symbol/s/STRC/history?range=1M&period=Daily",
                  headers=UA, timeout=30).json()
last = (jj.get("data") or [])[0]
print(f"  STRC latest close: {last}")
