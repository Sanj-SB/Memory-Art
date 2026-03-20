// UI management: mode switching, flow UI, labels, transitions, symbol drawing, stamps.

function switchMode(m) {
  const prevMode = interactionMode;
  console.log(`[DEBUG:MODE] switchMode called: "${prevMode}" → "${m}"`);
  if (prevMode === INTERACTION_MODE.RECALL && m !== 'recall') {
    console.log(`[DEBUG:MODE] Leaving RECALL — restoring original sentences`);
    memories.forEach((mem, i) => {
      if (mem._recallApplied || mem._recallLoading) {
        mem.sentence = mem.originalSentence;
        mem._recallApplied = false;
        mem._recallLoading = false;
        rebuildNodes(i);
      }
    });
  }
  if (prevMode === INTERACTION_MODE.RAW && m !== 'raw') {
    console.log(`[DEBUG:MODE] Leaving RAW — clearing raw snapshots`);
    memories.forEach(mem => { delete mem._rawSnapshot; });
  }
  if (m === 'raw') {
    interactionMode = INTERACTION_MODE.RAW;
    const fi = firstOwnedMemory();
    rawFocusIdx = fi >= 0 ? fi : 0;
    console.log(`[DEBUG:MODE] Entered RAW mode, focusIdx=${rawFocusIdx}`);
    setStatus('raw · original memory');
  } else if (m === 'recall') {
    interactionMode = INTERACTION_MODE.RECALL;
    const fi = firstOwnedMemory();
    rawFocusIdx = fi >= 0 ? fi : 0;
    console.log(`[DEBUG:MODE] Entered RECALL mode, focusIdx=${rawFocusIdx}`);
    setStatus('recall · memory subtly altered');
  } else if (m === 'collective') {
    interactionMode = INTERACTION_MODE.COLLECTIVE;
    console.log(`[DEBUG:MODE] Entered COLLECTIVE mode — memories will attract & merge`);
    setStatus('collective · memories attract & merge');
  } else {
    interactionMode = INTERACTION_MODE.FLOAT;
    console.log(`[DEBUG:MODE] Entered FLOAT mode`);
    setStatus('floating · memories drift in space');
  }
  document.querySelectorAll('.mode-btn[data-mode]').forEach(b => {
    b.classList.remove('active');
    if (b.dataset.mode === m) b.classList.add('active');
  });
  if (m === 'raw' || m === 'recall') {
    openTimeline();
  } else {
    closeTimeline();
  }
}

function applyGestureMode(gesture) {
  console.log(`[DEBUG:GESTURE] Gesture detected: "${gesture}" — switching mode`);
  switchMode(gesture);
}

function ensureFadeEl() {
  if (_fadeEl) return _fadeEl;
  _fadeEl = document.createElement('div');
  _fadeEl.id = 'fadeTransition';
  Object.assign(_fadeEl.style, {
    position: 'fixed', inset: '0', zIndex: '9999', pointerEvents: 'none',
    opacity: '0',
    background: 'radial-gradient(ellipse at center, rgba(60,50,140,0.85) 0%, rgba(10,15,35,0.97) 70%)',
    transition: 'opacity 1.2s ease',
  });
  document.body.appendChild(_fadeEl);
  return _fadeEl;
}

function transitionTo(newState) {
  console.log(`[DEBUG:STATE] transitionTo: "${appState}" → "${newState}"`);
  const el = ensureFadeEl();
  el.style.opacity = '1';
  setTimeout(() => {
    appState = newState;
    console.log(`[DEBUG:STATE] Transition complete — now in "${newState}"`);
    setTimeout(() => { el.style.opacity = '0'; }, 300);
  }, 1300);
}

