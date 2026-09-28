import { Router } from 'express';
import { supabase } from '../supabase.js';
import { requireAuth } from '../auth.js';
import { clampValue } from '../priceEstimator.js';

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
Assume a normal home kitchen also has basic salt, pepper, cooking oil and water.
If the chosen style needs a signature item the user lacks, suggest the closest
substitute from their list rather than inventing ingredients.
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
const CUISINES = {
  any: '',
  southindian: 'South Indian',
  northindian: 'North Indian',
  chinese: 'Chinese (Indo-Chinese or authentic)',
  korean: 'Korean',
  japanese: 'Japanese',
  thai: 'Thai',
  italian: 'Italian',
  mexican: 'Mexican',
  mediterranean: 'Mediterranean',
  american: 'American comfort food',
  continental: 'Continental / European',
  middleeastern: 'Middle Eastern',
};

const MEALS = {
  any: '',
  breakfast: 'breakfast',
  lunch: 'lunch',
  snack: 'a light snack or starter',
  dinner: 'dinner',
  dessert: 'a dessert',
};

function buildStyleBrief({ cuisine, meal, diet, quick, spicy, note }) {
  const bits = [];
  const c = CUISINES[cuisine];
  if (c) bits.push(`Make it ${c} style, with flavours and techniques true to that cuisine.`);
  const m = MEALS[meal];
  if (m) bits.push(`It should work as ${m}.`);
  if (diet === 'veg') bits.push('It must be strictly vegetarian (no meat, fish or egg).');
  if (diet === 'vegan') bits.push('It must be vegan (no meat, fish, egg or dairy).');
  if (diet === 'highprotein') bits.push('Prioritise a high-protein result.');
  if (quick) bits.push('Keep total time under 20 minutes.');
  if (spicy) bits.push('Make it properly spicy.');
  if (note) bits.push(`Also consider: ${note}`);
  return bits.join(' ');
}

