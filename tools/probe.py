"""Probe candidate feeds from a GitHub runner. Nothing here is wired into the app."""
import json, time, urllib.request, urllib.error
UA={"User-Agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36"}
def j(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
        return json.loads(r.read())

print("### Bitstamp paging: how far back does daily OHLC go, and does end= work")
for pair in ("btcusd", "ethusd"):
    end, oldest, rows, calls = None, None, 0, 0
    while calls < 7:
        u = f"https://www.bitstamp.net/api/v2/ohlc/{pair}/?step=86400&limit=1000"
        if end: u += f"&end={end}"
        try: d = j(u)["data"]["ohlc"]
        except Exception as e: print("   fail", e); break
        if not d: print("   empty page, stop"); break
        ts = [int(r["timestamp"]) for r in d]
        lo, hi = min(ts), max(ts)
        rows += len(d); calls += 1
        print(f"   {pair} call {calls}: {len(d):4d} rows  {time.strftime('%Y-%m-%d', time.gmtime(lo))} .. {time.strftime('%Y-%m-%d', time.gmtime(hi))}")
        if oldest is not None and lo >= oldest: print("   no further back, stop"); break
        oldest = lo
        end = lo - 86400
        time.sleep(.3)
    print(f"   {pair}: {rows} daily rows over {calls} calls, oldest {time.strftime('%Y-%m-%d', time.gmtime(oldest))}\n")

print("### OKX shapes in full")
for path,label in (
  ("contracts/long-short-account-ratio?ccy=BTC&period=1D","LS ratio BTC 1D"),
  ("contracts/long-short-account-ratio?ccy=ETH&period=1D","LS ratio ETH 1D"),
):
    d = j("https://www.okx.com/api/v5/rubik/stat/"+path)
    rows = d["data"]
    print(f"   {label}: code={d['code']} {len(rows)} rows")
    print(f"      newest {rows[0]} -> {time.strftime('%Y-%m-%d', time.gmtime(int(rows[0][0])/1000))}")
    print(f"      oldest {rows[-1]} -> {time.strftime('%Y-%m-%d', time.gmtime(int(rows[-1][0])/1000))}")
    vals=[float(r[1]) for r in rows]
    print(f"      min {min(vals)} max {max(vals)}")

print("\n### OKX funding, both assets")
for inst in ("BTC-USDT-SWAP","ETH-USDT-SWAP"):
    d = j(f"https://www.okx.com/api/v5/public/funding-rate-history?instId={inst}&limit=100")
    rows=d["data"]
    print(f"   {inst}: {len(rows)} rows, newest {rows[0]['fundingTime']} rate {rows[0]['fundingRate']}")
    rs=[float(r['fundingRate']) for r in rows]
    print(f"      mean {sum(rs)/len(rs):.6%}  min {min(rs):.6%}  max {max(rs):.6%}")
print("\ndone")
