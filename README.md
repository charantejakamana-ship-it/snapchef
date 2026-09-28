# 🥗 SnapChef — AI-Powered Fridge-to-Table & Food Waste Reducer

### 🌐 Live
| | |
|---|---|
| **App** | https://snapchef-tau.vercel.app |
| **API** | https://snapchef-api.onrender.com |
| **Repo** | https://github.com/charantejakamana-ship-it/snapchef |

> Note: the Render free tier sleeps after ~15 min idle, so the very first
> request after a nap can take 30-50 seconds. It is instant after that.

Add what's already in your fridge, and Gemini turns it into real recipes,
storage tips, a "use-first" waste report and a smart shopping list.

## Stack
- **client/** — React 18 + Vite + Tailwind (light theme, glassmorphism, mobile-first)
- **server/** — Node.js + Express REST API (all secrets live here)
- **Database** — Supabase Postgres (`profiles`, `items`, RLS enabled)
- **AI** — Google Gemini, called **only** from the backend

## Security
- No secret ever touches the client bundle. `client/.env` only holds `VITE_API_BASE_URL`.
- Passwords hashed with **bcrypt** (10 rounds); sessions are JWTs valid 30 days (cross-device).
- `.gitignore` excludes `.env`, `node_modules`, `dist`.

## Local dev
```bash
cd server && npm install && cp .env.example .env   # fill in keys
npm run setup:db      # creates tables + RLS automatically
npm run dev           # http://localhost:5000

cd ../client && npm install && npm run dev          # http://localhost:5173
```

## API
| Method | Route | Description |
|---|---|---|
| POST | `/api/auth/signup` | create account (bcrypt) |
| POST | `/api/auth/login` | log in, returns JWT |
| GET | `/api/auth/me` | current user |
| GET/POST | `/api/items` | list / create own items |
| PUT/DELETE | `/api/items/:id` | update / delete own item |
| POST | `/api/ai/generate` | Gemini: `recipe` \| `summary` \| `waste` \| `shopping` |
| GET | `/api/health` | health + config check |

## Deployment
- **Frontend** → Vercel (static build of `client/`, SPA rewrites via `client/vercel.json`)
- **Backend** → Render (`server/`, health check `/api/health`, auto-deploys on push to `main`)
- CORS is locked to the Vercel domain via the `CLIENT_URL` env var on Render.
- All secrets live in Render's environment variables + local `server/.env` (git-ignored).

## Tests
`server/test-e2e.sh` runs 20 end-to-end checks against any environment:
```bash
./server/test-e2e.sh                                  # local
./server/test-e2e.sh https://snapchef-api.onrender.com  # production
```
Covers auth, bcrypt, JWT sessions, CRUD, per-user isolation, validation and all AI modes.
