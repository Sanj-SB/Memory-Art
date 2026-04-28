// Hooks existing state/events to drive the audio layer.
(function attachImoriaAudioReactivity(windowObj) {
  if (windowObj.imoriaAudioReactivity) return;

  class ImoriaAudioReactivity {
    constructor() {
      this.prevCamZ = 0;
      this.prevRotX = 0;
      this.prevRotY = 0;
      this.lastInteractionAt = performance.now();
      this.lastAccentAt = 0;
      this.lastUiChimeAt = 0;
      this.bound = false;
    }

    bind() {
      if (this.bound) return;
      this.bound = true;
      const unlockIds = ['closeIntroBtn', 'skipToVoidBtn', 'addMemorySubmitBtn', 'enableGesturesBtn'];
      unlockIds.forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('click', () => {
          this.noteInteraction(0.6);
          if (windowObj.imoriaAudioManager) windowObj.imoriaAudioManager.unlockAndStart({ source: `btn:${id}` });
        }, { passive: true });
      });
      document.addEventListener('click', (ev) => {
        const manager = windowObj.imoriaAudioManager;
        if (!manager || manager.currentScene !== 'void') return;
        const target = ev && ev.target;
        if (!target || !target.closest) return;
        if (target.closest('button')) {
          const now = performance.now();
          if (now - this.lastUiChimeAt > 180) {
            manager.triggerInteractionChime(0.5);
            this.lastUiChimeAt = now;
          }
        }
      }, { passive: true });
    }

    noteInteraction(strength = 0.3) {
      this.lastInteractionAt = performance.now();
      const manager = windowObj.imoriaAudioManager;
      if (!manager || manager.currentScene !== 'void') return;
      const now = performance.now();
      if (now - this.lastAccentAt > 320) {
        manager.triggerVoidAccent(strength);
        this.lastAccentAt = now;
      }
      if (now - this.lastUiChimeAt > 260) {
        manager.triggerInteractionChime(Math.min(0.8, 0.35 + strength * 0.7));
        this.lastUiChimeAt = now;
      }
    }

    isIdle() {
      return performance.now() - this.lastInteractionAt > 8000;
    }

    updateFrame(state) {
      const manager = windowObj.imoriaAudioManager;
      if (!manager) return;
      // If audio isn't unlocked yet, show the overlay and stop here.
      if (!manager.unlocked) {
        if (typeof manager.showEnableOverlay === 'function') {
          manager.showEnableOverlay('Click to enable sound.');
        }
        return;
      }
      if (!manager.initialized) return;

      const now = performance.now();
      if (state.appState === APP_STATE.VOID && !state.introPopupDismissed) {
        manager.toScene('landing', 4.4);
      } else if (
        state.appState === APP_STATE.INTERACT ||
        state.appState === APP_STATE.FINAL
      ) {
        manager.toScene('void', 5.6);
      } else {
        manager.toScene('onboarding', 5.2);
      }

      const zoomDelta = Math.abs((state.camZ || 0) - this.prevCamZ);
      const rotDelta = Math.hypot((state.rotX || 0) - this.prevRotX, (state.rotY || 0) - this.prevRotY);
      const zoomNorm = Math.max(0, Math.min(1, ((state.camZ || 0) + 400) / 1200));
      const rotationSpeed = Math.max(0, Math.min(1, rotDelta * 16));
      const activePulse = Math.max(0, Math.min(1, zoomDelta * 0.013 + rotationSpeed * 0.72 + (state.isDragging ? 0.14 : 0)));
      if (activePulse > 0.06) this.lastInteractionAt = now;
      const idleMs = now - this.lastInteractionAt;
      const idleBlend = Math.max(0, Math.min(1, (idleMs - 1800) / 8200));
      const activity = Math.max(0, Math.min(1, activePulse * 0.8 + (1 - idleBlend) * 0.16));

      manager.applyLandingIntensity(0.18 + activePulse * 0.28);
      manager.applyOnboardingLift(0.2 + zoomNorm * 0.24 + (1 - idleBlend) * 0.18);
      manager.applyVoidReactivity({ zoomNorm, rotationSpeed, activity, idleBlend });

      this.prevCamZ = state.camZ || 0;
      this.prevRotX = state.rotX || 0;
      this.prevRotY = state.rotY || 0;
    }
  }

  windowObj.imoriaAudioReactivity = new ImoriaAudioReactivity();
})(window);
