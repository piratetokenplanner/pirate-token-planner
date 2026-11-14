// Shared by the browser (live refresh) and scripts/update.mjs (scheduled refresh).
// Turns a fortnite-api.com /v2/shop response into the compact shape the planner uses.
// Every field we keep is listed here so the page can show exactly what was read.

export const SHOP_URL = 'https://fortnite-api.com/v2/shop?language=en';

const DAY = 864e5;
const day = iso => iso ? iso.slice(0, 10) : null;

// Map an API item type to one of the planner's categories.
export function kindOf(entry) {
  if (entry.bundle) return 'bundle';
  const it = (entry.brItems || [])[0];
  if (it) {
    const t = (it.type && it.type.value || '').toLowerCase();
    if (t === 'outfit') return 'outfit';
    if (t === 'emote') return 'emote';
    if (t === 'pickaxe') return 'pickaxe';
    if (t === 'glider') return 'glider';
    if (t === 'backpack') return 'backpack';
    if (t === 'wrap') return 'wrap';
    if (t === 'sidekick' || t === 'pet' || t === 'petcarrier') return 'sidekick';
    if (t === 'music') return 'music';
    if (t === 'shoe' || t === 'shoes' || t === 'kicks') return 'kicks';
    return 'other';
  }
  if ((entry.tracks || []).length) return 'jamtrack';
  if ((entry.cars || []).length) return 'car';
  if ((entry.legoKits || []).length) return 'lego';
  if ((entry.instruments || []).length) return 'instrument';
  return 'other';
}

function imageOf(e) {
  const r = e.newDisplayAsset && e.newDisplayAsset.renderImages && e.newDisplayAsset.renderImages[0];
  if (r && r.image) return r.image;
  if (e.bundle && e.bundle.image) return e.bundle.image;
  const it = (e.brItems || [])[0];
  if (it && it.images) return it.images.featured || it.images.icon || it.images.smallIcon || null;
  const tr = (e.tracks || [])[0];
  if (tr && tr.albumArt) return tr.albumArt;
  return null;
}

// Days since this item was last in the shop before the current appearance (null if unknown).
function gapDays(e) {
  let best = null;
  const cur = Date.parse(e.inDate || 0);
  for (const it of e.brItems || []) {
    const h = (it.shopHistory || []).map(Date.parse).filter(t => t < cur - DAY).sort((a, b) => b - a);
    if (h.length) {
      const g = Math.round((cur - h[0]) / DAY);
      best = best === null ? g : Math.min(best, g);
    } else if (it.shopHistory && it.shopHistory.length <= 1) {
      best = best === null ? Infinity : best; // first ever appearance
    }
  }
  return best === Infinity ? 'first' : best;
}

export function normalizeShop(api) {
  const entries = (api && api.data && api.data.entries) || [];
  const out = [];
  for (const e of entries) {
    if (!(e.finalPrice > 0)) continue; // token only covers V-Bucks offers
    const items = (e.brItems || []).map(i => ({
      id: i.id, name: i.name, type: i.type && i.type.value,
      rarity: i.rarity && i.rarity.displayValue,
      series: i.series && i.series.value || null,
      set: i.set && i.set.value || null,
      appearances: (i.shopHistory || []).length || null
    }));
    for (const t of e.tracks || []) items.push({ id: t.id, name: t.title, type: 'jamtrack', series: null, set: t.artist || null });
    const name = (e.bundle && e.bundle.name) || (items[0] && items[0].name) || e.devName || 'Unnamed offer';
    out.push({
      id: e.offerId || e.devName || name,
      name, kind: kindOf(e),
      price: e.finalPrice, regular: e.regularPrice,
      inDate: day(e.inDate), outDate: day(e.outDate),
      section: e.layout && e.layout.name || null,
      image: imageOf(e),
      gap: gapDays(e),
      items
    });
  }
  return { shopDate: api && api.data && day(api.data.date), entries: out };
}
