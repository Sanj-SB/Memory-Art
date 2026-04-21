// UI management: mode switching, flow UI, labels, transitions, symbol drawing, stamps.

function switchMode(m) {
  const prevMode = interactionMode;
  console.log(`[DEBUG:MODE] switchMode called: "${prevMode}" → "${m}"`);
  if (prevMode === INTERACTION_MODE.COLLECTIVE && m !== 'collective' &&
      typeof clearCollectiveMergeCallouts === 'function') {
    clearCollectiveMergeCallouts();
  }
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
    loadSharedIntoInteract();
    reshuffleCollectiveSelection(true);
    collectiveLastInteractionAt = Date.now();
    setStatus('collective · rotating memory subset');
  } else {
    interactionMode = INTERACTION_MODE.FLOAT;
    console.log(`[DEBUG:MODE] Entered FLOAT mode`);
    setStatus('floating · memories drift in space');
  }
  document.querySelectorAll('.mode-btn[data-mode]').forEach(b => {
    b.classList.remove('active');
    if (b.dataset.mode === m) b.classList.add('active');
  });
  if (m === 'recall') {
    openTimeline();
  } else {
    closeTimeline();
  }
  if (typeof updateRawMemoryHud === 'function') updateRawMemoryHud();
}

function applyGestureMode(gesture) {
  console.log(`[DEBUG:GESTURE] Gesture detected: "${gesture}" — switching mode`);
  switchMode(gesture);
  setStatus(`gesture detected · ${gesture}`);
  const modeFlash = document.getElementById('modeFlash');
  if (modeFlash) {
    modeFlash.textContent = `mode: ${gesture.toUpperCase()}`;
    modeFlash.style.opacity = '1';
    modeFlash.style.transform = 'translate(-50%, 0)';
    setTimeout(() => {
      modeFlash.style.opacity = '0';
      modeFlash.style.transform = 'translate(-50%, -8px)';
    }, 1200);
  }
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
  const landingScreen = document.getElementById('landingScreen');
  const authChoiceScreen = document.getElementById('authChoiceScreen');
  const memoryEntryScreen = document.getElementById('memoryEntryScreen');
  const onboardingTicker = document.getElementById('onboardingTicker');
  const previewActions = document.getElementById('previewActions');
  const modeSwitcher = document.getElementById('modeSwitcher');
  const finalActions = document.getElementById('finalActions');
  const loginOverlay = document.getElementById('loginOverlay');
  const stampInfoOverlay = document.getElementById('stampInfoOverlay');
  const symbolOverlay = document.getElementById('symbolOverlay');
  const voidTutorialOverlay = document.getElementById('voidTutorialOverlay');
  const symbolDone = document.getElementById('symbolDone');
  const focusNav = document.getElementById('focusNav');
  const poolCounter = document.getElementById('poolCounter');
  const saveBtn = document.getElementById('saveBtn');
  if (!ia) return;

  const show = (el, v) => { if (el) el.style.display = v ? '' : 'none'; };
  const showFlex = (el, v) => { if (el) el.style.display = v ? 'flex' : 'none'; };

  const canvasContainer = document.getElementById('canvas-container');
  if (canvasContainer) {
    const needsCanvasInput =
      (appState === APP_STATE.CREATE && mode === 'display') ||
      appState === APP_STATE.INTERACT ||
      appState === APP_STATE.FINAL;
    canvasContainer.style.pointerEvents = needsCanvasInput ? 'auto' : 'none';
    const flatOnboarding =
      appState === APP_STATE.VOID || appState === APP_STATE.LOGIN;
    canvasContainer.classList.toggle('canvas-onboarding-flat', flatOnboarding);
  }

  const skipBtn = document.getElementById('skipToVoidBtn');
  const memInputEl = document.getElementById('memInput');
  const hintEl = document.getElementById('hint');
  const addBtn = document.getElementById('addMemorySubmitBtn');
  const memoryOrEl = document.querySelector('.ob-memory-or');
  show(loginOverlay, false);
  show(stampInfoOverlay, false);
  show(symbolOverlay, false);
  show(symbolDone, false);
  showFlex(authChoiceScreen, false);
  showFlex(landingScreen, false);
  showFlex(memoryEntryScreen, false);
  show(previewActions, false);
  show(modeSwitcher, false);
  show(finalActions, false);
  show(focusNav, false);
  show(poolCounter, false);
  show(skipBtn, false);
  const interactBottomWrapReset = document.getElementById('interactBottomWrap');
  if (interactBottomWrapReset) interactBottomWrapReset.style.display = 'none';
  const rawHudReset = document.getElementById('rawMemoryHud');
  if (rawHudReset) rawHudReset.style.display = 'none';
  const modeBannerReset = document.getElementById('interactModeBanner');
  if (modeBannerReset) modeBannerReset.style.display = 'none';
  if (onboardingTicker) onboardingTicker.style.display = 'none';
  if (handVideo) handVideo.style.display = 'none';
  if (voidTutorialOverlay) {
    const shouldShowVoidTutorial = appState === APP_STATE.INTERACT && voidTutorialActive;
    voidTutorialOverlay.style.display = shouldShowVoidTutorial ? 'flex' : 'none';
    if (!shouldShowVoidTutorial && typeof clearVoidTutorialHighlight === 'function') {
      clearVoidTutorialHighlight();
    }
  }

  if (appState === APP_STATE.VOID) {
    show(ia, false); show(utils, false); show(title, false);
    if (onboardingTicker) onboardingTicker.style.display = 'block';
    if (!introPopupDismissed) {
      showFlex(landingScreen, true);
    } else {
      showFlex(authChoiceScreen, true);
    }
    setStatus(currentUser ? 'the void · logged in' : 'the void');
  } else if (appState === APP_STATE.LOGIN) {
    show(ia, false); show(utils, false); show(title, false);
    if (onboardingTicker) onboardingTicker.style.display = 'block';
    if (loginOverlay) loginOverlay.style.display = 'flex';
    setStatus('login');
  } else if (appState === APP_STATE.SYMBOL) {
    show(ia, false); show(utils, false); show(title, false);
    show(symbolOverlay, true);
    if (symbolDone) symbolDone.style.display = 'flex';
    setStatus('draw your identity symbol');
  } else if (appState === APP_STATE.CREATE || appState === APP_STATE.INTERACT) {
    const showSignupStampInfo = appState === APP_STATE.CREATE && signupFlowPendingStampInfo;
    if (appState === APP_STATE.INTERACT && memories.length > 0 && !gestureTutorialShown && gestureTutorialPending) showGestureTutorial();
    showFlex(memoryEntryScreen, appState === APP_STATE.CREATE);
    show(ia, appState === APP_STATE.CREATE && !showSignupStampInfo);
    show(utils, appState === APP_STATE.INTERACT);
    show(title, appState === APP_STATE.INTERACT && !showSignupStampInfo);
    showFlex(stampInfoOverlay, showSignupStampInfo);
    show(skipBtn, appState === APP_STATE.CREATE && !createEntryNeedsOpenClick && !createHideVoidButton);
    if (appState === APP_STATE.CREATE) {
      const gate = !!createEntryNeedsOpenClick;
      if (memInputEl) memInputEl.style.display = gate ? 'none' : '';
      if (hintEl) hintEl.style.display = gate ? 'none' : '';
      if (memoryOrEl) memoryOrEl.style.display = (gate || createHideVoidButton) ? 'none' : '';
      if (addBtn) {
        addBtn.textContent = gate ? 'enter new memory' : 'add new memory';
        addBtn.disabled = gate ? false : ((memInputEl?.value || '').trim().length === 0);
      }
    } else {
      if (memInputEl) memInputEl.style.display = '';
      if (hintEl) hintEl.style.display = '';
      if (memoryOrEl) memoryOrEl.style.display = '';
      if (addBtn) addBtn.textContent = 'add new memory';
    }
    show(modeSwitcher, appState === APP_STATE.INTERACT && memories.length > 0);
    show(poolCounter, appState === APP_STATE.INTERACT);
    const ownedCount = getOwnedIndices().length;
    const showFocusNav = appState === APP_STATE.INTERACT && ownedCount > 1 &&
      (interactionMode === INTERACTION_MODE.RAW || interactionMode === INTERACTION_MODE.RECALL);
    const interactBottomWrap = document.getElementById('interactBottomWrap');
    if (interactBottomWrap) {
      const showWrap = appState === APP_STATE.INTERACT && memories.length > 0 &&
        (interactionMode === INTERACTION_MODE.RAW || interactionMode === INTERACTION_MODE.RECALL);
      interactBottomWrap.style.display = showWrap ? 'flex' : 'none';
      interactBottomWrap.classList.toggle('interact-bottom-wrap--raw', showWrap && interactionMode === INTERACTION_MODE.RAW);
      interactBottomWrap.classList.toggle('interact-bottom-wrap--recall', showWrap && interactionMode === INTERACTION_MODE.RECALL);
    }
    if (focusNav) focusNav.style.display = showFocusNav ? 'flex' : 'none';
    const rawHud = document.getElementById('rawMemoryHud');
    if (rawHud) {
      const showRawHud = appState === APP_STATE.INTERACT && interactionMode === INTERACTION_MODE.RAW;
      rawHud.style.display = showRawHud ? 'block' : 'none';
    }
    if (typeof updateRawMemoryHud === 'function') updateRawMemoryHud();
    const modeBanner = document.getElementById('interactModeBanner');
    if (modeBanner) {
      const showBanner = appState === APP_STATE.INTERACT && memories.length > 0 &&
        (interactionMode === INTERACTION_MODE.RAW || interactionMode === INTERACTION_MODE.COLLECTIVE);
      modeBanner.style.display = showBanner ? 'block' : 'none';
      if (showBanner) {
        modeBanner.textContent = interactionMode === INTERACTION_MODE.RAW ? 'MODE: RAW' : 'MODE: COLLECTIVE';
      }
    }
    const toFinalBtn = document.getElementById('toFinalBtn');
    if (toFinalBtn) toFinalBtn.style.display = 'none';
    if (appState === APP_STATE.CREATE && typeof syncAddMemorySubmitState === 'function') {
      syncAddMemorySubmitState();
    }
    if (showSignupStampInfo) {
      setStatus('stamp guide');
    } else {
      setStatus(appState === APP_STATE.CREATE ? 'add memories' : `${memories.length} memor${memories.length !== 1 ? 'ies' : 'y'}`);
    }
  } else if (appState === APP_STATE.PREVIEW) {
    show(ia, false); show(utils, false); show(title, false);
    show(previewActions, true);
    setStatus('preview');
  } else if (appState === APP_STATE.FINAL) {
    show(ia, false); show(utils, true); show(title, true);
    show(modeSwitcher, true); show(finalActions, true);
    show(poolCounter, true);
    const toFinalBtn = document.getElementById('toFinalBtn');
    if (toFinalBtn) toFinalBtn.style.display = 'none';
    setStatus('final artifact');
  }
  if (appState !== APP_STATE.INTERACT || interactionMode !== INTERACTION_MODE.COLLECTIVE) {
    if (typeof clearCollectiveMergeCallouts === 'function') clearCollectiveMergeCallouts();
  }
  if (saveBtn) {
    const hideSaveOnStampChoice = appState === APP_STATE.PREVIEW;
    saveBtn.style.display = hideSaveOnStampChoice ? 'none' : '';
  }
  refreshPoolCounter();
  /* Landing + auth choice both use the same wispy hero (see landing-wispy-bg.js). */
  const voidOnboardingBg = appState === APP_STATE.VOID;
  const lwb = window.landingWispyBg;
  if (lwb) {
    if (voidOnboardingBg) {
      lwb.start();
      requestAnimationFrame(() => lwb.syncSize());
    } else {
      lwb.stop();
    }
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
  if (signupFlowPendingStampInfo) {
    createEntryNeedsOpenClick = false;
    createHideVoidButton = true;
  }
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
  if (currentUser) gestureTutorialPending = true;
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

function createCardBase(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0A0415';
  ctx.fillRect(0, 0, w, h);
  return { canvas, ctx };
}

function drawWrappedText(ctx, text, x, y, maxW, lineH, maxLines) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  words.forEach((word) => {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxW || !line) {
      line = next;
    } else {
      lines.push(line);
      line = word;
    }
  });
  if (line) lines.push(line);
  const clipped = lines.slice(0, maxLines);
  clipped.forEach((ln, i) => ctx.fillText(ln, x, y + i * lineH));
  return clipped.length;
}

