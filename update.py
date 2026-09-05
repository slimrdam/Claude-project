#!/usr/bin/env python3
"""
Rebuild data.json for the SBET / ETH mNAV dashboard.

Run daily after the US close. Fetches SBET daily bars and ETH + BTC daily closes,
merges them, computes every derived series the dashboard draws, and writes data.json.
The HTML is static and reads data.json at load, so nothing else needs regenerating.

    python scripts/update.py                 # normal run
    python scripts/update.py --dry-run       # fetch and report, write nothing
    python scripts/update.py --seed-eth f.csv  # bootstrap ETH from a CoinMarketCap export

Exits non-zero on any failure so a scheduled job goes red instead of publishing stale
or half-built data.
"""

import argparse, csv, datetime as dt, json, os, pathlib, sys, time
import urllib.parse
import requests

ROOT = pathlib.Path(__file__).resolve().parent
UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/125.0 Safari/537.36"}
START = "2025-08-01"          # earliest date the dashboard covers


def die(msg):
    print(f"FATAL: {msg}", file=sys.stderr)
    sys.exit(1)


def get(url, headers=None, **kw):
    """GET with retries. Raises on final failure."""
    last = None
    for attempt in range(4):
        try:
            r = requests.get(url, headers={**UA, **(headers or {})}, timeout=30, **kw)
            if r.status_code == 200:
                return r
            last = f"HTTP {r.status_code}"
        except requests.RequestException as e:
            last = str(e)
        time.sleep(2 ** attempt)
    raise RuntimeError(f"{url} failed after 4 attempts: {last}")


# ---------------------------------------------------------------- equity

def fetch_sbet_stockanalysis(ticker):
    """stockanalysis.com daily history. Returns {date: (adj_close, volume)}.

    Primary source. Yahoo answers 429 to GitHub's runner IPs -- query1, query2
    and the crumb endpoint alike -- and Stooq now serves a JavaScript
    proof-of-work page instead of CSV, so both sources below are dead from a
    runner. This is the JSON behind stockanalysis.com/stocks/sbet/history/.
    Undocumented, hence fetch_sbet_nasdaq behind it.

    range=5Y, not MAX: MAX currently returns the same 253 rows as 1Y, which
    starts 2025-09 and so misses the first month of the archive. 5Y reaches
    2021 and reproduced all 275 archived closes exactly.

    'a' is the split-adjusted close, 'c' the raw one; adj matches what
    fetch_sbet took from Yahoo.
    """
    url = (f"https://stockanalysis.com/api/symbol/s/{ticker.lower()}/history"
           f"?range=5Y&period=Daily")
    j = get(url).json()
    rows = j.get("data")
    if not rows:
        raise RuntimeError(f"stockanalysis returned no rows: {str(j)[:200]}")
    out = {}
    for x in rows:
        d = x.get("t", "")
        if d < START or x.get("a") is None or not x.get("v"):
            continue
        out[d] = (round(float(x["a"]), 4), int(x["v"]))
    if not out:
        raise RuntimeError("stockanalysis returned nothing at or after START")
    return out


def fetch_sbet_nasdaq(ticker):
    """Fallback: Nasdaq's own quote API. Returns {date: (close, volume)}.

    Takes an explicit date range, so it returns exactly the window asked for.
    Close is unadjusted ("Close/Last"), $-prefixed, and volume is comma
    grouped. SBET has had no splits in this window so unadjusted and adjusted
    agree: it matched every archived close to within half a cent.
    """
    url = (f"https://api.nasdaq.com/api/quote/{ticker}/historical"
           f"?assetclass=stocks&fromdate={START}&todate={_iso(_today())}&limit=9999")
    j = get(url, headers={"Accept": "application/json"}).json()
    rows = ((j.get("data") or {}).get("tradesTable") or {}).get("rows")
    if not rows:
        raise RuntimeError(f"nasdaq returned no rows: {str(j)[:200]}")
    out = {}
    for x in rows:
        m, dd, y = x["date"].split("/")
        d = f"{y}-{m}-{dd}"
        if d < START:
            continue
        out[d] = (round(float(x["close"].lstrip("$").replace(",", "")), 4),
                  int(x["volume"].replace(",", "")))
    if not out:
        raise RuntimeError("nasdaq returned nothing at or after START")
    return out


