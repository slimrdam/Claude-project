# SBET vs ETH — mNAV monitor

Daily dashboard tracking SharpLink Gaming (SBET) against the ether it holds.
Published on GitHub Pages, refreshed by GitHub Actions. **No computer required** —
the schedule runs on GitHub's servers.

## Setup from a phone

All of this works in a mobile browser at github.com. Sign in first.

1. **New repository.** Public. Any name — it becomes part of your URL.
2. **Add file → Upload files.** Select all five: `index.html`, `update.py`,
   `config.json`, `notes.json`, `data.json`. Commit.
3. **Add file → Create new file.** In the filename box type exactly:
   `.github/workflows/update.yml`
   (typing the slashes creates the folders). Paste the workflow YAML. Commit.
4. **Settings → Pages → Source: GitHub Actions.** Once, by hand. The workflow
   asks for this over the API too (`configure-pages` with `enablement: true`),
   but GitHub refuses that call from a workflow token, so the first time is
   yours. The repository has to be **public** for this on a free plan.
5. **Actions tab → Refresh dashboard → Run workflow.** Watch it go green.
6. Give Pages a minute or two to serve the first deploy. A 404 immediately after
   the run goes green is normal.
7. Your URL is `https://<username>.github.io/<repo>/`. Bookmark it to your
   Android home screen. It refreshes itself from then on.

Optional: a free CoinGecko demo key added under **Settings → Secrets and variables
→ Actions** as `COINGECKO_API_KEY` raises the rate limit. It works without one.

## Schedule

`15 22 * * 2-6` — 22:15 UTC Tuesday to Saturday, roughly two hours after the US
close, which covers Monday through Friday sessions in US time. Cron is UTC and
ignores daylight saving. To change it, edit the workflow file on github.com.

The job commits `data.json` on every run even when prices haven't moved. That is
deliberate: GitHub disables scheduled workflows after 60 days of repository
inactivity, and a daily commit keeps the cron alive.

## What still needs you

Two numbers no free API publishes:

- `eth_held` — SharpLink's ether balance
- `shares_outstanding`

They live in `config.json` with a `last_verified` date. Past `stale_after_days`,
the page shows a red banner saying the mNAV panel is unreliable. The ratio chart
doesn't use either number and stays valid regardless.

Edit `config.json` on github.com — tap the file, tap the pencil, commit. Takes a
minute on a phone. Check after each quarterly filing or announced raise or buyback,
and append to `holdings_history` at the same time.

`notes.json` holds the adoption figures and ETH/BTC levels. Editorial, hand-kept,
with `as_of` dates the page prints. They will go stale; at least visibly.

## Data sources

| Series | Primary | Fallback |
|---|---|---|
| SBET daily | Yahoo Finance chart API | Stooq CSV |
| ETH, BTC daily | CoinGecko | CoinMarketCap data API |

`coinmarketcap.com/currencies/ethereum/historical-data/` cannot be scraped — it is
JS-rendered behind Cloudflare. The CoinMarketCap fallback calls the JSON endpoint
that page uses internally.

`data.json` ships pre-seeded with 275 sessions back to August 2025, further than
CoinGecko's free window reaches. Each run merges new data over that archive, so
history accumulates and never shrinks.

## Failure behaviour

`update.py` exits non-zero — the Action goes red and you get an email — if a feed
dies, if fewer than 30 overlapping sessions survive the merge, or if the newest
session is more than 5 days old. A failed run leaves the previous `data.json`
serving. If `data.json` is missing or malformed the page shows an error rather than
a stale chart.

## Running it by hand

You never need to, but **Actions → Refresh dashboard → Run workflow** forces a run.
