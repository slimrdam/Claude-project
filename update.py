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

import argparse, csv, datetime as dt, json, math, os, pathlib, sys, time
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


# ---------------------------------------------------------------- market context
#
# Feeds for the thesis pages. All key-free and probed from a GitHub runner before
# being wired in. Unlike the equity and crypto feeds above these are NOT fatal: a
# DefiLlama or ECB outage must not stop the SBET dashboard from publishing, so
# each one falls back to the value already in data.json and records how stale it is.

def _ecb(flow, key, **params):
    """ECB Data Portal (SDMX-JSON). Returns [(period, value), ...] oldest first.

    Series-key length differs per dataflow (EXR has 5 dimensions, ICP 6), so the
    single series is taken positionally rather than by a hardcoded key.
    """
    q = {"format": "jsondata"}
    q.update(params)
    url = f"https://data-api.ecb.europa.eu/service/data/{flow}/{key}?" + urllib.parse.urlencode(q)
    j = get(url).json()
    series = next(iter(j["dataSets"][0]["series"].values()))["observations"]
    periods = [v["id"] for v in j["structure"]["dimensions"]["observation"][0]["values"]]
    out = []
    for i, per in enumerate(periods):
        obs = series.get(str(i))
        if obs and obs[0] is not None:
            out.append((per, float(obs[0])))
    if not out:
        raise RuntimeError(f"ECB {flow}/{key} returned no observations")
    return out


def fetch_eurusd():
    """US dollars per euro, ECB daily reference rate."""
    per, val = _ecb("EXR", "D.USD.EUR.SP00.A", lastNObservations=5)[-1]
    return {"rate": round(val, 4), "date": per}


def fetch_hicp():
    """Euro-area inflation, several ways.

    A single latest print is the wrong statistic for a debasement argument: it
    says what happened last month, not what holding cash costs over a holding
    period. So this also returns trailing averages over 3, 5, 10 and 20+ years
    computed from the index level, plus the worst 12-month rate in the last five
    years. The page shows several side by side rather than picking one.
    """
    per, ann = _ecb("ICP", "M.U2.N.000000.4.ANR", lastNObservations=3)[-1]
    idx = _ecb("ICP", "M.U2.N.000000.4.INX", startPeriod="2000-01")
    first, last = idx[0], idx[-1]

    def avg(years):
        months = int(years * 12)
        if len(idx) <= months:
            return None
        p0, v0 = idx[-1 - months]
        return {"rate": round((last[1] / v0) ** (1 / years) - 1, 4), "from": p0}

    windows = {}
    for y in (3, 5, 10):
        a = avg(y)
        if a:
            windows[str(y)] = a
    span_years = len(idx) / 12.0
    windows["all"] = {"rate": round((last[1] / first[1]) ** (1 / span_years) - 1, 4),
                      "from": first[0]}

    # worst rolling 12-month rate in the last five years — the spike people
    # actually lived through, which any trailing average smooths away
    peak, peak_at = None, None
    for i in range(max(12, len(idx) - 60), len(idx)):
        r = idx[i][1] / idx[i - 12][1] - 1
        if peak is None or r > peak:
            peak, peak_at = r, idx[i][0]

    return {"annual_rate": round(ann, 2), "annual_rate_date": per,
            "loss_since": round(1 - first[1] / last[1], 4),
            "base_date": first[0], "index_date": last[0],
            "avg": windows,
            "peak_12m": round(peak, 4) if peak is not None else None,
            "peak_12m_date": peak_at}


def fetch_fng():
    """Crypto Fear & Greed, latest reading only. The sentiment page pulls the full
    daily history itself, client side, so it stays live between workflow runs."""
    j = get("https://api.alternative.me/fng/?limit=1&format=json").json()
    d = j["data"][0]
    return {"value": int(d["value"]), "label": d["value_classification"],
            "date": _iso(dt.datetime.utcfromtimestamp(int(d["timestamp"])).date())}


def fetch_stables():
    """Stablecoin float by chain, DefiLlama."""
    j = get("https://stablecoins.llama.fi/stablecoinchains").json()
    tot = {}
    for c in j:
        v = (c.get("totalCirculatingUSD") or {}).get("peggedUSD") or 0
        if v:
            tot[c["name"]] = float(v)
    if not tot:
        raise RuntimeError("defillama returned no stablecoin chains")
    total = sum(tot.values())
    eth = tot.get("Ethereum", 0)
    return {"ethereum": round(eth / 1e9, 1), "total": round(total / 1e9, 1),
            "eth_share": round(eth / total, 4)}