def fetch_sbet(ticker):
    """Yahoo Finance chart API. Returns {date: (close, volume)}.

    This is the JSON endpoint behind finance.yahoo.com/quote/SBET/history.
    It is undocumented and Yahoo has changed it before. Kept in the chain below
    the working sources because it has answered 429 to every runner request
    since 2026-09; it costs one pass to find out whether that has lifted.
    Server-side only: Yahoo does not send CORS headers.
    """
    p1 = int(dt.datetime.fromisoformat(START).timestamp())
    p2 = int(time.time()) + 86400
    url = (f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}"
           f"?period1={p1}&period2={p2}&interval=1d&events=div%2Csplit")
    j = get(url).json()
    res = j.get("chart", {}).get("result")
    if not res:
        raise RuntimeError(f"no chart result: {j.get('chart', {}).get('error')}")
    res = res[0]
    ts = res["timestamp"]
    q = res["indicators"]["quote"][0]
    # adjclose accounts for splits; SBET has had none in this window but use it anyway
    adj = res["indicators"].get("adjclose", [{}])[0].get("adjclose") or q["close"]
    out = {}
    for i, t in enumerate(ts):
        c, v = adj[i], q["volume"][i]
        if c is None or v is None:
            continue
        d = dt.datetime.utcfromtimestamp(t).strftime("%Y-%m-%d")
        out[d] = (round(float(c), 4), int(v))
    return out


def fetch_sbet_stooq(ticker):
    """Stooq daily CSV. No key, no rate limit, but T+1 on some tickers.

    Last in the chain: stooq.com and stooq.pl both now answer a JavaScript
    proof-of-work challenge page rather than CSV, which is what "no usable
    rows" below means in practice.
    """
    url = f"https://stooq.com/q/d/l/?s={ticker.lower()}.us&i=d"
    rows = list(csv.DictReader(get(url).text.splitlines()))
    if not rows or "Close" not in rows[0]:
        raise RuntimeError("stooq returned no usable rows")
    return {r["Date"]: (float(r["Close"]), int(float(r["Volume"])))
            for r in rows if r["Date"] >= START and r["Close"] != "N/D"}


# ---------------------------------------------------------------- crypto

def fetch_coingecko(coin_id):
    """CoinGecko daily closes. Returns {date: price}.

    Free tier allows ~365 days of daily history without a key. Set COINGECKO_API_KEY
    (demo key, free from coingecko.com/en/developers/dashboard) to widen the window
    and lift the rate limit. Merges with whatever history is already in data.json,
    so the archive keeps growing past the API's own reach.
    """
    key = os.environ.get("COINGECKO_API_KEY", "").strip()
    base = ("https://pro-api.coingecko.com/api/v3" if key.startswith("CG-PRO")
            else "https://api.coingecko.com/api/v3")
    params = {"vs_currency": "usd", "days": "365", "interval": "daily"}
    if key:
        params["x_cg_demo_api_key"] = key
    url = f"{base}/coins/{coin_id}/market_chart?" + urllib.parse.urlencode(params)
    prices = get(url).json().get("prices")
    if not prices:
        raise RuntimeError(f"coingecko returned no prices for {coin_id}")
    out = {}
    for ms, px in prices:
        # CoinGecko stamps daily points at 00:00 UTC of the following day
        d = dt.datetime.utcfromtimestamp(ms / 1000)
        if d.hour == 0 and d.minute < 5:
            d -= dt.timedelta(days=1)
        out[d.strftime("%Y-%m-%d")] = round(float(px), 4)
    return out


def fetch_cmc_dataapi(cmc_id=1027):
    """Fallback: the endpoint behind coinmarketcap.com/currencies/.../historical-data/.

    That page itself is JS-rendered behind Cloudflare and cannot be scraped; this is
    the JSON call it makes. Undocumented, unversioned, and it may start refusing
    datacenter IPs at any time. Kept because it is the exact source of the CSV export.
    """
    p = {"id": cmc_id, "convertId": 2781,
         "timeStart": int(dt.datetime.fromisoformat(START).timestamp()),
         "timeEnd": int(time.time())}
    url = ("https://api.coinmarketcap.com/data-api/v3/cryptocurrency/historical?"
           + urllib.parse.urlencode(p))
    body = get(url).json()
    quotes = body.get("data", {}).get("quotes")
    if not quotes:
        raise RuntimeError("cmc data-api returned no quotes")
    return {q["timeOpen"][:10]: round(float(q["quote"]["close"]), 4) for q in quotes}


