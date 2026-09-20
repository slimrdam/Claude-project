"""Verify the published data.json carries the reported float and percentage."""
import json, urllib.request

url = "https://slimrdam.github.io/Claude-project/data.json"
req = urllib.request.Request(url, headers={"User-Agent": "verify/1.0",
                                           "Cache-Control": "no-cache"})
d = json.loads(urllib.request.urlopen(req, timeout=40).read().decode())
sh = (d.get("market") or {}).get("short") or {}
print("generated:", d.get("generated"))
print("stale feeds:", (d.get("market") or {}).get("stale"))
for k in ("interest", "settlement", "days_to_cover", "float_shares",
          "pct_float", "pct_shares_out", "reported_source"):
    print(f"  {k:<18} {sh.get(k)!r}")
print("  history rows    ", len(sh.get("history") or []))
fl, pf = sh.get("float_shares"), sh.get("pct_float")
print("\nVERDICT:", "live feed carries the reported float" if fl and pf
      else "FELL BACK - float/pct missing")
if fl and pf:
    print(f"  page will print {pf*100:.1f}% of a {fl/1e6:.0f}M float")
