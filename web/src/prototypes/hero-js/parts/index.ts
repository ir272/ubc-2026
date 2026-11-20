// The parts of the scene. One file per part; each author edits only their own files.
import { sky } from './sky';
import { hills } from './hills';
import { ridge } from './ridge';
import { grass } from './grass';
import { tv } from './tv';
import { tree } from './tree';
import { couch } from './couch';
import { sign } from './sign';
import { walkers } from './walkers';
import { fade } from './fade';
import type { Part } from '../engine/types';

export const PARTS: readonly Part[] = [sky, hills, ridge, grass, tv, tree, couch, sign, walkers, fade];
