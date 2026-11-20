// Foundations: where the look comes from and the rules the kit keeps.
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Button } from '../Button';
import { Frame } from '../Frame';
import { Checkbox, Switch } from '../controls';
import { InkStroke, InkSvg } from '../ink/Ink';
import { InkProvider } from '../ink/recipe';
import { check, checkerBand, hatch, loopBox, PEN, radialTicks, ring, ruledBox, star4 } from '../ink/shapes';
import { stroke, type Pt } from '../ink/stroke';
import { Roll } from '../Roll';
import { BetDemo, MomentGallery, SoundBoard } from './blocks';
import { Code, Example, List, P, Page, Preview, Section } from './parts';

/* ───────── overview ───────── */

export function Overview({ name }: { name: string }) {
  return (
    <article className="ink-site-page ink-site-home">
      <header className="ink-site-hero">
        <h1>{name}</h1>
        <p className="ink-site-tag">An interface kit drawn in white ink on black paper.</p>
        <div className="ink-site-row">
          <Button variant="primary" onClick={() => { location.hash = '#/start'; }}>Getting started</Button>
          <Button onClick={() => { location.hash = '#/components/button'; }}>Browse components</Button>
        </div>
      </header>
      <Section title="Built from its own parts">
        <BetDemo />
      </Section>
      <Section title="Moments">
        <MomentGallery />
      </Section>
    </article>
  );
}

/* ───────── getting started ───────── */

export function GettingStarted() {
  return (
    <Page group="Start" title="Getting started" lede="The kit lives in web/src/ui. It is plain React and one stylesheet; nothing to configure.">
      <Section title="Put a page on paper">
        <P>Give the page root the class <code>ink-ui</code>. It sets the colours, the text colour and the font, and every component expects to sit inside it.</P>
        <Code>{`
import { Button, Frame } from './ui';

export function Panel() {
  return (
    <div className="ink-ui" style={{ background: 'var(--ink-paper)' }}>
      <Frame>
        <Button variant="primary">Watch and bet</Button>
      </Frame>
    </div>
  );
}`}</Code>
      </Section>
      <Section title="Set the typeface">
        <P>The kit inherits the page's font until you set one. <code>--ink-font-scale</code> evens out faces that run small.</P>
        <Code>{`
.ink-ui {
  --ink-font: 'Shantell Sans', sans-serif;
  --ink-font-scale: 1;
}`}</Code>
      </Section>
      <Section title="Keep drawings stable">
        <P>Every component takes an optional <code>seed</code>. The same seed draws the same lines, so pass a stable one (a channel id, a side id) for anything that appears in more than one place.</P>
        <Code>{`<Medallion size={36} src={channel.icon} seed={channel.id} />`}</Code>
      </Section>
      <Section title="Moments and sound">
        <P>A moment is a short animation that plays once. Its sound is a separate call, so the page stays in charge of sound.</P>
        <Code>{`
import { Moment, uiSound } from './ui';

{won && <Moment name="payout" width={200} onStart={() => uiSound.playFor('payout')} />}`}</Code>
      </Section>
    </Page>
  );
}

/* ───────── principles ───────── */

function Specimen({ w = 150, h = 90, name, label, children }: { w?: number; h?: number; name?: string; label: string; children: ReactNode }) {
  return (
    <figure className="ink-site-specimen">
      <span className="ink-site-specimen-art" style={{ width: w, height: h }}>
        <InkSvg box={{ w, h }} pad={12}>{children}</InkSvg>
      </span>
      <figcaption>{name && <code>{name}</code>}<span>{label}</span></figcaption>
    </figure>
  );
}

