// Automated construction used by AI companies (and the dev harness): route finding for new track and
// road over terrain, station siting, depots, and laying everything down.
(function (root) {
  const HL = root.HL;
  const T = HL.T, GR = HL.GR;
  const AB = HL.AIBuild = {};
  const B = () => HL.Build, S = () => HL.Stations;
  const DX = HL.DX, DY = HL.DY;

  // ---------- rail route ----------
  // tile path from start (x,y moving dir d0) to goal tile (x,y) arriving moving dir dEnd (or any).
  // Returns [{x,y,din,dout,bridge?}] where din = direction we entered moving, dout = direction we leave.
  AB.planRail = function (g, cid, sx, sy, d0, gx, gy, opt) {
    opt = opt || {};
    const m = g.map, W = m.W;
    const rt = opt.rt || 0;
    const open = new HL.Heap();
    const best = new Map();
    const k = (x, y, d) => ((y * W + x) << 2) | d;
    const h = (x, y) => (Math.abs(x - gx) + Math.abs(y - gy)) * 0.72;
    const start = { x: sx, y: sy, d: d0, g: 0, prev: null, bridge: 0 };
    open.push(start, h(sx, sy));
    best.set(k(sx, sy, d0), 0);
    let exp = 0;
    const maxExp = opt.maxExp || 40000;
    while (open.size) {
      const n = open.pop();
      if (best.get(k(n.x, n.y, n.d)) < n.g) continue;
      if (n.x === gx && n.y === gy && (opt.endDir == null || n.d === opt.endDir)) return unwind(n);
      if (++exp > maxExp) break;
      // from tile n (entered moving n.d), choose next direction
      for (const nd of [n.d, (n.d + 1) & 3, (n.d + 3) & 3]) {
        // piece needed on n's tile
        if (n.prev && !tileTakesPiece(g, cid, n.x, n.y, HL.pieceFor(HL.opp(n.d), nd), rt, n.x === sx && n.y === sy, opt)) continue;
        const nx = n.x + DX[nd], ny = n.y + DY[nd];
        if (!m.inside(nx, ny) || nx < 2 || ny < 2 || nx >= m.W - 2 || ny >= m.H - 2) continue;
        let c = 1;
        if (nd !== n.d) {
          // turning back the other way right after a turn continues a diagonal: cheap and fast to run
          const side = turnSide(n.d, nd);
          if (n.sinceTurn === 0 && n.turnSide != null && n.turnSide !== side) c = 0.72;
          else c += 0.9;
        } else if (n.sinceTurn === 0 && n.prev) c += 0.5; // straightening out of a diagonal
        // repeated same-side turns make a U: forbid two same-side turns in a row
        if (nd !== n.d && n.turnSide != null && n.turnSide === turnSide(n.d, nd) && n.sinceTurn < 3) continue;
        const nt = m.t(nx, ny);
        const ok = tileClass(g, cid, nx, ny, nt, opt);
        if (ok > 0) {
          c += ok - 1;
          c += Math.abs(m.edgeMidH(n.x, n.y, nd) - m.edgeMidH(nx, ny, nd)) * 1.6;
          push(n, nx, ny, nd, c, 0);
        }
        // bridge: straight only, over obstacles
        if (nd === n.d && (ok <= 0 || m.type[nt] === T.WATER || m.type[nt] === T.ROAD || m.type[nt] === T.RAIL) && opt.bridges !== false) {
          for (let L = 1; L <= 9; L++) {
            const bx = n.x + DX[nd] * (L + 1), by = n.y + DY[nd] * (L + 1);
            if (!m.inside(bx, by) || bx < 2 || by < 2 || bx >= m.W - 2 || by >= m.H - 2) break;
            const bt = m.t(bx, by);
            if (tileClass(g, cid, bx, by, bt, opt) <= 0 || m.type[bt] !== T.CLEAR) continue;
            // the start head is the current tile: it must be clear (not already track)
            if (m.type[m.t(n.x, n.y)] !== T.CLEAR || (n.prev && n.prev.bridge)) break;
            if (n.d !== nd) break;
            const pl = HL.Build.planBridge(g, cid, n.x, n.y, bx, by, 'rail');
            if (!pl.ok) continue;
            push(n, bx, by, nd, 3 + L * 2.5, L);
            break;
          }
        }
      }
    }
    return null;
    function push(n, nx, ny, nd, c, bridge) {
      const ng = n.g + c;
      const kk = k(nx, ny, nd);
      if (best.has(kk) && best.get(kk) <= ng) return;
      best.set(kk, ng);
      const ts = nd !== n.d ? turnSide(n.d, nd) : n.turnSide;
      open.push({ x: nx, y: ny, d: nd, g: ng, prev: n, bridge, turnSide: ts, sinceTurn: nd !== n.d ? 0 : (n.sinceTurn || 0) + 1 + bridge }, ng + h(nx, ny));
    }
    function unwind(n) {
      const out = [];
      while (n) { out.push(n); n = n.prev; }
      out.reverse();
      // din: direction of motion entering tile; dout: leaving
      const res = [];
      for (let i = 0; i < out.length; i++) res.push({ x: out[i].x, y: out[i].y, din: out[i].d, dout: i + 1 < out.length ? out[i + 1].d : out[i].d, bridge: i + 1 < out.length ? out[i + 1].bridge : 0 });
      return res;
    }
  };
  function turnSide(a, b) { return ((b - a + 4) & 3) === 1 ? 1 : -1; }
  // can a new rail tile go here? returns cost multiplier (>0) or 0
  function tileClass(g, cid, x, y, t, opt) {
    const m = g.map, k = m.type[t];
    if (m.bridgeOver[t] >= 0 && k !== T.CLEAR) return 0;
    if (opt.avoid && opt.avoid.has(t)) return 0;
    if (k === T.CLEAR) {
      let c = 1 + (m.trees[t] & 7) * 0.08 + (m.ground[t] === GR.ROCKS ? 0.6 : 0) + (m.ground[t] === GR.FIELD ? 0.3 : 0);
      if (m.tileMin(x, y) === 0 && m.isCoast(x, y)) c += 0.5;
      if (HL.Build.townAt(g, x, y, 1)) c += 1.2;
      return c;
    }
    if (k === T.ROAD) { const rb = m.road[t]; if ((rb === 5 || rb === 10) && !(m.m1[t] & 0xC000)) return 2.5; return 0; }
    return 0;
  }
  function tileTakesPiece(g, cid, x, y, p, rt, isStart, opt) {
    const m = g.map, t = m.t(x, y), k = m.type[t];
    if (k === T.CLEAR) return true;
    if (k === T.ROAD) { const rb = m.road[t]; return (p === 0 && rb === 5) || (p === 1 && rb === 10); }
    if (k === T.RAIL && m.owner[t] === cid) return isStart || true;
    if (k === T.STATION && isStart) return true;
    return isStart;
  }

  // lay a planned rail path; first/last tiles can be station tiles (skipped)
  AB.layRail = function (g, cid, path, rt, exec) {
    const m = g.map;
    let cost = 0;
    for (let i = 0; i < path.length; i++) {
      const p = path[i];
      const t = m.t(p.x, p.y);
      if (m.type[t] === T.STATION) continue;
      if (p.bridge) {
        const q = path[i + 1];
        const r = HL.Build.buildBridge(g, cid, p.x, p.y, q.x, q.y, 'rail', AB.bestBridge(g, p.bridge + 0, exec), rt, exec);
        if (!r.ok) return r;
        cost += r.cost;
        continue;
      }
      if (i > 0 && path[i - 1].bridge) continue; // landing head built with the bridge
      const piece = HL.pieceFor(HL.opp(p.din), p.dout);
      if (m.type[t] === T.RAIL && (m.rail[t] & (1 << piece))) continue;
      const r = HL.Build.buildRail(g, cid, p.x, p.y, piece, rt, exec);
      if (!r.ok) return Object.assign(r, { at: p });
      cost += r.cost;
    }
    return { ok: true, cost };
  };
  AB.bestBridge = function (g, len) {
    const yr = HL.ymd(g.date).y;
    let best = 0;
    for (let i = 0; i < HL.BRIDGES.length; i++) { const b = HL.BRIDGES[i]; if (yr >= b.intro && b.maxLen >= len + 0) { if (HL.BRIDGES[best].maxLen < len || b.speed > HL.BRIDGES[best].speed && b.cost < 2000) best = i; } }
    if (HL.BRIDGES[best].maxLen < len) for (let i = 0; i < HL.BRIDGES.length; i++) if (yr >= HL.BRIDGES[i].intro && HL.BRIDGES[i].maxLen >= len) return i;
    return best;
  };

  // ---------- rail stations ----------
  // candidate terminus sites near a rectangle (industry or town); returns [{x,y,axis,len,exit:{x,y,dir}}] best first
  AB.railStationSites = function (g, cid, rect, toward, len, rt, accepts, opt) {
    opt = opt || {};
    const m = g.map, out = [];
    const r = opt.radius || 3;
    for (let y = rect.y0 - r - len; y <= rect.y1 + r; y++) for (let x = rect.x0 - r - len; x <= rect.x1 + r; x++) {
      for (const axis of [0, 1]) {
        const w = axis === 0 ? len : 1, h = axis === 0 ? 1 : len;
        // must touch the catchment (radius 4) of the rectangle
        if (x > rect.x1 + 4 || x + w - 1 < rect.x0 - 4 || y > rect.y1 + 4 || y + h - 1 < rect.y0 - 4) continue;
        if (x + w - 1 >= rect.x0 && x <= rect.x1 && y + h - 1 >= rect.y0 && y <= rect.y1) continue;
        const res = S().buildRail(g, cid, x, y, axis, 1, len, rt, false);
        if (!res.ok) continue;
        // exits at either end
        const ends = axis === 0 ? [{ x: x + len, y, dir: 1 }, { x: x - 1, y, dir: 3 }] : [{ x, y: y + len, dir: 2 }, { x, y: y - 1, dir: 0 }];
        for (const e of ends) {
          if (!m.inside(e.x, e.y) || m.type[m.t(e.x, e.y)] !== T.CLEAR) continue;
          const d = HL.manh(e.x, e.y, toward.x, toward.y);
          const back = HL.manh(x, y, toward.x, toward.y) < d ? 6 : 0;
          out.push({ x, y, axis, len, exit: e, score: d + back + res.cost / (20000 * g.econ.costMul) });
        }
      }
    }
    out.sort((a, b) => a.score - b.score);
    return out.slice(0, opt.max || 6);
  };
  // depot next to the first tiles of a route, connected with curves both ways
  AB.placeRailDepot = function (g, cid, path, rt, exec) {
    const m = g.map;
    for (let i = 1; i < Math.min(path.length - 1, 10); i++) {
      const p = path[i];
      if (p.din !== p.dout || p.bridge || (i > 0 && path[i - 1].bridge)) continue;
      const t = m.t(p.x, p.y);
      if (m.type[t] !== T.RAIL || m.road[t]) continue;
      for (const side of [(p.din + 1) & 3, (p.din + 3) & 3]) {
        const dx = p.x + DX[side], dy = p.y + DY[side];
        if (!m.inside(dx, dy) || m.type[m.t(dx, dy)] !== T.CLEAR) continue;
        const dr = B().buildDepot(g, cid, dx, dy, 0, HL.opp(side), rt, false);
        if (!dr.ok) continue;
        if (!exec) return { ok: true, cost: dr.cost };
        const r = B().buildDepot(g, cid, dx, dy, 0, HL.opp(side), rt, true);
        if (!r.ok) continue;
        const edge = side; // edge of the track tile facing the depot
        B().buildRail(g, cid, p.x, p.y, HL.pieceFor(edge, p.din), rt, true);
        B().buildRail(g, cid, p.x, p.y, HL.pieceFor(edge, HL.opp(p.din)), rt, true);
        return { ok: true, cost: r.cost, depot: g.depots[m.idx[m.t(dx, dy)]] };
      }
    }
    return { ok: false, err: 'No depot spot' };
  };

  // ---------- road route ----------
  AB.planRoad = function (g, cid, sx, sy, gx, gy, opt) {
    opt = opt || {};
    const m = g.map, W = m.W;
    const open = new HL.Heap(), best = new Map(), prev = new Map();
    const s0 = sy * W + sx, goal = gy * W + gx;
    best.set(s0, 0); open.push(s0, 0);
    const h = (t) => HL.manh(t % W, (t / W) | 0, gx, gy);
    let exp = 0;
    const bridgeOf = new Map();
    while (open.size) {
      const t = open.pop();
      if (t === goal) break;
      if (++exp > (opt.maxExp || 30000)) return null;
      const x = t % W, y = (t / W) | 0, gc = best.get(t);
      const pd = prev.has(t) ? dirBetween(prev.get(t), t, W) : -1;
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d], ny = y + DY[d];
        if (!m.inside(nx, ny) || nx < 2 || ny < 2 || nx >= m.W - 2 || ny >= m.H - 2) continue;
        const n = ny * W + nx;
        let c = roadClass(g, cid, nx, ny, n, d, t, opt);
        if (c > 0 && roadClass(g, cid, x, y, t, d, -1, opt) >= 0) {
          if (pd >= 0 && pd !== d) c += 0.3;
          c += Math.abs(m.edgeMidH(x, y, d) - m.edgeMidH(nx, ny, d)) * 0.8;
          relax(t, n, gc + c, null);
        }
        // road bridge over water/rail
        if (c <= 0 && m.type[t] === T.CLEAR && opt.bridges !== false) {
          for (let L = 1; L <= 7; L++) {
            const bx = x + DX[d] * (L + 1), by = y + DY[d] * (L + 1);
            if (!m.inside(bx, by)) break;
            const bt = by * W + bx;
            if (m.type[bt] !== T.CLEAR) continue;
            const pl = HL.Build.planBridge(g, cid, x, y, bx, by, 'road');
            if (!pl.ok) continue;
            relax(t, bt, gc + 3 + L * 2.2, { d, L });
            break;
          }
        }
      }
    }
    if (!prev.has(goal) && s0 !== goal) return null;
    const path = []; let c = goal;
    while (c != null) { path.push(c); if (c === s0) break; c = prev.get(c); }
    path.reverse();
    return path.map(t => ({ x: t % W, y: (t / W) | 0, t, bridge: bridgeOf.get(t) || null }));
    function relax(from, n, ng, br) {
      if (best.has(n) && best.get(n) <= ng) return;
      best.set(n, ng); prev.set(n, from); open.push(n, ng + h(n));
      if (br) bridgeOf.set(from, br); else bridgeOf.delete(from);
    }
  };
  function dirBetween(a, b, W) { const dx = (b % W) - (a % W), dy = ((b / W) | 0) - ((a / W) | 0); return dx === 1 ? 1 : dx === -1 ? 3 : dy === 1 ? 2 : 0; }
  // cost of entering tile n moving d (>0 ok); for the from-tile check (prevT=-1) returns >=0 if usable
  function roadClass(g, cid, x, y, n, d, prevT, opt) {
    const m = g.map, k = m.type[n];
    if (opt.avoid && opt.avoid.has(n)) return 0;
    if (k === T.ROAD) { if (m.m1[n] & 0xC000) { const bt = HL.Build.bridgeOrTunnelAt(g, n); return bt && (bt.dir & 1) === (d & 1) ? 0.5 : 0; } return 0.45; }
    if (k === T.CLEAR) { if (m.bridgeOver[n] >= 0) return 0; return 1 + (m.trees[n] & 7) * 0.08 + (m.ground[n] === GR.ROCKS ? 0.5 : 0); }
    if (k === T.RAIL) { const r = m.rail[n]; if (m.road[n]) return 0.6; if ((r === 1 && (d === 0 || d === 2)) || (r === 2 && (d === 1 || d === 3))) return m.owner[n] === cid || true ? 3 : 0; return 0; }
    if (k === T.STATION) { const kk = m.m1[n] & 7; if ((kk === 1 || kk === 2) && (m.road[n] & (1 << HL.opp(d)))) return 0.6; return 0; }
    if (k === T.DEPOT) return prevT === -1 ? 0 : 0;
    return 0;
  }
  AB.layRoad = function (g, cid, path, exec) {
    const m = g.map;
    let cost = 0;
    for (let i = 0; i < path.length; i++) {
      const p = path[i];
      if (p.bridge) {
        const q = path[i + 1];
        const r = HL.Build.buildBridge(g, cid, p.x, p.y, q.x, q.y, 'road', AB.bestBridge(g, p.bridge.L), 0, exec);
        if (!r.ok) return r;
        cost += r.cost; continue;
      }
      if (i > 0 && path[i - 1].bridge) { // landing head: connect onward
        const nx = path[i + 1]; if (nx) { const d = dirBetween(p.t, nx.t, m.W); /* the head already has axis bits */ }
        continue;
      }
      let bits = 0;
      if (i > 0 && !path[i - 1].bridge) bits |= 1 << dirBetween(p.t, path[i - 1].t, m.W);
      if (i > 0 && path[i - 1].bridge) bits |= 0;
      if (i + 1 < path.length) bits |= 1 << dirBetween(p.t, path[i + 1].t, m.W);
      if (!bits) continue;
      const t = p.t;
      const k = m.type[t];
      if (k === T.STATION || k === T.DEPOT) continue;
      if ((k === T.ROAD || (k === T.RAIL && m.road[t])) && (m.road[t] & bits) === bits) continue;
      if (k === T.ROAD && (m.m1[t] & 0xC000)) continue;
      const r = HL.Build.buildRoad(g, cid, p.x, p.y, bits & ~m.road[t], exec);
      if (!r.ok && r.err !== 'Already built') return Object.assign(r, { at: p });
      cost += r.cost || 0;
    }
    return { ok: true, cost };
  };
  // a drive-through stop on/next to a road near rect; returns {x,y} or null (does not build)
  AB.roadStopSite = function (g, cid, rect, truck, opt) {
    opt = opt || {};
    const m = g.map;
    const r = opt.radius || 3;
    let best = null, bd = 1e9;
    for (let y = rect.y0 - r; y <= rect.y1 + r; y++) for (let x = rect.x0 - r; x <= rect.x1 + r; x++) {
      if (!m.inside(x, y)) continue;
      const t = m.t(x, y);
      const k = m.type[t];
      if (k === T.ROAD) {
        const rb = m.road[t]; if (rb !== 5 && rb !== 10) continue;
        if (m.rowner[t] !== cid && m.rowner[t] !== HL.OWNER_TOWN && m.rowner[t] !== HL.OWNER_NONE) continue;
        if (m.m1[t] & 0xC000) continue;
      } else if (k !== T.CLEAR) continue;
      if (x >= rect.x0 && x <= rect.x1 && y >= rect.y0 && y <= rect.y1) continue;
      const res = S().buildRoadStop(g, cid, x, y, truck, 0, false);
      if (!res.ok) continue;
      const cx = (rect.x0 + rect.x1) / 2, cy = (rect.y0 + rect.y1) / 2;
      const d = HL.manh(x, y, cx, cy) + (k === T.ROAD ? -2 : 0) + (opt.toward ? HL.manh(x, y, opt.toward.x, opt.toward.y) * 0.3 : 0);
      if (d < bd) { bd = d; best = { x, y, onRoad: k === T.ROAD, axis: k === T.ROAD ? (m.road[t] === 10 ? 0 : 1) : null }; }
    }
    return best;
  };
  AB.placeRoadDepot = function (g, cid, nearX, nearY, exec) {
    const m = g.map;
    for (let r = 1; r < 6; r++) for (let y = nearY - r; y <= nearY + r; y++) for (let x = nearX - r; x <= nearX + r; x++) {
      if (!m.inside(x, y)) continue;
      const t = m.t(x, y);
      if (m.type[t] !== T.ROAD || (m.m1[t] & 0xC000)) continue;
      for (let d = 0; d < 4; d++) {
        const dx = x + DX[d], dy = y + DY[d];
        if (!m.inside(dx, dy) || m.type[m.t(dx, dy)] !== T.CLEAR) continue;
        const res = B().buildDepot(g, cid, dx, dy, 1, HL.opp(d), 0, false);
        if (!res.ok) continue;
        const rr = B().buildRoad(g, cid, x, y, 1 << d, false);
        if (!rr.ok && rr.err !== 'Already built') continue;
        if (!exec) return { ok: true, cost: res.cost };
        B().buildDepot(g, cid, dx, dy, 1, HL.opp(d), 0, true);
        B().buildRoad(g, cid, x, y, 1 << d, true);
        return { ok: true, cost: res.cost, depot: g.depots[m.idx[m.t(dx, dy)]] };
      }
    }
    return { ok: false };
  };

  // ---------- vehicle choice ----------
  AB.bestEngine = function (g, cid, rt, freight, budget) {
    const yr = HL.ymd(g.date).y;
    let best = null, bs = -1;
    for (const m of Object.values(HL.VEH)) {
      if (m.kind !== 'rail' || !m.engine || !HL.vehAvailable(m, yr, g.unlockAll)) continue;
      if (!HL.railCompatible(m.rt, rt)) continue;
      const cost = HL.Game.vehCost(g, m);
      if (budget && cost > budget) continue;
      const score = freight ? m.power * 1 + m.speed * 4 : m.speed * 12 + m.power * 0.3;
      const rel = m.rel * (yr > m.intro + m.life ? 0.7 : 1);
      if (score * rel > bs) { bs = score * rel; best = m; }
    }
    return best;
  };
  AB.bestWagon = function (g, rt, cargo) {
    const yr = HL.ymd(g.date).y;
    let best = null;
    for (const m of Object.values(HL.VEH)) {
      if (!m.wagon || m.cargo !== cargo || !HL.vehAvailable(m, yr, g.unlockAll)) continue;
      if (!(m.rt === rt || (m.rt === 0 && rt === 1))) continue;
      if (!best || m.gen > best.gen) best = m;
    }
    return best;
  };
  AB.bestRoadVeh = function (g, cargo) {
    const yr = HL.ymd(g.date).y;
    let best = null;
    for (const m of Object.values(HL.VEH)) if (m.kind === 'road' && m.cargo === cargo && HL.vehAvailable(m, yr, g.unlockAll)) { if (!best || m.speed * m.cap * m.rel > best.speed * best.cap * best.rel) best = m; }
    return best;
  };
  AB.bestShip = function (g, cargo) {
    const yr = HL.ymd(g.date).y;
    let best = null;
    for (const m of Object.values(HL.VEH)) if (m.kind === 'ship' && (m.refit || [m.cargo]).includes(cargo) && HL.vehAvailable(m, yr, g.unlockAll)) { if (!best || m.speed * m.cap > best.speed * best.cap) best = m; }
    return best;
  };
  AB.bestPlane = function (g, maxSize, heli, budget) {
    const yr = HL.ymd(g.date).y;
    let best = null;
    for (const m of Object.values(HL.VEH)) {
      if (m.kind !== 'air' || !HL.vehAvailable(m, yr, g.unlockAll)) continue;
      if (heli ? !m.heli : m.heli) continue;
      if (!heli && m.size > maxSize) continue;
      if (budget && HL.Game.vehCost(g, m) > budget) continue;
      if (!best || m.speed * m.cap * m.rel > best.speed * best.cap * best.rel) best = m;
    }
    return best;
  };
})(typeof window !== 'undefined' ? window : globalThis);
