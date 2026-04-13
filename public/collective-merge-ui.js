// Collective mode: anchored merge callout when a merge touches the logged-in user's memories.

(function () {
  const AUTO_DISMISS_MS = 16000;
  let calloutIdSeq = 0;
  const active = [];

  function formatMergedHead(ts) {
    const diff = Date.now() - ts;
    if (diff < 2000) return 'MERGED · JUST NOW';
    if (diff < 60000) return `MERGED · ${Math.floor(diff / 1000)}S AGO`;
    if (diff < 3600000) return `MERGED · ${Math.floor(diff / 60000)}M AGO`;
    return `MERGED · ${Math.floor(diff / 3600000)}H AGO`;
  }

  function ensureLayer() {
    let layer = document.getElementById('collectiveMergeLayer');
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'collectiveMergeLayer';
      layer.className = 'collective-merge-layer';
      layer.setAttribute('aria-live', 'polite');
      document.body.appendChild(layer);
    }
    return layer;
  }

  function removeCallout(id) {
    const i = active.findIndex((c) => c.id === id);
    if (i < 0) return;
    const c = active[i];
    if (c.el && c.el.parentNode) c.el.parentNode.removeChild(c.el);
    if (c._timer) clearTimeout(c._timer);
    active.splice(i, 1);
  }

  function buildCalloutEl(c) {
    const root = document.createElement('div');
    root.className = 'merge-callout';
    root.dataset.calloutId = String(c.id);

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'merge-callout-connector');
    svg.setAttribute('width', '204');
    svg.setAttribute('height', '76');
    svg.setAttribute('viewBox', '0 0 204 76');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M 0 0 L 58 0 L 96 42 L 204 42');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'rgba(255,255,255,0.78)');
    path.setAttribute('stroke-width', '1');
    svg.appendChild(path);

    const card = document.createElement('div');
    card.className = 'merge-callout-card';
    card.setAttribute('role', 'status');

    const head = document.createElement('div');
    head.className = 'merge-callout-head';

    const main = document.createElement('p');
    main.className = 'merge-callout-main';

    const foot = document.createElement('div');
    foot.className = 'merge-callout-foot';
    foot.textContent = 'merged from:';

    const sources = document.createElement('div');
    sources.className = 'merge-callout-sources';

    const sA = document.createElement('span');
    const sB = document.createElement('span');
    sA.textContent = `\u201c${c.srcA}\u201d`;
    sB.textContent = `\u201c${c.srcB}\u201d`;
    sources.appendChild(sA);
    sources.appendChild(document.createTextNode(' + '));
    sources.appendChild(sB);

    main.textContent = `\u201c${c.mergedText}\u201d`;

    card.appendChild(head);
    card.appendChild(main);
    card.appendChild(foot);
    card.appendChild(sources);

    root.appendChild(svg);
    root.appendChild(card);

    head.textContent = formatMergedHead(c.time);

    const cid = c.id;
    card.addEventListener('click', (e) => {
      e.stopPropagation();
      removeCallout(cid);
    });

    return root;
  }

  function notifyCollectiveMergeIfUserOwned(miA, miB, srcA, srcB) {
    if (!currentUser) return;
    if (typeof interactionMode === 'undefined' || interactionMode !== INTERACTION_MODE.COLLECTIVE) return;
    const memA = memories[miA];
    const memB = memories[miB];
    if (!memA || !memB) return;

    const layer = ensureLayer();
    const items = [];
    if (isMyMemory(memA)) {
      items.push({
        memoryIndex: miA,
        mergedText: memA.sentence || '',
        srcA: srcA || '',
        srcB: srcB || '',
        time: Date.now(),
      });
    }
    if (isMyMemory(memB)) {
      items.push({
        memoryIndex: miB,
        mergedText: memB.sentence || '',
        srcA: srcA || '',
        srcB: srcB || '',
        time: Date.now(),
      });
    }
    if (!items.length) return;

    items.forEach((item, stackIndex) => {
      const id = ++calloutIdSeq;
      const c = { id, ...item, stackIndex, el: null, _timer: null };
      c.el = buildCalloutEl(c);
      layer.appendChild(c.el);
      c._timer = setTimeout(() => removeCallout(id), AUTO_DISMISS_MS);
      active.push(c);
    });
  }

  function updateCollectiveMergeCalloutPositions() {
    if (!active.length) return;
    if (appState !== APP_STATE.INTERACT || interactionMode !== INTERACTION_MODE.COLLECTIVE) return;
    const proj = window.threeMemoryRenderer && window.threeMemoryRenderer.projectSphereCenterToScreen;
    if (!proj) return;

    const w = typeof width !== 'undefined' ? width : window.innerWidth;
    const leftShift = -w * 0.6;
    const rx = typeof curRotX !== 'undefined' ? curRotX : 0;
    const ry = typeof curRotY !== 'undefined' ? curRotY : 0;
    const cz = typeof camZ !== 'undefined' ? camZ : 0;

    active.forEach((c) => {
      const mem = memories[c.memoryIndex];
      if (!mem || !c.el) return;
      const center = mem.liveCenter || mem.pos;
      const p = proj(center, rx, ry, cz, leftShift);
      const head = c.el.querySelector('.merge-callout-head');
      if (head) head.textContent = formatMergedHead(c.time);

      if (!p || !p.onScreen) {
        c.el.style.opacity = '0.35';
        return;
      }
      c.el.style.opacity = '1';
      const stack = c.stackIndex || 0;
      const yOff = stack * 132;
      c.el.style.left = `${p.sx}px`;
      c.el.style.top = `${p.sy + yOff}px`;
    });
  }

  function clearCollectiveMergeCallouts() {
    [...active].forEach((c) => removeCallout(c.id));
  }

  window.notifyCollectiveMergeIfUserOwned = notifyCollectiveMergeIfUserOwned;
  window.updateCollectiveMergeCalloutPositions = updateCollectiveMergeCalloutPositions;
  window.clearCollectiveMergeCallouts = clearCollectiveMergeCallouts;
})();
