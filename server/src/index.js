import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import { supabase } from './supabase.js';
import authRoutes from './routes/auth.js';
import itemRoutes from './routes/items.js';
import aiRoutes from './routes/ai.js';

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '10mb' }));

const allowed = (process.env.CLIENT_URL || '')
  .split(',')
  .map((s) => s.trim().replace(/\/$/, ''))
  .filter(Boolean);

app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true); // curl / server-to-server
      const clean = origin.replace(/\/$/, '');
      if (
        allowed.length === 0 ||
        allowed.includes(clean) ||
        /^http:\/\/localhost(:\d+)?$/.test(clean) ||
        /^http:\/\/127\.0\.0\.1(:\d+)?$/.test(clean) ||
        /\.vercel\.app$/.test(new URL(clean).hostname) ||
        /\.e2b\.app$/.test(new URL(clean).hostname)
      ) return cb(null, true);
      return cb(null, false);
    },
    credentials: false,
  })
);

app.get('/', (_req, res) => res.json({ name: 'SnapChef API', status: 'ok' }));
app.get('/api/health', (_req, res) =>
  res.json({
    ok: true,
    supabase: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
    ai: Boolean(process.env.GEMINI_API_KEY),
    time: new Date().toISOString(),
  })
);

// Public, fully aggregated community stats for the landing page.
// No personal data is exposed — only totals.
let statsCache = { at: 0, data: null };
app.get('/api/stats', async (_req, res) => {
  try {
    if (statsCache.data && Date.now() - statsCache.at < 60_000) {
      return res.json(statsCache.data);
    }
    const [{ count: cooks }, { data: rows }, { count: users }] = await Promise.all([
      supabase.from('items').select('id', { count: 'exact', head: true }),
      supabase.from('items').select('status, value_inr'),
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
    ]);
    const list = rows || [];
    const saved = list
      .filter((r) => r.status === 'used')
      .reduce((t, r) => t + Number(r.value_inr || 0), 0);
    const data = {
      rupeesSaved: Math.round(saved),
      ingredientsTracked: cooks || 0,
      mealsRescued: list.filter((r) => r.status === 'used').length,
      cooks: users || 0,
    };
    statsCache = { at: Date.now(), data };
    res.json(data);
  } catch (e) {
    res.json({ rupeesSaved: 0, ingredientsTracked: 0, mealsRescued: 0, cooks: 0 });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/ai', aiRoutes);

app.use((_req, res) => res.status(404).json({ error: 'Route not found' }));
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Server error' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => console.log(`SnapChef API listening on :${PORT}`));
