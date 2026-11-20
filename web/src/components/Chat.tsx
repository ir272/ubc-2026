import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ChannelState, FeedClient } from '../lib/feed';
import { usd } from '../lib/money';
import { useWallet } from '../lib/wallet';
import { timeAgo } from './bits';
import { paletteVar } from './Prediction';
import { BotTag, Button, Moment, TextInput } from '../ui';
import { sfxFor } from './nightline';

const NAME_HUES = 6;
const nameColor = (name: string) => {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) | 0;
  return `var(--name-${Math.abs(h) % NAME_HUES})`;
};

export function ChatList({ s }: { s: ChannelState }) {
  const ref = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  // Never show a message cut in half at the top: while pinned to the bottom, lines that don't fully
  // fit are hidden rather than clipped.
  const fit = () => {
    const el = ref.current;
    if (!el) return;
    if (stick.current) el.scrollTop = el.scrollHeight;
    const top = el.scrollTop;
    for (const c of el.querySelectorAll<HTMLElement>('.msg')) c.style.visibility = stick.current && c.offsetTop < top ? 'hidden' : '';
  };
  useLayoutEffect(fit, [s.chat]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const first = useRef<Set<number> | null>(null);
  if (!first.current) first.current = new Set(s.chat.map((c) => c.key));
  const human = s.chat.some((c) => !c.bot);
  // Who has a stake in this match: name → total and side (from the bets feed).
  const stakes = new Map<string, { amount: number; outcome: number }>();
  for (const b of s.bets) {
    const k = b.mine ? '\u0000you' : b.who;
    const cur = stakes.get(k);
    stakes.set(k, { amount: (cur?.amount ?? 0) + b.amount, outcome: cur?.outcome ?? b.outcome });
  }
  return (
    <div
      className="chat-list"
      ref={ref}
      data-testid="chat-list"
      onScroll={(e) => {
        const el = e.currentTarget;
        const was = stick.current;
        stick.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 24;
        if (was !== stick.current) fit();
      }}
    >
      {!human && <div className="chat-empty">No messages yet. Say something.</div>}
      {s.chat.map((c) => (
        <div key={c.key} className={`msg ${c.mine ? 'mine' : ''} ${c.bot ? 'is-bot' : ''} ${first.current!.has(c.key) ? '' : 'ink-msg-fresh'}`} title={c.t ? timeAgo(c.t) : undefined}>
          {c.bot && <BotTag seed={c.from} />}
          <span className="msg-name" style={c.bot ? undefined : { color: nameColor(c.from) }}>
            {c.from}
          </span>
          {(() => {
            const st = stakes.get(c.mine ? '\u0000you' : c.from);
            return st && st.outcome >= 0 ? <span className="stake num" style={{ color: paletteVar(st.outcome) }}>{usd(st.amount)}</span> : null;
          })()}
          <span className="msg-sep">: </span>
          <span className="msg-text">{c.text}</span>
        </div>
      ))}
    </div>
  );
}

export function ChatInput({ feed, s }: { feed: FeedClient; s: ChannelState }) {
  const wallet = useWallet();
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(0);
  useEffect(() => {
    if (s.lastError) setErr(s.lastError.replace(/^chat rate limit: /, ''));
    else setErr(null);
  }, [s.lastError]);
  const send = () => {
    const t = text.trim();
    if (!t) return;
    if (feed.sendChat(wallet.name, t)) {
      setText('');
      setSent((x) => x + 1);
    } else setErr('Reconnecting…');
  };
  return (
    <form
      className="chat-in"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      {err && <div className="chat-err">{err}</div>}
      <TextInput
        label="Chat message"
        hideLabel
        value={text}
        maxLength={280}
        onChange={(e) => setText(e.target.value)}
        placeholder="Send a message"
        data-testid="chat-input"
      />
      <Moment className="chat-sent" name="chat-sent" width={200} autoplay={false} playKey={sent} onStart={() => sfxFor('chat-sent')} />
      <div className="chat-foot">
        <Button size="sm" type="submit" data-testid="chat-send">
          Chat
        </Button>
      </div>
    </form>
  );
}
