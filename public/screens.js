// Flow screen rendering: void, login, symbol, create, preview, final.

/** VOID onboarding: HTML (landing / auth) covers the canvas; keep stack flat—no orbs, text, or space gradient bleed-through. */
function drawVoid() {
  if (window.threeMemoryRenderer) window.threeMemoryRenderer.clear();
  background(6, 10, 25);
}

function drawLogin() {
  if (window.threeMemoryRenderer) window.threeMemoryRenderer.clear();
  background(6, 10, 25);
}

function drawSymbol() {
  drawSpaceBackground();
}

function drawCreateOrIdle() {
  if (mode === 'idle') {
    drawSpaceBackground();
    push();
    translate(width / 2, height / 2);
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
    if (window.threeMemoryRenderer) {
      window.threeMemoryRenderer.renderMemories({
        memories, R, rotX: curRotX, rotY: curRotY, camZ, leftShift: -width * 0.6, activeOverlap
      });
    }
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
    if (!isDragging) rotY += 0.003;
    curRotX = lerp(curRotX, 0.15, 0.12);
    curRotY = lerp(curRotY, rotY + t * 0.2, 0.12);
    const pv = { ...mem, liveCenter: { x: 0, y: 0, z: 0 } };
    if (window.threeMemoryRenderer) {
      window.threeMemoryRenderer.renderMemories({ memories: [pv], R, rotX: curRotX, rotY: curRotY, camZ: 0, leftShift: 0 });
    }
  }
  push();
  noStroke();
  textAlign(CENTER, TOP);
  const topPad = constrain(height * 0.065, 48, 100);
  const maxW = width * 0.74;
  const cx = width * 0.5;

  textSize(10);
  textLeading(16);
  textStyle(NORMAL);
  fill(150, 170, 220, 120);
  text('ready to stamp?', cx, topPad);

  const gap = 6;
  const quoteY = topPad + textAscent() + textDescent() + gap;

  fill(200, 215, 255, 180);
  textSize(12);
  textLeading(20);
  textStyle(ITALIC);
  const quoted = `"${pendingMemory}"`;
  text(quoted, cx, quoteY, maxW);
  pop();
}

function drawFinal() {
  drawSpaceBackground();
  if (mode === 'display') {
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
    if (window.threeMemoryRenderer) {
      window.threeMemoryRenderer.renderMemories({
        memories, R, rotX: curRotX, rotY: curRotY, camZ, leftShift: -width * 0.6, activeOverlap
      });
    }
    updateMemoryLabels2D();
  } else {
    if (window.threeMemoryRenderer) window.threeMemoryRenderer.clear();
    noStroke();
    fill(180, 190, 230, 140);
    textAlign(CENTER, CENTER);
    textSize(12);
    text('your final artifact', width / 2, height / 2);
  }
}
