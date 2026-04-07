// Three.js renderer for memory spheres, glyphs, and stamps.

const threeMemoryRenderer = (() => {
  let scene, camera, renderer, rootGroup, voidGroup;
  let canvasEl = null;
  let initOk = false;
  let sphereGeom = null;
  let stampGeom = null;
  let nodeGeom = null;
  let glyphSphereGeom = null;
  let linkGeom = null;
  let threeLoadStarted = false;
  let threeLoadDone = false;
  const glyphTextureCache = new Map();
  const GLYPH_TEX_CACHE_VER = 'dense-neon-v2';
  const GLYPH_FPAIRS = [
    [1, 2], [1, 3], [2, 3], [1, 4], [3, 4], [2, 5], [3, 5], [1, 5],
    [4, 5], [2, 7], [3, 7], [5, 7], [1, 7], [4, 7], [6, 7], [2, 9],
    [3, 9], [4, 9], [5, 9], [7, 9], [1, 9], [8, 9], [2, 11], [3, 11],
    [4, 11], [5, 11], [6, 11], [7, 11], [8, 11], [9, 11], [1, 11],
    [5, 3], [7, 3], [7, 4], [9, 4], [7, 5], [9, 5], [11, 5], [11, 7], [11, 9]
  ];

  function loadScriptOnce(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => resolve(true);
      s.onerror = () => reject(new Error(`failed: ${src}`));
      document.head.appendChild(s);
    });
  }

  async function ensureThreeLoaded() {
    if (typeof THREE !== 'undefined') return true;
    if (threeLoadDone) return typeof THREE !== 'undefined';
    if (threeLoadStarted) return false;
    threeLoadStarted = true;
    const moduleSources = [
      './three.module.min.js',
      '/three.module.min.js',
      'https://cdn.jsdelivr.net/npm/three@0.183.2/build/three.module.min.js',
      'https://unpkg.com/three@0.183.2/build/three.module.min.js',
    ];
    for (let i = 0; i < moduleSources.length; i++) {
      try {
        const mod = await import(moduleSources[i]);
        if (mod) {
          window.THREE = mod;
          threeLoadDone = true;
          console.log(`[three-renderer] loaded THREE module from ${moduleSources[i]}`);
          return true;
        }
      } catch (_) {
        // try next source
      }
    }

    const sources = [
      'https://cdn.jsdelivr.net/npm/three@0.183.2/build/three.min.js',
      'https://unpkg.com/three@0.183.2/build/three.min.js',
    ];
    for (let i = 0; i < sources.length; i++) {
      try {
        await loadScriptOnce(sources[i]);
        if (typeof THREE !== 'undefined') {
          threeLoadDone = true;
          console.log(`[three-renderer] loaded THREE from ${sources[i]}`);
          return true;
        }
      } catch (_) {
        // try next source
      }
    }
    threeLoadDone = true;
    console.warn('[three-renderer] unable to load THREE from all sources');
    return false;
  }

  function init(container) {
    if (!container) return false;
    if (typeof THREE === 'undefined') {
      ensureThreeLoaded();
      return false;
    }
    try {
      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 5000);
      camera.position.set(0, 0, 720);
      sphereGeom = new THREE.SphereGeometry(1, 64, 48);
      stampGeom = new THREE.SphereGeometry(1, 18, 14);
      nodeGeom = new THREE.SphereGeometry(1, 10, 10);
      glyphSphereGeom = new THREE.SphereGeometry(1, 28, 24);
      linkGeom = new THREE.CylinderGeometry(1, 1, 1, 16, 1, true);

      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(window.innerWidth, window.innerHeight);
      if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.setClearColor(0x000000, 0);
      canvasEl = renderer.domElement;
      canvasEl.style.position = 'absolute';
      canvasEl.style.inset = '0';
      canvasEl.style.zIndex = '1';
      canvasEl.style.pointerEvents = 'none';
      container.appendChild(canvasEl);

      rootGroup = new THREE.Group();
      voidGroup = new THREE.Group();
      scene.add(rootGroup);
      scene.add(voidGroup);

      const ambient = new THREE.AmbientLight(0xb6c4ff, 0.8);
      const key = new THREE.DirectionalLight(0xbfcaff, 0.7);
      key.position.set(320, 240, 420);
      const rim = new THREE.DirectionalLight(0x927dff, 0.45);
      rim.position.set(-280, -140, -420);
      scene.add(ambient, key, rim);
      initOk = true;
      return true;
    } catch (err) {
      console.warn('[three-renderer] init failed, falling back to UI-only flow:', err);
      initOk = false;
      renderer = null;
      scene = null;
      camera = null;
      rootGroup = null;
      voidGroup = null;
      return false;
    }
  }

  function isReady() {
    return !!initOk;
  }

  function clearGroup(g) {
    if (!g) return;
    while (g.children.length) {
      const c = g.children[0];
      g.remove(c);
      if (c.geometry) c.geometry.dispose?.();
      if (c.material) {
        if (Array.isArray(c.material)) c.material.forEach(m => m.dispose?.());
        else c.material.dispose?.();
      }
    }
  }

  function memColor(mem) {
    const p = mem.colorPhase || 0;
    return {
      r: Math.min(255, Math.max(0, Math.sin(p * 0.013) * 40 + 180)),
      g: Math.min(255, Math.max(0, Math.sin(p * 0.021) * 40 + 190)),
      b: Math.min(255, Math.max(0, Math.sin(p * 0.031) * 40 + 220)),
    };
  }

  function glyphCfgFromChar(ch) {
    const c = String(ch || '?').toLowerCase().charCodeAt(0) || 63;
    const p = GLYPH_FPAIRS[c % GLYPH_FPAIRS.length];
    let s = ((c * 7919 + 12345) | 0) || 1;
    s = (s ^ (s << 13)) | 0; s = (s ^ (s >> 17)) | 0; s = (s ^ (s << 5)) | 0;
    const delta = ((s >>> 0) / 0x100000000) * Math.PI * 2;
    s = (s ^ (s << 13)) | 0; s = (s ^ (s >> 17)) | 0; s = (s ^ (s << 5)) | 0;
    const rot = ((s >>> 0) / 0x100000000) * Math.PI * 2;
    return { a: p[0], b: p[1], delta, rot, hue: (c * 137.508) % 360 };
  }

  /**
   * Dense “scribble / spirograph” Lissajous stacks: many thin strokes + optional
   * shadowBlur so overlaps read as neon (matches glyph_sphere-style logic, richer).
   */
  function drawLissajousBundleNeon(ctx, a, b, delta, rot, hue, nT, spd, rad, cx, cy, opts) {
    const ST = Math.max(480, opts?.steps ?? 960);
    const alphaMul = opts?.alphaMul ?? 1;
    const hueShift = opts?.hueShift ?? 0;
    const wiggle = opts?.wiggle ?? 0;
    const blur = opts?.shadowBlur;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (blur != null && blur > 0) ctx.shadowBlur = blur;
    for (let th = 0; th < nT; th++) {
      const t = th / Math.max(nT - 1, 1);
      const sOff = (t - 0.5) * spd;
      const cd = Math.abs(t - 0.5) * 2;
      const sH = ((hue + (t - 0.5) * 118 + hueShift) + 720) % 360;
      const sat = Math.min(100, Math.round(62 + cd * 38));
      const lit = Math.round(54 + cd * 42);
      const alp = (0.055 + (1 - cd) * 0.2) * alphaMul;
      const lw = 0.22 + (1 - cd) * 0.62;
      ctx.beginPath();
      for (let i = 0; i <= ST; i++) {
        const ag = (i / ST) * Math.PI * 2;
        let lx = Math.sin(a * ag + delta) * rad;
        let ly = Math.sin(b * ag) * rad;
        if (wiggle > 0) {
          lx += Math.sin(ag * (a + b + 3) * 2 + delta * 2.1) * rad * wiggle;
          ly += Math.cos(ag * (a + b + 3) * 2 + rot * 1.3) * rad * wiggle;
        }
        const tx = a * Math.cos(a * ag + delta), ty = b * Math.cos(b * ag);
        const tl = Math.sqrt(tx * tx + ty * ty) + 1e-4;
        const nx = -ty / tl, ny = tx / tl;
        const sx = lx + nx * sOff, sy = ly + ny * sOff;
        const px = cx + sx * Math.cos(rot) - sy * Math.sin(rot);
        const py = cy + sx * Math.sin(rot) + sy * Math.cos(rot);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      const stroke = `hsla(${sH.toFixed(2)},${sat}%,${lit}%,${alp.toFixed(4)})`;
      ctx.strokeStyle = stroke;
      if (blur != null && blur > 0) ctx.shadowColor = stroke;
      ctx.lineWidth = lw;
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
  }

  function drawGlyphCanvas(ctx, ch, sz) {
    const { a, b, delta, rot, hue } = glyphCfgFromChar(ch);
    const cx = sz / 2;
    const cy = sz / 2;
    const discR = sz * 0.485;
    const rad = sz * 0.405;
    const spd = sz * 0.05;
    ctx.save();
    ctx.clearRect(0, 0, sz, sz);
    ctx.beginPath();
    ctx.arc(cx, cy, discR, 0, Math.PI * 2);
    ctx.clip();

    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#030206';
    ctx.fillRect(0, 0, sz, sz);

    const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, discR);
    bg.addColorStop(0, `hsla(${hue},35%,11%,1)`);
    bg.addColorStop(1, `hsla(${hue},14%,2.5%,1)`);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, sz, sz);

    const vig = ctx.createRadialGradient(cx, cy, sz * 0.06, cx, cy, discR * 1.05);
    vig.addColorStop(0, 'rgba(255,255,255,0.0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, sz, sz);

    ctx.globalCompositeOperation = 'lighter';

    for (let pass = 0; pass < 4; pass++) {
      const dOff = pass * 0.095;
      const rMul = 1 - pass * 0.028;
      const bz = 4.8 - pass * 1.05;
      drawLissajousBundleNeon(
        ctx, a, b, delta + dOff, rot + dOff * 0.75, hue + pass * 18,
        54, spd * rMul, rad * rMul, cx, cy,
        { steps: 1024, alphaMul: 0.42, shadowBlur: bz, wiggle: 0.022 }
      );
      drawLissajousBundleNeon(
        ctx, b, a,
        (delta + Math.PI * 0.42 + dOff * 0.9) % (Math.PI * 2),
        (rot + Math.PI * 0.36 + dOff * 0.5) % (Math.PI * 2),
        (hue + 172 + pass * 14) % 360,
        46, spd * 0.58 * rMul, rad * 0.9 * rMul, cx, cy,
        { steps: 960, alphaMul: 0.36, shadowBlur: bz * 0.85, wiggle: 0.018 }
      );
    }

    ctx.shadowBlur = 0;
    for (let k = 0; k < 6; k++) {
      const ep = (k - 2.5) * 0.016;
      drawLissajousBundleNeon(
        ctx, a, b, delta + ep, rot + ep * 1.05, hue + k * 9,
        50, spd * 0.97, rad * (0.84 + k * 0.022), cx, cy,
        { steps: 1024, alphaMul: 0.62, wiggle: 0.028 }
      );
    }

    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.beginPath();
    ctx.arc(cx, cy, discR - 0.5, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(165,138,88,0.32)';
    ctx.lineWidth = sz > 400 ? 1.15 : 1;
    ctx.stroke();
    ctx.restore();
  }

  function createGlyphTexture(charSymbol) {
    const key = `${GLYPH_TEX_CACHE_VER}|${String(charSymbol || '?').toLowerCase()}`;
    if (glyphTextureCache.has(key)) return glyphTextureCache.get(key);
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    drawGlyphCanvas(ctx, charSymbol, size);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    glyphTextureCache.set(key, tex);
    return tex;
  }

  function addGlyph(group, nd, glyph, mem, alphaMult, memR) {
    if (!glyph || !glyph.anchor || glyph.anchor.length < 2) return;
    const baseA = (0.58 * (nd.opacity || 1) * alphaMult) * (mem.vitality || 1);
    const glyphBubbleR = Math.max(22, Math.min((nd.size || 80) * 0.52, 46));
    const outN = new THREE.Vector3(nd.nx || 0, nd.ny || 0, nd.nz || 1).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), outN);
    const glyphTexture = createGlyphTexture(nd.charSymbol);
    const shellR = Math.max(1, Number(memR || mem.sphereR || 1));
    const inset = Math.min(shellR * 0.3, (glyphBubbleR * 1.15) + shellR * 0.04);
    const glyphPos = new THREE.Vector3(nd.x || 0, nd.y || 0, nd.z || 0).addScaledVector(outN, -inset);

    // Single textured orb: line art reads as dense neon curves, not glossy glass shapes.
    const glyphOrb = new THREE.Mesh(glyphSphereGeom || stampGeom, new THREE.MeshBasicMaterial({
      map: glyphTexture || null,
      color: 0xffffff,
      transparent: true,
      opacity: Math.min(1, 0.58 + baseA * 0.38),
      depthWrite: false,
      depthTest: true,
      toneMapped: false
    }));
    glyphOrb.position.copy(glyphPos);
    glyphOrb.quaternion.copy(q);
    glyphOrb.renderOrder = 2;
    glyphOrb.scale.setScalar(Math.max(4.8, glyphBubbleR * 0.52));
    group.add(glyphOrb);
  }

  function addStamp(group, mem, R, alphaMult) {
    if (mem.isAnonymous) return;
    if (!identityGlyphData || !Array.isArray(identityGlyphData) || !identityGlyphData.length) return;
    const id = mem.id || 0;
    const u = Math.sin(id * 0.71 + (mem.colorPhase || 0) * 0.0001);
    const v = Math.cos(id * 0.53 + 1.3);
    const w = Math.sin(id * 0.37 + 2.1);
    const len = Math.sqrt(u * u + v * v + w * w) || 1;
    const dir = { x: u / len, y: v / len, z: w / len };
    const satR = R * 0.24;
    const centerDist = R - satR * 0.48;
    const pos = new THREE.Vector3(dir.x * centerDist, dir.y * centerDist, dir.z * centerDist);

    const bubble = new THREE.Mesh(stampGeom, new THREE.MeshPhysicalMaterial({
      color: 0x9db7ff,
      transparent: true,
      opacity: Math.min(0.8, 0.26 + alphaMult * 0.3),
      roughness: 0.18,
      metalness: 0.05,
      transmission: 0.35,
      thickness: 0.8,
    }));
    bubble.scale.setScalar(satR);
    bubble.position.copy(pos);
    group.add(bubble);
  }

  function renderMemories({ memories, R, rotX, rotY, camZ, leftShift = 0, activeOverlap, collectiveSet }) {
    if (!initOk || !renderer || !scene || !camera) return;
    clearGroup(rootGroup);
    clearGroup(voidGroup);

    const world = new THREE.Group();
    world.rotation.x = rotX || 0;
    world.rotation.y = rotY || 0;
    rootGroup.add(world);

    camera.position.set(leftShift || 0, 0, 720 + (camZ || 0));
    camera.lookAt(0, 0, 0);

    (memories || []).forEach((mem) => {
      if (collectiveSet && !collectiveSet.has(mem.id)) return;
      const center = mem.liveCenter || mem.pos || { x: 0, y: 0, z: 0 };
      const alpha = getDistanceAlpha(center);
      if (alpha <= 0) return;
      const c = memColor(mem);
      const color = new THREE.Color(c.r / 255, c.g / 255, c.b / 255);

      const g = new THREE.Group();
      g.position.set(center.x, center.y, center.z);
      world.add(g);

      const shell = new THREE.Mesh(sphereGeom, new THREE.MeshPhysicalMaterial({
        color: color.clone().lerp(new THREE.Color(0xfff2cc), 0.35),
        transparent: true,
        opacity: Math.min(0.82, 0.42 * alpha),
        roughness: 0.08,
        metalness: 0.02,
        transmission: 1.0,
        thickness: 1.15,
        ior: 1.18,
        clearcoat: 1.0,
        clearcoatRoughness: 0.02,
        depthWrite: false,
      }));
      const memR = mem.sphereR || R;
      shell.scale.setScalar(memR + (mem.morphAmt || 0) * memR * 0.18);
      g.add(shell);

      const innerGlow = new THREE.Mesh(sphereGeom, new THREE.MeshBasicMaterial({
        color: color.clone().lerp(new THREE.Color(0xffe2b2), 0.25),
        transparent: true,
        opacity: 0.16 * alpha,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      }));
      innerGlow.scale.setScalar(memR * 0.96);
      g.add(innerGlow);

      const wire = new THREE.LineSegments(
        new THREE.EdgesGeometry(sphereGeom, 20),
        new THREE.LineBasicMaterial({ color: 0xfff3da, transparent: true, opacity: 0.06 * alpha })
      );
      wire.scale.copy(shell.scale);
      g.add(wire);

      addStamp(g, mem, memR, alpha);
      (mem.nodes || []).forEach((nd) => addGlyph(g, nd, mem.glyphs && mem.glyphs[nd.glyphIdx], mem, alpha, memR));
    });

    if (activeOverlap) {
      const A = memories[activeOverlap.miA];
      const B = memories[activeOverlap.miB];
      if (A && B) {
        const a = A.liveCenter || A.pos;
        const b = B.liveCenter || B.pos;
        const av = new THREE.Vector3(a.x, a.y, a.z);
        const bv = new THREE.Vector3(b.x, b.y, b.z);
        const mid = av.clone().add(bv).multiplyScalar(0.5);
        const dir = bv.clone().sub(av);
        const len = dir.length() || 1;
        dir.normalize();
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);

        const thick = Math.max(2.4, Math.min(6.5, (R || 120) * 0.035));
        const glow = new THREE.Mesh(linkGeom, new THREE.MeshBasicMaterial({
          color: 0xe7c6ff,
          transparent: true,
          opacity: 0.62,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        }));
        glow.position.copy(mid);
        glow.quaternion.copy(q);
        glow.scale.set(thick * 1.85, len, thick * 1.85);
        glow.renderOrder = 3;
        world.add(glow);

        const core = new THREE.Mesh(linkGeom, new THREE.MeshBasicMaterial({
          color: 0xd9b4ff,
          transparent: true,
          opacity: 0.9,
          depthWrite: false
        }));
        core.position.copy(mid);
        core.quaternion.copy(q);
        core.scale.set(thick * 0.78, len, thick * 0.78);
        core.renderOrder = 4;
        world.add(core);
      }
    }
    renderer.render(scene, camera);
  }

  function renderVoidMemories(voidMemories, t, width, height) {
    if (!initOk || !renderer || !scene || !camera) return;
    clearGroup(rootGroup);
    clearGroup(voidGroup);
    camera.position.set(0, 0, 760);
    camera.lookAt(0, 0, 0);

    const count = Math.min((voidMemories || []).length, 20);
    const orbitR = Math.min(width, height) * 0.25;
    for (let i = 0; i < count; i++) {
      const phi = (i / Math.max(count, 1)) * Math.PI * 2 + t * 0.08;
      const theta = Math.acos(2 * (i / Math.max(count - 1, 1)) - 1);
      const x = orbitR * Math.sin(theta) * Math.cos(phi);
      const y = orbitR * Math.sin(theta) * Math.sin(phi) * 0.5;
      const z = orbitR * Math.cos(theta) * 0.6;
      const size = 14 + 8 * Math.sin(t * 2 + i);
      const orb = new THREE.Mesh(nodeGeom, new THREE.MeshBasicMaterial({
        color: new THREE.Color((140 + i * 7) / 255, (170 + i * 4) / 255, (255 - i * 2) / 255),
        transparent: true,
        opacity: 0.55,
      }));
      orb.position.set(x, y, z);
      orb.scale.setScalar(size);
      voidGroup.add(orb);
    }
    renderer.render(scene, camera);
  }

  function clear() {
    if (!initOk || !renderer || !scene || !camera) return;
    clearGroup(rootGroup);
    clearGroup(voidGroup);
    renderer.render(scene, camera);
  }

  function resize(w, h) {
    if (!initOk || !renderer || !camera) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  return { init, isReady, resize, clear, renderMemories, renderVoidMemories };
})();

if (typeof window !== 'undefined') {
  window.threeMemoryRenderer = threeMemoryRenderer;
}
