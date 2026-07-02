import bcrypt from 'bcryptjs';
import { randomUUID, createHash } from 'crypto';
import { getUserByEmail, createUser, adjustWallet, recordBet, getBalance } from './db';

/**
 * Idempotent demo seed, run at startup. Ensures `recruiter@demo.com` exists with a funded chip
 * wallet and a short play history, so a recruiter signing in lands on a populated account. If the
 * user already exists it does nothing.
 */
export const DEMO_EMAIL = 'recruiter@demo.com';
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'RecruiterDemo!2026';

export async function seedDemoUser(): Promise<void> {
  if (getUserByEmail(DEMO_EMAIL)) return;

  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const user = createUser(DEMO_EMAIL, hash, 'Riley Recruiter');

  // Fund the wallet with a $500 card deposit.
  adjustWallet(user.id, 50000, 'deposit_card', 'demo-seed');

  // A short, valid play history (coinflip: heads/tails, dice: high/low) with wins and losses.
  // Dice outcomes are the roll (0–99), matching the live game: high = 50–99, low = 0–49.
  const plays = [
    { game: 'coinflip', stake: 2000, pick: 'heads', outcome: 'heads', won: true, payout: 3900 },
    { game: 'coinflip', stake: 2000, pick: 'tails', outcome: 'heads', won: false, payout: 0 },
    { game: 'dice', stake: 1000, pick: 'high', outcome: '75', won: true, payout: 1950 },
    { game: 'dice', stake: 1500, pick: 'low', outcome: '82', won: false, payout: 0 },
    { game: 'coinflip', stake: 2500, pick: 'heads', outcome: 'heads', won: true, payout: 4875 },
  ];
  plays.forEach((p, i) => {
    adjustWallet(user.id, -p.stake, 'bet', p.game);
    if (p.won) adjustWallet(user.id, p.payout, 'win', p.game);
    const serverSeed = randomUUID();
    recordBet({
      userId: user.id,
      game: p.game,
      stakeCents: p.stake,
      pick: p.pick,
      outcome: p.outcome,
      won: p.won,
      payoutCents: p.payout,
      serverSeed,
      serverSeedHash: createHash('sha256').update(serverSeed).digest('hex'),
      nonce: i + 1,
    });
  });

  console.log(`[casino] seeded demo user ${DEMO_EMAIL} (balance $${(getBalance(user.id) / 100).toFixed(2)})`);
}
