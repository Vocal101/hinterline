// Isometric renderer. Ground (terrain, water, infrastructure) is baked into chunk canvases per zoom bucket;
// trees, buildings and vehicles are drawn every frame in depth order when zoomed in, and baked into the
// chunks when zoomed out. Lighting (day/night, weather) is applied on top.
(function (root) {
  const HL = root.HL, Gx = HL.Gfx;
  const T = HL.T, GR = HL.GR;
  const R = HL.R = {};
  const TW2 = Gx.TW2, TH2 = Gx.TH2, HS = Gx.HS;

  R.cam = { x: 0, y: 0, z: 1 };
  R.objDrawers = {};     // tile type -> fn(ctx, x, y, t, sx, sy, s, env) draws per-frame objects
  R.groundDrawers = {};  // tile type -> fn(ctx, x, y, t, s, env) draws into chunk ground layer
  R.overlays = [];       // fn(ctx, view) drawn after objects in screen space (tools, selections)
  R.worldOverlays = [];  // fn(ctx, view) drawn in world space before lighting
  R.lights = [];         // collected each frame: [sx, sy, r, col, a]
  R.stats = { chunksBaked: 0, frameMs: 0, objMs: 0 };
  R.opts = { grid: true, transparentBuildings: false, dayNight: true, weather: true, smooth: true, lowDetail: false };

  const BUCKETS = [0.125, 0.25, 0.5, 1, 2, 4];
  const CHUNK_TILES = { 0.125: 32, 0.25: 24, 0.5: 16, 1: 16, 2: 8, 4: 4 };
  R.bucketFor = function (z, dpr) {
    const need = z * Math.min(dpr, 2);
    for (const b of BUCKETS) if (b >= need * 0.78) return b;
    return 4;
  };

  // ---------- setup ----------
  R.init = function (canvas) {
    R.canvas = canvas; R.ctx = canvas.getContext('2d', { alpha: false });
    if (!Gx.textures.grass) Gx.makeTextures();
    R.resize();
  };
  R.resize = function () {
    const c = R.canvas, dpr = Math.min(window.devicePixelRatio || 1, 2);
    R.dpr = dpr; R.vw = c.clientWidth; R.vh = c.clientHeight;
    c.width = Math.round(R.vw * dpr); c.height = Math.round(R.vh * dpr);
  };
  R.setGame = function (g) {
    R.g = g; R.map = g.map;
    R.chunks = new Map(); R.chunkBytes = 0;
    R.computeWaterDepth();
    R.computeVariation();
    R.lastSeason = -1;
  };
  R.computeWaterDepth = function () {
    const m = R.map, W = m.W, H = m.H, d = new Uint8Array(W * H).fill(255), q = [];
    for (let t = 0; t < W * H; t++) if (m.type[t] !== T.WATER) { d[t] = 0; q.push(t); }
    let head = 0;
    while (head < q.length) {
      const t = q[head++], x = t % W, y = (t / W) | 0;
      for (let k = 0; k < 4; k++) {
        const nx = x + HL.DX[k], ny = y + HL.DY[k]; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const n = ny * W + nx; if (d[n] === 255) { d[n] = Math.min(12, d[t] + 1); q.push(n); }
      }
    }
    R.depth = d;
  };
  // depth at a tile corner: mean of the four tiles that share it (land counts as 0)
  R.cornerDepth = function (x, y) {
    const m = R.map, W = m.W, H = m.H, d = R.depth;
    const at = (tx, ty) => (tx < 0 || ty < 0 || tx >= W || ty >= H) ? 8 : d[ty * W + tx];
    const c = (cx, cy) => (at(cx - 1, cy - 1) + at(cx, cy - 1) + at(cx - 1, cy) + at(cx, cy)) / 4;
    return [c(x, y), c(x + 1, y), c(x + 1, y + 1), c(x, y + 1)];
  };
  R.computeVariation = function () {
    const m = R.map, W = m.W, H = m.H, v = new Float32Array(W * H);
    const nz = new HL.Noise(HL.hashSeed((R.g.opts && R.g.opts.seed || 'x') + 'var'));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) v[y * W + x] = nz.fbm(x / 11, y / 11, 3, 2, 0.5) * 1.6 + (HL.hash2(x, y, 5) - 0.5) * 0.18;
    R.vari = v;
  };

  // ---------- environment: season, daylight, weather ----------
  R.env = { season: 1, month: 6, snowShift: 0, dark: 0, rain: 0, snow: 0, time: 0, overcast: 0 };
  R.updateEnv = function (now) {
    const g = R.g, e = R.env;
    e.time = now / 1000;
    const md = HL.ymd(g.date);
    e.month = md.m;
    const m = md.m;
    const climate = g.opts.climate;
    e.season = climate === 'desert' ? 1 : (m >= 2 && m <= 4 ? 0 : m >= 5 && m <= 7 ? 1 : m >= 8 && m <= 10 ? 2 : 3);
    // seasonal snowline offset in levels (arctic winter brings snow lower; temperate gets snow on hills in deep winter)
    e.snowShift = climate === 'arctic' ? [-2, -2, -1, 0, 1, 2, 2, 2, 1, 0, -1, -2][m] : 0;
    e.tempSnow = climate === 'temperate' && (m === 0 || m === 1 || m === 11) ? (m === 0 ? 2 : 1) : 0;
    // day/night: a full cycle every few real minutes; dark is 0 by day to ~0.72 at night
    if (R.opts.dayNight && !g.noNight) {
      const cyc = (g.realTime || now / 1000) / (60 * 6);
      const ph = cyc - Math.floor(cyc);
      // day 0..0.55, dusk to 0.65, night to 0.9, dawn to 1
      let dk;
      if (ph < 0.55) dk = 0; else if (ph < 0.65) dk = HL.smooth((ph - 0.55) / 0.1); else if (ph < 0.9) dk = 1; else dk = 1 - HL.smooth((ph - 0.9) / 0.1);
      e.phase = ph; e.dark = dk * 0.78;
      e.dusk = ph > 0.5 && ph < 0.7 ? Math.sin(Math.PI * (ph - 0.5) / 0.2) : ph > 0.85 ? Math.sin(Math.PI * Math.min(1, (ph - 0.85) / 0.15)) * 0.7 : 0;
    } else { e.dark = 0; e.dusk = 0; }
    const w = g.weather || { rain: 0, snow: 0 };
    e.rain = R.opts.weather ? w.rain || 0 : 0; e.snow = R.opts.weather ? w.snowfall || 0 : 0;
    e.overcast = Math.max(e.rain, e.snow) * 0.6;
    const sk = e.season * 10 + (climate === 'arctic' ? e.snowShift + 5 : e.tempSnow);
    if (sk !== R.lastSeason) { if (R.lastSeason !== -1) R.markAllStale(); R.lastSeason = sk; }
  };
  R.markAllStale = function () { if (R.chunks) for (const c of R.chunks.values()) c.stale = true; };

  // ground palette
  const GRASS = {
    temperate: [['#6e9e42', '#9cbc5c'], ['#5f8f38', '#9cb45a'], ['#8a9644', '#b3a85c'], ['#7f906a', '#a0a586']],
    arctic: [['#62845a', '#86a06e'], ['#5d8456', '#86a26a'], ['#7d8256', '#99956a'], ['#7a8a7e', '#9aa79a']],
    desert: [['#a6a45a', '#c4b670'], ['#a6a45a', '#c4b670'], ['#a6a45a', '#c4b670'], ['#a6a45a', '#c4b670']],
  };
  const ROUGH = { temperate: '#6f8a44', arctic: '#6f7f57', desert: '#7f8a4a' };
  const SAND = '#d8bf86', BEACH = '#d9c690', DIRT = '#8a6e4c', ROCK = '#958c7c', SNOW = '#eef3f6';
  R.groundColor = function (t, x, y) {
    const m = R.map, e = R.env, climate = R.g.opts.climate;
    const gk = m.ground[t];
    const v = R.vari[t];
    let c;
    if (gk === GR.SAND) c = Gx.mix(SAND, '#e6cf98', HL.clamp(v * 0.5 + 0.5, 0, 1));
    else if (gk === GR.BEACH) c = Gx.rgb(BEACH);
    else if (gk === GR.DIRT) c = Gx.rgb(DIRT);
    else if (gk === GR.ROCKS) c = Gx.rgb(ROCK);
    else if (gk === GR.FIELD) c = Gx.rgb('#8a7350');
    else {
      const pal = GRASS[climate][e.season];
      c = Gx.mix(pal[0], pal[1], HL.clamp(v * 0.6 + 0.5, 0, 1));
      if (climate === 'desert' && m.zone[t] === 2) c = Gx.mix('#4f8a3a', '#62994a', HL.clamp(v + 0.5, 0, 1));
      if (gk === GR.ROUGH) c = Gx.mix(c, ROUGH[climate], 0.55);
      if (m.gdens[t] < 3) c = Gx.mix(c, DIRT, (3 - m.gdens[t]) * 0.22);
      // dry patches and lush hollows
      if (v < -0.35) c = Gx.mix(c, e.season === 2 ? '#b0a058' : '#a9b060', 0.25);
      const hgt = m.tileMax(x, y);
      if (hgt > 7) c = Gx.mix(c, '#7f8a64', Math.min(0.4, (hgt - 7) * 0.05));
    }
    return c;
  };
  // snow on one terrain triangle: follows height contours with a little noise
  R.snowTri = function (x, y, hAvg) {
    const line = R.snowLine();
    return hAvg + R.vari[y * R.map.W + x] * 0.35 >= line - 0.25;
  };
  R.snowLine = function () {
    const e = R.env, climate = R.g.opts.climate;
    if (climate === 'arctic') return R.map.snowline + e.snowShift;
    if (climate === 'temperate' && e.tempSnow) return 8.5 - e.tempSnow * 2;
    return 999;
  };
  // 0 none, 1 patchy, 2 full
  R.snowAt = function (t, x, y) {
    const m = R.map, e = R.env, climate = R.g.opts.climate;
    if (m.type[t] === T.WATER) return 0;
    const line = R.snowLine();
    if (line > 200) return 0;
    const lo = m.tileMin(x, y), hi = m.tileMax(x, y);
    return lo >= line + 0.5 ? 2 : hi >= line - 0.6 ? 1 : 0;
  };
  const WATERCOL = {
    temperate: ['#5aa5a6', '#2f6f8f', '#1d4a6e'],
    arctic: ['#6ca2ad', '#35677f', '#1e3e57'],
    desert: ['#47b6b4', '#2a7e9e', '#1a557c'],
  };
  R.waterColor = function (depth) {
    const p = WATERCOL[R.g.opts.climate];
    if (depth <= 1) return Gx.mix(p[0], p[0], 0);
    if (depth <= 5) return Gx.mix(p[0], p[1], HL.smooth((depth - 1) / 4));
    return Gx.mix(p[1], p[2], HL.smooth(Math.min(1, (depth - 5) / 7)));
  };

  // ---------- projection helpers (zoom-1 world px) ----------
  R.wp = (x, y, h) => [(x - y) * TW2, (x + y) * TH2 - h * HS];
  R.toScreen = function (wx, wy) { const c = R.cam; return [(wx - c.x) * c.z + R.vw / 2, (wy - c.y) * c.z + R.vh / 2]; };
  R.toWorldPx = function (sx, sy) { const c = R.cam; return [(sx - R.vw / 2) / c.z + c.x, (sy - R.vh / 2) / c.z + c.y]; };
  R.tileToScreen = function (fx, fy, hLevels) { const p = R.wp(fx, fy, hLevels == null ? R.map.heightAt(fx, fy) : hLevels); return R.toScreen(p[0], p[1]); };
  R.centerOn = function (fx, fy) { const p = R.wp(fx, fy, R.map.heightAt(fx, fy)); R.cam.x = p[0]; R.cam.y = p[1]; };
  R.camTile = function () {
    const [wx, wy] = [R.cam.x, R.cam.y];
    // ignore height: approximate
    const a = wx / TW2, b = (wy + 4 * HS) / TH2;
    return [(a + b) / 2, (b - a) / 2];
  };
  // screen -> tile, honouring terrain height (front-most tile wins)
  R.pick = function (sx, sy) {
    const m = R.map; if (!m) return null;
    const [wx, wy] = R.toWorldPx(sx, sy);
    let best = null;
    for (let hh = 30; hh >= 0; hh--) {
      // tile position assuming height hh
      const a = wx / TW2, b = (wy + hh * HS) / TH2;
      const fx = (a + b) / 2, fy = (b - a) / 2;
      const x = Math.floor(fx), y = Math.floor(fy);
      for (const [cx, cy] of [[x, y], [x + 1, y], [x, y + 1], [x - 1, y], [x, y - 1]]) {
        if (!m.inside(cx, cy)) continue;
        const loc = R.localFromWorldPx(cx, cy, wx, wy);
        if (loc) { if (!best || cx + cy > best.x + best.y) best = { x: cx, y: cy, u: loc[0], v: loc[1] }; }
      }
    }
    return best;
  };
  // if world px point lies on tile (x,y) surface, return local (u,v)
  R.localFromWorldPx = function (x, y, wx, wy) {
    const m = R.map;
    const c = m.corners(x, y), hc = (c[0] + c[1] + c[2] + c[3]) / 4;
    const P = [[x, y, c[0]], [x + 1, y, c[1]], [x + 1, y + 1, c[2]], [x, y + 1, c[3]]];
    const C = [x + 0.5, y + 0.5, hc];
    for (let i = 0; i < 4; i++) {
      const A = P[i], B = P[(i + 1) & 3];
      const pa = R.wp(A[0], A[1], A[2]), pb = R.wp(B[0], B[1], B[2]), pc = R.wp(C[0], C[1], C[2]);
      const d = (pb[1] - pc[1]) * (pa[0] - pc[0]) + (pc[0] - pb[0]) * (pa[1] - pc[1]);
      if (Math.abs(d) < 1e-6) continue;
      const l1 = ((pb[1] - pc[1]) * (wx - pc[0]) + (pc[0] - pb[0]) * (wy - pc[1])) / d;
      const l2 = ((pc[1] - pa[1]) * (wx - pc[0]) + (pa[0] - pc[0]) * (wy - pc[1])) / d;
      const l3 = 1 - l1 - l2;
      if (l1 >= -0.001 && l2 >= -0.001 && l3 >= -0.001) {
        const u = l1 * A[0] + l2 * B[0] + l3 * C[0] - x, v = l1 * A[1] + l2 * B[1] + l3 * C[1] - y;
        return [HL.clamp(u, 0, 0.999), HL.clamp(v, 0, 0.999)];
      }
    }
    return null;
  };

  // ---------- chunk baking ----------
  function chunkInfo(b, ci, cj) {
    const N = CHUNK_TILES[b], m = R.map;
    const x0 = ci * N, y0 = cj * N, x1 = Math.min(m.W, x0 + N), y1 = Math.min(m.H, y0 + N);
    let maxH = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const hh = m.ch(x, y); if (hh > maxH) maxH = hh; }
    const padTop = b <= 0.5 ? 150 : 12;
    const left = (x0 - y1) * TW2 - 4, right = (x1 - y0) * TW2 + 4;
    const top = (x0 + y0) * TH2 - maxH * HS - padTop, bottom = (x1 + y1) * TH2 + 70;
    return { N, x0, y0, x1, y1, left, right, top, bottom };
  }
  R.chunkFor = function (b, ci, cj) {
    const key = b + ':' + ci + ':' + cj;
    return R.chunks.get(key);
  };
  function bakeChunk(b, ci, cj, old) {
    const info = chunkInfo(b, ci, cj);
    const s = b; // pixel scale of the chunk canvas
    const w = Math.ceil((info.right - info.left) * s), h = Math.ceil((info.bottom - info.top) * s);
    let cv = old && old.c && old.c.width === w && old.c.height === h ? old.c : Gx.canvas(w, h);
    const ctx = cv.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.setTransform(s, 0, 0, s, -info.left * s, -info.top * s);
    drawGroundRegion(ctx, info, b);
    const key = b + ':' + ci + ':' + cj;
    const ch = { key, b, ci, cj, c: cv, info, stale: false, dirty: false, used: performance.now() };
    if (!old) R.chunkBytes += w * h * 4;
    R.chunks.set(key, ch);
    R.stats.chunksBaked++;
    return ch;
  }
  function evictChunks() {
    const budget = 260e6;
    if (R.chunkBytes < budget) return;
    const arr = Array.from(R.chunks.values()).sort((a, b) => a.used - b.used);
    for (const c of arr) {
      if (R.chunkBytes < budget * 0.75) break;
      R.chunks.delete(c.key); R.chunkBytes -= c.c.width * c.c.height * 4;
    }
  }

  // Draw all ground for tiles of a chunk region (and baked objects at low zoom)
  function drawGroundRegion(ctx, info, b) {
    const m = R.map;
    const env = R.env;
    const detail = b >= 0.5, textured = b >= 0.5;
    const s = b;
    const tiles = [];
    for (let sum = info.x0 + info.y0; sum <= info.x1 + info.y1 - 2; sum++) {
      for (let x = Math.max(info.x0, sum - info.y1 + 1); x <= Math.min(info.x1 - 1, sum - info.y0); x++) {
        const y = sum - x; if (y < info.y0 || y >= info.y1) continue;
        tiles.push(y * m.W + x);
      }
    }
    for (const t of tiles) {
      const x = t % m.W, y = (t / m.W) | 0;
      drawTileGround(ctx, x, y, t, s, textured, detail);
    }
    // map edge cross-section along the front edges
    if (info.x1 === m.W || info.y1 === m.H) drawMapEdge(ctx, info);
    // grid
    if (R.opts.grid && b >= 1) {
      ctx.strokeStyle = 'rgba(20,30,20,0.07)'; ctx.lineWidth = 1 / s;
      ctx.beginPath();
      for (const t of tiles) {
        const x = t % m.W, y = (t / m.W) | 0;
        if (m.type[t] === T.WATER) continue;
        const c = m.corners(x, y);
        const p0 = R.wp(x, y, c[0]), p1 = R.wp(x + 1, y, c[1]), p3 = R.wp(x, y + 1, c[3]);
        ctx.moveTo(p3[0], p3[1]); ctx.lineTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]);
      }
      ctx.stroke();
    }
    // infrastructure ground parts (rails, roads, platforms)
    for (const t of tiles) {
      const x = t % m.W, y = (t / m.W) | 0;
      const gd = R.groundDrawers[m.type[t]];
      if (gd) gd(ctx, x, y, t, s, env);
      if (m.type[t] === T.RAIL && m.road[t] && R.groundDrawers[T.ROAD]) { /* level crossing drawn by rail drawer */ }
    }
    // low zoom: bake objects as well
    if (b <= 0.5) {
      for (const t of tiles) {
        const x = t % m.W, y = (t / m.W) | 0;
        drawTileObjects(ctx, x, y, t, s, true);
        if (m.bridgeOver[t] >= 0) HL.RW.drawBridgeSpan(ctx, x, y, t, s);
      }
    }
  }

  const TRI = [[0, 1], [1, 2], [2, 3], [3, 0]];
  function drawTileGround(ctx, x, y, t, s, textured, detail) {
    const m = R.map;
    const c = m.corners(x, y);
    const hc = (c[0] + c[1] + c[2] + c[3]) / 4;
    const P = [R.wp(x, y, c[0]), R.wp(x + 1, y, c[1]), R.wp(x + 1, y + 1, c[2]), R.wp(x, y + 1, c[3])];
    const C = R.wp(x + 0.5, y + 0.5, hc);
    const W3 = [[0, 0, c[0]], [1, 0, c[1]], [1, 1, c[2]], [0, 1, c[3]]];
    if (m.type[t] === T.WATER) {
      // colour each quarter of the tile from the depths at its corners so the sea shades smoothly
      const cd = R.cornerDepth(x, y), dc = R.depth[t];
      for (let i = 0; i < 4; i++) {
        const [a, bb] = TRI[i];
        const col = R.waterColor((cd[a] + cd[bb] + dc * 2) / 4);
        ctx.fillStyle = Gx.css(col);
        ctx.beginPath(); ctx.moveTo(P[a][0], P[a][1]); ctx.lineTo(P[bb][0], P[bb][1]); ctx.lineTo(C[0], C[1]); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 0.8; ctx.stroke();
      }
      if (textured) {
        ctx.save();
        ctx.beginPath(); ctx.moveTo(P[0][0], P[0][1]); ctx.lineTo(P[1][0], P[1][1]); ctx.lineTo(P[2][0], P[2][1]); ctx.lineTo(P[3][0], P[3][1]); ctx.closePath(); ctx.clip();
        ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = 0.5;
        ctx.fillStyle = R.pattern('water', s); ctx.fillRect(P[3][0], P[0][1], 64, 32);
        ctx.restore();
      }
      return;
    }
    let base = R.groundColor(t, x, y);
    const snow = R.snowAt(t, x, y);
    const gk = m.ground[t];
    const kind = m.type[t];
    // built-on tiles show trampled ground
    if (kind === T.HOUSE || kind === T.IND || kind === T.STATION || kind === T.DEPOT) base = Gx.mix(base, '#8b8467', 0.35);
    const vexag = 2.2; // exaggerate slope for shading so hills read clearly
    for (let i = 0; i < 4; i++) {
      const [a, bb] = TRI[i];
      const A = W3[a], B = W3[bb];
      const u = [B[0] - A[0], B[1] - A[1], (B[2] - A[2]) * Gx.LEVEL * vexag], v = [0.5 - A[0], 0.5 - A[1], (hc - A[2]) * Gx.LEVEL * vexag];
      let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      if (n[2] < 0) n = n.map(q => -q);
      const nl = Math.hypot(n[0], n[1], n[2]); n = n.map(q => q / nl);
      const d = n[0] * Gx.L[0] + n[1] * Gx.L[1] + n[2] * Gx.L[2];
      const br = HL.clamp(1 + (d - Gx.L[2]) * 1.15, 0.78, 1.2);
      let col = base;
      if (snow && R.snowTri(x, y, (A[2] + B[2] + hc) / 3)) col = Gx.rgb(SNOW);
      ctx.fillStyle = Gx.shadeCss(col, br);
      ctx.beginPath(); ctx.moveTo(P[a][0], P[a][1]); ctx.lineTo(P[bb][0], P[bb][1]); ctx.lineTo(C[0], C[1]); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 0.7 / Math.max(1, s * 0.5); ctx.stroke();
    }
    if (textured) {
      const tex = snow === 2 ? 'snow' : gk === GR.SAND ? 'sand' : gk === GR.BEACH ? 'beach' : gk === GR.DIRT || gk === GR.FIELD ? 'dirt' : gk === GR.ROCKS ? 'rock' : gk === GR.ROUGH ? 'rough' : 'grass';
      ctx.save();
      ctx.beginPath(); ctx.moveTo(P[0][0], P[0][1]); ctx.lineTo(P[1][0], P[1][1]); ctx.lineTo(P[2][0], P[2][1]); ctx.lineTo(P[3][0], P[3][1]); ctx.closePath();
      ctx.clip();
      ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = tex === 'grass' ? 0.85 : 0.75;
      ctx.fillStyle = R.pattern(tex, s);
      ctx.fillRect(P[3][0] - 2, Math.min(P[0][1], P[1][1], P[3][1]) - 2, 68, 40 + Math.abs(c[0] - c[2]) * HS + Math.abs(c[1] - c[3]) * HS);
      ctx.restore();
    }
    if (detail && kind === T.CLEAR) drawGroundDetail(ctx, x, y, t, s, P, C, snow);
    // shoreline: submerged part of coast tiles
    if (c[0] === 0 || c[1] === 0 || c[2] === 0 || c[3] === 0) drawShore(ctx, x, y, t, c, hc, P, C);
  }

  function drawGroundDetail(ctx, x, y, t, s, P, C, snow) {
    const m = R.map, gk = m.ground[t], e = R.env;
    if (gk === GR.FIELD) { drawField(ctx, x, y, t, P, C); return; }
    if (gk === GR.ROCKS && !snow) {
      const r = new HL.RNG(t * 31 + 5);
      for (let i = 0; i < 5; i++) {
        const u = 0.15 + r.next() * 0.7, v = 0.15 + r.next() * 0.7;
        const p = R.wp(x + u, y + v, m.heightAt(x + u, y + v));
        const rr = 2 + r.next() * 3.5;
        ctx.fillStyle = 'rgba(30,30,40,0.3)'; ctx.beginPath(); ctx.ellipse(p[0] + 1.5, p[1] + 0.5, rr * 1.1, rr * 0.5, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#7d7a73'; ctx.beginPath(); ctx.ellipse(p[0], p[1] - rr * 0.3, rr, rr * 0.7, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#aaa69c'; ctx.beginPath(); ctx.ellipse(p[0] - rr * 0.3, p[1] - rr * 0.6, rr * 0.55, rr * 0.35, 0, 0, 7); ctx.fill();
      }
      return;
    }
    if (gk === GR.GRASS && !snow && e.season <= 1 && R.g.opts.climate !== 'arctic') {
      const hsh = HL.hash2(x, y, 23);
      if (hsh < 0.22) {
        const r = new HL.RNG(t * 13 + 1);
        const cols = ['#f4f0e0', '#f2d75a', '#c99be0', '#ef8f7a'];
        const col = cols[(hsh * 100 | 0) % 4];
        ctx.fillStyle = col;
        for (let i = 0; i < 9; i++) { const u = r.next(), v = r.next(); const p = R.wp(x + u, y + v, m.heightAt(x + u, y + v)); ctx.fillRect(p[0], p[1], 1.3, 1.3); }
      }
    }
  }
  // crop fields: rows along an axis; colour follows the season
  function drawField(ctx, x, y, t, P, C) {
    const m = R.map, e = R.env, crop = m.gdens[t] & 3, axis = (m.gdens[t] >> 2) & 1;
    const climate = R.g.opts.climate;
    let soil = '#7a5d3e', crops;
    const st = (m.m2[t] + (e.month * 2)) % 24; // stagger fields
    if (climate === 'desert') crops = ['#e8c43c', '#8fb24a', '#c7a34a', '#d9b84a'];
    else crops = [e.season === 0 ? '#9fbf5a' : e.season === 1 ? '#d9b84a' : e.season === 2 ? '#c9a45a' : '#8a7a5a',
      e.season === 0 ? '#7faa48' : e.season === 1 ? '#6f9a3c' : e.season === 2 ? '#a08a4a' : '#7d6b4c',
      e.season === 3 ? '#9a8a6a' : '#b7c46a', e.season === 1 ? '#c8a43c' : '#8f8a4a'];
    const cc = crops[crop];
    const stage = e.season === 3 && climate !== 'desert' ? 0 : (st % 6) / 5;
    // furrows
    ctx.save();
    ctx.beginPath(); ctx.moveTo(P[0][0], P[0][1]); ctx.lineTo(P[1][0], P[1][1]); ctx.lineTo(P[2][0], P[2][1]); ctx.lineTo(P[3][0], P[3][1]); ctx.closePath(); ctx.clip();
    ctx.fillStyle = Gx.shadeCss(soil, 0.9, 0.55); ctx.fill();
    const rows = 7;
    for (let i = 0; i < rows; i++) {
      const f = (i + 0.5) / rows;
      const a = axis ? [x + f, y] : [x, y + f], b2 = axis ? [x + f, y + 1] : [x + 1, y + f];
      const pa = R.wp(a[0], a[1], m.heightAt(a[0], a[1])), pb = R.wp(b2[0], b2[1], m.heightAt(b2[0], b2[1]));
      ctx.strokeStyle = Gx.shadeCss(cc, 0.85 + 0.25 * stage, 0.5 + stage * 0.5); ctx.lineWidth = 2.2 + stage * 1.6;
      ctx.beginPath(); ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0], pb[1]); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,250,220,0.18)'; ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.moveTo(pa[0], pa[1] - 1); ctx.lineTo(pb[0], pb[1] - 1); ctx.stroke();
    }
    ctx.restore();
    // hedge on the edges of fields that border non-field tiles (temperate)
    if (climate === 'temperate') {
      for (let d = 0; d < 4; d++) {
        const nx = x + HL.DX[d], ny = y + HL.DY[d];
        if (!m.inside(nx, ny)) continue;
        const nt = m.t(nx, ny);
        if (m.type[nt] === T.CLEAR && m.ground[nt] === GR.FIELD) continue;
        if (d === 0 || d === 3) continue; // back edges are drawn by the neighbour
        const e0 = d, cA = R.wp(...edgeCorner(x, y, e0, 0)), cB = R.wp(...edgeCorner(x, y, e0, 1));
        ctx.strokeStyle = '#3f5f2a'; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(cA[0], cA[1] - 1.5); ctx.lineTo(cB[0], cB[1] - 1.5); ctx.stroke();
        ctx.strokeStyle = '#5f8a3a'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(cA[0], cA[1] - 2.5); ctx.lineTo(cB[0], cB[1] - 2.5); ctx.stroke();
      }
    }
  }
  function edgeCorner(x, y, e, k) {
    // edge e corners: NE: N,E  SE: E,S  SW: S,W  NW: W,N
    const ci = (e + k) & 3; const off = [[0, 0], [1, 0], [1, 1], [0, 1]][ci];
    return [x + off[0], y + off[1], R.map.ch(x + off[0], y + off[1])];
  }
  R.edgeCorner = edgeCorner;

  // water over the part of a coast tile below the waterline
  const WL = 0.32;
  function drawShore(ctx, x, y, t, c, hc, P, C) {
    const m = R.map;
    const W3 = [[x, y, c[0]], [x + 1, y, c[1]], [x + 1, y + 1, c[2]], [x, y + 1, c[3]]];
    const Cw = [x + 0.5, y + 0.5, hc];
    const polys = [];
    for (const [a, b] of TRI) {
      const tri = [W3[a], W3[b], Cw];
      const out = [];
      for (let i = 0; i < 3; i++) {
        const p = tri[i], q = tri[(i + 1) % 3];
        const pin = p[2] <= WL, qin = q[2] <= WL;
        if (pin) out.push(p);
        if (pin !== qin) { const k = (WL - p[2]) / (q[2] - p[2]); out.push([p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k, WL]); }
      }
      if (out.length >= 3) polys.push(out);
    }
    if (!polys.length) return;
    const col = R.waterColor(1);
    ctx.fillStyle = Gx.css(col, 0.82);
    ctx.beginPath();
    for (const pl of polys) { const p0 = R.wp(pl[0][0], pl[0][1], 0); ctx.moveTo(p0[0], p0[1]); for (let i = 1; i < pl.length; i++) { const p = R.wp(pl[i][0], pl[i][1], 0); ctx.lineTo(p[0], p[1]); } ctx.closePath(); }
    ctx.fill();
    // wet sand line
    ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (const pl of polys) for (let i = 0; i < pl.length; i++) {
      const p = pl[i], q = pl[(i + 1) % pl.length];
      if (Math.abs(p[2] - WL) < 1e-6 && Math.abs(q[2] - WL) < 1e-6) { const a = R.wp(p[0], p[1], 0), b = R.wp(q[0], q[1], 0); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
    }
    ctx.stroke();
    R.shoreTiles && R.shoreTiles.add(t);
  }
  // shoreline segments for animated foam: computed per tile lazily
  const shoreCache = new Map();
  R.shoreSegs = function (t) {
    let s = shoreCache.get(t);
    if (s && s.v === R.map.version) return s.segs;
    const m = R.map, x = t % m.W, y = (t / m.W) | 0;
    const c = m.corners(x, y), hc = (c[0] + c[1] + c[2] + c[3]) / 4;
    const segs = [];
    if (m.type[t] !== T.WATER && (c[0] === 0 || c[1] === 0 || c[2] === 0 || c[3] === 0)) {
      const W3 = [[x, y, c[0]], [x + 1, y, c[1]], [x + 1, y + 1, c[2]], [x, y + 1, c[3]]];
      const Cw = [x + 0.5, y + 0.5, hc];
      for (const [a, b] of TRI) {
        const tri = [W3[a], W3[b], Cw], pts = [];
        for (let i = 0; i < 3; i++) { const p = tri[i], q = tri[(i + 1) % 3]; if ((p[2] <= WL) !== (q[2] <= WL)) { const k = (WL - p[2]) / (q[2] - p[2]); pts.push([p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k]); } }
        if (pts.length === 2) segs.push(pts);
      }
    }
    shoreCache.set(t, { v: m.version, segs });
    return segs;
  };

  function drawMapEdge(ctx, info) {
    const m = R.map, depth = 7;
    const soil = ['#4a3a2c', '#5a4632', '#3d3026'];
    if (info.x1 === m.W) {
      for (let y = info.y0; y < info.y1; y++) {
        const a = R.wp(m.W, y, m.ch(m.W, y)), b = R.wp(m.W, y + 1, m.ch(m.W, y + 1));
        const wa = R.wp(m.W, y, 0), wb = R.wp(m.W, y + 1, 0);
        ctx.fillStyle = 'rgba(30,70,100,0.9)';
        ctx.beginPath(); ctx.moveTo(wa[0], wa[1]); ctx.lineTo(wb[0], wb[1]); ctx.lineTo(wb[0], wb[1] + 10); ctx.lineTo(wa[0], wa[1] + 10); ctx.closePath(); ctx.fill();
        for (let k = 0; k < 3; k++) {
          ctx.fillStyle = Gx.shadeCss(soil[k], 0.75);
          const o = 10 + k * 14;
          ctx.beginPath(); ctx.moveTo(wa[0], wa[1] + o); ctx.lineTo(wb[0], wb[1] + o); ctx.lineTo(wb[0], wb[1] + o + 14.5); ctx.lineTo(wa[0], wa[1] + o + 14.5); ctx.closePath(); ctx.fill();
        }
      }
    }
    if (info.y1 === m.H) {
      for (let x = info.x0; x < info.x1; x++) {
        const wa = R.wp(x, m.H, 0), wb = R.wp(x + 1, m.H, 0);
        ctx.fillStyle = 'rgba(36,82,112,0.92)';
        ctx.beginPath(); ctx.moveTo(wa[0], wa[1]); ctx.lineTo(wb[0], wb[1]); ctx.lineTo(wb[0], wb[1] + 10); ctx.lineTo(wa[0], wa[1] + 10); ctx.closePath(); ctx.fill();
        for (let k = 0; k < 3; k++) {
          ctx.fillStyle = Gx.shadeCss(soil[k], 0.95);
          const o = 10 + k * 14;
          ctx.beginPath(); ctx.moveTo(wa[0], wa[1] + o); ctx.lineTo(wb[0], wb[1] + o); ctx.lineTo(wb[0], wb[1] + o + 14.5); ctx.lineTo(wa[0], wa[1] + o + 14.5); ctx.closePath(); ctx.fill();
        }
      }
    }
  }

  const patterns = {};
  R.pattern = function (name, s) {
    const k = name + '@' + s;
    if (patterns[k]) return patterns[k];
    const tmp = Gx.canvas(1, 1).getContext('2d');
    const p = tmp.createPattern(Gx.textures[name], 'repeat');
    // texture texels map to screen pixels at the bucket scale
    if (p.setTransform && typeof DOMMatrix !== 'undefined') p.setTransform(new DOMMatrix([1 / s, 0, 0, 1 / s, 0, 0]));
    patterns[k] = p;
    return p;
  };

  // ---------- objects ----------
  // trees on a tile (positions are stable per tile)
  R.treePositions = function (t, n) {
    const out = [];
    const r = new HL.RNG(t * 2654435761 >>> 0);
    const slots = [[0.28, 0.3], [0.72, 0.28], [0.3, 0.72], [0.7, 0.7], [0.5, 0.5]];
    const start = r.int(5);
    for (let i = 0; i < n; i++) {
      const sl = slots[(start + i * 2) % 5];
      out.push([sl[0] + (r.next() - 0.5) * 0.2, sl[1] + (r.next() - 0.5) * 0.2, r.int(6)]);
    }
    out.sort((a, b) => a[0] + a[1] - b[0] - b[1]);
    return out;
  };
  function drawTrees(ctx, x, y, t, s, baked) {
    const m = R.map, n = m.trees[t] & 7;
    if (!n) return;
    const spec = m.tspec[t], stage = (m.trees[t] >> 3) & 3;
    const snow = R.snowAt(t, x, y) > 0 || (R.env.season === 3 && R.g.opts.climate === 'arctic');
    const season = R.env.season;
    for (const [u, v, variant] of R.treePositions(t, n)) {
      const sp = Gx.treeSprite(spec, variant, stage, season, snow, s);
      const p = R.wp(x + u, y + v, m.heightAt(x + u, y + v));
      if (baked) ctx.drawImage(sp.c, p[0] - sp.ox / s, p[1] - sp.oy / s, sp.c.width / s, sp.c.height / s);
      else ctx.drawImage(sp.c, p[0] - sp.ox / s, p[1] - sp.oy / s, sp.c.width / s, sp.c.height / s);
    }
  }
  function drawTileObjects(ctx, x, y, t, s, baked) {
    const m = R.map;
    if (m.trees[t] & 7) drawTrees(ctx, x, y, t, s, baked);
    const od = R.objDrawers[m.type[t]];
    if (od) od(ctx, x, y, t, s, baked);
  }
  R.drawTileObjects = drawTileObjects;

  // ---------- frame ----------
  R.vehicleBuckets = new Map();
  R.frame = function (now) {
    const t0 = performance.now();
    const g = R.g, m = R.map, ctx = R.ctx;
    if (!m) return;
    R.now = now;
    R.updateEnv(now);
    // process map dirty tiles
    if (m.dirty.size) {
      for (const t of m.dirty) {
        const x = t % m.W, y = (t / m.W) | 0;
        for (const b of BUCKETS) {
          const N = CHUNK_TILES[b];
          for (const [dx, dy] of [[0, 0], [-1, 0], [0, -1], [-1, -1], [1, 0], [0, 1]]) {
            const ch = R.chunks.get(b + ':' + Math.floor((x + dx) / N) + ':' + Math.floor((y + dy) / N));
            if (ch) ch.dirty = true;
          }
        }
        shoreCache.delete(t);
      }
      m.dirty.clear();
    }
    const dpr = R.dpr, z = R.cam.z;
    const b = R.bucketFor(z, dpr);
    R.bucket = b;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // sky/sea background beyond the map
    ctx.fillStyle = Gx.css(R.waterColor(10));
    ctx.fillRect(0, 0, R.vw, R.vh);
    // world transform: world px -> css px
    const wx0 = R.cam.x - R.vw / 2 / z, wy0 = R.cam.y - R.vh / 2 / z, wx1 = R.cam.x + R.vw / 2 / z, wy1 = R.cam.y + R.vh / 2 / z;
    ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (R.vw / 2 - R.cam.x * z), dpr * (R.vh / 2 - R.cam.y * z));
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'medium';
    // visible chunks
    const N = CHUNK_TILES[b];
    const ncx = Math.ceil(m.W / N), ncy = Math.ceil(m.H / N);
    const vis = [];
    for (let cj = 0; cj < ncy; cj++) for (let ci = 0; ci < ncx; ci++) {
      const x0 = ci * N, y0 = cj * N, x1 = Math.min(m.W, x0 + N), y1 = Math.min(m.H, y0 + N);
      const left = (x0 - y1) * TW2, right = (x1 - y0) * TW2, top = (x0 + y0) * TH2 - 32 * HS - 160, bottom = (x1 + y1) * TH2 + 80;
      if (right < wx0 || left > wx1 || bottom < wy0 || top > wy1) continue;
      vis.push([ci, cj]);
    }
    vis.sort((a, b2) => (a[0] + a[1]) - (b2[0] + b2[1]));
    let budget = R.chunkBudgetMs || 22;
    const tb = performance.now();
    for (const [ci, cj] of vis) {
      let ch = R.chunks.get(b + ':' + ci + ':' + cj);
      const need = !ch || ch.dirty || ch.stale;
      if (need) {
        if (performance.now() - tb < budget || R.bakeAll) ch = bakeChunk(b, ci, cj, ch);
        else if (!ch) {
          // over budget: show a stand-in from another zoom level, or leave it for the next frame
          const alt = findAlt(b, ci, cj);
          if (alt) drawChunkAlt(ctx, alt, ci, cj, b);
          continue;
        }
      }
      if (ch) {
        ch.used = now;
        const inf = ch.info;
        ctx.drawImage(ch.c, inf.left, inf.top, inf.right - inf.left, inf.bottom - inf.top);
      }
    }
    evictChunks();
    // animated water glints + foam
    if (b >= 0.5) drawWaterAnim(ctx, wx0, wy0, wx1, wy1, now);
    for (const f of R.worldOverlays) f(ctx, { wx0, wy0, wx1, wy1, b, now });
    // objects pass
    const to = performance.now();
    R.lights.length = 0;
    if (HL.Vis && HL.Vis.prepare) HL.Vis.prepare(R, now);
    if (b >= 1) drawObjectsPass(ctx, wx0, wy0, wx1, wy1, b, now);
    else if (HL.Vis && HL.Vis.drawFar) HL.Vis.drawFar(ctx, wx0, wy0, wx1, wy1, b, now);
    if (HL.Fx) HL.Fx.draw(ctx, wx0, wy0, wx1, wy1, b, now);
    if (HL.Vis && HL.Vis.drawAir) HL.Vis.drawAir(ctx, b >= 1 ? b : Math.max(0.25, b), now);
    R.stats.objMs = performance.now() - to;
    for (const f of R.worldOverlays2 || []) f(ctx, { wx0, wy0, wx1, wy1, b, now });
    // lighting
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    applyLighting(ctx, now, () => ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (R.vw / 2 - R.cam.x * z), dpr * (R.vh / 2 - R.cam.y * z)));
    if (HL.Fx && HL.Fx.weather) HL.Fx.weather(ctx, R.vw, R.vh, now);
    for (const f of R.overlays) f(ctx, { wx0, wy0, wx1, wy1, b, now });
    R.stats.frameMs = performance.now() - t0;
  };
  function findAlt(b, ci, cj) {
    // look for a coarser chunk covering this region
    const N = CHUNK_TILES[b];
    for (const b2 of BUCKETS) {
      if (b2 === b) continue;
      const N2 = CHUNK_TILES[b2];
      const ch = R.chunks.get(b2 + ':' + Math.floor(ci * N / N2) + ':' + Math.floor(cj * N / N2));
      if (ch && N2 >= N && !ch.dirty) return ch;
    }
    return null;
  }
  function drawChunkAlt(ctx, ch, ci, cj, b) {
    const inf = ch.info;
    ctx.drawImage(ch.c, inf.left, inf.top, inf.right - inf.left, inf.bottom - inf.top);
  }

  function drawWaterAnim(ctx, wx0, wy0, wx1, wy1, now) {
    const m = R.map, tm = now / 1000;
    const rmin = Math.max(0, Math.floor((wy0 - 40) / TH2)), rmax = Math.ceil((wy1 + 40) / TH2);
    const cmin = Math.floor((wx0 - 64) / TW2), cmax = Math.ceil((wx1 + 64) / TW2);
    ctx.lineCap = 'round';
    const foam = [];
    for (let r = rmin; r <= rmax; r++) {
      for (let c = cmin; c <= cmax; c++) {
        if (((r + c) & 1) !== 0) continue;
        const x = (r + c) >> 1, y = (r - c) >> 1;
        if (!m.inside(x, y)) continue;
        const t = y * m.W + x;
        if (m.type[t] === T.WATER) {
          // a couple of drifting glints per tile
          const hsh = HL.hash2(x, y, 41);
          const ph = (tm * 0.35 + hsh * 7) % 1;
          if (ph < 0.6) {
            const a = Math.sin(ph / 0.6 * Math.PI) * (R.env.dark > 0.4 ? 0.12 : 0.32);
            const u = (hsh * 3.7) % 1, v = (hsh * 9.1 + ph * 0.25) % 1;
            const p = R.wp(x + u, y + v, 0);
            ctx.strokeStyle = `rgba(235,248,255,${a})`; ctx.lineWidth = 1.1;
            ctx.beginPath(); ctx.moveTo(p[0] - 3, p[1]); ctx.lineTo(p[0] + 3, p[1] - 0.5); ctx.stroke();
          }
        } else if (m.ground[t] === GR.BEACH || m.tileMin(x, y) === 0) {
          const segs = R.shoreSegs(t);
          if (segs.length) foam.push(segs);
        }
      }
    }
    // breathing surf line
    const k = (Math.sin(tm * 1.3) + 1) / 2;
    ctx.strokeStyle = `rgba(250,253,255,${0.35 + k * 0.35})`; ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (const segs of foam) for (const [a, bb] of segs) {
      const off = 0.05 + k * 0.06;
      const pa = R.wp(a[0], a[1], 0), pb = R.wp(bb[0], bb[1], 0);
      ctx.moveTo(pa[0], pa[1] + off * 6); ctx.lineTo(pb[0], pb[1] + off * 6);
    }
    ctx.stroke();
  }

  // visible tiles in back-to-front order; objects + vehicles
  function drawObjectsPass(ctx, wx0, wy0, wx1, wy1, b, now) {
    const m = R.map;
    const s = b;
    const rmin = Math.max(0, Math.floor((wy0 - 40) / TH2));
    const rmax = Math.min(m.W + m.H, Math.ceil((wy1 + 32 * HS + 260) / TH2));
    const cmin = Math.max(-m.H, Math.floor((wx0 - 80) / TW2)), cmax = Math.min(m.W, Math.ceil((wx1 + 80) / TW2));
    const vb = R.vehicleBuckets;
    for (let r = rmin; r <= rmax; r++) {
      for (let c = cmin; c <= cmax; c++) {
        if (((r + c) & 1) !== 0) continue;
        const x = (r + c) >> 1, y = (r - c) >> 1;
        if (x < 0 || y < 0 || x >= m.W || y >= m.H) continue;
        const t = y * m.W + x;
        // cull tiles whose top is below the screen
        const by = (x + y) * TH2 - m.tileMax(x, y) * HS;
        if (by - 300 > wy1) continue;
        drawTileObjects(ctx, x, y, t, s, false);
        const vl = vb.get(t);
        if (m.bridgeOver[t] >= 0) {
          if (vl) for (const v of vl) if (!v.onBridge) HL.Vis.drawVehicle(ctx, v, s, now);
          HL.RW.drawBridgeSpan(ctx, x, y, t, s);
          if (vl) for (const v of vl) if (v.onBridge) HL.Vis.drawVehicle(ctx, v, s, now);
        } else if (vl) for (const v of vl) HL.Vis.drawVehicle(ctx, v, s, now);
      }
    }
  }

  // ---------- lighting ----------
  function applyLighting(ctx, now, worldTf) {
    const e = R.env;
    const W = R.vw, H = R.vh;
    if (e.overcast > 0.01) { ctx.fillStyle = `rgba(70,80,95,${e.overcast * 0.35})`; ctx.fillRect(0, 0, W, H); }
    if (e.dusk > 0.01) {
      ctx.globalCompositeOperation = 'soft-light';
      ctx.fillStyle = `rgba(255,140,60,${e.dusk * 0.55})`; ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (e.dark <= 0.01 && R.nightQueue) R.nightQueue.length = 0;
    if (e.dark > 0.01) {
      ctx.globalCompositeOperation = 'multiply';
      const d = e.dark;
      ctx.fillStyle = `rgb(${255 - d * 215 | 0},${255 - d * 200 | 0},${255 - d * 140 | 0})`;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
      if (R.drawNightQueue) { worldTf(); R.drawNightQueue(ctx); ctx.setTransform(R.dpr, 0, 0, R.dpr, 0, 0); }
      ctx.globalCompositeOperation = 'lighter';
      const z = R.cam.z;
      for (const L of R.lights) {
        const [wx, wy, rad, col, a] = L;
        const [sx, sy] = R.toScreen(wx, wy);
        if (sx < -50 || sy < -50 || sx > W + 50 || sy > H + 50) continue;
        const rr = rad * z;
        ctx.globalAlpha = Math.min(1, (a == null ? 1 : a) * d * 1.3);
        const sp = glowSprite(col);
        ctx.drawImage(sp, sx - rr, sy - rr, rr * 2, rr * 2);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }
  const glows = {};
  function glowSprite(col) {
    if (glows[col]) return glows[col];
    const c = Gx.canvas(64, 64), x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    const rgb = Gx.rgb(col);
    g.addColorStop(0, Gx.css(rgb, 0.9)); g.addColorStop(0.25, Gx.css(rgb, 0.45)); g.addColorStop(1, Gx.css(rgb, 0));
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    return (glows[col] = c);
  }
  R.addLight = function (wx, wy, r, col, a) { R.lights.push([wx, wy, r, col, a]); };

  // ---------- minimap image ----------
  R.minimapColors = function (mode) {
    const m = R.map, W = m.W, H = m.H, out = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const t = y * W + x; let c;
      const ty = m.type[t];
      if (ty === T.WATER) c = R.waterColor(R.depth[t] || 4);
      else if (mode === 'owner' && m.owner[t] < 16 && R.g.companies[m.owner[t]]) c = Gx.rgb(HL.LIVERY[R.g.companies[m.owner[t]].color].main);
      else if (ty === T.HOUSE) c = Gx.rgb(mode === 'terrain' ? '#9a8f80' : '#b8aa94');
      else if (ty === T.IND) { const ind = R.g.industries[m.idx[t]]; c = Gx.rgb(ind ? HL.INDUSTRY[ind.type].col : '#888'); }
      else if (ty === T.ROAD) c = Gx.rgb('#6e6a62');
      else if (ty === T.RAIL) c = Gx.rgb('#4b3f38');
      else if (ty === T.STATION) c = Gx.rgb('#d9c06a');
      else {
        c = R.groundColor(t, x, y);
        if (R.snowAt(t, x, y) === 2) c = Gx.rgb(SNOW);
        const hh = m.tileMax(x, y);
        c = Gx.shade(c, 0.85 + hh * 0.02);
        if (m.trees[t] & 7) c = Gx.mix(c, '#2f4f2a', 0.35 + (m.trees[t] & 7) * 0.08);
      }
      out[t * 4] = c[0]; out[t * 4 + 1] = c[1]; out[t * 4 + 2] = c[2]; out[t * 4 + 3] = 255;
    }
    return out;
  };
})(typeof window !== 'undefined' ? window : globalThis);
