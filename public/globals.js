// Shared state, constants, and utility functions.
// This file must load FIRST — all other modules depend on these globals.

const GLYPH_GRAPH_NODES = 860;
const GLYPH_GRAPH_EDGES_PER_NODE = 2.2;
let glyphGraph = null;

let memories = [];
let memIdCounter = 0;
let seedVal = 42;

const APP_STATE = { VOID: 'void', LOGIN: 'login', SYMBOL: 'symbol', CREATE: 'create', PREVIEW: 'preview', INTERACT: 'interact', FINAL: 'final' };
const INTERACTION_MODE = { FLOAT: 'float', RAW: 'raw', RECALL: 'recall', COLLECTIVE: 'collective' };

let appState = APP_STATE.VOID;
let interactionMode = INTERACTION_MODE.FLOAT;

let currentUser = null;
let currentProfile = null;
let identityGlyphData = null;
let isAnonymous = false;
let pendingMemory = null;
let mode = 'idle';
let rawFocusIdx = 0;

let handpose = null;
let handVideo = null;
let handposeReady = false;
let gesturesEnabled = false;
let lastGesture = null;
let lastGestureTime = 0;
const GESTURE_DEBOUNCE = 800;
let gestureTutorialShown = false;

let rotX = 0, rotY = 0, curRotX = 0, curRotY = 0;
let isDragging = false, lastMX = 0, lastMY = 0, camZ = 0;
let clickedMem = null, labelAlpha = 0;

let activeOverlap = null;
let _fadeEl = null;

const MERGE_FRAMES = 45;
const COOL_FRAMES = 180;
const MAX_RENDER_DISTANCE = 1100;
const FADE_START_DISTANCE = 900;
const ENABLE_DISTANCE_CULL = true;
const GLYPH_SPARKLE_STRENGTH = 0.28;

const SPHERE_LISSAJOUS_SEGS = 36;

const GRAVITY_K = 0.028;
const DAMPING = 0.998;
const SPRING_K = 0.0065;

const MAX_GLYPH_UNITS = 10;
const CAM_ROT_LERP = 0.14;

let useModel = null;
let modelReady = false;
const simCache = {};

const FIXED_SPHERE_R = 120;
function getSphereR() { return FIXED_SPHERE_R; }

function simKey(a, b) { return `${Math.min(a, b)}-${Math.max(a, b)}`; }
function getSim(a, b) { return simCache[simKey(a, b)] || 0; }
function setSim(a, b, v) { simCache[simKey(a, b)] = v; }

function sphereDist(a, b) {
  return sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
}

function worldDist3(v) {
  return sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

function getDistanceAlpha(v) {
  if (!ENABLE_DISTANCE_CULL) return 1;
  const d = worldDist3(v);
  if (d >= MAX_RENDER_DISTANCE) return 0;
  if (d <= FADE_START_DISTANCE) return 1;
  return map(d, FADE_START_DISTANCE, MAX_RENDER_DISTANCE, 1, 0);
}

function isMyMemory(mem) {
  return currentUser && mem.ownerId && mem.ownerId === currentUser.id;
}

function getOwnedIndices() {
  const owned = [];
  memories.forEach((mem, i) => { if (isMyMemory(mem)) owned.push(i); });
  return owned;
}

function nextOwnedMemory(dir) {
  const owned = getOwnedIndices();
  if (owned.length === 0) return rawFocusIdx;
  const cur = owned.indexOf(rawFocusIdx);
  if (cur < 0) return owned[0];
  return owned[(cur + dir + owned.length) % owned.length];
}

function firstOwnedMemory() {
  const owned = getOwnedIndices();
  return owned.length > 0 ? owned[0] : -1;
}

function formatTimeAgo(ts) {
  const diff = Date.now() - ts;
  if (diff < 5000) return 'just now';
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return `${Math.floor(diff / 3600000)}h ago`;
}

function mulberry32(seed) {
  let s = seed;
  return function () {
    s |= 0; s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash32(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  h ^= h >>> 16;
  return h >>> 0;
}

function gauss01(rng) {
  const u = max(1e-9, rng());
  const v = max(1e-9, rng());
  return sqrt(-2 * log(u)) * cos(TWO_PI * v);
}

let _statusText = '';
let _statusFadeTimer = null;

function setStatus(msg) {
  const el = select('#status'); if (!el) return;
  const next = String(msg ?? '');
  if (next === _statusText) return;
  _statusText = next;
  if (_statusFadeTimer) {
    clearTimeout(_statusFadeTimer);
    _statusFadeTimer = null;
  }
  el.elt.textContent = next;
  el.elt.style.opacity = '0.8';
  _statusFadeTimer = setTimeout(() => {
    el.elt.style.opacity = '0.35';
    _statusFadeTimer = null;
  }, 5000);
}

function invalidateSpaceBackgroundCache() {}

/** Clear to transparent so #canvas-container CSS gradient shows through (WEBGL + alpha). */
function drawSpaceBackground() {
  clear();
}
