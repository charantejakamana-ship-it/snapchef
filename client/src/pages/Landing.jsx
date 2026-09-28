import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { API_BASE } from '../lib/api';

const DISHES = [
  { img: '/dishes/frittata.jpg', name: 'Cheesy Broccoli Frittata', from: 'eggs · broccoli · cheese', time: '25 min', saved: 210 },
  { img: '/dishes/paneer.jpg', name: 'Paneer Tomato Rice Bowl', from: 'paneer · tomato · rice', time: '30 min', saved: 185 },
  { img: '/dishes/noodles.jpg', name: 'Garlic Soy Chicken Noodles', from: 'chicken · broccoli · noodles', time: '20 min', saved: 240 },
];

const STEPS = [
  { icon: '📸', title: 'Snap your fridge', text: 'One photo. SnapChef spots every ingredient and prices it in rupees.' },
  { icon: '✨', title: 'Get a real recipe', text: 'Gemini builds a dish from exactly what you already own — nothing extra to buy.' },
  { icon: '🔊', title: 'Cook hands-free', text: 'Have the recipe read aloud in Telugu, Hindi, Tamil or 21 more languages.' },
  { icon: '💰', title: 'Watch ₹ add up', text: 'Tick off what you cooked and see the money you rescued from the bin.' },
];

/** Counts up to a number so the savings figure feels alive. */
function useCountUp(target, duration = 1100) {
  const [n, setN] = useState(0);
  const raf = useRef();
  useEffect(() => {
    if (!target) { setN(0); return; }
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration);
      setN(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration]);
  return n;
}

const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');

