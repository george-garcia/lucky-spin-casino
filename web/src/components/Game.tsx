import { useState } from 'react';
import { api, fmt } from '../api';

type Game = 'coinflip' | 'dice';

interface LastResult {
  game: Game;
  won: boolean;
  outcome: string;
  payoutCents: number;
  stakeCents: number;
  fairness: { serverSeed: string; serverSeedHash: string; nonce: number };
}

export function GamePanel({ balanceCents, onResult }: { balanceCents: number; onResult: (balanceCents: number) => void }) {
  const [game, setGame] = useState<Game>('coinflip');
  const [stake, setStake] = useState('5.00');
  const [pick, setPick] = useState<string>('heads');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [last, setLast] = useState<LastResult | null>(null);

  const picks = game === 'coinflip'
    ? [{ id: 'heads', label: 'Heads' }, { id: 'tails', label: 'Tails' }]
    : [{ id: 'low', label: 'Low (0–49)' }, { id: 'high', label: 'High (50–99)' }];

  function switchGame(g: Game) {
    setGame(g);
    setPick(g === 'coinflip' ? 'heads' : 'low');
    setLast(null);
  }

  async function spin() {
    setBusy(true);
    setError('');
    try {
      const stakeCents = Math.round(parseFloat(stake || '0') * 100);
      const r = await api.play({ game, stakeCents, pick });
      onResult(r.balanceCents);
      setLast({ game, won: r.won, outcome: r.outcome, payoutCents: r.payoutCents, stakeCents, fairness: r.fairness });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel p-6">
      <div className="flex gap-2 mb-6 p-1 bg-black/30 rounded-xl w-full max-w-xs">
        <button className={`tab ${game === 'coinflip' ? 'bg-gold text-black' : 'text-white/60'}`} onClick={() => switchGame('coinflip')}>🪙 Coin flip</button>
        <button className={`tab ${game === 'dice' ? 'bg-gold text-black' : 'text-white/60'}`} onClick={() => switchGame('dice')}>🎲 Dice</button>
      </div>

      {/* Result display */}
      <div className="rounded-2xl bg-black/30 border border-white/5 h-40 flex flex-col items-center justify-center mb-6">
        {last ? (
          <>
            <div className="text-5xl mb-2">
              {last.game === 'coinflip' ? (last.outcome === 'heads' ? '🙂' : '🦅') : '🎲'}
            </div>
            <p className="text-white/70 capitalize">{last.game === 'dice' ? `Rolled ${last.outcome}` : last.outcome}</p>
            <p className={`text-xl font-display mt-1 ${last.won ? 'text-gold' : 'text-crimson'}`}>
              {last.won ? `WIN +${fmt(last.payoutCents - last.stakeCents)}` : `LOSE −${fmt(last.stakeCents)}`}
            </p>
          </>
        ) : (
          <p className="text-white/30">Place your bet to play</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        {picks.map((p) => (
          <button key={p.id} onClick={() => setPick(p.id)}
            className={`py-3 rounded-xl border font-medium transition ${pick === p.id ? 'border-gold bg-gold/15 text-gold' : 'border-white/10 text-white/70 hover:border-white/20'}`}>
            {p.label}
          </button>
        ))}
      </div>

      <div className="flex gap-3 items-end">
        <div className="flex-1">
          <label className="label">Stake (USD)</label>
          <input className="field" type="number" step="0.50" min="1" value={stake} onChange={(e) => setStake(e.target.value)} />
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
        </details>
      )}
    </div>
  );
}
