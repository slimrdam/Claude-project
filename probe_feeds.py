#!/usr/bin/env python3
"""Probe the feeds the expanded app needs. Robust, key-free sources only."""
import json, requests
UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/125.0 Safari/537.36"}

def probe(name, url, dig=None, show=260):
    print(f"\n=== {name}\n    {url}")
    try:
        r = requests.get(url, headers=UA, timeout=30)
        print(f"    HTTP {r.status_code}  len={len(r.content)}  ct={r.headers.get('content-type','')[:40]}")
        if r.status_code != 200:
            print(f"    body: {r.text[:200]!r}"); return None
        j = r.json()
        if dig:
            try: print(f"    dug: {str(dig(j))[:show]}")
            except Exception as e: print(f"    DIG FAILED {type(e).__name__}: {e}\n    raw: {str(j)[:show]}")
        else:
            print(f"    raw: {str(j)[:show]}")
        return j
    except Exception as e:
        print(f"    EXC {type(e).__name__}: {e}")
        return None

# --- sentiment: full daily history since Feb 2018
probe("alternative.me Fear & Greed (full)",
      "https://api.alternative.me/fng/?limit=0&format=json",
      lambda j: f"n={len(j['data'])} latest={j['data'][0]} oldest={j['data'][-1]['timestamp']}")

# --- FX + inflation: ECB Data Portal, no key
probe("ECB EUR/USD daily",
      "https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A?format=jsondata&lastNObservations=3",
      lambda j: {"obs": j["dataSets"][0]["series"]["0:0:0:0:0"]["observations"],
                 "dates": [d["id"] for d in j["structure"]["dimensions"]["observation"][0]["values"]]})

probe("ECB euro-area HICP annual rate",
      "https://data-api.ecb.europa.eu/service/data/ICP/M.U2.N.000000.4.ANR?format=jsondata&lastNObservations=3",
      lambda j: {"obs": j["dataSets"][0]["series"]["0:0:0:0:0:0"]["observations"],
                 "dates": [d["id"] for d in j["structure"]["dimensions"]["observation"][0]["values"]]})

probe("ECB HICP index level (for cumulative loss since 2000)",
      "https://data-api.ecb.europa.eu/service/data/ICP/M.U2.N.000000.4.INX?format=jsondata&startPeriod=2000-01&lastNObservations=2",
      lambda j: str(j["structure"]["dimensions"]["observation"][0]["values"][:2]))

# --- stablecoins + RWA: DefiLlama, no key
probe("DefiLlama stablecoin chains",
      "https://stablecoins.llama.fi/stablecoinchains",
      lambda j: [(c["name"], round(c.get("totalCirculatingUSD",{}).get("peggedUSD",0)/1e9,1))
                 for c in sorted(j, key=lambda c:-c.get("totalCirculatingUSD",{}).get("peggedUSD",0))[:5]])

probe("DefiLlama Ethereum TVL (latest)",
      "https://api.llama.fi/v2/chains",
      lambda j: [(c["name"], round(c["tvl"]/1e9,1)) for c in sorted(j,key=lambda c:-c["tvl"])[:5]])

# RWA category total — check the shape before relying on it
probe("DefiLlama RWA category",
      "https://api.llama.fi/overview/protocols?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true",
      lambda j: list(j.keys())[:12])

# --- crypto prices control (already in use)
probe("CoinGecko ETH 365d",
      "https://api.coingecko.com/api/v3/coins/ethereum/market_chart?vs_currency=usd&days=365&interval=daily",
      lambda j: f"n={len(j['prices'])} last={j['prices'][-1]}")
