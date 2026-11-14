// Quick checks that run on every push (see .github/workflows/tests.yml). Run locally: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { normalizeShop } from '../shared/normalize.js';

const json = async p => JSON.parse(await readFile(new URL('../' + p, import.meta.url), 'utf8'));
const KINDS = ['outfit', 'bundle', 'emote', 'pickaxe', 'glider', 'backpack', 'wrap', 'sidekick', 'jamtrack', 'music', 'kicks', 'car', 'contrail', 'loadingscreen', 'lego', 'instrument', 'other'];

test('code files have no syntax errors', () => {
  for (const f of ['app.js', 'sw.js', 'scripts/update.mjs', 'shared/normalize.js']) {
    const r = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: spawnSync('cat', [f]).stdout });
    assert.equal(r.status, 0, `${f}: ${r.stderr}`);
  }
});

test('shop parser keeps only V-Bucks offers and knows every type', async () => {
  const s = normalizeShop(await json('fixtures/shop.json'));
  assert.ok(s.entries.length > 5);
  for (const e of s.entries) { assert.ok(e.price > 0, e.name); assert.ok(KINDS.includes(e.kind), e.kind); }
});

test('generated data is complete and readable', async () => {
  const shop = await json('data/shop.json'), meta = await json('data/meta.json');
  const base = await json('data/baseline.json'), events = await json('data/events.json'), rules = await json('data/rules.json');
  assert.ok(shop.entries.length > 0, 'shop has entries');
  assert.ok(!Number.isNaN(Date.parse(meta.generatedAt)), 'meta has a run time');
  assert.ok(Array.isArray(base.days), 'baseline has days');
  for (const e of events) { assert.ok(e.status, `${e.id} has a status`); assert.ok(e.from <= e.to, `${e.id} dates in order`); }
  assert.ok(rules.durationDays === 14 && rules.windows.length >= 1, 'token rules present');
  for (const [k, v] of Object.entries(rules.confidence)) assert.ok(v >= 0 && v <= 1, `confidence ${k} in 0..1`);
});

test('return chances are a proper survival curve', async () => {
  let r; try { r = await json('data/past/returns.json'); } catch { return; } // optional until the first data run
  assert.equal(r.S[0], 1);
  for (let i = 1; i < r.S.length; i++) assert.ok(r.S[i] <= r.S[i - 1] + 1e-9, 'never increases');
  for (const x of r.items.slice(0, 200)) assert.ok(x.g === null || x.g > 0, `${x.n}: positive gap`);
});
