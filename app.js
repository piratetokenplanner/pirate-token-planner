// Pirate Token Planner: all scoring happens in this file, in the open.
import { normalizeShop, SHOP_URL } from './shared/normalize.js';
{
const DAY = 864e5;
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const n0 = x => Math.round(x).toLocaleString('en-US');
const load = p => fetch(p, { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).catch(() => null);

// ---------- clock: the shop day is the UTC date ----------
const q = new URLSearchParams(location.search);
const now = q.get('today') ? Date.parse(q.get('today') + 'T12:00:00Z') : Date.now();
const T0 = Math.floor(now / DAY) * DAY;               // today 00:00 UTC
const idx = s => Math.round((Date.parse(s.slice(0, 10) + 'T00:00:00Z') - T0) / DAY);
const dt = i => new Date(T0 + i * DAY);
const fmt = (i, o = { day: 'numeric', month: 'short' }) => dt(i).toLocaleDateString('en-GB', { timeZone: 'UTC', ...o });
const fmtL = i => fmt(i, { weekday: 'short', day: 'numeric', month: 'short' });
const resetLocal = new Date(T0).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const KINDS = { outfit: 'Outfits', bundle: 'Bundles', emote: 'Emotes', pickaxe: 'Pickaxes', glider: 'Gliders', backpack: 'Back blings', wrap: 'Wraps', sidekick: 'Sidekicks', jamtrack: 'Jam Tracks', music: 'Lobby music', kicks: 'Kicks', car: 'Cars', contrail: 'Contrails', loadingscreen: 'Loading screens', lego: 'LEGO kits', instrument: 'Instruments', other: 'Everything else' };
// The cards in step 1. Love / Maybe / Nope set every type in the group to 10 / 3 / 0.
const GROUPS = [
  { id: 'outfits', label: 'Outfits & bundles', ex: 'Skins and skin sets', kinds: ['outfit', 'bundle'] },
  { id: 'emotes', label: 'Emotes', ex: 'Dances and moves', kinds: ['emote'] },
  { id: 'gear', label: 'Pickaxes, gliders & back blings', ex: 'Your gear', kinds: ['pickaxe', 'glider', 'backpack'] },
  { id: 'sidekick', label: 'Sidekicks', ex: 'Pets that follow you (only 1 free)', kinds: ['sidekick'] },
  { id: 'kicks', label: 'Kicks', ex: 'Shoes', kinds: ['kicks'] },
  { id: 'wraps', label: 'Wraps & contrails', ex: 'Weapon skins and trails', kinds: ['wrap', 'contrail', 'loadingscreen'] },
  { id: 'music', label: 'Jam Tracks & music', ex: 'Songs, lobby music, instruments', kinds: ['jamtrack', 'music', 'instrument'] },
  { id: 'rides', label: 'Cars & LEGO', ex: 'Rocket Racing and LEGO kits', kinds: ['car', 'lego', 'other'] }
];
const LEVELS = [['Nope', 0], ['Maybe', 3], ['Love', 10]];
const levelOf = g => { const v = P.types[g.kinds[0]] ?? 0; return v >= 7 ? 2 : v >= 1 ? 1 : 0; };
const base = { outfit: 10, bundle: 10, emote: 3, pickaxe: 3, glider: 3, backpack: 3, wrap: 0, sidekick: 3, jamtrack: 0, contrail: 0, loadingscreen: 0, music: 0, kicks: 3, car: 0, lego: 0, instrument: 0, other: 0 };
const PRESETS = {
  'Balanced': { ...base },
  'Skins only': Object.fromEntries(Object.keys(base).map(k => [k, k === 'outfit' || k === 'bundle' ? 10 : 0])),
  'Emote collector': { ...base, emote: 10, outfit: 3, bundle: 3 },
  'Music lover': { ...base, jamtrack: 10, music: 10, instrument: 10, outfit: 3, bundle: 3 },
  'Hoarder': Object.fromEntries(Object.keys(base).map(k => [k, 10]))
};
const DEF = { types: { ...base }, kw: '', kwBoost: 2, rare: 3, ev: {}, days: [1, 1, 1, 1, 1, 1, 1], late: true, owned: [], must: [] };
let P = structuredClone(DEF), sel = null;
try { Object.assign(P, JSON.parse(localStorage.getItem('ptp3') || '{}')); } catch (e) {}
if (location.hash.startsWith('#s=')) { try { Object.assign(P, JSON.parse(decodeURIComponent(atob(location.hash.slice(3))))); } catch (e) {} }
const save = () => { try { localStorage.setItem('ptp3', JSON.stringify(P)); } catch (e) {} };

let D = {}; // loaded data

// seeded random numbers, so the same data and settings always give the same ranges
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function gauss(r) { return Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()); }

// ---------- model ----------
function model() {
  const R = D.rules, win = R.windows.find(w => Date.parse(w.deadline) > now);
  if (!win) return null;
  const startMin = Math.max(0, idx(win.opens));
  const deadIdx = idx(win.deadline);                  // first day that is after the deadline
  const startMax = Math.min(deadIdx - 1, startMin + 59);
  const dur = R.durationDays;
  const valid = i => P.late || i < deadIdx;
  const plays = i => P.days[(dt(i).getUTCDay() + 6) % 7];
  const w = k => (P.types[k] ?? 2) / 10;
  const kws = P.kw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const kwHit = txt => kws.find(k => txt.toLowerCase().includes(k));
  const rareMul = 1 + P.rare / 10;

  // value of each item in today's shop
  // items also sold on their own: a bundle only counts for the part you can't get separately
  const solo = new Set(D.shop.entries.filter(e => e.kind !== 'bundle').flatMap(e => e.items.map(i => i.id)));
  const items = D.shop.entries.map(e => {
    const out = e.outDate ? idx(e.outDate) : (e.inDate ? idx(e.inDate) : 0) + (D.base.stay);
    const hay = [e.name, ...e.items.flatMap(i => [i.name, i.set, i.series])].filter(Boolean).join(' ');
    const fav = kwHit(hay);
    const rare = e.gap === 'unseen' || (typeof e.gap === 'number' && e.gap >= 180);
    const own = P.owned.includes(e.id), must = (P.must || []).includes(e.id);
    const share = e.kind === 'bundle' && e.items.length ? e.items.filter(i => !solo.has(i.id)).length / e.items.length : 1;
    // a must-have is worth 3x its full price, whatever the sliders say
    const value = own ? 0 : must ? e.price * 3 : e.price * w(e.kind) * (fav ? P.kwBoost : 1) * (rare ? rareMul : 1) * share;
    return { e, out, fav, rare, own, must, value, share };
  }).filter(x => x.out > 0);

  // a normal future day: average new arrivals by type, weighted by your taste
  const B = Object.entries(D.base.mean).reduce((s, [k, v]) => s + v * w(k), 0);
  // weekday-specific average for your taste (falls back to the overall average with < 6 samples)
  const taste = byKind => Object.entries(byKind).reduce((t, [k, v]) => t + v * w(k), 0);
  const poolVals = D.base.byWd.map(list => list.map(taste));
  const Bwd = poolVals.map(v => v.length >= 6 ? v.reduce((a, b) => a + b, 0) / v.length : B);
  const wdOf = i => (dt(i).getUTCDay() + 6) % 7;

  const events = D.events.filter(e => e.extraVbucks > 0 || e.fromHistory).map(e => {
    const conf = R.confidence[e.status] ?? 0.2;
    const interest = (P.ev[e.id] ?? 5) / 5;
    // value for your taste: from past shops by item type when available, else the author estimate valued like outfits
    const val = e.fromHistory ? taste(e.fromHistory.byKind) : e.extraVbucks * w('outfit');
    const raw = e.fromHistory ? Object.values(e.fromHistory.byKind).reduce((a, b) => a + b, 0) : e.extraVbucks;
    return { e, a: idx(e.from), b: idx(e.to), conf, interest, val, raw, full: val * conf * interest };
  });

  function score(s) {
    const W = []; for (let i = s; i < s + dur; i++) W.push(i);
    const ok = W.filter(i => valid(i) && plays(i));
    const okSet = new Set(ok);
    const rows = []; let shop = 0, fresh = 0, ev = 0;
    // 1) today's shop
    let sidekick = null;
    for (const x of items) {
      const claim = ok.filter(i => i < x.out);
      const hit = claim.length > 0 && x.value > 0;
      const r = { type: 'item', x, hit, claim, v: hit ? x.value : 0 };
      if (hit && x.e.kind === 'sidekick') { if (!sidekick || sidekick.v < r.v) { if (sidekick) { sidekick.hit = false; sidekick.why = 'Only one new Sidekick counts'; sidekick.v = 0; } sidekick = r; } else { r.hit = false; r.v = 0; r.why = 'Only one new Sidekick counts'; } }
      if (!r.hit && !r.why) r.why = x.own ? 'You own it' : x.share === 0 ? 'All its items are also sold separately' : x.value === 0 ? 'Worth 0 to you' : s >= x.out ? `Leaves ${fmt(x.out)}, before your window` : 'No play day while it is in the shop';
      rows.push(r);
    }
    for (const r of rows) shop += r.v;
    // 2) future normal days (today's arrivals are already in the shop)
    const st = Math.max(1, D.base.stay);
    const freshDays = W.filter(d => d >= 1 && valid(d)).filter(d => { for (let j = d; j < d + st; j++) if (okSet.has(j)) return true; return false; });
    fresh = freshDays.reduce((t, d) => t + Bwd[wdOf(d)], 0);
    // 3) expected events, scaled by how much of each falls inside your window
    const evRows = events.map(x => {
      const len = x.b - x.a + 1;
      const inside = W.filter(i => i >= x.a && i <= x.b && valid(i));
      const hit = inside.some(i => okSet.has(i));
      const cov = hit ? inside.length / len : 0;
      return { x, cov, inside, v: x.full * cov };
    });
    for (const r of evRows) ev += r.v;
    return { s, W, ok, rows, freshDays, evRows, shop, fresh, ev, tot: shop + fresh + ev };
  }
  const all = []; for (let s = startMin; s <= startMax; s++) all.push(score(s));

  // ---- uncertainty: replay the window totals under many simulated futures ----
  const U = R.uncertainty, rnd = rng(U.seed), N = U.runs;
  const allVals = poolVals.flat();
  const plays2 = i => valid(i) && plays(i);
  const sims = all.map(() => []), wins = all.map(() => 0);
  for (let r = 0; r < N; r++) {
    const scale = D.base.fallback ? Math.exp(gauss(rnd) * U.fallbackSpread) : 1;
    const day = []; for (let d = 0; d <= startMax + dur; d++) { const v = poolVals[wdOf(d)].length >= 6 ? poolVals[wdOf(d)] : allVals; day.push(v.length ? v[Math.floor(rnd() * v.length)] : B * scale); }
    const evs = events.map(x => {
      const happens = rnd() < x.conf;
      const sh = x.e.status === 'pattern' ? Math.round((rnd() * 2 - 1) * U.patternShiftDays) : 0;
      const mult = Math.exp(gauss(rnd) * (x.e.fromHistory ? U.observedSpread : U.estimateSpread));
      return { a: x.a + sh, b: x.b + sh, v: happens ? x.val * mult * x.interest : 0 };
    });
    let bestI = 0, bestV = -1;
    all.forEach((a, i) => {
      let t = a.shop;
      for (const d of a.freshDays) t += day[d];
      for (const x of evs) {
        if (!x.v) continue;
        const inside = a.W.filter(d => d >= x.a && d <= x.b && valid(d));
        if (inside.some(plays2)) t += x.v * inside.length / (x.b - x.a + 1);
      }
      sims[i].push(t); if (t > bestV) { bestV = t; bestI = i; }
    });
    wins[bestI]++;
  }
  all.forEach((a, i) => { const v = sims[i].sort((x, y) => x - y); a.p10 = v[Math.floor(N * .1)]; a.p50 = v[Math.floor(N * .5)]; a.p90 = v[Math.floor(N * .9)]; a.pBest = wins[i] / N; });
  return { win, startMin, startMax, deadIdx, dur, all, items, B, Bwd, poolVals, taste, events, kws, rareMul, U };
}

// ---------- rendering ----------
// render(false) = only the selected day changed: reuse the last model (fast enough for dragging)
function render(recompute = true) {
  const M = recompute || !render.M ? (render.M = model()) : render.M;
  if (!M) { $('vDay').textContent = 'No open activation window'; return; }
  const { all, win, deadIdx, dur } = M;
  const max = Math.max(...all.map(a => Math.max(a.tot, a.p90)), 1);
  const rank = [...all].sort((a, b) => b.tot - a.tot || a.s - b.s);
  const best = rank[0].s; if (sel === null || sel < M.startMin || sel > M.startMax) sel = best;
  const cur = all.find(a => a.s === sel);
  const pct = x => Math.round(x / rank[0].tot * 100);

  $('bars').innerHTML = all.map(a => `<button class="col" data-s="${a.s}" aria-label="${fmtL(a.s)}: about ${n0(a.tot)} V-Bucks, likely ${n0(a.p10)} to ${n0(a.p90)}, best in ${Math.round(a.pBest * 100)}% of simulations"><span class="bar${a.s === best ? ' best' : ''}${a.s === sel ? ' sel' : ''}${a.s + dur > deadIdx ? ' late' : ''}" style="height:${Math.max(3, a.tot / max * 100)}%"></span><span class="wh" style="bottom:${a.p10 / max * 100}%;height:${Math.max(1, (a.p90 - a.p10) / max * 100)}%"></span>${a.s === best ? `<span class="x" style="bottom:calc(${Math.max(a.tot, a.p90) / max * 100}% + 2px)">X</span>` : ''}</button>`).join('');
  const every = all.length > 40 ? 10 : 5;
  $('ticks').innerHTML = all.map((a, i) => `<span>${i % every === 0 ? fmt(a.s) : ''}</span>`).join('');
  $('vDay').textContent = best === 0 ? 'Activate today' : 'Activate ' + fmtL(best);
  if (render.lastBest !== undefined && render.lastBest !== best) { const v = document.querySelector('.verdict'); v.classList.remove('pop'); void v.offsetWidth; v.classList.add('pop'); }
  render.lastBest = best;
  $('vWhen').textContent = (best === 0 ? 'Now' : `At ${resetLocal}, after the shop reset`) + ` · ends ${fmtL(best + dur)}` + (best + dur > deadIdx ? ' (past the deadline, unconfirmed)' : '');
  const pb = Math.round(rank[0].pBest * 100), close = rank.slice(1, 4).filter(a => a.p90 >= rank[0].p10).length;
  $('vSure').innerHTML = `~${n0(rank[0].tot)} V-Bucks of loot · <b>${pb}% sure</b>` + (pb < 30 ? ' · close race, any top day is fine' : '');
  const often = [...all].sort((a, b) => b.pBest - a.pBest)[0];
  if (often.s !== best) $('vSure').innerHTML += ` · safer: ${fmtL(often.s)}`;
  const bestRow = all.find(a => a.s === best), missed = bestRow.rows.filter(r => r.x.must && !r.hit);
  const mustN = M.items.filter(x => x.must).length;
  if (mustN) $('vSure').innerHTML += missed.length ? `<br><span class="warn">Misses must-have: ${missed.map(r => esc(r.x.e.name)).join(', ')}</span>` : `<br><span class="good">Gets all ${mustN} must-have${mustN > 1 ? 's' : ''}</span>`;
  $('alts').innerHTML = '<small>Close calls:</small>' + rank.slice(1, 4).map(a => `<button class="chip" data-s="${a.s}">${fmtL(a.s)} · ${pct(a.tot)}%</button>`).join('');

  // voyage
  const H = M.startMax + dur + 1, tp = i => Math.max(0, Math.min(100, i / H * 100));
  const leave = {}; for (const x of M.items) if (x.value > 0 && x.out < H) (leave[x.out] ||= []).push(x);
  // merge bubbles that would overlap on narrow screens (each needs ~24px)
  const tw = $('track').clientWidth || 600, gapDays = Math.ceil(24 / (tw / H));
  const groups = []; for (const d of Object.keys(leave).map(Number).sort((a, b) => a - b)) { const g = groups.at(-1); if (g && d - g.d < gapDays && (g.d > sel) === (d > sel)) g.xs.push(...leave[d]); else groups.push({ d, xs: [...leave[d]] }); }
  const shownEv = D.events.filter(e => e.extraVbucks > 0 || e.fromHistory);
  $('vTitle').textContent = `Your 14 days: ${fmt(sel)} – ${fmt(sel + dur - 1)}`;
  $('vScore').textContent = `~${n0(cur.tot)} V-Bucks`;
  $('selInfo').textContent = sel === best ? `Showing the best day, ${fmtL(sel)}` : `Showing ${fmtL(sel)} · ${pct(cur.tot)}% of the best day`;
  render.tipFor = s => { const a = all.find(x => x.s === s); return `<b>${fmtL(s)}</b><br>~${n0(a.tot)} V-Bucks<br>likely ${n0(a.p10)}–${n0(a.p90)}<br>${a.s === best ? 'best day' : pct(a.tot) + '% of best'}`; };
  $('track').innerHTML = `<div class="win" style="left:${tp(sel)}%;width:${tp(dur)}%"></div><div class="dl" style="left:${tp(deadIdx)}%"><b>Deadline</b></div><div class="today" style="left:0"><b>Today</b></div>` +
    `<div class="row">${groups.map(({ d, xs }) => `<span class="tick ${d > sel ? '' : 'out'}" style="left:${tp(d)}%" title="${xs.length} item${xs.length > 1 ? 's' : ''} you want leave from ${fmt(d)}: ${esc(xs.slice(0, 5).map(x => x.e.name).join(', '))}${xs.length > 5 ? '…' : ''}">${xs.length}</span>`).join('')}</div>` +
    shownEv.map(e => { const a = idx(e.from), b = idx(e.to), r = cur.evRows.find(r => r.x.e.id === e.id); return `<div class="row"><div class="ev ${r && r.v > 0 ? 'in' : 'out'}" style="left:${tp(a)}%;width:max(${Math.min(tp(b - a + 1), 100 - tp(a))}%,28px);background:${e.extraVbucks ? '#7fe3c6' : '#cfe3ff'}" title="${esc(e.name)}">${esc(e.name)}</div></div>`; }).join('');
  $('evlist').innerHTML = shownEv.map(e => { const r = cur.evRows.find(r => r.x.e.id === e.id); return `<li class="${r && r.v > 0 ? 'in' : ''}"><b>${esc(e.name)}</b> ${fmt(idx(e.from))}–${fmt(idx(e.to))}${r && r.v > 0 ? ' · in your days' : ''}</li>`; }).join('');
  const ax = []; for (let i = 0; i < H; i += 7) ax.push(i);
  $('axis').innerHTML = ax.map(i => `<span style="left:${tp(i)}%">${fmt(i)}</span>`).join('');

  // the math for the selected day
  $('mathTitle').textContent = `The math for ${fmt(sel)}`;
  $('sum').innerHTML = [[cur.tot, `Expected total (likely ${n0(cur.p10)} to ${n0(cur.p90)})`], [cur.shop, "From today's shop"], [cur.fresh, 'From new items later'], [cur.ev, 'From expected events']].map(([v, l]) => `<div><b>${n0(v)}</b><span>${l}</span></div>`).join('');
  const rows = [];
  const zero = cur.rows.filter(r => !r.hit && r.x.value === 0);
  for (const r of [...cur.rows].filter(r => !zero.includes(r)).sort((a, b) => b.hit - a.hit || b.x.value - a.x.value)) {
    const x = r.x, parts = [`${n0(x.e.price)}`, `${P.types[x.e.kind] ?? 2}/10`]; if (x.fav) parts.push(P.kwBoost); if (x.rare) parts.push(M.rareMul.toFixed(1)); if (x.share < 1) parts.push(x.share.toFixed(2));
    rows.push(`<tr class="${r.hit ? '' : 'miss'}"><td data-l="What">${esc(x.e.name)} <span class="fine">${KINDS[x.e.kind] || x.e.kind}</span></td><td data-l="Inputs">${n0(x.e.price)} V-Bucks · weight ${P.types[x.e.kind] ?? 2}${x.fav ? ` · favourite "${esc(x.fav)}" ×${P.kwBoost}` : ''}${x.rare ? ` · rare return ×${M.rareMul.toFixed(1)}` : ''}${x.share < 1 ? ` · ${Math.round(x.share * 100)}% of items not sold separately` : ''} · in shop until ${fmt(x.out - 1)}</td><td data-l="Calculation">${r.hit ? `<code>${parts.join(' × ')}</code>` : esc(r.why)}</td><td class="num" data-l="V-Bucks">${r.hit ? n0(r.v) : '0'}</td></tr>`);
  }
  if (zero.length) rows.push(`<tr class="miss"><td data-l="What">${zero.length} items worth 0 to you</td><td data-l="Inputs">${esc(zero.slice(0, 6).map(r => r.x.e.name).join(', '))}${zero.length > 6 ? '…' : ''}</td><td data-l="Calculation">Type weight 0 or marked as owned</td><td class="num" data-l="V-Bucks">0</td></tr>`);
  rows.push(`<tr><td data-l="What">New items on later days</td><td data-l="Inputs">${cur.freshDays.length} shop days you can reach · ${n0(M.B)} per day for your taste</td><td data-l="Calculation"><code>${cur.freshDays.length} × ${n0(M.B)}</code></td><td class="num" data-l="V-Bucks">${n0(cur.fresh)}</td></tr>`);
  for (const r of cur.evRows) rows.push(`<tr class="${r.v > 0 ? '' : 'miss'}"><td data-l="What">${esc(r.x.e.name)}</td><td data-l="Inputs">${n0(r.x.val)} for your taste${r.x.e.fromHistory ? ' (from past shops)' : ' (estimate)'} · ${r.x.e.status} ×${r.x.conf} · interest ×${r.x.interest.toFixed(1)} · ${r.inside.length} of ${r.x.b - r.x.a + 1} days inside</td><td data-l="Calculation"><code>${n0(r.x.val)} × ${r.x.conf} × ${r.x.interest.toFixed(1)} × ${r.cov.toFixed(2)}</code></td><td class="num" data-l="V-Bucks">${n0(r.v)}</td></tr>`);
  const itemRows = rows.length - 1 - cur.evRows.length; // item rows come first, then later days, then events
  const keep = render.allMath ? rows : [...rows.slice(0, Math.min(12, itemRows)), ...(itemRows > 12 ? [`<tr class="miss"><td colspan="4">${itemRows - 12} more items…</td></tr>`] : []), ...rows.slice(itemRows)];
  $('mtab').tBodies[0].innerHTML = keep.join('');
  $('mathMore').hidden = render.allMath || itemRows <= 12;

  // reminder + plan
  const d = dt(sel), ds = d.toISOString().slice(0, 10).replace(/-/g, '');
  $('gcal').href = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent('Activate Fortnite Pirate Shop Access')}&dates=${ds}T000500Z/${ds}T003500Z&details=${encodeURIComponent('Item Shop > Plunder the Item Shop > Activate Now. Claim every day you play for 14 days.\n' + location.href.split('#')[0])}`;
  render.plan = `Pirate Shop plan: activate ${fmtL(sel)} after the 00:00 UTC reset (${resetLocal} my time). Access ends ${fmtL(sel + dur)}. Expected haul ~${n0(cur.tot)} V-Bucks of wanted items: ` + cur.rows.filter(r => r.hit).map(r => r.x.e.name).join(', ') + '.';

  // shop grid
  const hitIds = new Set(cur.rows.filter(r => r.hit).map(r => r.x.e.id));
  const F = render.filter || (render.filter = { q: '', kind: 'all', mine: false });
  const kindsHere = [...new Set(M.items.map(x => x.e.kind))].sort((a, b) => M.items.filter(x => x.e.kind === b).length - M.items.filter(x => x.e.kind === a).length);
  $('shopKinds').innerHTML = ['all', ...kindsHere].map(k => `<button type="button" class="fchip${F.kind === k ? ' on' : ''}" data-k="${k}">${k === 'all' ? 'All' : KINDS[k] || k}</button>`).join('');
  const q = F.q.trim().toLowerCase();
  const filtered = [...M.items].filter(x => (F.kind === 'all' || x.e.kind === F.kind) && (!F.mine || hitIds.has(x.e.id)) && (!q || x.e.name.toLowerCase().includes(q)))
    .sort((a, b) => b.must - a.must || b.value - a.value);
  const shown = render.allShop ? filtered : filtered.slice(0, 20);
  $('shopMore').hidden = render.allShop || filtered.length <= 20; $('shopMore').textContent = `Show all ${filtered.length}`;
  $('shopgrid').innerHTML = shown.length ? shown.map(x => `<article class="item${x.own ? ' own' : ''}${x.must ? ' must' : ''}${hitIds.has(x.e.id) ? ' hit' : ''}"><div class="img">${x.e.image ? `<img loading="lazy" src="${esc(x.e.image)}" alt="" onerror="this.remove()">` : esc(x.e.name)}<button type="button" class="heart" data-must="${esc(x.e.id)}" aria-pressed="${x.must}" aria-label="Must have ${esc(x.e.name)}"><svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg></button></div><div class="bd"><span class="nm">${esc(x.e.name)}</span><span class="mt">${KINDS[x.e.kind] || x.e.kind} · last day ${fmt(x.out - 1)}${x.e.gap === 'unseen' ? ' · not seen since ' + fmt(idx(D.shop.historyFrom || '2026-05-02')) : typeof x.e.gap === 'number' && x.e.gap > 1 ? ` · back after ${x.e.gap} days` : ''}</span><span class="vb">${n0(x.e.price)} V-Bucks · worth ${n0(x.value)} to you${x.must ? ' (must-have)' : ''}</span></div><label><input type="checkbox" data-own="${esc(x.e.id)}" ${x.own ? 'checked' : ''}>I already own this</label></article>`).join('') : '<p class="hint">Nothing matches.</p>';
  $('shopNote').textContent = `${filtered.length} of ${M.items.length} offers · gold border = in your 14 days · heart = must-have`;

  formula(M); limits(M); pastShops(M);
}

function formula(M) {
  const b = D.base, fb = b.fallback;
  const kindRows = Object.entries(b.mean).filter(([, v]) => v > 0).map(([k, v]) => `<code>${KINDS[k] || k}: ${n0(v)} × ${P.types[k] ?? 2}/10</code>`).join(' ');
  const wdN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  $('formula').innerHTML = `
  <div class="card"><h3>1. Item value</h3><p><code>price × weight/10 × favourite ×${P.kwBoost} × rare ×${M.rareMul.toFixed(1)}</code></p><p>Favourite = a word from your list is in the name, set or artist. Rare = not in the shop for 6+ months (checked against the archive since ${fmt(idx(D.shop.historyFrom || '2026-05-02'))}). Owned items count 0.</p></div>
  <div class="card"><h3>2. Today's shop</h3><p>An item counts if you play at least once inside your 14 days and before it leaves. Only the best new Sidekick counts.</p></div>
  <div class="card"><h3>3. Later days</h3><p>Each later day adds the average new loot of that weekday in past shops, for your taste: ${M.Bwd.map((v, i) => `<code>${wdN[i]} ${n0(v)}</code>`).join(' ')}</p><p>${b.fallback ? 'No archive yet: a fallback guess from config/rules.json.' : `${b.n} past days (${fmt(idx(b.windowFrom))} to ${fmt(idx(b.windowTo))}). Items stay about ${b.stay} days (${b.stayFrom}), so a day counts if you play within that time.`}</p></div>
  <div class="card"><h3>4. Events</h3><p><code>value for your taste × confidence × interest/5 × share of event days inside</code></p><p>Chapter 8 is sized from the last season launch week in the archive. Other events are author estimates. Confidence: ${Object.entries(D.rules.confidence).map(([k, v]) => `${k} ${v}`).join(', ')}.</p></div>
  <div class="card"><h3>5. Window</h3><p>${M.dur} days from activation, activation before ${esc(M.win.deadlineText)}. Days after the deadline count: ${P.late ? 'yes' : 'no'}. Play days: ${wdN.filter((_, i) => P.days[i]).join(', ') || 'none'}.</p></div>
  <div class="card"><h3>6. Uncertainty</h3><p>${M.U.runs} simulated futures (seed ${M.U.seed}). In each: later days are random real past days of the same weekday, events happen with their confidence as probability, pattern events shift ±${M.U.patternShiftDays} days, event sizes vary. Whiskers = 10th to 90th percentile.</p></div>
  <div class="card"><h3>7. The pick</h3><p>The start day with the highest expected total wins; ties go to the earlier day. An estimate of value to you, not a promise of what Epic will sell.</p></div>`;
}

function pastShops(M) {
  const b = D.base, wdN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  if (b.fallback) { $('pastLead').textContent = 'No past shops loaded yet.'; return; }
  const avg = M.Bwd.reduce((a, c) => a + c, 0) / 7, top = M.Bwd.indexOf(Math.max(...M.Bwd)), low = M.Bwd.indexOf(Math.min(...M.Bwd));
  $('pastLead').innerHTML = `A normal day adds about <b>${n0(avg)} V-Bucks</b> of new loot for your taste. <b>${wdN[top]}</b> is usually the richest day, <b>${wdN[low]}</b> the leanest.`;
  const mx = Math.max(...M.Bwd, 1);
  $('wdbars').innerHTML = M.Bwd.map((v, i) => `<div class="wdrow${i === top ? ' top' : ''}${render.wdHl === i ? ' hl' : ''}" data-wd="${i}" role="button" tabindex="0" aria-pressed="${render.wdHl === i}"><span>${wdN[i]}</span><div class="wdtrack"><div class="wdfill" style="width:${v / mx * 100}%"></div></div><b>${n0(v)}</b></div>`).join('');
  const days = (b.days || []), vals = days.map(d => M.taste(d.byKind));
  const el = $('spark'), W = el.clientWidth || 500, H = 160, pad = 4, vmax = Math.max(...vals, 1);
  const x = i => pad + i / Math.max(1, days.length - 1) * (W - 2 * pad), y = v => H - 18 - v / vmax * (H - 30);
  const pts = vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const res = days.map((d, i) => d.reserved ? i : -1).filter(i => i >= 0);
  const months = days.map((d, i) => d.date.endsWith('-01') ? i : -1).filter(i => i >= 0);
  const hl = render.wdHl;
  const dots = hl === undefined ? '' : days.map((d, i) => (new Date(d.date + 'T00:00:00Z').getUTCDay() + 6) % 7 === hl ? `<circle cx="${x(i).toFixed(1)}" cy="${y(vals[i]).toFixed(1)}" r="3.5" fill="#e39b00"/>` : '').join('');
  render.spark = { days, vals, x, y, W, H };
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="New loot per past day">
    ${res.length ? `<rect x="${x(res[0]) - 2}" y="4" width="${x(res.at(-1)) - x(res[0]) + 4}" height="${H - 22}" fill="#ffc83d44" rx="4"/>` : ''}
    <line x1="0" x2="${W}" y1="${y(avg)}" y2="${y(avg)}" stroke="#ff6b57" stroke-dasharray="5 4" stroke-width="1.5"/>
 <text x="${pad}" y="12" font-size="11" fill="currentColor">${n0(vmax)}</text>
    <polyline points="${pts}" fill="none" stroke="#0f6b6f" stroke-width="1.6" stroke-linejoin="round"/>${dots}
    <g class="cross" visibility="hidden"><line y1="4" y2="${H - 18}" stroke="currentColor" stroke-width="1"/><circle r="4.5" fill="#ffc83d" stroke="#fff" stroke-width="2"/></g>
    ${months.map(i => `<text x="${x(i)}" y="${H - 3}" font-size="11" fill="currentColor" text-anchor="middle">${new Date(days[i].date + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })}</text>`).join('')}
  </svg>`;
  $('pastSrc').innerHTML = `${b.n} days, ${fmt(idx(b.windowFrom))} to ${fmt(idx(b.windowTo))}, from the <a href="${esc(b.source)}">Fortnite-Datamining shop archive</a>. Updated daily.`;
}

