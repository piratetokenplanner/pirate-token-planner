"""Back-test and track record of the shop forecast, on the past-shop archive.

Usage:
  pip install numpy
  python3 scripts/backtest.py                       # print the back-test
  python3 scripts/backtest.py --json data/backtest.json --record data/track.json
                                                    # what the daily GitHub Action runs

Archive: daily snapshots from Fortnite-Datamining (ISC), cached in $ARCHIVE_CACHE (default .cache/archive)
as small files (type, price, leave date, item ids per offer).

BACK-TEST: from every archive day with 8+ weeks of history, predict the loot of each start day in the next
21 days (activate that day, play every day) and compare with what really was in the shop in those 14 days
(each item counted once).
  regret  = loot lost vs the start day that really was best
  cover   = share of real outcomes inside the simulated 10-90% range (target 80%)
  sure    = stated "% sure" (share of simulated futures within 5% of the best start day) vs how often it came true
  events  = leave-one-out test of season-launch weeks (config/events.json, calibrateFrom of ch8-launch)

TRACK RECORD (--record): every day, store the pick the planner makes today for three tastes (shop, baseline
and events exactly as published that day). 35 days later, score it against what really was in the shop.
"""
import json, os, sys, datetime as dt, urllib.request, argparse
import numpy as np

BASE = 'https://raw.githubusercontent.com/Fortnite-Datamining/Fortnite-Datamining/history/shop/'
FIRST = '2026-05-02'
CACHE = os.environ.get('ARCHIVE_CACHE', '.cache/archive')
L, H, TOL, SPREAD, RUNS = 14, 21, 0.05, 1.25, 300
SHRINK = json.load(open('data/rules.json'))['uncertainty'].get('seasonShrink', 0.25) if os.path.exists('data/rules.json') else 0.25
TASTES = {
    'Balanced': dict(outfit=10, bundle=10, emote=3, pickaxe=3, glider=3, backpack=3, sidekick=3, kicks=3),
    'Skins only': dict(outfit=10, bundle=10),
    'Hoarder': {k: 10 for k in 'outfit bundle emote pickaxe glider backpack sidekick kicks wrap contrail loadingscreen music car lego instrument other jamtrack'.split()},
}
CONF = {'announced': 1, 'confirmed': 1, 'reported': 0.7, 'pattern': 0.5, 'unverified': 0.2}
D2 = lambda s: dt.date.fromisoformat(s[:10])


def kind(e):
    if e.get('bundle'): return 'bundle'
    it = (e.get('brItems') or [None])[0]
    if it: return {'shoe': 'kicks', 'shoes': 'kicks', 'pet': 'sidekick', 'petcarrier': 'sidekick'}.get(it['type']['value'].lower(), it['type']['value'].lower())
    if e.get('tracks'): return 'jamtrack'
    if e.get('cars'): return 'car'
    return 'other'


def load(last=None):
    """Archive days FIRST..last (default: yesterday) as [(date, [offer, ...])]. Missing days are skipped."""
    os.makedirs(CACHE, exist_ok=True)
    last = last or (dt.date.today() - dt.timedelta(days=1)).isoformat()
    days, d = [], D2(FIRST)
    while d.isoformat() <= last:
        f = f'{CACHE}/{d}.json'
        if not os.path.exists(f):
            err = None
            for attempt in range(3):
                try:
                    raw = json.load(urllib.request.urlopen(BASE + d.isoformat() + '.json', timeout=60))['data']
                    small = [{'k': kind(e), 'p': e.get('finalPrice', 0), 'out': (e.get('outDate') or '')[:10],
                              'key': sorted(i['id'].lower() for i in (e.get('brItems') or [])) or [e.get('offerId')]} for e in raw.get('entries', [])]
                    json.dump(small, open(f, 'w'))
                    break
                except Exception as ex:
                    err = ex
            else:
                print('missing', d, err, file=sys.stderr); d += dt.timedelta(days=1); continue
        days.append((d.isoformat(), json.load(open(f))))
        d += dt.timedelta(days=1)
    return days


