"""Probe candidate feeds from a GitHub runner. Nothing here is wired into the app."""
import json, os, sys, time, urllib.request, urllib.error

UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/140.0 Safari/537.36",
      "Accept": "application/json,text/plain,*/*"}
CG_KEY = os.environ.get("COINGECKO_API_KEY", "")

def probe(label, url, headers=None):
    print(f"\n=== {label}\n    {url.replace(CG_KEY, '<key>') if CG_KEY else url}")
    h = dict(UA); h.update(headers or {})
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=25) as r:
            st, body = r.status, r.read()
    except urllib.error.HTTPError as e:
        print(f"    HTTP {e.code} {e.reason} :: {e.read()[:160]}"); return None
    except Exception as e:
        print(f"    FAILED {type(e).__name__}: {str(e)[:160]}"); return None
    print(f"    HTTP {st}  {len(body):,} bytes")
    try: j = json.loads(body)
    except Exception: print("    not JSON:", body[:200]); return None
    if isinstance(j, list):
        print(f"    list of {len(j)}")
        if j: print(f"    first {json.dumps(j[0])[:220]}\n    last  {json.dumps(j[-1])[:220]}")
    elif isinstance(j, dict):
        print(f"    keys: {list(j)[:14]}")
        for k, v in list(j.items())[:6]:
            if isinstance(v, list) and v:
                print(f"    {k}: {len(v)} rows | first {json.dumps(v[0])[:150]} | last {json.dumps(v[-1])[:150]}")
            elif isinstance(v, dict):
                print(f"    {k}: dict keys {list(v)[:10]}")
                for k2, v2 in list(v.items())[:3]:
                    if isinstance(v2, list) and v2:
                        print(f"       {k2}: {len(v2)} rows | first {json.dumps(v2[0])[:140]} | last {json.dumps(v2[-1])[:140]}")
    time.sleep(.4)
    return j

print("### A. long history for monthly momentum")
CG = "https://api.coingecko.com/api/v3"
if CG_KEY:
    for cid in ("bitcoin", "ethereum"):
        probe(f"coingecko max daily {cid} (header key)",
              f"{CG}/coins/{cid}/market_chart?vs_currency=usd&days=max&interval=daily",
              {"x-cg-demo-api-key": CG_KEY})
    probe("coingecko max daily bitcoin (pro host)",
          f"https://pro-api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=max&interval=daily",
          {"x-cg-pro-api-key": CG_KEY})
else:
    print("    (no COINGECKO_API_KEY in env)")

probe("coincap bitcoin daily history",
      "https://api.coincap.io/v2/assets/bitcoin/history?interval=d1")
probe("bitstamp btcusd daily ohlc 1000",
      "https://www.bitstamp.net/api/v2/ohlc/btcusd/?step=86400&limit=1000")
probe("bitstamp ethusd daily ohlc 1000",
      "https://www.bitstamp.net/api/v2/ohlc/ethusd/?step=86400&limit=1000")
probe("kraken XBTUSD 15-day candles (720 max)",
      "https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=21600")
probe("kraken ETHUSD weekly candles",
      "https://api.kraken.com/0/public/OHLC?pair=ETHUSD&interval=10080")
probe("coinbase BTC-USD daily candles",
      "https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=86400")
for pfx in ("c", "q", "s"):
    probe(f"stockanalysis /{pfx}/BTC-USD history 10Y",
          f"https://stockanalysis.com/api/symbol/{pfx}/BTC-USD/history?range=10Y")
probe("stockanalysis crypto page json",
      "https://stockanalysis.com/api/symbol/b/BTC-USD/history?range=10Y")

print("\n\n### B. retail positioning")
probe("okx long/short account ratio BTC",
      "https://www.okx.com/api/v5/rubik/stat/contracts/long-short-account-ratio?ccy=BTC&period=1D")
probe("okx long/short account ratio ETH",
      "https://www.okx.com/api/v5/rubik/stat/contracts/long-short-account-ratio?ccy=ETH&period=1D")
probe("okx taker volume BTC",
      "https://www.okx.com/api/v5/rubik/stat/taker-volume?ccy=BTC&instType=CONTRACTS&period=1D")
probe("okx funding rate history BTC-USDT-SWAP",
      "https://www.okx.com/api/v5/public/funding-rate-history?instId=BTC-USDT-SWAP&limit=30")
probe("bybit account ratio BTCUSDT",
      "https://api.bybit.com/v5/market/account-ratio?category=linear&symbol=BTCUSDT&period=1d&limit=30")
probe("bybit account ratio ETHUSDT",
      "https://api.bybit.com/v5/market/account-ratio?category=linear&symbol=ETHUSDT&period=1d&limit=30")
probe("bybit funding history BTCUSDT",
      "https://api.bybit.com/v5/market/funding/history?category=linear&symbol=BTCUSDT&limit=50")
probe("bybit funding history ETHUSDT",
      "https://api.bybit.com/v5/market/funding/history?category=linear&symbol=ETHUSDT&limit=50")
probe("deribit BTC perp funding",
      "https://www.deribit.com/api/v2/public/get_funding_rate_history?instrument_name=BTC-PERPETUAL"
      "&start_timestamp=1786000000000&end_timestamp=1789200000000")
probe("coinglass open interest (no key)",
      "https://open-api-v3.coinglass.com/api/futures/openInterest/exchange-list?symbol=BTC")
print("\ndone")
