// Hand gesture tutorial & detection (ml5.handPose)
// Depends on globals from sketch.js: handpose, handVideo, handposeReady, gesturesEnabled,
// lastGesture, lastGestureTime, GESTURE_DEBOUNCE, gestureTutorialShown, setStatus,
// interactionMode, INTERACTION_MODE, switchMode.

function showGestureTutorial() {
  if (gestureTutorialShown || !gestureTutorialPending) return;
  gestureTutorialShown = true;
  gestureTutorialPending = false;
  const el = document.getElementById('gestureTutorial');
  if (el) el.style.display = 'flex';
}

function hideGestureTutorial() {
  const el = document.getElementById('gestureTutorial');
  if (el) el.style.display = 'none';
}

let handsResults = [];
let p5Video = null;
let handposeInitializing = false;

function initHandpose() {
  console.log(`[DEBUG:GESTURE] initHandpose called (initializing=${handposeInitializing}, ready=${handposeReady})`);
  if (handposeInitializing || handposeReady) {
    if (handposeReady) { gesturesEnabled = true; showHandUI(true); }
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
    setStatus('gestures on · palm=collective · peace=recall · fist=raw');

    handpose.detectStart(p5Video, onHandResults);
  }

  function onHandResults(results) {
    handsResults = results || [];
    if (handsResults.length === 0) {
      if (dbg) dbg.textContent = 'detecting… no hand';
      return;
    }
    if (!gesturesEnabled) return;
    const hand = handsResults[0];
    const kp = hand.keypoints || hand.landmarks;
    const kpLen = kp ? kp.length : 0;
    if (!kp || kpLen < 21) {
      if (dbg) dbg.textContent = `hand · kp:${kpLen} · keys:${Object.keys(hand).join(',')}`;
      return;
    }
    const g = detectGestureFromKeypoints(kp);
    if (dbg) dbg.textContent = `gesture: ${g || '?'} · kp:${kpLen}`;
    if (g && Date.now() - lastGestureTime > GESTURE_DEBOUNCE) {
      console.log(`[DEBUG:GESTURE] Gesture recognized: "${g}" — applying mode switch (debounce ok)`);
      lastGestureTime = Date.now();
      lastGesture = g;
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

function detectGestureFromKeypoints(kp) {
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
  const indexUp  = extended(8, 6);
  const middleUp = extended(12, 10);
  const ringUp   = extended(16, 14);
  const pinkyUp  = extended(20, 18);
  const count = [indexUp, middleUp, ringUp, pinkyUp].filter(Boolean).length;
  if (count >= 3) return 'collective';
  if (count === 2 && indexUp && middleUp) return 'recall';
  if (count <= 1 && !indexUp && !middleUp) return 'raw';
  return null;
}

// applyGestureMode is defined in ui.js

