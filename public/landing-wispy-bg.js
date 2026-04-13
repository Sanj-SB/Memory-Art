// VOID onboarding: landing = hero art + wispy; auth = wispy only on dark blue (no eyes). Shared texture for landing.

window.landingWispyBg = (() => {
  const HERO_URL = 'assets/landing-hero-eyes.png';

  const instances = { landing: null, auth: null };
  let sharedTexture = null;
  let textureLoadStarted = false;
  let textureReady = false;

  let rafId = null;
  let resizeBound = false;

  const FRAG = `
          precision highp float;
          uniform sampler2D uMap;
          uniform float uTime;
          uniform vec2 uRes;
          uniform vec2 uTexSize;
          uniform float uMotion;
          uniform float uShowHero;
          varying vec2 vUv;

          vec2 coverUv(vec2 uv) {
            float sw = uRes.x;
            float sh = uRes.y;
            float sAspect = sw / max(sh, 1.0);
            float tAspect = uTexSize.x / max(uTexSize.y, 1.0);
            if (sAspect > tAspect) {
              float scale = sAspect / tAspect;
              float pad = (1.0 - 1.0 / scale) * 0.5;
              return vec2(uv.x, uv.y / scale + pad);
            }
            float scale = tAspect / sAspect;
            float pad = (1.0 - 1.0 / scale) * 0.5;
            return vec2(uv.x / scale + pad, uv.y);
          }

          float eyeOval(vec2 uv, vec2 c, vec2 r) {
            vec2 d = (uv - c) / r;
            return smoothstep(1.18, 0.85, dot(d, d));
          }

          float hash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
          }

          float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                       mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
          }

          float fbm(vec2 p) {
            float v = 0.0;
            float a = 0.5;
            v += a * noise(p); p *= 2.02; a *= 0.5;
            v += a * noise(p); p *= 2.02; a *= 0.5;
            v += a * noise(p); p *= 2.02; a *= 0.5;
            v += a * noise(p); p *= 2.02; a *= 0.5;
            v += a * noise(p);
            return v;
          }

          void main() {
            vec2 uv0 = coverUv(vUv);
            vec3 letterbox = vec3(0.024, 0.039, 0.098);
            bool inside = uv0.x >= 0.001 && uv0.x <= 0.999 && uv0.y >= 0.001 && uv0.y <= 0.999;

            float eyeProtect = 0.0;
            if (uShowHero > 0.5 && inside) {
              vec2 uvL = vec2(0.38, 0.72);
              vec2 uvR = vec2(0.62, 0.72);
              vec2 rad = vec2(0.17, 0.16);
              eyeProtect = max(eyeOval(uv0, uvL, rad), eyeOval(uv0, uvR, rad));
            }

            float t = uTime * uMotion;
            float aspect = uRes.x / max(uRes.y, 1.0);
            vec2 sp = vec2(vUv.x * aspect, vUv.y);

            vec2 chaos = vec2(
              sin(t * 0.41 + sin(t * 0.19) * 2.1),
              cos(t * 0.37 + cos(t * 0.23) * 1.9)
            );
            vec2 drift = vec2(
              sin(t * 0.11 + chaos.x * 1.4),
              cos(t * 0.13 + chaos.y * 1.2)
            ) * 1.65;
            vec2 jitter = vec2(
              sin(t * 0.73 + sp.x * 18.0),
              cos(t * 0.67 + sp.y * 16.0)
            ) * 0.22;

            vec2 p = sp * 2.45 + drift + jitter + chaos * 0.55;
            float tSlow = t * 0.1;
            float n1 = fbm(p + vec2(tSlow * 1.35, tSlow * 0.62));
            float n2 = fbm(p * 1.52 + vec2(-tSlow * 0.88, tSlow * 1.08) + n1 * 1.25);
            float n3 = fbm(p * 2.75 + vec2(tSlow * 0.42, -tSlow * 1.15) + n2 * 0.9);
            float w = smoothstep(0.18, 0.92, n2 * 0.52 + n3 * 0.38);
            float ridge = pow(1.0 - abs(n1 * 2.0 - 1.0), 2.8) * 0.42;

            vec3 cPurp = vec3(0.52, 0.36, 0.88);
            vec3 cCyan = vec3(0.25, 0.62, 0.85);
            vec3 cGold = vec3(0.82, 0.76, 0.52);
            vec3 cRim = vec3(0.82, 0.90, 1.0);
            vec3 glow = vec3(0.0);
            glow += cPurp * w * 0.16;
            glow += cCyan * (n1 * 0.13 + ridge * 0.42);
            glow += cGold * (n2 * w * 0.18);
            glow += cRim * (pow(n3, 2.6) * 0.14);

            float vig = 1.0 - length((vUv - 0.5) * vec2(1.1, 1.0)) * 0.36;
            vig = clamp(vig, 0.0, 1.0);
            float strength = clamp(0.05 + w * 0.48 + ridge * 0.36, 0.0, 1.0) * vig;

            float wispMask = uShowHero > 0.5 ? (1.0 - eyeProtect * 0.48) : 1.0;
            vec3 wispy = glow * strength * 0.52 * wispMask;
            if (uShowHero < 0.5) {
              wispy *= 0.78;
            }

            if (uShowHero > 0.5 && !inside) {
              gl_FragColor = vec4(letterbox + wispy, 1.0);
              return;
            }

            vec3 base = letterbox;
            if (uShowHero > 0.5 && inside) {
              base = texture2D(uMap, clamp(uv0, 0.001, 0.999)).rgb;
            }

            gl_FragColor = vec4(base + wispy, 1.0);
          }
        `;

  function landingVisible() {
    const el = document.getElementById('landingScreen');
    if (!el) return false;
    return getComputedStyle(el).display !== 'none';
  }

  function authChoiceVisible() {
    const el = document.getElementById('authChoiceScreen');
    if (!el) return false;
    return getComputedStyle(el).display !== 'none';
  }

  function voidOnboardingBgVisible() {
    return landingVisible() || authChoiceVisible();
  }

  function activeKey() {
    if (landingVisible()) return 'landing';
    if (authChoiceVisible()) return 'auth';
    return null;
  }

  function canvasFor(key) {
    if (key === 'landing') return document.getElementById('landingWispyCanvas');
    if (key === 'auth') return document.getElementById('authWispyCanvas');
    return null;
  }

  function motionScale() {
    if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return 0.25;
    }
    return 1.0;
  }

  function configureTexture(tex, renderer) {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    const maxA =
      renderer && typeof renderer.capabilities.getMaxAnisotropy === 'function'
        ? renderer.capabilities.getMaxAnisotropy()
        : 1;
    tex.anisotropy = Math.min(16, maxA);
  }

  function bindTextureToInstance(inst) {
    if (!sharedTexture || !inst || !inst.heroMat) return;
    inst.heroMat.uniforms.uMap.value = sharedTexture;
    if (sharedTexture.image && sharedTexture.image.width) {
      inst.heroMat.uniforms.uTexSize.value.set(sharedTexture.image.width, sharedTexture.image.height);
    }
    textureReady = true;
  }

  function applySharedTextureEverywhere() {
    if (instances.landing) bindTextureToInstance(instances.landing);
    if (instances.auth) bindTextureToInstance(instances.auth);
  }

  function buildInstance(key) {
    if (instances[key]) return instances[key];
    const canvas = canvasFor(key);
    if (!canvas || typeof THREE === 'undefined') return null;
    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: false,
      antialias: true,
      powerPreference: 'default'
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2.5));
    renderer.setClearColor(0x060a19, 1);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    camera.position.z = 1;

    const heroMat = new THREE.ShaderMaterial({
      transparent: false,
      depthWrite: false,
      depthTest: false,
      uniforms: {
        uTime: { value: 0 },
        uMap: { value: null },
        uTexSize: { value: new THREE.Vector2(1, 1) },
        uRes: { value: new THREE.Vector2(1, 1) },
        uMotion: { value: 1 },
        uShowHero: { value: key === 'landing' ? 1 : 0 }
      },
      vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = vec4(position.xy, 0.0, 1.0);
          }
        `,
      fragmentShader: FRAG
    });

    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), heroMat));

    const inst = { renderer, scene, camera, heroMat };
    instances[key] = inst;

    if (sharedTexture) {
      configureTexture(sharedTexture, renderer);
      bindTextureToInstance(inst);
    }

    if (!textureLoadStarted) {
      textureLoadStarted = true;
      new THREE.TextureLoader().load(
        HERO_URL,
        (tex) => {
          configureTexture(tex, renderer);
          sharedTexture = tex;
          textureReady = true;
          applySharedTextureEverywhere();
          syncSize();
        },
        undefined,
        (err) => {
          console.warn('[landing-wispy-bg] hero texture load failed:', err);
        }
      );
    }

    return inst;
  }

  function ensureActiveInstance() {
    const key = activeKey();
    if (!key) return null;
    return buildInstance(key);
  }

  function syncSize() {
    const key = activeKey();
    if (!key) return;
    const inst = instances[key];
    const canvas = canvasFor(key);
    if (!inst || !canvas) return;
    const w = Math.max(1, canvas.clientWidth | 0);
    const h = Math.max(1, canvas.clientHeight | 0);
    inst.renderer.setSize(w, h, false);
    const pr = inst.renderer.getPixelRatio();
    inst.heroMat.uniforms.uRes.value.set(w * pr, h * pr);
  }

  function onResize() {
    syncSize();
  }

  function tick(now) {
    rafId = requestAnimationFrame(tick);
    if (!voidOnboardingBgVisible()) return;
    const inst = ensureActiveInstance();
    if (!inst) return;
    inst.heroMat.uniforms.uTime.value = now * 0.001;
    inst.heroMat.uniforms.uMotion.value = motionScale();
    const showHero = inst.heroMat.uniforms.uShowHero.value > 0.5;
    if (!showHero || textureReady || inst.heroMat.uniforms.uMap.value) {
      inst.renderer.render(inst.scene, inst.camera);
    } else {
      inst.renderer.setClearColor(0x060a19, 1);
      inst.renderer.clear(true, true, true);
    }
  }

  function start() {
    if (rafId != null) return;
    if (!resizeBound) {
      window.addEventListener('resize', onResize);
      resizeBound = true;
    }
    rafId = requestAnimationFrame(tick);
  }

  function stop() {
    if (rafId != null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  return { start, stop, syncSize };
})();
