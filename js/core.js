// Core: namespace, seeded RNG, noise, direction tables, calendar and money formatting.
// Everything outside the gfx_/ui_/render files is DOM-free so the same simulation runs in Node (sim/).
(function (root) {
  const HL = root.HL = root.HL || {};
  HL.VERSION = '1.0.0';

  // ---------- seeded RNG (mulberry32; one uint32 of state so it saves trivially) ----------
  class RNG {
    constructor(seed) { this.s = (seed >>> 0) || 1; }
    next() {
      let t = (this.s = (this.s + 0x6D2B79F5) >>> 0);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    int(n) { return Math.floor(this.next() * n); }
    range(a, b) { return a + Math.floor(this.next() * (b - a + 1)); }
    float(a, b) { return a + this.next() * (b - a); }
    chance(p) { return this.next() < p; }
    pick(arr) { return arr.length ? arr[Math.floor(this.next() * arr.length)] : undefined; }
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(this.next() * (i + 1)); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
      return arr;
    }
    weighted(list) {
      let tot = 0; for (const [, w] of list) tot += w;
      let r = this.next() * tot;
      for (const [it, w] of list) { if ((r -= w) < 0) return it; }
      return list.length ? list[list.length - 1][0] : undefined;
    }
  }
  HL.RNG = RNG;

  HL.hashSeed = function (str) {
    str = String(str).toUpperCase().trim();
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995) >>> 0; h ^= h >>> 15;
    return h >>> 0 || 1;
  };
  // cheap stateless hash of integers -> [0,1)
  HL.hash2 = function (a, b, c) {
    let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul((c | 0) + 1, 2246822519);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  const SEED_CHARS = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  HL.randomSeedString = function (rnd) {
    rnd = rnd || Math.random;
    let s = ''; for (let i = 0; i < 7; i++) s += SEED_CHARS[Math.floor(rnd() * SEED_CHARS.length)];
    return s;
  };

  // ---------- gradient noise ----------
  class Noise {
    constructor(seed) {
      const r = new RNG(seed);
      this.p = new Uint8Array(512);
      const perm = []; for (let i = 0; i < 256; i++) perm.push(i);
      r.shuffle(perm);
      for (let i = 0; i < 512; i++) this.p[i] = perm[i & 255];
    }
    grad(h, x, y) { const g = h & 7; const u = g < 4 ? x : y, v = g < 4 ? y : x; return ((g & 1) ? -u : u) + ((g & 2) ? -2 * v : 2 * v); }
    n2(x, y) {
      const X = Math.floor(x), Y = Math.floor(y);
      const xf = x - X, yf = y - Y, p = this.p;
      const xi = X & 255, yi = Y & 255;
      const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10), v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
      const aa = p[p[xi] + yi], ab = p[p[xi] + yi + 1], ba = p[p[xi + 1] + yi], bb = p[p[xi + 1] + yi + 1];
      const x1 = this.grad(aa, xf, yf) + u * (this.grad(ba, xf - 1, yf) - this.grad(aa, xf, yf));
      const x2 = this.grad(ab, xf, yf - 1) + u * (this.grad(bb, xf - 1, yf - 1) - this.grad(ab, xf, yf - 1));
      return (x1 + v * (x2 - x1)) * 0.36;
    }
    fbm(x, y, oct, lac, gain) {
      let a = 1, f = 1, s = 0, n = 0;
      for (let i = 0; i < oct; i++) { s += a * this.n2(x * f, y * f); n += a; a *= gain || 0.5; f *= lac || 2; }
      return s / n;
    }
  }
  HL.Noise = Noise;

  // ---------- helpers ----------
  HL.clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  HL.lerp = (a, b, t) => a + (b - a) * t;
  HL.smooth = t => t * t * (3 - 2 * t);
  HL.dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  HL.manh = (ax, ay, bx, by) => Math.abs(ax - bx) + Math.abs(ay - by);

  // ---------- directions ----------
  // DiagDir: 0 NE (y-1), 1 SE (x+1), 2 SW (y+1), 3 NW (x-1). Named by where they point on screen.
  HL.DX = [0, 1, 0, -1];
  HL.DY = [-1, 0, 1, 0];
  HL.opp = d => (d + 2) & 3;
  HL.DIRNAME = ['NE', 'SE', 'SW', 'NW'];
  // axis of a direction: 0 = x axis (SE/NW), 1 = y axis (NE/SW)
  HL.axisOf = d => (d & 1) ? 0 : 1;

  // Track pieces: 0 X (NW-SE), 1 Y (NE-SW), 2 N corner (NW-NE), 3 E (NE-SE), 4 S (SE-SW), 5 W (SW-NW)
  HL.PIECE_EDGES = [[3, 1], [0, 2], [3, 0], [0, 1], [1, 2], [2, 3]];
  // edge midpoints in tile-local (u along x, v along y) for edge index = direction you leave by
  HL.EDGE_MID = [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]];
  // piece from two edges
  HL.pieceFor = function (e1, e2) {
    for (let p = 0; p < 6; p++) { const E = HL.PIECE_EDGES[p]; if ((E[0] === e1 && E[1] === e2) || (E[0] === e2 && E[1] === e1)) return p; }
    return -1;
  };
  // pieces that can coexist on one tile without crossing each other
  HL.pieceConflict = function (a, b) {
    if (a === b) return false;
    if ((a === 2 && b === 4) || (a === 4 && b === 2) || (a === 3 && b === 5) || (a === 5 && b === 3)) return false;
    return true;
  };

  // ---------- calendar (365-day years, no leap years) ----------
  HL.MDAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  HL.MNAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  HL.MLONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  HL.TICKS_PER_DAY = 60;
  HL.LEVEL = 8 / 39.19; // model units per terrain height level
  HL.dateFromYear = y => y * 365;
  HL.ymd = function (date) {
    const y = Math.floor(date / 365); let d = date - y * 365, m = 0;
    while (d >= HL.MDAYS[m]) { d -= HL.MDAYS[m]; m++; }
    return { y, m, d: d + 1 };
  };
  HL.fmtDate = function (date, long) {
    const t = HL.ymd(date);
    return long ? `${t.d} ${HL.MLONG[t.m]} ${t.y}` : `${t.d} ${HL.MNAMES[t.m]} ${t.y}`;
  };

  // ---------- money ----------
  HL.CURRENCY = '£';
  HL.fmtMoney = function (v, short) {
    const neg = v < 0; v = Math.abs(Math.round(v));
    let s;
    if (short && v >= 1e9) s = (v / 1e9).toFixed(v >= 1e10 ? 1 : 2) + 'bn';
    else if (short && v >= 1e6) s = (v / 1e6).toFixed(v >= 1e7 ? 1 : 2) + 'm';
    else if (short && v >= 1e4) s = Math.round(v / 1e3) + 'k';
    else s = v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (neg ? '-' : '') + HL.CURRENCY + s;
  };
  HL.fmtInt = v => Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  // simple id allocator over an array with holes (null = free)
  HL.alloc = function (arr, obj) {
    for (let i = 0; i < arr.length; i++) if (!arr[i]) { obj.id = i; arr[i] = obj; return obj; }
    obj.id = arr.length; arr.push(obj); return obj;
  };

  // event hooks the UI subscribes to (news, sounds, tile changes). Sim code calls HL.emit.
  const hooks = {};
  HL.on = (ev, fn) => { (hooks[ev] = hooks[ev] || []).push(fn); };
  HL.emit = (ev, a, b, c) => { const h = hooks[ev]; if (h) for (const fn of h) fn(a, b, c); };
  HL.clearHooks = () => { for (const k in hooks) delete hooks[k]; };
})(typeof window !== 'undefined' ? window : globalThis);
