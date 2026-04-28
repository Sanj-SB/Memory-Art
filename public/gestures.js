// Hand gesture tutorial & detection (ml5.handPose)
// Depends on globals from sketch.js: handpose, handVideo, handposeReady, gesturesEnabled,
// lastGesture, lastGestureTime, GESTURE_DEBOUNCE, gestureTutorialShown, setStatus,
// interactionMode, INTERACTION_MODE, switchMode, appState, APP_STATE, mode, rotX, rotY, camZ.

const PINCH_DIST_TO_PALM_MAX = 0.38;
const HAND_ORBIT_SENS = 0.007;
const ROT_X_LIMIT = Math.PI * 0.42;
/** camZ delta per pixel of change in distance between the two pinch centers (video coords). */
const TWO_HAND_ZOOM_SENS = 5.2;
/** Ignore jitter smaller than this (px) between frames. */
const TWO_HAND_ZOOM_MIN_DELTA_PX = 1.2;
const CAM_Z_MIN = -400;
const CAM_Z_MAX = 800;
/** Max ms between an open-hand pose and a rock pose to enter collective */
const COLLECTIVE_OPEN_TO_ROCK_MS = 2200;

let pinchOrbPrev = null;
let twoHandPinchPrevDist = null;
let lastOpenHandAt = 0;
const VOID_TUTORIAL_STEPS = [
  {
    mode: 'collective',
    kicker: 'collective',
    title: 'collective mode',
    copy: 'see your memories merge with others in the void. each time a memory merges the text it merged with will also reflect'
  },
  {
    mode: 'recall',
    kicker: 'recall',
    title: 'recall mode',
    copy: 'track your individual memories get "recalled" with a timeline view. you can also trace the history of merges the memory has gone through.'
  },
  {
    mode: 'raw',
    kicker: 'raw',
    title: 'raw mode',
    copy: 'view your original memories intact as they were when you entered them.'
  },
  {
    mode: null,
    kicker: 'save',
    title: 'save',
    copy: 'save a postcard image of your memories in the mode of your choice. let your memory exist outside the void.'
  }
];
const VOID_TUTORIAL_TARGETS = {
  collective: '#modeSwitcher .mode-btn[data-mode="collective"]',
  recall: '#modeSwitcher .mode-btn[data-mode="recall"]',
  raw: '#modeSwitcher .mode-btn[data-mode="raw"]',
  save: '#saveBtn'
};
let voidTutorialHighlightEl = null;

function getVoidTutorialSeenKey() {
  if (!currentUser || !currentUser.id) return null;
  return `imoria:voidTutorialSeen:${currentUser.id}`;
}

function hasSeenVoidTutorial() {
  const k = getVoidTutorialSeenKey();
  if (!k) return false;
  try { return localStorage.getItem(k) === '1'; } catch { return false; }
}

function markVoidTutorialSeen() {
  const k = getVoidTutorialSeenKey();
  if (!k) return;
  try { localStorage.setItem(k, '1'); } catch {}
}

function clearVoidTutorialHighlight() {
  if (!voidTutorialHighlightEl) return;
  voidTutorialHighlightEl.classList.remove('tutorial-highlight-target');
  voidTutorialHighlightEl = null;
}

function setVoidTutorialHighlight(step) {
  clearVoidTutorialHighlight();
  const key = step && step.kicker ? step.kicker : '';
  const selector = VOID_TUTORIAL_TARGETS[key];
  if (!selector) return;
  const el = document.querySelector(selector);
  if (!el) return;
  el.classList.add('tutorial-highlight-target');
  voidTutorialHighlightEl = el;
}

