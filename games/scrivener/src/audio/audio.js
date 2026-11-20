// WebAudio sample player keyed by bus events. Owner: sound.
// No synthesized sounds: every voice is a real recording from assets/audio (see LICENSES.md),
// layered, pitched (playback rate), filtered, delayed, panned and sent to a hall reverb that is a
// convolution with a real recorded church impulse response (no generated or algorithmic reverb,
// so tails spread like a room instead of ringing at delay-line modes). The cue table lives in
// cues.js so tools/audio_render.mjs renders the exact same mix offline.
//
// Signal flow
//   voice: BufferSource(rate) -> [HP] -> [LP] -> env gain -> panner -> sfx bus
//                                                     \-> send gain -> HP/LP -> predelay -> Convolver(recorded IR) -> sfx bus
//   bed:   <audio> layer -> base gain -> scene gate -> fight gate -> [acts: shared act LP] -> bed gain (ducking) -> freeze LP -> mix
//   mix -> compressor (glue) -> master (the site's volume) -> limiter -> destination
//
// The fight's score (round 10): setIntensity(level, opts) moves the fight gates. The stage calls
// it with what musicCall() in cues.js returns for each bus event (the try, the stroke, the kill,
// the fall); bedResponse() in cues.js says what every layer does, so tools/audio_match.mjs renders
// the same score offline. A layer nobody can hear is paused after its fade (cheap: only the
// sounding streams decode) and a layer with an entry point restarts there when it comes back.
//
// assets/audio/manifest.json is the sound library (id -> {file, file_mp3, category, loop}).
// Browsers block audio until a user gesture; unlock() is wired to the first pointerdown/keydown
// in main.js. The match is spectated: click anywhere for sound.

import { CUES, MIX, MUSIC, CANCEL_PENDING, findCue, resolveLayer, simDelayMs, cueSoundIds, dbToGain, irScale, bedResponse, actLpHz } from './cues.js';

export { CUES, MIX };

