// Scheduled data refresh. Runs in GitHub Actions (see .github/workflows/update.yml).
// Node 20+, no dependencies.  Usage:  node scripts/update.mjs
// FIXTURE_DIR=fixtures node scripts/update.mjs   -> offline run from saved responses (for testing)
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { normalizeShop, SHOP_URL } from '../shared/normalize.js';

const NEWS_URL = 'https://fortnite-api.com/v2/news/br?language=en';
// Past shops: daily snapshots of the same fortnite-api.com response, archived by the
// Fortnite-Datamining project (ISC license) at github.com/Fortnite-Datamining/Fortnite-Datamining
const PAST_BASE = 'https://raw.githubusercontent.com/Fortnite-Datamining/Fortnite-Datamining/history/shop/';
const PAST_REPO = 'https://github.com/Fortnite-Datamining/Fortnite-Datamining/tree/history/shop';
const PAST_FIRST = '2026-05-02';
const PAST_TARGET_DAYS = 560; // statistics should cover well over a year

// itemshop.gg history (free key, attribution "Data from itemshop.gg" shown on the page)
async function fetchItemshop(date, key) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(`https://itemshop.gg/api/v1/history/fortnite/${date}`, { headers: { authorization: `Bearer ${key}`, 'user-agent': 'pirate-token-planner' }, signal: AbortSignal.timeout(30000) });
      if (r.status === 429) { await new Promise(res => setTimeout(res, 1000 * (+r.headers.get('retry-after') || 5))); continue; }
      return r.ok ? await r.text() : null;
    } catch { /* retry */ }
  }
  return null;
}
const ISG_KIND = [['bundle', 'bundle'], ['outfit', 'outfit'], ['emote', 'emote'], ['pickaxe', 'pickaxe'], ['harvesting', 'pickaxe'], ['glider', 'glider'], ['back bling', 'backpack'], ['backpack', 'backpack'], ['wrap', 'wrap'], ['jam track', 'jamtrack'], ['track', 'jamtrack'], ['kicks', 'kicks'], ['shoe', 'kicks'], ['sidekick', 'sidekick'], ['car', 'car'], ['wheel', 'car'], ['lego', 'lego'], ['contrail', 'contrail'], ['loading', 'loadingscreen'], ['music', 'music'], ['guitar', 'instrument'], ['bass', 'instrument'], ['drum', 'instrument'], ['keytar', 'instrument'], ['microphone', 'instrument']];
function parseItemshop(text) {
  let j; try { j = JSON.parse(text); } catch { return null; }
  const d = j.data || j;
  const items = (d.sections || []).flatMap(s => s.items || []).concat(d.items || []);
  if (!items.length) return null;
  const out = [];
  for (const it of items) {
    const price = it.price && typeof it.price.amount === 'number' ? it.price.amount : null;
    if (!(price > 0)) continue;
    const t = String(it.bundle ? 'bundle' : it.type || '').toLowerCase();
    const kind = (ISG_KIND.find(([k]) => t.includes(k)) || [null, 'other'])[1];
    const keyId = k => k ? String(k).split(':').pop().toLowerCase() : null;
    const ids = (it.contents && it.contents.length ? it.contents.map(c => keyId(c.itemKey) || String(c.name).toLowerCase()) : [keyId(it.itemKey) || String(it.name).toLowerCase()]).filter(Boolean);
    out.push({ id: it.id || it.itemKey || it.name, kind, price, items: kind === 'jamtrack' ? [] : ids });
  }
  return out;
}
const FIX = process.env.FIXTURE_DIR;
const DAY = 864e5;
const log = [];
const sha = s => createHash('sha256').update(s).digest('hex').slice(0, 16);
const readJSON = async (p, d = null) => { try { return JSON.parse(await readFile(p, 'utf8')); } catch { return d; } };
const write = (p, o) => writeFile(p, JSON.stringify(o, null, 1) + '\n');
const iso = t => new Date(t).toISOString().slice(0, 10);
const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };

