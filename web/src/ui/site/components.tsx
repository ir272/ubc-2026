// One page per component: what it is, a live preview, examples of every state, its props, its accessibility.
import { useEffect, useState, type ReactNode } from 'react';
import { Beacon } from '../Beacon';
import { BetSides, type BetState } from '../BetSides';
import { Button } from '../Button';
import { Checkbox, Progress, Skeleton, Switch } from '../controls';
import { Menu, toast, Tooltip } from '../overlays';
import { CheckerFrame, Frame } from '../Frame';
import { Moment, type MomentName } from '../Moment';
import { BalancePill, BotTag, ChatRow, Countdown, Medallion, Pill, TextInput } from '../parts';
import { Roll } from '../Roll';
import { uiSound } from '../sound';
import { BetDemo, ChannelRow, ChatDemo, TabsDemo } from './blocks';
import { Code, Example, List, Page, Preview, Props, Section, type PropRow } from './parts';

interface Doc {
  group: string;
  title: string;
  lede: string;
  preview: ReactNode;
  usage: string;
  examples?: Array<{ title: string; note?: string; node: ReactNode; column?: boolean }>;
  props: PropRow[];
  a11y: string[];
}

function ComponentPage({ doc }: { doc: Doc }) {
  return (
    <Page group={doc.group} title={doc.title} lede={doc.lede}>
      <Section title="Preview"><Preview>{doc.preview}</Preview></Section>
      <Section title="Usage"><Code>{doc.usage}</Code></Section>
      {doc.examples && (
        <Section title="Examples">
          {doc.examples.map((e) => <Example key={e.title} title={e.title} note={e.note} column={e.column}>{e.node}</Example>)}
        </Section>
      )}
      <Section title="Props"><Props rows={doc.props} /></Section>
      <Section title="Accessibility"><List items={doc.a11y} /></Section>
    </Page>
  );
}

const SEED: PropRow = ['seed', 'string', 'per instance', 'Keeps the drawing identical wherever the same thing appears.'];
const SIDES = [
  { id: 'luna', label: 'Luna', share: 0.62, multiple: 1.58 },
  { id: 'haiku', label: 'Haiku', share: 0.38, multiple: 2.56 },
];

/* ───────── small live examples that need state ───────── */

function SavingButton() {
  const [s, setS] = useState<'idle' | 'busy' | 'done'>('idle');
  useEffect(() => {
    if (s !== 'busy') return;
    const t = setTimeout(() => setS('done'), 900);
    return () => clearTimeout(t);
  }, [s]);
  return (
    <>
      <Button variant="primary" size="lg" disabled={s === 'busy'} confirmed={s === 'done'} onClick={() => setS('busy')}>
        {s === 'idle' ? 'Bet 25' : s === 'busy' ? 'Placing' : 'Bet placed'}
      </Button>
      <Button size="sm" onClick={() => setS('idle')}>Reset</Button>
    </>
  );
}

function SidesExample({ state }: { state: BetState }) {
  const [pick, setPick] = useState<string | null>(state === 'open' ? null : 'haiku');
  return <div style={{ width: 340 }}><BetSides label="Who wins the match?" sides={SIDES} value={pick} onChange={setPick} state={state} stake="25" seed={`ex-${state}`} /></div>;
}

function MovingShares() {
  const [a, setA] = useState(0.62);
  const sides = [{ ...SIDES[0]!, share: a, multiple: 0.98 / a }, { ...SIDES[1]!, share: 1 - a, multiple: 0.98 / (1 - a) }];
  return (
    <>
      <div style={{ width: 340 }}><BetSides label="Shares" sides={sides} value={null} seed="moving" /></div>
      <Button size="sm" onClick={() => setA((x) => (x > 0.5 ? 0.31 : 0.62))}>Move the pot</Button>
    </>
  );
}

function CountdownExample({ from }: { from: number }) {
  const [left, setLeft] = useState(from);
  useEffect(() => {
    const t = setInterval(() => setLeft((s) => (s > 0 ? s - 1 : from)), 1000);
    return () => clearInterval(t);
  }, [from]);
  return <Countdown seconds={left} total={60} label="Betting closes in" seed={`cd-${from}`} />;
}

function BalanceExample() {
  const [v, setV] = useState(1000);
  return (
    <>
      <BalancePill value={v} />
      <Button size="sm" onClick={() => setV((x) => x + 64)}>Win 64</Button>
      <Button size="sm" onClick={() => setV((x) => x - 25)}>Bet 25</Button>
    </>
  );
}

