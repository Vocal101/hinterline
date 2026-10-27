// Building art: houses (by era, tier and climate), town landmarks, industries, objects.
// Models are in tile units with the tile's north corner at the origin and ground at z = 0.
(function (root) {
  const HL = root.HL, Gx = HL.Gfx;
  const Art = HL.Art = {};
  const M = () => new Gx.Model();
  const FH = 0.15; // storey height

  // ---------- painters (face-local coords: u along the wall, v up) ----------
  // brick/stone coursing plus windows
  function wallPaint(o) {
    return (ctx, w, h, sh, br, night) => {
      if (!night && o.course) {
        ctx.strokeStyle = sh(o.course, 0.22); ctx.lineWidth = 0.004;
        ctx.beginPath(); for (let y = o.z0 || 0.03; y < h; y += o.course === '#000' ? 0.05 : 0.025) { ctx.moveTo(0, y); ctx.lineTo(w, y); } ctx.stroke();
      }
      if (!night && o.timber) {
        // mock-tudor framing on the upper floor
        ctx.fillStyle = sh('#3a2a20'); const z = FH;
        ctx.fillRect(0, z, w, 0.012); ctx.fillRect(0, h - 0.012, w, 0.012);
        for (let u = 0.02; u < w; u += 0.09) ctx.fillRect(u, z, 0.012, h - z);
      }
      if (!night && o.base) { ctx.fillStyle = sh(o.base); ctx.fillRect(0, 0, w, o.baseH || 0.035); }
      if (o.shop && !night) {
        ctx.fillStyle = sh('#2c3a44'); ctx.fillRect(w * 0.08, 0.02, w * 0.84, FH * 0.62);
        ctx.fillStyle = sh('#a8c4d2', 0.35); ctx.fillRect(w * 0.1, 0.05, w * 0.35, FH * 0.45);
        ctx.fillStyle = sh(o.shop); ctx.fillRect(w * 0.06, FH * 0.66, w * 0.88, FH * 0.14);
      } else if (o.shop && night) { ctx.fillStyle = '#ffd38a'; ctx.fillRect(w * 0.08, 0.02, w * 0.84, FH * 0.62); }
      if (o.door && !night) { ctx.fillStyle = sh(o.door); ctx.fillRect(w * o.doorAt - 0.025, 0, 0.05, 0.09); ctx.fillStyle = sh('#e8dcc0'); ctx.fillRect(w * o.doorAt - 0.03, 0.09, 0.06, 0.008); }
      const fl = o.floors || 1;
      Gx.windows(ctx, w, h, {
        floors: o.shop ? fl - 1 : fl, z0: o.shop ? FH : 0, fh: FH, cols: o.cols || Math.max(1, Math.round(w / (o.colW || 0.12))),
        ww: o.ww || 0.045, wh: o.wh || FH * 0.48, frame: o.frame || '#ece4d0', glass: o.glass || '#3a4c5c', seed: o.seed || 0, litFrac: o.lit,
        skip: o.door ? (f, c) => f === 0 && Math.abs((c + 0.5) / (o.cols || Math.max(1, Math.round(w / (o.colW || 0.12)))) - o.doorAt) < 0.12 : null,
      }, sh, br, night);
    };
  }
  // curtain wall glass grid
  function glassPaint(o) {
    return (ctx, w, h, sh, br, night) => {
      if (night) {
        const fl = Math.floor(h / FH), cols = Math.max(2, Math.round(w / 0.07));
        for (let f = 0; f < fl; f++) for (let c = 0; c < cols; c++) {
          const r = HL.hash2(f + (o.seed || 0), c, 77);
          if (r < (o.lit || 0.45)) { ctx.fillStyle = r < 0.1 ? '#d9e8ff' : '#ffd99a'; ctx.fillRect(c * w / cols + 0.006, f * FH + 0.02, w / cols - 0.012, FH - 0.04); }
        }
        return;
      }
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, sh(o.glass || '#4f6f86')); g.addColorStop(0.5, sh(o.glass2 || '#7d9cb2')); g.addColorStop(1, sh(o.glass || '#4f6f86'));
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = sh(o.mull || '#d6dde2', 0.7); ctx.lineWidth = 0.006;
      ctx.beginPath();
      for (let y = 0; y <= h + 1e-6; y += FH) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
      for (let x = 0; x <= w + 1e-6; x += 0.07) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.moveTo(w * 0.1, 0); ctx.lineTo(w * 0.3, 0); ctx.lineTo(w * 0.05, h); ctx.lineTo(0, h); ctx.closePath(); ctx.fill();
    };
  }
  // roof tiles / slates
  function roofPaint(col) {
    return (ctx, w, h, sh, br, night) => {
      if (night) return;
      ctx.strokeStyle = sh(col === '#f2f5f7' ? '#c9d2da' : '#000', 0.18); ctx.lineWidth = 0.004;
      ctx.beginPath(); for (let y = 0.02; y < h; y += 0.024) { ctx.moveTo(0, y); ctx.lineTo(w, y); } ctx.stroke();
    };
  }
  function corrugated(col) {
    return (ctx, w, h, sh, br, night) => {
      if (night) return;
      ctx.strokeStyle = sh('#000', 0.14); ctx.lineWidth = 0.005;
      ctx.beginPath(); for (let x = 0.01; x < w; x += 0.02) { ctx.moveTo(x, 0); ctx.lineTo(x, h); } ctx.stroke();
    };
  }
  function bandsPaint(c1, c2, n) {
    return (ctx, w, h, sh, br, night) => {
      if (night) { ctx.fillStyle = '#ff4030'; ctx.fillRect(0, h - 0.03, w, 0.02); return; }
      for (let i = 0; i < n; i++) { ctx.fillStyle = sh(i % 2 ? c2 : c1); ctx.fillRect(0, h - (i + 1) * (h * 0.32 / n), w, h * 0.32 / n); }
    };
  }
  Art.paint = { wallPaint, glassPaint, roofPaint, corrugated, bandsPaint };

  // ---------- palettes ----------
  const PAL = {
    walls: [
      ['#9b4a35', '#a85c42', '#8a4232', '#b9a58a', '#c7b694'],             // victorian brick + stone
      ['#d6ccb4', '#b45a40', '#e3dac4', '#c8b48e', '#a85a44'],             // interwar render + brick
      ['#d9d2bf', '#c8cfc6', '#e6d3a8', '#b9b6aa', '#d4b8a0'],             // postwar render/concrete
      ['#c9c6bd', '#e7e3da', '#9aa3a8', '#b88f6a', '#d8d5ce'],             // modern
      ['#e9ecee', '#cfd6da', '#b8c4c9', '#efe9de', '#a7b5ba'],             // future
    ],
    roofs: [['#4e555e', '#7d3b2c', '#5a4f48'], ['#8a3d2c', '#9c4a32', '#4e555e'], ['#5f5a54', '#8a3d2c', '#6e6a62'], ['#5b5f63', '#7a7e80'], ['#52606a', '#3f6b4a']],
    arcticWalls: ['#8e3428', '#c29044', '#e6e2d6', '#5f3f2c', '#3f5f6e'],
    desertWalls: ['#dcb98e', '#e8d4ae', '#f0e9dc', '#cf9a6c', '#e2c49c'],
    awnings: ['#9a3a32', '#2f6a55', '#c8892e', '#3c5f90', '#7c4a74', '#d9cba2'],
  };
  const pick = (arr, r) => arr[Math.floor(r * arr.length) % arr.length];

  function plot(m, col, x0, y0, x1, y1) { m.face([[x0, y0, 0.004], [x1, y0, 0.004], [x1, y1, 0.004], [x0, y1, 0.004]], col).noSeam = true; }
  function chimney(m, x, y, z, h, col) { m.box(x, y, z, x + 0.05, y + 0.05, z + h, col, { top: '#2c2c2c' }); }
  function hedge(m, x0, y0, x1, y1, h) { m.box(x0, y0, 0, x1, y1, h || 0.05, '#3f6a32', { top: '#5a8a3e' }); }

  // ---------- houses ----------
  Art.house = function (tier, style, v, climate, snow, stage) {
    const r = new HL.RNG(v * 977 + tier * 131 + style * 17 + 3);
    const m = M();
    const roofSnow = c => snow ? '#eef2f5' : c;
    let wall = climate === 'arctic' ? pick(PAL.arcticWalls, r.next()) : climate === 'desert' ? pick(PAL.desertWalls, r.next()) : pick(PAL.walls[style], r.next());
    const roof = roofSnow(pick(PAL.roofs[style], r.next()));
    const brick = climate === 'temperate' && style <= 1 && /^#[89ab][0-9a-f]4/.test(wall);
    const seed = v * 13 + tier;
    const desert = climate === 'desert', arctic = climate === 'arctic';
    const axis = r.next() < 0.5 ? 'x' : 'y';
    if (stage != null && stage < 3) return Art.construction(tier, stage, wall);

    if (tier === 0) {
      plot(m, desert ? '#cdb487' : '#6f9447', 0.06, 0.06, 0.94, 0.94);
      if (!desert && style < 3) { hedge(m, 0.06, 0.9, 0.94, 0.94, 0.045); hedge(m, 0.9, 0.06, 0.94, 0.9, 0.045); }
      const w = style >= 2 ? 0.58 : 0.48, d = 0.42;
      const x0 = 0.2, y0 = 0.16;
      const x1 = x0 + (axis === 'x' ? w : d), y1 = y0 + (axis === 'x' ? d : w);
      const wp = wallPaint({ floors: 1, cols: 2, door: '#5a3a2a', doorAt: 0.5, course: brick ? '#000' : null, seed });
      m.box(x0, y0, 0, x1, y1, 0.24, wall, { paint: { x: wp, y: wp } });
      if (desert) { m.box(x0 - 0.01, y0 - 0.01, 0.24, x1 + 0.01, y1 + 0.01, 0.27, '#e8dcc4'); if (r.next() < 0.4) m.cyl((x0 + x1) / 2, (y0 + y1) / 2, 0.27, 0.33, 0.1, '#f0ebe0', { n: 10, r1: 0.04 }); }
      else if (style >= 3 && !arctic) { m.box(x0 - 0.02, y0 - 0.02, 0.24, x1 + 0.02, y1 + 0.02, 0.26, '#6a6c6e'); if (style === 4) solar(m, x0 + 0.04, y0 + 0.04, x1 - 0.04, y1 - 0.04, 0.26); }
      else if (style === 2) m.hip(x0, y0, x1, y1, 0.24, 0.38, roof, { paint: roofPaint(roof) });
      else { m.gable(x0, y0, x1, y1, 0.24, arctic ? 0.52 : 0.44, axis, roof, { paint: roofPaint(roof), end: wall }); chimney(m, x0 + 0.06, y0 + 0.06, 0.3, 0.16, brick ? '#8a4232' : '#9a8f80'); }
      m.light(x0 + 0.1, y1, 0.08, 9, '#ffcf7a');
      return m;
    }
    if (tier === 1) {
      plot(m, desert ? '#d4bc90' : '#7f9a52', 0.04, 0.04, 0.96, 0.96);
      const along = axis === 'x';
      const x0 = 0.1, y0 = 0.12, x1 = along ? 0.9 : 0.62, y1 = along ? 0.62 : 0.9;
      const hgt = 2 * FH + 0.02;
      const wp = wallPaint({ floors: 2, colW: 0.13, door: pick(['#3a4a6a', '#6a2a2a', '#2f4a3a', '#2a2a2a'], r.next()), doorAt: 0.3, course: brick ? '#000' : null, timber: style === 1 && !brick && r.next() < 0.5 && !desert, seed, base: style <= 1 ? '#6e6658' : null });
      m.box(x0, y0, 0, x1, y1, hgt, wall, { paint: { x: wp, y: wp, nx: wp, ny: wp } });
      if (desert) { m.box(x0 - 0.01, y0 - 0.01, hgt, x1 + 0.01, y1 + 0.01, hgt + 0.035, '#efe6d2'); awningBox(m, x0 + 0.05, y1, x0 + 0.35, y1 + 0.1, hgt * 0.55, pick(PAL.awnings, r.next())); }
      else if (style >= 3) { m.box(x0 - 0.01, y0 - 0.01, hgt, x1 + 0.01, y1 + 0.01, hgt + 0.03, '#5d6266'); if (style === 4) { solar(m, x0 + 0.05, y0 + 0.05, x1 - 0.05, y1 - 0.05, hgt + 0.03); } }
      else {
        m.gable(x0, y0, x1, y1, hgt, hgt + (arctic ? 0.26 : 0.18), along ? 'x' : 'y', roof, { paint: roofPaint(roof), end: wall });
        chimney(m, along ? x0 + 0.05 : (x0 + x1) / 2 - 0.025, along ? (y0 + y1) / 2 - 0.025 : y0 + 0.05, hgt + 0.08, 0.16, brick ? '#7a3a2c' : '#8c8478');
        chimney(m, along ? x1 - 0.1 : (x0 + x1) / 2 - 0.025, along ? (y0 + y1) / 2 - 0.025 : y1 - 0.1, hgt + 0.08, 0.16, brick ? '#7a3a2c' : '#8c8478');
        if (style === 0 && r.next() < 0.6) dormer(m, along, x0, y0, x1, y1, hgt, roof, wall);
      }
      m.light(x1, y1, 0.1, 10, '#ffcf7a');
      return m;
    }
    if (tier === 2) {
      plot(m, '#a9a294', 0, 0, 1, 1);
      const x0 = 0.08, y0 = 0.08, x1 = 0.92, y1 = 0.92;
      const fl = style <= 1 ? 2 + (r.next() < 0.4 ? 1 : 0) : 3;
      const hgt = fl * FH + 0.03;
      const shop = pick(PAL.awnings, r.next());
      const wp = wallPaint({ floors: fl, colW: 0.14, shop, course: brick ? '#000' : null, seed, lit: 0.6 });
      m.box(x0, y0, 0, x1, y1, hgt, wall, { paint: { x: wp, y: wp } });
      awningBox(m, x1, y0 + 0.08, x1 + 0.07, y1 - 0.08, FH * 0.66, shop, 'x');
      awningBox(m, x0 + 0.08, y1, x1 - 0.08, y1 + 0.07, FH * 0.66, shop, 'y');
      if (desert || style >= 2) {
        m.box(x0 - 0.01, y0 - 0.01, hgt, x1 + 0.01, y1 + 0.01, hgt + 0.04, desert ? '#efe6d2' : '#7a7670');
        if (r.next() < 0.5) m.box(0.3, 0.3, hgt + 0.04, 0.45, 0.42, hgt + 0.1, '#9aa0a4');
        if (desert && r.next() < 0.5) m.cyl(0.5, 0.5, hgt + 0.04, hgt + 0.12, 0.14, '#f2ede2', { r1: 0.05, n: 12 });
      } else {
        m.hip(x0, y0, x1, y1, hgt, hgt + 0.2, roof, { paint: roofPaint(roof) });
        chimney(m, 0.3, 0.3, hgt + 0.06, 0.18, '#7a3a2c');
      }
      m.light(x1 + 0.02, 0.5, 0.08, 14, '#ffd38a'); m.light(0.5, y1 + 0.02, 0.08, 14, '#ffd38a');
      return m;
    }
    if (tier === 3) {
      plot(m, '#b3ad9f', 0, 0, 1, 1);
      const fl = 4 + (r.next() < 0.5 ? 1 : 0) + (style >= 2 ? 1 : 0);
      const x0 = 0.08, y0 = 0.08, x1 = 0.92, y1 = 0.92, hgt = fl * FH + 0.04;
      if (style >= 4) {
        const gp = glassPaint({ seed, glass: '#4d6e86', glass2: '#9fbfd1' });
        m.box(x0, y0, 0, x1, y1, hgt, '#5f7d92', { paint: { x: gp, y: gp } });
        m.box(x0 + 0.05, y0 + 0.05, hgt, x1 - 0.05, y1 - 0.05, hgt + 0.03, '#5a8a48'); // roof garden
        return m;
      }
      const wp = wallPaint({ floors: fl, colW: 0.12, course: brick ? '#000' : null, seed, base: '#5e5a54', baseH: 0.05, door: '#3a3a3a', doorAt: 0.5, lit: 0.6 });
      m.box(x0, y0, 0, x1, y1, hgt, wall, { paint: { x: wp, y: wp } });
      if (style === 2) { for (let f = 1; f < fl; f++) { m.box(x1, y0 + 0.15, f * FH, x1 + 0.05, y1 - 0.15, f * FH + 0.015, '#bdb8ac'); m.box(x0 + 0.15, y1, f * FH, x1 - 0.15, y1 + 0.05, f * FH + 0.015, '#bdb8ac'); } }
      if (style <= 1 && !desert) m.hip(x0, y0, x1, y1, hgt, hgt + 0.22, roof, { paint: roofPaint(roof) });
      else { m.box(x0 - 0.01, y0 - 0.01, hgt, x1 + 0.01, y1 + 0.01, hgt + 0.04, '#6a6864'); m.cyl(0.3, 0.3, hgt + 0.04, hgt + 0.2, 0.07, '#7c6a58', { n: 8 }); m.box(0.55, 0.55, hgt + 0.04, 0.72, 0.7, hgt + 0.1, '#8a8e90'); }
      return m;
    }
    // towers
    plot(m, '#a7a399', 0, 0, 1, 1);
    const tall = tier === 5;
    const fl = tall ? 16 + r.int(10) : 8 + r.int(5);
    const glassy = style >= 3 || (tall && style >= 2 && r.next() < 0.6);
    const base = 0.08;
    // podium
    m.box(base, base, 0, 1 - base, 1 - base, FH * 1.2, '#7c7a74', { paint: { x: wallPaint({ floors: 1, shop: pick(PAL.awnings, r.next()), cols: 4, seed }), y: wallPaint({ floors: 1, shop: '#3c5f90', cols: 4, seed: seed + 1 }) } });
    const sections = tall ? [[0.14, fl * 0.45], [0.2, fl * 0.35], [0.26, fl * 0.2]] : [[0.14, fl]];
    let z = FH * 1.2;
    for (let i = 0; i < sections.length; i++) {
      const [ins, n] = sections[i];
      const h = Math.round(n) * FH;
      const col = glassy ? '#5c7a90' : wall;
      const p = glassy ? glassPaint({ seed: seed + i, glass: style >= 4 ? '#3f6f7d' : '#4a6a84', glass2: style >= 4 ? '#8fd0d8' : '#a9c3d4' }) : wallPaint({ floors: Math.round(n), colW: 0.09, seed: seed + i, frame: '#d8d4ca', lit: 0.5 });
      m.box(ins, ins, z, 1 - ins, 1 - ins, z + h, col, { paint: { x: p, y: p } });
      z += h;
      m.box(ins - 0.01, ins - 0.01, z, 1 - ins + 0.01, 1 - ins + 0.01, z + 0.025, glassy ? '#d8dde0' : '#6a6864');
      z += 0.025;
    }
    if (tall) { m.box(0.46, 0.46, z, 0.54, 0.54, z + 0.3, '#b8bcbe'); m.light(0.5, 0.5, z + 0.3, 6, '#ff4a3a'); }
    else { m.box(0.3, 0.3, z, 0.5, 0.48, z + 0.1, '#8a8e90'); }
    if (style >= 4) solar(m, 0.3, 0.55, 0.7, 0.75, z);
    return m;
  };
  function solar(m, x0, y0, x1, y1, z) {
    const f = m.face([[x0, y0, z + 0.03], [x1, y0, z + 0.03], [x1, y1, z + 0.06], [x0, y1, z + 0.06]], '#25344a', { paint: (ctx, w, h, sh, br, night) => { if (night) return; ctx.strokeStyle = sh('#8aa0c0', 0.6); ctx.lineWidth = 0.004; ctx.beginPath(); for (let x = 0; x < w; x += 0.05) { ctx.moveTo(x, 0); ctx.lineTo(x, h); } ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke(); } });
    f.twoSided = true;
  }
  function awningBox(m, x0, y0, x1, y1, z, col, axis) {
    // a slanted canvas awning (striped)
    const stripe = (ctx, w, h, sh, br, night) => { if (night) return; for (let u = 0; u < w; u += 0.04) { ctx.fillStyle = sh(Math.round(u / 0.04) % 2 ? col : '#efe8d8'); ctx.fillRect(u, 0, 0.02, h); } };
    if (axis === 'x') m.face([[x0, y1, z + 0.05], [x0, y0, z + 0.05], [x1, y0, z], [x1, y1, z]], col, { paint: stripe, twoSided: true });
    else m.face([[x0, y0, z + 0.05], [x1, y0, z + 0.05], [x1, y1, z], [x0, y1, z]], col, { paint: stripe, twoSided: true });
  }
  function dormer(m, along, x0, y0, x1, y1, z, roof, wall) {
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    if (along) { m.box(cx - 0.06, y1 - 0.12, z, cx + 0.06, y1 - 0.02, z + 0.1, wall, { paint: { y: wallPaint({ floors: 1, cols: 1, fh: 0.1 }) } }); m.gable(cx - 0.06, y1 - 0.12, cx + 0.06, y1 - 0.02, z + 0.1, z + 0.15, 'y', roof, { ov: 0.01, end: wall }); }
    else { m.box(x1 - 0.12, cy - 0.06, z, x1 - 0.02, cy + 0.06, z + 0.1, wall, { paint: { x: wallPaint({ floors: 1, cols: 1 }) } }); m.gable(x1 - 0.12, cy - 0.06, x1 - 0.02, cy + 0.06, z + 0.1, z + 0.15, 'x', roof, { ov: 0.01, end: wall }); }
  }
  Art.construction = function (tier, stage, wall) {
    const m = M();
    plot(m, '#8a7a62', 0.05, 0.05, 0.95, 0.95);
    const h = (tier <= 1 ? 0.3 : tier <= 3 ? 0.7 : 1.4) * (stage + 1) / 3;
    m.box(0.15, 0.15, 0, 0.85, 0.85, 0.04, '#a8a296');
    if (stage >= 1) m.box(0.2, 0.2, 0.04, 0.8, 0.8, h * 0.7, wall, { paint: { x: wallPaint({ floors: Math.max(1, Math.round(h * 0.7 / FH)), seed: 1 }), y: wallPaint({ floors: Math.max(1, Math.round(h * 0.7 / FH)), seed: 2 }) } });
    // scaffolding poles and boards
    const sc = '#c9a050';
    for (const [x, y] of [[0.14, 0.14], [0.86, 0.14], [0.86, 0.86], [0.14, 0.86], [0.5, 0.86], [0.86, 0.5]]) m.box(x - 0.008, y - 0.008, 0, x + 0.008, y + 0.008, h, '#8a8e92');
    for (let z = 0.12; z < h; z += 0.14) { m.box(0.84, 0.12, z, 0.89, 0.88, z + 0.012, sc); m.box(0.12, 0.84, z, 0.88, 0.89, z + 0.012, sc); }
    if (stage === 0) { m.box(0.25, 0.6, 0, 0.45, 0.75, 0.08, '#9a8a70'); m.cyl(0.7, 0.3, 0, 0.1, 0.07, '#b8b0a0', { r1: 0.01, n: 8 }); }
    // tower crane for tall buildings
    if (tier >= 3) { m.box(0.08, 0.5, 0, 0.13, 0.55, h + 0.5, '#e0b030'); m.box(0.08, 0.1, h + 0.48, 0.13, 0.95, h + 0.52, '#e0b030'); }
    return m;
  };

  // ---------- town landmarks ----------
  Art.special = function (id, style, climate, snow) {
    const m = M();
    const roof = snow ? '#eef2f5' : '#4e555e';
    const desert = climate === 'desert';
    const stone = desert ? '#e2cfa8' : '#c4b495';
    if (id === 'townhall') {
      plot(m, '#b4ac9c', 0, 0, 1, 1);
      const wp = wallPaint({ floors: 2, colW: 0.1, ww: 0.035, wh: FH * 0.6, course: '#000', seed: 5, frame: '#f2ecdc' });
      m.box(0.1, 0.12, 0, 0.9, 0.82, 0.34, stone, { paint: { x: wp, y: wp } });
      for (let i = 0; i < 5; i++) m.cyl(0.2 + i * 0.15, 0.88, 0.02, 0.3, 0.018, '#ece4d0', { n: 6 });
      m.box(0.14, 0.82, 0.3, 0.86, 0.92, 0.34, '#e6dcc6');
      m.gable(0.14, 0.82, 0.86, 0.92, 0.34, 0.42, 'x', '#e6dcc6', { ov: 0 });
      m.box(0.1, 0.12, 0, 0.9, 0.82, 0.03, '#8e8676');
      if (desert) { m.cyl(0.5, 0.47, 0.34, 0.5, 0.2, '#e8d2a0', { r1: 0.04, n: 14 }); }
      else m.hip(0.1, 0.12, 0.9, 0.82, 0.34, 0.5, roof, { paint: roofPaint(roof) });
      // clock tower
      const clock = (ctx, w, h, sh, br, night) => { const cx = w / 2, cy = h - 0.07; ctx.fillStyle = night ? '#fff1c4' : sh('#f4efe2'); ctx.beginPath(); ctx.arc(cx, cy, 0.045, 0, 7); ctx.fill(); if (!night) { ctx.strokeStyle = sh('#222'); ctx.lineWidth = 0.008; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy + 0.03); ctx.moveTo(cx, cy); ctx.lineTo(cx + 0.022, cy); ctx.stroke(); } };
      m.box(0.4, 0.38, 0.34, 0.6, 0.58, 0.82, stone, { paint: { x: clock, y: clock } });
      m.hip(0.4, 0.38, 0.6, 0.58, 0.82, 1.02, desert ? '#b9803c' : '#3f6b5c', { ov: 0.02 });
      m.light(0.5, 0.9, 0.05, 14, '#ffd38a');
      return m;
    }
    if (id === 'church') {
      plot(m, '#6f9447', 0, 0, 1, 1);
      const arch = (ctx, w, h, sh, br, night) => {
        for (let u = 0.1; u < w - 0.05; u += 0.14) {
          ctx.fillStyle = night ? '#ffcf8a' : sh('#3d4a6a');
          ctx.beginPath(); ctx.moveTo(u, 0.08); ctx.lineTo(u, 0.22); ctx.arc(u + 0.025, 0.22, 0.025, Math.PI, 0, true); ctx.lineTo(u + 0.05, 0.08); ctx.closePath(); ctx.fill();
          if (!night) { ctx.fillStyle = sh('#c94a3a', 0.6); ctx.fillRect(u + 0.01, 0.12, 0.012, 0.05); ctx.fillStyle = sh('#e0b030', 0.6); ctx.fillRect(u + 0.028, 0.14, 0.012, 0.05); }
        }
      };
      m.box(0.32, 0.12, 0, 0.68, 0.88, 0.34, stone, { paint: { x: arch, y: arch } });
      m.gable(0.32, 0.12, 0.68, 0.88, 0.34, 0.6, 'y', roof, { paint: roofPaint(roof), end: stone });
      m.box(0.38, 0.72, 0, 0.62, 0.96, 0.8, stone, { paint: { x: wallPaint({ floors: 4, cols: 1, ww: 0.04, seed: 9, course: '#000' }), y: arch } });
      m.hip(0.38, 0.72, 0.62, 0.96, 0.8, 1.55, desert ? '#d9c08a' : '#5a6268', { ov: 0.01 });
      m.light(0.5, 0.95, 0.15, 12, '#ffcf8a');
      return m;
    }
    if (id === 'market') {
      plot(m, '#b4ac9c', 0, 0, 1, 1);
      const wp = wallPaint({ floors: 2, colW: 0.15, ww: 0.08, wh: FH * 0.7, frame: '#3a4a3a', seed: 12 });
      m.box(0.06, 0.06, 0, 0.94, 0.94, 0.3, desert ? '#e2c49c' : '#a85a44', { paint: { x: wp, y: wp } });
      m.gable(0.06, 0.06, 0.94, 0.94, 0.3, 0.55, 'x', '#7fa3b4', { paint: glassPaint({ glass: '#7f9fb2', glass2: '#c4dae4', seed: 3 }), end: desert ? '#e2c49c' : '#a85a44' });
      m.light(0.95, 0.5, 0.1, 18, '#ffd38a');
      return m;
    }
    if (id === 'hospital') {
      plot(m, '#a9b48f', 0, 0, 1, 1);
      const wp = wallPaint({ floors: 5, colW: 0.09, frame: '#cfd6da', seed: 21, lit: 0.8 });
      m.box(0.08, 0.16, 0, 0.92, 0.84, 0.78, '#eef0ee', { paint: { x: wp, y: wp } });
      m.box(0.08, 0.16, 0.78, 0.92, 0.84, 0.81, '#9aa0a4');
      const cross = (ctx, w, h, sh, br, night) => { ctx.fillStyle = night ? '#ff6a5a' : sh('#c8332b'); ctx.fillRect(w / 2 - 0.05, h - 0.17, 0.1, 0.03); ctx.fillRect(w / 2 - 0.015, h - 0.205, 0.03, 0.1); };
      m.box(0.4, 0.4, 0.81, 0.6, 0.6, 0.98, '#eef0ee', { paint: { x: cross, y: cross } });
      m.disc(0.25, 0.3, 0.815, 0.1, '#5f6a70');
      return m;
    }
    if (id === 'stadium') {
      plot(m, '#9aa08e', 0, 0, 1, 1);
      m.face([[0.2, 0.2, 0.01], [0.8, 0.2, 0.01], [0.8, 0.8, 0.01], [0.2, 0.8, 0.01]], '#4f8a3a', { paint: (ctx, w, h, sh, br, night) => { if (night) { ctx.fillStyle = '#7fd46a'; ctx.fillRect(0, 0, w, h); return; } ctx.strokeStyle = sh('#f4f4f4'); ctx.lineWidth = 0.006; ctx.strokeRect(0.04, 0.04, w - 0.08, h - 0.08); ctx.beginPath(); ctx.moveTo(w / 2, 0.04); ctx.lineTo(w / 2, h - 0.04); ctx.stroke(); } });
      const stand = '#c9c4b8';
      m.box(0.05, 0.05, 0, 0.95, 0.18, 0.22, stand); m.box(0.05, 0.82, 0, 0.95, 0.95, 0.22, stand);
      m.box(0.05, 0.18, 0, 0.18, 0.82, 0.16, stand); m.box(0.82, 0.18, 0, 0.95, 0.82, 0.16, stand);
      for (const [x, y] of [[0.08, 0.08], [0.92, 0.08], [0.92, 0.92], [0.08, 0.92]]) { m.box(x - 0.015, y - 0.015, 0, x + 0.015, y + 0.015, 0.75, '#8a8e92'); m.box(x - 0.05, y - 0.05, 0.72, x + 0.05, y + 0.05, 0.78, '#d8dde0', { emit: true }); m.light(x, y, 0.75, 26, '#eaf2ff'); }
      return m;
    }
    return m;
  };

  // ---------- industry parts ----------
  function shed(m, x0, y0, x1, y1, h, wall, roof, axis, o) {
    o = o || {};
    m.box(x0, y0, 0, x1, y1, h, wall, { paint: o.paint || { x: corrugated(wall), y: corrugated(wall) } });
    if (o.flat) m.box(x0 - 0.01, y0 - 0.01, h, x1 + 0.01, y1 + 0.01, h + 0.03, roof);
    else m.gable(x0, y0, x1, y1, h, h + (o.pitch || 0.16), axis || 'x', roof, { paint: corrugated(roof), end: wall });
  }
  function sawtooth(m, x0, y0, x1, y1, h, wall, roof, n) {
    m.box(x0, y0, 0, x1, y1, h, wall, { paint: { x: wallPaint({ floors: 1, colW: 0.14, ww: 0.08, wh: 0.08, course: '#000', seed: 4 }), y: wallPaint({ floors: 1, colW: 0.14, ww: 0.08, wh: 0.08, course: '#000', seed: 5 }) } });
    const step = (y1 - y0) / n;
    for (let i = 0; i < n; i++) {
      const a = y0 + i * step, b = a + step;
      m.face([[x0, a, h], [x1, a, h], [x1, b, h + 0.14], [x0, b, h + 0.14]], roof, { paint: corrugated(roof) });
      m.face([[x1, b, h], [x0, b, h], [x0, b, h + 0.14], [x1, b, h + 0.14]], '#9fb6c4', { paint: glassPaint({ glass: '#7d97a8', glass2: '#b9d0dc' }), emitNight: 'rgba(255,214,140,0.85)' });
      m.face([[x1, a, h], [x1, b, h], [x1, b, h + 0.14]], wall);
    }
  }
  function chimneyStack(m, x, y, h, r, o) {
    o = o || {};
    m.cyl(x, y, 0, h, r, o.col || '#8a4a3a', { r1: r * 0.75, n: 10, paint: o.bands ? bandsPaint('#d8d4cc', '#c23a2c', 4) : null, top: '#1e1e1e' });
    return [x, y, h];
  }
  function coolingTower(m, x, y, h, r) {
    // hyperboloid approximated by two frustums
    m.cyl(x, y, 0, h * 0.62, r, '#c9c4b8', { r1: r * 0.68, n: 16, noTop: true });
    m.cyl(x, y, h * 0.62, h, r * 0.68, '#d2cdc2', { r1: r * 0.78, n: 16, top: '#3a3a3a' });
    return [x, y, h];
  }
  function tank(m, x, y, h, r, col) { m.cyl(x, y, 0, h, r, col || '#d9d6cc', { n: 14, top: col || '#e6e3da' }); }
  function silo(m, x, y, h, r, col) { m.cyl(x, y, 0, h, r, col || '#b8b8b0', { n: 12, noTop: true }); m.cyl(x, y, h, h + r * 0.9, r, col || '#c8c8c0', { r1: 0.01, n: 12 }); }
  function heap(m, x, y, r, h, col) { m.cyl(x, y, 0, h, r, col, { r1: r * 0.12, n: 9 }); }
  // steel lattice tower: four tapering legs, edge rails at each level, X-bracing on the faces
  function lattice(m, x, y, w, h, col) {
    const t = 0.014;
    const at = (k, sx, sy) => { const r = w * (1 - 0.6 * k); return [x + sx * r, y + sy * r, h * k]; };
    const bar = (p, q) => {
      const dx = q[0] - p[0], dy = q[1] - p[1];
      const L = Math.hypot(dx, dy) || 1, nx = -dy / L * t, ny = dx / L * t;
      m.face([[p[0] - nx, p[1] - ny, p[2]], [q[0] - nx, q[1] - ny, q[2]], [q[0] + nx, q[1] + ny, q[2] + t * 1.5], [p[0] + nx, p[1] + ny, p[2] + t * 1.5]], col, { twoSided: true });
    };
    const C = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (const [sx, sy] of C) bar(at(0, sx, sy), at(1, sx, sy));
    const lv = [0.25, 0.5, 0.75, 1];
    for (let i = 0; i < lv.length; i++) {
      for (let j = 0; j < 4; j++) { const [ax, ay] = C[j], [bx, by] = C[(j + 1) & 3]; bar(at(lv[i], ax, ay), at(lv[i], bx, by)); }
      // X-bracing on the two faces the camera sees
      const k0 = i ? lv[i - 1] : 0, k1 = lv[i];
      bar(at(k0, 1, -1), at(k1, 1, 1)); bar(at(k0, 1, 1), at(k1, 1, -1));
      bar(at(k0, 1, 1), at(k1, -1, 1)); bar(at(k0, -1, 1), at(k1, 1, 1));
    }
    m.box(x - w * 0.42, y - w * 0.42, h, x + w * 0.42, y + w * 0.42, h + 0.025, col);
  }
  function logPile(m, x, y, l, n, axis) {
    for (let i = 0; i < n; i++) {
      const row = i < 3 ? 0 : i < 5 ? 1 : 2, k = i < 3 ? i : i < 5 ? i - 3 : 0;
      const off = row * 0.035 + k * 0.07;
      if (axis === 'x') m.cylH(x, x + l, y + off, 0.035 + row * 0.06, 0.034, '#8a6038', { n: 7, axis: 'x', cap: '#d8b47a' });
      else m.cylH(y, y + l, x + off, 0.035 + row * 0.06, 0.034, '#8a6038', { n: 7, axis: 'y', cap: '#d8b47a' });
    }
  }
  function conveyor(m, x0, y0, z0, x1, y1, z1, w) {
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy), nx = -dy / L * w, ny = dx / L * w;
    m.face([[x0 - nx, y0 - ny, z0], [x1 - nx, y1 - ny, z1], [x1 + nx, y1 + ny, z1], [x0 + nx, y0 + ny, z0]], '#5a5048', { twoSided: true });
    m.face([[x0 - nx, y0 - ny, z0 - 0.025], [x1 - nx, y1 - ny, z1 - 0.025], [x1 - nx, y1 - ny, z1], [x0 - nx, y0 - ny, z0]], '#7a7068', { twoSided: true });
    const n = Math.max(1, Math.round(L / 0.35));
    for (let i = 1; i <= n; i++) { const t = i / (n + 1), px = x0 + dx * t, py = y0 + dy * t, pz = z0 + (z1 - z0) * t; m.box(px - 0.01, py - 0.01, 0, px + 0.01, py + 0.01, pz - 0.02, '#6a6e72'); }
  }
  function fence(m, x0, y0, x1, y1) {
    const col = '#8a8e92';
    m.face([[x0, y0, 0], [x1, y0, 0], [x1, y0, 0.07], [x0, y0, 0.07]], col, { twoSided: true, alpha: 0.55 });
    m.face([[x1, y0, 0], [x1, y1, 0], [x1, y1, 0.07], [x1, y0, 0.07]], col, { twoSided: true, alpha: 0.55 });
    m.face([[x0, y1, 0], [x1, y1, 0], [x1, y1, 0.07], [x0, y1, 0.07]], col, { twoSided: true, alpha: 0.55 });
  }
  function yard(m, x0, y0, x1, y1, col) { const f = m.face([[x0, y0, 0.003], [x1, y0, 0.003], [x1, y1, 0.003], [x0, y1, 0.003]], col); f.noSeam = true; }
  function office(m, x0, y0, x1, y1, fl, col) {
    const wp = wallPaint({ floors: fl, colW: 0.1, seed: x0 * 10 | 0, lit: 0.6 });
    m.box(x0, y0, 0, x1, y1, fl * FH + 0.02, col, { paint: { x: wp, y: wp } });
    m.box(x0 - 0.01, y0 - 0.01, fl * FH + 0.02, x1 + 0.01, y1 + 0.01, fl * FH + 0.05, '#5a5c5e');
  }

  // Industry models. Returns {m, anim: [{k, x, y, z}], smoke: [{x, y, z, kind}]}
  Art.industry = function (type, seed, climate, snow) {
    const m = M(), anim = [], smoke = [];
    const def = HL.INDUSTRY[type];
    const W = def.w, H = def.h;
    const roof = snow ? '#e8eef2' : '#5f6468', redRoof = snow ? '#e8eef2' : '#8a3d2c';
    const r = new HL.RNG(seed);
    const ground = { coal_mine: '#5a5450', ore_mine: '#7a5844', copper_mine: '#6a6a58', steel: '#6a645c', power: '#7c776e', refinery: '#8c877a', factory: '#857e70', paper_mill: '#857e70', printer: '#857e70', food_plant: '#8c877a', sawmill: '#7a6a52', gold_mine: '#6d665c', gem_mine: '#8a7a5c' }[def.art];
    if (ground) yard(m, 0.05, 0.05, W - 0.05, H - 0.05, ground);
    switch (def.art) {
      case 'coal_mine': case 'gold_mine': case 'gem_mine': {
        const pile = type === 'coal_mine' ? '#26231f' : type === 'gold_mine' ? '#7a6a4a' : '#8a7458';
        // headframe with winding wheel
        lattice(m, 1.0, 1.0, 0.3, 1.25, '#7a3a2a');
        // back-stay leaning from the winding house to the head of the frame
        m.face([[1.85, 0.62, 0.0], [1.08, 0.98, 1.2], [1.08, 1.02, 1.2], [1.85, 0.66, 0.0]], '#6a3224', { twoSided: true });
        m.face([[1.85, 1.0, 0.0], [1.08, 1.0, 1.2], [1.08, 1.04, 1.2], [1.85, 1.04, 0.0]], '#6a3224', { twoSided: true });
        m.box(0.85, 0.82, 0.0, 1.15, 1.18, 0.16, '#4a4642');
        anim.push({ k: 'wheel', x: 1.0, y: 1.0, z: 1.42, r: 0.18 });
        shed(m, 1.6, 0.25, 2.6, 1.0, 0.42, '#9a4a35', redRoof, 'x', { paint: { x: wallPaint({ floors: 2, course: '#000', seed: 2, colW: 0.16 }), y: wallPaint({ floors: 2, course: '#000', seed: 3, colW: 0.16 }) } });
        chimneyStack(m, 2.4, 0.4, 1.0, 0.07, { col: '#7a3a2c' });
        smoke.push({ x: 2.4, y: 0.4, z: 1.0, kind: 'grey' });
        heap(m, 0.8, 2.2, 0.5, 0.42, pile); heap(m, 1.6, 2.4, 0.42, 0.34, pile);
        if (W > 3) { heap(m, 3.3, 2.3, 0.45, 0.4, pile); conveyor(m, 1.4, 1.2, 0.6, 3.1, 2.1, 0.38, 0.05); shed(m, 3.0, 0.3, 3.8, 1.2, 0.3, '#8a8e8a', roof, 'y'); }
        if (type === 'gem_mine') fence(m, 0.08, 0.08, W - 0.08, H - 0.08);
        break;
      }
      case 'ore_mine': case 'copper_mine': {
        const ore = type === 'ore_mine' ? '#8a4a30' : '#4f8a74';
        // terraced open pit
        for (let i = 0; i < 3; i++) { const k = i * 0.22; m.face([[0.2 + k, 0.2 + k, 0.005 + i * 0.002], [2.2 - k, 0.2 + k, 0.005 + i * 0.002], [2.2 - k, H - 0.2 - k, 0.005 + i * 0.002], [0.2 + k, H - 0.2 - k, 0.005 + i * 0.002]], i % 2 ? '#6e5a48' : '#5e4c3c'); }
        heap(m, 2.8, 0.8, 0.48, 0.5, ore); heap(m, 2.7, 1.9, 0.38, 0.36, ore);
        if (W > 3) { m.box(3.2, 0.3, 0, 3.8, 1.0, 0.8, '#8a7e70', { paint: { x: corrugated('#8a7e70'), y: corrugated('#8a7e70') } }); m.box(3.15, 0.25, 0.8, 3.85, 1.05, 0.84, '#5a5048'); conveyor(m, 3.4, 1.1, 0.6, 2.9, 1.9, 0.3, 0.05); }
        else conveyor(m, 2.2, 1.1, 0.4, 2.8, 0.8, 0.45, 0.05);
        // excavator
        m.box(1.0, 1.0, 0.01, 1.3, 1.25, 0.14, '#d9a030'); m.box(1.12, 1.25, 0.14, 1.2, 1.6, 0.18, '#c89020');
        break;
      }
      case 'power': {
        m.box(0.2, 0.2, 0, 2.1, 1.3, 0.62, '#a8a294', { paint: { x: wallPaint({ floors: 3, colW: 0.18, ww: 0.08, wh: 0.1, seed: 7 }), y: wallPaint({ floors: 3, colW: 0.18, ww: 0.08, wh: 0.1, seed: 8 }) } });
        m.box(0.18, 0.18, 0.62, 2.12, 1.32, 0.66, '#6a6864');
        const c1 = chimneyStack(m, 0.6, 1.6, 1.9, 0.09, { bands: true }), c2 = chimneyStack(m, 1.05, 1.6, 1.9, 0.09, { bands: true });
        smoke.push({ x: c1[0], y: c1[1], z: c1[2], kind: 'grey' }, { x: c2[0], y: c2[1], z: c2[2], kind: 'grey' });
        const ct = coolingTower(m, 2.3, 2.2, 1.35, 0.55); smoke.push({ x: ct[0], y: ct[1], z: ct[2], kind: 'steam', big: true });
        heap(m, 0.7, 2.4, 0.4, 0.28, '#26231f');
        for (let i = 0; i < 3; i++) m.box(1.4 + i * 0.22, 2.3, 0, 1.5 + i * 0.22, 2.4, 0.3, '#7d8a90');
        m.light(1.2, 1.32, 0.4, 18, '#ffcf7a');
        break;
      }
      case 'steel': {
        shed(m, 0.2, 0.2, 3.8, 1.1, 0.6, '#6e6a64', roof, 'x');
        shed(m, 0.2, 2.6, 2.4, 3.8, 0.5, '#7a5a48', redRoof, 'x');
        for (let i = 0; i < 2; i++) {
          const x = 2.9 + i * 0.6, y = 2.0;
          m.cyl(x, y, 0, 0.9, 0.2, '#4a4642', { r1: 0.14, n: 12, noTop: true });
          m.cyl(x, y, 0.9, 1.25, 0.14, '#5a5652', { r1: 0.06, n: 10 });
          anim.push({ k: 'glow', x, y, z: 0.4, r: 26 });
          smoke.push({ x, y, z: 1.25, kind: 'dark' });
        }
        m.cyl(1.0, 1.8, 0, 0.55, 0.36, '#6a7a82', { n: 16 });
        const c = chimneyStack(m, 3.6, 3.4, 1.7, 0.1, { col: '#5a5450' }); smoke.push({ x: c[0], y: c[1], z: c[2], kind: 'dark' });
        conveyor(m, 1.6, 1.6, 0.2, 2.8, 2.0, 0.8, 0.05);
        m.light(3.2, 2.2, 0.2, 40, '#ff8a3a');
        break;
      }
      case 'farm': case 'maize_farm': {
        const desert = type === 'maize_farm';
        yard(m, 0.1, 0.1, W - 0.1, H - 0.1, desert ? '#c4a87a' : '#8a7a5a');
        const fw = desert ? '#e2c49c' : '#e6dfcc';
        const wp = wallPaint({ floors: 2, cols: 2, door: '#5a3a2a', doorAt: 0.5, seed: 31 });
        m.box(0.3, 0.3, 0, 0.95, 0.85, 0.32, fw, { paint: { x: wp, y: wp } });
        if (desert) m.box(0.28, 0.28, 0.32, 0.97, 0.87, 0.36, '#d8c8a8'); else m.gable(0.3, 0.3, 0.95, 0.85, 0.32, 0.52, 'x', redRoof, { paint: roofPaint(redRoof), end: fw });
        // barn
        const barn = desert ? '#b88a5a' : '#9a3a2c';
        m.box(1.3, 0.25, 0, 2.5, 1.0, 0.42, barn, { paint: { x: (ctx, w, h, sh, br, night) => { if (night) return; ctx.fillStyle = sh('#efe6d8'); ctx.fillRect(w / 2 - 0.12, 0, 0.24, 0.3); ctx.strokeStyle = sh('#efe6d8'); ctx.lineWidth = 0.02; ctx.beginPath(); ctx.moveTo(w / 2 - 0.12, 0.3); ctx.lineTo(w / 2 + 0.12, 0); ctx.moveTo(w / 2 - 0.12, 0); ctx.lineTo(w / 2 + 0.12, 0.3); ctx.stroke(); }, y: corrugated(barn) } });
        m.gable(1.3, 0.25, 2.5, 1.0, 0.42, 0.7, 'x', snow ? '#e8eef2' : '#4f4a46', { paint: corrugated('#4f4a46'), end: barn });
        silo(m, 2.0, 1.5, 0.8, 0.17, '#b8b4aa'); silo(m, 2.4, 1.6, 0.7, 0.15, '#c8c0b0');
        if (!desert) { hedge(m, 0.1, H - 0.2, W - 0.1, H - 0.12, 0.06); m.box(0.4, 1.6, 0.0, 0.7, 1.75, 0.12, '#c94a2a'); }
        // haystacks / maize bins
        heap(m, 0.6, 2.3, 0.2, 0.22, desert ? '#e8c43c' : '#d8b860'); heap(m, 1.1, 2.4, 0.18, 0.2, desert ? '#e8c43c' : '#d8b860');
        break;
      }
      case 'forest': case 'lumber': case 'rubber': {
        yard(m, 0.15, 0.15, W - 0.15, H - 0.15, '#7a6248');
        if (type === 'rubber') {
          tank(m, 1.0, 1.0, 0.35, 0.28, '#d8d2c0'); tank(m, 1.7, 1.0, 0.35, 0.28, '#d8d2c0');
          shed(m, 0.3, 1.8, 1.6, 2.6, 0.32, '#c9a476', redRoof, 'x');
        } else {
          logPile(m, 0.4, 0.4, 1.2, 6, 'x'); logPile(m, 0.4, 1.2, 1.0, 5, 'x');
          shed(m, 1.9, 0.3, 2.8, 1.4, 0.36, '#8a6a48', roof, 'y', { pitch: 0.12 });
          m.box(0.5, 2.0, 0, 1.0, 2.4, 0.26, '#6f5038', { paint: { x: wallPaint({ floors: 1, cols: 1, door: '#3a2a20', doorAt: 0.5 }) } });
          m.gable(0.5, 2.0, 1.0, 2.4, 0.26, 0.4, 'x', snow ? '#e8eef2' : '#3f5f3a', { end: '#6f5038' });
          if (W > 3) { logPile(m, 2.4, 2.2, 1.2, 6, 'x'); m.box(2.2, 3.2, 0, 2.7, 3.5, 0.18, '#c89a2a'); m.box(2.25, 3.0, 0.18, 2.32, 3.3, 0.5, '#5a5a5a'); }
        }
        break;
      }
      case 'sawmill': case 'paper_mill': case 'printer': case 'food_plant': case 'factory': case 'works': {
        const brick = type === 'printer' || type === 'factory' || type === 'works' ? '#9a4a35' : type === 'food_plant' ? '#e2ded2' : '#8a7e6a';
        if (type === 'factory' || type === 'works' || type === 'printer') sawtooth(m, 0.2, 0.2, W - 1.2, H - 0.8, 0.42, brick, roof, Math.max(2, H - 1));
        else shed(m, 0.2, 0.2, W - 1.0, 1.4, 0.5, brick, type === 'food_plant' ? '#c9c4b8' : roof, 'x');
        office(m, W - 1.0, 0.25, W - 0.25, 0.9, 3, type === 'food_plant' ? '#f0eee8' : '#b8ae9a');
        const c = chimneyStack(m, W - 0.6, H - 0.5, type === 'printer' ? 1.1 : 1.4, 0.08, { col: '#7a3a2c' });
        smoke.push({ x: c[0], y: c[1], z: c[2], kind: type === 'paper_mill' || type === 'food_plant' ? 'steam' : 'grey' });
        if (type === 'sawmill') { logPile(m, 0.3, 1.8, 1.0, 6, 'x'); for (let i = 0; i < 3; i++) m.box(1.6 + i * 0.25, 2.0, 0, 1.8 + i * 0.25, 2.6, 0.12 + i * 0.03, '#d8b47a'); }
        if (type === 'paper_mill') { tank(m, 1.0, 2.3, 0.5, 0.3, '#c8c4b8'); tank(m, 1.8, 2.4, 0.4, 0.25, '#c8c4b8'); logPile(m, 2.4, 1.8, 0.9, 5, 'x'); smoke.push({ x: 1.0, y: 2.3, z: 0.5, kind: 'steam' }); }
        if (type === 'food_plant') { silo(m, 0.6, 2.2, 0.85, 0.18, '#d8d8d0'); silo(m, 1.05, 2.3, 0.85, 0.18, '#d8d8d0'); m.box(1.5, 1.9, 0, 2.2, 2.6, 0.28, '#e8e6e0', { paint: { x: wallPaint({ floors: 1, cols: 3, seed: 2 }) } }); }
        if (type === 'factory' || type === 'works') { tank(m, W - 0.9, H - 1.5, 0.3, 0.2, '#7a8a8e'); m.box(0.3, H - 0.6, 0, 1.3, H - 0.25, 0.2, '#5a6a72'); }
        m.light(W - 0.6, 0.9, 0.2, 16, '#ffd38a');
        break;
      }
      case 'oil_wells': {
        yard(m, 0.1, 0.1, W - 0.1, H - 0.1, '#8a7e68');
        const spots = [[0.6, 0.6], [2.4, 0.7], [1.4, 1.9], [3.3, 2.0], [0.7, 3.2], [2.6, 3.3]];
        for (const [x, y] of spots.slice(0, 4 + (seed & 1) * 2)) { m.box(x - 0.12, y - 0.06, 0, x + 0.12, y + 0.06, 0.04, '#5a5652'); anim.push({ k: 'pump', x, y, z: 0.04 }); }
        tank(m, 3.4, 0.6, 0.3, 0.22, '#d9d2c0'); tank(m, 3.4, 1.15, 0.3, 0.22, '#d9d2c0');
        conveyor(m, 0.6, 0.6, 0.05, 3.2, 0.6, 0.05, 0.015);
        break;
      }
      case 'oil_rig': {
        // legs, deck, derrick, flare boom, helipad
        for (const [x, y] of [[0.4, 0.4], [2.6, 0.4], [2.6, 2.6], [0.4, 2.6]]) m.cyl(x, y, -0.1, 0.5, 0.11, '#c8a03a', { n: 8 });
        m.box(0.25, 0.25, 0.5, 2.75, 2.75, 0.62, '#7a7e82');
        m.box(0.4, 0.4, 0.62, 1.6, 1.4, 0.9, '#d9d4c8', { paint: { x: wallPaint({ floors: 2, cols: 4, seed: 9, lit: 0.8 }), y: wallPaint({ floors: 2, cols: 3, seed: 10, lit: 0.8 }) } });
        lattice(m, 2.0, 1.0, 0.25, 1.4, '#c84a2a'); m.box(1.7, 0.7, 0.62, 2.3, 1.3, 0.66, '#6a6e72');
        m.disc(1.0, 2.1, 0.64, 0.42, '#3e5260');
        m.face([[0.7, 2.1, 0.645], [1.3, 2.1, 0.645], [1.3, 2.13, 0.645], [0.7, 2.13, 0.645]], '#f2f2f2');
        m.box(2.7, 2.2, 0.8, 3.4, 2.26, 0.86, '#8a8e92');
        anim.push({ k: 'flare', x: 3.35, y: 2.23, z: 0.9 });
        m.light(1.0, 1.0, 0.9, 30, '#ffd38a');
        break;
      }
      case 'refinery': {
        for (let i = 0; i < 4; i++) tank(m, 0.6 + (i % 2) * 0.8, 0.6 + (i >> 1) * 0.8, 0.32, 0.34, i === 3 ? '#e8e2d2' : '#d8d2c2');
        for (let i = 0; i < 3; i++) { m.cyl(2.5 + i * 0.32, 1.0, 0, 1.0 + i * 0.25, 0.1, '#b8b8b0', { n: 10, top: '#8a8a84' }); }
        m.box(2.2, 0.6, 0.4, 3.5, 1.4, 0.43, '#8a8e92');
        conveyor(m, 1.2, 1.2, 0.35, 2.4, 1.1, 0.35, 0.02);
        m.cyl(3.4, 3.3, 0, 1.6, 0.05, '#7a7e82', { n: 8 });
        anim.push({ k: 'flare', x: 3.4, y: 3.3, z: 1.62 });
        office(m, 0.3, 2.7, 1.3, 3.6, 2, '#d8d4c8');
        tank(m, 2.2, 2.6, 0.5, 0.42, '#c9c4b8');
        for (const [x, y] of [[2.5, 1.0], [3.14, 1.0]]) m.light(x, y, 0.8, 12, '#ffd38a');
        break;
      }
      case 'bank': case 'vault': {
        const stone = type === 'vault' ? '#9a9286' : '#d8ccb0';
        m.box(0.08, 0.15, 0, W - 0.08, 0.92, 0.5, stone, { paint: { x: wallPaint({ floors: 2, cols: 3, seed: 2, course: '#000', ww: 0.05, wh: 0.1 }), y: wallPaint({ floors: 2, cols: 5, seed: 3, course: '#000', ww: 0.05, wh: 0.1 }) } });
        if (type === 'bank') {
          for (let i = 0; i < 6; i++) m.cyl(0.25 + i * (W - 0.5) / 5, 0.98, 0.04, 0.42, 0.03, '#f0e8d4', { n: 8 });
          m.box(0.12, 0.92, 0, W - 0.12, 1.02, 0.04, '#e6dcc6');
          m.box(0.12, 0.92, 0.42, W - 0.12, 1.02, 0.48, '#e6dcc6');
          m.gable(0.12, 0.15, W - 0.12, 1.02, 0.5, 0.64, 'x', '#e2d6bc', { ov: 0.01 });
        } else { m.box(0.05, 0.12, 0.5, W - 0.05, 0.95, 0.56, '#7a7266'); for (let i = 0; i < 6; i++) m.box(0.1 + i * (W - 0.3) / 5, 0.12, 0.56, 0.2 + i * (W - 0.3) / 5, 0.22, 0.62, '#7a7266'); }
        break;
      }
      case 'water_source': {
        yard(m, 0.1, 0.1, W - 0.1, H - 0.1, '#c4a87a');
        m.box(0.3, 0.3, 0, 0.9, 0.9, 0.26, '#e2c49c', { paint: { x: wallPaint({ floors: 1, cols: 1, door: '#3a5a8a', doorAt: 0.5 }) } });
        m.box(0.28, 0.28, 0.26, 0.92, 0.92, 0.3, '#d8c8a8');
        for (const [x, y] of [[1.3, 1.1], [1.7, 1.1], [1.7, 1.5], [1.3, 1.5]]) m.box(x - 0.02, y - 0.02, 0, x + 0.02, y + 0.02, 0.6, '#7a6a5a');
        m.cyl(1.5, 1.3, 0.6, 0.85, 0.28, '#6aa3c8', { n: 14 });
        anim.push({ k: 'pump', x: 0.6, y: 1.5, z: 0.02 });
        break;
      }
      case 'water_tower': {
        for (const [x, y] of [[0.3, 0.3], [0.7, 0.3], [0.7, 0.7], [0.3, 0.7]]) m.box(x - 0.02, y - 0.02, 0, x + 0.02, y + 0.02, 0.9, '#8a7a6a');
        m.box(0.28, 0.28, 0.45, 0.72, 0.72, 0.47, '#8a7a6a');
        m.cyl(0.5, 0.5, 0.9, 1.25, 0.3, '#d8c8a8', { n: 14 });
        m.cyl(0.5, 0.5, 1.25, 1.36, 0.3, '#b9803c', { r1: 0.02, n: 14 });
        break;
      }
      case 'orchard': {
        yard(m, 0.1, 0.1, W - 0.1, H - 0.1, '#7f9a4a');
        for (let y = 0.4; y < H - 0.2; y += 0.55) for (let x = 0.4; x < W - 1.0; x += 0.5) {
          m.cyl(x, y, 0, 0.1, 0.02, '#6a4a30', { n: 5 });
          m.cyl(x, y, 0.08, 0.26, 0.14, '#3f7a34', { r1: 0.04, n: 8 });
          m.light(x, y, 0.2, 0, '#000');
        }
        shed(m, W - 0.9, 0.3, W - 0.2, 1.4, 0.3, '#d8b88a', redRoof, 'y');
        for (let i = 0; i < 4; i++) m.box(W - 0.9 + i * 0.15, 1.7, 0, W - 0.8 + i * 0.15, 1.8, 0.08, '#d8752f');
        break;
      }
    }
    m.lights = m.lights.filter(l => l[3] > 0);
    return { m, anim, smoke };
  };

  // ---------- company HQ (2x2) and statue ----------
  Art.hq = function (color, size) {
    const m = M();
    const liv = HL.LIVERY[color];
    yard(m, 0.05, 0.05, 1.95, 1.95, '#a9a294');
    const gp = glassPaint({ glass: '#4a6a84', glass2: '#a9c3d4', seed: 4, lit: 0.7 });
    const wp = wallPaint({ floors: 4, colW: 0.1, seed: 6, frame: '#e8e2d0', lit: 0.7, course: '#000' });
    m.box(0.2, 0.2, 0, 1.8, 1.8, 0.62, '#c8bca2', { paint: { x: wp, y: wp } });
    m.box(0.5, 0.5, 0.62, 1.5, 1.5, 1.35, '#5c7a90', { paint: { x: gp, y: gp } });
    m.box(0.45, 0.45, 1.35, 1.55, 1.55, 1.4, liv.main);
    const flag = (ctx, w, h, sh) => { ctx.fillStyle = sh(liv.main); ctx.fillRect(0, 0, w, h); ctx.fillStyle = sh(liv.accent); ctx.fillRect(0, h * 0.4, w, h * 0.2); };
    m.box(1.0, 1.0, 1.4, 1.02, 1.02, 1.8, '#d0d0d0');
    m.face([[1.01, 1.02, 1.65], [1.01, 1.3, 1.65], [1.01, 1.3, 1.78], [1.01, 1.02, 1.78]], liv.main, { paint: flag, twoSided: true });
    m.light(1.0, 1.85, 0.3, 24, '#ffd38a');
    return m;
  };
  Art.statue = function (color) {
    const m = M();
    yard(m, 0.1, 0.1, 0.9, 0.9, '#b4ac9c');
    m.box(0.35, 0.35, 0, 0.65, 0.65, 0.18, '#c8c0b0');
    m.cyl(0.5, 0.5, 0.18, 0.42, 0.05, '#6a7a4a', { n: 8 });
    m.cyl(0.5, 0.5, 0.42, 0.48, 0.035, '#6a7a4a', { n: 8 });
    for (const [x, y] of [[0.2, 0.2], [0.8, 0.2], [0.8, 0.8], [0.2, 0.8]]) { hedgeBall(m, x, y); }
    return m;
  };
  function hedgeBall(m, x, y) { m.cyl(x, y, 0, 0.08, 0.06, '#3f6a32', { r1: 0.03, n: 8 }); }
})(typeof window !== 'undefined' ? window : globalThis);
