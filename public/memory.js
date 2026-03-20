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

function rebuildNodes(memIdx) {
  const mem = memories[memIdx];
  if (!mem) return;
  const sentence = mem.sentence.toUpperCase();
  const R = getSphereR(), innerR = R * 0.68, spacing = min(width, height) * 0.052;
  const rng = mulberry32(seedVal + memIdx * 9999 + (mem.mergeCount || 0) * 777);
  const words = sentence.replace(/[^A-Z ]/g, '').split(' ').filter(w => w.length);
  if (!words.length) return;
  const nodes = [];
  const wordCenters = sampleWordCenters3D(words.length, innerR * 0.88, rng);
  words.forEach((word, wi) => {
    const wc = wordCenters[wi] || { x: 0, y: 0, z: 0 };
    word.split('').forEach((letter, li) => {
      if (!letter.match(/[A-Z]/)) return;
      const t = word.length > 1 ? li / (word.length - 1) : 0.5;
      const spread = spacing * (0.65 + word.length * 0.1);
      const jx = (rng() - 0.5) * spread, jy = (rng() - 0.5) * spread, jz = (rng() - 0.5) * spread * 0.6;
      const swirl = (t - 0.5) * spread * 0.65;
      const ax = cos((wi + 1) * 1.7 + mem.id) * swirl;
      const ay = sin((wi + 1) * 1.2 + mem.id) * swirl * 0.6;
      const az = sin((wi + 1) * 1.1 + mem.id + 1.3) * swirl * 0.45;
      let px = wc.x + jx + ax, py = wc.y + jy + ay, pz = wc.z + jz + az;
      const len = sqrt(px * px + py * py + pz * pz);
      if (len > innerR) { const sc = innerR / len; px *= sc; py *= sc; pz *= sc; }
      nodes.push({
        letter, wordIdx: wi, x: px, y: py, z: pz,
        size: constrain(map(t, 0, 1, spacing * 1.7, spacing * 0.75) + (rng() - 0.5) * spacing * 0.3, 24, 100),
        opacity: 0.78 + rng() * 0.22, tiltX: (rng() - 0.5) * 0.5, tiltY: (rng() - 0.5) * 0.5,
        glyphIdx: nodes.length, colorPhase: mem.colorPhase,
      });
    });
  });
  mem.nodes = nodes;
  mem.glyphs = nodes.map((nd, i) => getGlyph(nd.letter, mem.id, i, mem.mergeCount || 0));
}

