// Procedural world generation: terrain, sea, climate zones, ground cover, forests, towns, industries.
(function (root) {
  const HL = root.HL;
  const T = HL.T, GR = HL.GR;

  HL.MAPGEN_DEFAULTS = {
    w: 128, h: 128, seed: 'HINTER1', climate: 'temperate', startYear: 1930,
    terrain: 1,     // 0 flat, 1 hilly, 2 mountainous, 3 alpine
    rough: 1,       // 0 smooth .. 3 very rough
    sea: 1,         // 0 none (landlocked), 1 some coast, 2 lots of sea, 3 archipelago
    towns: 2,       // 0 very few .. 4 many
    industries: 2,  // 0 very few .. 4 many
    trees: 2,       // 0 sparse .. 3 dense
  };

  HL.genTerrain = function (map, o, rng) {
    const W = map.W, H = map.H, W1 = W + 1, H1 = H + 1;
    const seed = HL.hashSeed(o.seed);
    const nz = new HL.Noise(seed), nz2 = new HL.Noise(seed ^ 0x9e3779b9), nz3 = new HL.Noise(seed ^ 0x51ed270b);
    const maxH = [5, 11, 18, 26][o.terrain];
    const oct = [3, 4, 5, 6][o.rough];
    const gain = [0.3, 0.38, 0.46, 0.54][o.rough];
    const scale = Math.max(64, Math.max(W, H)) / [1.2, 1.5, 1.9, 2.4][o.rough] / 1.4;
    const raw = new Float32Array(W1 * H1);
    let mn = 1e9, mx = -1e9;
    const sz = Math.max(W, H);
    for (let y = 0; y < H1; y++) for (let x = 0; x < W1; x++) {
      const fx = x / scale, fy = y / scale;
      let v = nz.fbm(fx, fy, oct, 2, gain);
      // continental shape: big blobs, more fragmented for archipelago
      const cont = nz2.fbm(x / (sz * (o.sea === 3 ? 0.22 : 0.45)), y / (sz * (o.sea === 3 ? 0.22 : 0.45)), 3, 2, 0.5);
      v = v * 0.75 + cont * (o.sea === 0 ? 0.3 : 0.9);
      // ridged mountains
      if (o.terrain >= 2) {
        const r = 1 - Math.abs(nz3.fbm(fx * 0.8, fy * 0.8, 4, 2.1, 0.5) * 2.2);
        v += Math.max(0, r - 0.45) * (o.terrain === 3 ? 0.9 : 0.5);
      }
      // edge falloff so the world is surrounded by sea
      const ex = Math.min(x, W - x) / sz, ey = Math.min(y, H - y) / sz;
      const e = Math.min(ex, ey);
      const fall = o.sea === 0 ? HL.smooth(HL.clamp(e * 40, 0, 1)) : HL.smooth(HL.clamp(e * (o.sea === 3 ? 6 : 8), 0, 1));
      v = v * (0.35 + 0.65 * fall) - (1 - fall) * 0.5;
      raw[y * W1 + x] = v;
      if (v < mn) mn = v; if (v > mx) mx = v;
    }
    // choose sea threshold from desired water fraction
    const seaFrac = [0.03, 0.2, 0.38, 0.55][o.sea];
    const sorted = Array.from(raw).sort((a, b) => a - b);
    const thr = sorted[Math.floor(seaFrac * (sorted.length - 1))];
    const curve = [1.0, 1.25, 1.45, 1.6][o.terrain];
    for (let i = 0; i < raw.length; i++) {
      let v = (raw[i] - thr) / (mx - thr);
      if (v <= 0) { map.h[i] = 0; continue; }
      v = Math.pow(v, curve);
      map.h[i] = Math.min(maxH, Math.floor(v * maxH + 0.999));
    }
    // borders at sea level
    for (let x = 0; x < W1; x++) { map.h[x] = 0; map.h[H * W1 + x] = 0; map.h[W1 + x] = Math.min(map.h[W1 + x], 0); map.h[(H - 1) * W1 + x] = 0; }
    for (let y = 0; y < H1; y++) { map.h[y * W1] = 0; map.h[y * W1 + W] = 0; map.h[y * W1 + 1] = 0; map.h[y * W1 + W - 1] = 0; }
    // enforce slope constraint (Chebyshev 1-Lipschitz) with two raster passes
    const h = map.h;
    for (let pass = 0; pass < 2; pass++) {
      for (let y = 0; y < H1; y++) for (let x = 0; x < W1; x++) {
        let v = h[y * W1 + x];
        if (x > 0) v = Math.min(v, h[y * W1 + x - 1] + 1);
        if (y > 0) { v = Math.min(v, h[(y - 1) * W1 + x] + 1); if (x > 0) v = Math.min(v, h[(y - 1) * W1 + x - 1] + 1); if (x < W) v = Math.min(v, h[(y - 1) * W1 + x + 1] + 1); }
        h[y * W1 + x] = v;
      }
      for (let y = H; y >= 0; y--) for (let x = W; x >= 0; x--) {
        let v = h[y * W1 + x];
        if (x < W) v = Math.min(v, h[y * W1 + x + 1] + 1);
        if (y < H) { v = Math.min(v, h[(y + 1) * W1 + x] + 1); if (x < W) v = Math.min(v, h[(y + 1) * W1 + x + 1] + 1); if (x > 0) v = Math.min(v, h[(y + 1) * W1 + x - 1] + 1); }
        h[y * W1 + x] = v;
      }
    }
    // smooth out lone single-tile pits/spikes so the terrain reads as land, not noise
    for (let it = 0; it < 2; it++) {
      for (let y = 1; y < H; y++) for (let x = 1; x < W; x++) {
        const i = y * W1 + x, v = h[i];
        const ns = [h[i - 1], h[i + 1], h[i - W1], h[i + W1]];
        if (ns.every(n => n > v)) h[i] = v + 1; else if (ns.every(n => n < v)) h[i] = v - 1;
      }
    }
    // water: flat sea-level tiles
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const t = y * W + x;
      if (map.tileMax(x, y) === 0) { map.type[t] = T.WATER; map.owner[t] = HL.OWNER_WATER; }
    }
    map.snowline = 255;
  };

  HL.genGround = function (map, o, rng) {
    const W = map.W, H = map.H;
    const seed = HL.hashSeed(o.seed + 'g');
    const nz = new HL.Noise(seed), nm = new HL.Noise(seed ^ 0x1234567);
    // snowline at the 55th percentile of land height in the north
    if (o.climate === 'arctic') {
      const hs = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (map.type[y * W + x] !== T.WATER) hs.push(map.tileMax(x, y));
      hs.sort((a, b) => a - b);
      map.snowline = Math.max(2, hs[Math.floor(hs.length * 0.5)] || 3);
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const t = y * W + x;
      if (map.type[t] === T.WATER) continue;
      const g = nz.fbm(x / 9, y / 9, 3, 2, 0.5);
      let kind = GR.GRASS, dens = 3;
      if (g > 0.32) kind = GR.ROUGH;
      else if (g < -0.35) dens = 1 + (HL.hash2(x, y, 3) * 2 | 0);
      const sl = map.slope(x, y);
      if (sl && map.tileMax(x, y) > 8 && nz.n2(x / 5 + 9, y / 5) > 0.28) kind = GR.ROCKS;
      if (map.tileMin(x, y) === 0 && map.isCoast(x, y)) kind = GR.BEACH;
      if (o.climate === 'desert') {
        const m = nm.fbm(x / 28, y / 28, 3, 2, 0.5) + (map.tileMax(x, y) > 5 ? 0.15 : 0);
        if (m < 0.07) { map.zone[t] = 1; if (kind !== GR.ROCKS) kind = GR.SAND; }
        else if (m > 0.3) map.zone[t] = 2;
      }
      map.ground[t] = kind; map.gdens[t] = dens;
    }
  };

  // species appropriate for a tile
  HL.pickTree = function (map, climate, x, y, r) {
    const t = map.t(x, y), hgt = map.tileMax(x, y);
    if (climate === 'arctic') return r < 0.5 ? 5 : r < 0.8 ? 6 : r < 0.93 ? 7 : 13;
    if (climate === 'desert') {
      if (map.zone[t] === 1) return r < 0.6 ? 9 : r < 0.85 ? 12 : 8;
      if (map.zone[t] === 2) return r < 0.55 ? 10 : r < 0.85 ? 11 : 8;
      return r < 0.4 ? 12 : r < 0.7 ? 8 : 11;
    }
    if (hgt > 9) return r < 0.6 ? 3 : 2;
    return r < 0.35 ? 0 : r < 0.6 ? 1 : r < 0.75 ? 2 : r < 0.88 ? 4 : 3;
  };

  HL.genTrees = function (map, o, rng) {
    const W = map.W, H = map.H;
    const nz = new HL.Noise(HL.hashSeed(o.seed + 't'));
    const dens = [0.1, 0.2, 0.3, 0.45][o.trees];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const t = y * W + x;
      if (map.type[t] !== T.CLEAR) continue;
      if (map.ground[t] === GR.BEACH || map.ground[t] === GR.ROCKS) continue;
      let f = nz.fbm(x / 13, y / 13, 4, 2, 0.55) * 1.4 + 0.5 - (1 - dens * 2) * 0.4;
      if (o.climate === 'desert' && map.zone[t] === 1) f = f * 0.35 - 0.05;
      if (o.climate === 'desert' && map.zone[t] === 2) f += 0.25;
      const r = HL.hash2(x, y, 11);
      let n = 0;
      if (f > 0.55) n = 2 + (r * 3 | 0);
      else if (f > 0.45) n = 1 + (r * 2 | 0);
      else if (r < dens * 0.08) n = 1;
      if (n) {
        // same species clumps
        const sr = HL.clamp((nz.n2(x / 6 + 40, y / 6) + 0.5), 0, 0.999);
        map.trees[t] = Math.min(4, n) | (3 << 3);
        map.tspec[t] = HL.pickTree(map, o.climate, x, y, sr);
      }
    }
  };

  // full world. Returns map; towns/industries go into game state g.
  HL.generateWorld = function (g, o) {
    const rng = new HL.RNG(HL.hashSeed(o.seed + 'w'));
    const map = new HL.GameMap(o.w, o.h);
    g.map = map;
    HL.genTerrain(map, o, rng);
    HL.genGround(map, o, rng);
    HL.genTrees(map, o, rng);
    HL.Towns.generate(g, o, rng);
    HL.Ind.generate(g, o, rng);
    map.dirty.clear();
    return map;
  };
})(typeof window !== 'undefined' ? window : globalThis);
