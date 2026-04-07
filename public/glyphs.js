// Procedural glyph graph and glyph API.
// ── Procedural glyph graph + glyph API ──────────────────
function initGlyphGraph() {
  glyphGraph = buildOrganicGraph(seedVal, GLYPH_GRAPH_NODES);
}

function buildOrganicGraph(seed, n) {
  const rng = mulberry32(seed * 1013 + 17);
  const clusters = 7 + floor(rng() * 6);
  const centers = Array.from({ length: clusters }, () => {
    const a = rng() * TWO_PI;
    const r = pow(rng(), 0.65) * 0.85;
    return { x: cos(a) * r, y: sin(a) * r, s: 0.09 + rng() * 0.22 };
  });

  const nodes = [];
  for (let i = 0; i < n; i++) {
    const c = centers[floor(rng() * centers.length)];
    const a = rng() * TWO_PI;
    const rr = abs(gauss01(rng)) * c.s * (0.55 + rng() * 0.85);
    nodes.push({ x: c.x + cos(a) * rr, y: c.y + sin(a) * rr, deg: 0 });
  }

  const adj = Array.from({ length: n }, () => []);
  const edges = [];
  const addEdge = (a, b) => {
    if (a === b) return;
    if (adj[a].includes(b)) return;
    adj[a].push(b); adj[b].push(a);
    nodes[a].deg++; nodes[b].deg++;
    edges.push({ a, b });
  };

  const targetEdges = floor(n * GLYPH_GRAPH_EDGES_PER_NODE);
  let attempts = 0;
  while (edges.length < targetEdges && attempts < targetEdges * 30) {
    attempts++;
    const a = floor(rng() * n);
    const ax = nodes[a].x, ay = nodes[a].y;
    let best = -1, bestD = Infinity;
    for (let k = 0; k < 10; k++) {
      const b = floor(rng() * n);
      if (b === a) continue;
      const dx = nodes[b].x - ax, dy = nodes[b].y - ay;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD) { bestD = d2; best = b; }
    }
    if (best < 0) continue;
    const d = sqrt(bestD);
    const p = constrain(map(d, 0.02, 0.35, 0.95, 0.08), 0.05, 0.98);
    if (rng() < p) addEdge(a, best);
  }

  // Ensure no isolated nodes
  for (let i = 0; i < n; i++) {
    if (nodes[i].deg > 0) continue;
    let best = -1, bestD = Infinity;
    for (let k = 0; k < 24; k++) {
      const j = floor(rng() * n);
      if (j === i) continue;
      const dx = nodes[j].x - nodes[i].x, dy = nodes[j].y - nodes[i].y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD) { bestD = d2; best = j; }
    }
    if (best >= 0) addEdge(i, best);
  }

  return { nodes, adj, edges };
}

function normalizeGlyphChar(ch) {
  const c = String(ch || '').charAt(0);
  if (!c) return '?';
  if (/[a-z]/.test(c)) return c.toUpperCase();
  return c;
}

function getGlyph(charSymbol, memoryId, localIdx, mergeCount) {
  const c = normalizeGlyphChar(charSymbol);
  const h = hash32(`charGlyph|${c}`);
  const variation = h % 3;
  return generateGlyph(c, variation, memoryId);
}

function generateGlyph(charSymbol, variation, memoryId) {
  const rng = mulberry32(hash32(`glyphStable|${charSymbol}|${variation}`));
  if (!glyphGraph) initGlyphGraph();
  const style = glyphStyle(charSymbol);
  const rule = glyphRule(charSymbol);
  const start = pickStartNode(rule, rng);
  const anchor = style === 'grid' ? buildGridAnchor(charSymbol, variation, rng) : buildAnchorStroke(rule, variation, rng, charSymbol);
  const fr = style === 'grid' ? extractGridFragments(charSymbol, variation, rng) : extractFragments(rule, start, variation, rng);
  const norm = normalizeGlyphSystem(anchor, fr.nodes, fr.edges);
  return {
    seed: hash32(`glyphStable|${charSymbol}|${variation}`),
    charSymbol,
    variation,
    anchor: norm.anchor,
    nodes: norm.nodes,
    edges: norm.edges,
    style
  };
}

