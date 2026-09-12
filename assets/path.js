/* =============================================================================
   Part three: the rocky path to the part-two targets, ETH and BTC, to Dec 2030.
   Candles for the authored months come from scenarios.json verbatim; the rest
   are derived deterministically from the monthly closes, so the file stays
   editable by hand. Live spot is drawn over the top: the scenario is a drawing,
   and the drift from where it was drawn is shown rather than hidden.
   ============================================================================= */
Shell.mount("path");
(function () {
"use strict";
const { t } = I18N, S = Shell, $ = id => document.getElementById(id);
const FR = () => I18N.lang === "fr";

let SC = null, D = null;
let asset = "eth", mode = "bull", showRails = true, useLog = true, showSpot = true;
let sel = null, hover = null;

const M = { l: 14, r: 84, t: 18, b: 40 }, W = 920, H = 480;
const PW = W - M.l - M.r, PH = H - M.t - M.b;
const COL = { eth: "#8b9bff", btc: "#f0a340" };
const CASE = { base: "#5b9bd5", bull: "#2ec27e" };

/* ---------------------------------------------------------------- candles */
/* Deterministic wick from a seeded hash, so the chart is stable across reloads
   and across languages — a random wick would redraw differently every render. */
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 1000) / 1000;
}
/* scenario copy is authored in the JSON, English first with a French twin beside
   it: *_fr on the objects, a fourth element on the rails */
const fr2 = (o, key) => (FR() && o[key + "_fr"]) || o[key];
const railWhy = r => (FR() && r[3]) || r[2];

function candles(a, k) {
  const p = SC[a][k];
  if (p._c) return p._c;
  const out = [];
  for (let i = 0; i < p.closes.length; i++) {
    if (p.ohlc && p.ohlc[i]) { out.push(p.ohlc[i].slice()); continue; }
    const c = p.closes[i];
    const o = i ? p.closes[i-1] : c * 0.985;
    const hiB = Math.max(o, c), loB = Math.min(o, c);
    const r1 = hash(a + k + i + "h"), r2 = hash(a + k + i + "l");
    const swing = Math.abs(c / o - 1);
    const amp = 0.012 + swing * 0.55;
    out.push([Math.round(o), Math.round(hiB * (1 + amp * (0.35 + r1))),
              Math.round(loB * (1 - amp * (0.35 + r2))), Math.round(c)]);
  }
  p._c = out;
  return out;
}

const bounds = () => {
  const all = [];
  ["base","bull"].forEach(k => candles(asset, k).forEach(d => { all.push(d[1], d[2]); }));
  const sp = liveSpot();
  if (sp) all.push(sp);
  return [Math.min.apply(null, all) * 0.9, Math.max.apply(null, all) * 1.08];
};
let LO = 1, HI = 2;
const scale = p => {
  if (p <= 0) return M.t + PH;
  if (useLog) {
    const a = Math.log10(LO), b = Math.log10(HI);
    return M.t + PH - (Math.log10(p) - a) / (b - a) * PH;
  }
  return M.t + PH - (p - LO) / (HI - LO) * PH;
};
const slot = () => PW / SC.months.length;
const cx = i => M.l + slot() * (i + 0.5);
const el = (n, a) => { const e = document.createElementNS("http://www.w3.org/2000/svg", n);
  for (const k in a) e.setAttribute(k, a[k]); return e; };

function liveSpot() {
  if (!D) return null;
  return asset === "eth" ? D.stats.eth_now : (D.market && D.market.btc_usd);
}
function monthLabel(i) {
  const [y, m] = SC.months[i].split("-").map(Number);
  return new Date(Date.UTC(y, m-1, 1)).toLocaleDateString(S.loc(), {month:"short", year:"2-digit", timeZone:"UTC"});
}
const money = v => S.usd(v, 0);

