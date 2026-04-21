// ═══════════════════════════════════════════════════════
//  MEMORY GLYPHS  ·  vector embedding edition
//  Core p5.js entry: preload, setup, draw.
//  All helpers are loaded from separate files before this.
// ═══════════════════════════════════════════════════════

let glyphFont;
let _threeRetryAt = 0;

function syncAddMemorySubmitState() {
  const memInputEl = document.getElementById('memInput');
  const addBtn = document.getElementById('addMemorySubmitBtn');
  if (!memInputEl || !addBtn) return;
  addBtn.disabled = memInputEl.value.trim().length === 0;
}

function ensureThreeRendererReady() {
  if (!window.threeMemoryRenderer) return false;
  if (window.threeMemoryRenderer.isReady && window.threeMemoryRenderer.isReady()) return true;
  const now = millis ? millis() : Date.now();
  if (now < _threeRetryAt) return false;
  _threeRetryAt = now + 1200;
  try {
    const ok = window.threeMemoryRenderer.init(document.getElementById('canvas-container'));
    if (ok) console.log('[three-renderer] initialized after retry');
    return !!ok;
  } catch (e) {
    console.warn('[three-renderer] retry init failed:', e);
    return false;
  }
}

function preload() {
  glyphFont = loadFont('https://cdnjs.cloudflare.com/ajax/libs/topcoat/0.8.0/font/SourceCodePro-Regular.otf');
}

