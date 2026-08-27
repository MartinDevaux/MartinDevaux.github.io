/* France 2027 forecast — client-side recompute for any candidate subset. */
const fmtPct = p => (p == null ? "—" : (p * 100 < 1 && p > 0 ? "<1%" : Math.round(p * 100) + "%"));
const fmtDate = s => new Date(s + "T00:00").toLocaleDateString("en-GB",
  { day: "numeric", month: "short", year: "numeric" });
// surname, keeping French particles (so "Marine Le Pen" -> "Le Pen")
const PARTICLES = ["le", "la", "de", "du", "des", "van", "von", "del", "da"];
function shortName(n) {
  const w = n.split(" ");
  return (w.length >= 2 && PARTICLES.includes(w[w.length - 2].toLowerCase()))
    ? w.slice(-2).join(" ") : w[w.length - 1];
}
const r2 = v => Math.round(v * 100) / 100, r3 = v => Math.round(v * 1000) / 1000;

// collapsible-section toggles (work independently of data load)
function wireToggle(btnId, bodyId, label) {
  document.getElementById(btnId).addEventListener("click", function () {
    const body = document.getElementById(bodyId), open = body.hidden;
    body.hidden = !open;
    this.setAttribute("aria-expanded", String(open));
    this.innerHTML = (open ? "&#9662;" : "&#9656;") + "&nbsp; " + label;
  });
}
wireToggle("method-toggle", "method-body", "Methodology &amp; model details");
wireToggle("params-toggle", "params-body", "Parameters &amp; assumptions");

const tip = d3.select("body").append("div").attr("class", "tooltip");
const showTip = html => tip.html(html).style("opacity", 1);
const moveTip = ev => tip.style("left", (ev.pageX + 14) + "px").style("top", (ev.pageY + 16) + "px");
const hideTip = () => tip.style("opacity", 0);

let COLOR = {}, STATS = {}, DATA = null;      // current rendered view
let MODEL = null, UNIV = [], NAMES = [], SELECTED = new Set();
// vote-transfer parameters (editable in the Parameters panel)
let TRANSFER = true, P_EXP = 2, D0 = 30, POS = {}, INFERRED = {};
let TRANSFER_ESTIMATED = true;   // use estimated transfers where data-backed, else inverse-distance
let RUNOFF_INFL = 0.3;   // runoff horizon uncertainty (logit sd); set from model

// ---- seeded RNG (stable results across re-renders) ----
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
let _rng = mulberry32(20270411), _spare = null;
function seedReset() { _rng = mulberry32(20270411); _spare = null; }
function randn() {
  if (_spare !== null) { const s = _spare; _spare = null; return s; }
  let u, v, s; do { u = 2 * _rng() - 1; v = 2 * _rng() - 1; s = u * u + v * v; } while (s >= 1 || s === 0);
  const m = Math.sqrt(-2 * Math.log(s) / s); _spare = v * m; return u * m;
}
function softmax(lat) {
  let mx = -Infinity; for (const v of lat) if (v > mx) mx = v;
  let sum = 0; const e = lat.map(v => { const x = Math.exp(v - mx); sum += x; return x; });
  return e.map(x => x / sum);
}
function quantiles(arr, ps) {
  const a = Float64Array.from(arr).sort();
  return ps.map(p => { const i = (a.length - 1) * p, lo = Math.floor(i); return a[lo] + (a[lo + 1] - a[lo] || 0) * (i - lo); });
}

// =====================================================================
d3.json("data/model.json").then(initModel).catch(err =>
  d3.select("#app").append("p").style("color", "crimson")
    .text("Could not load data/model.json — run R/08_export_draws.R first. " + err));

function initModel(model) {
  MODEL = model; UNIV = model.candidates; NAMES = UNIV.map(c => c.name);
  SELECTED = new Set(model.default_lineup);
  UNIV.forEach(c => { POS[c.name] = c.pos; INFERRED[c.name] = !!c.runoff_inferred; });
  RUNOFF_INFL = model.runoff.infl;
  buildPicker();
  buildParams();
  d3.select("#pick-reset").on("click", () => {
    SELECTED = new Set(model.default_lineup); syncPicker(); update(false);
  });
  update(true);
}

// ---- candidate picker (structured choices) ----
// Candidates sharing a `slot` are alternative occupants of ONE voter pool (they
// are never co-polled), so picking one deselects its slot-mates. LR is a single
// slot; the Left group mixes the free Greens with the exclusive socialist pool
// (Glucksmann / Hollande / Faure). The centre requires at least one candidate.
// "fixed" candidates (incl. Le Pen) are always in and not shown.
const ROLE_GROUPS = [
  { role: "left",   title: "Left (choose any)" },
  { role: "centre", title: "Centre (choose one or both)" },
  { role: "lr",     title: "Les Républicains (choose one)" }
];
const CENTRE_NAMES = () => UNIV.filter(c => c.role === "centre").map(c => c.name);
const fixedNames = () => UNIV.filter(c => c.role === "fixed").map(c => c.name);

