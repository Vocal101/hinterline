// Procedural sound: UI and construction effects, vehicle sounds, ambient beds and generative music.
(function (root) {
  const HL = root.HL;
  const A = HL.Audio = {};
  let ac = null, master, sfx, amb, mus, noiseBuf;
  A.ready = false;

  A.init = function () {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    master = ac.createGain(); master.connect(ac.destination);
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3;
    comp.connect(master);
    sfx = ac.createGain(); sfx.connect(comp);
    amb = ac.createGain(); amb.connect(comp);
    mus = ac.createGain(); mus.connect(comp);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    A.applyVolumes();
    initAmbient();
    A.ready = true;
    Music.start();
  };
  A.applyVolumes = function () {
    if (!ac) return;
    const s = HL.Meta.settings;
    master.gain.value = s.vol;
    sfx.gain.value = s.sfx * 0.9;
    amb.gain.value = s.ambient * 0.55;
    mus.gain.value = s.music * 0.42;
  };
  const now = () => ac.currentTime;
  function env(g, t, a, peak, d, sus) { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sus || 0.0001), t + a + d); }
  function osc(type, f, t, dur, peak, dest, o) {
    o = o || {};
    const os = ac.createOscillator(); os.type = type; os.frequency.setValueAtTime(f, t);
    if (o.to) os.frequency.exponentialRampToValueAtTime(o.to, t + (o.glide || dur));
    if (o.detune) os.detune.value = o.detune;
    const g = ac.createGain(); env(g, t, o.a || 0.005, peak, dur);
    let node = os;
    if (o.lp) { const f2 = ac.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = o.lp; os.connect(f2); node = f2; }
    node.connect(g); g.connect(dest || sfx);
    os.start(t); os.stop(t + (o.a || 0.005) + dur + 0.05);
    return os;
  }
  function noise(t, dur, peak, type, freq, q, dest, o) {
    o = o || {};
    const src = ac.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ac.createBiquadFilter(); f.type = type || 'bandpass'; f.frequency.setValueAtTime(freq || 1000, t); f.Q.value = q || 1;
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    const g = ac.createGain(); env(g, t, o.a || 0.003, peak, dur);
    src.connect(f); f.connect(g); g.connect(dest || sfx);
    src.start(t, Math.random()); src.stop(t + dur + (o.a || 0) + 0.1);
  }
  const ok = () => ac && ac.state === 'running' && HL.Meta.settings.vol > 0;
  // throttle repeated sounds
  const lastPlay = {};
  const gate = (k, ms) => { const n = performance.now(); if (lastPlay[k] && n - lastPlay[k] < ms) return false; lastPlay[k] = n; return true; };

  // ---------- UI ----------
  A.ui = function (k) {
    if (!ok() || !gate('ui' + k, 40)) return;
    const t = now();
    if (k === 'click') { osc('triangle', 1250, t, 0.035, 0.08); noise(t, 0.02, 0.05, 'highpass', 3000); }
    else if (k === 'open') { noise(t, 0.09, 0.05, 'bandpass', 2400, 0.7, null, { to: 1200 }); }
    else if (k === 'close') { noise(t, 0.07, 0.04, 'bandpass', 1500, 0.7, null, { to: 2600 }); }
    else if (k === 'error') { osc('square', 196, t, 0.12, 0.05, null, { lp: 900 }); osc('square', 147, t + 0.11, 0.18, 0.05, null, { lp: 900 }); }
    else if (k === 'buy') { A.cash(true); }
    else if (k === 'news') { osc('sine', 880, t, 0.25, 0.06); osc('sine', 1320, t + 0.08, 0.3, 0.05); }
    else if (k === 'ach') { [523, 659, 784, 1047].forEach((f, i) => osc('triangle', f, t + i * 0.09, 0.4, 0.07)); }
  };
  A.cash = function (soft) {
    if (!ok() || !gate('cash', 120)) return;
    const t = now(), v = soft ? 0.5 : 1;
    noise(t, 0.05, 0.12 * v, 'bandpass', 3500, 2);
    [2637, 3520, 5274].forEach((f, i) => osc('sine', f, t + 0.04 + i * 0.012, 0.6, 0.06 * v));
    osc('triangle', 1318, t + 0.04, 0.5, 0.05 * v);
  };
  A.build = function (k) {
    if (!ok() || !gate('b' + k, 60)) return;
    const t = now();
    switch (k) {
      case 'rail': for (let i = 0; i < 3; i++) { noise(t + i * 0.07, 0.06, 0.18, 'bandpass', 2200 + i * 300, 4); osc('square', 620 + i * 40, t + i * 0.07, 0.08, 0.03, null, { lp: 2500 }); } break;
      case 'road': noise(t, 0.18, 0.25, 'lowpass', 500); noise(t + 0.12, 0.12, 0.15, 'lowpass', 400); break;
      case 'station': case 'build': for (let i = 0; i < 4; i++) { noise(t + i * 0.09, 0.05, 0.2, 'bandpass', 900 + (i % 2) * 300, 3); } break;
      case 'demolish': noise(t, 0.5, 0.35, 'lowpass', 300, 1, null, { to: 120 }); noise(t + 0.05, 0.3, 0.2, 'bandpass', 1200, 1.5); break;
      case 'dig': noise(t, 0.25, 0.25, 'bandpass', 700, 1.2, null, { to: 300 }); break;
      case 'signal': noise(t, 0.04, 0.2, 'bandpass', 3000, 5); noise(t + 0.08, 0.04, 0.15, 'bandpass', 2400, 5); break;
      case 'tree': noise(t, 0.35, 0.12, 'highpass', 3500, 0.5); break;
      case 'splash': noise(t, 0.35, 0.2, 'lowpass', 1500, 1, null, { to: 400 }); break;
      case 'bridge': for (let i = 0; i < 5; i++) noise(t + i * 0.1, 0.08, 0.2, 'bandpass', 1800 - i * 100, 6); break;
    }
  };
  // ---------- vehicles ----------
  // pan/volume from screen position
  function spatial(sx, sy) {
    if (sx == null) return { v: 1, pan: 0 };
    const R = HL.R, cx = R.vw / 2, cy = R.vh / 2;
    const d = Math.hypot(sx - cx, sy - cy) / Math.max(R.vw, R.vh);
    return { v: Math.max(0, 1 - d * 1.6) * Math.min(1, 0.4 + R.cam.z * 0.5), pan: HL.clamp((sx - cx) / cx, -1, 1) };
  }
  function panned(sp) { const p = ac.createStereoPanner(); p.pan.value = sp.pan * 0.8; const g = ac.createGain(); g.gain.value = sp.v; p.connect(g); g.connect(sfx); return p; }
  A.whistle = function (kind, sx, sy) {
    if (!ok() || !gate('wh', 900)) return;
    const sp = spatial(sx, sy); if (sp.v < 0.05) return;
    const out = panned(sp), t = now();
    if (kind === 'steam') {
      [523, 659, 784].forEach((f, i) => osc('sine', f * 1.0, t, 0.9, 0.07, out, { a: 0.06, to: f * 0.985, glide: 0.9 }));
      noise(t, 0.9, 0.05, 'bandpass', 2600, 1.5, out, { a: 0.05 });
    } else if (kind === 'diesel') {
      osc('sawtooth', 311, t, 0.55, 0.05, out, { a: 0.03, lp: 1400 }); osc('sawtooth', 370, t, 0.55, 0.05, out, { a: 0.03, lp: 1400 });
    } else if (kind === 'electric') {
      osc('triangle', 698, t, 0.25, 0.06, out); osc('triangle', 587, t + 0.28, 0.35, 0.06, out);
    } else if (kind === 'ship') {
      osc('sawtooth', 98, t, 1.6, 0.08, out, { a: 0.12, lp: 500 }); osc('sawtooth', 123, t, 1.6, 0.05, out, { a: 0.12, lp: 500 });
    } else if (kind === 'bus') { osc('square', 440, t, 0.15, 0.03, out, { lp: 1800 }); osc('square', 523, t, 0.15, 0.03, out, { lp: 1800 }); }
  };
  A.plane = function (sx, sy) {
    if (!ok() || !gate('pl', 1500)) return;
    const sp = spatial(sx, sy); if (sp.v < 0.05) return;
    noise(now(), 2.5, 0.12, 'bandpass', 800, 0.7, panned(sp), { a: 0.6, to: 300 });
  };
  A.crash = function (sx, sy) {
    if (!ok()) return;
    const sp = spatial(sx, sy); const out = panned({ v: Math.max(0.35, sp.v), pan: sp.pan }), t = now();
    noise(t, 1.6, 0.6, 'lowpass', 900, 0.8, out, { to: 80 });
    noise(t, 0.4, 0.35, 'bandpass', 2500, 1, out);
    osc('sine', 60, t, 1.2, 0.3, out, { to: 30 });
  };
  A.thunder = function () {
    if (!ok()) return;
    const t = now() + 0.3 + Math.random();
    noise(t, 3, 0.3, 'lowpass', 300, 0.7, amb, { a: 0.05, to: 60 });
  };
  A.clunk = function (sx, sy) { if (!ok() || !gate('clunk', 400)) return; const sp = spatial(sx, sy); if (sp.v < 0.05) return; const out = panned(sp); noise(now(), 0.25, 0.25, 'lowpass', 400, 1, out); };

  // ---------- ambient ----------
  const beds = {};
  function bed(name, type, freq, q) {
    const src = ac.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q || 0.7;
    const g = ac.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(amb); src.start();
    beds[name] = { g, f };
  }
  function initAmbient() {
    bed('waves', 'lowpass', 500); bed('wind', 'bandpass', 600, 0.5); bed('rain', 'highpass', 2500); bed('town', 'lowpass', 220);
  }
  let chirpT = 0;
  A.ambientTick = function (view) {
    if (!ac || !A.ready) return;
    const t = now(), e = HL.R.env;
    const set = (k, v) => beds[k].g.gain.setTargetAtTime(v, t, 0.8);
    set('waves', view.water * 0.5 * (0.7 + 0.3 * Math.sin(t * 0.4)));
    beds.waves.f.frequency.setTargetAtTime(380 + 200 * Math.sin(t * 0.3), t, 1);
    set('wind', 0.06 + (HL.G.g.opts.climate === 'arctic' ? 0.18 : 0) + (HL.G.g.weather.storm ? 0.25 : 0) + view.height * 0.02);
    beds.wind.f.frequency.setTargetAtTime(450 + 300 * Math.sin(t * 0.13), t, 2);
    set('rain', (e.rain || 0) * 0.35);
    set('town', view.town * 0.25);
    // birds by day, crickets at night
    if (t > chirpT) {
      chirpT = t + 0.4 + Math.random() * 2.2;
      if (view.trees > 0.15 && e.dark < 0.3 && e.season !== 3 && !e.rain && HL.G.g.opts.climate !== 'arctic') {
        const f = 2200 + Math.random() * 1800, n = 2 + (Math.random() * 3 | 0);
        for (let i = 0; i < n; i++) osc('sine', f, t + i * 0.09, 0.07, 0.025 * view.trees, amb, { to: f * (Math.random() < 0.5 ? 1.3 : 0.75), glide: 0.06 });
      } else if (e.dark > 0.5 && e.season < 3 && view.trees + view.grass > 0.2) {
        for (let i = 0; i < 6; i++) osc('sine', 4300, t + i * 0.045, 0.02, 0.012, amb);
      }
    }
  };

  // ---------- generative music: a small parlour jazz trio ----------
  const Music = A.Music = {};
  const NOTE = n => 440 * Math.pow(2, (n - 69) / 12);
  // chord tones as semitone offsets from the key root
  const PROG = [
    [[2, 5, 9, 12], [7, 11, 14, 17], [0, 4, 7, 11], [9, 12, 16, 19]],   // ii V I vi
    [[0, 4, 7, 11], [9, 12, 16, 19], [2, 5, 9, 12], [7, 11, 14, 17]],   // I vi ii V
    [[5, 9, 12, 16], [4, 7, 11, 14], [2, 5, 9, 12], [7, 11, 14, 17]],   // IV iii ii V
    [[0, 4, 7, 11], [5, 9, 12, 16], [10, 14, 17, 21], [7, 11, 14, 17]],  // I IV bVII V
  ];
  let mt = 0, beat = 0, key = 60, prog = 0, bars = 0, playing = false, timer = null, restUntil = 0;
  const BPM = 96;
  Music.start = function () {
    if (playing || !ac) return;
    playing = true; mt = now() + 0.3; beat = 0;
    timer = setInterval(sched, 120);
  };
  Music.stop = function () { playing = false; clearInterval(timer); };
  function piano(f, t, dur, vel) {
    // additive tone with a quick decay, slightly detuned partials
    const g = ac.createGain(); g.connect(mus);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vel, t + 0.008); g.gain.exponentialRampToValueAtTime(vel * 0.35, t + 0.25); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.4);
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400; lp.connect(g);
    [[1, 1], [2, 0.35], [3, 0.12], [4.01, 0.06]].forEach(([m, a]) => { const o = ac.createOscillator(); o.type = 'sine'; o.frequency.value = f * m; o.detune.value = (Math.random() - 0.5) * 6; const og = ac.createGain(); og.gain.value = a; o.connect(og); og.connect(lp); o.start(t); o.stop(t + dur + 0.5); });
  }
  function bass(f, t, dur) {
    const o = ac.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
    const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.32, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
    o.connect(lp); lp.connect(g); g.connect(mus); o.start(t); o.stop(t + dur + 0.05);
  }
  function brush(t, v) { const src = ac.createBufferSource(); src.buffer = noiseBuf; const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 5000; f.Q.value = 0.6; const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18); src.connect(f); f.connect(g); g.connect(mus); src.start(t, Math.random()); src.stop(t + 0.25); }
  function sched() {
    if (!playing || !ac) return;
    if (HL.Meta.settings.music <= 0 || HL.Meta.settings.vol <= 0) { mt = now() + 0.2; return; }
    const spb = 60 / BPM;
    while (mt < now() + 0.6) {
      if (mt < restUntil) { mt = restUntil; continue; }
      const bar = Math.floor(beat / 4), b = beat % 4;
      const chord = PROG[prog][bar % 4];
      const swing = b % 2 ? spb * 0.12 : 0;
      // walking bass
      const bn = key - 24 + (b === 0 ? chord[0] : b === 2 ? chord[2] - 12 : b === 1 ? chord[1] - 12 : chord[0] + (Math.random() < 0.5 ? 1 : -1) + 0);
      bass(NOTE(bn), mt, spb * 0.9);
      // brushes on 2 and 4, soft sweep otherwise
      brush(mt + swing, b % 2 ? 0.07 : 0.03);
      // piano comping on the off-beats, melody fragments now and then
      if (b === 1 || (b === 3 && Math.random() < 0.6)) for (const n of chord.slice(1)) piano(NOTE(key + n - (n > 14 ? 12 : 0)), mt + spb * 0.5 + swing, spb * 0.6, 0.035);
      if (Math.random() < 0.55) {
        const scale = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16];
        const n = chord[Math.floor(Math.random() * 4)] + (Math.random() < 0.4 ? scale[Math.floor(Math.random() * scale.length)] - chord[0] : 0);
        piano(NOTE(key + 12 + n), mt + (Math.random() < 0.5 ? 0 : spb * 0.5 + spb * 0.12), spb * (0.4 + Math.random() * 0.8), 0.05);
      }
      beat++; mt += spb;
      if (beat % 16 === 0) {
        bars += 4;
        if (bars % 16 === 0) { prog = Math.floor(Math.random() * PROG.length); key = 55 + Math.floor(Math.random() * 10); }
        if (bars % 48 === 0) restUntil = mt + 8 + Math.random() * 14; // pause between "tunes"
      }
    }
  }

  // ---------- game hooks ----------
  A.hook = function () {
    HL.on('depart', (v) => {
      const g = HL.G.g; if (!g || v.owner !== g.player && Math.random() < 0.7) return;
      if (v.kind === 'air' || v.offscreen) return;
      const p = HL.R.tileToScreen(v.px, v.py, v.pz);
      const m = HL.VEH[v.model];
      if (v.kind === 'rail') A.whistle(m.fuel === 'steam' ? 'steam' : m.fuel === 'diesel' ? 'diesel' : 'electric', p[0], p[1]);
      else if (v.kind === 'ship') A.whistle('ship', p[0], p[1]);
      else if (v.kind === 'road' && m.cargo === 'pax' && Math.random() < 0.3) A.whistle('bus', p[0], p[1]);
    });
    HL.on('income', (v, amt, s) => {
      const g = HL.G.g; if (!g || v.owner !== g.player || amt <= 0) return;
      const p = HL.R.tileToScreen(s.x + 0.5, s.y + 0.5);
      if (p[0] > 0 && p[1] > 0 && p[0] < HL.R.vw && p[1] < HL.R.vh) { A.cash(true); HL.UI.cashPop(amt, p[0], p[1] - 20); }
    });
    HL.on('crash', (v) => { const p = HL.R.tileToScreen(v.px, v.py, v.pz); A.crash(p[0], p[1]); });
    HL.on('touchdown', (v) => { if (v.offscreen) return; const p = HL.R.tileToScreen(v.px, v.py, v.pz); A.plane(p[0], p[1]); });
    HL.on('breakdown', (v) => { if (v.offscreen) return; const p = HL.R.tileToScreen(v.px, v.py, v.pz); A.clunk(p[0], p[1]); });
  };
})(typeof window !== 'undefined' ? window : globalThis);
