// Dry Dock 9: the arena. A fight deck slung between cranes over a shipyard at night.
//
// Parts (src/stage/arena/*):
//   deck.ts      the main deck at the exact ARENA numbers, ledges, girder underside, catwalk plates
//   lights.ts    key, rim, fill, hemisphere, the one shadow light, the environment map
//   backdrop.ts  sky, sea, far harbour and its lights, a pilot boat crossing
//   yard.ts      quay, dry dock with a ship hull, goliath crane, containers, floodlights and beams
//   crowd.ts     scaffold stands and the spectator robots that react to hits and knockouts
//
// Owns scene.background, scene.fog and scene.environment. Every mesh is on LAYER.SET, lights on all.

import * as THREE from 'three';
import type { CreateArena, Frame, StageCtx, StageModule } from './api.ts';
import { LAYER } from './api.ts';
import { disposer } from './arena/util.ts';
import { buildDeck } from './arena/deck.ts';
import { buildLights } from './arena/lights.ts';
import { buildBackdrop, SKY } from './arena/backdrop.ts';
import { buildYard } from './arena/yard.ts';
import { buildCrowd } from './arena/crowd.ts';
import { buildDock } from './arena/dock.ts';

const FOG = '#11283a';

export const createArena: CreateArena = (ctx: StageCtx): StageModule => {
  const { scene, arena, renderer } = ctx;
  const d = disposer();
  const group = new THREE.Group();
  group.name = 'arena';
  scene.add(group);

  scene.background = new THREE.Color(SKY.high);
  const fog = new THREE.Fog(new THREE.Color(FOG).getHex(), 50, 420);
  scene.fog = fog;

  const lights = buildLights(renderer, d);
  scene.environment = lights.envRT.texture;
  const sceneEnv = scene as THREE.Scene & { environmentIntensity?: number };
  sceneEnv.environmentIntensity = 0.55;

  const deck = buildDeck(arena, d);
  const backdrop = buildBackdrop(d);
  const yard = buildYard(d);
  const crowd = buildCrowd(d, { color: fog.color, near: fog.near, far: fog.far });
  const dock = buildDock(d);
  group.add(backdrop.group, yard.group, dock.group, crowd.group, deck.group);

  group.traverse((o) => o.layers.set(LAYER.SET));
  group.add(lights.group);
  lights.group.traverse((o) => o.layers.enableAll());

  let t = 0;
  let lastMode: string | null = null;
  return {
    update(frame: Frame) {
      const dt = Math.min(0.1, Math.max(0, frame.dt));
      t += dt;
      const f = frame.fight;
      if (f && f.events.length) {
        // a replay re-runs the same events: the crowd reacts again, which reads as the crowd
        // watching the replay on the big screens; frozen frames carry no events
        crowd.react(f.events, t);
        for (const e of f.events) {
          if (e.t === 'ko') yard.pulse(1);
          else if (e.t === 'hit' && (e.strength === 'heavy' || e.strength === 'lethal')) yard.pulse(0.55);
        }
      }
      if (f) lastMode = f.mode;
      void lastMode;
      backdrop.update(t);
      yard.update(t, dt);
      crowd.update(dt, t);
    },
    dispose() {
      scene.remove(group);
      d.dispose();
      lights.top.shadow.map?.dispose();
      scene.fog = null;
      scene.background = null;
      if (scene.environment === lights.envRT.texture) scene.environment = null;
    },
  };
};