function buildPicker() {
  const box = d3.select("#candidate-picker").html("");
  ROLE_GROUPS.forEach(g => {
    const grp = UNIV.filter(c => c.role === g.role);
    if (!grp.length) return;
    const col = box.append("div").attr("class", "pbloc");
    col.append("div").attr("class", "pbloc-h").text(g.title);
    grp.forEach(c => {
      const lab = col.append("label").attr("class", "pcand")
        .classed("altslot", !!c.slot);
      if (c.slot) lab.attr("title", "Alternative for one voter pool — picking this deselects its slot-mates");
      lab.append("input").attr("class", "optcheck").attr("type", "checkbox")
        .attr("data-name", c.name)
        .attr("data-slot", c.slot || null)
        .property("checked", SELECTED.has(c.name))
        .on("change", onPick);
      lab.classed("off", !SELECTED.has(c.name));
      lab.append("span").attr("class", "pdot").style("background", c.color);
      lab.append("span").text(c.name);
    });
  });
}
function onPick() {
  const name = this.getAttribute("data-name");
  // centre must never be empty: block unticking the last remaining centrist
  if (!this.checked && CENTRE_NAMES().includes(name)) {
    const anyCentre = d3.selectAll("#candidate-picker input.optcheck").nodes()
      .some(el => el.checked && CENTRE_NAMES().includes(el.getAttribute("data-name")));
    if (!anyCentre) { this.checked = true; return; }
  }
  // slot exclusivity: selecting one occupant deselects its slot-mates
  const slot = this.getAttribute("data-slot");
  if (slot && this.checked) {
    const self = this;
    d3.selectAll('#candidate-picker input.optcheck[data-slot="' + slot + '"]').each(function () {
      if (this !== self) this.checked = false;
    });
  }
  SELECTED = new Set(fixedNames());
  d3.selectAll("#candidate-picker input.optcheck").each(function () {
    if (this.checked) SELECTED.add(this.getAttribute("data-name"));
    d3.select(this.parentNode).classed("off", !this.checked);
  });
  update(false);
}
function syncPicker() {
  d3.selectAll("#candidate-picker input.optcheck").each(function () {
    const on = SELECTED.has(this.getAttribute("data-name"));
    this.checked = on; d3.select(this.parentNode).classed("off", !on);
  });
}

// ---- parameters panel: transfer toggle, p, d0, and candidate positions ----
function buildParams() {
  const recompute = debounce(() => update(false), 130);
  const slider = (host, label, min, max, step, get, set) => {
    const row = host.append("div").attr("class", "posrow");
    row.append("span").attr("class", "posname wide").text(label);
    const val = row.append("span").attr("class", "posval").text(get());
    row.append("input").attr("type", "range").attr("min", min).attr("max", max).attr("step", step)
      .property("value", get())
      .on("input", function () { set(+this.value); val.text(this.value); recompute(); });
    return val;
  };

  const g = d3.select("#param-globals").html("");
  const t = g.append("label").attr("class", "pcand");
  t.append("input").attr("type", "checkbox").property("checked", TRANSFER)
    .on("change", function () { TRANSFER = this.checked; update(false); });
  t.append("span").text("Model directional vote transfer when a candidate drops out");
  const te = g.append("label").attr("class", "pcand");
  te.append("input").attr("type", "checkbox").property("checked", TRANSFER_ESTIMATED)
    .on("change", function () { TRANSFER_ESTIMATED = this.checked; update(false); });
  te.append("span").text("Use estimated transfers where data-backed (else inverse-distance)");
  slider(g, "Transfer locality  p  (higher = more local)", 0.5, 4, 0.1, () => P_EXP, v => P_EXP = v);
  slider(g, "Abstention distance  d₀  (higher = fewer stay home)", 5, 60, 1, () => D0, v => D0 = v);
  slider(g, "Runoff uncertainty  σ₂  (higher = closer to a coin-flip)", 0, 0.8, 0.02, () => RUNOFF_INFL, v => RUNOFF_INFL = v);

  const p = d3.select("#param-positions").html("");
  // ordering is fixed: each slider is clamped between its neighbours, so the
  // user calibrates DISTANCE, not who is to the left of whom.
  const ordered = UNIV.filter(c => c.role !== "excluded").sort((a, b) => POS[a.name] - POS[b.name]);
  const order = ordered.map(c => c.name);
  ordered.forEach((c, idx) => {
    const row = p.append("div").attr("class", "posrow");
    row.append("span").attr("class", "pdot").style("background", c.color);
    row.append("span").attr("class", "posname").text(c.name);
    const val = row.append("span").attr("class", "posval").text(Math.round(POS[c.name]));
    row.append("input").attr("type", "range").attr("min", 0).attr("max", 100).attr("step", 1)
      .property("value", POS[c.name])
      .on("input", function () {
        const lo = idx > 0 ? POS[order[idx - 1]] : 0;
        const hi = idx < order.length - 1 ? POS[order[idx + 1]] : 100;
        const v = Math.max(lo, Math.min(hi, +this.value));
        this.value = v; POS[c.name] = v; val.text(v); recompute();
      });
  });

  d3.select("#params-reset").on("click", () => {
    TRANSFER = true; P_EXP = 2; D0 = 30; RUNOFF_INFL = MODEL.runoff.infl;
    UNIV.forEach(c => POS[c.name] = c.pos);
    buildParams(); update(false);
  });
}

function update(first) {
  const sel = NAMES.filter(n => SELECTED.has(n));
  if (sel.length < 2) {
    d3.select("#pick-warning").style("display", null);
    clearCharts();
    return;
  }
  d3.select("#pick-warning").style("display", "none");
  const view = computeView(sel);
  first ? render(view) : renderAll(view);
}
function clearCharts() {
  d3.select("#matchups").html("");
  ["#windots", "#fan", "#sim"].forEach(s => d3.select(s).select("svg").remove());
}

