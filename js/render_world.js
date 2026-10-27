// Drawing for everything built on the map: roads, rails, stations, airports, buildings, industries,
// depots, signals, bridges and tunnels. Ground parts are baked into chunks; tall parts are drawn per frame.
(function (root) {
  const HL = root.HL, Gx = HL.Gfx, R = HL.R, Art = HL.Art;
  const T = HL.T;
  const TW2 = Gx.TW2, TH2 = Gx.TH2, HS = Gx.HS;
  const W = {};
  HL.RW = W;

  const wp = (x, y, h) => [(x - y) * TW2, (x + y) * TH2 - h * HS];
  const map = () => R.map;
  const g = () => R.g;
  const H = (x, y) => R.map.heightAt(x, y);
  // world point following the terrain, plus an extra height in levels
  const P = (x, y, dz) => wp(x, y, H(x, y) + (dz || 0));

  // draw a quad strip along a centre line (tile-local points) following terrain
  function strip(ctx, x, y, a, b, half, col, dz, ext, steps) {
    steps = steps || 4;
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
    const ux = dx / L, uy = dy / L, nx = -uy * half, ny = ux * half;
    const ax = a[0] - ux * (ext || 0), ay = a[1] - uy * (ext || 0), bx = b[0] + ux * (ext || 0), by = b[1] + uy * (ext || 0);
    ctx.fillStyle = col;
    ctx.beginPath();
    const L1 = [], L2 = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, px = x + ax + (bx - ax) * t, py = y + ay + (by - ay) * t;
      L1.push(P(px + nx, py + ny, dz)); L2.push(P(px - nx, py - ny, dz));
    }
    ctx.moveTo(L1[0][0], L1[0][1]);
    for (let i = 1; i < L1.length; i++) ctx.lineTo(L1[i][0], L1[i][1]);
    for (let i = L2.length - 1; i >= 0; i--) ctx.lineTo(L2[i][0], L2[i][1]);
    ctx.closePath(); ctx.fill();
  }
  function line(ctx, x, y, a, b, off, col, w, dz, steps) {
    steps = steps || 4;
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
    const nx = -dy / L * off, ny = dx / L * off;
    ctx.strokeStyle = col; ctx.lineWidth = w;
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) { const t = i / steps; const p = P(x + a[0] + dx * t + nx, y + a[1] + dy * t + ny, dz); if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }
    ctx.stroke();
  }
  W.strip = strip; W.line = line;

  // ---------- rail ----------
  const RT_STYLE = [
    { ballast: '#857c6e', ballast2: '#9a9182', sleeper: '#4b3a2c', rail: '#7d8287', railHi: '#cdd2d6' },
    { ballast: '#857c6e', ballast2: '#9a9182', sleeper: '#5a5248', rail: '#7d8287', railHi: '#d8dde0' },
    { ballast: '#9c9a94', ballast2: '#b8b6b0', sleeper: '#9c9a94', rail: '#d8d8d4', railHi: '#f0f0ec' },
    { ballast: '#a8a8a2', ballast2: '#c4c4be', sleeper: '#4f4878', rail: '#6a62a0', railHi: '#a8a0e0' },
  ];
  W.RT_STYLE = RT_STYLE;
  function pieceEnds(p) { const E = HL.PIECE_EDGES[p]; return [HL.EDGE_MID[E[0]], HL.EDGE_MID[E[1]]]; }
  W.drawTrack = function (ctx, x, y, pieces, rt, s, opt) {
    opt = opt || {};
    const st = RT_STYLE[rt];
    const dz = opt.dz || 0;
    if (!opt.noBallast) for (let p = 0; p < 6; p++) if (pieces & (1 << p)) { const [a, b] = pieceEnds(p); strip(ctx, x, y, a, b, rt === 3 ? 0.24 : 0.2, st.ballast, dz, 0.01); strip(ctx, x, y, a, b, rt === 3 ? 0.18 : 0.15, st.ballast2, dz, 0.01); }
    if (s >= 0.5 && rt < 2) {
      for (let p = 0; p < 6; p++) if (pieces & (1 << p)) {
        const [a, b] = pieceEnds(p);
        const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
        const n = Math.round(L / 0.09);
        const nx = -dy / L * 0.13, ny = dx / L * 0.13;
        ctx.strokeStyle = st.sleeper; ctx.lineWidth = 2.2;
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const t = (i + 0.5) / n, px = x + a[0] + dx * t, py = y + a[1] + dy * t;
          const p1 = P(px + nx, py + ny, dz), p2 = P(px - nx, py - ny, dz);
          ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]);
        }
        ctx.stroke();
      }
    }
    for (let p = 0; p < 6; p++) if (pieces & (1 << p)) {
      const [a, b] = pieceEnds(p);
      if (rt === 2) { strip(ctx, x, y, a, b, 0.06, '#c4c4c0', dz + 0.6, 0.01); line(ctx, x, y, a, b, 0.06, '#8a8a86', 1, dz + 0.6); continue; }
      if (rt === 3) { line(ctx, x, y, a, b, 0.1, st.rail, 2.4, dz); line(ctx, x, y, a, b, -0.1, st.rail, 2.4, dz); line(ctx, x, y, a, b, 0, '#8a8a84', 1.2, dz); continue; }
      line(ctx, x, y, a, b, 0.075, st.rail, 1.6, dz + 0.05); line(ctx, x, y, a, b, -0.075, st.rail, 1.6, dz + 0.05);
      if (s >= 1) { line(ctx, x, y, a, b, 0.075, st.railHi, 0.6, dz + 0.1); line(ctx, x, y, a, b, -0.075, st.railHi, 0.6, dz + 0.1); }
    }
  };
  R.groundDrawers[T.RAIL] = function (ctx, x, y, t, s) {
    const m = map();
    if (m.m1[t] & 0x8000) return; // bridge ramp drawn as an object
    const rt = m.rtype[t];
    if (m.road[t]) {
      // level crossing: road surface first, then rails without ballast
      drawRoadSurface(ctx, x, y, t, m.road[t], s, true);
      W.drawTrack(ctx, x, y, m.rail[t], rt, s, { noBallast: true });
      return;
    }
    W.drawTrack(ctx, x, y, m.rail[t], rt, s);
  };

  // ---------- roads ----------
  W.roadCol = function () {
    const y = HL.ymd(g().date).y;
    return y < 1922 ? { surf: '#8f8471', surf2: '#a39880', mark: null, curb: '#b4aa96' } : y < 1955 ? { surf: '#5f5d58', surf2: '#6a6862', mark: '#e6e2d6', curb: '#b8b2a4' } : { surf: '#4d4e50', surf2: '#56575a', mark: '#e9e6dc', curb: '#bdb8ac' };
  };
  function isTownRoad(m, t) {
    if (m.rowner[t] === HL.OWNER_TOWN) return true;
    return false;
  }
  function drawRoadSurface(ctx, x, y, t, rb, s, crossing) {
    const m = map(), col = W.roadCol();
    const town = isTownRoad(m, t) && !crossing;
    if (town) {
      // pavement over the whole tile
      ctx.fillStyle = Gx.shadeCss('#b2ab9c', 1);
      const c = m.corners(x, y);
      const q = [wp(x, y, c[0]), wp(x + 1, y, c[1]), wp(x + 1, y + 1, c[2]), wp(x, y + 1, c[3])];
      // four triangles to follow the terrain
      const hc = (c[0] + c[1] + c[2] + c[3]) / 4, C = wp(x + 0.5, y + 0.5, hc);
      ctx.beginPath();
      for (let i = 0; i < 4; i++) { const a = q[i], b = q[(i + 1) & 3]; ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(C[0], C[1]); ctx.closePath(); }
      ctx.fill();
      if (s >= 1) {
        ctx.strokeStyle = 'rgba(80,72,60,0.18)'; ctx.lineWidth = 0.6;
        ctx.beginPath();
        for (let i = 1; i < 4; i++) { const a = P(x + i / 4, y), b = P(x + i / 4, y + 1); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); const c2 = P(x, y + i / 4), d2 = P(x + 1, y + i / 4); ctx.moveTo(c2[0], c2[1]); ctx.lineTo(d2[0], d2[1]); }
        ctx.stroke();
      }
    }
    const half = 0.25;
    const C = [0.5, 0.5];
    const arms = [];
    for (let d = 0; d < 4; d++) if (rb & (1 << d)) arms.push(d);
    // kerb/shadow layer slightly wider, then surface
    for (const pass of [0, 1]) {
      const w = pass === 0 ? half + 0.03 : half;
      const colr = pass === 0 ? (town ? '#8e8678' : 'rgba(70,60,45,0.35)') : col.surf;
      ctx.fillStyle = colr;
      for (const d of arms) strip(ctx, x, y, C, HL.EDGE_MID[d], w, colr, 0, pass === 0 ? 0.0 : 0.005, 2);
      // centre square in four triangles
      const sq = [[0.5 - w, 0.5 - w], [0.5 + w, 0.5 - w], [0.5 + w, 0.5 + w], [0.5 - w, 0.5 + w]].map(p => P(x + p[0], y + p[1]));
      const cc = P(x + 0.5, y + 0.5);
      ctx.beginPath();
      for (let i = 0; i < 4; i++) { const a = sq[i], b = sq[(i + 1) & 3]; ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(cc[0], cc[1]); ctx.closePath(); }
      ctx.fill();
    }
    if (s >= 0.5) {
      // surface texture: wheel ruts / patches
      ctx.fillStyle = col.surf2;
      for (const d of arms) strip(ctx, x, y, C, HL.EDGE_MID[d], 0.06, col.surf2, 0, 0, 2);
      // centre line on straight roads
      if (col.mark && !crossing && (rb === 5 || rb === 10) && s >= 1) {
        const a = rb === 5 ? [0.5, 0] : [0, 0.5], b = rb === 5 ? [0.5, 1] : [1, 0.5];
        ctx.setLineDash([3, 3]);
        line(ctx, x, y, a, b, 0, col.mark, 0.9, 0.02, 2);
        ctx.setLineDash([]);
      }
    }
  }
  W.drawRoadSurface = drawRoadSurface;
  R.groundDrawers[T.ROAD] = function (ctx, x, y, t, s) {
    const m = map();
    if (m.m1[t] & 0x8000) return; // bridge ramp
    drawRoadSurface(ctx, x, y, t, m.road[t], s, false);
  };

  // ---------- foundations (stations, depots, houses on slopes) ----------
  W.foundation = function (ctx, x, y, top, col) {
    const m = map();
    const c = m.corners(x, y);
    const faces = [[1, 2], [2, 3]]; // SE face (E-S), SW face (S-W)
    const pts = [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]];
    for (const [a, b] of faces) {
      if (c[a] >= top && c[b] >= top) continue;
      const A = pts[a], B = pts[b];
      const q = [wp(A[0], A[1], top), wp(B[0], B[1], top), wp(B[0], B[1], c[b]), wp(A[0], A[1], c[a])];
      ctx.fillStyle = Gx.shadeCss(col || '#9a9080', a === 1 ? 0.78 : 0.95);
      ctx.beginPath(); ctx.moveTo(q[0][0], q[0][1]); for (let i = 1; i < 4; i++) ctx.lineTo(q[i][0], q[i][1]); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(40,30,20,0.25)'; ctx.lineWidth = 0.6;
      ctx.beginPath(); for (let k = 1; k < (top - Math.min(c[a], c[b])) * 2; k++) { const zz = top - k * 0.5; ctx.moveTo(q[0][0], wp(A[0], A[1], zz)[1]); ctx.lineTo(q[1][0], wp(B[0], B[1], zz)[1]); } ctx.stroke();
    }
    // flat top
    const q = pts.map(p => wp(p[0], p[1], top));
    return q;
  };
  function flatTile(ctx, x, y, h, col) {
    const q = [wp(x, y, h), wp(x + 1, y, h), wp(x + 1, y + 1, h), wp(x, y + 1, h)];
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(q[0][0], q[0][1]); for (let i = 1; i < 4; i++) ctx.lineTo(q[i][0], q[i][1]); ctx.closePath(); ctx.fill();
    return q;
  }
  W.flatTile = flatTile;

  // ---------- houses ----------
  R.groundDrawers[T.HOUSE] = function (ctx, x, y, t, s) {
    const m = map();
    if (!m.isFlat(x, y)) W.foundation(ctx, x, y, m.tileMax(x, y), '#9a8e7a');
  };
  function houseKey(m, t, snow) {
    const cl = g().opts.climate;
    const st = m.m2[t] & 3;
    if (HL.Towns.isSpecial(m, t)) return ['sp:' + HL.Towns.specialId(m, t) + ':' + HL.Towns.houseStyle(m, t) + ':' + cl + ':' + (snow ? 1 : 0) + ':' + (st < 3 ? st : 3), () => st < 3 ? Art.construction(2, st, '#c4b495') : Art.special(HL.Towns.specialId(m, t), HL.Towns.houseStyle(m, t), cl, snow)];
    const tier = m.m1[t] & 7, v = (m.m1[t] >> 3) & 31, style = (m.m1[t] >> 8) & 7;
    const key = 'h:' + tier + ':' + style + ':' + v + ':' + cl + ':' + (snow ? 1 : 0) + ':' + (st < 3 ? st : 3);
    return [key, () => Art.house(tier, style, v, cl, snow, st < 3 ? st : null)];
  }
  function roofSnow(x, y, t) {
    const e = R.env;
    if (R.snowAt(t, x, y) > 0) return true;
    return e.season === 3 && (g().opts.climate === 'arctic' || (e.tempSnow && map().tileMax(x, y) >= 3));
  }
  R.objDrawers[T.HOUSE] = function (ctx, x, y, t, s, baked) {
    const m = map();
    const snow = roofSnow(x, y, t);
    const [key, build] = houseKey(m, t, snow);
    const sp = Gx.modelSprite(key, s, build);
    const p = wp(x, y, m.tileMax(x, y));
    ctx.drawImage(sp.c, p[0] - sp.ox / s, p[1] - sp.oy / s, sp.c.width / s, sp.c.height / s);
    if (!baked && R.env.dark > 0.05 && (m.m2[t] & 3) === 3) {
      R.nightQueue.push([key, s, build, p[0], p[1]]);
      if (sp.lights) for (const L of sp.lights) { const lp = wp(x + L[0], y + L[1], m.tileMax(x, y) + L[2] / Gx.LEVEL); R.addLight(lp[0], lp[1], L[3], L[4], 0.7); }
    }
    if (R.opts.transparentBuildings && !baked) { /* handled by caller alpha */ }
  };

  // ---------- industries ----------
  const indCache = new Map();
  W.industryArt = function (ind) {
    const snow = R.env.season === 3 && g().opts.climate !== 'desert' || (g().opts.climate === 'arctic' && R.snowAt(map().t(ind.x, ind.y), ind.x, ind.y) > 0);
    const key = ind.type + ':' + (ind.seed & 3) + ':' + (snow ? 1 : 0);
    let a = indCache.get(key);
    if (!a) {
      a = Art.industry(ind.type, ind.seed & 3, g().opts.climate, snow);
      a.key = key;
      // whole-industry ground shadow hull (tile units)
      const pts = [];
      for (const f of a.m.faces) for (const p of f.pts) if (p[2] > 0.02) pts.push([p[0] - Gx.L[0] * p[2] / Gx.L[2], p[1] - Gx.L[1] * p[2] / Gx.L[2]]);
      // include footprints so the hull hugs the buildings
      for (const f of a.m.faces) for (const p of f.pts) if (p[2] > 0.02) pts.push([p[0], p[1]]);
      a.shadowParts = shadowPolys(a.m);
      indCache.set(key, a);
    }
    return a;
  };
  // shadows of each tall part (per face hull), unioned visually by drawing in one path with nonzero fill
  function shadowPolys(m) {
    const out = [];
    for (const f of m.faces) {
      let tall = false; for (const p of f.pts) if (p[2] > 0.03) tall = true;
      if (!tall) continue;
      const pts = [];
      for (const p of f.pts) { pts.push([p[0], p[1]]); pts.push([p[0] - Gx.L[0] * p[2] / Gx.L[2], p[1] - Gx.L[1] * p[2] / Gx.L[2]]); }
      out.push(Gx.convexHull(pts));
    }
    return out;
  }
  R.groundDrawers[T.IND] = function (ctx, x, y, t, s) {
    const m = map(), ind = g().industries[m.idx[t]];
    if (!ind) return;
    const def = HL.INDUSTRY[ind.type];
    if (def.place === 'sea') return;
    const dx = x - ind.x, dy = y - ind.y;
    const art = W.industryArt(ind);
    const h = m.tileMax(x, y);
    // shadow clipped to this tile
    ctx.save();
    const q = [wp(x, y, h), wp(x + 1, y, h), wp(x + 1, y + 1, h), wp(x, y + 1, h)];
    ctx.beginPath(); ctx.moveTo(q[0][0], q[0][1]); for (let i = 1; i < 4; i++) ctx.lineTo(q[i][0], q[i][1]); ctx.closePath(); ctx.clip();
    ctx.fillStyle = 'rgba(30,38,58,0.24)';
    ctx.beginPath();
    for (const hull of art.shadowParts) {
      const p0 = wp(ind.x + hull[0][0], ind.y + hull[0][1], h); ctx.moveTo(p0[0], p0[1]);
      for (let i = 1; i < hull.length; i++) { const p = wp(ind.x + hull[i][0], ind.y + hull[i][1], h); ctx.lineTo(p[0], p[1]); }
      ctx.closePath();
    }
    ctx.fill('nonzero');
    ctx.restore();
  };
  R.objDrawers[T.IND] = function (ctx, x, y, t, s, baked) {
    const m = map(), gg = g(), ind = gg.industries[m.idx[t]];
    if (!ind) return;
    const def = HL.INDUSTRY[ind.type];
    const art = W.industryArt(ind);
    const dx = x - ind.x, dy = y - ind.y;
    const key = 'ind:' + art.key + ':' + dx + ',' + dy;
    const sp = Gx.modelSprite(key, s, () => art.m.clip(dx, dy, dx + 1, dy + 1), { shadow: false });
    const base = def.place === 'sea' ? 0 : m.tileMax(ind.x, ind.y);
    const p = wp(x, y, base);
    ctx.drawImage(sp.c, p[0] - sp.ox / s, p[1] - sp.oy / s, sp.c.width / s, sp.c.height / s);
    if (baked) return;
    if (R.env.dark > 0.05) {
      R.nightQueue.push([key, s, () => art.m.clip(dx, dy, dx + 1, dy + 1), p[0], p[1], { shadow: false }]);
      if (sp.lights) for (const L of sp.lights) { const lp = wp(x + L[0], y + L[1], base + L[2] / Gx.LEVEL); R.addLight(lp[0], lp[1], L[3], L[4], 0.85); }
    }
    // animated parts and smoke emitters belonging to this tile
    const now = R.now;
    const active = HL.Ind.active ? HL.Ind.active(gg, ind) : true;
    for (const a of art.anim) {
      if (Math.floor(a.x) !== dx || Math.floor(a.y) !== dy) continue;
      W.drawAnim(ctx, a, ind.x + a.x, ind.y + a.y, base, s, now, active, ind);
    }
    if (HL.Fx && active) for (const e of art.smoke) {
      if (Math.floor(e.x) !== dx || Math.floor(e.y) !== dy) continue;
      HL.Fx.emitter('i' + ind.id + ':' + e.x + ':' + e.y, ind.x + e.x, ind.y + e.y, base * Gx.LEVEL + e.z, e.kind, e.big ? 0.5 : 0.8, e.big);
    }
  };
  W.drawAnim = function (ctx, a, wx, wy, base, s, now, active, ind) {
    const tm = now / 1000;
    const p = wp(wx, wy, base + a.z / Gx.LEVEL);
    if (a.k === 'wheel') {
      const ang = active ? tm * 1.6 : 0;
      const r = a.r * Gx.ZS;
      ctx.save(); ctx.translate(p[0], p[1]);
      ctx.strokeStyle = '#3a2a24'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.ellipse(0, 0, r * 0.7, r, 0, 0, 7); ctx.stroke();
      ctx.lineWidth = 0.8; ctx.beginPath();
      for (let i = 0; i < 6; i++) { const t = ang + i * Math.PI / 3; ctx.moveTo(0, 0); ctx.lineTo(Math.cos(t) * r * 0.7, Math.sin(t) * r); }
      ctx.stroke();
      ctx.restore();
    } else if (a.k === 'pump') {
      const ph = active ? Math.sin(tm * 2.2 + (ind ? ind.seed % 7 : 0) + wx * 1.7) : 0;
      const sp = Gx.modelSprite('pumpjack:' + Math.round(ph * 4), s, () => pumpModel(Math.round(ph * 4) / 4));
      ctx.drawImage(sp.c, p[0] - sp.ox / s, p[1] - sp.oy / s, sp.c.width / s, sp.c.height / s);
    } else if (a.k === 'flare') {
      const fl = 0.75 + Math.sin(tm * 13 + wx) * 0.15 + Math.sin(tm * 29) * 0.1;
      const h = 14 * fl;
      const gr = ctx.createRadialGradient(p[0], p[1] - h * 0.4, 1, p[0], p[1] - h * 0.4, h);
      gr.addColorStop(0, 'rgba(255,250,200,0.95)'); gr.addColorStop(0.35, 'rgba(255,170,60,0.85)'); gr.addColorStop(1, 'rgba(255,80,20,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(p[0], p[1] - h * 0.45, h * 0.35, h * 0.7, 0, 0, 7); ctx.fill();
      R.addLight(p[0], p[1] - 6, 46, '#ff9a3a', 1);
      if (HL.Fx) HL.Fx.emitter('fl' + wx + ':' + wy, wx, wy, base * Gx.LEVEL + a.z + 0.3, 'dark', 0.25);
    } else if (a.k === 'glow') {
      if (active) R.addLight(p[0], p[1], a.r * 1.5, '#ff7a2a', 0.9 + Math.sin(tm * 3) * 0.1);
      ctx.fillStyle = `rgba(255,${130 + Math.sin(tm * 5) * 30 | 0},40,0.65)`;
      ctx.beginPath(); ctx.ellipse(p[0], p[1], 4, 2, 0, 0, 7); ctx.fill();
    }
  };
  function pumpModel(ph) {
    const m = new Gx.Model();
    m.box(-0.1, -0.03, 0, 0.1, 0.03, 0.03, '#4a4642');
    // A-frame
    m.face([[-0.04, -0.03, 0.03], [0.0, -0.01, 0.22], [0.0, 0.01, 0.22], [-0.04, 0.03, 0.03]], '#8a3a2a', { twoSided: true });
    m.face([[0.04, -0.03, 0.03], [0.0, -0.01, 0.22], [0.0, 0.01, 0.22], [0.04, 0.03, 0.03]], '#8a3a2a', { twoSided: true });
    // walking beam tilts with phase
    const t = ph * 0.35;
    const bx = 0.16 * Math.cos(t), bz = 0.16 * Math.sin(t);
    m.face([[-bx, -0.012, 0.22 - bz], [bx, -0.012, 0.22 + bz], [bx, -0.012, 0.25 + bz], [-bx, -0.012, 0.25 - bz]], '#2f3a42', { twoSided: true });
    // horse head
    m.box(bx - 0.01, -0.02, 0.17 + bz, bx + 0.03, 0.02, 0.27 + bz, '#2f3a42');
    m.box(-bx - 0.04, -0.03, 0.1 - bz, -bx + 0.02, 0.03, 0.2 - bz, '#5a5048');
    return m;
  }

  // ---------- objects: HQ, statue ----------
  R.objDrawers[T.OBJECT] = function (ctx, x, y, t, s, baked) {
    const m = map(), gg = g(), o = gg.objects[m.idx[t]];
    if (!o) return;
    const base = m.tileMax(o.x, o.y);
    const p = wp(x, y, base);
    let key, build;
    if (o.kind === 'hq') {
      const c = gg.companies[o.owner];
      const dx = x - o.x, dy = y - o.y;
      key = 'hq:' + (c ? c.color : 0) + ':' + dx + dy;
      const col = c ? c.color : 0;
      build = () => Art.hq(col).clip(dx, dy, dx + 1, dy + 1);
    } else if (o.kind === 'statue') { key = 'statue'; build = () => Art.statue(0); }
    else return;
    const sp = Gx.modelSprite(key, s, build, { shadow: o.kind !== 'hq' });
    ctx.drawImage(sp.c, p[0] - sp.ox / s, p[1] - sp.oy / s, sp.c.width / s, sp.c.height / s);
    if (!baked && R.env.dark > 0.05) R.nightQueue.push([key, s, build, p[0], p[1], { shadow: o.kind !== 'hq' }]);
  };

  // ---------- stations ----------
  const SK = () => HL.Stations.K;
  R.groundDrawers[T.STATION] = function (ctx, x, y, t, s) {
    const m = map(), k = m.m1[t] & 7, K = SK();
    if (k === K.RAIL) {
      const h = m.tileMax(x, y);
      if (!m.isFlat(x, y)) W.foundation(ctx, x, y, h, '#8e8676');
      const axis = (m.m1[t] >> 3) & 1;
      flatTile(ctx, x, y, h, Gx.shadeCss('#8a8274', 1));
      W.drawTrack(ctx, x, y, axis === 0 ? 1 : 2, m.rtype[t], s);
      // platform slabs on both sides
      const yr = HL.ymd(g().date).y;
      const slab = yr < 1930 ? '#b9ad96' : yr < 1980 ? '#b8b4aa' : '#c8c8c2';
      const edge = yr < 1960 ? '#ece6d4' : '#e8c440';
      for (const side of [0, 1]) {
        const a0 = side ? 0.7 : 0.0, a1 = side ? 1.0 : 0.3;
        const pts = axis === 0 ? [[0, a0], [1, a0], [1, a1], [0, a1]] : [[a0, 0], [a1, 0], [a1, 1], [a0, 1]];
        const hz = h + 0.55;
        const q = pts.map(p => wp(x + p[0], y + p[1], hz));
        ctx.fillStyle = Gx.shadeCss(slab, 1.04);
        ctx.beginPath(); ctx.moveTo(q[0][0], q[0][1]); for (let i = 1; i < 4; i++) ctx.lineTo(q[i][0], q[i][1]); ctx.closePath(); ctx.fill();
        // front face of the platform edge toward the track
        const e0 = axis === 0 ? (side ? [[0, a0], [1, a0]] : [[0, a1], [1, a1]]) : (side ? [[a0, 0], [a0, 1]] : [[a1, 0], [a1, 1]]);
        const fa = wp(x + e0[0][0], y + e0[0][1], hz), fb = wp(x + e0[1][0], y + e0[1][1], hz), fc = wp(x + e0[1][0], y + e0[1][1], h), fd = wp(x + e0[0][0], y + e0[0][1], h);
        if (side === 0) { ctx.fillStyle = Gx.shadeCss(slab, 0.8); ctx.beginPath(); ctx.moveTo(fa[0], fa[1]); ctx.lineTo(fb[0], fb[1]); ctx.lineTo(fc[0], fc[1]); ctx.lineTo(fd[0], fd[1]); ctx.closePath(); ctx.fill(); }
        ctx.strokeStyle = edge; ctx.lineWidth = 1.1;
        ctx.beginPath(); ctx.moveTo(fa[0], fa[1]); ctx.lineTo(fb[0], fb[1]); ctx.stroke();
      }
      return;
    }
    if (k === K.BUS || k === K.TRUCK) {
      drawRoadSurface(ctx, x, y, t, m.road[t], s, false);
      const axis = (m.m1[t] >> 3) & 1;
      // bay markings
      ctx.strokeStyle = k === K.BUS ? '#e8c440' : '#e6e2d6'; ctx.lineWidth = 1;
      for (const off of [0.12, -0.12]) line(ctx, x, y, axis === 0 ? [0.1, 0.5] : [0.5, 0.1], axis === 0 ? [0.9, 0.5] : [0.5, 0.9], off, k === K.BUS ? '#e8c440' : '#e6e2d6', 0.9, 0.02, 2);
      return;
    }
    if (k === K.DOCK) {
      const h = Math.max(1, m.tileMax(x, y));
      W.foundation(ctx, x, y, h, '#7a6a58');
      flatTile(ctx, x, y, h, Gx.shadeCss('#8a7a62', 1));
      // pier planks out over the water
      const dir = (m.m1[t] >> 3) & 3;
      const ex = HL.EDGE_MID[dir];
      const a = [0.5 - (ex[0] - 0.5) * 0.4, 0.5 - (ex[1] - 0.5) * 0.4], b = [ex[0] + (ex[0] - 0.5) * 1.2, ex[1] + (ex[1] - 0.5) * 1.2];
      const L = [b[0] - a[0], b[1] - a[1]], len = Math.hypot(L[0], L[1]), nx = -L[1] / len * 0.3, ny = L[0] / len * 0.3;
      const hz = h;
      const q = [[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]].map(p => wp(x + p[0], y + p[1], hz));
      ctx.fillStyle = '#6a4e36';
      ctx.beginPath(); ctx.moveTo(q[0][0], q[0][1] + 6); ctx.lineTo(q[1][0], q[1][1] + 6); ctx.lineTo(q[2][0], q[2][1] + 6); ctx.lineTo(q[3][0], q[3][1] + 6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#9a7a56';
      ctx.beginPath(); ctx.moveTo(q[0][0], q[0][1]); for (let i = 1; i < 4; i++) ctx.lineTo(q[i][0], q[i][1]); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(60,40,20,0.4)'; ctx.lineWidth = 0.6; ctx.beginPath();
      for (let i = 1; i < 8; i++) { const f = i / 8; const p1 = wp(x + a[0] + L[0] * f + nx, y + a[1] + L[1] * f + ny, hz), p2 = wp(x + a[0] + L[0] * f - nx, y + a[1] + L[1] * f - ny, hz); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); }
      ctx.stroke();
      return;
    }
    if (k === K.AIR) {
      const st = g().stations[m.idx[t]]; if (!st || !st.airport) return;
      W.drawAirportGround(ctx, x, y, t, st, s);
      return;
    }
    if (k === K.BUOY) return;
  };
  W.AIR_LAYOUT = {
    strip: ['HGTG', 'SAAS', 'RRRR'],
    heli: ['P'],
    city: ['CTTTGH', 'SSSSAA', 'AAAAAA', 'wwwwww', 'RRRRRR'],
    intl: ['RRRRRRRR', 'wwwwwwww', 'HTTTTTTC', 'SSSSSSSS', 'AAAAAAAA', 'wwwwwwww', 'RRRRRRRR'],
  };
  W.airCode = function (st, x, y) { const ap = st.airport; return W.AIR_LAYOUT[ap.type][y - ap.y][x - ap.x]; };
  W.drawAirportGround = function (ctx, x, y, t, st, s) {
    const m = map(), ap = st.airport;
    const code = W.airCode(st, x, y);
    const h = m.tileMax(x, y);
    const grass = ap.type === 'strip' ? '#7a9a48' : '#86a050';
    flatTile(ctx, x, y, h, Gx.shadeCss(code === 'G' || code === 'H' && ap.type === 'strip' ? grass : grass, 1));
    const yr = HL.ymd(g().date).y;
    const tarmac = ap.type === 'strip' ? '#8a8a6a' : '#5c5d60', concrete = '#a9a8a2';
    const poly = (pts, col) => { const q = pts.map(p => wp(x + p[0], y + p[1], h)); ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(q[0][0], q[0][1]); for (let i = 1; i < q.length; i++) ctx.lineTo(q[i][0], q[i][1]); ctx.closePath(); ctx.fill(); };
    const full = [[0, 0], [1, 0], [1, 1], [0, 1]];
    if (code === 'R') {
      poly([[0, 0.12], [1, 0.12], [1, 0.88], [0, 0.88]], ap.type === 'strip' ? '#6f8a3e' : tarmac);
      if (ap.type !== 'strip') {
        ctx.setLineDash([4, 4]); line(ctx, x, y, [0, 0.5], [1, 0.5], 0, '#efede4', 1.2, 0.01, 1); ctx.setLineDash([]);
        line(ctx, x, y, [0, 0.16], [1, 0.16], 0, '#e0ded4', 0.6, 0.01, 1); line(ctx, x, y, [0, 0.84], [1, 0.84], 0, '#e0ded4', 0.6, 0.01, 1);
        const ap0 = x === ap.x, ap1 = x === ap.x + ap.w - 1;
        if (ap0 || ap1) for (let i = 0; i < 5; i++) { const v = 0.22 + i * 0.13; const u = ap0 ? 0.1 : 0.7; poly([[u, v], [u + 0.2, v], [u + 0.2, v + 0.06], [u, v + 0.06]], '#efede4'); }
      } else line(ctx, x, y, [0, 0.5], [1, 0.5], 0, 'rgba(240,240,220,0.5)', 0.6, 0.01, 1);
    } else if (code === 'w') {
      poly([[0, 0.25], [1, 0.25], [1, 0.75], [0, 0.75]], tarmac);
      line(ctx, x, y, [0, 0.5], [1, 0.5], 0, '#e8c440', 0.8, 0.01, 1);
    } else if (code === 'A' || code === 'S' || code === 'T' || code === 'C' || (code === 'H' && ap.type !== 'strip')) {
      poly(full, code === 'A' || code === 'S' ? concrete : '#9a988f');
      if (code === 'S') { line(ctx, x, y, [0.5, 0.1], [0.5, 0.9], 0, '#e8c440', 0.9, 0.01, 1); line(ctx, x, y, [0.3, 0.2], [0.7, 0.2], 0, '#e8c440', 0.9, 0.01, 1); }
      ctx.strokeStyle = 'rgba(40,40,40,0.18)'; ctx.lineWidth = 0.5;
      ctx.beginPath(); for (let i = 1; i < 3; i++) { const a = wp(x + i / 3, y, h), b = wp(x + i / 3, y + 1, h); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); } ctx.stroke();
    } else if (code === 'P') {
      poly(full, concrete);
      const c = wp(x + 0.5, y + 0.5, h);
      ctx.strokeStyle = '#e8c440'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.ellipse(c[0], c[1], 20, 10, 0, 0, 7); ctx.stroke();
      ctx.fillStyle = '#efede4'; ctx.font = 'bold 10px sans-serif'; ctx.save(); ctx.translate(c[0], c[1]); ctx.scale(1, 0.5); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('H', 0, 0); ctx.restore();
    }
  };

  function stationModel(m, t, st) {
    const K = SK(), k = m.m1[t] & 7;
    const yr = HL.ymd(g().date).y, era = yr < 1925 ? 0 : yr < 1970 ? 1 : 2;
    const snow = R.env.season === 3 && g().opts.climate !== 'desert';
    if (k === K.RAIL) {
      const axis = (m.m1[t] >> 3) & 1, vis = (m.m1[t] >> 4) & 7, back = (m.m1[t] >> 8) & 1, front = (m.m1[t] >> 7) & 1;
      if (vis === 3) return null;
      const key = 'stn:' + axis + ':' + vis + ':' + era + ':' + back + front + ':' + (snow ? 1 : 0);
      return [key, () => railStationModel(axis, vis, era, back, front, snow), 0.55];
    }
    if (k === K.BUS || k === K.TRUCK) {
      const axis = (m.m1[t] >> 3) & 1;
      return ['stop:' + k + ':' + axis + ':' + era, () => roadStopModel(k === K.TRUCK, axis, era), 0];
    }
    if (k === K.DOCK) { const dir = (m.m1[t] >> 3) & 3; return ['dock:' + dir + ':' + era, () => dockModel(dir, era), 0]; }
    if (k === K.AIR) {
      const code = W.airCode(st, m.tx(t), m.ty(t));
      if ('TCHG'.indexOf(code) < 0 || (code === 'G')) return null;
      const ap = st.airport;
      return ['air:' + ap.type + ':' + code + ':' + (m.tx(t) - ap.x) + ':' + era + ':' + (snow ? 1 : 0), () => airBuilding(ap.type, code, era, snow), 0];
    }
    if (k === K.BUOY) return ['buoy', () => buoyModel(), 0];
    return null;
  }
  function railStationModel(axis, vis, era, back, front, snow) {
    const m = new Gx.Model();
    const roofCol = snow ? '#eef2f5' : era === 0 ? '#5a4e44' : era === 1 ? '#6a6e72' : '#d8dde0';
    const post = era === 2 ? '#c8ccd0' : '#3a4a3a';
    const z0 = 0.55 * Gx.LEVEL;
    // canopy over both platform halves
    const sides = [[0.0, 0.3], [0.7, 1.0]];
    for (const [a0, a1] of sides) {
      const rect = axis === 0 ? [0.02, a0 + 0.02, 0.98, a1 - 0.02] : [a0 + 0.02, 0.02, a1 - 0.02, 0.98];
      if (vis === 2 && a0 === 0 && back) {
        // station building on the back platform
        const wp2 = Art.paint.wallPaint({ floors: 2, colW: 0.12, door: '#3a2a20', doorAt: 0.5, course: era === 0 ? '#000' : null, seed: 3, lit: 0.8 });
        const wall = era === 0 ? '#a65a40' : era === 1 ? '#d6ccb4' : '#c8ccd0';
        if (era === 2) { const gp = Art.paint.glassPaint({ seed: 2 }); m.box(rect[0], rect[1], z0, rect[2], rect[3], z0 + 0.36, '#6a8aa0', { paint: { x: gp, y: gp } }); m.box(rect[0] - 0.02, rect[1] - 0.02, z0 + 0.36, rect[2] + 0.02, rect[3] + 0.02, z0 + 0.4, '#e0e4e6'); }
        else { m.box(rect[0], rect[1], z0, rect[2], rect[3], z0 + 0.34, wall, { paint: { x: wp2, y: wp2 } }); m.gable(rect[0], rect[1], rect[2], rect[3], z0 + 0.34, z0 + 0.5, axis === 0 ? 'x' : 'y', roofCol, { end: wall }); }
        m.light(axis === 0 ? 0.5 : 0.3, axis === 0 ? 0.3 : 0.5, z0 + 0.25, 16, '#ffd38a');
        continue;
      }
      if (vis === 1 || vis === 2) {
        // posts and a canopy roof
        const cx = (rect[0] + rect[2]) / 2, cy = (rect[1] + rect[3]) / 2;
        if (axis === 0) { for (const px of [0.2, 0.8]) m.box(px - 0.012, cy - 0.012, z0, px + 0.012, cy + 0.012, z0 + 0.26, post); }
        else { for (const py of [0.2, 0.8]) m.box(cx - 0.012, py - 0.012, z0, cx + 0.012, py + 0.012, z0 + 0.26, post); }
        const zr = z0 + 0.26;
        if (axis === 0) m.face([[0, rect[1] - 0.03, zr + 0.04], [1, rect[1] - 0.03, zr + 0.04], [1, rect[3] + 0.03, zr], [0, rect[3] + 0.03, zr]], roofCol, { twoSided: true });
        else m.face([[rect[0] - 0.03, 0, zr + 0.04], [rect[0] - 0.03, 1, zr + 0.04], [rect[2] + 0.03, 1, zr], [rect[2] + 0.03, 0, zr]], roofCol, { twoSided: true });
        m.light(cx, cy, zr - 0.02, 9, '#ffe2a8');
      }
    }
    // benches / lamp on ends
    return m;
  }
  function roadStopModel(truck, axis, era) {
    const m = new Gx.Model();
    const col = truck ? '#c8892e' : era === 0 ? '#3a5a3a' : '#3c6fb0';
    // shelters on both sidewalks
    for (const side of [0.08, 0.92]) {
      const r = axis === 0 ? [0.3, side - 0.05, 0.7, side + 0.05] : [side - 0.05, 0.3, side + 0.05, 0.7];
      if (truck) { m.box(r[0], r[1], 0, r[2], r[3], 0.02, '#8a8e92'); continue; }
      const gp = Art.paint.glassPaint({ glass: '#7f9fb2', glass2: '#c4dae4' });
      m.box(r[0], r[1], 0, r[2], r[3], 0.2, '#9fbfd0', { paint: { x: gp, y: gp } });
      m.box(r[0] - 0.02, r[1] - 0.02, 0.2, r[2] + 0.02, r[3] + 0.02, 0.22, col);
      m.light((r[0] + r[2]) / 2, (r[1] + r[3]) / 2, 0.18, 10, '#eaf2ff');
    }
    if (truck) { const r = axis === 0 ? [0.15, 0.04, 0.85, 0.96] : [0.04, 0.15, 0.96, 0.85]; for (const [px, py] of [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]]) m.box(px - 0.012, py - 0.012, 0, px + 0.012, py + 0.012, 0.36, '#6a6e72'); m.box(r[0], r[1], 0.36, r[2], r[3], 0.39, col); m.light(0.5, 0.5, 0.34, 18, '#ffe2a8'); }
    // sign post
    m.box(0.06, 0.06, 0, 0.08, 0.08, 0.24, '#5a5e62'); m.box(0.03, 0.06, 0.2, 0.11, 0.08, 0.26, col);
    return m;
  }
  function dockModel(dir, era) {
    const m = new Gx.Model();
    // warehouse at the back of the tile and a crane at the waterside
    m.box(0.15, 0.15, 0, 0.6, 0.6, 0.3, era === 0 ? '#8a5a3a' : '#7d8a90', { paint: { x: Art.paint.corrugated('#7d8a90'), y: Art.paint.corrugated('#7d8a90') } });
    m.gable(0.15, 0.15, 0.6, 0.6, 0.3, 0.42, 'x', '#5a5e62');
    const ex = HL.EDGE_MID[dir];
    const cx = 0.5 + (ex[0] - 0.5) * 0.9, cy = 0.5 + (ex[1] - 0.5) * 0.9;
    m.box(cx - 0.05, cy - 0.05, 0, cx + 0.05, cy + 0.05, 0.6, '#c8892e');
    m.box(cx - 0.05, cy - 0.05, 0.6, cx + (ex[0] - 0.5) * 0.9 + 0.03, cy + (ex[1] - 0.5) * 0.9 + 0.03, 0.66, '#c8892e');
    m.box(cx - 0.08, cy - 0.08, 0.5, cx + 0.04, cy + 0.04, 0.62, '#9a5a2a');
    m.light(cx, cy, 0.66, 14, '#ffd38a');
    return m;
  }
  function buoyModel() {
    const m = new Gx.Model();
    m.cyl(0.5, 0.5, -0.02, 0.06, 0.07, '#c4382c', { n: 8 });
    m.cyl(0.5, 0.5, 0.06, 0.18, 0.025, '#e8e4dc', { n: 6 });
    m.light(0.5, 0.5, 0.2, 8, '#ff5a3a');
    return m;
  }
  function airBuilding(type, code, era, snow) {
    const m = new Gx.Model();
    const roof = snow ? '#eef2f5' : '#6a6e72';
    if (code === 'T') {
      if (type === 'strip') { m.box(0.2, 0.2, 0, 0.8, 0.7, 0.24, '#d8cdb5', { paint: { x: Art.paint.wallPaint({ floors: 1, cols: 3, seed: 4 }), y: Art.paint.wallPaint({ floors: 1, cols: 3, door: '#3a3a3a', doorAt: 0.5 }) } }); m.gable(0.2, 0.2, 0.8, 0.7, 0.24, 0.36, 'x', roof); return m; }
      const gp = Art.paint.glassPaint({ seed: 6, glass: '#4a6a84', glass2: '#a9c3d4', lit: 0.8 });
      m.box(0.0, 0.1, 0, 1.0, 0.86, era === 2 ? 0.42 : 0.34, '#c8ccd0', { paint: { x: gp, y: gp } });
      m.box(-0.01, 0.08, era === 2 ? 0.42 : 0.34, 1.01, 0.88, (era === 2 ? 0.42 : 0.34) + 0.04, era === 2 ? '#e8ecee' : '#7a7e80');
      m.box(0.4, 0.86, 0.12, 0.6, 1.0, 0.2, '#b8bcbe');
      m.light(0.5, 0.9, 0.3, 18, '#ffe2a8');
      return m;
    }
    if (code === 'C') {
      m.cyl(0.5, 0.5, 0, 0.9, 0.12, '#d8d4c8', { n: 10 });
      m.cyl(0.5, 0.5, 0.9, 1.06, 0.2, '#3f5f74', { n: 10, paint: Art.paint.glassPaint({ glass: '#3f5f74', glass2: '#8fb0c4', lit: 0.9 }) });
      m.cyl(0.5, 0.5, 1.06, 1.12, 0.22, '#e0e4e6', { n: 10 });
      m.box(0.49, 0.49, 1.12, 0.51, 0.51, 1.3, '#9a9ea2');
      m.light(0.5, 0.5, 1.3, 8, '#ff4a3a');
      return m;
    }
    if (code === 'H') {
      const wall = type === 'strip' ? '#8a6a48' : '#8a9094';
      m.box(0.06, 0.06, 0, 0.94, 0.94, 0.32, wall, { paint: { x: Art.paint.corrugated(wall), y: (ctx, w, h, sh, br, night) => { if (night) { ctx.fillStyle = 'rgba(255,220,150,0.6)'; ctx.fillRect(0.1, 0, w - 0.2, 0.26); return; } ctx.fillStyle = sh('#4a4e52'); ctx.fillRect(0.1, 0, w - 0.2, 0.26); ctx.strokeStyle = sh('#2a2e32'); ctx.lineWidth = 0.006; ctx.beginPath(); for (let u = 0.15; u < w - 0.1; u += 0.08) { ctx.moveTo(u, 0); ctx.lineTo(u, 0.26); } ctx.stroke(); } } });
      // barrel roof
      const n = 6;
      for (let i = 0; i < n; i++) {
        const a0 = Math.PI * i / n, a1 = Math.PI * (i + 1) / n;
        const y0 = 0.5 - Math.cos(a0) * 0.44, y1 = 0.5 - Math.cos(a1) * 0.44, z0 = 0.32 + Math.sin(a0) * 0.16, z1 = 0.32 + Math.sin(a1) * 0.16;
        m.face([[0.06, y0, z0], [0.94, y0, z0], [0.94, y1, z1], [0.06, y1, z1]], roof, { paint: Art.paint.corrugated(roof) });
      }
      m.face([[0.94, 0.06, 0.32], [0.94, 0.94, 0.32], [0.94, 0.5, 0.48]], wall);
      return m;
    }
    return m;
  }
  R.objDrawers[T.STATION] = function (ctx, x, y, t, s, baked) {
    const m = map(), st = g().stations[m.idx[t]];
    if (!st) return;
    const mod = stationModel(m, t, st);
    if (!mod) return;
    const [key, build, zoff] = mod;
    const base = (m.m1[t] & 7) === SK().BUOY ? 0 : m.tileMax(x, y);
    const sp = Gx.modelSprite(key, s, build);
    const p = wp(x, y, base);
    ctx.drawImage(sp.c, p[0] - sp.ox / s, p[1] - sp.oy / s, sp.c.width / s, sp.c.height / s);
    if (!baked && R.env.dark > 0.05) {
      R.nightQueue.push([key, s, build, p[0], p[1]]);
      if (sp.lights) for (const L of sp.lights) { const lp = wp(x + L[0], y + L[1], base + L[2] / Gx.LEVEL); R.addLight(lp[0], lp[1], L[3], L[4], 0.8); }
    }
    // runway edge lights at night
    if (!baked && R.env.dark > 0.2 && (m.m1[t] & 7) === SK().AIR && W.airCode(st, x, y) === 'R') {
      for (const v of [0.12, 0.88]) for (const u of [0.25, 0.75]) { const lp = wp(x + u, y + v, base); R.addLight(lp[0], lp[1], 6, '#fff2c0', 0.9); }
    }
  };

  // ---------- depots ----------
  function depotModel(kind, dir, era, snow, liv) {
    const m = new Gx.Model();
    const roof = snow ? '#eef2f5' : '#5a5e62';
    const wall = kind === 2 ? '#8a6a48' : era === 0 ? '#9a4a35' : era === 1 ? '#a8a294' : '#8a9094';
    // open side faces dir; build along the axis of dir
    const ax = (dir & 1) ? 'x' : 'y';
    const doorPaint = (ctx, w, h, sh, br, night) => {
      if (night) { ctx.fillStyle = 'rgba(255,214,140,0.7)'; ctx.fillRect(w * 0.2, 0, w * 0.6, h * 0.75); return; }
      ctx.fillStyle = sh('#2a2622'); ctx.fillRect(w * 0.2, 0, w * 0.6, h * 0.75);
      ctx.fillStyle = sh(liv || '#8e2a33'); ctx.fillRect(w * 0.18, h * 0.75, w * 0.64, 0.02);
    };
    const side = Art.paint.wallPaint({ floors: 1, colW: 0.18, ww: 0.06, wh: 0.08, course: era === 0 ? '#000' : null, seed: 5 });
    const paint = { x: dir === 1 ? doorPaint : side, y: dir === 2 ? doorPaint : side, nx: side, ny: side };
    if (kind === 2) {
      m.box(0.1, 0.1, -0.02, 0.9, 0.9, 0.04, '#6a4e36');
      m.box(0.15, 0.15, 0.04, 0.85, 0.85, 0.36, wall, { paint });
      m.gable(0.15, 0.15, 0.85, 0.85, 0.36, 0.52, ax, roof, { end: wall });
      return m;
    }
    m.box(0.12, 0.12, 0, 0.88, 0.88, 0.38, wall, { paint });
    m.gable(0.12, 0.12, 0.88, 0.88, 0.38, 0.56, ax, roof, { end: wall, paint: Art.paint.roofPaint(roof) });
    if (kind === 0) m.box(ax === 'x' ? 0.3 : 0.6, ax === 'x' ? 0.6 : 0.3, 0.5, ax === 'x' ? 0.36 : 0.66, ax === 'x' ? 0.66 : 0.36, 0.68, '#5a4a40');
    m.light(dir === 1 ? 0.9 : 0.5, dir === 2 ? 0.9 : 0.5, 0.36, 12, '#ffd38a');
    return m;
  }
  R.groundDrawers[T.DEPOT] = function (ctx, x, y, t, s) {
    const m = map(), d = g().depots[m.idx[t]];
    if (!d) return;
    if (d.kind === 2) return;
    const h = m.tileMax(x, y);
    flatTile(ctx, x, y, h, '#8a8274');
    // apron toward the opening
    if (d.kind === 0) W.drawTrack(ctx, x, y, (d.dir & 1) ? 1 : 2, d.rt, s);
    else drawRoadSurface(ctx, x, y, t, 1 << d.dir, s, false);
  };
  R.objDrawers[T.DEPOT] = function (ctx, x, y, t, s, baked) {
    const m = map(), gg = g(), d = gg.depots[m.idx[t]];
    if (!d) return;
    const yr = HL.ymd(gg.date).y, era = yr < 1925 ? 0 : yr < 1970 ? 1 : 2;
    const snow = R.env.season === 3 && gg.opts.climate !== 'desert';
    const c = gg.companies[d.owner];
    const liv = c ? HL.LIVERY[c.color].main : null;
    const key = 'dep:' + d.kind + ':' + d.dir + ':' + era + ':' + (snow ? 1 : 0) + ':' + liv;
    const build = () => depotModel(d.kind, d.dir, era, snow, liv);
    const sp = Gx.modelSprite(key, s, build);
    const base = d.kind === 2 ? 0 : m.tileMax(x, y);
    const p = wp(x, y, base);
    // only the back faces would hide trains going in through NE/NW openings, so draw lighter there
    ctx.drawImage(sp.c, p[0] - sp.ox / s, p[1] - sp.oy / s, sp.c.width / s, sp.c.height / s);
    if (!baked && R.env.dark > 0.05) { R.nightQueue.push([key, s, build, p[0], p[1]]); if (sp.lights) for (const L of sp.lights) { const lp = wp(x + L[0], y + L[1], base + L[2] / Gx.LEVEL); R.addLight(lp[0], lp[1], L[3], L[4], 0.8); } }
  };

  // ---------- per-frame rail extras: signals, catenary, crossings, bridges, tunnels ----------
  const railObj = function (ctx, x, y, t, s, baked) {
    const m = map(), gg = g();
    if (m.m1[t] & 0xC000) { W.drawBridgeOrTunnelHead(ctx, x, y, t, s); }
    if (baked) return;
    const rt = m.rtype[t];
    if (rt === 1 && !(m.m1[t] & 0x8000)) drawCatenary(ctx, x, y, m.rail[t], s, 0);
    if (m.road[t]) drawCrossing(ctx, x, y, t, s);
    for (let p = 0; p < 6; p++) {
      if (!(m.rail[t] & (1 << p))) continue;
      const sig = gg.signals.get(t * 6 + p);
      if (sig) drawSignals(ctx, x, y, t, p, sig, s);
    }
  };
  R.objDrawers[T.RAIL] = railObj;
  R.objDrawers[T.ROAD] = function (ctx, x, y, t, s, baked) {
    const m = map();
    if (m.m1[t] & 0xC000) { W.drawBridgeOrTunnelHead(ctx, x, y, t, s); return; }
    if (baked) return;
    // street lamps on town roads
    if (m.rowner[t] === HL.OWNER_TOWN && (m.road[t] === 5 || m.road[t] === 10) && ((x + y) & 1) === 0 && HL.ymd(g().date).y >= 1900) {
      const pos = m.road[t] === 5 ? [0.2, 0.5] : [0.5, 0.2];
      const p0 = P(x + pos[0], y + pos[1]);
      const hgt = 0.34 * Gx.ZS;
      ctx.strokeStyle = '#3a3e42'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p0[0], p0[1] - hgt); ctx.lineTo(p0[0] + 3, p0[1] - hgt + 1); ctx.stroke();
      if (R.env.dark > 0.05) { ctx.fillStyle = '#fff0c0'; ctx.fillRect(p0[0] + 2, p0[1] - hgt, 2, 1.5); R.addLight(p0[0] + 3, p0[1] - hgt + 4, 22, '#ffcf7a', 0.8); }
    }
  };
  function drawCatenary(ctx, x, y, pieces, s, dz) {
    if (s < 1) return;
    ctx.lineWidth = 0.7;
    for (let p = 0; p < 6; p++) {
      if (!(pieces & (1 << p))) continue;
      const [a, b] = pieceEnds(p);
      const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
      const nx = -dy / L * 0.3, ny = dx / L * 0.3;
      const mx = x + (a[0] + b[0]) / 2, my = y + (a[1] + b[1]) / 2;
      const hp = 0.36 * Gx.ZS;
      const pb = P(mx + nx, my + ny, dz);
      ctx.strokeStyle = '#4a4e52';
      ctx.beginPath(); ctx.moveTo(pb[0], pb[1]); ctx.lineTo(pb[0], pb[1] - hp);
      const pc = P(mx, my, dz); ctx.lineTo(pc[0], pc[1] - hp * 0.92); ctx.stroke();
      const pa = P(x + a[0], y + a[1], dz), pe = P(x + b[0], y + b[1], dz);
      ctx.strokeStyle = 'rgba(40,44,48,0.75)';
      ctx.beginPath(); ctx.moveTo(pa[0], pa[1] - hp * 0.88); ctx.quadraticCurveTo(pc[0], pc[1] - hp * 0.8, pe[0], pe[1] - hp * 0.88); ctx.stroke();
    }
  }
  W.drawCatenary = drawCatenary;
  function drawCrossing(ctx, x, y, t, s) {
    const closed = HL.Rail && HL.Rail.crossingClosed ? HL.Rail.crossingClosed(g(), t) : false;
    const m = map();
    const roadAxisY = m.road[t] === 5;
    // barriers on both sides of the track
    for (const side of [0.08, 0.92]) {
      const base = roadAxisY ? [0.15, side] : [side, 0.15];
      const p0 = P(x + base[0], y + base[1]);
      ctx.fillStyle = '#3a3e42'; ctx.fillRect(p0[0] - 0.8, p0[1] - 9, 1.6, 9);
      const arm = roadAxisY ? [0.7, 0] : [0, 0.7];
      let tip;
      if (closed) tip = P(x + base[0] + arm[0], y + base[1] + arm[1]);
      else tip = [p0[0] + 1, p0[1] - 26];
      ctx.strokeStyle = '#f2efe6'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(p0[0], p0[1] - 8); ctx.lineTo(tip[0], tip[1] - (closed ? 7 : 0)); ctx.stroke();
      ctx.strokeStyle = '#c4382c'; ctx.setLineDash([2, 2]); ctx.beginPath(); ctx.moveTo(p0[0], p0[1] - 8); ctx.lineTo(tip[0], tip[1] - (closed ? 7 : 0)); ctx.stroke(); ctx.setLineDash([]);
      if (closed && ((R.now / 400) | 0) % 2) { ctx.fillStyle = '#ff3a2a'; ctx.fillRect(p0[0] - 2, p0[1] - 11, 4, 2); R.addLight(p0[0], p0[1] - 10, 10, '#ff3a2a', 1); }
    }
  }
  function drawSignals(ctx, x, y, t, p, sig, s) {
    const E = HL.PIECE_EDGES[p];
    const dirs = sig.dir === 2 ? [0, 1] : [sig.dir];
    for (const df of dirs) {
      const entry = df === 0 ? E[0] : E[1], exit = df === 0 ? E[1] : E[0];
      const a = HL.EDGE_MID[entry], b = HL.EDGE_MID[exit];
      const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
      // stand on the right of travel, a little after the entry edge
      const rx = -dy / L * 0.26, ry = dx / L * 0.26;
      const px = x + a[0] + dx * 0.25 - rx, py = y + a[1] + dy * 0.25 - ry;
      const p0 = P(px, py);
      const green = HL.Rail && HL.Rail.signalGreen ? HL.Rail.signalGreen(g(), t, p, df) : true;
      const hgt = 0.32 * Gx.ZS;
      ctx.strokeStyle = '#2e3236'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p0[0], p0[1] - hgt); ctx.stroke();
      // head: semaphore arm before 1950, colour light after
      const yr = HL.ymd(g().date).y;
      const pathSig = sig.type !== 0;
      if (yr < 1950) {
        ctx.strokeStyle = pathSig ? '#e8c440' : '#c4382c'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(p0[0], p0[1] - hgt + 2);
        if (green) ctx.lineTo(p0[0] + 5, p0[1] - hgt - 3); else ctx.lineTo(p0[0] + 6, p0[1] - hgt + 2);
        ctx.stroke();
        ctx.fillStyle = green ? '#5ce07a' : '#ff4a3a'; ctx.fillRect(p0[0] - 1.2, p0[1] - hgt + 3, 2.4, 2.4);
      } else {
        ctx.fillStyle = '#1e2124'; ctx.fillRect(p0[0] - 2.2, p0[1] - hgt - 4, 4.4, 8);
        if (pathSig) { ctx.fillStyle = '#e8c440'; ctx.fillRect(p0[0] - 2.2, p0[1] - hgt + 4, 4.4, 1.2); }
        ctx.fillStyle = green ? '#56e07a' : '#ff4030';
        ctx.beginPath(); ctx.arc(p0[0], p0[1] - hgt + (green ? 1.5 : -1.5), 1.5, 0, 7); ctx.fill();
      }
      if (R.env.dark > 0.1) R.addLight(p0[0], p0[1] - hgt, 8, green ? '#56e07a' : '#ff4030', 1);
    }
  }

  // ---------- bridges and tunnels ----------
  W.bridgeDeckZ = function (br, i) { return br.h; };
  W.drawBridgeOrTunnelHead = function (ctx, x, y, t, s) {
    const m = map(), gg = g();
    if (m.m1[t] & 0x4000) {
      const tn = gg.tunnels[m.idx[t]]; if (!tn) return;
      const out = t === tn.a ? HL.opp(tn.dir) : tn.dir; // direction the portal faces (outward)
      const key = 'portal:' + out + ':' + tn.transport;
      const sp = Gx.modelSprite(key, s, () => portalModel(out, tn.transport));
      const p = wp(x, y, m.tileMin(x, y));
      ctx.drawImage(sp.c, p[0] - sp.ox / s, p[1] - sp.oy / s, sp.c.width / s, sp.c.height / s);
      return;
    }
    const br = gg.bridges[m.idx[t]]; if (!br) return;
    const isA = t === br.a;
    const inward = isA ? br.dir : HL.opp(br.dir);
    const hOut = m.edgeMidH(x, y, HL.opp(inward));
    const rise = br.h - hOut;
    const key = 'bramp:' + br.type + ':' + inward + ':' + rise.toFixed(1) + ':' + br.transport + ':' + br.rt;
    const sp = Gx.modelSprite(key, s, () => rampModel(br, inward, rise));
    const p = wp(x, y, hOut);
    ctx.drawImage(sp.c, p[0] - sp.ox / s, p[1] - sp.oy / s, sp.c.width / s, sp.c.height / s);
  };
  function deckSurface(m, br, x0, y0, x1, y1, za, zb, axisX) {
    // road or track on the deck; za at the start of the axis, zb at the end
    const col = br.transport === 'rail' ? '#7a7266' : '#55565a';
    const f = axisX ? [[x0, y0, za], [x1, y0, zb], [x1, y1, zb], [x0, y1, za]] : [[x0, y0, za], [x1, y0, za], [x1, y1, zb], [x0, y1, zb]];
    m.face(f, col, { paint: (ctx, w, h, sh, br2, night) => {
      if (night) return;
      if (br.transport === 'rail') {
        const st = RT_STYLE[br.rt];
        ctx.fillStyle = sh(st.sleeper); for (let u = 0.03; u < (axisX ? w : h); u += 0.09) { if (axisX) ctx.fillRect(u, h / 2 - 0.13, 0.03, 0.26); else ctx.fillRect(w / 2 - 0.13, u, 0.26, 0.03); }
        ctx.fillStyle = sh(st.rail); if (axisX) { ctx.fillRect(0, h / 2 - 0.085, w, 0.018); ctx.fillRect(0, h / 2 + 0.065, w, 0.018); } else { ctx.fillRect(w / 2 - 0.085, 0, 0.018, h); ctx.fillRect(w / 2 + 0.065, 0, 0.018, h); }
      } else { ctx.setLineDash([0.06, 0.06]); ctx.strokeStyle = sh('#e6e2d6'); ctx.lineWidth = 0.012; ctx.beginPath(); if (axisX) { ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); } else { ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h); } ctx.stroke(); ctx.setLineDash([]); }
    } });
  }
  function rampModel(br, inward, rise) {
    const m = new Gx.Model();
    const L = Gx.LEVEL;
    const axisX = (inward & 1) === 1;
    const style = HL.BRIDGES[br.type].art;
    const stone = style === 'stone' || style === 'timber' ? '#a89a82' : '#9a9a94';
    // deck rises from the outer edge (z=0) to rise*L at the inner edge
    const w0 = 0.18, w1 = 0.82;
    const out0 = inward === 1 || inward === 2 ? 0 : 1; // coordinate of outer edge along axis
    const zOut = 0, zIn = rise * L;
    const za = out0 === 0 ? zOut : zIn, zb = out0 === 0 ? zIn : zOut;
    if (axisX) {
      m.face([[0, w0, 0], [1, w0, 0], [1, w0, zb], [0, w0, za]], stone, { twoSided: true });
      m.face([[1, w1, 0], [0, w1, 0], [0, w1, za], [1, w1, zb]], stone, { twoSided: true });
      if (out0 === 0) m.face([[1, w0, 0], [1, w1, 0], [1, w1, zb], [1, w0, zb]], stone);
      deckSurface(m, br, 0, w0, 1, w1, za + 0.01, zb + 0.01, true);
      m.box(0, w0 - 0.03, 0, 1, w0, 0.001, stone);
    } else {
      m.face([[w0, 1, 0], [w0, 0, 0], [w0, 0, za], [w0, 1, zb]], stone, { twoSided: true });
      m.face([[w1, 0, 0], [w1, 1, 0], [w1, 1, zb], [w1, 0, za]], stone, { twoSided: true });
      if (out0 === 0) m.face([[w1, 1, 0], [w0, 1, 0], [w0, 1, zb], [w1, 1, zb]], stone);
      deckSurface(m, br, w0, 0, w1, 1, za + 0.01, zb + 0.01, false);
    }
    // parapets
    if (axisX) { m.face([[0, w0, za + 0.01], [1, w0, zb + 0.01], [1, w0, zb + 0.06], [0, w0, za + 0.06]], '#7a7468', { twoSided: true }); m.face([[0, w1, za + 0.01], [1, w1, zb + 0.01], [1, w1, zb + 0.06], [0, w1, za + 0.06]], '#7a7468', { twoSided: true }); }
    else { m.face([[w0, 0, za + 0.01], [w0, 1, zb + 0.01], [w0, 1, zb + 0.06], [w0, 0, za + 0.06]], '#7a7468', { twoSided: true }); m.face([[w1, 0, za + 0.01], [w1, 1, zb + 0.01], [w1, 1, zb + 0.06], [w1, 0, za + 0.06]], '#7a7468', { twoSided: true }); }
    m.noShadow = false;
    return m;
  }
  function portalModel(out, transport) {
    const m = new Gx.Model();
    // facade on the outward edge of the tile, opening dark
    const stone = '#a39684';
    const arch = (ctx, w, h, sh, br, night) => {
      ctx.fillStyle = night ? 'rgba(0,0,0,0)' : sh('#17140f');
      ctx.beginPath(); ctx.moveTo(w * 0.22, 0); ctx.lineTo(w * 0.22, h * 0.45); ctx.arc(w / 2, h * 0.45, w * 0.28, Math.PI, 0, false); ctx.lineTo(w * 0.78, 0); ctx.closePath();
      ctx.save(); ctx.scale(1, 1); ctx.fill(); ctx.restore();
      if (!night) { ctx.strokeStyle = sh('#6a5e50', 0.6); ctx.lineWidth = 0.01; ctx.beginPath(); for (let v = 0.06; v < h; v += 0.06) { ctx.moveTo(0, v); ctx.lineTo(w * 0.2, v); ctx.moveTo(w * 0.8, v); ctx.lineTo(w, v); } ctx.stroke(); }
    };
    const hgt = 0.5;
    // place the facade on edge `out` of the tile
    if (out === 1) m.face([[0.98, 0, 0], [0.98, 1, 0], [0.98, 1, hgt], [0.98, 0, hgt]], stone, { paint: arch, twoSided: true });
    else if (out === 2) m.face([[1, 0.98, 0], [0, 0.98, 0], [0, 0.98, hgt], [1, 0.98, hgt]], stone, { paint: arch, twoSided: true });
    else if (out === 3) m.face([[0.02, 1, 0], [0.02, 0, 0], [0.02, 0, hgt], [0.02, 1, hgt]], stone, { paint: arch, twoSided: true });
    else m.face([[0, 0.02, 0], [1, 0.02, 0], [1, 0.02, hgt], [0, 0.02, hgt]], stone, { paint: arch, twoSided: true });
    m.noShadow = true;
    return m;
  }
  // span segment drawn on tiles under a bridge (before vehicles on the bridge, after those below)
  W.drawBridgeSpan = function (ctx, x, y, t, s) {
    const m = map(), gg = g(), br = gg.bridges[m.bridgeOver[t]];
    if (!br) return;
    const ax = m.tx(br.a), ay = m.ty(br.a);
    const i = Math.abs(x - ax) + Math.abs(y - ay);
    const ground = m.tileMin(x, y);
    const water = m.type[t] === T.WATER;
    const pier = (i % 2 === 0) || br.len <= 2;
    const style = HL.BRIDGES[br.type].art;
    const ph = br.h - ground;
    const key = 'bspan:' + br.type + ':' + (br.dir & 1) + ':' + (pier ? ph : 0) + ':' + (water ? 1 : 0) + ':' + br.transport + ':' + br.rt + ':' + (i === 1 ? 's' : i === br.len ? 'e' : 'm') + ':' + (br.len > 6 && Math.abs(i - (br.len + 1) / 2) < 0.6 ? 'c' : '');
    const sp = Gx.modelSprite(key, s, () => spanModel(br, (br.dir & 1) === 1, pier ? ph : 0, style, i, water));
    const p = wp(x, y, br.h);
    ctx.drawImage(sp.c, p[0] - sp.ox / s, p[1] - sp.oy / s, sp.c.width / s, sp.c.height / s);
    if (br.transport === 'rail' && br.rt === 1) drawCatenaryAt(ctx, x, y, (br.dir & 1) ? 1 : 2, br.h, s);
  };
  function drawCatenaryAt(ctx, x, y, pieces, h, s) {
    const save = R.map.heightAt;
    R.map.heightAt = () => h;
    try { drawCatenary(ctx, x, y, pieces, s, 0); } finally { R.map.heightAt = save; }
  }
  function spanModel(br, axisX, pierH, style, i, water) {
    const m = new Gx.Model();
    const L = Gx.LEVEL;
    const w0 = 0.18, w1 = 0.82;
    const steel = style === 'girder' ? '#5a6a7a' : style === 'truss' ? '#7a4a3a' : style === 'suspension' ? '#b8503a' : style === 'cable' ? '#e0e2e4' : style === 'tube' ? '#c8d8e0' : '#8a6a48';
    const deckCol = style === 'stone' ? '#a89a82' : style === 'timber' ? '#7a5a3a' : '#6a6e72';
    const R0 = axisX ? [0, w0, 1, w1] : [w0, 0, w1, 1];
    // deck slab
    m.box(R0[0], R0[1], -0.07, R0[2], R0[3], 0, deckCol);
    deckSurface(m, br, R0[0], R0[1], R0[2], R0[3], 0.005, 0.005, axisX);
    // pier down to the ground
    if (pierH > 0) {
      const ph = pierH * L + (water ? 0.08 : 0);
      if (style === 'timber') {
        for (const o of [0.25, 0.75]) { const px = axisX ? 0.5 : o, py = axisX ? o : 0.5; m.box(px - 0.025, py - 0.025, -ph, px + 0.025, py + 0.025, -0.07, '#6a4a2e'); }
        m.face(axisX ? [[0.5, 0.25, -ph], [0.5, 0.75, -0.07], [0.5, 0.77, -0.07], [0.5, 0.27, -ph]] : [[0.25, 0.5, -ph], [0.75, 0.5, -0.07], [0.77, 0.5, -0.07], [0.27, 0.5, -ph]], '#5a3e26', { twoSided: true });
      } else if (style === 'stone') {
        const pw = 0.14;
        m.box(axisX ? 0.5 - pw : w0, axisX ? w0 : 0.5 - pw, -ph, axisX ? 0.5 + pw : w1, axisX ? w1 : 0.5 + pw, -0.07, '#a39684');
      } else {
        const cw = 0.06;
        for (const o of [w0 + 0.06, w1 - 0.06]) { const px = axisX ? 0.5 : o, py = axisX ? o : 0.5; m.box(px - cw, py - cw, -ph, px + cw, py + cw, -0.07, style === 'cable' || style === 'tube' ? '#d8d8d4' : '#9a9a94'); }
        m.box(axisX ? 0.44 : w0, axisX ? w0 : 0.44, -0.2, axisX ? 0.56 : w1, axisX ? w1 : 0.56, -0.07, '#9a9a94');
      }
    }
    // superstructure
    const side = (o, h, col, lattice) => {
      const pts = axisX ? [[0, o, 0], [1, o, 0], [1, o, h], [0, o, h]] : [[o, 1, 0], [o, 0, 0], [o, 0, h], [o, 1, h]];
      m.face(pts, col, { twoSided: true, paint: lattice ? (ctx, w, hh, sh, br2, night) => { if (night) return; ctx.clearRect(0, 0, w, hh); ctx.strokeStyle = sh(col); ctx.lineWidth = 0.025; ctx.beginPath(); ctx.moveTo(0, 0.01); ctx.lineTo(w, 0.01); ctx.moveTo(0, hh - 0.01); ctx.lineTo(w, hh - 0.01); for (let u = 0; u < w; u += 0.25) { ctx.moveTo(u, 0); ctx.lineTo(u + 0.125, hh); ctx.lineTo(u + 0.25, 0); } ctx.stroke(); } : null });
    };
    if (style === 'girder') { side(w0, 0.16, steel); side(w1, 0.16, steel); }
    else if (style === 'truss') { side(w0, 0.32, steel, true); side(w1, 0.32, steel, true); }
    else if (style === 'stone' || style === 'timber') { side(w0, 0.05, deckCol); side(w1, 0.05, deckCol); }
    else if (style === 'tube') {
      const gl = Art.paint.glassPaint({ glass: '#7fa6b8', glass2: '#d0e6ee' });
      const pts = axisX ? [[0, w0, 0], [1, w0, 0], [1, 0.5, 0.42], [0, 0.5, 0.42]] : [[w0, 1, 0], [w0, 0, 0], [0.5, 0, 0.42], [0.5, 1, 0.42]];
      m.face(pts, '#a9c8d6', { twoSided: true, alpha: 0.55 });
      const pts2 = axisX ? [[1, w1, 0], [0, w1, 0], [0, 0.5, 0.42], [1, 0.5, 0.42]] : [[w1, 0, 0], [w1, 1, 0], [0.5, 1, 0.42], [0.5, 0, 0.42]];
      m.face(pts2, '#a9c8d6', { twoSided: true, alpha: 0.4, paint: gl });
    } else {
      // suspension / cable-stayed: railings plus towers near the ends of long spans
      side(w0, 0.06, steel); side(w1, 0.06, steel);
      const towerAt = i === 1 || i === br.len;
      if (towerAt) {
        const th = style === 'cable' ? 1.4 : 1.1;
        for (const o of [w0 - 0.04, w1 + 0.04]) { const px = axisX ? 0.5 : o, py = axisX ? o : 0.5; m.box(px - 0.04, py - 0.04, -0.07, px + 0.04, py + 0.04, th, steel); }
        m.box(axisX ? 0.46 : w0 - 0.04, axisX ? w0 - 0.04 : 0.46, th - 0.1, axisX ? 0.54 : w1 + 0.04, axisX ? w1 + 0.04 : 0.54, th - 0.04, steel);
      }
      // main cable sag drawn as faces for the middle tiles
      const n = br.len, k = (i - 0.5) / n, k2 = (i + 0.5) / n;
      const sag = (u) => 1.05 - Math.sin(Math.PI * u) * 0.9;
      if (style === 'suspension') for (const o of [w0 - 0.04, w1 + 0.04]) {
        const a = axisX ? [0, o, sag(k - 0.5 / n + 0.5 / n)] : [o, 0, sag(k)], b = axisX ? [1, o, sag(k2)] : [o, 1, sag(k2)];
        m.face([a, b, [b[0], b[1], b[2] + 0.025], [a[0], a[1], a[2] + 0.025]], '#3a3e42', { twoSided: true });
        const mid = (sag(k) + sag(k2)) / 2;
        m.box(axisX ? 0.495 : o - 0.005, axisX ? o - 0.005 : 0.495, 0, axisX ? 0.505 : o + 0.005, axisX ? o + 0.005 : 0.505, mid, '#3a3e42');
      }
    }
    m.noShadow = pierH === 0;
    return m;
  }
  W.spanModel = spanModel;

  // ---------- night window overlay (drawn additively in the lighting pass) ----------
  R.nightQueue = [];
  R.drawNightQueue = function (ctx) {
    const d = R.env.dark;
    if (d < 0.05 || !R.nightQueue.length) { R.nightQueue.length = 0; return; }
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(1, d * 1.25);
    for (const [key, s, build, px, py, opt] of R.nightQueue) {
      const sp = Gx.nightSprite(key, s, build, opt);
      ctx.drawImage(sp.c, px - sp.ox / s, py - sp.oy / s, sp.c.width / s, sp.c.height / s);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    R.nightQueue.length = 0;
  };
})(typeof window !== 'undefined' ? window : globalThis);
