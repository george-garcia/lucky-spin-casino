import { useEffect, useState } from 'react';
import { api, Bet, LedgerEntry, fmt } from '../api';

const LEDGER_LABELS: Record<string, string> = {
  deposit_card: 'Card deposit',
  deposit_connect: 'Bank deposit',
  bet: 'Bet',
  win: 'Win',
  cashout: 'Cash out',
  cashout_reversed: 'Cash out reversed',
};

export function History({ refreshKey }: { refreshKey: number }) {
  const [tab, setTab] = useState<'bets' | 'wallet'>('bets');
  const [bets, setBets] = useState<Bet[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);

  useEffect(() => {
    api.bets().then((r) => setBets(r.bets)).catch(() => {});
    api.wallet().then((r) => setLedger(r.ledger)).catch(() => {});
  }, [refreshKey]);

  return (
    <div className="panel p-6">
      <div className="flex gap-2 mb-4 p-1 bg-black/30 rounded-xl">
        <button className={`tab ${tab === 'bets' ? 'bg-gold text-black' : 'text-white/60'}`} onClick={() => setTab('bets')}>Bets</button>
        <button className={`tab ${tab === 'wallet' ? 'bg-gold text-black' : 'text-white/60'}`} onClick={() => setTab('wallet')}>Wallet</button>
      </div>

      <div className="space-y-1 max-h-[420px] overflow-auto">
        {tab === 'bets' ? (
          bets.length === 0 ? <Empty label="No bets yet" /> : bets.map((b) => (
            <div key={b.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-white/5">
              <div>
                <p className="text-white/90 text-sm capitalize">{b.game} · {b.pick}</p>
                <p className="text-white/40 text-xs">{b.game === 'dice' ? `rolled ${b.outcome}` : b.outcome}</p>
              </div>
              <span className={`text-sm font-medium ${b.won ? 'text-gold' : 'text-crimson'}`}>
                {b.won ? `+${fmt(b.payout_cents - b.stake_cents)}` : `−${fmt(b.stake_cents)}`}
              </span>
            </div>
          ))
        ) : (
          ledger.length === 0 ? <Empty label="No activity yet" /> : ledger.map((l) => (
            <div key={l.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-white/5">
              <div>
                <p className="text-white/90 text-sm">{LEDGER_LABELS[l.type] ?? l.type}</p>
                <p className="text-white/40 text-xs">{new Date(l.created_at).toLocaleString()}</p>
              </div>
              <span className={`text-sm font-medium ${l.amount_cents >= 0 ? 'text-gold' : 'text-white/70'}`}>
                {l.amount_cents >= 0 ? '+' : '−'}{fmt(Math.abs(l.amount_cents))}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return <p className="text-white/30 text-sm text-center py-8">{label}</p>;
}