const cache = new Map(); // each URL is fetched at most once per run
function get(url, fixtureName) {
  if (!cache.has(url)) cache.set(url, fetchOnce(url, fixtureName));
  return cache.get(url);
}
async function fetchOnce(url, fixtureName, quiet = false) {
  const t0 = Date.now();
  const rec = { url, at: new Date().toISOString() };
  try {
    let text, status;
    if (FIX) {
      text = await readFile(`${FIX}/${fixtureName || sha(url)}.txt`, 'utf8').catch(() => readFile(`${FIX}/${fixtureName}.json`, 'utf8'));
      status = 200; rec.fixture = true;
    } else {
      const r = await fetch(url, { headers: { 'user-agent': 'pirate-token-planner (+github pages; daily)' }, signal: AbortSignal.timeout(30000) });
      status = r.status; text = await r.text();
    }
    Object.assign(rec, { status, ok: status >= 200 && status < 300, bytes: text.length, sha256: sha(text), ms: Date.now() - t0 });
    if (!quiet) log.push(rec);
    return rec.ok ? text : null;
  } catch (e) {
    Object.assign(rec, { ok: false, error: String(e.message || e), ms: Date.now() - t0 });
    if (!quiet) log.push(rec);
    return null;
  }
}

// ---- 1. Past shops: import missing days from the archive -----------------
// For every day we keep: V-Bucks of offers that arrived that day, by type (an offer
// "arrives" when it wasn't in the previous day's shop), plus when each item was in the shop.
const past = await readJSON('data/past/days.json', { source: PAST_REPO, days: [], lastOffers: [], lastItems: [] });
const appear = await readJSON('data/past/items.json', {}); // item id -> [[firstDay, lastDay], ...]
const names = await readJSON('data/past/names.json', {}); // item id -> { n: name, t: type }
const TYPE = { outfit: 'outfit', emote: 'emote', pickaxe: 'pickaxe', glider: 'glider', backpack: 'backpack', wrap: 'wrap', shoe: 'kicks', shoes: 'kicks', kicks: 'kicks', contrail: 'contrail', loadingscreen: 'loadingscreen', music: 'music', sidekick: 'sidekick', pet: 'sidekick', petcarrier: 'sidekick' };
const remember = it => { if (it.type !== 'jamtrack' && it.name) names[String(it.id).toLowerCase()] = { n: it.name, t: TYPE[String(it.type).toLowerCase()] || 'other' }; };
const pastLog = { requested: 0, imported: 0, missing: [] };
if (!FIX) {
  const have = new Set(past.days.map(d => d.date));
  const yesterday = iso(Date.now() - DAY);
  const todo = [];
  for (let t = Date.parse(PAST_FIRST); iso(t) <= yesterday; t += DAY) if (!have.has(iso(t))) todo.push(iso(t));
  todo.sort();
  // only import forward from the last imported day, so "arrived" is always computed against the day before
  const last = past.days.length ? past.days.at(-1).date : null;
  const queue = todo.filter(d => !last || d > last);
  let prevOffers = new Set(past.lastOffers), prevItems = new Set(past.lastItems), prevDate = last;
  for (let i = 0; i < queue.length; i += 8) {
    const batch = queue.slice(i, i + 8);
    const texts = await Promise.all(batch.map(d => fetchOnce(PAST_BASE + d + '.json', null, true)));
    pastLog.requested += batch.length;
    batch.forEach((d, k) => {
      if (!texts[k]) { pastLog.missing.push(d); prevOffers = null; return; }
      let s; try { s = normalizeShop(JSON.parse(texts[k])); } catch { pastLog.missing.push(d); prevOffers = null; return; }
      const contiguous = prevOffers && prevDate && Date.parse(d) - Date.parse(prevDate) === DAY;
      const byKind = {}; let count = 0; const stays = [];
      for (const e of s.entries) {
        if (contiguous && !prevOffers.has(e.id)) {
          byKind[e.kind] = (byKind[e.kind] || 0) + e.price; count++;
          if (e.inDate && e.outDate) stays.push((Date.parse(e.outDate) - Date.parse(e.inDate)) / DAY);
        }
        for (const it of e.items) {
          if (it.type === 'jamtrack') continue;
          remember(it);
          const id = String(it.id).toLowerCase(), list = (appear[id] ||= []);
          if (prevItems.has(id) && list.length && contiguous) list.at(-1)[1] = d; else list.push([d, d]);
        }
      }
      past.days.push(contiguous ? { date: d, offers: s.entries.length, count, byKind, stay: median(stays) } : { date: d, offers: s.entries.length, gapBefore: true });
      prevOffers = new Set(s.entries.map(e => e.id));
      prevItems = new Set(s.entries.flatMap(e => e.items.filter(i => i.type !== 'jamtrack').map(i => String(i.id).toLowerCase())));
      prevDate = d; pastLog.imported++;
    });
  }
  past.lastOffers = prevOffers ? [...prevOffers] : []; past.lastItems = [...prevItems];

  // ---- 1b. Older days (before the archive starts) from itemshop.gg -------
  // Needs a free API key in the GitHub secret ITEMSHOP_KEY. Goes back PAST_TARGET_DAYS from today,
  // so the statistics cover more than a full year (and last year's Winterfest and season launches).
  const KEY = process.env.ITEMSHOP_KEY;
  const target = iso(Date.now() - PAST_TARGET_DAYS * DAY);
  const older = [];
  for (let t = Date.parse(target); iso(t) < PAST_FIRST; t += DAY) older.push(iso(t));
  const haveDates = new Set(past.days.map(d => d.date));
  const need = older.filter(d => !haveDates.has(d));
  if (KEY && need.length) {
    let pOffers = null, pItems = new Set(), pDate = null, got = 0;
    // resume from the newest backfilled day before the gap, so arrivals are computed against the day before
    const lastOld = past.days.filter(d => d.date < need[0]).at(-1);
    if (lastOld && lastOld.src === 'itemshop.gg' && past.oldTail) { pOffers = new Set(past.oldTail.offers); pItems = new Set(past.oldTail.items); pDate = lastOld.date; }
    for (let i = 0; i < need.length; i += 6) {
      const batch = need.slice(i, i + 6);
      const texts = await Promise.all(batch.map(d => fetchItemshop(d, KEY)));
      batch.forEach((d, k) => {
        const day = texts[k] && parseItemshop(texts[k]);
        if (!day) { pastLog.missing.push(d + ' (itemshop.gg)'); pOffers = null; return; }
        const contiguous = pOffers && pDate && Date.parse(d) - Date.parse(pDate) === DAY;
        const byKind = {}; let count = 0;
        for (const e of day) {
          if (contiguous && !pOffers.has(e.id)) { byKind[e.kind] = (byKind[e.kind] || 0) + e.price; count++; }
          for (const id of e.items) { const list = (appear[id] ||= []); if (pItems.has(id) && contiguous && list.length) { const r = list.find(r => r[1] === pDate); if (r) r[1] = d; else list.push([d, d]); } else list.push([d, d]); }
        }
        past.days.push(contiguous ? { date: d, offers: day.length, count, byKind, src: 'itemshop.gg' } : { date: d, offers: day.length, gapBefore: true, src: 'itemshop.gg' });
        pOffers = new Set(day.map(e => e.id)); pItems = new Set(day.flatMap(e => e.items)); pDate = d; got++;
      });
    }
    past.oldTail = pOffers ? { offers: [...pOffers], items: [...pItems] } : null;
    for (const list of Object.values(appear)) list.sort((x, y) => x[0].localeCompare(y[0]));
    past.days.sort((x, y) => x.date.localeCompare(y.date));
    log.push({ url: 'https://itemshop.gg/api/v1/history/fortnite/…', at: new Date().toISOString(), ok: true, status: 200, bytes: got, sha256: `${got} older days imported` });
    pastLog.imported += got;
  } else if (!KEY && need.length) {
    // optional source: without a key this step is skipped, which is not an error
    log.push({ url: 'https://itemshop.gg/api/v1/history/fortnite/…', at: new Date().toISOString(), ok: true, status: 'skipped', sha256: `no ITEMSHOP_KEY: ${need.length} older days not loaded` });
  }
  past.sources = [{ name: 'Fortnite-Datamining archive', url: PAST_REPO, from: PAST_FIRST }, ...(past.days.some(d => d.src === 'itemshop.gg') ? [{ name: 'itemshop.gg', url: 'https://itemshop.gg', from: past.days.find(d => d.src === 'itemshop.gg').date }] : [])];
  past.source = PAST_REPO; past.first = past.days[0] && past.days[0].date; past.last = past.days.at(-1) && past.days.at(-1).date;
  await mkdir('data/past', { recursive: true });
  await write('data/past/days.json', past);
  await writeFile('data/past/items.json', JSON.stringify(appear) + '\n');
  log.push({ url: PAST_BASE + '…', at: new Date().toISOString(), ok: pastLog.missing.length === 0, status: 200, bytes: pastLog.imported, sha256: `${pastLog.imported} days imported`, error: pastLog.missing.length ? `missing: ${pastLog.missing.join(', ')}` : undefined });
}

