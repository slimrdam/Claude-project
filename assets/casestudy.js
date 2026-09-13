/* =============================================================================
   Part six: one treasury company taken apart, against the ether it holds.
   Reads data.json, which the nightly workflow rebuilds. Two inputs are
   hand-maintained in config.json because no free API publishes them — the
   ether held and the share count — and the page shows a banner when they go
   stale.
   ============================================================================= */
Shell.mount("case");
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

function drawCompany() {
  const m = D.market || {}, sl = m.sharplink;
  if (!sl) return;
  /* SharpLink stamps its dashboard with an English date string; re-read it so the
     French page does not print "September 8, 2026". */
  const d = sl.as_of ? new Date(sl.as_of) : null;
  const stamp = d && !isNaN(d) ? S.date(d.toISOString().slice(0, 10)) : sl.as_of;
  const src = t("sb.src.company") + (stamp ? " · " + stamp : "");
  $("nav").insertAdjacentHTML("beforeend",
    cell(t("sb.f.navps"), S.usd(sl.nav_per_share, 2), src, C.eth) +
    cell(t("sb.f.conc"), S.num(sl.eth_concentration, 2) + " ETH", src) +
    cell(t("sb.f.fdmnav"), S.num(sl.fd_mnav, 2), src) +
    cell(t("sb.f.rewards"), S.num(sl.staking_rewards, 0) + " ETH", src, C.up));

  /* the published mNAV and the ETH-only series will not match exactly; say why */
  const calc = D.stats.mnav_now;
  if (sl.mnav != null && calc != null) {
    $("navnote").insertAdjacentHTML("beforeend",
      `<br><span class="dim">${t("sb.mnav.gap", {pub: S.num(sl.mnav, 2), calc: S.num(calc, 3)})}</span>`);
  }
}

function drawShort() {
  const sh = (D.market || {}).short, cf = D.config;
  if (!sh) { $("short").innerHTML = ""; $("shortchart").innerHTML = ""; return; }
  const own = (D.notes && D.notes.ownership) || {};
  const pct = cf.shares ? sh.interest / cf.shares : null;
  /* The share that matters is of the float, not of every share issued: the shares
     held strategically cannot be borrowed. A figure entered from a published
     screener wins; without one, the FINRA settlement is divided by the float, so
     the percentage still moves between readings. */
  const fl = own.short_float_pct != null ? own.short_float_pct
           : own.float_shares ? sh.interest / own.float_shares : null;
  const shortN = own.short_shares != null ? own.short_shares : sh.interest;
  const dtc = own.days_to_cover != null ? own.days_to_cover : sh.days_to_cover;
  $("short").innerHTML =
    cell(t("sb.short.n"), S.num(shortN / 1e6, 1) + "M",
         t("sb.short.settle", {date: S.date(own.reported_as_of || sh.settlement)}), C.down) +
    cell(t("sb.short.float"), fl == null ? "—" : S.pct(fl, 0),
         t("sb.short.float.x", {n: S.num(own.float_shares / 1e6, 0) + "M"}), C.down) +
    cell(t("sb.short.pct"), pct == null ? "—" : S.pct(pct, 1),
         t("sb.short.pct.x", {n: S.num(cf.shares / 1e6, 0) + "M"})) +
    cell(t("sb.short.days"), S.num(dtc, 1), t("sb.short.days.x"));

  /* the two readings of a large short position, side by side */
  $("sq").innerHTML = [["hedge", C.eth], ["squeeze", C.up]].map(([k, col]) =>
    `<div class="case" style="border-color:${col}44">` +
    `<div class="lbl" style="color:${col}">${t("cs.sq." + k + ".t")}</div>` +
    `<p class="note" style="margin:10px 0 0">${t("cs.sq." + k + ".d")}</p></div>`).join("");

  $("shortread").textContent = fl == null ? "" : t("sb.short.read",
    {float: S.pct(fl, 0), inst: S.pct(own.institutional_pct || 0, 0),
     days: S.num(dtc, 1)});

  const h = sh.history || [];
  if (h.length < 3) { $("shortchart").innerHTML = ""; return; }
  const f = frame(920, 200, {l: 56, r: 14, t: 14, b: 34});
  const vals = h.map(r => r.interest);
  const lo = Math.min.apply(null, vals) * 0.9, hi = Math.max.apply(null, vals) * 1.05;
  const X = i => f.L + i / (h.length - 1) * f.iw;
  const Y = v => f.T + f.ih - (v - lo) / (hi - lo) * f.ih;
  let g = axisY(f, lo, hi, v => S.num(v / 1e6, 0) + "M", 3);
  const bw = Math.max(f.iw / h.length * 0.55, 2);
  h.forEach((r, i) => {
    const y = Y(r.interest);
    g += `<rect x="${(X(i) - bw / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" ` +
         `height="${Math.max(f.T + f.ih - y, 1).toFixed(1)}" fill="${C.down}" opacity=".55" rx="1">` +
         `<title>${S.date(r.date)}: ${S.num(r.interest, 0)}</title></rect>`;
    if (i % Math.ceil(h.length / 6) === 0)
      g += `<text class="axis" x="${X(i).toFixed(1)}" y="${(f.h - 10).toFixed(1)}" ` +
           `text-anchor="middle">${S.date(r.date)}</text>`;
  });
  $("shortchart").innerHTML = g;
}

