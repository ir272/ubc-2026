const raw = (import.meta.env.VITE_RUNNER_URL as string | undefined) || 'http://localhost:8787';
export const RUNNER_URL = raw.replace(/\/+$/, '');
export const WS_URL = RUNNER_URL.replace(/^http/, 'ws');
export const SOLANA_RPC = (import.meta.env.VITE_SOLANA_RPC as string | undefined) || '';
