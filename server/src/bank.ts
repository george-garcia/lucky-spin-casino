import { config } from './config';

/**
 * Thin HTTP client for the Mock Bank's partner APIs. This is the ONLY way the casino touches the
 * bank — there is no shared database. Server-to-server calls authenticate with our secret partner
 * API key; Connect data/transfer calls use a per-user access token obtained via the Connect flow.
 *
 * The bank wraps every response as { success, data, message }; we return the inner `data`.
 */

export class BankError extends Error {
  constructor(message: string, public status: number, public body?: unknown) {
    super(message);
    this.name = 'BankError';
  }
}

async function bankFetch<T = any>(
  path: string,
  opts: { method?: string; body?: unknown; authToken?: string } = {},
): Promise<T> {
  const auth = opts.authToken ?? config.bank.partnerKey;
  const res = await fetch(`${config.bank.apiUrl}${path}`, {
    method: opts.method ?? 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  const json: any = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = json?.message || json?.error || `Bank API error ${res.status}`;
    throw new BankError(Array.isArray(msg) ? msg.join(', ') : msg, res.status, json);
  }
  return (json?.data ?? json) as T;
}

// ── Card acceptance ("Network") — server-to-server with the partner key ───────
export interface AuthorizeResult {
  id: string; approved: boolean; last4?: string; authCode?: string; declineReason?: string; amount?: string;
}

export const bank = {
  authorizeCard(input: {
    number: string; expMonth: string; expYear: string; cvv: string; amountCents: number;
  }): Promise<AuthorizeResult> {
    return bankFetch('/network/authorizations', {
      method: 'POST',
      body: {
        card: { number: input.number, expMonth: input.expMonth, expYear: input.expYear, cvv: input.cvv },
        amount: input.amountCents,
        currency: 'USD',
        merchant: { name: config.merchant.name, mcc: config.merchant.mcc, city: config.merchant.city },
      },
    });
  },

  captureAuthorization(token: string, amountCents?: number) {
    return bankFetch(`/network/authorizations/${token}/capture`, {
      method: 'POST',
      body: amountCents !== undefined ? { amount: amountCents } : {},
    });
  },

  voidAuthorization(token: string) {
    return bankFetch(`/network/authorizations/${token}/void`, { method: 'POST', body: {} });
  },

  refund(authorizationToken: string, amountCents: number) {
    return bankFetch('/network/refunds', { method: 'POST', body: { authorizationToken, amount: amountCents } });
  },

  // ── Connect — link sessions & token exchange use the partner key ─────────────
  createLinkSession(scopes = 'balances,transfers'): Promise<{ link_token: string; hosted_url: string }> {
    return bankFetch('/connect/link-sessions', { method: 'POST', body: { scopes } });
  },

  exchangeToken(publicToken: string): Promise<{ access_token: string; accounts: Array<{ id: number; type: string; mask: string; balance: string; available: string }> }> {
    return bankFetch('/connect/token', { method: 'POST', body: { public_token: publicToken } });
  },

  // ── Connect — balances & transfers use the user's access token ───────────────
  connectAccounts(accessToken: string) {
    return bankFetch('/connect/accounts', { authToken: accessToken });
  },

  connectTransfer(accessToken: string, input: { amountCents: number; direction: 'debit' | 'credit'; idempotencyKey?: string; description?: string }) {
    return bankFetch('/connect/transfers', {
      method: 'POST',
      authToken: accessToken,
      body: { amount: input.amountCents, direction: input.direction, idempotencyKey: input.idempotencyKey, description: input.description },
    });
  },
};