function glyphRule(charSymbol) {
  const c = normalizeGlyphChar(charSymbol);
  if (/[0-9]/.test(c)) return 'radial';
  if (/[A-I]/.test(c)) return 'branching';
  if (/[J-R]/.test(c)) return 'dense';
  if (/[S-Z]/.test(c)) return 'arc';
  if (/[.,;:!?]/.test(c)) return 'arc';
  if (/[+\-*/=<>]/.test(c)) return 'gridline';
  if (/[\[\]\(\)\{\}\\|]/.test(c)) return 'radial';
  return 'mixed';
}
function glyphStyle(charSymbol) {
  const c = normalizeGlyphChar(charSymbol);
  if (/[A-Z]/.test(c)) return (hash32(`glyphStyle|${c}`) % 10) < 6 ? 'organic' : 'grid';
  if (/[0-9]/.test(c)) return 'grid';
  return 'organic';
}

function pickStartNode(rule, rng) {
  const n = glyphGraph.nodes.length;
  let best = floor(rng() * n);
  let bestScore = -Infinity;
  for (let i = 0; i < 80; i++) {
    const idx = floor(rng() * n);
    const nd = glyphGraph.nodes[idx];
    const r = sqrt(nd.x * nd.x + nd.y * nd.y);
    const d = nd.deg || 0;
    let score = -r * 0.25 + (rng() - 0.5) * 0.2;
    if (rule === 'radial') score += d * 0.8;
    else if (rule === 'branching') score += (d <= 2 ? 1.2 : -0.1);
    else if (rule === 'dense') score += d * 0.4;
    else if (rule === 'arc') score += (r > 0.25 ? 0.9 : -0.2);
    else score += d * 0.25;
    if (score > bestScore) { bestScore = score; best = idx; }
  }
  return best;
}

function extractSubgraph(rule, startIdx, variation, rng) {
  const { nodes, adj } = glyphGraph;
  const maxNodesBase =
    rule === 'dense' ? 58 :
    rule === 'radial' ? 48 :
    rule === 'arc' ? 44 :
    rule === 'branching' ? 42 : 46;

  const maxNodes = floor(maxNodesBase * (variation === 0 ? 0.85 : variation === 1 ? 1.05 : 1.25));
  const pruneProb =
    rule === 'branching' ? (variation === 2 ? 0.06 : variation === 1 ? 0.12 : 0.2) :
    rule === 'dense' ? (variation === 2 ? 0.02 : variation === 1 ? 0.05 : 0.1) :
    rule === 'arc' ? (variation === 2 ? 0.05 : 0.09) :
    rule === 'radial' ? (variation === 2 ? 0.03 : 0.07) : 0.09;

  const seen = new Set([startIdx]);
  const order = [startIdx];
  const parent = new Map();
  const depth = new Map([[startIdx, 0]]);
  let frontier = [startIdx];
  let steps = 0;
  while (order.length < maxNodes && frontier.length && steps < maxNodes * 40) {
    steps++;
    const fi = floor(rng() * frontier.length);
    const cur = frontier[fi];
    const neigh = adj[cur];
    if (!neigh || !neigh.length) { frontier.splice(fi, 1); continue; }
    let bestN = -1, bestScore = -Infinity;
    for (let t = 0; t < min(10, neigh.length); t++) {
      const nb = neigh[floor(rng() * neigh.length)];
      if (seen.has(nb)) continue;
      const a = nodes[cur], b = nodes[nb];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = sqrt(dx * dx + dy * dy);
      const r = sqrt(b.x * b.x + b.y * b.y);
      const deg = nodes[nb].deg || 0;
      let score = -d * 0.8 + (rng() - 0.5) * 0.15;
      if (rule === 'dense') score += deg * 0.55 - r * 0.15;
      else if (rule === 'branching') score += (deg <= 2 ? 1.1 : -0.1) + d * 0.25;
      else if (rule === 'radial') score += deg * 0.8 + r * 0.25;
      else if (rule === 'arc') score += (r > 0.25 ? 0.6 : -0.1);
      else score += deg * 0.25;
      const d0 = depth.has(cur) ? depth.get(cur) : 0;
      score += (d0 + 1) * 0.04;
      if (score > bestScore) { bestScore = score; bestN = nb; }
    }
    if (bestN < 0) { if (rng() < 0.33) frontier.splice(fi, 1); continue; }
    if (rng() < pruneProb) continue;
    seen.add(bestN);
    order.push(bestN);
    frontier.push(bestN);
    parent.set(bestN, cur);
    depth.set(bestN, (depth.has(cur) ? depth.get(cur) : 0) + 1);
    if (rule === 'branching' && rng() < 0.18) frontier.splice(fi, 1);
    if (rule === 'dense' && rng() < 0.08) frontier.push(cur);
  }

  const idxMap = new Map();
  order.forEach((gi, li) => idxMap.set(gi, li));
  const subNodes = order.map(gi => ({ x: nodes[gi].x, y: nodes[gi].y }));
  const subEdges = [];
  for (let li = 1; li < order.length; li++) {
    const gi = order[li];
    const p = parent.get(gi);
    if (p !== undefined && idxMap.has(p)) subEdges.push({ a: li, b: idxMap.get(p) });
  }
  return { nodes: subNodes, edges: subEdges };
}

