// LLM integration: Vercel uses same-origin /api/callApi; local dev uses npm run llm-proxy on :3001.

const LLM_API_PATH = '/api/callApi';
const LLM_PROXY_URL = 'http://localhost:3001';
const LLM_MODEL = 'moonshotai/kimi-k2-instruct-0905';
let llmAvailable = false;

function isLocalDev() {
  const h = typeof location !== 'undefined' ? location.hostname : '';
  return h === 'localhost' || h === '127.0.0.1' || h === '';
}

function llmHealthUrl() {
  return isLocalDev() ? `${LLM_PROXY_URL}/api/llm/health` : LLM_API_PATH;
}

function llmChatUrl() {
  return isLocalDev() ? `${LLM_PROXY_URL}/api/llm/chat` : LLM_API_PATH;
}

/** Normalize for comparing whether merge/recall text actually changed. */
function normalizeMemoryText(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Pull assistant text from proxy / API JSON (handles wrapped OpenAI-style bodies). */
function extractLlmText(data) {
  if (data == null) return '';
  if (typeof data === 'string') return data.trim();
  const direct = data.response ?? data.text ?? data.output ?? data.message ?? data.content;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  if (Array.isArray(direct)) {
    const joined = direct.map((part) => {
      if (typeof part === 'string') return part;
      if (part && typeof part === 'object') return part.text ?? part.content ?? '';
      return '';
    }).join('');
    if (joined.trim()) return joined.trim();
  }
  const msg = data.choices?.[0]?.message;
  if (msg?.content != null) {
    const c = msg.content;
    if (typeof c === 'string') return c.trim();
    if (Array.isArray(c)) {
      return c.map((p) => (typeof p === 'string' ? p : p?.text ?? p?.content ?? '')).join('').trim();
    }
  }
  return typeof direct === 'string' ? direct.trim() : '';
}

async function checkLLM() {
  const healthUrl = llmHealthUrl();
  console.log(`[DEBUG:LLM] Checking LLM health at ${healthUrl}`);
  const indicator = document.getElementById('llmStatus');
  try {
    const res = await fetch(healthUrl, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) throw new Error('health check failed');
    const data = await res.json();
    llmAvailable = !!data.ok;
    console.log(`[DEBUG:LLM] Health check: available=${llmAvailable}`);
    if (indicator) indicator.textContent = llmAvailable ? `llm: ${LLM_MODEL}` : '';
  } catch (e) {
    llmAvailable = false;
    if (indicator) indicator.textContent = '';
    console.log(`[DEBUG:LLM] LLM proxy unavailable — will use local merge fallback`);
  }
}

async function llmGenerate(prompt, maxTokens, temperature) {
  if (!llmAvailable) return null;
  const temp = Number.isFinite(temperature) ? temperature : 0.6;
  console.log(`[DEBUG:LLM] llmGenerate (maxTokens=${maxTokens || 160}, temp=${temp})`);
  try {
    const res = await fetch(llmChatUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, max_tokens: maxTokens || 160, temperature: temp }),
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const result = extractLlmText(data);
    console.log(`[DEBUG:LLM] Response: "${result}"`);
    return result || null;
  } catch (e) {
    console.warn(`[DEBUG:LLM] llmGenerate failed: ${e.message || e}`);
    return null;
  }
}

/** Deterministic-ish “haze” when the model is off or echoes the input. */
function localRecallTransform(sentence) {
  const s = String(sentence || '').trim().toLowerCase();
  if (!s) return s;
  const words = s.split(/\s+/).filter(Boolean);
  const haze = ['almost', 'perhaps', 'vaguely', 'still', 'again', 'half'];
  const rng = mulberry32(hash32(s + 'recall') + Date.now() % 100000);

  if (words.length >= 2) {
    const h = haze[Math.floor(rng() * haze.length)];
    if (!words.slice(0, 4).some((w) => w === h)) {
      const insertAt = 1 + Math.floor(rng() * Math.min(2, words.length - 1));
      const out = words.slice();
      out.splice(insertAt, 0, h);
      return out.slice(0, 22).join(' ');
    }
  }
  if (words.length >= 2) {
    const i = Math.floor(rng() * (words.length - 1));
    const out = words.slice();
    const t = out[i];
    out[i] = out[i + 1];
    out[i + 1] = t;
    return out.join(' ');
  }
  return `${haze[0]} ${s}`.trim();
}

