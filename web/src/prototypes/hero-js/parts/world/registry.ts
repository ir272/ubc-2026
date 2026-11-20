// The world parts on their own (paper, sky, land, plants, sign, small life). The prototype page falls back
// to these if another part's module fails to load, so the page never goes blank while parts are being edited.
import type { Part } from '../../engine/types';
import { fade } from '../fade';
import { grass } from '../grass';
import { ridge } from '../ridge';
import { sign } from '../sign';
import { sky } from '../sky';
import { front } from './front';
import { life } from './life';
import { paper } from './paper';
import { stories } from './stories';

export const WORLD_PARTS: readonly Part[] = [paper, sky, ridge, grass, stories, sign, front, life, fade];
