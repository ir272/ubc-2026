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
import { paper } from './world/paper';
import { front } from './world/front';
import { life } from './world/life';
import { stories } from './world/stories';
import type { Part } from '../engine/types';

export const PARTS: readonly Part[] = [paper, sky, hills, ridge, grass, stories, tv, tree, couch, sign, walkers, front, life, fade];
