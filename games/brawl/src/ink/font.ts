// The site's typeface on the ink canvas: Shantell Sans (variable weight 300 to 800), loaded once with
// the FontFace API from the game's own assets. Until it arrives (or if it never does) the canvas
// falls back to the serifs in INK_FONT. Never throws.

const FAMILY = 'Shantell Sans';
const FILE = 'assets/fonts/shantell-sans-latin-wght-normal.woff2';

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
    const face = new FontFace(FAMILY, `url("${base}${FILE}") format("woff2")`, { weight: '300 800', style: 'normal', display: 'swap' });
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