async function addMemory(sentence, anonymous) {
  if (sentence == null || typeof sentence !== 'string') return;
  sentence = String(sentence).trim().toUpperCase();
  if (!sentence) return;
  console.log(`[DEBUG:MEMORY] addMemory called: "${sentence}" (anonymous=${!!anonymous})`);

  const mi = memories.length, id = memIdCounter++;
  const colorPhase = id * 317;
  const rng = mulberry32(seedVal + mi * 9999);
  const words = sentence.replace(/[^A-Z ]/g, '').split(' ').filter(w => w.length);
  if (!words.length) return;

  const R = getSphereR(), innerR = R * 0.68, spacing = min(width, height) * 0.052;
  const nodes = [];
  const wordCenters = sampleWordCenters3D(words.length, innerR * 0.88, rng);
  words.forEach((word, wi) => {
    const wc = wordCenters[wi] || { x: 0, y: 0, z: 0 };
    const wcx = wc.x, wcy = wc.y, wcz = wc.z;
    word.split('').forEach((letter, li) => {
      if (!letter.match(/[A-Z]/)) return;
      const t = word.length > 1 ? li / (word.length - 1) : 0.5;
      const spread = spacing * (0.65 + word.length * 0.1);
      const jx = (rng() - 0.5) * spread, jy = (rng() - 0.5) * spread, jz = (rng() - 0.5) * spread * 0.6;
      const swirl = (t - 0.5) * spread * 0.65;
      const ax = cos((wi + 1) * 1.7 + id) * swirl;
      const ay = sin((wi + 1) * 1.2 + id) * swirl * 0.6;
      const az = sin((wi + 1) * 1.1 + id + 1.3) * swirl * 0.45;
      let px = wcx + jx + ax, py = wcy + jy + ay, pz = wcz + jz + az;
      const len = sqrt(px * px + py * py + pz * pz);
      if (len > innerR) { const sc = innerR / len; px *= sc; py *= sc; pz *= sc; }
      nodes.push({
        letter, wordIdx: wi, x: px, y: py, z: pz,
        size: constrain(map(t, 0, 1, spacing * 1.7, spacing * 0.75) + (rng() - 0.5) * spacing * 0.3, 24, 100),
        opacity: 0.78 + rng() * 0.22, tiltX: (rng() - 0.5) * 0.5, tiltY: (rng() - 0.5) * 0.5,
        glyphIdx: nodes.length, colorPhase,
      });
    });
  });

  const bc = getBaseCenter(mi, memories.length + 1);
  memories.push({
    id, sentence: sentence.toLowerCase(),
    originalSentence: sentence.toLowerCase(),
    isAnonymous: !!anonymous,
    ownerId: currentUser ? currentUser.id : null,
    nodes, glyphs: nodes.map((nd, i) => getGlyph(nd.letter, id, i, 0)),
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
  setStatus(`${memories.length} memor${memories.length > 1 ? 'ies' : 'y'} · similar memories attract each other`);
  mode = 'display';
  if (appState !== APP_STATE.INTERACT) appState = APP_STATE.INTERACT;
  curRotX = rotX; curRotY = rotY;
  loop();
}

let previewMemCache = null;
let previewMemCacheSentence = '';

function buildPreviewMemory(sentence) {
  const s = (sentence || '').trim().toUpperCase();
  if (!s) return null;
  if (s === previewMemCacheSentence && previewMemCache) return previewMemCache;
  const words = s.replace(/[^A-Z ]/g, '').split(' ').filter(w => w.length);
  if (!words.length) return null;
  const id = -1;
  const colorPhase = 317;
  const rng = mulberry32(seedVal + 99999);
  const R = 120, innerR = R * 0.68, spacing = min(width, height) * 0.052;
  const nodes = [];
  const wordCenters = sampleWordCenters3D(words.length, innerR * 0.88, rng);
  words.forEach((word, wi) => {
    const wc = wordCenters[wi] || { x: 0, y: 0, z: 0 };
    word.split('').forEach((letter, li) => {
      if (!letter.match(/[A-Z]/)) return;
      const t = word.length > 1 ? li / (word.length - 1) : 0.5;
      const spread = spacing * (0.65 + word.length * 0.1);
      const jx = (rng() - 0.5) * spread, jy = (rng() - 0.5) * spread, jz = (rng() - 0.5) * spread * 0.6;
      const swirl = (t - 0.5) * spread * 0.65;
      const ax = cos((wi + 1) * 1.7 + id) * swirl;
      const ay = sin((wi + 1) * 1.2 + id) * swirl * 0.6;
      const az = sin((wi + 1) * 1.1 + id + 1.3) * swirl * 0.45;
      let px = wc.x + jx + ax, py = wc.y + jy + ay, pz = wc.z + jz + az;
      const len = sqrt(px * px + py * py + pz * pz);
      if (len > innerR) { const sc = innerR / len; px *= sc; py *= sc; pz *= sc; }
      nodes.push({
        letter, wordIdx: wi, x: px, y: py, z: pz,
        size: constrain(map(t, 0, 1, spacing * 1.7, spacing * 0.75) + (rng() - 0.5) * spacing * 0.3, 24, 100),
        opacity: 0.78 + rng() * 0.22, tiltX: (rng() - 0.5) * 0.5, tiltY: (rng() - 0.5) * 0.5,
        glyphIdx: nodes.length, colorPhase
      });
    });
  });
  previewMemCacheSentence = s;
  previewMemCache = {
    id, sentence: s.toLowerCase(), nodes, glyphs: nodes.map((nd, i) => getGlyph(nd.letter, id, i, 0)),
    colorPhase, liveCenter: { x: 0, y: 0, z: 0 }, vitality: 1, morphAmt: 0, morphSeed: 0, mergeCount: 0
  };
  return previewMemCache;
}
