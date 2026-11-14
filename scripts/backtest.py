"""Back-test of the shop forecast on the past-shop archive.

Usage:  pip install numpy  &&  python3 scripts/backtest.py
Downloads the daily archive snapshots (Fortnite-Datamining, ~1.3 MB per day) into .cache/archive/
and replays the planner from every day with at least 8 weeks of history before it:

  1. predict the loot of each start day in the next 21 days (activating that day, playing every day)
  2. compare with what really was in the shop in those 14 days (each item counted once)

Reported per taste profile:
  regret    = loot lost vs the start day that really was best (mean over origins)
  cover     = share of real outcomes inside the simulated 10-90% range (target 80%)
  sure      = stated "% sure" (share of futures within 5% of the best start day) vs how often that came true
"""
import json, os, sys, datetime as dt, urllib.request
import numpy as np

BASE = 'https://raw.githubusercontent.com/Fortnite-Datamining/Fortnite-Datamining/history/shop/'
FIRST, LAST = '2026-05-02', (dt.date.today() - dt.timedelta(days=1)).isoformat()
CACHE = '.cache/archive'
L, H, TOL, SPREAD, RUNS = 14, 21, 0.05, 1.25, 300
TASTES = {
    'Balanced': dict(outfit=10, bundle=10, emote=3, pickaxe=3, glider=3, backpack=3, sidekick=3, kicks=3),
    'Skins only': dict(outfit=10, bundle=10),
    'Hoarder': {k: 10 for k in 'outfit bundle emote pickaxe glider backpack sidekick kicks wrap contrail loadingscreen music car lego instrument other jamtrack'.split()},
}

def kind(e):
    if e.get('bundle'): return 'bundle'
    it = (e.get('brItems') or [None])[0]
    if it: return {'shoe': 'kicks', 'shoes': 'kicks', 'pet': 'sidekick', 'petcarrier': 'sidekick'}.get(it['type']['value'].lower(), it['type']['value'].lower())
    if e.get('tracks'): return 'jamtrack'
    if e.get('cars'): return 'car'
    return 'other'

def load():
    os.makedirs(CACHE, exist_ok=True)
    days, d = [], dt.date.fromisoformat(FIRST)
    while d.isoformat() <= LAST:
        f = f'{CACHE}/{d}.json'
        if not os.path.exists(f):
            try:
                raw = json.load(urllib.request.urlopen(BASE + d.isoformat() + '.json', timeout=60))['data']
                small = [{'k': kind(e), 'p': e.get('finalPrice', 0), 'out': (e.get('outDate') or '')[:10],
                          'key': tuple(sorted(i['id'].lower() for i in (e.get('brItems') or []))) or (e.get('offerId'),)} for e in raw.get('entries', [])]
                json.dump(small, open(f, 'w'))
            except Exception as ex:
                print('missing', d, ex, file=sys.stderr); d += dt.timedelta(days=1); continue
        days.append((d.isoformat(), json.load(open(f))))
        d += dt.timedelta(days=1)
    return days

def run(days, T):
    D = [d for d, _ in days]; N = len(D); pos = {d: i for i, d in enumerate(D)}
    P = [{tuple(e['key']): e for e in s} for _, s in days]
    V = [{k: e['p'] * T.get(e['k'], 0) / 10 for k, e in p.items()} for p in P]
    OUT = [{k: pos.get(e['out'], N + 30 if e['out'] > D[-1] else i) for k, e in P[i].items()} for i in range(N)]
    A = [None] + [{k: v for k, v in V[i].items() if k not in P[i - 1]} for i in range(1, N)]
    arr = [None] + [sum(a.values()) for a in A[1:]]
    real_of = lambda s: sum({k: v for d in range(s, s + L) for k, v in V[d].items()}.values())
    R = [real_of(s) if s + L <= N else None for s in range(N)]
    rng = np.random.default_rng(1)
    out = {'old': [], 'new': [], 'today': [], 'cover': [], 'stated': [], 'came': []}
    for t in range(56, N - L - H + 1):
        hist = range(1, t)
        surv = []
        for j in range(25):
            num = den = 0
            for d in hist:
                if d + j < t:
                    den += sum(A[d].values()); num += sum(v for k, v in A[d].items() if all(k in P[x] for x in range(d, d + j + 1)))
            surv.append(num / den)
        wd = [np.mean([arr[d] for d in hist if dt.date.fromisoformat(D[d]).weekday() == w]) for w in range(7)]
        mu = np.mean([arr[d] for d in hist]); pool = np.array([arr[d] for d in hist])
        real = np.array([R[s] for s in range(t, t + H)])
        # old planner: leave date read one day early, no carry-over, weekday averages
        old = np.array([sum(v for k, v in V[t].items() if s < OUT[t][k]) + sum(wd[dt.date.fromisoformat(D[d]).weekday()] for d in range(max(s, t + 1), s + L)) for s in range(t, t + H)])
        # new planner: leave date inclusive, carry-over by survival, one flat average day
        shop = np.array([sum(v for k, v in V[t].items() if s <= OUT[t][k]) for s in range(t, t + H)])
        M = np.zeros((H, H + L))
        for i, s in enumerate(range(t, t + H)):
            for d in range(max(s, t + 1), s + L): M[i, d - t - 1] += 1
            for d in range(t + 1, s): M[i, d - t - 1] += surv[s - d]
        new = shop + mu * M.sum(1)
        for name, p in (('old', old), ('new', new)):
            out[name].append((real.max() - real[int(np.argmax(p))]) / real.max())
        out['today'].append((real.max() - real[0]) / real.max())
        m = np.maximum(mu + SPREAD * (rng.choice(pool, size=(RUNS, H + L)) - mu), 0)
        sims = shop + m @ M.T
        p10, p90 = np.percentile(sims, 10, 0), np.percentile(sims, 90, 0)
        out['cover'].append(np.mean((real >= p10) & (real <= p90)))
        b = int(np.argmax(new))
        out['stated'].append(np.mean(sims[:, b] >= sims.max(1) * (1 - TOL))); out['came'].append(real[b] >= real.max() * (1 - TOL))
    return {k: float(np.mean(v)) for k, v in out.items()}, N - L - H + 1 - 56

if __name__ == '__main__':
    days = load()
    print(f'{len(days)} archive days, {days[0][0]} to {days[-1][0]}')
    for name, T in TASTES.items():
        r, n = run(days, T)
        print(f"{name:11s} origins {n}: regret old {r['old']*100:.1f}%  new {r['new']*100:.1f}%  always-day-1 {r['today']*100:.1f}% | "
              f"10-90% range held {r['cover']*100:.0f}% | '% sure' stated {r['stated']*100:.0f}% vs came true {r['came']*100:.0f}%")
