import { Groq } from 'groq-sdk';

const GROQ_MODEL = process.env.GROQ_MODEL || 'moonshotai/kimi-k2-instruct-0905';

export default async function handler(req, res) {
  const key = process.env.GROQ_API_KEY;
  if (!key) {
    console.error('callApi: missing GROQ_API_KEY');
    return res.status(500).json({ ok: false, error: 'server_misconfigured' });
  }

  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      provider: 'groq',
      model: GROQ_MODEL,
    });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method not allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body || '{}');
    } catch {
      body = {};
    }
  }

  const prompt = (body?.prompt || '').trim();
  const temperature = Number.isFinite(body?.temperature) ? body.temperature : 0.6;
  const maxTokens = Number.isFinite(body?.max_tokens) ? body.max_tokens : 256;

  if (!prompt) {
    return res.status(400).json({ error: 'prompt is required' });
  }

  try {
    const groq = new Groq({ apiKey: key });
    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      temperature,
      max_completion_tokens: maxTokens,
      top_p: 1,
      stream: false,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = completion?.choices?.[0]?.message?.content?.trim() || '';
    return res.status(200).json({ response: text });
  } catch (err) {
    console.error('callApi Groq error:', err?.message || err);
    return res.status(502).json({ error: 'llm request failed' });
  }
}