export function Principles() {
  const [seed, setSeed] = useState(1);
  const a = useMemo(() => ruledBox(8, 10, 134, 60, `p${seed}`, PEN.rule, 6), [seed]);
  return (
    <Page group="Foundations" title="Principles" lede="Six rules. Every component follows all of them.">
      <Section title="Everything comes from the chart">
        <P>The look is taken from one reference, a hand-drawn chart in white ink on black paper. Each motif in the kit is on that chart: ruled lines that cross at the corner, pencil hatching, the checkered border, the medallion, the four-point star, the compass rose. Nothing is added from anywhere else.</P>
      </Section>
      <Section title="One hand">
        <P>Lines are drawn by code as pen strokes, and every wobble comes from a seed. The same seed gives the same drawing on every render; a new seed is a new stroke of the same hand.</P>
        <Preview>
          <Specimen label={`seed ${seed}`}>{a.map((s, i) => <InkStroke key={i} s={s} />)}</Specimen>
          <Specimen label={`seed ${seed}, drawn again`}>{a.map((s, i) => <InkStroke key={i} s={s} />)}</Specimen>
          <Button size="sm" onClick={() => setSeed((x) => x + 1)}>New seed</Button>
        </Preview>
      </Section>
      <Section title="Ink is neutral, gold is the moment">
        <P>White ink draws everything at rest. Gold appears only where something is happening to you: hover, focus, your pick, a confirmed bet, a live channel. The four pencils (blue, coral, green, yellow) tell sides and people apart and never carry state.</P>
      </Section>
      <Section title="State changes the drawing">
        <P>Hover draws a second line, focus rules the box in gold, disabled fades the plate away. No state depends on colour alone.</P>
      </Section>
      <Section title="Real controls underneath">
        <P>A button is a button, the bet sides are a radio group, tabs are tabs. The drawing sits on top of ordinary accessible elements.</P>
      </Section>
      <Section title="Motion is drawing">
        <P>Lines draw themselves on, numbers roll, and a moment strikes once and holds. Nothing loops except the live beacon.</P>
      </Section>
    </Page>
  );
}

/* ───────── colour ───────── */

const SWATCHES: Array<{ token: string; hex: string; use: string }> = [
  { token: '--ink-paper', hex: '#141318', use: 'The ground.' },
  { token: '--ink', hex: '#e6e4de', use: 'Lines and text.' },
  { token: '--ink-soft', hex: '#d7d5cf', use: 'Body text, resting frames.' },
  { token: '--ink-gold', hex: '#c5a559', use: 'Hover, focus, your pick, confirmed, live.' },
  { token: '--ink-blue', hex: '#6687ac', use: 'Pencil: a bet side, a chat name.' },
  { token: '--ink-coral', hex: '#b58970', use: 'Pencil; also errors and the last ten seconds.' },
  { token: '--ink-green', hex: '#69927d', use: 'Pencil; the medallion’s rope.' },
  { token: '--ink-yellow', hex: '#afa569', use: 'Pencil.' },
];

