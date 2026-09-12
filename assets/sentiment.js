/* =============================================================================
   Part four: price against the Crypto Fear & Greed Index, daily since Feb 2018.
   This page fetches its own data client side rather than reading data.json, so
   it stays live between workflow runs and keeps the full 8-year daily history
   out of the committed file. Index from alternative.me, price from Binance with
   CryptoCompare as fallback.
   ============================================================================= */
Shell.mount("sentiment");
(function () {
"use strict";
const { t } = I18N, S = Shell, $ = id => document.getElementById(id);
const DAY = 86400000;
const FNG_URL = "https://api.alternative.me/fng/?limit=0&format=json";
const ASSETS = {
  ETH: { key:"common.eth", binance:"ETHUSDT", cc:"ETH", color:"#8b9bff", rgb:"139,155,255" },
  BTC: { key:"common.btc", binance:"BTCUSDT", cc:"BTC", color:"#f0a340", rgb:"240,163,64" }
};

let chart = null, zoomOK = false, fng = null, asset = "ETH";
const priceCache = {};
let rows = [], fullMin = null, fullMax = null, currentScale = "logarithmic";
let lastRefresh = 0, busy = false, autoOn = true, autoTimer = null;

/* ---------------------------------------------------------------- helpers */
const floorDay = ms => Math.floor(ms / DAY) * DAY;
function dedupe(points) {
  const m = new Map();
  for (const p of points) if (p.v != null && isFinite(p.v)) m.set(floorDay(p.t), p.v);
  return [...m.entries()].map(([tt, v]) => ({t: tt, v})).sort((a, b) => a.t - b.t);
}
const fngColor = Shell.fngColor, fngLabel = Shell.fngLabel;
function pearson(xs, ys) {
  const n = xs.length; if (n < 3) return NaN;
  let sx=0, sy=0, sxx=0, syy=0, sxy=0;
  for (let i = 0; i < n; i++) { const x=xs[i], y=ys[i]; sx+=x; sy+=y; sxx+=x*x; syy+=y*y; sxy+=x*y; }
  const cov = sxy - sx*sy/n, vx = sxx - sx*sx/n, vy = syy - sy*sy/n, d = Math.sqrt(vx*vy);
  return d === 0 ? NaN : cov/d;
}
/* Timeout without AbortSignal — keeps the fetch init structured-cloneable. */
function withTimeout(p, ms) {
  let timer;
  const race = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error("timed out")), ms); });
  return Promise.race([p, race]).finally(() => clearTimeout(timer));
}
async function fetchJSON(url, ms) {
  const r = await withTimeout(fetch(url, {cache:"no-store"}), ms || 14000);
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
}
function showOverlay(msg, retry) {
  $("overlay").classList.remove("hidden");
  $("overlay").innerHTML = retry
    ? `<div class="msg">${msg}</div><button class="btn" id="retry">${t("common.retry")}</button>`
    : `<div class="pulse"></div><div class="msg">${msg}</div>`;
  if (retry) $("retry").onclick = boot;
}
const hideOverlay = () => $("overlay").classList.add("hidden");