class Archive:
    """Archive days for one taste: values per offer, arrivals, leave days, realized window totals."""
    def __init__(self, days, T):
        self.D = [d for d, _ in days]; N = self.N = len(self.D)
        self.pos = {d: i for i, d in enumerate(self.D)}
        # a missing archive day breaks "consecutive": arrivals are only counted against the day before
        self.cont = [i > 0 and (D2(self.D[i]) - D2(self.D[i - 1])).days == 1 for i in range(N)]
        P = self.P = [{tuple(e['key']): e for e in s} for _, s in days]
        self.V = [{k: e['p'] * T.get(e['k'], 0) / 10 for k, e in p.items()} for p in P]
        self.OUT = [{k: self.pos.get(e['out'], N + 30 if e['out'] > self.D[-1] else i) for k, e in P[i].items()} for i in range(N)]
        self.A = [({k: v for k, v in self.V[i].items() if k not in P[i - 1]} if self.cont[i] else None) for i in range(N)]
        self.arr = [sum(a.values()) if a is not None else None for a in self.A]

    def realized(self, s):
        """Loot of activating on archive day s and playing 14 days (None if the archive does not cover it)."""
        if s + L > self.N or (D2(self.D[s + L - 1]) - D2(self.D[s])).days != L - 1: return None
        return sum({k: v for d in range(s, s + L) for k, v in self.V[d].items()}.values())

    def survival(self, t):
        """Share of new loot still in the shop j days after arriving, from days before t."""
        out = []
        for j in range(25):
            num = den = 0
            for d in range(1, t):
                if self.A[d] is None or d + j >= t: continue
                den += sum(self.A[d].values()); num += sum(v for k, v in self.A[d].items() if all(k in self.P[x] for x in range(d, d + j + 1)))
            out.append(num / den if den else 0)
        return out


def season_series(T):
    """Daily new loot for one taste over the whole history (data/baseline.json, event days left out, as in the app)."""
    if not os.path.exists('data/baseline.json'): return {}
    w = lambda k: T.get(k, 0) / 10
    return {d['date']: sum(v * w(k) for k, v in d['byKind'].items()) for d in json.load(open('data/baseline.json')).get('days', []) if not d.get('reserved')}


def season_factor(ser, before, date, shrink=None):
    """App's season factor: the same weeks a year earlier (+-10 days) vs the average day, shrunk toward 1."""
    shrink = SHRINK if shrink is None else shrink
    past = [v for d, v in ser.items() if d < before]
    vs = [ser[x] for k in range(-10, 11) if (x := (D2(date) - dt.timedelta(days=364 - k)).isoformat()) in ser and x < before]
    if len(vs) < 8 or not past: return 1.0
    return min(1.6, max(0.6, 1 + shrink * (np.mean(vs) / np.mean(past) - 1)))


