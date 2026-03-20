import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

import callApiHandler from './api/callApi.js';

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, 'public');

// Parse JSON bodies for /api/callApi (POST)
app.use(express.json({ limit: '1mb' }));

// Server-side API route (Vercel route handling)
app.all('/api/callApi', (req, res) => callApiHandler(req, res));

// Serve the static site
app.use(express.static(publicDir));
app.get('/', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// SPA fallback: keep paths working when deep-linking.
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).end();
  res.sendFile(path.join(publicDir, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server running: http://localhost:${PORT}`);
});

