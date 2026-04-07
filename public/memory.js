// Memory creation, embedding, rebuilding, layout.

async function embedSentence(sentence) {
  if (!useModel) {
    console.log(`[DEBUG:EMBED] embedSentence skipped — model not loaded`);
    return null;
  }
  console.log(`[DEBUG:EMBED] Embedding: "${sentence.substring(0, 60)}..."`);
  const tensor = await useModel.embed([sentence]);
  const data = Array.from(await tensor.data());
  tensor.dispose();
  console.log(`[DEBUG:EMBED] Embedding complete (${data.length}-dim vector)`);
  return data;
}

function cosineSim(a, b) {
  if (!a || !b) return 0;
  let dot = 0, mA = 0, mB = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; mA += a[i] * a[i]; mB += b[i] * b[i]; }
  return dot / (Math.sqrt(mA) * Math.sqrt(mB));
}

function getBaseCenter(mi, total) {
  const R = getSphereR();
  const voidR = max(R * 3.5, min(width, height) * 0.45 + total * R * 0.25);
  const golden = (1 + Math.sqrt(5)) / 2;
  const theta = Math.acos(1 - 2 * (mi + 0.5) / max(total, 1));
  const phi = TWO_PI * mi * golden;
  return {
    x: voidR * sin(theta) * cos(phi) * (0.7 + 0.3 * sin(mi * 1.7)),
    y: voidR * sin(theta) * sin(phi) * 0.55,
    z: voidR * cos(theta) * 0.6,
  };
}

function recalcBases() {
  memories.forEach((mem, mi) => { mem.baseCenter = getBaseCenter(mi, memories.length); });
}

/** Character-driven glyph extraction (letters, numbers, symbols) with cap for perf. */
function clusterCharsForGlyphs(text) {
  const src = String(text || '')
    .split('')
    .filter(ch => ch.trim().length > 0);
  if (src.length <= MAX_GLYPH_UNITS) return src;
  const out = [];
  const last = src.length - 1;
  for (let i = 0; i < MAX_GLYPH_UNITS; i++) {
    const idx = Math.round((i / Math.max(MAX_GLYPH_UNITS - 1, 1)) * last);
    out.push(src[idx]);
  }
  return out;
}

function sampleWordCenters3D(count, radius, rng) {
  if (count <= 0) return [];
  const centers = [];
  const minD = radius * (count > 8 ? 0.34 : 0.42);
  const maxTries = 1200;
  const randInBall = () => {
    let x, y, z, d2;
    do { x = rng() * 2 - 1; y = rng() * 2 - 1; z = rng() * 2 - 1; d2 = x * x + y * y + z * z; } while (d2 > 1 || d2 < 1e-6);
    const r = pow(rng(), 0.55) * radius;
    const inv = 1 / sqrt(d2);
    return { x: x * inv * r, y: y * inv * r, z: z * inv * r };
  };
  let tries = 0;
  while (centers.length < count && tries < maxTries) {
    tries++;
    const c = randInBall();
    let ok = true;
    for (let i = 0; i < centers.length; i++) {
      const o = centers[i]; const dx = c.x - o.x, dy = c.y - o.y, dz = c.z - o.z;
      if (dx * dx + dy * dy + dz * dz < minD * minD) { ok = false; break; }
    }
    if (ok) centers.push(c);
  }
  while (centers.length < count) centers.push(randInBall());
  return centers;
}

// Place glyph pods on an inner orbital shell for a cohesive medallion look.
function sampleOrbitalCenters3D(count, radius, rng) {
  if (count <= 0) return [];
  const out = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  const squashY = 0.82;
  const shell = radius * 0.84;
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    const y = 1 - 2 * t;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const phi = i * golden + (rng() - 0.5) * 0.35;
    const jitter = shell * 0.08;
    out.push({
      x: r * Math.cos(phi) * shell + (rng() - 0.5) * jitter,
      y: y * shell * squashY + (rng() - 0.5) * jitter * 0.5,
      z: r * Math.sin(phi) * shell + (rng() - 0.5) * jitter,
    });
  }
  return out;
}