// =====================================================================
// Compute engine: reproduce 06_forecast.R for an arbitrary subset.
// =====================================================================
function computeView(sel) {
  seedReset();
  const beta = MODEL.latent.beta, Dt = MODEL.latent.n_draws;
  const lw = MODEL.forward.last_week, W = MODEL.forward.election_week;
  const rw = MODEL.forward.rw_week_sd, pe = MODEL.forward.poll_error, infl = RUNOFF_INFL;
  const L = sel.length;
  const meta = n => UNIV[NAMES.indexOf(n)];
  const isRN = n => meta(n).party === "RN";
  const inSel = new Set(sel);
  // per-draw runoff strengths: every candidate ships draws now -- own posterior
  // where we have head-to-head data, else a wide bloc-anchored fallback (flagged
  // runoff_inferred). Uncertainty propagates either way.
  const SDR = {}; UNIV.forEach(c => { SDR[c.name] = c.sdraws; });
  const strengthAt = (n, d) => { const a = SDR[n]; return a ? a[d % a.length] : 0; };

  // ---- field R + directional transfer of dropped-out candidates ----
  // With transfer ON we score the MAXIMAL field (everyone who could run), then
  // redistribute anyone the user unticked to the remaining candidates by
  // inverse-distance weighting in left-right space, with an abstention outlet.
  let R;
  if (TRANSFER) {
    // Reference field = the default line-up (so unticking a default candidate is
    // a drop-out that transfers) plus any off-by-default candidate the user has
    // added (they simply join the race, no transfer).
    // Each exclusive slot collapses to ONE representative -- the selected occupant
    // if any, else the default one -- so two alternatives of the same voter pool
    // (e.g. Glucksmann + Hollande) can never both enter the softmax and double-count.
    const slots = [...new Set(UNIV.map(c => c.slot).filter(Boolean))];
    const slotReps = slots
      .map(s => sel.find(n => meta(n).slot === s) || MODEL.default_lineup.find(n => meta(n).slot === s))
      .filter(Boolean);
    const isTogFree = n => ["left", "centre", "lr"].includes(meta(n).role) && !meta(n).slot;
    const fixed = UNIV.filter(c => c.role === "fixed").map(c => c.name);
    const baseTog = MODEL.default_lineup.filter(isTogFree);
    const selTog = sel.filter(isTogFree);
    R = [...fixed, ...slotReps, ...baseTog, ...selTog];
    R = R.filter((n, i) => R.indexOf(n) === i);
  } else {
    R = sel.slice();
  }
  const Ridx = R.map(n => NAMES.indexOf(n)), LR = R.length;
  const selPosInR = sel.map(n => R.indexOf(n));
  const dropped = R.map((_, i) => i).filter(i => !inSel.has(R[i]));

  // transfer weights: each dropped candidate -> running candidates (+ abstain).
  // Data-backed candidates use the ESTIMATED transfer vector (fracs of their vote
  // to each recipient; un-transferred remainder abstains); everyone else falls
  // back to the inverse-distance ASSUMPTION.
  const TR = MODEL.transfers || {};
  const Tw = {};
  dropped.forEach(d => {
    const name = R[d], w = new Float64Array(L);
    if (TR[name] && TRANSFER_ESTIMATED) {
      const to = TR[name].to || {};
      for (let s = 0; s < L; s++) w[s] = to[sel[s]] || 0;      // vote to absent recipients + estimated abstention stays home
    } else {
      const pd = POS[name] ?? 50;
      let denom = Math.pow(1 / Math.max(1, D0), P_EXP);        // abstention anchor
      for (let s = 0; s < L; s++) {
        const dist = Math.max(1, Math.abs(pd - (POS[sel[s]] ?? 50)));
        w[s] = Math.pow(1 / dist, P_EXP); denom += w[s];
      }
      for (let s = 0; s < L; s++) w[s] /= denom;               // residual = abstention
    }
    Tw[d] = w;
  });

  // softmax over R -> shares over sel (redistribute dropped, renormalise)
  function project(e) {
    const base = new Float64Array(L);
    for (let s = 0; s < L; s++) base[s] = e[selPosInR[s]];
    dropped.forEach(d => { const w = Tw[d], ed = e[d]; for (let s = 0; s < L; s++) base[s] += ed * w[s]; });
    let tot = 0; for (let s = 0; s < L; s++) tot += base[s];
    if (tot > 0) for (let s = 0; s < L; s++) base[s] /= tot;
    return base;
  }

  // ---- trajectory: shared forward shock per (draw, field-cand) => smooth fan ----
  const zf = Array.from({ length: Dt }, () => Float64Array.from({ length: LR }, randn));
  const traj = {}; sel.forEach(n => traj[n] = { p10: [], p50: [], p90: [] });
  for (let w = 1; w <= W; w++) {
    const col = sel.map(() => new Float64Array(Dt));
    for (let d = 0; d < Dt; d++) {
      const latR = new Array(LR);
      for (let i = 0; i < LR; i++) {
        const c = Ridx[i];
        latR[i] = w <= lw ? beta[d][c][w - 1] : beta[d][c][lw - 1] + rw * Math.sqrt(w - lw) * zf[d][i];
      }
      const sh = project(softmax(latR));
      for (let s = 0; s < L; s++) col[s][d] = sh[s] * 100;
    }
    for (let s = 0; s < L; s++) {
      const q = quantiles(col[s], [.1, .5, .9]);
      traj[sel[s]].p10.push(r2(q[0])); traj[sel[s]].p50.push(r2(q[1])); traj[sel[s]].p90.push(r2(q[2]));
    }
  }

  // ---- election day: latent drift to W + poll-error term ----
  // Each simulation samples a discrete winner so we can show individual outcomes.
  const REPS = 4, nE = Dt * REPS;
  const sims = new Array(nE);
  const pRunoff = new Float64Array(L), pWin = new Float64Array(L);
  const perCand = sel.map(() => new Float64Array(nE));
  const pairCount = {};
  let e = 0;
  for (let d = 0; d < Dt; d++) {
    for (let rep = 0; rep < REPS; rep++) {
      const latR = new Array(LR);
      for (let i = 0; i < LR; i++)
        latR[i] = beta[d][Ridx[i]][lw - 1] + rw * Math.sqrt(W - lw) * randn() + pe * randn();
      const sh = project(softmax(latR));
      for (let s = 0; s < L; s++) perCand[s][e] = sh[s] * 100;
      let i1 = 0, i2 = 1; if (sh[i2] > sh[i1]) { i1 = 1; i2 = 0; }
      for (let i = 2; i < L; i++) { if (sh[i] > sh[i1]) { i2 = i1; i1 = i; } else if (sh[i] > sh[i2]) i2 = i; }
      pRunoff[i1]++; pRunoff[i2]++;
      const A = sel[i1], B = sel[i2];
      // pA is this simulation's runoff share for A (Bradley-Terry + horizon
      // noise); the winner is simply whoever clears 50%, so a dot's position and
      // its colour always agree.
      const pA = 1 / (1 + Math.exp(-((strengthAt(A, d) - strengthAt(B, d)) + infl * randn())));
      const win = pA > 0.5 ? i1 : i2;
      pWin[win] += 1;
      sims[e] = { s: Array.from(sh, v => r2(v * 100)), a: A, b: B, pa: r3(pA), w: sel[win] };
      const key = [A, B].sort().join(" || "); pairCount[key] = (pairCount[key] || 0) + 1;
      e++;
    }
  }

  const rows = sel.map((n, i) => {
    const q = quantiles(perCand[i], [.1, .9]);
    let s = 0; for (let k = 0; k < nE; k++) s += perCand[i][k];
    return { candidate: n, mean_share: r2(s / nE), share_lo: r2(q[0]), share_hi: r2(q[1]),
             p_runoff: r3(pRunoff[i] / nE), p_win: r3(pWin[i] / nE) };
  }).sort((a, b) => b.mean_share - a.mean_share);

  // ---- sim draws (sample up to 1000 election draws) ----
  const nSim = Math.min(1000, nE), step = nE / nSim, draws = [];
  for (let k = 0; k < nSim; k++) draws.push(sims[Math.floor(k * step)].s);

  // ---- polls renormalised within the subset ----
  const selSet = new Set(sel);
  const polls = MODEL.round1.polls.map(p => {
    const sc = p.scores.filter(s => selSet.has(s.name));
    const tot = sc.reduce((a, s) => a + s.pct, 0) || 1;
    return { date: p.date, pollster: p.pollster, n: p.n,
             scores: sc.map(s => ({ name: s.name, pct: Math.round(s.pct / tot * 1000) / 10 })) };
  }).filter(p => p.scores.length > 0);

  const cands = rows.map(r => { const m = meta(r.candidate); return { name: r.candidate, party: m.party, color: m.color }; });
  return {
    updated: MODEL.updated, election_date_r1: MODEL.election_date_r1,
    lineup_note: `${L} candidates in this scenario.`,
    candidates: cands, sims,
    round1: { dates: MODEL.weeks.dates, trajectory: traj, draw_candidates: sel, draws,
              polls, last_poll_date: MODEL.weeks.dates[lw - 1] },
    p_runoff: Object.fromEntries(rows.map(r => [r.candidate, r.p_runoff])),
    p_win: Object.fromEntries(rows.map(r => [r.candidate, r.p_win])),
    summary: rows
  };
}

