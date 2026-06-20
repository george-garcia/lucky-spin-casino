import { createHash, createHmac, randomBytes } from 'crypto';

/**
 * Provably-fair outcomes. For each bet we generate a fresh server seed and reveal both the seed
 * and its sha256 hash with the result, so a player can verify the outcome was committed before
 * the bet (hash(seed) matches) and that the outcome derives deterministically from it.
 */

export type Game = 'coinflip' | 'dice';
const MULTIPLIER = 1.95; // payout on a win (≈2.5% house edge)

export interface PlayResult {
  serverSeed: string;
  serverSeedHash: string;
  nonce: number;
  outcome: string;
  won: boolean;
  multiplier: number;
}

export function isValidPick(game: Game, pick: string): boolean {
  if (game === 'coinflip') return pick === 'heads' || pick === 'tails';
  if (game === 'dice') return pick === 'high' || pick === 'low';
  return false;
}

export function play(game: Game, pick: string, nonce: number): PlayResult {
  const serverSeed = randomBytes(16).toString('hex');
  const serverSeedHash = createHash('sha256').update(serverSeed).digest('hex');
  const digest = createHmac('sha256', serverSeed).update(String(nonce)).digest('hex');
  const num = parseInt(digest.slice(0, 8), 16);

  let outcome: string;
  let won: boolean;
  if (game === 'coinflip') {
    outcome = num % 2 === 0 ? 'heads' : 'tails';
    won = pick === outcome;
  } else {
    const roll = num % 100; // 0..99
    outcome = String(roll);
    won = pick === 'high' ? roll >= 50 : roll < 50;
  }
  return { serverSeed, serverSeedHash, nonce, outcome, won, multiplier: MULTIPLIER };
}

/** Winnings credited back to the wallet on a win (the stake was already debited). */
export function payout(stakeCents: number, won: boolean): number {
  return won ? Math.floor(stakeCents * MULTIPLIER) : 0;
}