/* ---------------------------------------------------------------- data */
async function fetchFNG() {
  const j = await fetchJSON(FNG_URL);
  if (!j || !Array.isArray(j.data)) throw new Error("unexpected index response");
  return dedupe(j.data.map(d => ({t: parseInt(d.timestamp,10)*1000, v: parseInt(d.value,10)})));
}
async function fetchBinance(sym) {
  const out = [];
  let start = Date.UTC(2017,0,1); const now = Date.now();
  for (let g = 0; g < 16 && start < now; g++) {
    const data = await fetchJSON(`https://data-api.binance.vision/api/v3/klines?symbol=${sym}&interval=1d&startTime=${start}&limit=1000`);
    if (!Array.isArray(data) || !data.length) break;
    for (const k of data) out.push({t:k[0], v:parseFloat(k[4])});
    start = data[data.length-1][0] + DAY;
    if (data.length < 1000) break;
  }
  if (!out.length) throw new Error("no Binance data");
  return dedupe(out);
}
async function fetchCC(sym) {
  const out = []; let toTs = Math.floor(Date.now()/1000);
  for (let i = 0; i < 3; i++) {
    const j = await fetchJSON(`https://min-api.cryptocompare.com/data/v2/histoday?fsym=${sym}&tsym=USD&limit=2000&toTs=${toTs}`);
    const arr = j && j.Data && j.Data.Data ? j.Data.Data : [];
    if (!arr.length) break;
    for (const d of arr) if (d.close > 0) out.push({t:d.time*1000, v:d.close});
    toTs = arr[0].time - DAY/1000;
    if (arr.length < 2000) break;
  }
  if (!out.length) throw new Error("no CryptoCompare data");
  return dedupe(out);
}
async function fetchPrice(key) {
  try { return await fetchBinance(ASSETS[key].binance); }
  catch (e) { console.warn("Binance failed for " + key + ":", e.message); }
  return fetchCC(ASSETS[key].cc);
}
async function ensure(key, force) {
  if (!fng || force) fng = await fetchFNG();
  if (!priceCache[key] || force) priceCache[key] = await fetchPrice(key);
  const pm = new Map(priceCache[key].map(p => [p.t, p.v]));
  const out = [];
  for (const f of fng) { const p = pm.get(f.t); if (p != null) out.push({t:f.t, fng:f.v, price:p}); }
  if (out.length < 30) throw new Error("not enough overlapping data");
  return out;
}

/* ---------------------------------------------------------------- view */
const winNow = () => ({min: chart.scales.x.min, max: chart.scales.x.max});
const visible = () => { const w = winNow(); return rows.filter(r => r.t >= w.min && r.t <= w.max); };
function setWindow(min, max) {
  min = Math.max(fullMin, min); max = Math.min(fullMax, max);
  if (max - min < 7*DAY) min = Math.max(fullMin, max - 7*DAY);
  if (zoomOK && chart.zoomScale) chart.zoomScale("x", {min,max}, "none");
  else { chart.options.scales.x.min = min; chart.options.scales.x.max = max; }
  afterView();
}
function rescaleY() {
  const v = visible(); if (!v.length) return;
  let lo = Infinity, hi = -Infinity;
  for (const r of v) { if (r.price < lo) lo = r.price; if (r.price > hi) hi = r.price; }
  const y = chart.options.scales.yPrice;
  if (currentScale === "logarithmic") { y.min = Math.max(lo*0.88, 0.01); y.max = hi*1.12; }
  else { const pad = (hi-lo)*0.08 || hi*0.08 || 1; y.min = Math.max(0, lo-pad); y.max = hi+pad; }
  const dense = v.length <= 70;
  chart.data.datasets[0].pointRadius = dense ? 2.4 : 0;
  chart.data.datasets[1].pointRadius = dense ? 1.8 : 0;
}
function spanLabel(a, b) {
  const d = Math.round((b-a)/DAY);
  if (d <= 92) return d + (I18N.lang === "fr" ? " jours" : " days");
  if (d <= 730) return Math.round(d/30.44) + (I18N.lang === "fr" ? " mois" : " months");
  return S.num(d/365.25, 1) + (I18N.lang === "fr" ? " ans" : " years");
}
const cell = (k,v,x,col) => `<div class="cell"><div class="k">${k}</div>` +
  `<div class="v"${col?` style="color:${col}"`:""}>${v}</div><div class="x">${x||""}</div></div>`;

