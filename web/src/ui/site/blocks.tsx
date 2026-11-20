// Working examples built only from the kit: the bet panel, the chat, the channel rows, the sound board.
// The library site (Site.tsx) shows them as blocks.
import { useEffect, useRef, useState } from 'react';
import { Beacon } from '../Beacon';
import { BetSides, type BetState } from '../BetSides';
import { Button } from '../Button';
import { Frame } from '../Frame';
import { Moment, type MomentName } from '../Moment';
import { CUES, TAKES, uiSound, type UiSound } from '../sound';
import { BalancePill, ChatRow, Countdown, Medallion, TabPanel, Tabs, TextInput } from '../parts';
import './site.css';

const SIDES = [
  { id: 'luna', label: 'Luna', share: 0.62, multiple: 1.58 },
  { id: 'haiku', label: 'Haiku', share: 0.38, multiple: 2.56 },
];
const AMOUNTS = [10, 25, 50, 100];
const WINDOW = 60;
const TABS = [
  { id: 'about', label: 'About' },
  { id: 'form', label: 'Form' },
  { id: 'bets', label: 'Bets' },
];
const CHAT: Array<{ name: string; tone: 'blue' | 'coral' | 'green' | 'yellow'; bot?: boolean; text: string }> = [
  { name: 'kestrel', tone: 'blue', bot: true, text: 'luna opened with the lantern again' },
  { name: 'maple_sync', tone: 'green', bot: true, text: 'haiku dodged the ink wave twice, clean' },
  { name: 'duskrunner', tone: 'coral', text: 'is the boss the same seed for both of them?' },
  { name: 'pixelwren', tone: 'yellow', bot: true, text: '@duskrunner yes, sealed before betting opened' },
];
const MORE_CHAT = [
  { name: 'orbit', tone: 'blue' as const, bot: true, text: 'rating gap is like 24 points, this is a coin toss' },
  { name: 'gloam', tone: 'coral' as const, text: 'first time here, how do the odds move?' },
  { name: 'tinfoil', tone: 'green' as const, bot: true, text: 'luna got the first kill last three matches' },
];

export function ChannelRow({ id, name, sub, viewers }: { id: string; name: string; sub: string; viewers?: string }) {
  return (
    <div className="ink-demo-channel">
      <Medallion size={36} src={`/posters/${id}.jpg`} seed={id} />
      <div>
        <div className="ink-demo-strong">{name}</div>
        <div className="ink-demo-dim ink-demo-small">{sub}</div>
      </div>
      {viewers && <span className="ink-demo-viewers ink-num"><Beacon size={12} seed={id} label="Live" /> {viewers}</span>}
    </div>
  );
}

export function TabsDemo() {
  const [tab, setTab] = useState('about');
  return (
    <div style={{ width: 340 }}>
      <Tabs idBase="demo" label="Channel" tabs={TABS} value={tab} onChange={setTab} />
      <div className="ink-demo-gap" />
      <TabPanel idBase="demo" id="about" active={tab === 'about'}>
        <div className="ink-demo-dim">Two bots race to beat the same boss. The boss is sealed before betting opens.</div>
      </TabPanel>
      <TabPanel idBase="demo" id="form" active={tab === 'form'}>
        <div className="ink-demo-dim">Luna has won 3 of the last 5. Haiku has won 2.</div>
      </TabPanel>
      <TabPanel idBase="demo" id="bets" active={tab === 'bets'}>
        <div className="ink-demo-dim">kestrel bet 25 on Luna. gloam bet 10 on Haiku.</div>
      </TabPanel>
    </div>
  );
}