def backtest(days, cfg_events):
    res = {'tastes': {}}
    pairs = []
    launches = [r for e in cfg_events if e['id'] == 'ch8-launch' for r in e.get('calibrateFrom', [])]
    for name, T in TASTES.items():
        a = Archive(days, T); N = a.N
        R = [a.realized(s) for s in range(N)]
        rng = np.random.default_rng(1)
        r = {k: [] for k in ('old', 'new', 'noSeason', 'day1', 'cover', 'stated', 'came', 'origin')}
        ser = season_series(T)
        for t in range(56, N - L - H + 1):
            real = np.array([R[s] if R[s] is not None else np.nan for s in range(t, t + H)])
            if np.isnan(real).any(): continue
            hist = [d for d in range(1, t) if a.arr[d] is not None]
            surv = a.survival(t)
            wd = [np.mean([a.arr[d] for d in hist if D2(a.D[d]).weekday() == w]) for w in range(7)]
            mu = np.mean([a.arr[d] for d in hist]); pool = np.array([a.arr[d] for d in hist])
            # previous model: leave day read one day early, no carry-over, weekday averages
            old = np.array([sum(v for k, v in a.V[t].items() if s < a.OUT[t][k]) + sum(wd[D2(a.D[d]).weekday()] for d in range(max(s, t + 1), s + L)) for s in range(t, t + H)])
            # current model: leave day inclusive, carry-over by survival, one flat average day
            shop = np.array([sum(v for k, v in a.V[t].items() if s <= a.OUT[t][k]) for s in range(t, t + H)])
            M = np.zeros((H, H + L))
            for i, s in enumerate(range(t, t + H)):
                for d in range(max(s, t + 1), s + L): M[i, d - t - 1] += 1
                for d in range(t + 1, s): M[i, d - t - 1] += surv[s - d]
            flat = shop + mu * M.sum(1)
            # season factor per future day (1 everywhere until the history reaches a year back)
            sf = np.array([season_factor(ser, a.D[t], (D2(a.D[t]) + dt.timedelta(days=j + 1)).isoformat()) for j in range(H + L)])
            new = shop + (mu * M) @ sf
            for k, p in (('old', old), ('new', new), ('noSeason', flat)):
                r[k].append((real.max() - real[int(np.argmax(p))]) / real.max())
            r['day1'].append((real.max() - real[0]) / real.max())
            m = np.maximum(mu + SPREAD * (rng.choice(pool, size=(RUNS, H + L)) - mu), 0)
            sims = shop + (m * sf) @ M.T
            p10, p90 = np.percentile(sims, 10, 0), np.percentile(sims, 90, 0)
            r['cover'].append(float(np.mean((real >= p10) & (real <= p90))))
            b = int(np.argmax(new))
            st = float(np.mean(sims[:, b] >= sims.max(1) * (1 - TOL))); came = bool(real[b] >= real.max() * (1 - TOL))
            r['stated'].append(st); r['came'].append(came); r['origin'].append(a.D[t]); pairs.append((st, came))
        last30 = slice(-30, None)
        res['tastes'][name] = {
            'origins': len(r['new']), 'from': r['origin'][0], 'to': r['origin'][-1],
            'regretNew': float(np.mean(r['new'])), 'regretNoSeason': float(np.mean(r['noSeason'])), 'seasonShrink': SHRINK, 'regretOld': float(np.mean(r['old'])), 'regretDay1': float(np.mean(r['day1'])),
            'regretNewLast30': float(np.mean(r['new'][last30])), 'regretDay1Last30': float(np.mean(r['day1'][last30])),
            'cover': float(np.mean(r['cover'])), 'stated': float(np.mean(r['stated'])), 'came': float(np.mean(r['came']))}
        # season-launch weeks: how big were they, and does adding them (sized from the OTHER launches) help?
        L7 = [x for x in launches if x['from'] in a.pos and a.pos[x['from']] + 7 <= N]
        if len(L7) >= 2:
            normal = [d for d in range(1, N) if a.arr[d] is not None and not any(0 <= d - a.pos[x['from']] < 7 for x in L7)]
            mean = np.mean([a.arr[d] for d in normal])
            up = {x['label']: float(sum(a.arr[a.pos[x['from']] + j] - mean for j in range(7) if a.arr[a.pos[x['from']] + j] is not None)) for x in L7}
            reg = {'none': [], 'loo': []}
            surv0 = a.survival(N)
            for x in L7:
                s0 = a.pos[x['from']]; loo = np.mean([v for k, v in up.items() if k != x['label']])
                for t in range(max(21, s0 - 20), s0 + 1):
                    if t + H + L > N: continue
                    real = np.array([R[s] if R[s] is not None else np.nan for s in range(t, t + H)])
                    if np.isnan(real).any(): continue
                    mu = np.mean([a.arr[d] for d in normal if d < t])
                    for k, ex in (('none', 0), ('loo', loo)):
                        mf = lambda d: mu + (ex / 7 if s0 <= d < s0 + 7 else 0)
                        p = [sum(v for kk, v in a.V[t].items() if s <= a.OUT[t][kk]) + sum(mf(d) for d in range(max(s, t + 1), s + L)) + sum(mf(d) * surv0[s - d] for d in range(t + 1, s)) for s in range(t, t + H)]
                        reg[k].append((real.max() - real[int(np.argmax(p))]) / real.max())
            res['tastes'][name]['launches'] = {'normalDay': float(mean), 'uplift': up,
                                               'regretNoEvent': float(np.mean(reg['none'])) if reg['none'] else None,
                                               'regretWithEvent': float(np.mean(reg['loo'])) if reg['loo'] else None, 'origins': len(reg['none'])}
    # calibration of "% sure": stated -> how often it came true, pooled over tastes
    st = np.array([p[0] for p in pairs]); ca = np.array([p[1] for p in pairs], float)
    res['sureScale'] = float(ca.sum() / st.sum()) if st.sum() else 1.0
    res['sureBins'] = [{'stated': [lo, round(lo + .2, 1)], 'n': int(((st >= lo) & (st < lo + .2)).sum()),
                        'came': float(ca[(st >= lo) & (st < lo + .2)].mean()) if ((st >= lo) & (st < lo + .2)).any() else None} for lo in (0, .2, .4, .6, .8)]
    return res