function fitFontSizeForBox(ctx, text, maxW, maxH, startSize, minSize, family, lineHeightMul = 1.2) {
  const sample = String(text || '').trim();
  let size = startSize;
  while (size >= minSize) {
    ctx.font = `${size}px ${family}`;
    const lineH = Math.ceil(size * lineHeightMul);
    const words = sample.split(/\s+/).filter(Boolean);
    let lines = 1;
    let line = '';
    words.forEach((word) => {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width <= maxW || !line) {
        line = next;
      } else {
        lines += 1;
        line = word;
      }
    });
    if (lines * lineH <= maxH) return { size, lineH };
    size -= 2;
  }
  return { size: minSize, lineH: Math.ceil(minSize * lineHeightMul) };
}

function drawStampBadge(ctx, x, y, radius) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(235, 235, 240, 0.95)';
  ctx.fill();
  ctx.clip();
  if (identityGlyphData && identityGlyphData.length) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    identityGlyphData.forEach((stroke) => {
      stroke.forEach((p) => {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      });
    });
    const bw = Math.max(1, maxX - minX);
    const bh = Math.max(1, maxY - minY);
    const s = (radius * 1.45) / Math.max(bw, bh);
    const ox = x - ((minX + maxX) * 0.5) * s;
    const oy = y - ((minY + maxY) * 0.5) * s;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(18, 20, 28, 0.86)';
    ctx.lineWidth = Math.max(1.2, radius * 0.08);
    identityGlyphData.forEach((stroke) => {
      if (!stroke || stroke.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(stroke[0].x * s + ox, stroke[0].y * s + oy);
      for (let i = 1; i < stroke.length; i++) {
        ctx.lineTo(stroke[i].x * s + ox, stroke[i].y * s + oy);
      }
      ctx.stroke();
    });
  }
  ctx.restore();
}