def fetch_tvl():
    """Value locked in DeFi by chain, DefiLlama."""
    j = get("https://api.llama.fi/v2/chains").json()
    tot = {c["name"]: float(c["tvl"]) for c in j if c.get("tvl")}
    if not tot:
        raise RuntimeError("defillama returned no chain TVL")
    total = sum(tot.values())
    eth = tot.get("Ethereum", 0)
    return {"ethereum": round(eth / 1e9, 1), "total": round(total / 1e9, 1),
            "eth_share": round(eth / total, 4)}


def _sl_series(block):
    """SharpLink returns each metric as [{row_number, Date, <Metric Name>: value}].
    Take the value column positionally so a renamed metric does not break parsing."""
    out = []
    for row in block or []:
        date = row.get("Date") or row.get("Disclaimer Date")
        vals = [v for k, v in row.items() if k not in ("row_number", "Date")]
        if not date or not vals:
            continue
        try:
            v = float(str(vals[0]).replace("$", "").replace(",", "").replace("x", "").strip())
        except (ValueError, AttributeError):
            continue
        try:
            d = dt.datetime.strptime(date.strip(), "%B %d, %Y").date()
        except ValueError:
            continue
        out.append((_iso(d), v))
    return sorted(out)


def fetch_sharplink():
    """SharpLink's own dashboard figures.

    The public dashboard renders its numbers client-side, but the endpoint behind
    it answers plain requests. Anchoring to this removes the guesswork: ether held,
    share count and mNAV come from the company rather than from hand-entered
    values, and each arrives as a dated series so historical mNAV can be computed
    from the holdings that actually applied at the time.
    """
    j = get("https://www.sharplink.com/api/dashboard/impact3-data",
            headers={"Accept": "application/json"}).json()
    holdings = _sl_series(j.get("total_eth_holdings"))
    conc     = _sl_series(j.get("eth_concentration"))
    navps    = _sl_series(j.get("Basic-equivalent NAV per share"))
    nav      = _sl_series(j.get("Sharplink NAV"))
    rewards  = _sl_series(j.get("staking_rewards"))
    mnav_s   = _sl_series(j.get("mnav_data"))
    if not holdings:
        raise RuntimeError("sharplink returned no holdings series")

    fd = (j.get("fdmnav") or [{}])[0]
    dis = (j.get("disclaimer_data") or [{}])[0]

    def num(x):
        try:
            return float(str(x).replace("$", "").replace(",", "").replace("x", "").strip())
        except (ValueError, AttributeError, TypeError):
            return None

    # shares outstanding follows from ETH per 1,000 shares
    shares = None
    if conc and holdings and conc[-1][1]:
        shares = round(holdings[-1][1] / conc[-1][1] * 1000)

    return {
        "eth_held": holdings[-1][1],
        "eth_held_date": holdings[-1][0],
        "holdings_series": holdings,
        "concentration_series": conc,
        "eth_concentration": conc[-1][1] if conc else None,
        "shares": shares,
        "nav_usd": nav[-1][1] if nav else None,
        "nav_per_share": navps[-1][1] if navps else None,
        "staking_rewards": rewards[-1][1] if rewards else None,
        "mnav": mnav_s[-1][1] if mnav_s else None,
        # the company's own published series, where it offers one; the computed
        # series in data["series"] is ETH-only and will differ slightly, because
        # SharpLink NAV also counts dollar holdings and fund P&L
        "mnav_series": mnav_s,
        "navps_series": navps,
        "fd_mnav": num(fd.get("Fully Diluted mNAV")),
        "market_cap": num(fd.get("Market Cap")),
        "enterprise_value": num(fd.get("Enterprise Value")),
        "as_of": dis.get("Disclaimer Date"),
        "source": "sharplink.com/dashboard",
    }


def fetch_strc():
    """STRC, Strategy's preferred share. strategy.com answers 403 to any server
    request, so the price comes from the same source already used for SBET."""
    j = get("https://stockanalysis.com/api/symbol/s/STRC/history?range=1Y&period=Daily").json()
    rows = j.get("data") or []
    if not rows:
        raise RuntimeError("no STRC rows")
    last = rows[0]
    return {"price": round(float(last["c"]), 2), "date": last["t"],
            "change_pct": last.get("ch"),
            "history": [[r["t"], round(float(r["c"]), 2)] for r in rows[:180]][::-1]}