function ticks() {
  if (!rows.length) return;
  const last = rows[rows.length-1], a = ASSETS[asset];
  const v = visible(), w = winNow();
  let chTxt = "—", chSub = t("se.change.x"), chCol = "";
  let corrTxt = "—", corrCol = "";
  if (v.length >= 3) {
    const p0 = v[0].price, p1 = v[v.length-1].price, pc = (p1/p0 - 1);
    chTxt = S.signed(pc, Math.abs(pc) >= 1 ? 0 : 1);
    chSub = S.usd(p0) + " → " + S.usd(p1);
    chCol = pc >= 0 ? "var(--greed-2)" : "var(--fear)";
    const r = pearson(v.map(d=>d.fng), v.map(d=>d.price));
    if (!isNaN(r)) { corrTxt = (r>=0?"+":"−") + S.num(Math.abs(r),2); corrCol = r>=0?"var(--greed-2)":"var(--fear)"; }
  }
  $("ticks").innerHTML =
    cell(t("se.latest",{asset:t(a.key)}), S.usd(last.price), t("common.asof")+" "+S.date(new Date(last.t).toISOString().slice(0,10)), a.color) +
    cell(t("se.fng"), Math.round(last.fng), fngLabel(last.fng), fngColor(last.fng)) +
    cell(t("se.change"), chTxt, chSub, chCol) +
    cell(t("se.corr"), corrTxt, t("se.corr.x"), corrCol);
  $("wtag").textContent = v.length
    ? S.date(new Date(w.min).toISOString().slice(0,10)) + " → " +
      S.date(new Date(w.max).toISOString().slice(0,10)) + "  ·  " + spanLabel(w.min, w.max)
    : "";
}
function syncRange(preset) {
  [...$("rangeseg").children].forEach(b => b.setAttribute("aria-pressed", String(b.dataset.range === preset)));
}
function syncPreset() {
  const w = winNow(), tol = 3*DAY;
  if (Math.abs(w.min-fullMin) < tol && Math.abs(w.max-fullMax) < tol) return syncRange("all");
  if (Math.abs(w.max-fullMax) < tol) {
    const d = Math.round((w.max-w.min)/DAY), pre = {"3y":1095, "1y":365, "6m":182, "3m":91};
    for (const k in pre) if (Math.abs(d-pre[k]) <= 3) return syncRange(k);
  }
  syncRange(null);
}
function afterView() {
  chart.update("none"); rescaleY(); ticks(); syncPreset();
  const w = winNow();
  $("zoomreset").disabled = !(w.min > fullMin + DAY || w.max < fullMax - DAY);
  chart.update("none");
}

/* ---------------------------------------------------------------- chart */
function build() {
  const ctx = $("chart").getContext("2d"), a = ASSETS[asset];
  const grad = ctx.createLinearGradient(0,0,0,460);
  grad.addColorStop(0, `rgba(${a.rgb},.20)`); grad.addColorStop(1, `rgba(${a.rgb},0)`);
  chart = new Chart(ctx, {
    type: "line",
    data: { datasets: [
      { label:"price", data:rows.map(r=>({x:r.t,y:r.price})), yAxisID:"yPrice",
        borderColor:a.color, borderWidth:2.1, fill:true, backgroundColor:grad,
        tension:.05, pointRadius:0, pointHoverRadius:3, order:0, spanGaps:true },
      { label:"fng", data:rows.map(r=>({x:r.t,y:r.fng})), yAxisID:"yFng",
        borderColor:"rgba(244,208,63,.9)", borderWidth:1.6, fill:false,
        tension:.05, pointRadius:0, pointHoverRadius:3, order:1, spanGaps:true,
        segment:{ borderColor: c => fngColor((c.p0.parsed.y + c.p1.parsed.y)/2, .92) } }
    ]},
    options: {
      responsive:true, maintainAspectRatio:false,
      animation: matchMedia("(prefers-reduced-motion: reduce)").matches ? false : {duration:450},
      interaction:{ mode:"index", intersect:false },
      scales: {
        x:{ type:"time", min:fullMin, max:fullMax, grid:{color:"transparent"},
            border:{color:"rgba(255,255,255,.1)"},
            ticks:{color:"#626d82", font:{family:"JetBrains Mono", size:11}, maxRotation:0, autoSkipPadding:22} },
        yPrice:{ type:currentScale, position:"left", grid:{color:"rgba(255,255,255,.045)"},
            border:{display:false},
            ticks:{color:"#97a2b6", font:{family:"JetBrains Mono", size:11},
                   callback:v => v>=1000 ? "$"+(v/1000).toFixed(1)+"k" : "$"+v} },
        yFng:{ type:"linear", position:"right", min:0, max:100, grid:{color:"transparent"},
            border:{display:false},
            ticks:{color:"#626d82", stepSize:25, font:{family:"JetBrains Mono", size:11}} }
      },
      plugins: {
        legend:{display:false},
        zoom:{ limits:{x:{min:fullMin, max:fullMax, minRange:14*DAY}},
               pan:{enabled:true, mode:"x", onPanComplete:afterView},
               zoom:{ wheel:{enabled:true, speed:.12}, pinch:{enabled:true},
                      drag:{enabled:true, modifierKey:"shift",
                            backgroundColor:`rgba(${a.rgb},.12)`, borderColor:`rgba(${a.rgb},.5)`, borderWidth:1},
                      mode:"x", onZoomComplete:afterView } },
        tooltip:{ backgroundColor:"rgba(10,14,23,.95)", borderColor:"var(--rule)", borderWidth:1,
          padding:12, cornerRadius:9, displayColors:false,
          titleFont:{family:"Space Grotesk", weight:"600", size:13},
          bodyFont:{family:"JetBrains Mono", size:12}, bodySpacing:6,
          callbacks:{
            title: it => it.length ? S.date(new Date(it[0].parsed.x).toISOString().slice(0,10)) : "",
            label: it => it.dataset.yAxisID === "yPrice"
              ? "  " + t(ASSETS[asset].key) + "   " + S.usd(it.parsed.y)
              : "  " + (I18N.lang==="fr"?"Indice":"Index") + "   " + Math.round(it.parsed.y) + " · " + fngLabel(it.parsed.y),
            labelTextColor: it => it.dataset.yAxisID === "yPrice" ? ASSETS[asset].color : fngColor(it.parsed.y)
          } }
      }
    }
  });
  zoomOK = typeof chart.resetZoom === "function";
  if (!zoomOK) { $("zoomin").disabled = $("zoomout").disabled = true; }
}