function drawCardHeaderAndFooter(ctx, w, h, timestampLabel) {
  ctx.fillStyle = 'rgba(182, 198, 241, 0.75)';
  ctx.font = '24px "Cormorant Garamond", serif';
  ctx.fillText(timestampLabel, 56, 78);
  drawStampBadge(ctx, w - 72, 66, 46);
  ctx.fillStyle = 'rgba(246, 248, 255, 0.96)';
  ctx.font = '56px "Playfair Display", serif';
  ctx.fillText('IMORIA', 56, h - 42);
}

function drawSceneCrop(ctx, sourceCanvas, dx, dy, dw, dh, focusY = 0.5) {
  if (!sourceCanvas) return;
  const sw = sourceCanvas.width;
  const sh = sourceCanvas.height;
  const dstAspect = dw / Math.max(1, dh);
  const srcAspect = sw / Math.max(1, sh);
  let sx = 0;
  let sy = 0;
  let cw = sw;
  let ch = sh;

  if (srcAspect > dstAspect) {
    cw = Math.floor(sh * dstAspect);
    sx = Math.floor((sw - cw) * 0.5);
  } else if (srcAspect < dstAspect) {
    ch = Math.floor(sw / dstAspect);
    const minY = 0;
    const maxY = Math.max(0, sh - ch);
    sy = Math.floor(minY + (maxY - minY) * constrain(focusY, 0, 1));
  }

  ctx.drawImage(sourceCanvas, sx, sy, cw, ch, dx, dy, dw, dh);
}