def seed_from_csv(path):
    """Bootstrap ETH history from a CoinMarketCap CSV export (semicolon delimited)."""
    out = {}
    with open(path, encoding="utf-8-sig") as f:
        for r in csv.DictReader(f, delimiter=";"):
            out[r["timeOpen"][:10]] = round(float(r["close"]), 4)
    return out


# ---------------------------------------------------------------- compute

def month_key(d):
    return d[:7]


def compute(sbet, eth, btc, cfg):
    dates = sorted(d for d in sbet if d in eth)
    if len(dates) < 30:
        die(f"only {len(dates)} overlapping sessions - refusing to publish")

    held = cfg["eth_held"]
    shares = cfg["shares_outstanding"]
    # mNAV needs eth_held and share count, which drift; only draw it for the recent
    # window where the hand-verified config values are a fair approximation.
    mnav_from = _iso(dt.date.fromisoformat(dates[-1]) - dt.timedelta(days=90))

    rows, base = [], None
    for i, d in enumerate(dates):
        c, v = sbet[d]
        e = eth[d]
        r = {"d": d, "sbet": round(c, 2), "vol": v, "eth": round(e, 2)}
        if i:
            p = dates[i - 1]
            r["rs"] = (c / sbet[p][0] - 1) * 100
            r["re"] = (e / eth[p] - 1) * 100
            r["rel"] = round(r["rs"] - r["re"], 4)
            r["rs"], r["re"] = round(r["rs"], 4), round(r["re"], 4)
        base = base or (c / e)
        r["ri"] = round((c / e) / base * 100, 2)
        if d in btc and btc[d]:
            r["eb"] = round(e / btc[d], 5)
        if d >= mnav_from:
            r["mnav"] = round((c * shares) / (held * e), 4)
        rows.append(r)

    B = [r for r in rows if "rel" in r]
    g = [r for r in B if r["rel"] > 0]
    red = [r for r in B if r["rel"] <= 0]

    # monthly relative
    months, buckets = [], {}
    for r in B:
        buckets.setdefault(month_key(r["d"]), []).append(r)
    for m in sorted(buckets):
        seg = buckets[m]
        i0 = rows.index(seg[0]) - 1
        s = seg[-1]["sbet"] / rows[i0]["sbet"]
        e = seg[-1]["eth"] / rows[i0]["eth"]
        months.append({"m": m, "s": round((s - 1) * 100, 2),
                       "e": round((e - 1) * 100, 2), "r": round((s / e - 1) * 100, 2)})

    # positive runs of consecutive months
    runs, cur = [], []
    for m in months:
        if m["r"] > 0:
            cur.append(m)
        elif cur:
            runs.append(cur); cur = []
    if cur:
        runs.append(cur)
    run_out = []
    for run in runs:
        tot = 1.0
        for m in run:
            tot *= 1 + m["r"] / 100
        after = months[months.index(run[-1]) + 1]["r"] if months.index(run[-1]) + 1 < len(months) else None
        run_out.append({"a": run[0]["m"], "b": run[-1]["m"], "n": len(run),
                        "r": round((tot - 1) * 100, 2),
                        "top": max(rows[i]["ri"] for i in range(len(rows))
                                   if month_key(rows[i]["d"]) in {x["m"] for x in run}),
                        "after": after, "live": run[-1]["m"] == months[-1]["m"]})

    lo = min(rows, key=lambda r: r["ri"])
    # The resistance that matters is the nearest prior rally top ABOVE where the ratio
    # sits now. Anything further up is not the next test.
    prior_tops = sorted(r["top"] for r in run_out if not r["live"])
    above = [t for t in prior_tops if t > rows[-1]["ri"]]
    shelf = round(min(above), 1) if above else None

    def leg(a, b, label):
        seg = [r for r in rows if a <= r["d"] <= b]
        s = seg[-1]["sbet"] / seg[0]["sbet"]
        e = seg[-1]["eth"] / seg[0]["eth"]
        return {"a": a, "b": b, "l": label, "s": round((s - 1) * 100, 1),
                "e": round((e - 1) * 100, 1), "r": round((s / e - 1) * 100, 1)}

    live = next((r for r in run_out if r["live"]), None)
    run_start = live["a"] + "-01" if live else dates[0]
    run_start = min((d for d in dates if d >= run_start), default=dates[0])

    verified = dt.date.fromisoformat(cfg["last_verified"])
    stale_days = (_today() - verified).days

    return {
        "generated": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "series": rows,
        "months": months,
        "runs": run_out,
        "legs": [leg(dates[0], dates[-1], "Whole period"),
                 leg(dates[0], run_start, "Before the current run"),
                 leg(run_start, dates[-1], "Current run")],
        "stats": {
            "sessions": len(B),
            "green": len(g),
            "green_pct": round(100 * len(g) / len(B), 1),
            "avg_green": round(sum(r["rel"] for r in g) / max(len(g), 1), 2),
            "avg_red": round(sum(r["rel"] for r in red) / max(len(red), 1), 2),
            "low_ri": lo["ri"], "low_d": lo["d"],
            "ri_now": rows[-1]["ri"],
            "prior_tops": [round(t, 1) for t in sorted(prior_tops, reverse=True)],
            "shelf": shelf,
            "shelf_gap": round((shelf / rows[-1]["ri"] - 1) * 100, 1) if shelf else None,
            "mnav_now": rows[-1].get("mnav"),
            "mnav_low": min((r["mnav"] for r in rows if "mnav" in r), default=None),
            "eth_now": rows[-1]["eth"], "sbet_now": rows[-1]["sbet"],
            "ebtc_now": rows[-1].get("eb"),
        },
        "config": {"eth_held": held, "shares": shares,
                   "last_verified": cfg["last_verified"],
                   "stale": stale_days > cfg.get("stale_after_days", 30),
                   "stale_days": stale_days},
        "holdings": cfg["holdings_history"],
        "notes": json.loads((ROOT / "notes.json").read_text()),
    }


