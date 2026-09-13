"""Probe candidate feeds from a GitHub runner, which has the network access this
container does not. Run through the 'Probe feeds' workflow and read the job log.
Nothing here is wired into the app: it only reports what answers and what shape."""
import json, sys, urllib.request, urllib.error

UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/140.0 Safari/537.36",
      "Accept": "application/json,text/plain,*/*"}

def get(url, timeout=25):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, r.read()

def probe(label, url, shape=None):
    print(f"\n=== {label}\n    {url}")
    try:
        st, body = get(url)
    except urllib.error.HTTPError as e:
        print(f"    HTTP {e.code} {e.reason}"); return None
    except Exception as e:
        print(f"    FAILED {type(e).__name__}: {str(e)[:160]}"); return None
    print(f"    HTTP {st}  {len(body):,} bytes")
    try:
        j = json.loads(body)
    except Exception:
        print("    not JSON:", body[:200]); return None
    if isinstance(j, list):
        print(f"    list of {len(j)}; first: {json.dumps(j[0])[:260] if j else '—'}")
        if j: print(f"    last:  {json.dumps(j[-1])[:260]}")
    elif isinstance(j, dict):
        print(f"    keys: {list(j)[:12]}")
        for k, v in list(j.items())[:4]:
            if isinstance(v, list) and v:
                print(f"    {k}: {len(v)} rows, first {json.dumps(v[0])[:140]}, last {json.dumps(v[-1])[:140]}")
    if shape: shape(j)
    return j

# ---- retail positioning: who is leveraged which way -------------------------
B = "https://fapi.binance.com"
for sym in ("BTCUSDT", "ETHUSDT"):
    probe(f"binance global long/short ACCOUNT ratio {sym}",
          f"{B}/futures/data/globalLongShortAccountRatio?symbol={sym}&period=1d&limit=30")
    probe(f"binance TOP TRADER long/short account ratio {sym}",
          f"{B}/futures/data/topLongShortAccountRatio?symbol={sym}&period=1d&limit=5")
    probe(f"binance taker buy/sell volume {sym}",
          f"{B}/futures/data/takerlongshortRatio?symbol={sym}&period=1d&limit=5")
    probe(f"binance funding rate history {sym}",
          f"{B}/fapi/v1/fundingRate?symbol={sym}&limit=10")
    probe(f"binance open interest hist {sym}",
          f"{B}/futures/data/openInterestHist?symbol={sym}&period=1d&limit=5")

# ---- long monthly history for MACD / RSI ------------------------------------
CG = "https://api.coingecko.com/api/v3"
for cid in ("bitcoin", "ethereum"):
    probe(f"coingecko market_chart max {cid}",
          f"{CG}/coins/{cid}/market_chart?vs_currency=usd&days=max&interval=daily")
probe("coingecko ohlc 365 bitcoin", f"{CG}/coins/bitcoin/ohlc?vs_currency=usd&days=365")

SA = "https://stockanalysis.com/api/symbol"
for t in ("BTC-USD", "ETH-USD"):
    probe(f"stockanalysis history 20Y {t}", f"{SA}/q/{t}/history?range=20Y&period=Monthly")
    probe(f"stockanalysis history MAX {t}", f"{SA}/q/{t}/history?range=MAX")

probe("cryptocompare monthly BTC",
      "https://min-api.cryptocompare.com/data/v2/histoday?fsym=BTC&tsym=USD&limit=2000")
print("\ndone")
