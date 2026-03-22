// Flow screen rendering: void, login, symbol, create, preview, final.

function drawVoid() {
  drawSpaceBackground();
  const t = frameCount * 0.004;

  // Draw drifting shared memories from DB
  if (voidMemories.length > 0) {
    push();
    camera(0, 0, (height / 2 / tan(PI / 6)) + 200, 0, 0, 0, 0, 1, 0);
    rotateY(t * 0.15);
    rotateX(0.1);
    const count = min(voidMemories.length, 20);
    for (let i = 0; i < count; i++) {
      const vm = voidMemories[i];
      const phi = (i / count) * TWO_PI + t * 0.08;
      const theta = acos(2 * (i / max(count - 1, 1)) - 1);
      const orbitR = min(width, height) * 0.25;
      const x = orbitR * sin(theta) * cos(phi);
      const y = orbitR * sin(theta) * sin(phi) * 0.5;
      const z = orbitR * cos(theta) * 0.6;
      push();
      translate(x, y, z);
      // Soft glowing orb per memory
      noStroke();
      const hue = (i * 47 + 180) % 360;
      const r = 80 + 50 * sin(hue * 0.017);
      const g = 90 + 40 * cos(hue * 0.023);
      const b = 160 + 50 * sin(hue * 0.031 + 1);
      const sz = 18 + 10 * sin(t * 2 + i);
      fill(r, g, b, 30);
      sphere(sz * 1.4, 12, 10);
      fill(r, g, b, 60);
      sphere(sz, 12, 10);
      fill(r + 40, g + 30, b + 20, 90);
      sphere(sz * 0.5, 10, 8);
      pop();
    }
    pop();
  } else {
    push();
    camera();
    ortho(-width / 2, width / 2, height / 2, -height / 2, -10, 10);
    stroke(100, 140, 255, 35); strokeWeight(0.5);
    line(-100, 0, 100, 0); line(0, -100, 0, 100);
    noStroke();
    pop();
  }

  // Overlay text (2D)
  push();
  camera();
  ortho(-width / 2, width / 2, height / 2, -height / 2, -10, 10);
  noStroke();
  fill(200, 215, 255, 180);
  textAlign(CENTER, CENTER);
  textSize(14);
  textStyle(ITALIC);
  const memCount = voidMemories.length;
  text('the void · memories drift here', 0, -60);
  textSize(11);
  textStyle(NORMAL);
  fill(150, 170, 220, 100);
  if (memCount > 0) {
    text(`${memCount} memor${memCount !== 1 ? 'ies' : 'y'} floating · draw your identity to enter`, 0, 20);
  } else {
    text('draw your identity to enter', 0, 20);
  }
  pop();
}

function drawLogin() {
  drawSpaceBackground();
}

function drawSymbol() {
  drawSpaceBackground();
}

function drawCreateOrIdle() {
  if (mode === 'idle') {
    drawSpaceBackground();
    push();
    camera();
    ortho(-width / 2, width / 2, height / 2, -height / 2, -10, 10);
    stroke(100, 140, 255, 45);
    strokeWeight(0.5);
    line(-80, 0, 80, 0);
    line(0, -80, 0, 80);
    noStroke();
    fill(180, 190, 230, 120);
    textAlign(CENTER, CENTER);
    textSize(12);
    textStyle(ITALIC);
    text('add a memory below', 0, 0);
    pop();
  } else {
    // CREATE with memories: same as INTERACT but we're still in "add more" mode
    drawSpaceBackground();
    if (!isDragging) rotY += 0.0048;
    curRotX = lerp(curRotX, rotX, CAM_ROT_LERP);
    curRotY = lerp(curRotY, rotY, CAM_ROT_LERP);
    if (clickedMem !== null) {
      labelAlpha = max(0, labelAlpha - 0.7);
      if (labelAlpha <= 0) {
        clickedMem = null; hideLabelEl();
        memories.forEach(m=>{ if(m.labelEl) m.labelEl.style.opacity='0'; });
      } else {
        updateLabelEl();
        if (memories[clickedMem] && memories[clickedMem].labelEl) {
          memories[clickedMem].labelEl.style.opacity = (labelAlpha/255*0.85).toFixed(3);
        }
      }
    }
    // Left-of-center view in INTERACT mode as well.
    camera(-width * 0.6, 0, (height / 2 / tan(PI / 6)) + camZ, 0, 0, 0, 0, 1, 0);
    const t = frameCount * 0.008;
    const R = getSphereR();
    applyGravity(R);
    memories.forEach(mem => {
      mem.liveCenter = {
        x: mem.pos.x + sin(t * mem.freqX + mem.phaseX) * R * 0.12,
        y: mem.pos.y + sin(t * mem.freqY + mem.phaseY) * R * 0.12 * 0.28,
        z: mem.pos.z + sin(t * mem.freqX * 0.71 + mem.phaseX + 1.4) * R * 0.12 * 0.32,
      };
    });
    memories.forEach(mem => {
      if (!mem.isMerging) mem.vitality = max(0.08, mem.vitality - 0.000025);
      if (mem.cooldown > 0) mem.cooldown--;
    });
    tickOverlap(R, t);
    push();
    rotateX(curRotX);
    rotateY(curRotY);
    if (activeOverlap) drawOverlapEffect(R);
    memories.forEach((mem, mi) => {
      push();
      translate(mem.liveCenter.x, mem.liveCenter.y, mem.liveCenter.z);
      const distAlpha = getDistanceAlpha(mem.liveCenter);
      if (distAlpha <= 0) { pop(); return; }
      const spin = t * (0.13 + mi * 0.025);
      drawMemSphere(R, mem);
      drawStampSatellite(R, mem, distAlpha);
      push();
      rotateY(spin);
      rotateX(spin * 0.6);
      fill(255, 255, 255, 255 * mem.vitality * distAlpha);
      mem.nodes.forEach(nd => drawGlyph3D(nd, mem.glyphs, mem, mem.vitality * distAlpha));
      pop();
      pop();
    });
    pop();
    updateMemoryLabels2D();
  }
}

