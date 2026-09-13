/* =============================================================================
   Part five: what a treasury company is, and what decides whether it is worth
   more or less than the coins it holds. No company appears here; part six
   takes one apart with live figures.
   ============================================================================= */
Shell.mount("sbet");
(function () {
"use strict";
const { t } = I18N, S = Shell, $ = id => document.getElementById(id);
const FR = () => I18N.lang === "fr";
const C = { sbet:"#f2a33c", eth:"#8b9bff", up:"#2ec27e", down:"#ef5350", vol:"#26304a" };
let D = null;

const cell = (k,v,x,col) => `<div class="cell"><div class="k">${k}</div>` +
  `<div class="v"${col?` style="color:${col}"`:""}>${v}</div><div class="x">${x||""}</div></div>`;

/* --- the explainer sections ------------------------------------------- */
function card(t1, d1, col) {
  return `<div class="panel pad-sm" style="border-left:3px solid ${col}">` +
    `<div style="font-family:var(--display);font-size:15px;font-weight:600;margin-bottom:7px">${t1}</div>` +
    `<p class="note" style="margin:0">${d1}</p></div>`;
}

/* Part five names no company, so the arithmetic is shown on round numbers: a
   reader who has just met the words "backing per share" and "mNAV" gets to see
   them worked once before part six puts live figures behind them. */
const EX = { shares: 1e6, held: 1000, price: 3000 };

function drawWorked() {
  const nav = EX.held * EX.price, navPer = nav / EX.shares;
  $("worked").innerHTML =
    cell(t("sb.w.held"), S.num(EX.held, 0) + " ETH", t("sb.w.held.d")) +
    cell(t("sb.w.nav"), S.usd(nav, 0), t("sb.w.nav.d",
         {n: S.num(EX.held, 0), price: S.usd(EX.price, 0)}), C.eth) +
    cell(t("sb.w.per"), S.usd(navPer, 2), t("sb.w.per.d",
         {shares: S.num(EX.shares / 1e6, 0) + "M"}), C.eth) +
    cell(t("sb.w.mnav"), S.num(1.2, 2), t("sb.w.mnav.d", {price: S.usd(navPer * 1.2, 2)}), C.sbet);
  $("workednote").textContent = t("sb.w.note",
    {per: S.usd(navPer, 2), above: S.usd(navPer * 1.2, 2), below: S.usd(navPer * 0.8, 2)});
}

function drawExplainer() {
  const A = D.assumptions;
  $("raise").innerHTML = ["atm","debt","pipe"].map((k, i) =>
    card(t("sb.raise." + k + ".t"), t("sb.raise." + k + ".d"),
         [C.eth, C.down, "var(--ink-3)"][i])).join("");

  $("mech").innerHTML = [["above", C.up], ["below", C.down]].map(([k, col]) =>
    `<div class="case" style="border-color:${col}44">` +
    `<div class="lbl" style="color:${col}">${t("sb.mech." + k + ".t")}</div>` +
    `<p class="note" style="margin:10px 0 0">${t("sb.mech." + k + ".d")}</p></div>`).join("");

}

/* The three worth following, side by side. Holdings are editorial and dated, so the
   block says so rather than letting a rounded coin count read as a live figure. */
function drawWho() {
  const tw = (D.notes && D.notes.treasuries) || {};
  const rows = tw.rows || [];
  const COIN = {BTC: "#f0a340", ETH: C.eth};
  $("who").innerHTML = rows.map(r => {
    const col = r.debt ? C.down : C.up;
    const size = r.coins >= 1e6 ? S.num(r.coins / 1e6, 1) + "M " + r.asset
                               : S.num(r.coins / 1000, 0) + "k " + r.asset;
    return `<div class="twr">` +
      `<div><div class="tk">${r.ticker}</div><div class="nm">${r.name}</div>` +
        `<div class="sz" style="color:${COIN[r.asset]}">≈ ${size}</div></div>` +
      `<p>${FR() ? r.what_fr : r.what} ${FR() ? r.funding_fr : r.funding}</p>` +
      `<span class="dbt" style="color:${col};border-color:${col}55">` +
        `${t(r.debt ? "sb.who.debt" : "sb.who.nodebt")}</span></div>`;
  }).join("");
  $("whosrc").textContent = rows.length
    ? t("common.editorial") + " · " + t("sb.who.approx") +
      (tw.as_of ? " · " + t("common.asof") + " " + S.date(tw.as_of) : "")
    : "";
}

function drawTwo() {
  $("two").innerHTML = [["debt", C.down], ["mnav", C.up]].map(([k, col]) =>
    `<div class="case" style="border-color:${col}44">` +
    `<div class="lbl" style="color:${col}">${t("sb.two." + k + ".t")}</div>` +
    `<p class="note" style="margin:10px 0 0">${t("sb.two." + k + ".d")}</p></div>`).join("");
}

function render() {
  if (!D) return;
  drawWorked(); drawExplainer(); drawTwo(); drawWho();
}
Shell.onLang(render);
S.loadData().then(d => { D = d; render(); }).catch(e => Shell.fail($("worked"), e));
})();
