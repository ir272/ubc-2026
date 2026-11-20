// Sound files, resolved by the bundler (Vite): the platform and the harness both import the
// game from this folder, so nothing has to be copied into a public directory.
// A build without import.meta.glob falls back to `assetsBase + 'assets/audio/'`.

import manifest from '../../assets/audio/manifest.json';

let files = {};
try {
  files = import.meta.glob('../../assets/audio/*.{ogg,mp3}', { query: '?url', import: 'default', eager: true });
} catch { /* not bundled by Vite */ }

export const audioManifest = manifest;
export function audioUrl(file) {
  return files[`../../assets/audio/${file}`] || null;
}
