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
const DEF = { types: { ...base }, kw: '', kwBoost: 2, rare: 3, ev: {}, days: [1, 1, 1, 1, 1, 1, 1], late: true, owned: [] };
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
    const rare = e.gap === 'first' || (typeof e.gap === 'number' && e.gap >= 365);
    const own = P.owned.includes(e.id);
    const share = e.kind === 'bundle' && e.items.length ? e.items.filter(i => !solo.has(i.id)).length / e.items.length : 1;
    const value = own ? 0 : e.price * w(e.kind) * (fav ? P.kwBoost : 1) * (rare ? rareMul : 1) * share;
    return { e, out, fav, rare, own, value, share };
  }).filter(x => x.out > 0);

  // a normal future day: average new arrivals by type, weighted by your taste
  const B = Object.entries(D.base.mean).reduce((s, [k, v]) => s + v * w(k), 0);

  const events = D.events.filter(e => e.extraVbucks > 0 || e.observed).map(e => {
    const conf = R.confidence[e.status] ?? 0.2;
    const interest = (P.ev[e.id] ?? 5) / 5;
    const extra = e.observed ?? e.extraVbucks;
    return { e, a: idx(e.from), b: idx(e.to), conf, interest, extra, full: extra * conf * interest * w('outfit') };
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
    fresh = freshDays.length * B;
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
  const dayVals = D.base.fallback ? null : D.base.dayTotals.map(byKind => Object.entries(byKind).reduce((t, [k, v]) => t + v * w(k), 0));
  const plays2 = i => valid(i) && plays(i);
  const sims = all.map(() => []), wins = all.map(() => 0);
  for (let r = 0; r < N; r++) {
    const scale = D.base.fallback ? Math.exp(gauss(rnd) * U.fallbackSpread) : 1;
    const day = []; for (let d = 0; d <= startMax + dur; d++) day.push(dayVals ? dayVals[Math.floor(rnd() * dayVals.length)] : B * scale);
    const evs = events.map(x => {
      const happens = rnd() < x.conf;
      const sh = x.e.status === 'pattern' ? Math.round((rnd() * 2 - 1) * U.patternShiftDays) : 0;
      const mult = Math.exp(gauss(rnd) * (x.e.observed ? U.observedSpread : U.estimateSpread));
      return { a: x.a + sh, b: x.b + sh, v: happens ? x.extra * mult * x.interest * w('outfit') : 0 };
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
  return { win, startMin, startMax, deadIdx, dur, all, items, B, events, kws, rareMul, U };
}

// ---------- rendering ----------
function render() {
  const M = model();
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
  $('vWhen').textContent = (best === 0 ? 'Now' : `At ${resetLocal}, after the shop reset`) + ` · ends ${fmtL(best + dur)}` + (best + dur > deadIdx ? ' (past the deadline, unconfirmed)' : '');
  const pb = Math.round(rank[0].pBest * 100), close = rank.slice(1, 4).filter(a => a.p90 >= rank[0].p10).length;
  $('vSure').innerHTML = `~${n0(rank[0].tot)} V-Bucks of loot · <b>${pb}% sure</b>` + (pb < 30 ? ' · close race, any top day is fine' : '');
  const often = [...all].sort((a, b) => b.pBest - a.pBest)[0];
  if (often.s !== best) $('vSure').innerHTML += ` · safer: ${fmtL(often.s)}`;
  $('alts').innerHTML = '<small>Close calls:</small>' + rank.slice(1, 4).map(a => `<button class="chip" data-s="${a.s}">${fmtL(a.s)} · ${pct(a.tot)}%</button>`).join('');

  // voyage
  const H = M.startMax + dur + 1, tp = i => Math.max(0, Math.min(100, i / H * 100));
  const leave = {}; for (const x of M.items) if (x.value > 0 && x.out < H) (leave[x.out] ||= []).push(x);
  $('vTitle').textContent = `${fmt(sel)} – ${fmt(sel + dur - 1)}`;
  $('vScore').textContent = `${n0(cur.tot)} V-Bucks` + (sel !== best ? ` (${pct(cur.tot)}% of best)` : '');
  $('track').innerHTML = `<div class="win" style="left:${tp(sel)}%;width:${tp(dur)}%"></div><div class="dl" style="left:${tp(deadIdx)}%"><b>Deadline</b></div>` +
    `<div class="row">${Object.entries(leave).map(([d, xs]) => `<span class="tick ${d > sel ? '' : 'out'}" style="left:${tp(+d)}%" title="${xs.length} wanted items leave ${fmt(+d)}">${xs.length}</span>`).join('')}</div>` +
    D.events.map(e => { const a = idx(e.from), b = idx(e.to), r = cur.evRows.find(r => r.x.e.id === e.id); return `<div class="row"><div class="ev ${r && r.v > 0 ? 'in' : 'out'}" style="left:${tp(a)}%;width:max(${Math.min(tp(b - a + 1), 100 - tp(a))}%,28px);background:${e.extraVbucks ? '#7fe3c6' : '#cfe3ff'}" title="${esc(e.name)}">${esc(e.name)}</div></div>`; }).join('');
  const ax = []; for (let i = 0; i < H; i += 7) ax.push(i);
  $('axis').innerHTML = ax.map(i => `<span style="left:${tp(i)}%">${fmt(i)}</span>`).join('');

  // the math for the selected day
  $('mathTitle').textContent = `The math (${fmt(sel)})`;
  $('sum').innerHTML = [[cur.tot, `Expected total (likely ${n0(cur.p10)} to ${n0(cur.p90)})`], [cur.shop, "From today's shop"], [cur.fresh, 'From new items later'], [cur.ev, 'From expected events']].map(([v, l]) => `<div><b>${n0(v)}</b><span>${l}</span></div>`).join('');
  const rows = [];
  const zero = cur.rows.filter(r => !r.hit && r.x.value === 0);
  for (const r of [...cur.rows].filter(r => !zero.includes(r)).sort((a, b) => b.hit - a.hit || b.x.value - a.x.value)) {
    const x = r.x, parts = [`${n0(x.e.price)}`, `${P.types[x.e.kind] ?? 2}/10`]; if (x.fav) parts.push(P.kwBoost); if (x.rare) parts.push(M.rareMul.toFixed(1)); if (x.share < 1) parts.push(x.share.toFixed(2));
    rows.push(`<tr class="${r.hit ? '' : 'miss'}"><td data-l="What">${esc(x.e.name)} <span class="fine">${KINDS[x.e.kind] || x.e.kind}</span></td><td data-l="Inputs">${n0(x.e.price)} V-Bucks · weight ${P.types[x.e.kind] ?? 2}${x.fav ? ` · favourite "${esc(x.fav)}" ×${P.kwBoost}` : ''}${x.rare ? ` · rare return ×${M.rareMul.toFixed(1)}` : ''}${x.share < 1 ? ` · ${Math.round(x.share * 100)}% of items not sold separately` : ''} · in shop until ${fmt(x.out - 1)}</td><td data-l="Calculation">${r.hit ? `<code>${parts.join(' × ')}</code>` : esc(r.why)}</td><td class="num" data-l="V-Bucks">${r.hit ? n0(r.v) : '0'}</td></tr>`);
  }
  if (zero.length) rows.push(`<tr class="miss"><td data-l="What">${zero.length} items worth 0 to you</td><td data-l="Inputs">${esc(zero.slice(0, 6).map(r => r.x.e.name).join(', '))}${zero.length > 6 ? '…' : ''}</td><td data-l="Calculation">Type weight 0 or marked as owned</td><td class="num" data-l="V-Bucks">0</td></tr>`);
  rows.push(`<tr><td data-l="What">New items on later days</td><td data-l="Inputs">${cur.freshDays.length} shop days you can reach · ${n0(M.B)} per day for your taste</td><td data-l="Calculation"><code>${cur.freshDays.length} × ${n0(M.B)}</code></td><td class="num" data-l="V-Bucks">${n0(cur.fresh)}</td></tr>`);
  for (const r of cur.evRows) rows.push(`<tr class="${r.v > 0 ? '' : 'miss'}"><td data-l="What">${esc(r.x.e.name)}</td><td data-l="Inputs">${n0(r.x.extra)} extra${r.x.e.observed ? ' (observed)' : ' (estimate)'} · ${r.x.e.status} ×${r.x.conf} · interest ×${r.x.interest.toFixed(1)} · outfit weight ${P.types.outfit}/10 · ${r.inside.length} of ${r.x.b - r.x.a + 1} days inside</td><td data-l="Calculation"><code>${n0(r.x.extra)} × ${r.x.conf} × ${r.x.interest.toFixed(1)} × ${(P.types.outfit / 10).toFixed(1)} × ${r.cov.toFixed(2)}</code></td><td class="num" data-l="V-Bucks">${n0(r.v)}</td></tr>`);
  $('mtab').tBodies[0].innerHTML = rows.join('');

  // reminder + plan
  const d = dt(sel), ds = d.toISOString().slice(0, 10).replace(/-/g, '');
  $('gcal').href = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent('Activate Fortnite Pirate Shop Access')}&dates=${ds}T000500Z/${ds}T003500Z&details=${encodeURIComponent('Item Shop > Plunder the Item Shop > Activate Now. Claim every day you play for 14 days.\n' + location.href.split('#')[0])}`;
  render.plan = `Pirate Shop plan: activate ${fmtL(sel)} after the 00:00 UTC reset (${resetLocal} my time). Access ends ${fmtL(sel + dur)}. Expected haul ~${n0(cur.tot)} V-Bucks of wanted items: ` + cur.rows.filter(r => r.hit).map(r => r.x.e.name).join(', ') + '.';

  // shop grid
  const hitIds = new Set(cur.rows.filter(r => r.hit).map(r => r.x.e.id));
  const sorted = [...M.items].sort((a, b) => b.value - a.value), shown = render.allShop ? sorted : sorted.slice(0, 20);
  $('shopMore').hidden = render.allShop || sorted.length <= 20; $('shopMore').textContent = `Show all ${sorted.length}`;
  $('shopgrid').innerHTML = shown.map(x => `<article class="item${x.own ? ' own' : ''}${hitIds.has(x.e.id) ? ' hit' : ''}"><div class="img">${x.e.image ? `<img loading="lazy" src="${esc(x.e.image)}" alt="" onerror="this.remove()">` : esc(x.e.name)}</div><div class="bd"><span class="nm">${esc(x.e.name)}</span><span class="mt">${KINDS[x.e.kind] || x.e.kind} · last day ${fmt(x.out - 1)}${x.e.gap === 'first' ? ' · first time in shop' : typeof x.e.gap === 'number' ? ` · back after ${x.e.gap} days` : ''}</span><span class="vb">${n0(x.e.price)} V-Bucks · worth ${n0(x.value)} to you</span></div><label><input type="checkbox" data-own="${esc(x.e.id)}" ${x.own ? 'checked' : ''}>I already own this</label></article>`).join('');
  $('shopNote').textContent = `${M.items.length} offers · gold border = in your 14 days`;

  formula(M); limits(M);
}

function formula(M) {
  const b = D.base, fb = b.fallback;
  const kindRows = Object.entries(b.mean).filter(([, v]) => v > 0).map(([k, v]) => `<code>${KINDS[k] || k}: ${n0(v)} × ${P.types[k] ?? 2}/10</code>`).join(' ');
  $('formula').innerHTML = `
  <div class="card"><h3>1. What an item is worth to you</h3><p><code>price × weight/10 × favourite boost × rare boost</code></p><p>Favourite boost is ×${P.kwBoost} when any word in your favourites list appears in the item's name, set, series or artist${M.kws.length ? ` (now: ${M.kws.map(esc).join(', ')})` : ' (list is empty)'}. Rare boost is ×${M.rareMul.toFixed(1)} for items that are in the shop for the first time or back after 365+ days, from the item's shop history. Items you mark as owned are worth 0.</p></div>
  <div class="card"><h3>2. Today's shop</h3><p>An item counts if at least one day you play falls inside your window <em>and</em> before its leave date (from the shop data). Only the most valuable new Sidekick counts, because the token allows one.</p></div>
  <div class="card"><h3>3. New items on later days</h3><p>Each day in the window after today brings <code>${n0(M.B)}</code> V-Bucks for your taste: ${kindRows || 'no data'}.</p><p>Averages come from ${fb ? 'a fallback estimate in config/rules.json, because the site has no snapshots yet' : `${esc(b.method)}, ${b.snapshots} snapshot${b.snapshots === 1 ? '' : 's'}, ${b.calDays} days (${fmt(idx(b.windowFrom))} to ${fmt(idx(b.windowTo))})`}. A day counts if you play within ${b.stay} day${b.stay === 1 ? '' : 's'} of it (${b.stayFrom}).</p></div>
  <div class="card"><h3>4. Expected events</h3><p><code>extra V-Bucks × confidence × interest/5 × outfit weight/10 × share of event days in window</code></p><p>Confidence by status: ${Object.entries(D.rules.confidence).map(([k, v]) => `${k} ${v}`).join(', ')}. Once the daily snapshots cover an event's dates, the estimate is replaced by what was actually observed above a normal day.</p></div>
  <div class="card"><h3>5. Window and deadline</h3><p>Window: ${M.dur} days from activation. Activation must happen before ${esc(M.win.deadlineText)}. Days after the deadline count only with the switch on (${P.late ? 'on' : 'off'}). Play days: ${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].filter((_, i) => P.days[i]).join(', ') || 'none'}.</p></div>
  <div class="card"><h3>6. Uncertainty ranges</h3><p>The page replays every window in ${M.U.runs} simulated futures (fixed seed ${M.U.seed}, so the same data always gives the same result). In each one:</p><p>${D.base.fallback ? `every later day is the fallback average × a random factor (spread ${M.U.fallbackSpread}), since there are no snapshots yet` : `every later day is a randomly drawn real day from the ${D.base.calDays} observed days`}; each event happens with its confidence as probability; pattern events shift by up to ±${M.U.patternShiftDays} days; event sizes vary by a random factor (spread ${M.U.estimateSpread} for estimates, ${M.U.observedSpread} for observed). The whiskers show the 10th to 90th percentile, and "top in X%" is how often that day had the highest total.</p></div>
  <div class="card"><h3>7. The pick</h3><p>Every possible activation day from ${fmt(M.startMin)} to ${fmt(M.startMax)} gets a total from steps 2 to 4. The highest wins; ties go to the earlier day. The score is an estimate of value to you, not a promise of what Epic will sell.</p></div>`;
}

function limits(M) {
  const b = D.base, est = D.events.filter(e => e.extraVbucks > 0 && !e.observed);
  const L = [
    ['Nobody knows the future shop', `Epic doesn't publish the Item Shop ahead of time. Everything after today is an average of ${b.fallback ? 'a rough guess (no snapshots collected yet)' : `${b.calDays} days of arrivals from ${b.snapshots} snapshot${b.snapshots === 1 ? '' : 's'}${b.snapshots < 5 ? ', which undercounts until 5+ snapshots exist (items that already left are missing)' : ''}`}, not real items. A day you see as "best" can lose if Epic drops something you love on another day.`],
    ['Event values are guesses', est.length ? `${est.map(e => `${esc(e.name)}: ${n0(e.extraVbucks)} V-Bucks`).join(', ')}. These are the author's assumptions, not data. They are replaced automatically once the snapshots cover those dates.` : 'All event values are now observed from snapshots.'],
    ['Event dates may be wrong', 'Events marked "pattern" are dated from past years. The simulation moves them by a few days, but an event could also be cancelled or moved further.'],
    ['Token rules come from news reports', 'The 14 days, the deadline, the exclusions and the one-Sidekick limit come from gaming sites, not an Epic rules page. Check the text on your own token in-game.'],
    ['Late activation is uncertain', 'Whether access keeps running after the Dec 15 deadline is not confirmed. With the switch on, those days count fully; with it off, they count zero. The truth may be either.'],
    ['Shop data is unofficial', 'fortnite-api.com is a fan service. Leave dates can change when Epic extends or pulls items; prices can change.'],
    ['Value is not money', '"V-Bucks of things you want" is list price scaled by your sliders. It is a way to compare days, not what the items are worth or what you would have spent.'],
    ['The ranges are not complete', 'The whiskers only cover what is modelled (later days, events, their dates and sizes). They do not cover rule changes, wrong source data, or your taste changing. The spread settings themselves are the author\'s choices, listed in config/rules.json.']
  ];
  $('limits').innerHTML = L.map(([h, t]) => `<div class="card"><h3>${h}</h3><p>${t}</p></div>`).join('');
}

function sources() {
  const m = D.meta || {}, fail = (m.fetches || []).filter(f => !f.ok).length;
  $('health').innerHTML = `<div class="health">
    <div><b>${m.generatedAt ? new Date(m.generatedAt).toLocaleString() : 'unknown'}</b><span class="fine">Last scheduled data run${m.fixture ? ' (offline test data)' : ''}</span></div>
    <div><b>${D.shop.shopDate || '?'} ${D.live ? '· live' : ''}</b><span class="fine">${D.liveNote}</span></div>
    <div><b>${D.base.snapshots} snapshots</b><span class="fine">Daily shop history collected by this site</span></div>
    <div><b class="${fail ? 'bad' : 'okc'}">${fail ? fail + ' failed' : 'All OK'}</b><span class="fine">${(m.fetches || []).length} requests on the last run</span></div></div>`;
  const srcList = ss => ss.length ? ss.map(s => `<div><a href="${esc(s.url)}" rel="noopener">${esc(new URL(s.url).hostname)}</a> ${s.reachable === false ? '<span class="bad">unreachable</span>' : (s.found || []).map(f => `<span class="${f.ok ? 'okc' : 'bad'}">${f.ok ? '✓' : '✗'} "${esc(f.text)}"</span>`).join(' ')}${s.changedSinceLastCheck ? ' <span class="fine">page changed since previous check</span>' : ''}${s.checkedAt ? ` <span class="fine">checked ${new Date(s.checkedAt).toLocaleDateString()}</span>` : ''}</div>`).join('') : '<span class="fine">No source: author assumption</span>';
  $('facts').tBodies[0].innerHTML = (D.rules.facts || []).map(f => `<tr><td data-l="Rule">${esc(f.text)}</td><td data-l="Status"><span class="st ${f.status}">${f.status}</span></td><td data-l="Sources">${srcList(f.sources || [])}</td></tr>`).join('');
  $('statusRules').innerHTML = (D.rules.statusRules || []).map(esc).join('<br>');
  $('evtab').tBodies[0].innerHTML = D.events.map(e => `<tr><td data-l="Event">${esc(e.name)}</td><td data-l="Dates">${fmt(idx(e.from))}${e.to !== e.from ? ' to ' + fmt(idx(e.to)) : ''}</td><td data-l="Status"><span class="st ${e.status}">${e.status}</span>${e.newsHits && e.newsHits.length ? `<div class="fine">in Epic news: ${e.newsHits.map(esc).join(', ')}</div>` : ''}</td><td class="num" data-l="Extra">${e.observed ? n0(e.observed) + ' observed' : n0(e.extraVbucks)}</td><td data-l="Basis"><div>${esc(e.basis)}</div>${srcList(e.sources || [])}</td></tr>`).join('');
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
  $('boosts').innerHTML = sl('kwBoost', 'Favourite boost', P.kwBoost, 1, 3, .5, 'Multiplier for items matching a favourite word') + sl('rare', 'Rare return bonus', P.rare, 0, 10, 1, 'Adds 10% per step for first-time items or items back after a year');
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
  $('shopMore').addEventListener('click', () => { render.allShop = true; render(); });
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
  const pick = e => { const b = e.target.closest('[data-s]'); if (!b) return; sel = +b.dataset.s; render(); };
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
  // baseline: mean V-Bucks of new arrivals per calendar day, by type
  const b = base || {}, fb = rules.fallbacks;
  const calDays = b.windowFrom && b.windowTo ? Math.round((Date.parse(b.windowTo) - Date.parse(b.windowFrom)) / DAY) + 1 : 0;
  const mean = {};
  if (calDays && (b.days || []).length) { for (const d of b.days) for (const [k, v] of Object.entries(d.byKind)) mean[k] = (mean[k] || 0) + v / calDays; }
  else Object.assign(mean, fb.baselinePerDayByKind);
  const dayTotals = [];
  if (calDays) { for (let t = Date.parse(b.windowFrom); t <= Date.parse(b.windowTo); t += DAY) { const s = new Date(t).toISOString().slice(0, 10); const d = (b.days || []).find(x => x.date === s); dayTotals.push(d ? d.byKind : {}); } }
  const stay = Math.max(1, Math.round(b.medianStayDays || fb.stayDays));
  D.base = { ...b, mean, calDays, dayTotals, stay, fallback: !(calDays && (b.days || []).length), snapshots: b.snapshots || 0, stayFrom: b.medianStayDays ? `median stay of ${b.staySamples} offers` : 'fallback value' };
  // replace event estimates by observation once 5+ snapshots cover the event days
  if ((b.snapshots || 0) >= 5) {
    const tot = d => Object.values(d.byKind).reduce((s, v) => s + v, 0);
    const avg = (b.days || []).reduce((s, d) => s + tot(d), 0) / calDays;
    for (const e of D.events) {
      const covered = [];
      for (let t = Date.parse(e.from); t <= Date.parse(e.to); t += DAY) { const s = new Date(t).toISOString().slice(0, 10); if (s >= b.firstSnapshot && s <= b.windowTo) covered.push(s); }
      if (covered.length >= 2) {
        const len = Math.round((Date.parse(e.to) - Date.parse(e.from)) / DAY) + 1;
        const ex = covered.reduce((s, c) => { const d = b.days.find(x => x.date === c); return s + (d ? tot(d) : 0) - avg; }, 0);
        e.observed = Math.max(0, ex * len / covered.length);
      }
    }
  }
  const age = meta && meta.generatedAt ? Math.round((Date.now() - Date.parse(meta.generatedAt)) / 36e5) : null;
  $('fresh').innerHTML = `Shop of <b>${fmt(idx(D.shop.shopDate))}</b>${age !== null ? ` · updated ${age < 1 ? 'just now' : age + ' h ago'}` : ''}${D.live ? ' · live' : ''}${meta && meta.fixture ? ' · <b>test data</b>' : ''}`;
  if (meta && meta.fixture) document.body.insertAdjacentHTML('afterbegin', '<div class="banner">Test data: this copy was built from sample files, not the real shop.</div>');
  controls(); bind(); render(); sources();
}
init();
}
