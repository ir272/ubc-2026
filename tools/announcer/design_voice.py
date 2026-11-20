"""Step 1 of the announcer. Designs candidate announcer voices with the ElevenLabs voice design API
(text-to-voice/design) and saves the previews. Ian picked 8-fighting-game, take 1.
Originally: design four candidate announcer voices with ElevenLabs and save one sample of each.
Usage: python3 tools/announcer/design_voice.py <env file with ELEVENLABS_API_KEY> <output dir>
The key is read from the file and never printed."""
import base64, json, sys, urllib.request, urllib.error, pathlib

env_path, out_dir = sys.argv[1], pathlib.Path(sys.argv[2])
key = None
for line in open(env_path):
    if line.startswith('ELEVENLABS_API_KEY='):
        key = line.split('=', 1)[1].strip().strip('"').strip("'")
assert key, 'no ELEVENLABS_API_KEY in env file'
out_dir.mkdir(parents=True, exist_ok=True)

TEXT = ("Bets are open! Last call, last call. Bets are closed. "
        "And we have a winner! Welcome to Ghostbet, where the games never stop.")

VOICES = {
    '8-fighting-game': "A fighting video game announcer. Male, mid thirties, full confident voice. Deep, punchy and "
                       "electrifying, hitting each short line hard with dramatic weight, like the announcer of an arcade "
                       "fighting game tournament. Modern, clean, neutral accent with no regional drawl or twang, not old. "
                       "Studio quality, no background noise.",
    '9-game-show-host': "A modern television game show host. Male, mid thirties, full rounded voice. Bright, upbeat and "
                        "polished with a big smile in the voice and showman energy, building excitement. Modern, clean, "
                        "neutral accent with no regional drawl or twang, not old. Studio quality, no background noise.",
}

def design(desc):
    body = json.dumps({'voice_description': desc, 'text': TEXT}).encode()
    req = urllib.request.Request('https://api.elevenlabs.io/v1/text-to-voice/design', data=body, method='POST',
                                 headers={'xi-api-key': key, 'content-type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        print('HTTP', e.code, e.read().decode()[:400])
        raise

index = {}
for name, desc in VOICES.items():
    res = design(desc)
    previews = res.get('previews', [])
    print(name, 'previews:', len(previews))
    index[name] = {'description': desc, 'previews': []}
    for i, p in enumerate(previews):
        ext = 'mp3'
        f = out_dir / f'{name}-take{i + 1}.{ext}'
        f.write_bytes(base64.b64decode(p['audio_base_64']))
        index[name]['previews'].append({'file': f.name, 'generated_voice_id': p.get('generated_voice_id'),
                                        'seconds': p.get('duration_secs')})
(out_dir / 'index-round3.json').write_text(json.dumps({'text': TEXT, 'voices': index}, indent=2))
print('saved to', out_dir)
