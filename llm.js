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

async function llmGenerate(prompt, maxTokens) {
  if (!llmAvailable) return null;
  console.log(`[DEBUG:LLM] llmGenerate (maxTokens=${maxTokens || 160})`);
  try {
    const res = await fetch(llmChatUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, max_tokens: maxTokens || 160, temperature: 0.6 }),
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const result = (data.response || '').trim();
    console.log(`[DEBUG:LLM] Response: "${result}"`);
    return result;
  } catch (e) {
    console.warn(`[DEBUG:LLM] llmGenerate failed: ${e.message || e}`);
    return null;
  }
}

async function applyRecallTransform(sentence) {
  console.log(`[DEBUG:RECALL] applyRecallTransform: "${sentence}"`);
  if (!llmAvailable) return sentence;

  const prompt = `You are a memory. You are being recalled — not perfectly, but through the haze of time and feeling.

Original memory: "${sentence}"

Rewrite this memory as it might feel when recalled imperfectly — keep MOST of the sentence the same but change or expand just ONE phrase or detail. The core event and tone must remain the same. Do not add meta commentary.

Return ONLY the reimagined memory in one line, max 20 words. No quotes, no explanation, no preamble.`;

  const result = await llmGenerate(prompt, 80);
  if (!result) return sentence;
  const clean = result.replace(/^["']|["']$/g, '').split('\n')[0].trim();
  const output = clean.length > 5 ? clean.toLowerCase() : sentence;
  console.log(`[DEBUG:RECALL] "${sentence}" → "${output}"`);
  return output;
}

// Local fallback: splice a random word from the other memory into this one
function localMergeSentence(mySentence, otherSentence) {
  const myWords = mySentence.split(/\s+/).filter(w => w.length > 0);
  const otherWords = otherSentence.split(/\s+/).filter(w => w.length > 0);
  if (myWords.length < 2 || otherWords.length < 1) return mySentence;

  // Pick a random content word from the other memory (skip very short words)
  const candidates = otherWords.filter(w => w.length > 2);
  if (candidates.length === 0) return mySentence;
  const picked = candidates[Math.floor(Math.random() * candidates.length)];

  // Avoid duplicates
  if (myWords.map(w => w.toLowerCase()).includes(picked.toLowerCase())) return mySentence;

  // Insert at a random position (not first)
  const insertIdx = 1 + Math.floor(Math.random() * Math.max(1, myWords.length - 1));
  myWords.splice(insertIdx, 0, picked);

  return myWords.slice(0, 18).join(' ');
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
      const lines = result.split('\n').filter(l => l.trim());
      const lineA = lines.find(l => /^A:/i.test(l.trim()));
      const lineB = lines.find(l => /^B:/i.test(l.trim()));
      if (lineA && lineB) {
        const parsedA = lineA.replace(/^A:\s*/i, '').replace(/^["']|["']$/g, '').trim();
        const parsedB = lineB.replace(/^B:\s*/i, '').replace(/^["']|["']$/g, '').trim();
        if (parsedA.length > 5) newA = parsedA;
        if (parsedB.length > 5) newB = parsedB;
        usedLLM = true;
        console.log(`[DEBUG:MERGE] LLM result: A→"${newA}", B→"${newB}"`);
      } else {
        console.warn(`[DEBUG:MERGE] LLM output malformed: "${result}"`);
      }
    }
  }

  // Local fallback when LLM didn't produce results
  if (!usedLLM) {
    console.log(`[DEBUG:MERGE] Using local fallback merge`);
    newA = localMergeSentence(srcA, srcB);
    newB = localMergeSentence(srcB, srcA);
    console.log(`[DEBUG:MERGE] Local result: A→"${newA}", B→"${newB}"`);
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

    Promise.all([embedSentence(newA), embedSentence(newB)]).then(([eA, eB]) => {
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