function limits(M) {
  const b = D.base, est = D.events.filter(e => e.extraVbucks > 0 && !e.fromHistory);
  const L = [
    ['The future shop is unknown', `Epic doesn't publish it. Later days are averages of ${b.fallback ? 'a rough guess' : `${b.n} past days`}, not real items. A surprise drop can change the best day.`],
    ['Past is not future', 'The archive covers only about six months. Patterns like weekday swings may not hold, and one season launch is a small sample.'],
    ['Some event values are guesses', est.length ? `${est.map(e => `${esc(e.name)} ${n0(e.extraVbucks)} V-Bucks`).join(', ')}: author assumptions with no past data behind them.` : 'All event values come from past shops.'],
    ['Event dates may move', 'Pattern events are dated from past years. The simulation shifts them a few days; real events can move further or not happen.'],
    ['Token rules come from news reports', 'The 14 days, the deadline and the exclusions come from gaming sites, not Epic. Check your own token in-game.'],
    ['Late activation is unconfirmed', 'Nobody knows for sure whether days after Dec 15 count.'],
    ['Data is unofficial', 'fortnite-api.com and the shop archive are fan projects. Leave dates and prices can change.'],
    ['Value is not money', 'Loot is list price scaled by your taste, to compare days. The ranges only cover what is modelled.']
  ];
  $('limits').innerHTML = L.map(([h, t]) => `<div class="card"><h3>${h}</h3><p>${t}</p></div>`).join('');
}