function setup() {
  if (typeof setAttributes === 'function') setAttributes({ alpha: true });
  const cv = createCanvas(windowWidth, windowHeight).parent('canvas-container');
  cv.style('position', 'absolute');
  cv.style('inset', '0');
  cv.style('z-index', '2');
  cv.style('background', 'transparent');
  cv.style('pointer-events', 'none');
  if (window.threeMemoryRenderer) {
    try {
      const ok = window.threeMemoryRenderer.init(document.getElementById('canvas-container'));
      if (!ok) {
        console.warn('[setup] Three renderer init returned false (will retry).');
        setStatus('visual renderer unavailable');
      }
    } catch (e) {
      console.warn('[setup] Three renderer failed; continuing app flow:', e);
      setStatus('visual renderer unavailable');
    }
  }
  if (glyphFont) textFont(glyphFont);
  initGlyphGraph();
  authBuffer = createGraphics(width, height);
  authBuffer.clear();
  loop();

  initSupabase();
  loadVoidMemories();
  checkLLM();

  setStatus('loading semantic model…');
  (async () => {
    try {
      if (window.tf && typeof window.tf.ready === 'function') await window.tf.ready();
      if (window.tf && typeof window.tf.setBackend === 'function') {
        try { await window.tf.setBackend('webgl'); }
        catch { await window.tf.setBackend('cpu'); }
      }
      const model = await use.load();
      useModel = model;
      modelReady = true;
      setStatus('model ready · add your first memory');
    } catch (err) {
      console.warn('USE load failed:', err);
      modelReady = false;
      setStatus('offline mode · add your first memory');
    }
  })();

  const reshuffleBtn = select('#reshuffleBtn');
  if (reshuffleBtn) reshuffleBtn.mousePressed(() => {
    seedVal = floor(random(99999));
    initGlyphGraph();
    const sents = memories.map(m => m.originalSentence);
    clearMemoryLabels();
    memories = []; activeOverlap = null; memIdCounter = 0;
    Object.keys(simCache).forEach(k => delete simCache[k]);
    updateMemoryList();
    sents.forEach(s => addMemory(s));
    appState = sents.length ? APP_STATE.INTERACT : APP_STATE.CREATE;
  });
  const saveBtn = select('#saveBtn');
  if (saveBtn) saveBtn.mousePressed(() => {
    if (typeof exportMemoryCardForCurrentMode === 'function') {
      exportMemoryCardForCurrentMode();
    } else {
      saveCanvas('memory-glyphs-' + Date.now(), 'png');
    }
  });
  const memInput = select('#memInput');
  if (memInput) {
    memInput.elt.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      if (e.isComposing) return;
      e.preventDefault();
      triggerAdd();
      syncAddMemorySubmitState();
    });
    memInput.elt.addEventListener('input', syncAddMemorySubmitState);
  }
  const addMemorySubmitBtn = document.getElementById('addMemorySubmitBtn');
  if (addMemorySubmitBtn) addMemorySubmitBtn.addEventListener('click', () => {
    if (createEntryNeedsOpenClick) {
      createEntryNeedsOpenClick = false;
      setTimeout(() => {
        const inp = document.getElementById('memInput');
        if (inp && inp.focus) inp.focus();
        syncAddMemorySubmitState();
      }, 20);
      return;
    }
    triggerAdd();
    syncAddMemorySubmitState();
  });
  const closeIntroBtn = document.getElementById('closeIntroBtn');
  const leaveIntroBtn = document.getElementById('leaveIntroBtn');
  if (closeIntroBtn) {
    closeIntroBtn.addEventListener('click', () => {
      introPopupDismissed = true;
      if (typeof updateFlowUI === 'function') updateFlowUI();
    });
  }
  if (leaveIntroBtn) leaveIntroBtn.addEventListener('click', () => { introPopupDismissed = true; });

  checkSession().then(loggedIn => {
    if (loggedIn && identityGlyphData) setStatus('welcome back');
  });

  let loginIsSignup = false;
  const loginBtn = document.getElementById('loginBtn');
  const signupBtn = document.getElementById('signupBtn');
  const authSubmitBtn = document.getElementById('authSubmitBtn');
  const authBackBtn = document.getElementById('authBackBtn');

  if (loginBtn) loginBtn.addEventListener('click', () => {
    loginIsSignup = false;
    signupFlowPendingStampInfo = false;
    createEntryNeedsOpenClick = false;
    createHideVoidButton = false;
    showLoginForm('login');
  });
  if (signupBtn) signupBtn.addEventListener('click', () => {
    loginIsSignup = true;
    signupFlowPendingStampInfo = false;
    createEntryNeedsOpenClick = false;
    createHideVoidButton = false;
    showLoginForm('sign up');
  });
  if (authBackBtn) authBackBtn.addEventListener('click', () => { appState = APP_STATE.VOID; });
  if (authSubmitBtn) authSubmitBtn.addEventListener('click', handleAuthSubmit);

  const authPassword = document.getElementById('authPassword');
  if (authPassword) authPassword.addEventListener('keydown', e => { if (e.key === 'Enter') handleAuthSubmit(); });

  function showLoginForm(title) {
    const titleEl = document.getElementById('loginTitle');
    if (titleEl) titleEl.textContent = title;
    const errEl = document.getElementById('authError');
    if (errEl) { errEl.textContent = ''; errEl.style.display = 'none'; }
    appState = APP_STATE.LOGIN;
  }

  async function handleAuthSubmit() {
    const username = (document.getElementById('authUsername').value || '').trim().toLowerCase();
    const pw = (document.getElementById('authPassword').value || '').trim();
    const errEl = document.getElementById('authError');
    if (!username || !pw) { if (errEl) { errEl.textContent = 'enter username and password'; errEl.style.display = ''; } return; }
    if (username.length < 2) { if (errEl) { errEl.textContent = 'username must be at least 2 characters'; errEl.style.display = ''; } return; }
    if (pw.length < 6) { if (errEl) { errEl.textContent = 'password must be at least 6 characters'; errEl.style.display = ''; } return; }
    if (errEl) { errEl.textContent = 'working…'; errEl.style.display = ''; }

    const email = username.replace(/[^a-z0-9_-]/g, '') + '@void.memory';
    let result;
    if (loginIsSignup) {
      voidTutorialPendingAfterGestures = true;
      result = await signUp(email, pw);
      if (!result.error) result = await signIn(email, pw);
    } else {
      voidTutorialPendingAfterGestures = false;
      result = await signIn(email, pw);
    }
    if (result.error) {
      const msg = result.error.includes('Invalid login') ? 'wrong username or password' : result.error;
      if (errEl) { errEl.textContent = msg; errEl.style.display = ''; }
      return;
    }
    document.getElementById('authUsername').value = '';
    document.getElementById('authPassword').value = '';
    if (errEl) errEl.style.display = 'none';
    if (loginIsSignup) {
      identityGlyphData = null;
      signupFlowPendingStampInfo = true;
      transitionTo(APP_STATE.SYMBOL);
      setTimeout(initSymbolDrawing, 600);
    } else if (!identityGlyphData) {
      transitionTo(APP_STATE.SYMBOL);
      setTimeout(initSymbolDrawing, 600);
    } else {
      if (currentUser) gestureTutorialPending = true;
      transitionTo(APP_STATE.INTERACT);
      mode = 'display';
      curRotX = rotX; curRotY = rotY;
      loadSharedIntoInteract();
      setStatus('welcome back');
    }
  }

  const symbolDoneBtn = document.getElementById('symbolDoneBtn');
  if (symbolDoneBtn) symbolDoneBtn.addEventListener('click', () => {
    identityGlyphData = null;
    const overlay = document.getElementById('symbolOverlay');
    if (overlay) overlay.style.display = 'none';
    if (signupFlowPendingStampInfo) createHideVoidButton = true;
    appState = APP_STATE.CREATE;
    setStatus('anonymous identity active');
  });
  const symbolClearBtn = document.getElementById('symbolClearBtn');
  if (symbolClearBtn) symbolClearBtn.addEventListener('click', validateAndSaveSymbol);
  const stampBtn = document.getElementById('stampBtn');
  if (stampBtn) stampBtn.addEventListener('click', () => { isAnonymous = false; doStampPreview(); });
  const anonStampBtn = document.getElementById('anonStampBtn');
  if (anonStampBtn) anonStampBtn.addEventListener('click', () => { isAnonymous = true; doStampPreview(); });
  const cancelPreviewBtn = document.getElementById('cancelPreviewBtn');
  if (cancelPreviewBtn) cancelPreviewBtn.addEventListener('click', () => {
    if (pendingMemory) { const inp = document.getElementById('memInput'); if (inp) inp.value = pendingMemory; }
    pendingMemory = null; previewMemCache = null; previewMemCacheSentence = '';
    appState = APP_STATE.CREATE;
  });
  const skipToVoidBtn = document.getElementById('skipToVoidBtn');
  if (skipToVoidBtn) skipToVoidBtn.addEventListener('click', () => {
    if (currentUser) gestureTutorialPending = true;
    appState = APP_STATE.INTERACT; mode = 'display';
    curRotX = rotX; curRotY = rotY;
    loadSharedIntoInteract();
  });
  const stampInfoNextBtn = document.getElementById('stampInfoNextBtn');
  if (stampInfoNextBtn) stampInfoNextBtn.addEventListener('click', () => {
    signupFlowPendingStampInfo = false;
    createEntryNeedsOpenClick = false;
    createHideVoidButton = true;
    appState = APP_STATE.CREATE;
    setStatus('add your first memory');
    setTimeout(() => {
      const inp = document.getElementById('memInput');
      if (inp && inp.focus) inp.focus();
      syncAddMemorySubmitState();
    }, 20);
  });

  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const m = btn.dataset.mode;
      switchMode(m);
      document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
  const focusPrev = document.getElementById('focusPrev');
  const focusNext = document.getElementById('focusNext');
  if (focusPrev) focusPrev.addEventListener('click', () => {
    rawFocusIdx = nextOwnedMemory(-1);
    if (interactionMode === INTERACTION_MODE.RECALL && memories[rawFocusIdx]) {
      memories[rawFocusIdx]._recallApplied = false;
      memories[rawFocusIdx]._recallLoading = false;
    }
    populateTimeline();
    if (typeof updateRawMemoryHud === 'function') updateRawMemoryHud();
  });
  if (focusNext) focusNext.addEventListener('click', () => {
    rawFocusIdx = nextOwnedMemory(1);
    if (interactionMode === INTERACTION_MODE.RECALL && memories[rawFocusIdx]) {
      memories[rawFocusIdx]._recallApplied = false;
      memories[rawFocusIdx]._recallLoading = false;
    }
    populateTimeline();
    if (typeof updateRawMemoryHud === 'function') updateRawMemoryHud();
  });
  const stampFinalBtn = document.getElementById('stampFinalBtn');
  if (stampFinalBtn) stampFinalBtn.addEventListener('click', doStampFinal);
  const releaseFinalBtn = document.getElementById('releaseFinalBtn');
  if (releaseFinalBtn) releaseFinalBtn.addEventListener('click', () => { appState = APP_STATE.INTERACT; });
  const toFinalBtn = document.getElementById('toFinalBtn');
  if (toFinalBtn) toFinalBtn.addEventListener('click', () => { appState = APP_STATE.FINAL; });
  const infoBtn = document.getElementById('infoBtn');
  const enterMemoryQuickBtn = document.getElementById('enterMemoryQuickBtn');
  const infoOverlay = document.getElementById('infoOverlay');
  const playVoidTutorialBtn = document.getElementById('playVoidTutorialBtn');
  const closeInfoBtn = document.getElementById('closeInfoBtn');
  if (infoBtn && infoOverlay) infoBtn.addEventListener('click', () => { infoOverlay.style.display = 'flex'; });
  if (playVoidTutorialBtn && infoOverlay) playVoidTutorialBtn.addEventListener('click', () => {
    infoOverlay.style.display = 'none';
    if (typeof startVoidTutorial === 'function') startVoidTutorial(true);
  });
  if (closeInfoBtn && infoOverlay) closeInfoBtn.addEventListener('click', () => { infoOverlay.style.display = 'none'; });
  if (enterMemoryQuickBtn) enterMemoryQuickBtn.addEventListener('click', () => {
    createEntryNeedsOpenClick = false;
    createHideVoidButton = false;
    appState = APP_STATE.CREATE;
    setTimeout(() => {
      const inp = document.getElementById('memInput');
      if (inp && inp.focus) inp.focus();
      syncAddMemorySubmitState();
    }, 20);
  });

  const enableGesturesBtn = document.getElementById('enableGesturesBtn');
  const gestureTutorialNextBtn = document.getElementById('gestureTutorialNextBtn');
  const voidTutorialNextBtn = document.getElementById('voidTutorialNextBtn');
  const voidTutorialCloseBtn = document.getElementById('voidTutorialCloseBtn');
  if (gestureTutorialNextBtn) {
    gestureTutorialNextBtn.addEventListener('click', () => {
      if (typeof setGestureTutorialStep === 'function') setGestureTutorialStep(2);
    });
  }
  if (enableGesturesBtn) enableGesturesBtn.addEventListener('click', () => { hideGestureTutorial(); initHandpose(); });
  const skipGesturesBtn = document.getElementById('skipGesturesBtn');
  if (skipGesturesBtn) skipGesturesBtn.addEventListener('click', hideGestureTutorial);
  if (voidTutorialNextBtn) voidTutorialNextBtn.addEventListener('click', () => {
    voidTutorialStep += 1;
    if (typeof renderVoidTutorialStep === 'function') renderVoidTutorialStep();
  });
  if (voidTutorialCloseBtn) voidTutorialCloseBtn.addEventListener('click', () => {
    if (typeof closeVoidTutorial === 'function') closeVoidTutorial(true);
  });
  const gesturesToggleBtn = document.getElementById('gesturesToggleBtn');
  if (gesturesToggleBtn) gesturesToggleBtn.addEventListener('click', () => {
    if (gesturesEnabled) {
      gesturesEnabled = false; showHandUI(false); setStatus('gestures off');
    } else {
      if (handposeReady) {
        gesturesEnabled = true;
        showHandUI(true);
        setStatus('gestures on · pinch+move=orbit · two-hand pinch=zoom · 3 fingers=recall · open→rock=collective · closed palm=raw');
      }
      else initHandpose();
    }
  });
  syncAddMemorySubmitState();
}

