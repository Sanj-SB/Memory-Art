// WebGL rendering: sphere wireframes, glyphs, identity symbols.

// ── Identity glyph on sphere (user's drawn symbol) ─────
function drawIdentityGlyphOnSphere(R, mem) {
  try {
    if (mem.isAnonymous) return;
    const glyphSource = mem._sharedGlyph || identityGlyphData;
    if (!glyphSource || !Array.isArray(glyphSource) || glyphSource.length === 0) return;
    const strokes = glyphSource;
    const allPts = strokes.flat().filter(p => p && typeof p.x === 'number' && typeof p.y === 'number');
    if (allPts.length < 2) return;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    allPts.forEach(p => {
      minX = min(minX, p.x); maxX = max(maxX, p.x);
      minY = min(minY, p.y); maxY = max(maxY, p.y);
    });
    const w = maxX - minX || 1, h = maxY - minY || 1;
    const scaleVal = (R * 0.42) / max(w, h);
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;

    noFill();
    strokeCap(ROUND);
    strokeJoin(ROUND);
    const phase = (mem && mem.colorPhase != null ? mem.colorPhase : 0) + frameCount * 0.02;
    const vit = mem && mem.vitality != null ? mem.vitality : 1;
    const alpha = 80 * vit * (0.6 + 0.4 * sin(phase * 0.1));

    push();
    translate(0, 0, R * 1.02);
    scale(1, -1);

    // Core drawing — clean, flat, white
    stroke(220, 230, 255, alpha);
    strokeWeight(R * 0.035);
    strokes.forEach(strokePts => {
      if (!Array.isArray(strokePts) || strokePts.length < 2) return;
      beginShape();
      strokePts.forEach(p => {
        if (p && typeof p.x === 'number' && typeof p.y === 'number')
          vertex((p.x - cx) * scaleVal, (p.y - cy) * scaleVal, 0);
      });
      endShape();
    });

    pop();
  } catch (e) {
    console.warn('identity glyph draw skipped:', e);
  }
}

// ── Morphing sphere wireframe ──────────────────────────
function drawMemSphere(R, mem) {
  const segs  = 120;
  const pulse = 0.7 + 0.3 * sin(frameCount * 0.016 + mem.id);
  const vit   = mem.vitality;
  const p     = mem.colorPhase;
  // Very pale — sphere is a hint, not the subject
  const cr = sin(p*0.013)*40+180, cg = sin(p*0.021)*40+190, cb = sin(p*0.031)*40+220;
  const morph = mem.morphAmt, ms = mem.morphSeed;

  noFill();

  // 4 wrapping Lissajous-style curves — each offset by a phase
  // so together they imply the sphere volume without overwhelming it
  const numCurves = 3 + floor(mem.mergeCount * 0.5);  // gains complexity with merges, max ~5
  const clampedCurves = min(numCurves, 5);

  for (let c = 0; c < clampedCurves; c++) {
    const phaseOff = (c / clampedCurves) * PI;
    const freq     = 2 + c * 0.5 + morph * 0.8;   // morph adds complexity
    const alpha    = 28 * vit * pulse;

    stroke(cr, cg, cb, alpha);
    strokeWeight(0.7);
    beginShape();
    for (let i = 0; i <= segs; i++) {
      const t = (i / segs) * TWO_PI;
      // Lissajous on sphere surface with gentle noise displacement when morphed
      const lat  = sin(freq * t + phaseOff);
      const lon  = t + phaseOff * 0.5;
      const mOff = morph > 0 ? (noise(c*1.3, i*0.04, ms) - 0.5) * morph * R * 0.22 : 0;
      const r    = R + mOff;
      const x    = r * cos(lon) * cos(lat * HALF_PI);
      const y    = r * sin(lat * HALF_PI);
      const z    = r * sin(lon) * cos(lat * HALF_PI);
      vertex(x, y, z);
    }
    endShape();
  }
  drawIdentityGlyphOnSphere(R, mem);
}