function sources() {
  const m = D.meta || {}, fail = (m.fetches || []).filter(f => !f.ok).length;
  $('health').innerHTML = `<div class="health">
    <div><b>${m.generatedAt ? new Date(m.generatedAt).toLocaleString() : 'unknown'}</b><span class="fine">Last scheduled data run${m.fixture ? ' (offline test data)' : ''}</span></div>
    <div><b>${D.shop.shopDate || '?'} ${D.live ? '· live' : ''}</b><span class="fine">${D.liveNote}</span></div>
    <div><b>${D.base.n || 0} past shop days</b><span class="fine">From the shop archive</span></div>
    <div><b class="${fail ? 'bad' : 'okc'}">${fail ? fail + ' failed' : 'All OK'}</b><span class="fine">${(m.fetches || []).length} requests on the last run</span></div></div>`;
  const srcList = ss => ss.length ? ss.map(s => `<div><a href="${esc(s.url)}" rel="noopener">${esc(new URL(s.url).hostname)}</a> ${s.reachable === false ? '<span class="bad">unreachable</span>' : (s.found || []).map(f => `<span class="${f.ok ? 'okc' : 'bad'}">${f.ok ? '✓' : '✗'} "${esc(f.text)}"</span>`).join(' ')}${s.changedSinceLastCheck ? ' <span class="fine">page changed since previous check</span>' : ''}${s.checkedAt ? ` <span class="fine">checked ${new Date(s.checkedAt).toLocaleDateString()}</span>` : ''}</div>`).join('') : '<span class="fine">No source: author assumption</span>';
  $('facts').tBodies[0].innerHTML = (D.rules.facts || []).map(f => `<tr><td data-l="Rule">${esc(f.text)}</td><td data-l="Status"><span class="st ${f.status}">${f.status}</span></td><td data-l="Sources">${srcList(f.sources || [])}</td></tr>`).join('');
  $('statusRules').innerHTML = (D.rules.statusRules || []).map(esc).join('<br>');
  $('evtab').tBodies[0].innerHTML = D.events.map(e => `<tr><td data-l="Event">${esc(e.name)}</td><td data-l="Dates">${fmt(idx(e.from))}${e.to !== e.from ? ' to ' + fmt(idx(e.to)) : ''}</td><td data-l="Status"><span class="st ${e.status}">${e.status}</span>${e.newsHits && e.newsHits.length ? `<div class="fine">in Epic news: ${e.newsHits.map(esc).join(', ')}</div>` : ''}</td><td class="num" data-l="Extra">${e.fromHistory ? n0(Object.values(e.fromHistory.byKind).reduce((a, b) => a + b, 0)) + ' (past shops)' : n0(e.extraVbucks) + ' (estimate)'}</td><td data-l="Basis"><div>${esc(e.basis)}</div>${srcList(e.sources || [])}</td></tr>`).join('');
  $('fetches').tBodies[0].innerHTML = (m.fetches || []).map(f => `<tr><td data-l="URL">${esc(f.url)}</td><td data-l="Result" class="${f.ok ? 'okc' : 'bad'}">${f.ok ? f.status : esc(f.error || f.status)}</td><td data-l="Fingerprint"><code>${esc(f.sha256 || '–')}</code></td><td class="num" data-l="Time">${f.ms ?? '–'} ms</td></tr>`).join('');
}