function extractFragments(rule, startIdx, variation, rng) {
  const base = rule === 'dense' ? 18 : rule === 'radial' ? 16 : rule === 'arc' ? 14 : rule === 'branching' ? 14 : 16;
  const maxNodes = variation === 0 ? base : variation === 1 ? base + 4 : base + 7;
  const sub = extractSubgraph(rule, startIdx, variation, rng);
  const maxEdges = rule === 'dense' ? (variation === 2 ? 12 : variation === 1 ? 10 : 8) : rule === 'radial' ? (variation === 2 ? 11 : 9) : (variation === 2 ? 10 : 7);
  const keepN = min(maxNodes, sub.nodes.length);
  const edges = [];
  for (let i = 0; i < sub.edges.length && edges.length < maxEdges; i++) {
    const e = sub.edges[i];
    if (e.a >= keepN || e.b >= keepN) continue;
    const a = sub.nodes[e.a], b = sub.nodes[e.b];
    if (!a || !b) continue;
    const dx = a.x - b.x, dy = a.y - b.y;
    if (sqrt(dx * dx + dy * dy) > 0.42) continue;
    edges.push(e);
  }
  const used = new Set();
  edges.forEach(e => { used.add(e.a); used.add(e.b); });
  const usedArr = Array.from(used).sort((a, b) => a - b);
  const mapOldToNew = new Map(usedArr.map((v, i) => [v, i]));
  const nodes = usedArr.map(i => sub.nodes[i]);
  const remappedEdges = edges.map(e => ({ a: mapOldToNew.get(e.a), b: mapOldToNew.get(e.b) })).filter(e => e.a !== undefined && e.b !== undefined && e.a !== e.b);
  if (nodes.length < 6) {
    const extra = min(3, sub.nodes.length);
    for (let i = 0; i < extra; i++) nodes.push(sub.nodes[i]);
  }
  return { nodes, edges: remappedEdges };
}