async function applyRecallTransform(sentence, options = {}) {
  const chainFromPrior = !!options.chainFromPrior;
  console.log(`[DEBUG:RECALL] applyRecallTransform: "${sentence}" (chain=${chainFromPrior})`);
  const normIn = normalizeMemoryText(sentence);

  const chainHint = chainFromPrior
    ? `\nThis line may already be imperfect from a prior recall — recall it again with a *different* small shift (do not return the same line unchanged).`
    : '';

  const prompt = `You are a memory. You are being recalled — not perfectly, but through the haze of time and feeling.

Memory text: "${sentence}"${chainHint}

Rewrite this memory as it might feel when recalled imperfectly — keep MOST of the sentence the same but change or expand just ONE phrase or detail. The core event and tone must remain the same. Do not add meta commentary.

Return ONLY the reimagined memory in one line, max 20 words. No quotes, no explanation, no preamble.`;

  let clean = '';
  if (llmAvailable) {
    const recallTemp = chainFromPrior ? 0.82 : 0.62;
    const result = await llmGenerate(prompt, 80, recallTemp);
    if (result) {
      clean = result.replace(/^["'“”‘’]|["'“”‘’]$/g, '').split('\n')[0].trim().toLowerCase();
    }
  }

  if (!clean || clean.length <= 5 || normalizeMemoryText(clean) === normIn) {
    clean = localRecallTransform(sentence);
  }

  console.log(`[DEBUG:RECALL] "${sentence}" → "${clean}"`);
  return clean;
}

// Local fallback: splice a word from the other memory into this one (same as pre-refactor GitHub build)
function localMergeSentence(mySentence, otherSentence) {
  const myWords = mySentence.split(/\s+/).filter((w) => w.length > 0);
  const otherWords = otherSentence.split(/\s+/).filter((w) => w.length > 0);
  if (otherWords.length < 1) return mySentence;

  const myLower = new Set(myWords.map((w) => w.toLowerCase()));

  let candidates = otherWords.filter((w) => w.length > 2 && !myLower.has(w.toLowerCase()));
  if (candidates.length === 0) {
    candidates = otherWords.filter((w) => w.length > 1 && !myLower.has(w.toLowerCase()));
  }
  if (candidates.length === 0) {
    const picked = otherWords[Math.floor(Math.random() * otherWords.length)];
    if (myWords.length < 2) {
      return `${myWords[0] || ''} ${picked}`.trim().slice(0, 140);
    }
    const insertIdx = 1 + Math.floor(Math.random() * Math.max(1, myWords.length - 1));
    const out = myWords.slice();
    out.splice(insertIdx, 0, picked);
    return out.slice(0, 18).join(' ');
  }

  const picked = candidates[Math.floor(Math.random() * candidates.length)];

  if (myWords.length < 2) {
    return `${myWords[0]} ${picked}`.trim().slice(0, 140);
  }

  const insertIdx = 1 + Math.floor(Math.random() * Math.max(1, myWords.length - 1));
  const out = myWords.slice();
  out.splice(insertIdx, 0, picked);

  return out.slice(0, 18).join(' ');
}

function stripQuotes(s) {
  return s.replace(/^["'“”‘’]|["'“”‘’]$/g, '').trim();
}

function firstSentenceLine(s) {
  const t = stripQuotes(s);
  const line = t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)[0] || t;
  return line.replace(/^[-*•]\s*/, '').trim();
}

function parseMergeAB(text) {
  if (!text || typeof text !== 'string') return null;
  let t = text.replace(/\r/g, '').replace(/\*\*/g, '');
  t = t.replace(/```[a-z]*\s*/gi, '').replace(/```/g, '').trim();

  const block = t.match(/A\s*:\s*([\s\S]*?)\s*B\s*:\s*([\s\S]+)/i);
  if (block) {
    const newA = firstSentenceLine(block[1]);
    const newB = firstSentenceLine(block[2]);
    if (newA.length > 4 && newB.length > 4) return { newA, newB };
  }

  const lines = t.split(/\n/).map((l) => l.trim()).filter(Boolean);
  let newA = null;
  let newB = null;
  for (const line of lines) {
    const ma = line.match(/^A\s*:\s*(.+)$/i);
    if (ma) {
      newA = firstSentenceLine(ma[1]);
      continue;
    }
    const mb = line.match(/^B\s*:\s*(.+)$/i);
    if (mb) {
      newB = firstSentenceLine(mb[1]);
      continue;
    }
  }
  if (newA && newB && newA.length > 4 && newB.length > 4) return { newA, newB };
  return null;
}

/** Strip markdown / bullets so lines like "**A:** text" match. */
function stripLineLabelNoise(line) {
  return line
    .replace(/\*\*/g, '')
    .replace(/^[`\s*_-]+/g, '')
    .trim();
}

function parseMergeLines(result) {
  const normalized = result.replace(/\r/g, '').replace(/\*\*/g, '');
  const lines = normalized.split('\n').map((l) => stripLineLabelNoise(l)).filter(Boolean);
  const lineA = lines.find((l) => /^A\s*:/i.test(l));
  const lineB = lines.find((l) => /^B\s*:/i.test(l));
  if (!lineA || !lineB) return null;
  const parsedA = lineA.replace(/^A\s*:\s*/i, '').replace(/^["']|["']$/g, '').trim();
  const parsedB = lineB.replace(/^B\s*:\s*/i, '').replace(/^["']|["']$/g, '').trim();
  if (parsedA.length <= 5 || parsedB.length <= 5) return null;
  return { newA: parsedA, newB: parsedB };
}

async function mergeMemories(miA, miB) {
  const memA = memories[miA];
  const memB = memories[miB];
  if (!memA || !memB) {
    console.warn(`[DEBUG:MERGE] Invalid indices: #${miA}, #${miB}`);
    return;
  }

  console.log(`[DEBUG:MERGE] ═══════════════════════════════════════════`);
  console.log(`[DEBUG:MERGE] Starting: #${miA} ("${memA.sentence}") ↔ #${miB} ("${memB.sentence}")`);

  memA.isMerging = true;
  memB.isMerging = true;

  const sim = getSim(miA, miB);
  const recognized = memA.mergeHistory.has(memB.id) || memB.mergeHistory.has(memA.id);
  memA.mergeHistory.add(memB.id);
  memB.mergeHistory.add(memA.id);

  const srcA = memA.sentence;
  const srcB = memB.sentence;
  console.log(`[DEBUG:MERGE] Similarity: ${(sim * 100).toFixed(1)}%, recognized=${recognized}`);

  const label = recognized
    ? `memories recognising each other (sim: ${(sim * 100).toFixed(0)}%)`
    : `memories merging (similarity: ${(sim * 100).toFixed(0)}%)`;
  setStatus(label);

  let newA = memA.sentence;
  let newB = memB.sentence;
  let usedLLM = false;

  if (llmAvailable) {
    const simPct = (sim * 100).toFixed(0);
    const prompt = `You are a poetic memory engine. Two memories have drifted close to each other (${simPct}% similar${recognized ? ', they have met before' : ''}).

Memory A: "${memA.sentence}"
Memory B: "${memB.sentence}"

For each memory, rewrite it so that it keeps its own core but gently absorbs ONE salient word or short phrase from the other memory.

Return EXACTLY two lines:
A: [new version of memory A, max 18 words]
B: [new version of memory B, max 18 words]

No extra commentary.`;

    const result = await llmGenerate(prompt, 140);
    if (result) {
      const pl = parseMergeLines(result);
      if (pl) {
        newA = pl.newA;
        newB = pl.newB;
        usedLLM = true;
        console.log(`[DEBUG:MERGE] LLM result (line parse): A→"${newA}", B→"${newB}"`);
      } else {
        const pb = parseMergeAB(result);
        if (pb) {
          newA = pb.newA;
          newB = pb.newB;
          usedLLM = true;
          console.log(`[DEBUG:MERGE] LLM result (block parse): A→"${newA}", B→"${newB}"`);
        } else {
          console.warn(`[DEBUG:MERGE] LLM output malformed: "${result}"`);
        }
      }
    }
  }

  if (!usedLLM) {
    console.log(`[DEBUG:MERGE] Using local fallback merge`);
    newA = localMergeSentence(srcA, srcB);
    newB = localMergeSentence(srcB, srcA);
    console.log(`[DEBUG:MERGE] Local result: A→"${newA}", B→"${newB}"`);
  }

  if (normalizeMemoryText(newA) === normalizeMemoryText(srcA)) {
    newA = localMergeSentence(srcA, srcB);
  }
  if (normalizeMemoryText(newB) === normalizeMemoryText(srcB)) {
    newB = localMergeSentence(srcB, srcA);
  }

  setTimeout(() => {
    console.log(`[DEBUG:MERGE] Applying merge transforms...`);
    applyMerge(miA, newA, sim, srcB, memB.id);
    applyMerge(miB, newB, sim, srcA, memA.id);
    memA.isMerging = false;
    memB.isMerging = false;
    memA.cooldown = COOL_FRAMES;
    memB.cooldown = COOL_FRAMES;
    console.log(`[DEBUG:MERGE] Done. Cooldown=${COOL_FRAMES} frames. Re-embedding...`);

    Promise.all([embedSentence(memA.sentence), embedSentence(memB.sentence)]).then(([eA, eB]) => {
      if (eA) memA.embedding = eA;
      if (eB) memB.embedding = eB;
      if (eA && eB) {
        const newSim = cosineSim(eA, eB);
        setSim(miA, miB, newSim);
        console.log(`[DEBUG:MERGE] Post-merge similarity: ${(newSim * 100).toFixed(1)}% (was ${(sim * 100).toFixed(1)}%)`);
      }
      memories.forEach((mem, mi) => {
        if (mi !== miA && mi !== miB && mem.embedding) {
          if (memories[miA].embedding) setSim(miA, mi, cosineSim(memories[miA].embedding, mem.embedding));
          if (memories[miB].embedding) setSim(miB, mi, cosineSim(memories[miB].embedding, mem.embedding));
        }
      });
      updateMemoryList();
      // Re-populate timeline if the user is viewing one of the merged memories
      populateTimeline();
      console.log(`[DEBUG:MERGE] ═══════════════════════════════════════════`);
    });

    setStatus('memories evolved');
    updateMemoryList();
    populateTimeline();
  }, 400);
}

function applyMerge(mi, newSentence, sim, partnerSentence, partnerId) {
  const mem = memories[mi];
  if (!mem) return;
  const prevText = mem.sentence;
  mem.sentence = String(newSentence || prevText).toLowerCase();
  mem.originalSentence = mem.sentence;
  mem.morphAmt = Math.min(1.0, mem.morphAmt + 0.18 + sim * 0.15);
  mem.morphSeed += 0.55;
  mem.vitality = 1.0;
  mem.colorPhase = (mem.colorPhase + 83) % 1200;
  mem.mergeCount = (mem.mergeCount || 0) + 1;
  console.log(`[DEBUG:MERGE] applyMerge #${mi}: "${prevText}" → "${mem.sentence}" (mergeCount=${mem.mergeCount})`);
  if (mem.timeline) {
    mem.timeline.push({
      type: 'merge',
      text: mem.sentence,
      prev: prevText,
      partnerSentence: partnerSentence || null,
      partnerId: partnerId || null,
      similarity: sim,
      time: Date.now(),
    });
    console.log(`[DEBUG:TIMELINE] Memory #${mi} timeline: merge entry added (${mem.timeline.length} total)`);
  }
  rebuildNodes(mi);
}