function loves() {
  $('loves').innerHTML = GROUPS.map(g => { const l = levelOf(g); return `<button type="button" class="love s${l}" data-g="${g.id}" aria-label="${g.label}: ${LEVELS[l][0]}. Tap to change."><span class="lv">${LEVELS[l][0]}</span><span>${g.label}</span></button>`; }).join('');
}
function controls() {
  loves();
  $('presets').innerHTML = Object.keys(PRESETS).map(k => `<button class="pre" type="button" data-p="${k}">${k}</button>`).join('');
  const sl = (id, label, val, min, max, step = 1, hint = '') => `<div class="sl"><label for="${id}">${label}</label><output id="o_${id}">${val}</output><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}">${hint ? `<small>${hint}</small>` : ''}</div>`;
  $('types').innerHTML = Object.entries(KINDS).map(([k, l]) => sl('t_' + k, l, P.types[k] ?? 2, 0, 10)).join('');
  $('boosts').innerHTML = sl('kwBoost', 'Favourite boost', P.kwBoost, 1, 3, .5, 'Multiplier for items matching a favourite word') + sl('rare', 'Rare return bonus', P.rare, 0, 10, 1, 'Adds 10% per step for items not in the shop for 6+ months');
  $('evw').innerHTML = D.events.filter(e => e.extraVbucks > 0).map(e => sl('e_' + e.id, esc(e.name), P.ev[e.id] ?? 5, 0, 10)).join('');
  $('days').innerHTML = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, i) => `<label><input type="checkbox" data-d="${i}" ${P.days[i] ? 'checked' : ''}><span>${d}</span></label>`).join('');
  $('kw').value = P.kw; $('late').checked = P.late;
}

