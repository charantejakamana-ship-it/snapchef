import { Router } from 'express';
import { supabase } from '../supabase.js';
import { requireAuth } from '../auth.js';

const router = Router();
router.use(requireAuth);

// LIST own items
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('items')
    .select('*')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ items: data || [] });
});

// CREATE
router.post('/', async (req, res) => {
  const title = String(req.body.title || '').trim();
  const description = String(req.body.description || '').trim();
  if (!title) return res.status(400).json({ error: 'Ingredient name is required' });
  const { data, error } = await supabase
    .from('items')
    .insert({ user_id: req.user.id, title, description })
    .select('*')
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ item: data });
});

// UPDATE (own only)
router.put('/:id', async (req, res) => {
  const patch = {};
  if (req.body.title !== undefined) {
    const t = String(req.body.title).trim();
    if (!t) return res.status(400).json({ error: 'Ingredient name is required' });
    patch.title = t;
  }
  if (req.body.description !== undefined) patch.description = String(req.body.description).trim();
  if (req.body.ai_summary !== undefined) patch.ai_summary = String(req.body.ai_summary);

  const { data, error } = await supabase
    .from('items')
    .update(patch)
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select('*')
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Item not found' });
  res.json({ item: data });
});

// DELETE (own only)
router.delete('/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('items')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select('id')
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Item not found' });
  res.json({ ok: true, id: data.id });
});

export default router;