// ── Draw one glyph (procedural) ─────────────────────────
function drawGlyph3D(nd, glyphs, mem, vit) {
  const glyph = glyphs && glyphs[nd.glyphIdx];
  if (!glyph || !glyph.anchor || glyph.anchor.length < 2) return;

  const wordCount = (mem.sentence || '').split(/\s+/).filter(w => w).length;
  const glyphScale = min(1.0, 1.0 / (1 + wordCount * 0.08));
  const s = min(nd.size, 110) * 0.95 * glyphScale;
  const phase = nd.glyphIdx * 37 + nd.wordIdx * 120 + mem.colorPhase;
  const inkR = sin(phase * 0.013 + 1.0) * 70 + 175;
  const inkG = sin(phase * 0.021 + 2.0) * 70 + 185;
  const inkB = sin(phase * 0.031 + 3.0) * 70 + 210;

  push();
  translate(nd.x, nd.y, nd.z);
  rotateY(nd.tiltY);
  rotateX(nd.tiltX);

  const baseA = 255 * vit * nd.opacity;
  strokeCap(ROUND);
  noFill();

  // Dynamic "ink + aura" (inspired by the old glyph PNG vibe):
  // - soft colored aura blobs behind
  // - crisp core strokes
  // - subtle animated flow distortion
  const t = frameCount * 0.007;
  const flow = (noise(glyph.seed * 0.0001, t) - 0.5);
  const j = (noise(t, glyph.seed * 0.00001) - 0.5) * 0.05;
  scale(s * (0.54 + 0.006 * sin(t + nd.glyphIdx * 0.2)));
  translate(j, -j * 0.55, 0);

  // Aura blobs (very light, like the old tile ellipses)
  const aura = 0.35 + 0.65 * vit;
  noStroke();
  for (let i = 0; i < 3; i++) {
    const f = phase + i * 19 + t * 12;
    fill(
      sin(f * 0.013) * 40 + inkR,
      sin(f * 0.021) * 40 + inkG,
      sin(f * 0.031) * 40 + inkB,
      baseA * (0.05 + i * 0.02) * aura
    );
    const ox = (noise(glyph.seed * 0.0002 + i * 3.1, t * 0.6) - 0.5) * 0.35;
    const oy = (noise(glyph.seed * 0.0002 + 9.2 + i * 2.2, t * 0.6) - 0.5) * 0.35;
    ellipse(ox, oy, 1.55 + i * 0.55, 1.55 + i * 0.55);
  }

  // Stroke passes (thin, readable, not neon)
  strokeCap(ROUND);
  noFill();

  // Slightly "alive" distortion amount (grid glyphs stay sharper)
  const dAmt = (glyph.style === 'grid' ? 0.02 : 0.04) + mem.morphAmt * 0.04;

  // Outer haze (low opacity, thicker)
  stroke(inkR, inkG, inkB, baseA * 0.10);
  strokeWeight(2.4);
  drawAnchor2D(glyph, dAmt, flow);
  stroke(inkR, inkG, inkB, baseA * 0.06);
  strokeWeight(1.8);
  drawFragments2D(glyph, dAmt, flow);

  // Core ink (white, thin)
  stroke(255, 255, 255, baseA * 0.55);
  strokeWeight(0.85);
  drawAnchor2D(glyph, dAmt * 0.55, flow);
  stroke(255, 255, 255, baseA * 0.22);
  strokeWeight(0.65);
  drawFragments2D(glyph, dAmt * 0.55, flow);

  // A few node "pins" (like small dots you see in the PNG sheets)
  if (glyph.nodes && glyph.nodes.length) {
    noStroke();
    fill(255, 255, 255, baseA * 0.20);
    const step = max(6, floor(glyph.nodes.length / 6));
    for (let i = 0; i < glyph.nodes.length; i += step) {
      const p0 = glyph.nodes[i];
      if (!p0) continue;
      ellipse(p0.x + sin(t + i) * 0.02, p0.y + cos(t + i) * 0.02, 0.10, 0.10);
    }
  }

  // Soft sparkle layer
  if (GLYPH_SPARKLE_STRENGTH > 0 && glyph.nodes && glyph.nodes.length) {
    const sparkStep = max(14, floor(glyph.nodes.length / 10));
    noStroke();
    for (let i = 0; i < glyph.nodes.length; i += sparkStep) {
      const p0 = glyph.nodes[i];
      if (!p0) continue;
      const twinkle = (sin(t * 3.0 + i * 4.1 + mem.id) + 1) * 0.5;
      const a = baseA * GLYPH_SPARKLE_STRENGTH * twinkle;
      if (a < 1) continue;
      fill(255, 255, 255, a);
      ellipse(p0.x, p0.y, 0.16, 0.16);
    }
  }

  // ── Glassy / marble overlay ──
  const mT = t * 0.4 + glyph.seed * 0.0001;
  const aPts = glyph.anchor || [];
  if (aPts.length >= 2) {
    // Translucent fill "body" — gives the glass-filled look
    noStroke();
    fill(inkR, inkG, inkB, baseA * 0.04);
    beginShape();
    for (let i = 0; i < aPts.length; i++) {
      const ap = aPts[i];
      curveVertex(ap.x, ap.y, 0);
    }
    endShape(CLOSE);

    // Marble veins — thick, visible coloured streaks that drift
    noFill();
    for (let v = 0; v < 2; v++) {
      const vPhase = phase + v * 47 + mT * 8;
      const vr = sin(vPhase * 0.017) * 70 + inkR * 0.6 + 100;
      const vg = sin(vPhase * 0.023) * 70 + inkG * 0.6 + 80;
      const vb = sin(vPhase * 0.033) * 70 + inkB * 0.6 + 60;
      stroke(vr, vg, vb, baseA * (0.13 + v * 0.03));
      strokeWeight(1.4 - v * 0.25);
      beginShape();
      for (let i = 0; i < aPts.length; i++) {
        const ap = aPts[i];
        const d1 = (noise(ap.x * 1.8 + v * 3.3, ap.y * 1.8, mT + v * 0.7) - 0.5) * 0.22;
        const d2 = (noise(ap.x * 1.8 + 7.7, ap.y * 1.8 + v * 4.1, mT + v * 0.7) - 0.5) * 0.22;
        curveVertex(ap.x + d1, ap.y + d2, 0);
      }
      endShape();
    }

    // Specular highlight — bright white line sliding across the glyph
    const specPos = (sin(mT * 0.5) * 0.5 + 0.5);
    const specStart = floor(aPts.length * max(0, specPos - 0.2));
    const specEnd = min(aPts.length, floor(aPts.length * (specPos + 0.15)));
    if (specEnd > specStart + 1) {
      stroke(255, 255, 255, baseA * 0.35 * (0.6 + 0.4 * sin(mT * 1.3)));
      strokeWeight(0.9);
      beginShape();
      for (let i = specStart; i < specEnd; i++) {
        const ap = aPts[i];
        if (!ap) continue;
        const off = (noise(ap.x * 3.0, ap.y * 3.0, mT * 0.5) - 0.5) * 0.06;
        curveVertex(ap.x + off, ap.y - 0.04, 0);
      }
      endShape();
    }

    // Outer glass edge highlight
    stroke(255, 255, 255, baseA * 0.06);
    strokeWeight(1.5);
    noFill();
    beginShape();
    for (let i = 0; i < aPts.length; i++) {
      curveVertex(aPts[i].x, aPts[i].y, 0);
    }
    endShape();
  }

  pop();
}