function bind() {
  document.querySelector('main').addEventListener('input', e => {
    const t = e.target, id = t.id;
    if (t.type === 'range') {
      const v = +t.value; $('o_' + id).textContent = v;
      if (id.startsWith('t_')) { P.types[id.slice(2)] = v; loves(); } else if (id.startsWith('e_')) P.ev[id.slice(2)] = v; else P[id] = v;
    } else if (id === 'kw') P.kw = t.value;
    else return;
    save(); render();
  });
  const pir = document.getElementById('pirate');
  const wake = () => { pir.classList.add('awake'); clearTimeout(wake.t); wake.t = setTimeout(() => pir.classList.remove('awake'), 1800); };
  pir.addEventListener('click', wake); pir.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); wake(); } });
  const tip = $('tip'), chart = tip.parentElement;
  const showTip = e => { const c = e.target.closest('.col'); if (!c || !render.tipFor) return; tip.innerHTML = render.tipFor(+c.dataset.s); tip.hidden = false;
    const r = c.getBoundingClientRect(), p = chart.getBoundingClientRect(); const x = Math.min(Math.max(r.left + r.width / 2 - p.left, 70), p.width - 70); tip.style.left = x + 'px'; };
  $('bars').addEventListener('pointerover', showTip); $('bars').addEventListener('focusin', showTip);
  $('bars').addEventListener('pointerleave', () => { tip.hidden = true; }); $('bars').addEventListener('focusout', () => { tip.hidden = true; });
  $('shopMore').addEventListener('click', () => { render.allShop = true; render(); });
  $('mathMore').addEventListener('click', () => { render.allMath = true; render(); });
  // charts inside a fold are drawn at their real width when the fold opens
  document.querySelectorAll('details.fold').forEach(d => d.addEventListener('toggle', () => { if (d.open) render(); }));
  $('loves').addEventListener('click', e => {
    const b = e.target.closest('[data-g]'); if (!b) return;
    const g = GROUPS.find(x => x.id === b.dataset.g), next = (levelOf(g) + 2) % 3; // Love > Maybe > Nope > Love
    for (const k of g.kinds) P.types[k] = LEVELS[next][1];
    save(); controls(); render();
    const nb = document.querySelector(`[data-g="${g.id}"]`); if (nb) nb.focus();
  });
  $('presets').addEventListener('click', e => { const p = e.target.dataset.p; if (!p) return; P.types = { ...PRESETS[p] }; save(); controls(); render(); });
  $('days').addEventListener('change', e => { P.days[+e.target.dataset.d] = e.target.checked ? 1 : 0; save(); render(); });
  $('late').addEventListener('change', e => { P.late = e.target.checked; save(); render(); });
  $('shopgrid').addEventListener('change', e => { const id = e.target.dataset.own; if (id == null) return; P.owned = e.target.checked ? [...new Set([...P.owned, id])] : P.owned.filter(x => x !== id); save(); render(); });
  const pick = e => { const b = e.target.closest('[data-s]'); if (!b) return; sel = +b.dataset.s; render(false); };
  // arrow keys move the selected start day
  $('bars').addEventListener('keydown', e => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return; e.preventDefault();
    const M = render.M; sel = Math.max(M.startMin, Math.min(M.startMax, sel + (e.key === 'ArrowRight' ? 1 : -1))); render(false);
    const c = document.querySelector(`.col[data-s="${sel}"]`); if (c) c.focus();
  });
  // drag the 14-day box along the timeline
  const track = $('track');
  const dayAt = ev => { const r = track.getBoundingClientRect(), M = render.M; return (ev.clientX - r.left) / r.width * (M.startMax + M.dur + 1); };
  let grab = null;
  track.addEventListener('pointerdown', ev => {
    const d = dayAt(ev); grab = d >= sel && d < sel + render.M.dur ? d - sel : render.M.dur / 2;
    track.setPointerCapture(ev.pointerId); track.classList.add('dragging'); move(ev);
  });
  const move = ev => { if (grab === null) return; const M = render.M, s = Math.round(dayAt(ev) - grab); const n = Math.max(M.startMin, Math.min(M.startMax, s)); if (n !== sel) { sel = n; render(false); } };
  track.addEventListener('pointermove', move);
  const drop = () => { grab = null; track.classList.remove('dragging'); };
  track.addEventListener('pointerup', drop); track.addEventListener('pointercancel', drop);
  track.addEventListener('keydown', e => { if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return; e.preventDefault(); const M = render.M; sel = Math.max(M.startMin, Math.min(M.startMax, sel + (e.key === 'ArrowRight' ? 1 : -1))); render(false); });
  // shop filters and must-haves
  $('shopQ').addEventListener('input', e => { render.filter.q = e.target.value; render(false); });
  $('shopKinds').addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (!b) return; render.filter.kind = b.dataset.k; render(false); });
  $('shopMine').addEventListener('change', e => { render.filter.mine = e.target.checked; render(false); });
  $('shopgrid').addEventListener('click', e => { const b = e.target.closest('[data-must]'); if (!b) return; const id = b.dataset.must; P.must = (P.must || []).includes(id) ? P.must.filter(x => x !== id) : [...(P.must || []), id]; save(); render(); });
  // past shops: hover the line, tap a weekday to mark its days
  $('spark').addEventListener('pointermove', ev => {
    const S = render.spark, svg = $('spark').querySelector('svg'); if (!S || !svg) return;
    const r = svg.getBoundingClientRect(), px = (ev.clientX - r.left) / r.width * S.W;
    const i = Math.max(0, Math.min(S.days.length - 1, Math.round((px - 4) / (S.W - 8) * (S.days.length - 1))));
    const g = svg.querySelector('.cross'); g.setAttribute('visibility', 'visible');
    g.querySelector('line').setAttribute('x1', S.x(i)); g.querySelector('line').setAttribute('x2', S.x(i));
    g.querySelector('circle').setAttribute('cx', S.x(i)); g.querySelector('circle').setAttribute('cy', S.y(S.vals[i]));
    $('sparkInfo').textContent = `${new Date(S.days[i].date + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}: ${n0(S.vals[i])} V-Bucks of new loot for you`;
  });
  $('spark').addEventListener('pointerleave', () => { const g = $('spark').querySelector('.cross'); if (g) g.setAttribute('visibility', 'hidden'); $('sparkInfo').textContent = 'Move over the line to see a day'; });
  const wdPick = e => { const r = e.target.closest('[data-wd]'); if (!r) return; const i = +r.dataset.wd; render.wdHl = render.wdHl === i ? undefined : i; render(false); };
  $('wdbars').addEventListener('click', wdPick); $('wdbars').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); wdPick(e); } });
  $('bars').addEventListener('click', pick); $('alts').addEventListener('click', pick);
  const copy = async (txt, msg) => { try { await navigator.clipboard.writeText(txt); $('copyMsg').textContent = msg; } catch (e) { $('copyMsg').textContent = txt; } };
  $('copy').addEventListener('click', () => copy(render.plan, 'Plan copied.'));
  $('share').addEventListener('click', () => copy(location.href.split('#')[0] + '#s=' + btoa(encodeURIComponent(JSON.stringify({ ...P, owned: [] }))), 'Link copied. It carries your taste, not your owned items.'));
}

