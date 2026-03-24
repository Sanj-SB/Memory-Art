// Semantic gravity, overlap detection, and merge visuals.

const DEBUG_PHYSICS = false;

function applyGravity(R) {
  const collectiveIndices = interactionMode === INTERACTION_MODE.COLLECTIVE ? getCollectiveIndices() : null;
  const activeIndices = collectiveIndices && collectiveIndices.length ? collectiveIndices : memories.map((_, i) => i);
  if (interactionMode === INTERACTION_MODE.COLLECTIVE) {
    for (let ai = 0; ai < activeIndices.length; ai++) {
      for (let bi = ai + 1; bi < activeIndices.length; bi++) {
        const a = activeIndices[ai];
        const b = activeIndices[bi];
        const sim = getSim(a, b);
        const lA = memories[a].pos, lB = memories[b].pos;
        const dx = lB.x - lA.x, dy = lB.y - lA.y, dz = lB.z - lA.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < 1) continue;

        const base = 0.35;
        const strength = base + Math.max(0, sim);
        const force = strength * GRAVITY_K * (d / (d + R * 0.85));
        const fx = (dx / d) * force, fy = (dy / d) * force, fz = (dz / d) * force;

        memories[a].vel.x += fx; memories[a].vel.y += fy; memories[a].vel.z += fz;
        memories[b].vel.x -= fx; memories[b].vel.y -= fy; memories[b].vel.z -= fz;
      }
    }
  }

  activeIndices.forEach((idx) => {
    const mem = memories[idx];
    if (!mem) return;
    const bc = mem.baseCenter;
    mem.vel.x += (bc.x - mem.pos.x) * SPRING_K;
    mem.vel.y += (bc.y - mem.pos.y) * SPRING_K;
    mem.vel.z += (bc.z - mem.pos.z) * SPRING_K;
    mem.vel.x *= DAMPING; mem.vel.y *= DAMPING; mem.vel.z *= DAMPING;
    mem.pos.x += mem.vel.x; mem.pos.y += mem.vel.y; mem.pos.z += mem.vel.z;
  });
}

function tickOverlap(R, t) {
  if (interactionMode !== INTERACTION_MODE.COLLECTIVE) return;
  const activeIndices = getCollectiveIndices();
  if (activeIndices.length < 2) return;
  const threshold = R * 2.2;
  const stickThreshold = threshold * 1.3;

  if (activeOverlap) {
    const { miA, miB } = activeOverlap;
    const A = memories[miA], B = memories[miB];
    if (!A || !B || A.cooldown > 0 || B.cooldown > 0 || A.isMerging || B.isMerging) {
      if (DEBUG_PHYSICS) console.log(`[DEBUG:OVERLAP] Active overlap cancelled (cooldown/merging) between #${miA} and #${miB}`);
      activeOverlap = null;
    } else {
      const d = sphereDist(A.liveCenter, B.liveCenter);
      if (d <= stickThreshold) {
        activeOverlap.frames++;
        if (DEBUG_PHYSICS && activeOverlap.frames === 1) {
          console.log(`[DEBUG:OVERLAP] Memories #${miA} ("${A.sentence}") and #${miB} ("${B.sentence}") overlapping — dist=${d.toFixed(1)}`);
        }
        if (DEBUG_PHYSICS && activeOverlap.frames % 15 === 0) {
          console.log(`[DEBUG:OVERLAP] Progress: ${activeOverlap.frames}/${MERGE_FRAMES} (${(activeOverlap.frames / MERGE_FRAMES * 100).toFixed(0)}%)`);
        }

        // Pull them together while overlapping
        const mx = (A.liveCenter.x + B.liveCenter.x) * 0.5;
        const my = (A.liveCenter.y + B.liveCenter.y) * 0.5;
        const mz = (A.liveCenter.z + B.liveCenter.z) * 0.5;
        const pullStr = 0.015;
        A.vel.x += (mx - A.pos.x) * pullStr; A.vel.y += (my - A.pos.y) * pullStr; A.vel.z += (mz - A.pos.z) * pullStr;
        B.vel.x += (mx - B.pos.x) * pullStr; B.vel.y += (my - B.pos.y) * pullStr; B.vel.z += (mz - B.pos.z) * pullStr;

        const slow = 0.97;
        A.vel.x *= slow; A.vel.y *= slow; A.vel.z *= slow;
        B.vel.x *= slow; B.vel.y *= slow; B.vel.z *= slow;

        if (activeOverlap.frames >= MERGE_FRAMES && !activeOverlap.hasMerged) {
          activeOverlap.hasMerged = true;
          if (DEBUG_PHYSICS) console.log(`[DEBUG:MERGE] Overlap complete — triggering merge: #${miA} ("${A.sentence}") ↔ #${miB} ("${B.sentence}")`);
          mergeMemories(miA, miB);
        }
        return;
      } else {
        if (DEBUG_PHYSICS) console.log(`[DEBUG:OVERLAP] Drifted apart at ${activeOverlap.frames}/${MERGE_FRAMES} — dist=${d.toFixed(1)}`);
        activeOverlap = null;
      }
    }
  }

  // Find closest pair — no phaseDiff gate
  let closestPair = null, closestDist = Infinity;
  for (let ai = 0; ai < activeIndices.length; ai++) {
    for (let bi = ai + 1; bi < activeIndices.length; bi++) {
      const a = activeIndices[ai];
      const b = activeIndices[bi];
      if (memories[a].cooldown > 0 || memories[b].cooldown > 0) continue;
      if (memories[a].isMerging || memories[b].isMerging) continue;
      const d = sphereDist(memories[a].liveCenter, memories[b].liveCenter);
      if (d < threshold && d < closestDist) { closestDist = d; closestPair = [a, b]; }
    }
  }
  if (closestPair) {
    const [a, b] = closestPair;
    if (DEBUG_PHYSICS) console.log(`[DEBUG:COLLISION] New collision: #${a} ("${memories[a].sentence}") ↔ #${b} ("${memories[b].sentence}") — dist=${closestDist.toFixed(1)}, sim=${(getSim(a, b) * 100).toFixed(1)}%`);
    activeOverlap = { miA: a, miB: b, frames: 0, hasMerged: false };
    collectiveLastInteractionAt = Date.now();
  } else {
    activeOverlap = null;
    const now = Date.now();
    if (now - collectiveLastInteractionAt >= COLLECTIVE_FORCE_INTERACTION_MS) {
      let forcedPair = null;
      let bestSim = -Infinity;
      for (let ai = 0; ai < activeIndices.length; ai++) {
        for (let bi = ai + 1; bi < activeIndices.length; bi++) {
          const a = activeIndices[ai];
          const b = activeIndices[bi];
          const A = memories[a], B = memories[b];
          if (!A || !B || A.cooldown > 0 || B.cooldown > 0 || A.isMerging || B.isMerging) continue;
          const sim = getSim(a, b);
          if (sim > bestSim) { bestSim = sim; forcedPair = [a, b]; }
        }
      }
      if (forcedPair) {
        const [a, b] = forcedPair;
        const A = memories[a], B = memories[b];
        const midX = (A.pos.x + B.pos.x) * 0.5;
        const midY = (A.pos.y + B.pos.y) * 0.5;
        const midZ = (A.pos.z + B.pos.z) * 0.5;
        const sep = R * 0.45;
        A.pos.x = midX - sep; B.pos.x = midX + sep;
        A.pos.y = midY; B.pos.y = midY;
        A.pos.z = midZ; B.pos.z = midZ;
        A.vel.x += 0.12; B.vel.x -= 0.12;
        activeOverlap = { miA: a, miB: b, frames: 0, hasMerged: false };
        collectiveLastInteractionAt = now;
      }
    }
  }
}

