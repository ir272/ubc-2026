#!/usr/bin/env python3
# Summarises .cache/real/trial-*.log: stance mix over all plans, seconds per plan change, cost.
import glob, json, os, re
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
stances = {}; changes = 0; fight_s = 0.0; matches = 0; wins = {}
for f in sorted(glob.glob(os.path.join(root, '.cache/real/trial-*.log'))):
    t = open(f).read()
    m = re.search(r'plans by stance (\{.*?\}), plan changes (\d+)', t)
    r = re.search(r'\((\d+(?:\.\d+)?) s of fight\)', t)
    w = re.search(r'^\s+(\w+) wins as (\w+)', t, re.M)
    if not (m and r): continue
    matches += 1
    for k, v in json.loads(m.group(1)).items(): stances[k] = stances.get(k, 0) + v
    changes += int(m.group(2)); fight_s += float(r.group(1))
    if w: wins[w.group(1)] = wins.get(w.group(1), 0) + 1
tot = sum(stances.values()) or 1
print('matches finished:', matches)
print('stance share of all plans:', {k: '%d%%' % round(100 * v / tot) for k, v in sorted(stances.items())}, '(bar: none over 50%)')
print('plan changes: %d over %.0f s of fight, one every %.1f s per match (two minds)' % (changes, fight_s, fight_s / max(1, changes)), '(bar: at least every 10 s)')
print('wins by bot:', wins)
try:
    c = json.load(open(os.path.join(root, '.cache/cost.json')))
    calls = [x for x in c.get('calls', []) if isinstance(x, dict)]
    ok = [x for x in calls if x.get('ok')]
    print('calls: %d, answered and parsed: %d, cost $%.4f' % (len(calls), len(ok), c.get('totalUsd', 0)))
    by = {}
    for x in ok:
        b = by.setdefault(x['model'], [0, 0.0, 0]); b[0] += 1; b[1] += x.get('costUsd', 0); b[2] += x.get('ms', 0)
    for k, v in sorted(by.items()): print('  %s: %d calls, $%.4f, mean %d ms' % (k, v[0], v[1], v[2] / max(1, v[0])))
except Exception as e:
    print('cost log unreadable:', e)