function renderVoidTutorialStep() {
  const step = VOID_TUTORIAL_STEPS[voidTutorialStep];
  if (!step) return;
  const overlay = document.getElementById('voidTutorialOverlay');
  const kickerEl = document.getElementById('voidTutorialKicker');
  const titleEl = document.getElementById('voidTutorialTitle');
  const copyEl = document.getElementById('voidTutorialCopy');
  const nextBtn = document.getElementById('voidTutorialNextBtn');
  const closeBtn = document.getElementById('voidTutorialCloseBtn');
  if (kickerEl) kickerEl.textContent = step.kicker;
  if (titleEl) titleEl.textContent = step.title;
  if (copyEl) copyEl.textContent = step.copy;
  const isLast = voidTutorialStep === VOID_TUTORIAL_STEPS.length - 1;
  if (nextBtn) nextBtn.style.display = isLast ? 'none' : '';
  if (closeBtn) closeBtn.style.display = isLast ? '' : 'none';
  if (overlay) overlay.classList.toggle('void-tutorial-overlay--save', step.kicker === 'save');
  if (step.mode) switchMode(step.mode);
  setVoidTutorialHighlight(step);
}

function closeVoidTutorial(markSeen = true) {
  const el = document.getElementById('voidTutorialOverlay');
  if (el) el.style.display = 'none';
  if (el) el.classList.remove('void-tutorial-overlay--save');
  clearVoidTutorialHighlight();
  voidTutorialActive = false;
  if (markSeen) markVoidTutorialSeen();
}

function startVoidTutorial(forceReplay = false) {
  if (appState !== APP_STATE.INTERACT) return;
  if (!forceReplay && hasSeenVoidTutorial()) return;
  voidTutorialStep = 0;
  voidTutorialActive = true;
  const el = document.getElementById('voidTutorialOverlay');
  if (el) el.style.display = 'flex';
  renderVoidTutorialStep();
}

function maybeStartVoidTutorialAfterGestureChoice() {
  if (!voidTutorialPendingAfterGestures) return;
  voidTutorialPendingAfterGestures = false;
  startVoidTutorial(false);
}

function setGestureTutorialStep(step) {
  const step1 = document.getElementById('gestureTutorialStep1');
  const step2 = document.getElementById('gestureTutorialStep2');
  if (!step1 || !step2) return;
  step1.classList.toggle('is-active', step !== 2);
  step2.classList.toggle('is-active', step === 2);
}

function showGestureTutorial() {
  if (gestureTutorialShown || !gestureTutorialPending) return;
  gestureTutorialShown = true;
  gestureTutorialPending = false;
  setGestureTutorialStep(1);
  const el = document.getElementById('gestureTutorial');
  if (el) el.style.display = 'flex';
}

function hideGestureTutorial() {
  const el = document.getElementById('gestureTutorial');
  if (el) el.style.display = 'none';
  setGestureTutorialStep(1);
  maybeStartVoidTutorialAfterGestureChoice();
}

let handsResults = [];
let p5Video = null;
let handposeInitializing = false;