function buildAnchorStroke(rule, variation, rng, letter) {
  const pts = [];
  const n = variation === 2 ? 18 : variation === 1 ? 16 : 14;
  const h = hash32(`${seedVal}|anchor|${letter}|${variation}`);
  const rot = ((h % 1000) / 1000 - 0.5) * 1.45;
  const wob = 0.05 + rng() * 0.06;
  if (rule === 'arc') {
    const span = variation === 2 ? 1.45 : variation === 1 ? 1.15 : 0.95;
    const a0 = -span * 0.5;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const a = a0 + t * span;
      const r = 0.78 + 0.08 * sin(t * TWO_PI) + (rng() - 0.5) * 0.02;
      pts.push({ x: cos(a) * r, y: sin(a) * r * 0.85 });
    }
  } else if (rule === 'radial') {
    const gap = 0.65 + rng() * 0.35;
    const span = TWO_PI - gap;
    const a0 = -span * 0.5;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const a = a0 + t * span;
      const r = 0.72 + 0.06 * sin(t * TWO_PI * 2.0) + (rng() - 0.5) * 0.015;
      pts.push({ x: cos(a) * r, y: sin(a) * r });
    }
  } else if (rule === 'branching') {
    const len = 1.25;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      pts.push({ x: lerp(-len * 0.5, len * 0.5, t), y: lerp(len * 0.4, -len * 0.4, t) + sin(t * PI) * 0.12 });
    }
  } else if (rule === 'dense') {
    const turns = variation === 2 ? 1.6 : variation === 1 ? 1.35 : 1.15;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const a = t * TWO_PI * turns;
      const r = 0.18 + t * 0.78;
      pts.push({ x: cos(a) * r, y: sin(a) * r });
    }
  } else {
    const span = 1.05 + rng() * 0.35;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      pts.push({ x: lerp(-0.85, 0.85, t), y: sin((t - 0.5) * span * PI) * 0.55 });
    }
  }
  const c = cos(rot), s = sin(rot);
  return pts.map((p, i) => {
    const wx = (noise(p.x * 1.7 + i * 0.05, p.y * 1.7 + 11.3) - 0.5) * wob;
    const wy = (noise(p.x * 1.7 + 9.1, p.y * 1.7 + i * 0.05) - 0.5) * wob;
    const x0 = p.x + wx, y0 = p.y + wy;
    return { x: x0 * c - y0 * s, y: x0 * s + y0 * c };
  });
}

function buildGridAnchor(letter, variation, rng) {
  const gridN = 5;
  const step = 2 / (gridN - 1);
  const toXY = (gx, gy) => ({ x: -1 + gx * step, y: -1 + gy * step });
  const h = hash32(`${seedVal}|gridAnchor|${letter}|${variation}`);
  let x = (h % gridN);
  let y = (floor(h / 7) % gridN);
  const pts = [toXY(x, y)];
  const steps = variation === 2 ? 7 : variation === 1 ? 6 : 5;
  let dir = (floor(h / 13) % 4);
  for (let i = 0; i < steps; i++) {
    if (rng() < 0.78) dir = (dir + (rng() < 0.5 ? 1 : 3)) % 4;
    const dx = dir === 0 ? 1 : dir === 1 ? -1 : 0;
    const dy = dir === 2 ? 1 : dir === 3 ? -1 : 0;
    x = constrain(x + dx, 0, gridN - 1);
    y = constrain(y + dy, 0, gridN - 1);
    const p = toXY(x, y);
    const last = pts[pts.length - 1];
    if (abs(p.x - last.x) + abs(p.y - last.y) > 1e-6) pts.push(p);
  }
  if (variation > 0 && rng() < 0.55) {
    const last = pts[pts.length - 1];
    pts.push({ x: last.x + (rng() < 0.5 ? step * 0.55 : -step * 0.55), y: last.y });
  }
  const flipX = (h % 2) === 0 ? 1 : -1;
  const flipY = (h % 3) === 0 ? 1 : -1;
  const rot = (((h % 997) / 997) - 0.5) * 0.7;
  const c = cos(rot), s = sin(rot);
  return pts.map(p => {
    const x0 = p.x * flipX, y0 = p.y * flipY;
    return { x: x0 * c - y0 * s, y: x0 * s + y0 * c };
  });
}

