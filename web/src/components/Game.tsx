import { useState } from 'react';
import { api, fmt } from '../api';
import { verifyFairness, FairnessCheck } from '../lib/fairness';

type Game = 'coinflip' | 'dice';

interface LastResult {
  game: Game;
  won: boolean;
  outcome: string;
  payoutCents: number;
  stakeCents: number;
  fairness: { serverSeed: string; serverSeedHash: string; nonce: number };
}

/** "Rolled 82 · High" / "Heads" — a human-readable outcome. */
function outcomeLabel(r: LastResult): string {
  if (r.game === 'coinflip') return r.outcome === 'heads' ? 'Heads' : 'Tails';
  const roll = Number(r.outcome);
  return `Rolled ${roll} · ${roll >= 50 ? 'High' : 'Low'}`;
}

export function GamePanel({ balanceCents, onResult }: { balanceCents: number; onResult: (balanceCents: number) => void }) {
  const [game, setGame] = useState<Game>('coinflip');
  const [stake, setStake] = useState('5.00');
  const [pick, setPick] = useState<string>('heads');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [last, setLast] = useState<LastResult | null>(null);
  const [verify, setVerify] = useState<FairnessCheck | null>(null);
  const [verifying, setVerifying] = useState(false);

  const picks = game === 'coinflip'
    ? [{ id: 'heads', label: 'Heads' }, { id: 'tails', label: 'Tails' }]
    : [{ id: 'low', label: 'Low · 0–49' }, { id: 'high', label: 'High · 50–99' }];

  function switchGame(g: Game) {
    setGame(g);
    setPick(g === 'coinflip' ? 'heads' : 'low');
    setLast(null);
    setVerify(null);
  }

  async function spin() {
    setBusy(true);
    setError('');
    setVerify(null);
    try {
      const stakeCents = Math.round(parseFloat(stake || '0') * 100);
      // Let the flip/roll animation breathe before revealing the result.
      const [r] = await Promise.all([
        api.play({ game, stakeCents, pick }),
        new Promise((res) => setTimeout(res, 650)),
      ]);
      onResult(r.balanceCents);
      setLast({ game, won: r.won, outcome: r.outcome, payoutCents: r.payoutCents, stakeCents, fairness: r.fairness });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function runVerify() {
    if (!last) return;
    setVerifying(true);
    try {
      const check = await verifyFairness(last.game, last.fairness.serverSeed, last.fairness.serverSeedHash, last.fairness.nonce, last.outcome);
      setVerify(check);
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="panel p-6">
      <div className="flex gap-2 mb-6 p-1 bg-black/30 rounded-xl w-full max-w-xs">
        <button className={`tab ${game === 'coinflip' ? 'bg-gold text-black' : 'text-white/60'}`} onClick={() => switchGame('coinflip')}>🪙 Coin flip</button>
        <button className={`tab ${game === 'dice' ? 'bg-gold text-black' : 'text-white/60'}`} onClick={() => switchGame('dice')}>🎲 Dice</button>
      </div>

      {/* Result display */}
      <div className="rounded-2xl bg-black/30 border border-white/5 h-44 flex flex-col items-center justify-center mb-6 overflow-hidden">
        {busy ? (
          <div className={`text-5xl ${game === 'coinflip' ? 'coin-spin' : 'dice-roll'}`}>
            {game === 'coinflip' ? '🪙' : '🎲'}
          </div>
        ) : last ? (
          <div key={last.fairness.nonce} className="flex flex-col items-center result-pop">
            <div className="text-5xl mb-2">
              {last.game === 'coinflip' ? (last.outcome === 'heads' ? '🙂' : '🦅') : '🎲'}
            </div>
            <p className="text-white/70">{outcomeLabel(last)}</p>
            <p className={`text-2xl font-display mt-1 ${last.won ? 'text-gold' : 'text-crimson'}`}>
              {last.won ? `WIN +${fmt(last.payoutCents - last.stakeCents)}` : `LOSE −${fmt(last.stakeCents)}`}
            </p>
          </div>
        ) : (
          <p className="text-white/30">Place your bet to play</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        {picks.map((p) => (
          <button key={p.id} onClick={() => setPick(p.id)} disabled={busy}
            className={`py-3 rounded-xl border font-medium transition disabled:opacity-50 ${pick === p.id ? 'border-gold bg-gold/15 text-gold' : 'border-white/10 text-white/70 hover:border-white/20'}`}>
            {p.label}
          </button>
        ))}
      </div>

      <div className="flex gap-3 items-end">
        <div className="flex-1">
          <label className="label">Stake (USD)</label>
          <input className="field" type="number" step="0.50" min="1" value={stake} onChange={(e) => setStake(e.target.value)} disabled={busy} />
        </div>
        <button className="btn-gold px-8 h-[46px]" disabled={busy} onClick={spin}>{busy ? '…' : 'Bet'}</button>
      </div>

      <p className="text-white/30 text-xs mt-3">Wins pay 1.95×. Balance: {fmt(balanceCents)}.</p>
      {error && <p className="text-crimson text-sm mt-2">{error}</p>}

      {last && (
        <details className="mt-4 text-xs text-white/40">
          <summary className="cursor-pointer hover:text-white/60">Provably fair</summary>
          <div className="mt-2 space-y-1 font-mono break-all">
            <p>nonce: {last.fairness.nonce}</p>
            <p>server seed: {last.fairness.serverSeed}</p>
            <p>sha256(seed): {last.fairness.serverSeedHash}</p>
          </div>
          <button
            onClick={runVerify}
            disabled={verifying}
            className="mt-3 rounded-lg border border-gold/40 bg-gold/5 px-3 py-1.5 text-xs font-medium text-gold hover:bg-gold/10 disabled:opacity-60"
          >
            {verifying ? 'Verifying…' : 'Verify this result in your browser'}
          </button>
          {verify && (
            <div className="mt-2 space-y-1 font-sans">
              <p className={verify.hashOk ? 'text-emerald-400' : 'text-crimson'}>
                {verify.hashOk ? '✓' : '✗'} sha256(server seed) matches the committed hash
              </p>
              <p className={verify.outcomeOk ? 'text-emerald-400' : 'text-crimson'}>
                {verify.outcomeOk ? '✓' : '✗'} outcome <span className="font-mono">{verify.derivedOutcome}</span> derives from HMAC(seed, nonce)
              </p>
              <p className="text-white/40">Computed entirely in your browser — no trust in the server required.</p>
            </div>
          )}
        </details>
      )}
    </div>
  );
}