function drawPreview() {
  drawSpaceBackground();
  if (!pendingMemory) { appState = APP_STATE.CREATE; previewMemCache = null; return; }
  const mem = buildPreviewMemory(pendingMemory);
  if (mem) {
    const t = frameCount * 0.008;
    const R = 120;
    camera(0, 0, height / 2 / tan(PI / 6) + 50, 0, 0, 0, 0, 1, 0);
    push();
    rotateY(t * 0.5);
    rotateX(0.15);
    translate(0, 0, 0);
    drawMemSphere(R, mem);
    drawStampSatellite(R, mem);
    push();
    rotateY(t * 0.3);
    rotateX(t * 0.2);
    fill(255, 255, 255, 255 * mem.vitality);
    mem.nodes.forEach(nd => drawGlyph3D(nd, mem.glyphs, mem, mem.vitality));
    pop();
    pop();
  }
  push();
  camera();
  ortho(-width / 2, width / 2, height / 2, -height / 2, -10, 10);
  noStroke();
  fill(200, 215, 255, 180);
  textAlign(CENTER, CENTER);
  textSize(12);
  textStyle(ITALIC);
  text(`"${pendingMemory}"`, 0, height / 2 - 90);
  textSize(10);
  textStyle(NORMAL);
  fill(150, 170, 220, 120);
  text('ready to stamp?', 0, height / 2 - 60);
  pop();
}

function drawFinal() {
  drawSpaceBackground();
  if (mode === 'display') {
    // Left-of-center view while in CREATE mode with memories.
    camera(-width * 0.6, 0, (height / 2 / tan(PI / 6)) + camZ, 0, 0, 0, 0, 1, 0);
    if (!isDragging) rotY += 0.0048;
    curRotX = lerp(curRotX, rotX, CAM_ROT_LERP);
    curRotY = lerp(curRotY, rotY, CAM_ROT_LERP);
    const t = frameCount * 0.008;
    const R = getSphereR();
    applyGravity(R);
    memories.forEach(mem => {
      mem.liveCenter = {
        x: mem.pos.x + sin(t * mem.freqX + mem.phaseX) * R * 0.12,
        y: mem.pos.y + sin(t * mem.freqY + mem.phaseY) * R * 0.12 * 0.28,
        z: mem.pos.z + sin(t * mem.freqX * 0.71 + mem.phaseX + 1.4) * R * 0.12 * 0.32,
      };
    });
    memories.forEach(mem => { if (!mem.isMerging) mem.vitality = max(0.08, mem.vitality - 0.000025); if (mem.cooldown > 0) mem.cooldown--; });
    tickOverlap(R, t);
    push();
    rotateX(curRotX);
    rotateY(curRotY);
    if (activeOverlap) drawOverlapEffect(R);
    memories.forEach((mem, mi) => {
      push();
      translate(mem.liveCenter.x, mem.liveCenter.y, mem.liveCenter.z);
      const distAlpha = getDistanceAlpha(mem.liveCenter);
      if (distAlpha <= 0) { pop(); return; }
      const spin = t * (0.13 + mi * 0.025);
      drawMemSphere(R, mem);
      drawStampSatellite(R, mem, distAlpha);
      push();
      rotateY(spin);
      rotateX(spin * 0.6);
      fill(255, 255, 255, 255 * mem.vitality * distAlpha);
      mem.nodes.forEach(nd => drawGlyph3D(nd, mem.glyphs, mem, mem.vitality * distAlpha));
      pop();
      pop();
    });
    pop();
    updateMemoryLabels2D();
  } else {
    noStroke();
    fill(180, 190, 230, 140);
    textAlign(CENTER, CENTER);
    textSize(12);
    text('your final artifact', 0, 0);
  }
}