function drawAnchor2D(glyph, distortAmt = 0, flow = 0) {
  const pts = glyph.anchor || [];
  if (pts.length < 2) return;
  beginShape();
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const n = distortAmt > 0 ? (noise(p.x * 1.7 + flow, p.y * 1.7 + flow) - 0.5) * distortAmt : 0;
    const nx = distortAmt > 0 ? (noise(p.x * 1.7 + 9.1 + flow, p.y * 1.7 + flow) - 0.5) * distortAmt : 0;
    curveVertex(p.x + nx, p.y + n, 0);
  }
  endShape();
}

function drawFragments2D(glyph, distortAmt = 0, flow = 0) {
  const pts = glyph.nodes || [];
  const edges = glyph.edges || [];
  if (pts.length < 2 || !edges.length) return;
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i];
    const a = pts[e.a], b = pts[e.b];
    if (!a || !b) continue;
    const mx = (a.x + b.x) * 0.5;
    const my = (a.y + b.y) * 0.5;
    const nAmt = 0.07 + distortAmt;
    const nx = (noise(mx * 1.3 + glyph.variation + flow, my * 1.3 + glyph.seed * 0.0001) - 0.5) * nAmt;
    const ny = (noise(mx * 1.3 + 19.2 + flow, my * 1.3 + glyph.seed * 0.0001) - 0.5) * nAmt;
    beginShape();
    curveVertex(a.x, a.y, 0);
    curveVertex(a.x, a.y, 0);
    curveVertex(mx + nx, my + ny, 0);
    curveVertex(b.x, b.y, 0);
    curveVertex(b.x, b.y, 0);
    endShape();
  }
}