export function ChatDemo() {
  const [extra, setExtra] = useState(0);
  const [text, setText] = useState('');
  const [mine, setMine] = useState<string[]>([]);
  const [sent, setSent] = useState(0);
  return (
    <Frame style={{ width: 340 }} draw={false}>
      <div className="ink-demo-chat">
        {CHAT.map((c) => <ChatRow key={c.name} name={c.name} tone={c.tone} bot={c.bot}>{c.text}</ChatRow>)}
        {MORE_CHAT.slice(0, extra).map((c) => <ChatRow key={c.name} name={c.name} tone={c.tone} bot={c.bot} fresh>{c.text}</ChatRow>)}
        {mine.map((m, i) => <ChatRow key={i} name="you" tone="gold" fresh>{m}</ChatRow>)}
      </div>
      <form
        className="ink-demo-send"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          setMine((m) => [...m, text.trim()]);
          setSent((x) => x + 1);
          setText('');
        }}
      >
        <TextInput label="Message" hideLabel placeholder="Say something" value={text} onChange={(e) => setText(e.target.value)} maxLength={120} />
        {sent > 0 && <Moment className="ink-demo-sent" name="chat-sent" width={230} playKey={sent} onStart={() => uiSound.playFor('chat-sent')} />}
        <Button size="sm" type="submit">Send</Button>
      </form>
      <div className="ink-demo-gap" />
      <Button size="sm" disabled={extra >= MORE_CHAT.length} onClick={() => setExtra((x) => x + 1)}>A bot speaks</Button>
    </Frame>
  );
}

const MOMENTS: Array<{ name: MomentName; label: string; width: number }> = [
  { name: 'bet-placed', label: 'Bet placed', width: 160 },
  { name: 'payout', label: 'Payout arrives', width: 220 },
  { name: 'watch-and-bet', label: 'Watch and bet', width: 220 },
  { name: 'chat-sent', label: 'Chat sent', width: 300 },
];

/** Each Clayzo moment on its own; click one to play it again. */
export function MomentGallery() {
  const [keys, setKeys] = useState<Record<string, number>>({});
  return (
    <div className="ink-demo-row ink-demo-moments">
      {MOMENTS.map((m) => (
        <button key={m.name} type="button" className="ink-demo-moment" onClick={() => setKeys((k) => ({ ...k, [m.name]: (k[m.name] ?? 0) + 1 }))}>
          <Moment name={m.name} width={m.width} playKey={keys[m.name] ?? 0} onStart={keys[m.name] ? () => uiSound.playFor(m.name) : undefined} />
          <span className="ink-demo-dim ink-demo-small">{m.label}</span>
        </button>
      ))}
    </div>
  );
}

/** Audition board: every cue has three takes. Clicking one plays it and makes it the take the bet panel uses. */
export function SoundBoard() {
  const [, bump] = useState(0);
  const [vol, setVol] = useState(uiSound.volume());
  const play = (cue: UiSound, take: number) => {
    if (!uiSound.enabled()) {
      uiSound.enable(true);
      window.dispatchEvent(new Event('ink-sound'));
    }
    uiSound.choose(cue, take);
    uiSound.play(cue, take);
    bump((x) => x + 1);
  };
  return (
    <div className="ink-demo-sounds">
      {CUES.map((cue) => (
        <div key={cue.id} className="ink-demo-sound-row" role="group" aria-label={cue.when}>
          <span className="ink-demo-dim">{cue.when}</span>
          {TAKES[cue.id].map((t, i) => (
            <Button key={t.name} size="sm" selected={uiSound.chosen(cue.id) === i} onClick={() => play(cue.id, i)}>
              {t.name}
            </Button>
          ))}
        </div>
      ))}
      <label className="ink-demo-sound-row">
        <span className="ink-demo-dim">Volume</span>
        <input
          className="ink-demo-vol" type="range" min={0} max={1} step={0.05} value={vol}
          onChange={(e) => { const v = Number(e.target.value); setVol(v); uiSound.setVolume(v); }}
        />
      </label>
    </div>
  );
}