// ---- 2. Today's Item Shop -------------------------------------------------
const prevShop = await readJSON('data/shop.json');
const shopText = await get(SHOP_URL, 'shop');
let shop = prevShop;
if (shopText) { shop = normalizeShop(JSON.parse(shopText)); shop.fetchedAt = new Date().toISOString(); shop.source = SHOP_URL; }
if (shop) {
  // gap = days since the item was last in the shop before this appearance ('unseen' = not in the archive at all)
  const start = past.first;
  for (const e of shop.entries) {
    let gap = null;
    const cur = e.inDate || shop.shopDate;
    for (const it of e.items) {
      if (it.type === 'jamtrack') continue;
      const list = appear[String(it.id).toLowerCase()] || [];
      const before = list.filter(([, b]) => b < iso(Date.parse(cur) - DAY));
      const g = before.length ? Math.round((Date.parse(cur) - Date.parse(before.at(-1)[1])) / DAY) : (start ? 'unseen' : null);
      it.appearances = list.length; remember(it);
      gap = gap === null ? g : g === 'unseen' ? gap : gap === 'unseen' ? g : Math.min(gap, g);
    }
    e.gap = gap;
  }
  shop.historyFrom = start || null;
  await write('data/shop.json', shop);
  await mkdir('data/history', { recursive: true });
  await write(`data/history/${shop.shopDate}.json`,
    shop.entries.map(({ id, name, kind, price, inDate, outDate }) => ({ id, name, kind, price, inDate, outDate })));
}

