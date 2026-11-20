"""Makes the announcer clips in web/src/announcer/lines with the ElevenLabs text-to-speech API
(voice "Ghostbet Announcer", id fYfvyG0VksdmawsFVfKO, model eleven_multilingual_v2).
For each announcer line, keep two takes that are one clean utterance of a plausible length.
Very short texts often come back with extra breaths or noises after the words; those takes run long or
have a gap in the middle, so they are rejected and another seed is tried.
Usage: python3 tools/announcer/make_lines.py <env file> <announcer.json> <raw dir> <clips dir> <lines.json> [<lines.json> ...]
lines.json: {"<id>": ["text", ...]}  (only the first text of each id is used, except ids listed in BOTH)."""
import json, re, subprocess, sys, urllib.request, urllib.error, pathlib, tempfile

env_path, voice_path, raw_dir, clips_dir = sys.argv[1], sys.argv[2], pathlib.Path(sys.argv[3]), pathlib.Path(sys.argv[4])
key = None
for line in open(env_path):
    if line.startswith('ELEVENLABS_API_KEY='):
        key = line.split('=', 1)[1].strip().strip('"').strip("'")
assert key
voice_id = json.load(open(voice_path))['voice_id']
lines = {}
for p in sys.argv[5:]:
    lines.update(json.load(open(p)))
raw_dir.mkdir(parents=True, exist_ok=True); clips_dir.mkdir(parents=True, exist_ok=True)

SYL = {'Place your bets!': 3, 'Bets are open!': 4, 'Last call!': 2, 'Bets are closed!': 3, 'We have a winner!': 5,
       'Fight!': 1, 'Knockout!': 2, 'Sudden death!': 3, 'Game Over!': 3, 'Round One!': 2, 'Round Two!': 2,
       'Final Round!': 3, 'Eight remain!': 3, 'Four remain!': 3, 'Fight the Inkelton!': 5, 'The duel is over!': 5}

def tts(text, seed):
    body = json.dumps({'text': text, 'model_id': 'eleven_multilingual_v2', 'seed': seed,
                       'voice_settings': {'stability': 0.45, 'similarity_boost': 0.8, 'style': 0.5, 'use_speaker_boost': True}}).encode()
    url = f'https://api.elevenlabs.io/v1/text-to-speech/{voice_id}?output_format=mp3_44100_128'
    req = urllib.request.Request(url, data=body, method='POST', headers={'xi-api-key': key, 'content-type': 'application/json'})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()

TRIM = ("silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.02,areverse,"
        "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.08,areverse")

def measure(src):
    """trimmed duration, number of internal gaps, peak dB; writes a trimmed wav and returns its path"""
    wav = pathlib.Path(tempfile.mkstemp(suffix='.wav')[1])
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(src), '-af', TRIM, '-ar', '44100', '-ac', '1', str(wav)], check=True)
    out = subprocess.run(['ffmpeg', '-i', str(wav), '-af', 'silencedetect=noise=-38dB:d=0.3,volumedetect', '-f', 'null', '-'],
                         capture_output=True, text=True).stderr
    dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(wav)],
                               capture_output=True, text=True).stdout.strip() or 0)
    gaps = len(re.findall(r'silence_start', out))
    peak = float(re.search(r'max_volume: ([-0-9.]+)', out).group(1))
    return dur, gaps, peak, wav

def ok(text, dur, gaps):
    s = SYL[text]
    return gaps == 0 and (0.2 * s + 0.15) <= dur <= (0.5 * s + 0.6)

report = {}
for lid, texts in lines.items():
    variants = texts if len(set(texts)) > 1 else [texts[0]]
    kept = []
    tried = 0
    # existing raw takes first, then new seeds
    cands = [(raw_dir / f'{lid}-{i + 1}.mp3', texts[i]) for i in range(len(texts)) if (raw_dir / f'{lid}-{i + 1}.mp3').exists()]
    seed = 5000
    while len(kept) < 2 and tried < 14:
        if cands:
            src, text = cands.pop(0)
        else:
            text = variants[len(kept) % len(variants)] if len(variants) > 1 else variants[0]
            seed += 101
            src = raw_dir / f'{lid}-s{seed}.mp3'
            if not src.exists():
                src.write_bytes(tts(text, seed))
        tried += 1
        dur, gaps, peak, wav = measure(src)
        if ok(text, dur, gaps) and not (len(variants) > 1 and any(k[1] == text for k in kept)):
            n = len(kept) + 1
            dst = clips_dir / f'{lid}-{n}.mp3'
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(wav), '-af', f'volume={round(-3.0 - peak, 2)}dB',
                            '-c:a', 'libmp3lame', '-b:a', '96k', str(dst)], check=True)
            kept.append((src.name, text, round(dur, 2)))
        wav.unlink(missing_ok=True)
    report[lid] = kept
    print(f'{lid:24s} kept {len(kept)} of {tried} tried:', ', '.join(f'{t} {d}s' for _, t, d in kept))
(clips_dir.parent / 'picked.json').write_text(json.dumps(report, indent=2))