/* The daily table from the original dashboard. Newest first, capped so the page
   stays usable on a phone — the full history is in data.json for anyone who wants it. */
function drawTable() {
  $("dhead").innerHTML = [t("sb.t.date"), t("sb.t.sbet"), t("sb.t.eth"),
                          t("sb.t.rel"), t("sb.t.vol"), t("sb.t.mnav")]
    .map(h => `<th>${h}</th>`).join("");
  const rows = D.series.slice().reverse();
  $("drows").innerHTML = rows.map(r => {
    const col = r.rel == null ? "" : (r.rel > 0 ? C.up : C.down);
    return `<tr><td>${S.date(r.d)}</td>` +
      `<td>${S.usd(r.sbet, 2)}</td>` +
      `<td>${S.usd(r.eth, 0)}</td>` +
      `<td${col ? ` style="color:${col}"` : ""}>${r.rel == null ? "—" : S.signed(r.rel / 100, 2)}</td>` +
      `<td>${S.num(r.vol / 1e6, 1)}M</td>` +
      `<td>${r.mnav == null ? "—" : S.num(r.mnav, 3)}</td></tr>`;
  }).join("");
}

/* --- the company's own published figures, STRC and short interest --------- */
function drawFigs() {
  const st = D.stats, cf = D.config, m = D.market || {}, sl = m.sharplink;
  const own = (D.notes && D.notes.ownership) || {};
  const shares = cf.shares;          // compute() emits 'shares', not 'shares_outstanding'
  const ethPer = cf.eth_held / shares;
  const mnav = st.mnav_now, disc = mnav != null && mnav < 1;
  const fl = own.short_float_pct != null ? own.short_float_pct
           : (own.float_shares && m.short) ? m.short.interest / own.float_shares : null;

  $("stale").innerHTML = cf.stale
    ? `<div class="banner">${t("sb.stale",{days:cf.stale_days})}</div>` : "";

  $("nav").innerHTML =
    cell(t("sb.price.per"), S.usd(st.sbet_now, 2), "SBET", C.sbet) +
    cell(t("sb.eth.per"), S.num(ethPer, 5) + " ETH",
         S.num(cf.eth_held, 0) + " ETH / " + S.num(shares / 1e6, 1) + "M") +
    cell(t("sb.f.mnav"), S.num(mnav, 3), t("sb.mnav.d"), disc ? C.up : C.sbet) +
    cell(t("sb.short.float"), fl == null ? "—" : S.pct(fl, 0), t("sb.short.float.s"), C.down);
  $("navnote").textContent = t(disc ? "sb.nav.note.disc" : "sb.nav.note.prem",
    {mnav: S.num(mnav, 3), pct: S.pct(mnav, 0), gap: S.pct(Math.abs(1 - mnav), 0)});
  $("mechnow").textContent = t(disc ? "sb.mech.now.disc" : "sb.mech.now.prem",
    {mnav: S.num(mnav, 3)});

  /* company-specific claims stay editorial and carry their date */
  const pr = D.notes && D.notes.treasury_profile;
  $("profile").innerHTML = pr
    ? `<div class="asof" style="margin-bottom:10px">${pr.company} · ${t("common.editorial")} · ` +
      `${t("common.asof")} ${S.date(pr.as_of)}</div>` +
      `<p class="note" style="margin:0 0 9px"><b>${t("sb.risk.debt.t")}.</b> ${FR()?pr.debt_fr:pr.debt}</p>` +
      `<p class="note" style="margin:0 0 9px"><b>${t("sb.risk.yield.t")}.</b> ${FR()?pr.opex_fr:pr.opex}</p>` +
      `<p class="note dim" style="margin:0">${FR()?pr.caveat_fr:pr.caveat}</p>`
    : "";

  $("figs").innerHTML =
    cell(t("sb.f.mnav"), S.num(st.mnav_now,3), t("sb.mnav.d"),
         st.mnav_now < 1 ? C.up : C.sbet) +
    cell(t("sb.f.ratio"), S.num(st.ri_now,1), t("sb.ratio.d"), C.sbet) +
    cell(t("sb.f.green"), S.pct(st.green_pct/100,0), t("sb.green.d",{n:st.sessions})) +
    cell(t("sb.f.eth"), S.num(cf.eth_held,0), t("sb.eth.d",{date:S.date(cf.last_verified)}), C.eth);
  $("h-months").textContent = t("sb.s.months");
  $("l-months").textContent = t("sb.s.months.lede");
}

