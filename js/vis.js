// Vehicle models and drawing. Models face +X, are centred on the origin and sit on z = 0 (rail/road surface).
(function (root) {
  const HL = root.HL, Gx = HL.Gfx, R = HL.R;
  const Vis = HL.Vis = {};
  const M = () => new Gx.Model();
  const YAWS = 64;

  // ---------- shared parts ----------
  function wheelsY(m, x0, x1, n, r, y, col) {
    for (let i = 0; i < n; i++) {
      const x = n === 1 ? (x0 + x1) / 2 : x0 + (x1 - x0) * i / (n - 1);
      for (const s of [-1, 1]) m.cylH(y * s - 0.01, y * s + 0.01, x, r, r, col || '#262626', { axis: 'y', n: 8, cap: '#3a3a3a' });
    }
  }
  function bogies(m, L, w) { m.box(-L / 2 + 0.02, -w / 2 + 0.01, 0.02, L / 2 - 0.02, w / 2 - 0.01, 0.06, '#2a2a2a'); wheelsY(m, -L / 2 + 0.08, L / 2 - 0.08, 4, 0.032, w / 2 - 0.005); }
  const winPaint = (n, col, lit) => (ctx, w, h, sh, br, night) => {
    for (let i = 0; i < n; i++) {
      const x = (i + 0.5) * w / n - w / n * 0.32;
      if (night) { ctx.fillStyle = '#ffd890'; ctx.fillRect(x, h * 0.45, w / n * 0.64, h * 0.3); continue; }
      ctx.fillStyle = sh(col || '#2e3c48'); ctx.fillRect(x, h * 0.45, w / n * 0.64, h * 0.3);
      ctx.fillStyle = sh('#a8c0d0', 0.4); ctx.fillRect(x, h * 0.62, w / n * 0.3, h * 0.12);
    }
  };
  const stripe = (col, at, th) => (ctx, w, h, sh, br, night) => { if (night) return; ctx.fillStyle = sh(col); ctx.fillRect(0, h * at, w, h * (th || 0.08)); };
  const combine = (...fs) => (ctx, w, h, sh, br, night) => { for (const f of fs) if (f) f(ctx, w, h, sh, br, night); };

  // ---------- locomotives ----------
  function steam(m, L, liv, o) {
    const W = 0.16, boilerR = o.boiler || 0.062, bz = 0.15;
    const front = L / 2, tenderL = o.tender || L * 0.32;
    const cabX = front - L + tenderL;            // rear of cab
    const body = o.black ? '#26282a' : liv.main;
    // frame
    m.box(-L / 2, -W / 2 + 0.02, 0.04, L / 2, W / 2 - 0.02, 0.08, '#1e1e1e');
    // tender
    m.box(-L / 2 + 0.01, -W / 2, 0.06, -L / 2 + tenderL, W / 2, 0.22, body, { paint: { x: stripe(liv.accent, 0.55, 0.06), y: stripe(liv.accent, 0.55, 0.06) } });
    m.box(-L / 2 + 0.03, -W / 2 + 0.02, 0.22, -L / 2 + tenderL - 0.02, W / 2 - 0.02, 0.24, '#141414');
    // cab
    const c0 = -L / 2 + tenderL + 0.01, c1 = c0 + 0.13;
    m.box(c0, -W / 2, 0.08, c1, W / 2, 0.29, body, { paint: { x: winPaint(1, '#1c1c1c'), y: combine(winPaint(1, '#1c1c1c'), stripe(liv.accent, 0.3, 0.05)) } });
    m.box(c0 - 0.01, -W / 2 - 0.01, 0.29, c1 + 0.02, W / 2 + 0.01, 0.31, '#2a2a2a');
    // boiler
    if (o.streamline) {
      m.box(c1, -W / 2 + 0.005, 0.08, front - 0.12, W / 2 - 0.005, 0.27, body, { paint: { x: stripe(liv.accent, 0.4, 0.07), y: stripe(liv.accent, 0.4, 0.07) } });
      m.face([[front - 0.12, -W / 2 + 0.005, 0.27], [front, -W / 2 + 0.03, 0.12], [front, W / 2 - 0.03, 0.12], [front - 0.12, W / 2 - 0.005, 0.27]], body);
      m.face([[front - 0.12, W / 2 - 0.005, 0.08], [front, W / 2 - 0.03, 0.08], [front, W / 2 - 0.03, 0.12], [front - 0.12, W / 2 - 0.005, 0.27]], body);
      m.face([[front, -W / 2 + 0.03, 0.08], [front - 0.12, -W / 2 + 0.005, 0.08], [front - 0.12, -W / 2 + 0.005, 0.27], [front, -W / 2 + 0.03, 0.12]], body);
      m.face([[front, -W / 2 + 0.03, 0.08], [front, W / 2 - 0.03, 0.08], [front, W / 2 - 0.03, 0.12], [front, -W / 2 + 0.03, 0.12]], '#1a1a1a');
    } else {
      m.cylH(c1, front - 0.04, 0, bz, boilerR, body, { n: 10, cap: '#2a2a2a', paint: stripe(liv.accent, 0.5, 0.05) });
      m.cylH(front - 0.06, front - 0.01, 0, bz, boilerR + 0.004, '#2c2c2c', { n: 10, cap: '#1a1a1a' });
      // chimney and dome
      m.cyl(front - 0.07, 0, bz + boilerR - 0.01, bz + boilerR + (o.tallChimney ? 0.08 : 0.055), 0.022, '#1e1e1e', { n: 8, r1: 0.026 });
      m.cyl((c1 + front) / 2, 0, bz + boilerR - 0.01, bz + boilerR + 0.025, 0.026, o.brass ? '#c9a046' : body, { n: 8, r1: 0.016 });
      // running boards and buffer beam
      m.box(c1, -W / 2 - 0.005, 0.08, front, -W / 2 + 0.015, 0.09, '#2a2a2a');
      m.box(c1, W / 2 - 0.015, 0.08, front, W / 2 + 0.005, 0.09, '#2a2a2a');
      m.box(front - 0.02, -W / 2, 0.04, front + 0.01, W / 2, 0.1, '#b0302a');
    }
    // driving wheels
    const drivers = o.drivers || 2, dr = o.driverR || 0.05;
    wheelsY(m, c1 - 0.02, front - 0.09 - (o.leading ? 0.08 : 0), drivers, dr, W / 2 - 0.005, o.redWheels ? '#6a1e1a' : '#222');
    if (o.leading) wheelsY(m, front - 0.08, front - 0.04, 1, 0.03, W / 2 - 0.01);
    wheelsY(m, -L / 2 + 0.05, -L / 2 + tenderL - 0.05, 2, 0.03, W / 2 - 0.005);
    m.light(front + 0.01, 0, 0.13, 10, '#fff2c8');
    m.chimney = [front - 0.07, 0, bz + boilerR + 0.08];
  }
  function dieselBody(m, L, liv, o) {
    const W = 0.17, H = o.h || 0.27;
    m.box(-L / 2, -W / 2 + 0.01, 0.04, L / 2, W / 2 - 0.01, 0.08, '#1e1e1e');
    bogies(m, L, W);
    const col = liv.main, acc = liv.accent;
    if (o.hood) {
      // long hood with the cab at the front third
      const cab0 = L / 2 - 0.2, cab1 = L / 2 - 0.06;
      m.box(-L / 2 + 0.03, -W / 2 + 0.03, 0.08, cab0, W / 2 - 0.03, H - 0.04, col, { paint: { x: stripe(acc, 0.35, 0.12), y: combine(stripe(acc, 0.35, 0.12), (ctx, w, h, sh, br, night) => { if (night) return; ctx.strokeStyle = sh('#000', 0.3); ctx.lineWidth = 0.006; for (let u = 0.04; u < w; u += 0.06) { ctx.beginPath(); ctx.moveTo(u, h * 0.55); ctx.lineTo(u, h * 0.9); ctx.stroke(); } }) } });
      m.box(cab0, -W / 2, 0.08, cab1, W / 2, H, col, { paint: { x: winPaint(1), y: combine(winPaint(1), stripe(acc, 0.35, 0.12)) } });
      m.box(cab1, -W / 2 + 0.03, 0.08, L / 2 - 0.01, W / 2 - 0.03, H - 0.09, col, { paint: { x: stripe(acc, 0.35, 0.2) } });
      m.cyl(-L / 4, 0, H - 0.04, H + 0.0, 0.018, '#222', { n: 6 });
      m.exhaust = [-L / 4, 0, H];
    } else if (o.wedge) {
      m.box(-L / 2 + 0.02, -W / 2, 0.08, L / 2 - 0.16, W / 2, H, col, { paint: { x: combine(winPaint(4, '#22303a'), stripe(acc, 0.22, 0.14)), y: combine(winPaint(4, '#22303a'), stripe(acc, 0.22, 0.14)) } });
      const n0 = L / 2 - 0.16, tip = L / 2;
      m.face([[n0, -W / 2, H], [tip, -W / 2 + 0.03, 0.12], [tip, W / 2 - 0.03, 0.12], [n0, W / 2, H]], col, { paint: (ctx, w, h, sh, br, night) => { ctx.fillStyle = night ? '#ffe8b0' : sh('#1e2a34'); ctx.fillRect(w * 0.15, h * 0.05, w * 0.7, h * 0.45); } });
      m.face([[n0, W / 2, 0.08], [tip, W / 2 - 0.03, 0.08], [tip, W / 2 - 0.03, 0.12], [n0, W / 2, H]], acc);
      m.face([[tip, -W / 2 + 0.03, 0.08], [n0, -W / 2, 0.08], [n0, -W / 2, H], [tip, -W / 2 + 0.03, 0.12]], acc);
      m.face([[tip, -W / 2 + 0.03, 0.08], [tip, W / 2 - 0.03, 0.08], [tip, W / 2 - 0.03, 0.12], [tip, -W / 2 + 0.03, 0.12]], '#e6c43a');
      m.exhaust = [0, 0, H];
    } else {
      // full-width body, cab windows at each end
      const ends = (ctx, w, h, sh, br, night) => { ctx.fillStyle = night ? '#ffe2a0' : sh('#1e2a34'); ctx.fillRect(w * 0.15, h * 0.5, w * 0.7, h * 0.28); };
      m.box(-L / 2 + 0.01, -W / 2, 0.08, L / 2 - 0.01, W / 2, H, col, { paint: { x: combine(ends, stripe(acc, 0.3, 0.1)), nx: ends, y: combine(winPaint(2, '#22303a'), stripe(acc, 0.3, 0.1)), ny: combine(winPaint(2, '#22303a'), stripe(acc, 0.3, 0.1)) } });
      m.box(-L / 2 + 0.03, -W / 2 + 0.02, H, L / 2 - 0.03, W / 2 - 0.02, H + 0.015, '#4a4e52');
      if (o.panto) {
        // pantograph frame
        const px = o.panto;
        m.face([[px - 0.06, -0.04, H + 0.015], [px, -0.035, H + 0.1], [px, -0.03, H + 0.1], [px - 0.055, -0.035, H + 0.015]], '#222', { twoSided: true });
        m.face([[px + 0.06, 0.04, H + 0.015], [px, 0.035, H + 0.1], [px, 0.03, H + 0.1], [px + 0.055, 0.035, H + 0.015]], '#222', { twoSided: true });
        m.box(px - 0.012, -0.07, H + 0.1, px + 0.012, 0.07, H + 0.11, '#333');
      } else m.exhaust = [0, 0, H + 0.015];
      if (o.nose) {
        const tip = L / 2 + o.nose;
        m.face([[L / 2 - 0.01, -W / 2, H], [tip, -0.02, 0.12], [tip, 0.02, 0.12], [L / 2 - 0.01, W / 2, H]], col, { paint: (ctx, w, h, sh, br, night) => { ctx.fillStyle = night ? '#ffe8b0' : sh('#1e2a34'); ctx.fillRect(w * 0.15, h * 0.05, w * 0.7, h * 0.4); } });
        m.face([[L / 2 - 0.01, W / 2, 0.08], [tip, 0.02, 0.08], [tip, 0.02, 0.12], [L / 2 - 0.01, W / 2, H]], acc);
        m.face([[tip, -0.02, 0.08], [L / 2 - 0.01, -W / 2, 0.08], [L / 2 - 0.01, -W / 2, H], [tip, -0.02, 0.12]], acc);
      }
    }
    m.light(L / 2 + (o.nose || 0) + 0.01, 0, 0.12, 10, '#fff4d8');
  }
  function maglevBody(m, L, liv, o) {
    const W = 0.17, H = 0.2;
    const z0 = o.mono ? 0.1 : 0.05;
    if (o.mono) m.box(-L / 2 + 0.06, -0.03, 0.0, L / 2 - 0.06, 0.03, z0, '#8a8e92');
    m.box(-L / 2 + 0.02, -W / 2, z0, L / 2 - 0.22, W / 2, z0 + H, liv.main, { paint: { x: combine(winPaint(5, '#1c2834'), stripe(liv.accent, 0.18, 0.1)), y: combine(winPaint(5, '#1c2834'), stripe(liv.accent, 0.18, 0.1)) } });
    m.box(-L / 2 + 0.02, -W / 2 + 0.02, z0 + H, L / 2 - 0.24, W / 2 - 0.02, z0 + H + 0.02, '#e8ecee');
    // long tapering nose
    const n0 = L / 2 - 0.22, tip = L / 2 + 0.04;
    const nose = (ctx, w, h, sh, br, night) => { ctx.fillStyle = night ? '#e0f0ff' : sh('#1a2632'); ctx.fillRect(w * 0.1, h * 0.1, w * 0.5, h * 0.5); };
    m.face([[n0, -W / 2, z0 + H], [tip, -0.015, z0 + 0.05], [tip, 0.015, z0 + 0.05], [n0, W / 2, z0 + H]], liv.main, { paint: nose });
    m.face([[n0, W / 2, z0], [tip, 0.015, z0], [tip, 0.015, z0 + 0.05], [n0, W / 2, z0 + H]], liv.main, { paint: stripe(liv.accent, 0.2, 0.15) });
    m.face([[tip, -0.015, z0], [n0, -W / 2, z0], [n0, -W / 2, z0 + H], [tip, -0.015, z0 + 0.05]], liv.main);
    m.light(tip, 0, z0 + 0.05, 14, '#e8f4ff');
  }
  const ENGINE_BUILD = {
    steam_small: (m, L, liv) => steam(m, L, liv, { tender: 0.18, drivers: 2, driverR: 0.045, brass: true, tallChimney: true }),
    steam_goods: (m, L, liv) => steam(m, L, liv, { tender: 0.22, drivers: 3, driverR: 0.04, black: true }),
    steam_express: (m, L, liv) => steam(m, L, liv, { tender: 0.22, drivers: 2, driverR: 0.06, brass: true, leading: true, redWheels: true }),
    steam_heavy: (m, L, liv) => steam(m, L, liv, { tender: 0.26, drivers: 4, driverR: 0.038, black: true, leading: true, boiler: 0.066 }),
    steam_pacific: (m, L, liv) => steam(m, L, liv, { tender: 0.26, drivers: 3, driverR: 0.058, leading: true, boiler: 0.07 }),
    steam_streamline: (m, L, liv) => steam(m, L, liv, { tender: 0.26, drivers: 3, driverR: 0.06, leading: true, streamline: true }),
    diesel_shunter: (m, L, liv) => dieselBody(m, L, liv, { hood: true, h: 0.24 }),
    diesel_hood: (m, L, liv) => dieselBody(m, L, liv, { hood: true }),
    diesel_cab: (m, L, liv) => dieselBody(m, L, liv, {}),
    diesel_heavy: (m, L, liv) => dieselBody(m, L, liv, { h: 0.29 }),
    electric_box: (m, L, liv) => dieselBody(m, L, liv, { panto: 0 }),
    electric_modern: (m, L, liv) => dieselBody(m, L, liv, { panto: -0.08, nose: 0.04 }),
    electric_freight: (m, L, liv) => dieselBody(m, L, liv, { panto: 0.08, h: 0.29 }),
    hst: (m, L, liv) => dieselBody(m, L, liv, { wedge: true }),
    hsr: (m, L, liv) => { dieselBody(m, L - 0.12, liv, { panto: -0.1, nose: 0.14 }); },
    mono: (m, L, liv) => maglevBody(m, L, liv, { mono: true }),
    maglev: (m, L, liv) => maglevBody(m, L, liv, {}),
    maglev2: (m, L, liv) => maglevBody(m, L, liv, {}),
    maglev3: (m, L, liv) => maglevBody(m, L, liv, {}),
  };

  // ---------- wagons ----------
  function wagon(m, art, L, liv, gen, fill, cargo) {
    const W = 0.16;
    const z0 = gen >= 4 ? 0.05 : gen === 3 ? 0.1 : 0.06;
    const frameCol = '#262626';
    if (gen === 3) m.box(-L / 2 + 0.06, -0.03, 0, L / 2 - 0.06, 0.03, z0, '#8a8e92');
    else if (gen < 3) { m.box(-L / 2 + 0.01, -W / 2 + 0.01, 0.04, L / 2 - 0.01, W / 2 - 0.01, z0 + 0.01, frameCol); wheelsY(m, -L / 2 + 0.08, L / 2 - 0.08, gen === 0 ? 2 : 4, 0.03, W / 2 - 0.005); }
    const c = HL.CARGO[cargo] || {};
    const loadCol = c.load || c.col || '#666';
    const body = gen >= 3 ? liv.main : gen === 0 ? (art === 'wagon_coach' ? liv.main : '#6a4a34') : gen === 1 ? '#5a5e62' : '#7a8086';
    switch (art) {
      case 'wagon_coach': {
        const H = gen === 0 ? 0.2 : 0.22;
        const wp = combine(winPaint(gen === 0 ? 4 : 6, '#24323e'), stripe(liv.accent, 0.3, 0.05));
        m.box(-L / 2 + 0.01, -W / 2, z0, L / 2 - 0.01, W / 2, z0 + H, liv.main, { paint: { x: (ctx, w, h, sh, br, night) => { ctx.fillStyle = night ? '#ffd890' : sh('#24323e'); ctx.fillRect(w * 0.3, h * 0.45, w * 0.4, h * 0.3); }, y: wp, ny: wp } });
        if (gen === 0) m.gable(-L / 2 + 0.01, -W / 2, L / 2 - 0.01, W / 2, z0 + H, z0 + H + 0.04, 'x', '#3a3a3a', { ov: 0.005 });
        else m.box(-L / 2 + 0.02, -W / 2 + 0.01, z0 + H, L / 2 - 0.02, W / 2 - 0.01, z0 + H + 0.025, gen >= 3 ? '#e0e4e6' : '#5a5e62');
        break;
      }
      case 'wagon_van': case 'wagon_reefer': case 'wagon_armour': {
        const col = art === 'wagon_reefer' ? '#e8e6e0' : art === 'wagon_armour' ? '#5a6248' : cargo === 'mail' ? liv.main : body;
        m.box(-L / 2 + 0.01, -W / 2, z0, L / 2 - 0.01, W / 2, z0 + 0.2, col, { paint: { y: (ctx, w, h, sh, br, night) => { if (night) return; ctx.strokeStyle = sh('#000', 0.25); ctx.lineWidth = 0.006; ctx.strokeRect(w * 0.38, 0.01, w * 0.24, h * 0.85); if (art === 'wagon_armour') { ctx.fillStyle = sh('#20241a'); ctx.fillRect(w * 0.1, h * 0.6, 0.03, 0.02); ctx.fillRect(w * 0.85, h * 0.6, 0.03, 0.02); } if (cargo === 'mail') { ctx.fillStyle = sh(liv.accent); ctx.fillRect(0, h * 0.4, w, h * 0.08); } } } });
        if (gen === 0) m.gable(-L / 2 + 0.01, -W / 2, L / 2 - 0.01, W / 2, z0 + 0.2, z0 + 0.235, 'x', '#4a4a4a', { ov: 0.005 });
        else m.box(-L / 2 + 0.01, -W / 2 + 0.005, z0 + 0.2, L / 2 - 0.01, W / 2 - 0.005, z0 + 0.215, '#6a6e72');
        break;
      }
      case 'wagon_hopper': {
        const H = 0.15;
        m.box(-L / 2 + 0.02, -W / 2, z0, L / 2 - 0.02, -W / 2 + 0.012, z0 + H, body); m.box(-L / 2 + 0.02, W / 2 - 0.012, z0, L / 2 - 0.02, W / 2, z0 + H, body);
        m.box(-L / 2 + 0.02, -W / 2, z0, -L / 2 + 0.032, W / 2, z0 + H, body); m.box(L / 2 - 0.032, -W / 2, z0, L / 2 - 0.02, W / 2, z0 + H, body);
        m.box(-L / 2 + 0.02, -W / 2, z0, L / 2 - 0.02, W / 2, z0 + 0.02, body);
        if (fill > 0) {
          const fz = z0 + 0.02 + (H - 0.02) * fill / 3;
          m.box(-L / 2 + 0.034, -W / 2 + 0.014, z0 + 0.02, L / 2 - 0.034, W / 2 - 0.014, fz, loadCol, { top: loadCol });
          if (fill === 3) m.gable(-L / 2 + 0.04, -W / 2 + 0.02, L / 2 - 0.04, W / 2 - 0.02, fz, fz + 0.03, 'x', loadCol, { ov: 0 });
        }
        break;
      }
      case 'wagon_tank': {
        m.cylH(-L / 2 + 0.03, L / 2 - 0.03, 0, z0 + 0.09, 0.075, cargo === 'water' ? '#9ab4c4' : cargo === 'rubber' ? '#5a4a3a' : gen >= 3 ? '#d8dcde' : '#2a2a2a', { n: 10, cap: '#3a3a3a' });
        m.cyl(0, 0, z0 + 0.16, z0 + 0.185, 0.025, '#4a4a4a', { n: 6 });
        break;
      }
      case 'wagon_flat': case 'wagon_logs': {
        m.box(-L / 2 + 0.01, -W / 2, z0, L / 2 - 0.01, W / 2, z0 + 0.025, body);
        if (art === 'wagon_logs') for (const s of [-1, 1]) for (const x of [-L / 3, 0, L / 3]) m.box(x - 0.006, s * (W / 2 - 0.01) - 0.006, z0, x + 0.006, s * (W / 2 - 0.01) + 0.006, z0 + 0.12, '#3a2a1e');
        if (fill > 0) {
          if (art === 'wagon_logs') { const n = fill + 1; for (let i = 0; i < n; i++) m.cylH(-L / 2 + 0.03, L / 2 - 0.03, (i % 3 - 1) * 0.045, z0 + 0.05 + Math.floor(i / 3) * 0.04, 0.022, '#7a5634', { n: 6, cap: '#d0aa6a' }); }
          else for (let i = 0; i < fill; i++) m.box(-L / 2 + 0.04, -W / 2 + 0.02 + i * 0.04, z0 + 0.025, L / 2 - 0.04, -W / 2 + 0.05 + i * 0.04, z0 + 0.06 + (fill === 3 ? 0.02 : 0), cargo === 'steel' ? '#7d8a96' : '#c8a46a');
        }
        break;
      }
      case 'wagon_stock': {
        m.box(-L / 2 + 0.01, -W / 2, z0, L / 2 - 0.01, W / 2, z0 + 0.19, '#7a4a32', { paint: { y: (ctx, w, h, sh, br, night) => { if (night) return; ctx.fillStyle = sh('#2a1a12'); for (let v = 0.05; v < h; v += 0.04) ctx.fillRect(0, v, w, 0.012); } } });
        m.box(-L / 2 + 0.01, -W / 2, z0 + 0.19, L / 2 - 0.01, W / 2, z0 + 0.205, '#4a4a4a');
        break;
      }
    }
  }

  // ---------- road vehicles ----------
  function roadVeh(m, art, L, liv, body, fill, cargo) {
    const W = 0.13;
    const era = +art.slice(-1);
    if (art.startsWith('bus')) {
      const H = era === 0 ? 0.13 : 0.16;
      m.box(-L / 2, -W / 2, 0.035, L / 2, W / 2, 0.035 + H, liv.main, { paint: { x: (ctx, w, h, sh, br, night) => { ctx.fillStyle = night ? '#fff0c0' : sh('#1e2a34'); ctx.fillRect(w * 0.12, h * 0.45, w * 0.76, h * 0.4); }, y: combine(winPaint(era >= 4 ? 7 : 5, '#24323e'), stripe(liv.accent, 0.3, 0.08)), ny: combine(winPaint(5, '#24323e'), stripe(liv.accent, 0.3, 0.08)) } });
      if (era === 0) m.box(-L / 2 + 0.03, -W / 2, 0.035 + H, L / 2 - 0.08, W / 2, 0.035 + H + 0.012, '#3a3a3a');
      else m.box(-L / 2 + 0.01, -W / 2 + 0.005, 0.035 + H, L / 2 - 0.01, W / 2 - 0.005, 0.035 + H + 0.012, era >= 3 ? '#e0e4e6' : '#5a5e62');
      wheelsY(m, -L / 2 + 0.07, L / 2 - 0.07, art === 'bus4' ? 3 : 2, 0.028, W / 2 - 0.004);
      m.light(L / 2, 0.04, 0.06, 7, '#fff4d8'); m.light(L / 2, -0.04, 0.06, 7, '#fff4d8');
      return;
    }
    // truck: cab + body
    const cabL = 0.12, cx = L / 2 - cabL;
    const cabCol = liv.main;
    m.box(cx, -W / 2, 0.04, L / 2, W / 2, era === 0 ? 0.15 : 0.17, cabCol, { paint: { x: (ctx, w, h, sh, br, night) => { ctx.fillStyle = night ? '#fff0c0' : sh('#1e2a34'); ctx.fillRect(w * 0.12, h * 0.5, w * 0.76, h * 0.35); }, y: (ctx, w, h, sh, br, night) => { ctx.fillStyle = night ? '#fff0c0' : sh('#1e2a34'); ctx.fillRect(w * 0.15, h * 0.5, w * 0.4, h * 0.35); } } });
    if (era === 0) m.box(cx + cabL * 0.4, -W / 2 + 0.01, 0.04, L / 2 + 0.03, W / 2 - 0.01, 0.1, '#3a3a3a');
    m.box(-L / 2, -W / 2 + 0.01, 0.035, cx - 0.01, W / 2 - 0.01, 0.055, '#2a2a2a');
    const bz = 0.055;
    const c = HL.CARGO[cargo] || {};
    switch (body) {
      case 'tank': m.cylH(-L / 2 + 0.01, cx - 0.02, 0, bz + 0.055, 0.055, cargo === 'water' ? '#9ab4c4' : '#d8dcde', { n: 8, cap: '#8a8e92' }); break;
      case 'hopper': case 'logs': case 'flat': case 'stock': {
        const H = body === 'stock' ? 0.12 : 0.07;
        m.box(-L / 2, -W / 2, bz, cx - 0.01, W / 2, bz + 0.012, '#5a5048');
        for (const s of [-1, 1]) m.box(-L / 2, s * W / 2 - (s > 0 ? 0.01 : 0), bz, cx - 0.01, s * W / 2 + (s < 0 ? 0.01 : 0), bz + H, body === 'stock' ? '#7a4a32' : liv.accent);
        m.box(-L / 2, -W / 2, bz, -L / 2 + 0.01, W / 2, bz + H, liv.accent);
        if (fill) m.box(-L / 2 + 0.01, -W / 2 + 0.01, bz + 0.01, cx - 0.02, W / 2 - 0.01, bz + 0.012 + (H - 0.01) * fill / 3, c.load || c.col || '#777');
        break;
      }
      default: {
        const col = body === 'reefer' ? '#eceae4' : body === 'armour' ? '#4a5240' : cargo === 'mail' ? '#c8382c' : liv.accent === '#f2ead0' || liv.accent === '#f4efe4' || liv.accent === '#f0e6c8' ? '#e8e2d2' : '#d8d2c2';
        m.box(-L / 2, -W / 2, bz, cx - 0.01, W / 2, bz + 0.14, col, { paint: { y: stripe(liv.main, 0.15, 0.2), ny: stripe(liv.main, 0.15, 0.2) } });
      }
    }
    wheelsY(m, -L / 2 + 0.06, L / 2 - 0.05, 2, 0.026, W / 2 - 0.004);
    m.light(L / 2, 0.04, 0.07, 7, '#fff4d8'); m.light(L / 2, -0.04, 0.07, 7, '#fff4d8');
  }

  // ---------- ships ----------
  function hull(m, L, W, H, col, deck) {
    const b = L / 2, s = -L / 2, bow = b - W * 0.9;
    const z0 = -0.04;
    const P = (x, y, z) => [x, y, z];
    // sides
    m.face([P(s, W / 2, z0), P(bow, W / 2, z0), P(bow, W / 2, H), P(s, W / 2, H)], col, { paint: (ctx, w, h, sh, br, night) => { if (night) return; ctx.fillStyle = sh('#8a2a24'); ctx.fillRect(0, 0, w, h * 0.3); ctx.fillStyle = sh('#e8e2d0'); ctx.fillRect(0, h * 0.82, w, h * 0.06); } });
    m.face([P(bow, -W / 2, z0), P(s, -W / 2, z0), P(s, -W / 2, H), P(bow, -W / 2, H)], col);
    m.face([P(bow, W / 2, z0), P(b, 0, z0), P(b + 0.02, 0, H + 0.02), P(bow, W / 2, H)], col, { paint: (ctx, w, h, sh, br, night) => { if (night) return; ctx.fillStyle = sh('#8a2a24'); ctx.fillRect(0, 0, w, h * 0.3); } });
    m.face([P(b, 0, z0), P(bow, -W / 2, z0), P(bow, -W / 2, H), P(b + 0.02, 0, H + 0.02)], col);
    m.face([P(s, -W / 2, z0), P(s, W / 2, z0), P(s, W / 2, H), P(s, -W / 2, H)], col);
    m.face([P(s, -W / 2, H), P(bow, -W / 2, H), P(b + 0.02, 0, H + 0.02), P(bow, W / 2, H), P(s, W / 2, H)].reverse().reverse(), deck || '#a08a6a');
  }
  function shipModel(m, art, L, liv, fill, cargo) {
    const W = Math.min(0.32, L * 0.26);
    const H = 0.07;
    const deck = art === 'ship_hover' ? '#3a3e42' : '#9a8a6e';
    if (art === 'ship_hover') {
      m.box(-L / 2, -W / 2, -0.02, L / 2, W / 2, 0.06, '#2a2a2a');
      m.box(-L / 2 + 0.04, -W / 2 + 0.03, 0.06, L / 2 - 0.08, W / 2 - 0.03, 0.18, liv.main, { paint: { y: winPaint(6), ny: winPaint(6) } });
      for (const s of [-1, 1]) m.cyl(-L / 2 + 0.08, s * 0.06, 0.18, 0.26, 0.05, '#4a4e52', { n: 10 });
      return;
    }
    hull(m, L, W, H, art === 'ship_hydro' ? '#e8ecee' : liv.main, deck);
    const top = H;
    if (art === 'ship_paddle' || art === 'ship_ferry' || art === 'ship_hydro') {
      const sl = art === 'ship_ferry' ? 0.55 : 0.45;
      m.box(-L * sl / 2, -W / 2 + 0.03, top, L * sl / 2, W / 2 - 0.03, top + 0.11, '#ece8dc', { paint: { y: winPaint(6), ny: winPaint(6), x: winPaint(3) } });
      m.box(-L * sl / 2 + 0.05, -W / 2 + 0.06, top + 0.11, L * sl / 2 - 0.1, W / 2 - 0.06, top + 0.19, '#ece8dc', { paint: { y: winPaint(4), x: winPaint(2) } });
      m.cyl(-0.02, 0, top + 0.19, top + 0.33, 0.035, liv.main, { n: 8, top: '#1e1e1e', paint: stripe('#1e1e1e', 0.8, 0.2) });
      m.funnel = [-0.02, 0, top + 0.33];
      if (art === 'ship_paddle') for (const s of [-1, 1]) m.cylH(-0.06, 0.06, s * (W / 2 + 0.01), top - 0.01, 0.08, '#6a4a34', { axis: 'y', n: 10 });
      if (art === 'ship_hydro') for (const x of [-L / 3, L / 3]) m.box(x - 0.02, -W / 2 - 0.04, -0.06, x + 0.02, W / 2 + 0.04, -0.045, '#3a3a3a');
      return;
    }
    // freighters: bridge at the stern
    const bx = -L / 2 + 0.06;
    m.box(bx, -W / 2 + 0.02, top, bx + 0.14, W / 2 - 0.02, top + 0.2, '#ece8dc', { paint: { x: winPaint(3), y: winPaint(2) } });
    m.box(bx + 0.01, -W / 2 + 0.04, top + 0.2, bx + 0.13, W / 2 - 0.04, top + 0.24, '#ece8dc', { paint: { x: winPaint(3, '#1a2632') } });
    m.cyl(bx + 0.02, 0, top + 0.18, top + 0.32, 0.03, liv.main, { n: 8, top: '#1e1e1e' });
    m.funnel = [bx + 0.02, 0, top + 0.32];
    const c0 = bx + 0.18, c1 = L / 2 - W * 0.9;
    if (art.startsWith('ship_tanker')) {
      m.box(c0, -0.01, top, c1, 0.01, top + 0.03, '#6a6e72');
      for (let x = c0 + 0.04; x < c1; x += 0.12) m.cyl(x, 0, top, top + 0.025, 0.04, '#8a8e92', { n: 6 });
    } else if (art === 'ship_container') {
      const cols = ['#c4382c', '#3c6fb0', '#c8892e', '#22807f', '#6a7a4a', '#e8e2d2'];
      let i = 0;
      const rows = fill ? 1 + fill : 1;
      for (let x = c0; x < c1 - 0.08; x += 0.1) for (let r = 0; r < rows; r++) for (const y of [-W / 4, W / 4]) { m.box(x, y - W / 4 + 0.01, top + r * 0.045, x + 0.09, y + W / 4 - 0.01, top + (r + 1) * 0.045, cols[(i++ * 7 + r) % cols.length]); }
    } else {
      // bulk/cargo: hatch covers, cargo visible when loaded
      const c = HL.CARGO[cargo] || {};
      for (let x = c0; x < c1 - 0.06; x += 0.12) {
        m.box(x, -W / 2 + 0.04, top, x + 0.1, W / 2 - 0.04, top + 0.035, '#5a5e62');
        if (fill && art !== 'ship_cargo') m.box(x + 0.01, -W / 2 + 0.05, top + 0.035, x + 0.09, W / 2 - 0.05, top + 0.035 + fill * 0.008, c.load || c.col || '#666');
      }
      if (art === 'ship_cargo' || art === 'ship_bulk') { m.box(c0 + 0.1, -0.008, top, c0 + 0.116, 0.008, top + 0.22, '#5a4a3a'); }
    }
  }

  // ---------- aircraft ----------
  function plane(m, art, L, liv) {
    const z = 0.12;
    const body = '#eceeee';
    const fuseR = art === 'jumbo' ? 0.05 : art === 'biplane' ? 0.03 : 0.036;
    if (art === 'heli' || art === 'tiltrotor') {
      m.cylH(-L * 0.15, L / 2 - 0.06, 0, z, 0.05, liv.main, { n: 8, cap: '#2a3642', paint: winPaint(2) });
      m.cylH(-L / 2, -L * 0.15, 0, z + 0.02, 0.016, liv.main, { n: 6 });
      m.face([[-L / 2, 0, z], [-L / 2 + 0.06, 0, z], [-L / 2 + 0.02, 0, z + 0.1]], liv.accent, { twoSided: true });
      m.box(-0.08, -0.06, 0.0, 0.1, -0.055, 0.01, '#3a3a3a'); m.box(-0.08, 0.055, 0.0, 0.1, 0.06, 0.01, '#3a3a3a');
      if (art === 'tiltrotor') { m.face([[-0.04, -0.22, z + 0.04], [0.04, -0.22, z + 0.04], [0.04, 0.22, z + 0.04], [-0.04, 0.22, z + 0.04]], liv.main, { twoSided: true }); for (const s of [-1, 1]) m.cyl(0, s * 0.22, z + 0.02, z + 0.1, 0.022, '#5a5e62', { n: 6 }); }
      m.rotor = art === 'tiltrotor' ? [[0, -0.22, z + 0.12], [0, 0.22, z + 0.12]] : [[0, 0, z + 0.07]];
      return;
    }
    // fuselage
    m.cylH(-L / 2 + 0.05, L / 2 - 0.06, 0, z, fuseR, body, { n: 10, cap: '#d8dcde', paint: combine(stripe(liv.main, 0.25, 0.25), (ctx, w, h, sh, br, night) => { const n = Math.round(w / 0.04); for (let i = 1; i < n - 1; i++) { ctx.fillStyle = night ? '#ffe0a0' : sh('#2e3c48'); ctx.fillRect(i * w / n, h * 0.6, w / n * 0.4, h * 0.08); } }) });
    // nose cone and tail cone
    m.face([[L / 2 - 0.06, -fuseR, z], [L / 2, 0, z - 0.005], [L / 2 - 0.06, 0, z + fuseR]], body); m.face([[L / 2 - 0.06, 0, z + fuseR], [L / 2, 0, z - 0.005], [L / 2 - 0.06, fuseR, z]], body);
    m.face([[L / 2 - 0.06, fuseR, z], [L / 2, 0, z - 0.005], [L / 2 - 0.06, 0, z - fuseR]], '#cfd4d6');
    // wings
    const span = art === 'jumbo' ? 0.6 : art === 'sst' ? 0.34 : art === 'biplane' ? 0.4 : 0.5;
    const sweep = art.startsWith('jet') || art === 'jumbo' || art === 'eliner' ? 0.12 : art === 'sst' ? 0.3 : 0;
    const chord = art === 'sst' ? 0.4 : 0.12;
    const wx = art === 'sst' ? -0.05 : 0.02;
    m.face([[wx + chord / 2, 0, z - 0.01], [wx + chord / 2 - sweep, span / 2, z + 0.01], [wx - chord / 2 - sweep * 1.2, span / 2, z + 0.01], [wx - chord / 2, 0, z - 0.01]], '#dfe3e5', { twoSided: true });
    m.face([[wx + chord / 2, 0, z - 0.01], [wx - chord / 2, 0, z - 0.01], [wx - chord / 2 - sweep * 1.2, -span / 2, z + 0.01], [wx + chord / 2 - sweep, -span / 2, z + 0.01]], '#dfe3e5', { twoSided: true });
    if (art === 'biplane') { m.face([[wx + 0.06, -span / 2, z + 0.09], [wx + 0.06, span / 2, z + 0.09], [wx - 0.06, span / 2, z + 0.09], [wx - 0.06, -span / 2, z + 0.09]], liv.main, { twoSided: true }); for (const s of [-1, 1]) m.box(wx - 0.005, s * span / 3, z, wx + 0.005, s * span / 3 + 0.004, z + 0.09, '#5a4a3a'); }
    // tail
    m.face([[-L / 2 + 0.05, 0, z + fuseR * 0.6], [-L / 2 + 0.16, 0, z + fuseR * 0.6], [-L / 2 + 0.07, 0, z + 0.12]], liv.main, { twoSided: true, paint: (ctx, w, h, sh) => { ctx.fillStyle = sh(liv.accent); ctx.fillRect(0, h * 0.4, w, h * 0.2); } });
    if (art !== 'sst') m.face([[-L / 2 + 0.05, -0.1, z + 0.01], [-L / 2 + 0.12, -0.1, z + 0.01], [-L / 2 + 0.12, 0.1, z + 0.01], [-L / 2 + 0.05, 0.1, z + 0.01]], '#dfe3e5', { twoSided: true });
    // engines
    const props = art === 'biplane' ? [[L / 2 - 0.02, 0]] : art === 'twinprop' || art === 'turboprop' ? [[0.07, -0.12], [0.07, 0.12]] : art === 'propliner' ? [[0.07, -0.1], [0.07, 0.1], [0.05, -0.19], [0.05, 0.19]] : [];
    for (const [x, y] of props) { m.cylH(x - 0.07, x, y, z - 0.01, 0.018, '#5a5e62', { n: 6 }); }
    if (!props.length && art !== 'sst') {
      const ys = art === 'jumbo' ? [-0.13, -0.22, 0.13, 0.22] : art === 'jet_wide' || art === 'eliner' ? [-0.13, 0.13] : [-0.12, 0.12];
      for (const y of ys) m.cylH(wx - 0.02 - Math.abs(y) * 0.4, wx + 0.06 - Math.abs(y) * 0.4, y, z - 0.03, 0.022, art === 'eliner' ? liv.main : '#9aa0a4', { n: 8, cap: '#2a2a2a' });
    }
    if (art === 'sst') for (const y of [-0.06, 0.06]) m.cylH(-L / 2 + 0.06, -0.05, y, z - 0.025, 0.018, '#8a8e92', { n: 6, cap: '#2a2a2a' });
    m.props = props;
    m.light(L / 2, 0, z, 8, '#fff4d8');
  }

  // ---------- model cache ----------
  const builders = {};
  function liveryOf(g, cid) { const c = g.companies[cid]; return HL.LIVERY[c ? c.color : 0] || HL.LIVERY[0]; }
  Vis.buildModel = function (key, art, len, liv, extra) {
    const m = M();
    if (ENGINE_BUILD[art]) ENGINE_BUILD[art](m, len, liv);
    else if (art.startsWith('wagon_')) wagon(m, art, len, liv, extra.gen, extra.fill, extra.cargo);
    else if (art.startsWith('bus') || art.startsWith('truck')) roadVeh(m, art, len, liv, extra.body, extra.fill, extra.cargo);
    else if (art.startsWith('ship')) shipModel(m, art, len, liv, extra.fill, extra.cargo);
    else plane(m, art, len, liv);
    // rail and road vehicles a touch chunkier than true scale so they read well next to buildings
    if (!art.startsWith('ship') && ENGINE_BUILD[art] || art.startsWith('wagon_') || art.startsWith('bus') || art.startsWith('truck')) {
      for (const f of m.faces) { for (const p of f.pts) { p[1] *= 1.15; p[2] *= 1.3; } if (f.frame) for (const p of f.frame) { p[1] *= 1.15; p[2] *= 1.3; } }
      for (const l of m.lights) l[2] *= 1.3;
    }
    return m;
  };
  // part spec for drawing: art, len, extra, key
  function specFor(g, v, car) {
    const liv = liveryOf(g, v.owner);
    if (v.kind === 'rail') {
      const md = HL.VEH[car.model];
      const h = car.hold >= 0 ? v.holds[car.hold] : null;
      const fill = h && h.cap ? Math.ceil(h.n / h.cap * 3) : 0;
      return { art: md.art, len: md.len, liv, extra: { gen: md.gen, fill, cargo: md.cargo }, key: md.art + ':' + (md.gen != null ? md.gen : '') + ':' + md.cargo + ':' + fill + ':' + liv.main };
    }
    const md = HL.VEH[v.model];
    const h = v.holds[0];
    const fill = h && h.cap ? Math.ceil(h.n / h.cap * 3) : 0;
    return { art: md.art, len: md.len, liv, extra: { body: md.body, fill, cargo: h ? h.c : md.cargo }, key: md.art + ':' + (md.body || '') + ':' + (h ? h.c : '') + ':' + fill + ':' + liv.main };
  }
  function spriteFor(spec, yaw, pitch, s, shadow) {
    let yi = Math.round(((yaw % (Math.PI * 2)) + Math.PI * 2) / (Math.PI * 2) * YAWS) % YAWS;
    const pi = pitch > 0.03 ? 1 : pitch < -0.03 ? -1 : 0;
    const key = 'v:' + spec.key + ':' + yi + ':' + pi + ':' + (shadow ? 1 : 0);
    return Gx.modelSprite(key, s, () => { let mm = builders[spec.key]; if (!mm) mm = builders[spec.key] = Vis.buildModel(spec.key, spec.art, spec.len, spec.liv, spec.extra); return mm; }, { yaw: yi / YAWS * Math.PI * 2, pitch: pi * 0.18, shadow });
  }
  Vis.spriteFor = spriteFor;
  Vis.specFor = specFor;

  // ---------- per frame ----------
  const wp = (x, y, h) => [(x - y) * Gx.TW2, (x + y) * Gx.TH2 - h * Gx.HS];
  Vis.airborne = [];
  Vis.prepare = function (Rr, now) {
    const g = Rr.g, b = Rr.vehicleBuckets;
    b.clear();
    Vis.airborne.length = 0;
    // rough view rectangle in tile space for culling
    const z = Rr.cam.z, cx = Rr.cam.x, cy = Rr.cam.y, hw = Rr.vw / 2 / z + 200, hh = Rr.vh / 2 / z + 300;
    const visible = (x, y) => { const sx = (x - y) * Gx.TW2, sy = (x + y) * Gx.TH2; return sx > cx - hw && sx < cx + hw && sy > cy - hh && sy < cy + hh + 300; };
    for (const v of g.vehicles) {
      if (!v || (v.inDepot && v.kind !== 'air') || (v.kind === 'air' && v.airState === 'hangar')) continue;
      if (!visible(v.px, v.py) && v.kind !== 'air') { v.offscreen = true; continue; }
      v.offscreen = false;
      if (v.kind === 'rail') {
        if (!v.path) continue;
        HL.Rail.carPositions(g, v);
        for (const c of v.cars) { if (c.hidden || c.px == null) continue; push(b, g, { v, car: c, x: c.px, y: c.py }); }
        continue;
      }
      if (v.hidden) continue;
      if (v.kind === 'road') HL.Road.fullPos(g, v);
      if (v.kind === 'air' && v.pz > g.map.heightAt(v.px, v.py) + 1.5) { Vis.airborne.push(v); push(b, g, { v, shadowOnly: true, x: v.px, y: v.py }); continue; }
      push(b, g, { v, x: v.px, y: v.py });
    }
  };
  function push(b, g, it) {
    const m = g.map;
    const x = Math.max(0, Math.min(m.W - 1, Math.floor(it.x))), y = Math.max(0, Math.min(m.H - 1, Math.floor(it.y)));
    const t = y * m.W + x;
    it.onBridge = it.car ? it.car.onBridge >= 0 : (it.v.onBridge != null && it.v.onBridge >= 0);
    let a = b.get(t); if (!a) b.set(t, a = []);
    a.push(it);
    if (a.length > 1) a.sort((p, q) => (p.x + p.y) - (q.x + q.y));
  }
  Vis.drawVehicle = function (ctx, it, s, now) {
    const g = R.g, v = it.v;
    if (it.shadowOnly) { drawAirShadow(ctx, v); return; }
    const car = it.car;
    const px = car ? car.px : v.px, py = car ? car.py : v.py, pz = car ? car.pz : v.pz;
    let yaw = car ? car.yaw : v.yaw;
    const flip = car && car.flip;
    if (flip) yaw += Math.PI;
    const pitch = (car ? car.pitch : v.pitch || 0) * (flip ? -1 : 1);
    const spec = specFor(g, v, car || null);
    const crashed = v.state === 'crashed';
    const sp = spriteFor(spec, yaw, pitch, s, true);
    const p = wp(px, py, pz);
    if (crashed) { ctx.globalAlpha = 0.85; ctx.filter = 'brightness(0.35)'; }
    ctx.drawImage(sp.c, p[0] - sp.ox / s, p[1] - sp.oy / s, sp.c.width / s, sp.c.height / s);
    if (crashed) { ctx.filter = 'none'; ctx.globalAlpha = 1; if (HL.Fx) HL.Fx.emitter('crash' + v.id + (car ? v.cars.indexOf(car) : ''), px, py, pz * Gx.LEVEL + 0.1, 'fire', 3); }
    // selection ring
    if (R.selVeh === v.id && (!car || car === v.cars[0])) { ctx.strokeStyle = 'rgba(255,230,150,0.9)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.ellipse(p[0], p[1], 16, 8, 0, 0, 7); ctx.stroke(); }
    effects(ctx, v, car, spec, px, py, pz, yaw, now);
  };
  function effects(ctx, v, car, spec, px, py, pz, yaw, now) {
    const g = R.g;
    const dark = R.env.dark;
    const md = car ? HL.VEH[car.model] : HL.VEH[v.model];
    const moving = v.speed > 1 && v.state === 'run';
    const fx = Math.cos(yaw), fy = Math.sin(yaw);
    // smoke and exhaust
    if (HL.Fx && v.state !== 'crashed') {
      if (v.broken > 0 && (!car || car === v.cars[0])) HL.Fx.emitter('brk' + v.id, px, py, pz * Gx.LEVEL + 0.25, 'dark', 3);
      if (md.fuel === 'steam' && (moving || v.state === 'load')) {
        const L = md.len;
        const rate = moving ? 1.5 + v.speed / 18 : 0.5;
        HL.Fx.emitter('st' + v.id + ':' + (car ? v.cars.indexOf(car) : 0), px + fx * L * 0.36, py + fy * L * 0.36, pz * Gx.LEVEL + 0.3, 'steam', rate);
      } else if (md.fuel === 'diesel' && moving && v.speed < 60) HL.Fx.emitter('ds' + v.id, px, py, pz * Gx.LEVEL + 0.3, 'exhaust', 0.8);
      if (v.kind === 'ship' && moving) HL.Fx.emitter('wk' + v.id, px - fx * md.len * 0.45, py - fy * md.len * 0.45, 0.01, 'wake', 4 + v.speed / 10);
      if (v.kind === 'ship' && (moving || v.state === 'load') && md.art !== 'ship_hover' && md.art !== 'ship_hydro') HL.Fx.emitter('sf' + v.id, px - fx * md.len * 0.25, py - fy * md.len * 0.25, 0.4, md.intro < 1950 ? 'grey' : 'exhaust', moving ? 1 : 0.3);
      if (v.kind === 'road' && md.intro < 1960 && moving && g.ticks % 7 === 0) HL.Fx.emitter('rx' + v.id, px - fx * md.len * 0.5, py - fy * md.len * 0.5, pz * Gx.LEVEL + 0.04, 'exhaust', 0.6);
    }
    // night lights
    if (dark > 0.08) {
      const front = (!car || car === v.cars[0]) && (v.kind !== 'rail' || HL.VEH[car.model].engine);
      if (front) { const fp = wp(px + fx * md.len * 0.55, py + fy * md.len * 0.55, pz + 0.6); R.addLight(fp[0], fp[1], v.kind === 'rail' ? 26 : 16, '#ffe8b8', 0.9); }
      if (car && md.cargo === 'pax' || v.kind === 'road' && md.cargo === 'pax' || v.kind === 'ship') { const cp = wp(px, py, pz + 0.8); R.addLight(cp[0], cp[1], 14, '#ffd38a', 0.6); }
    }
  }
  function drawAirShadow(ctx, v) {
    const g = R.g;
    const gz = g.map.heightAt(v.px, v.py);
    const p = wp(v.px, v.py, gz);
    const md = HL.VEH[v.model];
    const alt = v.pz - gz;
    const a = Math.max(0.05, 0.28 - alt * 0.005);
    const sc = md.len * 30;
    ctx.save(); ctx.translate(p[0] + alt * 1.2, p[1] + alt * 0.4);
    ctx.fillStyle = `rgba(30,38,58,${a})`;
    ctx.rotate(Math.atan2(Math.sin(v.yaw) * 16 + Math.cos(v.yaw) * 16, Math.cos(v.yaw) * 32 - Math.sin(v.yaw) * 32));
    ctx.beginPath(); ctx.ellipse(0, 0, sc * 0.55, sc * 0.12, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-sc * 0.05, 0, sc * 0.12, sc * 0.5, 0, 0, 7); ctx.fill();
    ctx.restore();
  }
  // aircraft in flight are drawn over everything
  Vis.drawAir = function (ctx, s, now) {
    for (const v of Vis.airborne) {
      const spec = specFor(R.g, v, null);
      const pitch = v.airState === 'takeoff' ? 0.12 : v.airState === 'land' ? -0.06 : 0;
      const sp = spriteFor(spec, v.yaw, pitch, s, false);
      const p = wp(v.px, v.py, v.pz);
      ctx.drawImage(sp.c, p[0] - sp.ox / s, p[1] - sp.oy / s, sp.c.width / s, sp.c.height / s);
      const md = HL.VEH[v.model];
      if (md.heli) { // rotor blur
        ctx.strokeStyle = 'rgba(40,40,40,0.35)'; ctx.lineWidth = 1; const ang = now / 40;
        const rp = wp(v.px, v.py, v.pz + 0.9);
        for (let i = 0; i < 2; i++) { const a = ang + i * Math.PI / 2; ctx.beginPath(); ctx.moveTo(rp[0] - Math.cos(a) * 14, rp[1] - Math.sin(a) * 7); ctx.lineTo(rp[0] + Math.cos(a) * 14, rp[1] + Math.sin(a) * 7); ctx.stroke(); }
      }
      if (R.env.dark > 0.08) { const blink = ((now / 500) | 0) % 2; R.addLight(p[0], p[1] - 4, 10, blink ? '#ff4030' : '#56e07a', 1); }
      if (R.selVeh === v.id) { ctx.strokeStyle = 'rgba(255,230,150,0.9)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.ellipse(p[0], p[1], 18, 9, 0, 0, 7); ctx.stroke(); }
    }
  };
  // zoomed out: vehicles straight on top of the baked chunks
  Vis.drawFar = function (ctx, wx0, wy0, wx1, wy1, b, now) {
    const s = Math.max(0.25, b);
    for (const [t, list] of R.vehicleBuckets) {
      for (const it of list) {
        if (it.shadowOnly) continue;
        const p = wp(it.x, it.y, it.car ? it.car.pz : it.v.pz);
        if (p[0] < wx0 - 40 || p[0] > wx1 + 40 || p[1] < wy0 - 40 || p[1] > wy1 + 40) continue;
        if (b <= 0.125) { const c = HL.LIVERY[(R.g.companies[it.v.owner] || {}).color || 0]; ctx.fillStyle = c.main; ctx.fillRect(p[0] - 6, p[1] - 4, 12, 8); continue; }
        Vis.drawVehicle(ctx, it, s, now);
      }
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
