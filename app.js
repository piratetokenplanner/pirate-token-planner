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
  { id: 'outfits', icon: '<path d="M8 4l4 2 4-2 4 4-3 3v9H7v-9L4 8z"/>', label: 'Outfits & bundles', ex: 'Skins and skin sets', kinds: ['outfit', 'bundle'] },
  { id: 'emotes', icon: '<circle cx="12" cy="5" r="2"/><path d="M12 7v6M7 10l5 2 5-4M9 21l3-8 3 8"/>', label: 'Emotes', ex: 'Dances and moves', kinds: ['emote'] },
  { id: 'gear', icon: '<path d="M5 19L15 9M13 5c3-1 6 2 6 6l-4-2-2-4z"/>', label: 'Pickaxes, gliders & back blings', ex: 'Your gear', kinds: ['pickaxe', 'glider', 'backpack'] },
  { id: 'sidekick', icon: '<circle cx="7" cy="9" r="1.6"/><circle cx="17" cy="9" r="1.6"/><circle cx="10" cy="6" r="1.6"/><circle cx="14" cy="6" r="1.6"/><path d="M8 16c0-3 2-5 4-5s4 2 4 5-2 3-4 3-4 0-4-3z"/>', label: 'Sidekicks', ex: 'Pets that follow you (only 1 free)', kinds: ['sidekick'] },
  { id: 'kicks', icon: '<path d="M3 16h18v3H3zM4 16l1-7h5l2 3h4l4 4"/>', label: 'Kicks', ex: 'Shoes', kinds: ['kicks'] },
  { id: 'wraps', icon: '<path d="M4 20c4-8 8-12 16-16M8 20c3-5 6-8 12-12"/>', label: 'Wraps & contrails', ex: 'Weapon skins and trails', kinds: ['wrap', 'contrail', 'loadingscreen'] },
  { id: 'music', icon: '<path d="M9 18V6l10-2v12"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="16" r="2"/>', label: 'Jam Tracks & music', ex: 'Songs, lobby music, instruments', kinds: ['jamtrack', 'music', 'instrument'] },
  { id: 'rides', icon: '<path d="M4 15l2-5h12l2 5v3H4z"/><circle cx="8" cy="18" r="1.6"/><circle cx="16" cy="18" r="1.6"/>', label: 'Cars & LEGO', ex: 'Rocket Racing and LEGO kits', kinds: ['car', 'lego', 'other'] }
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
const DEF = { types: { ...base }, kw: '', kwBoost: 2, rare: 3, ev: {}, days: [1, 1, 1, 1, 1, 1, 1], late: true, owned: [], must: [], claimed: [], activated: null };
let P = structuredClone(DEF), sel = null;
try { Object.assign(P, JSON.parse(localStorage.getItem('ptp3') || '{}')); } catch (e) {}
if (location.hash.startsWith('#s=')) { try { Object.assign(P, JSON.parse(decodeURIComponent(atob(location.hash.slice(3))))); } catch (e) {} }
// ---------- compact share codes: #c=… carries someone's taste (and their pirate name) ----------
// format: v1 . types (one char 0-9/a per type) . play days (7 bits) . boost*2 rare late . events . favourite words . must-haves (last 10 chars of offer ids) . name
const TKEYS = ['outfit', 'bundle', 'emote', 'pickaxe', 'glider', 'backpack', 'wrap', 'sidekick', 'jamtrack', 'music', 'kicks', 'car', 'contrail', 'loadingscreen', 'lego', 'instrument', 'other'];
const b64u = t => btoa(unescape(encodeURIComponent(t))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = t => decodeURIComponent(escape(atob(t.replace(/-/g, '+').replace(/_/g, '/'))));
function shareCode(name) {
  const d = n => n >= 10 ? 'a' : String(Math.max(0, Math.round(n)));
  const parts = ['1', TKEYS.map(k => d(P.types[k] ?? 0)).join(''), P.days.join(''), `${Math.round(P.kwBoost * 2)}${d(P.rare)}${P.late ? 1 : 0}`,
    Object.entries(P.ev).map(([k, v]) => `${k}:${v}`).join(','), P.kw || '', (P.must || []).map(id => String(id).slice(-10)).join(','), name || ''];
  return b64u(parts.join('|'));
}
function readCode(code) {
  const f = unb64u(code).split('|'); if (f[0] !== '1') throw new Error('unknown version');
  const v = c => c === 'a' ? 10 : +c;
  const types = {}; TKEYS.forEach((k, i) => { if (f[1][i] !== undefined) types[k] = v(f[1][i]); });
  const ev = {}; for (const kv of (f[4] || '').split(',').filter(Boolean)) { const [k, x] = kv.split(':'); ev[k] = +x; }
  return { types, days: f[2].split('').map(Number), kwBoost: +f[3][0] / 2, rare: v(f[3][1]), late: f[3][2] === '1', ev, kw: f[5] || '', mustTail: (f[6] || '').split(',').filter(Boolean), name: f[7] || '' };
}
let shared = null;
if (location.hash.startsWith('#c=')) { try { shared = readCode(location.hash.slice(3)); shared.prev = structuredClone(P); const { mustTail, name, prev, ...rest } = shared; Object.assign(P, rest); } catch (e) { shared = null; } }
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
  // season: how the same weeks went a year earlier (same weekday, ±10 days), relative to the average day.
  // Shrunk halfway to 1, because one past year is a small sample. Needs data from a year back.
  const byDate = new Map(D.base.pool.map(d => [d.date, taste(d.byKind)]));
  const poolMean = byDate.size ? [...byDate.values()].reduce((a, b) => a + b, 0) / byDate.size : 0;
  const seasonCache = {};
  const season = i => {
    if (i in seasonCache) return seasonCache[i];
    const vs = []; for (let k = -10; k <= 10; k++) { const v = byDate.get(dt(i - 364 + k).toISOString().slice(0, 10)); if (v !== undefined) vs.push(v); }
    const f = vs.length >= 8 && poolMean ? Math.min(1.6, Math.max(0.6, 1 + 0.5 * (vs.reduce((a, b) => a + b, 0) / vs.length / poolMean - 1))) : 1;
    return (seasonCache[i] = { f, n: vs.length });
  };
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
    fresh = freshDays.reduce((t, d) => t + Bwd[wdOf(d)] * season(d).f, 0);
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
    const day = []; for (let d = 0; d <= startMax + dur; d++) { const v = poolVals[wdOf(d)].length >= 6 ? poolVals[wdOf(d)] : allVals; day.push((v.length ? v[Math.floor(rnd() * v.length)] : B * scale) * season(d).f); }
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
  return { win, startMin, startMax, deadIdx, dur, all, items, B, Bwd, poolVals, taste, events, kws, rareMul, U, season, byDate, poolMean };
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
  // both charts share one time axis (today .. last day of the latest window), so a start day sits at the same x in both
  const XH = M.startMax + dur + 1, xp = i => Math.max(0, Math.min(100, i / XH * 100));
  const bb = $('bars'); bb.style.marginLeft = xp(M.startMin) + '%'; bb.style.width = xp(M.startMax + 1 - M.startMin) + '%';
  $('barsDl').style.left = xp(deadIdx) + '%';
  const ax7 = []; for (let i = 0; i < XH; i += 7) ax7.push(i);
  $('ticks').innerHTML = ax7.map(i => `<span style="left:${xp(i)}%">${fmt(i)}</span>`).join('');
  $('vDay').textContent = best === 0 ? 'Activate today' : 'Activate ' + fmtL(best);
  // deadline notices: last week before the deadline, and the gap between the 2026 deadline and the 2027 window
  const W = D.rules.windows, wi = W.indexOf(win), prev = wi > 0 ? W[wi - 1] : null, opensIn = idx(win.opens), left = deadIdx;
  const dlLocal = new Date(win.deadline).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  let note = '';
  if (prev && opensIn > 0) note = `The ${esc(prev.label)} window closed (${esc(prev.deadlineText)}). Your ${esc(win.label)} token can be used from ${fmtL(opensIn)}: this is a first plan for it, based on past shops.`;
  else if (left <= 7) note = left <= 1 ? `Last chance: activate before ${esc(dlLocal)} (your time).` : `Only ${left} days left to activate. Deadline: ${esc(dlLocal)} (your time).`;
  $('vNote').hidden = !note; $('vNote').innerHTML = note;
  if (prev && opensIn > 0) $('vDay').textContent = 'Activate ' + fmtL(best) + ` ${dt(best).getUTCFullYear()}`;
  if (render.lastBest !== undefined && render.lastBest !== best) { const v = document.querySelector('.verdict'); v.classList.remove('pop'); void v.offsetWidth; v.classList.add('pop'); coins(); }
  render.lastBest = best;
  $('vWhen').textContent = (best === 0 ? 'Now' : `At ${resetLocal}, after the shop reset`) + ` · ends ${fmtL(best + dur)}` + (best + dur > deadIdx ? ' (past the deadline, unconfirmed)' : '');
  const pb = Math.round(rank[0].pBest * 100), close = rank.slice(1, 4).filter(a => a.p90 >= rank[0].p10).length;
  $('vSure').innerHTML = `~${n0(rank[0].tot)} V-Bucks of loot · <b>${pb}% sure</b>` + (pb < 30 ? ' · close race, any top day is fine' : '');
  const often = [...all].sort((a, b) => b.pBest - a.pBest)[0];
  if (often.s !== best) $('vSure').innerHTML += ` · safer: ${fmtL(often.s)}`;
  const bestRow = all.find(a => a.s === best), missed = bestRow.rows.filter(r => r.x.must && !r.hit);
  const mustN = M.items.filter(x => x.must).length;
  if (mustN) $('vSure').innerHTML += missed.length ? `<br><span class="warn">Misses must-have: ${missed.map(r => esc(r.x.e.name)).join(', ')}</span>` : `<br><span class="good">Gets all ${mustN} must-have${mustN > 1 ? 's' : ''}</span>`;
  $('alts').innerHTML = '<small>Close calls:</small>' + rank.slice(1, 4).map(a => `<button class="chip" data-s="${a.s}">${fmtL(a.s)} · ${(a.tot / rank[0].tot * 100).toFixed(1)}%</button>`).join('');

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
  $('sum').innerHTML = [[cur.tot, `Expected total (likely ${n0(cur.p10)}–${n0(cur.p90)} V-Bucks)`], [cur.shop, "From today's shop"], [cur.fresh, 'From new items on later days'], [cur.ev, 'From expected events']].map(([v, l]) => `<div><b>${n0(v)}<small>V-Bucks</small></b><span>${l}</span></div>`).join('');
  const rows = [];
  const zero = cur.rows.filter(r => !r.hit && r.x.value === 0);
  for (const r of [...cur.rows].filter(r => !zero.includes(r)).sort((a, b) => b.hit - a.hit || b.x.value - a.x.value)) {
    const x = r.x, parts = [`${n0(x.e.price)}`, `${P.types[x.e.kind] ?? 2}/10`]; if (x.fav) parts.push(P.kwBoost); if (x.rare) parts.push(M.rareMul.toFixed(1)); if (x.share < 1) parts.push(x.share.toFixed(2));
    rows.push(`<tr class="${r.hit ? '' : 'miss'}"><td data-l="What">${esc(x.e.name)} <span class="fine">${KINDS[x.e.kind] || x.e.kind}</span></td><td data-l="Inputs">${n0(x.e.price)} V-Bucks · weight ${P.types[x.e.kind] ?? 2}${x.fav ? ` · favourite "${esc(x.fav)}" ×${P.kwBoost}` : ''}${x.rare ? ` · rare return ×${M.rareMul.toFixed(1)}` : ''}${x.share < 1 ? ` · ${Math.round(x.share * 100)}% of items not sold separately` : ''} · in shop until ${fmt(x.out - 1)}</td><td data-l="Calculation">${r.hit ? `<code>${parts.join(' × ')}</code>` : esc(r.why)}</td><td class="num" data-l="V-Bucks">${r.hit ? n0(r.v) : '0'}</td></tr>`);
  }
  if (zero.length) rows.push(`<tr class="miss"><td data-l="What">${zero.length} items worth 0 to you</td><td data-l="Inputs">${esc(zero.slice(0, 6).map(r => r.x.e.name).join(', '))}${zero.length > 6 ? '…' : ''}</td><td data-l="Calculation">Type weight 0 or marked as owned</td><td class="num" data-l="V-Bucks">0</td></tr>`);
  rows.push(`<tr><td data-l="What">New items on later days</td><td data-l="Inputs">${cur.freshDays.length} shop days you can reach · weekday average for your taste${M.season(sel + 7).n ? ' × season factor from a year ago' : ''}</td><td data-l="Calculation"><code>sum of ${cur.freshDays.length} days ≈ ${n0(cur.fresh / Math.max(1, cur.freshDays.length))}/day</code></td><td class="num" data-l="V-Bucks">${n0(cur.fresh)}</td></tr>`);
  for (const r of cur.evRows) rows.push(`<tr class="${r.v > 0 ? '' : 'miss'}"><td data-l="What">${esc(r.x.e.name)}</td><td data-l="Inputs">${n0(r.x.val)} for your taste${r.x.e.fromHistory ? ' (from past shops)' : ' (estimate)'} · ${r.x.e.status} ×${r.x.conf} · interest ×${r.x.interest.toFixed(1)} · ${r.inside.length} of ${r.x.b - r.x.a + 1} days inside</td><td data-l="Calculation"><code>${n0(r.x.val)} × ${r.x.conf} × ${r.x.interest.toFixed(1)} × ${r.cov.toFixed(2)}</code></td><td class="num" data-l="V-Bucks">${n0(r.v)}</td></tr>`);
  const itemRows = rows.length - 1 - cur.evRows.length; // item rows come first, then later days, then events
  const keep = render.allMath ? rows : [...rows.slice(0, Math.min(12, itemRows)), ...(itemRows > 12 ? [`<tr class="miss"><td colspan="4">${itemRows - 12} more items…</td></tr>`] : []), ...rows.slice(itemRows)];
  $('mtab').tBodies[0].innerHTML = keep.join('');
  $('mathMore').hidden = render.allMath || itemRows <= 12;

  // reminder + plan
  const d = dt(sel), ds = d.toISOString().slice(0, 10).replace(/-/g, '');
  render.cal = { title: 'Activate Fortnite Pirate Shop Access', start: T0 + sel * DAY + 5 * 60e3, mins: 30, details: 'Item Shop > Plunder the Item Shop > Activate Now. Claim every day you play for 14 days. ' + location.href.split('#')[0] };
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
  $('shopgrid').innerHTML = shown.length ? shown.map(x => `<article data-r="${esc(rarityOf(x.e))}" class="item${x.own ? ' own' : ''}${x.must ? ' must' : ''}${hitIds.has(x.e.id) ? ' hit' : ''}"><div class="img">${x.e.image ? `<img loading="lazy" src="${esc(x.e.image)}" alt="" onerror="this.remove()">` : esc(x.e.name)}<button type="button" class="heart" data-must="${esc(x.e.id)}" aria-pressed="${x.must}" aria-label="Must have ${esc(x.e.name)}"><svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg></button></div><div class="bd"><span class="nm">${esc(x.e.name)}</span><span class="mt">${KINDS[x.e.kind] || x.e.kind} · last day ${fmt(x.out - 1)}${x.e.gap === 'unseen' ? ' · not seen since ' + fmt(idx(D.shop.historyFrom || '2026-05-02')) : typeof x.e.gap === 'number' && x.e.gap > 1 ? ` · back after ${x.e.gap} days` : ''}</span><span class="vb">${n0(x.e.price)} V-Bucks · worth ${n0(x.value)} to you${x.must ? ' (must-have)' : ''}</span></div><label><input type="checkbox" data-own="${esc(x.e.id)}" ${x.own ? 'checked' : ''}>I already own this</label></article>`).join('') : '<p class="hint">Nothing matches.</p>';
  $('shopNote').textContent = `${filtered.length} of ${M.items.length} offers · gold border = in your 14 days · heart = must-have`;

  formula(M); limits(M); pastShops(M); activeMode(M); if (render.back) backSearch();
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
  const span = Math.round((Date.parse(b.windowTo) - Date.parse(b.windowFrom)) / DAY) + 1;
  const s0 = M.season(sel + 7);
  const seasonTxt = s0.n ? (() => { const pc = Math.round((s0.f - 1) * 2 * 100); return ` The same weeks a year ago were <b>${Math.abs(pc)}% ${pc >= 0 ? 'richer' : 'leaner'}</b> than an average day, so the forecast leans ${pc >= 0 ? 'up' : 'down'} a little.`; })() : '';
  $('pastLead').innerHTML = `A normal day adds about <b>${n0(avg)} V-Bucks</b> of new loot for your taste. <b>${wdN[top]}</b> is usually the richest day, <b>${wdN[low]}</b> the leanest.${seasonTxt}`;
  // coverage meter: seasons can only be compared with a full year
  const cov = Math.min(1, span / 365);
  $('pastCov').innerHTML = `<div class="covbar"><div style="width:${cov * 100}%"></div></div><span>${span >= 365 ? `${span} days of history: a full year, so seasons can be compared` : `${span} of 365 days of history. Seasons can be compared once a full year is loaded.`}</span>`;
  const mx = Math.max(...M.Bwd, 1);
  $('wdbars').innerHTML = M.Bwd.map((v, i) => `<div class="wdrow${i === top ? ' top' : ''}"><span>${wdN[i]}</span><div class="wdtrack"><div class="wdfill" style="width:${v / mx * 100}%"></div></div><b>${n0(v)}</b></div>`).join('');
  // one line per calendar year, weekly averages, so years sit on top of each other
  const years = {};
  for (const [date, v] of M.byDate) { const y = date.slice(0, 4), doy = Math.floor((Date.parse(date) - Date.UTC(+y, 0, 1)) / DAY), wk = Math.min(51, Math.floor(doy / 7)); ((years[y] ||= {})[wk] ||= []).push(v); }
  const ys = Object.keys(years).sort(), series = ys.map(y => ({ y, pts: Object.entries(years[y]).map(([wk, vs]) => [+wk, vs.reduce((a, c) => a + c, 0) / vs.length]).filter(([, , n]) => true).sort((a, c) => a[0] - c[0]) }));
  const el = $('spark'), W = el.clientWidth || 500, H = 190, L = 8, R = 8, vmax = Math.max(1, ...series.flatMap(s => s.pts.map(p => p[1])));
  const x = wk => L + wk / 51 * (W - L - R), y = v => H - 22 - v / vmax * (H - 40);
  const cols = series.map((_, k) => k === series.length - 1 ? 'var(--main)' : ['#9fb7d9', '#e39b00'][k % 2]);
  const path = pts => { let d = '', prev = -9; for (const [wk, v] of pts) { d += `${wk - prev > 1 ? 'M' : 'L'}${x(wk).toFixed(1)},${y(v).toFixed(1)} `; prev = wk; } return d; };
  const mo = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
  const nowWk = Math.min(51, Math.floor((T0 - Date.UTC(dt(0).getUTCFullYear(), 0, 1)) / DAY / 7));
  const band = (a, c, label) => `<rect x="${x(a)}" y="6" width="${Math.max(4, x(c) - x(a))}" height="${H - 28}" fill="#ffc83d33" rx="4"/><text x="${x(a) + 3}" y="16" font-size="10" fill="currentColor">${label}</text>`;
  render.spark = { series, x, y, W, H, ys };
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="Weekly new loot, one line per year">
    ${band(44, 51, 'Winterfest')}
    <line x1="${x(nowWk)}" x2="${x(nowWk)}" y1="6" y2="${H - 22}" stroke="currentColor" stroke-dasharray="3 3" opacity=".6"/><text x="${x(nowWk) - 3}" y="${H - 26}" font-size="10" text-anchor="end" fill="currentColor">today</text>
    ${series.map((s, k) => `<path d="${path(s.pts)}" fill="none" stroke="${cols[k]}" stroke-width="${k === series.length - 1 ? 2.6 : 2}" stroke-linejoin="round" stroke-linecap="round"/>`).join('')}
    ${mo.map((m, i) => `<text x="${x(i * 52 / 12)}" y="${H - 6}" font-size="11" fill="currentColor">${m}</text>`).join('')}
    <g class="cross" visibility="hidden"><line y1="6" y2="${H - 22}" stroke="currentColor" stroke-width="1"/></g>
  </svg>`;
  $('yearKey').innerHTML = series.map((s, k) => `<span><i class="sw" style="background:${cols[k]};height:4px"></i>${s.y}</span>`).join('') + '<span><i class="sw sw-launch"></i>Winterfest weeks</span>';
  const srcs = (D.pastSources || []).map(x => `<a href="${esc(x.url)}">${esc(x.name)}</a>`).join(' and ');
  $('pastAttr').innerHTML = srcs ? `past shops from ${srcs}${(D.pastSources || []).some(x => x.name === 'itemshop.gg') ? ' (Data from itemshop.gg)' : ''}` : '';
  $('pastSrc').innerHTML = `${b.n} days, ${fmt(idx(b.windowFrom), { day: 'numeric', month: 'short', year: 'numeric' })} to ${fmt(idx(b.windowTo))}${srcs ? `, from ${srcs}` : ''}.${(D.pastSources || []).some(x => x.name === 'itemshop.gg') ? ' Data from <a href="https://itemshop.gg">itemshop.gg</a>.' : ''}`;
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
  $('loves').innerHTML = GROUPS.map(g => { const l = levelOf(g); return `<button type="button" class="love s${l}" data-g="${g.id}" aria-label="${g.label}: ${LEVELS[l][0]}. Tap to change."><span class="lvrow"><span class="lv">${LEVELS[l][0]}</span><svg class="gi" viewBox="0 0 24 24" aria-hidden="true">${g.icon}</svg></span><span>${g.label}</span></button>`; }).join('');
}
// a little burst of gold coins from the X when the best day changes
function coins() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const x = document.querySelector('.xmark'); if (!x) return;
  for (let i = 0; i < 9; i++) {
    const c = document.createElement('i'); c.className = 'coinfx';
    const a = Math.PI * (1.1 + Math.random() * 0.8), r = 60 + Math.random() * 60;
    c.style.setProperty('--dx', Math.cos(a) * r + 'px'); c.style.setProperty('--dy', Math.sin(a) * r + 'px'); c.style.animationDelay = i * 25 + 'ms';
    x.appendChild(c); setTimeout(() => c.remove(), 900);
  }
}
// what a 0-10 weight means, in words
const WORD = v => v <= 0 ? 'skip' : v <= 2 ? 'barely' : v <= 4 ? 'maybe' : v <= 6 ? 'like' : v <= 8 ? 'want' : 'love';
const EVWORD = v => v <= 0 ? 'ignore' : v < 5 ? 'less' : v === 5 ? 'neutral' : v < 10 ? 'more' : 'double';
function controls() {
  loves();
  $('presets').innerHTML = Object.keys(PRESETS).map(k => `<button class="pre" type="button" data-p="${k}">${k}</button>`).join('');
  const sl = (id, label, val, min, max, step = 1, hint = '') => `<div class="sl"><label for="${id}">${label}</label><output id="o_${id}">${val}</output><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}">${hint ? `<small>${hint}</small>` : ''}</div>`;
  $('types').innerHTML = Object.entries(KINDS).map(([k, l]) => sl('t_' + k, l, P.types[k] ?? 2, 0, 10)).join('');
  for (const k of Object.keys(KINDS)) { const o = $('o_t_' + k); if (o) o.textContent = `${P.types[k] ?? 2} · ${WORD(P.types[k] ?? 2)}`; }
  $('boosts').innerHTML = sl('kwBoost', 'Favourite boost', P.kwBoost, 1, 3, .5, 'Multiplier for items matching a favourite word') + sl('rare', 'Rare return bonus', P.rare, 0, 10, 1, 'Adds 10% per step for items not in the shop for 6+ months');
  $('evw').innerHTML = D.events.filter(e => e.extraVbucks > 0 || e.fromHistory).map(e => sl('e_' + e.id, esc(e.name), P.ev[e.id] ?? 5, 0, 10)).join('');
  for (const e of D.events) { const o = $('o_e_' + e.id); if (o) o.textContent = `${P.ev[e.id] ?? 5} · ${EVWORD(P.ev[e.id] ?? 5)}`; }
  $('days').innerHTML = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, i) => `<label><input type="checkbox" data-d="${i}" ${P.days[i] ? 'checked' : ''}><span>${d}</span></label>`).join('');
  $('kw').value = P.kw; $('late').checked = P.late;
}