def today_pick(T, shop, base, events, rules):
    """The planner's expected loot for start days 0..20 from today, as published today (play every day)."""
    w = lambda k: T.get(k, 0) / 10
    taste = lambda byKind: sum(v * w(k) for k, v in byKind.items())
    t0 = D2(shop['shopDate'])
    days = [d for d in base.get('days', []) if not d.get('reserved')]
    mu = sum(taste(d['byKind']) for d in days) / max(1, len(days))
    surv = base.get('survival') or rules.get('fallbacks', {}).get('survival') or [1, .87, .84, .64, .4, .25, .25, .08]
    S = lambda j: surv[j] if j < len(surv) else 0
    out = []
    for s in range(H):
        v = sum(e['price'] * w(e['kind']) for e in shop['entries'] if e.get('outDate') and (D2(e['outDate']) - t0).days >= s)
        v += sum(mu * S(max(s, d) - d) for d in range(1, s + L))
        for e in events:
            if not (e.get('extraVbucks', 0) > 0 or e.get('fromHistory')): continue
            a, b = (D2(e['from']) - t0).days, (D2(e['to']) - t0).days
            inside = len([i for i in range(s, s + L) if a <= i <= b])
            val = taste(e['fromHistory']['byKind']) if e.get('fromHistory') else e['extraVbucks'] * w('outfit')
            v += val * CONF.get(e.get('status'), 0.2) * inside / (b - a + 1)
        out.append(v)
    return out


def record(path, days):
    rec = json.load(open(path)) if os.path.exists(path) else {'about': 'Daily picks of the planner (three tastes, play every day), scored 35 days later against the real shop. Written by scripts/backtest.py.', 'records': []}
    shop = json.load(open('data/shop.json')); base = json.load(open('data/baseline.json'))
    events = json.load(open('data/events.json')); rules = json.load(open('data/rules.json'))
    date = shop['shopDate']
    if not any(r['date'] == date for r in rec['records']):
        for name, T in TASTES.items():
            exp = today_pick(T, shop, base, events, rules)
            rec['records'].append({'date': date, 'taste': name, 'pick': int(np.argmax(exp)), 'expected': [round(x) for x in exp]})
    # score records whose 21 start days x 14 days are now in the archive
    arch = {name: Archive(days, T) for name, T in TASTES.items()}
    for r in rec['records']:
        if 'regret' in r: continue
        a = arch[r['taste']]
        if r['date'] not in a.pos: continue
        t = a.pos[r['date']]
        real = [a.realized(s) for s in range(t, t + H)] if t + H + L <= a.N else None
        if not real or any(x is None for x in real): continue
        mx = max(real)
        r['regret'] = round((mx - real[r['pick']]) / mx, 4); r['regretDay1'] = round((mx - real[0]) / mx, 4); r['bestDay'] = int(np.argmax(real))
    scored = [r for r in rec['records'] if 'regret' in r]
    rec['summary'] = {'recordedDays': len({r['date'] for r in rec['records']}), 'scoredDays': len({r['date'] for r in scored}),
                      'firstRecord': min((r['date'] for r in rec['records']), default=None),
                      'regret': float(np.mean([r['regret'] for r in scored])) if scored else None,
                      'regretDay1': float(np.mean([r['regretDay1'] for r in scored])) if scored else None}
    rec['generatedAt'] = dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds')
    json.dump(rec, open(path, 'w'), indent=1)
    return rec['summary']


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--json'); ap.add_argument('--record')
    args = ap.parse_args()
    days = load()
    print(f'{len(days)} archive days, {days[0][0]} to {days[-1][0]}')
    cfg_events = json.load(open('config/events.json')) if os.path.exists('config/events.json') else []
    res = backtest(days, cfg_events)
    for name, r in res['tastes'].items():
        print(f"{name:11s} origins {r['origins']}: regret new {r['regretNew']*100:.1f}%  old {r['regretOld']*100:.1f}%  always-day-1 {r['regretDay1']*100:.1f}%"
              f" (no season factor {r['regretNoSeason']*100:.1f}%) | last 30: {r['regretNewLast30']*100:.1f}% vs day-1 {r['regretDay1Last30']*100:.1f}% | range held {r['cover']*100:.0f}% | sure {r['stated']*100:.0f}% -> {r['came']*100:.0f}%")
        if r.get('launches'):
            l = r['launches']
            print(f"   launch weeks vs average week: {', '.join(f'{k} {v:+,.0f}' for k, v in l['uplift'].items())}"
                  f" | regret near launches: no event {l['regretNoEvent']*100:.1f}%, with event {l['regretWithEvent']*100:.1f}% ({l['origins']} origins)")
    print('"% sure" scale (came true / stated):', round(res['sureScale'], 3), res['sureBins'])
    if args.json:
        res.update(generatedAt=dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds'), archiveFrom=days[0][0], archiveTo=days[-1][0])
        json.dump(res, open(args.json, 'w'), indent=1)
    if args.record:
        print('track record:', record(args.record, days))
