import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useToast } from './Toast.jsx';

const LANGS = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिन्दी — Hindi' },
  { code: 'te', label: 'తెలుగు — Telugu' },
  { code: 'ta', label: 'தமிழ் — Tamil' },
  { code: 'kn', label: 'ಕನ್ನಡ — Kannada' },
  { code: 'ml', label: 'മലയാളം — Malayalam' },
  { code: 'mr', label: 'मराठी — Marathi' },
  { code: 'bn', label: 'বাংলা — Bengali' },
  { code: 'gu', label: 'ગુજરાતી — Gujarati' },
  { code: 'pa', label: 'ਪੰਜਾਬੀ — Punjabi' },
  { code: 'ur', label: 'اردو — Urdu' },
  { code: 'es', label: 'Español — Spanish' },
  { code: 'fr', label: 'Français — French' },
  { code: 'de', label: 'Deutsch — German' },
  { code: 'it', label: 'Italiano — Italian' },
  { code: 'pt', label: 'Português — Portuguese' },
  { code: 'ar', label: 'العربية — Arabic' },
  { code: 'ja', label: '日本語 — Japanese' },
  { code: 'ko', label: '한국어 — Korean' },
  { code: 'zh', label: '中文 — Mandarin' },
  { code: 'id', label: 'Indonesia — Indonesian' },
  { code: 'ru', label: 'Русский — Russian' },
  { code: 'tr', label: 'Türkçe — Turkish' },
  { code: 'nl', label: 'Nederlands — Dutch' },
];

const VOICES = [
  { id: 'Kore', label: 'Kore — warm' },
  { id: 'Puck', label: 'Puck — upbeat' },
  { id: 'Charon', label: 'Charon — deep' },
  { id: 'Aoede', label: 'Aoede — bright' },
  { id: 'Leda', label: 'Leda — gentle' },
];

const LANG_KEY = 'snapchef_lang';
const VOICE_KEY = 'snapchef_voice';

export default function VoicePlayer({ text }) {
  const toast = useToast();
  const audioRef = useRef(null);
  const urlRef = useRef(null);

  const [lang, setLang] = useState(() => localStorage.getItem(LANG_KEY) || 'en');
  const [voice, setVoice] = useState(() => localStorage.getItem(VOICE_KEY) || 'Kore');
  const [loading, setLoading] = useState(false);
  const [src, setSrc] = useState(null);
  const [script, setScript] = useState('');
  const [showScript, setShowScript] = useState(false);

  // Free the blob URL when we swap audio or unmount.
  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  // A new recipe means the old audio no longer matches it.
  useEffect(() => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    setSrc(null);
    setScript('');
    setShowScript(false);
  }, [text]);

  function remember(key, value, setter) {
    localStorage.setItem(key, value);
    setter(value);
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    setSrc(null); // settings changed -> regenerate
    setScript('');
  }

  async function speak() {
    setLoading(true);
    try {
      const data = await api('/api/ai/speak', { method: 'POST', body: { text, lang, voice } });
      const bytes = Uint8Array.from(atob(data.audio), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: data.mimeType || 'audio/wav' }));
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = url;
      setSrc(url);
      setScript(data.text || '');
      // autoplay once it's ready (user gesture started this, so browsers allow it)
      setTimeout(() => audioRef.current?.play().catch(() => {}), 60);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }

  const langLabel = LANGS.find((l) => l.code === lang)?.label || 'English';

  return (
    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
      <div className="flex items-center gap-2">
        <span className="text-lg">🔊</span>
        <p className="text-sm font-bold text-slate-800">Read this recipe aloud</p>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">Language</span>
          <select
            value={lang}
            onChange={(e) => remember(LANG_KEY, e.target.value, setLang)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/10"
          >
            {LANGS.map((l) => (
              <option key={l.code} value={l.code}>{l.label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">Voice</span>
          <select
            value={voice}
            onChange={(e) => remember(VOICE_KEY, e.target.value, setVoice)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/10"
          >
            {VOICES.map((v) => (
              <option key={v.id} value={v.id}>{v.label}</option>
            ))}
          </select>
        </label>
      </div>

      {!src ? (
        <button onClick={speak} disabled={loading} className="btn-primary mt-3 w-full py-3">
          {loading ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              Recording your narration…
            </>
          ) : (
            <>▶ Listen in {langLabel.split(' — ')[0]}</>
          )}
        </button>
      ) : (
        <div className="mt-3">
          <audio ref={audioRef} src={src} controls className="w-full" preload="auto" />
          <div className="mt-2 flex flex-wrap gap-2">
            <button onClick={speak} disabled={loading} className="btn-ghost flex-1 px-3 py-2 text-xs">
              {loading ? 'Working…' : '↻ Regenerate'}
            </button>
            {script && (
              <button onClick={() => setShowScript((s) => !s)} className="btn-ghost flex-1 px-3 py-2 text-xs">
                {showScript ? 'Hide script' : '📄 Show script'}
              </button>
            )}
            <a href={src} download={`snapchef-recipe-${lang}.wav`} className="btn-ghost flex-1 px-3 py-2 text-center text-xs">
              ⬇ Download
            </a>
          </div>
          {showScript && script && (
            <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-xl bg-white p-3 font-sans text-sm leading-relaxed text-slate-600">
              {script}
            </pre>
          )}
        </div>
      )}

      {loading && (
        <p className="mt-2 text-center text-xs text-slate-400">
          Translating and voicing — this usually takes 10–20 seconds.
        </p>
      )}
    </div>
  );
}
