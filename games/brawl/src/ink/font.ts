// The site's typeface on the ink canvas: Shantell Sans (variable weight 300 to 800), loaded once with
// the FontFace API from the game's own assets. Until it arrives (or if it never does) the canvas
// falls back to the serifs in INK_FONT. Never throws.

const FAMILY = 'Shantell Sans';
const FILE = 'assets/fonts/shantell-sans-latin-wght-normal.woff2';
// The file's address as the bundler resolves it. The site mounts the game with an assetsBase it does
// not serve files from, so a path built from assetsBase 404s there; this form works in the site's
// build, in its dev server and in our harness. assetsBase stays as the fallback.
let BUNDLED = '';
try {
  BUNDLED = new URL('../../assets/fonts/shantell-sans-latin-wght-normal.woff2', import.meta.url).href;
} catch {
  BUNDLED = '';
}

/** CSS font-family for canvas text: `${weight} ${size}px ${INK_FONT}` */
export const INK_FONT = `"${FAMILY}", "Iowan Old Style", Palatino, Georgia, serif`;

let started = false;
let version = 0;

/** Start loading the typeface (once; later calls do nothing). assetsBase with or without a trailing slash. */
export function loadInkFont(assetsBase: string): void {
  if (started) return;
  started = true;
  try {
    const fonts = (globalThis as { document?: Document }).document?.fonts as (FontFaceSet & { add(f: FontFace): void }) | undefined;
    if (!fonts || typeof FontFace === 'undefined') return;
    const base = !assetsBase ? '/' : assetsBase.endsWith('/') ? assetsBase : assetsBase + '/';
    const url = BUNDLED && !BUNDLED.startsWith('file:') ? BUNDLED : `${base}${FILE}`;
    const face = new FontFace(FAMILY, `url("${url}") format("woff2")`, { weight: '300 800', style: 'normal', display: 'swap' });
    fonts.add(face);
    face.load().then(
      () => {
        version++;
      },
      (e: unknown) => console.warn('[ringout ink] font did not load', e),
    );
  } catch (e) {
    console.warn('[ringout ink] font', e);
  }
}

/** counts up each time the typeface finishes loading: redraw any cached text when it changes */
export function inkFontVersion(): number {
  return version;
}
