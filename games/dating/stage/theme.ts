// The single source of colour, type and on-stage text sizing (stage/LOOK.md). No other stage file
// writes a hex literal or a font name.

/**
 * Which staging mount() draws. THE one switch: 'studio' is the TV studio (podiums, captions, cards),
 * 'hangout' is the room (stage/hangout: avatars hanging out, chat bubbles, nameplates, nothing
 * printed). The dev harness overrides it with ?staging=hangout or ?staging=studio.
 */
export type Staging = 'studio' | 'hangout';
export const STAGING: Staging = 'studio';

export const PALETTE = {
  night: '#0f1830', // back wall, deep shadow
  dusk: '#1c2a52', // floor, mid shadow
  teal: '#14504f', // set dressing, the star's side
  tungsten: '#ffb347', // key light pools, lamps, the clock face
  coral: '#ff5d4a', // the show colour: sign, the star's chair, the dealbreaker card
  mint: '#7be0c3', // turn-on cards, charmed mark
  milk: '#fff4e0', // text only (and the highlight ring)
  ink: '#0a0f1f', // outlines, subtitle panel
} as const;

/** Derived set colours. Still only from the palette above, mixed. */
export const SET = {
  background: PALETTE.ink,
  floor: PALETTE.dusk,
  floorStage: '#22335f', // the lit stage area, a step lighter than the floor
  wall: PALETTE.night,
  wallTrim: PALETTE.teal,
  sky: '#16224a',
  cityFar: '#1a3a5a',
  cityNear: '#10283f',
  cityWindow: PALETTE.tungsten,
  riser: PALETTE.teal,
  riserTop: '#1b6664',
  chair: PALETTE.coral,
  column: '#141d38',
  lampOff: '#1a2140',
  foreground: '#0d1428',
  booth: '#123f3e',
  boothSlat: '#0f3433',
  boothFloor: '#182446',
  houseOn: PALETTE.tungsten,
  houseOff: '#2a2a3a',
  clockRim: PALETTE.ink,
  clockFace: PALETTE.tungsten,
  clockWedge: PALETTE.coral,
  cardBack: PALETTE.coral,
  cardOn: PALETTE.mint,
  cardOff: PALETTE.coral,
} as const;

/** Light levels. House = ambient level; key = the one directional light. */
export const LIGHT = {
  houseUp: 1.15, // a window is open
  houseDown: 0.62, // locked / no window
  houseHold: 0.42, // the held pause before the pick
  key: 2.1,
  keyColor: '#ffe2bf',
  ambientColor: '#9fb0e0',
  booth: 6,
  poolOpacity: 0.22,
  beamOpacity: 0.07,
  pickPool: 0.42,
  pickBeam: 0.13,
} as const;

export const MARK_COLORS = {
  charmed: PALETTE.coral, // a heart reads as coral; mint is the card colour
  heartLine: PALETTE.ink,
  unsure: '#8fd3ff', // sweat drop: the one light blue in the show, used only here
  cringing: '#7a86b8', // gloom lines
} as const;

export const FONTS = {
  display: '"Dela Gothic One", "Zen Maru Gothic", system-ui, sans-serif',
  body: '"Zen Maru Gothic", system-ui, sans-serif',
} as const;

/** CSS pixel sizes at a 1280 wide stage. Everything scales with the stage width (x0.75 at 960). */
export const TYPE = {
  subtitle: 38, // cap height about 27 px at 720 (3.7% of frame); steps down for a long line
  subtitleMin: 30,
  subtitleLine: 1.28,
  nameTab: 26,
  tag: 26,
  round: 24,
  card: 18, // a face-up label in the hand
  bigLabel: 52,
  twistBack: 100,
  twistLabel: 76,
  twistRule: 30,
  titleCall: 120, // the round name on its plain field: the largest it may be before it is fitted
  result: 92,
  resultBy: 46,
} as const;

/** Panel colours for the broadcast graphics (captions.ts). */
export const CAPTION = {
  panel: PALETTE.ink, // subtitle bar
} as const;

