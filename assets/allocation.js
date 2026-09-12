/* =============================================================================
   Part two: how large a crypto position has to be to matter.
   The portfolio is a hypothetical worked example. Every input is editable and
   edits live in localStorage only — nothing is sent anywhere or committed.
   ============================================================================= */
Shell.mount("allocation");
(function () {
"use strict";
const { t } = I18N, S = Shell, $ = id => document.getElementById(id);
const FR = () => I18N.lang === "fr";
const STORE = "thesis.alloc";

const COLORS = { trad:"#4d7d76", digi:"#6aa79a", eth:"#8b9bff", btc:"#f0a340" };
const LABELS = { trad:"al.pos.trad", digi:"al.pos.digi", eth:"al.pos.eth", btc:"al.pos.btc" };

let D = null, A = null, P = null, scenario = "base", edited = false;

/* ---------------------------------------------------------------- state */
function defaults() {
  const ex = A.allocation_example;
  return {
    positions: ex.positions.map(p => Object.assign({}, p)),
    monthly: ex.monthly,
    years: 15,
    gEth: null, gBtc: null,      // null = derive from the thesis targets
    ethSpot: null, btcSpot: null  // null = live spot converted to euro
  };
}
function load() {
  try {
    const raw = localStorage.getItem(STORE);
    if (raw) { edited = true; return Object.assign(defaults(), JSON.parse(raw)); }
  } catch (e) { /* private mode */ }
  return defaults();
}
function save() {
  edited = true;
  try { localStorage.setItem(STORE, JSON.stringify(P)); } catch (e) {}
  $("savedmsg").textContent = t("al.saved");
}

/* ---------------------------------------------------------------- maths */
const total = () => P.positions.reduce((s, p) => s + p.amount, 0);

function effRate(p, gEth, gBtc) {
  if (p.kind === "eth") return (1 + p.rate) * (1 + gEth) - 1;
  if (p.kind === "btc") return gBtc;
  return p.rate;
}
/* Monthly compounding; contributions land at the end of each month. */
function simulate(years, gEth, gBtc) {
  const N = years * 12;
  const bal = P.positions.map(p => p.amount);
  const mr = P.positions.map(p => Math.pow(1 + effRate(p, gEth, gBtc), 1/12) - 1);
  const pts = [total()];
  for (let m = 1; m <= N; m++) {
    for (let i = 0; i < bal.length; i++) bal[i] = bal[i] * (1 + mr[i]) + P.positions[i].monthly;
    if (m % 12 === 0) pts.push(bal.reduce((s, v) => s + v, 0));
  }
  return { pts, finals: bal, total: bal.reduce((s, v) => s + v, 0) };
}
/* Money-weighted return: the monthly top-ups are invested for less time than
   the opening capital, so a simple CAGR would overstate it. */
function irr(years, finalValue) {
  const N = years * 12, T = total(), mon = monthlyIn();
  const npv = r => {
    let v = -T;
    for (let m = 1; m <= N; m++) v -= mon / Math.pow(1 + r, m);
    return v + finalValue / Math.pow(1 + r, N);
  };
  let lo = -0.9, hi = 0.6;
  for (let i = 0; i < 90; i++) { const mid = (lo + hi) / 2; if (npv(mid) > 0) lo = mid; else hi = mid; }
  return Math.pow(1 + (lo + hi) / 2, 12) - 1;
}
const monthlyIn = () => P.positions.reduce((s, p) => s + p.monthly, 0);

/* Live spot, converted to euro with the ECB reference rate. */
function spot(which) {
  if (P[which + "Spot"] != null) return P[which + "Spot"];
  const fx = (D.market && D.market.eurusd && D.market.eurusd.rate) || 1.1;
  const usdv = which === "eth" ? D.stats.eth_now : (D.market && D.market.btc_usd);
  return usdv ? Math.round(usdv / fx) : (which === "eth" ? 2200 : 70000);
}
/* Annual growth implied by the thesis target over the remaining horizon. */
function targetRate(which, years) {
  const fx = (D.market && D.market.eurusd && D.market.eurusd.rate) || 1.1;
  const tgt = A.cases.bull[which + "_usd"] / fx;
  return Math.pow(tgt / spot(which), 1 / years) - 1;
}
const gEth = () => P.gEth != null ? P.gEth : targetRate("eth", P.years);
const gBtc = () => P.gBtc != null ? P.gBtc : targetRate("btc", P.years);

/* ---------------------------------------------------------------- chart */
function drawChart(base, sim, paid, years) {
  const W = 860, H = 400, L = 92, R = 16, T = 16, B = 40;
  const iw = W - L - R, ih = H - T - B;
  const all = base.concat(sim, paid);
  const hi = Math.max.apply(null, all) * 1.05, lo = Math.min.apply(null, all) * 0.93;
  const x = i => L + (i / years) * iw;
  const y = v => T + ih - (v - lo) / (hi - lo) * ih;
  const path = a => a.map((v, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + y(v).toFixed(1)).join(" ");

  let g = "";
  for (let i = 0; i <= 4; i++) {
    const v = lo + (hi - lo) * i / 4, yy = y(v);
    g += `<line class="gl" x1="${L}" x2="${W-R}" y1="${yy.toFixed(1)}" y2="${yy.toFixed(1)}"/>`;
    g += `<text class="axis" x="${L-10}" y="${(yy+4).toFixed(1)}" text-anchor="end">${S.eur(v)}</text>`;
  }
  const step = years <= 10 ? 2 : (years <= 20 ? 5 : 8);
  for (let i = 0; i <= years; i += step)
    g += `<text class="axis" x="${x(i).toFixed(1)}" y="${H-14}" text-anchor="middle">${i === 0 ? (FR()?"auj.":"now") : i}</text>`;

  const simOn = scenario === "sim";
  const gap = path(sim) + " " + base.slice().reverse()
    .map((v, i) => "L " + x(years - i).toFixed(1) + " " + y(v).toFixed(1)).join(" ") + " Z";
  const act = simOn ? sim : base;

  $("chart").innerHTML = g +
    `<path d="${gap}" fill="var(--eth)" opacity=".08"/>` +
    `<path d="${path(paid)}" fill="none" stroke="var(--ink-3)" stroke-width="1.2" stroke-dasharray="4 3" opacity=".8"/>` +
    `<path d="${path(base)}" fill="none" stroke="#6aa79a" stroke-width="2" opacity="${simOn?.3:1}"/>` +
    `<path d="${path(sim)}" fill="none" stroke="var(--eth)" stroke-width="2" opacity="${simOn?1:.3}"/>` +
    `<circle cx="${x(years).toFixed(1)}" cy="${y(act[years]).toFixed(1)}" r="4" fill="${simOn?"var(--eth)":"#6aa79a"}"/>`;
}

/* ---------------------------------------------------------------- render */
const cell = (k, v, x, col) =>
  `<div class="cell"><div class="k">${k}</div>` +
  `<div class="v"${col?` style="color:${col}"`:""}>${v}</div><div class="x">${x||""}</div></div>`;

function render() {
  if (!D) return;
  const years = P.years, ge = gEth(), gb = gBtc(), simOn = scenario === "sim";
  const T = total();

  /* band */
  $("band").innerHTML = P.positions.filter(p => p.amount > 0).map(p => {
    const w = p.amount / T * 100, r = effRate(p, simOn?ge:0, simOn?gb:0);
    return `<div class="seg-b${w<13?" sm":""}" style="width:${w}%;background:${COLORS[p.id]}" ` +
      `title="${t(LABELS[p.id])} — ${S.eur(p.amount)}">` +
      `<span class="nm">${t(LABELS[p.id])}</span><span class="rt">${S.pct(r,2)}</span></div>`;
  }).join("");
  $("bandkey").innerHTML = P.positions.map(p =>
    `<span><i style="background:${COLORS[p.id]}"></i>${t(LABELS[p.id])} ${p.amount?S.eur(p.amount):"—"}` +
    (p.monthly ? ` <span class="dim">+${S.eur(p.monthly)}/${FR()?"mois":"mo"}</span>` : "") + `</span>`).join("");

  /* capital inputs */
  $("capinputs").innerHTML = P.positions.map((p, i) =>
    `<div class="inp"><label for="cap${i}">${t(LABELS[p.id])}</label>` +
    `<input type="number" id="cap${i}" data-i="${i}" class="capin" min="0" step="1000" value="${p.amount}"></div>`
  ).join("") +
    `<div class="inp"><label for="mon">${t("al.monthly")}</label>` +
    `<input type="number" id="mon" min="0" step="25" value="${monthlyIn()}"></div>`;
  document.querySelectorAll(".capin").forEach(el => el.addEventListener("input", e => {
    P.positions[+e.target.dataset.i].amount = Math.max(0, +e.target.value || 0);
    save(); render();
  }));
  $("mon").addEventListener("input", e => {
    const v = Math.max(0, +e.target.value || 0), old = monthlyIn() || 1;
    P.positions.forEach(p => { if (p.monthly) p.monthly = Math.round(p.monthly / old * v); });
    if (!monthlyIn() && v) P.positions[1].monthly = v;
    save(); render();
  });

  /* scenario */
  $("scenario").querySelectorAll("button").forEach(b => {
    b.setAttribute("aria-pressed", String(b.dataset.sc === scenario));
    b.textContent = t(b.dataset.sc === "base" ? "al.sc.base" : "al.sc.sim");
  });
  $("scnote").textContent = t(simOn ? "al.sc.sim.d" : "al.sc.base.d");

  /* figures */
  const base = simulate(years, 0, 0), sim = simulate(years, ge, gb);
  const act = simOn ? sim : base;
  const paid = Array.from({length: years+1}, (_, i) => T + monthlyIn()*12*i);
  const paidIn = T + monthlyIn()*12*years, gain = act.total - paidIn, r = irr(years, act.total);

  $("figs").innerHTML =
    cell(t("al.fig.final"), S.eur(act.total),
         simOn ? t("al.fig.vs",{diff:(act.total>=base.total?"+":"−")+S.eur(Math.abs(act.total-base.total))})
               : t("al.fig.final.sub",{years}), simOn?"var(--eth)":"") +
    cell(t("al.fig.paid"), S.eur(paidIn),
         t("al.fig.paid.sub",{start:S.eur(T), added:S.eur(monthlyIn()*12*years)})) +
    cell(t("al.fig.gain"), S.eur(gain),
         t("al.fig.gain.sub",{pct:S.pct(gain/paidIn,0)}), gain>=0?"var(--up)":"var(--down)") +
    cell(t("al.fig.irr"), S.pct(r,2),
         simOn ? t("common.base")+" "+S.pct(irr(years, base.total),2) : t("al.fig.irr.sub"));

  $("legend").innerHTML =
    `<span class="lg"><span class="dash" style="background:#6aa79a"></span>${t("al.lg.base")}</span>` +
    `<span class="lg"><span class="dash" style="background:var(--eth)"></span>${t("al.lg.sim")}</span>` +
    `<span class="lg"><span class="dash" style="background:var(--ink-3)"></span>${t("al.lg.paid")}</span>`;
  drawChart(base.pts, sim.pts, paid, years);

  /* table */
  $("thead").innerHTML = [t("al.th.pos"), t("al.th.cap"), t("al.th.mon"), t("al.th.rate"),
                          t("al.th.end",{years})].map((h,i)=>`<th>${h}</th>`).join("");
  $("rows").innerHTML = P.positions.map((p, i) => {
    const rr = effRate(p, simOn?ge:0, simOn?gb:0);
    return `<tr><td><span class="swatch" style="background:${COLORS[p.id]}"></span>${t(LABELS[p.id])}</td>` +
      `<td>${p.amount?S.eur(p.amount):"—"}</td><td>${p.monthly?S.eur(p.monthly):"—"}</td>` +
      `<td>${S.pct(rr,2)}</td><td>${S.eur(act.finals[i])}</td></tr>`;
  }).join("");
  const blended = T ? P.positions.reduce((s,p)=>s+p.amount*effRate(p,simOn?ge:0,simOn?gb:0),0)/T : 0;
  $("tfoot").innerHTML = `<td>${t("al.total")}</td><td>${S.eur(T)}</td>` +
    `<td>${S.eur(monthlyIn())}</td><td>${S.pct(blended,2)}</td><td>${S.eur(act.total)}</td>`;

  /* parameters */
  $("yearsV").textContent = t("al.years.v",{n:years});
  $("years").value = years;
  $("preset").textContent = t("al.preset");
  $("presetnote").textContent = t("al.preset.d",
    {btc:S.usd(A.cases.bull.btc_usd), eth:S.usd(A.cases.bull.eth_usd), year:A.horizon_year});

  ["eth","btc"].forEach(w => {
    const g = w === "eth" ? ge : gb, col = w === "eth" ? "var(--eth)" : "var(--btc)";
    const sp = spot(w), end = sp * Math.pow(1+g, years);
    const idx = P.positions.findIndex(p => p.kind === w);
    $(w+"panel").innerHTML =
      `<div class="field"><label for="${w}G"><span>${t("al.growth."+w)}</span>` +
      `<b style="color:${col}">${S.signed(g,1)}</b></label>` +
      `<input type="range" id="${w}G" min="-40" max="80" step="0.5" value="${(g*100).toFixed(1)}">` +
      `<div class="ticks2"><span>−40 %</span><span>0 %</span><span>+80 %</span></div></div>` +
      `<div class="proj"><div class="from">${t("al.proj.one",{asset:t("common."+w),years:t("al.years.v",{n:years})})}</div>` +
      `<div class="price" style="color:${col}">${S.eur(end)}</div>` +
      `<div class="row"><span>${t("al.proj.spot")}</span><b>${S.eur(sp)}</b></div>` +
      `<div class="row"><span>${t("al.proj.hold")}</span><b>${S.num(act.finals[idx]/end,4)} ${w.toUpperCase()}</b></div>` +
      `<div class="row"><span>${t("al.proj.worth")}</span><b>${S.eur(act.finals[idx])}</b></div></div>` +
      `<div class="ctl" style="margin-top:12px"><span class="ctl-label">${t("al.spot")}</span>` +
      `<input type="number" id="${w}S" value="${sp}" min="1" step="${w==="eth"?10:500}"></div>`;
    $(w+"G").addEventListener("input", e => { P[w==="eth"?"gEth":"gBtc"] = +e.target.value/100; save(); render(); });
    $(w+"S").addEventListener("input", e => { P[w+"Spot"] = Math.max(1, +e.target.value||1); save(); render(); });
  });

  /* downside */
  const cryptoNow = P.positions.filter(p => p.kind).reduce((s,p)=>s+p.amount,0);
  const cryptoEnd = P.positions.reduce((s,p,i)=> p.kind ? s+act.finals[i] : s, 0);
  const wipe = simulate(years, -1, -1);   // crypto to zero, savings keep compounding
  $("risklede").textContent = t("al.risk.lede",{pct:"−100 %"});
  $("risk").innerHTML =
    cell(t("al.risk.loss"), S.eur(wipe.total),
         (wipe.total>=paidIn?"+":"−")+S.eur(Math.abs(wipe.total-paidIn))+" "+(FR()?"vs versé":"vs paid in"),
         "var(--down)") +
    cell(t("al.risk.pct"), S.pct(cryptoNow/T,0),
         t("common.eth")+" + "+t("common.btc")) +
    cell(t("al.fig.irr"), S.pct(irr(years, wipe.total),2), t("al.risk.loss"));
  $("risknote").textContent = t("al.risk.note",{
    share:S.pct(cryptoNow/T,0),
    loss:S.eur(Math.max(0, base.total - wipe.total)),
    gain:S.eur(Math.max(0, sim.total - base.total))});

  $("savedmsg").textContent = edited ? t("al.saved") : "";
}

/* ---------------------------------------------------------------- wiring */
$("scenario").addEventListener("click", e => {
  const b = e.target.closest("button[data-sc]"); if (!b) return;
  scenario = b.dataset.sc; render();
});
$("years").addEventListener("input", e => { P.years = +e.target.value; save(); render(); });
$("preset").addEventListener("click", () => {
  P.gEth = null; P.gBtc = null; scenario = "sim"; save(); render();
});
$("reset").addEventListener("click", () => {
  try { localStorage.removeItem(STORE); } catch (e) {}
  P = defaults(); edited = false; scenario = "base"; render();
});
Shell.onLang(render);

S.loadData().then(d => {
  D = d; A = d.assumptions; P = load();
  if (P.gEth == null && P.gBtc == null) { /* leave derived */ }
  render();
}).catch(e => Shell.fail($("figs"), e));
})();
