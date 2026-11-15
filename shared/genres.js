// Themes ("genres") shared by the page and scripts/update.mjs: matched against the offer name and each
// item's name, set and series. "originals" = no series and no collab theme (and not a Jam Track).
export const GENRES = [
  { id: 'anime', label: 'Anime', words: ['one piece', 'naruto', 'dragon ball', 'jujutsu', 'my hero academia', 'attack on titan', 'demon slayer', 'bleach', 'solo leveling', 'hunter x hunter', 'sailor moon', 'chainsaw man', 'evangelion', 'kaiju no'] },
  { id: 'marvel', label: 'Marvel', words: ['marvel'] },
  { id: 'dc', label: 'DC', words: ['dc series', 'batman', 'superman', 'wonder woman', 'harley quinn', 'justice league', 'aquaman', 'catwoman'] },
  { id: 'starwars', label: 'Star Wars', words: ['star wars', 'mandalorian', 'jedi', 'sith', 'darth'] },
  { id: 'gaming', label: 'Game crossovers', words: ['gaming legends', 'mega man', 'sonic', 'kingdom hearts', 'halo', 'god of war', 'street fighter', 'metal gear', 'tekken', "assassin's creed", 'tomb raider', 'resident evil', 'doom', 'minecraft', 'final fantasy'] },
  { id: 'icons', label: 'Music & stars', words: ['icon series'] },
  { id: 'movies', label: 'TV & movies', words: ['stranger things', 'squid game', 'avatar', 'walking dead', 'godzilla', 'transformers', 'tmnt', 'teenage mutant', 'simpsons', 'family guy', 'south park', 'ghostbusters', 'john wick', 'terminator', 'alien', 'predator', 'matrix', 'beetlejuice', 'jason'] },
  { id: 'spooky', label: 'Spooky', words: ['dark series', 'shadow series', 'horror', 'scream', 'halloween', 'spooky', 'zombie', 'ghost', 'skull', 'vampire', 'fortnitemares', 'reaper'] },
  { id: 'sports', label: 'Sports & brands', words: ['nfl', 'nba', 'fifa', 'football', 'soccer', 'wwe', 'ufc', 'golf', 'teed off', 'nike', 'jordan', 'puma', 'vans', 'crocs', 'adidas', 'new balance'] },
  { id: 'originals', label: 'Fortnite originals', words: null }
];
const hayOf = e => [e.name, ...e.items.flatMap(i => [i.name, i.set, i.series])].filter(Boolean).join(' | ').toLowerCase();
// ids of the themes an offer (normalized shop entry) belongs to
export function themesOf(e) {
  const hay = hayOf(e), hit = GENRES.filter(g => g.words && g.words.some(w => hay.includes(w))).map(g => g.id);
  if (!hit.length && !e.items.some(i => i.series) && e.kind !== 'jamtrack') hit.push('originals');
  return hit;
}