/** The title call: one plain field for every scene. */
export const TITLE_CALL = { field: PALETTE.night } as const;

/** Stage reference width for the type scale. */
export const BASE_WIDTH = 1280;

/** Pick a readable text colour (ink or milk) for a given accent background. */
export function textOn(bg: string): string {
  const c = bg.replace('#', '');
  const n = parseInt(c.length === 3 ? c.split('').map((x) => x + x).join('') : c, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum > 0.5 ? PALETTE.ink : PALETTE.milk;
}

/** Mix two hex colours, t in 0..1. */
export function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => [(pa >> s) & 255, (pb >> s) & 255];
  const out = [16, 8, 0].map((s) => {
    const [x, y] = ch(s);
    return Math.round(x! + (y! - x!) * t);
  });
  return '#' + out.map((v) => v.toString(16).padStart(2, '0')).join('');
}

/** Fallback accent if a cast member arrives without one. */
export const FALLBACK_ACCENTS = ['#ff8a3d', '#5ec8ff', '#c7e85a', '#ff7fb0', '#ffd23f'];

/** The hangout room (stage/hangout): a small clean room at night, all from the palette. */
export const HANGOUT = {
  background: PALETTE.ink,
  floor: mix(PALETTE.dusk, PALETTE.night, 0.25),
  floorSeam: mix(PALETTE.night, PALETTE.ink, 0.35),
  wall: mix(PALETTE.teal, PALETTE.night, 0.62),
  wallLow: mix(PALETTE.teal, PALETTE.ink, 0.7),
  wallSide: mix(PALETTE.teal, PALETTE.night, 0.75),
  ceiling: mix(PALETTE.night, PALETTE.ink, 0.5),
  trim: mix(PALETTE.ink, PALETTE.night, 0.3),
  rug: mix(PALETTE.coral, PALETTE.night, 0.74),
  rugEdge: mix(PALETTE.coral, PALETTE.night, 0.6),
  couch: mix(PALETTE.coral, PALETTE.dusk, 0.18),
  couchShade: mix(PALETTE.coral, PALETTE.ink, 0.35),
  couchLeg: PALETTE.ink,
  doorFrame: mix(PALETTE.ink, PALETTE.night, 0.2),
  door: mix(PALETTE.teal, PALETTE.ink, 0.5),
  hall: mix(PALETTE.ink, PALETTE.night, 0.15),
  sky: mix(PALETTE.ink, PALETTE.night, 0.7),
  cityFar: mix(PALETTE.night, PALETTE.dusk, 0.55),
  cityNear: mix(PALETTE.night, PALETTE.teal, 0.42),
  cityWin: mix(PALETTE.tungsten, PALETTE.dusk, 0.3),
  glass: mix(PALETTE.night, PALETTE.milk, 0.1),
  /** the warm room light (ambient tint up, ambient tint down) */
  warm: '#ffd9a8',
  cool: '#a9b6dc',
  key: '#ffe0b8',
  /** the dim veil behind someone talking to the lens */
  veil: PALETTE.ink,
} as const;

/** The hangout's chat bubbles and nameplates (stage/hangout/bubbles.ts), CSS px at a 1280 stage. */
export const BUBBLE = {
  text: 22, // about 22 px at 720p, so it reads at 960x540
  lineHeight: 1.28,
  maxChars: 36, // about 36 characters a line, three lines at most
  pad: 12,
  radius: 14,
  plate: 15,
  margin: 16,
  bg: PALETTE.ink,
  fg: PALETTE.milk,
  memoryBg: mix(PALETTE.milk, PALETTE.dusk, 0.18),
  memoryFg: PALETTE.ink,
  privateBg: mix(PALETTE.ink, PALETTE.night, 0.55),
  privateEdge: mix(PALETTE.milk, PALETTE.night, 0.45),
  plateBg: PALETTE.ink,
  plateFg: mix(PALETTE.milk, PALETTE.night, 0.25),
} as const;
