import { useState } from 'react';
import { api, User } from '../api';

export function AuthPage({ onAuthed }: { onAuthed: (u: User) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = mode === 'login' ? await api.login({ email, password }) : await api.register({ email, password });
      onAuthed(r.user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="panel w-full max-w-md p-8">
        <div className="text-center mb-8">
          <div className="text-5xl mb-2">🎰</div>
          <h1 className="font-display text-3xl text-gold">Lucky Spin Casino</h1>
          <p className="text-white/50 text-sm mt-1">Play with real bank money — fake, of course.</p>
        </div>

        <div className="flex gap-2 mb-6 p-1 bg-black/30 rounded-xl">
          <button className={`tab ${mode === 'login' ? 'bg-gold text-black' : 'text-white/60'}`} onClick={() => setMode('login')}>Sign in</button>
          <button className={`tab ${mode === 'register' ? 'bg-gold text-black' : 'text-white/60'}`} onClick={() => setMode('register')}>Create account</button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label">Email</label>
            <input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required autoFocus />
          </div>
          <div>
            <label className="label">Password</label>
            <input className="field" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" minLength={6} required />
          </div>
          {error && <p className="text-crimson text-sm">{error}</p>}
          <button className="btn-gold w-full" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <p className="text-white/30 text-xs text-center mt-6">
          A separate company from Mock Bank. Fund your wallet with a bank card or by linking your account.
        </p>
      </div>
    </div>
  );
}