// =====================================================================
// Rendering (charts unchanged; fed by the computed view)
// =====================================================================
function prep(data) {
  COLOR = {}; STATS = {}; DATA = data;
  data.candidates.forEach(c => { COLOR[c.name] = c.color; });
  (data.summary || []).forEach(s => { STATS[s.candidate] = s; });
  d3.select("#updated").text("Updated " + data.updated + ".");
  d3.select("#lineup-note").text(data.lineup_note || "");
}
function render(data) {                 // first load: scroll-triggered animation
  prep(data);
  wire("#windots", () => winDots(DATA));
  wire("#fan", () => fanChart(DATA));
  wire("#sim", () => simDots(DATA));
  wire("#matchups", () => matchups(DATA));
}
function renderAll(data) {               // recompute: redraw all now
  prep(data);
  clearCharts();
  winDots(DATA); fanChart(DATA); simDots(DATA); matchups(DATA);
}
let lastW = window.innerWidth;
window.addEventListener("resize", debounce(() => {
  // only reflow on WIDTH change — ignore height-only resizes (e.g. the mobile
  // address bar showing/hiding while scrolling). Charts self-clear, so no dupes.
  if (!DATA || window.innerWidth === lastW) return;
  lastW = window.innerWidth;
  winDots(DATA, false); fanChart(DATA, false); simDots(DATA, false); matchups(DATA, false);
}, 200));
function inView(node, cb) {
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { io.disconnect(); cb(); } }),
    { threshold: 0.18, rootMargin: "0px 0px -8% 0px" });
  io.observe(node);
}
function wire(sel, draw) { inView(document.querySelector(sel).closest(".panel"), draw); }
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