function rebuildNodes(memIdx) {
  const mem = memories[memIdx];
  if (!mem) return;
  const sentence = mem.sentence || '';
  const chars = clusterCharsForGlyphs(sentence);
  if (!chars.length) return;
  const sphereR = getMemorySphereR(chars.length);
  const innerR = sphereR * 0.68;
  const spacing = min(width, height) * 0.04;
  const rng = mulberry32(seedVal + memIdx * 9999 + (mem.mergeCount || 0) * 777);
  const nodes = [];
  // Scatter glyphs more randomly throughout the inner volume (still spaced apart).
  const wordCenters = sampleWordCenters3D(chars.length, innerR * 1.75, rng);
  chars.forEach((charSymbol, wi) => {
    const wc = wordCenters[wi] || { x: 0, y: 0, z: 0 };
    const spread = spacing * 0.22;
    const jx = (rng() - 0.5) * spread * 0.7, jy = (rng() - 0.5) * spread * 0.7, jz = (rng() - 0.5) * spread * 0.8;
    const ax = cos((wi + 1) * 1.7 + mem.id) * spread * 0.5;
    const ay = sin((wi + 1) * 1.2 + mem.id) * spread * 0.8;
    const az = sin((wi + 1) * 1.1 + mem.id + 1.3) * spread * 0.4;
    let px = wc.x + jx + ax, py = wc.y + jy + ay, pz = wc.z + jz + az;
    const len = sqrt(px * px + py * py + pz * pz);
    if (len > innerR * 1.2) { const sc = innerR / len; px *= sc; py *= sc; pz *= sc; }
    const nLen = sqrt(px * px + py * py + pz * pz) || 1;
    const nx = px / nLen, ny = py / nLen, nz = pz / nLen;
    nodes.push({
      charSymbol, wordIdx: wi, x: px, y: py, z: pz,
      size: constrain(spacing * (2.7 - Math.min(chars.length, 24) * 0.045) + (rng() - 0.5) * spacing * 0.24, 60, 98),
      opacity: 0.86 + rng() * 0.14, tiltX: (rng() - 0.5) * 0.22, tiltY: (rng() - 0.5) * 0.7,
      nx, ny, nz,
      glyphIdx: nodes.length, colorPhase: mem.colorPhase,
    });
  });
  mem.nodes = nodes;
  mem.sphereR = sphereR;
  mem.glyphs = nodes.map((nd, i) => getGlyph(nd.charSymbol, mem.id, i, mem.mergeCount || 0));
}

async function addMemory(sentence, anonymous) {
  if (sentence == null || typeof sentence !== 'string') return;
  sentence = String(sentence).trim().toUpperCase();
  if (!sentence) return;
  console.log(`[DEBUG:MEMORY] addMemory called: "${sentence}" (anonymous=${!!anonymous})`);

  const mi = memories.length, id = memIdCounter++;
  const colorPhase = id * 317;
  const rng = mulberry32(seedVal + mi * 9999);
  const chars = clusterCharsForGlyphs(sentence);
  if (!chars.length) return;
  const sphereR = getMemorySphereR(chars.length);
  const innerR = sphereR * 0.68;
  const spacing = min(width, height) * 0.04;
  const nodes = [];
  // Scatter glyphs more randomly throughout the inner volume (still spaced apart).
  const wordCenters = sampleWordCenters3D(chars.length, innerR * 0.92, rng);
  chars.forEach((charSymbol, wi) => {
    const wc = wordCenters[wi] || { x: 0, y: 0, z: 0 };
    const wcx = wc.x, wcy = wc.y, wcz = wc.z;
    const spread = spacing * 0.22;
    const jx = (rng() - 0.5) * spread, jy = (rng() - 0.5) * spread * 0.7, jz = (rng() - 0.5) * spread;
    const ax = cos((wi + 1) * 1.7 + id) * spread * 0.08;
    const ay = sin((wi + 1) * 1.2 + id) * spread * 0.06;
    const az = sin((wi + 1) * 1.1 + id + 1.3) * spread * 0.06;
    let px = wcx + jx + ax, py = wcy + jy + ay, pz = wcz + jz + az;
    const len = sqrt(px * px + py * py + pz * pz);
    if (len > innerR) { const sc = innerR / len; px *= sc; py *= sc; pz *= sc; }
    const nLen = sqrt(px * px + py * py + pz * pz) || 1;
    const nx = px / nLen, ny = py / nLen, nz = pz / nLen;
    nodes.push({
      charSymbol, wordIdx: wi, x: px, y: py, z: pz,
      size: constrain(spacing * (2.7 - Math.min(chars.length, 24) * 0.045) + (rng() - 0.5) * spacing * 0.24, 60, 98),
      opacity: 0.86 + rng() * 0.14, tiltX: (rng() - 0.5) * 0.22, tiltY: (rng() - 0.5) * 0.22,
      nx, ny, nz,
      glyphIdx: nodes.length, colorPhase,
    });
  });

  const bc = getBaseCenter(mi, memories.length + 1);
  memories.push({
    id, sentence: sentence.toLowerCase(),
    originalSentence: sentence.toLowerCase(),
    isAnonymous: !!anonymous,
    ownerId: currentUser ? currentUser.id : null,
    nodes, sphereR, glyphs: nodes.map((nd, i) => getGlyph(nd.charSymbol, id, i, 0)),
    colorPhase, baseCenter: bc,
    pos: { x: bc.x, y: bc.y, z: bc.z },
    vel: { x: 0, y: 0, z: 0 },
    liveCenter: { x: bc.x, y: bc.y, z: bc.z },
    freqX: 0.14 + mi * 0.053, freqY: 0.09 + mi * 0.041,
    phaseX: mi * 2.3 + (seedVal % 100) * 0.06,
    phaseY: mi * 1.8 + (seedVal % 100) * 0.04,
    cooldown: 0, isMerging: false,
    vitality: 1.0, morphAmt: 0,
    morphSeed: mi * 3.7 + seedVal * 0.01,
    mergeCount: 0, mergeHistory: new Set(),
    timeline: [{ type: 'created', text: sentence.toLowerCase(), time: Date.now() }],
    embedding: null, labelEl: null,
  });

  recalcBases();

  if (modelReady) {
    console.log(`[DEBUG:MEMORY] Embedding sentence for memory #${mi}: "${sentence.toLowerCase()}"`);
    const embedding = await embedSentence(sentence.toLowerCase());
    const newMi = memories.length - 1;
    if (embedding && memories[newMi]) {
      memories[newMi].embedding = embedding;
      memories.forEach((other, oi) => {
        if (oi !== newMi && other.embedding) {
          const sim = cosineSim(embedding, other.embedding);
          setSim(newMi, oi, sim);
          console.log(`[DEBUG:SIMILARITY] Memory #${newMi} ↔ #${oi}: similarity=${(sim * 100).toFixed(1)}%`);
        }
      });
      updateMemoryList();
    }
  }

  updateMemoryList();
  collectivePoolTotal = collectiveCandidates().length;
  refreshPoolCounter();
  if (interactionMode === INTERACTION_MODE.COLLECTIVE) reshuffleCollectiveSelection(true);
  setStatus(`${memories.length} memor${memories.length > 1 ? 'ies' : 'y'} · similar memories attract each other`);
  mode = 'display';
  if (appState !== APP_STATE.INTERACT) appState = APP_STATE.INTERACT;
  curRotX = rotX; curRotY = rotY;
  loop();
}

