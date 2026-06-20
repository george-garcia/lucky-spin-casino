import Database from 'better-sqlite3';
import { resolve } from 'path';

/**
 * The casino's own SQLite database — completely separate from the bank. It holds casino users,
 * their chip wallet, links to their bank account (Connect grants), and bet history. It never
 * references the bank's database; all bank interaction is over HTTP via bank.ts.
 */
const dbPath = process.env.CASINO_DB_PATH || resolve(process.cwd(), 'casino.db');
export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS wallets (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    balance_cents INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS wallet_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,                 -- deposit_card | deposit_connect | bet | win | cashout
    amount_cents INTEGER NOT NULL,      -- signed: + credit, - debit
    balance_after INTEGER NOT NULL,
    ref TEXT,
    created_at TEXT NOT NULL
  );

  -- A linked bank account via Connect. The access token is OUR secret to act on that account.
  CREATE TABLE IF NOT EXISTS bank_links (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    access_token TEXT NOT NULL,
    account_mask TEXT,
    account_type TEXT,
    linked_at TEXT NOT NULL
  );

  -- Card charges we made against a bank card (for cash-out-via-refund and history).
  CREATE TABLE IF NOT EXISTS card_charges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    auth_token TEXT NOT NULL,
    last4 TEXT,
    amount_cents INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS bets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    game TEXT NOT NULL,
    stake_cents INTEGER NOT NULL,
    pick TEXT NOT NULL,
    outcome TEXT NOT NULL,
    won INTEGER NOT NULL,               -- 0 | 1
    payout_cents INTEGER NOT NULL,
    server_seed TEXT NOT NULL,
    server_seed_hash TEXT NOT NULL,
    nonce INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );
`);

const now = () => new Date().toISOString();

export class InsufficientFundsError extends Error {
  constructor() {
    super('Insufficient chip balance');
    this.name = 'InsufficientFundsError';
  }
}

// ── Users ────────────────────────────────────────────────────────────────────
export interface UserRow { id: number; email: string; password_hash: string; display_name: string | null; created_at: string; }

export function createUser(email: string, passwordHash: string, displayName: string): UserRow {
  const tx = db.transaction(() => {
    const info = db
      .prepare('INSERT INTO users (email, password_hash, display_name, created_at) VALUES (?, ?, ?, ?)')
      .run(email, passwordHash, displayName, now());
    const userId = Number(info.lastInsertRowid);
    db.prepare('INSERT INTO wallets (user_id, balance_cents) VALUES (?, 0)').run(userId);
    return userId;
  });
  const id = tx();
  return getUserById(id)!;
}

export function getUserByEmail(email: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;
}

export function getUserById(id: number): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
}

// ── Wallet ───────────────────────────────────────────────────────────────────
export function getBalance(userId: number): number {
  const row = db.prepare('SELECT balance_cents FROM wallets WHERE user_id = ?').get(userId) as { balance_cents: number } | undefined;
  return row?.balance_cents ?? 0;
}

/** Apply a signed change to the wallet atomically and append a ledger row. Returns new balance. */
export const adjustWallet = db.transaction((userId: number, deltaCents: number, type: string, ref?: string): number => {
  const current = (db.prepare('SELECT balance_cents FROM wallets WHERE user_id = ?').get(userId) as { balance_cents: number }).balance_cents;
  const next = current + deltaCents;
  if (next < 0) throw new InsufficientFundsError();
  db.prepare('UPDATE wallets SET balance_cents = ? WHERE user_id = ?').run(next, userId);
  db.prepare('INSERT INTO wallet_ledger (user_id, type, amount_cents, balance_after, ref, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(userId, type, deltaCents, next, ref ?? null, now());
  return next;
});

export function listLedger(userId: number, limit = 50) {
  return db.prepare('SELECT id, type, amount_cents, balance_after, ref, created_at FROM wallet_ledger WHERE user_id = ? ORDER BY id DESC LIMIT ?').all(userId, limit);
}

// ── Bank links (Connect) ─────────────────────────────────────────────────────
export function upsertBankLink(userId: number, accessToken: string, mask: string | null, type: string | null) {
  db.prepare(`
    INSERT INTO bank_links (user_id, access_token, account_mask, account_type, linked_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET access_token = excluded.access_token, account_mask = excluded.account_mask, account_type = excluded.account_type, linked_at = excluded.linked_at
  `).run(userId, accessToken, mask, type, now());
}

export interface BankLinkRow { user_id: number; access_token: string; account_mask: string | null; account_type: string | null; linked_at: string; }
export function getBankLink(userId: number): BankLinkRow | undefined {
  return db.prepare('SELECT * FROM bank_links WHERE user_id = ?').get(userId) as BankLinkRow | undefined;
}

// ── Card charges ─────────────────────────────────────────────────────────────
export function recordCardCharge(userId: number, authToken: string, last4: string, amountCents: number) {
  db.prepare('INSERT INTO card_charges (user_id, auth_token, last4, amount_cents, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(userId, authToken, last4, amountCents, now());
}
export function getLatestCardCharge(userId: number) {
  return db.prepare('SELECT * FROM card_charges WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(userId) as
    | { id: number; auth_token: string; last4: string; amount_cents: number }
    | undefined;
}

// ── Bets ─────────────────────────────────────────────────────────────────────
export function countBets(userId: number): number {
  return (db.prepare('SELECT COUNT(*) AS c FROM bets WHERE user_id = ?').get(userId) as { c: number }).c;
}
export function recordBet(b: {
  userId: number; game: string; stakeCents: number; pick: string; outcome: string; won: boolean;
  payoutCents: number; serverSeed: string; serverSeedHash: string; nonce: number;
}) {
  const info = db.prepare(`
    INSERT INTO bets (user_id, game, stake_cents, pick, outcome, won, payout_cents, server_seed, server_seed_hash, nonce, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(b.userId, b.game, b.stakeCents, b.pick, b.outcome, b.won ? 1 : 0, b.payoutCents, b.serverSeed, b.serverSeedHash, b.nonce, now());
  return Number(info.lastInsertRowid);
}
export function listBets(userId: number, limit = 25) {
  return db.prepare('SELECT id, game, stake_cents, pick, outcome, won, payout_cents, server_seed, server_seed_hash, nonce, created_at FROM bets WHERE user_id = ? ORDER BY id DESC LIMIT ?').all(userId, limit);
}
