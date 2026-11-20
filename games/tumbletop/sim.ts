// The pure simulation, as the contract names it: simulate({ seed, entrants, options: { round } })
// and SIM_HASH (sha256 of the files in sim/, written by `npm run simhash`).
export { simulate, simulateShow } from './sim/index.js';
export { SIM_HASH } from './show/simHash.js';
