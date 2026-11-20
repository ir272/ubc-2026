// SVG filters used by the texture options (see src/fx.css). They do real ordered dithering: a tiled
// 4x4 Bayer threshold map is added to the picture, then each channel is cut to a few levels.
import { useEffect, useState } from 'react';

// 8x8 px greyscale PNG: the 4x4 Bayer matrix, each cell 2 px so the pattern is visible on dense screens.
const BAYER = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAAAAADhZOFXAAAAMklEQVR42mNgZ29vV1dfvpwBzjh+3N39+fP0dATD3Hz7dnHx6dMRjO/fy8uvXw8PhzMAC4QfwSeQsxAAAAAASUVORK5CYII=';

const rgb = (v: string): [number, number, number] => {
  const m = v.trim().match(/^#([0-9a-f]{6})$/i);
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

export function FxDefs() {
  const [, bump] = useState(0);
  useEffect(() => {
    const on = () => bump((n) => n + 1);
    window.addEventListener('arena-look', on);
    return () => window.removeEventListener('arena-look', on);
  }, []);
  // Two-tone: dark pixels take the page colour, light pixels the text colour (swapped on light palettes).
  const cs = getComputedStyle(document.documentElement);
  let lo = rgb(cs.getPropertyValue('--bg'));
  let hi = rgb(cs.getPropertyValue('--text'));
  if (document.documentElement.dataset.light === '1') [lo, hi] = [hi, lo];
  const row = (i: number) => `${hi[i]! - lo[i]!} 0 0 0 ${lo[i]}`;
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden focusable="false">
      <defs>
        <filter id="fx-dither" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feImage href={BAYER} x="0" y="0" width="8" height="8" preserveAspectRatio="none" result="b" />
          <feTile in="b" result="bt" />
          <feComposite in="SourceGraphic" in2="bt" operator="arithmetic" k1="0" k2="1" k3="0.36" k4="-0.18" result="m" />
          <feComponentTransfer in="m">
            <feFuncR type="discrete" tableValues="0 0.5 1" />
            <feFuncG type="discrete" tableValues="0 0.5 1" />
            <feFuncB type="discrete" tableValues="0 0.5 1" />
          </feComponentTransfer>
        </filter>
        <filter id="fx-dither2" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feColorMatrix in="SourceGraphic" type="matrix" values="0.3 0.59 0.11 0 0  0.3 0.59 0.11 0 0  0.3 0.59 0.11 0 0  0 0 0 1 0" result="g" />
          <feImage href={BAYER} x="0" y="0" width="8" height="8" preserveAspectRatio="none" result="b" />
          <feTile in="b" result="bt" />
          <feComposite in="g" in2="bt" operator="arithmetic" k1="0" k2="1" k3="0.9" k4="-0.45" result="m" />
          <feComponentTransfer in="m" result="t">
            <feFuncR type="discrete" tableValues="0 1" />
            <feFuncG type="discrete" tableValues="0 1" />
            <feFuncB type="discrete" tableValues="0 1" />
          </feComponentTransfer>
          <feColorMatrix in="t" type="matrix" values={`${row(0)}  ${row(1)}  ${row(2)}  0 0 0 1 0`} />
        </filter>
      </defs>
    </svg>
  );
}