function candStats(name) {
  const s = STATS[name] || {};
  return `<div class="tt-row">Win presidency<b>${fmtPct(s.p_win)}</b></div>` +
    `<div class="tt-row">Reach runoff<b>${fmtPct(s.p_runoff)}</b></div>` +
    `<div class="tt-row">First round<b>${s.mean_share != null ? s.mean_share.toFixed(1) + "%" : "—"}</b></div>` +
    (s.share_lo != null ? `<div class="tt-row tt-sub">80% range<b>${s.share_lo.toFixed(1)}–${s.share_hi.toFixed(1)}%</b></div>` : "");
}

/* ---- 1. who wins — one dot per simulation the candidate won ---- */
function winDots(data, animate = true) {
  const sims = data.sims, nS = sims.length;
  const cnt = {}; data.round1.draw_candidates.forEach(n => cnt[n] = 0);
  sims.forEach(s => cnt[s.w]++);
  const rows = Object.keys(cnt).map(n => ({ name: n, count: cnt[n], p: cnt[n] / nS }))
    .filter(r => r.count > 0).sort((a, b) => b.count - a.count);

  const el = document.getElementById("windots");
  const Wd = el.clientWidth || 860, rowH = 30, m = { top: 10, right: 54, bottom: 10, left: 168 };
  const H = m.top + m.bottom + rows.length * rowH;
  const x0 = m.left + 10, maxW = Wd - m.right - x0;
  d3.select("#windots").selectAll("svg").remove();      // idempotent: never duplicate
  const svg = d3.select("#windots").append("svg").attr("width", Wd).attr("height", H);
  const per = 1100 / Math.max(nS, 1);     // dots pop in, in simulation order
  let winHi = null;
  const resetWinDot = () => { if (winHi) { d3.select(winHi).attr("r", 2).attr("opacity", 0.5).attr("stroke", null); winHi = null; } };

  rows.forEach((r, i) => {
    const cy = m.top + i * rowH + rowH / 2, col = COLOR[r.name] || "#888";
    const w = Math.max(r.p * maxW, 3);
    svg.append("text").attr("x", m.left - 10).attr("y", cy + 4).attr("text-anchor", "end")
      .attr("font-size", 12.5).attr("font-weight", 600).text(r.name);
    const cols = data.round1.draw_candidates;
    const mine = [];
    sims.forEach((s, gi) => { if (s.w === r.name) mine.push({ s, gi }); });
    const jy = () => cy + (Math.random() - 0.5) * (rowH - 8);
    const jx = () => x0 + Math.random() * w;
    const dots = svg.append("g").selectAll("circle").data(mine).join("circle")
      .attr("class", "windot").attr("cy", jy).attr("cx", jx).attr("fill", col)
      .attr("r", animate ? 0 : 2).attr("opacity", animate ? 0 : 0.5)
      .on("mouseenter", function (ev, o) {
        resetWinDot(); winHi = this;
        d3.select(this).attr("r", 4).attr("opacity", 1).attr("stroke", "#fff").attr("stroke-width", 0.8);
        showTip(winHtml(o.s, cols)); moveTip(ev);
      }).on("mousemove", moveTip).on("mouseleave", function () { resetWinDot(); hideTip(); });
    if (animate) dots.transition().delay(o => o.gi * per).duration(120).attr("r", 2).attr("opacity", 0.5);
    svg.append("text").attr("x", Wd - m.right + 8).attr("y", cy + 4).attr("font-size", 12.5)
      .attr("font-weight", 700).attr("fill", "#333").text(Math.round(r.p * 100) + "%");
  });
}
function winHtml(s, cols) {
  const sw = n => `<span class="tt-sw" style="background:${COLOR[n] || "#888"}"></span>`;
  const inf = n => INFERRED[n] ? '<span class="tt-inf" title="No head-to-head runoff polls — strength inferred from bloc">*</span>' : "";
  const other = s.w === s.a ? s.b : s.a;
  const pW = Math.round((s.w === s.a ? s.pa : 1 - s.pa) * 100);
  const note = (INFERRED[s.a] || INFERRED[s.b])
    ? `<div class="tt-note">* runoff strength inferred (no head-to-head polls)</div>` : "";
  const runoff =
    `<div class="tt-line">${sw(s.a)} ${s.a}${inf(s.a)} <span class="tt-vs">vs</span> ${sw(s.b)} ${s.b}${inf(s.b)}</div>` +
    `<div class="tt-win">&rarr; ${sw(s.w)} <b>${s.w}</b> wins</div>` +
    `<div class="tt-odds">runoff: ${s.w} ${pW}% &middot; ${other} ${100 - pW}%</div>` + note;
  const r1 = cols.map((n, j) => ({ n, v: s.s[j] })).sort((a, b) => b.v - a.v).map((o, rank) =>
    `<div class="tt-row${o.n === s.w ? " tt-hi" : ""}">${sw(o.n)}${o.n}` +
    `${rank < 2 ? ' <span class="tt-run">runoff</span>' : ""}<b>${o.v.toFixed(1)}%</b></div>`).join("");
  return `<div class="tt-h">One simulated election</div>` +
    `<div class="tt-sec">Runoff result</div>${runoff}<div class="tt-sec">First round</div>${r1}`;
}

