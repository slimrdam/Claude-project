# The debasement trade

A five-part investment thesis published as a live dashboard app on GitHub Pages.
Every figure that can refresh itself does; everything else carries a visible date.

**https://slimrdam.github.io/Claude-project/**

## The five parts

| | Page | What it argues |
|---|---|---|
| 00 | `index.html` | Home. Sets the scene, live tickers, routes into the argument. |
| 01 | `thesis.html` | The case: euro debasement against what the Ethereum network actually settles. |
| 02 | `allocation.html` | How much. A hypothetical €100,000 portfolio, fully editable. |
| 03 | `path.html` | The path. ETH and BTC scenario paths to December 2030, with the drawdowns. |
| 04 | `sentiment.html` | Price against the Crypto Fear & Greed Index, daily since February 2018. |
| 05 | `sbet.html` | SharpLink (SBET) priced against the ether on its balance sheet. |

Shared code lives in `assets/`: `app.css` (one dark design system), `i18n.js`
(the full FR/EN dictionary), `shell.js` (nav, language toggle, formatting, data
loading), and one script per page.

## Language

Full French/English toggle in the header, on every page, including generated
chart labels and numbers. French is the default; the choice is remembered in the
reader's browser. Both dictionaries are checked for key parity — a missing key
falls back to English and logs rather than rendering blank.

## Where the numbers come from

**Refreshed automatically** by `update.py`, run by GitHub Actions:

| Figure | Source |
|---|---|
| SBET daily close and volume | stockanalysis.com, Nasdaq fallback |
| ETH and BTC daily closes | CoinGecko |
| EUR/USD, euro-area inflation, purchasing power lost since 2000 | European Central Bank Data Portal |
| Stablecoin float and DeFi TVL by chain | DefiLlama |
| Fear & Greed latest reading | alternative.me |
| Fear & Greed full history and 8 years of daily prices | fetched live in the browser on the sentiment page, refreshed every 5 minutes |

The market feeds are **non-fatal**: if the ECB or DefiLlama is down, the run
keeps the previous value, records it in `market.stale`, and the app shows a
banner. Only the SBET and crypto price feeds can fail the job, because those are
what the dashboard is actually for.

**Maintained by hand** — no free API publishes these reliably:

| File | What |
|---|---|
| `config.json` | SharpLink's ether held and share count, from company filings. Staleness banner after 30 days. |
| `assumptions.json` | The canonical price targets every page reads, so they cannot drift apart. |
| `notes.json` | Editorial: allocator quotes, adoption figures, ETH/BTC historical averages. Each block carries its own `as_of`. |
| `scenarios.json` | The drawn scenario paths. Illustrative, not forecasts. |

Do not edit `data.json` — it is generated, and it carries history further back
than CoinGecko's free window reaches.

## The scenario paths

`scenarios.json` holds 52 monthly points per asset per case, September 2026 to
December 2030. The September 2026 – December 2027 ether candles are authored
OHLC; everything after is a monthly close from which the page derives a
deterministic candle, so the file stays editable by hand.

These are drawings, not predictions. Live spot is plotted over them and the page
states how far price has drifted from the anchor it was drawn at. Past 25% drift
it says so in a banner — that is the signal to re-author the early months.

## Schedule

`15 22 * * 2-6` — 22:15 UTC, Tuesday to Saturday. Note this is one day offset
from the US close it is meant to follow: Monday's session is not picked up until
Tuesday evening, and Saturday's run adds nothing. `1-5` would track the sessions
properly.

The job commits `data.json` on every run even when nothing moved. That is
deliberate: GitHub disables scheduled workflows after 60 days of repository
inactivity, and a daily commit keeps the cron alive.

## Setting it up elsewhere

1. Push these files to a **public** repository.
2. **Settings → Pages → Source: GitHub Actions.** Once, by hand — GitHub refuses
   the create-a-Pages-site API call from a workflow token, so `configure-pages`
   with `enablement: true` cannot do it for you the first time.
3. **Actions → Refresh dashboard → Run workflow.**

Not investment advice. Digital assets can lose all of their value.