// ---- 2b. Return chances: how long items stay away before coming back -----
// Pooled over all items: every finished absence (between two shop stays) is an observation,
// every absence still running at the end of the history is a censored one (Kaplan-Meier).
if (past.last) {
  const end = past.last, gaps = [], open = [], items = [];
  for (const [id, list] of Object.entries(appear)) {
    if (!names[id]) continue;
    // days away between two stays; 0 or less means two records of one stay (a missing archive day), not a return
    const g = [];
    for (let k = 1; k < list.length; k++) { const x = Math.round((Date.parse(list[k][0]) - Date.parse(list[k - 1][1])) / DAY) - 1; if (x > 0) g.push(x); }
    gaps.push(...g);
    const last = list.at(-1)[1];
    const away = Math.round((Date.parse(end) - Date.parse(last)) / DAY);
    if (away > 0) open.push(away);
    items.push({ i: id, n: names[id].n, t: names[id].t, k: g.length + 1, l: last, g: g.length ? median(g) : null });
  }
  const T = Math.round((Date.parse(end) - Date.parse(past.first)) / DAY);
  const S = []; let surv = 1;
  const ev = new Array(T + 2).fill(0), cen = new Array(T + 2).fill(0);
  for (const x of gaps) if (x <= T) ev[x]++;
  for (const x of open) if (x <= T) cen[x]++;
  let atRisk = gaps.length + open.length;
  for (let t = 0; t <= T; t++) { if (atRisk > 0) surv *= 1 - ev[t] / atRisk; S.push(+surv.toFixed(4)); atRisk -= ev[t] + cen[t]; }
  await writeFile('data/past/returns.json', JSON.stringify({
    asOf: end, from: past.first, finishedGaps: gaps.length, openGaps: open.length, medianGap: median(gaps),
    note: 'S[t] = share of absences longer than t days (Kaplan-Meier over all items). Items: i id, n name, t type, k stays, f first seen, l last day in shop, g median gap.',
    S, items
  }) + '\n');
  await writeFile('data/past/names.json', JSON.stringify(names) + '\n');
}

