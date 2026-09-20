"""Dump the stockanalysis __data.json so the parser can be written against it."""
import urllib.request

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36")
req = urllib.request.Request(
    "https://stockanalysis.com/stocks/sbet/statistics/__data.json",
    headers={"User-Agent": UA, "Accept": "application/json",
             "Accept-Encoding": "identity"})
body = urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "replace")
print("len:", len(body))
print("---- FULL BODY ----")
print(body)
print("\n\nPROBE COMPLETE", flush=True)
