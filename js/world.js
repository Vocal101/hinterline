// World map: corner heightmap + per-tile layers in typed arrays.
// Tile corners: N=(x,y) top, E=(x+1,y) right, S=(x+1,y+1) bottom, W=(x,y+1) left on screen.
(function (root) {
  const HL = root.HL;

  const T = HL.T = { CLEAR: 0, WATER: 1, RAIL: 2, ROAD: 3, HOUSE: 4, IND: 5, STATION: 6, DEPOT: 7, OBJECT: 8 };
  HL.OWNER_NONE = 255; HL.OWNER_TOWN = 254; HL.OWNER_WATER = 253;
  // ground kinds
  const GR = HL.GR = { GRASS: 0, ROUGH: 1, ROCKS: 2, FIELD: 3, DIRT: 4, SAND: 5, BEACH: 6 };
  // tree species
  HL.TREES = [
    { name: 'Oak', kind: 'broad', climate: 'temperate' },
    { name: 'Beech', kind: 'broad', climate: 'temperate' },
    { name: 'Birch', kind: 'birch', climate: 'temperate' },
    { name: 'Scots Pine', kind: 'pine', climate: 'temperate' },
    { name: 'Poplar', kind: 'poplar', climate: 'temperate' },
    { name: 'Spruce', kind: 'spruce', climate: 'arctic' },
    { name: 'Fir', kind: 'pine', climate: 'arctic' },
    { name: 'Larch', kind: 'larch', climate: 'arctic' },
    { name: 'Date Palm', kind: 'palm', climate: 'desert' },
    { name: 'Cactus', kind: 'cactus', climate: 'desert' },
    { name: 'Kapok', kind: 'jungle', climate: 'desert' },
    { name: 'Fan Palm', kind: 'fanpalm', climate: 'desert' },
    { name: 'Acacia', kind: 'acacia', climate: 'desert' },
    { name: 'Rowan', kind: 'broad', climate: 'arctic' },
  ];

  class GameMap {
    constructor(W, H) {
      this.W = W; this.H = H;
      const n = W * H;
      this.h = new Uint8Array((W + 1) * (H + 1));
      this.type = new Uint8Array(n);
      this.owner = new Uint8Array(n).fill(HL.OWNER_NONE);
      this.ground = new Uint8Array(n);      // GR kind
      this.gdens = new Uint8Array(n);       // ground detail: grass density 0-3, field crop, etc.
      this.trees = new Uint8Array(n);       // low 3 bits count (0-4), bits 3-4 growth stage
      this.tspec = new Uint8Array(n);       // species index
      this.rail = new Uint8Array(n);        // track piece bits
      this.rtype = new Uint8Array(n);       // rail type
      this.road = new Uint8Array(n);        // road bits (1<<dir)
      this.rowner = new Uint8Array(n).fill(HL.OWNER_NONE); // road owner (level crossings / company roads)
      this.idx = new Int32Array(n).fill(-1); // station / industry / town / depot / object id
      this.m1 = new Uint16Array(n);         // misc 1: house kind, station part, depot dir, industry part
      this.m2 = new Uint16Array(n);         // misc 2: build stage, age, animation seed
      this.zone = new Uint8Array(n);        // 0 normal, 1 desert, 2 rainforest
      this.bridgeOver = new Int32Array(n).fill(-1);
      this.version = 0;                     // bumps on every change (renderer cache)
      this.dirty = new Set();               // tiles changed since renderer last looked
    }
    inside(x, y) { return x >= 0 && y >= 0 && x < this.W && y < this.H; }
    t(x, y) { return y * this.W + x; }
    tx(t) { return t % this.W; }
    ty(t) { return (t / this.W) | 0; }
    ch(x, y) { return this.h[y * (this.W + 1) + x]; }
    setCh(x, y, v) { this.h[y * (this.W + 1) + x] = v; }
    // corner heights of tile [N,E,S,W]
    corners(x, y) { const w = this.W + 1, i = y * w + x; return [this.h[i], this.h[i + 1], this.h[i + w + 1], this.h[i + w]]; }
    tileMin(x, y) { const c = this.corners(x, y); return Math.min(c[0], c[1], c[2], c[3]); }
    tileMax(x, y) { const c = this.corners(x, y); return Math.max(c[0], c[1], c[2], c[3]); }
    isFlat(x, y) { const c = this.corners(x, y); return c[0] === c[1] && c[1] === c[2] && c[2] === c[3]; }
    // slope bits relative to min corner: 1 N, 2 E, 4 S, 8 W
    slope(x, y) {
      const c = this.corners(x, y), m = Math.min(c[0], c[1], c[2], c[3]);
      return (c[0] > m ? 1 : 0) | (c[1] > m ? 2 : 0) | (c[2] > m ? 4 : 0) | (c[3] > m ? 8 : 0);
    }
    // inclined slope along a direction: returns dir it rises toward (0..3) or -1
    inclineDir(x, y) {
      const s = this.slope(x, y);
      // rises toward NE: N and E high (1|2)
      if (s === 3) return 0; if (s === 6) return 1; if (s === 12) return 2; if (s === 9) return 3;
      return -1;
    }
    // terrain height (in levels) at fractional world coords using a 4-triangle split around the tile centre
    heightAt(fx, fy) {
      let x = Math.floor(fx), y = Math.floor(fy);
      if (x < 0) x = 0; if (y < 0) y = 0; if (x >= this.W) x = this.W - 1; if (y >= this.H) y = this.H - 1;
      const u = HL.clamp(fx - x, 0, 1), v = HL.clamp(fy - y, 0, 1);
      const c = this.corners(x, y);
      const hc = (c[0] + c[1] + c[2] + c[3]) / 4;
      // which triangle: compare against diagonals
      const a = u - v, b = u + v - 1;
      // N(0,0) E(1,0) S(1,1) W(0,1) C(.5,.5)
      if (a >= 0 && b < 0) return tri(u, v, 0, 0, c[0], 1, 0, c[1], hc);      // N-E-C (top)
      if (a >= 0 && b >= 0) return tri(u, v, 1, 0, c[1], 1, 1, c[2], hc);     // E-S-C (right)
      if (a < 0 && b >= 0) return tri(u, v, 1, 1, c[2], 0, 1, c[3], hc);      // S-W-C (bottom)
      return tri(u, v, 0, 1, c[3], 0, 0, c[0], hc);                           // W-N-C (left)
    }
    edgeMidH(x, y, e) {
      const c = this.corners(x, y);
      // edge e connects corners: NE: N,E  SE: E,S  SW: S,W  NW: W,N
      const a = c[e], b = c[(e + 1) & 3];
      return (a + b) / 2;
    }
    mark(t) { this.dirty.add(t); this.version++; }
    markArea(x0, y0, x1, y1) {
      for (let y = Math.max(0, y0); y <= Math.min(this.H - 1, y1); y++)
        for (let x = Math.max(0, x0); x <= Math.min(this.W - 1, x1); x++) this.dirty.add(y * this.W + x);
      this.version++;
    }
    isWater(t) { return this.type[t] === T.WATER; }
    // coast: land tile touching sea level next to water
    isCoast(x, y) {
      if (!this.inside(x, y)) return false;
      const t = this.t(x, y);
      if (this.type[t] === T.WATER) return false;
      if (this.tileMin(x, y) > 0) return false;
      for (let d = 0; d < 4; d++) { const nx = x + HL.DX[d], ny = y + HL.DY[d]; if (this.inside(nx, ny) && this.type[this.t(nx, ny)] === T.WATER) return true; }
      for (const [dx, dy] of [[1, 1], [-1, -1], [1, -1], [-1, 1]]) { const nx = x + dx, ny = y + dy; if (this.inside(nx, ny) && this.type[this.t(nx, ny)] === T.WATER) return true; }
      return false;
    }
    hasRoad(t) { return this.road[t] !== 0 && (this.type[t] === T.ROAD || this.type[t] === T.RAIL || (this.type[t] === T.STATION) || this.type[t] === T.DEPOT); }
    treeCount(t) { return this.trees[t] & 7; }
    setTrees(t, n, spec, stage) { this.trees[t] = (n & 7) | ((stage || 0) << 3); if (spec != null) this.tspec[t] = spec; this.mark(t); }
  }
  function tri(u, v, x1, y1, h1, x2, y2, h2, hc) {
    // barycentric on triangle (x1,y1,h1),(x2,y2,h2),(0.5,0.5,hc)
    const x3 = 0.5, y3 = 0.5;
    const det = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3);
    const l1 = ((y2 - y3) * (u - x3) + (x3 - x2) * (v - y3)) / det;
    const l2 = ((y3 - y1) * (u - x3) + (x1 - x3) * (v - y3)) / det;
    return l1 * h1 + l2 * h2 + (1 - l1 - l2) * hc;
  }
  HL.GameMap = GameMap;

  // ---------- terraforming ----------
  // Returns {ok, cost, corners:[[x,y,newH]], tiles:Set, err}. Does not apply.
  HL.planTerraform = function (map, cx, cy, delta, maxH) {
    maxH = maxH || 30;
    const W1 = map.W + 1;
    const changes = new Map();
    const get = (x, y) => { const k = y * W1 + x; return changes.has(k) ? changes.get(k) : map.h[k]; };
    const stack = [[cx, cy, get(cx, cy) + delta]];
    let err = null;
    while (stack.length) {
      const [x, y, nh] = stack.pop();
      if (x < 0 || y < 0 || x > map.W || y > map.H) continue;
      const cur = get(x, y);
      if (delta > 0 ? nh <= cur : nh >= cur) continue;
      if (nh < 0) { err = 'Already at sea level'; break; }
      if (nh > maxH) { err = 'Too high'; break; }
      // map edges stay at sea level so the sea can wrap the world
      if ((x === 0 || y === 0 || x === map.W || y === map.H) && nh !== 0) { err = 'Too close to edge of map'; break; }
      changes.set(y * W1 + x, nh);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx > map.W || ny > map.H) continue;
        const v = get(nx, ny);
        if (delta > 0 && v < nh - 1) stack.push([nx, ny, nh - 1]);
        if (delta < 0 && v > nh + 1) stack.push([nx, ny, nh + 1]);
      }
      if (changes.size > 4000) { err = 'Area too large'; break; }
    }
    const tiles = new Set();
    const corners = [];
    for (const [k, v] of changes) {
      const x = k % W1, y = (k / W1) | 0;
      corners.push([x, y, v]);
      for (const [tx, ty] of [[x - 1, y - 1], [x, y - 1], [x - 1, y], [x, y]]) if (map.inside(tx, ty)) tiles.add(map.t(tx, ty));
    }
    return { ok: !err, err, corners, tiles, cost: corners.length };
  };
  HL.applyTerraform = function (map, plan) {
    for (const [x, y, v] of plan.corners) map.setCh(x, y, v);
    for (const t of plan.tiles) {
      const x = map.tx(t), y = map.ty(t);
      map.mark(t);
      // neighbouring tiles' shading changes too
      map.markArea(x - 1, y - 1, x + 1, y + 1);
      if (map.type[t] === T.WATER && map.tileMax(x, y) > 0) { map.type[t] = T.CLEAR; map.owner[t] = HL.OWNER_NONE; map.ground[t] = GR.BEACH; map.gdens[t] = 0; }
    }
    HL.floodFrom(map, plan.tiles);
  };
  // sea-level flat tiles next to the sea fill with water
  HL.floodFrom = function (map, tiles) {
    const q = [];
    for (const t of tiles) q.push(t);
    let guard = 0;
    while (q.length && guard++ < 100000) {
      const t = q.pop();
      const x = map.tx(t), y = map.ty(t);
      if (map.type[t] !== T.CLEAR || map.tileMax(x, y) !== 0) continue;
      let wet = false;
      for (let d = 0; d < 4; d++) { const nx = x + HL.DX[d], ny = y + HL.DY[d]; if (!map.inside(nx, ny) || map.type[map.t(nx, ny)] === T.WATER) { wet = true; break; } }
      if (!wet) continue;
      map.type[t] = T.WATER; map.owner[t] = HL.OWNER_WATER; map.trees[t] = 0; map.mark(t);
      for (let d = 0; d < 4; d++) { const nx = x + HL.DX[d], ny = y + HL.DY[d]; if (map.inside(nx, ny)) q.push(map.t(nx, ny)); }
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
