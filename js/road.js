// Road vehicles: routing over road bits, lane-following curves, queues, stops, crossings.
(function (root) {
  const HL = root.HL;
  const T = HL.T;
  const Road = HL.Road = {};
  const V = () => HL.Veh;
  const EM = HL.EDGE_MID, DX = HL.DX, DY = HL.DY;
  const TPD = HL.TICKS_PER_DAY;
  const K = 1 / (28 * TPD);
  const LO = 0.13; // lane offset to the right of travel

  // ---------- connectivity ----------
  // road bits usable on tile t (for passage), or 0
  Road.bitsAt = function (g, t) {
    const m = g.map, ty = m.type[t];
    if (ty === T.ROAD) return m.road[t];
    if (ty === T.RAIL) return m.road[t] && !(m.m1[t] & 0xC000) ? m.road[t] : 0;
    if (ty === T.STATION) { const k = m.m1[t] & 7; return k === 1 || k === 2 ? m.road[t] : 0; }
    if (ty === T.DEPOT) { const d = g.depots[m.idx[t]]; return d && d.kind === 1 ? 1 << d.dir : 0; }
    return 0;
  };
  function headInfo(g, t) {
    const m = g.map;
    if (m.type[t] !== T.ROAD || !(m.m1[t] & 0xC000)) return null;
    const isB = !!(m.m1[t] & 0x8000);
    const bt = isB ? g.bridges[m.idx[t]] : g.tunnels[m.idx[t]];
    if (!bt) return null;
    return { bt, isB, inner: t === bt.a ? bt.dir : HL.opp(bt.dir) };
  }
  // segments leaving tile t after entering via en
  Road.options = function (g, v, t, en, tgt, out) {
    out = out || [];
    const m = g.map;
    const ty = m.type[t];
    if (ty === T.DEPOT) {
      const d = g.depots[m.idx[t]];
      if (d && d.kind === 1 && en === d.dir && d.owner === v.owner) out.push({ k: 3, t, en, ex: en });
      return out;
    }
    // other companies' stops are passable but not depots
    const bits = Road.bitsAt(g, t);
    if (!bits || !(bits & (1 << en))) return out;
    const hi = headInfo(g, t);
    for (let ex = 0; ex < 4; ex++) {
      if (ex === en || !(bits & (1 << ex))) continue;
      if (hi && ex === hi.inner) { out.push({ k: hi.isB ? 1 : 2, br: hi.bt.id, t, en, ex, from: t }); continue; }
      const x = m.tx(t) + DX[ex], y = m.ty(t) + DY[ex];
      if (!m.inside(x, y)) continue;
      const n = m.t(x, y);
      const nb = Road.bitsAt(g, n);
      if (!(nb & (1 << HL.opp(ex)))) continue;
      // depots are dead ends unless we're heading into this one
      if (m.type[n] === T.DEPOT && !(tgt && tgt.kind === 'depot' && m.idx[n] === tgt.id)) continue;
      out.push({ k: 0, t, en, ex });
    }
    if (!out.length) out.push({ k: 4, t, en, ex: en }); // dead end: turn around
    return out;
  };
  // the tile and entry edge reached after a segment
  Road.after = function (g, s) {
    const m = g.map;
    if (s.k === 1 || s.k === 2) {
      const bt = s.k === 1 ? g.bridges[s.br] : g.tunnels[s.br];
      const other = s.from === bt.a ? bt.b : bt.a;
      const inner = other === bt.a ? bt.dir : HL.opp(bt.dir);
      return { t: other, en: inner };
    }
    if (s.k === 3) return null;
    const x = m.tx(s.t) + DX[s.ex], y = m.ty(s.t) + DY[s.ex];
    if (!m.inside(x, y)) return null;
    return { t: m.t(x, y), en: HL.opp(s.ex) };
  };
  Road.next = function (g, v, s, tgt, out) {
    const a = Road.after(g, s);
    if (!a) return out || [];
    return Road.options(g, v, a.t, a.en, tgt, out);
  };

  // ---------- geometry ----------
  const rperp = (dx, dy) => [-dy, dx];
  function curve(s) {
    // control points in tile-local coordinates
    if (s._c) return s._c;
    const a = EM[s.en], b = EM[s.ex];
    const din = [0.5 - a[0], 0.5 - a[1]]; const ln = Math.hypot(din[0], din[1]); din[0] /= ln; din[1] /= ln;
    const ri = rperp(din[0], din[1]);
    const A = [a[0] + ri[0] * LO, a[1] + ri[1] * LO];
    let pts;
    if (s.k === 4 || (s.k === 3)) {
      if (s.k === 3) { const C = [0.5 + ri[0] * LO, 0.5 + ri[1] * LO]; pts = [A, C]; }
      else {
        const B = [a[0] - ri[0] * LO, a[1] - ri[1] * LO];
        pts = [A, [A[0] + din[0] * 0.55, A[1] + din[1] * 0.55], [B[0] + din[0] * 0.55, B[1] + din[1] * 0.55], B];
      }
    } else if (s.k === 1 || s.k === 2) {
      pts = [A, [b[0] + ri[0] * LO, b[1] + ri[1] * LO]];
    } else {
      const dout = [b[0] - 0.5, b[1] - 0.5]; const lo2 = Math.hypot(dout[0], dout[1]); dout[0] /= lo2; dout[1] /= lo2;
      const ro = rperp(dout[0], dout[1]);
      const B = [b[0] + ro[0] * LO, b[1] + ro[1] * LO];
      if (s.ex === HL.opp(s.en)) pts = [A, B];
      else pts = [A, [0.5 + ri[0] * LO + ro[0] * LO, 0.5 + ri[1] * LO + ro[1] * LO], B];
    }
    // arc length
    let L = 0, prev = bez(pts, 0);
    for (let i = 1; i <= 10; i++) { const p = bez(pts, i / 10); L += Math.hypot(p[0] - prev[0], p[1] - prev[1]); prev = p; }
    s._c = { pts, len: L };
    return s._c;
  }
  function bez(p, t) {
    if (p.length === 2) return [p[0][0] + (p[1][0] - p[0][0]) * t, p[0][1] + (p[1][1] - p[0][1]) * t];
    if (p.length === 3) { const u = 1 - t; return [u * u * p[0][0] + 2 * u * t * p[1][0] + t * t * p[2][0], u * u * p[0][1] + 2 * u * t * p[1][1] + t * t * p[2][1]]; }
    const u = 1 - t;
    return [u * u * u * p[0][0] + 3 * u * u * t * p[1][0] + 3 * u * t * t * p[2][0] + t * t * t * p[3][0], u * u * u * p[0][1] + 3 * u * u * t * p[1][1] + 3 * u * t * t * p[2][1] + t * t * t * p[3][1]];
  }
  Road.segLen = function (g, s) {
    if (s.k === 1 || s.k === 2) { const bt = s.k === 1 ? g.bridges[s.br] : g.tunnels[s.br]; return bt.len + 0.0001; }
    return curve(s).len;
  };
  Road.pos = function (g, s, d) {
    const m = g.map;
    if (s.k === 1 || s.k === 2) {
      const bt = s.k === 1 ? g.bridges[s.br] : g.tunnels[s.br];
      const ta = s.from, tb = ta === bt.a ? bt.b : bt.a;
      const outDir = s.ex;
      const ea = EM[outDir], eb = EM[HL.opp(outDir)];
      const r = rperp(DX[outDir], DY[outDir]);
      const ax = m.tx(ta) + ea[0] + r[0] * LO, ay = m.ty(ta) + ea[1] + r[1] * LO, bx = m.tx(tb) + eb[0] + r[0] * LO, by = m.ty(tb) + eb[1] + r[1] * LO;
      const f = d / bt.len;
      return [ax + (bx - ax) * f, ay + (by - ay) * f, bt.h, Math.atan2(by - ay, bx - ax), s.k === 2, s.k === 1 ? bt.id : -1];
    }
    const c = curve(s);
    const t = HL.clamp(d / c.len, 0, 1);
    const p = bez(c.pts, t), p2 = bez(c.pts, Math.min(1, t + 0.02)), p1 = bez(c.pts, Math.max(0, t - 0.02));
    const x = m.tx(s.t) + p[0], y = m.ty(s.t) + p[1];
    return [x, y, Road.zAt(g, s.t, x, y), Math.atan2(p2[1] - p1[1], p2[0] - p1[0]), s.k === 3 && t > 0.6, -1];
  };
  Road.zAt = function (g, t, x, y) {
    const m = g.map;
    if (m.type[t] === T.DEPOT) return m.tileMax(m.tx(t), m.ty(t));
    if (m.type[t] === T.ROAD && (m.m1[t] & 0x8000)) {
      const br = g.bridges[m.idx[t]];
      if (br) {
        const inner = t === br.a ? br.dir : HL.opp(br.dir);
        const tx = m.tx(t), ty = m.ty(t), u = x - tx, v = y - ty;
        const f = inner === 1 ? u : inner === 3 ? 1 - u : inner === 2 ? v : 1 - v;
        const hOut = m.edgeMidH(tx, ty, HL.opp(inner));
        return hOut + (br.h - hOut) * HL.clamp(f, 0, 1);
      }
    }
    return m.heightAt(x, y);
  };

  // ---------- routing ----------
  function stopKind(v) { return V().isBus(v) ? 1 : 2; }
  function reaches(g, v, s, tgt) {
    if (!tgt) return false;
    const m = g.map;
    if (tgt.kind === 'st') return (s.k === 0 || s.k === 4) && m.type[s.t] === T.STATION && m.idx[s.t] === tgt.id && (m.m1[s.t] & 7) === stopKind(v);
    if (tgt.kind === 'depot') return s.k === 3 && m.idx[s.t] === tgt.id;
    return false;
  }
  Road.reaches = reaches;
  const nk = s => ((s.t * 4 + s.en) * 4 + s.ex) * 5 + s.k;
  Road.findRoute = function (g, v, starts, tgt, maxExp) {
    let r;
    if (tgt.kind === 'st') { const s = g.stations[tgt.id]; if (!s) return null; r = s.rect; }
    else { const d = g.depots[tgt.id]; if (!d) return null; r = { x0: d.x, y0: d.y, x1: d.x, y1: d.y }; }
    const m = g.map;
    const h = (s) => { const a = Road.after(g, s) || { t: s.t }; const x = m.tx(a.t), y = m.ty(a.t); const dx = x < r.x0 ? r.x0 - x : x > r.x1 ? x - r.x1 : 0, dy = y < r.y0 ? r.y0 - y : y > r.y1 ? y - r.y1 : 0; return dx + dy; };
    const open = new HL.Heap(), best = new Map();
    for (const s of starts) { if (s.k === 3 && !reaches(g, v, s, tgt)) continue; const c = cost(g, v, s, tgt); best.set(nk(s), c); open.push({ s, g: c, prev: null }, c + h(s)); }
    let exp = 0;
    const buf = [];
    while (open.size) {
      const n = open.pop();
      if (best.get(nk(n.s)) < n.g) continue;
      if (reaches(g, v, n.s, tgt)) { const out = []; let c = n; while (c) { out.push(c.s); c = c.prev; } return out.reverse(); }
      if (++exp > (maxExp || 8000)) break;
      buf.length = 0;
      Road.next(g, v, n.s, tgt, buf);
      for (const s of buf) {
        if (s.k === 3 && !reaches(g, v, s, tgt)) continue;
        const ng = n.g + cost(g, v, s, tgt);
        const k = nk(s);
        if (best.has(k) && best.get(k) <= ng) continue;
        best.set(k, ng);
        open.push({ s, g: ng, prev: n }, ng + h(s));
      }
    }
    return null;
  };
  function cost(g, v, s, tgt) {
    let c = s.k === 1 || s.k === 2 ? Road.segLen(g, s) : 1;
    if (s.k === 4) c += 4;
    else if (s.k === 0 && s.ex !== HL.opp(s.en)) c += 0.3;
    if (g.map.type[s.t] === T.STATION && !reaches(g, v, s, tgt)) c += 1;
    if (g.map.type[s.t] === T.RAIL) c += 0.5;
    return c;
  }

  // ---------- spatial index for queueing ----------
  let gridTick = -1;
  const grid = new Map();
  function buildGrid(g) {
    if (gridTick === g.ticks) return;
    gridTick = g.ticks; grid.clear();
    for (const v of g.vehicles) {
      if (!v || v.kind !== 'road' || v.inDepot || !v.seg) continue;
      const t = v.seg.t;
      let a = grid.get(t); if (!a) grid.set(t, a = []); a.push(v);
    }
  }
  // road vehicles on a tile as of the latest tick (cheap, used by trains at crossings)
  Road.vehOnTile = function (g, t) { buildGrid(g); const l = grid.get(t); return !!(l && l.some(v => v.state !== 'crashed')); };
  Road.tileOccupied = function (g, t) {
    for (const v of g.vehicles) if (v && v.kind === 'road' && !v.inDepot && v.seg && (v.seg.t === t || (Road.after(g, v.seg) || {}).t === t)) return true;
    return false;
  };
  Road.trainOnCrossing = function (g, t, train) {
    for (const v of g.vehicles) {
      if (!v || v.kind !== 'road' || v.inDepot || !v.seg || v.state === 'crashed') continue;
      if (v.seg.t === t && v.sd > 0.15 && v.sd < Road.segLen(g, v.seg) - 0.15) {
        V().crash(g, v, 'Level crossing disaster! ' + V().displayName(v) + ' hit by ' + V().displayName(train));
        HL.emit('explosion', v.px, v.py, v.pz);
      }
    }
  };

  // ---------- movement ----------
  Road.leaveDepot = function (g, v) {
    const d = g.depots[v.depot];
    if (!d) { v.stopped = true; return; }
    const s = { k: 0, t: d.t, en: HL.opp(d.dir), ex: d.dir };
    // start at the middle of the depot tile heading out
    v.seg = s; v.sd = Road.segLen(g, s) * 0.5; v.route = null;
    v.inDepot = false; v.state = 'run'; v.speed = 0; v.blocked = 0;
    Road.updatePos(g, v);
    HL.emit('leaveDepot', v);
  };
  Road.tick = function (g, v) {
    if (!v.seg) return;
    // between decisions just keep rolling toward the last known stop point
    const rc = v.rc;
    if (rc && rc.until > g.ticks && rc.seg === v.seg) {
      let mv = v.speed * K;
      if (rc.stop < Infinity) { mv = Math.min(mv, Math.max(0, rc.stop)); rc.stop -= mv; }
      if (v.sd + mv < Road.segLen(g, v.seg)) { v.sd += mv; if (mv > 0) Road.updatePos(g, v); return; }
    }
    buildGrid(g);
    const m = HL.VEH[v.model];
    const tgt = V().target(g, v);
    const tk = tgt ? tgt.kind + tgt.id : 'none';
    if (!v.route || v.tgtKey !== tk) Road.plan(g, v, tgt);
    // speed limits
    let vmax = m.speed;
    const tw = g.towns[g.map.idx[v.seg.t]];
    if (g.map.type[v.seg.t] === T.ROAD && g.map.rowner[v.seg.t] === HL.OWNER_TOWN && tw && tw.roadworks > g.date) vmax *= 0.35;
    if (v.seg.k === 1) vmax = Math.min(vmax, HL.BRIDGES[g.bridges[v.seg.br].type].speed);
    if (v.seg.k === 4 || (v.seg.k === 0 && v.seg.ex !== HL.opp(v.seg.en))) vmax = Math.min(vmax, 40);
    if (v.slow) vmax *= 0.5;
    const L = Road.segLen(g, v.seg);
    let stopDist = Infinity, arriving = false, depot = false;
    const rem = L - v.sd;
    // destination stop: the stop point is near the exit of the stop tile
    if (tgt && tgt.kind === 'st' && reaches(g, v, v.seg, tgt)) { stopDist = Math.min(stopDist, L * (v.seg.k === 4 ? 0.5 : 0.82) - v.sd); arriving = true; }
    if (tgt && tgt.kind === 'depot' && v.seg.k === 3) { stopDist = Math.min(stopDist, L - v.sd); depot = true; }
    const nx = v.route && v.route[0];
    if (nx && !arriving && !depot) {
      if (tgt && reaches(g, v, nx, tgt)) { if (tgt.kind === 'st') { stopDist = Math.min(stopDist, rem + Road.segLen(g, nx) * (nx.k === 4 ? 0.5 : 0.82)); arriving = true; } else if (tgt.kind === 'depot') { stopDist = Math.min(stopDist, rem + Road.segLen(g, nx)); depot = true; } }
      // level crossing ahead
      if (g.map.type[nx.t] === T.RAIL && HL.Rail.crossingClosed(g, nx.t) && v.seg.t !== nx.t) stopDist = Math.min(stopDist, rem - 0.08);
    }
    // vehicle ahead
    const block = aheadDist(g, v);
    if (block != null) {
      if (v.blocked > TPD * 3) { /* ghost through to break gridlock */ if (v.blocked > TPD * 4) v.blocked = 0; else v.blocked++; }
      else { stopDist = Math.min(stopDist, block - 0.4); v.blocked = (v.blocked || 0) + 1; }
    } else v.blocked = 0;
    // speed
    const acc = m.speed / (1.2 * TPD);
    const brake = 1.6;
    let allowed = vmax;
    if (stopDist < Infinity) allowed = Math.min(allowed, Math.sqrt(2 * brake * Math.max(0, stopDist) / K));
    if (v.speed < allowed) v.speed = Math.min(allowed, v.speed + acc); else v.speed = Math.max(allowed, v.speed - brake);
    if (stopDist < 0.02) v.speed = 0;
    if (v.speed === 0 && stopDist < 0.3) {
      if (arriving) {
        // loading wherever we are queued on the stop tile
        if (reaches(g, v, v.seg, tgt)) { V().arrive(g, v, g.stations[tgt.id], tgt.order); v.route = null; return; }
      }
      if (depot && v.seg.k === 3) { v.seg = null; V().enterDepot(g, v, g.depots[tgt.id]); return; }
    }
    // queued in a stop behind another vehicle that is loading: load too
    if (v.speed === 0 && arriving && block != null && reaches(g, v, v.seg, tgt)) { V().arrive(g, v, g.stations[tgt.id], tgt.order); v.route = null; return; }
    let mv = v.speed * K;
    if (stopDist < Infinity) mv = Math.min(mv, Math.max(0, stopDist));
    v.sd += mv;
    v.rc = { until: g.ticks + (v.speed === 0 ? 4 : stopDist < 1 ? 1 : 3), seg: v.seg, stop: stopDist - mv };
    let guard = 0;
    while (v.sd >= Road.segLen(g, v.seg) && guard++ < 4) {
      const cur = v.seg, Lc = Road.segLen(g, cur);
      if (cur.k === 3) { v.sd = Lc; break; }
      let n = v.route && v.route.shift();
      // validate
      if (n) { const ok = Road.next(g, v, cur, tgt).some(o => o.t === n.t && o.en === n.en && o.ex === n.ex && o.k === n.k); if (!ok) n = null; }
      if (!n) {
        const opts = Road.next(g, v, cur, tgt);
        if (!opts.length) { v.sd = Lc; v.speed = 0; v.route = null; break; }
        n = opts.find(o => o.k !== 3) || opts[0];
        v.route = null;
      }
      v.sd -= Lc;
      v.seg = n;
      if (tgt && tgt.via && reaches(g, v, n, tgt)) V().depart(g, v);
    }
    Road.updatePos(g, v);
  };
  Road.plan = function (g, v, tgt) {
    v.tgtKey = tgt ? tgt.kind + tgt.id : 'none';
    v.route = []; v.routeDone = null;
    if (!tgt) return;
    if (reaches(g, v, v.seg, tgt)) { v.routeDone = 'target'; return; }
    if (v.noPathUntil && v.noPathUntil > g.ticks) return;
    const opts = Road.next(g, v, v.seg, tgt);
    const r = Road.findRoute(g, v, opts, tgt);
    if (r) { v.route = r; v.lostSince = 0; return; }
    v.noPathUntil = g.ticks + TPD;
    v.lostSince = v.lostSince || g.date;
    if (g.date - v.lostSince > 45 && !v.lostNews && v.owner === g.player) { v.lostNews = true; HL.Game.news(g, 'advice', V().displayName(v) + ' is lost', 'It can\'t find a road to its next destination.', { veh: v.id, cid: v.owner }); }
  };
  // distance to the vehicle ahead in our lane, or null
  function aheadDist(g, v) {
    const hx = Math.cos(v.yaw), hy = Math.sin(v.yaw);
    let best = null;
    const tiles = [v.seg.t];
    const a = Road.after(g, v.seg); if (a) tiles.push(a.t);
    if (v.route && v.route[0]) { const b = Road.after(g, v.route[0]); if (b) tiles.push(b.t); }
    for (const t of tiles) {
      const list = grid.get(t); if (!list) continue;
      for (const o of list) {
        if (o === v || o.state === 'crashed') continue;
        const rx = o.px - v.px, ry = o.py - v.py;
        const ahead = rx * hx + ry * hy;
        if (ahead <= 0.02 || ahead > 0.9) continue;
        const lat = Math.abs(rx * hy - ry * hx);
        if (lat > 0.09) continue;
        const ox = Math.cos(o.yaw), oy = Math.sin(o.yaw);
        if (ox * hx + oy * hy < 0.2) continue;
        if (best == null || ahead < best) best = ahead;
      }
    }
    return best;
  }
  // cheap per-tick position (no height); full position with height/pitch is computed when drawn
  Road.updatePos = function (g, v) {
    const s = v.seg, d = Math.min(v.sd, Road.segLen(g, s));
    if (s.k === 1 || s.k === 2) { const p = Road.pos(g, s, d); v.px = p[0]; v.py = p[1]; v.yaw = p[3]; v.hidden = p[4]; v.onBridge = p[5] >= 0 ? p[5] : null; v.pz = p[2]; return; }
    const c = curve(s);
    const t = HL.clamp(d / c.len, 0, 1);
    const p = bez(c.pts, t), p2 = bez(c.pts, Math.min(1, t + 0.02)), p1 = bez(c.pts, Math.max(0, t - 0.02));
    v.px = g.map.tx(s.t) + p[0]; v.py = g.map.ty(s.t) + p[1];
    v.yaw = Math.atan2(p2[1] - p1[1], p2[0] - p1[0]);
    v.hidden = s.k === 3 && t > 0.6; v.onBridge = null;
    v.posDirty = true;
  };
  Road.fullPos = function (g, v) {
    if (!v.posDirty || !v.seg) return;
    v.posDirty = false;
    const s = v.seg;
    v.pz = Road.zAt(g, s.t, v.px, v.py);
    const ax = v.px + Math.cos(v.yaw) * 0.15, ay = v.py + Math.sin(v.yaw) * 0.15;
    const tx = Math.floor(ax), ty = Math.floor(ay);
    const z2 = g.map.inside(tx, ty) ? Road.zAt(g, g.map.t(tx, ty), ax, ay) : v.pz;
    v.pitch = Math.atan2((z2 - v.pz) * HL.LEVEL, 0.15);
  };
})(typeof window !== 'undefined' ? window : globalThis);
