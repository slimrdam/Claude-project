#!/usr/bin/env python3
"""Probe 3: extract the figure cards from SharpLink's server-rendered dashboard."""
import re, requests, html as ihtml

UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/125.0 Safari/537.36"}
t = requests.get("https://www.sharplink.com/dashboard", headers=UA, timeout=40).text
print(f"html {len(t)} bytes")

def text(frag):
    frag = re.sub(r"<(script|style|svg)[^>]*>.*?</\1>", " ", frag, flags=re.S|re.I)
    frag = re.sub(r"<[^>]+>", "\x00", frag)
    parts = [ihtml.unescape(p).strip() for p in frag.split("\x00")]
    return [p for p in parts if p]

# every <h3 class="title">…</h3> heads a figure card; take the text that follows it
print("\n--- cards by <h3 class=\"title\">")
for m in re.finditer(r'<h3 class="title"[^>]*>(.*?)</h3>', t, re.S):
    label = " ".join(text(m.group(1)))
    after = t[m.end(): m.end() + 1400]
    # stop at the next card so values do not bleed across
    after = re.split(r'<h3 class="title"', after)[0]
    vals = [p for p in text(after) if re.search(r'\d', p)]
    print(f"  {label:34} -> {vals[:6]}")

print("\n--- any element whose class mentions value/figure/number")
seen = set()
for m in re.finditer(r'<(\w+)[^>]*class="([^"]*(?:value|figure|number|amount|stat)[^"]*)"[^>]*>(.*?)</\1>', t, re.S):
    cls, inner = m.group(2), " ".join(text(m.group(3)))
    if inner and re.search(r'\d', inner) and (cls, inner) not in seen:
        seen.add((cls, inner))
        print(f"  .{cls[:38]:38} {inner[:46]!r}")
    if len(seen) > 25: break

print("\n--- date stamps on the page")
for pat in (r'as of[^<]{0,60}', r'[A-Z][a-z]{2}\s+\d{1,2},\s+20\d\d', r'\d{1,2}/\d{1,2}/20\d\d'):
    hits = re.findall(pat, t, re.I)
    if hits: print(f"  {pat[:24]}: {sorted(set(hits))[:6]}")
