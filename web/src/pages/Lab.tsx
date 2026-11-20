// Design lab (/lab, dev only): the real site, side by side, each column in a different look.
// Every column is a frame of the actual page (live data from the runner, a still picture where the
// game would be). A look comes either from a measured reference site or from any picture: click
// one in the shelf, paste one (Cmd+V), or drop a file, and the selected column takes its colours.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_LOOK, LOOK_KEYS, OPTIONS, REFERENCES, cleanLook, lookQuery, sameLook, saveLook, savedLook, type Look, type LookKey } from '../themes/look';
import { extract, hex, loadImage, packRoles, unpackRoles, type RGB } from '../lib/palette';
import { LAB_REFS } from '../lab-refs';
import '../lab.css';

interface Col {
  id: number;
  look: Look;
}
interface State {
  page: string;
  width: number;
  cols: Col[];
}

const PAGES: { id: string; label: string; path: string; extra?: string }[] = [
  { id: 'home', label: 'Home', path: '/' },
  { id: 'tumbletop', label: 'Channel: Tumbletop (live bets)', path: '/c/tumbletop' },
  { id: 'scrivener', label: 'Channel: The Scrivener (live bets)', path: '/c/scrivener' },
  { id: 'brawl', label: 'Channel: Ringout (live bets)', path: '/c/brawl' },
  { id: 'fx-open', label: 'Sample: 16-way bet open', path: '/c/tumbletop', extra: 'fixture=tumbletop&phase=open' },
  { id: 'fx-win', label: 'Sample: result paid', path: '/c/tumbletop', extra: 'fixture=tumbletop&phase=win' },
  { id: 'fx-duel', label: 'Sample: two-way bet open', path: '/c/scrivener', extra: 'fixture=scrivener&phase=open' },
];
const WIDTHS = [
  { w: 1440, h: 880, label: 'Desktop 1440' },
  { w: 1200, h: 800, label: 'Laptop 1200' },
  { w: 390, h: 800, label: 'Phone 390' },
];
const SITES = Object.keys(REFERENCES).filter((k) => k !== 'custom');

const KEY = 'arena.lab.v3';
let nextId = 1;
const col = (look: Look): Col => ({ id: nextId++, look });
function load(): State {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { page?: string; width?: number; looks?: Partial<Look>[] } | null;
    if (raw?.looks?.length) {
      return { page: PAGES.some((p) => p.id === raw.page) ? raw.page! : 'home', width: WIDTHS.some((x) => x.w === raw.width) ? raw.width! : 1440, cols: raw.looks.slice(0, 4).map((l) => col(cleanLook(l))) };
    }
  } catch {
    /* ignore */
  }
  return { page: 'home', width: 1440, cols: SITES.slice(0, 3).map((id) => col({ ...DEFAULT_LOOK, pal: id })) };
}