let previewMemCache = null;
let previewMemCacheSentence = '';

function buildPreviewMemory(sentence) {
  const s = (sentence || '').trim();
  if (!s) return null;
  if (s === previewMemCacheSentence && previewMemCache) return previewMemCache;
  const chars = clusterCharsForGlyphs(s);
  if (!chars.length) return null;
  const id = -1;
  const colorPhase = 317;
  const rng = mulberry32(seedVal + 99999);
  const sphereR = getMemorySphereR(chars.length);
  const innerR = sphereR * 0.68;
  const spacing = min(width, height) * 0.04;
  const nodes = [];
  // Scatter glyphs more randomly throughout the inner volume (still spaced apart).
  const wordCenters = sampleWordCenters3D(chars.length, innerR * 0.92, rng);
  chars.forEach((charSymbol, wi) => {
    const wc = wordCenters[wi] || { x: 0, y: 0, z: 0 };
    const spread = spacing * 0.22;
    const jx = (rng() - 0.5) * spread, jy = (rng() - 0.5) * spread * 0.7, jz = (rng() - 0.5) * spread;
    const ax = cos((wi + 1) * 1.7 + id) * spread * 0.08;
    const ay = sin((wi + 1) * 1.2 + id) * spread * 0.06;
    const az = sin((wi + 1) * 1.1 + id + 1.3) * spread * 0.06;
    let px = wc.x + jx + ax, py = wc.y + jy + ay, pz = wc.z + jz + az;
    const len = sqrt(px * px + py * py + pz * pz);
    if (len > innerR) { const sc = innerR / len; px *= sc; py *= sc; pz *= sc; }
    const nLen = sqrt(px * px + py * py + pz * pz) || 1;
    const nx = px / nLen, ny = py / nLen, nz = pz / nLen;
    nodes.push({
      charSymbol, wordIdx: wi, x: px, y: py, z: pz,
      size: constrain(spacing * (2.3 - Math.min(chars.length, 24) * 0.035) + (rng() - 0.5) * spacing * 0.2, 44, 78),
      opacity: 0.86 + rng() * 0.14, tiltX: (rng() - 0.5) * 0.22, tiltY: (rng() - 0.5) * 0.22,
      nx, ny, nz,
      glyphIdx: nodes.length, colorPhase
    });
  });
  previewMemCacheSentence = s;
  previewMemCache = {
    id, sentence: s.toLowerCase(), nodes, sphereR, glyphs: nodes.map((nd, i) => getGlyph(nd.charSymbol, id, i, 0)),
    colorPhase, liveCenter: { x: 0, y: 0, z: 0 }, vitality: 1, morphAmt: 0, morphSeed: 0, mergeCount: 0
  };
  return previewMemCache;
}
