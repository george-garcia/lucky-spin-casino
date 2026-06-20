import { useEffect, useState } from 'react';
import { useMockBankConnect } from '@mockbank/connect/react';
import { api, BANK_WEB_URL, fmt } from '../api';

function toCents(dollars: string): number {
  return Math.round(parseFloat(dollars || '0') * 100);
}

export function AddFunds({ onClose, onFunded }: { onClose: () => void; onFunded: (balanceCents: number) => void }) {
  const [tab, setTab] = useState<'card' | 'connect'>('card');

  return (
    <Modal title="Add funds" onClose={onClose}>
      <div className="flex gap-2 mb-5 p-1 bg-black/30 rounded-xl">
        <button className={`tab ${tab === 'card' ? 'bg-gold text-black' : 'text-white/60'}`} onClick={() => setTab('card')}>Pay with card</button>
        <button className={`tab ${tab === 'connect' ? 'bg-gold text-black' : 'text-white/60'}`} onClick={() => setTab('connect')}>Connect bank</button>
      </div>
      {tab === 'card' ? <CardTab onFunded={onFunded} /> : <ConnectTab onFunded={onFunded} />}
    </Modal>
  );
}

function CardTab({ onFunded }: { onFunded: (balanceCents: number) => void }) {
  // Prefilled with the bank's seeded demo card so the swipe works out of the box.
  const [pan, setPan] = useState('4111 1111 1111 1111');
  const [expMonth, setExpMonth] = useState('12');
  const [expYear, setExpYear] = useState('2030');
  const [cvv, setCvv] = useState('123');
  const [amount, setAmount] = useState('50.00');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setDone('');
    try {
      const r = await api.fundCard({ pan, expMonth, expYear, cvv, amountCents: toCents(amount) });
      onFunded(r.balanceCents);
      setDone(`Charged card •••• ${r.last4}. Balance is now ${fmt(r.balanceCents)}.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="label">Card number</label>
        <input className="field font-mono tracking-wider" value={pan} onChange={(e) => setPan(e.target.value)} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div><label className="label">Exp month</label><input className="field" value={expMonth} onChange={(e) => setExpMonth(e.target.value)} /></div>
        <div><label className="label">Exp year</label><input className="field" value={expYear} onChange={(e) => setExpYear(e.target.value)} /></div>
        <div><label className="label">CVV</label><input className="field" value={cvv} onChange={(e) => setCvv(e.target.value)} /></div>
      </div>
      <div>
        <label className="label">Amount (USD)</label>
        <input className="field" type="number" step="0.01" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      {error && <p className="text-crimson text-sm">{error}</p>}
      {done && <p className="text-gold text-sm">{done}</p>}
      <button className="btn-gold w-full" disabled={busy}>{busy ? 'Authorizing…' : `Deposit ${fmt(toCents(amount))}`}</button>
      <p className="text-white/30 text-xs">
        Use any Mock Bank card. Issue one in the bank app → Cards → <span className="text-white/50">Show details</span> to get its
        number/CVV. Seeded demo card: 4111 1111 1111 1111 · 12/2030 · CVV 123.
      </p>
    </form>
  );
}

function ConnectTab({ onFunded }: { onFunded: (balanceCents: number) => void }) {
  const [linked, setLinked] = useState(false);
  const [account, setAccount] = useState<{ mask: string | null; type: string | null; balance?: string } | null>(null);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [amount, setAmount] = useState('25.00');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  useEffect(() => {
    api.connectStatus().then((s) => {
      if (s.linked) {
        setLinked(true);
        setAccount(s.account ?? null);
      }
    }).catch(() => {});
  }, []);

  // Fetch a fresh link token (from OUR backend) whenever we still need to link.
  useEffect(() => {
    if (!linked) api.linkToken().then((r) => setLinkToken(r.link_token)).catch(() => setError('Could not start Connect.'));
  }, [linked]);

  const { open, ready } = useMockBankConnect({
    linkToken,
    bankWebUrl: BANK_WEB_URL,
    onSuccess: async (publicToken) => {
      setBusy(true);
      setError('');
      try {
        const r = await api.connectExchange(publicToken);
        setAccount(r.account);
        setLinked(true);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setBusy(false);
      }
    },
    onExit: () => setError(''),
  });

  async function pull(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setDone('');
    try {
      const r = await api.fundConnect(toCents(amount));
      onFunded(r.balanceCents);
      setDone(`Pulled ${fmt(toCents(amount))} from your bank. Balance is now ${fmt(r.balanceCents)}.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!linked) {
    return (
      <div className="space-y-4">
        <p className="text-white/60 text-sm">
          Securely link your Mock Bank account. You'll sign in to your bank in a popup and approve access —
          we never see your bank password.
        </p>
        <button className="btn-gold w-full" disabled={!ready || busy} onClick={open}>
          {ready ? 'Connect your bank' : 'Preparing…'}
        </button>
        {error && <p className="text-crimson text-sm">{error}</p>}
        <p className="text-white/30 text-xs">Powered by the @mockbank/connect SDK.</p>
      </div>
    );
  }

  return (
    <form onSubmit={pull} className="space-y-4">
      <div className="rounded-xl bg-black/30 border border-gold/20 p-4 flex items-center justify-between">
        <div>
          <p className="text-white capitalize">{account?.type ?? 'Account'} {account?.mask ?? ''}</p>
          <p className="text-white/40 text-xs">Linked via Connect{account?.balance ? ` · available ${account.balance}` : ''}</p>
        </div>
        <span className="text-gold text-sm">✓ Linked</span>
      </div>
      <div>
        <label className="label">Amount to pull (USD)</label>
        <input className="field" type="number" step="0.01" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      {error && <p className="text-crimson text-sm">{error}</p>}
      {done && <p className="text-gold text-sm">{done}</p>}
      <button className="btn-gold w-full" disabled={busy}>{busy ? 'Pulling…' : `Deposit ${fmt(toCents(amount))}`}</button>
    </form>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="panel w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-xl text-gold">{title}</h2>
          <button className="text-white/40 hover:text-white text-xl leading-none" onClick={onClose}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