function bind() {
  document.querySelector('main').addEventListener('input', e => {
    const t = e.target, id = t.id;
    if (t.type === 'range') {
      const v = +t.value; $('o_' + id).textContent = id.startsWith('t_') ? `${v} · ${WORD(v)}` : id.startsWith('e_') ? `${v} · ${EVWORD(v)}` : v;
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
    const wk = Math.max(0, Math.min(51, Math.round((px - 8) / (S.W - 16) * 51)));
    const g = svg.querySelector('.cross'); g.setAttribute('visibility', 'visible'); g.querySelector('line').setAttribute('x1', S.x(wk)); g.querySelector('line').setAttribute('x2', S.x(wk));
    const d0 = new Date(Date.UTC(2026, 0, 1 + wk * 7)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
    $('sparkInfo').innerHTML = `Week of ${d0}: ` + S.series.map(s => { const p = s.pts.find(p => p[0] === wk); return `<b>${s.y}</b> ${p ? n0(p[1]) + '/day' : 'no data'}`; }).join(' · ');
  });
  $('spark').addEventListener('pointerleave', () => { const g = $('spark').querySelector('.cross'); if (g) g.setAttribute('visibility', 'hidden'); $('sparkInfo').textContent = 'Move over the chart to compare a week'; });
  $('bars').addEventListener('click', pick); $('alts').addEventListener('click', pick);
  const copy = async (txt, msg) => { try { await navigator.clipboard.writeText(txt); $('copyMsg').textContent = msg; } catch (e) { $('copyMsg').textContent = txt; } };
  $('copy').addEventListener('click', () => copy(render.plan, 'Plan copied.'));
  $('shareSet').addEventListener('click', () => copy(shareUrl(''), 'Link copied. It carries your taste, not your owned items.'));
  $('calBtn').addEventListener('click', () => openCal($('calBtn'), $('calMenu'), render.cal));
  document.addEventListener('click', e => { if (!e.target.closest('.calwrap')) document.querySelectorAll('.calmenu').forEach(m => { m.hidden = true; }); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') document.querySelectorAll('.calmenu').forEach(m => { m.hidden = true; }); });
  // "I've activated" mode
  $('actBtn').addEventListener('click', () => { $('actForm').hidden = false; $('actDate').value = dt(0).toISOString().slice(0, 10); $('actDate').max = dt(0).toISOString().slice(0, 10); $('actDate').min = dt(-13).toISOString().slice(0, 10); $('actDate').focus(); });
  $('actCancel').addEventListener('click', () => { $('actForm').hidden = true; });
  $('actForm').addEventListener('submit', e => { e.preventDefault(); P.activated = $('actDate').value || dt(0).toISOString().slice(0, 10); P.claimed = []; save(); $('actForm').hidden = true; render(false); scrollTo({ top: $('runbox').getBoundingClientRect().top + scrollY - 80, behavior: 'smooth' }); });
  $('runbox').addEventListener('click', e => {
    const a = e.target.closest('[data-act]'); if (!a) return;
    if (a.dataset.act === 'clear') { P.activated = null; P.claimed = []; save(); render(false); }
    if (a.dataset.act === 'change') { P.activated = null; save(); render(false); $('actBtn').click(); }
    if (a.dataset.act === 'more') { render.allClaim = true; render(false); }
    if (a.dataset.act === 'cal') { const end = T0 + (idx(P.activated) + render.M.dur - 1) * DAY + 18 * 36e5; openCal(a, $('runCal'), { title: 'Last day of your Pirate Shop Access', start: end, mins: 30, details: 'Claim anything left before your 14 days end.' }); }
  });
  $('runbox').addEventListener('change', e => { const id = e.target.dataset.claim; if (id == null) return; P.claimed = e.target.checked ? [...new Set([...P.claimed, id])] : P.claimed.filter(x => x !== id); save(); render(false); });
  // will it come back?
  $('backsec').addEventListener('toggle', async () => { if (!$('backsec').open || render.back) return; $('backRes').innerHTML = '<p class="hint">Loading the shop history…</p>'; render.back = await load('data/past/returns.json'); backSearch(); });
  $('backQ').addEventListener('input', () => backSearch());
  $('backRes').addEventListener('click', e => { const b = e.target.closest('[data-pick]'); if (!b) return; $('backQ').value = b.dataset.pick; backSearch(); });
}

// ---------- calendar reminders for every common calendar ----------
function calLinks(c) {
  const z = t => new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''), end = c.start + c.mins * 60e3;
  const isoL = t => new Date(t).toISOString().slice(0, 19) + 'Z';
  const e = encodeURIComponent, T = e(c.title), Dd = e(c.details);
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Pirate Token Planner//EN', 'BEGIN:VEVENT', `UID:${c.start}-ptp@piratetokenplanner`, `DTSTAMP:${z(Date.now())}`, `DTSTART:${z(c.start)}`, `DTEND:${z(end)}`,
    `SUMMARY:${c.title}`, `DESCRIPTION:${c.details.replace(/[,;]/g, m => '\\' + m)}`, 'BEGIN:VALARM', 'TRIGGER:-PT10M', 'ACTION:DISPLAY', `DESCRIPTION:${c.title}`, 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  return [
    ['Google Calendar', `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${T}&dates=${z(c.start)}/${z(end)}&details=${Dd}`],
    ['Outlook.com', `https://outlook.live.com/calendar/0/deeplink/compose?path=/calendar/action/compose&rru=addevent&subject=${T}&startdt=${isoL(c.start)}&enddt=${isoL(end)}&body=${Dd}`],
    ['Outlook (work or school)', `https://outlook.office.com/calendar/0/deeplink/compose?path=/calendar/action/compose&rru=addevent&subject=${T}&startdt=${isoL(c.start)}&enddt=${isoL(end)}&body=${Dd}`],
    ['Yahoo Calendar', `https://calendar.yahoo.com/?v=60&title=${T}&st=${z(c.start)}&et=${z(end)}&desc=${Dd}`],
    ['Apple, Thunderbird & others (.ics file)', URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })), 'pirate-token-reminder.ics']
  ];
}
function openCal(btn, menu, c) {
  const open = menu.hidden;
  document.querySelectorAll('.calmenu').forEach(m => { m.hidden = true; });
  if (!open) { btn.setAttribute('aria-expanded', 'false'); return; }
  menu.innerHTML = `<p>${esc(new Date(c.start).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}</p>` +
    calLinks(c).map(([n, u, f]) => `<a role="menuitem" href="${u}" ${f ? `download="${f}"` : 'target="_blank" rel="noopener"'}>${n}</a>`).join('');
  menu.hidden = false; btn.setAttribute('aria-expanded', 'true'); menu.querySelector('a').focus();
}