function buildExportMemoriesForMode() {
  const R = getSphereR();
  if (interactionMode === INTERACTION_MODE.RAW) {
    const mem = rawFocusIdx >= 0 && rawFocusIdx < memories.length ? memories[rawFocusIdx] : null;
    if (!mem) return { memories: [], R, leftShift: 0, collectiveSet: null };
    let nodes = mem.nodes;
    let glyphs = mem.glyphs;
    if (mem._rawSnapshot && mem._rawSnapshot.nodes && mem._rawSnapshot.glyphs) {
      nodes = mem._rawSnapshot.nodes;
      glyphs = mem._rawSnapshot.glyphs;
    }
    const rawMem = { ...mem, nodes, glyphs, liveCenter: { x: 0, y: 0, z: 0 }, pos: { x: 0, y: 0, z: 0 } };
    return { memories: [rawMem], R, leftShift: 0, collectiveSet: null };
  }
  if (interactionMode === INTERACTION_MODE.RECALL) {
    const mem = rawFocusIdx >= 0 && rawFocusIdx < memories.length ? memories[rawFocusIdx] : null;
    if (!mem) return { memories: [], R, leftShift: 0, collectiveSet: null };
    const recallMem = { ...mem, liveCenter: { x: 0, y: 0, z: 0 }, pos: { x: 0, y: 0, z: 0 } };
    return { memories: [recallMem], R, leftShift: 0, collectiveSet: null };
  }
  const set = interactionMode === INTERACTION_MODE.COLLECTIVE ? collectiveActiveIds : null;
  return { memories: memories.slice(), R, leftShift: 0, collectiveSet: set };
}

