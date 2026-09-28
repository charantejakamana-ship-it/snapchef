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

async function tryModel(model, key, prompt, image) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const parts = [{ text: prompt }];
  if (image) parts.push({ inline_data: { mime_type: image.mimeType, data: image.data } });

  const r = await fetch(url, {
    method: 'POST',
    // header auth works for both AIza... and AQ... style keys
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: { temperature: image ? 0.2 : 0.8, maxOutputTokens: 2048 },
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

async function callGemini(prompt, image) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('AI is not configured yet (missing GEMINI_API_KEY on the server)');

  let last;
  // Two passes over the model list with growing backoff — rides out
  // temporary "high demand" spikes instead of failing the user.
  for (let attempt = 0; attempt < 3; attempt++) {
    for (const model of MODELS) {
      try {
        return await tryModel(model, key, prompt, image);
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

/* ------------------------------------------------------------------
   POST /api/ai/scan   { image: "data:image/jpeg;base64,..." }
   Photograph your fridge/counter -> Gemini vision lists the ingredients.
------------------------------------------------------------------- */
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

const SCAN_PROMPT = `You are SnapChef's ingredient scanner. Look at this photo of food items.

Identify every distinct FOOD ingredient you can actually see. Ignore people, pets,
furniture, utensils, packaging text you cannot read, and anything not edible.

Respond with ONLY a JSON array, no markdown fences, no commentary:
[{"title":"Ingredient name","description":"short visible detail like quantity, size or ripeness"}]

Rules:
- "title" = 1-3 words, singular, capitalised (e.g. "Red Onion", "Greek Yogurt").
- "description" = max 8 words describing what you SEE (e.g. "3 medium, slightly soft").
- Maximum 15 items. Merge duplicates.
- If you can see no edible food at all, respond with exactly: []`;

router.post('/scan', requireAuth, async (req, res) => {
  try {
    const raw = String(req.body.image || '');
    const m = raw.match(/^data:(image\/(?:jpeg|jpg|png|webp|heic|heif));base64,(.+)$/i);
    if (!m) {
      return res.status(400).json({ error: 'Please upload a valid JPEG, PNG or WebP photo.' });
    }
    const [, mimeType, data] = m;
    if (Buffer.byteLength(data, 'base64') > MAX_IMAGE_BYTES) {
      return res.status(413).json({ error: 'That photo is too large — please try a smaller one.' });
    }

    const text = await callGemini(SCAN_PROMPT, { mimeType, data });

    // Gemini occasionally wraps JSON in ``` fences — tolerate it.
    const cleaned = text.replace(/```json|```/gi, '').trim();
    const start = cleaned.indexOf('[');
    const end = cleaned.lastIndexOf(']');
    let parsed = [];
    if (start !== -1 && end > start) {
      try { parsed = JSON.parse(cleaned.slice(start, end + 1)); } catch { parsed = []; }
    }

    const ingredients = (Array.isArray(parsed) ? parsed : [])
      .map((i) => ({
        title: String(i?.title || '').trim().slice(0, 80),
        description: String(i?.description || '').trim().slice(0, 200),
      }))
      .filter((i) => i.title)
      .filter((i, idx, arr) => arr.findIndex((x) => x.title.toLowerCase() === i.title.toLowerCase()) === idx)
      .slice(0, 15);

    res.json({ ingredients });
  } catch (e) {
    console.error('scan', e);
    res.status(500).json({ error: e.message || 'Could not read that photo' });
  }
});

export default router;
