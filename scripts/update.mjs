// Scheduled data refresh. Runs in GitHub Actions (see .github/workflows/update.yml).
// Node 20+, no dependencies.  Usage:  node scripts/update.mjs
// FIXTURE_DIR=fixtures node scripts/update.mjs   -> offline run from saved responses (for testing)
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { normalizeShop, SHOP_URL } from '../shared/normalize.js';

const NEWS_URL = 'https://fortnite-api.com/v2/news/br?language=en';
const FIX = process.env.FIXTURE_DIR;
const DAY = 864e5;
const log = [];
const sha = s => createHash('sha256').update(s).digest('hex').slice(0, 16);
const readJSON = async (p, d = null) => { try { return JSON.parse(await readFile(p, 'utf8')); } catch { return d; } };
const write = (p, o) => writeFile(p, JSON.stringify(o, null, 1) + '\n');

const cache = new Map(); // each URL is fetched at most once per run
function get(url, fixtureName) {
  if (!cache.has(url)) cache.set(url, fetchOnce(url, fixtureName));
  return cache.get(url);
}
async function fetchOnce(url, fixtureName) {
  const t0 = Date.now();
  const rec = { url, at: new Date().toISOString() };
  try {
    let text, status;
    if (FIX) {
      text = await readFile(`${FIX}/${fixtureName || sha(url)}.txt`, 'utf8').catch(() => readFile(`${FIX}/${fixtureName}.json`, 'utf8'));
      status = 200; rec.fixture = true;
    } else {
      const r = await fetch(url, { headers: { 'user-agent': 'pirate-token-planner (+github pages; daily)' }, signal: AbortSignal.timeout(20000) });
      status = r.status; text = await r.text();
    }
    Object.assign(rec, { status, ok: status >= 200 && status < 300, bytes: text.length, sha256: sha(text), ms: Date.now() - t0 });
    log.push(rec);
    return rec.ok ? text : null;
  } catch (e) {
    Object.assign(rec, { ok: false, error: String(e.message || e), ms: Date.now() - t0 });
    log.push(rec);
    return null;
  }
}

// ---- 1. Item Shop -------------------------------------------------------
const prevShop = await readJSON('data/shop.json');
const shopText = await get(SHOP_URL, 'shop');
let shop = prevShop;
if (shopText) {
  shop = normalizeShop(JSON.parse(shopText));
  shop.fetchedAt = new Date().toISOString();
  shop.source = SHOP_URL;
  await write('data/shop.json', shop);
  // compact daily snapshot, keeps our own history of what was sold when
  await mkdir('data/history', { recursive: true });
  await write(`data/history/${shop.shopDate}.json`,
    shop.entries.map(({ id, name, kind, price, inDate, outDate }) => ({ id, name, kind, price, inDate, outDate })));
}

// ---- 2. Baseline: how much new stuff a normal day brings ----------------
const files = (await readdir('data/history').catch(() => [])).filter(f => /^\d{4}-\d\d-\d\d\.json$/.test(f)).sort();
const seen = new Map();
for (const f of files) for (const e of await readJSON(`data/history/${f}`, [])) if (!seen.has(e.id)) seen.set(e.id, e);
const firstSnap = files[0] ? files[0].slice(0, 10) : null;
const lastSnap = files.at(-1) ? files.at(-1).slice(0, 10) : null;
const byDay = {};
for (const e of seen.values()) {
  if (!e.inDate) continue;
  (byDay[e.inDate] ||= { date: e.inDate, count: 0, byKind: {} });
  byDay[e.inDate].count++;
  byDay[e.inDate].byKind[e.kind] = (byDay[e.inDate].byKind[e.kind] || 0) + e.price;
}
// Unbiased days: items that arrived on or after our first snapshot (we saw all of them).
// If we have too few, fall back to the last 14 days of arrivals visible in the shop (biased low: excludes items that already left).
let days = Object.values(byDay).filter(d => firstSnap && d.date >= firstSnap && d.date <= lastSnap);
let method = 'arrivals observed in our own daily snapshots';
let windowFrom = firstSnap, windowTo = lastSnap;
if (days.length < 5 && lastSnap) {
  const from = new Date(Date.parse(lastSnap) - 14 * DAY).toISOString().slice(0, 10);
  days = Object.values(byDay).filter(d => d.date >= from && d.date <= lastSnap);
  windowFrom = from;
  method = 'arrivals of items still in the shop, last 14 days (biased low until 5+ days of snapshots exist)';
}
const stays = [...seen.values()].filter(e => e.inDate && e.outDate).map(e => (Date.parse(e.outDate) - Date.parse(e.inDate)) / DAY).filter(x => x > 0 && x < 60).sort((a, b) => a - b);
const median = a => a.length ? a[Math.floor(a.length / 2)] : null;
await write('data/baseline.json', {
  method, windowFrom, windowTo, snapshots: files.length, firstSnapshot: firstSnap, lastSnapshot: lastSnap,
  days: days.sort((a, b) => a.date.localeCompare(b.date)),
  medianStayDays: median(stays), staySamples: stays.length
});

// ---- 3. News (used as automatic evidence for events) ---------------------
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

// ---- 4. Verify every curated claim against its sources -------------------
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
    // Final status, rules spelled out in data/rules.json -> statusRules
    c.status = c.newsHits.length ? 'announced' : anyVerified ? c.claim : (c.claim === 'pattern' ? 'pattern' : 'unverified');
  }
  return claims;
}
const cfgEvents = await readJSON('config/events.json', []);
const cfgRules = await readJSON('config/rules.json', {});
const events = await verify(cfgEvents, await readJSON('data/events.json', []));
cfgRules.facts = await verify(cfgRules.facts || [], (await readJSON('data/rules.json', {})).facts);
await write('data/events.json', events);
await write('data/rules.json', cfgRules);

// ---- 5. Run log ---------------------------------------------------------
await write('data/meta.json', {
  generatedAt: new Date().toISOString(), fixture: !!FIX,
  shopOk: !!shopText, newsOk: !!newsText, shopEntries: shop ? shop.entries.length : 0,
  fetches: log
});
console.log(`shop:${!!shopText} entries:${shop ? shop.entries.length : 0} snapshots:${files.length} fetches:${log.length} failed:${log.filter(l => !l.ok).length}`);
