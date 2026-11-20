// Dev-only switches for design work (ignored in production builds). Each is remembered for the tab.
//   ?stage=still          stream shows a real game frame instead of the placeholder renderer
//   ?fixture=scrivener    the whole site runs on a coherent sample dataset; no runner needed
//   ?fixture=tumbletop | dating   multi-outcome, multi-window matches (see src/fixture.ts)
//   &phase=open|locked|win|…      which moment of the fixture's match to show
function flag(name: string): string | null {
  if (!import.meta.env.DEV) return null;
  const sp = new URLSearchParams(location.search);
  const q = sp.get(name);
  // A frame inside the design lab (/lab) takes its switches from its own URL only, so frames in one
  // tab do not overwrite each other's.
  if (sp.get('lab') === '1') return q;
  try {
    if (q) sessionStorage.setItem('arena.' + name, q);
    return q ?? sessionStorage.getItem('arena.' + name);
  } catch {
    return q;
  }
}

const fx = flag('fixture');
export const FIXTURE: string | null = fx && fx !== 'off' ? fx : null;
export const PHASE: string = flag('phase') ?? 'open';
export const STILL = !!FIXTURE || flag('stage') === 'still';