function updateFlowUI() {
  const ia = document.getElementById('inputArea');
  const utils = document.getElementById('utils');
  const title = document.getElementById('title');
  const voidEnter = document.getElementById('voidEnter');
  const previewActions = document.getElementById('previewActions');
  const modeSwitcher = document.getElementById('modeSwitcher');
  const finalActions = document.getElementById('finalActions');
  const loginOverlay = document.getElementById('loginOverlay');
  const symbolOverlay = document.getElementById('symbolOverlay');
  const symbolDone = document.getElementById('symbolDone');
  const focusNav = document.getElementById('focusNav');
  if (!ia) return;

  const show = (el, v) => { if (el) el.style.display = v ? '' : 'none'; };

  const canvasContainer = document.getElementById('canvas-container');
  if (canvasContainer) {
    const needsCanvasInput =
      (appState === APP_STATE.CREATE && mode === 'display') ||
      appState === APP_STATE.INTERACT ||
      appState === APP_STATE.FINAL;
    canvasContainer.style.pointerEvents = needsCanvasInput ? 'auto' : 'none';
  }

  const skipBtn = document.getElementById('skipToVoidBtn');
  show(loginOverlay, false);
  show(symbolOverlay, false);
  show(symbolDone, false);
  show(voidEnter, false);
  show(previewActions, false);
  show(modeSwitcher, false);
  show(finalActions, false);
  show(focusNav, false);
  show(skipBtn, false);
  if (handVideo) handVideo.style.display = 'none';

  if (appState === APP_STATE.VOID) {
    show(ia, false); show(utils, false); show(title, true);
    if (voidEnter) voidEnter.style.display = 'flex';
    setStatus(currentUser ? 'the void · logged in' : 'the void');
  } else if (appState === APP_STATE.LOGIN) {
    show(ia, false); show(utils, false); show(title, false);
    if (loginOverlay) loginOverlay.style.display = 'flex';
    setStatus('login');
  } else if (appState === APP_STATE.SYMBOL) {
    show(ia, false); show(utils, false); show(title, false);
    show(symbolOverlay, true);
    if (symbolDone) symbolDone.style.display = 'flex';
    setStatus('draw your identity symbol');
  } else if (appState === APP_STATE.CREATE || appState === APP_STATE.INTERACT) {
    if (appState === APP_STATE.INTERACT && memories.length > 0 && !gestureTutorialShown) showGestureTutorial();
    show(ia, true); show(utils, true); show(title, true);
    show(skipBtn, appState === APP_STATE.CREATE);
    show(modeSwitcher, appState === APP_STATE.INTERACT && memories.length > 0);
    const ownedCount = getOwnedIndices().length;
    const showFocusNav = appState === APP_STATE.INTERACT && ownedCount > 1 &&
      (interactionMode === INTERACTION_MODE.RAW || interactionMode === INTERACTION_MODE.RECALL);
    if (focusNav) focusNav.style.display = showFocusNav ? 'flex' : 'none';
    const toFinalBtn = document.getElementById('toFinalBtn');
    if (toFinalBtn) toFinalBtn.style.display = appState === APP_STATE.INTERACT && memories.length > 0 ? '' : 'none';
    setStatus(appState === APP_STATE.CREATE ? 'add memories' : `${memories.length} memor${memories.length !== 1 ? 'ies' : 'y'}`);
  } else if (appState === APP_STATE.PREVIEW) {
    show(ia, false); show(utils, false); show(title, false);
    show(previewActions, true);
    setStatus('preview');
  } else if (appState === APP_STATE.FINAL) {
    show(ia, false); show(utils, true); show(title, true);
    show(modeSwitcher, true); show(finalActions, true);
    const toFinalBtn = document.getElementById('toFinalBtn');
    if (toFinalBtn) toFinalBtn.style.display = 'none';
    setStatus('final artifact');
  }
}

// Symbol drawing
let authBuffer = null;
let authStrokes = [];
let symbolError = null;

function initSymbolDrawing() {
  authStrokes = [];
  symbolError = null;
  showSymbolError();
  const overlay = document.getElementById('symbolOverlay');
  const canvas = document.getElementById('authDrawCanvas');
  if (overlay) overlay.style.display = '';
  if (canvas) {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    ctx.strokeStyle = 'rgba(200, 215, 255, 0.9)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    let isDrawing = false;
    const getXY = (e) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / dpr / rect.width;
      const scaleY = canvas.height / dpr / rect.height;
      const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left;
      const y = (e.clientY || e.touches?.[0]?.clientY) - rect.top;
      return { x: x * scaleX, y: y * scaleY };
    };
    const startStroke = (e) => { e.preventDefault(); isDrawing = true; const p = getXY(e); authStrokes.push([p]); };
    const addPoint = (e) => {
      if (!isDrawing) return;
      e.preventDefault();
      const p = getXY(e);
      const s = authStrokes[authStrokes.length - 1];
      if (s && s.length) { ctx.beginPath(); ctx.moveTo(s[s.length - 1].x, s[s.length - 1].y); ctx.lineTo(p.x, p.y); ctx.stroke(); }
      s.push(p);
    };
    const endStroke = () => { isDrawing = false; };
    canvas.onmousedown = startStroke;
    canvas.onmousemove = addPoint;
    canvas.onmouseup = endStroke;
    canvas.onmouseleave = endStroke;
    canvas.ontouchstart = (e) => { startStroke(e); };
    canvas.ontouchmove = (e) => { addPoint(e); };
    canvas.ontouchend = endStroke;
  }
}

