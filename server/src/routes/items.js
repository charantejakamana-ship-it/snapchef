import { Router } from 'express';
import { supabase } from '../supabase.js';
import { requireAuth } from '../auth.js';
import { estimateValues, clampValue } from '../priceEstimator.js';

const router = Router();
router.use(requireAuth);

// LIST own items
router.get('/', async (req, res) => {
  let q = supabase.from('items').select('*').eq('user_id', req.user.id);
  const status = String(req.query.status || 'in_kitchen');
  if (status !== 'all') q = q.eq('status', status);
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ items: data || [] });
});

// SAVINGS SUMMARY — how much money this user rescued
router.get('/summary', async (req, res) => {
  const { data, error } = await supabase
    .from('items')
    .select('status, value_inr, resolved_at')
    .eq('user_id', req.user.id);
  if (error) return res.status(500).json({ error: error.message });

  const rows = data || [];
  const sum = (f) => rows.filter(f).reduce((t, r) => t + Number(r.value_inr || 0), 0);
  const monthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

  res.json({
    saved: Math.round(sum((r) => r.status === 'used')),
    savedThisMonth: Math.round(
      sum((r) => r.status === 'used' && r.resolved_at && new Date(r.resolved_at).getTime() >= monthAgo)
    ),
    wasted: Math.round(sum((r) => r.status === 'wasted')),
    inKitchen: Math.round(sum((r) => r.status === 'in_kitchen')),
    counts: {
      used: rows.filter((r) => r.status === 'used').length,
      wasted: rows.filter((r) => r.status === 'wasted').length,
      inKitchen: rows.filter((r) => r.status === 'in_kitchen').length,
    },
  });
});

// CREATE
router.post('/', async (req, res) => {
  const title = String(req.body.title || '').trim();
  const description = String(req.body.description || '').trim();
  if (!title) return res.status(400).json({ error: 'Ingredient name is required' });

  let value_inr = clampValue(req.body.value_inr);
  if (value_inr === null) {
    try { [value_inr] = await estimateValues([title]); } catch { value_inr = null; }
  }

  const { data, error } = await supabase
    .from('items')
    .insert({ user_id: req.user.id, title, description, value_inr })
    .select('*')
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ item: data });
});

// BULK CREATE (used by the camera scanner)
router.post('/bulk', async (req, res) => {
  const list = Array.isArray(req.body.items) ? req.body.items : [];
  const rows = list
    .map((i) => ({
      user_id: req.user.id,
      title: String(i?.title || '').trim().slice(0, 80),
      description: String(i?.description || '').trim().slice(0, 200),
    }))
    .filter((r) => r.title)
    .slice(0, 15);

  if (rows.length === 0) return res.status(400).json({ error: 'No ingredients to add' });

  // Prices supplied by the photo scanner are reused; the rest are estimated.
  const supplied = list.map((i) => clampValue(i?.value_inr));
  const needIdx = rows.map((_, i) => i).filter((i) => supplied[i] === null || supplied[i] === undefined);
  let estimated = [];
  if (needIdx.length) {
    try { estimated = await estimateValues(needIdx.map((i) => rows[i].title)); } catch { estimated = []; }
  }
  rows.forEach((r, i) => { r.value_inr = supplied[i] ?? null; });
  needIdx.forEach((rowIdx, k) => { rows[rowIdx].value_inr = estimated[k] ?? null; });

  const { data, error } = await supabase.from('items').insert(rows).select('*');
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ items: data || [] });
});

// MARK AS USED / WASTED / BACK IN KITCHEN
router.patch('/:id/status', async (req, res) => {
  const status = String(req.body.status || '');
  if (!['in_kitchen', 'used', 'wasted'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  const { data, error } = await supabase
    .from('items')
    .update({ status, resolved_at: status === 'in_kitchen' ? null : new Date().toISOString() })
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select('*')
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Item not found' });
  res.json({ item: data });
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
  if (req.body.value_inr !== undefined) patch.value_inr = clampValue(req.body.value_inr);

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
