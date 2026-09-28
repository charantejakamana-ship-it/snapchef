/**
 * Estimates what an ingredient is worth in Indian Rupees, so SnapChef can
 * show users how much food (and money) they actually rescued.
 *
 * Strategy: a fast local table covers everyday staples instantly; anything
 * unknown goes to Gemini once. Every path has a safe fallback, so adding an
 * item NEVER fails just because pricing was unavailable.
 */

// Rough retail value of a typical household portion, in ₹.
const TABLE = [
  [/\b(paneer|cheese|paner)\b/i, 90],
  [/\b(chicken|mutton|lamb|prawn|shrimp|fish|meat)\b/i, 180],
  [/\b(egg)/i, 50],
  [/\b(milk|curd|yogh?urt|dahi|buttermilk)\b/i, 55],
  [/\b(butter|ghee|cream)\b/i, 110],
  [/\b(rice|basmati)\b/i, 70],
  [/\b(atta|flour|maida|bread|bun|pav|roti|chapati|noodle|pasta|macaroni)\b/i, 45],
  [/\b(dal|daal|lentil|rajma|chana|chickpea|bean|soy)\b/i, 60],
  [/\b(tomato|onion|potato|aloo|pyaz)\b/i, 30],
  [/\b(spinach|palak|lettuce|cabbage|cauliflower|broccoli|methi|coriander|cilantro|mint)\b/i, 35],
  [/\b(carrot|beet|radish|cucumber|pumpkin|gourd|brinjal|eggplant|okra|bhindi|peas|corn|capsicum|pepper)\b/i, 35],
  [/\b(apple|banana|mango|orange|grape|papaya|melon|berry|berries|pomegranate|guava|pear|kiwi)\b/i, 60],
  [/\b(lemon|lime|chilli|chili|ginger|garlic|curry leaf)\b/i, 20],
  [/\b(oil|masala|spice|turmeric|cumin|salt|sugar|sauce|ketchup|vinegar|honey|jam)\b/i, 40],
  [/\b(biscuit|chocolate|snack|chips|cake|sweet)\b/i, 50],
  [/\b(juice|soda|drink|water)\b/i, 40],
];

const DEFAULT_VALUE = 40;
const MIN = 5;
const MAX = 2000;

export const clampValue = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return null;
  return Math.round(Math.min(MAX, Math.max(MIN, v)));
};

/** Instant local guess. Returns null when nothing matches. */
export function localEstimate(title = '') {
  for (const [re, value] of TABLE) {
    if (re.test(title)) return value;
  }
  return null;
}

/** Ask Gemini for prices we don't recognise. Never throws. */
async function aiEstimate(titles) {
  const key = process.env.GEMINI_API_KEY;
  if (!key || titles.length === 0) return {};

  const prompt = `You price groceries for an Indian household.
For each item below, give the typical retail value in Indian Rupees of the
quantity a household would normally buy. Numbers only, no currency symbols.

Respond with ONLY a JSON object mapping the exact item name to a number:
{"Item name": 45}

Items:
${titles.map((t) => `- ${t}`).join('\n')}`;

  const models = ['gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-flash-latest'];
  for (const model of models) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0, maxOutputTokens: 600 },
          }),
          signal: controller.signal,
        }
      );
      clearTimeout(timer);
      if (!r.ok) continue;
      const json = await r.json();
      const text = (json?.candidates?.[0]?.content?.parts || [])
        .map((p) => p.text || '')
        .join('');
      const s = text.indexOf('{');
      const e = text.lastIndexOf('}');
      if (s === -1 || e <= s) continue;
      return JSON.parse(text.slice(s, e + 1));
    } catch {
      /* try the next model */
    }
  }
  return {};
}

/**
 * @param {string[]} titles
 * @returns {Promise<number[]>} a ₹ value for every title, same order
 */
export async function estimateValues(titles) {
  const values = titles.map(localEstimate);
  const unknown = titles.filter((t, i) => values[i] === null);

  if (unknown.length) {
    const ai = await aiEstimate([...new Set(unknown)]);
    const lower = {};
    for (const [k, v] of Object.entries(ai)) lower[String(k).toLowerCase().trim()] = v;
    titles.forEach((t, i) => {
      if (values[i] === null) values[i] = clampValue(lower[t.toLowerCase().trim()]);
    });
  }

  return values.map((v) => v ?? DEFAULT_VALUE);
}
