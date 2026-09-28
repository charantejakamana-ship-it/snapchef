import { Router } from 'express';
import { supabase } from '../supabase.js';
import { requireAuth } from '../auth.js';

const router = Router();
// Models are tried in order, so a retired model never breaks the app.
const MODELS = [
  process.env.GEMINI_MODEL,
  'gemini-3.8-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-flash-latest',
].filter((m, i, a) => m && a.indexOf(m) === i);

async function tryModel(model, key, prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const r = await fetch(url, {
    method: 'POST',
    // header auth works for both AIza... and AQ... style keys
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.8, maxOutputTokens: 2048 },
    }),
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(json?.error?.message || `Gemini request failed (${r.status})`);
    err.status = r.status;
    throw err;
  }
  const text = (json?.candidates?.[0]?.content?.parts || [])
    .map((p) => p.text || '')
    .join('')
    .trim();
  if (!text) throw new Error('The AI returned an empty response, please try again');
  return text;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Retry these: model gone / bad request / rate limit / overloaded / server error.
const RECOVERABLE = new Set([400, 404, 429, 500, 503]);

async function callGemini(prompt) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('AI is not configured yet (missing GEMINI_API_KEY on the server)');

  let last;
  // Two passes over the model list with growing backoff — rides out
  // temporary "high demand" spikes instead of failing the user.
  for (let attempt = 0; attempt < 3; attempt++) {
    for (const model of MODELS) {
      try {
        return await tryModel(model, key, prompt);
      } catch (e) {
        last = e;
        if (e.status && !RECOVERABLE.has(e.status)) throw e;
        console.warn(`[ai] ${model} failed (${e.status || 'n/a'}), falling over`);
        await sleep(500 * Math.pow(2, attempt));
      }
    }
  }
  if (last && [429, 500, 503].includes(last.status)) {
    throw new Error('SnapChef is a little busy right now — please try again in a few seconds.');
  }
  throw last || new Error('No Gemini model available');
}

const PROMPTS = {
  recipe: (ctx, extra) => `You are SnapChef, a friendly zero-waste kitchen assistant.
Using ONLY (or mostly) these ingredients a user already has at home:
${ctx}

Create ONE delicious, realistic recipe. ${extra || ''}
Format in clean markdown-free plain text with these sections and nothing else:
DISH: <name>
TIME: <total minutes>
USES: <comma separated ingredients from the list>
STEPS:
1. ...
2. ...
CHEF TIP: <one short tip>`,

  summary: (ctx, extra) => `You are SnapChef. Here is one kitchen item a user has:
${ctx}
${extra || ''}
In 1-2 short sentences (max 40 words), say how to store it best and one quick way to use it before it spoils. Plain text only, no markdown.`,

  waste: (ctx) => `You are SnapChef, a food-waste reduction coach. The user's kitchen inventory:
${ctx}

Give a short plain-text report, no markdown symbols:
USE FIRST: <2-3 items most likely to spoil soon and why>
QUICK WINS: three one-line ideas to use them up
SAVE: one line estimating money/food saved this week by using these up.`,

  shopping: (ctx) => `You are SnapChef. User's current inventory:
${ctx}

Suggest a short smart shopping list (max 7 items) of cheap staples that would unlock the most new meals from what they ALREADY have. Plain text, one item per line as "- item — what it unlocks". No markdown headers.`,
};

// POST /api/ai/generate  { mode, itemId?, prompt? }
router.post('/generate', requireAuth, async (req, res) => {
  try {
    const mode = String(req.body.mode || 'recipe');
    const extra = String(req.body.prompt || '').slice(0, 500);

    let ctx = '';
    if (mode === 'summary' && req.body.itemId) {
      const { data: item } = await supabase
        .from('items').select('*').eq('id', req.body.itemId).eq('user_id', req.user.id).maybeSingle();
      if (!item) return res.status(404).json({ error: 'Item not found' });
      ctx = `- ${item.title}${item.description ? ` (${item.description})` : ''}`;
    } else {
      const { data: items } = await supabase
        .from('items').select('title, description').eq('user_id', req.user.id).order('created_at', { ascending: false });
      if (!items || items.length === 0) {
        return res.status(400).json({ error: 'Add a few ingredients to your kitchen first!' });
      }
      ctx = items.map((i) => `- ${i.title}${i.description ? ` (${i.description})` : ''}`).join('\n');
    }

    const build = PROMPTS[mode] || PROMPTS.recipe;
    const text = await callGemini(build(ctx, extra));

    // Persist single-item summaries so they survive refresh
    if (mode === 'summary' && req.body.itemId) {
      await supabase.from('items').update({ ai_summary: text })
        .eq('id', req.body.itemId).eq('user_id', req.user.id);
    }

    res.json({ result: text, mode });
  } catch (e) {
    console.error('ai', e);
    res.status(500).json({ error: e.message || 'AI request failed' });
  }
});

export default router;