def _today():
    return dt.datetime.now(dt.timezone.utc).date()


def _iso(d):
    return d.strftime("%Y-%m-%d")


# ---------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--seed-eth", metavar="CSV")
    args = ap.parse_args()

    cfg = json.loads((ROOT / "config.json").read_text())
    out_path = ROOT / "data.json"
    prev = json.loads(out_path.read_text()) if out_path.exists() else {}
    archive = {r["d"]: r for r in prev.get("series", [])}

    # --- equity. First source that answers wins. Ordered by what actually
    # works from a GitHub runner; yahoo and stooq stay in so the job recovers
    # by itself if they start answering again.
    sbet, src_eq = None, None
    for name, fn in (("stockanalysis", fetch_sbet_stockanalysis),
                     ("nasdaq", fetch_sbet_nasdaq),
                     ("yahoo", fetch_sbet),
                     ("stooq", fetch_sbet_stooq)):
        try:
            sbet = fn(cfg["ticker"])
            src_eq = name
            break
        except Exception as e:
            print(f"warn: {name} failed ({e})", file=sys.stderr)
    if not sbet:
        die("every equity source failed - see the warnings above")

    # --- crypto, merged over the existing archive so history outlives the API window
    eth = {d: r["eth"] for d, r in archive.items()}
    btc = {d: round(r["eth"] / r["eb"], 2) for d, r in archive.items() if r.get("eb")}
    if args.seed_eth:
        eth.update(seed_from_csv(args.seed_eth))
    try:
        eth.update(fetch_coingecko("ethereum"))
        btc.update(fetch_coingecko("bitcoin"))
        src_cx = "coingecko"
    except Exception as e:
        print(f"warn: coingecko failed ({e}); trying cmc data-api", file=sys.stderr)
        eth.update(fetch_cmc_dataapi(1027))
        src_cx = "cmc"

    latest = max(d for d in sbet if d in eth)
    lag = (_today() - dt.date.fromisoformat(latest)).days
    print(f"equity={src_eq} crypto={src_cx} sessions={len(sbet)} "
          f"latest={latest} lag={lag}d")
    if lag > 5:
        die(f"latest overlapping session is {latest}, {lag} days old - feed looks broken")

    data = compute(sbet, eth, btc, cfg)
    s = data["stats"]
    print(f"  ratio {s['ri_now']} (low {s['low_ri']} on {s['low_d']}, "
          f"prior tops {s['prior_tops']}) | mNAV {s['mnav_now']} | "
          f"{s['green']}/{s['sessions']} green ({s['green_pct']}%)")
    if data["config"]["stale"]:
        print(f"  WARNING: eth_held / shares last verified "
              f"{data['config']['stale_days']}d ago - update config.json")

    if args.dry_run:
        print("dry run, nothing written")
        return
    out_path.write_text(json.dumps(data, separators=(",", ":")))
    print(f"wrote {out_path} ({out_path.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