function applyRows(next, keep) {
  const prev = chart ? winNow() : null;
  rows = next; fullMin = rows[0].t; fullMax = rows[rows.length-1].t;
  if (!chart) build();
  else {
    const a = ASSETS[asset], ctx = $("chart").getContext("2d");
    const grad = ctx.createLinearGradient(0,0,0,460);
    grad.addColorStop(0, `rgba(${a.rgb},.20)`); grad.addColorStop(1, `rgba(${a.rgb},0)`);
    chart.data.datasets[0].data = rows.map(r=>({x:r.t,y:r.price}));
    chart.data.datasets[0].borderColor = a.color;
    chart.data.datasets[0].backgroundColor = grad;
    chart.data.datasets[1].data = rows.map(r=>({x:r.t,y:r.fng}));
    const z = chart.options.plugins.zoom;
    if (z && z.limits) { z.limits.x.min = fullMin; z.limits.x.max = fullMax;
      z.zoom.drag.backgroundColor = `rgba(${a.rgb},.12)`; z.zoom.drag.borderColor = `rgba(${a.rgb},.5)`; }
  }
  if (keep && prev) setWindow(Math.max(fullMin, prev.min), Math.min(fullMax, prev.max));
  else {
    if (zoomOK && chart.resetZoom) chart.resetZoom("none");
    chart.options.scales.x.min = fullMin; chart.options.scales.x.max = fullMax;
    syncRange("all"); afterView();
  }
  chrome();
}

/* ---------------------------------------------------------------- chrome */
function chrome() {
  const a = ASSETS[asset];
  $("h1").innerHTML = t("se.h1", {asset: t(a.key)});
  document.documentElement.style.setProperty("--accent", a.color);
  $("legend").innerHTML =
    `<span class="lg"><span class="dash" style="background:${a.color}"></span>` +
    `${t("se.legend.price",{asset:t(a.key)})}</span>` +
    `<span class="lg"><span class="scaleword">${t("se.fear").toUpperCase()}</span>` +
    `<span class="spectrum"></span><span class="scaleword">${t("se.greed").toUpperCase()}</span>` +
    `&nbsp;${t("se.legend.index")}</span>`;
  $("hint").textContent = zoomOK ? t("se.hint") : "";
  [...$("assetseg").children].forEach(b => b.setAttribute("aria-pressed", String(b.dataset.asset === asset)));
  ticks();
}
function stamp(ok) {
  if (ok === false) { $("updated").textContent = t("se.failed"); return; }
  lastRefresh = Date.now();
  $("updated").textContent = t("se.updated") + " · " +
    new Date().toLocaleTimeString(S.loc(), {hour:"2-digit", minute:"2-digit"});
}