// ---------- "I've activated": countdown and claim list ----------
function activeMode(M) {
  const on = !!P.activated, show = (id, v) => { const el = document.getElementById(id); if (el) el.hidden = !v; };
  show('runbox', on); show('verdict', !on); show('alts', !on);
  document.querySelectorAll('.result .panel').forEach(p => { p.hidden = on; });
  if (!on) return;
  const a = idx(P.activated), end = a + M.dur, left = end - 0, dayNo = Math.min(M.dur, 1 - a);
  if (left <= 0) {
    $('runbox').innerHTML = `<div class="runhead"><div><div class="big">Your 14 days are over</div><p class="when">They ended on ${fmtL(end)}. Hope the haul was good! The planner for your 2027 token is below.</p></div></div><div class="acts"><button class="btn gold" type="button" data-act="clear">Back to the planner</button></div>`;
    return;
  }
  const want = M.items.filter(x => (x.value > 0 || x.must) && !x.own).sort((p, q) => p.out - q.out || q.value - p.value);
  const claimed = new Set(P.claimed), todo = want.filter(x => !claimed.has(x.e.id));
  const today = todo.filter(x => x.out - 1 <= 0), tomorrow = todo.filter(x => x.out - 1 === 1);
  const list = render.allClaim ? want : want.slice(0, 16);
  const chip = x => `<span class="lchip${x.must ? ' must' : ''}">${esc(x.e.name)} <small>${KINDS[x.e.kind] || x.e.kind}</small></span>`;
  const chips = xs => { const top = [...xs].sort((p, q) => q.must - p.must || q.value - p.value); return top.slice(0, 8).map(chip).join('') + (top.length > 8 ? `<span class="lchip more">+${top.length - 8} more in the claim list</span>` : ''); };
  const endsAt = new Date(T0 + end * DAY).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  $('runbox').innerHTML = `<div class="runhead">
      <div class="countdown"><b>${left}</b><span>day${left === 1 ? '' : 's'} left</span></div>
      <div><div class="big">Your plunder is running</div><p class="when">Day ${Math.max(1, dayNo)} of ${M.dur} · ends ${esc(endsAt)}</p>
      <div class="runbar"><div style="width:${Math.min(100, Math.max(1, dayNo) / M.dur * 100)}%"></div></div></div>
    </div>
    <div class="leave">
      <div><h3>Leaving the shop today</h3>${today.length ? chips(today) : '<p class="hint">Nothing you want leaves today.</p>'}</div>
      <div><h3>Leaving tomorrow</h3>${tomorrow.length ? chips(tomorrow) : '<p class="hint">Nothing you want leaves tomorrow.</p>'}</div>
    </div>
    <h3 class="clh">Claim list <span>${want.length - todo.length} of ${want.length} claimed</span></h3>
    <ul class="claims">${list.map(x => `<li class="${claimed.has(x.e.id) ? 'done' : ''}"><label><input type="checkbox" data-claim="${esc(x.e.id)}" ${claimed.has(x.e.id) ? 'checked' : ''}><span>${esc(x.e.name)}</span></label><small>${KINDS[x.e.kind] || x.e.kind} · ${x.out - 1 <= 0 ? 'last day today' : 'until ' + fmt(x.out - 1)}${x.must ? ' · must-have' : ''}</small></li>`).join('')}</ul>
    ${!render.allClaim && want.length > 16 ? `<button class="btn ghost" type="button" data-act="more">Show all ${want.length}</button>` : ''}
    <p class="hint">Only today's shop is known. New items appear every day after the reset at ${resetLocal}.</p>
    <div class="acts"><span class="calwrap"><button class="btn gold" type="button" data-act="cal" aria-haspopup="true" aria-expanded="false">Remind me of the last day</button><span class="calmenu" id="runCal" role="menu" hidden></span></span><button class="btn ghost" type="button" data-act="change">Change date</button><button class="btn ghost" type="button" data-act="clear">I haven't activated</button></div>`;
}