function extractGridFragments(letter, variation, rng) {
  const gridN = 6;
  const step = 2 / (gridN - 1);
  const pts = [];
  for (let y = 0; y < gridN; y++) for (let x = 0; x < gridN; x++) pts.push({ x: -1 + x * step, y: -1 + y * step });
  const pick = () => floor(rng() * pts.length);
  const maxEdges = variation === 2 ? 9 : variation === 1 ? 7 : 5;
  const edgeProb = variation === 2 ? 0.55 : variation === 1 ? 0.45 : 0.38;
  const maxDist = variation === 2 ? step * 3.0 : step * 2.4;
  const active = new Set();
  const h = hash32(`${seedVal}|gridFrag|${letter}|${variation}`);
  const want = 10 + (h % 7);
  while (active.size < want) active.add(pick());
  const activeArr = Array.from(active);
  const edges = [];
  const pushEdge = (a, b) => {
    if (a === b) return;
    const lo = min(a, b), hi = max(a, b);
    if (edges.some(e => (e.a === lo && e.b === hi) || (e.a === hi && e.b === lo))) return;
    edges.push({ a: lo, b: hi });
  };
  for (let i = 0; i < activeArr.length && edges.length < maxEdges; i++) {
    const a = activeArr[i];
    const pa = pts[a];
    for (let tries = 0; tries < 8 && edges.length < maxEdges; tries++) {
      const b = activeArr[floor(rng() * activeArr.length)];
      if (b === a) continue;
      const pb = pts[b];
      const dx = pa.x - pb.x, dy = pa.y - pb.y;
      const d = sqrt(dx * dx + dy * dy);
      if (d > maxDist) continue;
      const ax = abs(dx), ay = abs(dy);
      const ortho = (ax < 1e-6 || ay < 1e-6);
      const diag = abs(ax - ay) < step * 0.25;
      const p = edgeProb * (ortho ? 1.15 : diag ? 1.0 : 0.6);
      if (rng() < p) pushEdge(a, b);
    }
  }
  const used = new Set();
  edges.forEach(e => { used.add(e.a); used.add(e.b); });
  const usedArr = Array.from(used);
  const mapOldToNew = new Map(usedArr.map((v, i) => [v, i]));
  const nodes = usedArr.map(i => pts[i]);
  const remappedEdges = edges.map(e => ({ a: mapOldToNew.get(e.a), b: mapOldToNew.get(e.b) }));
  if (nodes.length < 14 && rng() < 0.6) {
    const extra = 1 + floor(rng() * 2);
    for (let i = 0; i < extra; i++) nodes.push(pts[pick()]);
  }
  const rot = (((h % 911) / 911) - 0.5) * 0.28;
  const c = cos(rot), s = sin(rot);
  const rotated = nodes.map(p => ({ x: p.x * c - p.y * s, y: p.x * s + p.y * c }));
  return { nodes: rotated, edges: remappedEdges };
}

function normalizeGlyphSystem(anchorPts, fragNodes, fragEdges) {
  const all = [];
  for (let i = 0; i < anchorPts.length; i++) all.push(anchorPts[i]);
  for (let i = 0; i < fragNodes.length; i++) all.push(fragNodes[i]);
  if (!all.length) return { anchor: [], nodes: [], edges: [] };
  let cx = 0, cy = 0;
  all.forEach(p => { cx += p.x; cy += p.y; });
  cx /= all.length; cy /= all.length;
  let maxR = 1e-6;
  all.forEach(p => {
    const x = p.x - cx, y = p.y - cy;
    maxR = max(maxR, sqrt(x * x + y * y));
  });
  const scale = (1 / maxR) * 0.92;
  const anchor = anchorPts.map(p => ({ x: (p.x - cx) * scale, y: (p.y - cy) * scale }));
  const nodes = fragNodes.map(p => ({ x: (p.x - cx) * scale, y: (p.y - cy) * scale }));
  return { anchor, nodes, edges: fragEdges };
}