function renderOrbCanvasForExport() {
  const tr = window.threeMemoryRenderer;
  if (!tr || typeof tr.captureMemoriesSnapshot !== 'function') return null;
  const payload = buildExportMemoriesForMode();
  return tr.captureMemoriesSnapshot({
    width: 1024,
    height: 1024,
    memories: payload.memories,
    R: payload.R,
    rotX: curRotX,
    rotY: curRotY,
    camZ,
    leftShift: payload.leftShift,
    activeOverlap,
    collectiveSet: payload.collectiveSet,
    clearColor: 0x0d1a3a,
    clearAlpha: 1
  });
}

function formatSaveTimestamp(ts) {
  const d = new Date(ts);
  const day = `${d.getDate()}`.padStart(2, '0');
  const month = `${d.getMonth() + 1}`.padStart(2, '0');
  const year = d.getFullYear();
  const hrs = `${d.getHours()}`.padStart(2, '0');
  const mins = `${d.getMinutes()}`.padStart(2, '0');
  return `${day}/${month}/${year} ${hrs}:${mins}`;
}

function latestMergeSnippet() {
  let latest = null;
  memories.forEach((mem) => {
    (mem.timeline || []).forEach((entry) => {
      if (entry.type !== 'merge') return;
      if (!latest || entry.time > latest.time) {
        latest = {
          time: entry.time,
          text: entry.text || '',
          srcA: entry.prev || '',
          srcB: entry.partnerSentence || ''
        };
      }
    });
  });
  return latest;
}

function downloadCardCanvas(canvas, prefix) {
  const a = document.createElement('a');
  a.download = `${prefix}-${Date.now()}.png`;
  a.href = canvas.toDataURL('image/png');
  a.click();
}

