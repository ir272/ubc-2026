// The building blocks of the library site's pages.
import { useMemo, type ReactNode } from 'react';
import { Frame } from '../Frame';
import { cx } from '../ink/Ink';
import { star4 } from '../ink/shapes';

export function Page({ group, title, lede, children }: { group: string; title: string; lede: ReactNode; children: ReactNode }) {
  return (
    <article className="ink-site-page">
      <header className="ink-site-head">
        <div className="ink-site-crumb">{group}</div>
        <h1>{title}</h1>
        <p className="ink-site-lede">{lede}</p>
      </header>
      {children}
    </article>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="ink-site-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function P({ children }: { children: ReactNode }) {
  return <p className="ink-site-p">{children}</p>;
}

/** A live example on the paper, inside a quiet frame. */
export function Preview({ children, column, wide }: { children: ReactNode; column?: boolean; wide?: boolean }) {
  return (
    <Frame draw={false} className={cx('ink-site-preview', column && 'ink-site-preview-col', wide && 'ink-site-preview-wide')}>
      {children}
    </Frame>
  );
}

export function Example({ title, note, children, code, column }: { title: string; note?: ReactNode; children: ReactNode; code?: string; column?: boolean }) {
  return (
    <div className="ink-site-example">
      <h3>{title}</h3>
      {note && <P>{note}</P>}
      <Preview column={column}>{children}</Preview>
      {code && <Code>{code}</Code>}
    </div>
  );
}

export function Code({ children }: { children: string }) {
  return <pre className="ink-site-code"><code>{children.trim()}</code></pre>;
}

export type PropRow = [name: string, type: string, def: string, about: string];

export function Props({ rows }: { rows: PropRow[] }) {
  return (
    <div className="ink-site-table-wrap">
      <table className="ink-site-table">
        <thead><tr><th>Prop</th><th>Type</th><th>Default</th><th>What it does</th></tr></thead>
        <tbody>
          {rows.map(([name, type, def, about]) => (
            <tr key={name}><td><code>{name}</code></td><td><code>{type}</code></td><td>{def ? <code>{def}</code> : ''}</td><td>{about}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function List({ items }: { items: ReactNode[] }) {
  return <ul className="ink-site-list">{items.map((x, i) => <li key={i}>{x}</li>)}</ul>;
}

/** The chart's star, as a small static mark. */
export function Star({ size = 12, seed = 'site' }: { size?: number; seed?: string }) {
  const d = useMemo(() => star4(10, 10, 7.4, seed), [seed]);
  return <svg className="ink-site-star" width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d={d} fill="currentColor" /></svg>;
}
