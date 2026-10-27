// Ships and aircraft.
(function (root) {
  const HL = root.HL;
  const T = HL.T;
  const V = () => HL.Veh;
  const TPD = HL.TICKS_PER_DAY;
  const K = 1 / (28 * TPD);

  // ================= ships =================
  const Ship = HL.Ship = {};
  Ship.passable = function (g, t, tgtT) {
    const m = g.map, ty = m.type[t];
    if (ty === T.WATER) return true;
    if (ty === T.STATION && (m.m1[t] & 7) === 5) return true; // buoy
    if (t === tgtT) return true;
    return false;
  };
  Ship.targetTile = function (g, tgt) {
    if (!tgt) return -1;
    if (tgt.kind === 'depot') { const d = g.depots[tgt.id]; return d ? d.t : -1; }
    const s = g.stations[tgt.id];
    if (!s) return -1;
    if (s.buoy) return g.map.t(s.x, s.y);
    return s.dock ? s.dock.water : -1;
  };
  Ship.findPath = function (g, from, to) {
    const m = g.map, W = m.W;
    if (from === to) return [to];
    const tx = m.tx(to), ty = m.ty(to);
    const h = (t) => { const dx = Math.abs(m.tx(t) - tx), dy = Math.abs(m.ty(t) - ty); return Math.max(dx, dy) + 0.414 * Math.min(dx, dy); };
    const open = new HL.Heap(), best = new Map(), prev = new Map();
    best.set(from, 0); open.push(from, h(from));
    const D8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    let exp = 0;
    while (open.size) {
      const t = open.pop();
      if (t === to) break;
      if (++exp > 60000) return null;
      const x = t % W, y = (t / W) | 0, gc = best.get(t);
      for (const [dx, dy] of D8) {
        const nx = x + dx, ny = y + dy;
        if (!m.inside(nx, ny)) continue;
        const n = ny * W + nx;
        if (!Ship.passable(g, n, to)) continue;
        if (dx && dy && (!Ship.passable(g, y * W + nx, to) || !Ship.passable(g, ny * W + x, to))) continue;
        const c = gc + (dx && dy ? 1.414 : 1);
        if (best.has(n) && best.get(n) <= c) continue;
        best.set(n, c); prev.set(n, t); open.push(n, c + h(n));
      }
    }
    if (!prev.has(to)) return null;
    const path = []; let c = to;
    while (c !== from && c != null) { path.push(c); c = prev.get(c); }
    return path.reverse();
  };
  // string-pull the tile path into a few waypoints
  function smooth(g, startX, startY, tiles, tgtT) {
    const m = g.map;
    const pts = tiles.map(t => [m.tx(t) + 0.5, m.ty(t) + 0.5]);
    const out = [];
    let cx = startX, cy = startY, i = 0;
    while (i < pts.length) {
      let j = pts.length - 1;
      for (; j > i; j--) if (clear(g, cx, cy, pts[j][0], pts[j][1], tgtT)) break;
      out.push(pts[j]); cx = pts[j][0]; cy = pts[j][1]; i = j + 1;
    }
    return out;
  }
  function clear(g, ax, ay, bx, by, tgtT) {
    const m = g.map, L = Math.hypot(bx - ax, by - ay), n = Math.ceil(L / 0.2);
    for (let k = 0; k <= n; k++) {
      const x = ax + (bx - ax) * k / n, y = ay + (by - ay) * k / n;
      for (const [ox, oy] of [[0.28, 0], [-0.28, 0], [0, 0.28], [0, -0.28]]) {
        const tx = Math.floor(x + ox), ty = Math.floor(y + oy);
        if (!m.inside(tx, ty) || !Ship.passable(g, m.t(tx, ty), tgtT)) return false;
      }
    }
    return true;
  }
  Ship.leaveDepot = function (g, v) {
    const d = g.depots[v.depot];
    if (!d) { v.stopped = true; return; }
    v.px = d.x + 0.5 + HL.DX[d.dir] * 0.6; v.py = d.y + 0.5 + HL.DY[d.dir] * 0.6; v.pz = 0;
    v.yaw = Math.atan2(HL.DY[d.dir], HL.DX[d.dir]);
    v.inDepot = false; v.state = 'run'; v.speed = 0; v.wp = null;
    HL.emit('leaveDepot', v);
  };
  Ship.tick = function (g, v) {
    const m = HL.VEH[v.model];
    const tgt = V().target(g, v);
    const tk = tgt ? tgt.kind + tgt.id : 'none';
    const tT = Ship.targetTile(g, tgt);
    if (v.tgtKey !== tk || !v.wp) {
      v.tgtKey = tk; v.wp = [];
      if (tT >= 0 && (!v.noPathUntil || v.noPathUntil < g.ticks)) {
        const cur = g.map.t(Math.floor(v.px), Math.floor(v.py));
        const tiles = Ship.findPath(g, cur, tT);
        if (tiles) { v.wp = smooth(g, v.px, v.py, tiles, tT); v.lostSince = 0; }
        else {
          v.noPathUntil = g.ticks + TPD * 3; v.lostSince = v.lostSince || g.date;
          if (g.date - v.lostSince > 60 && !v.lostNews && v.owner === g.player) { v.lostNews = true; HL.Game.news(g, 'advice', V().displayName(v) + ' is lost', 'There is no sea route to its next destination.', { veh: v.id, cid: v.owner }); }
        }
      }
    }
    let vmax = m.speed * (v.slow ? 0.5 : 1);
    const wp = v.wp[0];
    if (!wp) { v.speed = Math.max(0, v.speed - 0.5); bob(v, g); return; }
    const dx = wp[0] - v.px, dy = wp[1] - v.py, d = Math.hypot(dx, dy);
    const last = v.wp.length === 1;
    // turn toward the waypoint
    const want = Math.atan2(dy, dx);
    let da = want - v.yaw; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
    const turn = 0.03 + 0.02 * (1 - Math.min(1, v.speed / m.speed));
    v.yaw += HL.clamp(da, -turn, turn);
    if (Math.abs(da) > 1.2) vmax *= 0.3;
    if (last) vmax = Math.min(vmax, Math.max(6, Math.sqrt(2 * 0.4 * d / K)));
    if (v.speed < vmax) v.speed = Math.min(vmax, v.speed + m.speed / (3 * TPD)); else v.speed = Math.max(vmax, v.speed - 0.6);
    const mv = v.speed * K;
    v.px += Math.cos(v.yaw) * mv; v.py += Math.sin(v.yaw) * mv;
    bob(v, g);
    if (d < (last ? 0.25 : 0.5)) {
      v.wp.shift();
      if (last) {
        if (tgt && tgt.kind === 'depot') { V().enterDepot(g, v, g.depots[tgt.id]); return; }
        if (tgt && tgt.kind === 'st') {
          const s = g.stations[tgt.id];
          if (tgt.via || s.buoy) { V().depart(g, v); v.wp = null; return; }
          v.speed = 0; V().arrive(g, v, s, tgt.order); v.wp = null; return;
        }
      }
    }
  };
  function bob(v, g) { v.pz = Math.sin(g.ticks * 0.05 + v.id) * 0.25; v.pitch = Math.sin(g.ticks * 0.04 + v.id * 3) * 0.02; }

  // ================= aircraft =================
  const Air = HL.Air = {};
  const CRUISE = 30; // levels
  // airport geometry in local tile units
  const GEO = {
    strip: { rwV: 2.5, taxiV: 1.5, stands: [[0.5, 1.5], [3.5, 1.5]], hangar: [0.5, 0.5], exitU: 3.4, startU: 0.3 },
    heli: { pad: true, stands: [[0.5, 0.5]], hangar: [0.5, 0.5] },
    city: { rwV: 4.5, taxiV: 3.5, apronV: 2.5, stands: [[0.5, 1.5], [1.5, 1.5], [2.5, 1.5], [3.5, 1.5]], hangar: [5.5, 0.5], exitU: 5.4, startU: 0.3 },
    intl: { rwV: 6.5, rw2V: 0.5, taxiV: 5.5, apronV: 4.5, stands: [[1.5, 3.5], [2.5, 3.5], [3.5, 3.5], [4.5, 3.5], [5.5, 3.5], [6.5, 3.5]], hangar: [1.5, 2.5], exitU: 7.4, startU: 0.3, sideU: 7.5, side2U: 0.5 },
  };
  Air.GEO = GEO;
  const apAbs = (ap, p) => [ap.x + p[0], ap.y + p[1]];
  Air.release = function (g, v) {
    const s = g.stations[v.airSt];
    if (s && s.airport) {
      const ap = s.airport;
      for (let i = 0; i < ap.stands.length; i++) if (ap.stands[i] === v.id) ap.stands[i] = -1;
      if (ap.runwayBy === v.id) ap.runwayBy = -1;
      if (ap.runway2By === v.id) ap.runway2By = -1;
    }
  };
  function geo(s) { return GEO[s.airport.type]; }
  function groundZ(g, s) { return g.map.tileMax(s.airport.x, s.airport.y); }
  function cruiseZ(g) { if (g._cruise == null) { let mx = 0; for (let i = 0; i < g.map.h.length; i += 7) mx = Math.max(mx, g.map.h[i]); g._cruise = mx + 18; } return g._cruise; }
  function freeStand(s, v) {
    const ap = s.airport;
    for (let i = 0; i < ap.stands.length; i++) if (ap.stands[i] === v.id) return i;
    for (let i = 0; i < ap.stands.length; i++) if (ap.stands[i] === -1 || ap.stands[i] == null) return i;
    return -1;
  }
  function runwayFree(g, s, v, two) {
    const ap = s.airport, k = two ? 'runway2By' : 'runwayBy';
    if (ap[k] == null || ap[k] === -1 || ap[k] === v.id) return true;
    const o = g.vehicles[ap[k]];
    if (!o || o.airSt !== s.id) { ap[k] = -1; return true; }
    return false;
  }
  function takeRunway(s, v, two) { s.airport[two ? 'runway2By' : 'runwayBy'] = v.id; }
  function freeRunway(s, v) { const ap = s.airport; if (ap.runwayBy === v.id) ap.runwayBy = -1; if (ap.runway2By === v.id) ap.runway2By = -1; }
  function isHeli(v) { return !!HL.VEH[v.model].heli; }
  function speedOf(v) { const m = HL.VEH[v.model]; return m.speed * HL.PLANE_SPEED * (v.slowFlight ? 0.6 : 1); }

  // taxi path within airport (local points) from current point to a stand / runway start / hangar
  function taxiTo(s, from, kind, idx) {
    const G = geo(s), ap = s.airport;
    if (G.pad) return [[0.5, 0.5]];
    const pts = [];
    const lane = G.apronV != null ? G.apronV : G.taxiV;
    if (kind === 'stand') {
      const st = G.stands[idx];
      if (ap.type === 'intl') pts.push([from[0], G.taxiV], [G.sideU, G.taxiV], [G.sideU, lane], [st[0], lane], st);
      else pts.push([from[0], lane], [st[0], lane], st);
    } else if (kind === 'hangar') {
      const h = G.hangar;
      if (ap.type === 'intl') pts.push([from[0], lane], [G.side2U, lane], [G.side2U, h[1]], h);
      else pts.push([from[0], lane], [h[0], lane], h);
    } else if (kind === 'runway') {
      if (ap.type === 'intl') pts.push([from[0], lane], [G.side2U, lane], [G.side2U, G.rw2V + 1], [G.startU, G.rw2V]);
      else pts.push([from[0], lane], [G.startU, lane], [G.startU, G.rwV]);
    }
    return pts;
  }
  Air.tick = function (g, v) {
    const st = v.airState;
    const s = g.stations[v.airSt];
    if (!s || !s.airport) {
      // home airport gone: fly to the target if airborne, otherwise wait
      if (st === 'fly' || st === 'hold') { /* continue below */ } else { v.speed = 0; return; }
    }
    switch (st) {
      case 'hangar': return hangarTick(g, v, s);
      case 'taxi': return taxiTick(g, v, s);
      case 'stand': if (v.state === 'load') V().loadTick(g, v); return;
      case 'takeoff': return takeoffTick(g, v, s);
      case 'fly': case 'hold': return flyTick(g, v);
      case 'land': return landTick(g, v, s);
    }
  };
  function hangarTick(g, v, s) {
    if (v.stopped) return;
    const tgt = V().target(g, v);
    if (!tgt) return;
    v.inDepot = false;
    const ap = s.airport, G = geo(s);
    const here = G.hangar;
    if (tgt.kind === 'st' && tgt.id === s.id && !tgt.via) {
      const i = freeStand(s, v); if (i < 0) return;
      ap.stands[i] = v.id; v.standIdx = i;
      v.taxi = taxiTo(s, here, 'stand', i); v.taxiGoal = 'stand';
    } else {
      v.taxi = isHeli(v) ? [here] : taxiTo(s, here, 'runway'); v.taxiGoal = 'runway';
    }
    v.state = 'run'; v.airState = 'taxi';
    const p = apAbs(ap, here); v.px = p[0]; v.py = p[1]; v.pz = groundZ(g, s); v.speed = 0;
    HL.emit('leaveDepot', v);
  }
  function taxiTick(g, v, s) {
    const ap = s.airport;
    const goal = v.taxi && v.taxi[0];
    if (!goal) return taxiDone(g, v, s);
    const p = apAbs(ap, goal);
    const dx = p[0] - v.px, dy = p[1] - v.py, d = Math.hypot(dx, dy);
    // wait at the runway hold point until it's free
    if (v.taxiGoal === 'runway' && v.taxi.length === 1 && !isHeli(v) && !runwayFree(g, s, v, ap.type === 'intl')) { v.speed = 0; return; }
    const sp = 0.012 * (isHeli(v) ? 1.2 : 1);
    if (d < sp) { v.px = p[0]; v.py = p[1]; v.taxi.shift(); if (!v.taxi.length) taxiDone(g, v, s); return; }
    v.yaw = turnToward(v.yaw, Math.atan2(dy, dx), 0.12);
    v.px += dx / d * sp; v.py += dy / d * sp; v.pz = groundZ(g, s); v.speed = 40;
  }
  function taxiDone(g, v, s) {
    if (v.taxiGoal === 'stand') {
      v.airState = 'stand';
      const tgt = V().target(g, v);
      V().arrive(g, v, s, tgt ? tgt.order : null);
      return;
    }
    if (v.taxiGoal === 'hangar') {
      v.airState = 'hangar'; freeRunway(s, v);
      for (let i = 0; i < s.airport.stands.length; i++) if (s.airport.stands[i] === v.id) s.airport.stands[i] = -1;
      v.hangarSt = s.id; V().enterDepot(g, v, null); return;
    }
    // runway start
    if (isHeli(v)) { v.airState = 'takeoff'; v.climb = 0; return; }
    takeRunway(s, v, s.airport.type === 'intl');
    v.airState = 'takeoff'; v.speed = 0; v.yaw = 0;
  }
  function takeoffTick(g, v, s) {
    const m = HL.VEH[v.model];
    const ap = s.airport;
    const gz = groundZ(g, s);
    if (isHeli(v)) {
      v.pz += 0.12; v.speed = 0;
      if (v.pz > gz + 10) { leaveAirport(g, v, s); }
      return;
    }
    const vmax = speedOf(v);
    v.speed = Math.min(vmax, v.speed + vmax / (0.6 * TPD));
    v.px += v.speed * K; v.yaw = 0;
    const roll = v.px - ap.x;
    if (roll > ap.w * 0.55) v.pz += (v.speed * K) * 3.2;
    else v.pz = gz;
    if (v.pz > gz + 4) leaveAirport(g, v, s);
  }
  function leaveAirport(g, v, s) {
    freeRunway(s, v);
    for (let i = 0; i < s.airport.stands.length; i++) if (s.airport.stands[i] === v.id) s.airport.stands[i] = -1;
    v.airState = 'fly';
    v.state = 'run';
  }
  function approachPoint(g, s, v) {
    const ap = s.airport, G = geo(s);
    if (isHeli(v) || G.pad) { const st = G.pad ? [0.5, 0.5] : G.stands[0]; return [ap.x + st[0], ap.y + st[1]]; }
    return [ap.x - 2.5, ap.y + G.rwV];
  }
  function flyTick(g, v) {
    const tgt = V().target(g, v);
    let s = null;
    if (tgt && tgt.kind === 'st') s = g.stations[tgt.id];
    if (v.goDepot && v.goDepot.hangar) {
      // service at the nearest own airport with a hangar
      let best = null, bd = 1e9;
      for (const o of g.stations) if (o && o.owner === v.owner && o.airport && V().stationKindOk(g, v, o)) { const d = HL.dist(v.px, v.py, o.x, o.y); if (d < bd) { bd = d; best = o; } }
      s = best;
    }
    const cz = cruiseZ(g);
    if (!s || !s.airport) {
      // circle where we are
      v.yaw += 0.02; v.px += Math.cos(v.yaw) * speedOf(v) * K; v.py += Math.sin(v.yaw) * speedOf(v) * K;
      v.pz = Math.min(cz, v.pz + 0.1); return;
    }
    const big = HL.VEH[v.model].size;
    const A = approachPoint(g, s, v);
    const dx = A[0] - v.px, dy = A[1] - v.py, d = Math.hypot(dx, dy);
    const sp = speedOf(v) * K;
    v.speed = speedOf(v);
    // climb/descend toward cruise, start descending near the target
    const wantZ = d < 10 ? groundZ(g, s) + 6 + d * 1.2 : cz;
    v.pz += HL.clamp(wantZ - v.pz, -0.12, 0.12);
    if (d < 3.2) {
      // ask for a slot
      const i = v.goDepot && v.goDepot.hangar ? -2 : freeStand(s, v);
      const rwOk = isHeli(v) || runwayFree(g, s, v, false);
      if ((i >= 0 || i === -2) && rwOk) {
        if (i >= 0) { s.airport.stands[i] = v.id; v.standIdx = i; }
        v.airSt = s.id;
        if (!isHeli(v)) takeRunway(s, v, false);
        v.airState = 'land'; v.landFrom = [v.px, v.py, v.pz];
        v.goingHangar = i === -2;
        return;
      }
      // hold: circle the airport
      v.airState = 'hold';
      const cx = s.x, cy = s.y;
      const ang = Math.atan2(v.py - cy, v.px - cx) + sp / 4;
      const tx = cx + Math.cos(ang) * 4, ty = cy + Math.sin(ang) * 4;
      v.yaw = turnToward(v.yaw, Math.atan2(ty - v.py, tx - v.px), 0.05);
      v.px += Math.cos(v.yaw) * sp; v.py += Math.sin(v.yaw) * sp;
      return;
    }
    v.airState = 'fly';
    v.yaw = turnToward(v.yaw, Math.atan2(dy, dx), 0.04);
    v.px += Math.cos(v.yaw) * sp; v.py += Math.sin(v.yaw) * sp;
  }
  function landTick(g, v, s) {
    const ap = s.airport, G = geo(s);
    const gz = groundZ(g, s);
    if (isHeli(v) || G.pad) {
      const st = G.pad ? [0.5, 0.5] : (v.goingHangar ? G.hangar : G.stands[v.standIdx]);
      const p = apAbs(ap, st);
      const dx = p[0] - v.px, dy = p[1] - v.py, d = Math.hypot(dx, dy);
      if (d > 0.05) { const sp = Math.min(d, 0.04); v.px += dx / d * sp; v.py += dy / d * sp; v.yaw = turnToward(v.yaw, Math.atan2(dy, dx), 0.08); }
      else { v.pz -= 0.1; if (v.pz <= gz) { v.pz = gz; v.speed = 0; if (v.goingHangar) { v.airState = 'hangar'; v.hangarSt = s.id; V().enterDepot(g, v, null); } else { v.airState = 'stand'; const tgt = V().target(g, v); V().arrive(g, v, s, tgt ? tgt.order : null); } } }
      return;
    }
    // glide down to the touchdown point, then roll to the far end
    const td = [ap.x + 0.4, ap.y + G.rwV];
    if (!v.touched) {
      const dx = td[0] - v.px, dy = td[1] - v.py, d = Math.hypot(dx, dy);
      const sp = Math.max(0.03, speedOf(v) * K * 0.7);
      v.yaw = turnToward(v.yaw, Math.atan2(dy, dx), 0.08);
      v.px += Math.cos(v.yaw) * sp; v.py += Math.sin(v.yaw) * sp;
      const zTarget = gz + Math.max(0, d * 0.9);
      v.pz += HL.clamp(zTarget - v.pz, -0.25, 0.1);
      if (d < 0.15) {
        v.touched = true; v.pz = gz; v.speed = speedOf(v) * 0.7; v.yaw = 0;
        HL.emit('touchdown', v);
        // big jets at small airports may overrun
        const m = HL.VEH[v.model], at = HL.Stations.airportType(ap.type);
        if (m.size > at.size && g.diff.crashes && g.rng.chance(1 / 25)) { V().crash(g, v, 'Plane crash! ' + V().displayName(v) + ' overruns the runway at ' + s.name); HL.emit('explosion', v.px, v.py, v.pz); freeRunway(s, v); Air.release(g, v); }
      }
      return;
    }
    v.speed = Math.max(30, v.speed - 4);
    v.px += v.speed * K; v.pz = gz;
    if (v.px >= ap.x + G.exitU) {
      v.touched = false;
      freeRunway(s, v);
      v.airState = 'taxi';
      if (v.goingHangar) { v.taxi = taxiTo(s, [G.exitU, G.rwV], 'hangar'); v.taxiGoal = 'hangar'; }
      else { v.taxi = taxiTo(s, [G.exitU, G.rwV], 'stand', v.standIdx); v.taxiGoal = 'stand'; }
      if (ap.type === 'intl') v.taxi.unshift([G.exitU, G.taxiV]);
    }
  }
  // after loading, head for the runway
  Air.onDepart = function (g, v) {
    if (v.airState !== 'stand') return;
    const s = g.stations[v.airSt];
    if (!s || !s.airport) { v.airState = 'fly'; return; }
    const G = geo(s);
    const from = G.pad ? [0.5, 0.5] : G.stands[v.standIdx] || G.stands[0];
    v.airState = 'taxi';
    v.taxi = isHeli(v) ? [from] : taxiTo(s, from, 'runway'); v.taxiGoal = 'runway';
    v.slowFlight = false;
  };
  function turnToward(a, b, r) { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + HL.clamp(d, -r, r); }
})(typeof window !== 'undefined' ? window : globalThis);