function drawOverlapEffect(R) {
  const { miA, miB, frames } = activeOverlap;
  const a = memories[miA].liveCenter, b = memories[miB].liveCenter;
  const prog = min(frames / MERGE_FRAMES, 1.0);
  const pulse = 0.55 + 0.45 * sin(frameCount * 0.1);
  const sim = getSim(miA, miB);
  const recognized = memories[miA].mergeHistory.has(memories[miB].id);

  let gr, gg, gb;
  if (recognized)          { gr = 255; gg = 200; gb = 80; }
  else if (sim > 0.65)     { gr = 255; gg = 230; gb = 140; }
  else if (sim > 0.4)      { gr = 180; gg = 220; gb = 255; }
  else                     { gr = 200; gg = 160; gb = 255; }

  // Glowing connection beam
  stroke(gr, gg, gb, 35 * prog * pulse); strokeWeight(R * 0.85);
  line(a.x, a.y, a.z, b.x, b.y, b.z);
  stroke(gr, gg, gb, 80 * prog * pulse); strokeWeight(R * 0.3);
  line(a.x, a.y, a.z, b.x, b.y, b.z);
  stroke(gr, gg, gb, 160 * prog * pulse); strokeWeight(1.5);
  line(a.x, a.y, a.z, b.x, b.y, b.z);

  // Orbiting particles along the merge beam
  if (prog > 0.1) {
    noStroke();
    const numParticles = floor(3 + prog * 6);
    for (let i = 0; i < numParticles; i++) {
      const t = (i / numParticles + frameCount * 0.008) % 1.0;
      const px = lerp(a.x, b.x, t);
      const py = lerp(a.y, b.y, t) + sin(frameCount * 0.12 + i * 2.5) * R * 0.08 * prog;
      const pz = lerp(a.z, b.z, t) + cos(frameCount * 0.12 + i * 2.5) * R * 0.08 * prog;
      fill(gr, gg, gb, 100 * prog * pulse);
      push(); translate(px, py, pz); sphere(R * 0.025 * (0.5 + prog), 6, 4); pop();
    }
  }

  // Central merge glow when complete
  if (prog >= 1.0) {
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, mz = (a.z + b.z) / 2;
    noStroke();
    fill(gr, gg, gb, 80 * pulse);
    push(); translate(mx, my, mz); sphere(R * 0.2 * (0.7 + 0.3 * pulse), 10, 8); pop();
    fill(255, 255, 255, 40 * pulse);
    push(); translate(mx, my, mz); sphere(R * 0.35 * pulse, 8, 6); pop();
  }
}
