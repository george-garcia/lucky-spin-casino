import { useState } from 'react';
import { api, fmt } from '../api';
import { Modal } from './AddFunds';

export function CashOut({ balanceCents, onClose, onDone }: { balanceCents: number; onClose: () => void; onDone: (balanceCents: number) => void }) {
  const [amount, setAmount] = useState((balanceCents / 100).toFixed(2));
  const [method, setMethod] = useState<'connect' | 'card'>('connect');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setDone('');
    try {
      const cents = Math.round(parseFloat(amount || '0') * 100);
      const r = await api.cashout(cents, method);
      onDone(r.balanceCents);
      setDone(`Cashed out ${fmt(cents)} to your bank ${method === 'connect' ? 'account' : 'card'}.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Cash out" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-white/60 text-sm">Send your winnings back to the bank. Available: {fmt(balanceCents)}.</p>
        <div className="flex gap-2 p-1 bg-black/30 rounded-xl">
          <button type="button" className={`tab ${method === 'connect' ? 'bg-gold text-black' : 'text-white/60'}`} onClick={() => setMethod('connect')}>To linked account</button>
          <button type="button" className={`tab ${method === 'card' ? 'bg-gold text-black' : 'text-white/60'}`} onClick={() => setMethod('card')}>Refund to card</button>
        </div>
        <div>
          <label className="label">Amount (USD)</label>
          <input className="field" type="number" step="0.01" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        {error && <p className="text-crimson text-sm">{error}</p>}
        {done && <p className="text-gold text-sm">{done}</p>}
        <button className="btn-gold w-full" disabled={busy}>{busy ? 'Sending…' : 'Cash out'}</button>
      </form>
    </Modal>
  );
}
