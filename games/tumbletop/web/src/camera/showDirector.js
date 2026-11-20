// The race director for the three-round show. One rule above all: the broadcast follows the cut
// line. Home base is the fight for the last qualifying place (the Gumble holding it, the one just
// outside, and their neighbours when they are close). It leaves home only briefly:
//   - the start: the whole field off the line
//   - the finish line, when the Gumble holding the last place or the one chasing it gets there
//     (the fight at the line ends ON the line)
// In the final the "line" is the lead: the front two, and the others when they are close.
//
// The director returns a shot for cameras.update():
//   { mode: 'cutline', members: [slot ids], botId (anchor), key }      the home shot
//   { mode: 'leader' | 'follow' | 'overview' | 'finishline', botId, key, scope? }
// and the Gumbles to name-tag (tags()). Deterministic: no randomness, driven by sim state only.

const HOME_MIN = 4.0;        // seconds at home before a cutaway is allowed
const HOLD_MIN = 3.2, HOLD_MAX = 8; // seconds the home shot stays with the same Gumbles
const LEADER_HOLD = 2.4;
// One decisive subject per round. Both cutaways exist and are off: with them on, fresh critics
// kept reporting that the camera was somewhere else when the last place changed hands. The
// viewer's pick has its own camera mode ('My pick') and the leader has 'Leader'.
const LEADER_LOOK = false;   // a look at the leader, once, early
const FINISH_CAM = false;    // the reverse-angle finish camera (the zone shot now runs to the line itself)
const FINAL_SIDE_DEFAULT = true; // the final in the maze: side-on with all four (false = the same zone shot as the other rounds)
const PICK_CUTAWAY = false;  // three seconds on the viewer's pick when it is hit or falls
const START_HOLD = 2.6;
const LINE_CAM = true;       // one cut to the camera past the line as the last place arrives
const LINE_NEAR = 13;        // metres short of the line at which that cut is made
const FINISH_NEAR = 11;      // metres short of the line at which an arriving Gumble brings the finish camera
const FINISH_LINGER = 1.1;   // seconds the finish camera stays after the last crossing with nobody else near

export const USER_CAMERAS = ['Director', 'Leader', 'Cut line', 'My pick', 'Overview'];