/* Who owns the shares. 13F positions move once a quarter, so they are editorial
   and dated; the bars are drawn to the largest holder so the shape is readable
   rather than ten near-identical stubs. */
function drawHolders() {
  const own = (D.notes && D.notes.ownership) || {};
  const hs = own.holders || [];
  if (!hs.length) { $("holders").innerHTML = ""; $("holdersnote").textContent = ""; return; }
  const KIND = {passive: C.eth, quant: C.sbet, strategic: "var(--ink-3)"};
  const max = Math.max.apply(null, hs.map(h => h.pct));
  $("holders").innerHTML = hs.map(h =>
    `<div class="br"><span class="n">${h.name}</span>` +
    `<span class="t"><i style="width:${(h.pct / max * 100).toFixed(1)}%;` +
      `background:${KIND[h.kind] || "var(--ink-3)"}"></i></span>` +
    `<span class="v">${S.pct(h.pct, 1)}</span></div>`).join("");
  $("holderskey").innerHTML = ["passive","quant","strategic"].map(k =>
    `<span class="lg"><span class="dash" style="background:${KIND[k]}"></span>` +
    `${t("cs.own." + k)}</span>`).join("");
  $("holdersnote").textContent = t("cs.own.note",
    {top: S.pct(own.top_n_pct || 0, 0), n: hs.length,
     inst: S.pct(own.institutional_pct || 0, 0)});
  $("holderssrc").textContent =
    t("common.editorial") + " · " + ((FR() ? own.source_fr : own.source) || "") +
    (own.as_of ? " · " + t("common.asof") + " " + S.date(own.as_of) : "");
}

function render() {
  if (!D) return;
  drawFigs(); drawCompany(); drawHolders(); drawShort();
  drawMonths(); drawMain(); drawMnav(); drawHold(); drawTable();
}
Shell.onLang(render);
S.loadData().then(d => { D = d; render(); }).catch(e => Shell.fail($("figs"), e));
})();
