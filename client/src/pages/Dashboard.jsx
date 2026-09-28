import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../components/Toast.jsx';
import ScanModal from '../components/ScanModal.jsx';
import VoicePlayer from '../components/VoicePlayer.jsx';
import SavingsCard from '../components/SavingsCard.jsx';

const AI_ACTIONS = [
  { mode: 'recipe', label: 'Cook something', icon: '👩‍🍳', hint: 'A full recipe from what you have' },
  { mode: 'waste', label: 'Use-first report', icon: '🌱', hint: 'What to eat before it spoils' },
  { mode: 'shopping', label: 'Smart list', icon: '🛒', hint: 'Cheap staples that unlock meals' },
];

function Modal({ open, onClose, children, title }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/30 p-0 backdrop-blur-sm sm:items-center sm:p-5"
      onClick={onClose}>
      <div className="rise w-full max-w-lg rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">{title}</h3>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user, logout } = useAuth();
  const toast = useToast();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [form, setForm] = useState({ title: '', description: '' });
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [ai, setAi] = useState({ open: false, loading: false, text: '', title: '' });
  const [scanOpen, setScanOpen] = useState(false);
  const [summary, setSummary] = useState(null);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const { items } = await api('/api/items');
      setItems(items);
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
    refreshSummary();
  }

  async function refreshSummary() {
    try { setSummary(await api('/api/items/summary')); } catch { /* non-critical */ }
  }

  async function addItem(e) {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const { item } = await api('/api/items', { method: 'POST', body: form });
      setItems((p) => [item, ...p]);
      setForm({ title: '', description: '' });
      refreshSummary();
      toast.success(`${item.title} added to your kitchen`);
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  async function saveEdit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const { item } = await api(`/api/items/${editing.id}`, {
        method: 'PUT',
        body: { title: editing.title, description: editing.description || '' },
      });
      setItems((p) => p.map((i) => (i.id === item.id ? item : i)));
      setEditing(null);
      refreshSummary();
      toast.success('Item updated');
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  async function removeItem(item) {
    if (!confirm(`Remove "${item.title}" from your kitchen?`)) return;
    setBusyId(item.id);
    try {
      await api(`/api/items/${item.id}`, { method: 'DELETE' });
      setItems((p) => p.filter((i) => i.id !== item.id));
      refreshSummary();
      toast.info(`${item.title} removed`);
    } catch (e) { toast.error(e.message); }
    finally { setBusyId(null); }
  }

  async function setStatus(item, status) {
    setBusyId(item.id);
    try {
      await api(`/api/items/${item.id}/status`, { method: 'PATCH', body: { status } });
      setItems((p) => p.filter((i) => i.id !== item.id));
      refreshSummary();
      if (status === 'used') {
        toast.success(`Nice! You rescued ₹${Math.round(item.value_inr || 0)} of ${item.title}`);
      } else {
        toast.info(`${item.title} marked as thrown away`);
      }
    } catch (e) { toast.error(e.message); }
    finally { setBusyId(null); }
  }

  async function summarize(item) {
    setBusyId(item.id);
    try {
      const { result } = await api('/api/ai/generate', { method: 'POST', body: { mode: 'summary', itemId: item.id } });
      setItems((p) => p.map((i) => (i.id === item.id ? { ...i, ai_summary: result } : i)));
      toast.success('AI tip saved');
    } catch (e) { toast.error(e.message); }
    finally { setBusyId(null); }
  }

  async function runAi(action) {
    setAi({ open: true, loading: true, text: '', title: action.label });
    try {
      const { result } = await api('/api/ai/generate', { method: 'POST', body: { mode: action.mode } });
      setAi({ open: true, loading: false, text: result, title: action.label });
    } catch (e) {
      setAi({ open: false, loading: false, text: '', title: '' });
      toast.error(e.message);
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) =>
      `${i.title} ${i.description || ''}`.toLowerCase().includes(q));
  }, [items, query]);

  const firstName = (user?.full_name || 'chef').split(' ')[0];

  return (
    <div className="mx-auto max-w-5xl px-4 pb-24 pt-5 sm:px-6">
      {/* Nav */}
      <header className="glass sticky top-3 z-30 flex items-center justify-between rounded-2xl px-4 py-3">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-lg shadow-lg shadow-emerald-500/25">🥗</span>
          <span className="text-lg font-extrabold tracking-tight text-slate-900">SnapChef</span>
        </Link>
        <div className="flex items-center gap-2">
          <span className="hidden max-w-[160px] truncate text-sm font-medium text-slate-500 sm:block">{user?.email}</span>
          <button onClick={logout} className="btn-ghost px-3 py-2">Log out</button>
        </div>
      </header>

      {/* Hero */}
      <div className="rise mt-6">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
          Hey {firstName} 👋
        </h1>
        <p className="mt-1 text-sm text-slate-500 sm:text-base">
          You have <b className="text-slate-700">{items.length}</b> {items.length === 1 ? 'ingredient' : 'ingredients'} in your kitchen. Let&apos;s cook something before it spoils.
        </p>
      </div>

      <SavingsCard summary={summary} loading={loading} />

      {/* AI actions */}
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {AI_ACTIONS.map((a) => (
          <button key={a.mode} onClick={() => runAi(a)}
            className="card group p-4 text-left transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-lg">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-xl">{a.icon}</span>
              <div className="min-w-0">
                <p className="truncate font-bold text-slate-900">{a.label}</p>
                <p className="truncate text-xs text-slate-500">{a.hint}</p>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Camera scanner */}
      <button
        onClick={() => setScanOpen(true)}
        className="group mt-5 flex w-full items-center gap-4 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 p-5 text-left text-white shadow-lg shadow-emerald-500/25 transition hover:-translate-y-0.5 hover:shadow-xl active:scale-[.99]"
      >
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/20 text-2xl backdrop-blur">📸</span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold">Snap your ingredients</span>
          <span className="block text-sm text-white/80">Photograph your fridge and let AI fill your kitchen</span>
        </span>
        <span className="shrink-0 text-xl transition group-hover:translate-x-0.5">→</span>
      </button>

      {/* Add form */}
      <form onSubmit={addItem} className="card mt-4 p-5">
        <h2 className="mb-3 text-base font-bold text-slate-900">Or add one by hand</h2>
        <div className="grid gap-3 sm:grid-cols-[1fr_1.4fr_auto]">
          <input className="input" placeholder="Ingredient (e.g. Spinach)" value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={80} />
          <input className="input" placeholder="Notes — 200g, expires Friday…" value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={200} />
          <button className="btn-primary sm:px-6" disabled={saving || !form.title.trim()}>
            {saving ? 'Adding…' : '+ Add'}
          </button>
        </div>
      </form>

      {/* Search */}
      {items.length > 3 && (
        <input className="input mt-5" placeholder="🔍 Search your kitchen…" value={query}
          onChange={(e) => setQuery(e.target.value)} />
      )}

      {/* List */}
      <div className="mt-5">
        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-white/70" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="card grid place-items-center p-12 text-center">
            <span className="text-4xl">🧊</span>
            <p className="mt-3 font-bold text-slate-800">{items.length ? 'No matches' : 'Your kitchen is empty'}</p>
            <p className="mt-1 max-w-xs text-sm text-slate-500">
              {items.length ? 'Try a different search term.' : 'Add a few ingredients above and SnapChef will do the rest.'}
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {filtered.map((item, idx) => (
              <article key={item.id} className="card rise flex flex-col p-5" style={{ animationDelay: `${Math.min(idx, 8) * 40}ms` }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-bold text-slate-900">{item.title}</h3>
                    {item.description && <p className="mt-1 text-sm leading-relaxed text-slate-500">{item.description}</p>}
                  </div>
                  <span className="shrink-0 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                    ₹{Math.round(item.value_inr || 0)}
                  </span>
                </div>

                {item.ai_summary && (
                  <p className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50/70 p-3 text-sm leading-relaxed text-emerald-900">
                    <b className="font-semibold">✨ SnapChef tip:</b> {item.ai_summary}
                  </p>
                )}

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setStatus(item, 'used')}
                    disabled={busyId === item.id}
                    className="btn bg-emerald-600 py-2 text-xs text-white hover:bg-emerald-700"
                  >
                    ✅ I cooked it
                  </button>
                  <button
                    onClick={() => setStatus(item, 'wasted')}
                    disabled={busyId === item.id}
                    className="btn-ghost py-2 text-xs"
                  >
                    🗑️ Threw it out
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button onClick={() => summarize(item)} disabled={busyId === item.id} className="btn-ghost flex-1 px-2 py-2 text-xs">
                    {busyId === item.id ? '…' : '✨ AI tip'}
                  </button>
                  <button onClick={() => setEditing({ ...item })} className="btn-ghost flex-1 px-2 py-2 text-xs">Edit</button>
                  <button onClick={() => removeItem(item)} disabled={busyId === item.id} className="btn-danger flex-1 px-2 py-2 text-xs">Delete</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <ScanModal
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onAdded={(added) => { setItems((p) => [...added, ...p]); refreshSummary(); }}
      />

      {/* Edit modal */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit ingredient">
        {editing && (
          <form onSubmit={saveEdit} className="space-y-4">
            <div>
              <label className="label">Ingredient</label>
              <input className="input" value={editing.title} maxLength={80}
                onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
            </div>
            <div>
              <label className="label">Notes</label>
              <textarea className="input min-h-[96px] resize-none" maxLength={200} value={editing.description || ''}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setEditing(null)} className="btn-ghost flex-1 py-3">Cancel</button>
              <button className="btn-primary flex-1 py-3" disabled={saving || !editing.title.trim()}>
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* AI result modal */}
      <Modal open={ai.open} onClose={() => setAi({ ...ai, open: false })} title={ai.title}>
        {ai.loading ? (
          <div className="grid place-items-center gap-3 py-12">
            <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-emerald-200 border-t-emerald-600" />
            <p className="text-sm font-medium text-slate-500">SnapChef is thinking…</p>
          </div>
        ) : (
          <>
            <div className="max-h-[55vh] overflow-y-auto">
              <pre className="whitespace-pre-wrap rounded-2xl bg-slate-50 p-4 font-sans text-[15px] leading-relaxed text-slate-700">
                {ai.text}
              </pre>
              <VoicePlayer text={ai.text} />
            </div>
            <button
              onClick={() => { navigator.clipboard?.writeText(ai.text); toast.success('Copied to clipboard'); }}
              className="btn-ghost mt-4 w-full py-3">Copy</button>
          </>
        )}
      </Modal>
    </div>
  );
}