// ---- 3. Baseline: what a normal shop day brings, from past shops ---------
const usable = past.days.filter(d => d.byKind);
const total = d => Object.values(d.byKind).reduce((s, v) => s + v, 0);
const kinds = [...new Set(usable.flatMap(d => Object.keys(d.byKind)))];
const medByKind = Object.fromEntries(kinds.map(k => [k, median(usable.map(d => d.byKind[k] || 0))]));
// Events with "calibrateFrom" (e.g. a past season-launch week) are sized from what those past
// days brought above a median day, per item type. Those days are then left out of the normal-day pool.
const cfgEventsRaw = await readJSON('config/events.json', []);
const calib = {}, reserved = new Set();
for (const ev of cfgEventsRaw) {
  // once the archive covers an event's own dates, measure the event itself instead of a past stand-in
  const own = usable.filter(d => d.date >= ev.from && d.date <= ev.to).length >= 2;
  for (const r of own ? [{ from: ev.from, to: ev.to, label: 'this event, measured' }] : (ev.calibrateFrom || [])) {
  const ds = usable.filter(d => d.date >= r.from && d.date <= r.to);
  if (!ds.length) continue;
  const len = Math.round((Date.parse(ev.to) - Date.parse(ev.from)) / DAY) + 1;
  const byKind = {};
  for (const k of kinds) byKind[k] = Math.max(0, ds.reduce((s, d) => s + (d.byKind[k] || 0) - medByKind[k], 0) * len / ds.length);
  (calib[ev.id] ||= []).push({ ...r, days: ds.length, byKind });
  ds.forEach(d => reserved.add(d.date));
  }
}
await write('data/baseline.json', {
  method: usable.length ? `past shops ${past.first} to ${past.last}` : 'none yet',
  source: PAST_REPO, sources: past.sources || [{ name: 'Fortnite-Datamining archive', url: PAST_REPO, from: PAST_FIRST }], windowFrom: usable[0] && usable[0].date, windowTo: usable.at(-1) && usable.at(-1).date,
  days: usable.map(({ date, count, byKind }) => ({ date, count, byKind, reserved: reserved.has(date) || undefined })),
  medianDayVbucks: median(usable.map(total)), medianByKind: medByKind,
  medianStayDays: median(usable.map(d => d.stay).filter(x => x > 0 && x < 60)), staySamples: usable.filter(d => d.stay).length,
  snapshots: past.days.length
});

// ---- 4. News (used as automatic evidence for events) ---------------------
const newsText = await get(NEWS_URL, 'news');
let news = await readJSON('data/news.json', { items: [] });
if (newsText) {
  const n = JSON.parse(newsText).data || {};
  const motds = (n.motds || []).map(m => ({ title: m.title, body: m.body }));
  const msgs = (n.messages || []).map(m => ({ title: m.title, body: m.body }));
  news = { fetchedAt: new Date().toISOString(), source: NEWS_URL, items: [...motds, ...msgs] };
  await write('data/news.json', news);
}
const newsBlob = news.items.map(i => `${i.title} ${i.body}`).join(' ').toLowerCase();

// ---- 5. Verify every curated claim against its sources -------------------
async function verify(claims, prev) {
  const prevById = Object.fromEntries((prev || []).map(c => [c.id, c]));
  for (const c of claims) {
    const old = prevById[c.id] || {};
    for (const s of c.sources || []) {
      const t = await get(s.url, s.fixture);
      const oldS = (old.sources || []).find(o => o.url === s.url) || {};
      s.checkedAt = new Date().toISOString();
      s.reachable = !!t;
      if (t) {
        const low = t.toLowerCase();
        s.found = (s.mustContain || []).map(m => ({ text: m, ok: low.includes(m.toLowerCase()) }));
        s.verified = s.found.every(f => f.ok);
        s.hash = sha(t);
        s.changedSinceLastCheck = !!(oldS.hash && oldS.hash !== s.hash);
      } else { s.verified = false; s.hash = oldS.hash || null; }
    }
    c.newsHits = (c.newsKeywords || []).filter(k => newsBlob.includes(k.toLowerCase()));
    const anyVerified = (c.sources || []).some(s => s.verified);
    c.status = c.newsHits.length ? 'announced' : anyVerified ? c.claim : (c.claim === 'pattern' ? 'pattern' : 'unverified');
    if (calib[c.id]) { const byKind = {}; for (const r of calib[c.id]) for (const [k, v] of Object.entries(r.byKind)) byKind[k] = (byKind[k] || 0) + v / calib[c.id].length; c.fromHistory = { byKind, from: calib[c.id] }; }
  }
  return claims;
}
const cfgEvents = await readJSON('config/events.json', []);
const cfgRules = await readJSON('config/rules.json', {});
const events = await verify(cfgEvents, await readJSON('data/events.json', []));
cfgRules.facts = await verify(cfgRules.facts || [], (await readJSON('data/rules.json', {})).facts);
await write('data/events.json', events);
await write('data/rules.json', cfgRules);

// ---- 6. Run log ---------------------------------------------------------
await write('data/meta.json', {
  generatedAt: new Date().toISOString(), fixture: !!FIX,
  shopOk: !!shopText, newsOk: !!newsText, shopEntries: shop ? shop.entries.length : 0,
  past: { first: past.first, last: past.last, days: past.days.length, importedThisRun: pastLog.imported, missing: pastLog.missing },
  fetches: log
});
console.log(`shop:${!!shopText} entries:${shop ? shop.entries.length : 0} pastDays:${past.days.length} imported:${pastLog.imported} calibrated:${Object.keys(calib).length} fetches:${log.length} failed:${log.filter(l => !l.ok).length}`);
