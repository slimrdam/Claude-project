/* =============================================================================
   App shell: navigation, language toggle, shared data loading and formatting.
   Every page includes this, sets PAGE to its own id, then calls Shell.mount().
   ============================================================================= */
(function (root) {
"use strict";
const { t, apply, setLang } = root.I18N;

const PAGES = [
  { id: "home",       href: "index.html",      n: "00", key: "nav.home" },
  { id: "thesis",     href: "thesis.html",     n: "01", key: "nav.thesis" },
  { id: "allocation", href: "allocation.html", n: "02", key: "nav.allocation" },
  { id: "path",       href: "path.html",       n: "03", key: "nav.path" },
  { id: "sentiment",  href: "sentiment.html",  n: "04", key: "nav.sentiment" },
  { id: "sbet",       href: "sbet.html",       n: "05", key: "nav.sbet" }
];

/* ---------------------------------------------------------------- formatting */
const loc = () => (root.I18N.lang === "fr" ? "fr-FR" : "en-GB");

function money(v, ccy, dp) {
  if (v == null || !isFinite(v)) return "—";
  if (dp == null) dp = Math.abs(v) >= 1000 ? 0 : 2;
  return new Intl.NumberFormat(loc(), {
    style: "currency", currency: ccy || "USD",
    minimumFractionDigits: dp, maximumFractionDigits: dp
  }).format(v);
}
const usd = (v, dp) => money(v, "USD", dp);
const eur = (v, dp) => money(v, "EUR", dp);

function num(v, dp) {
  if (v == null || !isFinite(v)) return "—";
  return new Intl.NumberFormat(loc(), {
    minimumFractionDigits: dp == null ? 0 : dp,
    maximumFractionDigits: dp == null ? 0 : dp
  }).format(v);
}
function pct(v, dp) {
  if (v == null || !isFinite(v)) return "—";
  return num(v * 100, dp == null ? 1 : dp) + " %";
}
function signed(v, dp) {
  if (v == null || !isFinite(v)) return "—";
  return (v >= 0 ? "+" : "−") + num(Math.abs(v) * 100, dp == null ? 1 : dp) + " %";
}
/* Big money in words, so $146,800,000,000 reads as $147B / 147 Md$ */
function big(v, ccy) {
  if (v == null || !isFinite(v)) return "—";
  const fr = root.I18N.lang === "fr";
  if (Math.abs(v) >= 1000) return money(v / 1000, ccy, 1).replace(/([\d\s,.]+)/, "$1") + (fr ? " 000 Md" : "T");
  return money(v, ccy, v >= 100 ? 0 : 1) + (fr ? " Md" : "B");
}
function date(iso) {
  if (!iso) return "—";
  const parts = String(iso).split("-").map(Number);
  const d = parts.length >= 3 ? new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]))
                              : new Date(Date.UTC(parts[0], (parts[1] || 1) - 1, 1));
  return d.toLocaleDateString(loc(), {
    day: parts.length >= 3 ? "numeric" : undefined,
    month: "short", year: "numeric", timeZone: "UTC"
  });
}

/* ---------------------------------------------------------------- data */
const cache = {};
function loadJSON(path) {
  if (!cache[path]) {
    cache[path] = fetch(path + "?t=" + Date.now(), { cache: "no-store" })
      .then(r => { if (!r.ok) throw new Error(path + " → HTTP " + r.status); return r.json(); });
  }
  return cache[path];
}
/* data.json carries assumptions once the workflow has rebuilt it; until then,
   and if that ever regresses, fall back to reading assumptions.json directly so
   the pages render rather than blanking. */
function loadData() {
  return loadJSON("data.json").then(d => {
    if (d.assumptions) return d;
    return loadJSON("assumptions.json").then(a => { d.assumptions = a; return d; });
  });
}
const loadScenarios = () => loadJSON("scenarios.json");

