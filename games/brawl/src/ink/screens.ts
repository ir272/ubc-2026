// The between-fight screens on the ink stage: the call, the character select and the stage select,
// the versus screen, the predictions and break dressing, and the verdict. Each is drawn in
// ./screens/*.ts in the fight HUD's hand (ruled plates crossing at the corners, tick rings, pen
// numerals, the gold rule with a lozenge). Every picture is a function of show.phaseMs (and the
// show clock), never of state built up frame by frame, so a viewer who joins late sees the same.
//
// On screen only what the owner allows: fighter names, bot names and model labels, a phase title of
// one or two words, a countdown clock, the stage's name on the stage select, and the winner.

import type { InkFrame, InkModule } from './api.ts';
import { loadInkFont } from './font.ts';
import { createEnv, disposeEnv } from './screens/env.ts';
import { drawCall } from './screens/call.ts';
import { drawSelect } from './screens/select.ts';
import { drawVersus } from './screens/versus.ts';
import { drawBreak, drawPredictions } from './screens/dressing.ts';
import { drawVerdict, verdictDim } from './screens/verdict.ts';

export function createScreens(): InkModule {
  const env = createEnv();
  return {
    prepare(f: InkFrame) {
      loadInkFont(f.assetsBase);
      const ph = f.show.phase;
      if (ph === 'call' || ph === 'select' || ph === 'versus') f.post.cover = true;
      if (ph === 'verdict' && f.show.result) f.post.dim = Math.max(f.post.dim, verdictDim(f));
    },
    draw(f: InkFrame) {
      const g = f.g;
      g.save();
      g.textBaseline = 'alphabetic';
      switch (f.show.phase) {
        case 'call':
          drawCall(f);
          break;
        case 'select':
          drawSelect(f, env);
          break;
        case 'versus':
          drawVersus(f, env);
          break;
        case 'predictions':
          drawPredictions(f);
          break;
        case 'break':
          drawBreak(f);
          break;
        case 'verdict':
          drawVerdict(f);
          break;
        default:
          break;
      }
      g.restore();
    },
    dispose() {
      disposeEnv(env);
    },
  };
}