router.post('/generate', requireAuth, async (req, res) => {
  try {
    const mode = String(req.body.mode || 'recipe');
    let extra = String(req.body.prompt || '').slice(0, 500);

    if (mode === 'recipe') {
      extra = buildStyleBrief({
        cuisine: String(req.body.cuisine || 'any'),
        meal: String(req.body.meal || 'any'),
        diet: String(req.body.diet || 'any'),
        quick: Boolean(req.body.quick),
        spicy: Boolean(req.body.spicy),
        note: extra,
      });
    }

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
[{"title":"Ingredient name","description":"short visible detail like quantity, size or ripeness","value_inr":45}]

Rules:
- "title" = 1-3 words, singular, capitalised (e.g. "Red Onion", "Greek Yogurt").
- "description" = max 8 words describing what you SEE (e.g. "3 medium, slightly soft").
- "value_inr" = typical retail value in Indian Rupees of the visible quantity (a plain number).
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
        value_inr: clampValue(i?.value_inr),
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

/* ------------------------------------------------------------------
   POST /api/ai/speak  { text, lang, voice }
   Reads a recipe aloud with a real AI voice, translating first
   when the user picks a language other than English.
------------------------------------------------------------------- */
const TTS_MODELS = ['gemini-3.8-flash-tts', 'gemini-2.5-flash-preview-tts'];

export const LANGUAGES = {
  en: 'English',
  hi: 'Hindi',
  te: 'Telugu',
  ta: 'Tamil',
  kn: 'Kannada',
  ml: 'Malayalam',
  mr: 'Marathi',
  bn: 'Bengali',
  gu: 'Gujarati',
  pa: 'Punjabi',
  ur: 'Urdu',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  ar: 'Arabic',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Mandarin Chinese',
  id: 'Indonesian',
  ru: 'Russian',
  tr: 'Turkish',
  nl: 'Dutch',
};

const VOICES = new Set(['Kore', 'Puck', 'Charon', 'Aoede', 'Fenrir', 'Leda']);

/** Raw 16-bit PCM from Gemini -> a .wav file the browser can play. */
function pcmToWav(pcm, sampleRate = 24000, channels = 1, bits = 16) {
  const byteRate = (sampleRate * channels * bits) / 8;
  const blockAlign = (channels * bits) / 8;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bits, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

async function synthesize(text, voice) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('AI is not configured yet (missing GEMINI_API_KEY on the server)');

  const body = JSON.stringify({
    contents: [{ parts: [{ text }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
    },
  });

  let last;
  for (let attempt = 0; attempt < 2; attempt++) {
    for (const model of TTS_MODELS) {
      try {
        const r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body }
        );
        const json = await r.json().catch(() => ({}));
        if (!r.ok) {
          const e = new Error(json?.error?.message || `TTS failed (${r.status})`);
          e.status = r.status;
          throw e;
        }
        const part = json?.candidates?.[0]?.content?.parts?.find(
          (p) => p.inlineData || p.inline_data
        );
        const inline = part?.inlineData || part?.inline_data;
        if (!inline?.data) throw new Error('No audio returned');

        const mime = inline.mimeType || inline.mime_type || '';
        const raw = Buffer.from(inline.data, 'base64');

        if (/wav/i.test(mime)) return raw; // already a playable wav
        const rate = Number((mime.match(/rate=(\d+)/) || [])[1]) || 24000;
        return pcmToWav(raw, rate);
      } catch (e) {
        last = e;
        if (e.status && !RECOVERABLE.has(e.status)) throw e;
        await sleep(500 * (attempt + 1));
      }
    }
  }
  if (last && [429, 500, 503].includes(last.status)) {
    throw new Error('The voice service is busy right now — please try again in a few seconds.');
  }
  throw last || new Error('Could not generate audio');
}

router.post('/speak', requireAuth, async (req, res) => {
  try {
    const source = String(req.body.text || '').trim().slice(0, 3000);
    const lang = String(req.body.lang || 'en');
    const voice = VOICES.has(req.body.voice) ? req.body.voice : 'Kore';

    if (!source) return res.status(400).json({ error: 'Nothing to read out' });
    if (!LANGUAGES[lang]) return res.status(400).json({ error: 'That language is not supported yet' });

    // 1. Translate + tidy into natural spoken form when needed.
    let spoken = source;
    const name = LANGUAGES[lang];
    if (lang === 'en') {
      spoken = await callGemini(
        `Rewrite this recipe as a natural spoken read-aloud script in English.
Keep every ingredient, quantity and step accurate. Expand labels like "DISH:" into
friendly speech (e.g. "Tonight we're making..."). No markdown, no bullet symbols,
no emoji. Return only the script.

${source}`
      );
    } else {
      spoken = await callGemini(
        `Translate this recipe into ${name} and rewrite it as a natural spoken
read-aloud script for a home cook. Keep every ingredient, quantity and step accurate.
Use ${name} script/characters. Keep well-known ingredient names recognisable.
No markdown, no bullet symbols, no emoji. Return only the ${name} script.

${source}`
      );
    }

    spoken = spoken.slice(0, 4000);

    // 2. Speak it.
    const instruction =
      lang === 'en'
        ? `Read this recipe aloud in a warm, friendly, clear voice at a relaxed pace:\n\n${spoken}`
        : `Read this ${name} recipe aloud in a warm, friendly, clear voice at a relaxed pace. Speak entirely in ${name}:\n\n${spoken}`;

    const wav = await synthesize(instruction, voice);

    res.json({
      audio: wav.toString('base64'),
      mimeType: 'audio/wav',
      text: spoken,
      lang,
      language: name,
    });
  } catch (e) {
    console.error('speak', e);
    res.status(500).json({ error: e.message || 'Could not read that aloud' });
  }
});

// Recipe style options the UI offers.
router.get('/options', (_req, res) => {
  res.json({
    cuisines: Object.entries(CUISINES).map(([id, label]) => ({ id, label: label || 'Surprise me' })),
    meals: Object.entries(MEALS).map(([id, label]) => ({ id, label: label || 'Any meal' })),
  });
});

// Languages the UI offers in its dropdown.
router.get('/languages', (_req, res) => {
  res.json({ languages: Object.entries(LANGUAGES).map(([code, label]) => ({ code, label })) });
});

export default router;
