"""Step 2 of the announcer. Save a designed ElevenLabs preview as a permanent voice in the account.
Usage: python3 tools/announcer/save_voice.py <env file> <index json> <voice key> <take number> <voice name>
Writes the saved voice id next to the index as announcer.json. The key is never printed."""
import json, sys, urllib.request, urllib.error, pathlib

env_path, index_path, key_name, take, name = sys.argv[1], pathlib.Path(sys.argv[2]), sys.argv[3], int(sys.argv[4]), sys.argv[5]
key = None
for line in open(env_path):
    if line.startswith('ELEVENLABS_API_KEY='):
        key = line.split('=', 1)[1].strip().strip('"').strip("'")
assert key
idx = json.loads(index_path.read_text())
v = idx['voices'][key_name]
gid = v['previews'][take - 1]['generated_voice_id']
body = json.dumps({'voice_name': name, 'voice_description': v['description'], 'generated_voice_id': gid}).encode()
req = urllib.request.Request('https://api.elevenlabs.io/v1/text-to-voice', data=body, method='POST',
                             headers={'xi-api-key': key, 'content-type': 'application/json'})
try:
    with urllib.request.urlopen(req, timeout=120) as r:
        res = json.load(r)
except urllib.error.HTTPError as e:
    print('HTTP', e.code, e.read().decode()[:400]); raise
out = index_path.parent / 'announcer.json'
out.write_text(json.dumps({'voice_id': res.get('voice_id'), 'name': name, 'from': f'{key_name} take {take}',
                           'description': v['description']}, indent=2))
print('saved voice', res.get('voice_id'), 'as', name)
