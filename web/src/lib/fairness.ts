/**
 * Client-side provably-fair verification. Recomputes, in the browser, exactly what the server did:
 *   serverSeedHash === sha256(serverSeed)                       (the seed was committed up front)
 *   outcome        === derive(HMAC_SHA256(serverSeed, nonce))    (the result follows from the seed)
 * so a visitor can confirm a bet was fair without trusting us. Mirrors server/src/games.ts.
 */

type Game = 'coinflip' | 'dice';

const toHex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export interface FairnessCheck {
  hashOk: boolean; // sha256(serverSeed) matches the committed hash
  outcomeOk: boolean; // HMAC-derived outcome matches the reported outcome
  computedHash: string;
  derivedOutcome: string;
}

export async function verifyFairness(
  game: Game,
  serverSeed: string,
  serverSeedHash: string,
  nonce: number,
  outcome: string,
): Promise<FairnessCheck> {
  const enc = new TextEncoder();

  const hashBuf = await crypto.subtle.digest('SHA-256', enc.encode(serverSeed));
  const computedHash = toHex(hashBuf);

  const key = await crypto.subtle.importKey('raw', enc.encode(serverSeed), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(String(nonce)));
  const num = parseInt(toHex(sig).slice(0, 8), 16);

  const derivedOutcome = game === 'coinflip' ? (num % 2 === 0 ? 'heads' : 'tails') : String(num % 100);

  return {
    hashOk: computedHash === serverSeedHash,
    outcomeOk: derivedOutcome === outcome,
    computedHash,
    derivedOutcome,
  };
}