// ---------- data loading ----------
async function init() {
  const [shop, base, events, rules, meta] = await Promise.all(['shop', 'baseline', 'events', 'rules', 'meta'].map(n => load(`data/${n}.json`)));
  if (!shop || !rules) { $('fresh').textContent = 'Could not load the shop data. Try again in a minute.'; return; }
  D = { shop, events: events || [], rules, meta, live: false, liveNote: 'Daily snapshot from the scheduled run' };
  const todayStr = dt(0).toISOString().slice(0, 10);
  // try a live read if the snapshot is from an older shop day
  if (!q.get('today') && shop.shopDate < todayStr) {
    try {
      const r = await fetch(SHOP_URL, { signal: AbortSignal.timeout(8000) });
      if (r.ok) { const s = normalizeShop(await r.json()); if (s.entries.length) { D.shop = s; D.live = true; D.liveNote = 'Read live from fortnite-api.com in your browser just now'; } }
    } catch (e) { D.liveNote = 'Snapshot is from an earlier shop day; the live read was blocked, so some items may have changed'; }
  }
  // baseline: past shop days (from the archive), grouped by weekday
  const b = base || {}, fb = rules.fallbacks;
  const pool = (b.days || []).filter(d => !d.reserved);
  const byWd = [[], [], [], [], [], [], []]; // Mon..Sun
  for (const d of pool) byWd[(new Date(d.date + 'T00:00:00Z').getUTCDay() + 6) % 7].push(d.byKind);
  const mean = {};
  if (pool.length) { for (const d of pool) for (const [k, v] of Object.entries(d.byKind)) mean[k] = (mean[k] || 0) + v / pool.length; }
  else Object.assign(mean, fb.baselinePerDayByKind);
  const stay = Math.max(1, Math.round(b.medianStayDays || fb.stayDays));
  D.base = { ...b, pool, byWd, mean, stay, fallback: !pool.length, n: pool.length, stayFrom: b.medianStayDays ? `the median planned stay of new offers in the archive` : 'a fallback value' };
  const age = meta && meta.generatedAt ? Math.round((Date.now() - Date.parse(meta.generatedAt)) / 36e5) : null;
  $('fresh').innerHTML = `Shop of <b>${fmt(idx(D.shop.shopDate))}</b>${age !== null ? ` · updated ${age < 1 ? 'just now' : age + ' h ago'}` : ''}${D.live ? ' · live' : ''}${meta && meta.fixture ? ' · <b>test data</b>' : ''}`;
  if (meta && meta.fixture) document.body.insertAdjacentHTML('afterbegin', '<div class="banner">Test data: this copy was built from sample files, not the real shop.</div>');
  controls(); bind(); render(); sources();
}
init();
}
