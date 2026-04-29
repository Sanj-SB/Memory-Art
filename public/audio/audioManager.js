// Global Tone.js audio manager with smooth scene/mode transitions.
(function attachImoriaAudioManager(windowObj) {
  if (windowObj.imoriaAudioManager) return;

  class ImoriaAudioManager {
    constructor() {
      this.initialized = false; // engine graph created (ambience)
      this.started = false;
      this.muted = false;
      this.currentScene = 'silent';
      this.targetScene = 'landing';
      this.currentMemoryMode = 'raw';
      this.unlocked = false; // AudioContext running at least once
      this.unlocking = false;
      this._transitionTimer = null;
      this.listeners = new Map();
      this.eyePulseUntil = 0;
      this.eyePulseBoost = 0;
      this.uiBtn = null;
      this.enableOverlay = null;
      this.enableOverlayBtn = null;
      this.enableOverlayNote = null;
      this.testSynth = null;
      this.rawCtx = null;
      this._globalUnlockBound = false;
      this.transportWatchdogTimer = null;
      this.unlockWatchdogTimer = null;
    }

    ensureEnableOverlay() {
      if (this.enableOverlay) return;
      const ov = document.createElement('div');
      ov.id = 'audioEnableOverlay';
      Object.assign(ov.style, {
        position: 'fixed',
        inset: '0',
        zIndex: '20000',
        display: 'none',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(6,10,25,0.82)',
        backdropFilter: 'blur(8px)',
        color: 'rgba(240,245,255,0.94)',
        fontFamily: 'Inter, sans-serif',
        padding: '24px',
      });
      const card = document.createElement('div');
      Object.assign(card.style, {
        width: 'min(560px, 92vw)',
        border: '1px solid rgba(175,190,255,0.32)',
        background: 'rgba(10,14,32,0.72)',
        padding: '18px 18px 16px',
        textAlign: 'center',
      });
      const title = document.createElement('div');
      title.textContent = 'Enable sound';
      Object.assign(title.style, {
        fontFamily: "'Cormorant Garamond', serif",
        fontStyle: 'italic',
        fontSize: '26px',
        letterSpacing: '0.02em',
        marginBottom: '10px',
      });
      const note = document.createElement('div');
      note.textContent = 'Click once to unlock audio.';
      Object.assign(note.style, {
        fontSize: '12px',
        letterSpacing: '0.08em',
        opacity: '0.8',
        marginBottom: '14px',
        textTransform: 'uppercase',
      });
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = 'Click to Enable Sound';
      Object.assign(btn.style, {
        border: '1px solid rgba(220,230,255,0.8)',
        background: 'transparent',
        color: 'rgba(248,252,255,0.96)',
        fontFamily: 'Inter, sans-serif',
        fontSize: '12px',
        letterSpacing: '0.22em',
        textTransform: 'uppercase',
        padding: '12px 18px',
        cursor: 'pointer',
      });
      const onGesture = (e) => {
        if (!e) return;
        const isKeyboardActivate = e.type === 'keydown' && (e.key === 'Enter' || e.key === ' ');
        if (e.type === 'keydown' && !isKeyboardActivate) return;
        if (typeof e.preventDefault === 'function') e.preventDefault();
        this.unlockAndStart({
          source: 'overlay',
          eventType: e && e.type,
          trusted: !!(e && e.isTrusted),
          userActivation: !!(navigator && navigator.userActivation && navigator.userActivation.isActive),
        });
      };
      // Safari/iOS can drop click-based audio unlocks; bind multiple gesture paths.
      btn.addEventListener('pointerup', onGesture, { passive: false });
      btn.addEventListener('touchend', onGesture, { passive: false });
      btn.addEventListener('click', onGesture, { passive: false });
      btn.addEventListener('keydown', onGesture);
      card.appendChild(title);
      card.appendChild(note);
      card.appendChild(btn);
      ov.appendChild(card);
      document.body.appendChild(ov);
      this.enableOverlay = ov;
      this.enableOverlayBtn = btn;
      this.enableOverlayNote = note;
    }

    showEnableOverlay(message) {
      this.ensureEnableOverlay();
      if (this.enableOverlayNote && message) this.enableOverlayNote.textContent = message;
      if (this.enableOverlay) this.enableOverlay.style.display = 'flex';
    }

    hideEnableOverlay() {
      if (this.enableOverlay) this.enableOverlay.style.display = 'none';
    }

    bindGlobalUnlockListeners() {
      if (this._globalUnlockBound) return;
      this._globalUnlockBound = true;
      const isEditableTarget = (target) => {
        if (!target || !(target instanceof Element)) return false;
        if (target.isContentEditable) return true;
        const tag = target.tagName;
        return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      };
      const tryUnlock = (e) => {
        if (e && e.type === 'keydown') {
          if (isEditableTarget(e.target)) return;
          const key = e.key;
          const isKeyboardActivate = key === 'Enter' || key === ' ';
          if (!isKeyboardActivate) return;
          try { if (typeof e.preventDefault === 'function') e.preventDefault(); } catch {}
        }
        if (!windowObj.imoriaAudioManager) return;
        if (windowObj.imoriaAudioManager.unlocked) return;
        windowObj.imoriaAudioManager.unlockAndStart({ source: 'global' });
      };
      windowObj.addEventListener('keydown', tryUnlock, { passive: false });
    }

    initEngine() {
      if (this.initialized) return true;
      if (!windowObj.Tone || !windowObj.ImoriaAudioScenes) return false;
      const Tone = windowObj.Tone;
      this.master = new Tone.Gain(0.92).toDestination();
      this.compressor = new Tone.Compressor(-24, 4).connect(this.master);
      this.limiter = new Tone.Limiter(-1).connect(this.compressor);
      this.landing = windowObj.ImoriaAudioScenes.createLandingScene(Tone, this.limiter);
      this.onboarding = windowObj.ImoriaAudioScenes.createOnboardingScene(Tone, this.limiter);
      this.voidScene = windowObj.ImoriaAudioScenes.createVoidScene(Tone, this.limiter);
      this.voidScene.setMemoryMode(this.currentMemoryMode);
      this.on('landing:drone-hit', () => {
        this.eyePulseUntil = performance.now() + 900;
        this.eyePulseBoost = 0.22;
      });
      this.initialized = true;
      return true;
    }

    startTransportWatchdog() {
      if (this.transportWatchdogTimer) return;
      this.transportWatchdogTimer = windowObj.setInterval(() => {
        if (!this.unlocked || !this.initialized || !this.started) return;
        const Tone = windowObj.Tone;
        if (!Tone || !Tone.Transport) return;
        if (Tone.Transport.state !== 'started') {
          try {
            Tone.Transport.start('+0.02');
            console.log('[IMORIA AUDIO] Transport watchdog restart');
          } catch (e) {
            console.warn('[IMORIA AUDIO] Transport watchdog failed:', e);
          }
        }
      }, 1200);
    }

    debugReport(tag) {
      const Tone = windowObj.Tone;
      if (!Tone) return;
      try {
        console.log('[IMORIA AUDIO]', tag, {
          ctx: Tone.context && Tone.context.state,
          transport: Tone.Transport && Tone.Transport.state,
          scene: this.currentScene,
          target: this.targetScene,
          unlocked: this.unlocked,
          started: this.started,
          muted: this.muted,
        });
      } catch {}
    }

    async unlockAndStart(meta = {}) {
      this.bindGlobalUnlockListeners();
      this.ensureEnableOverlay();
      const Tone = windowObj.Tone;
      if (!Tone) {
        this.showEnableOverlay('Tone.js not loaded yet.');
        console.warn('[IMORIA AUDIO] Tone.js missing');
        return;
      }
      if (this.unlocked && this.started) {
        this.hideEnableOverlay();
        return;
      }
      if (this.unlocking) return;
      this.unlocking = true;
      if (this.unlockWatchdogTimer) {
        clearTimeout(this.unlockWatchdogTimer);
        this.unlockWatchdogTimer = null;
      }
      this.unlockWatchdogTimer = windowObj.setTimeout(() => {
        if (!this.unlocking) return;
        console.warn('[IMORIA AUDIO] unlock watchdog: clearing stuck unlock state');
        this.unlocking = false;
        this.showEnableOverlay('Unlock is taking longer than expected. Click again to enable sound.');
      }, 7000);

      // Keep the call stack as "gesture-clean" as possible:
      // attempt to create/set a fresh context, then start immediately.
      this.showEnableOverlay('Unlocking audio…');
      console.log('[IMORIA AUDIO] unlock meta', meta);

      // Absolute baseline: try a plain WebAudio beep created in-gesture.
      // If THIS fails, the page is not receiving a valid user gesture for audio.
      try {
        const AC = windowObj.AudioContext || windowObj.webkitAudioContext;
        if (AC) {
          if (!this.rawCtx || this.rawCtx.state === 'closed') this.rawCtx = new AC({ latencyHint: 'interactive' });
          const raw = this.rawCtx;
          console.log('[IMORIA AUDIO] rawCtx state before resume:', raw && raw.state);
          if (raw && typeof raw.resume === 'function') {
            try {
              await raw.resume();
            } catch (e) {
              console.warn('[IMORIA AUDIO] rawCtx.resume() failed:', e);
            }
          }
          console.log('[IMORIA AUDIO] rawCtx state after resume attempt:', raw && raw.state);
          if (!raw || raw.state !== 'running') {
            this.showEnableOverlay('Browser blocked audio. Click again on page, then this button.');
            this.muted = true;
            this.emit('sound:state', { unlocked: this.unlocked, muted: this.muted });
            this.unlocking = false;
            return;
          }
          // Fire a tiny oscillator ping (very short) so we can verify audibility
          // even if Tone fails to start.
          const t = raw.currentTime + 0.05;
          const osc = raw.createOscillator();
          const osc2 = raw.createOscillator();
          const g = raw.createGain();
          const master = raw.createGain();
          osc.type = 'sine';
          osc2.type = 'triangle';
          osc.frequency.setValueAtTime(523.25, t); // C5
          osc2.frequency.setValueAtTime(659.25, t); // E5
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.42, t + 0.04);
          g.gain.exponentialRampToValueAtTime(0.18, t + 0.3);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
          master.gain.setValueAtTime(0.85, t);
          osc.connect(g);
          osc2.connect(g);
          g.connect(master);
          master.connect(raw.destination);
          osc.start(t);
          osc2.start(t);
          osc.stop(t + 0.92);
          osc2.stop(t + 0.92);
          console.log('[IMORIA AUDIO] Raw WebAudio test beep fired (C5+E5, 0.9s)');
        }
      } catch (e) {
        console.warn('[IMORIA AUDIO] Raw WebAudio beep failed:', e);
        this.showEnableOverlay('Audio context failed. Click once on page, then retry.');
        this.muted = true;
        this.emit('sound:state', { unlocked: this.unlocked, muted: this.muted });
        this.unlocking = false;
        return;
      }

      try {
        if (Tone.Context && typeof Tone.setContext === 'function') {
          // Prefer binding Tone to the raw AudioContext we just created in-gesture.
          if (this.rawCtx) {
            Tone.setContext(new Tone.Context({ context: this.rawCtx, latencyHint: 'interactive' }));
          } else {
            const ctx = Tone.getContext ? Tone.getContext() : Tone.context;
            const rawState = ctx && ctx.rawContext ? ctx.rawContext.state : (Tone.context && Tone.context.state);
            if (rawState !== 'running') {
              Tone.setContext(new Tone.Context({ latencyHint: 'interactive' }));
            }
          }
        }
      } catch (e) {
        console.warn('[IMORIA AUDIO] setContext failed (continuing):', e);
      }

      this.debugReport(`unlock:start (${meta.source || 'unknown'})`);
      Tone.start().then(() => {
        try {
          this.unlocked = true;
          console.log('[IMORIA AUDIO] Audio unlocked');
          if (Tone.Destination) {
            // Respect current mute preference (popup toggles `this.muted`).
            Tone.Destination.mute = !!this.muted;
            if (Tone.Destination.volume && typeof Tone.Destination.volume.rampTo === 'function') {
              Tone.Destination.volume.rampTo(-2, 0.25);
            }
          }

          // Stage A: guaranteed audible beep straight to Destination.
          if (!this.testSynth) {
            this.testSynth = new Tone.Synth({
              oscillator: { type: 'sine' },
              envelope: { attack: 0.005, decay: 0.12, sustain: 0.0, release: 0.18 },
              volume: -6
            }).toDestination();
          }
          const t0 = Tone.now() + 0.02;
          this.testSynth.triggerAttackRelease('C4', '8n', t0, 0.9);
          console.log('[IMORIA AUDIO] Test tone fired (C4)');

          // Stage B+: only after unlock + beep, build engine and start transport/scenes.
          const ok = this.initEngine();
          if (!ok) {
            this.showEnableOverlay('Audio unlocked, but scenes not loaded yet.');
            this.muted = true;
            this.emit('sound:state', { unlocked: this.unlocked, muted: this.muted });
            this.unlocking = false;
            return;
          }

          if (!this.started) {
            Tone.Transport.bpm.value = 42;
            Tone.Transport.start('+0.05');
            this.started = true;
            console.log('[IMORIA AUDIO] Transport started');
          }

          this.voidScene.setMemoryMode(this.currentMemoryMode);
          this.applySceneTransition(this.targetScene || 'landing', 1.2);
          if (this.landing && typeof this.landing.prime === 'function') this.landing.prime();
          if (this.onboarding && typeof this.onboarding.prime === 'function') this.onboarding.prime();
          // Avoid forcing void prime at unlock; it can overlap monophonic shimmer.
          this.hideEnableOverlay();
          this.startTransportWatchdog();
          this.debugReport('unlock:done');
          this.emit('sound:state', { unlocked: this.unlocked, muted: this.muted });
          if (this.unlockWatchdogTimer) {
            clearTimeout(this.unlockWatchdogTimer);
            this.unlockWatchdogTimer = null;
          }
          this.unlocking = false;
        } catch (setupErr) {
          console.warn('[IMORIA AUDIO] post-unlock setup failed:', setupErr);
          this.showEnableOverlay('Audio unlocked, but scene setup failed. Retry.');
          this.muted = true;
          this.emit('sound:state', { unlocked: this.unlocked, muted: this.muted });
          if (this.unlockWatchdogTimer) {
            clearTimeout(this.unlockWatchdogTimer);
            this.unlockWatchdogTimer = null;
          }
          this.unlocking = false;
        }
      }).catch((err) => {
        console.warn('[IMORIA AUDIO] Tone.start() failed:', err);
        // Fallback: some Chrome cases require explicit resume on the raw context.
        try {
          const ctx = Tone.getContext ? Tone.getContext() : Tone.context;
          const raw = ctx && ctx.rawContext ? ctx.rawContext : null;
          if (raw && typeof raw.resume === 'function') {
            raw.resume().then(() => {
              console.log('[IMORIA AUDIO] rawContext.resume() ok — retrying Tone.start()');
              this.unlocking = false;
              this.unlockAndStart({ source: (meta.source || 'unknown') + ':retry' });
            }).catch(() => {});
          }
        } catch {}
        this.muted = true;
        this.emit('sound:state', { unlocked: this.unlocked, muted: this.muted });
        this.showEnableOverlay('Click to enable sound (blocked).');
        if (this.unlockWatchdogTimer) {
          clearTimeout(this.unlockWatchdogTimer);
          this.unlockWatchdogTimer = null;
        }
        this.unlocking = false;
      });
    }

    toScene(sceneName, fadeSec = 4) {
      if (!this.initialized) {
        // Keep desired target; engine will apply once unlocked.
        this.targetScene = sceneName;
        return;
      }
      this.targetScene = sceneName;
      if (!this.started) return;
      this.applySceneTransition(sceneName, fadeSec);
    }

    sceneGainTargets(sceneName) {
      if (this.muted) return { landing: 0, onboarding: 0, void: 0 };
      if (sceneName === 'landing') return { landing: 0.84, onboarding: 0.06, void: 0 };
      if (sceneName === 'onboarding') return { landing: 0.2, onboarding: 0.74, void: 0 };
      if (sceneName === 'void') return { landing: 0.04, onboarding: 0.34, void: 0.84 };
      return { landing: 0, onboarding: 0, void: 0 };
    }

    applySceneTransition(sceneName, fadeSec = 4) {
      if (!this.initialized || this.currentScene === sceneName) return;
      const now = windowObj.Tone.now();
      const prevScene = this.currentScene;
      this.currentScene = sceneName;
      if (this._transitionTimer) {
        clearTimeout(this._transitionTimer);
        this._transitionTimer = null;
      }

      if (sceneName === 'landing') {
        this.landing.start();
        this.onboarding.stop();
        this.voidScene.stop();
      } else if (sceneName === 'onboarding') {
        this.landing.start();
        this.onboarding.start();
        this.voidScene.stop();
        if (prevScene === 'landing' && typeof this.onboarding.enterFromLanding === 'function') {
          this.onboarding.enterFromLanding();
        }
      } else if (sceneName === 'void') {
        this.onboarding.start();
        this.voidScene.start();
        if ((prevScene === 'landing' || prevScene === 'onboarding') && typeof this.voidScene.enterFromOnboarding === 'function') {
          this.voidScene.enterFromOnboarding();
        }
      } else {
        this.landing.stop();
        this.onboarding.stop();
        this.voidScene.stop();
      }

      const targets = this.sceneGainTargets(sceneName);
      this.landing.bus.gain.cancelScheduledValues(now);
      this.onboarding.bus.gain.cancelScheduledValues(now);
      this.voidScene.bus.gain.cancelScheduledValues(now);
      this.landing.bus.gain.rampTo(targets.landing, fadeSec + (sceneName === 'onboarding' ? 0.8 : 0));
      this.onboarding.bus.gain.rampTo(targets.onboarding, fadeSec + (sceneName === 'onboarding' ? 1.2 : 0.5));
      this.voidScene.bus.gain.rampTo(targets.void, fadeSec + (sceneName === 'void' ? 0.9 : 0.4));

      if (sceneName === 'void') {
        this._transitionTimer = setTimeout(() => {
          this.landing.stop();
          this.onboarding.stop();
        }, Math.max(2500, (fadeSec + 1.2) * 1000));
      }
    }

    setMuted(muted) {
      this.muted = !!muted;
      this.emit('sound:state', { unlocked: this.unlocked, muted: this.muted });
      if (!this.initialized) return;
      const now = windowObj.Tone.now();
      const targets = this.sceneGainTargets(this.currentScene);
      this.landing.bus.gain.cancelScheduledValues(now);
      this.onboarding.bus.gain.cancelScheduledValues(now);
      this.voidScene.bus.gain.cancelScheduledValues(now);
      this.landing.bus.gain.rampTo(targets.landing, 0.4);
      this.onboarding.bus.gain.rampTo(targets.onboarding, 0.4);
      this.voidScene.bus.gain.rampTo(targets.void, 0.4);
      this.updateMuteButton();
    }

    toggleMute() {
      this.setMuted(!this.muted);
    }

    applyLandingIntensity(value) {
      if (!this.initialized) return;
      this.landing.setIntensity(value);
    }

    applyOnboardingLift(value) {
      if (!this.initialized) return;
      this.onboarding.setLift(value);
    }

    applyVoidReactivity(values) {
      if (!this.initialized) return;
      this.voidScene.setReactivity(values);
    }

    setMemoryMode(mode) {
      this.currentMemoryMode = mode || 'raw';
      if (!this.initialized) return;
      this.voidScene.setMemoryMode(this.currentMemoryMode);
    }

    triggerVoidAccent(level) {
      if (!this.initialized || this.currentScene !== 'void' || this.muted) return;
      this.voidScene.accent(level);
    }

    triggerInteractionChime(level = 0.45) {
      if (!this.initialized || this.currentScene !== 'void' || this.muted) return;
      if (typeof this.voidScene.playUiChime === 'function') {
        this.voidScene.playUiChime(level);
      }
    }

    triggerModeSwitchChime(mode) {
      if (!this.initialized || this.currentScene !== 'void' || this.muted) return;
      if (typeof this.voidScene.playModeSwitchChime === 'function') {
        this.voidScene.playModeSwitchChime(mode);
      } else {
        this.triggerInteractionChime(0.7);
      }
    }

    playMergeSound() {
      if (!this.initialized || this.muted) return;
      this.triggerInteractionChime(0.85);
      this.voidScene.playMergeSound();
    }

    getEyePulseBoost() {
      const now = performance.now();
      if (now > this.eyePulseUntil) return 0;
      return this.eyePulseBoost * Math.max(0, (this.eyePulseUntil - now) / 900);
    }

    on(name, fn) {
      const list = this.listeners.get(name) || [];
      list.push(fn);
      this.listeners.set(name, list);
    }

    emit(name, payload) {
      const list = this.listeners.get(name) || [];
      list.forEach((fn) => fn(payload));
    }

    createMuteButton() {
      if (this.uiBtn) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'audioMuteToggle';
      btn.setAttribute('aria-label', 'Toggle sound');
      Object.assign(btn.style, {
        position: 'fixed',
        bottom: '18px',
        right: '18px',
        zIndex: '12000',
        border: '1px solid rgba(170,190,255,0.45)',
        background: 'rgba(6,10,25,0.68)',
        color: 'rgba(220,230,255,0.92)',
        font: '500 11px Inter, sans-serif',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        borderRadius: '999px',
        padding: '8px 12px',
        cursor: 'pointer',
        backdropFilter: 'blur(4px)'
      });
      btn.addEventListener('click', () => this.toggleMute());
      document.body.appendChild(btn);
      this.uiBtn = btn;
      this.updateMuteButton();
    }

    updateMuteButton() {
      if (!this.uiBtn) return;
      this.uiBtn.textContent = this.muted ? 'sound off' : 'sound on';
    }
  }

  windowObj.imoriaAudioManager = new ImoriaAudioManager();
})(window);
