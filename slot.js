// てんちょースロット - main game script
// All comments in English (per project rules), UI text in Japanese.
(() => {
  'use strict';

  // ==================== Constants ====================
  const REEL_COUNT = 3;
  const VISIBLE_ROWS = 3;
  const REEL_PAD_X = 6;
  const STRIP_LEN = 24;
  const SHARE_URL = 'https://maxtakaharu34-cmd.github.io/tencho-slot/';

  // Symbol IDs and their visual style. `src` is loaded as an Image and drawn onto the reel.
  // `fallback` provides a text-drawing fallback when the image is missing (so the
  // game still looks right until a png is dropped into assets/symbols/).
  const SYMBOLS = {
    '7':      { src: 'assets/symbols/7.png',          bg: '#ffe100', fallback: { text: '7',   color: '#e8133a', stroke: '#000', font: 'bold 72px "Mochiy Pop P One", serif' } },
    'BAR':    { src: 'assets/symbols/bar.png',        bg: '#3a0080', rainbow: true, fallback: { text: '★', color: '#ff66ff', stroke: '#fff', font: 'bold 60px serif' } },
    'BELL':   { src: 'assets/symbols/bell.png',       bg: '#ff8c00', fallback: { text: '🔔', color: '#fff',     stroke: '#000', font: '54px serif' } },
    'WMN':    { src: 'assets/symbols/watermelon.png', bg: '#0d8f33', fallback: { text: '🍉', color: '#fff',     stroke: '#000', font: '54px serif' } },
    'CHE':    { src: 'assets/symbols/cherry.png',     bg: '#c11d1d', fallback: { text: '🍒', color: '#fff',     stroke: '#000', font: '54px serif' } },
    'REP':    { src: 'assets/symbols/replay.png',     bg: '#1da1f2', fallback: { text: '⟳',  color: '#fff',     stroke: '#000', font: 'bold 60px sans-serif' } },
    'ONE':    { src: 'assets/symbols/one.png',        bg: '#ff4d4d', fallback: { text: '1',  color: '#fff',     stroke: '#000', font: 'bold 72px "Mochiy Pop P One", serif' } },
    'THREE':  { src: 'assets/symbols/three.png',      bg: '#4da6ff', fallback: { text: '3',  color: '#fff',     stroke: '#000', font: 'bold 72px "Mochiy Pop P One", serif' } },
    'FIVE':   { src: 'assets/symbols/five.png',       bg: '#4dff4d', fallback: { text: '5',  color: '#000',     stroke: '#fff', font: 'bold 72px "Mochiy Pop P One", serif' } },
    'PIERROT':{ src: 'assets/symbols/pierrot.png',    bg: '#8b1aff', fallback: { text: '🃏', color: '#fff',     stroke: '#000', font: '54px serif' } },
    'GOLD':   { src: 'assets/symbols/gold.png',       bg: '#ffd700', fallback: { text: 'G',  color: '#8b6508',  stroke: '#000', font: 'bold 60px serif' } },
    'BLK':    { src: null,                            bg: '#1a0030' }
  };

  // Preload symbol images
  const symbolImages = {};
  function preloadSymbols() {
    Object.entries(SYMBOLS).forEach(([key, def]) => {
      if (!def.src) return;
      const img = new Image();
      img.src = def.src;
      symbolImages[key] = img;
    });
  }

  // Mode badge icons (loaded lazily into <img> in DOM)
  const MODE_ICONS = {
    cz: 'assets/mode/cz_galaxy.png',
    at: 'assets/mode/at_star.png',
    revival: 'assets/mode/revival_orb.png',
    upperAt: 'assets/mode/crown.png'
  };

  // 24-slot strips with god-pattern numbers + pierrot + gold inserted into gaps.
  // Each reel contains every symbol at least once (cherry only on left reel).
  const REEL_STRIPS = [
    // Left reel
    ['7','PIERROT','BELL','CHE','REP','ONE','THREE','PIERROT','BAR','REP','BELL','GOLD','THREE','REP','FIVE','BELL','PIERROT','ONE','REP','WMN','BELL','GOLD','PIERROT','FIVE'],
    // Middle reel
    ['BELL','7','REP','ONE','BELL','PIERROT','REP','BAR','BELL','FIVE','REP','BELL','GOLD','ONE','REP','BELL','THREE','PIERROT','REP','WMN','GOLD','PIERROT','THREE','FIVE'],
    // Right reel
    ['REP','BELL','7','PIERROT','REP','ONE','BELL','REP','BAR','FIVE','BELL','REP','THREE','BELL','GOLD','REP','PIERROT','BELL','REP','ONE','WMN','GOLD','THREE','FIVE']
  ];

  const pickWeighted = (table) => {
    const total = table.reduce((s, x) => s + x.w, 0);
    let r = Math.random() * total;
    for (const item of table) {
      r -= item.w;
      if (r < 0) return item.type;
    }
    return table[table.length - 1].type;
  };

  // Lottery tables per mode. Probabilities per Sho's exact spec.
  // type list: special, seven, one, three, five, pushBell, bell, suika, cherry, replay, hazure
  const TABLE_NORMAL = [
    { type: 'special',  w: 1/200 },   // 0.005 - freeze + upper AT direct
    { type: 'seven',    w: 1/200 },   // 0.005 - AT direct
    { type: 'five',     w: 1/60 },    // ~0.0167 - 10G CZ
    { type: 'three',    w: 1/40 },    // 0.025 - 5G CZ
    { type: 'one',      w: 1/20 },    // 0.05 - 3G CZ
    { type: 'pushBell', w: 1/100 },   // 0.01 - payout 20
    { type: 'cherry',   w: 1/30 },    // ~0.0333 - payout 2, 1/10 -> next-spin special
    { type: 'suika',    w: 1/50 },    // 0.02 - payout 4, 1/3 -> CZ
    { type: 'bell',     w: 1/10 },    // 0.1 - payout 10
    { type: 'replay',   w: 1/5 },     // 0.2
    { type: 'hazure',   w: 0.535 }
  ];
  // CZ uses the same sub-role probabilities as normal, but 1/3/5/7 揃い are suppressed
  const TABLE_CZ = [
    { type: 'special',  w: 1/200 },
    { type: 'pushBell', w: 1/100 },
    { type: 'cherry',   w: 1/30 },
    { type: 'suika',    w: 1/50 },
    { type: 'bell',     w: 1/10 },
    { type: 'replay',   w: 1/5 },
    { type: 'hazure',   w: 0.632 }
  ];
  const TABLE_AT = [
    { type: 'special',  w: 1/200 },
    { type: 'pushBell', w: 1/5 },
    { type: 'cherry',   w: 1/30 },
    { type: 'suika',    w: 1/50 },
    { type: 'bell',     w: 1/10 },
    { type: 'replay',   w: 1/2 },
    { type: 'hazure',   w: 0.142 }
  ];
  const TABLE_UPPER_AT = [
    { type: 'pushBell', w: 1/2 },
    { type: 'replay',   w: 0.30 },
    { type: 'cherry',   w: 0.06 },
    { type: 'suika',    w: 0.06 },
    { type: 'bell',     w: 0.05 },
    { type: 'hazure',   w: 0.03 }
  ];
  // Revival CZ uses normal sub-role probabilities
  const TABLE_REVIVAL = TABLE_CZ;

  const PAYOUT = {
    bell: 10,
    suika: 4,
    cherry: 2,
    pushBellNormal: 20,
    pushBellAT: 15,
    pushBellMiss: 1
  };

  // CZ base lengths per entry symbol
  const CZ_LENGTH = { one: 3, three: 5, five: 10, suika: 3, cherry: 3 };
  const AT_FIRST_G = 30;
  const UPPER_AT_FIRST_G = 50;
  const REVIVAL_G = 5;

  // ==================== DOM ====================
  const $ = (id) => document.getElementById(id);
  const reelsCanvas = $('reels');
  const fxCanvas = $('fx');
  const ctx = reelsCanvas.getContext('2d');
  const fctx = fxCanvas.getContext('2d');
  const reelFrame = $('reel-frame');
  const medalEl = $('medal');
  const gamesEl = $('games');
  const diffEl = $('diff');
  const modeNameEl = $('mode-name');
  const modeCounterEl = $('mode-counter');
  const modeExtraEl = $('mode-extra');
  const btnLever = $('btn-lever');
  const stopBtns = [0, 1, 2].map(i => $(`btn-stop-${i}`));
  const btnMute = $('btn-mute');
  const btnShare = $('btn-share');
  const btnRestart = $('btn-restart');
  const btnStart = $('btn-start');
  const startOverlay = $('start-overlay');
  const shareOverlay = $('share-overlay');
  const btnShareX = $('btn-share-x');
  const btnShareClose = $('btn-share-close');
  const shareTextPreview = $('share-text-preview');
  const shareUrlEl = $('share-url');
  const qrCodeEl = $('qr-code');
  const cutin = $('cutin');
  const cutinLine1 = $('cutin-line1');
  const cutinLine2 = $('cutin-line2');
  const freezeEl = $('freeze');
  const floaters = $('floaters');

  // ==================== Audio (WebAudio synthesis) ====================
  const Sound = (() => {
    let ac = null;
    let muted = localStorage.getItem('tencho_slot_muted') === '1';
    const ensure = () => {
      if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state === 'suspended') ac.resume();
      return ac;
    };
    const beep = (freq, dur, type = 'sine', gain = 0.15) => {
      if (muted) return;
      const a = ensure();
      const o = a.createOscillator();
      const g = a.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.value = gain;
      g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
      o.connect(g).connect(a.destination);
      o.start();
      o.stop(a.currentTime + dur);
    };
    const chord = (freqs, dur, type = 'triangle', gain = 0.1) => {
      freqs.forEach(f => beep(f, dur, type, gain));
    };
    return {
      prime: () => ensure(),
      lever: () => beep(220, 0.18, 'square', 0.18),
      stop: () => beep(180, 0.07, 'triangle', 0.18),
      bell: () => chord([523, 784, 1047], 0.25, 'triangle', 0.1),
      coin: () => beep(880, 0.05, 'sine', 0.15),
      cherry: () => beep(660, 0.12, 'sine', 0.18),
      suika: () => chord([440, 660], 0.18, 'sine', 0.12),
      replay: () => beep(330, 0.10, 'square', 0.15),
      sevenStop: () => beep(110, 0.30, 'square', 0.25),
      cz: () => chord([523, 659, 784, 1047], 0.5, 'triangle', 0.12),
      atIn: () => {
        chord([523, 659, 784], 0.4, 'triangle', 0.15);
        setTimeout(() => chord([659, 784, 1047], 0.5, 'triangle', 0.15), 200);
      },
      freeze: () => beep(55, 1.5, 'sine', 0.2),
      heart: () => beep(110, 0.08, 'sine', 0.2),
      rainbow: () => {
        [523, 587, 659, 698, 784, 880, 988, 1047].forEach((f, i) =>
          setTimeout(() => beep(f, 0.12, 'triangle', 0.15), i * 80)
        );
      },
      toggleMute: () => {
        muted = !muted;
        localStorage.setItem('tencho_slot_muted', muted ? '1' : '0');
        if (muted) stopBgm();
        else restartBgmIfNeeded();
        return muted;
      },
      isMuted: () => muted,
      ctx: () => ensure(),
      getMuted: () => muted
    };
  })();

  // ==================== BGM (looped synth "god-kick" groove) ====================
  // Three progressive intensity levels: normal (off), cz (medium), at/upperAt (full).
  let bgmNodes = [];
  let bgmLevel = 'off';        // off | cz | at | upper
  let bgmTimer = null;

  function stopBgm() {
    if (bgmTimer) { clearInterval(bgmTimer); bgmTimer = null; }
    bgmNodes.forEach(n => { try { n.stop(); } catch {} try { n.disconnect(); } catch {} });
    bgmNodes = [];
    bgmLevel = 'off';
  }
  function restartBgmIfNeeded() {
    if (state.mode === 'at' || state.mode === 'upperAt') setBgm(state.mode === 'upperAt' ? 'upper' : 'at');
    else if (state.mode === 'cz' || state.mode === 'revival') setBgm('cz');
    else stopBgm();
  }
  // A minor-pentatonic arpeggio with a steady kick. Builds dopamine quickly.
  function setBgm(level) {
    if (Sound.getMuted()) { stopBgm(); bgmLevel = level; return; }
    if (bgmLevel === level) return;
    stopBgm();
    bgmLevel = level;
    if (level === 'off') return;

    const ac = Sound.ctx();
    const out = ac.createGain();
    out.gain.value = level === 'upper' ? 0.25 : level === 'at' ? 0.20 : 0.12;
    out.connect(ac.destination);
    bgmNodes.push(out);

    // Tempo: fast BPM for maximum dopamine
    const bpm = level === 'upper' ? 168 : level === 'at' ? 150 : 132;
    const stepSec = 60 / bpm / 4; // 16th notes

    // Pentatonic notes in A minor (base freq)
    const scale = level === 'upper'
      ? [220, 262, 311, 370, 440, 523, 622, 740]        // richer chromatic feel
      : [220, 262, 311, 370, 440, 523];
    // Bass pattern (kick + sub)
    const bass = [110, 110, 165, 110, 110, 165, 147, 110];

    let step = 0;
    const scheduleStep = () => {
      if (Sound.getMuted()) return;
      const t = ac.currentTime;
      // Kick drum: short pitched decay from 120Hz to 40Hz
      const kickOsc = ac.createOscillator();
      const kickGain = ac.createGain();
      kickOsc.type = 'sine';
      kickOsc.frequency.setValueAtTime(140, t);
      kickOsc.frequency.exponentialRampToValueAtTime(40, t + 0.12);
      kickGain.gain.setValueAtTime(0.6, t);
      kickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      kickOsc.connect(kickGain).connect(out);
      kickOsc.start(t);
      kickOsc.stop(t + 0.2);
      // Bass on every 2 steps
      if (step % 2 === 0) {
        const bOsc = ac.createOscillator();
        const bGain = ac.createGain();
        bOsc.type = 'sawtooth';
        bOsc.frequency.value = bass[Math.floor(step / 2) % bass.length];
        bGain.gain.setValueAtTime(0.18, t);
        bGain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        const bFilter = ac.createBiquadFilter();
        bFilter.type = 'lowpass';
        bFilter.frequency.value = 800;
        bOsc.connect(bFilter).connect(bGain).connect(out);
        bOsc.start(t);
        bOsc.stop(t + 0.32);
      }
      // Arpeggio lead (triangle)
      const leadFreq = scale[step % scale.length] * (level === 'upper' ? 2 : 1);
      const lOsc = ac.createOscillator();
      const lGain = ac.createGain();
      lOsc.type = level === 'upper' ? 'square' : 'triangle';
      lOsc.frequency.value = leadFreq;
      lGain.gain.setValueAtTime(0.08, t);
      lGain.gain.exponentialRampToValueAtTime(0.001, t + stepSec * 0.9);
      lOsc.connect(lGain).connect(out);
      lOsc.start(t);
      lOsc.stop(t + stepSec + 0.05);

      // Upper-AT: extra high shimmer
      if (level === 'upper' && step % 4 === 0) {
        const sh = ac.createOscillator();
        const shG = ac.createGain();
        sh.type = 'sine';
        sh.frequency.value = leadFreq * 4;
        shG.gain.setValueAtTime(0.06, t);
        shG.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
        sh.connect(shG).connect(out);
        sh.start(t);
        sh.stop(t + 0.45);
      }
      step++;
    };
    // Use setInterval (not Web Audio scheduling) — good enough for the vibe.
    bgmTimer = setInterval(scheduleStep, stepSec * 1000);
  }
  const imgMute = document.getElementById('img-mute');
  imgMute.src = Sound.isMuted() ? 'assets/ui/mute_off.png' : 'assets/ui/mute_on.png';

  // ==================== State ====================
  const state = {
    medal: 1000,
    initialMedal: 1000,
    games: 0,
    bigWinHistory: [],
    mode: 'normal',
    czEntrySymbol: null,        // 'one' | 'three' | 'five' | 'suika' | 'cherry'
    czRemainingG: 0,
    atRemainingG: 0,
    revivalRemainingG: 0,
    nextSpecialForce: false,    // cherry 1/10 -> next spin forced special
    spinning: false,
    canStop: false,
    currentLottery: null,
    pushOrder: null,
    pushOrderProgress: 0,
    pushOrderHit: true,
    lastWasReplay: false,
    reels: Array.from({ length: REEL_COUNT }, () => ({
      pos: 0,
      spinning: false,
      stopRequested: false,
      targetIndex: 0,
      stopAnim: null
    })),
    stoppedCount: 0,
    inFreeze: false
  };

  // ==================== Reel rendering ====================
  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const rect = reelsCanvas.getBoundingClientRect();
    reelsCanvas.width = rect.width * dpr;
    reelsCanvas.height = rect.height * dpr;
    fxCanvas.width = rect.width * dpr;
    fxCanvas.height = rect.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resizeCanvas);

  const cw = () => reelsCanvas.getBoundingClientRect().width;
  const ch = () => reelsCanvas.getBoundingClientRect().height;
  const reelW = () => (cw() - REEL_PAD_X * 2) / REEL_COUNT;
  const symH = () => ch() / VISIBLE_ROWS;

  function drawSymbol(x, y, w, h, sym, opts = {}) {
    const def = SYMBOLS[sym] || SYMBOLS['BLK'];
    ctx.save();
    // Background tile
    if (opts.rainbow || (def.rainbow && opts.shine)) {
      const t = (performance.now() / 200) % 1;
      const grad = ctx.createLinearGradient(x, y, x + w, y + h);
      grad.addColorStop(0, '#ff0');
      grad.addColorStop((0.25 + t) % 1, '#f0f');
      grad.addColorStop((0.5 + t) % 1, '#0ff');
      grad.addColorStop((0.75 + t) % 1, '#0f0');
      grad.addColorStop(1, '#ff0');
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = def.bg;
    }
    ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
    // Top highlight
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(x + 1, y + 1, w - 2, h * 0.25);
    // Outline
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    // Symbol image (centered, with small padding) or text fallback
    const img = symbolImages[sym];
    if (img && img.complete && img.naturalWidth) {
      const pad = Math.min(w, h) * 0.08;
      ctx.drawImage(img, x + pad, y + pad, w - pad * 2, h - pad * 2);
    } else if (def.fallback) {
      const fb = def.fallback;
      ctx.font = fb.font;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const cx = x + w / 2;
      const cy = y + h / 2 + 2;
      if (fb.stroke) {
        ctx.lineWidth = 6;
        ctx.strokeStyle = fb.stroke;
        ctx.strokeText(fb.text, cx, cy);
      }
      ctx.fillStyle = fb.color;
      ctx.fillText(fb.text, cx, cy);
    }
    ctx.restore();
  }

  function symAt(r, idx) {
    const s = REEL_STRIPS[r];
    return s[((idx % STRIP_LEN) + STRIP_LEN) % STRIP_LEN];
  }

  function drawReels() {
    const W = cw(), H = ch();
    const sH = symH();
    // Integer column widths, last column absorbs the remainder so nothing gets cut off on the right.
    const usable = W - REEL_PAD_X * 2;
    const baseColW = Math.floor(usable / REEL_COUNT);
    const lastColW = usable - baseColW * (REEL_COUNT - 1);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#050010';
    ctx.fillRect(0, 0, W, H);
    // Clip everything to the canvas bounds so any symbol can't bleed past
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.clip();
    for (let r = 0; r < REEL_COUNT; r++) {
      const reel = state.reels[r];
      const x = REEL_PAD_X + r * baseColW;
      const rW = (r === REEL_COUNT - 1) ? lastColW : baseColW;
      ctx.fillStyle = '#000';
      ctx.fillRect(x, 0, rW, H);
      const stripPx = STRIP_LEN * sH;
      const wrapped = ((reel.pos % stripPx) + stripPx) % stripPx;
      const topSymFloat = wrapped / sH;
      const topIdx = Math.floor(topSymFloat);
      const yOffset = -(topSymFloat - topIdx) * sH;
      // Clip each reel column so symbol rendering cannot overflow horizontally
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, 0, rW, H);
      ctx.clip();
      for (let i = -1; i < VISIBLE_ROWS + 1; i++) {
        const stripIndex = topIdx + i;
        const sym = symAt(r, stripIndex);
        const y = yOffset + i * sH;
        drawSymbol(x, y, rW, sH, sym, { shine: state.mode === 'upperAt' });
      }
      ctx.restore();
      ctx.strokeStyle = '#330055';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, 0.5, rW - 1, H - 1);
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath();
    ctx.moveTo(0, sH);
    ctx.lineTo(W, sH);
    ctx.moveTo(0, sH * 2);
    ctx.lineTo(W, sH * 2);
    ctx.stroke();
  }

  let lastTs = 0;
  function tick(ts) {
    const dt = Math.min(60, ts - lastTs);
    lastTs = ts;
    for (let r = 0; r < REEL_COUNT; r++) {
      const reel = state.reels[r];
      if (reel.spinning) reel.pos += dt * 0.72;
    }
    drawReels();
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  // ==================== Spin / Stop ====================
  function startSpin() {
    if (state.spinning || state.inFreeze) return;
    if (state.medal < 3 && !state.lastWasReplay) {
      flashFrame('#ff4444');
      return;
    }

    Sound.prime();
    Sound.lever();

    const isReplay = state.lastWasReplay === true;
    state.lastWasReplay = false;

    if (!isReplay) state.medal -= 3;
    state.games++;
    updateStatus();

    state.currentLottery = rollLottery();
    // Cherry 1/10 -> next-spin special forcing: override type on the *next* spin
    if (state.nextSpecialForce) {
      state.currentLottery = { type: 'special' };
      state.nextSpecialForce = false;
    }
    const targets = computeTargets(state.currentLottery.type);
    for (let r = 0; r < REEL_COUNT; r++) {
      state.reels[r].spinning = true;
      state.reels[r].stopRequested = false;
      state.reels[r].targetIndex = targets[r];
    }
    state.spinning = true;
    state.stoppedCount = 0;

    state.pushOrder = null;
    state.pushOrderProgress = 0;
    state.pushOrderHit = true;
    if (state.currentLottery.type === 'pushBell' &&
        (state.mode === 'cz' || state.mode === 'at' || state.mode === 'upperAt')) {
      state.pushOrder = shuffle([0, 1, 2]);
      updateNavOverlay();
    } else {
      clearNavOverlay();
    }

    if (state.currentLottery.type === 'special') {
      runFreezeSequence();
      return;
    }

    setTimeout(() => {
      state.canStop = true;
      stopBtns.forEach(b => { b.disabled = false; });
    }, 150);
    btnLever.disabled = true;
  }

  function rollLottery() {
    let table;
    switch (state.mode) {
      case 'cz': table = TABLE_CZ; break;
      case 'at': table = TABLE_AT; break;
      case 'upperAt': table = TABLE_UPPER_AT; break;
      case 'revival': table = TABLE_REVIVAL; break;
      default: table = TABLE_NORMAL;
    }
    return { type: pickWeighted(table) };
  }

  function computeTargets(type) {
    const wantSymbol = (sym, reel) => {
      const candidates = [];
      for (let i = 0; i < STRIP_LEN; i++) {
        if (REEL_STRIPS[reel][i] === sym) candidates.push(i);
      }
      return candidates[Math.floor(Math.random() * candidates.length)];
    };
    const randomOf = (reel, exclude = []) => {
      const all = [];
      for (let i = 0; i < STRIP_LEN; i++) {
        if (!exclude.includes(REEL_STRIPS[reel][i])) all.push(i);
      }
      return all[Math.floor(Math.random() * all.length)];
    };

    switch (type) {
      case 'seven':   return [wantSymbol('7', 0),     wantSymbol('7', 1),     wantSymbol('7', 2)];
      case 'one':     return [wantSymbol('ONE', 0),   wantSymbol('ONE', 1),   wantSymbol('ONE', 2)];
      case 'three':   return [wantSymbol('THREE', 0), wantSymbol('THREE', 1), wantSymbol('THREE', 2)];
      case 'five':    return [wantSymbol('FIVE', 0),  wantSymbol('FIVE', 1),  wantSymbol('FIVE', 2)];
      case 'special': return [wantSymbol('BAR', 0),   wantSymbol('BAR', 1),   wantSymbol('BAR', 2)];
      case 'replay':  return [wantSymbol('REP', 0),   wantSymbol('REP', 1),   wantSymbol('REP', 2)];
      case 'bell':    return [wantSymbol('BELL', 0),  wantSymbol('BELL', 1),  wantSymbol('BELL', 2)];
      case 'pushBell':return [wantSymbol('BELL', 0),  wantSymbol('BELL', 1),  wantSymbol('BELL', 2)];
      case 'suika':   return [wantSymbol('WMN', 0),   wantSymbol('WMN', 1),   wantSymbol('WMN', 2)];
      case 'cherry':  return [wantSymbol('CHE', 0), randomOf(1, ['CHE']), randomOf(2, ['CHE'])];
      default: {
        for (let t = 0; t < 20; t++) {
          const cand = [randomOf(0), randomOf(1), randomOf(2)];
          const middles = cand.map((idx, r) => symAt(r, idx));
          const allSame = middles[0] === middles[1] && middles[1] === middles[2];
          if (!allSame) return cand;
        }
        return [randomOf(0), randomOf(1), randomOf(2)];
      }
    }
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function requestStop(reelIndex) {
    if (!state.canStop) return;
    const reel = state.reels[reelIndex];
    if (!reel.spinning || reel.stopRequested) return;

    if (state.pushOrder) {
      const expected = state.pushOrder[state.pushOrderProgress];
      if (expected !== reelIndex) state.pushOrderHit = false;
      state.pushOrderProgress++;
      updateNavOverlay();
    }

    reel.stopRequested = true;
    Sound.stop();
    animateReelStop(reelIndex);
  }

  function animateReelStop(r) {
    const reel = state.reels[r];
    const sH = symH();
    const stripPx = STRIP_LEN * sH;
    const desiredMod = ((reel.targetIndex - 1) * sH);
    const curMod = ((reel.pos % stripPx) + stripPx) % stripPx;
    let delta = (desiredMod - curMod + stripPx) % stripPx;
    if (delta < sH * 0.5) delta += stripPx;
    const slipExtra = sH * (Math.random() * 0.6);
    const finalDelta = delta + slipExtra;
    const dur = 220 + Math.random() * 120;
    const startPos = reel.pos;
    const startTs = performance.now();

    if (reel.stopAnim) cancelAnimationFrame(reel.stopAnim);

    function step(ts) {
      const t = Math.min(1, (ts - startTs) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      reel.pos = startPos + finalDelta * eased;
      if (t < 1) {
        reel.stopAnim = requestAnimationFrame(step);
      } else {
        reel.spinning = false;
        reel.stopAnim = null;
        reel.pos = startPos + finalDelta;
        state.stoppedCount++;
        stopBtns[r].disabled = true;
        const middleSym = symAt(r, reel.targetIndex);
        if (middleSym === '7') Sound.sevenStop();
        if (state.stoppedCount === REEL_COUNT) onAllStopped();
      }
    }
    reel.stopAnim = requestAnimationFrame(step);
  }

  // ==================== Result resolution ====================
  function onAllStopped() {
    state.spinning = false;
    state.canStop = false;
    btnLever.disabled = false;
    stopBtns.forEach(b => { b.disabled = true; });
    clearNavOverlay();

    const type = state.currentLottery.type;
    let payout = 0;

    switch (type) {
      case 'replay':
        Sound.replay();
        state.lastWasReplay = true;
        state.medal += 3; // refund the bet
        break;
      case 'bell':
        Sound.bell();
        payout = PAYOUT.bell;
        break;
      case 'pushBell': {
        const inAT = state.mode === 'at' || state.mode === 'upperAt';
        if (state.pushOrder) {
          if (state.pushOrderHit) {
            payout = inAT ? PAYOUT.pushBellAT : PAYOUT.pushBellNormal;
            Sound.bell();
          } else {
            payout = PAYOUT.pushBellMiss;
            Sound.stop();
          }
        } else {
          payout = PAYOUT.pushBellNormal;
          Sound.bell();
        }
        break;
      }
      case 'suika':
        Sound.suika();
        payout = PAYOUT.suika;
        break;
      case 'cherry':
        Sound.cherry();
        payout = PAYOUT.cherry;
        break;
      case 'seven':
        Sound.cz();
        flashFrame('#ffe100');
        break;
      case 'one':
        Sound.cz();
        flashFrame('#ff4d4d');
        break;
      case 'three':
        Sound.cz();
        flashFrame('#4da6ff');
        break;
      case 'five':
        Sound.cz();
        flashFrame('#4dff4d');
        break;
      case 'special':
        // handled in freeze sequence
        break;
      default:
        break;
    }

    if (payout > 0) {
      state.medal += payout;
      spawnFloater(`+${payout}`, 'gain');
      for (let i = 0; i < Math.min(5, Math.floor(payout / 4)); i++) {
        setTimeout(() => Sound.coin(), i * 60);
      }
      if (payout >= 15) burstSparkles(60);
      else if (payout >= 10) burstSparkles(25);
    }
    // Burst on big-symbol hits too
    if (type === 'seven' || type === 'one' || type === 'three' || type === 'five') {
      burstSparkles(100);
    }
    updateStatus();

    handleModeTransition(type);
  }

  // ==================== Mode transitions ====================
  function handleModeTransition(type) {
    // Cherry 1/10 -> flag next spin to force special (cutin will land on next spin)
    if (type === 'cherry' && Math.random() < 1/10) {
      state.nextSpecialForce = true;
      spawnFloater('次回特殊図柄！', 'bonus');
      Sound.cz();
    }

    if (state.mode === 'normal') {
      if (type === 'seven') {
        setTimeout(() => enterAT(false, '7揃い！'), 500);
      } else if (type === 'one') {
        setTimeout(() => enterCZ('one'), 500);
      } else if (type === 'three') {
        setTimeout(() => enterCZ('three'), 500);
      } else if (type === 'five') {
        setTimeout(() => enterCZ('five'), 500);
      } else if (type === 'suika' && Math.random() < 1/3) {
        setTimeout(() => enterCZ('suika'), 600);
      }
    } else if (state.mode === 'cz') {
      // CZ sub-role triggers AT per Sho's spec:
      //  replay 50%, bell 50%, suika/cherry 100%
      let atConfirmed = false;
      if (type === 'replay' && Math.random() < 0.5) atConfirmed = true;
      else if (type === 'bell' && Math.random() < 0.5) atConfirmed = true;
      else if (type === 'suika' || type === 'cherry') atConfirmed = true;
      else if (type === 'pushBell' && Math.random() < 0.5) atConfirmed = true;

      if (atConfirmed) {
        setTimeout(() => enterAT(false), 500);
        return;
      }
      state.czRemainingG = Math.max(0, state.czRemainingG - 1);
      if (state.czRemainingG <= 0) {
        setTimeout(() => exitCZToNormal(), 400);
      }
      updateStatus();
    } else if (state.mode === 'at') {
      state.atRemainingG = Math.max(0, state.atRemainingG - 1);
      // AT upsells
      if (type === 'suika' && Math.random() < 0.5) {
        state.atRemainingG += 10;
        spawnFloater('+10G', 'bonus');
        Sound.cz();
      }
      if (type === 'cherry') {
        state.atRemainingG += 5;
        spawnFloater('+5G', 'bonus');
        Sound.cz();
      }
      if (state.atRemainingG <= 0) {
        setTimeout(() => enterRevivalCZ(), 400);
      }
      updateStatus();
    } else if (state.mode === 'revival') {
      state.revivalRemainingG = Math.max(0, state.revivalRemainingG - 1);
      // Any sub-role hit -> AT continue
      if (type === 'bell' || type === 'pushBell' || type === 'suika' || type === 'cherry') {
        setTimeout(() => enterAT(true), 400);
        return;
      }
      if (state.revivalRemainingG <= 0) {
        setTimeout(() => exitRevivalToNormal(), 400);
      }
      updateStatus();
    } else if (state.mode === 'upperAt') {
      state.atRemainingG = Math.max(0, state.atRemainingG - 1);
      // Upsells: cherry or suika -> +10G
      if (type === 'cherry' || type === 'suika') {
        state.atRemainingG += 10;
        spawnFloater('+10G', 'bonus');
        Sound.cz();
      }
      // 1/20 of pushBell -> +10G upsell
      if (type === 'pushBell' && Math.random() < 1/20) {
        state.atRemainingG += 10;
        spawnFloater('ベル+10G！', 'bonus');
        Sound.cz();
      }
      // Demotion lottery 1/199 every game
      if (Math.random() < 1/199) {
        setTimeout(() => demoteFromUpperAT(), 400);
        return;
      }
      if (state.atRemainingG <= 0) {
        setTimeout(() => enterRevivalCZ(), 400);
      }
      updateStatus();
    }
  }

  function enterCZ(entrySymbol) {
    state.mode = 'cz';
    state.czEntrySymbol = entrySymbol;
    state.czRemainingG = CZ_LENGTH[entrySymbol] || 3;
    const labelMap = { one: '1図柄', three: '3図柄', five: '5図柄', suika: 'スイカ', cherry: 'チェリー' };
    showCutin(`${labelMap[entrySymbol] || ''}揃い！`, '暗黒星雲チャンス');
    flashFrame('#ff66ff');
    Sound.cz();
    applyModeBodyClass();
    updateStatus();
  }
  function exitCZToNormal() {
    state.mode = 'normal';
    state.czRemainingG = 0;
    state.czEntrySymbol = null;
    spawnFloater('CZ終了…', 'gain');
    applyModeBodyClass();
    updateStatus();
  }
  function enterAT(viaRevival = false, heading = 'AT突入！') {
    state.mode = 'at';
    state.atRemainingG = AT_FIRST_G;
    showCutin(viaRevival ? '復活！' : heading, '暗黒星雲モード');
    flashFrame('#00ffff');
    Sound.atIn();
    applyModeBodyClass();
    updateStatus();
  }
  function enterRevivalCZ() {
    state.mode = 'revival';
    state.revivalRemainingG = REVIVAL_G;
    showCutin('まだだ…', '暗黒星雲復活チャンス');
    Sound.cz();
    applyModeBodyClass();
    updateStatus();
  }
  function exitRevivalToNormal() {
    state.mode = 'normal';
    state.revivalRemainingG = 0;
    spawnFloater('AT終了', 'gain');
    applyModeBodyClass();
    updateStatus();
  }
  function enterUpperAT() {
    state.mode = 'upperAt';
    state.atRemainingG = UPPER_AT_FIRST_G;
    showCutin('上位AT確定', '超闇暗黒星雲モード');
    flashFrame('#ff00ff');
    Sound.atIn();
    setTimeout(() => Sound.atIn(), 250);
    applyModeBodyClass();
    updateStatus();
  }
  function demoteFromUpperAT() {
    spawnFloater('転落…', 'bonus');
    flashFrame('#fff');
    setTimeout(() => {
      state.mode = 'cz';
      state.czEntrySymbol = 'one';
      state.czRemainingG = 3;
      showCutin('転落…', '暗黒星雲チャンス');
      applyModeBodyClass();
      updateStatus();
    }, 500);
  }

  function applyModeBodyClass() {
    document.body.classList.remove('mode-normal','mode-cz','mode-at','mode-revival','mode-upperAt');
    document.body.classList.add('mode-' + state.mode);
    // Drive BGM based on mode
    if (state.mode === 'upperAt') setBgm('upper');
    else if (state.mode === 'at') setBgm('at');
    else if (state.mode === 'cz' || state.mode === 'revival') setBgm('cz');
    else setBgm('off');
    // Toggle sparkle emitter
    sparkleActive = (state.mode === 'at' || state.mode === 'upperAt' || state.mode === 'cz' || state.mode === 'revival');
    if (sparkleActive && !sparkleRaf) runSparkles();
  }

  // ==================== Sparkles / rainbow confetti overlay ====================
  const sparkleCanvas = document.getElementById('sparkles');
  const sctx = sparkleCanvas.getContext('2d');
  function resizeSparkleCanvas() {
    const dpr = window.devicePixelRatio || 1;
    sparkleCanvas.width = window.innerWidth * dpr;
    sparkleCanvas.height = window.innerHeight * dpr;
    sparkleCanvas.style.width = window.innerWidth + 'px';
    sparkleCanvas.style.height = window.innerHeight + 'px';
    sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resizeSparkleCanvas);
  resizeSparkleCanvas();

  let sparkles = [];
  let sparkleActive = false;
  let sparkleRaf = null;
  let sparkleLastEmit = 0;
  function emitSparkle(x, y, opts = {}) {
    const count = opts.count || 1;
    for (let i = 0; i < count; i++) {
      sparkles.push({
        x: x !== undefined ? x : Math.random() * window.innerWidth,
        y: y !== undefined ? y : (opts.fromTop ? -10 : Math.random() * window.innerHeight),
        vx: (Math.random() - 0.5) * (opts.spread || 2),
        vy: opts.fromTop ? (1.2 + Math.random() * 2.5) : ((Math.random() - 0.5) * 2),
        life: 0,
        max: 60 + Math.random() * 80,
        hue: Math.random() * 360,
        size: 3 + Math.random() * 5,
        rot: Math.random() * Math.PI * 2,
        vrot: (Math.random() - 0.5) * 0.2
      });
    }
  }
  function runSparkles() {
    const step = () => {
      sctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      // Emit per-frame if active
      const now = performance.now();
      if (sparkleActive && now - sparkleLastEmit > 40) {
        const emitCount = state.mode === 'upperAt' ? 5 : state.mode === 'at' ? 3 : 1;
        emitSparkle(undefined, undefined, { count: emitCount, fromTop: true });
        sparkleLastEmit = now;
      }
      for (let i = sparkles.length - 1; i >= 0; i--) {
        const s = sparkles[i];
        s.life++;
        s.x += s.vx;
        s.y += s.vy;
        s.vy += 0.04;
        s.rot += s.vrot;
        if (s.life > s.max || s.y > window.innerHeight + 20) {
          sparkles.splice(i, 1);
          continue;
        }
        const alpha = 1 - s.life / s.max;
        sctx.save();
        sctx.translate(s.x, s.y);
        sctx.rotate(s.rot);
        sctx.fillStyle = `hsla(${s.hue + s.life * 3}, 90%, 60%, ${alpha})`;
        sctx.fillRect(-s.size, -s.size / 2, s.size * 2, s.size);
        sctx.restore();
      }
      if (sparkleActive || sparkles.length > 0) {
        sparkleRaf = requestAnimationFrame(step);
      } else {
        sparkleRaf = null;
      }
    };
    if (!sparkleRaf) sparkleRaf = requestAnimationFrame(step);
  }
  // Big burst helper on wins
  function burstSparkles(n = 60) {
    const rect = reelFrame.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    for (let i = 0; i < n; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 4 + Math.random() * 8;
      sparkles.push({
        x: cx, y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0, max: 70 + Math.random() * 40,
        hue: Math.random() * 360,
        size: 4 + Math.random() * 6,
        rot: Math.random() * Math.PI * 2,
        vrot: (Math.random() - 0.5) * 0.3
      });
    }
    if (!sparkleRaf) runSparkles();
  }

  // ==================== Freeze + Full-rotation rainbow ====================
  function runFreezeSequence() {
    state.inFreeze = true;
    btnLever.disabled = true;
    stopBtns.forEach(b => { b.disabled = true; });
    state.reels.forEach(r => { r.spinning = false; });

    freezeEl.classList.add('show');
    Sound.freeze();
    const heartInt = setInterval(() => Sound.heart(), 600);

    setTimeout(() => {
      clearInterval(heartInt);
      freezeEl.classList.remove('show');

      Sound.rainbow();
      state.reels.forEach((r, i) => {
        r.spinning = true;
        const cands = [];
        for (let k = 0; k < STRIP_LEN; k++) {
          if (REEL_STRIPS[i][k] === 'BAR') cands.push(k);
        }
        r.targetIndex = cands[0] || 0;
      });

      const rainbowEnd = performance.now() + 2200;
      function rainbowFrame() {
        const t = (performance.now() / 200) % 1;
        const grad = fctx.createLinearGradient(0, 0, cw(), ch());
        grad.addColorStop(0, 'rgba(255,255,0,0.4)');
        grad.addColorStop((0.33 + t) % 1, 'rgba(255,0,255,0.4)');
        grad.addColorStop((0.66 + t) % 1, 'rgba(0,255,255,0.4)');
        grad.addColorStop(1, 'rgba(255,255,0,0.4)');
        fctx.clearRect(0, 0, cw(), ch());
        fctx.fillStyle = grad;
        fctx.fillRect(0, 0, cw(), ch());
        if (performance.now() < rainbowEnd) requestAnimationFrame(rainbowFrame);
        else fctx.clearRect(0, 0, cw(), ch());
      }
      requestAnimationFrame(rainbowFrame);

      setTimeout(() => {
        state.reels.forEach((r, i) => animateReelStop(i));
        setTimeout(() => {
          state.inFreeze = false;
          enterUpperAT();
          state.bigWinHistory.push('FREEZE');
          state.spinning = false;
          state.canStop = false;
          btnLever.disabled = false;
        }, 600);
      }, 2200);
    }, 2000);
  }

  // ==================== Effects ====================
  function showCutin(line1, line2) {
    cutinLine1.textContent = line1;
    cutinLine2.textContent = line2;
    cutin.classList.remove('show');
    void cutin.offsetWidth;
    cutin.classList.add('show');
    reelFrame.classList.remove('shake');
    void reelFrame.offsetWidth;
    reelFrame.classList.add('shake');
    setTimeout(() => cutin.classList.remove('show'), 1900);
  }

  function flashFrame(color) {
    fctx.save();
    fctx.fillStyle = color;
    fctx.globalAlpha = 0.6;
    fctx.fillRect(0, 0, cw(), ch());
    fctx.restore();
    setTimeout(() => fctx.clearRect(0, 0, cw(), ch()), 80);
  }

  function spawnFloater(text, kind = 'gain') {
    const el = document.createElement('div');
    el.className = `floater ${kind}`;
    el.textContent = text;
    el.style.left = `${30 + Math.random() * 40}%`;
    el.style.top = `${40 + Math.random() * 20}%`;
    floaters.appendChild(el);
    setTimeout(() => el.remove(), 1100);
  }

  // ==================== Push-order navigation overlay (big + obvious) ====================
  function updateNavOverlay() {
    clearNavOverlay();
    if (!state.pushOrder) return;
    state.pushOrder.forEach((reelIdx, orderIdx) => {
      const btn = stopBtns[reelIdx];
      if (orderIdx < state.pushOrderProgress) {
        // Already pressed — show green check
        btn.classList.add('nav-done');
        const check = document.createElement('div');
        check.className = 'nav-check';
        check.textContent = '✓';
        btn.appendChild(check);
        return;
      }
      const numEl = document.createElement('div');
      numEl.className = 'nav-num';
      numEl.textContent = String(orderIdx + 1);
      btn.appendChild(numEl);
      if (orderIdx === state.pushOrderProgress) {
        btn.classList.add('nav-next');
        const arrow = document.createElement('div');
        arrow.className = 'nav-arrow';
        arrow.textContent = '▼';
        btn.appendChild(arrow);
      }
    });
  }
  function clearNavOverlay() {
    stopBtns.forEach(b => {
      b.classList.remove('nav-next', 'nav-done');
      b.querySelectorAll('.nav-num, .nav-arrow, .nav-check').forEach(n => n.remove());
    });
  }

  // ==================== Status / mode bar ====================
  function setModeName(iconKey, label) {
    while (modeNameEl.firstChild) modeNameEl.removeChild(modeNameEl.firstChild);
    if (iconKey && MODE_ICONS[iconKey]) {
      const img = document.createElement('img');
      img.src = MODE_ICONS[iconKey];
      img.alt = '';
      img.className = 'mode-icon-img';
      modeNameEl.appendChild(img);
    }
    modeNameEl.appendChild(document.createTextNode(label));
  }

  function updateStatus() {
    medalEl.textContent = state.medal;
    gamesEl.textContent = state.games;
    const diff = state.medal - state.initialMedal;
    diffEl.textContent = (diff >= 0 ? '+' : '') + diff;
    modeNameEl.classList.remove('cz', 'at', 'upper-at');
    let counter = '';
    let extra = '';
    switch (state.mode) {
      case 'cz': {
        const entryMap = { one: '1図柄', three: '3図柄', five: '5図柄', suika: 'スイカ', cherry: 'チェリー' };
        const entryLabel = entryMap[state.czEntrySymbol] || '';
        setModeName('cz', '暗黒星雲CHANCE');
        counter = `${entryLabel} 残${state.czRemainingG}G`;
        modeNameEl.classList.add('cz');
        break;
      }
      case 'at':
        setModeName('at', '暗黒星雲MODE');
        counter = `残${state.atRemainingG}G`;
        modeNameEl.classList.add('at');
        break;
      case 'revival':
        setModeName('revival', '復活CHANCE');
        counter = `残${state.revivalRemainingG}G`;
        modeNameEl.classList.add('cz');
        break;
      case 'upperAt':
        setModeName('upperAt', '超闇暗黒星雲MODE');
        counter = `残${state.atRemainingG}G`;
        modeNameEl.classList.add('upper-at');
        extra = '転落抽選中';
        break;
      default:
        setModeName(null, '通常');
        counter = '';
    }
    modeCounterEl.textContent = counter;
    modeExtraEl.textContent = extra;
  }

  // ==================== Input ====================
  btnLever.addEventListener('click', startSpin);
  stopBtns.forEach((b, i) => {
    b.addEventListener('click', () => requestStop(i));
    b.disabled = true;
  });
  btnMute.addEventListener('click', () => {
    const m = Sound.toggleMute();
    imgMute.src = m ? 'assets/ui/mute_off.png' : 'assets/ui/mute_on.png';
  });
  btnRestart.addEventListener('click', () => {
    if (!confirm('リスタートしますか？（メダルがリセットされます）')) return;
    state.medal = 1000;
    state.initialMedal = 1000;
    state.games = 0;
    state.mode = 'normal';
    state.czEntrySymbol = null;
    state.czRemainingG = 0;
    state.atRemainingG = 0;
    state.revivalRemainingG = 0;
    state.nextSpecialForce = false;
    state.spinning = false;
    state.canStop = false;
    state.currentLottery = null;
    state.pushOrder = null;
    state.pushOrderProgress = 0;
    state.pushOrderHit = true;
    state.lastWasReplay = false;
    state.stoppedCount = 0;
    state.inFreeze = false;
    state.bigWinHistory = [];
    state.reels.forEach(r => { r.spinning = false; r.stopRequested = false; r.pos = 0; });
    btnLever.disabled = false;
    stopBtns.forEach(b => { b.disabled = true; });
    clearNavOverlay();
    applyModeBodyClass();
    updateStatus();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === ' ') { e.preventDefault(); startSpin(); }
    else if (e.key === 'z' || e.key === 'Z') requestStop(0);
    else if (e.key === 'x' || e.key === 'X') requestStop(1);
    else if (e.key === 'c' || e.key === 'C') requestStop(2);
  }, { passive: false });

  btnStart.addEventListener('click', () => {
    Sound.prime();
    startOverlay.classList.remove('show');
    btnLever.disabled = false;
    updateStatus();
  });

  // ==================== Share ====================
  btnShare.addEventListener('click', () => openShare());
  btnShareClose.addEventListener('click', () => shareOverlay.classList.remove('show'));
  btnShareX.addEventListener('click', () => {
    const text = buildShareText();
    const url = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(SHARE_URL)}&hashtags=` + encodeURIComponent('てんちょースロット');
    window.open(url, '_blank', 'noopener,noreferrer');
  });

  function buildShareText() {
    const diff = state.medal - state.initialMedal;
    const sign = diff >= 0 ? '+' : '';
    let line = `てんちょースロットで ${state.games}G 回して ${sign}${diff}枚！`;
    if (state.bigWinHistory.includes('FREEZE')) line = `🌌 フリーズ引いた！${line}`;
    return line;
  }

  function openShare() {
    const text = buildShareText();
    shareTextPreview.textContent = text;
    shareUrlEl.textContent = SHARE_URL;
    while (qrCodeEl.firstChild) qrCodeEl.removeChild(qrCodeEl.firstChild);
    const img = document.createElement('img');
    img.src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(SHARE_URL)}`;
    img.alt = 'QR';
    img.width = 180;
    img.height = 180;
    img.style.cssText = 'display:block;width:180px;height:180px;background:#fff;border:2px solid #000;border-radius:6px;';
    qrCodeEl.appendChild(img);
    shareOverlay.classList.add('show');
  }

  // ==================== Init ====================
  preloadSymbols();
  resizeCanvas();
  applyModeBodyClass();
  drawReels();
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => drawReels());
  }
  updateStatus();
  btnLever.disabled = true;
  stopBtns.forEach(b => { b.disabled = true; });
})();