/* ---------------------------------------------------------------- draw */
function draw() {
  const svg = $("chart");
  svg.textContent = "";
  [LO, HI] = bounds();

  /* rails */
  SC[asset].rails.forEach(r => {
    const [p, kind] = r, y = scale(p);
    if (y < M.t || y > M.t + PH) return;
    /* rails off still leaves a plain gridline, so the price axis stays readable */
    svg.appendChild(el("line", {x1:M.l, y1:y, x2:M.l+PW, y2:y,
      stroke: showRails ? (kind === "ath" ? "#c99a3c" : "var(--rule)") : "var(--rule-soft)",
      "stroke-width": showRails && kind === "ath" ? 1.2 : 1,
      "stroke-dasharray": showRails ? (kind === "ath" ? "none" : "2 5") : "none",
      opacity: showRails ? (kind === "ath" ? .85 : .5) : .6}));
    const tx = el("text", {x:M.l+PW+8, y:y+3.5, class:"axis"});
    if (kind === "ath") tx.setAttribute("fill", "#c99a3c");
    tx.textContent = (p >= 1000 ? (p/1000).toFixed(p % 1000 ? 1 : 0) + "k" : p) + (kind === "ath" ? "  ATH" : "");
    svg.appendChild(tx);
  });

  /* live spot */
  const sp = liveSpot();
  if (showSpot && sp) {
    const y = scale(sp);
    svg.appendChild(el("line", {x1:M.l, y1:y, x2:M.l+PW, y2:y, stroke:COL[asset],
      "stroke-width":1, "stroke-dasharray":"6 4", opacity:.75}));
    const tx = el("text", {x:M.l+PW+8, y:y+3.5, class:"axis", fill:COL[asset]});
    tx.textContent = FR() ? "réel" : "live";
    svg.appendChild(tx);
  }

  /* selected drawdown */
  if (sel) {
    const c = SC[asset][sel.k].corr[sel.i];
    const x0 = cx(c.a) - slot()*.5, x1 = cx(c.b) + slot()*.5;
    svg.appendChild(el("rect", {x:x0, y:M.t, width:Math.max(x1-x0,2), height:PH, fill:"#ef5350", opacity:.09}));
    [c.hi, c.lo].forEach(v => svg.appendChild(el("line",
      {x1:x0, y1:scale(v), x2:x1, y2:scale(v), stroke:"#ef5350", "stroke-width":1.2})));
    const lab = el("text", {x:(x0+x1)/2, y:scale(c.lo)+16, "text-anchor":"middle",
      fill:"#ef5350", "font-size":12, "font-weight":600});
    lab.textContent = "−" + S.num((1-c.lo/c.hi)*100, 1) + " %";
    svg.appendChild(lab);
  }

  if (mode === "both") {
    ["base","bull"].forEach(k => {
      const cs = candles(asset, k);
      const pts = cs.map((d, i) => [cx(i), scale(d[3])]);
      svg.appendChild(el("path", {d:"M"+pts.map(p=>p.join(",")).join(" L "), fill:"none",
        stroke:CASE[k], "stroke-width":2.2, "stroke-linejoin":"round"}));
      const last = pts[pts.length-1];
      svg.appendChild(el("circle", {cx:last[0], cy:last[1], r:4.5, fill:CASE[k],
        stroke:"var(--panel)", "stroke-width":2}));
    });
  } else {
    const cs = candles(asset, mode), sr = sel ? SC[asset][sel.k].corr[sel.i] : null;
    cs.forEach((d, i) => {
      const [o,h,l,c] = d, up = c >= o, col = up ? "#2ec27e" : "#ef5350";
      const dim = sr && (i < sr.a || i > sr.b) ? .45 : 1;
      const g = el("g", {opacity:dim});
      g.appendChild(el("line", {x1:cx(i), y1:scale(h), x2:cx(i), y2:scale(l), stroke:col, "stroke-width":1.5}));
      const yt = scale(Math.max(o,c)), yb = scale(Math.min(o,c));
      g.appendChild(el("rect", {x:cx(i)-slot()*.3, y:yt, width:Math.max(slot()*.6,1),
        height:Math.max(yb-yt,1.5), fill:col, rx:1}));
      svg.appendChild(g);
    });
  }

  /* x axis — every 4th month keeps 52 labels readable */
  SC.months.forEach((m, i) => {
    if (i % 4) return;
    const tx = el("text", {x:cx(i), y:M.t+PH+20, "text-anchor":"middle", class:"axis"});
    tx.textContent = monthLabel(i);
    svg.appendChild(tx);
  });

  if (hover != null)
    svg.appendChild(el("line", {x1:cx(hover), y1:M.t, x2:cx(hover), y2:M.t+PH,
      stroke:"var(--ink-3)", "stroke-width":1, "stroke-dasharray":"3 3"}));

  svg.appendChild(el("rect", {x:M.l, y:M.t, width:PW, height:PH, fill:"transparent"}));
  svg.appendChild(el("rect", {x:M.l, y:M.t, width:PW, height:PH, fill:"none",
    stroke:"var(--rule)", "stroke-width":1}));
  readout();
}

