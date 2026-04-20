// Three.js renderer: glass crystal sphere visuals per memory + glyphs + stamps.

const threeMemoryRenderer = (() => {
  let scene, camera, renderer, rootGroup, voidGroup;
  let canvasEl = null;
  let initOk = false;
  let sphereGeom = null;
  let stampGeom = null;
  let nodeGeom = null;
  let glyphSphereGeom = null;
  let linkGeom = null;
  let crystalShellGeom = null;
  let coreGlowGeom = null;
  const sharedGeoms = new Set();
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

  const SPHERE_RADIUS = 1.1;
  const GLYPH_ORB_OUTWARD_SCALE = 1.7;
  const STAMP_ORB_OUTWARD_SCALE = 1.7;
  let lightningPointMatsThisFrame = [];
  let stampHaloUpdaters = [];
  let projHelperWorld = null;
  let projHelperChild = null;

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
      scene.background = new THREE.Color(0x0d1a3a);
      camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 5000);
      camera.position.set(0, 0, 720);
      sphereGeom = new THREE.SphereGeometry(1, 64, 48);
      stampGeom = new THREE.SphereGeometry(1, 18, 14);
      nodeGeom = new THREE.SphereGeometry(1, 10, 10);
      glyphSphereGeom = new THREE.SphereGeometry(1, 28, 24);
      linkGeom = new THREE.CylinderGeometry(1, 1, 1, 16, 1, true);
      crystalShellGeom = new THREE.SphereGeometry(SPHERE_RADIUS, 64, 64);
      coreGlowGeom = new THREE.SphereGeometry(0.06, 24, 20);
      sharedGeoms.clear();
      [sphereGeom, stampGeom, nodeGeom, glyphSphereGeom, linkGeom, crystalShellGeom, coreGlowGeom].forEach((g) => {
        if (g) sharedGeoms.add(g);
      });

      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(window.innerWidth, window.innerHeight);
      if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.setClearColor(0x0d1a3a, 1);
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

      const ambient = new THREE.AmbientLight(0xb6c4ff, 0.55);
      const key = new THREE.DirectionalLight(0xbfcaff, 0.55);
      key.position.set(320, 240, 420);
      const rim = new THREE.DirectionalLight(0x927dff, 0.35);
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
      clearGroup(c);
      if (c.geometry && !sharedGeoms.has(c.geometry)) c.geometry.dispose?.();
      if (c.material) {
        if (Array.isArray(c.material)) c.material.forEach(m => m.dispose?.());
        else c.material.dispose?.();
      }
    }
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function memRngFromMemory(mem, mi) {
    const id = (mem && mem.id) || 0;
    const mc = (mem && mem.mergeCount) || 0;
    return mulberry32((id * 5023) ^ (mi * 733) ^ (mc * 9109) ^ 0x9e3779b9);
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
    const nodeVec = new THREE.Vector3(nd.x || 0, nd.y || 0, nd.z || 0);
    const r0 = nodeVec.length();
    if (r0 > 1e-6) {
      const radialDir = nodeVec.clone().normalize();
      const r1 = Math.min(r0 * GLYPH_ORB_OUTWARD_SCALE, shellR * 0.92);
      nodeVec.copy(radialDir.multiplyScalar(r1));
    }
    const glyphPos = nodeVec.addScaledVector(outN, -inset);

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
    const rawDist = R - satR * 0.48;
    const centerDist = Math.min(rawDist * STAMP_ORB_OUTWARD_SCALE, R * 0.91 - satR * 0.35);
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

  function randomOnSphere(r, rng) {
    const z = rng() * 2 - 1;
    const a = rng() * Math.PI * 2;
    const s = Math.sqrt(Math.max(0, 1 - z * z));
    return new THREE.Vector3(Math.cos(a) * s * r, Math.sin(a) * s * r, z * r);
  }

  function rodriguesRotate(v, k, theta) {
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    const kv = new THREE.Vector3().crossVectors(k, v);
    return v.clone().multiplyScalar(cos)
      .add(kv.multiplyScalar(sin))
      .add(k.clone().multiplyScalar(k.dot(v) * (1 - cos)));
  }

  function randomUnitPerpendicular(n, rng) {
    let r = new THREE.Vector3(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1);
    r.sub(n.clone().multiplyScalar(r.dot(n)));
    if (r.lengthSq() < 1e-8) r = new THREE.Vector3(1, 0, 0).sub(n.clone().multiplyScalar(n.x));
    return r.normalize();
  }

  function angularDist(a, b) {
    const dot = Math.abs(a.dot(b) / (a.length() * b.length()));
    return Math.acos(Math.min(1, Math.max(-1, dot)));
  }

  function createShellMaterial(alphaMult) {
    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide,
      uniforms: {
        uOpacity: { value: 0.06 },
        uFresnelPower: { value: 6.2 },
        uEdgeColor: { value: new THREE.Color(0xc8ddff) },
        uAlphaMult: { value: Math.min(1, Math.max(0, alphaMult)) }
      },
      vertexShader: `
        varying vec3 vNormalW;
        varying vec3 vViewDirW;
        void main() {
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vNormalW = normalize(mat3(modelMatrix) * normal);
          vViewDirW = normalize(cameraPosition - worldPos.xyz);
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: `
        uniform float uOpacity;
        uniform float uFresnelPower;
        uniform vec3 uEdgeColor;
        uniform float uAlphaMult;
        varying vec3 vNormalW;
        varying vec3 vViewDirW;
        void main() {
          float ndv = clamp(dot(normalize(vNormalW), normalize(vViewDirW)), 0.0, 1.0);
          float fresnel = pow(1.0 - ndv, uFresnelPower);
          float fillA = uOpacity;
          float rimA = fresnel * 0.92;
          float alpha = (fillA + rimA) * uAlphaMult;
          vec3 col = uEdgeColor * fresnel;
          gl_FragColor = vec4(col, alpha);
        }
      `
    });
  }

  function createCrystalClusterShaderMaterial(alphaMult) {
    return new THREE.ShaderMaterial({
      transparent: true,
      opacity: 0.88,
      side: THREE.DoubleSide,
      uniforms: {
        uAlphaMult: { value: Math.min(1, Math.max(0, alphaMult)) }
      },
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vNormal = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: `
        uniform float uAlphaMult;
        varying vec3 vNormal;
        void main() {
          float facing = dot(vNormal, normalize(vec3(0.5, 1.0, 0.3)));
          vec3 col = facing > 0.5  ? vec3(0.78, 0.72, 0.48)
                   : facing > 0.0  ? vec3(0.47, 0.33, 0.80)
                   : facing > -0.4 ? vec3(0.20, 0.55, 0.70)
                                   : vec3(0.25, 0.10, 0.55);
          gl_FragColor = vec4(col, 0.88 * uAlphaMult);
        }
      `
    });
  }

  function createCrystalCluster(rng, alphaMult) {
    const cluster = new THREE.Group();
    const mat = createCrystalClusterShaderMaterial(alphaMult);
    const count = 10 + Math.floor(rng() * 5);
    for (let i = 0; i < count; i++) {
      const rt = 0.01 + rng() * 0.02;
      const rb = 0.08 + rng() * 0.05;
      const h = 0.3 + rng() * 0.2;
      const cGeom = new THREE.CylinderGeometry(rt, rb, h, 6, 1, false);
      const crystal = new THREE.Mesh(cGeom, mat);
      const dir = randomOnSphere(1, rng).normalize();
      crystal.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      const sx = 0.85 + rng() * 0.3;
      const sy = 0.85 + rng() * 0.3;
      const sz = 0.85 + rng() * 0.3;
      crystal.scale.set(sx, sy, sz);
      const hEff = h * sy;
      crystal.position.copy(dir.clone().multiplyScalar(hEff * 0.5));
      cluster.add(crystal);
    }
    return cluster;
  }

  function createLightningWeb(sphereRadius, rng, t, lightningPointMatsOut) {
    const g = new THREE.Group();
    const allPolylines = [];
    const terminalPoints = [];
    const rootPaths = 25 + Math.floor(rng() * 11);

    function growBranch(p0, initialTan, maxSeg, depth) {
      const pts = [p0.clone()];
      let p = p0.clone();
      let fwd = initialTan.clone().normalize();
      const branchEvery = 2 + Math.floor(rng() * 2);
      let sinceBranch = 0;

      for (let s = 0; s < maxSeg; s++) {
        const n = p.clone().normalize();
        let tanStep = fwd.clone();
        tanStep.sub(n.clone().multiplyScalar(tanStep.dot(n)));
        if (tanStep.lengthSq() < 1e-8) tanStep = randomUnitPerpendicular(n, rng);
        tanStep.normalize();
        const jitter = ((rng() * 40) - 20) * (Math.PI / 180);
        tanStep = rodriguesRotate(tanStep, n, jitter).normalize();
        const axis = n.clone().cross(tanStep).normalize();
        if (axis.lengthSq() < 1e-8) break;
        const dtheta = 0.08 + rng() * 0.04;
        p = rodriguesRotate(p, axis, dtheta).normalize().multiplyScalar(sphereRadius);
        pts.push(p.clone());
        fwd = tanStep.clone();

        sinceBranch++;
        if (sinceBranch >= branchEvery && s < maxSeg - 1 && rng() < 0.4 && depth < 8) {
          sinceBranch = 0;
          const diverge = (30 + rng() * 15) * (Math.PI / 180);
          const sign = rng() < 0.5 ? -1 : 1;
          let tanB = rodriguesRotate(fwd, n, sign * diverge);
          tanB.sub(n.clone().multiplyScalar(tanB.dot(n)));
          if (tanB.lengthSq() < 1e-8) tanB = randomUnitPerpendicular(n, rng);
          tanB.normalize();
          const brLen = 2 + Math.floor(rng() * 2);
          growBranch(p.clone(), tanB, brLen, depth + 1);
        }
      }

      if (pts.length >= 2) allPolylines.push(pts);
      terminalPoints.push(p.clone());
    }

    for (let i = 0; i < rootPaths; i++) {
      const p0 = randomOnSphere(sphereRadius, rng).normalize().multiplyScalar(sphereRadius);
      const tan0 = randomUnitPerpendicular(p0.clone().normalize(), rng);
      const mainSeg = 4 + Math.floor(rng() * 4);
      growBranch(p0, tan0, mainSeg, 0);
    }

    allPolylines.forEach((pts) => {
      const lineGeom = new THREE.BufferGeometry().setFromPoints(pts);
      const lineMat = new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        linewidth: 1
      });
      g.add(new THREE.Line(lineGeom, lineMat));
    });

    const picked = [];
    const minEpSep = 0.06;
    for (let i = 0; i < terminalPoints.length; i++) {
      const ep = terminalPoints[i];
      let ok = true;
      for (let j = 0; j < picked.length; j++) {
        if (angularDist(ep, picked[j]) < minEpSep) { ok = false; break; }
      }
      if (ok) picked.push(ep);
    }

    const pos = new Float32Array(picked.length * 3);
    const phase = new Float32Array(picked.length);
    for (let i = 0; i < picked.length; i++) {
      pos[i * 3] = picked[i].x;
      pos[i * 3 + 1] = picked[i].y;
      pos[i * 3 + 2] = picked[i].z;
      phase[i] = rng() * Math.PI * 2;
    }
    const ptGeom = new THREE.BufferGeometry();
    ptGeom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    ptGeom.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));

    const ptMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: t },
        uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) }
      },
      vertexShader: `
        attribute float aPhase;
        uniform float uTime;
        uniform float uPixelRatio;
        varying float vPulse;
        void main() {
          vPulse = 0.75 + 0.25 * sin(3.14159265 * uTime + aPhase);
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = 4.0 * uPixelRatio * vPulse;
        }
      `,
      fragmentShader: `
        varying float vPulse;
        void main() {
          vec2 c = gl_PointCoord - vec2(0.5);
          float r = length(c) * 2.0;
          if (r > 1.0) discard;
          float alpha = (1.0 - r) * 0.65 * vPulse;
          gl_FragColor = vec4(1.0, 1.0, 1.0, alpha);
        }
      `
    });
    const points = new THREE.Points(ptGeom, ptMat);
    g.add(points);
    lightningPointMatsOut.push(ptMat);

    return g;
  }

  function memEligibleForStampGlow(mem) {
    return typeof currentUser !== 'undefined' && currentUser
      && mem && mem.ownerId && currentUser.id && mem.ownerId === currentUser.id
      && !mem.isAnonymous;
  }

  function voidRowEligibleForStampGlow(vm) {
    return typeof currentUser !== 'undefined' && currentUser
      && vm && vm.user_id && currentUser.id && vm.user_id === currentUser.id
      && !vm.is_anonymous;
  }

  function addOwnedStampGlow(grp, radiusApprox, alpha, phase) {
    const pl = new THREE.PointLight(0xaa88ff, 1.2 * Math.min(1, alpha), 0.6);
    grp.add(pl);
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(1, 28, 24),
      new THREE.MeshBasicMaterial({
        color: 0xe8d8ff,
        transparent: true,
        opacity: 0.2,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    halo.scale.setScalar(radiusApprox * 1.3);
    grp.add(halo);
    stampHaloUpdaters.push({
      mat: halo.material,
      phase: phase || 0,
      alphaMult: Math.min(1, alpha)
    });
  }

  function addMemoryCrystalScene(g, mem, mi, memR, morphAmt, alpha, timeSec) {
    const rng = memRngFromMemory(mem, mi);
    const scaleR = memR + (morphAmt || 0) * memR * 0.18;
    const bundle = new THREE.Group();
    bundle.scale.setScalar(scaleR / SPHERE_RADIUS);

    const phase = ((mem.id || 0) * 0.173 + mi * 0.091) % 1000;

    const shell = new THREE.Mesh(crystalShellGeom, createShellMaterial(alpha));
    shell.rotation.y = (timeSec + phase) * 0.02;
    bundle.add(shell);

    const coreGlow = new THREE.Mesh(
      coreGlowGeom,
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.9 * alpha,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    bundle.add(coreGlow);

    const crystalGroup = createCrystalCluster(rng, alpha);
    crystalGroup.rotation.y = (timeSec + phase) * 0.08;
    crystalGroup.rotation.x = Math.sin((Math.PI * 2 * (timeSec + phase)) / 8.0) * 0.04;
    bundle.add(crystalGroup);

    const localLightningMats = [];
    const lightningGroup = createLightningWeb(SPHERE_RADIUS, rng, timeSec + phase * 0.01, localLightningMats);
    lightningGroup.rotation.y = (timeSec + phase) * 0.02;
    bundle.add(lightningGroup);
    localLightningMats.forEach((m) => {
      lightningPointMatsThisFrame.push(m);
      if (m.uniforms.uTime) m.uniforms.uTime.value = timeSec;
    });

    g.add(bundle);

    const corePl = new THREE.PointLight(0xffffff, 3.0 * alpha, Math.max(2, scaleR * 1.8));
    corePl.position.set(0, 0, 0);
    g.add(corePl);
  }

  function renderMemories({ memories, R, rotX, rotY, camZ, leftShift = 0, activeOverlap, collectiveSet }) {
    if (!initOk || !renderer || !scene || !camera) return;
    lightningPointMatsThisFrame = [];
    stampHaloUpdaters = [];
    clearGroup(rootGroup);
    clearGroup(voidGroup);

    const world = new THREE.Group();
    world.rotation.x = rotX || 0;
    world.rotation.y = rotY || 0;
    rootGroup.add(world);

    camera.position.set(leftShift || 0, 0, 720 + (camZ || 0));
    camera.lookAt(0, 0, 0);

    const timeSec = performance.now() * 0.001;

    (memories || []).forEach((mem, mi) => {
      if (collectiveSet && !collectiveSet.has(mem.id)) return;
      const center = mem.liveCenter || mem.pos || { x: 0, y: 0, z: 0 };
      const alpha = getDistanceAlpha(center);
      if (alpha <= 0) return;
      const memR = mem.sphereR || R;

      const grp = new THREE.Group();
      grp.position.set(center.x, center.y, center.z);
      world.add(grp);

      addMemoryCrystalScene(grp, mem, mi, memR, mem.morphAmt, alpha, timeSec);
      addStamp(grp, mem, memR, alpha);
      (mem.nodes || []).forEach((nd) => addGlyph(grp, nd, mem.glyphs && mem.glyphs[nd.glyphIdx], mem, alpha, memR));
      if (memEligibleForStampGlow(mem)) {
        const scaleR = memR + (mem.morphAmt || 0) * memR * 0.18;
        const glowPhase = ((mem.id || 0) * 0.413 + mi * 0.27) % 62.83;
        addOwnedStampGlow(grp, scaleR, alpha, glowPhase);
      }
    });

    lightningPointMatsThisFrame.forEach((m) => {
      if (m.uniforms.uTime) m.uniforms.uTime.value = timeSec;
    });
    stampHaloUpdaters.forEach(({ mat, phase, alphaMult }) => {
      mat.opacity = (0.2 + 0.1 * Math.sin(timeSec * 2.0 + phase)) * alphaMult;
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
    stampHaloUpdaters = [];
    clearGroup(rootGroup);
    clearGroup(voidGroup);
    camera.position.set(0, 0, 760);
    camera.lookAt(0, 0, 0);

    const timeSec = performance.now() * 0.001;
    const count = Math.min((voidMemories || []).length, 20);
    const orbitR = Math.min(width, height) * 0.25;
    for (let i = 0; i < count; i++) {
      const phi = (i / Math.max(count, 1)) * Math.PI * 2 + t * 0.08;
      const theta = Math.acos(2 * (i / Math.max(count - 1, 1)) - 1);
      const x = orbitR * Math.sin(theta) * Math.cos(phi);
      const y = orbitR * Math.sin(theta) * Math.sin(phi) * 0.5;
      const z = orbitR * Math.cos(theta) * 0.6;
      const size = 14 + 8 * Math.sin(t * 2 + i);
      const vm = voidMemories[i];
      const holder = new THREE.Group();
      holder.position.set(x, y, z);
      const orb = new THREE.Mesh(nodeGeom, new THREE.MeshBasicMaterial({
        color: new THREE.Color((140 + i * 7) / 255, (170 + i * 4) / 255, (255 - i * 2) / 255),
        transparent: true,
        opacity: 0.55,
      }));
      orb.scale.setScalar(size);
      holder.add(orb);
      if (vm && voidRowEligibleForStampGlow(vm)) {
        let hid = 0;
        const sid = String(vm.id || '');
        for (let k = 0; k < sid.length; k++) hid = (hid * 33 + sid.charCodeAt(k)) >>> 0;
        const gph = (hid * 0.001 + i * 0.37) % 62.83;
        addOwnedStampGlow(holder, size, 1, gph);
      }
      voidGroup.add(holder);
    }
    stampHaloUpdaters.forEach(({ mat, phase, alphaMult }) => {
      mat.opacity = (0.2 + 0.1 * Math.sin(timeSec * 2.0 + phase)) * alphaMult;
    });
    renderer.render(scene, camera);
  }

  function clear() {
    if (!initOk || !renderer || !scene || !camera) return;
    clearGroup(rootGroup);
    clearGroup(voidGroup);
    renderer.render(scene, camera);
  }

  function ensureProjHelpers() {
    if (projHelperWorld) return;
    projHelperWorld = new THREE.Group();
    projHelperChild = new THREE.Group();
    projHelperWorld.add(projHelperChild);
  }

  /** Screen position (client coords) of a memory center; matches renderMemories camera + world rotation. */
  function projectSphereCenterToScreen(center, rotX, rotY, camZ, leftShift) {
    if (!initOk || !camera || !renderer || !center) return null;
    ensureProjHelpers();
    camera.position.set(leftShift || 0, 0, 720 + (camZ || 0));
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    projHelperWorld.rotation.set(rotX || 0, rotY || 0, 0);
    projHelperChild.position.set(center.x, center.y, center.z);
    projHelperWorld.updateMatrixWorld(true);
    projHelperChild.updateMatrixWorld(true);
    const wp = new THREE.Vector3();
    projHelperChild.getWorldPosition(wp);
    wp.project(camera);
    const canvas = renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const sx = rect.left + (wp.x * 0.5 + 0.5) * w;
    const sy = rect.top + (-wp.y * 0.5 + 0.5) * h;
    const onScreen = wp.z > -1 && wp.z < 1;
    return { sx, sy, onScreen, ndcZ: wp.z };
  }

  function resize(w, h) {
    if (!initOk || !renderer || !camera) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    const pr = Math.min(window.devicePixelRatio || 1, 2);
    lightningPointMatsThisFrame.forEach((m) => {
      if (m.uniforms && m.uniforms.uPixelRatio) m.uniforms.uPixelRatio.value = pr;
    });
  }

  function captureMemoriesSnapshot({
    width = 1200,
    height = 900,
    memories = [],
    R = 120,
    rotX = 0,
    rotY = 0,
    camZ = 0,
    leftShift = 0,
    activeOverlap = null,
    collectiveSet = null,
    clearColor = 0x060a19,
    clearAlpha = 1
  } = {}) {
    if (!initOk || !renderer || !scene || !camera) return null;
    const prevSize = new THREE.Vector2();
    renderer.getSize(prevSize);
    const prevPr = renderer.getPixelRatio ? renderer.getPixelRatio() : 1;
    const prevAspect = camera.aspect;
    const prevViewOffset = camera.view ? { ...camera.view } : null;
    const prevClearColor = new THREE.Color();
    renderer.getClearColor(prevClearColor);
    const prevClearAlpha = renderer.getClearAlpha ? renderer.getClearAlpha() : 1;
    const prevCanvasStyleWidth = renderer.domElement.style.width;
    const prevCanvasStyleHeight = renderer.domElement.style.height;

    // Isolate export from viewport/CSS scaling and render exactly at fixed pixel size.
    renderer.domElement.style.width = `${width}px`;
    renderer.domElement.style.height = `${height}px`;

    renderer.setPixelRatio(1);
    renderer.setSize(width, height, true);
    camera.aspect = width / Math.max(1, height);
    if (camera.clearViewOffset) camera.clearViewOffset();
    camera.updateProjectionMatrix();
    renderer.setClearColor(clearColor, clearAlpha);

    renderMemories({ memories, R, rotX, rotY, camZ, leftShift, activeOverlap, collectiveSet });
    const dataUrl = renderer.domElement.toDataURL('image/png');

    const out = document.createElement('canvas');
    out.width = width;
    out.height = height;
    const ctx = out.getContext('2d');
    if (ctx) {
      ctx.drawImage(renderer.domElement, 0, 0, width, height);
      out.dataset.snapshotDataUrl = dataUrl;
    }

    renderer.setPixelRatio(prevPr);
    renderer.setSize(
      Math.max(1, Math.floor(prevSize.x)),
      Math.max(1, Math.floor(prevSize.y)),
      true
    );
    renderer.domElement.style.width = prevCanvasStyleWidth;
    renderer.domElement.style.height = prevCanvasStyleHeight;
    camera.aspect = prevAspect;
    if (prevViewOffset && camera.setViewOffset) {
      camera.setViewOffset(
        prevViewOffset.fullWidth,
        prevViewOffset.fullHeight,
        prevViewOffset.offsetX,
        prevViewOffset.offsetY,
        prevViewOffset.width,
        prevViewOffset.height
      );
    } else if (camera.clearViewOffset) {
      camera.clearViewOffset();
    }
    camera.updateProjectionMatrix();
    renderer.setClearColor(prevClearColor, prevClearAlpha);

    return out;
  }

  return { init, isReady, resize, clear, renderMemories, renderVoidMemories, projectSphereCenterToScreen, captureMemoriesSnapshot };
})();

if (typeof window !== 'undefined') {
  window.threeMemoryRenderer = threeMemoryRenderer;
}