/* ---- 2. trajectory fan chart + poll dots + crosshair ---- */
function fanChart(data, animate = true) {
  const el = document.getElementById("fan");
  const W = el.clientWidth || 860, H = 380;
  const m = { top: 16, right: 58, bottom: 26, left: 34 };
  const parse = d3.timeParse("%Y-%m-%d");
  const dates = data.round1.dates.map(parse);
  const elec = parse(data.election_date_r1);
  const gen = parse(data.updated);
  const names = data.candidates.map(c => c.name);

  const x = d3.scaleTime().domain(d3.extent(dates.concat([elec]))).range([m.left, W - m.right]);
  let ymax = 0; names.forEach(n => ymax = Math.max(ymax, d3.max(data.round1.trajectory[n].p90)));
  const y = d3.scaleLinear().domain([0, Math.ceil(ymax / 5) * 5 + 2]).range([H - m.bottom, m.top]);

  d3.select("#fan").selectAll("svg").remove();          // idempotent: never duplicate
  const svg = d3.select("#fan").append("svg").attr("width", W).attr("height", H);
  const gx = Math.max(m.left, Math.min(W - m.right, x(gen)));
  svg.append("rect").attr("x", gx).attr("y", m.top).attr("width", (W - m.right) - gx)
    .attr("height", H - m.bottom - m.top).attr("fill", "#3b5bdb").attr("opacity", 0.05);
  svg.append("text").attr("x", gx - 5).attr("y", m.top - 4).attr("text-anchor", "end")
    .attr("font-size", 10).attr("fill", "#aaa").text("polls");
  svg.append("text").attr("x", gx + 5).attr("y", m.top - 4).attr("font-size", 10).attr("fill", "#8a97c9").text("forecast");

  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - m.bottom})`)
    .call(d3.axisBottom(x).ticks(6).tickFormat(d3.timeFormat("%b %Y")));
  svg.append("g").attr("class", "axis").attr("transform", `translate(${m.left},0)`)
    .call(d3.axisLeft(y).ticks(6).tickFormat(d => d + "%"));
  y.ticks(6).forEach(t => svg.append("line").attr("class", "gridline")
    .attr("x1", m.left).attr("x2", W - m.right).attr("y1", y(t)).attr("y2", y(t)));
  svg.append("line").attr("x1", gx).attr("x2", gx).attr("y1", m.top).attr("y2", H - m.bottom)
    .attr("stroke", "#8a97c9").attr("stroke-width", 1);
  svg.append("line").attr("class", "elec-line").attr("x1", x(elec)).attr("x2", x(elec)).attr("y1", m.top).attr("y2", H - m.bottom);
  svg.append("text").attr("x", x(elec)).attr("y", m.top - 4).attr("text-anchor", "middle").attr("font-size", 10).attr("fill", "#999").text("election");

  const area = d3.area().x((_, i) => x(dates[i])).y0(d => y(d[0])).y1(d => y(d[1])).curve(d3.curveMonotoneX);
  const line = d3.line().x((_, i) => x(dates[i])).y(d => y(d)).curve(d3.curveMonotoneX);
  names.forEach((n, k) => {
    const tr = data.round1.trajectory[n], col = COLOR[n] || "#888";
    const band = tr.p10.map((lo, i) => [lo, tr.p90[i]]);
    const ribbon = svg.append("path").datum(band).attr("fill", col).attr("opacity", animate ? 0 : 0.1).attr("d", area).style("pointer-events", "none");
    const path = svg.append("path").datum(tr.p50).attr("fill", "none").attr("stroke", col).attr("stroke-width", 1.8).attr("d", line).style("pointer-events", "none");
    const li = tr.p50.length - 1;
    const label = svg.append("text").attr("x", x(dates[li]) + 4).attr("y", y(tr.p50[li]) + 3)
      .attr("font-size", 10).attr("fill", col).attr("opacity", animate ? 0 : 1).style("pointer-events", "none").text(shortName(n));
    if (animate) {
      const Ln = path.node().getTotalLength();
      path.attr("stroke-dasharray", `${Ln} ${Ln}`).attr("stroke-dashoffset", Ln).transition().delay(200).duration(1400).ease(d3.easeCubicInOut).attr("stroke-dashoffset", 0);
      ribbon.transition().delay(200 + k * 30).duration(900).attr("opacity", 0.1);
      label.transition().delay(1500).duration(500).attr("opacity", 1);
    }
  });

  const focus = svg.append("g").style("display", "none");
  focus.append("line").attr("class", "crosshair").attr("y1", m.top).attr("y2", H - m.bottom);
  const fdots = names.map(n => focus.append("circle").attr("r", 3).attr("fill", COLOR[n] || "#888").attr("stroke", "#fff").attr("stroke-width", 1));
  const bisect = d3.bisector(d => d).left;
  svg.append("rect").attr("x", m.left).attr("y", m.top).attr("width", W - m.right - m.left).attr("height", H - m.bottom - m.top)
    .attr("fill", "transparent")
    .on("mouseenter", () => focus.style("display", null))
    .on("mouseleave", () => { focus.style("display", "none"); hideTip(); })
    .on("mousemove", function (ev) {
      const px = d3.pointer(ev, svg.node())[0];
      let i = bisect(dates, x.invert(px));
      i = i <= 0 ? 0 : i >= dates.length ? dates.length - 1 : (x.invert(px) - dates[i - 1] < dates[i] - x.invert(px) ? i - 1 : i);
      const sx = x(dates[i]);
      focus.select("line.crosshair").attr("x1", sx).attr("x2", sx);
      names.forEach((n, k) => fdots[k].attr("cx", sx).attr("cy", y(data.round1.trajectory[n].p50[i])));
      const rows = names.map(n => ({ n, v: data.round1.trajectory[n].p50[i] })).sort((a, b) => b.v - a.v)
        .map(o => `<div class="tt-row"><span class="tt-sw" style="background:${COLOR[o.n]}"></span>${o.n}<b>${o.v.toFixed(1)}%</b></div>`).join("");
      const kind = dates[i] > gen ? "forecast" : "estimate";
      showTip(`<div class="tt-h">${fmtDate(data.round1.dates[i])} <span class="tt-sub">· predicted (${kind})</span></div>${rows}`);
      moveTip(ev);
    });

  const dotG = svg.append("g");
  (data.round1.polls || []).forEach(poll => {
    const px = x(parse(poll.date));
    poll.scores.forEach(s => {
      if (!(s.name in COLOR)) return;
      dotG.append("circle").attr("class", "dot").attr("cx", px).attr("cy", y(s.pct))
        .attr("r", animate ? 0 : 2.6).attr("fill", COLOR[s.name]).attr("opacity", 0.55)
        .on("mouseenter", function (ev) {
          focus.style("display", "none");
          d3.select(this).attr("r", 4.5).attr("opacity", 1).attr("stroke", "#fff").attr("stroke-width", 0.9).raise();
          showTip(pollHtml(poll, s.name)); moveTip(ev);
        })
        .on("mousemove", moveTip)
        .on("mouseleave", function () {
          d3.select(this).attr("r", 2.6).attr("opacity", 0.55).attr("stroke", null); hideTip();
        });
    });
  });
  if (animate) dotG.selectAll("circle").transition().delay(1600).duration(500).attr("r", 2.6);

  const leg = d3.select("#fan-legend").html("");
  names.forEach(n => { const it = leg.append("span").attr("class", "item");
    it.append("span").attr("class", "swatch").style("background", COLOR[n]); it.append("span").text(n); });
}
function pollHtml(poll, highlight) {
  const rows = poll.scores.slice().sort((a, b) => b.pct - a.pct).map(s =>
    `<div class="tt-row${s.name === highlight ? " tt-hi" : ""}"><span class="tt-sw" style="background:${COLOR[s.name] || "#888"}"></span>${s.name}<b>${s.pct}%</b></div>`).join("");
  return `<div class="tt-h">${fmtDate(poll.date)} <span class="tt-sub">· ${poll.pollster}${poll.n ? " · n=" + poll.n : ""}</span></div>${rows}`;
}

