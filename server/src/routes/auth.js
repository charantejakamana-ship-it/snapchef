import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { supabase } from '../supabase.js';
import { signToken, requireAuth } from '../auth.js';

const router = Router();
const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e || '');

router.post('/signup', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const full_name = String(req.body.full_name || '').trim() || email.split('@')[0];

    if (!emailOk(email)) return res.status(400).json({ error: 'Please enter a valid email address' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const { data: existing } = await supabase.from('profiles').select('id').eq('email', email).maybeSingle();
    if (existing) return res.status(409).json({ error: 'An account with this email already exists' });

    const password_hash = await bcrypt.hash(password, 10);
    const { data, error } = await supabase
      .from('profiles')
      .insert({ email, full_name, password_hash })
      .select('id, email, full_name, created_at')
      .single();

    if (error) throw error;
    res.status(201).json({ token: signToken(data), user: data });
  } catch (e) {
    console.error('signup', e);
    res.status(500).json({ error: e.message || 'Could not create account' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

    const { data: user, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, password_hash, created_at')
      .eq('email', email)
      .maybeSingle();
    if (error) throw error;
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });

    const ok = await bcrypt.compare(password, user.password_hash || '');
    if (!ok) return res.status(401).json({ error: 'Invalid email or password' });

    delete user.password_hash;
    res.json({ token: signToken(user), user });
  } catch (e) {
    console.error('login', e);
    res.status(500).json({ error: e.message || 'Could not log in' });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, created_at')
    .eq('id', req.user.id)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(401).json({ error: 'Account not found' });
  res.json({ user: data });
});

router.put('/me', requireAuth, async (req, res) => {
  const full_name = String(req.body.full_name || '').trim();
  if (!full_name) return res.status(400).json({ error: 'Name cannot be empty' });
  const { data, error } = await supabase
    .from('profiles')
    .update({ full_name })
    .eq('id', req.user.id)
    .select('id, email, full_name, created_at')
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ user: data });
});

export default router;