function draw() {
  clear();
  ensureThreeRendererReady();
  if (interactionMode === INTERACTION_MODE.COLLECTIVE) {
    const didReshuffle = reshuffleCollectiveSelection(false);
    if (didReshuffle) setStatus('collective · new memory slice surfaced');
  }
  if (appState === APP_STATE.VOID)    { drawVoid(); updateFlowUI(); return; }
  if (appState === APP_STATE.LOGIN)   { drawLogin(); updateFlowUI(); return; }
  if (appState === APP_STATE.SYMBOL)  { drawSymbol(); updateFlowUI(); return; }
  if (appState === APP_STATE.CREATE)  { drawCreateOrIdle(); updateFlowUI(); return; }
  if (appState === APP_STATE.PREVIEW) { drawPreview(); updateFlowUI(); return; }
  if (appState === APP_STATE.FINAL)   { drawFinal(); updateFlowUI(); return; }

  if (mode === 'idle') {
    if (window.threeMemoryRenderer) window.threeMemoryRenderer.clear();
    push();
    translate(width / 2, height / 2);
    stroke(100, 140, 255, 45); strokeWeight(0.5);
    line(-80, 0, 80, 0); line(0, -80, 0, 80); noStroke();
    pop();
    updateFlowUI(); return;
  }

  if (mode === 'display') {
    const t = frameCount * 0.008;
    const R = getSphereR();

    if (clickedMem !== null) {
      labelAlpha = max(0, labelAlpha - 0.7);
      if (labelAlpha <= 0) {
        clickedMem = null; hideLabelEl();
        memories.forEach(m => { if (m.labelEl) m.labelEl.style.opacity = '0'; });
      } else {
        updateLabelEl();
        if (memories[clickedMem] && memories[clickedMem].labelEl)
          memories[clickedMem].labelEl.style.opacity = (labelAlpha / 255 * 0.85).toFixed(3);
      }
    }

    if (interactionMode === INTERACTION_MODE.RAW && rawFocusIdx >= 0 && rawFocusIdx < memories.length && isMyMemory(memories[rawFocusIdx])) {
      hideAllMemoryLabels();
      if (!isDragging) rotY += 0.0032;
      curRotX = lerp(curRotX, rotX, CAM_ROT_LERP); curRotY = lerp(curRotY, rotY, CAM_ROT_LERP);
      const mem = memories[rawFocusIdx];
      if (!mem._rawSnapshot) {
        const savedSentence = mem.sentence, savedNodes = mem.nodes, savedGlyphs = mem.glyphs;
        mem.sentence = getEnteredMemorySentence(mem); rebuildNodes(rawFocusIdx);
        mem._rawSnapshot = { nodes: mem.nodes, glyphs: mem.glyphs };
        mem.sentence = savedSentence; mem.nodes = savedNodes; mem.glyphs = savedGlyphs;
      }
      const rawMem = { ...mem, nodes: mem._rawSnapshot.nodes, glyphs: mem._rawSnapshot.glyphs, liveCenter: { x: 0, y: 0, z: 0 } };
      if (window.threeMemoryRenderer) {
        window.threeMemoryRenderer.renderMemories({ memories: [rawMem], R, rotX: curRotX, rotY: curRotY, camZ, leftShift: 0 });
      }
    } else if (interactionMode === INTERACTION_MODE.RECALL && rawFocusIdx >= 0 && rawFocusIdx < memories.length && isMyMemory(memories[rawFocusIdx])) {
      hideAllMemoryLabels();
      if (!isDragging) rotY += 0.0032;
      curRotX = lerp(curRotX, rotX, CAM_ROT_LERP); curRotY = lerp(curRotY, rotY, CAM_ROT_LERP);
      const mem = memories[rawFocusIdx];
      if (!mem._recallApplied && !mem._recallLoading) {
        const sourceText = (mem.sentence || mem.originalSentence || '').trim();
        const chainFromPrior =
          typeof normalizeMemoryText === 'function' &&
          normalizeMemoryText(sourceText) !== normalizeMemoryText(mem.originalSentence);
        mem._recallLoading = true;
        applyRecallTransform(sourceText, { chainFromPrior }).then(result => {
          const txt = result || sourceText;
          mem._recallSentence = txt;
          mem.sentence = txt;
          mem._recallApplied = true;
          mem._recallLoading = false;
          if (mem.timeline) mem.timeline.push({ type: 'recall', text: txt, prev: sourceText, time: Date.now() });
          rebuildNodes(rawFocusIdx);
          populateTimeline();
          updateMemoryList();
        }).catch(() => {
          mem._recallLoading = false;
          mem._recallApplied = true;
          mem.sentence = sourceText;
          rebuildNodes(rawFocusIdx);
        });
      }
      const recallMem = { ...mem, liveCenter: { x: 0, y: 0, z: 0 } };
      if (window.threeMemoryRenderer) {
        window.threeMemoryRenderer.renderMemories({ memories: [recallMem], R, rotX: curRotX, rotY: curRotY, camZ, leftShift: 0 });
      }
      push();
      noStroke(); fill(200, 215, 255, 200);
      textAlign(CENTER, CENTER); textSize(12); textStyle(ITALIC);
      text(mem._recallLoading ? 'recalling…' : 'recall mode', width / 2, height - 60);
      textSize(9); textStyle(NORMAL); fill(150, 170, 220, 100);
      const ownedC = getOwnedIndices(); const posC = ownedC.indexOf(rawFocusIdx) + 1;
      text(`recall · ${posC} / ${ownedC.length}`, width / 2, height - 35);
      pop();
    } else {
      if (!isDragging) rotY += 0.0048;
      curRotX = lerp(curRotX, rotX, CAM_ROT_LERP); curRotY = lerp(curRotY, rotY, CAM_ROT_LERP);
      applyGravity(R);
      const collectiveSet = interactionMode === INTERACTION_MODE.COLLECTIVE ? collectiveActiveIds : null;
      const drift = R * 0.18;
      memories.forEach((mem, mi) => {
        if (collectiveSet && !collectiveSet.has(mem.id)) return;
        const nx = noise(mi * 10 + t * 0.3, 0) - 0.5;
        const ny = noise(0, mi * 10 + t * 0.25) - 0.5;
        const nz = noise(mi * 10 + 100, t * 0.2 + 50) - 0.5;
        mem.liveCenter = { x: mem.pos.x + nx * drift * 2, y: mem.pos.y + ny * drift * 1.2, z: mem.pos.z + nz * drift * 1.4 };
      });
      memories.forEach(mem => {
        if (collectiveSet && !collectiveSet.has(mem.id)) return;
        if (!mem.isMerging) mem.vitality = max(0.08, mem.vitality - 0.000025);
        if (mem.cooldown > 0) mem.cooldown--;
      });
      tickOverlap(R, t);
      if (window.threeMemoryRenderer) {
        window.threeMemoryRenderer.renderMemories({
          memories, R, rotX: curRotX, rotY: curRotY, camZ, leftShift: -width * 0.6,
          activeOverlap, collectiveSet
        });
      }
      updateMemoryLabels2D();
    }
  }
  if (typeof updateCollectiveMergeCalloutPositions === 'function') {
    updateCollectiveMergeCalloutPositions();
  }
  updateFlowUI();
}