def fetch_short_interest(ticker):
    """Short interest from Nasdaq's own filing data. Fintel serves a Cloudflare
    challenge to servers; this is the same twice-monthly FINRA data it reports."""
    url = (f"https://api.nasdaq.com/api/quote/{ticker}/short-interest?assetclass=stocks")
    j = get(url, headers={"Accept": "application/json"}).json()
    rows = (((j.get("data") or {}).get("shortInterestTable") or {}).get("rows") or [])
    if not rows:
        raise RuntimeError("nasdaq returned no short-interest rows")
    def n(x):
        try:
            return float(str(x).replace(",", ""))
        except (ValueError, TypeError):
            return None
    hist = []
    for r in rows:
        m, d, y = r["settlementDate"].split("/")
        hist.append({"date": f"{y}-{m}-{d}", "interest": n(r.get("interest")),
                     "avg_volume": n(r.get("avgDailyShareVolume")),
                     "days_to_cover": n(r.get("daysToCover"))})
    hist.sort(key=lambda r: r["date"])
    last = hist[-1]
    return {"interest": last["interest"], "settlement": last["date"],
            "avg_volume": last["avg_volume"], "days_to_cover": last["days_to_cover"],
            "history": hist}


# ---------------------------------------------------------------- momentum
# Monthly momentum needs years of history, and the feeds already in this file do
# not go back far enough: CoinGecko's free window is 365 days and stockanalysis
# has no crypto. Bitstamp's public OHLC pages backwards without a key - probed
# from a runner at 5,506 daily rows for BTC (2011) and 3,316 for ETH (2017).

BITSTAMP = "https://www.bitstamp.net/api/v2/ohlc/{pair}/?step=86400&limit=1000"


def fetch_daily_ohlc(pair, max_calls=7):
    """Daily candles, newest page first, walking backwards until a page repeats."""
    out, end, oldest = {}, None, None
    for _ in range(max_calls):
        url = BITSTAMP.format(pair=pair) + (f"&end={end}" if end else "")
        rows = get(url).json()["data"]["ohlc"]
        if not rows:
            break
        for r in rows:
            out[int(r["timestamp"])] = float(r["close"])
        lo = min(int(r["timestamp"]) for r in rows)
        if oldest is not None and lo >= oldest:
            break
        oldest, end = lo, lo - 86400
    if len(out) < 400:
        raise RuntimeError(f"{pair}: only {len(out)} daily candles")
    return sorted(out.items())


def to_monthly(daily):
    """Calendar-month closes: the last daily close inside each month."""
    months = {}
    for ts, close in daily:
        d = dt.datetime.fromtimestamp(ts, dt.timezone.utc)
        months[f"{d.year:04d}-{d.month:02d}"] = close
    return sorted(months.items())


def _ema(vals, n):
    k, out, prev = 2 / (n + 1), [], None
    for v in vals:
        prev = v if prev is None else v * k + prev * (1 - k)
        out.append(prev)
    return out


def macd(vals, fast=12, slow=26, sig=9):
    f, s = _ema(vals, fast), _ema(vals, slow)
    line = [a - b for a, b in zip(f, s)]
    signal = _ema(line, sig)
    return line, signal, [a - b for a, b in zip(line, signal)]


def rsi(vals, n=14):
    """Wilder's RSI. The first n periods have no reading and come back as None."""
    out = [None] * len(vals)
    if len(vals) <= n:
        return out
    gains = [max(vals[i] - vals[i-1], 0) for i in range(1, len(vals))]
    losses = [max(vals[i-1] - vals[i], 0) for i in range(1, len(vals))]
    ag = sum(gains[:n]) / n
    al = sum(losses[:n]) / n
    out[n] = 100.0 if al == 0 else 100 - 100 / (1 + ag / al)
    for i in range(n, len(gains)):
        ag = (ag * (n - 1) + gains[i]) / n
        al = (al * (n - 1) + losses[i]) / n
        out[i + 1] = 100.0 if al == 0 else 100 - 100 / (1 + ag / al)
    return out