function Frame({ look, base, w, h }: { look: Look; base: string; w: number; h: number }) {
  const wrap = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [scale, setScale] = useState(0.3);
  useLayoutEffect(() => {
    const el = wrap.current!;
    const fit = () => setScale(Math.min(1, el.clientWidth / w));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [w]);
  // The frame loads once per page with the look of that moment in its URL; later changes are posted
  // to it, so switching an option restyles the frame without reloading it.
  const latest = useRef(look);
  latest.current = look;
  const src = useMemo(() => `${base}&${lookQuery(latest.current)}`, [base]);
  const post = () => frame.current?.contentWindow?.postMessage({ type: 'arena-look', look: latest.current }, location.origin);
  useEffect(post, [look]);
  return (
    <div className="lab-view" ref={wrap} style={{ height: h * scale }}>
      <iframe key={base} ref={frame} title="preview" src={src} style={{ width: w, height: h, transform: `scale(${scale})` }} onLoad={post} />
    </div>
  );
}

const ROLE_NAMES = ['Ground', 'Text', 'Action', 'Second', 'Third'];

export function Lab() {
  const [s, setS] = useState<State>(load);
  const [active, setActive] = useState<number>(() => s.cols[0]!.id);
  const [site, setSite] = useState<Look>(() => savedLook() ?? DEFAULT_LOOK);
  const [msg, setMsg] = useState('');
  const [shown, setShown] = useState(48);
  useEffect(() => {
    document.title = 'Design lab';
    document.documentElement.classList.add('lab-root');
    return () => document.documentElement.classList.remove('lab-root');
  }, []);
  useEffect(() => {
    try {
      // a pasted picture lives only in this tab, so its address is not saved; its colours are
      localStorage.setItem(KEY, JSON.stringify({ page: s.page, width: s.width, looks: s.cols.map((c) => ({ ...c.look, src: c.look.src?.startsWith('https://') ? c.look.src : undefined })) }));
    } catch {
      /* ignore */
    }
  }, [s]);

  const page = PAGES.find((p) => p.id === s.page) ?? PAGES[0]!;
  const dim = WIDTHS.find((x) => x.w === s.width) ?? WIDTHS[0]!;
  const base = `${page.path}?lab=1&stage=still${page.extra ? `&${page.extra}` : ''}`;
  const activeId = s.cols.some((c) => c.id === active) ? active : s.cols[0]!.id;
  const setLook = (id: number, look: Look) => setS((p) => ({ ...p, cols: p.cols.map((c) => (c.id === id ? { ...c, look } : c)) }));
  const set = (id: number, k: LookKey, v: string) => {
    setS((p) => ({
      ...p,
      cols: p.cols.map((c) => {
        if (c.id !== id) return c;
        // "From a picture" needs a picture first
        if (k === 'pal' && v === 'custom') return c.look.c ? { ...c, look: { ...c.look, pal: 'custom' } } : c;
        return { ...c, look: { ...c.look, [k]: v } };
      }),
    }));
    if (k === 'pal' && v === 'custom') setMsg('Click a picture below, paste one (Cmd+V) or drop a file to take its colours.');
  };

  /** Read a picture's colours and give them to a column. */
  const takePicture = useCallback(async (src: string, id: number) => {
    try {
      const img = await loadImage(src);
      const { roles } = extract(img);
      setS((p) => ({ ...p, cols: p.cols.map((c) => (c.id === id ? { ...c, look: { ...c.look, pal: 'custom', accent: 'own', c: packRoles(roles), src } } : c)) }));
      setMsg('');
    } catch {
      setMsg('That picture could not be read. Try saving it and dropping the file here.');
    }
  }, []);
  const takeFile = useCallback(
    (f: File | null | undefined, id: number) => {
      if (f && f.type.startsWith('image/')) void takePicture(URL.createObjectURL(f), id);
    },
    [takePicture],
  );
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const f = [...(e.clipboardData?.files ?? [])].find((x) => x.type.startsWith('image/'));
      if (f) {
        e.preventDefault();
        takeFile(f, activeId);
        return;
      }
      const t = e.clipboardData?.getData('text')?.trim();
      if (t && /^https:\/\/\S+\.(png|jpe?g|webp|avif|gif)(\?\S*)?$/i.test(t)) void takePicture(t, activeId);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [activeId, takeFile, takePicture]);

  /** Swap two role colours (for example when the wrong colour was read as the action colour). */
  const swapRole = (c: Col, a: number, b: number) => {
    const roles = unpackRoles(c.look.c);
    if (!roles) return;
    [roles[a], roles[b]] = [roles[b]!, roles[a]!];
    setLook(c.id, { ...c.look, c: packRoles(roles as RGB[]) });
  };

  return (
    <div
      className="lab"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        takeFile(e.dataTransfer.files[0], activeId);
      }}
    >
      <header className="lab-bar">
        <strong>Design lab</strong>
        <label>
          Page
          <select value={s.page} onChange={(e) => setS((p) => ({ ...p, page: e.target.value }))}>
            {PAGES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Size
          <select value={s.width} onChange={(e) => setS((p) => ({ ...p, width: Number(e.target.value) }))}>
            {WIDTHS.map((x) => (
              <option key={x.w} value={x.w}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={s.cols.length >= 4}
          onClick={() => {
            const c = col(s.cols[s.cols.length - 1]?.look ?? DEFAULT_LOOK);
            setS((p) => ({ ...p, cols: [...p.cols, c] }));
            setActive(c.id);
          }}
        >
          Add column
        </button>
        {msg && <span className="lab-msg">{msg}</span>}
        <span className="lab-site">
          <button
            type="button"
            onClick={() => {
              saveLook(null);
              setSite(DEFAULT_LOOK);
            }}
          >
            Reset site look
          </button>
          <a href="/?theme=look" target="_blank" rel="noreferrer">
            Open site
          </a>
        </span>
      </header>

      <div className="lab-cols" style={{ gridTemplateColumns: `repeat(${s.cols.length}, minmax(0, 1fr))` }}>
        {s.cols.map((c, i) => {
          const roles = c.look.pal === 'custom' ? unpackRoles(c.look.c) : null;
          return (
            <section key={c.id} className={`lab-col ${c.id === activeId ? 'active' : ''}`} onPointerDown={() => setActive(c.id)}>
              <div className="lab-ctl">
                <div className="lab-row">
                  <span className="lab-num">{i + 1}</span>
                  {c.look.pal === 'custom' && c.look.src && <img className="lab-src" src={c.look.src} alt="" />}
                  {roles && (
                    <span className="lab-sw">
                      {roles.map((r, j) => (
                        <button
                          key={j}
                          type="button"
                          style={{ background: hex(r) }}
                          title={`${ROLE_NAMES[j]} ${hex(r)}${j > 2 ? '. Click to use as the action colour.' : j === 1 ? '. Click to swap with the ground.' : ''}`}
                          onClick={() => (j > 2 ? swapRole(c, 2, j) : j === 1 ? swapRole(c, 0, 1) : undefined)}
                        />
                      ))}
                    </span>
                  )}
                  <button
                    type="button"
                    className={sameLook(site, c.look) ? 'on' : ''}
                    onClick={() => {
                      saveLook(c.look);
                      setSite(c.look);
                    }}
                  >
                    {sameLook(site, c.look) ? 'In use on the site' : 'Use for the site'}
                  </button>
                  <a href={`${page.path}?theme=look&${lookQuery(c.look)}`} target="_blank" rel="noreferrer">
                    Full size
                  </a>
                  {s.cols.length > 1 && (
                    <button type="button" onClick={() => setS((p) => ({ ...p, cols: p.cols.filter((x) => x.id !== c.id) }))}>
                      Remove
                    </button>
                  )}
                </div>
                <div className="lab-opts">
                  {LOOK_KEYS.map((k) => (
                    <label key={k}>
                      {OPTIONS[k].label}
                      <select value={c.look[k]} onChange={(e) => set(c.id, k, e.target.value)}>
                        {Object.entries(OPTIONS[k].items).map(([id, o]) => (
                          <option key={id} value={id}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                <p className="lab-note">{REFERENCES[c.look.pal]!.note}</p>
              </div>
              <Frame look={c.look} base={base} w={dim.w} h={dim.h} />
            </section>
          );
        })}
      </div>

      <section className="lab-shelf">
        <div className="lab-shelf-h">
          <strong>Reference pictures</strong>
          <span>
            Click one to give its colours to column {s.cols.findIndex((c) => c.id === activeId) + 1}. Or copy any picture anywhere and press Cmd+V here, or drop a file. From{' '}
            <a href="https://bestdesignsonx.com/" target="_blank" rel="noreferrer">
              bestdesignsonx.com
            </a>
            ; each belongs to the designer who posted it.
          </span>
        </div>
        <div className="lab-grid">
          {LAB_REFS.slice(0, shown).map((u) => (
            <button key={u} type="button" className={s.cols.some((c) => c.look.src === u) ? 'used' : ''} onClick={() => void takePicture(u, activeId)}>
              <img src={u} alt="" loading="lazy" decoding="async" />
            </button>
          ))}
        </div>
        {shown < LAB_REFS.length && (
          <button type="button" className="lab-more" onClick={() => setShown((n) => n + 48)}>
            Show more ({LAB_REFS.length - shown} left)
          </button>
        )}
      </section>
    </div>
  );
}