/* ---------------------------------------------------------------- actions */
async function switchAsset(key) {
  if (key === asset || busy) return;
  const had = !!priceCache[key];
  asset = key; chrome(); busy = true;
  try {
    if (!had) showOverlay(t("common.loading"), false);
    applyRows(await ensure(key, false), true);
    hideOverlay();
  } catch (err) { showOverlay(t("common.error") + " — " + err.message, true); }
  finally { busy = false; }
}
async function refresh(auto) {
  if (busy) return;
  busy = true; $("refresh").classList.add("spin");
  try {
    const next = await ensure(asset, true);
    delete priceCache[asset === "ETH" ? "BTC" : "ETH"];
    applyRows(next, !!chart); hideOverlay(); stamp(true);
  } catch (err) {
    if (!chart) showOverlay(t("common.error") + " — " + err.message, true);
    else if (!auto) stamp(false);
  } finally { $("refresh").classList.remove("spin"); busy = false; }
}
const AUTO_MS = 5*60*1000;
function startAuto() { stopAuto(); if (autoOn) autoTimer = setInterval(() => { if (!document.hidden) refresh(true); }, AUTO_MS); }
function stopAuto() { if (autoTimer) { clearInterval(autoTimer); autoTimer = null; } }
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && autoOn && Date.now()-lastRefresh > AUTO_MS) refresh(true);
});

$("assetseg").onclick = e => { const b = e.target.closest("button"); if (b) switchAsset(b.dataset.asset); };
$("rangeseg").onclick = e => {
  const b = e.target.closest("button"); if (!b || !chart) return;
  const k = b.dataset.range; syncRange(k);
  if (k === "all") {
    if (zoomOK && chart.resetZoom) chart.resetZoom("none");
    chart.options.scales.x.min = fullMin; chart.options.scales.x.max = fullMax; afterView();
  } else setWindow(fullMax - {"3y":1095,"1y":365,"6m":182,"3m":91}[k]*DAY, fullMax);
};
$("scaleseg").onclick = e => {
  const b = e.target.closest("button"); if (!b || !chart) return;
  currentScale = b.dataset.scale;
  [...e.currentTarget.children].forEach(x => x.setAttribute("aria-pressed", String(x === b)));
  chart.options.scales.yPrice.type = currentScale; afterView();
};
$("zoomin").onclick = () => { if (chart && zoomOK) { chart.zoom(1.35); afterView(); } };
$("zoomout").onclick = () => { if (chart && zoomOK) { chart.zoom(0.72); afterView(); } };
$("zoomreset").onclick = () => {
  if (!chart) return;
  if (zoomOK && chart.resetZoom) chart.resetZoom("none");
  chart.options.scales.x.min = fullMin; chart.options.scales.x.max = fullMax;
  syncRange("all"); afterView();
};
$("chart").addEventListener("dblclick", () => $("zoomreset").click());
$("refresh").onclick = () => refresh(false);
$("auto").onclick = e => {
  autoOn = !autoOn;
  e.currentTarget.setAttribute("aria-pressed", String(autoOn));
  if (autoOn) { startAuto(); refresh(false); } else stopAuto();
};
Shell.onLang(() => { chrome(); if (chart) chart.update("none"); });

async function boot() {
  chrome();
  showOverlay(t("se.pulling"), false);
  if (typeof Chart === "undefined") { showOverlay(t("common.error"), true); return; }
  try {
    const next = await ensure(asset, false);
    if (chart) { chart.destroy(); chart = null; }
    applyRows(next, false); hideOverlay(); stamp(true); startAuto();
  } catch (err) { showOverlay(t("common.error") + " — " + err.message, true); }
}
boot();
})();