function readout() {
  const i = hover != null ? hover : SC.months.length - 1;
  if (mode === "both") {
    $("readout").innerHTML = `<span class="mo">${monthLabel(i)}</span>` +
      ["base","bull"].map(k => `<span style="color:${CASE[k]}">${t("common."+k)} ` +
        `<b style="color:${CASE[k]}">${money(candles(asset,k)[i][3])}</b></span>`).join("");
    return;
  }
  const d = candles(asset, mode)[i], ch = (d[3]/d[0]-1)*100;
  $("readout").innerHTML = `<span class="mo">${monthLabel(i)}</span>` +
    `<span>O <b>${money(d[0])}</b></span><span>H <b>${money(d[1])}</b></span>` +
    `<span>L <b>${money(d[2])}</b></span><span>C <b>${money(d[3])}</b></span>` +
    `<span style="color:${ch>=0?"var(--up)":"var(--down)"};font-weight:500">` +
    `${ch>=0?"+":"−"}${S.num(Math.abs(ch),1)} %</span>`;
}

/* ---------------------------------------------------------------- panels */
const cell = (k,v,x,col) => `<div class="cell"><div class="k">${k}</div>` +
  `<div class="v"${col?` style="color:${col}"`:""}>${v}</div><div class="x">${x||""}</div></div>`;

function stats() {
  const yr = SC.months[SC.months.length-1].split("-")[0];
  const sp = liveSpot() || SC.anchor[asset];
  if (mode === "both") {
    $("strip").innerHTML = ["base","bull"].map(k => {
      const p = SC[asset][k], mx = Math.max.apply(null, p.corr.map(c=>1-c.lo/c.hi))*100;
      return cell(t("common."+k)+" · "+t("common.target"), money(p.target),
                  t("pa.stat.mult",{x:S.num(p.target/sp,1)+"×"}), CASE[k]) +
             cell(t("common."+k)+" · "+t("pa.stat.worst"), "−"+S.num(mx,0)+" %", "", "var(--down)");
    }).join("");
    return;
  }
  const p = SC[asset][mode];
  const drops = p.corr.map(c => 1-c.lo/c.hi);
  const mx = Math.max.apply(null, drops)*100;
  const avg = drops.reduce((a,b)=>a+b,0)/drops.length*100;
  const ath = SC[asset].ath;
  let athMonth = "—";
  if (ath) {
    const idx = candles(asset, mode).findIndex(d => d[3] > ath);
    athMonth = idx >= 0 ? monthLabel(idx) : t("pa.never");
  }
  $("strip").innerHTML =
    cell(t("pa.stat.target",{year:yr}), money(p.target),
         t("pa.stat.mult",{x:S.num(p.target/sp,1)+"×"}), COL[asset]) +
    cell(t("pa.stat.worst"), "−"+S.num(mx,0)+" %", "", "var(--down)") +
    cell(t("pa.stat.count"), p.corr.length, t("pa.stat.avg",{x:"−"+S.num(avg,0)+" %"})) +
    cell(t("pa.stat.ath"), athMonth, ath ? money(ath) : "");
}

function corrections() {
  const ks = mode === "both" ? ["base","bull"] : [mode];
  $("corr").innerHTML = ks.map(k => SC[asset][k].corr.map((c,i) => {
    const pc = (1-c.lo/c.hi)*100, on = sel && sel.k===k && sel.i===i;
    return `<button class="crow" data-k="${k}" data-i="${i}" aria-pressed="${on}">` +
      `<span class="when">${fr2(c, "label")}<em${mode==="both"?` style="color:${CASE[k]}"`:""}>` +
      `${mode==="both"?t("common."+k):monthLabel(c.a)+(c.b!==c.a?" – "+monthLabel(c.b):"")}</em></span>` +
      `<span class="span">${money(c.hi)} → ${money(c.lo)}</span>` +
      `<span class="drop">−${S.num(pc,1)} %</span>` +
      `<p class="why">${fr2(c, "note")}</p></button>`;
  }).join("")).join("");
  $("corr").querySelectorAll(".crow").forEach(b => b.onclick = () => {
    const k = b.dataset.k, i = +b.dataset.i;
    sel = (sel && sel.k===k && sel.i===i) ? null : {k,i};
    if (sel && mode !== "both" && mode !== k) setMode(k); else { corrections(); draw(); }
  });
}

