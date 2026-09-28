import { useState } from 'react';

const CUISINES = [
  { id: 'any', label: 'Surprise me', icon: '🎲' },
  { id: 'southindian', label: 'South Indian', icon: '🥥' },
  { id: 'northindian', label: 'North Indian', icon: '🍛' },
  { id: 'chinese', label: 'Chinese', icon: '🥢' },
  { id: 'korean', label: 'Korean', icon: '🇰🇷' },
  { id: 'japanese', label: 'Japanese', icon: '🍱' },
  { id: 'thai', label: 'Thai', icon: '🌶️' },
  { id: 'italian', label: 'Italian', icon: '🍝' },
  { id: 'mexican', label: 'Mexican', icon: '🌮' },
  { id: 'mediterranean', label: 'Mediterranean', icon: '🫒' },
  { id: 'american', label: 'American', icon: '🍔' },
  { id: 'continental', label: 'Continental', icon: '🍽️' },
  { id: 'middleeastern', label: 'Middle Eastern', icon: '🧆' },
];

const MEALS = [
  { id: 'any', label: 'Any meal' },
  { id: 'breakfast', label: 'Breakfast' },
  { id: 'lunch', label: 'Lunch' },
  { id: 'snack', label: 'Snack' },
  { id: 'dinner', label: 'Dinner' },
  { id: 'dessert', label: 'Dessert' },
];

const DIETS = [
  { id: 'any', label: 'No preference' },
  { id: 'veg', label: '🥬 Vegetarian' },
  { id: 'vegan', label: '🌱 Vegan' },
  { id: 'highprotein', label: '💪 High protein' },
];

const PREFS_KEY = 'snapchef_recipe_prefs';

export default function RecipeOptions({ open, onClose, onCook }) {
  const saved = (() => {
    try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch { return {}; }
  })();

  const [cuisine, setCuisine] = useState(saved.cuisine || 'any');
  const [meal, setMeal] = useState(saved.meal || 'any');
  const [diet, setDiet] = useState(saved.diet || 'any');
  const [quick, setQuick] = useState(Boolean(saved.quick));
  const [spicy, setSpicy] = useState(Boolean(saved.spicy));
  const [note, setNote] = useState('');

  if (!open) return null;

  function cook() {
    const prefs = { cuisine, meal, diet, quick, spicy };
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    onCook({ ...prefs, prompt: note.trim() });
  }

  const chosen = CUISINES.find((c) => c.id === cuisine);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-sm sm:items-center sm:p-5"
      onClick={onClose}
    >
      <div
        className="rise flex max-h-[92vh] w-full max-w-lg flex-col rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900">What are we cooking?</h3>
            <p className="text-xs text-slate-500">Pick a style — SnapChef uses what you already have.</p>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <p className="label">Cuisine</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {CUISINES.map((c) => {
              const on = cuisine === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => setCuisine(c.id)}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm font-semibold transition ${
                    on
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700 ring-2 ring-emerald-500/20'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <span className="text-base">{c.icon}</span>
                  <span className="truncate">{c.label}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="label">Meal</span>
              <select value={meal} onChange={(e) => setMeal(e.target.value)} className="input py-2.5">
                {MEALS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="label">Diet</span>
              <select value={diet} onChange={(e) => setDiet(e.target.value)} className="input py-2.5">
                {DIETS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
              </select>
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => setQuick((v) => !v)}
              className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                quick ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600'
              }`}
            >
              ⚡ Under 20 min
            </button>
            <button
              onClick={() => setSpicy((v) => !v)}
              className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                spicy ? 'border-orange-400 bg-orange-50 text-orange-700' : 'border-slate-200 bg-white text-slate-600'
              }`}
            >
              🌶️ Make it spicy
            </button>
          </div>

          <label className="mt-5 block">
            <span className="label">Anything else? (optional)</span>
            <input
              className="input"
              placeholder="e.g. no onion, kid-friendly, one pot…"
              value={note}
              maxLength={200}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
        </div>

        <div className="border-t border-slate-100 px-6 py-4">
          <button onClick={cook} className="btn-primary w-full py-3.5 text-base">
            {chosen?.icon} Cook {chosen?.id === 'any' ? 'something' : chosen?.label} →
          </button>
        </div>
      </div>
    </div>
  );
}
