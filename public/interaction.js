// Mouse, keyboard, and window event handlers.

function projectCenter(sc) {
  let { x, y, z } = sc;
  let x1 = x * cos(curRotY) + z * sin(curRotY), z1 = -x * sin(curRotY) + z * cos(curRotY), y1 = y;
  let y2 = y1 * cos(curRotX) - z1 * sin(curRotX), z2 = y1 * sin(curRotX) + z1 * cos(curRotX), x2 = x1;
  const fov = height / 2 / tan(PI / 6), s = fov / (fov + camZ + z2);
  return { sx: x2 * s + width / 2, sy: y2 * s + height / 2 };
}

function mousePressed() {
  if (appState === APP_STATE.SYMBOL) return;
  if (mode !== 'display') return;
  isDragging = false; lastMX = mouseX; lastMY = mouseY;
}

function mouseDragged() {
  if (appState === APP_STATE.SYMBOL) return;
  isDragging = true;
  rotY += (mouseX - lastMX) * 0.007;
  rotX -= (mouseY - lastMY) * 0.007;
  rotX = constrain(rotX, -PI * 0.42, PI * 0.42);
  lastMX = mouseX; lastMY = mouseY;
}

function mouseReleased() {
  if (appState === APP_STATE.SYMBOL) return;
  if (isDragging) { isDragging = false; return; }
  if (mode !== 'display') return;
  const R = getSphereR();
  let best = -1, bestDist = R * 0.95;
  memories.forEach((mem, mi) => {
    const p = projectCenter(mem.liveCenter);
    const d = dist(mouseX, mouseY, p.sx, p.sy);
    if (d < bestDist) { bestDist = d; best = mi; }
  });
  if (best >= 0) {
    if (interactionMode === INTERACTION_MODE.RAW || interactionMode === INTERACTION_MODE.RECALL) {
      clickedMem = best; labelAlpha = 255;
      showLabelEl(memories[best], best);
      showFloatingLabel(memories[best]);
    }
  }
}

function mouseWheel(e) {
  if (mode === 'display') camZ = constrain(camZ + e.delta * 0.4, -400, 800);
  return false;
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  if (window.threeMemoryRenderer) window.threeMemoryRenderer.resize(windowWidth, windowHeight);
  invalidateSpaceBackgroundCache();
  if (authBuffer) { authBuffer = createGraphics(width, height); if (appState === APP_STATE.SYMBOL) initSymbolDrawing(); }
  recalcBases();
}