function ladder() {
  $("lhead").innerHTML = `<th>${t("pa.ladder.level")}</th><th style="text-align:left">${t("pa.ladder.why")}</th>` +
    `<th style="text-align:left">${t("pa.ladder.when")}</th>`;
  const ks = mode === "both" ? ["base","bull"] : [mode];
  $("ladder").innerHTML = SC[asset].rails.map(r => {
    const [p, kind] = r, why = railWhy(r);
    const cleared = ks.map(k => {
      const idx = candles(asset,k).findIndex(d => d[3] > p);
      return idx >= 0 ? monthLabel(idx) : t("pa.never");
    });
    return `<tr><td style="${kind==="ath"?"color:#c99a3c":""}">${money(p)}` +
      `${kind==="ath"?(FR()?" — record":" — ATH"):""}</td>` +
      `<td style="text-align:left">${why}</td>` +
      `<td style="text-align:left" class="mono">${ks.map((k,i)=>
        mode==="both" ? `<span style="color:${CASE[k]}">${cleared[i]}</span>` : cleared[i]).join(" / ")}</td></tr>`;
  }).join("");
}

function driftBox() {
  const sp = liveSpot(), anchor = SC.anchor[asset];
  if (!sp) { $("drift").innerHTML = ""; $("anchornote").textContent = ""; return; }
  const drift = sp/anchor - 1;
  $("anchornote").textContent = t("pa.anchor.note", {
    date: S.date(SC.authored), asset: t("common."+asset),
    anchor: money(anchor), now: money(sp), drift: S.signed(drift,1)});
  $("drift").innerHTML = Math.abs(drift)*100 > SC.drift_warn_pct
    ? `<div class="banner">${t("pa.anchor.warn",{pct:SC.drift_warn_pct+" %"})}</div>` : "";
}

/* ---------------------------------------------------------------- wiring */
function setMode(m) {
  mode = m;
  $("caseseg").querySelectorAll("button").forEach(b =>
    b.setAttribute("aria-pressed", String(b.dataset.k === m)));
  if (sel && m !== "both" && sel.k !== m) sel = null;
  render();
}
function setAsset(a) {
  asset = a; sel = null; hover = null;
  $("assetseg").querySelectorAll("button").forEach(b =>
    b.setAttribute("aria-pressed", String(b.dataset.a === a)));
  $("caseseg").classList.toggle("btc", a === "btc");
  render();
}
function render() {
  if (!SC) return;
  $("lede").textContent = t("pa.lede", {year: SC.months[SC.months.length-1].split("-")[0]});
  $("caseseg").querySelectorAll("button[data-k]").forEach(b => {
    if (b.dataset.k !== "both") b.textContent = t("common." + b.dataset.k);
  });
  driftBox(); stats(); corrections(); ladder(); draw();
}

$("assetseg").onclick = e => { const b = e.target.closest("button"); if (b) setAsset(b.dataset.a); };
$("caseseg").onclick  = e => { const b = e.target.closest("button"); if (b) setMode(b.dataset.k); };
$("tRails").onchange = e => { showRails = e.target.checked; draw(); };
$("tLog").onchange   = e => { useLog = e.target.checked; draw(); };
$("tSpot").onchange  = e => { showSpot = e.target.checked; draw(); };

const svg = $("chart");
function locate(ev) {
  const box = svg.getBoundingClientRect();
  const x = (ev.clientX - box.left) / box.width * W;
  const i = Math.floor((x - M.l) / slot());
  return (i >= 0 && i < SC.months.length) ? i : null;
}
svg.addEventListener("pointermove", e => { const i = locate(e); if (i !== hover) { hover = i; draw(); } });
svg.addEventListener("pointerleave", () => { hover = null; draw(); });
Shell.onLang(render);

Promise.all([S.loadScenarios(), S.loadData()])
  .then(([sc, d]) => { SC = sc; D = d; setAsset("eth"); })
  .catch(e => Shell.fail($("strip"), e));
})();