function initHandpose() {
  console.log(`[DEBUG:GESTURE] initHandpose called (initializing=${handposeInitializing}, ready=${handposeReady})`);
  if (handposeInitializing || handposeReady) {
    if (handposeReady) {
      gesturesEnabled = true;
      showHandUI(true);
      setStatus('gestures on · pinch+move=orbit · two-hand pinch=zoom · 3 fingers=recall · open→rock=collective · closed palm=raw');
    }
    return;
  }
  handposeInitializing = true;
  if (typeof ml5 === 'undefined') { console.warn('[DEBUG:GESTURE] ml5 not loaded'); setStatus('ml5 not loaded'); handposeInitializing = false; return; }
  const dbg = document.getElementById('gestureDebug');
  if (dbg) { dbg.style.display = 'block'; dbg.textContent = 'starting camera…'; }

  p5Video = createCapture(VIDEO, { flipped: true });
  p5Video.size(320, 240);
  p5Video.hide();

  const rawVid = p5Video.elt;
  rawVid.id = 'handVideoP5';
  rawVid.style.cssText = 'position:fixed; bottom:90px; left:24px; width:120px; height:90px; object-fit:cover; border-radius:4px; border:1px solid rgba(150,165,210,0.2); z-index:14; transform:scaleX(-1);';
  document.body.appendChild(rawVid);

  const oldVid = document.getElementById('handVideo');
  if (oldVid) oldVid.style.display = 'none';

  if (dbg) dbg.textContent = 'loading handPose model…';

  const hpFn = ml5.handPose || ml5.handpose;
  if (!hpFn) { if (dbg) dbg.textContent = 'no handPose in ml5'; handposeInitializing = false; return; }

  // ml5 v1: handPose(callback) — no video, no options in constructor
  handpose = hpFn(onModelReady);

  function onModelReady() {
    handposeReady = true;
    gesturesEnabled = true;
    handposeInitializing = false;
    console.log('[DEBUG:GESTURE] HandPose model ready — starting detection');
    if (dbg) dbg.textContent = 'model ready · detecting…';
    showHandUI(true);
    setStatus('gestures on · pinch+move=orbit · two-hand pinch=zoom · 3 fingers=recall · open→rock=collective · closed palm=raw');

    handpose.detectStart(p5Video, onHandResults);
  }

  function onHandResults(results) {
    handsResults = results || [];
    if (handsResults.length === 0) {
      pinchOrbPrev = null;
      twoHandPinchPrevDist = null;
      if (dbg) dbg.textContent = 'detecting… no hand';
      return;
    }
    if (!gesturesEnabled) return;
    const hand = handsResults[0];
    const kp = hand.keypoints || hand.landmarks;
    const kpLen = kp ? kp.length : 0;
    if (!kp || kpLen < 21) {
      twoHandPinchPrevDist = null;
      if (dbg) dbg.textContent = `hand · kp:${kpLen} · keys:${Object.keys(hand).join(',')}`;
      return;
    }

    const now = Date.now();
    const canInteract = typeof appState !== 'undefined' && appState === APP_STATE.INTERACT && mode === 'display';
    const kp1 = handsResults.length >= 2 ? (handsResults[1].keypoints || handsResults[1].landmarks) : null;
    const kp1Len = kp1 ? kp1.length : 0;
    const st0 = getThumbIndexPinchState(kp);
    const st1 = kp1Len >= 21 ? getThumbIndexPinchState(kp1) : null;
    const dualPinch = !!(canInteract && st0 && st1);

    let zoomLabel = null;
    if (dualPinch) {
      pinchOrbPrev = null;
      zoomLabel = tryApplyTwoHandPinchZoom(st0, st1);
    } else {
      twoHandPinchPrevDist = null;
    }

    if (!dualPinch) {
      const pinchActive = tryApplyPinchOrbit(kp);
      if (pinchActive) {
        if (dbg) dbg.textContent = 'pinch · move to orbit';
        return;
      }
    }

    const g = detectGestureFromKeypoints(kp, now);
    if (dbg) {
      const zPart = zoomLabel ? ` · ${zoomLabel}` : (dualPinch ? ' · two-hand pinch (move apart/closer)' : '');
      const handsNote = handsResults.length > 1 ? ` · hands:${handsResults.length}` : '';
      dbg.textContent = `gesture: ${g || '?'} · kp:${kpLen}${handsNote}${zPart}`;
    }
    if (g && now - lastGestureTime > GESTURE_DEBOUNCE) {
      console.log(`[DEBUG:GESTURE] Gesture recognized: "${g}" — applying mode switch (debounce ok)`);
      lastGestureTime = now;
      lastGesture = g;
      if (g === 'collective') lastOpenHandAt = 0;
      applyGestureMode(g);
    }
  }
}

function showHandUI(on) {
  const pv = document.getElementById('handVideoP5');
  const dbg = document.getElementById('gestureDebug');
  const btn = document.getElementById('gesturesToggleBtn');
  if (pv) pv.style.display = on ? 'block' : 'none';
  if (dbg) dbg.style.display = on ? 'block' : 'none';
  if (btn) { if (on) btn.classList.add('active'); else btn.classList.remove('active'); }
}

function kpPoint(kp, i) {
  const p = kp[i];
  if (!p) return { x: 0, y: 0 };
  if (typeof p.x === 'number') return { x: p.x, y: p.y };
  if (Array.isArray(p)) return { x: p[0] || 0, y: p[1] || 0 };
  return { x: 0, y: 0 };
}

