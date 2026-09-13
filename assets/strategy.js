/* =============================================================================
   Part seven: Strategy, the bitcoin treasury built on borrowed money.
   Part six's company owes nothing, so its mNAV is read against 1.00. This one
   has claims ranking ahead of its ordinary shares, and that moves the line.
   The coin count and the claims are editorial (notes.json); STRC's price is not.
   ============================================================================= */
Shell.mount("strategy");
(function () {
"use strict";
const { t } = I18N, S = Shell, $ = id => document.getElementById(id);
const FR = () => I18N.lang === "fr";
const C = { btc:"#f0a340", up:"#2ec27e", down:"#ef5350", ink:"var(--ink-3)" };
let D = null;

const cell = (k,v,x,col) => `<div class="cell"><div class="k">${k}</div>` +
  `<div class="v"${col?` style="color:${col}"`:""}>${v}</div>` +
  `<div class="x">${x||""}</div></div>`;
const card = (h,b,col) =>
  `<div class="panel pad-sm" style="border-left:3px solid ${col}">` +
  `<div style="font-family:var(--display);font-size:15px;font-weight:600;margin-bottom:7px">${h}</div>` +
  `<p class="note" style="margin:0">${b}</p></div>`;
const two = (id, keys, prefix) => $(id).innerHTML = keys.map(([k, col]) =>
  `<div class="case" style="border-color:${col}44">` +
  `<div class="lbl" style="color:${col}">${t(prefix + k + ".t")}</div>` +
  `<p class="note" style="margin:10px 0 0">${t(prefix + k + ".d")}</p></div>`).join("");

/* The whole of part seven turns on one number: how much bitcoin the company holds
   against what it owes. Everything below is derived from those two. */
function figures() {
  const g = (D.notes && D.notes.strategy) || {};
  const btcNow = (D.market && D.market.btc_usd) || 0;
  const coins = g.btc_held || 0;
  const grossBn = coins * btcNow / 1e9;
  const seniorBn = g.senior_claims_usd_bn || 0;
  return { g, btcNow, coins, grossBn, seniorBn,
           netBn: grossBn - seniorBn,
           cover: seniorBn ? grossBn / seniorBn : null,
           /* the bitcoin price at which the holding is worth exactly what is owed */
           breakeven: coins ? seniorBn * 1e9 / coins : null };
}

function drawFigs() {
  const f = figures();
  $("figs").innerHTML =
    cell(t("st.f.btc"), S.num(f.coins / 1000, 0) + "k BTC",
         t("st.f.btc.x", {v: S.big(f.grossBn, "USD")}), C.btc) +
    cell(t("st.f.owed"), S.big(f.seniorBn, "USD"), t("st.f.owed.x"), C.down) +
    cell(t("st.f.net"), S.big(f.netBn, "USD"), t("st.f.net.x"), C.up) +
    cell(t("st.f.cover"), f.cover == null ? "—" : S.num(f.cover, 2) + "×",
         t("st.f.cover.x"), f.cover >= 2 ? C.up : C.down);
  $("figsrc").textContent = t("common.editorial") + " · " + t("st.f.src") +
    (f.g.as_of ? " · " + t("common.asof") + " " + S.date(f.g.as_of) : "");
}

/* Where the bitcoin goes if the company were wound up: the claims ahead of the
   ordinary shares are paid first, and only the remainder belongs to MSTR. */
function drawStack() {
  const f = figures();
  if (!f.grossBn) { $("stack").innerHTML = ""; return; }
  const rows = [
    [t("st.st.gross"), f.grossBn, C.btc],
    [t("st.st.senior"), f.seniorBn, C.down],
    [t("st.st.net"), Math.max(f.netBn, 0), C.up],
  ];
  $("stack").innerHTML = rows.map(([n, v, col]) =>
    `<div class="br"><span class="n">${n}</span>` +
    `<span class="t"><i style="width:${(v / f.grossBn * 100).toFixed(1)}%;background:${col}"></i></span>` +
    `<span class="v">${S.big(v, "USD")}</span></div>`).join("");
  $("stackkey").innerHTML =
    `<span class="lg"><span class="dash" style="background:${C.down}"></span>${t("st.st.key.senior")}</span>` +
    `<span class="lg"><span class="dash" style="background:${C.up}"></span>${t("st.st.key.net")}</span>`;
  $("floornote").textContent = t("st.floor.note", {
    cover: S.num(f.cover, 2), owed: S.big(f.seniorBn, "USD"),
    floor: S.num(1 / (1 - f.seniorBn / f.grossBn), 2),
    price: S.usd(f.breakeven, 0)});
}

/* STRC is issued at $100 and the dividend is set with the intention of holding it
   there, so the price is read as a distance from par rather than as a level. */
function drawStrc() {
  const f = figures(), st = (D.market || {}).strc;
  const par = f.g.strc_par || 100;
  if (!st) { $("strc").innerHTML = ""; $("par").innerHTML = ""; return; }
  const gap = st.price / par - 1;
  $("strc").innerHTML =
    cell(t("st.strc.price"), S.usd(st.price, 2), S.date(st.date), gap <= 0 ? C.up : C.down) +
    cell(t("st.strc.par"), S.usd(par, 0), t("st.strc.par.x")) +
    cell(t("st.strc.gap"), S.signed(gap, 1),
         t(gap <= 0 ? "st.strc.below" : "st.strc.above"), gap <= 0 ? C.up : C.down);

  /* the track runs 15% either side of par, so a few dollars of gap is visible */
  const span = 0.15, x = Math.max(0, Math.min(1, (gap + span) / (span * 2))) * 100;
  const col = gap <= 0 ? C.up : C.down;
  $("par").innerHTML =
    `<div class="track">` +
      `<span class="par-l" style="left:50%"></span>` +
      `<span class="tag dn" style="left:50%">${S.usd(par, 0)} · ${t("st.par.issue")}</span>` +
      `<span class="dot" style="left:${x.toFixed(1)}%;background:${col}"></span>` +
      `<span class="tag up" style="left:${x.toFixed(1)}%;color:${col}">${S.usd(st.price, 2)}</span>` +
    `</div>` +
    `<div class="ends"><span>−15 %<b>${t("st.par.cheap")}</b></span>` +
    `<span>+15 %<b>${t("st.par.dear")}</b></span></div>`;
  $("strcread").textContent = t(gap <= 0 ? "st.strc.read.below" : "st.strc.read.above",
    {price: S.usd(st.price, 2), par: S.usd(par, 0), gap: S.pct(Math.abs(gap), 1)});
  $("strcsrc").textContent = t("common.editorial") + " · " +
    (FR() ? f.g.strc_note_fr : f.g.strc_note);
}

/* What it would actually take to force a sale, priced out rather than asserted. */
function drawStress() {
  const f = figures();
  const yrs = f.g.drawdown_years || 4;
  /* the fall is computed from the balance sheet rather than asserted, so the three
     cells cannot drift apart as the bitcoin price moves */
  const fall = f.breakeven ? 1 - f.breakeven / f.btcNow : null;
  $("stress").innerHTML =
    cell(t("st.x.fall"), fall == null ? "—" : "−" + S.pct(fall, 0),
         t("st.x.fall.x", {from: S.usd(f.btcNow, 0), to: S.usd(f.breakeven, 0)}), C.down) +
    cell(t("st.x.break"), S.usd(f.breakeven, 0), t("st.x.break.x"), C.down) +
    cell(t("st.x.time"), t("st.x.time.v", {n: yrs}), t("st.x.time.x"), C.ink);
  $("stressnote").textContent = FR() ? f.g.drawdown_note_fr : f.g.drawdown_note;
}

function drawMitig() {
  $("mitig").innerHTML =
    card(t("st.m.perp.t"), t("st.m.perp.d"), C.up) +
    card(t("st.m.slow.t"), t("st.m.slow.d"), C.up) +
    card(t("st.m.issue.t"), t("st.m.issue.d"), C.btc);
}

function render() {
  if (!D) return;
  drawFigs();
  two("papers", [["mstr", C.btc], ["strc", C.up]], "st.p.");
  drawStack(); drawStrc(); drawStress(); drawMitig();
}
Shell.onLang(render);
S.loadData().then(d => { D = d; render(); }).catch(e => Shell.fail($("figs"), e));
})();
