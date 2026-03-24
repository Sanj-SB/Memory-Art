// ═══════════════════════════════════════════════════════
//  MEMORY GLYPHS  ·  vector embedding edition
//  Core p5.js entry: preload, setup, draw.
//  All helpers are loaded from separate files before this.
// ═══════════════════════════════════════════════════════

let glyphFont;

function preload() {
  glyphFont = loadFont('https://cdnjs.cloudflare.com/ajax/libs/topcoat/0.8.0/font/SourceCodePro-Regular.otf');
}

function setup() {
  if (typeof setAttributes === 'function') setAttributes({ alpha: true });
  createCanvas(windowWidth, windowHeight, WEBGL).parent('canvas-container');
  ambientLight(85, 92, 125);
  if (glyphFont) textFont(glyphFont);
  brush.load();
  initGlyphGraph();
  authBuffer = createGraphics(width, height);
  authBuffer.clear();
  loop();

  initSupabase();
  loadVoidMemories();
  checkLLM();

  setStatus('loading semantic model…');
  use.load().then(model => {
    useModel = model;
    modelReady = true;
    setStatus('model ready · add your first memory');
  }).catch(err => {
    console.warn('USE load failed:', err);
    modelReady = false;
    setStatus('offline mode · add your first memory');
  });

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
  if (saveBtn) saveBtn.mousePressed(() => saveCanvas('memory-glyphs-' + Date.now(), 'png'));
  const memInput = select('#memInput');
  if (memInput) memInput.elt.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    if (e.isComposing) return;
    e.preventDefault();
    triggerAdd();
  });
  const closeIntroBtn = document.getElementById('closeIntroBtn');
  const leaveIntroBtn = document.getElementById('leaveIntroBtn');
  if (closeIntroBtn) closeIntroBtn.addEventListener('click', () => { introPopupDismissed = true; });
  if (leaveIntroBtn) leaveIntroBtn.addEventListener('click', () => { introPopupDismissed = true; });

  checkSession().then(loggedIn => {
    if (loggedIn && identityGlyphData) setStatus('welcome back');
  });

  let loginIsSignup = false;
  const loginBtn = document.getElementById('loginBtn');
  const signupBtn = document.getElementById('signupBtn');
  const authSubmitBtn = document.getElementById('authSubmitBtn');
  const authBackBtn = document.getElementById('authBackBtn');

  if (loginBtn) loginBtn.addEventListener('click', () => { loginIsSignup = false; showLoginForm('login'); });
  if (signupBtn) signupBtn.addEventListener('click', () => { loginIsSignup = true; showLoginForm('sign up'); });
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
      result = await signUp(email, pw);
      if (!result.error) result = await signIn(email, pw);
    } else {
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
    if (!identityGlyphData) {
      transitionTo(APP_STATE.SYMBOL);
      setTimeout(initSymbolDrawing, 600);
    } else {
      transitionTo(APP_STATE.CREATE);
      setStatus('add your first memory');
    }
  }

  const symbolDoneBtn = document.getElementById('symbolDoneBtn');
  if (symbolDoneBtn) symbolDoneBtn.addEventListener('click', () => {
    identityGlyphData = null;
    const overlay = document.getElementById('symbolOverlay');
    if (overlay) overlay.style.display = 'none';
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
  });
  if (focusNext) focusNext.addEventListener('click', () => {
    rawFocusIdx = nextOwnedMemory(1);
    if (interactionMode === INTERACTION_MODE.RECALL && memories[rawFocusIdx]) {
      memories[rawFocusIdx]._recallApplied = false;
      memories[rawFocusIdx]._recallLoading = false;
    }
    populateTimeline();
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
  const closeInfoBtn = document.getElementById('closeInfoBtn');
  if (infoBtn && infoOverlay) infoBtn.addEventListener('click', () => { infoOverlay.style.display = 'flex'; });
  if (closeInfoBtn && infoOverlay) closeInfoBtn.addEventListener('click', () => { infoOverlay.style.display = 'none'; });
  if (enterMemoryQuickBtn) enterMemoryQuickBtn.addEventListener('click', () => {
    appState = APP_STATE.CREATE;
    setTimeout(() => {
      const inp = document.getElementById('memInput');
      if (inp && inp.focus) inp.focus();
    }, 20);
  });

  const enableGesturesBtn = document.getElementById('enableGesturesBtn');
  if (enableGesturesBtn) enableGesturesBtn.addEventListener('click', () => { hideGestureTutorial(); initHandpose(); });
  const skipGesturesBtn = document.getElementById('skipGesturesBtn');
  if (skipGesturesBtn) skipGesturesBtn.addEventListener('click', hideGestureTutorial);
  const gesturesToggleBtn = document.getElementById('gesturesToggleBtn');
  if (gesturesToggleBtn) gesturesToggleBtn.addEventListener('click', () => {
    if (gesturesEnabled) {
      gesturesEnabled = false; showHandUI(false); setStatus('gestures off');
    } else {
      if (handposeReady) { gesturesEnabled = true; showHandUI(true); setStatus('gestures on'); }
      else initHandpose();
    }
  });
}

function draw() {
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

  // INTERACT
  if (mode === 'idle') {
    drawSpaceBackground();
    push();
    camera();
    ortho(-width / 2, width / 2, height / 2, -height / 2, -10, 10);
    stroke(100, 140, 255, 45); strokeWeight(0.5);
    line(-80, 0, 80, 0); line(0, -80, 0, 80); noStroke();
    pop();
    updateFlowUI(); return;
  }

  if (mode === 'display') {
    drawSpaceBackground();
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

    // RAW MODE
    if (interactionMode === INTERACTION_MODE.RAW && rawFocusIdx >= 0 && rawFocusIdx < memories.length && isMyMemory(memories[rawFocusIdx])) {
      hideAllMemoryLabels();
      camera(0, 0, (height / 2 / tan(PI / 6)) + camZ, 0, 0, 0, 0, 1, 0);
      if (!isDragging) rotY += 0.0032;
      curRotX = lerp(curRotX, rotX, CAM_ROT_LERP); curRotY = lerp(curRotY, rotY, CAM_ROT_LERP);
      const mem = memories[rawFocusIdx];
      if (!mem._rawSnapshot) {
        const savedSentence = mem.sentence, savedNodes = mem.nodes, savedGlyphs = mem.glyphs;
        mem.sentence = mem.originalSentence; rebuildNodes(rawFocusIdx);
        mem._rawSnapshot = { nodes: mem.nodes, glyphs: mem.glyphs };
        mem.sentence = savedSentence; mem.nodes = savedNodes; mem.glyphs = savedGlyphs;
      }
      push(); rotateX(curRotX); rotateY(curRotY);
      drawMemSphere(R, mem);
      drawStampSatellite(R, mem);
      const spin = t * 0.15;
      push(); rotateY(spin); rotateX(spin * 0.6);
      fill(255, 255, 255, 255 * mem.vitality);
      mem._rawSnapshot.nodes.forEach(nd => drawGlyph3D(nd, mem._rawSnapshot.glyphs, mem, mem.vitality));
      pop(); pop();
      push(); camera(); ortho(-width / 2, width / 2, height / 2, -height / 2, -10, 10);
      noStroke(); fill(200, 215, 255, 200);
      textAlign(CENTER, CENTER); textSize(14); textStyle(ITALIC);
      text(`"${mem.originalSentence}"`, 0, height / 2 - 60);
      textSize(9); textStyle(NORMAL); fill(150, 170, 220, 100);
      const ownedR = getOwnedIndices(); const posR = ownedR.indexOf(rawFocusIdx) + 1;
      text(`raw · ${posR} / ${ownedR.length}`, 0, height / 2 - 35); pop();
    }
    // RECALL MODE
    else if (interactionMode === INTERACTION_MODE.RECALL && rawFocusIdx >= 0 && rawFocusIdx < memories.length && isMyMemory(memories[rawFocusIdx])) {
      hideAllMemoryLabels();
      camera(0, 0, (height / 2 / tan(PI / 6)) + camZ, 0, 0, 0, 0, 1, 0);
      if (!isDragging) rotY += 0.0032;
      curRotX = lerp(curRotX, rotX, CAM_ROT_LERP); curRotY = lerp(curRotY, rotY, CAM_ROT_LERP);
      const mem = memories[rawFocusIdx];
      if (!mem._recallApplied && !mem._recallLoading) {
        const sourceText = (mem.sentence || mem.originalSentence || '').trim();
        const chainFromPrior =
          typeof normalizeMemoryText === 'function' &&
          normalizeMemoryText(sourceText) !== normalizeMemoryText(mem.originalSentence);
        console.log(`[DEBUG:RECALL] Initiating recall for #${rawFocusIdx} (from ${chainFromPrior ? 'current' : 'original'} text)`);
        mem._recallLoading = true;
        applyRecallTransform(sourceText, { chainFromPrior }).then(result => {
          const txt = result || sourceText;
          mem._recallSentence = txt;
          mem.sentence = txt;
          mem._recallApplied = true;
          mem._recallLoading = false;
          console.log(`[DEBUG:RECALL] Transform: "${sourceText}" → "${txt}"`);
          if (mem.timeline) {
            mem.timeline.push({ type: 'recall', text: txt, prev: sourceText, time: Date.now() });
          }
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
      push(); rotateX(curRotX); rotateY(curRotY);
      drawMemSphere(R, mem);
      drawStampSatellite(R, mem);
      const spin = t * 0.15;
      push(); rotateY(spin); rotateX(spin * 0.6);
      fill(255, 255, 255, 255 * mem.vitality);
      mem.nodes.forEach(nd => drawGlyph3D(nd, mem.glyphs, mem, mem.vitality));
      pop(); pop();
      push(); camera(); ortho(-width / 2, width / 2, height / 2, -height / 2, -10, 10);
      noStroke(); fill(200, 215, 255, 200);
      textAlign(CENTER, CENTER); textSize(12); textStyle(ITALIC);
      text(mem._recallLoading ? 'recalling…' : 'recall mode', 0, height / 2 - 60);
      textSize(9); textStyle(NORMAL); fill(150, 170, 220, 100);
      const ownedC = getOwnedIndices(); const posC = ownedC.indexOf(rawFocusIdx) + 1;
      text(`recall · ${posC} / ${ownedC.length}`, 0, height / 2 - 35); pop();
    }
    // FLOAT / COLLECTIVE
    else {
      if (!isDragging) rotY += 0.0048;
      curRotX = lerp(curRotX, rotX, CAM_ROT_LERP); curRotY = lerp(curRotY, rotY, CAM_ROT_LERP);
      camera(-width * 0.6, 0, (height / 2 / tan(PI / 6)) + camZ, 0, 0, 0, 0, 1, 0);
      applyGravity(R);
      const collectiveSet = interactionMode === INTERACTION_MODE.COLLECTIVE ? collectiveActiveIds : null;
      const drift = R * 0.18;
      memories.forEach((mem, mi) => {
        if (collectiveSet && !collectiveSet.has(mem.id)) return;
        const nx = noise(mi * 10 + t * 0.3, 0) - 0.5;
        const ny = noise(0, mi * 10 + t * 0.25) - 0.5;
        const nz = noise(mi * 10 + 100, t * 0.2 + 50) - 0.5;
        mem.liveCenter = {
          x: mem.pos.x + nx * drift * 2,
          y: mem.pos.y + ny * drift * 1.2,
          z: mem.pos.z + nz * drift * 1.4,
        };
      });
      memories.forEach(mem => {
        if (collectiveSet && !collectiveSet.has(mem.id)) return;
        if (!mem.isMerging) mem.vitality = max(0.08, mem.vitality - 0.000025);
        if (mem.cooldown > 0) mem.cooldown--;
      });
      tickOverlap(R, t);
      push(); rotateX(curRotX); rotateY(curRotY);
      if (activeOverlap) drawOverlapEffect(R);
      memories.forEach((mem, mi) => {
        if (collectiveSet && !collectiveSet.has(mem.id)) return;
        push();
        translate(mem.liveCenter.x, mem.liveCenter.y, mem.liveCenter.z);
        const distAlpha = getDistanceAlpha(mem.liveCenter);
        if (distAlpha <= 0) { pop(); return; }
        const spin = t * (0.13 + mi * 0.025);
        drawMemSphere(R, mem);
        drawStampSatellite(R, mem, distAlpha);
        push(); rotateY(spin); rotateX(spin * 0.6);
        fill(255, 255, 255, 255 * mem.vitality * distAlpha);
        mem.nodes.forEach(nd => drawGlyph3D(nd, mem.glyphs, mem, mem.vitality * distAlpha));
        pop(); pop();
      });
      pop();

      // Merge progress HUD
      if (activeOverlap && interactionMode === INTERACTION_MODE.COLLECTIVE) {
        const prog = min(activeOverlap.frames / MERGE_FRAMES, 1.0);
        push(); camera(); ortho(-width / 2, width / 2, height / 2, -height / 2, -10, 10);
        noStroke(); fill(200, 180, 255, 140 * prog);
        textAlign(CENTER, CENTER); textSize(11); textStyle(NORMAL);
        const A = memories[activeOverlap.miA], B = memories[activeOverlap.miB];
        if (A && B) {
          const label = activeOverlap.hasMerged ? 'merged' : `merging… ${(prog * 100).toFixed(0)}%`;
          text(label, 0, -height / 2 + 50);
          textSize(9); fill(180, 170, 230, 100);
          text(`"${A.sentence}" + "${B.sentence}"`, 0, -height / 2 + 70);
        }
        pop();
      }

      updateMemoryLabels2D();
    }
  }
  updateFlowUI();
}