/* ---- 3. 1,000 simulated elections (each dot hoverable = one draw) ---- */
function simDots(data, animate = true) {
  const cols = data.round1.draw_candidates, draws = data.round1.draws;
  const means = cols.map((n, j) => ({ name: n, mean: d3.mean(draws, r => r[j]), j })).sort((a, b) => b.mean - a.mean);
  const el = document.getElementById("sim");
  const W = el.clientWidth || 860, rowH = 40, m = { top: 8, right: 16, bottom: 26, left: 168 };
  const H = m.top + m.bottom + means.length * rowH;
  const x = d3.scaleLinear().domain([0, Math.ceil(d3.max(draws.flat()) / 5) * 5]).range([m.left, W - m.right]);
  d3.select("#sim").selectAll("svg").remove();          // idempotent: never duplicate
  const svg = d3.select("#sim").append("svg").attr("width", W).attr("height", H);
  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - m.bottom})`).call(d3.axisBottom(x).ticks(6).tickFormat(d => d + "%"));
  x.ticks(6).forEach(t => svg.append("line").attr("class", "gridline").attr("x1", x(t)).attr("x2", x(t)).attr("y1", m.top).attr("y2", H - m.bottom));

  const bound = draws.map((d, k) => ({ d, k }));
  const per = 1100 / Math.max(draws.length, 1);   // dots pop in, in draw order
  let hiK = null;
  const unhi = () => { if (hiK !== null) { svg.selectAll(`circle.simdot[data-k='${hiK}']`).attr("r", 3).attr("opacity", 0.32).attr("stroke", null); hiK = null; } };

  means.forEach((mn, i) => {
    const cy = m.top + i * rowH + rowH / 2, col = COLOR[mn.name] || "#888";
    svg.append("text").attr("x", m.left - 10).attr("y", cy + 4).attr("text-anchor", "end").attr("font-size", 12.5).attr("font-weight", 600).text(mn.name);
    // row strip (behind dots): hover the gaps for this candidate's summary stats
    svg.append("rect").attr("x", m.left).attr("y", cy - rowH / 2).attr("width", W - m.right - m.left).attr("height", rowH).attr("fill", "transparent")
      .on("mouseenter", () => showTip(`<div class="tt-h">${mn.name}</div>${candStats(mn.name)}`)).on("mousemove", moveTip).on("mouseleave", hideTip);
    const jit = () => (Math.random() - 0.5) * (rowH - 10);
    const dots = svg.append("g").selectAll("circle").data(bound).join("circle")
      .attr("class", "simdot").attr("data-k", o => o.k)
      .attr("cy", () => cy + jit()).attr("fill", col).attr("cx", o => x(o.d[mn.j]))
      .attr("r", animate ? 0 : 3).attr("opacity", animate ? 0 : 0.32)
      .on("mouseenter", function (ev, o) {
        unhi(); hiK = o.k;
        svg.selectAll(`circle.simdot[data-k='${o.k}']`).attr("r", 5).attr("opacity", 1).attr("stroke", "#fff").attr("stroke-width", 0.7);
        showTip(simHtml(o.d, cols, mn.name)); moveTip(ev);
      }).on("mousemove", moveTip).on("mouseleave", function () { unhi(); hideTip(); });
    if (animate) dots.transition().delay(o => o.k * per).duration(120).attr("r", 3).attr("opacity", 0.32);
    const mk = svg.append("line").attr("x1", x(mn.mean)).attr("x2", x(mn.mean)).attr("y1", cy).attr("y2", cy)
      .attr("stroke", "#222").attr("stroke-width", 1.4).style("pointer-events", "none");
    (animate ? mk.transition().delay(i * 70 + 300).duration(500) : mk).attr("y1", cy - rowH / 2 + 3).attr("y2", cy + rowH / 2 - 3);
  });
}
function simHtml(draw, cols, hiName) {
  const rows = cols.map((n, j) => ({ n, v: draw[j] })).sort((a, b) => b.v - a.v);
  const body = rows.map((o, rank) =>
    `<div class="tt-row${o.n === hiName ? " tt-hi" : ""}"><span class="tt-sw" style="background:${COLOR[o.n] || "#888"}"></span>${o.n}` +
    `${rank < 2 ? ' <span class="tt-run">runoff</span>' : ""}<b>${o.v.toFixed(1)}%</b></div>`).join("");
  return `<div class="tt-h">One simulated election</div>${body}`;
}

