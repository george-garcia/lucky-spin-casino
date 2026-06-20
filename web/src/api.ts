// Tiny fetch wrapper. Same-origin in dev (Vite proxies /api → casino backend on :4100),
// so cookies (our session) ride along with credentials: 'include'.

const BASE = '/api';

async function req<T = any>(path: string, opts?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: opts?.method ?? 'GET',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: opts?.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error || `Request failed (${res.status})`);
  return json as T;
}

export interface User { id: number; email: string; displayName: string | null; }
export interface LedgerEntry { id: number; type: string; amount_cents: number; balance_after: number; ref: string | null; created_at: string; }
export interface Bet { id: number; game: string; stake_cents: number; pick: string; outcome: string; won: number; payout_cents: number; server_seed: string; server_seed_hash: string; nonce: number; created_at: string; }

export const api = {
  register: (b: { email: string; password: string; displayName?: string }) => req<{ user: User }>('/auth/register', { method: 'POST', body: b }),
  login: (b: { email: string; password: string }) => req<{ user: User }>('/auth/login', { method: 'POST', body: b }),
  logout: () => req('/auth/logout', { method: 'POST' }),
  me: () => req<{ user: User; wallet: { balanceCents: number } }>('/me'),
  wallet: () => req<{ balanceCents: number; ledger: LedgerEntry[] }>('/wallet'),

  fundCard: (b: { pan: string; expMonth: string; expYear: string; cvv: string; amountCents: number }) =>
    req<{ balanceCents: number; last4: string }>('/fund/card', { method: 'POST', body: b }),

  linkToken: () => req<{ link_token: string }>('/connect/link-token', { method: 'POST' }),
  connectExchange: (public_token: string) => req<{ account: { mask: string; type: string; balance: string } | null }>('/connect/exchange', { method: 'POST', body: { public_token } }),
  connectStatus: () => req<{ linked: boolean; account?: { mask: string | null; type: string | null; balance?: string } }>('/connect/status'),
  fundConnect: (amountCents: number) => req<{ balanceCents: number }>('/fund/connect', { method: 'POST', body: { amountCents } }),

  cashout: (amountCents: number, method: 'connect' | 'card') => req<{ balanceCents: number }>('/cashout', { method: 'POST', body: { amountCents, method } }),

  play: (b: { game: 'coinflip' | 'dice'; stakeCents: number; pick: string }) =>
    req<{ won: boolean; outcome: string; payoutCents: number; balanceCents: number; fairness: { serverSeed: string; serverSeedHash: string; nonce: number; multiplier: number } }>('/play', { method: 'POST', body: b }),

  bets: () => req<{ bets: Bet[] }>('/bets'),
};

export const BANK_WEB_URL = (import.meta as any).env?.VITE_BANK_WEB_URL || 'http://localhost:5173';

export const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;