// resolve(file) -> url and manifest (the parsed manifest.json) let a bundler serve the files
// (see src/stage/assets.js); without them files are fetched from `base`.
export function createAudio({ base = 'assets/audio/', muted = false, resolve = null, manifest = null } = {}) {
  const urlOf = (file) => (resolve && resolve(file)) || base + file;
  let ctx = null;
  let master = null, comp = null, mix = null, sfx = null, verbIn = null;
  let volume = 1; // the site's master volume, 0 to 1 (0 is silence)
  const level = () => (muted ? 0 : MIX.masterGain * volume);
  let bedGain = null, bedFilter = null, actLp = null;
  const bedEls = [];
  const bedGates = [];
  let scene = 'fight';
  let inten = { level: 0, page: true }; // the fight's music: the last setIntensity call
  let library = {};
  let ready = false;
  let useMp3 = false;
  const buffers = new Map();
  const lastPlay = new Map();
  const fired = new Map();
  const live = new Set();
  const stats = { played: 0, missing: 0, dropped: 0 };
  let duckUntil = 0;
  let duckLevel = 1;
  let freezeGain = null;
  let freezeOn = false;
  let bossPhase = 1;
  const pending = new Set();

  // The manifest is loaded once and shared: init() starts it, and unlock() (the first click/key)
  // may run before it lands. Everything that needs a file name awaits it, and a failed load is
  // retried by the next caller instead of being cached.
  let manifestP = null;
  async function fetchManifest() {
    if (manifest) return manifest;
    try {
      const res = await fetch(base + 'manifest.json', { cache: 'no-store' });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }
  const hasLibrary = () => Object.keys(library).length > 0;
  function ensureManifest() {
    if (hasLibrary()) return Promise.resolve(true);
    if (!manifestP) {
      manifestP = fetchManifest().then((man) => {
        if (man && typeof man === 'object') library = man.library || man;
        const ok = hasLibrary();
        if (!ok) manifestP = null; // let a later call try again
        return ok;
      });
    }
    return manifestP;
  }

  const fileOf = (id) => {
    const s = library[id];
    if (!s) return null;
    return useMp3 ? (s.file_mp3 || s.file) : s.file;
  };

  // A decoded buffer (or a definite "not in the library") is cached; anything that failed for a
  // transient reason (manifest not loaded yet, fetch/decode error) is dropped so the next play retries.
  function loadBuffer(id) {
    if (buffers.has(id)) return buffers.get(id);
    const p = (async () => {
      if (!(await ensureManifest())) { buffers.delete(id); return null; }
      const file = fileOf(id);
      if (!file) return null; // the library has no such sound: cache the miss
      try {
        const res = await fetch(urlOf(file));
        if (!res.ok) throw new Error('http ' + res.status);
        return await ctx.decodeAudioData(await res.arrayBuffer());
      } catch {
        buffers.delete(id);
        return null;
      }
    })();
    buffers.set(id, p);
    return p;
  }

  // warm the cache for the cues that matter most for reading the fight
  function warm() {
    for (const id of cueSoundIds()) if (!/^(music_|drone_|amb_)/.test(id) || id === 'amb_howling_wind_loop') loadBuffer(id);
  }

  // ---- hall reverb: a ConvolverNode loaded with a REAL recorded impulse response of a stone
  // church (assets/audio/ir_church_stone_hall, CC0, see LICENSES.md). normalize=false and the IR is
  // scaled to unit energy here (irScale in cues.js), so tools/audio_render.mjs convolves with
  // exactly the same response at exactly the same level.
  function buildReverb() {
    const R = MIX.reverb;
    const input = ctx.createGain();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = R.hpHz;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = R.lpHz;
    const pre = ctx.createDelay(0.2);
    pre.delayTime.value = R.preDelayMs / 1000;
    const conv = ctx.createConvolver();
    conv.normalize = false;
    const out = ctx.createGain();
    out.gain.value = dbToGain(R.wetDb);
    input.connect(hp).connect(lp).connect(pre).connect(conv).connect(out);
    let tries = 0;
    const load = () => loadBuffer(R.ir).then((buf) => {
      if (!buf) { if (++tries < 4) setTimeout(load, 2000 * tries); return; }
      const chans = [];
      for (let c = 0; c < buf.numberOfChannels; c++) chans.push(buf.getChannelData(c));
      const k = irScale(chans);
      const ir = ctx.createBuffer(buf.numberOfChannels, buf.length, buf.sampleRate);
      chans.forEach((d, c) => { const o = ir.getChannelData(c); for (let i = 0; i < d.length; i++) o[i] = d[i] * k; });
      conv.buffer = ir;
    });
    load();
    return { input, out };
  }

  function buildGraph() {
    master = ctx.createGain();
    master.gain.value = level();
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = MIX.comp.threshold;
    comp.knee.value = MIX.comp.knee;
    comp.ratio.value = MIX.comp.ratio;
    comp.attack.value = MIX.comp.attack;
    comp.release.value = MIX.comp.release;
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = MIX.limit.threshold;
    lim.knee.value = MIX.limit.knee;
    lim.ratio.value = MIX.limit.ratio;
    lim.attack.value = MIX.limit.attack;
    lim.release.value = MIX.limit.release;
    mix = ctx.createGain();
    mix.connect(comp).connect(master).connect(lim).connect(ctx.destination);
    sfx = ctx.createGain();
    sfx.gain.value = dbToGain(MIX.sfxDb);
    sfx.connect(mix);
    const verb = buildReverb();
    verbIn = verb.input;
    verb.out.connect(sfx);
    bedFilter = ctx.createBiquadFilter();
    bedFilter.type = 'lowpass';
    bedFilter.frequency.value = MIX.bedLpHz || 20000;
    bedGain = ctx.createGain();
    freezeGain = ctx.createGain();
    bedGain.connect(bedFilter).connect(freezeGain).connect(mix);
    actLp = ctx.createBiquadFilter();
    actLp.type = 'lowpass';
    actLp.frequency.value = actLpHz(inten);
    actLp.connect(bedGain);
  }

  function startBed() {
    if (bedEls.length || typeof Audio === 'undefined' || !ctx) return;
    if (!hasLibrary()) { ensureManifest().then((ok) => { if (ok) startBed(); }); return; }
    for (const b of MIX.bed) {
      const file = fileOf(b.id);
      if (!file) continue;
      const el = new Audio();
      el.src = urlOf(file);
      el.loop = true;
      el.preload = 'auto';
      el.crossOrigin = 'anonymous';
      try { el.currentTime = b.off || 0; } catch { /* set once metadata loads */ }
      el.addEventListener('loadedmetadata', () => { if (el.currentTime < 0.5 && b.off) el.currentTime = b.off; }, { once: true });
      const src = ctx.createMediaElementSource(el);
      const g = ctx.createGain();
      const sg = ctx.createGain(); // the show-phase gate (setScene)
      const ig = ctx.createGain(); // the fight gate (setIntensity)
      g.gain.value = dbToGain(b.db);
      const L = { b, el, sg, ig, sceneOn: inScene(b, scene), igOn: true, sleep: 0 };
      sg.gain.value = L.sceneOn ? 1 : 0;
      const r = bedResponse(b, inten, inten);
      if (r) { ig.gain.value = r.target; L.igOn = r.target > 0; }
      src.connect(g).connect(sg).connect(ig).connect(b.act != null ? actLp : bedGain);
      if (audible(L)) el.play().catch(() => {});
      bedEls.push(el);
      bedGates.push(L);
    }
  }

  const inScene = (b, name) => !b.in || b.in.includes(name);
  const audible = (L) => L.sceneOn && L.igOn;
  // a layer that comes back: from its entry point if it has one, and playing again
  function wake(L, seek) {
    clearTimeout(L.sleep);
    L.sleep = 0;
    if (seek != null) { try { L.el.currentTime = seek; } catch { /* not seekable yet */ } }
    if (L.el.paused) L.el.play().catch(() => {});
  }
  // a layer nobody can hear stops decoding once its fade is over
  function rest(L) {
    if (L.el.paused || L.sleep) return; // already asleep, or about to be
    L.sleep = setTimeout(() => { L.sleep = 0; if (!audible(L)) L.el.pause(); }, 4500);
  }

  // The show's phase: each bed layer plays only under the phases it lists (`in`), cross-faded.
  function setScene(name) {
    const was = scene;
    scene = name;
    if (!ctx) return;
    for (const L of bedGates) {
      const on = inScene(L.b, name);
      L.sg.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, 0.5);
      const entering = on && !L.sceneOn;
      L.sceneOn = on;
      if (entering && L.igOn) wake(L, L.b.entry != null && name !== was ? L.b.entry : null);
      else if (!audible(L)) rest(L);
    }
  }

  // The fight's music (see MUSIC in cues.js): level 0..1 and the act; opts as musicCall() returns
  // them ({ act, tryNo, page, start, cut, fall }). Deterministic: the same calls give the same score.
  function setIntensity(lv, opts = {}) {
    const c = { ...opts, level: Math.max(0, Math.min(1, Number(lv) || 0)) };
    if (c.act == null && !c.page && !c.cut) c.act = inten.act;
    const prev = inten;
    inten = c;
    if (!ctx) return;
    const now = ctx.currentTime;
    for (const L of bedGates) {
      const r = bedResponse(L.b, c, prev);
      if (!r) continue;
      const p = L.ig.gain;
      p.cancelScheduledValues(now);
      p.setValueAtTime(p.value, now);
      p.setTargetAtTime(r.target, now + (r.delay || 0), r.tau);
      L.igOn = r.target > 0;
      if (audible(L)) wake(L, r.seek); else rest(L);
    }
    if (!c.cut) {
      const f = actLp.frequency;
      f.cancelScheduledValues(now);
      f.setValueAtTime(f.value, now);
      f.setTargetAtTime(actLpHz(c), now, MUSIC.tauRise);
    }
  }

  // music-bed ducking: dip to the deepest requested level, hold, recover over 600ms
  function duck(db, ms) {
    const now = ctx.currentTime;
    const target = dbToGain(db);
    duckLevel = now < duckUntil ? Math.min(duckLevel, target) : target;
    duckUntil = Math.max(duckUntil, now + ms / 1000);
    const g = bedGain.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(duckLevel, now + 0.04);
    g.setValueAtTime(duckLevel, Math.max(now + 0.041, duckUntil));
    g.linearRampToValueAtTime(1, Math.max(now + 0.041, duckUntil) + 0.6);
  }

  // thinking freeze: the bed is muffled and pulled back while the world is held
  function setFreeze(on) {
    if (!ctx || on === freezeOn) return;
    freezeOn = on;
    const F = MIX.freeze;
    const now = ctx.currentTime;
    const T = on ? F.attack : F.release;
    const f = bedFilter.frequency;
    f.cancelScheduledValues(now);
    f.setValueAtTime(f.value, now);
    f.exponentialRampToValueAtTime(on ? F.lpHz : (MIX.bedLpHz || 20000), now + T);
    const g = freezeGain.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(on ? dbToGain(F.db) : 1, now + T);
  }

  function voice(l, x, when) {
    if (live.size >= MIX.maxVoices) { stats.dropped++; return; }
    loadBuffer(l.s).then((buf) => {
      if (!buf) { stats.missing++; return; }
      if (live.size >= MIX.maxVoices) { stats.dropped++; return; }
      const t0 = Math.max(ctx.currentTime, when + l.delay);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = l.rate;
      let node = src;
      if (l.hp) {
        const f = ctx.createBiquadFilter();
        f.type = 'highpass';
        f.frequency.value = l.hp;
        node = node.connect(f);
      }
      if (l.lp) {
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = l.lp;
        node = node.connect(f);
      }
      const env = ctx.createGain();
      const off = Math.min(l.off, Math.max(0, buf.duration - 0.05));
      const srcLeft = buf.duration - off;
      // output seconds; a pitch glide (rate -> rateEnd, linear in time) plays at the mean rate
      const dur = (l.len ? Math.min(l.len, srcLeft) : srcLeft) / ((l.rate + l.rateEnd) / 2);
      if (l.rateEnd !== l.rate) {
        src.playbackRate.setValueAtTime(l.rate, t0);
        src.playbackRate.linearRampToValueAtTime(l.rateEnd, t0 + dur);
      }
      env.gain.setValueAtTime(0, t0);
      env.gain.linearRampToValueAtTime(l.gain, t0 + Math.min(l.fi, dur * 0.5));
      if (l.dk) {
        // exponential decay after the attack (a struck body rings down; len ends it inaudibly)
        env.gain.setTargetAtTime(0, t0 + Math.min(l.fi, dur * 0.5), l.dk);
      } else if (l.len && l.len < srcLeft) {
        const fo = Math.min(l.fo, dur * 0.5);
        env.gain.setValueAtTime(l.gain, t0 + dur - fo);
        env.gain.linearRampToValueAtTime(0, t0 + dur);
      }
      node = node.connect(env);
      let out = env;
      if (ctx.createStereoPanner && x != null) {
        const p = ctx.createStereoPanner();
        p.pan.value = Math.max(-0.7, Math.min(0.7, (x - 640) / 640 * 0.7));
        out = env.connect(p);
      }
      out.connect(sfx);
      if (l.send > 0) {
        const s = ctx.createGain();
        s.gain.value = l.send;
        env.connect(s).connect(verbIn);
      }
      src.start(t0, off, l.len ? Math.min(l.len, srcLeft) : undefined);
      live.add(src);
      src.onended = () => { live.delete(src); try { src.disconnect(); } catch { /* already */ } };
      stats.played++;
    });
  }

  function play(e) {
    if (!ctx || muted || ctx.state !== 'running') return;
    if (e.type === 'think.start') setFreeze(true);
    else if (e.type === 'think.end' || e.type === 'match.attempt' || e.type === 'match.reset') setFreeze(false);
    if (e.type === 'boss.phase') bossPhase = 2;
    if (e.type === 'boss.tell' && e.phase) bossPhase = e.phase;
    if (e.type === 'match.attempt') bossPhase = 1;
    if (CANCEL_PENDING.has(e.type)) cancelPending();
    if (e.type === 'think.start') holdPending();
    else if (e.type === 'think.end') resumePending();
    const found = findCue(e);
    if (!found) return;
    const { key, cue } = found;
    const now = ctx.currentTime * 1000;
    if (cue.cd && now - (lastPlay.get(key) ?? -1e9) < cue.cd) return;
    // under heavy load (fast-forwarded sim), keep only the important cues
    if (live.size > MIX.maxVoices * 0.6 && (cue.pri ?? 1) < 2) { stats.dropped++; return; }
    lastPlay.set(key, now);
    const n = fired.get(key) || 0;
    fired.set(key, n + 1);
    if (cue.duck) duck(cue.duck[0], cue.duck[1]);
    const when = ctx.currentTime + 0.005;
    for (const raw of cue.L) {
      const sd = simDelayMs(raw, e, bossPhase);
      if (sd == null) voice(resolveLayer(raw, n, e), e.x, when);
      else if (sd >= 0) defer(resolveLayer(raw, n, e), e.x, sd);
    }
  }

  // ---- sim-timed layers (te/hit): held through the thinking freeze, cancelled on interrupts ----
  function defer(l, x, ms) {
    const p = { l, x, remaining: ms, start: 0, timer: 0 };
    pending.add(p);
    if (!freezeOn) arm(p);
  }
  function arm(p) {
    p.start = ctx.currentTime * 1000;
    p.timer = setTimeout(() => { pending.delete(p); voice(p.l, p.x, ctx.currentTime); }, Math.max(0, p.remaining - 5));
  }
  function holdPending() {
    const now = ctx.currentTime * 1000;
    for (const p of pending) {
      if (!p.timer) continue;
      clearTimeout(p.timer);
      p.timer = 0;
      p.remaining = Math.max(0, p.remaining - (now - p.start));
    }
  }
  function resumePending() {
    for (const p of pending) if (!p.timer) arm(p);
  }
  function cancelPending() {
    for (const p of pending) clearTimeout(p.timer);
    pending.clear();
  }

  return {
    get ready() { return ready; },
    get hasManifest() { return hasLibrary(); },
    get stats() { return { ...stats, live: live.size, state: ctx ? ctx.state : 'locked', music: bedEls.length > 0, playing: bedEls.filter((el) => !el.paused).length, intensity: { ...inten } }; },
    async init() {
      const ok = await ensureManifest();
      ready = true;
      // unlock() may have run first: warm and start the bed now that file names are known
      if (ok && ctx) { warm(); startBed(); }
      return ok;
    },
    unlock() {
      if (typeof AudioContext === 'undefined') return;
      if (!ctx) {
        ctx = new AudioContext();
        if (typeof Audio !== 'undefined') {
          const probe = new Audio();
          useMp3 = !probe.canPlayType('audio/ogg; codecs="vorbis"');
        }
        buildGraph();
        warm(); // each load awaits the manifest, so this is safe before init() has finished
      }
      if (ctx.state === 'suspended') ctx.resume();
      startBed();
    },
    setMuted(v) {
      muted = !!v;
      if (master) master.gain.value = level();
      for (const el of bedEls) el.muted = muted || volume === 0;
    },
    // The site's volume control: everything the game plays, 0 to 1. A short ramp, so a drag does not click.
    setVolume(v) {
      volume = Math.max(0, Math.min(1, Number(v)));
      if (!Number.isFinite(volume)) volume = 1;
      if (master && ctx) { master.gain.cancelScheduledValues(ctx.currentTime); master.gain.setTargetAtTime(level(), ctx.currentTime, 0.03); }
      for (const el of bedEls) el.muted = muted || volume === 0;
    },
    get volume() { return volume; },
    setScene,
    setIntensity,
    get intensity() { return { ...inten }; },
    attach(bus) {
      bus.onAny((e) => { play(e); });
    },
  };
}