function RollExample() {
  const [n, setN] = useState(42);
  const clock = `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
  return (
    <>
      <span className="ink-site-type-big"><Roll value={clock} dir="down" /></span>
      <Button size="sm" onClick={() => setN((x) => Math.max(0, x - 1))}>One second</Button>
      <Button size="sm" onClick={() => setN(42)}>Reset</Button>
    </>
  );
}

function InputExample() {
  const [v, setV] = useState('25');
  const bad = Number(v) > 1000 ? 'More than your balance' : !(Number(v) > 0) ? 'Enter an amount' : undefined;
  return <TextInput label="Amount" inputMode="decimal" value={v} error={bad} onChange={(e) => setV(e.target.value.replace(/[^0-9.]/g, ''))} style={{ width: 120 }} />;
}

function FreshChat() {
  const [n, setN] = useState(0);
  const more = ['rating gap is like 24 points, this is a coin toss', 'luna got the first kill last three matches', 'haiku plays it safe until attempt 3 though'];
  return (
    <>
      <div style={{ width: 320, minHeight: 110, display: 'grid', alignContent: 'end' }}>
        <ChatRow name="kestrel" tone="blue" bot>luna opened with the lantern again</ChatRow>
        {more.slice(0, n).map((m, i) => <ChatRow key={i} name={['orbit', 'tinfoil', 'kestrel'][i]!} tone={(['green', 'coral', 'blue'] as const)[i]!} bot fresh>{m}</ChatRow>)}
      </div>
      <Button size="sm" disabled={n >= more.length} onClick={() => setN((x) => x + 1)}>A bot speaks</Button>
    </>
  );
}

function MomentExample({ name, width }: { name: MomentName; width: number }) {
  const [k, setK] = useState(0);
  return (
    <>
      <Moment name={name} width={width} playKey={k} onStart={k ? () => uiSound.playFor(name) : undefined} />
      <Button size="sm" onClick={() => setK((x) => x + 1)}>Play</Button>
    </>
  );
}

function SwitchExample({ label, start = false, disabled }: { label: string; start?: boolean; disabled?: boolean }) {
  const [on, setOn] = useState(start);
  return <Switch checked={on} onChange={setOn} label={label} disabled={disabled} seed={`sw-${label}`} />;
}

function CheckExample({ label, start = false, disabled }: { label: string; start?: boolean; disabled?: boolean }) {
  const [on, setOn] = useState(start);
  return <Checkbox checked={on} onChange={setOn} label={label} disabled={disabled} seed={`ck-${label}`} />;
}

function ProgressExample() {
  const [v, setV] = useState(0.4);
  return (
    <>
      <Progress value={v} label="Round progress" style={{ width: 260 }} />
      <Button size="sm" onClick={() => setV((x) => (x >= 1 ? 0.1 : Math.min(1, x + 0.2)))}>Advance</Button>
    </>
  );
}

function LoadingExample() {
  const [ready, setReady] = useState(false);
  return (
    <>
      <div style={{ display: 'grid', gap: 10, width: 250, minHeight: 82 }}>
        {ready
          ? <><ChannelRow id="scrivener" name="Inkelton" sub="Luna vs Haiku" viewers="1.2K" /><ChannelRow id="brawl" name="Blood Moon" sub="Round 3" viewers="864" /></>
          : [0, 1].map((i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '36px 1fr', gap: 10, alignItems: 'center' }}>
              <Skeleton width={36} height={36} seed={`sk-a${i}`} />
              <div style={{ display: 'grid', gap: 6 }}><Skeleton width={130} height={12} seed={`sk-b${i}`} /><Skeleton width={80} height={10} seed={`sk-c${i}`} /></div>
            </div>
          ))}
      </div>
      <Button size="sm" onClick={() => setReady((x) => !x)}>{ready ? 'Load again' : 'Finish loading'}</Button>
    </>
  );
}

function MenuExample({ align }: { align?: 'start' | 'end' }) {
  const [last, setLast] = useState('');
  return (
    <>
      <Menu
        label="Wallet"
        align={align}
        trigger={<Button>Wallet</Button>}
        items={[
          { id: 'add', label: 'Add Souls', hint: '+1,000', onSelect: () => setLast('Add Souls') },
          { id: 'history', label: 'Bet history', onSelect: () => setLast('Bet history') },
          { id: 'copy', label: 'Copy address', onSelect: () => setLast('Copy address') },
          { id: 'out', label: 'Disconnect', onSelect: () => setLast('Disconnect') },
          { id: 'export', label: 'Export keys', disabled: true, onSelect: () => undefined },
        ]}
      />
      <span className="ink-site-dim">{last ? `Chose: ${last}` : 'Nothing chosen yet'}</span>
    </>
  );
}

/* ───────── the pages ───────── */

export const COMPONENTS: Record<string, Doc> = {
  button: {
    group: 'Actions', title: 'Button',
    lede: 'The thing you press. Primary is an ink plate inside crossing rules; quiet is the rules alone.',
    preview: <><Button variant="primary" size="lg">Place bet</Button><Button variant="primary">Watch and bet</Button><Button>Connect wallet</Button><Button size="sm">Follow</Button></>,
    usage: `import { Button } from './ui';\n\n<Button variant="primary" size="lg" onClick={placeBet}>Place bet</Button>\n<Button>Connect wallet</Button>`,
    examples: [
      { title: 'Sizes', node: <><Button size="sm">Follow</Button><Button>Follow</Button><Button size="lg">Follow</Button></> },
      { title: 'Hover, press, focus', note: 'Hover draws the rules over in gold; a quiet button also takes a wash of hatching. Press scales to 0.97. Keyboard focus rules the box in gold at once.', node: <><Button variant="primary">Hover me</Button><Button>Hover me</Button></> },
      { title: 'Disabled', note: 'The plate goes and the rules fade.', node: <><Button variant="primary" disabled>Betting closed</Button><Button disabled>Betting closed</Button></> },
      { title: 'Confirming, on the same button', note: 'Change the label and set confirmed. The words change in place and the plate is washed over in gold; it never swaps for a second button.', node: <SavingButton /> },
      { title: 'Full width', node: <div style={{ width: 320 }}><Button variant="primary" size="lg" block>Bet 25</Button></div> },
    ],
    props: [
      ['variant', "'primary' | 'quiet'", "'quiet'", 'Primary is for the one main action of a view.'],
      ['size', "'sm' | 'md' | 'lg'", "'md'", '32, 40 or 48 px high.'],
      ['block', 'boolean', 'false', 'Fills the width of its container.'],
      ['confirmed', 'boolean', 'false', 'The action went through: gold plate, no more presses.'],
      SEED,
      ['…', 'button props', '', 'onClick, disabled, type and the rest pass through.'],
    ],
    a11y: ['A real button: Enter and Space press it.', 'A confirmed button is marked aria-disabled, so it stays readable and focusable.', 'Pass text as children; an icon-only button needs an aria-label.'],
  },
  'text-input': {
    group: 'Forms', title: 'Text input',
    lede: 'A field written on a ruled line. Focus draws the line over in gold.',
    preview: <><TextInput label="Amount" inputMode="decimal" defaultValue="25" style={{ width: 120 }} /><TextInput label="Message" placeholder="Say something" style={{ width: 220 }} /></>,
    usage: `import { TextInput } from './ui';\n\n<TextInput label="Amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />`,
    examples: [
      { title: 'With an error', note: 'The line turns coral and the reason is shown and announced. Try 2000.', node: <InputExample /> },
      { title: 'Hidden label', note: 'For a chat box, where the placeholder does the visual job. The label is still read out.', node: <TextInput label="Message" hideLabel placeholder="Say something" style={{ width: 260 }} /> },
      { title: 'Disabled', node: <TextInput label="Amount" defaultValue="25" disabled style={{ width: 120 }} /> },
    ],
    props: [
      ['label', 'string', '', 'Required. Shown above the field unless hideLabel.'],
      ['hideLabel', 'boolean', 'false', 'Keeps the label for screen readers only.'],
      ['prefix, suffix', 'ReactNode', '', 'Shown inside the field, for a unit or a mark.'],
      ['error', 'string', '', 'Shown under the field in coral and announced.'],
      SEED,
      ['…', 'input props', '', 'value, onChange, placeholder, inputMode and the rest pass through.'],
    ],
    a11y: ['The label is tied to the field.', 'An error sets aria-invalid and is announced as an alert.'],
  },
  'bet-sides': {
    group: 'Forms', title: 'Bet sides',
    lede: 'The sides of a bet as one choice: name, pencil-hatched share of the pot, share and what it pays.',
    preview: <SidesExample state="open" />,
    usage: `import { BetSides } from './ui';\n\n<BetSides\n  label="Who wins the match?"\n  sides={[{ id: 'luna', label: 'Luna', share: 0.62, multiple: 1.58 }, { id: 'haiku', label: 'Haiku', share: 0.38, multiple: 2.56 }]}\n  value={pick}\n  onChange={setPick}\n  state="open"\n/>`,
    examples: [
      { title: 'Placing', note: 'Your pick is boxed in gold and the rows are locked while the bet is sent.', node: <SidesExample state="placing" /> },
      { title: 'Placed', note: 'A tick is drawn beside your pick, with your stake.', node: <SidesExample state="placed" /> },
      { title: 'Won', note: 'A star lands on the corner.', node: <SidesExample state="won" /> },
      { title: 'Lost', node: <SidesExample state="lost" /> },
      { title: 'The pot moves', note: 'When a share changes, the hatching slides to it.', node: <MovingShares /> },
    ],
    props: [
      ['sides', '{ id, label, share, multiple, tone? }[]', '', 'share is 0 to 1; multiple is what one unit pays. Pencil colours repeat after four.'],
      ['value', 'string | null', '', 'The picked side’s id.'],
      ['onChange', '(id) => void', '', 'Called when the viewer picks a side.'],
      ['state', "'open' | 'placing' | 'placed' | 'won' | 'lost'", "'open'", 'Where the bet is.'],
      ['stake', 'string', '', 'Shown beside the pick once placed.'],
      ['label', 'string', '', 'Required. Names the group, usually the question.'],
      SEED,
    ],
    a11y: ['A radio group: Tab reaches it once, arrow keys move the pick.', 'Each row is read as its name, multiple and share.', 'Locked rows are marked aria-disabled.'],
  },
  tabs: {
    group: 'Navigation', title: 'Tabs',
    lede: 'A row of tabs. The selected one is underlined by hand.',
    preview: <TabsDemo />,
    usage: `import { Tabs, TabPanel } from './ui';\n\n<Tabs idBase="ch" label="Channel" tabs={[{ id: 'about', label: 'About' }, { id: 'form', label: 'Form' }]} value={tab} onChange={setTab} />\n<TabPanel idBase="ch" id="about" active={tab === 'about'}>…</TabPanel>`,
    props: [
      ['tabs', '{ id, label }[]', '', 'The tabs, in order.'],
      ['value', 'string', '', 'The selected tab’s id.'],
      ['onChange', '(id) => void', '', 'Called on click and on arrow keys.'],
      ['label', 'string', '', 'Required. Names the tab list.'],
      ['idBase', 'string', '', 'Shared with TabPanel so tabs and panels point at each other.'],
      SEED,
    ],
    a11y: ['Arrow keys move between tabs, Home and End jump to the ends.', 'Moved by keyboard, the underline appears at once; clicked, it draws on.', 'Each panel is labelled by its tab.'],
  },
  frame: {
    group: 'Layout', title: 'Frame',
    lede: 'The card: four ruled lines that run past the corners and cross.',
    preview: <Frame style={{ width: 300 }}><strong>Inkelton</strong><div className="ink-site-dim">Luna vs Haiku</div></Frame>,
    usage: `import { Frame } from './ui';\n\n<Frame>\n  <h3>Inkelton</h3>\n</Frame>`,
    examples: [{ title: 'Without the draw-on', note: 'For anything that mounts often, such as rows in a list.', node: <Frame draw={false} style={{ width: 300 }}><div className="ink-site-dim">Simply there.</div></Frame> }],
    props: [['draw', 'boolean', 'true', 'Draw the four rules on when the frame first appears.'], SEED, ['…', 'div props', '', 'className, style and the rest pass through. Padding is 16 px.']],
    a11y: ['The lines are decoration; the frame adds no role. Give its content a heading.'],
  },
  'checker-frame': {
    group: 'Layout', title: 'Checker frame',
    lede: 'The chart’s checkered border, with its runs of gold. For the one frame on a page that should feel like the chart’s edge.',
    preview: <CheckerFrame style={{ width: 380 }}><strong>Who wins the match?</strong><div className="ink-site-dim">Luna vs Haiku</div></CheckerFrame>,
    usage: `import { CheckerFrame } from './ui';\n\n<CheckerFrame band={8}>…</CheckerFrame>`,
    props: [['draw', 'boolean', 'true', 'Draw the rules and walk the checks round on first appearance.'], ['band', 'number', '8', 'Thickness of the border in px.'], SEED],
    a11y: ['Decoration only. Use at most one per page.'],
  },
  pill: {
    group: 'Display', title: 'Pill',
    lede: 'A short label inside a hand-drawn loop.',
    preview: <><Pill live>Live</Pill><Pill>1.2K watching</Pill><Pill tone="gold">Boss fight</Pill><Pill tone="blue">Luna</Pill></>,
    usage: `import { Pill } from './ui';\n\n<Pill live>Live</Pill>\n<Pill tone="gold">Boss fight</Pill>`,
    props: [['tone', "'ink' | 'gold' | 'blue' | 'coral' | 'green' | 'yellow'", "'ink'", 'Colour of the words and the loop.'], ['live', 'boolean', 'false', 'Puts the live beacon in front.'], SEED],
    a11y: ['Plain text; not interactive.'],
  },
  'bot-tag': {
    group: 'Display', title: 'BOT tag',
    lede: 'Marks a chat name as a bot.',
    preview: <><span><BotTag />kestrel</span><span><BotTag seed="b" />maple_sync</span></>,
    usage: `import { BotTag } from './ui';\n\n<BotTag /> kestrel`,
    props: [SEED],
    a11y: ['Read out as the word "BOT" before the name.'],
  },
  'chat-row': {
    group: 'Display', title: 'Chat row',
    lede: 'One line of chat: who, whether they are a bot, and what they said.',
    preview: <div style={{ width: 320 }}><ChatRow name="kestrel" tone="blue" bot>luna opened with the lantern again</ChatRow><ChatRow name="duskrunner" tone="coral">is the boss the same seed for both of them?</ChatRow></div>,
    usage: `import { ChatRow } from './ui';\n\n<ChatRow name="kestrel" tone="blue" bot fresh>luna opened with the lantern again</ChatRow>`,
    examples: [{ title: 'A message arriving', note: 'Set fresh on messages that arrive after the first paint; they rise into place once.', node: <FreshChat /> }],
    props: [['name', 'string', '', 'Who is speaking.'], ['tone', 'pencil colour', "'ink'", 'Colour of the name.'], ['bot', 'boolean', 'false', 'Adds the BOT tag.'], ['fresh', 'boolean', 'false', 'Plays the arrival once.'], ['children', 'ReactNode', '', 'The message.']],
    a11y: ['Plain text in reading order: tag, name, message.'],
  },
  medallion: {
    group: 'Display', title: 'Medallion',
    lede: 'The round frame for a channel’s icon, after the moon medallion on the chart.',
    preview: <><Medallion size={104} src="/posters/scrivener.jpg" alt="Inkelton" live seed="big" /><Medallion size={56} src="/posters/tumbletop.jpg" alt="Goober Guys" seed="mid" /><Medallion size={36} src="/posters/brawl.jpg" alt="Blood Moon" seed="small" /><Medallion size={56} seed="letter">P</Medallion></>,
    usage: `import { Medallion } from './ui';\n\n<Medallion size={36} src={channel.icon} alt={channel.name} live seed={channel.id} />`,
    examples: [
      { title: 'Drawn on', note: 'For the one large icon on a page. Leave it off in lists.', node: <Medallion key={Math.random()} size={104} src="/posters/scrivener.jpg" alt="Inkelton" draw seed="drawn" /> },
      { title: 'In a list', node: <div style={{ display: 'grid', gap: 10 }}><ChannelRow id="scrivener" name="Inkelton" sub="Luna vs Haiku" viewers="1.2K" /><ChannelRow id="brawl" name="Blood Moon" sub="Round 3" viewers="864" /></div> },
    ],
    props: [['size', 'number', '56', 'Px across. Under 44 it simplifies to two rings.'], ['src', 'string', '', 'The image.'], ['alt', 'string', "''", 'Names the channel; leave empty when the name is printed beside it.'], ['live', 'boolean', 'false', 'Shows the beacon on the rim.'], ['draw', 'boolean', 'false', 'Draw the rings on when it appears.'], ['children', 'ReactNode', '', 'Shown when there is no image, such as an initial.'], SEED],
    a11y: ['The image carries the alt text; the rings are hidden.', 'The beacon is read as "Live".'],
  },
  beacon: {
    group: 'Display', title: 'Beacon',
    lede: 'The live mark: the chart’s four-point star, twinkling, with a ring drifting out.',
    preview: <><Beacon size={28} seed="a" label="Live" /><span className="ink-site-row"><Beacon size={16} seed="b" label="Live" /> Inkelton</span><span className="ink-site-row"><Beacon size={12} seed="c" label="Live" /> 1.2K</span></>,
    usage: `import { Beacon } from './ui';\n\n<Beacon size={12} seed={channel.id} label="Live" />`,
    props: [['size', 'number', '14', 'Px.'], ['tone', 'colour', "'gold'", 'Gold by default; the chart has no red.'], ['label', 'string', '', 'Read out by screen readers. Leave empty when the word is next to it.'], SEED],
    a11y: ['Beacons with different seeds pulse out of step, so a list does not blink together.', 'Under reduced motion it is a still star.'],
  },
  countdown: {
    group: 'Display', title: 'Countdown',
    lede: 'Time left, as a rolling clock over the chart’s scale bar.',
    preview: <CountdownExample from={42} />,
    usage: `import { Countdown } from './ui';\n\n<Countdown seconds={msLeft / 1000} total={60} label="Betting closes in" />`,
    examples: [{ title: 'The last ten seconds', note: 'The clock and the bar turn coral.', node: <CountdownExample from={12} /> }],
    props: [['seconds', 'number', '', 'Seconds left. The parent owns the clock.'], ['total', 'number', '', 'Length of the whole window, for the bar.'], ['label', 'string', '', 'Read before the time, such as "Betting closes in".'], SEED],
    a11y: ['Marked as a timer and named with its label and the time.'],
  },
  'balance-pill': {
    group: 'Display', title: 'Balance pill',
    lede: 'The viewer’s balance. When it goes up, the payout arrives.',
    preview: <BalanceExample />,
    usage: `import { BalancePill } from './ui';\n\n<BalancePill value={balance} />`,
    props: [['value', 'number', '', 'The balance. An increase plays the arrival: the gain floats in, the digits roll, the loop is redrawn in gold.'], ['format', '(n) => string', '1,000.00', 'How the number is written.'], ['label', 'string', "'Balance'", 'Read before the amount.'], SEED],
    a11y: ['A status region named with its label and amount.'],
  },
  roll: {
    group: 'Display', title: 'Roll',
    lede: 'A value that changes by rolling: last character first, unchanged characters stay still.',
    preview: <RollExample />,
    usage: `import { Roll } from './ui';\n\n<Roll value="1,039.00" />\n<Roll value="0:42" dir="down" />`,
    props: [['value', 'string', '', 'The text to show.'], ['dir', "'up' | 'down'", "'up'", 'Up for a number growing, down for a clock running down.']],
    a11y: ['Screen readers get the whole value as one string, not digit by digit.'],
  },
  moment: {
    group: 'Moments', title: 'Moment',
    lede: 'A short animation that plays once, for the few events that deserve one. Made with Clayzo, drawn with this kit’s pens.',
    preview: <MomentExample name="payout" width={200} />,
    usage: `import { Moment, uiSound } from './ui';\n\n{won && <Moment name="payout" width={200} onStart={() => uiSound.playFor('payout')} />}`,
    examples: [
      { title: 'Bet placed', note: 'A ring is drawn and a tick is struck through it. 1.5 s.', node: <MomentExample name="bet-placed" width={140} /> },
      { title: 'Payout arrives', note: 'The medallion is drawn, a gold star lands, small stars fly out. 2.6 s.', node: <MomentExample name="payout" width={220} /> },
      { title: 'Watch and bet', note: 'The compass rose is drawn, swings and settles on its heading. 1.8 s.', node: <MomentExample name="watch-and-bet" width={220} /> },
      { title: 'Chat sent', note: 'A star races along the line and bursts. 0.9 s, and nothing is left behind.', node: <MomentExample name="chat-sent" width={300} /> },
    ],
    props: [
      ['name', "'bet-placed' | 'payout' | 'watch-and-bet' | 'chat-sent'", '', 'Which piece.'],
      ['width', 'number', '', 'Px wide; the height follows the piece.'],
      ['playKey', 'string | number', '', 'Change it to play again.'],
      ['onStart', '() => void', '', 'Called as it starts. The place to start its sound.'],
      ['label', 'string', '', 'Read out by screen readers; leave empty when words beside it say the same.'],
    ],
    a11y: ['Under reduced motion a moment shows its settled frame, and "chat sent" shows nothing.', 'The player loads only when a moment is first shown.'],
  },
  switch: {
    group: 'Forms', title: 'Switch',
    lede: 'On or off. Off, the knob is a plain ring; on, it is the chart’s gold star and the track is shaded.',
    preview: <><SwitchExample label="Sound" start /><SwitchExample label="Less motion" /></>,
    usage: `import { Switch } from './ui';\n\n<Switch checked={sound} onChange={setSound} label="Sound" />`,
    examples: [{ title: 'Disabled', node: <><SwitchExample label="Off, disabled" disabled /><SwitchExample label="On, disabled" start disabled /></> }],
    props: [['checked', 'boolean', '', 'Whether it is on.'], ['onChange', '(checked) => void', '', 'Called with the new value.'], ['label', 'ReactNode', '', 'Required. The words beside it.'], ['disabled', 'boolean', 'false', ''], SEED],
    a11y: ['A real switch: Space and Enter toggle it, and it is read as on or off with its label.', 'The whole row is the target, words included.'],
  },
  checkbox: {
    group: 'Forms', title: 'Checkbox',
    lede: 'A tick box. The tick is struck through the box, a little larger than it, as a hand ticks a list.',
    preview: <><CheckExample label="Show bots in chat" start /><CheckExample label="Remember my amount" /></>,
    usage: `import { Checkbox } from './ui';\n\n<Checkbox checked={bots} onChange={setBots} label="Show bots in chat" />`,
    examples: [{ title: 'Disabled', node: <><CheckExample label="Unticked, disabled" disabled /><CheckExample label="Ticked, disabled" start disabled /></> }],
    props: [['checked', 'boolean', '', 'Whether it is ticked.'], ['onChange', '(checked) => void', '', 'Called with the new value.'], ['label', 'ReactNode', '', 'Required.'], ['disabled', 'boolean', 'false', ''], SEED],
    a11y: ['Read as a checkbox with its label and state; Space toggles it.'],
  },
  progress: {
    group: 'Display', title: 'Progress',
    lede: 'How far along something is: pencil hatching filling a ruled bar.',
    preview: <ProgressExample />,
    usage: `import { Progress } from './ui';\n\n<Progress value={0.4} label="Round progress" />`,
    examples: [{ title: 'Pencils', column: true, node: <>{(['gold', 'blue', 'coral', 'green'] as const).map((t, i) => <Progress key={t} value={0.3 + i * 0.18} label={t} tone={t} seed={`pg-${t}`} style={{ width: 260 }} />)}</> }],
    props: [['value', 'number', '', '0 to 1.'], ['label', 'string', '', 'Required. Names what is progressing.'], ['tone', 'colour', "'gold'", 'Pencil colour of the shading.'], SEED],
    a11y: ['A progress bar with its label and a 0 to 100 value.'],
  },
  skeleton: {
    group: 'Display', title: 'Skeleton',
    lede: 'Holds the place of content that is still loading, at the content’s own size.',
    preview: <LoadingExample />,
    usage: `import { Skeleton } from './ui';\n\n{loading ? <Skeleton width={130} height={12} /> : <span>{channel.name}</span>}`,
    props: [['width', 'number | string', '', 'Px or any CSS width.'], ['height', 'number', '', 'Px.'], SEED],
    a11y: ['Hidden from screen readers. Mark the region that is loading with aria-busy.', 'Under reduced motion it holds still.'],
  },
  tooltip: {
    group: 'Overlays', title: 'Tooltip',
    lede: 'A short label for a control, on hover or keyboard focus.',
    preview: <><Tooltip text="Pays 2.56 for every 1"><Button>2.56×</Button></Tooltip><Tooltip text="Share of the pot on this side"><Button>38%</Button></Tooltip><Tooltip text="Opens below" side="bottom"><Button>Below</Button></Tooltip></>,
    usage: `import { Tooltip } from './ui';\n\n<Tooltip text="Pays 2.56 for every 1">\n  <Button>2.56×</Button>\n</Tooltip>`,
    examples: [{ title: 'One after another', note: 'The first waits half a second. Move straight to the next and it opens at once, with no animation.', node: <>{['Follow', 'Share', 'Report'].map((x) => <Tooltip key={x} text={`${x} this channel`}><Button size="sm">{x}</Button></Tooltip>)}</> }],
    props: [['text', 'string', '', 'One short line.'], ['side', "'top' | 'bottom'", "'top'", 'Where it appears.'], ['children', 'element', '', 'The control it describes; it must be able to take focus.']],
    a11y: ['Shown on keyboard focus as well as hover, and tied to the control as its description.', 'Escape hides it.', 'Never put anything in a tooltip that touch users need; there is no hover on touch.'],
  },
  menu: {
    group: 'Overlays', title: 'Menu',
    lede: 'A list of actions that opens from a button.',
    preview: <MenuExample />,
    usage: `import { Menu, Button } from './ui';\n\n<Menu\n  label="Wallet"\n  trigger={<Button>Wallet</Button>}\n  items={[\n    { id: 'add', label: 'Add Souls', hint: '+1,000', onSelect: addMoney },\n    { id: 'out', label: 'Disconnect', onSelect: disconnect },\n  ]}\n/>`,
    examples: [{ title: 'Lined up with the right edge', note: 'For a button near the right of the page, such as the wallet in the header.', node: <MenuExample align="end" /> }],
    props: [['label', 'string', '', 'Required. Names the menu.'], ['trigger', 'element', '', 'The button that opens it.'], ['items', '{ id, label, hint?, disabled?, onSelect }[]', '', 'The actions, in order.'], ['align', "'start' | 'end'", "'start'", 'Which edge of the trigger it lines up with.'], SEED],
    a11y: ['Arrow keys move, Home and End jump, a letter jumps to the item that starts with it, Enter chooses, Escape closes and returns focus to the button.', 'Opened from the keyboard it appears at once, with focus on the first item.', 'A click outside closes it.'],
  },
  toast: {
    group: 'Overlays', title: 'Toast',
    lede: 'A short notice in the corner that leaves on its own.',
    preview: <><Button onClick={() => toast('You won 64.00', { detail: 'Haiku won the match.', tone: 'gold' })}>A win</Button><Button onClick={() => toast('Bet placed', { detail: '25 on Haiku at 2.56×' })}>A notice</Button><Button onClick={() => toast('Bet not placed', { detail: 'Betting closed before it was sent.', tone: 'coral' })}>A problem</Button></>,
    usage: `import { toast, Toaster } from './ui';\n\n// once, near the root of the page\n<Toaster />\n\n// anywhere\ntoast('You won 64.00', { detail: 'Haiku won the match.', tone: 'gold' });`,
    props: [['message', 'string', '', 'First argument. The one line that matters.'], ['detail', 'string', '', 'A second, quieter line.'], ['tone', "'ink' | 'gold' | 'coral'", "'ink'", 'Gold for good news, with the star. Coral for a problem.'], ['duration', 'number', '4500', 'Ms before it leaves. Hovering holds it.']],
    a11y: ['Announced politely; a coral toast is announced as an alert.', 'Hover or focus holds it, and each has a Dismiss button.', 'At most four show at once.'],
  },
};

