/* =============================================================================
   Part five: SharpLink against the ether it holds.
   Reads data.json, which the nightly workflow rebuilds. Two inputs are
   hand-maintained in config.json because no free API publishes them — the ether
   held and the share count — and the page shows a banner when they go stale.
   ============================================================================= */
Shell.mount("sbet");
(function () {
"use strict";
const { t } = I18N, S = Shell, $ = id => document.getElementById(id);
const FR = () => I18N.lang === "fr";
const C = { sbet:"#f2a33c", eth:"#8b9bff", up:"#2ec27e", down:"#ef5350", vol:"#26304a" };
let D = null;

/* ---------------------------------------------------------------- helpers */
function frame(w, h, pad) {
  const L = pad.l, R = pad.r, T = pad.t, B = pad.b;
  return { L, R, T, B, iw: w - L - R, ih: h - T - B, w, h };
}
function axisY(f, lo, hi, fmt, n) {
  let g = "";
  for (let i = 0; i <= (n||4); i++) {
    const v = lo + (hi-lo)*i/(n||4), y = f.T + f.ih - (v-lo)/(hi-lo)*f.ih;
    g += `<line class="gl" x1="${f.L}" x2="${f.w-f.R}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"/>` +
         `<text class="axis" x="${f.L-8}" y="${(y+4).toFixed(1)}" text-anchor="end">${fmt(v)}</text>`;
  }
  return g;
}
function axisX(f, dates, every) {
  let g = "";
  for (let i = 0; i < dates.length; i += every) {
    const x = f.L + i/(dates.length-1)*f.iw;
    g += `<text class="axis" x="${x.toFixed(1)}" y="${(f.h-10).toFixed(1)}" text-anchor="middle">` +
         `${S.date(dates[i])}</text>`;
  }
  return g;
}
const line = (pts) => pts.map((p,i)=>(i?"L":"M")+p[0].toFixed(1)+" "+p[1].toFixed(1)).join(" ");

/* ---------------------------------------------------------------- charts */
function drawRatio() {
  const s = D.series, f = frame(920, 300, {l:52, r:14, t:14, b:34});
  const vals = s.map(r=>r.ri);
  const lo = Math.min.apply(null, vals)*0.95, hi = Math.max.apply(null, vals)*1.05;
  const X = i => f.L + i/(s.length-1)*f.iw;
  const Y = v => f.T + f.ih - (v-lo)/(hi-lo)*f.ih;
  const pts = s.map((r,i)=>[X(i), Y(r.ri)]);
  let g = axisY(f, lo, hi, v => S.num(v,0)) + axisX(f, s.map(r=>r.d), Math.ceil(s.length/6));
  /* 100 = holding the equity has exactly matched holding the ether */
  g += `<line x1="${f.L}" x2="${f.w-f.R}" y1="${Y(100).toFixed(1)}" y2="${Y(100).toFixed(1)}" ` +
       `stroke="var(--ink-3)" stroke-width="1" stroke-dasharray="5 4"/>` +
       `<text class="axis" x="${f.w-f.R-4}" y="${(Y(100)-6).toFixed(1)}" text-anchor="end">100</text>`;
  g += `<path d="${line(pts)} L ${X(s.length-1).toFixed(1)} ${(f.T+f.ih).toFixed(1)} L ${f.L} ${(f.T+f.ih).toFixed(1)} Z" ` +
       `fill="${C.sbet}" opacity=".08"/>`;
  g += `<path d="${line(pts)}" fill="none" stroke="${C.sbet}" stroke-width="2"/>`;
  g += `<circle cx="${X(s.length-1).toFixed(1)}" cy="${Y(s[s.length-1].ri).toFixed(1)}" r="4" fill="${C.sbet}"/>`;
  $("ratio").innerHTML = g;

  const st = D.stats;
  $("ratioNote").textContent = FR()
    ? `Base 100 au 4 août 2025. À ${S.num(st.ri_now,1)}, un euro placé en SBET vaut ${
        st.ri_now>=100?"plus":"moins"} qu'un euro placé en ether sur la période — creux à ${
        S.num(st.low_ri,1)} le ${S.date(st.low_d)}.`
    : `Indexed to 100 on 4 August 2025. At ${S.num(st.ri_now,1)}, a euro in SBET is worth ${
        st.ri_now>=100?"more":"less"} than a euro in ether over the period — the low was ${
        S.num(st.low_ri,1)} on ${S.date(st.low_d)}.`;
}

function drawMonths() {
  const m = D.months, f = frame(920, 230, {l:52, r:14, t:14, b:34});
  const vals = m.map(x=>x.r);
  const hi = Math.max.apply(null, vals.concat([5]))*1.15;
  const lo = Math.min.apply(null, vals.concat([-5]))*1.15;
  const Y = v => f.T + f.ih - (v-lo)/(hi-lo)*f.ih;
  const bw = f.iw/m.length*0.66;
  let g = axisY(f, lo, hi, v => S.signed(v/100,0));
  g += `<line x1="${f.L}" x2="${f.w-f.R}" y1="${Y(0).toFixed(1)}" y2="${Y(0).toFixed(1)}" stroke="var(--rule)"/>`;
  m.forEach((x,i)=>{
    const cx = f.L + (i+0.5)/m.length*f.iw;
    const y0 = Y(0), y1 = Y(x.r);
    g += `<rect x="${(cx-bw/2).toFixed(1)}" y="${Math.min(y0,y1).toFixed(1)}" width="${bw.toFixed(1)}" ` +
         `height="${Math.max(Math.abs(y1-y0),1).toFixed(1)}" fill="${x.r>=0?C.up:C.down}" rx="1"><title>${
         x.m}: ${S.signed(x.r/100,1)}</title></rect>`;
    if (i % Math.ceil(m.length/8) === 0)
      g += `<text class="axis" x="${cx.toFixed(1)}" y="${(f.h-10).toFixed(1)}" text-anchor="middle">${x.m}</text>`;
  });
  $("mbars").innerHTML = g;

  $("runs").innerHTML = (D.runs||[]).map(r=>
    `<div class="run"><div class="k">${r.a} → ${r.b}</div>` +
    `<div class="v" style="color:${r.r>=0?C.up:C.down}">${S.signed(r.r/100,1)}</div>` +
    `<div class="n">${FR()
      ? `${r.n} mois consécutifs devant l'ether${r.live?" — en cours":
          (r.after!=null?`, puis ${S.signed(r.after/100,1)} le mois suivant`:"")}`
      : `${r.n} consecutive months ahead of ether${r.live?" — still running":
          (r.after!=null?`, then ${S.signed(r.after/100,1)} the month after`:"")}`}</div></div>`).join("");
}

function drawMain() {
  const s = D.series, f = frame(920, 420, {l:56, r:52, t:14, b:34});
  const px = s.map(r=>r.sbet), ep = s.map(r=>r.eth), vol = s.map(r=>r.vol);
  const plo = Math.min.apply(null, px)*0.9, phi = Math.max.apply(null, px)*1.08;
  const elo = Math.min.apply(null, ep)*0.9, ehi = Math.max.apply(null, ep)*1.08;
  const vhi = Math.max.apply(null, vol);
  const X = i => f.L + i/(s.length-1)*f.iw;
  const Yp = v => f.T + f.ih - (v-plo)/(phi-plo)*f.ih;
  const Ye = v => f.T + f.ih - (v-elo)/(ehi-elo)*f.ih;
  let g = axisY(f, plo, phi, v => S.usd(v, v<100?1:0)) + axisX(f, s.map(r=>r.d), Math.ceil(s.length/6));
  /* volume underneath, scaled to the bottom quarter */
  const bw = Math.max(f.iw/s.length*0.7, 1);
  s.forEach((r,i)=>{
    const h = r.vol/vhi*(f.ih*0.22);
    g += `<rect x="${(X(i)-bw/2).toFixed(1)}" y="${(f.T+f.ih-h).toFixed(1)}" width="${bw.toFixed(1)}" ` +
         `height="${h.toFixed(1)}" fill="${C.vol}"/>`;
  });
  /* daily verdict ticks */
  s.forEach((r,i)=>{
    if (r.rel == null) return;
    g += `<rect x="${(X(i)-bw/2).toFixed(1)}" y="${(f.T+f.ih+3).toFixed(1)}" width="${bw.toFixed(1)}" ` +
         `height="3" fill="${r.rel>0?C.up:C.down}" opacity=".8"/>`;
  });
  g += `<path d="${line(s.map((r,i)=>[X(i),Ye(r.eth)]))}" fill="none" stroke="${C.eth}" stroke-width="1.6" opacity=".85"/>`;
  g += `<path d="${line(s.map((r,i)=>[X(i),Yp(r.sbet)]))}" fill="none" stroke="${C.sbet}" stroke-width="2"/>`;
  for (let i = 0; i <= 4; i++) {
    const v = elo + (ehi-elo)*i/4, y = Ye(v);
    g += `<text class="axis" x="${f.w-f.R+8}" y="${(y+4).toFixed(1)}" fill="${C.eth}">${S.usd(v,0)}</text>`;
  }
  g += `<rect id="hit" x="${f.L}" y="${f.T}" width="${f.iw}" height="${f.ih}" fill="transparent"/>`;
  $("main").innerHTML = g;

  $("mainLegend").innerHTML =
    `<span class="lg"><span class="dash" style="background:${C.sbet}"></span>SBET</span>` +
    `<span class="lg"><span class="dash" style="background:${C.eth}"></span>${t("common.eth")}</span>` +
    `<span class="lg"><span class="sq" style="background:${C.vol}"></span>${t("sb.lg.vol")}</span>` +
    `<span class="lg"><span class="sq" style="background:${C.up}"></span>${t("sb.lg.beat")}</span>` +
    `<span class="lg"><span class="sq" style="background:${C.down}"></span>${t("sb.lg.lag")}</span>`;
  $("tip").textContent = t("sb.tip");

  const svg = $("main");
  svg.onpointermove = ev => {
    const box = svg.getBoundingClientRect();
    const i = Math.round(((ev.clientX-box.left)/box.width*920 - f.L)/f.iw*(s.length-1));
    if (i < 0 || i >= s.length) return;
    const r = s[i];
    $("tip").innerHTML = `<b>${S.date(r.d)}</b> · SBET <b>${S.usd(r.sbet,2)}</b> · ` +
      `${t("common.eth")} <b>${S.usd(r.eth,0)}</b>` +
      (r.rel!=null ? ` · <b style="color:${r.rel>0?C.up:C.down}">${S.signed(r.rel/100,2)}</b> ${
        FR()?"vs ether":"vs ether"}` : "") +
      (r.mnav!=null ? ` · mNAV <b>${S.num(r.mnav,3)}</b>` : "");
  };
  svg.onpointerleave = () => { $("tip").textContent = t("sb.tip"); };
}

function drawMnav() {
  const s = D.series.filter(r => r.mnav != null);
  if (!s.length) { $("mnav").innerHTML = ""; return; }
  const f = frame(920, 220, {l:52, r:14, t:14, b:34});
  const vals = s.map(r=>r.mnav);
  const lo = Math.min.apply(null, vals.concat([1]))*0.96, hi = Math.max.apply(null, vals.concat([1]))*1.04;
  const X = i => f.L + i/(s.length-1)*f.iw;
  const Y = v => f.T + f.ih - (v-lo)/(hi-lo)*f.ih;
  let g = axisY(f, lo, hi, v => S.num(v,2), 3) + axisX(f, s.map(r=>r.d), Math.ceil(s.length/5));
  g += `<rect x="${f.L}" y="${Y(1).toFixed(1)}" width="${f.iw}" ` +
       `height="${Math.max(f.T+f.ih-Y(1),0).toFixed(1)}" fill="${C.up}" opacity=".06"/>`;
  g += `<line x1="${f.L}" x2="${f.w-f.R}" y1="${Y(1).toFixed(1)}" y2="${Y(1).toFixed(1)}" ` +
       `stroke="var(--ink-2)" stroke-width="1" stroke-dasharray="5 4"/>` +
       `<text class="axis" x="${f.w-f.R-4}" y="${(Y(1)-6).toFixed(1)}" text-anchor="end">1.00</text>`;
  g += `<path d="${line(s.map((r,i)=>[X(i),Y(r.mnav)]))}" fill="none" stroke="${C.sbet}" stroke-width="2"/>`;
  $("mnav").innerHTML = g;
}

function drawHold() {
  const h = D.holdings || [];
  if (!h.length) return;
  const f = frame(920, 210, {l:66, r:14, t:14, b:34});
  const vals = h.map(r=>r[1]);
  const lo = Math.min.apply(null, vals)*0.94, hi = Math.max.apply(null, vals)*1.04;
  const t0 = new Date(h[0][0]).getTime(), t1 = new Date(h[h.length-1][0]).getTime();
  const X = d => f.L + (new Date(d).getTime()-t0)/Math.max(t1-t0,1)*f.iw;
  const Y = v => f.T + f.ih - (v-lo)/(hi-lo)*f.ih;
  let g = axisY(f, lo, hi, v => S.num(v/1000,0)+"k", 3);
  const pts = h.map(r=>[X(r[0]), Y(r[1])]);
  g += `<path d="${line(pts)}" fill="none" stroke="${C.eth}" stroke-width="2" stroke-linejoin="round"/>`;
  h.forEach((r,i)=>{
    g += `<circle cx="${pts[i][0].toFixed(1)}" cy="${pts[i][1].toFixed(1)}" r="3.5" fill="${C.eth}">` +
         `<title>${S.date(r[0])}: ${S.num(r[1],0)} ETH</title></circle>`;
    if (i===0 || i===h.length-1)
      g += `<text class="axis" x="${pts[i][0].toFixed(1)}" y="${(f.h-10).toFixed(1)}" text-anchor="${
        i===0?"start":"end"}">${S.date(r[0])}</text>`;
  });
  $("hold").innerHTML = g;
  const n = D.notes && D.notes.treasury_note;
  if (n) $("holdNote").innerHTML = `<span class="asof">${t("common.editorial")} · ${
    t("common.asof")} ${S.date(n.as_of)}</span> — ${FR() ? (n.text_fr||n.text) : n.text}`;
}

/* ---------------------------------------------------------------- render */
const cell = (k,v,x,col) => `<div class="cell"><div class="k">${k}</div>` +
  `<div class="v"${col?` style="color:${col}"`:""}>${v}</div><div class="x">${x||""}</div></div>`;

/* --- the explainer sections ------------------------------------------- */
function card(t1, d1, col) {
  return `<div class="panel pad-sm" style="border-left:3px solid ${col}">` +
    `<div style="font-family:var(--display);font-size:15px;font-weight:600;margin-bottom:7px">${t1}</div>` +
    `<p class="note" style="margin:0">${d1}</p></div>`;
}

function drawExplainer() {
  const st = D.stats, cf = D.config, A = D.assumptions;
  const mnav = st.mnav_now;
  /* NAV per share is the whole subject of this page, so derive it rather than
     restating mNAV: ether held x price, over the share count. */
  const shares = cf.shares;          // compute() emits 'shares', not 'shares_outstanding'
  const navPer = cf.eth_held * st.eth_now / shares;
  const ethPer = cf.eth_held / shares;
  const disc = mnav != null && mnav < 1;

  $("nav").innerHTML =
    cell(t("sb.price.per"), S.usd(st.sbet_now, 2), "SBET", C.sbet) +
    cell(t("sb.nav.per"), S.usd(navPer, 2), t("common.live"), C.eth) +
    cell(t("sb.eth.per"), S.num(ethPer, 5) + " ETH",
         S.num(cf.eth_held, 0) + " ETH / " + S.num(shares / 1e6, 1) + "M") +
    cell(t("sb.f.mnav"), S.num(mnav, 3), t("sb.mnav.d"), disc ? C.up : C.sbet);
  $("navnote").textContent = t(disc ? "sb.nav.note.disc" : "sb.nav.note.prem",
    {mnav: S.num(mnav, 3), pct: S.pct(mnav, 0), gap: S.pct(Math.abs(1 - mnav), 0)});

  $("raise").innerHTML = ["atm","debt","pipe"].map((k, i) =>
    card(t("sb.raise." + k + ".t"), t("sb.raise." + k + ".d"),
         [C.eth, C.down, "var(--ink-3)"][i])).join("");

  $("mech").innerHTML = [["above", C.up], ["below", C.down]].map(([k, col]) =>
    `<div class="case" style="border-color:${col}44">` +
    `<div class="lbl" style="color:${col}">${t("sb.mech." + k + ".t")}</div>` +
    `<p class="note" style="margin:10px 0 0">${t("sb.mech." + k + ".d")}</p></div>`).join("");
  $("mechnow").textContent = t(disc ? "sb.mech.now.disc" : "sb.mech.now.prem",
    {mnav: S.num(mnav, 3)});

  const yld = (A && A.allocation_example && A.allocation_example.staking_yield) || 0.025;
  $("risk").innerHTML =
    card(t("sb.risk.debt.t"), t("sb.risk.debt.d"), C.up) +
    card(t("sb.risk.yield.t"), t("sb.risk.yield.d", {yield: S.pct(yld, 1)}), C.eth) +
    card(t("sb.risk.btc.t"), t("sb.risk.btc.d"), "#f0a340");

  /* company-specific claims stay editorial and carry their date */
  const pr = D.notes && D.notes.treasury_profile;
  $("profile").innerHTML = pr
    ? `<div class="asof" style="margin-bottom:10px">${pr.company} · ${t("common.editorial")} · ` +
      `${t("common.asof")} ${S.date(pr.as_of)}</div>` +
      `<p class="note" style="margin:0 0 9px"><b>${t("sb.risk.debt.t")}.</b> ${FR()?pr.debt_fr:pr.debt}</p>` +
      `<p class="note" style="margin:0 0 9px"><b>${t("sb.risk.yield.t")}.</b> ${FR()?pr.opex_fr:pr.opex}</p>` +
      `<p class="note dim" style="margin:0">${FR()?pr.caveat_fr:pr.caveat}</p>`
    : "";
}

function render() {
  if (!D) return;
  const st = D.stats, cf = D.config;
  $("stale").innerHTML = cf.stale
    ? `<div class="banner">${t("sb.stale",{days:cf.stale_days})}</div>` : "";
  $("figs").innerHTML =
    cell(t("sb.f.mnav"), S.num(st.mnav_now,3), t("sb.mnav.d"),
         st.mnav_now < 1 ? C.up : C.sbet) +
    cell(t("sb.f.ratio"), S.num(st.ri_now,1), t("sb.ratio.d"), C.sbet) +
    cell(t("sb.f.green"), S.pct(st.green_pct/100,0), t("sb.green.d",{n:st.sessions})) +
    cell(t("sb.f.eth"), S.num(cf.eth_held,0), t("sb.eth.d",{date:S.date(cf.last_verified)}), C.eth);
  $("h-months").textContent = FR() ? "Performance relative mensuelle" : "Monthly relative performance";
  $("l-months").textContent = FR()
    ? "Le rendement mensuel de SBET moins celui de l'ether."
    : "SBET's monthly return minus ether's.";
  drawExplainer();
  drawRatio(); drawMonths(); drawMain(); drawMnav(); drawHold();
}
Shell.onLang(render);
S.loadData().then(d => { D = d; render(); }).catch(e => Shell.fail($("figs"), e));
})();
