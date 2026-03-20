# Memories / Memory-Art

## Local dev

- **Groq proxy (optional):** `npm run llm-proxy` — runs `local-llm-proxy.mjs` on port 3001.
- **Static site:** `npm run dev:site` — serves the `public/` folder (use with the proxy for LLM features).

`server.mjs` was renamed to **`local-llm-proxy.mjs`** so Vercel does not treat this repo as an Express app (which caused **Cannot GET /** on the deployed site).

## Vercel

- Static assets live in **`public/`**. Serverless API: **`api/callApi.js`**.
- Set **`GROQ_API_KEY`** (and optionally **`GROQ_MODEL`**) in the project’s Environment Variables.
- If the site still 404s: **Project → Settings → General** → set **Output Directory** to **`public`**, **Framework Preset** to **Other**, and clear any custom **Start Command** / Node server entry (this app is static + `/api/*` only).