/** Thumb+index pinch: midpoint and palm scale, or null if hand invalid / not pinched. */
function getThumbIndexPinchState(kp) {
  if (!kp || kp.length < 21) return null;
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const wrist = kpPoint(kp, 0);
  const palmLen = d(wrist, kpPoint(kp, 9));
  if (palmLen < 1) return null;
  const thumbTip = kpPoint(kp, 4);
  const indexTip = kpPoint(kp, 8);
  const pinchDist = d(thumbTip, indexTip);
  if (pinchDist >= palmLen * PINCH_DIST_TO_PALM_MAX) return null;
  return {
    cx: (thumbTip.x + indexTip.x) * 0.5,
    cy: (thumbTip.y + indexTip.y) * 0.5,
    palmLen
  };
}

function tryApplyPinchOrbit(kp) {
  const st = getThumbIndexPinchState(kp);
  const canOrbit = typeof appState !== 'undefined' && appState === APP_STATE.INTERACT && mode === 'display';
  if (!st || !canOrbit) {
    pinchOrbPrev = null;
    return false;
  }
  const { cx, cy } = st;
  if (pinchOrbPrev) {
    const dx = cx - pinchOrbPrev.x;
    const dy = cy - pinchOrbPrev.y;
    rotY += dx * HAND_ORBIT_SENS;
    rotX -= dy * HAND_ORBIT_SENS;
    rotX = Math.max(-ROT_X_LIMIT, Math.min(ROT_X_LIMIT, rotX));
    if (window.imoriaAudioReactivity) window.imoriaAudioReactivity.noteInteraction(0.28);
  }
  pinchOrbPrev = { x: cx, y: cy };
  return true;
}

/**
 * Both hands thumb+index pinched: move pinch points apart → zoom in, together → zoom out.
 * Stronger response when spreading (zoom in) than the old single-hand spread.
 */
function tryApplyTwoHandPinchZoom(stA, stB) {
  const sep = Math.hypot(stB.cx - stA.cx, stB.cy - stA.cy);
  let label = null;
  if (twoHandPinchPrevDist != null) {
    const dSep = sep - twoHandPinchPrevDist;
    if (Math.abs(dSep) > TWO_HAND_ZOOM_MIN_DELTA_PX) {
      let deltaCam = -dSep * TWO_HAND_ZOOM_SENS;
      if (dSep > 0) deltaCam *= 1.35;
      camZ = Math.max(CAM_Z_MIN, Math.min(CAM_Z_MAX, camZ + deltaCam));
      if (window.imoriaAudioReactivity) {
        const strength = Math.min(0.55, 0.12 + Math.abs(dSep) * 0.01);
        window.imoriaAudioReactivity.noteInteraction(strength);
      }
      label = dSep > 0 ? 'two-hand · zoom in' : 'two-hand · zoom out';
    }
  }
  twoHandPinchPrevDist = sep;
  return label;
}

function detectGestureFromKeypoints(kp, now) {
  if (!kp || kp.length < 21) return null;
  const pt = i => {
    const p = kp[i];
    if (!p) return { x: 0, y: 0 };
    if (typeof p.x === 'number') return { x: p.x, y: p.y };
    if (Array.isArray(p)) return { x: p[0] || 0, y: p[1] || 0 };
    return { x: 0, y: 0 };
  };
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const wrist = pt(0);
  const palmLen = d(wrist, pt(9));
  if (palmLen < 1) return null;
  const extended = (tipIdx, pipIdx) => {
    const tip = pt(tipIdx), pip = pt(pipIdx);
    return d(tip, wrist) > d(pip, wrist) * 1.05;
  };
  const indexUp = extended(8, 6);
  const middleUp = extended(12, 10);
  const ringUp = extended(16, 14);
  const pinkyUp = extended(20, 18);

  const openHand = indexUp && middleUp && ringUp && pinkyUp;
  if (openHand) lastOpenHandAt = now;

  const closedPalm = !indexUp && !middleUp && !ringUp && !pinkyUp;
  if (closedPalm) return 'raw';

  const recallPose = indexUp && middleUp && pinkyUp && !ringUp;
  if (recallPose) return 'recall';

  const rock =
    indexUp && pinkyUp && !middleUp && !ringUp;
  if (rock && lastOpenHandAt > 0 && now - lastOpenHandAt <= COLLECTIVE_OPEN_TO_ROCK_MS) return 'collective';

  return null;
}

// applyGestureMode is defined in ui.js

