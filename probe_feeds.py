#!/usr/bin/env python3
"""Temporary diagnostic: which equity feeds answer a GitHub runner?"""
import datetime as dt, json, time, requests

UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/125.0 Safari/537.36"}
START = "2025-08-01"
p1 = int(dt.datetime.fromisoformat(START).timestamp())
p2 = int(time.time()) + 86400


def probe(name, url, headers=None, session=None, show=400):
    print(f"\n=== {name}\n    {url}")
    try:
        r = (session or requests).get(url, headers=headers or UA, timeout=30)
        print(f"    HTTP {r.status_code}  len={len(r.content)}  ct={r.headers.get('content-type')}")
        print(f"    body[:{show}]: {r.text[:show]!r}")
        return r
    except Exception as e:
        print(f"    EXC {type(e).__name__}: {e}")
        return None


probe("yahoo query1",
      f"https://query1.finance.yahoo.com/v8/finance/chart/SBET?period1={p1}&period2={p2}&interval=1d")
probe("yahoo query2",
      f"https://query2.finance.yahoo.com/v8/finance/chart/SBET?period1={p1}&period2={p2}&interval=1d")

# Yahoo with a real cookie + crumb, which is what a browser sends
print("\n=== yahoo with cookie+crumb")
try:
    s = requests.Session()
    s.headers.update(UA)
    s.get("https://fc.yahoo.com", timeout=15)
    c = s.get("https://query2.finance.yahoo.com/v1/test/getcrumb", timeout=15)
    print(f"    getcrumb HTTP {c.status_code} crumb={c.text[:40]!r} cookies={len(s.cookies)}")
    if c.status_code == 200 and c.text.strip():
        probe("yahoo chart w/ crumb",
              f"https://query2.finance.yahoo.com/v8/finance/chart/SBET"
              f"?period1={p1}&period2={p2}&interval=1d&crumb={c.text.strip()}",
              session=s)
except Exception as e:
    print(f"    EXC {type(e).__name__}: {e}")

probe("stooq .com", "https://stooq.com/q/d/l/?s=sbet.us&i=d")
probe("stooq .pl",  "https://stooq.pl/q/d/l/?s=sbet.us&i=d")
probe("stooq .com uppercase", "https://stooq.com/q/d/l/?s=SBET.US&i=d")

probe("nasdaq api",
      f"https://api.nasdaq.com/api/quote/SBET/historical"
      f"?assetclass=stocks&fromdate={START}&todate={dt.date.today()}&limit=9999",
      headers={**UA, "Accept": "application/json"})

probe("stockanalysis", "https://stockanalysis.com/api/symbol/s/SBET/history?range=1Y&period=Daily")

probe("alphavantage demo",
      "https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=SBET&outputsize=full&apikey=demo")

probe("marketdata.app",
      f"https://api.marketdata.app/v1/stocks/candles/D/SBET/?from={START}&to={dt.date.today()}")

# sanity: the crypto side, which did not fail
probe("coingecko eth",
      "https://api.coingecko.com/api/v3/coins/ethereum/market_chart"
      "?vs_currency=usd&days=365&interval=daily", show=160)
