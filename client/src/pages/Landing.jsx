import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';

const features = [
  { icon: '🧊', title: 'Snap your fridge', text: 'Log what you already own in seconds. Quantities, expiry notes, anything.' },
  { icon: '✨', title: 'AI recipes instantly', text: 'Gemini turns your leftovers into a real dish with steps and timing.' },
  { icon: '🌱', title: 'Waste less, save more', text: 'Get a use-first report so nothing rots at the back of the shelf.' },
];

export default function Landing() {
  const { user } = useAuth();
  return (
    <div className="mx-auto max-w-6xl px-5 pb-20 pt-6">
      <header className="glass flex items-center justify-between rounded-2xl px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-lg shadow-lg shadow-emerald-500/25">🥗</span>
          <span className="text-lg font-extrabold tracking-tight text-slate-900">SnapChef</span>
        </div>
        <nav className="flex items-center gap-2">
          {user ? (
            <Link to="/app" className="btn-primary">Open app</Link>
          ) : (
            <>
              <Link to="/login" className="btn-ghost hidden sm:inline-flex">Log in</Link>
              <Link to="/signup" className="btn-primary">Get started</Link>
            </>
          )}
        </nav>
      </header>

      <section className="rise mt-14 text-center sm:mt-20">
        <span className="chip mb-5 border border-emerald-100 bg-emerald-50 text-emerald-700">
          🍃 AI-powered fridge-to-table
        </span>
        <h1 className="mx-auto max-w-3xl text-4xl font-extrabold leading-[1.1] tracking-tight text-slate-900 sm:text-6xl">
          Turn what&apos;s in your fridge into
          <span className="bg-gradient-to-br from-emerald-500 to-teal-600 bg-clip-text text-transparent"> dinner tonight</span>.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-slate-500 sm:text-lg">
          SnapChef is your AI kitchen companion. Add the ingredients you already have and get real recipes,
          storage tips and a personal food-waste report — in one tap.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link to={user ? '/app' : '/signup'} className="btn-primary w-full px-6 py-3 text-base sm:w-auto">
            {user ? 'Go to my kitchen' : 'Start cooking free'} →
          </Link>
          <Link to="/login" className="btn-ghost w-full px-6 py-3 text-base sm:w-auto">I already have an account</Link>
        </div>
      </section>

      <section className="mt-16 grid gap-4 sm:mt-24 sm:grid-cols-3">
        {features.map((f, i) => (
          <div key={f.title} className="card rise p-6" style={{ animationDelay: `${i * 80}ms` }}>
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-slate-50 text-xl">{f.icon}</div>
            <h3 className="mt-4 text-lg font-bold text-slate-900">{f.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{f.text}</p>
          </div>
        ))}
      </section>

      <section className="card mt-6 grid gap-6 p-8 sm:grid-cols-3 sm:p-10">
        {[['1/3', 'of all food produced is wasted globally'], ['~$1,500', 'thrown away per household each year'], ['30 sec', 'to get your first SnapChef recipe']].map(([big, small]) => (
          <div key={small} className="text-center">
            <p className="text-3xl font-extrabold text-emerald-600">{big}</p>
            <p className="mt-1 text-sm text-slate-500">{small}</p>
          </div>
        ))}
      </section>

      <footer className="mt-14 text-center text-sm text-slate-400">
        Built with React, Express, Supabase &amp; Gemini · SnapChef
      </footer>
    </div>
  );
}
