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

const def = (key, word) => `<button type="button" data-def="${key}">${word}</button>`;
const cell = (k,v,x,col) => `<div class="cell"><div class="k">${k}</div>` +
  `<div class="v"${col?` style="color:${col}"`:""}>${v}</div>` +
  `<div class="x">${x||""}</div></div>`;
const card = (h,b,col) =>
  `<div class="panel pad-sm" style="border-left:3px solid ${col}">` +
  `<div style="font-family:var(--display);font-size:15px;font-weight:600;margin-bottom:7px">${h}</div>` +
  `<p class="note" style="margin:0">${b}</p></div>`;

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
    cell(t("st.f.cover"), f.cover == null ? "—" : S.num(f.cover, 1) + "×",
         t("st.f.cover.x"), f.cover >= 2 ? C.up : C.down);
  $("covernote").innerHTML = t("st.f.note", {
    cover: S.num(f.cover, 1), price: S.usd(f.breakeven, 0),
    fall: S.pct(1 - f.breakeven / f.btcNow, 0)});
  $("figsrc").textContent = t("common.editorial") + " · " + t("st.f.src") +
    (f.g.as_of ? " · " + t("common.asof") + " " + S.date(f.g.as_of) : "");
}

/* What the company is actually for: three steps that each raise the bitcoin
   sitting behind one share, and the one condition that has to hold. */
function drawEngine() {
  $("engine").innerHTML =
    card(t("st.e.issue.t"), t("st.e.issue.d"), C.up) +
    card(t("st.e.borrow.t"), t("st.e.borrow.d"), C.btc) +
    card(t("st.e.hold.t"), t("st.e.hold.d"), C.ink);
  $("enginenote").innerHTML = t("st.e.note");
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
}

/* What it would actually take to force a sale, priced out rather than asserted. */
/* Three ways to end up exposed to the same bitcoin. The point is not which is
   best but that they are different instruments: one is leveraged, one is an
   income, one is the asset itself. */
function drawCmp() {
  const f = figures();
  const lev = f.grossBn && f.netBn > 0 ? f.grossBn / f.netBn : null;
  const strcPrice = ((D.market || {}).strc || {}).price;
  const rows = [
    /* the risk cells stay a line long and hand the rest to the panel: what goes
       wrong on each of these has a sequence to it, not a sentence */
    { key: "mstr", col: C.btc, def: "mstr", cells: [
      ["st.c.exposure", t("st.c.mstr.exposure", {x: lev ? S.num(lev, 1) : "—"})],
      ["st.c.updown",   t("st.c.mstr.updown")],
      ["st.c.income",   t("st.c.none")],
      ["st.c.risk",     def("mstrrisk", t("st.c.mstr.risk"))],
      ["st.c.custody",  t("st.c.broker")],
    ]},
    { key: "strc", col: C.up, def: "strc", cells: [
      ["st.c.exposure", t("st.c.strc.exposure")],
      ["st.c.updown",   t("st.c.strc.updown")],
      ["st.c.income",   t("st.c.strc.income", {price: strcPrice ? S.usd(strcPrice, 2) : "—"})],
      ["st.c.risk",     def("strcpeg", t("st.c.strc.risk"))],
      ["st.c.custody",  t("st.c.broker")],
    ]},
    { key: "btc", col: "#8b9bff", def: null, cells: [
      ["st.c.exposure", t("st.c.btc.exposure")],
      ["st.c.updown",   t("st.c.btc.updown")],
      ["st.c.income",   t("st.c.none")],
      ["st.c.risk",     t("st.c.btc.risk")],
      ["st.c.custody",  t("st.c.btc.custody")],
    ]},
  ];
  $("cmp").innerHTML = rows.map(r =>
    `<div class="col" style="border-top:2px solid ${r.col}">` +
    `<div class="hd">${t("st.c." + r.key + ".hd")}</div>` +
    `<div class="nm" style="color:${r.col}">` +
      (r.def ? def(r.def, t("st.c." + r.key + ".nm"))
             : t("st.c." + r.key + ".nm")) + `</div>` +
    `<p class="sub">${t("st.c." + r.key + ".sub")}</p>` +
    r.cells.map(([k, v]) =>
      `<div class="row"><span class="k">${t(k)}</span><span class="v">${v}</span></div>`).join("") +
    `</div>`).join("");
  $("cmpnote").innerHTML = t("st.c.note");
}

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
  const f = figures();
  /* the two risk panels quote the page's own figures rather than repeating them */
  S.setDefVars({
    year:  (f.g.debt_mostly_due_year || ""),
    low:   f.g.strc_low_usd ? S.usd(f.g.strc_low_usd, 0) : "—",
    par:   S.usd(f.g.strc_par || 100, 0),
    years: f.g.cash_cover_years || 2,
    price: S.usd(f.breakeven, 0),
    fall:  S.pct(1 - f.breakeven / f.btcNow, 0),
  });
  drawFigs();
  drawEngine(); drawStack(); drawCmp(); drawStrc(); drawStress(); drawMitig();
}
Shell.onLang(render);
S.loadData().then(d => { D = d; render(); }).catch(e => Shell.fail($("figs"), e));
})();