function showSymbolError() {
  const el = document.getElementById('symbolError');
  if (el) { el.textContent = symbolError || ''; el.style.display = symbolError ? '' : 'none'; }
}

async function validateAndSaveSymbol() {
  if (authStrokes.length < 2) { symbolError = 'draw at least two strokes'; showSymbolError(); return; }
  const totalPts = authStrokes.reduce((s, st) => s + st.length, 0);
  if (totalPts < 35) { symbolError = 'draw more — at least 35 points'; showSymbolError(); return; }
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  authStrokes.flat().forEach(p => {
    minX = min(minX, p.x); maxX = max(maxX, p.x);
    minY = min(minY, p.y); maxY = max(maxY, p.y);
  });
  const w = maxX - minX, h = maxY - minY;
  if (w < 5 || h < 5) { symbolError = 'draw something larger'; showSymbolError(); return; }
  const aspect = max(w, h) / max(min(w, h), 1);
  if (aspect > 8) { symbolError = 'avoid letter-like shapes (too narrow)'; showSymbolError(); return; }
  const glyphData = authStrokes.map(s => s.map(p => ({ x: p.x, y: p.y })));
  await saveSymbol(glyphData);
  const overlay = document.getElementById('symbolOverlay');
  if (overlay) overlay.style.display = 'none';
  appState = APP_STATE.CREATE;
  setStatus('add your first memory');
}

function doStampPreview() {
  const sentence = pendingMemory;
  if (!sentence) return;
  console.log(`[DEBUG:STAMP] doStampPreview: "${sentence}" (anonymous=${isAnonymous}, firstStamp=${memories.length === 0})`);
  const anon = isAnonymous;
  const isFirstStamp = memories.length === 0;
  pendingMemory = null;
  previewMemCache = null;
  previewMemCacheSentence = '';
  isAnonymous = false;
  transitionTo(APP_STATE.INTERACT);
  mode = 'display';
  curRotX = rotX; curRotY = rotY;
  addMemory(sentence, anon);
  saveMemoryToDB(sentence, anon, identityGlyphData);
  if (isFirstStamp) loadSharedIntoInteract();
  loop();
}

function doStampFinal() {
  console.log(`[DEBUG:STAMP] doStampFinal: saving canvas and resetting (${memories.length} memories)`);
  saveCanvas('memory-glyphs-final-' + Date.now(), 'png');
  setStatus('stamped to void · starting over');
  seedVal = floor(random(99999));
  initGlyphGraph();
  clearMemoryLabels();
  memories = [];
  activeOverlap = null;
  memIdCounter = 0;
  Object.keys(simCache).forEach(k => delete simCache[k]);
  updateMemoryList();
  appState = APP_STATE.VOID;
  mode = 'idle';
}

function triggerAdd() {
  const v = select('#memInput').elt.value.trim();
  if (!v) return;
  select('#memInput').elt.value = '';
  pendingMemory = v;
  previewMemCache = null;
  previewMemCacheSentence = '';
  appState = APP_STATE.PREVIEW;
}

// Labels
function showFloatingLabel(mem) {
  if (!isMyMemory(mem)) return;
  const el = ensureMemoryLabel(mem);
  if (!el) return;
  el.textContent = mem.sentence;
  const p = projectCenter(mem.liveCenter);
  el.style.left = `${p.sx}px`;
  el.style.top = `${p.sy + 10}px`;
  el.style.opacity = '0.85';
}

function showLabelEl() {}
function updateLabelEl() {}
function hideLabelEl() {
  const el = document.getElementById('memLabel');
  if (el) el.style.display = 'none';
}

function updateMemoryList() {
  memories.forEach(mem => ensureMemoryLabel(mem));
}

function ensureMemoryLabel(mem) {
  if (mem.labelEl) return mem.labelEl;
  const el = document.createElement('div');
  el.className = 'mem-label-el';
  el.textContent = mem.sentence;
  document.body.appendChild(el);
  mem.labelEl = el;
  return el;
}

function clearMemoryLabels() {
  memories.forEach(mem => {
    if (mem.labelEl && mem.labelEl.remove) mem.labelEl.remove();
    mem.labelEl = null;
  });
}

function hideAllMemoryLabels() {
  memories.forEach(mem => {
    if (mem.labelEl) mem.labelEl.style.opacity = '0';
  });
}

function updateMemoryLabels2D() {
  memories.forEach(mem => {
    if (mem.labelEl) mem.labelEl.style.opacity = '0';
  });
}
