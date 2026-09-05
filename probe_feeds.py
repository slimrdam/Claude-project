#!/usr/bin/env python3
"""Diagnostic 2: do the working equity sources agree with the seeded archive?

Yahoo is 429 from runner IPs and Stooq now serves a JS challenge instead of CSV
(see probe 1). Nasdaq and stockanalysis both answer. Before either replaces the
equity source in update.py, they have to reproduce the closes and volumes already
in data.json — a source with a different adjustment convention would put a step
change in the middle of a 275-session archive.
"""
import datetime as dt, json, requests

UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/125.0 Safari/537.36"}
START = "2025-08-01"
archive = {r["d"]: (r["sbet"], r["vol"]) for r in json.load(open("data.json"))["series"]}
print(f"archive: {len(archive)} sessions {min(archive)} .. {max(archive)}")


def compare(name, got):
    """got: {date: (close, volume)}"""
    if not got:
        print(f"  {name}: EMPTY"); return
    ov = sorted(set(got) & set(archive))
    print(f"  {name}: {len(got)} rows {min(got)}..{max(got)}, {len(ov)} overlap")
    if not ov:
        return
    worst_p = max(ov, key=lambda d: abs(got[d][0] - archive[d][0]))
    dp = abs(got[d0 := worst_p][0] - archive[d0][0])
    nvol = sum(1 for d in ov if got[d][1] != archive[d][1])
    nclose = sum(1 for d in ov if abs(got[d][0] - archive[d][0]) > 0.005)
    print(f"     close: {nclose}/{len(ov)} differ >0.005; worst {d0} "
          f"got={got[d0][0]} archive={archive[d0][0]} delta={dp:.4f}")
    print(f"     vol  : {nvol}/{len(ov)} differ")
    missing = sorted(set(archive) - set(got))
    print(f"     archive dates the source lacks: {len(missing)}"
          + (f" e.g. {missing[:5]}" if missing else ""))


print("\n--- stockanalysis, range sweep")
for rng in ("1Y", "2Y", "5Y", "MAX"):
    try:
        r = requests.get(f"https://stockanalysis.com/api/symbol/s/SBET/history"
                         f"?range={rng}&period=Daily", headers=UA, timeout=30)
        j = r.json()
        rows = j.get("data") or []
        got = {x["t"]: (round(float(x["a"]), 4), int(x["v"])) for x in rows if x.get("v")}
        print(f"\n  range={rng} HTTP {r.status_code} rows={len(rows)}")
        compare(f"stockanalysis {rng}", got)
    except Exception as e:
        print(f"  range={rng} EXC {type(e).__name__}: {e}")

print("\n--- nasdaq")
try:
    r = requests.get(f"https://api.nasdaq.com/api/quote/SBET/historical"
                     f"?assetclass=stocks&fromdate={START}&todate={dt.date.today()}&limit=9999",
                     headers={**UA, "Accept": "application/json"}, timeout=30)
    rows = r.json()["data"]["tradesTable"]["rows"]
    got = {}
    for x in rows:
        m, d, y = x["date"].split("/")
        got[f"{y}-{m}-{d}"] = (round(float(x["close"].lstrip("$")), 4),
                               int(x["volume"].replace(",", "")))
    print(f"  HTTP {r.status_code} rows={len(rows)}")
    compare("nasdaq", got)
except Exception as e:
    print(f"  EXC {type(e).__name__}: {e}")
