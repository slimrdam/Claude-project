"""Exercise the rewritten short-interest fetchers against the live sources."""
import importlib.util, json, sys

spec = importlib.util.spec_from_file_location("upd", "update.py")
u = importlib.util.module_from_spec(spec)
spec.loader.exec_module(u)

print("=" * 64, "\n== screener (stockanalysis)\n", "=" * 64, flush=True)
try:
    sa = u.fetch_screener_short("SBET")
    for k, v in sa.items():
        print(f"  {k:<20} {v!r}")
except Exception as e:
    print("FAILED %s: %s" % (type(e).__name__, e))

print("\n" + "=" * 64, "\n== FINRA settlement series\n", "=" * 64, flush=True)
try:
    h = u.fetch_finra_short("SBET")
    print("  rows:", len(h), " first:", h[0]["date"], " last:", h[-1]["date"])
    for r in h[-6:]:
        print("   ", r)
except Exception as e:
    print("FAILED %s: %s" % (type(e).__name__, e))

print("\n" + "=" * 64, "\n== combined fetch_short_interest\n", "=" * 64, flush=True)
try:
    out = u.fetch_short_interest("SBET")
    small = {k: v for k, v in out.items() if k != "history"}
    print(json.dumps(small, indent=2, default=str))
    print("  history rows:", len(out["history"]))
    fl, pf = out.get("float_shares"), out.get("pct_float")
    if fl and pf:
        print(f"  CHECK interest/float = {out['interest']/fl:.5f} vs reported {pf:.5f}")
except Exception as e:
    print("FAILED %s: %s" % (type(e).__name__, e))

print("\n\nPROBE COMPLETE", flush=True)