function contrast(a: string, b: string) {
  const lum = (hex: string) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

export function Colour() {
  return (
    <Page group="Foundations" title="Colour" lede="Eight colours, all measured from the reference chart. None was chosen by eye.">
      <Section title="The palette">
        <div className="ink-site-swatches">
          {SWATCHES.map((s) => (
            <div key={s.token} className="ink-site-swatch">
              <span className="ink-site-chip" style={{ background: s.hex }} />
              <div>
                <code>{s.token}</code>
                <div className="ink-site-dim ink-site-pair"><span>{s.hex}</span>{s.token !== '--ink-paper' && <span>{contrast(s.hex, '#141318').toFixed(1)}:1 on paper</span>}</div>
                <div>{s.use}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Two mixes">
        <P><code>--ink-dim</code> (ink at 60% into paper) is for secondary text. <code>--ink-faint</code> (30%) is for resting rules and disabled controls; it is too quiet for text.</P>
      </Section>
      <Section title="Pencil is hatching">
        <P>A pencil colour is laid down as hatching, the way the chart shades its coasts, and is used flat only for text.</P>
        <Preview>
          {(['blue', 'coral', 'green', 'yellow'] as const).map((tone) => <HatchChip key={tone} tone={tone} />)}
        </Preview>
      </Section>
    </Page>
  );
}

function HatchChip({ tone }: { tone: 'blue' | 'coral' | 'green' | 'yellow' }) {
  const d = useMemo(() => hatch(0, 0, 120, 40, `chip:${tone}`, { gap: 3.4 }), [tone]);
  const box = useMemo(() => ruledBox(0, 0, 120, 40, `chipbox:${tone}`, PEN.fine, 4), [tone]);
  return (
    <figure className="ink-site-specimen">
      <span className={`ink-site-specimen-art ink-tone-${tone}`} style={{ width: 120, height: 40 }}>
        <InkSvg box={{ w: 120, h: 40 }} pad={8}>
          <path d={d} fill="currentColor" style={{ color: 'var(--tone)' }} />
          <g style={{ color: 'var(--ink-faint)' }}>{box.map((s, i) => <InkStroke key={i} s={s} />)}</g>
        </InkSvg>
      </span>
      <figcaption>{tone}</figcaption>
    </figure>
  );
}

/* ───────── type ───────── */

const FACES: Array<{ name: string; css: string; scale: number; note: string }> = [
  { name: 'IM Fell English', css: "'IM Fell English', serif", scale: 1.1, note: 'The Fell types, cut in the 1600s: the letterpress of old charts. One weight, and its numerals are old-style, so odds and balances are harder to read.' },
  { name: 'Cormorant Garamond', css: "'Cormorant Garamond', serif", scale: 1.2, note: 'Engraved and light. Needs to run about 20% larger to read at interface sizes.' },
  { name: 'Shantell Sans', css: "'Shantell Sans', sans-serif", scale: 1, note: 'Hand-drawn but built for reading, with a full weight range and clear numerals.' },
];

export function Type() {
  return (
    <Page group="Foundations" title="Type" lede="The typeface is not chosen yet. These are the three on the shortlist, each set in the kit’s own text.">
      {FACES.map((f) => (
        <Section key={f.name} title={f.name}>
          <P>{f.note}</P>
          <Preview column>
            <div style={{ fontFamily: f.css, '--ink-font': f.css, '--ink-font-scale': f.scale, fontSize: `calc(15px * ${f.scale})` } as CSSProperties} className="ink-site-type">
              <div className="ink-site-type-big">Who beats the Scrivener first?</div>
              <div className="ink-site-type-num ink-site-pair"><span>1,039.00</span><span>2.56×</span><span>0:42</span><span>62%</span></div>
              <div>Two bots race to beat the same boss. The boss is sealed before betting opens.</div>
              <div className="ink-site-row"><Button variant="primary">Watch and bet</Button><Button>Connect wallet</Button></div>
            </div>
          </Preview>
        </Section>
      ))}
      <Section title="Numbers">
        <P>Amounts, odds and clocks use tabular figures (the <code>ink-num</code> class), so digits keep their column while they roll.</P>
      </Section>
    </Page>
  );
}

/* ───────── pens ───────── */

const wave = (w: number, y: number, amp = 9): Pt[] => Array.from({ length: 60 }, (_, i): Pt => [10 + ((w - 20) * i) / 59, y + Math.sin(i / 4.2) * amp]);

function PenLab() {
  const [w, setW] = useState(1.6);
  const [wobble, setWobble] = useState(0.7);
  const [dry, setDry] = useState(0.5);
  const [seed, setSeed] = useState(1);
  const s = useMemo(() => stroke(wave(520, 50, 14), { w, wobble, dry }, `lab${seed}`), [w, wobble, dry, seed]);
  const slider = (label: string, v: number, set: (n: number) => void, min: number, max: number) => (
    <label className="ink-site-slider">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={0.05} value={v} onChange={(e) => set(Number(e.target.value))} />
      <span className="ink-num ink-site-dim">{v.toFixed(2)}</span>
    </label>
  );
  return (
    <Preview column wide>
      <span className="ink-site-specimen-art" style={{ width: 520, height: 100 }}>
        <InkSvg box={{ w: 520, h: 100 }} pad={8}><InkStroke key={`${w}${wobble}${dry}${seed}`} s={s} draw="mount" dur={700} /></InkSvg>
      </span>
      <div className="ink-site-sliders">
        {slider('Width', w, setW, 0.6, 5)}
        {slider('Wobble', wobble, setWobble, 0, 2.5)}
        {slider('Dry', dry, setDry, 0, 1)}
        <Button size="sm" onClick={() => setSeed((x) => x + 1)}>New seed</Button>
      </div>
    </Preview>
  );
}

export function Pens() {
  const pens = useMemo(() => (Object.keys(PEN) as Array<keyof typeof PEN>).map((k) => ({ k, s: stroke(wave(220, 22, 7), PEN[k], `pen:${k}`) })), []);
  const use: Record<string, string> = { rule: 'frames, buttons, fields', fine: 'resting rules, inner rings', bold: 'the selected thing, ticks, underlines', pencil: 'hatching' };
  return (
    <Page group="Foundations" title="Pens" lede="Every line is a ribbon with pressure, not a stroke of one width.">
      <Section title="A stroke is a ribbon">
        <P>An SVG stroke is the same width from end to end, which is what a hand does not do. Here a pen turns a few points into a filled shape whose width follows the hand’s speed: heavier where it starts, stops and turns, lighter on the straights, skipping a little where the pen runs dry. The technique is Kevin Ngo’s, from Looseleaf; the engine here is our own.</P>
      </Section>
      <Section title="The four pens">
        <Preview>
          {pens.map(({ k, s }) => (
            <figure key={k} className="ink-site-specimen">
              <span className="ink-site-specimen-art" style={{ width: 220, height: 44 }}><InkSvg box={{ w: 220, h: 44 }} pad={6}><InkStroke s={s} /></InkSvg></span>
              <figcaption><code>PEN.{k}</code><span>{use[k]}</span></figcaption>
            </figure>
          ))}
        </Preview>
      </Section>
      <Section title="Draw with it">
        <PenLab />
        <Code>{`
import { stroke } from './ui/ink/stroke';

const s = stroke(points, { w: 1.6, wobble: 0.7, dry: 0.5 }, 'my-seed');
// s.d      the ribbon, to fill
// s.guide  its centre line, used to draw it on`}</Code>
      </Section>
      <Section title="Drawing a line on">
        <P>A ribbon cannot be animated like a stroke, so the kit slides a mask along its centre line. That is how every frame, underline and tick draws itself.</P>
      </Section>
    </Page>
  );
}

/* ───────── shapes ───────── */

export function Shapes() {
  const art = useMemo(() => ({
    box: ruledBox(10, 12, 130, 56, 'sh:box', PEN.rule, 6),
    loop: loopBox(10, 20, 130, 40, 20, 'sh:loop'),
    ring: [ring(75, 42, 32, 'sh:r1'), ring(75, 42, 24, 'sh:r2', PEN.fine)],
    rope: radialTicks(75, 42, 25, 31, 'sh:rope'),
    hatch: hatch(10, 14, 130, 52, 'sh:hatch', { gap: 4 }),
    star: star4(75, 42, 30, 'sh:star'),
    check: check(75, 44, 56, 'sh:check'),
    checker: checkerBand(150, 80, 8, 'sh:checker'),
  }), []);
  return (
    <Page group="Foundations" title="Shapes" lede="The few motifs everything is built from. Each is on the reference chart.">
      <Section title="The set">
        <Preview>
          <Specimen name="ruledBox" label="lines that cross at the corner">{art.box.map((s, i) => <InkStroke key={i} s={s} />)}</Specimen>
          <Specimen name="loopBox" label="a loop whose ends overlap"><InkStroke s={art.loop} /></Specimen>
          <Specimen name="ring, radialTicks" label="the medallion">
            {art.ring.map((s, i) => <InkStroke key={i} s={s} />)}
            <path d={art.rope} fill="currentColor" style={{ color: 'var(--ink-green)' }} />
          </Specimen>
          <Specimen name="hatch" label="pencil shading"><path d={art.hatch} fill="currentColor" style={{ color: 'var(--ink-blue)' }} /></Specimen>
          <Specimen name="star4" label="the chart’s star"><path d={art.star} fill="currentColor" style={{ color: 'var(--ink-gold)' }} /></Specimen>
          <Specimen name="check" label="one stroke"><g style={{ color: 'var(--ink-gold)' }}><InkStroke s={art.check} /></g></Specimen>
          <Specimen w={150} h={80} name="checkerBand" label="the chart’s border">
            {art.checker.outer.map((s, i) => <InkStroke key={`o${i}`} s={s} />)}
            {art.checker.inner.map((s, i) => <InkStroke key={`i${i}`} s={s} />)}
            <InkStroke s={art.checker.ink} />
            <g style={{ color: 'var(--ink-gold)' }}><InkStroke s={art.checker.gold} /></g>
          </Specimen>
        </Preview>
      </Section>
      <Section title="Using one">
        <Code>{`
import { InkStroke, InkSvg, useBox } from './ui/ink/Ink';
import { ruledBox } from './ui/ink/shapes';

const [ref, box] = useBox<HTMLDivElement>();
const rules = ruledBox(0, 0, box.w, box.h, 'my-seed');

<div ref={ref} style={{ position: 'relative' }}>
  <InkSvg box={box}>{rules.map((s, i) => <InkStroke key={i} s={s} draw="mount" delay={i * 90} />)}</InkSvg>
</div>`}</Code>
      </Section>
    </Page>
  );
}

/* ───────── recipes ───────── */

function HandLab() {
  const [wobble, setWobble] = useState(1);
  const [a, setA] = useState(true);
  const [b, setB] = useState(true);
  return (
    <Preview column wide>
      <InkProvider wobble={wobble}>
        <div className="ink-site-row">
          <Button variant="primary" seed="hand-a">Watch and bet</Button>
          <Button seed="hand-b">Connect wallet</Button>
          <Switch checked={a} onChange={setA} label="Sound" seed="hand-c" />
          <Checkbox checked={b} onChange={setB} label="Show bots" seed="hand-d" />
        </div>
      </InkProvider>
      <label className="ink-site-slider">
        <span>Hand</span>
        <input type="range" min={0} max={3} step={0.1} value={wobble} onChange={(e) => setWobble(Number(e.target.value))} />
        <span className="ink-num ink-site-dim">{wobble === 0 ? 'ruler' : wobble < 0.8 ? 'steady' : wobble <= 1.3 ? 'ours' : 'loose'}</span>
      </label>
    </Preview>
  );
}

export function Recipes() {
  return (
    <Page group="Foundations" title="Recipes" lede="A component’s whole drawing is described once, as layers named for its states.">
      <Section title="Layers follow the real state">
        <P>A recipe says what is drawn at rest, on hover, when pressed, when focused, when on, and when disabled. The stylesheet shows each layer from the element’s real state, so nothing is drawn or computed when you hover: the lines are already there, waiting. The idea is Kevin Ngo’s, from Looseleaf.</P>
        <div className="ink-site-table-wrap">
          <table className="ink-site-table">
            <thead><tr><th>Layer</th><th>Shows when</th><th>How it arrives</th></tr></thead>
            <tbody>
              <tr><td><code>rest</code></td><td>always</td><td>there, or drawn on once</td></tr>
              <tr><td><code>hover</code></td><td>a real pointer is over it</td><td>drawn on, about 200 ms</td></tr>
              <tr><td><code>pressed</code></td><td>held down</td><td>at once</td></tr>
              <tr><td><code>focus</code></td><td>keyboard focus</td><td>at once, never animated</td></tr>
              <tr><td><code>on</code></td><td>checked, selected, confirmed</td><td>drawn or wiped on</td></tr>
              <tr><td><code>disabled</code></td><td>disabled</td><td>replaces rest</td></tr>
            </tbody>
          </table>
        </div>
      </Section>
      <Section title="The button’s recipe">
        <Code>{`
export const buttonRecipe = defineRecipe<{ primary: boolean }>({
  id: 'button',
  draw(ink, { w, h }, { primary }) {
    const rules = ruledBox(0, 0, w, h, ink.seed, ink.pen(PEN.rule), 4);
    const gold = ruledBox(0, 0, w, h, ink.seed, ink.pen({ ...PEN.rule, w: 1.6 }), 4);
    const face = plate(3, 3, w - 6, h - 6, ink.seed + ':p');

    if (primary) ink.fill('rest', face, { tone: 'ink' });
    ink.stroke('rest', rules, { tone: 'ink' });
    ink.stroke('hover', gold, { tone: 'gold', draw: true, stagger: 30, dur: 200 });
    ink.stroke('focus', gold, { tone: 'gold' });
    ink.wipe('on', face, 3, 3, w - 6, h - 6, { tone: 'gold', dur: 360 });
    ink.stroke('disabled', rules, { tone: 'faint' });
  },
});`}</Code>
        <P>The component measures itself and renders the drawing: <code>{'const { ref, node } = useInk(buttonRecipe, { primary })'}</code>. The element with the class <code>ink-host</code> is the one whose state the layers follow.</P>
      </Section>
      <Section title="One hand, adjustable">
        <P>Every pen in a recipe passes through <code>ink.pen()</code>, so the whole kit can be made steadier or looser in one place with <code>InkProvider</code>.</P>
        <HandLab />
        <Code>{`<InkProvider wobble={0.6}>…</InkProvider>`}</Code>
      </Section>
      <Section title="Density">
        <P>Set <code>data-density="compact"</code> on the root and controls tighten: buttons drop from 40 to 34 px and rows close up. The Compact switch in the top bar does this for the site.</P>
      </Section>
      <Section title="Which components use recipes">
        <P>Button, switch, checkbox, menu, tooltip and toast. The older parts (frame, bet sides, tabs, text input, pill) still draw themselves directly and will move over.</P>
      </Section>
    </Page>
  );
}

/* ───────── motion ───────── */

const TIMES: Array<{ name: string; ms: number; ease: string; what: string }> = [
  { name: 'Press', ms: 140, ease: 'var(--ink-ease-out)', what: 'scale to 0.97' },
  { name: 'Label change', ms: 180, ease: 'var(--ink-ease-out)', what: 'old words leave, new arrive' },
  { name: 'Hover line', ms: 200, ease: 'var(--ink-ease-out)', what: 'gold rules draw over ink' },
  { name: 'Roll', ms: 240, ease: 'var(--ink-ease-out)', what: 'one digit changing' },
  { name: 'Frame line', ms: 420, ease: 'var(--ink-ease-pen)', what: 'one rule of a frame, first appearance only' },
  { name: 'Share slide', ms: 500, ease: 'var(--ink-ease-out)', what: 'hatching following the pot' },
];

export function Motion() {
  const [go, setGo] = useState(false);
  const [frame, setFrame] = useState(0);
  const [n, setN] = useState(1039);
  return (
    <Page group="Foundations" title="Motion" lede="Interface motion is short and answers the hand. Longer motion is kept for the rare moments that deserve it.">
      <Section title="Three kinds">
        <List items={[
          <><strong>Answers.</strong> Press, hover, focus, a label changing. Under 300 ms, strong ease-out, never in the way.</>,
          <><strong>Drawing.</strong> A frame or underline drawing itself on, once, when it first appears.</>,
          <><strong>Moments.</strong> Bet placed, payout, chat sent, setting off to a channel. One to three seconds, played once.</>,
        ]} />
      </Section>
      <Section title="Durations">
        <Preview column wide>
          <div className="ink-site-times">
            {TIMES.map((t) => (
              <div key={t.name} className="ink-site-time">
                <span>{t.name}</span>
                <span className="ink-site-time-track"><span className="ink-site-time-bar" style={{ transform: `scaleX(${go ? 1 : 0})`, transition: `transform ${go ? t.ms : 0}ms ${t.ease}` }} /></span>
                <span className="ink-num ink-site-dim">{t.ms} ms</span>
                <span className="ink-site-dim">{t.what}</span>
              </div>
            ))}
          </div>
          <Button size="sm" onClick={() => { setGo(false); requestAnimationFrame(() => requestAnimationFrame(() => setGo(true))); }}>Play</Button>
        </Preview>
      </Section>
      <Section title="Drawing on">
        <Preview>
          <Frame key={frame} style={{ width: 260 }}><div className="ink-site-dim">Four rules, each drawn in turn.</div></Frame>
          <Button size="sm" onClick={() => setFrame((x) => x + 1)}>Draw again</Button>
        </Preview>
      </Section>
      <Section title="Rolling">
        <Preview>
          <span className="ink-site-type-big"><Roll value={n.toLocaleString('en-US', { minimumFractionDigits: 2 })} /></span>
          <Button size="sm" onClick={() => setN((x) => x + 64)}>Add 64</Button>
          <Button size="sm" onClick={() => setN((x) => x - 25)}>Take 25</Button>
        </Preview>
        <P>Only the digits that changed move, last digit first.</P>
      </Section>
      <Section title="Less motion">
        <P>When the system asks for reduced motion (or the page sets <code>data-motion="reduce"</code>), nothing draws on, rolls or pulses and moments show their settled frame. Every state still appears. The switch in the top bar does this for this site.</P>
      </Section>
    </Page>
  );
}

/* ───────── sound ───────── */

export function Sound() {
  return (
    <Page group="Foundations" title="Sound" lede="Seven small cues, all made in code. Each has three takes; the one you pick here is the one the kit plays.">
      <Section title="The board">
        <Preview column wide><SoundBoard /></Preview>
      </Section>
      <Section title="Rules">
        <List items={[
          'Components never play sound. The page calls uiSound.play, so one switch can mute everything.',
          'Each moment has a cue timed to land on its beat. Start it from the moment’s onStart.',
          'Nothing sounds from a background tab.',
        ]} />
        <Code>{`
import { uiSound } from './ui';

uiSound.play('pick');            // a cue
uiSound.playFor('payout');       // the cue that belongs to a moment, on its beat
uiSound.enable(false);           // mute; remembered`}</Code>
      </Section>
    </Page>
  );
}

/* ───────── accessibility ───────── */

export function Accessibility() {
  return (
    <Page group="Foundations" title="Accessibility" lede="The drawing is decoration; the controls underneath are ordinary ones.">
      <Section title="Keyboard">
        <div className="ink-site-table-wrap">
          <table className="ink-site-table">
            <thead><tr><th>Control</th><th>Keys</th></tr></thead>
            <tbody>
              <tr><td>Button</td><td>Enter, Space</td></tr>
              <tr><td>Bet sides</td><td>Tab into the group, arrow keys move the pick</td></tr>
              <tr><td>Tabs</td><td>Arrow keys, Home, End; Tab moves into the panel</td></tr>
              <tr><td>Text input</td><td>As any text field</td></tr>
            </tbody>
          </table>
        </div>
      </Section>
      <Section title="What is covered">
        <List items={[
          'Focus is always visible: the box or line is ruled in gold, at once, with no animation.',
          'All text is at least 4.5:1 on paper. The faint mix is used for lines only.',
          'Every drawing is hidden from screen readers; names come from the real text, or from a label you pass.',
          'The countdown is a timer, the balance is a status, the bet sides are a radio group.',
          'Reduced motion is respected everywhere, moments included.',
        ]} />
      </Section>
      <Section title="Not checked yet">
        <List items={['Safari and Firefox.', 'Phone widths and touch.', 'Forced-colours mode.', 'A real screen reader pass.']} />
      </Section>
    </Page>
  );
}

export { Example };
