// Recorded sounds. Every file in web/src/audio/ is found at build time (Vite's glob), fetched and
// decoded once the audio context exists, and handed to the mixer by its file name without the
// extension ("music", "hit-1", "pip", ...). A name with no file simply is not in the bank, and the
// mixer plays its synthesised stand-in for that sound. ASSETS.md lists where each file came from.
const FILES = import.meta.glob('../audio/*.{ogg,wav,mp3,m4a}', { eager: true, query: '?url', import: 'default' });

export const SAMPLE_URLS = Object.fromEntries(Object.entries(FILES).map(([path, url]) => [path.split('/').pop().replace(/\.[a-z0-9]+$/i, ''), url]));

/** Fetch and decode every recorded sound. Returns { name: AudioBuffer }; a file that fails is left out. */
export async function loadBank(ctx) {
  const bank = {};
  await Promise.all(Object.entries(SAMPLE_URLS).map(async ([name, url]) => {
    try {
      const res = await fetch(url);
      if (!res.ok) return;
      bank[name] = await ctx.decodeAudioData(await res.arrayBuffer());
    } catch { /* left out: the synthesised stand-in plays */ }
  }));
  return bank;
}
