// The three rounds of a Tumbletop show. Each is its own stretch of Attic Dash, so the show travels
// the whole attic: off the game board, up the bookshelf and over the rulers; across the crayon
// bridges and through the block maze; then the maze once more and the dash to the arch.
//
// A round is plain data: where the start line and the finish line are, how many start and how many
// go through, where a faller drops back in at first (cp0), where the field lines up (grid) and
// where finishers stand (slot). Nothing here depends on a seed. `hint` is what the round was
// measured to reward over 1500 simulated fields (who goes through against who does not).
import { L } from './course.js';

const H = L.highY;

export const ROUNDS = [
  {
    index: 0, key: 'round1', name: 'Round One', place: 'Tops, Marbles and Rulers',
    blurb: 'Through the spinning tops, up the bookshelf and over the tipping rulers.',
    hint: 'Grip counts most here.',
    sections: [0, 1, 2, 3], starters: 16, qualify: 8,
    startZ: L.startZ, finish: { z: L.plank2Z1 + 3, y: H, x: 0, width: 20, archHeight: 6 },
    cp0: 'start', timeLimit: 100,
    grid: (i) => {
      const row = Math.floor(i / 8), col = i % 8;
      return { x: -10.5 + col * 3 + (row % 2) * 0.75 - 0.375, z: L.startZ - 1.5 - row * 2.1 };
    },
    // finishers stand in two files at the sides of the landing, so the line stays in clear view
    slot: (i) => ({ x: (i % 2 ? 1 : -1) * (i < 4 ? 8.8 : 7.0), z: L.plank2Z1 + 5 + ((i >> 1) % 2) * 2.2 + (i < 4 ? 0 : 1.1) }),
  },
  {
    index: 1, key: 'round2', name: 'Round Two', place: 'Metronomes and the Block Maze',
    blurb: 'Over the crayon bridges and through the block maze.',
    hint: 'Speed and nerve count most here.',
    sections: [4, 5], starters: 8, qualify: 4,
    startZ: L.plank2Z1 + 6.4, finish: { z: L.mazeZ1 + 0.5, y: H, x: 0, width: 24, archHeight: 6 },
    cp0: 'landing', timeLimit: 110,
    grid: (i) => ({ x: -8.4 + (i % 8) * 2.4, z: L.plank2Z1 + 5 }),
    // finishers wait on the little ramp past the maze, short of the pencil's reach
    slot: (i) => ({ x: -4.5 + (i % 4) * 3, z: L.mazeZ1 + 4.2 }),
  },
  {
    // The final runs the block maze again (the one section two rounds share) and then the dash
    // under the giant pencil to the arch.
    index: 2, key: 'final', name: 'The Final', place: 'The Block Maze',
    blurb: 'Through the block maze and under the giant pencil.',
    hint: 'Speed helps. The blocks decide.',
    sections: [5, 6], starters: 4, qualify: 1,
    // the four start in pairs on the ends of the two crayon bridges and run out into the maze
    startZ: L.bridgeZ1, finish: { z: L.finishZ, y: L.finalY, x: 0, width: 24, archHeight: 6 },
    cp0: 'maze-start', timeLimit: 90,
    grid: (i) => ({ x: [-5.2, -3.8, 3.8, 5.2][i % 4], z: L.bridgeZ1 - 1.1 }),
    slot: (i) => ({ x: (i % 4) * 2.6, z: L.finishZ + 4 }),
  },
];

export const ROUND_COUNT = ROUNDS.length;
