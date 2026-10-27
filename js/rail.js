// Railway operations: track graph, signal blocks, path reservations, routing and train movement.
// A train's position is a list of track segments (tail -> head) plus the head's distance into the last one.
(function (root) {
  const HL = root.HL;
  const T = HL.T;
  const Rail = HL.Rail = {};
  const V = () => HL.Veh;
  const PE = HL.PIECE_EDGES, EM = HL.EDGE_MID, DX = HL.DX, DY = HL.DY;
  const SQ = Math.SQRT1_2;
  const TPD = HL.TICKS_PER_DAY;
  const K = 1 / (28 * TPD); // tiles per tick per km/h
  const BRAKE = 1.1;        // km/h per tick

  // ---------- state arrays ----------
  Rail.ensure = function (g) {
    const n = g.map.W * g.map.H * 6;
    if (!g.occ || g.occ.length !== n) {
      g.occ = new Uint8Array(n); g.res = new Int32Array(n); g.blk = new Int32Array(n).fill(-1);
      g.blockOcc = new Int32Array(16); g.blockClaim = new Int32Array(16); g.blockRes = new Int32Array(16);
      g.crossClose = new Map();
      g.blocksDirty = true;
      // rebuild occupancy from trains on the map
      for (const v of g.vehicles) if (v && v.kind === 'rail' && v.path && !v.inDepot) for (const s of v.path) g.occ[key(g, s)]++;
      for (const v of g.vehicles) if (v && v.kind === 'rail' && v.reserved) for (const k of v.reserved) g.res[k] = v.id + 1;
    }
    if (g.blocksDirty) Rail.buildBlocks(g);
  };
  const key = (g, s) => s.k === 1 || s.k === 2 ? g[s.k === 1 ? 'bridges' : 'tunnels'][s.br].a * 6 + s.p : s.t * 6 + s.p;
  Rail.key = key;
  Rail.segLen = s => s.k === 1 || s.k === 2 ? s.len : s.p < 2 ? 1 : SQ;
  const segLen = Rail.segLen;
  Rail.entry = s => PE[s.p][s.d];
  Rail.exit = s => PE[s.p][1 - s.d];

  // compatibility of a train with a rail type
  Rail.needRt = function (v) {
    let need = 0;
    for (const c of v.cars) { const r = HL.VEH[c.model].rt; if (r > need) need = r; }
    return need;
  };
  Rail.canRun = (need, rt) => need === rt || (need === 0 && rt === 1);

  // ---------- graph ----------
  // segments available on tile t when entering through edge en
  Rail.options = function (g, v, t, en, out) {
    out = out || [];
    const m = g.map, ty = m.type[t];
    const owner = v ? v.owner : m.owner[t];
    const need = v ? v.need : 0;
    if (ty === T.RAIL) {
      if (m.owner[t] !== owner || !Rail.canRun(need, m.rtype[t])) return out;
      const head = m.m1[t] & 0xC000;
      if (head) {
        const bt = (head & 0x8000) ? g.bridges[m.idx[t]] : g.tunnels[m.idx[t]];
        if (!bt) return out;
        const inner = t === bt.a ? bt.dir : HL.opp(bt.dir);
        if (en === inner) return out;
      }
      const bits = m.rail[t];
      for (let p = 0; p < 6; p++) {
        if (!(bits & (1 << p))) continue;
        const E = PE[p];
        const d = E[0] === en ? 0 : E[1] === en ? 1 : -1;
        if (d < 0) continue;
        const sig = g.signals.get(t * 6 + p);
        if (sig && sig.type === 2 && sig.dir !== d) continue; // one-way path signal from behind
        out.push({ k: 0, t, p, d });
      }
      return out;
    }
    if (ty === T.STATION) {
      if ((m.m1[t] & 7) !== 0 || m.owner[t] !== owner || !Rail.canRun(need, m.rtype[t])) return out;
      const p = (m.m1[t] >> 3) & 1 ? 1 : 0;
      const E = PE[p];
      const d = E[0] === en ? 0 : E[1] === en ? 1 : -1;
      if (d >= 0) out.push({ k: 0, t, p, d });
      return out;
    }
    if (ty === T.DEPOT) {
      const dp = g.depots[m.idx[t]];
      if (!dp || dp.kind !== 0 || dp.owner !== owner || !Rail.canRun(need, dp.rt)) return out;
      if (en !== dp.dir) return out;
      const p = (dp.dir & 1) ? 0 : 1;
      out.push({ k: 3, t, p, d: PE[p][0] === en ? 0 : 1 });
    }
    return out;
  };
  // segments that can follow seg
  Rail.next = function (g, v, s, out) {
    out = out || [];
    const m = g.map;
    if (s.k === 1 || s.k === 2) {
      const bt = s.k === 1 ? g.bridges[s.br] : g.tunnels[s.br];
      if (!bt) return out;
      const tb = s.d === 0 ? bt.b : bt.a;
      const inner = tb === bt.b ? HL.opp(bt.dir) : bt.dir;
      const p = s.p;
      out.push({ k: 0, t: tb, p, d: PE[p][0] === inner ? 0 : 1 });
      return out;
    }
    const e = Rail.exit(s);
    if (s.k === 3) {
      // leaving the depot (entering seg leads into the depot: nothing follows)
      const dp = g.depots[m.idx[s.t]];
      if (!dp || e !== dp.dir) return out;
    }
    if (s.k === 0 && (m.m1[s.t] & 0xC000) && (m.type[s.t] === T.RAIL)) {
      const isB = !!(m.m1[s.t] & 0x8000);
      const bt = isB ? g.bridges[m.idx[s.t]] : g.tunnels[m.idx[s.t]];
      if (bt) {
        const inner = s.t === bt.a ? bt.dir : HL.opp(bt.dir);
        if (e === inner) { out.push({ k: isB ? 1 : 2, br: bt.id, t: bt.a, p: s.p, d: s.t === bt.a ? 0 : 1, len: bt.len }); return out; }
      }
    }
    const x = m.tx(s.t) + DX[e], y = m.ty(s.t) + DY[e];
    if (!m.inside(x, y)) return out;
    return Rail.options(g, v, m.t(x, y), HL.opp(e), out);
  };
  Rail.flip = s => Object.assign({}, s, { d: 1 - s.d });
  const sameSeg = (a, b) => a.k === b.k && a.t === b.t && a.p === b.p && a.d === b.d && (a.br === b.br || a.k === 0 || a.k === 3);

  // ---------- geometry ----------
  // world position of point at distance s along seg: [x, y, zLevels, yaw, hidden, onBridge]
  Rail.pos = function (g, sg, s) {
    const m = g.map;
    if (sg.k === 1 || sg.k === 2) {
      const bt = sg.k === 1 ? g.bridges[sg.br] : g.tunnels[sg.br];
      const ta = sg.d === 0 ? bt.a : bt.b, tb = sg.d === 0 ? bt.b : bt.a;
      const outDir = sg.d === 0 ? bt.dir : HL.opp(bt.dir);
      const ea = EM[outDir], eb = EM[HL.opp(outDir)];
      const ax = m.tx(ta) + ea[0], ay = m.ty(ta) + ea[1], bx = m.tx(tb) + eb[0], by = m.ty(tb) + eb[1];
      const f = s / sg.len;
      return [ax + (bx - ax) * f, ay + (by - ay) * f, bt.h, Math.atan2(by - ay, bx - ax), sg.k === 2, sg.k === 1 ? bt.id : -1];
    }
    const a = EM[PE[sg.p][sg.d]], b = EM[PE[sg.p][1 - sg.d]];
    const L = segLen(sg), f = s / L;
    const tx = m.tx(sg.t), ty = m.ty(sg.t);
    const x = tx + a[0] + (b[0] - a[0]) * f, y = ty + a[1] + (b[1] - a[1]) * f;
    let hid = false;
    if (sg.k === 3) { const dp = g.depots[m.idx[sg.t]]; const leaving = dp && PE[sg.p][sg.d] !== dp.dir; hid = leaving ? s < 0.62 : s > 0.38; }
    return [x, y, Rail.zAt(g, sg.t, x, y), Math.atan2(b[1] - a[1], b[0] - a[0]), hid, -1];
  };
  Rail.zAt = function (g, t, x, y) {
    const m = g.map, ty = m.type[t];
    if (ty === T.STATION || ty === T.DEPOT) return m.tileMax(m.tx(t), m.ty(t));
    if (ty === T.RAIL && (m.m1[t] & 0x8000)) {
      const br = g.bridges[m.idx[t]];
      if (br) {
        const inner = t === br.a ? br.dir : HL.opp(br.dir);
        const tx = m.tx(t), ty2 = m.ty(t);
        // fraction from outer edge (0) to inner edge (1)
        const u = x - tx, v = y - ty2;
        const f = inner === 1 ? u : inner === 3 ? 1 - u : inner === 2 ? v : 1 - v;
        const hOut = m.edgeMidH(tx, ty2, HL.opp(inner));
        return hOut + (br.h - hOut) * HL.clamp(f, 0, 1);
      }
    }
    return m.heightAt(x, y);
  };
  const yawOf = s => { const a = EM[PE[s.p][s.d]], b = EM[PE[s.p][1 - s.d]]; return Math.atan2(b[1] - a[1], b[0] - a[0]); };
  Rail.yawOf = yawOf;
  function turnAngle(a, b) {
    let d = Math.abs(yawOf(a) - yawOf(b));
    if (d > Math.PI) d = 2 * Math.PI - d;
    return d;
  }

  // ---------- blocks ----------
  function boundaryAt(g, t, p, e) {
    const sig = g.signals.get(t * 6 + p);
    if (!sig) return false;
    const be = sig.dir === 2 ? PE[p][0] : PE[p][sig.dir];
    return be === e;
  }
  function piecesOn(g, t) {
    const m = g.map, ty = m.type[t];
    if (ty === T.RAIL) return m.rail[t];
    if (ty === T.STATION && (m.m1[t] & 7) === 0) return ((m.m1[t] >> 3) & 1) ? 2 : 1;
    if (ty === T.DEPOT) { const d = g.depots[m.idx[t]]; if (d && d.kind === 0) return (d.dir & 1) ? 1 : 2; }
    return 0;
  }
  Rail.piecesOn = piecesOn;
  Rail.buildBlocks = function (g) {
    const m = g.map, n = m.W * m.H;
    g.blk.fill(-1);
    let id = 0;
    const st = [];
    for (let t = 0; t < n; t++) {
      const pcs = piecesOn(g, t);
      if (!pcs) continue;
      for (let p = 0; p < 6; p++) {
        if (!(pcs & (1 << p)) || g.blk[t * 6 + p] >= 0) continue;
        g.blk[t * 6 + p] = id; st.push(t * 6 + p);
        while (st.length) {
          const kk = st.pop(), tt = (kk / 6) | 0, pp = kk % 6;
          const pc = piecesOn(g, tt);
          // pieces on the same tile that touch or cross
          for (let q = 0; q < 6; q++) if (q !== pp && (pc & (1 << q)) && HL.pieceConflict(pp, q) && g.blk[tt * 6 + q] < 0) { g.blk[tt * 6 + q] = id; st.push(tt * 6 + q); }
          for (const e of PE[pp]) {
            if (boundaryAt(g, tt, pp, e)) continue;
            let nt = -1;
            if (m.type[tt] === T.RAIL && (m.m1[tt] & 0xC000)) {
              const bt = (m.m1[tt] & 0x8000) ? g.bridges[m.idx[tt]] : g.tunnels[m.idx[tt]];
              if (bt) { const inner = tt === bt.a ? bt.dir : HL.opp(bt.dir); if (e === inner) { const o = tt === bt.a ? bt.b : bt.a; const k2 = o * 6 + pp; if (g.blk[k2] < 0 && (piecesOn(g, o) & (1 << pp))) { g.blk[k2] = id; st.push(k2); } continue; } }
            }
            const x = m.tx(tt) + DX[e], y = m.ty(tt) + DY[e];
            if (!m.inside(x, y)) continue;
            nt = m.t(x, y);
            if (m.owner[nt] !== m.owner[tt]) continue;
            const npc = piecesOn(g, nt);
            if (!npc) continue;
            const en = HL.opp(e);
            for (let q = 0; q < 6; q++) {
              if (!(npc & (1 << q)) || (PE[q][0] !== en && PE[q][1] !== en)) continue;
              if (boundaryAt(g, nt, q, en)) continue;
              const k2 = nt * 6 + q;
              if (g.blk[k2] < 0) { g.blk[k2] = id; st.push(k2); }
            }
          }
        }
        id++;
      }
    }
    g.nBlocks = id;
    if (g.blockOcc.length < id + 1) { g.blockOcc = new Int32Array(id + 64); g.blockClaim = new Int32Array(id + 64); g.blockRes = new Int32Array(id + 64); }
    else { g.blockOcc.fill(0); g.blockClaim.fill(0); g.blockRes.fill(0); }
    for (let k = 0; k < g.occ.length; k++) {
      if (g.occ[k] && g.blk[k] >= 0) g.blockOcc[g.blk[k]] += g.occ[k];
      if (g.res[k] && g.blk[k] >= 0) g.blockRes[g.blk[k]]++;
    }
    for (const v of g.vehicles) if (v && v.claims) v.claims = [];
    g.blocksDirty = false;
  };
  function occAdd(g, k, d) { g.occ[k] += d; const b = g.blk[k]; if (b >= 0) g.blockOcc[b] += d; }
  function resSet(g, k, val) {
    const b = g.blk[k];
    if (g.res[k] && !val && b >= 0) g.blockRes[b]--;
    if (!g.res[k] && val && b >= 0) g.blockRes[b]++;
    g.res[k] = val;
  }
  // a block is enterable by v if empty and not claimed or reserved by others
  function blockFree(g, v, b) {
    if (b < 0) return true;
    if (g.blockOcc[b] > 0) return false;
    if (g.blockClaim[b] && g.blockClaim[b] !== v.id + 1) return false;
    if (g.blockRes[b] > 0) {
      // reserved pieces that are all ours are fine
      let mine = 0; for (const k of v.reserved || []) if (g.blk[k] === b) mine++;
      if (g.blockRes[b] > mine) return false;
    }
    return true;
  }
  // signal facing a train crossing from seg a into seg b
  Rail.facingSignal = function (g, a, b) {
    if (b.k === 0) {
      const sig = g.signals.get(b.t * 6 + b.p);
      if (sig && (sig.dir === b.d || (sig.dir === 2 && b.d === 0))) return sig;
    }
    if (a && a.k === 0) {
      const sig = g.signals.get(a.t * 6 + a.p);
      if (sig && sig.dir === 2 && a.d === 1) return sig;
    }
    return null;
  };
  Rail.signalGreen = function (g, t, p, df) {
    if (!g.blk) return true;
    const sig = g.signals.get(t * 6 + p);
    if (!sig) return true;
    const k = t * 6 + p;
    if (sig.type === 0) {
      // the block beyond: for a signal at the entry edge of p that is p's own block; for dir 2 seen from the other side it's the neighbour
      let b = g.blk[k];
      if (sig.dir === 2 && df === 1) {
        const m = g.map, e = PE[p][0], x = m.tx(t) + DX[e], y = m.ty(t) + DY[e];
        if (m.inside(x, y)) { const nt = m.t(x, y), npc = piecesOn(g, nt), en = HL.opp(e); for (let q = 0; q < 6; q++) if ((npc & (1 << q)) && (PE[q][0] === en || PE[q][1] === en)) { b = g.blk[nt * 6 + q]; break; } }
      }
      return b < 0 || (g.blockOcc[b] === 0 && g.blockRes[b] === 0) || (g.blockClaim[b] > 0 && g.blockOcc[b] === 0);
    }
    return g.res[k] > 0 && g.occ[k] === 0 || (g.res[k] > 0);
  };
  Rail.pieceOccupied = function (g, t, p) { Rail.ensure(g); return g.occ[t * 6 + p] > 0; };
  Rail.tileHasIncompatibleTrain = function (g, t, rt) {
    for (const v of g.vehicles) {
      if (!v || v.kind !== 'rail' || v.inDepot || !v.path) continue;
      if (v.path.some(s => s.t === t) && !Rail.canRun(v.need, rt)) return true;
    }
    return false;
  };
  Rail.crossingClosed = function (g, t) {
    if (!g.occ) return false;
    for (let p = 0; p < 2; p++) if (g.occ[t * 6 + p]) return true;
    const e = g.crossClose && g.crossClose.get(t);
    return !!e && e > g.ticks;
  };

  // ---------- routing ----------
  // is seg a place where this target is reached?
  function reaches(g, s, tgt) {
    if (!tgt) return false;
    const m = g.map;
    if (tgt.kind === 'st') return s.k === 0 && m.type[s.t] === T.STATION && m.idx[s.t] === tgt.id;
    if (tgt.kind === 'depot') return s.k === 3 && m.idx[s.t] === tgt.id;
    return false;
  }
  Rail.reaches = reaches;
  function tgtRect(g, tgt) {
    if (tgt.kind === 'st') { const s = g.stations[tgt.id]; return s ? s.rect : null; }
    const d = g.depots[tgt.id]; return d ? { x0: d.x, y0: d.y, x1: d.x, y1: d.y } : null;
  }
  const nodeKey = (g, s) => s.k === 1 ? 2e7 + s.br * 2 + s.d : s.k === 2 ? 3e7 + s.br * 2 + s.d : (s.t * 6 + s.p) * 2 + s.d + (s.k === 3 ? 1e8 : 0);
  // A* from the given first segments to the target. avoid: 'block' makes occupied/reserved pieces impassable.
  Rail.findRoute = function (g, v, starts, tgt, opt) {
    opt = opt || {};
    const r = tgtRect(g, tgt);
    if (!r) return null;
    const m = g.map;
    const h = (s) => { const x = m.tx(s.t), y = m.ty(s.t); const dx = x < r.x0 ? r.x0 - x : x > r.x1 ? x - r.x1 : 0, dy = y < r.y0 ? r.y0 - y : y > r.y1 ? y - r.y1 : 0; return (dx + dy) * 0.75; };
    const open = new Heap();
    const best = new Map();
    const me = v.id + 1;
    for (const s of starts) { const c0 = segCost(g, v, null, s, tgt, opt); if (c0 === Infinity) continue; const node = { s, g: c0, prev: null }; best.set(nodeKey(g, s), c0); open.push(node, c0 + h(s)); }
    let exp = 0;
    const maxExp = opt.maxExp || 12000;
    const buf = [];
    while (open.size) {
      const n = open.pop();
      if (best.get(nodeKey(g, n.s)) < n.g) continue;
      if (reaches(g, n.s, tgt)) {
        const out = []; let c = n; while (c) { out.push(c.s); c = c.prev; } out.reverse();
        // continue to the end of the platform so the stop point is known
        return out;
      }
      if (++exp > maxExp) break;
      buf.length = 0;
      Rail.next(g, v, n.s, buf);
      for (const s of buf) {
        const c = segCost(g, v, n.s, s, tgt, opt);
        if (c === Infinity) continue;
        const ng = n.g + c;
        const k = nodeKey(g, s);
        if (best.has(k) && best.get(k) <= ng) continue;
        best.set(k, ng);
        open.push({ s, g: ng, prev: n }, ng + h(s));
      }
    }
    return null;
  };
  function segCost(g, v, prev, s, tgt, opt) {
    const m = g.map;
    let c = segLen(s);
    if (prev && s.k === 0 && prev.k === 0) { const a = turnAngle(prev, s); if (a > 0.1) c += a > 1 ? 1.2 : 0.25; }
    const k = key(g, s);
    const me = v.id + 1;
    const occOther = g.occ[k] > 0 && !(v.path && v.path.some(p => key(g, p) === k));
    const resOther = g.res[k] && g.res[k] !== me;
    if (opt.avoid && (occOther || resOther)) return Infinity;
    if (occOther) c += 8;
    if (resOther) c += 5;
    if (s.k === 0 && m.type[s.t] === T.STATION && !reaches(g, s, tgt)) c += 2.5;
    if (s.k === 0 && m.type[s.t] === T.RAIL && m.road[s.t]) c += 0.4;
    if (s.k === 0) {
      const sig = Rail.facingSignal(g, prev, s);
      if (sig && sig.type === 0 && g.blk[k] >= 0 && g.blockOcc[g.blk[k]] > 0) c += 4;
    }
    if (s.k === 3 && !(tgt && tgt.kind === 'depot' && m.idx[s.t] === tgt.id)) return Infinity; // never route through a depot
    return c;
  }
  // minimal binary heap
  class Heap {
    constructor() { this.a = []; this.p = []; }
    get size() { return this.a.length; }
    push(x, pr) { const a = this.a, p = this.p; a.push(x); p.push(pr); let i = a.length - 1; while (i > 0) { const j = (i - 1) >> 1; if (p[j] <= pr) break; a[i] = a[j]; p[i] = p[j]; i = j; } a[i] = x; p[i] = pr; }
    pop() {
      const a = this.a, p = this.p, top = a[0], x = a.pop(), px = p.pop();
      if (a.length) { let i = 0; const n = a.length; for (;;) { let l = 2 * i + 1, r = l + 1, s = i, sp = px; if (l < n && p[l] < sp) { s = l; sp = p[l]; } if (r < n && p[r] < sp) { s = r; sp = p[r]; } if (s === i) break; a[i] = a[s]; p[i] = p[s]; i = s; } a[i] = x; p[i] = px; }
      return top;
    }
  }
  HL.Heap = Heap;

  // ---------- placing trains ----------
  Rail.removeFromMap = function (g, v) {
    Rail.ensure(g);
    if (v.path) for (const s of v.path) occAdd(g, key(g, s), -1);
    Rail.releaseAll(g, v);
    v.path = null; v.route = null;
  };
  Rail.releaseAll = function (g, v) {
    if (v.reserved) for (const k of v.reserved) if (g.res[k] === v.id + 1) resSet(g, k, 0);
    v.reserved = [];
    if (v.claims) for (const b of v.claims) if (g.blockClaim[b] === v.id + 1) g.blockClaim[b] = 0;
    v.claims = [];
  };
  Rail.leaveDepot = function (g, v) {
    Rail.ensure(g);
    const d = g.depots[v.depot];
    if (!d) { v.stopped = true; return; }
    v.need = Rail.needRt(v);
    if (!Rail.canRun(v.need, d.rt)) { v.stopped = true; return; }
    if (!v.cars.some(c => HL.VEH[c.model].engine)) { v.stopped = true; return; }
    // wait if the track outside is occupied
    const p = (d.dir & 1) ? 0 : 1;
    const seg = { k: 3, t: d.t, p, d: PE[p][0] === HL.opp(d.dir) ? 0 : 1 };
    const out = Rail.next(g, v, seg);
    for (const s of out) if (g.occ[key(g, s)]) return;
    if (g.occ[key(g, seg)]) return;
    v.inDepot = false; v.state = 'run'; v.path = [seg]; v.hs = 0.15; v.speed = 0; v.route = null; v.reserved = []; v.claims = [];
    v.pathLen = 1;
    occAdd(g, key(g, seg), 1);
    Rail.updatePos(g, v);
    HL.emit('leaveDepot', v);
  };

  // ---------- route planning ----------
  function targetKey(t) { return t ? t.kind + t.id : 'none'; }
  Rail.plan = function (g, v) {
    const tgt = V().target(g, v);
    v.tgtKey = targetKey(tgt);
    v.route = []; v.routeEnd = null;
    Rail.releaseClaims(g, v);
    if (!tgt) return;
    const head = v.path[v.path.length - 1];
    if (reaches(g, head, tgt) && tgt.kind === 'st' && !tgt.via) {
      // already on the platform: just roll to its end
      return;
    }
    const opts = Rail.next(g, v, head);
    if (!opts.length) { v.routeEnd = 'dead'; return; }
    const r = Rail.findRoute(g, v, opts, tgt);
    if (r) { v.route = r; v.lostSince = 0; return; }
    v.lostSince = v.lostSince || g.date;
    if (g.date - v.lostSince > 60 && !v.lostNews && v.owner === g.player) { v.lostNews = true; HL.Game.news(g, 'advice', V().displayName(v) + ' is lost', 'It can\'t find a route to its next destination. Check the track and its orders.', { veh: v.id, cid: v.owner }); }
  };
  Rail.releaseClaims = function (g, v) {
    if (v.claims) for (const b of v.claims) if (g.blockClaim[b] === v.id + 1) g.blockClaim[b] = 0;
    v.claims = [];
  };
  // can we reach the target by reversing?
  function reversePlanWorks(g, v, tgt) {
    if (!tgt) return false;
    const tail = tailSeg(g, v);
    if (!tail) return false;
    const fl = Rail.flip(tail.seg);
    if (reaches(g, fl, tgt)) return true;
    const opts = Rail.next(g, v, fl);
    if (!opts.length) return false;
    return !!Rail.findRoute(g, v, opts, tgt, { maxExp: 6000 });
  }
  function tailSeg(g, v) {
    let rem = v.len - v.hs;
    for (let i = v.path.length - 1; i >= 0; i--) {
      if (rem <= 0) return { seg: v.path[i], idx: i, off: -rem };
      if (i > 0) rem -= segLen(v.path[i - 1]);
      else return { seg: v.path[0], idx: 0, off: 0 };
    }
    return null;
  }
  Rail.reverse = function (g, v) {
    // new head is the old tail
    const path = v.path;
    let off = v.hs - v.len; // position of tail measured from start of head seg (may be negative)
    let i = path.length - 1;
    while (off < 0 && i > 0) { i--; off += segLen(path[i]); }
    if (off < 0) off = 0;
    // segments behind the tail are no longer occupied
    for (let j = 0; j < i; j++) occAdd(g, key(g, path[j]), -1);
    const kept = path.slice(i).map(Rail.flip).reverse();
    v.path = kept;
    v.hs = segLen(path[i]) - off;
    v.cars.reverse();
    for (const c of v.cars) c.flip = !c.flip;
    v.route = null; v.speed = 0;
    Rail.releaseAll(g, v);
    v.reverseWait = 0;
    HL.emit('trainReverse', v);
  };

  // ---------- movement ----------
  Rail.tick = function (g, v, standing) {
    if (!v.path) return;
    Rail.ensure(g);
    Rail.attach(v);
    v.need = v.need == null ? Rail.needRt(v) : v.need;
    if (standing) { v.speed = 0; Rail.updatePos(g, v); markCrossings(g, v, 1.5); return; }
    const tgt = V().target(g, v);
    if (!v.route || v.tgtKey !== targetKey(tgt)) {
      Rail.plan(g, v);
      // nothing ahead but the target is behind us: reverse
      if ((!v.route.length && v.routeEnd === 'dead') || (tgt && !v.route.length && !reaches(g, v.path[v.path.length - 1], tgt))) {
        if (tgt && reversePlanWorks(g, v, tgt) && v.speed < 1) { Rail.reverse(g, v); Rail.plan(g, v); }
      }
    }
    const head = v.path[v.path.length - 1];
    const cargoWt = v.holds.reduce((a, h) => a + h.n * HL.CARGO[h.c].wt, 0);
    const mass = v.wt + cargoWt;
    const vmax = Math.min(v.vmax, v.slow ? v.vmax * 0.5 : 9999);
    // acceleration from power to weight
    const tTop = HL.clamp(mass * vmax / (Math.max(1, v.power) * 9), 0.4, 14);
    let acc = vmax / (tTop * TPD) * (1 - 0.6 * Math.pow(v.speed / vmax, 2));
    // gradient at the head
    if (head.gr == null) { const L0 = segLen(head), a0 = Rail.pos(g, head, 0), a1 = Rail.pos(g, head, L0); head.gr = (a1[2] - a0[2]) / L0; }
    const grade = head.gr;
    acc -= grade * 0.28;
    if (v.need >= 3) acc *= 1.4;
    const brake = BRAKE * (v.need >= 2 ? 1.5 : 1);
    // look ahead
    const need = Math.max(5, (v.speed * v.speed * K) / (2 * brake) + 1.6);
    extendRoute(g, v, tgt, need + 2);
    let allowed = vmax;
    let dist = segLen(head) - v.hs;
    let prev = head;
    let stopDist = Infinity, arriving = false, enterDepot = false;
    const lim = (L, d) => { const a = Math.sqrt(L * L + 2 * brake * Math.max(0, d) / K); if (a < allowed) allowed = a; };
    // speed limits on the current segment
    if (head.k === 1) lim(HL.BRIDGES[g.bridges[head.br].type].speed, 0);
    if (head.k === 3) lim(40, 0);
    let prevTurn = 0;
    for (let i = 0; i < v.route.length && dist < need + 1; i++) {
      const s = v.route[i];
      // signals at the boundary
      const sig = Rail.facingSignal(g, prev, s);
      if (sig && !v.granted(s)) {
        let ok = false;
        if (sig.type === 0) {
          const b = g.blk[key(g, s)];
          ok = blockFree(g, v, b);
          if (ok && dist < need + 0.6) { if (b >= 0 && g.blockClaim[b] !== v.id + 1) { g.blockClaim[b] = v.id + 1; v.claims.push(b); } v.grant(s); }
          else if (ok) ok = true;
        } else {
          if (dist < need + 0.6) { ok = reservePath(g, v, i, tgt); if (ok) v.grant(s); }
          else ok = true; // too far to bother yet
        }
        if (!ok) { stopDist = Math.min(stopDist, dist - 0.15); break; }
      }
      // curve limits
      if (prev.k === 0 && s.k === 0) {
        const a = turnAngle(prev, s);
        const tight = a > 1 ? 2 : a > 0.1 ? 1 : 0;
        const fast = v.need >= 2 ? 1.6 : 1;
        if (tight === 2 || (tight === 1 && prevTurn)) lim(90 * fast, dist);
        else if (tight === 1) lim(170 * fast, dist);
        prevTurn = tight ? 1 : Math.max(0, prevTurn - 1);
      }
      if (s.k === 1) lim(HL.BRIDGES[g.bridges[s.br].type].speed, dist);
      if (s.k === 3) { lim(40, dist); if (tgt && tgt.kind === 'depot' && reaches(g, s, tgt)) { stopDist = Math.min(stopDist, dist + 0.55); enterDepot = true; break; } }
      // level crossings ahead close their barriers
      if (s.k === 0 && g.map.road[s.t] && g.map.type[s.t] === T.RAIL) { if (dist < 7) g.crossClose.set(s.t, g.ticks + 40); if (HL.Road && HL.Road.vehOnTile(g, s.t)) { stopDist = Math.min(stopDist, dist - 0.2); break; } }
      // line-of-sight braking when collisions are switched off
      if (!g.diff.crashes && g.occ[key(g, s)] && !ownsKey(g, v, key(g, s))) { stopDist = Math.min(stopDist, dist - 0.3); break; }
      // destination platform: stop at its far end
      if (tgt && tgt.kind === 'st' && !tgt.via && reaches(g, s, tgt)) {
        let end = dist + segLen(s);
        for (let j = i + 1; j < v.route.length && reaches(g, v.route[j], tgt); j++) end += segLen(v.route[j]);
        // extend route through the whole platform if it ends inside the route
        stopDist = Math.min(stopDist, end - 0.06);
        arriving = true;
        break;
      }
      dist += segLen(s);
      prev = s;
    }
    if (tgt && tgt.kind === 'depot' && reaches(g, head, tgt)) { stopDist = Math.min(stopDist, 0.55 - v.hs); enterDepot = true; }
    // already on the destination platform
    if (tgt && tgt.kind === 'st' && !tgt.via && reaches(g, head, tgt)) {
      let end = segLen(head) - v.hs;
      for (let j = 0; j < v.route.length && reaches(g, v.route[j], tgt); j++) end += segLen(v.route[j]);
      if (!v.route.length || reaches(g, v.route[0], tgt) || true) {
        // the platform ends where the route leaves the station
        stopDist = Math.min(stopDist, end - 0.06);
        arriving = true;
      }
    }
    if (v.routeEnd === 'dead') stopDist = Math.min(stopDist, (segLen(head) - v.hs) + routeLen(v) - 0.08);
    if (stopDist < Infinity) lim(0, stopDist);
    // speed update
    if (v.speed < allowed) v.speed = Math.min(allowed, v.speed + Math.max(acc, v.speed < 3 ? 0.3 : -BRAKE));
    else v.speed = Math.max(allowed, v.speed - brake);
    if (v.speed < 0) v.speed = 0;
    if (stopDist < 0.03 && v.speed < 6) v.speed = 0;
    // arrive / reverse when stopped at the stop point
    if (v.speed === 0) {
      if (arriving && stopDist < 0.4) { const s = g.stations[tgt.id]; V().arrive(g, v, s, tgt.order); Rail.updatePos(g, v); return; }
      if (enterDepot && stopDist < 0.4) { Rail.removeFromMap(g, v); V().enterDepot(g, v, g.depots[tgt.id]); return; }
      if (v.routeEnd === 'dead' && stopDist < 0.4) { if (++v.reverseWait > 20) { Rail.reverse(g, v); } Rail.updatePos(g, v); return; }
      // stuck at a red signal for a long time: try another way
      v.waitTicks = (v.waitTicks || 0) + 1;
      if (v.waitTicks > TPD * 6 && v.waitTicks % (TPD * 3) === 0) { v.route = null; }
      if (v.waitTicks > TPD * 20 && tgt && reversePlanWorks(g, v, tgt) && v.waitTicks % (TPD * 10) === 0) Rail.reverse(g, v);
    } else v.waitTicks = 0;
    // move
    let mv = v.speed * K;
    if (stopDist < Infinity) mv = Math.min(mv, Math.max(0, stopDist));
    v.hs += mv;
    let guard = 0;
    while (v.hs > segLen(v.path[v.path.length - 1]) && guard++ < 8) {
      const cur = v.path[v.path.length - 1];
      const nx = v.route.shift();
      if (!nx) { v.hs = segLen(cur); v.speed = 0; break; }
      // route may be stale if track changed
      const valid = Rail.next(g, v, cur).some(o => sameSeg(o, nx));
      if (!valid) { v.route.unshift(nx); v.hs = segLen(cur); v.speed = 0; v.route = null; break; }
      v.hs -= segLen(cur);
      enterSeg(g, v, nx);
      if (v.state === 'crashed') return;
      // via orders: passing through the station completes the order
      if (tgt && tgt.via && reaches(g, nx, tgt)) { V().depart(g, v); }
    }
    trimTail(g, v);
    Rail.updatePos(g, v);
    markCrossings(g, v, 0);
  };
  function routeLen(v) { let s = 0; for (const r of v.route) s += segLen(r); return s; }
  function ownsKey(g, v, k) { for (const s of v.path) if (key(g, s) === k) return true; return false; }
  function extendRoute(g, v, tgt, needLen) {
    if (!v.route) v.route = [];
    let total = segLen(v.path[v.path.length - 1]) - v.hs + routeLen(v);
    let guard = 0;
    while (total < needLen && !v.routeEnd && guard++ < 50) {
      const last = v.route.length ? v.route[v.route.length - 1] : v.path[v.path.length - 1];
      if (tgt && reaches(g, last, tgt) && !tgt.via) {
        // continue along the platform until it ends, then stop
        const opts = Rail.next(g, v, last).filter(o => reaches(g, o, tgt));
        if (!opts.length || last.k === 3) { v.routeEnd = 'target'; break; }
        v.route.push(opts[0]); total += segLen(opts[0]); continue;
      }
      const opts = Rail.next(g, v, last);
      if (!opts.length) { v.routeEnd = 'dead'; break; }
      let pick = opts[0];
      if (opts.length > 1) {
        if (tgt && !(v.noPathUntil > g.ticks)) { const r = Rail.findRoute(g, v, opts, tgt); if (r) { for (const s of r) { v.route.push(s); total += segLen(s); } continue; } v.noPathUntil = g.ticks + TPD * 2; }
        // no target or unreachable: prefer straight on, avoiding depots
        const straight = opts.filter(o => o.k === 0 && turnAngle(last.k === 0 ? last : o, o) < 0.1);
        pick = straight[0] || opts.find(o => o.k !== 3) || opts[0];
      }
      if (pick.k === 3 && !(tgt && reaches(g, pick, tgt))) { v.routeEnd = 'dead'; break; }
      v.route.push(pick); total += segLen(pick);
    }
  }
  // reserve from route[i] to the next safe waiting point; try another route if blocked
  function reservePath(g, v, i, tgt) {
    const tryRes = (route, from) => {
      const keys = [];
      let prev = from > 0 ? route[from - 1] : v.path[v.path.length - 1];
      for (let j = from; j < route.length; j++) {
        const s = route[j];
        if (j > from && Rail.facingSignal(g, prev, s)) break;
        const k = key(g, s);
        if ((g.occ[k] && !ownsKey(g, v, k)) || (g.res[k] && g.res[k] !== v.id + 1)) return null;
        // conflicting pieces on the same tile
        if (s.k === 0) for (let q = 0; q < 6; q++) { if (q === s.p || !HL.pieceConflict(q, s.p)) continue; const k2 = s.t * 6 + q; if ((g.occ[k2] && !ownsKey(g, v, k2)) || (g.res[k2] && g.res[k2] !== v.id + 1)) return null; }
        const b = g.blk[k];
        if (b >= 0 && g.blockClaim[b] && g.blockClaim[b] !== v.id + 1) return null;
        keys.push(k);
        if (tgt && reaches(g, s, tgt) && !tgt.via) { let jj = j + 1; while (jj < route.length && reaches(g, route[jj], tgt)) { keys.push(key(g, route[jj])); jj++; } break; }
        prev = s;
      }
      return keys;
    };
    let keys = tryRes(v.route, i);
    if (!keys && tgt) {
      // look for a free alternative from the signal onward
      const from = i > 0 ? v.route[i - 1] : v.path[v.path.length - 1];
      const alt = Rail.findRoute(g, v, [v.route[i]].concat(Rail.next(g, v, from).filter(o => !sameSeg(o, v.route[i]))), tgt, { avoid: true, maxExp: 5000 });
      if (alt) { v.route.splice(i, v.route.length - i, ...alt); keys = tryRes(v.route, i); }
    }
    if (!keys) return false;
    for (const k of keys) { if (g.res[k] !== v.id + 1) { resSet(g, k, v.id + 1); v.reserved.push(k); } }
    return true;
  }
  function enterSeg(g, v, s) {
    const k = key(g, s);
    occAdd(g, k, 1);
    v.path.push(s);
    if (v._grants) v._grants.delete(s.k + ':' + s.t + ':' + s.p + ':' + s.d + ':' + (s.br || 0));
    // claims are replaced by occupancy once inside the block
    const b = g.blk[k];
    if (b >= 0 && g.blockClaim[b] === v.id + 1) { g.blockClaim[b] = 0; v.claims = v.claims.filter(x => x !== b); }
    // collisions
    if (g.occ[k] > 1 || conflictOccupied(g, v, s)) {
      const other = findTrainAt(g, v, s);
      if (other && g.diff.crashes) {
        V().crash(g, v, 'Train crash! ' + V().displayName(v) + ' collides with ' + V().displayName(other));
        V().crash(g, other, null);
        HL.emit('explosion', v.px, v.py, v.pz);
        return;
      }
    }
    // hitting a road vehicle on a level crossing
    if (s.k === 0 && g.map.road[s.t] && g.map.type[s.t] === T.RAIL && HL.Road) HL.Road.trainOnCrossing(g, s.t, v);
  }
  function conflictOccupied(g, v, s) {
    if (s.k !== 0) return false;
    for (let q = 0; q < 6; q++) { if (q === s.p || !HL.pieceConflict(q, s.p)) continue; if (g.occ[s.t * 6 + q] && !ownsKey(g, v, s.t * 6 + q)) return true; }
    return false;
  }
  function findTrainAt(g, v, s) {
    const k = key(g, s);
    for (const o of g.vehicles) {
      if (!o || o === v || o.kind !== 'rail' || !o.path || o.inDepot || o.state === 'crashed') continue;
      for (const p of o.path) { const pk = key(g, p); if (pk === k || (s.k === 0 && p.k === 0 && p.t === s.t && HL.pieceConflict(p.p, s.p))) return o; }
    }
    return null;
  }
  function trimTail(g, v) {
    // total occupied length = (lengths of all but last) + hs
    let tot = v.hs;
    for (let i = 0; i < v.path.length - 1; i++) tot += segLen(v.path[i]);
    while (v.path.length > 1 && tot - segLen(v.path[0]) >= v.len) {
      const s = v.path.shift();
      tot -= segLen(s);
      const k = key(g, s);
      occAdd(g, k, -1);
      if (g.res[k] === v.id + 1) { resSet(g, k, 0); v.reserved = v.reserved.filter(x => x !== k); }
    }
  }
  function markCrossings(g, v, d) {
    for (const s of v.path) if (s.k === 0 && g.map.road[s.t] && g.map.type[s.t] === T.RAIL) g.crossClose.set(s.t, g.ticks + 40);
  }
  // per-train grant memory (signals already passed in this approach)
  const proto = {};
  Rail.attach = function (v) {
    if (!v._grants) Object.defineProperty(v, '_grants', { value: new Set(), enumerable: false, writable: true });
    if (!v.grant) Object.defineProperty(v, 'grant', { value: function (s) { this._grants.add(s.k + ':' + s.t + ':' + s.p + ':' + s.d + ':' + (s.br || 0)); }, enumerable: false });
    if (!v.granted) Object.defineProperty(v, 'granted', { value: function (s) { return this._grants.has(s.k + ':' + s.t + ':' + s.p + ':' + s.d + ':' + (s.br || 0)); }, enumerable: false });
  };

  // ---------- car positions for drawing ----------
  Rail.updatePos = function (g, v) {
    Rail.attach(v);
    if (v._grants.size > 64) v._grants.clear();
    const head = v.path[v.path.length - 1];
    if (head.k === 1 || head.k === 2) { const p = Rail.pos(g, head, v.hs); v.px = p[0]; v.py = p[1]; v.yaw = p[3]; }
    else {
      const a = EM[PE[head.p][head.d]], b = EM[PE[head.p][1 - head.d]], f = v.hs / segLen(head);
      v.px = g.map.tx(head.t) + a[0] + (b[0] - a[0]) * f; v.py = g.map.ty(head.t) + a[1] + (b[1] - a[1]) * f;
      v.yaw = Math.atan2(b[1] - a[1], b[0] - a[0]);
    }
    v.posDirty = true;
  };
  // positions of every car (for drawing)
  Rail.carPositions = function (g, v) {
    if (!v.posDirty || !v.path) return;
    v.posDirty = false;
    const path = v.path;
    let d = 0;
    const posAt = (dist) => {
      let i = path.length - 1, s = v.hs - dist;
      while (s < 0 && i > 0) { i--; s += segLen(path[i]); }
      if (s < 0) { const p = Rail.pos(g, path[0], 0); p[4] = true; return p; }
      return Rail.pos(g, path[i], s);
    };
    for (let i = 0; i < v.cars.length; i++) {
      const c = v.cars[i];
      const m = HL.VEH[c.model];
      const front = posAt(d), back = posAt(d + m.len);
      c.px = (front[0] + back[0]) / 2; c.py = (front[1] + back[1]) / 2; c.pz = (front[2] + back[2]) / 2;
      c.yaw = Math.atan2(front[1] - back[1], front[0] - back[0]);
      const run = Math.hypot(front[0] - back[0], front[1] - back[1]) || 1;
      c.pitch = Math.atan2((front[2] - back[2]) * HL.LEVEL, run);
      c.hidden = !!(front[4] && back[4]);
      c.onBridge = front[5] >= 0 || back[5] >= 0 ? (front[5] >= 0 ? front[5] : back[5]) : -1;
      d += m.len + 0.02;
    }
    v.pz = v.cars[0].pz;
  };
  function distToStart(v) { let s = v.hs; for (let i = 0; i < v.path.length - 1; i++) s += segLen(v.path[i]); return s - (v.path[0].k === 3 ? 0.5 : 0); }
})(typeof window !== 'undefined' ? window : globalThis);
