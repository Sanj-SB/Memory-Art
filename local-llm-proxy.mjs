import express from 'express';
import cors from 'cors';
import { Groq } from 'groq-sdk';

const app = express();
const PORT = process.env.PORT || 3001;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || 'moonshotai/kimi-k2-instruct-0905';

if (!GROQ_API_KEY) {
  console.error('Missing GROQ_API_KEY. Export it before running server.');
  process.exit(1);
}

const groq = new Groq({ apiKey: GROQ_API_KEY });

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/api/llm/health', (_req, res) => {
  res.json({ ok: true, provider: 'groq', model: GROQ_MODEL });
});

app.post('/api/llm/chat', async (req, res) => {
  try {
    const prompt = (req.body?.prompt || '').trim();
    const temperature = Number.isFinite(req.body?.temperature) ? req.body.temperature : 0.6;
    const maxTokens = Number.isFinite(req.body?.max_tokens) ? req.body.max_tokens : 256;

    if (!prompt) {
      return res.status(400).json({ error: 'prompt is required' });
    }

    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      temperature,
      max_completion_tokens: maxTokens,
      top_p: 1,
      stream: false,
      messages: [{ role: 'user', content: prompt }],
    });

    const response = completion?.choices?.[0]?.message?.content?.trim() || '';
    res.json({ response });
  } catch (err) {
    console.error('Groq request failed:', err?.message || err);
    res.status(502).json({ error: 'llm request failed' });
  }
});

app.listen(PORT, () => {
  console.log(`Groq proxy listening on http://localhost:${PORT}`);
});