// ---------- will it come back? ----------
function backSearch() {
  const R = render.back, q = ($('backQ').value || '').trim().toLowerCase();
  if (!R) { $('backRes').innerHTML = '<p class="hint">The shop history could not be loaded.</p>'; return; }
  $('backSrc').textContent = `Based on ${R.finishedGaps.toLocaleString('en-US')} returns of ${R.items.length.toLocaleString('en-US')} items, ${fmt(idx(R.from), { day: 'numeric', month: 'short', year: 'numeric' })} to ${fmt(idx(R.asOf))}. Typical time away: ${R.medianGap} days.`;
  if (q.length < 2) { $('backRes').innerHTML = '<p class="hint">Type at least two letters.</p>'; return; }
  const hits = R.items.filter(x => x.n.toLowerCase().includes(q)).sort((a, b) => (b.n.toLowerCase().startsWith(q) - a.n.toLowerCase().startsWith(q)) || b.k - a.k).slice(0, 8);
  if (!hits.length) { $('backRes').innerHTML = '<p class="hint">Not in the shop history. It may not have been sold since ' + fmt(idx(R.from), { month: 'long', year: 'numeric' }) + '.</p>'; return; }
  const inShop = new Map(); for (const e of D.shop.entries) for (const it of e.items) inShop.set(String(it.id).toLowerCase(), e);
  const T = R.S.length - 1, S = t => t < 0 ? 1 : R.S[Math.min(T, t)];
  const s0 = render.M ? sel : 0;
  const card = x => {
    const e = inShop.get(x.i);
    if (e) return `<div class="bcard"><div><b>${esc(x.n)}</b><small>${KINDS[x.t] || x.t}</small></div><p class="good2">In the shop right now, until ${fmt(idx(e.outDate || D.shop.shopDate) - 1)}.</p></div>`;
    const away = Math.round((T0 - Date.parse(x.l)) / DAY) - 1;
    // item-specific pace: items that came back quickly before are assumed to come back faster again
    const f = x.k >= 3 && x.g ? Math.min(4, Math.max(0.25, R.medianGap / Math.max(1, x.g))) : 1;
    const Si = t => S(Math.floor(t * f));
    const chance = (a, b) => { const base = Si(away + a - 1); if (base < 0.03 || (away + b) * f > T) return null; return Math.max(0, Math.min(1, (base - Si(away + b)) / base)); };
    const pWin = chance(Math.max(0, s0), s0 + 13), p30 = chance(0, 29);
    const bar = (p, label) => p === null ? `<div class="pc"><span>${label}</span><em>beyond what the history can judge</em></div>` : `<div class="pc"><span>${label}</span><div class="pbar"><div style="width:${Math.round(p * 100)}%"></div></div><b>${Math.round(p * 100)}%</b></div>`;
    return `<div class="bcard"><div><b>${esc(x.n)}</b><small>${KINDS[x.t] || x.t} · in the shop ${x.k} time${x.k === 1 ? '' : 's'} since ${fmt(idx(R.from), { month: 'short' })} · last seen ${fmt(idx(x.l))} (${away} days ago)${x.g ? ` · usually away ${x.g} days` : ''}</small></div>
      ${bar(pWin, `In your 14 days (${fmt(s0)}–${fmt(s0 + 13)})`)}${bar(p30, 'In the next 30 days')}</div>`;
  };
  $('backRes').innerHTML = hits.map(card).join('') + '<p class="hint">A rough estimate from how long items stayed away in the past. Epic does not follow a schedule, so treat it as a hint, not a promise.</p>';
}

