import { useEffect, useState } from 'react';
import { api, User, fmt } from './api';
import { AuthPage } from './components/AuthPage';
import { AddFunds } from './components/AddFunds';
import { CashOut } from './components/CashOut';
import { GamePanel } from './components/Game';
import { History } from './components/History';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [balanceCents, setBalanceCents] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [modal, setModal] = useState<null | 'fund' | 'cashout'>(null);
  const [showHint, setShowHint] = useState(() => !localStorage.getItem('ls_onboarded'));

  function dismissHint() {
    localStorage.setItem('ls_onboarded', '1');
    setShowHint(false);
  }

  useEffect(() => {
    api.me()
      .then((r) => { setUser(r.user); setBalanceCents(r.wallet.balanceCents); })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  function update(balance: number) {
    setBalanceCents(balance);
    setRefreshKey((k) => k + 1);
  }

  async function logout() {
    await api.logout().catch(() => {});
    setUser(null);
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-white/40">Loading…</div>;
  }
  if (!user) {
    return <AuthPage onAuthed={(u) => { setUser(u); api.wallet().then((r) => setBalanceCents(r.balanceCents)); }} />;
  }

  return (
    <div className="min-h-screen">
      {/* Top bar */}
      <header className="border-b border-gold/15 backdrop-blur-sm sticky top-0 z-30 bg-felt/70">
        <div className="max-w-5xl mx-auto px-5 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🎰</span>
            <span className="font-display text-xl text-gold">Lucky Spin</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right mr-1">
              <p className="text-white/40 text-xs leading-none">Balance</p>
              <p className="text-gold font-semibold text-lg leading-tight">{fmt(balanceCents)}</p>
            </div>
            <button className="btn-gold" onClick={() => setModal('fund')}>Add funds</button>
            <button className="btn-ghost" onClick={() => setModal('cashout')}>Cash out</button>
            <button className="btn-ghost" onClick={logout} title="Sign out">⎋</button>
          </div>
        </div>
      </header>

      {showHint && (
        <div className="max-w-5xl mx-auto px-5 pt-4">
          <div className="panel px-4 py-3 flex items-center justify-between gap-3">
            <p className="text-sm text-white/70">
              <span className="text-gold font-medium">New here?</span> Add funds with the demo card or by linking a bank account, place a bet, then cash out. Every result is provably fair — you can verify it yourself.
            </p>
            <button onClick={dismissHint} className="text-white/40 hover:text-white text-xl leading-none shrink-0" aria-label="Dismiss">×</button>
          </div>
        </div>
      )}

      <main className="max-w-5xl mx-auto px-5 py-8 grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3">
          <GamePanel balanceCents={balanceCents} onResult={update} />
        </div>
        <div className="lg:col-span-2">
          <History refreshKey={refreshKey} />
        </div>
      </main>

      <footer className="max-w-5xl mx-auto px-5 pb-10 text-center text-white/25 text-xs">
        Lucky Spin Casino is a separate company. It accepts Mock Bank cards and Connect links — but never touches the bank's systems directly.
      </footer>

      {modal === 'fund' && <AddFunds onClose={() => setModal(null)} onFunded={update} />}
      {modal === 'cashout' && <CashOut balanceCents={balanceCents} onClose={() => setModal(null)} onDone={update} />}
    </div>
  );
}