def build_momentum(prev):
    """MACD on the log of the monthly close, and RSI on the close itself.

    An asset that has moved four orders of magnitude cannot be read on a linear
    MACD: the 2013 crossovers would be invisible beside the 2025 ones. Taking the
    log first makes a crossover mean the same thing at every price level, which
    is the whole point of reading it monthly."""
    out, stale = {}, []
    for key, pair in (("btc", "btcusd"), ("eth", "ethusd")):
        try:
            m = to_monthly(fetch_daily_ohlc(pair))
            closes = [c for _, c in m]
            logs = [math.log(c) for c in closes]
            line, signal, hist = macd(logs)
            # The textbook 30 and 70 belong to a daily chart. Monthly, neither
            # asset has ever printed below 40, so a fixed band would mark nothing
            # at all. The bands are the asset's own tenth and ninetieth
            # percentile instead, which is where it has actually turned.
            rv = sorted(v for v in rsi(closes) if v is not None)
            pct = lambda q: round(rv[min(len(rv) - 1, int(q * len(rv)))], 1) if rv else None
            out[key] = {
                "rsi_lo": pct(0.10),
                "rsi_hi": pct(0.90),
                "months": [d for d, _ in m],
                "close": [round(c, 2) for c in closes],
                "macd": [round(v, 5) for v in line],
                "signal": [round(v, 5) for v in signal],
                "hist": [round(v, 5) for v in hist],
                "rsi": [None if v is None else round(v, 1) for v in rsi(closes)],
            }
        except Exception as e:
            print(f"warn: momentum {key} failed ({e})", file=sys.stderr)
            if prev.get("momentum", {}).get(key):
                out[key] = prev["momentum"][key]
                stale.append(key)
    out["stale"] = stale
    out["source"] = "bitstamp.net"
    return out


# ---------------------------------------------------------------- positioning
# Who is leveraged which way. Binance answers 451 to a US runner and Bybit 403,
# both geo-blocks; OKX answers plainly and publishes the ratio of accounts
# holding longs to accounts holding shorts, which is the retail-crowd reading.

OKX = "https://www.okx.com/api/v5"


def _okx(path):
    j = get(OKX + path, headers={"Accept": "application/json"}).json()
    if str(j.get("code")) != "0":
        raise RuntimeError(f"okx {path}: {j.get('msg')}")
    return j["data"]


def build_retail(prev):
    out, stale = {}, []
    for key, ccy, inst in (("btc", "BTC", "BTC-USDT-SWAP"), ("eth", "ETH", "ETH-USDT-SWAP")):
        try:
            rows = _okx(f"/rubik/stat/contracts/long-short-account-ratio?ccy={ccy}&period=1D")
            series = sorted(
                (_iso(dt.datetime.fromtimestamp(int(t) / 1000, dt.timezone.utc)), round(float(v), 3))
                for t, v in rows)
            fr = _okx(f"/public/funding-rate-history?instId={inst}&limit=100")
            rates = [float(r["fundingRate"]) for r in fr]
            out[key] = {
                "series": series,
                "now": series[-1][1],
                "avg": round(sum(v for _, v in series) / len(series), 3),
                "hi": max(v for _, v in series),
                "lo": min(v for _, v in series),
                # funding is paid three times a day; annualise so it reads as a rate
                "funding": round(sum(rates) / len(rates) * 3 * 365, 4),
                "funding_now": round(rates[0] * 3 * 365, 4),
            }
        except Exception as e:
            print(f"warn: retail {key} failed ({e})", file=sys.stderr)
            if prev.get("retail", {}).get(key):
                out[key] = prev["retail"][key]
                stale.append(key)
    out["stale"] = stale
    out["source"] = "okx.com"
    out["as_of"] = _iso(_today())
    return out


def build_market(prev, eth_now, btc_now, ethbtc, sl=None):
    """Assemble the market block, keeping the last good value for anything that fails."""
    old = prev.get("market", {})
    out = {"as_of": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
           "eth_usd": eth_now, "btc_usd": btc_now, "ethbtc": ethbtc, "stale": []}
    # already fetched for compute(); reuse rather than calling the endpoint twice
    if sl:
        out["sharplink"] = {k: v for k, v in sl.items()
                            if k not in ("holdings_series", "concentration_series")}
    elif old.get("sharplink"):
        out["sharplink"] = old["sharplink"]; out["stale"].append("sharplink")
    for name, fn in (("eurusd", fetch_eurusd), ("hicp", fetch_hicp), ("fng", fetch_fng),
                     ("stables", fetch_stables), ("tvl", fetch_tvl),
                     ("strc", fetch_strc), ("short", lambda: fetch_short_interest("SBET"))):
        try:
            out[name] = fn()
        except Exception as e:
            print(f"warn: market feed {name} failed ({e})", file=sys.stderr)
            if name in old:
                out[name] = old[name]
                out["stale"].append(name)
            else:
                out[name] = None
    return out


# ---------------------------------------------------------------- compute

def month_key(d):
    return d[:7]


