#!/usr/bin/env python3
# Keeps games/brawl/captures small. Run by the lead every few minutes.
# Keeps: anything progress.json shows, captures/lead, text and scripts, and the latest round of
# each piece (its stills for an hour, its sheets for good). Deletes media in tmp folders after 8 min and in older rounds after 10 min.
import json, os, re, sys, time, shutil
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CAP = os.path.join(ROOT, 'captures')
MEDIA = ('.png', '.jpg', '.jpeg', '.mp4', '.wav', '.webm', '.gif')
now = time.time()
keep = set()
try:
    d = json.load(open(os.path.join(ROOT, 'progress.json')))
    for p in d.get('pieces', []):
        for r in p.get('rounds', []):
            for k in ('ours', 'ref'):
                v = r.get(k)
                if v:
                    keep.add(os.path.normpath(v if os.path.isabs(v) else os.path.join(ROOT, v)))
except Exception as e:
    print('progress.json unreadable, doing nothing:', e); sys.exit(0)
freed = 0
for piece in sorted(os.listdir(CAP)):
    pdir = os.path.join(CAP, piece)
    if not os.path.isdir(pdir) or piece in ('lead', 'clean'):
        continue
    if piece.startswith('skel-') or piece.startswith('core-'):
        if now - os.path.getmtime(pdir) > 1500:
            for dp, _, fs in os.walk(pdir):
                freed += sum(os.path.getsize(os.path.join(dp, f)) for f in fs)
            shutil.rmtree(pdir, ignore_errors=True)
        continue
    rounds = [int(m.group(1)) for n in os.listdir(pdir) for m in [re.fullmatch(r'r(\d+)', n)] if m]
    latest = 'r%d' % max(rounds) if rounds else None
    for dp, _, fs in os.walk(pdir):
        rel = os.path.relpath(dp, pdir).split(os.sep)
        in_latest = latest is not None and rel[0] == latest
        for f in fs:
            if not f.lower().endswith(MEDIA):
                continue
            fp = os.path.join(dp, f)
            if os.path.normpath(fp) in keep:
                continue
            try:
                age = now - os.path.getmtime(fp)
                if in_latest:
                    is_sheet = not re.fullmatch(r'f-\d+\.png', f)
                    if is_sheet or age < 1200:
                        continue
                elif age < (180 if 'tmp' in rel else 300):
                    continue
                freed += os.path.getsize(fp); os.remove(fp)
            except OSError:
                pass
print('janitor freed %.0f MB' % (freed / 1e6))