export function BetDemo() {
  const [pick, setPick] = useState<string | null>(null);
  const [state, setState] = useState<BetState>('open');
  const [amount, setAmount] = useState('25');
  const [balance, setBalance] = useState(1000);
  const [left, setLeft] = useState(42);
  const stake = Number(amount);
  const bad = !(stake > 0) ? 'Enter an amount' : stake > balance ? 'More than your balance' : '';

  useEffect(() => {
    if (state !== 'open') return;
    const t = setInterval(() => setLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [state]);
  useEffect(() => {
    if (state === 'open' && left > 0 && left <= 10 && document.hasFocus()) uiSound.play('tick'); // never from a background tab
  }, [left, state]);
  useEffect(() => {
    if (state !== 'placing') return;
    const t = setTimeout(() => setState('placed'), 900);
    return () => clearTimeout(t);
  }, [state]);

  const mult = SIDES.find((s) => s.id === pick)?.multiple ?? 0;
  const pays = (stake * mult).toFixed(2);
  const label = state === 'open' ? `Bet ${stake > 0 ? amount : ''}`.trim() : state === 'placing' ? 'Placing' : state === 'placed' ? 'Bet placed' : state === 'won' ? `You won ${pays}` : 'Not this time';
  const script = useRef<number[]>([]);
  const stop = () => { script.current.forEach(clearTimeout); script.current = []; };
  useEffect(() => stop, []);
  const reset = () => { stop(); setState('open'); setPick(null); setLeft(42); };
  // The whole story on its own, for judging motion and sound together: pick, bet, placed, won, payout.
  const playThrough = () => {
    reset();
    setLeft(12);
    setAmount('25');
    const at = (ms: number, f: () => void) => script.current.push(window.setTimeout(f, ms));
    at(900, () => { setPick('haiku'); uiSound.play('pick'); });
    at(2000, () => { setBalance((b) => b - 25); setState('placing'); uiSound.play('place'); });
    at(5200, () => { setState('won'); setBalance((b) => b + 25 * 2.56); });
  };

  return (
    <div className="ink-demo-row ink-demo-top">
      <Frame style={{ width: 400 }}>
        <div className="ink-demo-head">
          <div className="ink-demo-card-title">Who wins the match?</div>
          <Countdown seconds={left} total={WINDOW} label="Betting closes in" />
        </div>
        <div className="ink-demo-gap" />
        <BetSides label="Who wins the match?" sides={SIDES} value={pick} onChange={(id) => { setPick(id); uiSound.play('pick'); }} state={state} stake={amount} />
        <div className="ink-demo-gap" />
        <div className="ink-demo-amount">
          <TextInput label="Amount" inputMode="decimal" value={amount} disabled={state !== 'open'} error={state === 'open' && bad ? bad : undefined}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} style={{ width: 72 }} />
          <div className="ink-demo-row ink-demo-tight">
            {AMOUNTS.map((a) => <Button key={a} size="sm" disabled={state !== 'open'} onClick={() => setAmount(String(a))}>{String(a)}</Button>)}
          </div>
        </div>
        <div className="ink-demo-gap" />
        <Button
          variant="primary" size="lg" block
          disabled={!pick || !!bad || state === 'placing' || state === 'lost'}
          confirmed={state === 'placed' || state === 'won'}
          onClick={() => { setBalance((b) => b - stake); setState('placing'); uiSound.play('place'); }}
        >
          {label}
        </Button>
      </Frame>
      <div className="ink-demo-col">
        <BalancePill value={balance} />
        <span className="ink-demo-slot" style={{ width: 200, height: 200 }}>
          {state === 'placed' && <Moment name="bet-placed" width={120} label="Bet placed" onStart={() => uiSound.playFor('bet-placed')} />}
          {state === 'won' && <Moment name="payout" width={200} label="You won" onStart={() => uiSound.playFor('payout')} />}
        </span>
        <Button size="sm" disabled={state !== 'placed'} onClick={() => { setState('won'); setBalance((b) => b + stake * mult); }}>Result: won</Button>
        <Button size="sm" disabled={state !== 'placed'} onClick={() => setState('lost')}>Result: lost</Button>
        <Button size="sm" onClick={reset}>Reset</Button>
        <Button size="sm" onClick={() => setLeft(12)}>Jump to 0:12</Button>
        <Button size="sm" onClick={playThrough}>Play it through</Button>
      </div>
    </div>
  );
}
