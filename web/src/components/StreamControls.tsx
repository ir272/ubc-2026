import { useCallback, useEffect, useRef, useState } from 'react';
import { VolumeIcon } from './bits';
import { audio, effectiveVolume, useAudio } from '../lib/audio';
import './stream-controls.css';

// Player controls over the live stream, laid out like kick.com's player: a bar over the bottom of the
// picture on a dark fade, shown on pointer movement or keyboard focus and hidden after 2.5 s idle.
// Rendered as a child of `.ch-stream`; fullscreen and the pointer listeners act on that parent.

const IDLE_MS = 2500;
const NARROW = '(max-width: 900px)';

const isTyping = (t: EventTarget | null) => {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return true;
  return t instanceof HTMLInputElement && !['range', 'checkbox', 'radio', 'button', 'submit', 'reset'].includes(t.type);
};

export function StreamControls({ hasVolume }: { hasVolume: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const overBar = useRef(false);
  const [shown, setShown] = useState(false);
  const [full, setFull] = useState(false);
  const [theatre, setTheatre] = useState(false);
  const snd = useAudio();
  const vol = effectiveVolume(snd);

  const stream = () => root.current?.parentElement ?? null;

  const hide = useCallback(() => {
    window.clearTimeout(timer.current);
    setShown(false);
    stream()?.setAttribute('data-sc-idle', '');
  }, []);
  const poke = useCallback(() => {
    setShown(true);
    stream()?.removeAttribute('data-sc-idle');
    window.clearTimeout(timer.current);
    if (!overBar.current) timer.current = window.setTimeout(hide, IDLE_MS);
  }, [hide]);

  const toggleFull = useCallback(() => {
    const el = stream();
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void el.requestFullscreen?.().catch(() => {});
  }, []);
  const toggleTheatre = useCallback(() => {
    // Phones have no rail and stack the chat under the stream, so theatre mode only switches on when wide.
    setTheatre((t) => (t ? false : !window.matchMedia(NARROW).matches));
  }, []);

  // Theatre mode lives on <html> so the page layout (rail, content under the stream) can follow it.
  useEffect(() => {
    const d = document.documentElement;
    if (theatre) d.setAttribute('data-theatre', '1');
    else d.removeAttribute('data-theatre');
  }, [theatre]);
  useEffect(() => () => document.documentElement.removeAttribute('data-theatre'), []);

  useEffect(() => {
    const onChange = () => setFull(document.fullscreenElement != null && document.fullscreenElement === stream());
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // Pointer over the stream shows the bar; leaving it or 2.5 s without movement hides it.
  useEffect(() => {
    const el = stream();
    if (!el) return;
    const onMove = () => poke();
    const onLeave = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') hide();
    };
    const onDbl = (e: MouseEvent) => {
      if (e.target instanceof Element && e.target.closest('button, input')) return;
      toggleFull();
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerdown', onMove);
    el.addEventListener('pointerleave', onLeave);
    el.addEventListener('dblclick', onDbl);
    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerdown', onMove);
      el.removeEventListener('pointerleave', onLeave);
      el.removeEventListener('dblclick', onDbl);
      el.removeAttribute('data-sc-idle');
      window.clearTimeout(timer.current);
    };
  }, [poke, hide, toggleFull]);

  // F fullscreen, T theatre, M mute; never while the viewer is typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      const k = e.key.toLowerCase();
      if (k === 'f') toggleFull();
      else if (k === 't') toggleTheatre();
      else if (k === 'm' && hasVolume) audio.toggleMute();
      else return;
      e.preventDefault();
      poke();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hasVolume, poke, toggleFull, toggleTheatre]);

  return (
    <div className="sc" ref={root} data-shown={shown ? '1' : undefined}>
      <div
        className="sc-bar"
        ref={bar}
        role="group"
        aria-label="Player controls"
        onPointerEnter={() => {
          overBar.current = true;
          window.clearTimeout(timer.current);
        }}
        onPointerLeave={() => {
          overBar.current = false;
        }}
      >
        <div className="sc-right">
          {hasVolume && (
            <div className="sc-vol" role="group" aria-label="Volume">
              <input
                className="sc-range"
                type="range"
                min={0}
                max={100}
                value={Math.round(vol * 100)}
                onChange={(e) => audio.setVolume(Number(e.target.value) / 100)}
                aria-label="Volume"
                data-testid="volume"
                style={{ ['--sc-fill' as string]: `${Math.round(vol * 100)}%` }}
              />
              <button type="button" className="sc-btn" onClick={() => audio.toggleMute()} aria-label={snd.muted ? 'Unmute' : 'Mute'} aria-pressed={snd.muted} title={snd.muted ? 'Unmute (m)' : 'Mute (m)'} data-testid="mute">
                <VolumeIcon level={vol} />
              </button>
            </div>
          )}
          <button type="button" className="sc-btn sc-theatre" onClick={toggleTheatre} aria-label="Theatre mode" aria-pressed={theatre} title={theatre ? 'Exit theatre mode (t)' : 'Theatre mode (t)'} data-testid="theatre">
            <svg viewBox="0 0 20 20" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
              {theatre ? (
                <>
                  <rect x="4.5" y="6" width="11" height="8" rx="1" />
                  <path d="M2 3.5h16M2 16.5h16" strokeLinecap="round" />
                </>
              ) : (
                <rect x="2" y="4.5" width="16" height="11" rx="1.2" />
              )}
            </svg>
          </button>
          <button type="button" className="sc-btn" onClick={toggleFull} aria-label="Fullscreen" aria-pressed={full} title={full ? 'Exit fullscreen (f)' : 'Fullscreen (f)'} data-testid="fullscreen">
            <svg viewBox="0 0 20 20" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              {full ? <path d="M7.5 2.5v5h-5M12.5 2.5v5h5M7.5 17.5v-5h-5M12.5 17.5v-5h5" /> : <path d="M2.5 7.5v-5h5M17.5 7.5v-5h-5M2.5 12.5v5h5M17.5 12.5v5h-5" />}
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