export function ComponentDoc({ id }: { id: string }) {
  const doc = COMPONENTS[id];
  return doc ? <ComponentPage doc={doc} /> : null;
}

/* ───────── blocks: whole pieces of the site, built only from the kit ───────── */

export function BetPanelBlock() {
  return (
    <Page group="Blocks" title="Bet panel" lede="The whole bet: question, clock, sides, amount, the button, and what happens when you win.">
      <Section title="Live"><BetDemo /></Section>
      <Section title="What it is made of">
        <List items={['Frame', 'Countdown', 'Bet sides', 'Text input and four small buttons', 'One primary button that confirms on itself', 'Balance pill', 'The bet placed and payout moments']} />
      </Section>
    </Page>
  );
}

export function ChatBlock() {
  return (
    <Page group="Blocks" title="Chat" lede="Messages, the BOT tag, and a field that sends.">
      <Section title="Live"><ChatDemo /></Section>
      <Section title="What it is made of"><List items={['Frame', 'Chat row and BOT tag', 'Text input (hidden label) and a small button', 'The chat sent moment']} /></Section>
    </Page>
  );
}

export function ChannelsBlock() {
  return (
    <Page group="Blocks" title="Channel list" lede="The rail of live channels.">
      <Section title="Live">
        <Preview column>
          <ChannelRow id="scrivener" name="Inkelton" sub="Luna vs Haiku" viewers="1.2K" />
          <ChannelRow id="brawl" name="Blood Moon" sub="Round 3" viewers="864" />
          <ChannelRow id="tumbletop" name="Goober Guys" sub="Heat 2" viewers="412" />
        </Preview>
      </Section>
      <Section title="What it is made of"><List items={['Medallion', 'Beacon']} /></Section>
    </Page>
  );
}