async function exportMemoryCardForCurrentMode() {
  const now = Date.now();
  const timestamp = formatSaveTimestamp(now);
  const src = renderOrbCanvasForExport();
  const { canvas, ctx } = createCardBase(1600, 1000);
  const w = canvas.width;
  const h = canvas.height;
  drawCardHeaderAndFooter(ctx, w, h, timestamp);

  if (interactionMode === INTERACTION_MODE.RAW) {
    drawSceneCrop(ctx, src, 380, 150, 840, 690);
    const mem = rawFocusIdx >= 0 && rawFocusIdx < memories.length ? memories[rawFocusIdx] : null;
    const text = mem ? getEnteredMemorySentence(mem) : '';
    ctx.fillStyle = 'rgba(247, 248, 255, 0.94)';
    const boxW = 520;
    const boxH = 190;
    const fit = fitFontSizeForBox(
      ctx,
      text,
      boxW,
      boxH,
      52,
      26,
      '"Cormorant Garamond", serif',
      1.12
    );
    const scaledSize = Math.max(18, Math.floor(fit.size * 0.75));
    const scaledLineH = Math.max(22, Math.floor(fit.lineH * 0.75));
    ctx.font = `${scaledSize}px "Cormorant Garamond", serif`;
    ctx.textAlign = 'right';
    const maxLines = Math.max(2, Math.floor(boxH / scaledLineH));
    drawWrappedText(ctx, text, w - 56, h - 54 - (maxLines - 1) * scaledLineH, boxW, scaledLineH, maxLines);
    ctx.textAlign = 'left';
    downloadCardCanvas(canvas, 'imoria-raw-card');
    return;
  }

  if (interactionMode === INTERACTION_MODE.RECALL) {
    drawSceneCrop(ctx, src, 120, 150, 940, 700);
    const panelScale = 1.05;
    const panelW = Math.round(430 * panelScale);
    const panelH = Math.round(770 * panelScale);
    const panelX = 1120 - Math.round((panelW - 430) / 2);
    const panelY = 120 - Math.round((panelH - 770) / 2);
    const panelPad = 24;
    const panelInnerW = panelW - panelPad * 2;
    ctx.fillStyle = 'rgba(10, 20, 48, 0.95)';
    ctx.fillRect(panelX, panelY, panelW, panelH);
    const mem = rawFocusIdx >= 0 && rawFocusIdx < memories.length ? memories[rawFocusIdx] : null;
    ctx.fillStyle = 'rgba(178, 194, 235, 0.72)';
    // Timeline panel typography: use roughly +5% over in-app timeline sizing.
    ctx.font = '10px Inter, sans-serif';
    ctx.fillText('MEMORY TIMELINE', panelX + panelPad, panelY + 60);
    ctx.fillText(`POOL ${collectivePoolTotal || memories.length || 0}`, panelX + panelW - 104, panelY + 60);
    ctx.fillStyle = 'rgba(236, 239, 250, 0.93)';
    ctx.font = '17px "Cormorant Garamond", serif';
    const baseText = mem ? (mem.originalSentence || mem.sentence || '') : '';
    const yOffset = drawWrappedText(ctx, `"${baseText}"`, panelX + panelPad, panelY + 98, panelInnerW, 24, 6);
    let y = panelY + 98 + yOffset * 24 + 24;
    ctx.strokeStyle = 'rgba(125, 150, 220, 0.22)';
    ctx.beginPath();
    ctx.moveTo(panelX + panelPad, y - 8);
    ctx.lineTo(panelX + panelW - panelPad, y - 8);
    ctx.stroke();
    const entries = mem && mem.timeline ? mem.timeline.slice().reverse().filter((e) => e.type !== 'created') : [];
    entries.slice(0, 3).forEach((entry) => {
      ctx.fillStyle = 'rgba(162, 180, 235, 0.72)';
      ctx.font = '9px Inter, sans-serif';
      const label = entry.type === 'merge' ? 'MERGED' : 'RECALLED';
      ctx.fillText(`${label} · ${formatTimeAgo(entry.time).toUpperCase()}`, panelX + panelPad, y + 10);
      ctx.fillStyle = 'rgba(238, 242, 252, 0.9)';
      ctx.font = '15px "Cormorant Garamond", serif';
      const used = drawWrappedText(ctx, `"${entry.text || ''}"`, panelX + panelPad, y + 32, panelInnerW, 22, 4);
      y += used * 22 + 28;
    });
    downloadCardCanvas(canvas, 'imoria-recall-card');
    return;
  }

  drawSceneCrop(ctx, src, 220, 145, 960, 700, 0.5);
  const merged = latestMergeSnippet();
  if (merged && (activeOverlap || merged.text)) {
    const cx = 1088;
    const cy = 706;
    const cardW = 470;
    const cardH = 238;
    const mergedAgo = formatTimeAgo(merged.time || Date.now()).toUpperCase();
    ctx.strokeStyle = 'rgba(240, 243, 255, 0.82)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(930, 560);
    ctx.lineTo(1000, 680);
    ctx.lineTo(cx, 680);
    ctx.stroke();

    ctx.fillStyle = 'rgba(14, 22, 48, 0.95)';
    ctx.fillRect(cx, cy, cardW, cardH);
    ctx.fillStyle = 'rgba(184, 197, 235, 0.74)';
    ctx.font = '22px Inter, sans-serif';
    ctx.fillText(`MERGED · ${mergedAgo}`, cx + 20, cy + 36);
    ctx.fillStyle = 'rgba(245, 248, 255, 0.95)';
    ctx.font = '36px "Cormorant Garamond", serif';
    const used = drawWrappedText(ctx, `"${merged.text}"`, cx + 20, cy + 82, cardW - 40, 44, 2);
    ctx.fillStyle = 'rgba(171, 188, 233, 0.74)';
    ctx.font = '26px Inter, sans-serif';
    ctx.fillText('merged from:', cx + 20, cy + 102 + used * 44);
    ctx.font = '29px "Cormorant Garamond", serif';
    drawWrappedText(ctx, `"${merged.srcA}" + "${merged.srcB}"`, cx + 20, cy + 138 + used * 44, cardW - 40, 32, 2);
  }
  downloadCardCanvas(canvas, 'imoria-collective-card');
}