/* ---- 4. runoff match-ups: one dot per simulated runoff ---- */
function matchups(data, animate = true) {
  const box = d3.select("#matchups").html("");
  const isRN = n => (UNIV[NAMES.indexOf(n)] || {}).party === "RN";
  const nTot = data.sims.length;
  const groups = {};
  data.sims.forEach(s => { const k = [s.a, s.b].sort().join(" || "); (groups[k] = groups[k] || []).push(s); });
  const pairs = Object.entries(groups).map(([key, ss]) => {
    let [x, y] = key.split(" || "), a = x, b = y;
    if (isRN(x) && !isRN(y)) { a = y; b = x; }          // RN candidate on the right
    const dots = ss.map(s => {
      const bShare = (s.a === b ? s.pa : 1 - s.pa) * 100;
      return { x: bShare, s, bWins: bShare > 50 };
    });
    return { a, b, dots, count: ss.length, bFrac: d3.mean(dots, d => d.bWins ? 1 : 0) };
  }).filter(p => p.count >= Math.max(5, nTot * 0.01)).sort((A, B) => B.count - A.count).slice(0, 5);

  const sw = n => `<span class="tt-sw" style="background:${COLOR[n] || "#888"}"></span>`;
  const inf = n => INFERRED[n] ? '<span class="tt-inf" title="No head-to-head runoff polls — strength inferred from bloc">*</span>' : "";
  const last = shortName;
  const Wm = document.getElementById("matchups").clientWidth || 700;
  const H = 60, m = { l: 8, r: 8, t: 6, b: 16 };
  const x = d3.scaleLinear().domain([30, 70]).range([m.l, Wm - m.r]);

  pairs.forEach(mu => {
    const c = box.append("div").attr("class", "matchup");
    const head = c.append("div").attr("class", "mu-head");
    head.append("span").html(`${sw(mu.a)} ${mu.a}${inf(mu.a)}`);
    head.append("span").attr("class", "freq").text(`${Math.round(100 * mu.count / nTot)}% of simulations`);
    head.append("span").html(`${mu.b}${inf(mu.b)} ${sw(mu.b)}`);

    const svg = c.append("svg").attr("width", Wm).attr("height", H);
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - m.b})`)
      .call(d3.axisBottom(x).tickValues([30, 40, 50, 60, 70]).tickFormat(d => d + "%").tickSize(3));
    svg.append("line").attr("x1", x(50)).attr("x2", x(50)).attr("y1", m.t).attr("y2", H - m.b)
      .attr("stroke", "#bbb").attr("stroke-dasharray", "3 2");
    const cy = (m.t + H - m.b) / 2, jit = () => (Math.random() - 0.5) * (H - m.b - m.t - 4);
    const per = 900 / Math.max(mu.dots.length, 1);
    let hi = null;
    const reset = () => { if (hi) { d3.select(hi).attr("r", 4).attr("opacity", 0.5).attr("stroke", null); hi = null; } };
    svg.append("g").selectAll("circle").data(mu.dots).join("circle")
      .attr("class", "mudot").attr("cx", d => x(Math.max(30, Math.min(70, d.x)))).attr("cy", () => cy + jit())
      .attr("fill", d => d.bWins ? COLOR[mu.b] : COLOR[mu.a])
      .attr("r", animate ? 0 : 4).attr("opacity", animate ? 0 : 0.5)
      .on("mouseenter", function (ev, d) {
        reset(); hi = this;
        d3.select(this).attr("r", 7).attr("opacity", 1).attr("stroke", "#fff").attr("stroke-width", 0.8);
        const winner = d.bWins ? mu.b : mu.a, ws = Math.round(Math.max(d.x, 100 - d.x));
        showTip(`<div class="tt-h">One simulated runoff</div>` +
          `<div class="tt-line">${sw(mu.a)} ${mu.a} <span class="tt-vs">vs</span> ${sw(mu.b)} ${mu.b}</div>` +
          `<div class="tt-win">&rarr; ${sw(winner)} <b>${winner}</b> wins ${ws}&ndash;${100 - ws}</div>`);
        moveTip(ev);
      }).on("mousemove", moveTip).on("mouseleave", function () { reset(); hideTip(); });
    if (animate) svg.selectAll("circle.mudot").transition().delay((d, i) => i * per).duration(120)
      .attr("r", 4).attr("opacity", 0.5);

    const foot = c.append("div").attr("class", "mu-foot");
    foot.append("span").style("color", COLOR[mu.a]).text(`${last(mu.a)} wins ${Math.round(100 * (1 - mu.bFrac))}%`);
    foot.append("span").style("color", COLOR[mu.b]).text(`${last(mu.b)} wins ${Math.round(100 * mu.bFrac)}%`);
  });
}
