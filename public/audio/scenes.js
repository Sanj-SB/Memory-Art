// Tone scene builders: eerie landing, open-field onboarding, and chime-based void.
(function attachImoriaScenes(windowObj) {
  function clamp01(v) {
    return Math.max(0, Math.min(1, v || 0));
  }

  function randomOf(list) {
    return list[(Math.random() * list.length) | 0];
  }

  function safeGenerate(node) {
    if (node && typeof node.generate === 'function') node.generate().catch(() => {});
  }

  function createLandingScene(Tone, destination) {
    const bus = new Tone.Gain(0).connect(destination);
    const reverb = new Tone.Reverb({ decay: 22, wet: 0.82, preDelay: 0.1 }).connect(bus);
    safeGenerate(reverb);
    const shimmerDelay = new Tone.FeedbackDelay({ delayTime: 0.42, feedback: 0.24, wet: 0.18 }).connect(reverb);
    const dry = new Tone.Gain(0.24).connect(bus);

    const droneFilter = new Tone.Filter(620, 'lowpass').connect(dry);
    const drone = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 4.8, decay: 1.4, sustain: 0.82, release: 7.2 },
      volume: -22
    }).connect(droneFilter);
    drone.connect(reverb);

    const padFilter = new Tone.Filter(1900, 'lowpass').connect(shimmerDelay);
    const padPan = new Tone.AutoPanner({ frequency: 0.008, depth: 0.22 }).connect(padFilter).start();
    const pad = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'fatsine', count: 3, spread: 18 },
      envelope: { attack: 5.5, decay: 1.8, sustain: 0.66, release: 8.5 },
      volume: -26
    }).connect(padPan);
    pad.connect(dry);

    const reverseFilter = new Tone.Filter(780, 'bandpass').connect(reverb);
    const reversePan = new Tone.Panner(0.18).connect(reverseFilter);
    const reverseSynth = new Tone.NoiseSynth({
      noise: { type: 'pink' },
      envelope: { attack: 1.8, decay: 0.2, sustain: 0.0, release: 3.8 },
      volume: -31
    }).connect(reversePan);

    const pulseFilter = new Tone.Filter(460, 'lowpass').connect(reverb);
    const pulse = new Tone.AMSynth({
      harmonicity: 0.5,
      oscillator: { type: 'sine' },
      modulation: { type: 'triangle' },
      envelope: { attack: 0.9, decay: 1.8, sustain: 0.0, release: 4.2 },
      modulationEnvelope: { attack: 0.1, decay: 0.8, sustain: 0.0, release: 2.4 },
      volume: -28
    }).connect(pulseFilter);

    const resonance = new Tone.FMSynth({
      harmonicity: 1.7,
      modulationIndex: 3.2,
      oscillator: { type: 'sine' },
      modulation: { type: 'triangle' },
      envelope: { attack: 0.02, decay: 0.9, sustain: 0.0, release: 4.8 },
      modulationEnvelope: { attack: 0.02, decay: 0.5, sustain: 0.0, release: 2.8 },
      volume: -30
    }).fan(reverb, dry);

    const windFilter = new Tone.Filter(1500, 'bandpass').connect(reverb);
    const windPan = new Tone.AutoPanner({ frequency: 0.011, depth: 0.28 }).connect(windFilter).start();
    const wind = new Tone.Noise('pink').connect(windPan).start();
    wind.volume.value = -46;

    let loopsStarted = false;
    let droneLoopId = null;
    let textureLoopId = null;
    let movementLoopId = null;
    let currentIntensity = 0.18;

    const droneChords = [
      ['C2', 'G2', 'D3'],
      ['Bb1', 'F2', 'C3'],
      ['Ab1', 'Eb2', 'Bb2'],
      ['F1', 'C2', 'G2']
    ];
    const padChords = [
      ['G4', 'Bb4', 'D5'],
      ['F4', 'Ab4', 'C5'],
      ['Eb4', 'G4', 'Bb4'],
      ['D4', 'F4', 'A4']
    ];
    const resonanceNotes = ['D5', 'F5', 'G5', 'Bb5', 'C6'];

    const scene = {
      bus,
      start() {
        if (loopsStarted) return;
        loopsStarted = true;
        if (droneLoopId == null) {
          droneLoopId = Tone.Transport.scheduleRepeat((time) => {
            const chord = randomOf(droneChords);
            drone.triggerAttackRelease(chord, 18, time, 0.16 + currentIntensity * 0.05);
            pad.triggerAttackRelease(randomOf(padChords), 14, time + 0.8, 0.11 + currentIntensity * 0.05);
            if (windowObj.imoriaAudioManager) windowObj.imoriaAudioManager.emit('landing:drone-hit');
          }, '2m', '0:0:0');
        }
        if (textureLoopId == null) {
          textureLoopId = Tone.Transport.scheduleRepeat((time) => {
            reversePan.pan.setValueAtTime(Math.random() * 0.8 - 0.4, time);
            if (Math.random() < 0.82) reverseSynth.triggerAttackRelease('2.8', time + Math.random() * 0.7, 0.08 + currentIntensity * 0.03);
            if (Math.random() < 0.42) {
              pulse.triggerAttackRelease('C2', '2n', time + 0.28, 0.09 + currentIntensity * 0.05);
            }
            if (Math.random() < 0.28) {
              resonance.triggerAttackRelease(randomOf(resonanceNotes), '8n', time + 0.15 + Math.random() * 0.4, 0.08 + currentIntensity * 0.05);
            }
          }, '1m');
        }
        if (movementLoopId == null) {
          movementLoopId = Tone.Transport.scheduleRepeat((time) => {
            const mod = 0.8 + Math.random() * 0.6;
            droneFilter.frequency.setValueAtTime(520 + mod * 180 + currentIntensity * 90, time);
            padFilter.frequency.setValueAtTime(1500 + mod * 420 + currentIntensity * 210, time);
            reverb.wet.setValueAtTime(0.68 + mod * 0.08, time);
            shimmerDelay.feedback.setValueAtTime(0.18 + mod * 0.08, time);
          }, '3m');
        }
      },
      stop() {
        [droneLoopId, textureLoopId, movementLoopId].forEach((id) => { if (id != null) Tone.Transport.clear(id); });
        droneLoopId = null;
        textureLoopId = null;
        movementLoopId = null;
        loopsStarted = false;
        drone.releaseAll();
        pad.releaseAll();
      },
      setIntensity(v) {
        currentIntensity = clamp01(v);
        droneFilter.frequency.rampTo(460 + currentIntensity * 320, 2.2);
        padFilter.frequency.rampTo(1300 + currentIntensity * 900, 2.8);
        pulseFilter.frequency.rampTo(320 + currentIntensity * 240, 1.8);
        windFilter.frequency.rampTo(1200 + currentIntensity * 720, 2.6);
        wind.volume.rampTo(-46 + currentIntensity * 7, 2.4);
        padPan.depth.rampTo(0.18 + currentIntensity * 0.16, 2.6);
        windPan.depth.rampTo(0.22 + currentIntensity * 0.12, 2.4);
        reverb.wet.rampTo(0.78 + currentIntensity * 0.16, 2.2);
      },
      prime() {
        const now = Tone.now() + 0.06;
        drone.triggerAttackRelease(['C2', 'G2', 'D3'], 10, now, 0.24);
        pad.triggerAttackRelease(['G4', 'Bb4', 'D5'], 8, now + 0.4, 0.14);
      },
      dispose() {
        scene.stop();
        [wind, drone, pad, reverseSynth, pulse, resonance, droneFilter, padFilter, padPan, reverseFilter, reversePan, pulseFilter, windFilter, windPan, shimmerDelay, reverb, dry, bus].forEach((n) => n.dispose());
      }
    };

    return scene;
  }

  function createOnboardingScene(Tone, destination) {
    const bus = new Tone.Gain(0).connect(destination);
    const reverb = new Tone.Reverb({ decay: 13, wet: 0.54, preDelay: 0.02 }).connect(bus);
    safeGenerate(reverb);
    const stereoDelay = new Tone.PingPongDelay({ delayTime: '8n', feedback: 0.14, wet: 0.13 }).connect(reverb);
    const dry = new Tone.Gain(0.34).connect(bus);
    const oceanBed = new Tone.Player({
      url: 'assets/audio/ocean-wind-bed.mp3',
      loop: true,
      autostart: false,
      fadeIn: 2.4,
      fadeOut: 2.4,
      volume: -6
    }).connect(reverb);

    const breezeFilter = new Tone.Filter(1200, 'bandpass').connect(reverb);
    const breezePan = new Tone.AutoPanner({ frequency: 0.014, depth: 0.26 }).connect(breezeFilter).start();
    const breeze = new Tone.Noise('pink').connect(breezePan).start();
    breeze.volume.value = -38;

    const padFilter = new Tone.Filter(2800, 'lowpass').connect(stereoDelay);
    const pad = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'fatsine', count: 4, spread: 22 },
      envelope: { attack: 3.5, decay: 1.6, sustain: 0.72, release: 7.5 },
      volume: -22
    }).connect(padFilter);
    pad.connect(dry);

    const warmth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 2.2, decay: 1.2, sustain: 0.5, release: 5.4 },
      volume: -24
    }).fan(reverb, dry);

    const chime = new Tone.MetalSynth({
      frequency: 510,
      envelope: { attack: 0.002, decay: 1.1, release: 0.2 },
      harmonicity: 4.2,
      modulationIndex: 10,
      resonance: 3000,
      octaves: 1.5,
      volume: -28
    }).fan(reverb, dry);

    const chords = [
      ['C4', 'E4', 'G4', 'B4'],
      ['A3', 'C4', 'E4', 'G4'],
      ['F3', 'A3', 'C4', 'E4'],
      ['G3', 'B3', 'D4', 'A4']
    ];
    const warmthChords = [
      ['C3', 'G3', 'E4'],
      ['A2', 'E3', 'C4'],
      ['F2', 'C3', 'A3'],
      ['G2', 'D3', 'B3']
    ];

    let loopsStarted = false;
    let bedStarted = false;
    let padLoopId = null;
    let airLoopId = null;
    let detailLoopId = null;
    let currentLift = 0.24;

    const scene = {
      bus,
      start() {
        if (loopsStarted) return;
        loopsStarted = true;
        if (!bedStarted) {
          try {
            oceanBed.start();
            bedStarted = true;
          } catch {}
        }
        if (padLoopId == null) {
          padLoopId = Tone.Transport.scheduleRepeat((time) => {
            pad.triggerAttackRelease(randomOf(chords), 12, time, 0.18 + currentLift * 0.05);
            warmth.triggerAttackRelease(randomOf(warmthChords), 10, time + 0.35, 0.12 + currentLift * 0.05);
          }, '2m');
        }
        if (airLoopId == null) {
          airLoopId = Tone.Transport.scheduleRepeat((time) => {
            breezePan.frequency.setValueAtTime(0.01 + Math.random() * 0.02, time);
            stereoDelay.delayTime.setValueAtTime(0.28 + Math.random() * 0.14, time);
          }, '2m');
        }
        if (detailLoopId == null) {
          detailLoopId = Tone.Transport.scheduleRepeat((time) => {
            if (Math.random() < 0.34) {
              chime.frequency.setValueAtTime(420 + Math.random() * 320, time);
              chime.triggerAttackRelease('32n', time + Math.random() * 0.35, 0.1 + currentLift * 0.06);
            }
          }, '1m');
        }
      },
      stop() {
        [padLoopId, airLoopId, detailLoopId].forEach((id) => { if (id != null) Tone.Transport.clear(id); });
        padLoopId = null;
        airLoopId = null;
        detailLoopId = null;
        loopsStarted = false;
        pad.releaseAll();
        warmth.releaseAll();
        if (bedStarted) {
          try { oceanBed.stop(); } catch {}
          bedStarted = false;
        }
      },
      setLift(v) {
        currentLift = clamp01(v);
        padFilter.frequency.rampTo(2200 + currentLift * 1900, 2.8);
        breezeFilter.frequency.rampTo(950 + currentLift * 900, 2.4);
        breeze.volume.rampTo(-42 + currentLift * 8, 2.4);
        reverb.wet.rampTo(0.48 + currentLift * 0.12, 2.1);
        stereoDelay.wet.rampTo(0.1 + currentLift * 0.08, 2.0);
        if (oceanBed && oceanBed.volume) oceanBed.volume.rampTo(-8 + currentLift * 4, 2.4);
      },
      enterFromLanding() {
        const now = Tone.now() + 0.25;
        warmth.triggerAttackRelease(['C4', 'G4', 'B4'], 7, now, 0.18);
      },
      prime() {
        const now = Tone.now() + 0.08;
        pad.triggerAttackRelease(['C4', 'E4', 'G4', 'B4'], 8, now, 0.14);
      },
      dispose() {
        scene.stop();
        [oceanBed, breeze, pad, warmth, chime, breezeFilter, breezePan, padFilter, stereoDelay, reverb, dry, bus].forEach((n) => n.dispose());
      }
    };

    return scene;
  }

  function createVoidScene(Tone, destination) {
    const bus = new Tone.Gain(0).connect(destination);
    const reverb = new Tone.Reverb({ decay: 20, wet: 0.72, preDelay: 0.05 }).connect(bus);
    safeGenerate(reverb);
    const delay = new Tone.PingPongDelay({ delayTime: 0.36, feedback: 0.22, wet: 0.24 }).connect(reverb);
    const dry = new Tone.Gain(0.38).connect(bus);

    const airFilter = new Tone.Filter(2200, 'bandpass').connect(reverb);
    const airPan = new Tone.AutoPanner({ frequency: 0.01, depth: 0.34 }).connect(airFilter).start();
    const air = new Tone.Noise('white').connect(airPan).start();
    air.volume.value = -40;

    const chimeFilter = new Tone.Filter(3600, 'lowpass').connect(delay);
    const chimePan = new Tone.Panner(0).connect(chimeFilter);
    const chime = new Tone.FMSynth({
      harmonicity: 2.7,
      modulationIndex: 8,
      oscillator: { type: 'sine' },
      modulation: { type: 'triangle' },
      envelope: { attack: 0.005, decay: 1.3, sustain: 0.0, release: 6.2 },
      modulationEnvelope: { attack: 0.005, decay: 0.38, sustain: 0.0, release: 2.4 },
      volume: -18
    }).connect(chimePan);
    chimeFilter.connect(dry);

    const shimmer = new Tone.MetalSynth({
      frequency: 560,
      envelope: { attack: 0.001, decay: 0.9, release: 0.15 },
      harmonicity: 5.6,
      modulationIndex: 15,
      resonance: 4200,
      octaves: 1.6,
      volume: -34
    }).fan(reverb, dry);

    const mergeA = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.02, decay: 0.5, sustain: 0.18, release: 2.6 },
      volume: -18
    }).fan(reverb, dry);
    const mergeB = new Tone.Synth({
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.02, decay: 0.5, sustain: 0.18, release: 2.6 },
      volume: -20
    }).fan(reverb, dry);
    const mergeBloom = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'fatsine', count: 3, spread: 14 },
      envelope: { attack: 0.03, decay: 1.2, sustain: 0.0, release: 4.2 },
      volume: -24
    }).fan(reverb, dry);
    const uiChimeVoices = Array.from({ length: 3 }).map(() => new Tone.Player({
      url: 'assets/audio/interaction-chime.mp3',
      loop: false,
      autostart: false,
      fadeIn: 0.01,
      fadeOut: 0.35,
      volume: -9
    }).fan(reverb, dry));
    let uiVoiceIdx = 0;
    let lastUiSampleAt = 0;
    let movementEnergy = 0;

    let loopsStarted = false;
    let chimeLoopId = null;
    let ambienceLoopId = null;
    let motionLoopId = null;
    let nextShimmerAt = 0;
    let accentStrength = 0.18;
    let modeName = 'raw';
    let modeConfig = {
      density: 0.22,
      brightness: 0.5,
      metallic: 0.68,
      stereoWidth: 0.32,
      delayWet: 0.2,
      reverbWet: 0.7,
      windLevel: 0.34,
      motifChance: 0.05,
      clusterChance: 0.12,
      scale: ['C5', 'G5', 'Bb5', 'D6', 'F6']
    };
    let motifIndex = 0;
    const motifs = [
      ['E5', 'G5', 'B5'],
      ['D5', 'F5', 'A5'],
      ['C5', 'E5', 'G5']
    ];
    const modePresets = {
      raw: {
        density: 0.18,
        brightness: 0.48,
        metallic: 0.78,
        stereoWidth: 0.28,
        delayWet: 0.22,
        reverbWet: 0.72,
        windLevel: 0.42,
        motifChance: 0.02,
        clusterChance: 0.14,
        scale: ['C5', 'Eb5', 'G5', 'Bb5', 'D6', 'F6']
      },
      recall: {
        density: 0.19,
        brightness: 0.54,
        metallic: 0.38,
        stereoWidth: 0.42,
        delayWet: 0.18,
        reverbWet: 0.66,
        windLevel: 0.28,
        motifChance: 0.18,
        clusterChance: 0.20,
        scale: ['C5', 'E5', 'G5', 'A5', 'B5', 'D6', 'E6']
      },
      collective: {
        density: 0.26,
        brightness: 0.62,
        metallic: 0.3,
        stereoWidth: 0.6,
        delayWet: 0.28,
        reverbWet: 0.78,
        windLevel: 0.42,
        motifChance: 0.1,
        clusterChance: 0.26,
        scale: ['C5', 'E5', 'G5', 'B5', 'D6', 'E6', 'G6', 'B6']
      }
    };

    function applyModeToNodes(rampSec) {
      chime.harmonicity.rampTo(2.2 + (1 - modeConfig.metallic) * 1.4, rampSec);
      chime.modulationIndex.rampTo(5.5 + modeConfig.metallic * 7, rampSec);
      chimeFilter.frequency.rampTo(2500 + modeConfig.brightness * 3600, rampSec);
      airFilter.frequency.rampTo(1700 + modeConfig.windLevel * 1800, rampSec);
      delay.wet.rampTo(modeConfig.delayWet, rampSec + 0.4);
      reverb.wet.rampTo(modeConfig.reverbWet, rampSec + 0.5);
      airPan.depth.rampTo(0.25 + modeConfig.stereoWidth * 0.42, rampSec);
      air.volume.rampTo(-52 + modeConfig.windLevel * 12, rampSec + 0.5);
    }

    function fireChime(time, note, velocity, pan) {
      chimePan.pan.setValueAtTime(pan, time);
      const recallVelocityScale = modeName === 'recall' ? 0.65 : 1;
      const v = velocity * recallVelocityScale;
      chime.triggerAttackRelease(note, '16n', time, v);
      const shimmerBaseProb = 0.22 + modeConfig.metallic * 0.34;
      const shimmerProb = modeName === 'collective'
        ? shimmerBaseProb * 0.55
        : (modeName === 'recall' ? shimmerBaseProb * 0.7 : shimmerBaseProb);
      if (Math.random() < shimmerProb && time >= nextShimmerAt) {
        shimmer.frequency.setValueAtTime(430 + Math.random() * 420, time + 0.01);
        try {
          shimmer.triggerAttackRelease('64n', time + 0.01, v * 0.32);
          nextShimmerAt = time + 0.24;
        } catch (e) {
          // MetalSynth is monophonic and can throw on overlapping starts.
          // Skip this strike rather than aborting the whole audio startup chain.
          console.warn('[IMORIA AUDIO] shimmer overlap skipped:', e && e.message ? e.message : e);
          nextShimmerAt = time + 0.12;
        }
      }
    }

    function movementNote() {
      const idx = Math.min(modeConfig.scale.length - 1, Math.floor(movementEnergy * (modeConfig.scale.length - 1)));
      return modeConfig.scale[idx] || randomOf(modeConfig.scale);
    }

    function playInteractionSample(level) {
      const now = Tone.now() + 0.01;
      if (now - lastUiSampleAt < 0.08) return;
      lastUiSampleAt = now;
      const voice = uiChimeVoices[uiVoiceIdx % uiChimeVoices.length];
      uiVoiceIdx += 1;
      if (!voice) return;
      try {
        const strength = clamp01(level || 0.5);
        const movementRateBump = movementEnergy * 0.12;
        if (modeName === 'raw') {
          voice.playbackRate = 0.82 + Math.random() * 0.16 + movementRateBump * 0.6;
          if (voice.volume) voice.volume.value = -12 + strength * 7;
        } else if (modeName === 'recall') {
          voice.playbackRate = 0.95 + Math.random() * 0.12 + movementRateBump * 0.8;
          // Boost the "second sound" in recall so it stands out over the wind chime layer.
          if (voice.volume) voice.volume.value = -6.5 + strength * 7.5;
        } else {
          voice.playbackRate = 1.02 + Math.random() * 0.26 + movementRateBump;
          if (voice.volume) voice.volume.value = -8 + strength * 8;
        }
        voice.start(now);
      } catch {}
    }

    const scene = {
      bus,
      start() {
        if (loopsStarted) return;
        loopsStarted = true;
        applyModeToNodes(0.1);
        if (chimeLoopId == null) {
          chimeLoopId = Tone.Transport.scheduleRepeat((time) => {
            const density = Math.max(0.1, modeConfig.density + accentStrength * 0.22);
            if (Math.random() > density) return;
            const notePool = modeConfig.scale;
            const isMotif = Math.random() < modeConfig.motifChance;
            const notes = isMotif
              ? motifs[motifIndex++ % motifs.length]
              : [randomOf(notePool)];
            const count = Math.random() < modeConfig.clusterChance ? Math.min(3, notes.length + 1) : notes.length;
            for (let i = 0; i < count; i += 1) {
              const note = notes[i] || randomOf(notePool);
              const t = time + i * (0.09 + Math.random() * 0.08);
              const pan = (Math.random() * 2 - 1) * modeConfig.stereoWidth;
              const velocity = 0.15 + modeConfig.brightness * 0.12 + Math.random() * 0.05;
              fireChime(t, note, velocity, pan);
            }
          }, '2n');
        }
        if (ambienceLoopId == null) {
          ambienceLoopId = Tone.Transport.scheduleRepeat((time) => {
            const ambProb = modeName === 'collective'
              ? 0.28
              : (modeName === 'recall' ? 0.35 : 0.42);
            if (Math.random() < ambProb) {
              const note = randomOf(modeConfig.scale);
              fireChime(time + Math.random() * 0.3, note, 0.13 + accentStrength * 0.05, (Math.random() * 2 - 1) * modeConfig.stereoWidth * 0.75);
            }
          }, '3m');
        }
        if (motionLoopId == null) {
          motionLoopId = Tone.Transport.scheduleRepeat((time) => {
            airPan.frequency.setValueAtTime(0.008 + Math.random() * 0.024, time);
            delay.delayTime.setValueAtTime(0.28 + Math.random() * 0.18, time);
          }, '2m');
        }
      },
      stop() {
        [chimeLoopId, ambienceLoopId, motionLoopId].forEach((id) => { if (id != null) Tone.Transport.clear(id); });
        chimeLoopId = null;
        ambienceLoopId = null;
        motionLoopId = null;
        loopsStarted = false;
        mergeBloom.releaseAll();
      },
      enterFromOnboarding() {
        const now = Tone.now() + 0.15;
        fireChime(now, 'E6', 0.2, -0.12);
        fireChime(now + 0.2, 'B5', 0.16, 0.15);
      },
      prime() {
        const now = Tone.now() + 0.08;
        fireChime(now, 'G5', 0.18, -0.08);
        fireChime(now + 0.18, 'D6', 0.14, 0.1);
      },
      setMemoryMode(mode) {
        modeName = modePresets[mode] ? mode : 'raw';
        modeConfig = { ...modeConfig, ...modePresets[modeName] };
        applyModeToNodes(3.2);
      },
      setReactivity(values) {
        const zoomNorm = clamp01(values.zoomNorm);
        const rotSpeed = clamp01(values.rotationSpeed);
        const activity = clamp01(values.activity);
        const idleBlend = clamp01(values.idleBlend);
        movementEnergy = clamp01(zoomNorm * 0.45 + rotSpeed * 0.4 + activity * 0.35 - idleBlend * 0.2);
        accentStrength = clamp01(activity * 0.7 + rotSpeed * 0.28 + zoomNorm * 0.18 - idleBlend * 0.3);
        chimeFilter.frequency.rampTo(2300 + modeConfig.brightness * 2800 + zoomNorm * 1200, 1.2);
        airFilter.frequency.rampTo(1600 + modeConfig.windLevel * 1400 + activity * 600, 1.5);
        delay.feedback.rampTo(0.16 + idleBlend * 0.12 + modeConfig.stereoWidth * 0.08, 1.3);
        dry.gain.rampTo(0.32 + zoomNorm * 0.2, 0.9);
        delay.wet.rampTo(modeConfig.delayWet + zoomNorm * 0.08, 1.1);
        reverb.wet.rampTo(Math.min(0.92, modeConfig.reverbWet + zoomNorm * 0.06), 1.1);
        reverb.decay = 16 + modeConfig.reverbWet * 8 + idleBlend * 3;
      },
      accent(level) {
        const now = Tone.now();
        const strength = clamp01(level);
        const note = movementEnergy > 0.18 ? movementNote() : randomOf(modeConfig.scale);
        fireChime(now, note, 0.12 + strength * 0.08, (Math.random() * 2 - 1) * modeConfig.stereoWidth);
        playInteractionSample(0.35 + strength * 0.5);
      },
      playUiChime(level) {
        const now = Tone.now() + 0.01;
        const strength = clamp01(level || 0.45);
        const note = movementEnergy > 0.12 ? movementNote() : randomOf(modeConfig.scale);
        fireChime(now, note, 0.16 + strength * 0.1, (Math.random() * 2 - 1) * modeConfig.stereoWidth * 0.7);
        playInteractionSample(0.5 + strength * 0.4);
      },
      playModeSwitchChime(mode) {
        const now = Tone.now();
        const targetMode = modePresets[mode] ? mode : modeName;
        const modeScale = modePresets[targetMode].scale || modeConfig.scale;
        // Add a clear pocket around mode-switch cue so it stands apart.
        // pre-pause: duck ambience before cue; post-pause: recover slowly after cue.
        const cueStart = now + 0.2;
        const cueDur = targetMode === 'collective' ? 0.7 : 0.56;
        const recoverAt = cueStart + cueDur + 0.22;
        dry.gain.cancelScheduledValues(now);
        dry.gain.setValueAtTime(dry.gain.value, now);
        dry.gain.linearRampToValueAtTime(0.18, cueStart - 0.06);
        dry.gain.linearRampToValueAtTime(0.14, cueStart + 0.08);
        dry.gain.linearRampToValueAtTime(0.34, recoverAt + 0.4);

        const seq = targetMode === 'raw'
          ? [modeScale[0], modeScale[0], modeScale[2]]
          : targetMode === 'recall'
            ? [modeScale[1], modeScale[3], modeScale[4], modeScale[3]]
            : [modeScale[2], modeScale[4], modeScale[6] || modeScale[5], modeScale[4]];
        const step = targetMode === 'raw' ? 0.19 : (targetMode === 'recall' ? 0.15 : 0.12);
        const baseVel = targetMode === 'raw' ? 0.16 : (targetMode === 'recall' ? 0.2 : 0.24);
        const panSpread = targetMode === 'raw' ? 0.08 : (targetMode === 'recall' ? 0.14 : 0.22);
        for (let i = 0; i < seq.length; i += 1) {
          const n = seq[i] || randomOf(modeScale);
          fireChime(cueStart + i * step, n, baseVel + i * 0.015, (i - 1.5) * panSpread);
        }
        // Use stronger, mode-colored interaction sample to differentiate modes.
        const sampleLevel = targetMode === 'raw' ? 0.62 : (targetMode === 'recall' ? 0.8 : 0.98);
        playInteractionSample(sampleLevel);
      },
      playMergeSound() {
        const now = Tone.now() + 0.02;
        const base = modeName === 'collective' ? 'E5' : 'D5';
        const upper = modeName === 'collective' ? 'B5' : 'A5';
        mergeA.frequency.cancelScheduledValues(now);
        mergeB.frequency.cancelScheduledValues(now);
        mergeA.frequency.setValueAtTime(Tone.Frequency(base).toFrequency() * 0.94, now);
        mergeB.frequency.setValueAtTime(Tone.Frequency(upper).toFrequency() * 1.04, now);
        mergeA.frequency.linearRampToValueAtTime(Tone.Frequency('G5').toFrequency(), now + 0.5);
        mergeB.frequency.linearRampToValueAtTime(Tone.Frequency('G5').toFrequency() * 1.003, now + 0.5);
        mergeA.triggerAttackRelease(base, 1.5, now, 0.18);
        mergeB.triggerAttackRelease(upper, 1.5, now, 0.15);
        mergeBloom.triggerAttackRelease(['E5', 'G5', 'B5', 'D6'], 2.8, now + 0.34, 0.14);
        shimmer.frequency.setValueAtTime(680, now + 0.36);
        shimmer.triggerAttackRelease('16n', now + 0.36, 0.1);
        shimmer.frequency.setValueAtTime(510, now + 0.62);
        shimmer.triggerAttackRelease('32n', now + 0.62, 0.07);
        playInteractionSample(0.95);
      },
      dispose() {
        scene.stop();
        [...uiChimeVoices, air, chime, shimmer, mergeA, mergeB, mergeBloom, airFilter, airPan, chimeFilter, chimePan, delay, reverb, dry, bus].forEach((n) => n.dispose());
      }
    };

    return scene;
  }

  windowObj.ImoriaAudioScenes = { createLandingScene, createOnboardingScene, createVoidScene };
})(window);
