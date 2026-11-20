// ┌──────────────────────────────────────────────────────────────────────────────────────────────┐
// │ ARTWORK — the one config file for home-page images.                                           │
// │ Put files in web/public/posters/ and point at them here (any URL works). Posters are 3:4,     │
// │ the hero is 16:9. Without an image the card shows a flat surface with the title, nothing drawn.│
// │ The /dev-art/ paths are low-res reference crops kept only locally (gitignored, see README).    │
// └──────────────────────────────────────────────────────────────────────────────────────────────┘
export interface PosterDef {
  image?: string | null;
}

// One 16:9 still per channel, used for the home page cards, the carousel's side slides and the round
// avatar. Replace a file in web/public/posters/ to change it (stills of our own games, 1280x720).
export const POSTERS: Record<string, PosterDef> = {
  scrivener: { image: '/posters/scrivener.jpg' },
  brawl: { image: '/posters/brawl.jpg' },
  tumbletop: { image: '/posters/tumbletop.jpg' },
  dating: { image: '/posters/dating.jpg' },
  coinflip: { image: '/dev-art/poster-scrivener-1.jpg' },
  'dice-duel': { image: '/dev-art/poster-tumbletop-1.jpg' },
};

export const HERO_IMAGE: string | null = '/dev-art/hero-robots-1.jpg';

/** Dev-only: `?stage=still` shows this real game frame in the stream instead of the renderer. */
export const STILL_STAGE = '/dev-art/stage-scrivener.jpg';

export const posterFor = (channel: string): PosterDef => POSTERS[channel] ?? {};
