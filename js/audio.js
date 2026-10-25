'use strict';

/* =========================================================
   AUDIO — High-Fidelity WebAudio Synth SFX & Ambient BGM
   100% Original Procedural Synthesizer (Zero External Audio Files)
   ========================================================= */

const SFX = (function () {
  let ctx = null;
  let master = null;
  let sfxGain = null;
  let bgmGain = null;
  let sfxEnabled = true;
  let bgmEnabled = true;
  let lastHitAt = 0;
  let bgmInterval = null;
  let bgmStep = 0;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();

      // Master output
      master = ctx.createGain();
      master.gain.value = 1.0;
      master.connect(ctx.destination);

      // SFX Bus (boosted volume for punchy arcade feel)
      sfxGain = ctx.createGain();
      sfxGain.gain.value = sfxEnabled ? 0.75 : 0;
      sfxGain.connect(master);

      // BGM Bus
      bgmGain = ctx.createGain();
      bgmGain.gain.value = bgmEnabled ? 0.28 : 0;
      bgmGain.connect(master);
    }
    if (ctx.state === 'suspended') {
      ctx.resume().catch(function () {});
    }
    return ctx;
  }

  // Global unlock on ANY user interaction
  function unlock() {
    ensure();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().then(function () {
        if (bgmEnabled && !bgmInterval) startBgm();
      }).catch(function () {});
    } else if (ctx && bgmEnabled && !bgmInterval) {
      startBgm();
    }
  }

  if (typeof window !== 'undefined') {
    ['pointerdown', 'keydown', 'touchstart', 'click'].forEach(function (ev) {
      window.addEventListener(ev, unlock, { once: false, passive: true });
    });
  }

  function tone(freq, dur, type, vol, slideTo, delay) {
    if (!sfxEnabled) return;
    const c = ensure();
    if (!c) return;
    try {
      const t0 = c.currentTime + (delay || 0);
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(Math.max(20, freq), t0);
      if (slideTo) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
      }
      const peakVol = Math.max(0.001, (vol || 0.15));
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(peakVol, t0 + Math.min(0.02, dur * 0.2));
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain);
      gain.connect(sfxGain);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    } catch (e) { /* ignore */ }
  }

  function noise(dur, vol, hp, delay) {
    if (!sfxEnabled) return;
    const c = ensure();
    if (!c) return;
    try {
      const len = Math.max(1, Math.floor(c.sampleRate * dur));
      const buffer = c.createBuffer(1, len, c.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 1.4);
      }
      const src = c.createBufferSource();
      src.buffer = buffer;
      const filter = c.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = hp || 1200;
      filter.Q.value = 1.2;
      const gain = c.createGain();
      const t0 = c.currentTime + (delay || 0);
      const peakVol = Math.max(0.001, (vol || 0.18));
      gain.gain.setValueAtTime(peakVol, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(sfxGain);
      src.start(t0);
    } catch (e) { /* ignore */ }
  }

  /* --- Ambient Procedural Arpeggio BGM (Starlight Melody) --- */
  const BGM_SCALE = [
    261.63, 329.63, 392.00, 523.25, // C4, E4, G4, C5
    293.66, 349.23, 440.00, 587.33, // D4, F4, A4, D5
    329.63, 392.00, 493.88, 659.25, // E4, G4, B4, E5
    349.23, 440.00, 523.25, 698.46  // F4, A4, C5, F5
  ];

  function playBgmNote(freq, dur) {
    if (!bgmEnabled) return;
    const c = ensure();
    if (!c || c.state === 'suspended') return;
    try {
      const t0 = c.currentTime;
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t0);

      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.linearRampToValueAtTime(0.08, t0 + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

      osc.connect(gain);
      gain.connect(bgmGain);
      osc.start(t0);
      osc.stop(t0 + dur + 0.1);
    } catch (e) { /* ignore */ }
  }

  function startBgm() {
    if (bgmInterval || !bgmEnabled) return;
    bgmStep = 0;
    bgmInterval = setInterval(function () {
      if (!bgmEnabled) return;
      const note = BGM_SCALE[bgmStep % BGM_SCALE.length];
      playBgmNote(note, 0.45);
      // Subtle bass note every 4 steps
      if (bgmStep % 4 === 0) {
        playBgmNote(note / 2, 0.9);
      }
      bgmStep++;
    }, 420);
  }

  function stopBgm() {
    if (bgmInterval) {
      clearInterval(bgmInterval);
      bgmInterval = null;
    }
  }

  const sounds = {
    click: function () {
      tone(680, 0.06, 'triangle', 0.16, 820);
    },
    hit: function () {
      const now = performance.now();
      if (now - lastHitAt < 55) return;
      lastHitAt = now;
      noise(0.08, 0.22, 1600);
      tone(180, 0.08, 'sawtooth', 0.18, 90);
    },
    crit: function () {
      noise(0.14, 0.32, 900);
      tone(980, 0.12, 'triangle', 0.25, 420);
      tone(1320, 0.14, 'sine', 0.18, 660, 0.03);
    },
    coin: function () {
      tone(987.77, 0.08, 'sine', 0.16, 1318.51);
      tone(1567.98, 0.12, 'sine', 0.14, null, 0.06);
    },
    heal: function () {
      tone(440, 0.28, 'sine', 0.16, 880);
      tone(659.25, 0.25, 'sine', 0.14, 1046.5, 0.06);
      tone(880, 0.3, 'triangle', 0.12, null, 0.12);
    },
    shield: function () {
      tone(220, 0.28, 'triangle', 0.22, 520);
      noise(0.15, 0.14, 800);
    },
    skill: function () {
      tone(350, 0.25, 'sawtooth', 0.22, 880);
      noise(0.18, 0.16, 2200);
      tone(700, 0.22, 'sine', 0.15, 1200, 0.05);
    },
    ultimate: function () {
      // Powerful Bass Boom + Cosmic Rise
      tone(90, 0.8, 'sawtooth', 0.38, 40);
      tone(220, 0.6, 'triangle', 0.28, 1400, 0.05);
      noise(0.65, 0.35, 600);
      tone(1318.51, 0.5, 'sine', 0.25, 1760, 0.15);
      tone(1760, 0.5, 'triangle', 0.2, null, 0.25);
    },
    levelup: function () {
      tone(523.25, 0.12, 'triangle', 0.22);
      tone(659.25, 0.12, 'triangle', 0.22, null, 0.09);
      tone(783.99, 0.15, 'triangle', 0.24, null, 0.18);
      tone(1046.5, 0.32, 'sine', 0.26, null, 0.27);
    },
    ascend: function () {
      tone(392.00, 0.15, 'sine', 0.22);
      tone(523.25, 0.15, 'sine', 0.22, null, 0.1);
      tone(659.25, 0.15, 'sine', 0.22, null, 0.2);
      tone(1046.5, 0.45, 'sine', 0.28, null, 0.3);
      noise(0.3, 0.16, 1200, 0.1);
    },
    summon: function () {
      tone(220, 0.4, 'sine', 0.25, 880);
      noise(0.35, 0.18, 1400);
    },
    ssr: function () {
      tone(523.25, 0.25, 'triangle', 0.26);
      tone(659.25, 0.25, 'triangle', 0.26, null, 0.08);
      tone(783.99, 0.28, 'triangle', 0.28, null, 0.16);
      tone(1046.5, 0.6, 'sine', 0.32, null, 0.24);
      noise(0.4, 0.22, 1800, 0.1);
    },
    sr: function () {
      tone(523.25, 0.18, 'sine', 0.24);
      tone(783.99, 0.35, 'sine', 0.24, null, 0.1);
    },
    defeat: function () {
      tone(330, 0.45, 'sine', 0.25, 110);
      tone(220, 0.55, 'sawtooth', 0.2, 80, 0.12);
    },
    victory: function () {
      tone(523.25, 0.1, 'triangle', 0.22);
      tone(659.25, 0.1, 'triangle', 0.22, null, 0.08);
      tone(783.99, 0.22, 'triangle', 0.26, null, 0.16);
    },
    error: function () {
      tone(220, 0.1, 'square', 0.2, 140);
    },
    claim: function () {
      tone(783.99, 0.09, 'triangle', 0.22);
      tone(1046.5, 0.18, 'triangle', 0.26, null, 0.08);
    },
    boss: function () {
      tone(130.81, 0.7, 'sawtooth', 0.35, 65.4);
      tone(261.63, 0.6, 'triangle', 0.25, null, 0.1);
      noise(0.4, 0.25, 500);
    }
  };

  return {
    init: function () {
      ensure();
      if (bgmEnabled && !bgmInterval) startBgm();
    },
    play: function (name) {
      if (!sfxEnabled) return;
      const fn = sounds[name];
      if (fn) fn();
    },
    setSfx: function (on) {
      sfxEnabled = !!on;
      if (sfxGain) sfxGain.gain.value = sfxEnabled ? 0.75 : 0;
    },
    setEnabled: function (on) {
      sfxEnabled = !!on;
      if (sfxGain) sfxGain.gain.value = sfxEnabled ? 0.75 : 0;
    },
    setBgm: function (on) {
      bgmEnabled = !!on;
      if (bgmGain) bgmGain.gain.value = bgmEnabled ? 0.28 : 0;
      if (bgmEnabled) {
        startBgm();
      } else {
        stopBgm();
      }
    },
    startBgm: startBgm,
    stopBgm: stopBgm,
    isSfxEnabled: function () { return sfxEnabled; },
    isEnabled: function () { return sfxEnabled; },
    isBgmEnabled: function () { return bgmEnabled; }
  };
})();

if (typeof window !== 'undefined') {
  window.SFX = SFX;
}