export function createShowDirector() {
  let N = 16, Q = 8, final = false, finishZ = 0, sideZ0 = 1e9, sideZ1 = -1e9, finalSide = FINAL_SIDE_DEFAULT;
  let cutN = 0;
  let lineCam = false, lineX = 0, lineZ = 0, lineCamX = 0, finalAll = false;
  const shot = { mode: 'overview', botId: 0, members: [], scope: 'field', key: 'show:0', story: 'start' };
  let story = '', storyT = 0, sinceLeader = 0, homeT = 0, lastCutChangeT = 99, anchorZ = 0, lastHolder = -1;
  let lastThrough = 0, sinceThrough = 99, arriving = 0;
  const arrivals = [];
  let holdT = 0, leaderDone = false, firstShown = false, wasSide = false;
  let runaway = false, chaseT = 0, leadGap = 0, wasChase = false;
  let pickAsk = 0, sincePick = 99; // the viewer's pick was just hit or fell: go and look
  const members = [];
  const zs = [], xs = [];
  const tagList = [];

  const racing = (b) => b && b.status === 'racing';
  const live = (b) => b && (b.status === 'racing' || b.status === 'respawning');

  function reset(o) {
    N = o.botCount; Q = o.qualifyCount; final = Q === 1; finishZ = o.finishZ;
    finalSide = o.finalSide ?? FINAL_SIDE_DEFAULT; finalAll = o.finalSide === 'all';
    story = ''; storyT = 0; sinceLeader = 4; homeT = 0; lastCutChangeT = 99; lastHolder = -1; anchorZ = 0;
    lastThrough = 0; sinceThrough = 99; arriving = 0; pickAsk = 0; sincePick = 99;
    lineCam = false; lineX = 0; lineZ = 0; lineCamX = 0;
    holdT = 0; leaderDone = false; firstShown = false; members.length = 0; runaway = false; chaseT = 0; leadGap = 0; wasChase = false; sideZ0 = o.sideFrom ?? 1e9; sideZ1 = o.sideTo ?? -1e9;
    shot.key = '';
  }

  function setStory(s, key) {
    if (story === s && (key == null || shot.key === key)) return;
    story = s; storyT = 0;
    shot.key = key ?? `show:${++cutN}:${s}`;
    shot.story = s;
  }

  function topRacing(state) {
    for (let i = 0; i < state.order.length; i++) { const b = state.bots[state.order[i]]; if (racing(b)) return b; }
    for (let i = 0; i < state.order.length; i++) { const b = state.bots[state.order[i]]; if (live(b)) return b; }
    return state.bots[state.order[0]];
  }

  /**
   * The Gumbles the home shot is about. Small on purpose: the Gumble holding the last place, the
   * one just outside it if it is close enough to share a frame, and a neighbour only when it is
   * right there. Few subjects means each one is big on screen. In the final: the leader, and
   * second place when it is within reach.
   */
  function lineGroup(state, view, dt) {
    const order = state.order, bots = state.bots;
    const at = (place) => bots[order[place - 1]];
    const ok = (p) => p && racing(p) && !view.botHidden[p.id];
    // Stay with the same Gumbles for a few seconds so a viewer can follow them, as long as they
    // are all still racing near the line. Places swap back and forth far faster than a shot should.
    holdT += dt;
    if (members.length && holdT < HOLD_MAX) {
      let keep = true;
      for (let i = 0; i < members.length; i++) {
        const p = bots[members[i]];
        if (!ok(p) || (final ? p.place > 3 : p.place < Q - 1 || p.place > Q + 2)) { keep = false; break; }
      }
      // (in the final the shot must still hold the leader)
      if (keep && final && !members.includes(order[0])) keep = false;
      if (keep && holdT < HOLD_MIN) return bots[members[0]];
      if (keep) {
        // past the minimum: move on only if the Gumbles on the line are different ones now
        const a = at(final ? 1 : Q), b = at(final ? 2 : Q + 1);
        if ((!ok(a) || members.includes(a.id)) && (!ok(b) || members.includes(b.id) || members.length === 1)) return bots[members[0]];
      }
    }
    members.length = 0; holdT = 0;
    const want = final ? [1, 2] : [Q, Q + 1, Q - 1, Q + 2];
    const pairMax = final ? 9 : 14, nearMax = 6;
    let anchor = null;
    for (const pl of want) { const p = at(pl); if (ok(p)) { anchor = p; break; } }
    if (!anchor) anchor = topRacing(state);
    members.push(anchor.id);
    let cx = anchor.pos.x, cz = anchor.pos.z;
    for (let k = 0; k < want.length; k++) {
      const p = at(want[k]);
      if (!ok(p) || p === anchor) continue;
      if (Math.abs(p.pos.y - anchor.pos.y) > 6) continue;
      const d = Math.hypot(p.pos.z - cz, (p.pos.x - cx) * 0.6);
      if (d > (k < 2 ? pairMax : nearMax)) continue;
      members.push(p.id);
      if (k < 2) { cx = (cx + p.pos.x) / 2; cz = (cz + p.pos.z) / 2; }
    }
    return anchor;
  }

  /** A runaway final: the leader alone, or everyone chasing it. */
  function leaderOnly(state) {
    members.length = 0;
    const b = topRacing(state);
    members.push(b.id);
    return b;
  }
  function chasers(state, view) {
    members.length = 0;
    for (let i = 1; i < state.order.length; i++) {
      const b = state.bots[state.order[i]];
      if (racing(b) && !view.botHidden[b.id]) members.push(b.id);
    }
    if (!members.length) members.push(topRacing(state).id);
    return state.bots[members[0]];
  }

  /** The final in the maze: everyone still racing, for the side-on tracking shot. */
  function allRacing(state, view) {
    members.length = 0;
    for (let i = 0; i < state.order.length; i++) {
      const b = state.bots[state.order[i]];
      if (racing(b) && !view.botHidden[b.id]) members.push(b.id);
    }
    if (!members.length) members.push(topRacing(state).id);
    return state.bots[members[0]];
  }

  /**
   * Once per frame while racing. `userMode` is one of USER_CAMERAS; pickId is the viewer's pick
   * (slot id) or -1. Returns the shot.
   */
  function update(dt, view, state, userMode = 'Director', pickId = -1) {
    storyT += dt; sinceLeader += dt; lastCutChangeT += dt; sincePick += dt; pickAsk = Math.max(0, pickAsk - dt);
    const holder = state.cutHolderId ?? -1;
    if (holder !== lastHolder) { lastHolder = holder; lastCutChangeT = 0; }
    const rt = state.raceTime ?? 0;
    const through = state.qualifiedCount ?? 0;
    const left = Q - through;
    const lead = topRacing(state);
    sinceThrough += dt;
    if (through !== lastThrough) { lastThrough = through; sinceThrough = 0; }
    // who is about to cross the line (nearest first)
    arrivals.length = 0;
    for (let i = 0; i < state.order.length; i++) {
      const b = state.bots[state.order[i]];
      if (!racing(b) || view.botHidden[b.id]) continue;
      const d = finishZ - b.pos.z;
      if (d > -0.5 && d < (final ? FINISH_NEAR + 6 : FINISH_NEAR + 3)) arrivals.push(b.id);
    }
    // The finish-line camera is for the last place being taken. The leaders walk in unwatched: the
    // camera stays with the fight for the last place, wherever on the course that is.
    const holderB = state.bots[state.order[Q - 1]], chaserB = state.bots[state.order[Q]];
    let lineArrives = false;
    for (let i = 0; i < arrivals.length; i++) if ((holderB && arrivals[i] === holderB.id) || (chaserB && arrivals[i] === chaserB.id)) lineArrives = true;
    const lastPlaces = final || lineArrives;
    if (!lastPlaces || !FINISH_CAM) arrivals.length = 0; // (the tower counts the earlier finishers in; the camera stays with the fight)
    arriving = arrivals.length;
    {
    }

    if (userMode === 'My pick' && pickId >= 0 && live(state.bots[pickId])) {
      setStory('pick', `show:pick:${pickId}`);
      shot.mode = 'follow'; shot.botId = pickId; shot.scope = '';
      return shot;
    }
    if (userMode === 'Leader') {
      setStory('leaderUser', `show:leader:${lead.id}`);
      shot.mode = 'leader'; shot.botId = lead.id; shot.scope = '';
      return shot;
    }
    if (userMode === 'Overview') {
      setStory('overviewUser', 'show:overview');
      shot.mode = 'overview'; shot.botId = lead.id; shot.scope = 'field';
      return shot;
    }

    // The final in the maze: side-on, all four. When the leader has got away (more than 12 m clear)
    // the shot alternates every few seconds between the leader and the chase behind.
    const second = final ? state.bots[state.order[1]] : null;
    const clear = final && second && racing(second) ? lead.pos.z - second.pos.z : 0;
    runaway = final && clear > (runaway ? 9 : 12);
    if (!runaway) chaseT = 0; else chaseT += dt;
    const onChase = runaway && Math.floor(chaseT / 3.2) % 2 === 1 && !arriving;
    let side = finalSide && final && lead.pos.z > sideZ0; // side-on from the maze to the line: the race runs one way across the picture throughout
    const holderNow = state.bots[state.order[Math.min(state.order.length, Q) - 1]];
    if (onChase) side = finalSide && second.pos.z > sideZ0;
    leadGap = runaway ? clear : 0;
    const anchor = onChase ? chasers(state, view) : side && !runaway ? allRacing(state, view) : runaway ? leaderOnly(state) : lineGroup(state, view, dt);
    // rounds one and two: the fight for the last place is shot side-on too while it is in the block maze
    void holderNow;
    // The zone shot's target: the point on the course where the fight is. In rounds one and two,
    // midway between the Gumble holding the last place and the one chasing it (the holder alone
    // when the chaser is far back or down); in the final, the leader, with second place if close.
    {
      // (the middle two of the Gumbles racing in places Q-1 to Q+2: one of them falling or being
      // overtaken moves this point a little, not the whole shot)
      let zr = anchor.pos.z, xr = anchor.pos.x;
      if (final) {
        const a = state.bots[state.order[0]], b = state.bots[state.order[1]];
        if (racing(a)) { zr = a.pos.z - 2; xr = a.pos.x; if (racing(b) && a.pos.z - b.pos.z < 10) { zr = (a.pos.z + b.pos.z) / 2; xr = (a.pos.x + b.pos.x) / 2; } }
      } else {
        zs.length = 0; xs.length = 0;
        for (const pl of [Q - 1, Q, Q + 1, Q + 2]) {
          const p = state.bots[state.order[pl - 1]];
          if (p && racing(p) && !view.botHidden[p.id]) { zs.push(p.pos.z); xs.push(p.pos.x); }
        }
        if (zs.length) {
          const idx = zs.map((_, i) => i).sort((i, j) => zs[i] - zs[j]);
          const lo = idx[Math.floor((idx.length - 1) / 2)], hi = idx[Math.ceil((idx.length - 1) / 2)];
          zr = (zs[lo] + zs[hi]) / 2; xr = (xs[lo] + xs[hi]) / 2;
        }
        // whoever holds the last qualifying place right now (or is about to take it) is always in
        // the picture: the shot may sit a few metres behind them, never further
        let holder = null;
        for (let pl = Q; pl >= 1 && !holder; pl--) { const p = state.bots[state.order[pl - 1]]; if (p && racing(p) && !view.botHidden[p.id]) holder = p; }
        if (holder) {
          const hz = holder.pos.z;
          if (zr < hz - 3.5) { xr += (holder.pos.x - xr) * 0.5; zr = hz - 3.5; }
          else if (zr > hz + 4.5) { xr += (holder.pos.x - xr) * 0.5; zr = hz + 4.5; }
        }
      }
      shot.zRaw = zr; shot.xRaw = xr; shot.zMax = finishZ - 3.5; shot.finishZ = finishZ;
      shot.nearFinish = finishZ - zr < 30;
    }
    const homeOnly = userMode === 'Cut line';
    let next = story || (rt < START_HOLD ? 'start' : 'home'); // joining mid-race goes straight to the line

    if (homeOnly) next = 'home';
    else if (story === 'start') { if (rt >= (N < 12 ? 3.2 : START_HOLD)) next = 'home'; }
    else if (story === 'leader') { if (storyT >= LEADER_HOLD || !racing(state.bots[shot.botId])) next = 'home'; }
    else if (story === 'pickcut') {
      // a few seconds with the viewer's pick while something is happening to it
      if (storyT >= 2.8 || pickId < 0 || !live(state.bots[pickId])) next = 'home';
    }
    else if (story === 'finish') {
      // stay while Gumbles keep coming over the line, then a beat, then back to the fight
      if (!arriving && sinceThrough > FINISH_LINGER && storyT > 1.2) next = 'home';
      if (!lastPlaces && through > 0 && sinceThrough > 0.9) next = 'home';
      if (next === 'home') firstShown = true;
    } else {
      // at home: the line calls whenever someone is about to cross it
      const calm = lastCutChangeT > 2.2 && storyT >= HOME_MIN;
      if (arriving && rt > 3) next = 'finish';
      else if (PICK_CUTAWAY && pickAsk > 0 && pickId >= 0 && live(state.bots[pickId]) && !members.includes(pickId) && storyT >= 1.2 && sincePick > 6) next = 'pickcut';
      else if (LEADER_LOOK && !final && calm && !leaderDone && left === Q && rt > 5 && racing(lead) && !members.includes(lead.id)) next = 'leader';
    }
    if (!homeOnly && (story === 'leader' || story === 'pickcut') && arriving && (story === 'leader' || storyT > 1.6)) next = 'finish';

    if (next === 'start') {
      setStory('start');
      shot.mode = 'overview'; shot.botId = lead.id; shot.scope = 'field';
    } else if (next === 'leader') {
      if (story !== 'leader') { setStory('leader'); sinceLeader = 0; leaderDone = true; shot.botId = lead.id; }
      shot.mode = 'leader'; shot.scope = '';
    } else if (next === 'pickcut') {
      if (story !== 'pickcut') { setStory('pickcut'); sincePick = 0; pickAsk = 0; }
      shot.mode = 'follow'; shot.botId = pickId; shot.scope = '';
    } else if (next === 'finish') {
      if (story !== 'finish') setStory('finish');
      shot.botId = arrivals.length ? arrivals[0] : lead.id;
      shot.mode = 'finishline'; shot.scope = '';
    } else {
      // Home. One continuous shot: the camera eases as the group changes. It only hard-cuts when
      // the story jumps a long way down the course (the Gumble on the line fell and the next is far back).
      if (story !== 'home' || side !== wasSide || (side && onChase !== wasChase)) setStory('home', `show:${++cutN}:home`);
      wasSide = side; wasChase = onChase;
      anchorZ += (anchor.pos.z - anchorZ) * Math.min(1, dt * 4);
      if (storyT === 0) anchorZ = anchor.pos.z;
      shot.mode = side ? 'sideline' : 'zone'; shot.botId = anchor.id; shot.scope = 'group';
      shot.members = members;
      // The line. When the Gumble about to take the last place (the leader, in the final) comes
      // within LINE_NEAR metres of it, the picture cuts once to the camera that stands past the
      // line and stays there: the place is taken in the middle of the frame, coming at the lens.
      const taker = state.bots[state.order[Q - 1]]; // in the last qualifying place right now (the leader, in the final)
      // in the maze the side shot holds all four (blind judges followed the order best that way);
      // on the dash it closes on the two in front
      shot.reachAll = final && (finalAll || lead.pos.z < sideZ1 - 6);
      if (LINE_CAM && !(final && finalAll) && !lineCam && rt > 4 && taker && racing(taker) && !view.botHidden[taker.id] && finishZ - taker.pos.z < LINE_NEAR) {
        lineCam = true; lineX = taker.pos.x; lineZ = taker.pos.z;
        lineCamX = taker.pos.x + (taker.pos.x > 0 ? -1.5 : 1.5); // almost head-on, a step to the course's inner side
        setStory('home', `show:${++cutN}:line`);
      }
      if (lineCam) {
        // the camera stands still past the line and pans with the Gumble taking the place, who
        // comes straight at it; a chaser close behind is in the picture anyway
        if (taker && racing(taker)) {
          const k = Math.min(1, dt * 6);
          lineX += (taker.pos.x - lineX) * k; lineZ += (taker.pos.z - lineZ) * k;
        }
        shot.mode = 'finishline'; shot.scope = ''; shot.line = true; shot.xAim = lineX; shot.zAim = lineZ; shot.camX = lineCamX;
      } else shot.line = false;
    }
    return shot;
  }

  /** Who gets a name tag this frame (the pick is always tagged by the display itself). */
  function tags(state) {
    tagList.length = 0;
    const order = state.order, bots = state.bots;
    if (story === 'finish') {
      // at the line: name the ones coming in, nearest first
      for (let i = 0; i < Math.min(4, arrivals.length); i++) tagList.push({ id: arrivals[i], kind: final ? 'plain' : 'line' });
      return tagList;
    }
    if (final) {
      for (let i = 0; i < order.length; i++) if (live(bots[order[i]])) tagList.push({ id: order[i], kind: 'plain' });
      return tagList;
    }
    if (lineCam) {
      // at the line: the one taking the place and the one chasing, then whoever else is still coming
      for (const pl of [Q, Q + 1, Q - 1, Q - 2]) { const b = bots[order[pl - 1]]; if (b && racing(b)) tagList.push({ id: b.id, kind: final ? 'plain' : 'line' }); }
      return tagList;
    }
    if (story === 'leader' || story === 'leaderUser' || story === 'pick' || story === 'pickcut') {
      tagList.push({ id: shot.botId, kind: story === 'pick' || story === 'pickcut' ? 'line' : 'plain' });
      return tagList;
    }
    for (const pl of [Q, Q + 1]) {
      const b = bots[order[pl - 1]];
      if (b && live(b)) tagList.push({ id: b.id, kind: 'line' });
    }
    if (story === 'home') {
      for (const pl of [Q - 1, Q + 2]) {
        const b = bots[order[pl - 1]];
        if (b && racing(b) && members.includes(b.id)) tagList.push({ id: b.id, kind: 'line' });
      }
    }
    return tagList;
  }

  /** An incident involving the viewer's pick (the stage calls this for the pick's own events). */
  function notePick(ev) {
    if (ev.type === 'knockback' || ev.type === 'fall' || ev.type === 'tumble') pickAsk = 1.2;
  }

  return { reset, update, tags, notePick, shot, get leadGap() { return leadGap; }, get onChase() { return wasChase; }, get story() { return story; } };
}
