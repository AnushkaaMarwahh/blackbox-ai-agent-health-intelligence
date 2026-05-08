# Deploying Blackbox to Vercel

This repo is set up so the **whole app — React frontend + FastAPI backend — deploys as one Vercel project**, no separate backend host, no required external database.

## TL;DR

1. Push the repo to GitHub.
2. In Vercel: **Add New Project → Import** the repo. Accept defaults (the `vercel.json` configures everything).
3. **Settings → Environment Variables** → add:
   - `EMERGENT_LLM_KEY` = `sk-emergent-…` (from your Emergent profile, "Universal Key")
   - *(optional)* `MONGO_URL` = MongoDB Atlas SRV string
   - *(optional)* `DB_NAME` = `blackbox`
4. Click **Deploy**. Done.

## How it's wired

```
repo/
├── api/
│   ├── index.py          ← FastAPI app, runs on Vercel Python serverless
│   └── requirements.txt  ← server-side deps incl. emergentintegrations
├── frontend/             ← Create-React-App, built by Vercel
│   ├── .env.production   ← REACT_APP_BACKEND_URL is empty here on purpose
│   └── …
├── vercel.json           ← rewrites /api/* → api/index.py, builds frontend
└── …
```

`vercel.json` does three things:

- Builds the React app from `/frontend` and serves the static bundle.
- Routes any `/api/*` request to the single Python serverless function `api/index.py`.
- Bumps `maxDuration` to 60s so Claude calls don't get killed (requires Vercel **Pro**; Hobby caps at 10s, see Caveats below).

## Frontend → Backend wiring

In `frontend/src/components/Blackbox.jsx`:

```js
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "";
const API = BACKEND_URL ? `${BACKEND_URL}/api` : "/api";
```

- **On Vercel:** `REACT_APP_BACKEND_URL` is empty → axios calls `/api/ask` (same origin). No CORS, no separate backend host.
- **Local Emergent preview:** `REACT_APP_BACKEND_URL` is set in `frontend/.env` → axios uses the absolute preview URL (existing FastAPI on port 8001).

Same code, both deployment models work.

## Environment variables on Vercel

| Variable | Required? | Where to get it | Notes |
|---|---|---|---|
| `EMERGENT_LLM_KEY` | ✅ Yes | Emergent profile → **Universal Key** | Server-side only. Frontend never sees it. |
| `MONGO_URL` | ⛔ Optional | mongodb.com/atlas (free tier) | If unset, `/api/ask` still works — it just skips the Q&A log write. |
| `DB_NAME` | ⛔ Optional | — | Defaults to `blackbox`. |
| `CORS_ORIGINS` | ⛔ Optional | — | Defaults to `*`. Tighten to your domain in production. |

**No `REACT_APP_BACKEND_URL`** on Vercel. Leaving it unset is what makes the frontend use a same-origin relative path.

## Feature compatibility on Vercel

| Feature | Works? | Notes |
|---|---|---|
| Ask Blackbox (Claude Sonnet 4.5) | ✅ | Buffered response + client-side typewriter. No SSE involved, so serverless-safe. |
| PDF export | ✅ | 100% browser (jsPDF + html2canvas). Vercel doesn't touch it. |
| Weekly Report / Overview / Drilldowns | ✅ | All client-side React. |
| Q&A log persistence | ⛔ optional | Only if `MONGO_URL` is set. |

## Caveats

1. **Cold starts.** First request after idle = 3–5s Python boot. After that, fast.
2. **Hobby plan timeout = 10s.** Claude usually answers in 3–8s, so you'll mostly be fine, but long answers can trip 504s. **Pro plan = 60s** removes this entirely. The `maxDuration: 60` in `vercel.json` is honored on Pro.
3. **`emergentintegrations` install.** `api/requirements.txt` already has the right `--extra-index-url`. If Vercel build logs show "package not found", verify that line is intact.
4. **Tightening CORS.** Once deployed, set `CORS_ORIGINS` on Vercel to `https://your-app.vercel.app` (or your custom domain) instead of `*`.

## Local dev still works

This refactor **does not break Emergent local preview**. The original `/app/backend/server.py` is untouched and supervisor still runs it on port 8001. `frontend/.env` (not `.env.production`) still holds the absolute Emergent URL. You develop on Emergent, deploy to Vercel.

## First-time deploy checklist

- [ ] Repo pushed to GitHub (use Emergent's "Save to GitHub" feature).
- [ ] Vercel project imported.
- [ ] `EMERGENT_LLM_KEY` set in Vercel env vars (Production + Preview).
- [ ] (Optional) `MONGO_URL` set if you want Q&A logs.
- [ ] First deploy succeeds.
- [ ] Smoke test: open the deployed URL → click **Ask Blackbox** → ask "what week is this?" → should return a clean answer that mentions the selected week label.
