import { createContext, useContext, useState, useCallback } from 'react';

const Ctx = createContext(null);
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const push = useCallback((message, type = 'success') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800);
  }, []);

  const toast = {
    success: (m) => push(m, 'success'),
    error: (m) => push(m, 'error'),
    info: (m) => push(m, 'info'),
  };

  const styles = {
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    error: 'border-rose-200 bg-rose-50 text-rose-700',
    info: 'border-sky-200 bg-sky-50 text-sky-800',
  };
  const icons = { success: '✅', error: '⚠️', info: 'ℹ️' };

  return (
    <Ctx.Provider value={toast}>
      {children}
      <div className="fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4 sm:bottom-6">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`rise w-full max-w-sm rounded-xl border px-4 py-3 text-sm font-medium shadow-soft backdrop-blur ${styles[t.type]}`}
          >
            <span className="mr-2">{icons[t.type]}</span>
            {t.message}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
