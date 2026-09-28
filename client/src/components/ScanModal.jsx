import { useRef, useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useToast } from './Toast.jsx';

/** Shrink + compress a photo in the browser so uploads stay fast on mobile data. */
function compress(file, maxSide = 1280, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('That file is not a readable image'));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxSide || height > maxSide) {
          const scale = maxSide / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export default function ScanModal({ open, onClose, onAdded }) {
  const toast = useToast();
  const cameraRef = useRef(null);
  const galleryRef = useRef(null);

  const [preview, setPreview] = useState(null);
  const [stage, setStage] = useState('pick'); // pick | scanning | review | saving
  const [found, setFound] = useState([]);

  useEffect(() => {
    if (!open) {
      setPreview(null);
      setFound([]);
      setStage('pick');
    }
  }, [open]);

  if (!open) return null;

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file');
      return;
    }

    try {
      setStage('scanning');
      const dataUrl = await compress(file);
      setPreview(dataUrl);
      const { ingredients } = await api('/api/ai/scan', { method: 'POST', body: { image: dataUrl } });
      if (!ingredients.length) {
        toast.error("Couldn't spot any ingredients — try a brighter, closer photo.");
        setStage('pick');
        setPreview(null);
        return;
      }
      setFound(ingredients.map((i) => ({ ...i, keep: true })));
      setStage('review');
    } catch (err) {
      toast.error(err.message);
      setStage('pick');
      setPreview(null);
    }
  }

  async function save() {
    const items = found.filter((f) => f.keep).map(({ title, description }) => ({ title, description }));
    if (!items.length) {
      toast.error('Select at least one ingredient');
      return;
    }
    setStage('saving');
    try {
      const res = await api('/api/items/bulk', { method: 'POST', body: { items } });
      toast.success(`Added ${res.items.length} ingredient${res.items.length > 1 ? 's' : ''} to your kitchen`);
      onAdded(res.items);
      onClose();
    } catch (err) {
      toast.error(err.message);
      setStage('review');
    }
  }

  const toggle = (idx) =>
    setFound((f) => f.map((x, i) => (i === idx ? { ...x, keep: !x.keep } : x)));
  const edit = (idx, key, value) =>
    setFound((f) => f.map((x, i) => (i === idx ? { ...x, [key]: value } : x)));

  const keepCount = found.filter((f) => f.keep).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-sm sm:items-center sm:p-5"
      onClick={stage === 'scanning' || stage === 'saving' ? undefined : onClose}
    >
      <div
        className="rise flex max-h-[92vh] w-full max-w-lg flex-col rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="text-lg font-bold text-slate-900">
            {stage === 'review' ? 'Confirm ingredients' : 'Snap your ingredients'}
          </h3>
          <button
            onClick={onClose}
            disabled={stage === 'scanning' || stage === 'saving'}
            className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 disabled:opacity-40"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* hidden inputs: capture="environment" opens the rear camera on phones */}
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={handleFile} className="hidden" />
          <input ref={galleryRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />

          {stage === 'pick' && (
            <>
              <div className="grid place-items-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/60 px-6 py-10 text-center">
                <span className="text-5xl">📸</span>
                <p className="mt-3 font-semibold text-slate-800">Point at your fridge or counter</p>
                <p className="mt-1 max-w-xs text-sm leading-relaxed text-slate-500">
                  SnapChef will recognise the food and add it to your kitchen for you.
                </p>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <button onClick={() => cameraRef.current?.click()} className="btn-primary py-3.5 text-base">
                  📷 Take photo
                </button>
                <button onClick={() => galleryRef.current?.click()} className="btn-ghost py-3.5 text-base">
                  🖼️ Upload photo
                </button>
              </div>
              <p className="mt-4 text-center text-xs leading-relaxed text-slate-400">
                Good light and a close-up work best. Your photo is sent securely to our server for
                recognition and is never stored.
              </p>
            </>
          )}

          {stage === 'scanning' && (
            <div className="grid place-items-center gap-4 py-8">
              {preview && (
                <img src={preview} alt="Your ingredients" className="max-h-52 rounded-2xl object-cover shadow-soft" />
              )}
              <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-emerald-200 border-t-emerald-600" />
              <p className="text-sm font-medium text-slate-500">SnapChef is looking at your photo…</p>
            </div>
          )}

          {(stage === 'review' || stage === 'saving') && (
            <>
              {preview && (
                <img src={preview} alt="Your ingredients" className="mb-4 max-h-40 w-full rounded-2xl object-cover shadow-soft" />
              )}
              <p className="mb-3 text-sm text-slate-500">
                Found <b className="text-slate-700">{found.length}</b> — untick anything wrong, or tap to edit.
              </p>
              <div className="space-y-2">
                {found.map((f, idx) => (
                  <div
                    key={idx}
                    className={`rounded-xl border p-3 transition ${
                      f.keep ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200 bg-slate-50 opacity-60'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={f.keep}
                        onChange={() => toggle(idx)}
                        className="h-5 w-5 shrink-0 accent-emerald-600"
                      />
                      <input
                        value={f.title}
                        onChange={(e) => edit(idx, 'title', e.target.value)}
                        maxLength={80}
                        className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-[15px] font-semibold text-slate-900 outline-none focus:border-emerald-300 focus:bg-white"
                      />
                    </div>
                    <input
                      value={f.description}
                      onChange={(e) => edit(idx, 'description', e.target.value)}
                      maxLength={200}
                      placeholder="Add a note…"
                      className="mt-1 w-full rounded-lg border border-transparent bg-transparent px-2 py-1 pl-10 text-sm text-slate-500 outline-none focus:border-emerald-300 focus:bg-white"
                    />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {(stage === 'review' || stage === 'saving') && (
          <div className="flex gap-2 border-t border-slate-100 px-6 py-4">
            <button
              onClick={() => { setStage('pick'); setPreview(null); setFound([]); }}
              disabled={stage === 'saving'}
              className="btn-ghost flex-1 py-3"
            >
              Retake
            </button>
            <button onClick={save} disabled={stage === 'saving' || keepCount === 0} className="btn-primary flex-[2] py-3">
              {stage === 'saving' ? 'Adding…' : `Add ${keepCount} to kitchen`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
