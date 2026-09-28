import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../components/Toast.jsx';

export default function Auth({ mode }) {
  const isSignup = mode === 'signup';
  const { login, signup } = useAuth();
  const toast = useToast();
  const nav = useNavigate();

  const [form, setForm] = useState({ full_name: '', email: '', password: '' });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      if (isSignup) {
        await signup(form.full_name, form.email, form.password);
        toast.success('Welcome to SnapChef! Your kitchen is ready.');
      } else {
        await login(form.email, form.password);
        toast.success('Welcome back, chef!');
      }
      nav('/app', { replace: true });
    } catch (e2) {
      setErr(e2.message);
      toast.error(e2.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
      <Link to="/" className="mb-8 flex items-center justify-center gap-2.5">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-lg shadow-lg shadow-emerald-500/25">🥗</span>
        <span className="text-xl font-extrabold tracking-tight text-slate-900">SnapChef</span>
      </Link>

      <div className="glass rise rounded-3xl p-6 sm:p-8">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
          {isSignup ? 'Create your account' : 'Welcome back'}
        </h1>
        <p className="mt-1.5 text-sm text-slate-500">
          {isSignup ? 'Start turning leftovers into great meals.' : 'Log in to open your kitchen.'}
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
          {isSignup && (
            <div>
              <label className="label" htmlFor="name">Full name</label>
              <input id="name" className="input" placeholder="Alex Chef" value={form.full_name}
                onChange={set('full_name')} autoComplete="name" />
            </div>
          )}
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" type="email" required className="input" placeholder="you@example.com"
              value={form.email} onChange={set('email')} autoComplete="email" inputMode="email" />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <div className="relative">
              <input id="password" type={show ? 'text' : 'password'} required className="input pr-16"
                placeholder={isSignup ? 'At least 6 characters' : '••••••••'}
                value={form.password} onChange={set('password')}
                autoComplete={isSignup ? 'new-password' : 'current-password'} />
              <button type="button" onClick={() => setShow(!show)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400 hover:text-slate-600">
                {show ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {err && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">{err}</p>}

          <button className="btn-primary w-full py-3 text-base" disabled={busy}>
            {busy ? 'Please wait…' : isSignup ? 'Create account' : 'Log in'}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-slate-500">
          {isSignup ? 'Already have an account? ' : "Don't have an account? "}
          <Link to={isSignup ? '/login' : '/signup'} className="font-semibold text-emerald-600 hover:text-emerald-700">
            {isSignup ? 'Log in' : 'Sign up free'}
          </Link>
        </p>
      </div>

      <p className="mt-6 text-center text-xs text-slate-400">
        🔒 Passwords are hashed with bcrypt. Your session works across devices.
      </p>
    </div>
  );
}
