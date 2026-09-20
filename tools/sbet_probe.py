"""Show the context around each short-interest label so the parser can be written."""
import re, urllib.request

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36")
LABELS = ("Short Interest", "Short Previous Month", "Short % of Shares Out",
          "Short % of Float", "Short Ratio", "Shares Outstanding", "Float")


def get(url):
    req = urllib.request.Request(url, headers={
        "User-Agent": UA, "Accept": "*/*", "Accept-Encoding": "identity"})
    return urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "replace")


for label, url in [
    ("__data.json", "https://stockanalysis.com/stocks/sbet/statistics/__data.json"),
    ("page html", "https://stockanalysis.com/stocks/sbet/statistics/"),
]:
    print("\n" + "=" * 64)
    print("== " + label)
    print("=" * 64, flush=True)
    body = get(url)
    print("len", len(body))
    for lab in LABELS:
        for m in list(re.finditer(re.escape(lab), body))[:2]:
            w = body[m.start():m.start() + 150]          # greedy window
            w = re.sub(r"\s+", " ", w)
            print("  [%-22s] %s" % (lab, w))
print("\n\nPROBE COMPLETE", flush=True)
