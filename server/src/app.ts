import express, { NextFunction, Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import { config } from './config';
import { bank, BankError } from './bank';
import { play, payout, isValidPick, Game } from './games';
import {
  createUser, getUserByEmail, getUserById, getBalance, adjustWallet, listLedger,
  upsertBankLink, getBankLink, recordCardCharge, getLatestCardCharge,
  countBets, recordBet, listBets, InsufficientFundsError,
} from './db';

class BadRequest extends Error {}

// ── Auth helpers ───────────────────────────────────────────────────────────
interface AuthedRequest extends Request { userId?: number; }

function setSession(res: Response, userId: number) {
  const token = jwt.sign({ sub: userId }, config.jwtSecret, { expiresIn: '7d' });
  res.cookie(config.cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = req.cookies?.[config.cookieName];
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const payload = jwt.verify(token, config.jwtSecret) as unknown as { sub: number };
    req.userId = Number(payload.sub);
    next();
  } catch {
    res.status(401).json({ error: 'Session expired' });
  }
}

const asyncHandler = (fn: (req: AuthedRequest, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req as AuthedRequest, res).catch(next);

const userView = (u: { id: number; email: string; display_name: string | null }) => ({ id: u.id, email: u.email, displayName: u.display_name });

const DECLINE_MESSAGES: Record<string, string> = {
  card_not_found: 'We couldn’t find that card.',
  card_not_active: 'That card is not active.',
  invalid_expiry: 'The expiry date is incorrect.',
  invalid_cvv: 'The security code is incorrect.',
  insufficient_funds: 'Insufficient funds in your bank account.',
};

export function createApp() {
  const app = express();
  app.use(cors({ origin: config.frontendUrl, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());

  // ── Auth ───────────────────────────────────────────────────────────────────
  const credsSchema = z.object({ email: z.string().email(), password: z.string().min(6), displayName: z.string().optional() });

  app.post('/api/auth/register', asyncHandler(async (req, res) => {
    const { email, password, displayName } = credsSchema.parse(req.body);
    if (getUserByEmail(email)) return res.status(409).json({ error: 'Email already registered' });
    const user = createUser(email, await bcrypt.hash(password, 10), displayName ?? email.split('@')[0]);
    setSession(res, user.id);
    res.json({ user: userView(user) });
  }));

  app.post('/api/auth/login', asyncHandler(async (req, res) => {
    const { email, password } = credsSchema.parse(req.body);
    const user = getUserByEmail(email);
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    setSession(res, user.id);
    res.json({ user: userView(user) });
  }));

  app.post('/api/auth/logout', (req, res) => {
    res.clearCookie(config.cookieName);
    res.json({ ok: true });
  });

  app.get('/api/me', requireAuth, asyncHandler(async (req, res) => {
    const user = getUserById(req.userId!)!;
    res.json({ user: userView(user), wallet: { balanceCents: getBalance(user.id) } });
  }));

  // ── Wallet ───────────────────────────────────────────────────────────────────
  app.get('/api/wallet', requireAuth, asyncHandler(async (req, res) => {
    res.json({ balanceCents: getBalance(req.userId!), ledger: listLedger(req.userId!) });
  }));

  // ── Fund via card swipe ────────────────────────────────────────────────────
  const cardSchema = z.object({
    pan: z.string().min(12),
    expMonth: z.string(),
    expYear: z.string(),
    cvv: z.string().min(3).max(4),
    amountCents: z.number().int().min(100),
  });

  app.post('/api/fund/card', requireAuth, asyncHandler(async (req, res) => {
    const input = cardSchema.parse(req.body);
    const pan = input.pan.replace(/\s+/g, '');

    const auth = await bank.authorizeCard({ number: pan, expMonth: input.expMonth, expYear: input.expYear, cvv: input.cvv, amountCents: input.amountCents });
    if (!auth.approved) {
      return res.status(402).json({ error: DECLINE_MESSAGES[auth.declineReason ?? ''] ?? 'Your card was declined.' });
    }

    // Capture the authorization (settle the purchase). If capture fails, void to free the hold.
    try {
      await bank.captureAuthorization(auth.id, input.amountCents);
    } catch (e) {
      await bank.voidAuthorization(auth.id).catch(() => {});
      throw e;
    }

    recordCardCharge(req.userId!, auth.id, auth.last4 ?? pan.slice(-4), input.amountCents);
    const balanceCents = adjustWallet(req.userId!, input.amountCents, 'deposit_card', `card:${auth.id}`);
    res.json({ balanceCents, last4: auth.last4 ?? pan.slice(-4) });
  }));

  // ── Connect: link a bank account ──────────────────────────────────────────────
  app.post('/api/connect/link-token', requireAuth, asyncHandler(async (_req, res) => {
    const { link_token } = await bank.createLinkSession();
    res.json({ link_token });
  }));

  app.post('/api/connect/exchange', requireAuth, asyncHandler(async (req, res) => {
    const { public_token } = z.object({ public_token: z.string() }).parse(req.body);
    const result = await bank.exchangeToken(public_token);
    const acct = result.accounts[0];
    upsertBankLink(req.userId!, result.access_token, acct?.mask ?? null, acct?.type ?? null);
    res.json({ account: acct ? { mask: acct.mask, type: acct.type, balance: acct.balance } : null });
  }));

  app.get('/api/connect/status', requireAuth, asyncHandler(async (req, res) => {
    const link = getBankLink(req.userId!);
    if (!link) return res.json({ linked: false });
    let balance: string | undefined;
    try {
      const r: any = await bank.connectAccounts(link.access_token);
      balance = r?.accounts?.[0]?.available ?? r?.accounts?.[0]?.balance;
    } catch { /* token may be stale; still report linked */ }
    res.json({ linked: true, account: { mask: link.account_mask, type: link.account_type, balance } });
  }));

  // ── Fund via Connect (ACH pull) ─────────────────────────────────────────────
  app.post('/api/fund/connect', requireAuth, asyncHandler(async (req, res) => {
    const { amountCents } = z.object({ amountCents: z.number().int().min(100) }).parse(req.body);
    const link = getBankLink(req.userId!);
    if (!link) return res.status(400).json({ error: 'No linked bank account. Connect one first.' });

    const transfer: any = await bank.connectTransfer(link.access_token, {
      amountCents, direction: 'debit', idempotencyKey: randomBytes(8).toString('hex'),
    });
    const balanceCents = adjustWallet(req.userId!, amountCents, 'deposit_connect', `connect:${transfer.id}`);
    res.json({ balanceCents });
  }));

  // ── Cash out back to the bank ────────────────────────────────────────────────
  app.post('/api/cashout', requireAuth, asyncHandler(async (req, res) => {
    const { amountCents, method } = z.object({
      amountCents: z.number().int().min(100),
      method: z.enum(['connect', 'card']),
    }).parse(req.body);

    // Debit chips first so we never pay out money the player doesn't have.
    const balanceCents = adjustWallet(req.userId!, -amountCents, 'cashout', method);
    try {
      if (method === 'connect') {
        const link = getBankLink(req.userId!);
        if (!link) throw new BadRequest('No linked bank account to cash out to.');
        await bank.connectTransfer(link.access_token, { amountCents, direction: 'credit', idempotencyKey: randomBytes(8).toString('hex') });
      } else {
        const charge = getLatestCardCharge(req.userId!);
        if (!charge) throw new BadRequest('No card on file to refund to.');
        await bank.refund(charge.auth_token, amountCents);
      }
    } catch (e) {
      // Bank push failed — give the chips back so the wallet stays consistent.
      adjustWallet(req.userId!, amountCents, 'cashout_reversed', method);
      throw e;
    }
    res.json({ balanceCents });
  }));

  // ── Play ──────────────────────────────────────────────────────────────────────
  app.post('/api/play', requireAuth, asyncHandler(async (req, res) => {
    const { game, stakeCents, pick } = z.object({
      game: z.enum(['coinflip', 'dice']),
      stakeCents: z.number().int().min(100),
      pick: z.string(),
    }).parse(req.body);

    if (!isValidPick(game as Game, pick)) return res.status(400).json({ error: 'Invalid pick for this game.' });

    // Debit the stake (fails if the player can't cover it).
    let balanceCents = adjustWallet(req.userId!, -stakeCents, 'bet', game);
    const nonce = countBets(req.userId!) + 1;
    const result = play(game as Game, pick, nonce);
    const payoutCents = payout(stakeCents, result.won);
    if (payoutCents > 0) balanceCents = adjustWallet(req.userId!, payoutCents, 'win', game);

    recordBet({
      userId: req.userId!, game, stakeCents, pick, outcome: result.outcome, won: result.won, payoutCents,
      serverSeed: result.serverSeed, serverSeedHash: result.serverSeedHash, nonce,
    });
    res.json({
      won: result.won,
      outcome: result.outcome,
      payoutCents,
      balanceCents,
      fairness: { serverSeed: result.serverSeed, serverSeedHash: result.serverSeedHash, nonce, multiplier: result.multiplier },
    });
  }));

  app.get('/api/bets', requireAuth, asyncHandler(async (req, res) => {
    res.json({ bets: listBets(req.userId!) });
  }));

  // ── Error handling ──────────────────────────────────────────────────────────
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof BadRequest) return res.status(400).json({ error: err.message });
    if (err instanceof InsufficientFundsError) return res.status(400).json({ error: err.message });
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Invalid request', details: err.issues });
    if (err instanceof BankError) {
      // 4xx from the bank is the user's fault (declined/insufficient); 5xx is an outage.
      const status = err.status >= 400 && err.status < 500 ? 400 : 502;
      return res.status(status).json({ error: err.message });
    }
    // eslint-disable-next-line no-console
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  });

  return app;
}