export default function Landing() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    let alive = true;
    fetch(`${API_BASE}/api/stats`)
      .then((r) => r.json())
      .then((d) => alive && setStats(d))
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // Show community savings, with a sensible floor so the page never looks empty.
  const rupees = Math.max(stats?.rupeesSaved || 0, 0);
  const counted = useCountUp(rupees);

  return (
    <div className="mx-auto max-w-6xl px-5 pb-20 pt-6">
      {/* NAV */}
      <header className="glass sticky top-4 z-40 flex items-center justify-between rounded-2xl px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-lg shadow-lg shadow-emerald-500/25">🥗</span>
          <span className="text-lg font-extrabold tracking-tight text-slate-900">SnapChef</span>
        </div>
        <nav className="flex items-center gap-2">
          {user ? (
            <Link to="/app" className="btn-primary">Open my kitchen</Link>
          ) : (
            <>
              <Link to="/login" className="btn-ghost hidden sm:inline-flex">Log in</Link>
              <Link to="/signup" className="btn-primary">Get started</Link>
            </>
          )}
        </nav>
      </header>

      {/* HERO */}
      <section className="mt-12 grid items-center gap-10 sm:mt-16 lg:grid-cols-2 lg:gap-14">
        <div className="rise">
          <span className="chip border border-emerald-100 bg-emerald-50 text-emerald-700">
            🍃 AI-powered fridge-to-table
          </span>
          <h1 className="mt-5 text-4xl font-extrabold leading-[1.08] tracking-tight text-slate-900 sm:text-5xl lg:text-[3.4rem]">
            Stop throwing away
            <span className="bg-gradient-to-br from-emerald-500 to-teal-600 bg-clip-text text-transparent"> ₹1,000s </span>
            of food.
          </h1>
          <p className="mt-5 max-w-lg text-base leading-relaxed text-slate-500 sm:text-lg">
            Photograph your fridge. SnapChef names every ingredient, turns it into a real
            recipe, reads it aloud in your language — and counts the rupees you just saved.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link to={user ? '/app' : '/signup'} className="btn-primary px-7 py-3.5 text-base">
              {user ? 'Go to my kitchen' : 'Start saving free'} →
            </Link>
            <Link to="/login" className="btn-ghost px-7 py-3.5 text-base">I have an account</Link>
          </div>

          <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-400">
            <span>✓ Free to use</span>
            <span>✓ Works on any phone</span>
            <span>✓ 24 languages</span>
          </div>
        </div>

        {/* SAVINGS CARD + HERO PHOTO */}
        <div className="rise relative" style={{ animationDelay: '100ms' }}>
          <div className="overflow-hidden rounded-3xl shadow-soft ring-1 ring-slate-200/70">
            <img
              src="/dishes/fridge.jpg"
              alt="A fridge full of fresh ingredients"
              className="aspect-[4/3] w-full object-cover"
              loading="eager"
            />
          </div>

          <div className="glass absolute -bottom-6 left-4 right-4 rounded-2xl p-5 sm:left-8 sm:right-8">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Rescued by SnapChef cooks
            </p>
            <p className="mt-1 text-4xl font-extrabold tracking-tight text-emerald-600 sm:text-5xl">
              {stats ? inr(counted) : '₹—'}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {stats
                ? `${stats.mealsRescued} ingredients rescued by ${stats.cooks} home cooks`
                : 'Adding up the savings…'}
            </p>
          </div>
        </div>
      </section>

      {/* DISHES */}
      <section className="mt-28 sm:mt-32">
        <div className="text-center">
          <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
            Made from leftovers. Honestly.
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-slate-500">
            Real dishes SnapChef built from ingredients that were about to be thrown out.
          </p>
        </div>

        <div className="mt-10 grid gap-5 sm:grid-cols-3">
          {DISHES.map((d, i) => (
            <article
              key={d.name}
              className="card rise group overflow-hidden p-0 transition hover:-translate-y-1 hover:shadow-xl"
              style={{ animationDelay: `${i * 90}ms` }}
            >
              <div className="relative overflow-hidden">
                <img
                  src={d.img}
                  alt={d.name}
                  loading="lazy"
                  className="aspect-square w-full object-cover transition duration-500 group-hover:scale-105"
                />
                <span className="absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1 text-xs font-bold text-slate-700 backdrop-blur">
                  ⏱ {d.time}
                </span>
                <span className="absolute right-3 top-3 rounded-full bg-emerald-600 px-3 py-1 text-xs font-bold text-white shadow-lg">
                  saved {inr(d.saved)}
                </span>
              </div>
              <div className="p-5">
                <h3 className="font-bold text-slate-900">{d.name}</h3>
                <p className="mt-1 text-sm text-slate-500">from {d.from}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="mt-24">
        <div className="text-center">
          <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
            Four taps to dinner
          </h2>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <div key={s.title} className="card rise p-6" style={{ animationDelay: `${i * 80}ms` }}>
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-50 text-xl">{s.icon}</span>
                <span className="text-xs font-bold text-slate-300">0{i + 1}</span>
              </div>
              <h3 className="mt-4 font-bold text-slate-900">{s.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* NUMBERS */}
      <section className="card mt-20 grid gap-8 p-9 sm:grid-cols-3 sm:p-12">
        {[
          ['₹1,000+', 'wasted per household every month'],
          ['1/3', 'of all food produced is never eaten'],
          ['30 sec', 'from photo to your first recipe'],
        ].map(([big, small]) => (
          <div key={small} className="text-center">
            <p className="text-3xl font-extrabold tracking-tight text-emerald-600 sm:text-4xl">{big}</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">{small}</p>
          </div>
        ))}
      </section>

      {/* CTA */}
      <section className="relative mt-20 overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-500 to-teal-600 px-8 py-14 text-center shadow-xl shadow-emerald-500/20">
        <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
          What&apos;s in your fridge right now?
        </h2>
        <p className="mx-auto mt-3 max-w-md text-white/85">
          Take one photo and find out what it could become tonight.
        </p>
        <Link
          to={user ? '/app' : '/signup'}
          className="btn mt-7 bg-white px-8 py-3.5 text-base text-emerald-700 shadow-lg hover:bg-emerald-50"
        >
          {user ? 'Open my kitchen' : 'Start free — no card needed'} →
        </Link>
      </section>

      <footer className="mt-14 text-center text-sm text-slate-400">
        Built with React, Express, Supabase &amp; Gemini · SnapChef
      </footer>
    </div>
  );
}