def compute(sbet, eth, btc, cfg, sl=None):
    dates = sorted(d for d in sbet if d in eth)
    if len(dates) < 30:
        die(f"only {len(dates)} overlapping sessions - refusing to publish")

    # SharpLink publishes ether held and ETH-per-1,000-shares as dated series, so
    # mNAV can use the treasury that actually applied on each session instead of
    # assuming today's holdings held all along. config.json is the fallback.
    sl = sl or {}
    hold_series = sl.get("holdings_series") or []
    conc_series = sl.get("concentration_series") or []
    held = sl.get("eth_held") or cfg["eth_held"]
    shares = sl.get("shares") or cfg["shares_outstanding"]

    def _at(series, d, default):
        """Latest value dated on or before d."""
        v = default
        for day, val in series:
            if day <= d:
                v = val
            else:
                break
        return v

    # with a real series the whole archive can carry mNAV; without one, keep the
    # old guard and only draw the window where a single fixed figure is fair
    mnav_from = (hold_series[0][0] if hold_series
                 else _iso(dt.date.fromisoformat(dates[-1]) - dt.timedelta(days=90)))

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
            h = _at(hold_series, d, held)
            k = _at(conc_series, d, None)
            sh = round(h / k * 1000) if k else shares
            r["mnav"] = round((c * sh) / (h * e), 4)
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
                   "source": "sharplink" if sl.get("eth_held") else "config.json",
                   "as_of": sl.get("eth_held_date") or cfg["last_verified"],
                   "last_verified": cfg["last_verified"],
                   # only the hand-entered path can go stale; the feed dates itself
                   "stale": (not sl.get("eth_held")) and stale_days > cfg.get("stale_after_days", 30),
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

    # Non-fatal: if SharpLink is unreachable, compute() falls back to config.json.
    try:
        sl = fetch_sharplink()
        print(f"sharplink: {sl['eth_held']:,.0f} ETH as of {sl['eth_held_date']}, "
              f"mNAV {sl.get('mnav')}, shares {sl.get('shares'):,}"
              if sl.get("shares") else f"sharplink: {sl['eth_held']:,.0f} ETH")
        if abs(sl["eth_held"] - cfg["eth_held"]) / cfg["eth_held"] > 0.02:
            print(f"  note: config.json says {cfg['eth_held']:,} ETH, the company "
                  f"reports {sl['eth_held']:,.0f} - the feed is authoritative",
                  file=sys.stderr)
    except Exception as e:
        print(f"warn: sharplink failed ({e}); falling back to config.json", file=sys.stderr)
        sl = None

    data = compute(sbet, eth, btc, cfg, sl)
    r_last = data["series"][-1]
    data["market"] = build_market(
        prev, r_last["eth"],
        round(r_last["eth"] / r_last["eb"], 2) if r_last.get("eb") else None,
        r_last.get("eb"), sl)
    data["assumptions"] = json.loads((ROOT / "assumptions.json").read_text())
    data["momentum"] = build_momentum(prev)
    data["retail"] = build_retail(prev)
    s = data["stats"]
    print(f"  ratio {s['ri_now']} (low {s['low_ri']} on {s['low_d']}, "
          f"prior tops {s['prior_tops']}) | mNAV {s['mnav_now']} | "
          f"{s['green']}/{s['sessions']} green ({s['green_pct']}%)")
    mk = data["market"]
    print(f"  market: eur/usd {mk.get('eurusd')} | fng {mk.get('fng')} | "
          f"stables {mk.get('stables')} | tvl {mk.get('tvl')}")
    mo, re = data["momentum"], data["retail"]
    for k in ("btc", "eth"):
        if mo.get(k):
            print(f"  momentum {k}: {len(mo[k]['months'])} months "
                  f"{mo[k]['months'][0]}..{mo[k]['months'][-1]} | "
                  f"rsi {mo[k]['rsi'][-1]} | hist {mo[k]['hist'][-1]:+.4f}")
        if re.get(k):
            print(f"  retail {k}: long/short {re[k]['now']} "
                  f"(180d avg {re[k]['avg']}, {re[k]['lo']}..{re[k]['hi']}) | "
                  f"funding {re[k]['funding_now']:+.2%} annualised")
    for blk, name in ((mo, "momentum"), (re, "retail")):
        if blk.get("stale"):
            print(f"  WARNING: reused previous {name} for {', '.join(blk['stale'])}")
    if mk["stale"]:
        print(f"  WARNING: reused previous values for {', '.join(mk['stale'])}")
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
