// Games that are announced but not playable yet (Ian's list, 2026-11-20). They fill out the side panel, the
// "Live now" cards and the categories row on the home page, each clearly tagged "Coming soon" and not clickable.
// Art: one Midjourney card per game at web/public/soon/<id>.webp; until a file exists the tile shows the name.
export interface SoonGame {
  id: string;
  name: string;
  /** its category, as the categories row names it (Ian's, 2026-11-20) */
  kind: string;
  /** also shown as a card in the home page's "Live now" row (Ian chose one, to fill the row) */
  inLiveRow?: boolean;
}

export const SOON: SoonGame[] = [
  { id: 'chess', name: 'Chess', kind: 'Strategy' },
  { id: 'possessed', name: 'Possessed', kind: 'Horror' },
  { id: 'ghost-racers', name: 'Ghost Racers', kind: 'Multiplayer', inLiveRow: true },
  { id: 'phantom-rush', name: 'Phantom Rush', kind: 'Defense' },
];

export const soonArt = (id: string) => `/soon/${id}.webp`;
