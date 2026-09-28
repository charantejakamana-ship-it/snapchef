import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, setToken, clearToken, getToken } from './api';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!getToken()) { setLoading(false); return; }
      try {
        const { user } = await api('/api/auth/me');
        if (alive) setUser(user);
      } catch {
        clearToken();
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const login = useCallback(async (email, password) => {
    const d = await api('/api/auth/login', { method: 'POST', auth: false, body: { email, password } });
    setToken(d.token); setUser(d.user); return d.user;
  }, []);

  const signup = useCallback(async (full_name, email, password) => {
    const d = await api('/api/auth/signup', { method: 'POST', auth: false, body: { full_name, email, password } });
    setToken(d.token); setUser(d.user); return d.user;
  }, []);

  const logout = useCallback(() => { clearToken(); setUser(null); }, []);

  return (
    <AuthCtx.Provider value={{ user, setUser, loading, login, signup, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}