// item rarity as a short class name, for the Item Shop style tile colours
function rarityOf(e) { const r = String((e.items[0] && e.items[0].rarity) || '').toLowerCase(); return r.includes('legend') ? 'legendary' : r.includes('epic') ? 'epic' : r === 'rare' ? 'rare' : r.includes('uncommon') ? 'uncommon' : r.includes('icon') ? 'icon' : r.includes('marvel') ? 'marvel' : r.includes('gaming') ? 'gaming' : r.includes('shadow') || r.includes('dark') ? 'dark' : r ? 'common' : e.kind === 'jamtrack' ? 'music' : 'common'; }

// ---------- crew counter and the ship's bell (shared, anonymous) ----------
const COUNTER = 'https://abacus.jasoncameron.dev', NS = 'piratetokenplanner';
async function counter(action, key) {
  try { const r = await fetch(`${COUNTER}/${action}/${NS}/${key}`, { signal: AbortSignal.timeout(5000) }); if (!r.ok) return null; return (await r.json()).value ?? null; } catch { return null; }
}
async function crew() {
  if (q.get('today') && !q.get('counter')) return; // no counting in previews and tests
  let first = false; try { first = !localStorage.getItem('ptp-crew'); } catch {}
  const [n, rings] = await Promise.all([counter(first ? 'hit' : 'get', 'crew'), counter('get', 'bell')]);
  if (n === null) return;
  try { if (first) localStorage.setItem('ptp-crew', String(n)); } catch {}
  let mine = null; try { mine = +localStorage.getItem('ptp-crew'); } catch {}
  const bellTxt = r => r ? ` · bell rung ${n0(r)}×` : ' · ring the bell!';
  const show = r => { $('crewTxt').innerHTML = (first ? `Welcome aboard, <b>pirate #${n0(n)}</b>!` : `<b>${n0(n)}</b> pirates aboard${mine ? ` · you're #${n0(mine)}` : ''}`) + bellTxt(r); };
  show(rings); $('crew').hidden = false;
  let last = 0, local = rings || 0;
  $('bell').addEventListener('click', async () => {
    const b = $('bell'); b.classList.remove('ding'); void b.offsetWidth; b.classList.add('ding');
    if (Date.now() - last < 3000) return; last = Date.now();
    local++; show(local);
    const v = await counter('hit', 'bell'); if (v !== null) { local = v; show(v); }
  });
}

// ---------- pirate card: a shareable picture of your plan ----------
const NAME_A = ['Captain', 'First Mate', 'Admiral', 'Quartermaster', 'Bosun', 'Cabin Boy', 'Sea Witch', 'Old', 'Lady', 'Skipper'];
const NAME_B = ['Sleepy', 'Salty', 'Golden', 'Barnacle', 'Stormy', 'Crusty', 'Lucky', 'Rusty', 'Sneaky', 'Jolly', 'Soggy', 'Mighty'];
const NAME_C = ['Beard', 'Plank', 'Doubloon', 'Kraken', 'Parrot', 'Anchor', 'Squid', 'Cutlass', 'Shrimp', 'Compass', 'Pickaxe', 'Llama'];
function pirateName(seed) { let h = seed >>> 0; const pick = a => { h = Math.imul(h ^ h >>> 15, 2246822507) + 0x9e3779b9 >>> 0; return a[h % a.length]; }; return `${pick(NAME_A)} ${pick(NAME_B)}${pick(NAME_C)}`; }
// images for the card: the token (same origin) and item pictures (only if their server allows it, else skipped)
const imgCache = new Map();
function loadImg(src, cors) {
  if (!src) return Promise.resolve(null);
  if (!imgCache.has(src)) imgCache.set(src, new Promise(ok => { const im = new Image(); if (cors) im.crossOrigin = 'anonymous'; const t = setTimeout(() => ok(null), 5000); im.onload = () => { clearTimeout(t); ok(im); }; im.onerror = () => { clearTimeout(t); ok(null); }; im.src = src; }));
  return imgCache.get(src);
}
async function drawCard() {
  const M = render.M, cur = M.all.find(a => a.s === sel), cv = $('cardCv'), g = cv.getContext('2d'), W = 1080, H = 1350;
  await document.fonts.ready;
  const FN = '"Anton", "Luckiest Guy", Impact, sans-serif', NU = 'Nunito, sans-serif';
  const top = cur.rows.filter(r => r.hit).sort((a, b) => b.v - a.v).slice(0, 3);
  const [tok, ...pics] = await Promise.all([loadImg('icons/token.svg'), ...top.map(r => loadImg(r.x.e.image, true))]);
  const token = (x, y, r) => { if (tok) g.drawImage(tok, x - r * 1.25, y - r * 1.25, r * 2.5, r * 2.5); else coin(x, y, r); };
  const fit = (txt, x, y, max, size, font, align = 'left') => { let z = size; do { g.font = font.replace('#', z + 'px'); z -= 2; } while (g.measureText(txt).width > max && z > 14); g.textAlign = align; g.fillText(txt, x, y); g.textAlign = 'left'; };
  const lin = (y0, y1, stops) => { const l = g.createLinearGradient(0, y0, 0, y1); stops.forEach(([o, c]) => l.addColorStop(o, c)); return l; };
  const slant = (x, y, w, h, sk = 14) => { g.beginPath(); g.moveTo(x + sk, y); g.lineTo(x + w, y); g.lineTo(x + w - sk, y + h); g.lineTo(x, y + h); g.closePath(); };
  const coin = (x, y, r) => { const cg = g.createRadialGradient(x - r * .3, y - r * .35, 2, x, y, r); cg.addColorStop(0, '#fff2a8'); cg.addColorStop(.5, '#ffc83d'); cg.addColorStop(1, '#b07c00');
    g.fillStyle = '#8a5a00'; g.beginPath(); g.arc(x, y + r * .08, r, 0, 7); g.fill(); g.fillStyle = cg; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    g.strokeStyle = '#b07c00'; g.lineWidth = r * .06; g.setLineDash([r * .06, r * .14]); g.beginPath(); g.arc(x, y, r * .82, 0, 7); g.stroke(); g.setLineDash([]);
    g.strokeStyle = '#6b4300'; g.lineWidth = r / 7; g.lineCap = 'round'; g.beginPath(); g.moveTo(x - r * .34, y - r * .34); g.lineTo(x + r * .34, y + r * .34); g.moveTo(x + r * .34, y - r * .34); g.lineTo(x - r * .34, y + r * .34); g.stroke(); };
  // sky
  g.fillStyle = lin(0, 520, [[0, '#7cc0ff'], [1, '#3d86ee']]); g.fillRect(0, 0, W, 520);
  const sun = g.createRadialGradient(900, 120, 10, 900, 120, 170); sun.addColorStop(0, '#fff6c2'); sun.addColorStop(.35, '#ffd96a'); sun.addColorStop(.36, '#ffe9a044'); sun.addColorStop(1, '#ffe9a000');
  g.fillStyle = sun; g.beginPath(); g.arc(900, 120, 170, 0, 7); g.fill();
  const cloud = (x, y, s) => { g.fillStyle = '#ffffffcc'; for (const [dx, dy, r] of [[0, 0, 26], [30, -14, 32], [64, -4, 28], [92, 6, 20]]) { g.beginPath(); g.arc(x + dx * s, y + dy * s, r * s, 0, 7); g.fill(); } g.fillRect(x - 10 * s, y, 112 * s, 26 * s); };
  cloud(980, 250, .6);
  // header text
  g.fillStyle = '#fff'; g.shadowColor = '#0b2a6e'; g.shadowOffsetY = 4;
  g.font = `900 30px ${NU}`; g.fillText('MY PIRATE TOKEN PLAN', 200, 112);
  g.font = `italic 60px ${FN}`; fit(render.cardName.toUpperCase(), 200, 178, 520, 60, `italic # ${FN}`);
  g.shadowOffsetY = 0; token(110, 140, 66);
  g.font = `800 32px ${NU}`; g.fillStyle = '#eaf4ff'; g.fillText('sets sail on', 70, 300);
  g.save(); g.transform(1, 0, -0.12, 1, 0, 0); g.font = `italic 128px ${FN}`; const day = fmt(sel, { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase();
  g.lineWidth = 14; g.strokeStyle = '#6b4300'; g.lineJoin = 'round'; g.strokeText(day, 110, 430); g.fillStyle = lin(320, 430, [[0, '#fff27a'], [1, '#ffc400']]); g.fillText(day, 110, 430); g.restore();
  const drawShip = () => {
  g.save(); g.translate(700, 284); g.scale(1.1, 1.1);
  g.fillStyle = '#4a2410'; g.fillRect(96, 10, 8, 150);
  g.fillStyle = '#fffaf0'; g.beginPath(); g.moveTo(40, 40); g.quadraticCurveTo(100, 50, 160, 40); g.quadraticCurveTo(172, 90, 160, 140); g.quadraticCurveTo(100, 148, 40, 140); g.quadraticCurveTo(28, 90, 40, 40); g.fill();
  g.beginPath(); g.moveTo(170, 50); g.lineTo(226, 150); g.lineTo(170, 150); g.fill();
  g.fillStyle = '#1d2b2d'; g.beginPath(); g.moveTo(104, 8); g.quadraticCurveTo(126, 2, 150, 12); g.quadraticCurveTo(128, 16, 150, 26); g.quadraticCurveTo(126, 20, 104, 24); g.fill();
  token(100, 92, 30);
  g.fillStyle = lin(150, 210, [[0, '#a0522d'], [1, '#4f240e']]); g.beginPath(); g.moveTo(-6, 156); g.lineTo(236, 156); g.quadraticCurveTo(226, 204, 190, 212); g.lineTo(40, 212); g.quadraticCurveTo(4, 204, -6, 156); g.fill();
  g.fillStyle = '#ffc83d'; g.fillRect(-8, 150, 248, 10);
  g.fillStyle = '#2a1206'; for (const x of [40, 90, 140, 190]) { g.beginPath(); g.arc(x, 184, 7, 0, 7); g.fill(); }
  g.restore();
  };
  // sea
  g.fillStyle = lin(480, H, [[0, '#3d86ee'], [.4, '#1d5fc8'], [1, '#0a2462']]); g.fillRect(0, 500, W, H - 500);
  // the ship sits in the water: drawn after the sea, with the front waves over its hull
  drawShip();
  for (const [y, c, a] of [[500, '#bfe4ff', 28], [530, '#7cbcff', 24], [560, '#3d86ee', 20]]) { g.fillStyle = c; g.beginPath(); g.moveTo(0, H); g.lineTo(0, y); for (let x = 0; x <= W; x += 72) g.quadraticCurveTo(x + 36, y - a, x + 72, y); g.lineTo(W, H); g.fill(); }
  g.save(); g.globalAlpha = .12; g.fillStyle = '#fff'; for (const [x, w] of [[120, 70], [360, 40], [600, 90], [860, 50]]) { g.beginPath(); g.moveTo(x, 560); g.lineTo(x + w, 560); g.lineTo(x + w - 160, H); g.lineTo(x - 200, H); g.fill(); } g.restore();
  g.strokeStyle = '#ffffff55'; g.lineWidth = 2; for (let k = 0; k < 34; k++) { g.beginPath(); g.arc((k * 197 + 40) % W, 640 + (k * 131) % 640, 3 + k % 7, 0, 7); g.stroke(); }
  const fish = (x, y, s, c1, c2, flip) => { g.save(); g.translate(x, y); g.scale(flip ? -s : s, s); g.fillStyle = c1; g.beginPath(); g.moveTo(-20, 0); g.quadraticCurveTo(0, -16, 20, 0); g.quadraticCurveTo(0, 16, -20, 0); g.fill(); g.fillStyle = c2; g.beginPath(); g.moveTo(18, 0); g.lineTo(34, -10); g.lineTo(30, 0); g.lineTo(34, 10); g.fill(); g.fillStyle = '#14213d'; g.beginPath(); g.arc(-11, -2, 2.6, 0, 7); g.fill(); g.restore(); };
  fish(880, 640, 1.6, '#ffb347', '#ff8c42'); fish(950, 670, 1.2, '#ffb347', '#ff8c42'); fish(830, 690, 1, '#ffb347', '#ff8c42'); fish(540, 780, 1.3, '#7ee0c6', '#2fb59a', true);
  // stat badges
  const badge = (x, y, w, big, small, col) => { g.fillStyle = col; slant(x, y, w, 130, 18); g.fill(); g.fillStyle = '#ffffff22'; slant(x, y, w, 8, 1); g.fill();
    g.fillStyle = '#fff'; g.font = `italic 64px ${FN}`; fit(big, x + w / 2, y + 74, w - 40, 64, `italic # ${FN}`, 'center'); g.font = `900 22px ${NU}`; g.fillStyle = '#eaf4ff'; fit(small.toUpperCase(), x + w / 2, y + 110, w - 40, 22, `900 # ${NU}`, 'center'); };
  const pb = Math.round(cur.pBest * 100), must = cur.rows.filter(r => r.hit && r.x.must).length;
  badge(60, 596, 330, `~${n0(cur.tot / 1000)}K`, 'V-Bucks of loot', 'rgba(255,170,40,.92)');
  badge(375, 596, 300, `${M.dur} days`, must ? `${must} must-have${must > 1 ? 's' : ''} inside` : 'free Item Shop', 'rgba(140,70,230,.9)');
  badge(660, 596, 300, `${pb}%`, 'top-day chance', 'rgba(30,140,240,.92)');
  // top loot tiles, coloured by rarity
  const RC = { legendary: ['#ffb84d', '#b8510a'], epic: ['#d27bff', '#6a1fb5'], rare: ['#4fd2ff', '#1559c9'], uncommon: ['#87e339', '#319236'], icon: ['#5ff2ff', '#127a8f'], marvel: ['#ff5a5a', '#8e1010'], gaming: ['#8a7bff', '#2b1e8f'], dark: ['#c04bff', '#2a0a3d'], music: ['#ff7ad9', '#7a1a8c'], common: ['#b0bccf', '#4b5566'] };
  g.font = `italic 34px ${FN}`; g.fillStyle = '#fff'; g.fillText('TOP LOOT', 60, 806);
  top.forEach((r, k) => { const x = 60 + k * 182, y = 826, w = 168, h = 210, [c1, c2] = RC[rarityOf(r.x.e)] || RC.common;
    const rg = g.createRadialGradient(x + w / 2, y + 40, 10, x + w / 2, y + h / 2, h); rg.addColorStop(0, c1); rg.addColorStop(1, c2);
    g.fillStyle = rg; g.beginPath(); g.roundRect(x, y, w, h, 12); g.fill(); g.fillStyle = '#0b1f4acc'; g.beginPath(); g.roundRect(x, y + h - 58, w, 58, [0, 0, 12, 12]); g.fill();
    g.fillStyle = '#fff'; g.font = `italic 22px ${FN}`; let nm = r.x.e.name.toUpperCase(); while (g.measureText(nm).width > w - 20 && nm.length > 4) nm = nm.slice(0, -2).trimEnd() + '…'; g.textAlign = 'center'; g.fillText(nm, x + w / 2, y + h - 22); g.textAlign = 'left';
    const im = pics[k];
    if (im) { g.save(); g.beginPath(); g.roundRect(x, y, w, h - 58, [12, 12, 0, 0]); g.clip(); const sc = Math.max(w / im.width, (h - 58) / im.height) * 1.05, iw = im.width * sc, ih = im.height * sc; g.drawImage(im, x + (w - iw) / 2, y + (h - 58 - ih) * .35, iw, ih); g.restore(); }
    else { g.fillStyle = '#ffffff55'; g.font = `italic 64px ${FN}`; g.textAlign = 'center'; g.fillText(String(k + 1), x + w / 2, y + 82); g.textAlign = 'left'; }
    g.fillStyle = '#ffe23d'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 40, y); g.lineTo(x + 30, y + 30); g.lineTo(x, y + 30); g.closePath(); g.fill(); g.fillStyle = '#1a1300'; g.font = `italic 24px ${FN}`; g.fillText(String(k + 1), x + 9, y + 25);
    g.fillStyle = '#0b1f4acc'; g.beginPath(); g.roundRect(x, y + h - 58, w, 58, [0, 0, 12, 12]); g.fill(); g.fillStyle = '#fff'; g.font = `italic 22px ${FN}`; g.textAlign = 'center'; g.fillText(nm, x + w / 2, y + h - 22); g.textAlign = 'left'; });
  // seabed with treasure
  g.fillStyle = '#d9b26c'; g.beginPath(); g.moveTo(0, H); g.lineTo(0, 1262); g.quadraticCurveTo(270, 1232, 540, 1258); g.quadraticCurveTo(810, 1282, W, 1250); g.lineTo(W, H); g.fill();
  g.fillStyle = '#e8c98a'; g.beginPath(); g.moveTo(0, H); g.lineTo(0, 1282); g.quadraticCurveTo(300, 1262, 620, 1286); g.quadraticCurveTo(860, 1300, W, 1276); g.lineTo(W, H); g.fill();
  g.fillStyle = '#ff8c69'; g.beginPath(); for (let k = 0; k < 10; k++) { const a = k * Math.PI / 5 - Math.PI / 2, rr = k % 2 ? 7 : 16; g.lineTo(560 + Math.cos(a) * rr, 1300 + Math.sin(a) * rr); } g.fill();
  g.fillStyle = '#2fa36b'; for (const [x, h2] of [[40, 90], [70, 120], [600, 70], [1040, 100]]) { g.beginPath(); g.ellipse(x, 1250 - h2 / 2, 8, h2 / 2, .1, 0, 7); g.fill(); }
  g.fillStyle = '#8a4a1f'; g.fillRect(330, 1222, 120, 70); g.fillStyle = '#ffd65c'; g.beginPath(); g.ellipse(390, 1224, 56, 14, 0, 0, 7); g.fill(); g.fillStyle = '#ffc83d'; g.fillRect(330, 1222, 8, 70); g.fillRect(442, 1222, 8, 70); g.fillRect(382, 1240, 16, 22);
  coin(360, 1212, 13); coin(390, 1206, 15); coin(420, 1214, 13);
  g.fillStyle = '#fff'; g.font = `900 30px ${NU}`; g.fillText('Find your best day:', 60, 1092);
  g.fillStyle = '#ffe23d'; fit('piratetokenplanner.github.io', 60, 1134, 520, 34, `900 # ${NU}`); fit('/pirate-token-planner', 60, 1170, 520, 30, `800 # ${NU}`);
  g.fillStyle = '#6b4a1f'; g.font = `800 20px ${NU}`; g.fillText('Fan-made · not affiliated with Epic Games', 60, 1332); g.textAlign = 'right'; g.fillText('scan to plan with me or compare plans', W - 60, 1332); g.textAlign = 'left';
  // the big QR code, with the token in the middle
  if (window.qrcode) {
    const qs = 360, qx = W - 70 - qs, qy = 846;
    g.fillStyle = '#ffe23d'; slant(qx - 26, qy - 70, qs + 52, 54, 12); g.fill(); g.fillStyle = '#1a1300'; fit('SCAN TO PLAN WITH ME', qx + qs / 2, qy - 32, qs, 28, `italic # ${FN}`, 'center');
    drawQR(g, shareUrl(render.cardName), qx, qy, qs); g.fillStyle = '#fff'; g.beginPath(); g.arc(qx + qs / 2, qy + qs / 2, 30, 0, 7); g.fill(); token(qx + qs / 2, qy + qs / 2, 22);
     g.textAlign = 'left';
  }
  $('cardDl').href = cv.toDataURL('image/png');
}
const shareUrl = name => location.href.split('#')[0] + '#c=' + shareCode(name);
function loadQR() { return window.qrcode ? Promise.resolve() : new Promise((ok, bad) => { const sc = document.createElement('script'); sc.src = 'vendor/qrcode.js'; sc.onload = ok; sc.onerror = bad; document.head.appendChild(sc); }); }
function drawQR(g, text, x, y, size) {
  const qr = qrcode(0, 'H'); qr.addData(text); qr.make(); // high error correction, so the coin in the middle doesn't break it
  const n = qr.getModuleCount(), q = 4, cell = size / (n + q * 2); // 4-module quiet zone for reliable scanning
  g.fillStyle = '#fff'; g.beginPath(); g.roundRect(x - 14, y - 14, size + 28, size + 28, 20); g.fill();
  g.fillStyle = '#0b1f4a';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) g.fillRect(x + (c + q) * cell, y + (r + q) * cell, Math.ceil(cell), Math.ceil(cell));
}
// someone opened a shared card: their settings are applied, with a way back to your own
function sharedBanner() {
  if (!shared) return;
  // must-haves travel as id endings: match them against today's shop
  const tails = new Set(shared.mustTail), mustIds = D.shop.entries.filter(e => tails.has(String(e.id).slice(-10))).map(e => e.id);
  if (mustIds.length) P.must = [...new Set([...(P.must || []), ...mustIds])];
  const who = shared.name ? esc(shared.name) : 'a fellow pirate';
  const bar = document.createElement('div'); bar.className = 'sharedbar';
  bar.innerHTML = `<span>You're sailing with <b>${who}</b>'s settings${mustIds.length ? ` (${mustIds.length} must-have${mustIds.length > 1 ? 's' : ''})` : ''}.</span><button class="btn gold" type="button" data-k="keep">Keep them</button><button class="btn ghost" type="button" data-k="mine">Use my own</button><button class="btn ghost" type="button" data-k="cmp">Compare with mine</button>`;
  document.body.prepend(bar);
  bar.addEventListener('click', e => {
    const k = e.target.closest('[data-k]'); if (!k) return;
    if (k.dataset.k === 'cmp') { const d = $('cmpsec'); d.open = true; compare(shared.prev, shared); d.scrollIntoView({ behavior: 'smooth' }); return; }
    if (k.dataset.k === 'mine') { const prev = shared.prev; for (const key of Object.keys(prev)) P[key] = prev[key]; controls(); render(); }
    save(); history.replaceState(null, '', location.pathname + location.search); bar.remove();
  });
}
// ---------- compare your plan with a friend's ----------
function planWith(settings) {
  const keep = P; P = { ...structuredClone(P), ...settings }; const M = model(); P = keep; return M;
}
function friendFrom(input) {
  const t = String(input || '').trim(); const m = t.match(/#c=([A-Za-z0-9_-]+)/); const code = m ? m[1] : t;
  const f = readCode(code); const tails = new Set(f.mustTail);
  f.must = D.shop.entries.filter(e => tails.has(String(e.id).slice(-10))).map(e => e.id);
  return f;
}
function compare(mine, friend) {
  const A = planWith(mine), B = planWith(friend);
  const bestOf = M => M.all.reduce((x, y) => y.tot > x.tot ? y : x);
  const a = bestOf(A), b = bestOf(B);
  // together: the start day where both get the highest share of their own best (the weaker one counts most)
  let tog = null;
  for (const x of A.all) { const y = B.all.find(z => z.s === x.s); const pa = x.tot / a.tot, pb = y.tot / b.tot, sc = Math.min(pa, pb) * 2 + pa + pb; if (!tog || sc > tog.sc) tog = { s: x.s, pa, pb, sc }; }
  const same = new Set((mine.must || []).filter(id => (friend.must || []).includes(id)));
  const name = friend.name || 'Your friend';
  const pct = v => Math.round(v * 100) + '%';
  const both = new Set(A.all.find(z => z.s === tog.s).rows.filter(r => r.hit && r.x.value > 0).map(r => r.x.e.id));
  const sharedLoot = B.all.find(z => z.s === tog.s).rows.filter(r => r.hit && r.x.value > 0 && both.has(r.x.e.id)).sort((p, q) => q.x.e.price - p.x.e.price).slice(0, 6).map(r => esc(r.x.e.name));
  $('cmpRes').innerHTML = `
    <div class="cmpgrid">
      <div class="cmpc you"><small>You</small><b>${fmtL(a.s)}</b><span>~${n0(a.tot / 1000)}k V-Bucks</span></div>
      <div class="cmpc fr"><small>${esc(name)}</small><b>${fmtL(b.s)}</b><span>~${n0(b.tot / 1000)}k V-Bucks</span></div>
      <div class="cmpc tog"><small>Sail together</small><b>${fmtL(tog.s)}</b><span>you get ${pct(tog.pa)} · ${esc(name.split(' ')[0])} gets ${pct(tog.pb)} of your best</span></div>
    </div>
    <p>${a.s === b.s ? 'Same best day! Activate together and plunder side by side.' : `Your best days are ${Math.abs(a.s - b.s)} day${Math.abs(a.s - b.s) === 1 ? '' : 's'} apart.`}${same.size ? ` You share ${same.size} must-have${same.size > 1 ? 's' : ''}.` : ''}</p>
    ${sharedLoot.length ? `<p class="hint">Loot you'd both grab on ${fmt(tog.s)}: ${sharedLoot.join(', ')}.</p>` : ''}
    <div class="acts"><button class="btn gold" type="button" data-pick-day="${tog.s}">Show ${fmt(tog.s)} in my plan</button></div>`;
}
function compareUI() {
  const run = () => { try { compare(shared ? shared.prev : P, friendFrom($('cmpIn').value)); } catch { $('cmpRes').innerHTML = '<p class="hint">That does not look like a pirate card link or code.</p>'; } };
  $('cmpGo').addEventListener('click', run);
  $('cmpIn').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); run(); } });
  $('cmpRes').addEventListener('click', e => { const b = e.target.closest('[data-pick-day]'); if (!b) return; sel = +b.dataset.pickDay; render(false); document.querySelector('.result').scrollIntoView({ behavior: 'smooth' }); });
  if (shared) $('cmpIn').value = location.href;
}
function cardUI() {
  const dlg = $('cardDlg');
  render.cardSeed = render.cardSeed ?? (Date.now() & 0xffff);
  try { render.cardName = localStorage.getItem('ptp-name') || ''; } catch {}
  const setName = n => { render.cardName = n.slice(0, 32); $('cardName').value = render.cardName; try { localStorage.setItem('ptp-name', render.cardName); } catch {} };
  const open = async () => { if (!render.cardName) setName(pirateName(render.cardSeed)); $('cardName').value = render.cardName; await loadQR().catch(() => {}); await drawCard(); $('cardMsg').textContent = ''; dlg.showModal ? dlg.showModal() : dlg.setAttribute('open', ''); };
  let typing; $('cardName').addEventListener('input', e => { render.cardName = e.target.value.slice(0, 32) || 'Nameless Pirate'; clearTimeout(typing); typing = setTimeout(() => { try { localStorage.setItem('ptp-name', e.target.value); } catch {} drawCard(); }, 150); });
  $('cardCopy').addEventListener('click', async () => { try { await navigator.clipboard.writeText(shareUrl(render.cardName)); $('cardMsg').textContent = 'Link with your settings copied.'; } catch { $('cardMsg').textContent = shareUrl(render.cardName); } });
  $('share').addEventListener('click', open);
  $('cardNew').addEventListener('click', async () => { render.cardSeed += 7919; setName(pirateName(render.cardSeed)); await drawCard(); });
  $('cardClose').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
  $('cardShare').addEventListener('click', async () => {
    const url = shareUrl(render.cardName), text = `${render.cardName} sets sail on ${fmt(sel, { weekday: 'short', day: 'numeric', month: 'short' })}! Find your best Pirate Token day:`;
    try {
      const blob = await new Promise(r => $('cardCv').toBlob(r, 'image/png')), file = new File([blob], 'my-pirate-card.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text, url }); return; }
      if (navigator.share) { await navigator.share({ text, url }); return; }
      await navigator.clipboard.writeText(`${text} ${url}`); $('cardMsg').textContent = 'Link copied. Use Download to save the picture.';
    } catch (e) { if (e.name !== 'AbortError') $('cardMsg').textContent = 'Use Download to save the picture, then share it anywhere.'; }
  });
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
  D.pastSources = b.sources || (b.source ? [{ name: 'Fortnite-Datamining archive', url: b.source }] : []);
  D.base = { ...b, pool, byWd, mean, stay, fallback: !pool.length, n: pool.length, stayFrom: b.medianStayDays ? `the median planned stay of new offers in the archive` : 'a fallback value' };
  const age = meta && meta.generatedAt ? Math.round((Date.now() - Date.parse(meta.generatedAt)) / 36e5) : null;
  $('fresh').innerHTML = `Shop of <b>${fmt(idx(D.shop.shopDate))}</b>${age !== null ? ` · updated ${age < 1 ? 'just now' : age + ' h ago'}` : ''}${D.live ? ' · live' : ''}${meta && meta.fixture ? ' · <b>test data</b>' : ''}`;
  if (meta && meta.fixture) document.body.insertAdjacentHTML('afterbegin', '<div class="banner">Test data: this copy was built from sample files, not the real shop.</div>');
  else if (age !== null && age >= 12 && !q.get('today')) document.body.insertAdjacentHTML('afterbegin', `<div class="banner">Heads up: the shop data is ${age} hours old. The automatic update may have stopped, so today's items could be missing.</div>`);
  // installable app: offline copy via a service worker, and an install button where the browser offers one
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); const b = $('installBtn'); b.hidden = false; b.onclick = async () => { b.hidden = true; e.prompt(); }; });
  sharedBanner(); controls(); bind(); render(); sources(); cardUI(); compareUI(); crew();
  // scroll drives the scene: the title floats away, the surface scrolls off and we dive towards the seabed.
  // The values are set only on the scene and the title (not the whole page), so the browser restyles just those.
  const root = document.documentElement, sceneEl = document.querySelector('.scene'), heroEl = document.querySelector('.hero');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let ticking = false, lastP = -1, lastSurf = null;
  const scene = () => {
    ticking = false;
    const max = root.scrollHeight - innerHeight, y = scrollY;
    const p = max > 0 ? Math.min(1, y / max) : 0, h = Math.min(1, y / (innerHeight * 0.45));
    if (!still && Math.abs(p - lastP) > 0.0005) {
      lastP = p;
      sceneEl.style.setProperty('--p', p.toFixed(4)); sceneEl.style.setProperty('--h', h.toFixed(3)); sceneEl.style.setProperty('--sy', Math.round(y));
      heroEl.style.setProperty('--h', h.toFixed(3));
    }
    // the surface (waves, ship, clouds) stops animating once it has scrolled out of view
    const surf = y < innerHeight * 1.1;
    if (surf !== lastSurf) { lastSurf = surf; sceneEl.classList.toggle('below', !surf); }
    heroEl.classList.toggle('gone', h >= 1);
  };
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(scene); } }, { passive: true });
  // pause every scene animation while the tab is hidden
  document.addEventListener('visibilitychange', () => sceneEl.classList.toggle('paused', document.hidden));
  addEventListener('resize', scene); scene();
  // the scene follows the visitor's real clock: dawn, day, dusk or night, with the sun on its arc
  const daytime = () => {
    const d = new Date(), h = d.getHours() + d.getMinutes() / 60;
    const t = q.get('time') || (h >= 21 || h < 5.5 ? 'night' : h < 7.5 ? 'dawn' : h < 18.5 ? 'day' : 'dusk');
    root.dataset.time = t;
    // sun: rises on the left at 6, highest at 13, sets on the right at 20; the moon crosses at night
    const f = t === 'night' ? ((h + 24 - 21) % 24) / 8.5 : Math.min(1, Math.max(0, (h - 6) / 14));
    root.style.setProperty('--sun-x', (innerWidth < 760 ? 74 + f * 14 : 62 + f * 28).toFixed(1) + '%');
    root.style.setProperty('--sun-y', (innerWidth < 760 ? 50 + Math.pow(2 * f - 1, 2) * 8 : 6 + Math.pow(2 * f - 1, 2) * 26).toFixed(1) + '%'); // on phones the sun sits low, beside the ship, away from the title
  };
  daytime(); setInterval(daytime, 5 * 60e3);
}
init();
}