/* ---------------------------------------------------------------- chrome */
function mount(pageId) {
  const nav = document.createElement("div");
  nav.className = "topbar";
  nav.innerHTML =
    '<div class="wrap topbar-in">' +
      '<a class="brand" href="index.html"><span class="dot"></span>' +
        '<span class="full" data-i18n="app.name"></span>' +
        '<span class="short" data-i18n="app.short"></span></a>' +
      '<nav class="navlinks" aria-label="Sections">' +
        PAGES.map(p =>
          `<a href="${p.href}"${p.id === pageId ? ' aria-current="page"' : ""}>` +
          `<span class="n">${p.n}</span><span data-i18n="${p.key}"></span></a>`).join("") +
      '</nav>' +
      '<div class="langsw" role="group" aria-label="Language">' +
        root.I18N.langs.map(l =>
          `<button data-lang="${l}" aria-pressed="${l === root.I18N.lang}">${l.toUpperCase()}</button>`).join("") +
      '</div>' +
    '</div>';
  document.body.insertBefore(nav, document.body.firstChild);

  /* On a phone the strip scrolls, so bring the current chip into view — otherwise
     the reader has to scroll sideways just to find out where they are. Sets
     scrollLeft on the strip rather than calling scrollIntoView, which would also
     scroll the page. */
  const strip = nav.querySelector(".navlinks");
  const here = strip.querySelector('a[aria-current="page"]');
  if (here) requestAnimationFrame(() => {
    const over = strip.scrollWidth - strip.clientWidth;
    if (over > 1) strip.scrollLeft = Math.max(0, Math.min(over,
      here.offsetLeft - (strip.clientWidth - here.offsetWidth) / 2));
  });

  nav.querySelector(".langsw").addEventListener("click", e => {
    const b = e.target.closest("button[data-lang]");
    if (!b) return;
    setLang(b.dataset.lang);
    nav.querySelectorAll("[data-lang]").forEach(x =>
      x.setAttribute("aria-pressed", String(x.dataset.lang === root.I18N.lang)));
  });

  const foot = document.createElement("footer");
  foot.className = "app";
  foot.innerHTML =
    '<div class="wrap">' +
      '<p data-i18n="foot.disclaimer" style="margin-bottom:8px"></p>' +
      '<p data-i18n="foot.sources" style="margin-bottom:8px"></p>' +
      '<p class="asof"><span data-i18n="foot.updated"></span> <span id="shell-updated">—</span></p>' +
    '</div>';
  document.body.appendChild(foot);

  /* next-part link, where the page defines one */
  apply();
  loadData().then(d => {
    const u = document.getElementById("shell-updated");
    if (u && d.market && d.market.as_of) u.textContent = d.market.as_of;
    else if (u) u.textContent = d.generated || "—";
  }).catch(() => {});
}

/* Pages register a redraw so switching language re-renders generated content. */
const redraws = [];
function onLang(fn) {
  redraws.push(fn);
  root.addEventListener("langchange", () => { try { fn(); } catch (e) { console.error(e); } });
}

function fail(el, err) {
  if (!el) return;
  el.innerHTML = `<div class="banner err">${t("common.error")} — ${err && err.message ? err.message : err}</div>`;
}

/* Sentiment label and colour. Derived from the value, never from the API's own
   value_classification, which is English only and would leak into the French UI. */
const RAMP = [[0,[255,59,78]],[25,[255,138,52]],[50,[244,208,63]],[75,[84,210,122]],[100,[16,201,95]]];
function fngColor(v, alpha) {
  v = Math.max(0, Math.min(100, v));
  let a = RAMP[0], b = RAMP[RAMP.length - 1];
  for (let i = 0; i < RAMP.length - 1; i++)
    if (v >= RAMP[i][0] && v <= RAMP[i+1][0]) { a = RAMP[i]; b = RAMP[i+1]; break; }
  const f = (v - a[0]) / ((b[0] - a[0]) || 1);
  const c = a[1].map((ch, i) => Math.round(ch + (b[1][i] - ch) * f));
  return `rgba(${c[0]},${c[1]},${c[2]},${alpha == null ? 1 : alpha})`;
}
const fngLabel = v => v < 25 ? t("se.fear") : v < 45 ? t("se.fear2")
                    : v <= 55 ? t("se.neutral") : v <= 75 ? t("se.greed2") : t("se.greed");

root.Shell = { mount, onLang, loadJSON, loadData, loadScenarios, fail, PAGES,
               usd, eur, money, num, pct, signed, big, date, loc, fngLabel, fngColor };
})(window);
