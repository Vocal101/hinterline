// Construction: every command returns {ok, cost, err} and only changes the world when exec is true.
(function (root) {
  const HL = root.HL;
  const T = HL.T, GR = HL.GR;
  const B = HL.Build = {};
  const Game = HL.Game;

  const C = HL.COST = {
    clearGrass: 20, clearRough: 40, clearRocks: 140, clearField: 60, clearTree: 30, clearDirt: 10,
    terraform: 240, rail: 130, road: 95, signal: 420, railStation: 700, roadStop: 1100, dock: 2400, buoy: 800,
    railDepot: 1800, roadDepot: 1400, shipDepot: 2600, removeRail: 30, removeRoad: 25, houseBase: 1200, tunnel: 2100, plantTree: 60,
    convertRail: 110, hq: 25000, statue: 0,
  };
  HL.BRIDGES = [
    { name: 'Timber Trestle', speed: 64, cost: 420, maxLen: 6, intro: 0, art: 'timber' },
    { name: 'Stone Viaduct', speed: 160, cost: 980, maxLen: 10, intro: 0, art: 'stone' },
    { name: 'Steel Girder', speed: 120, cost: 760, maxLen: 14, intro: 1885, art: 'girder' },
    { name: 'Truss Bridge', speed: 176, cost: 1150, maxLen: 20, intro: 1905, art: 'truss' },
    { name: 'Suspension Bridge', speed: 240, cost: 1800, maxLen: 40, intro: 1928, art: 'suspension' },
    { name: 'Cable-stayed Bridge', speed: 420, cost: 2700, maxLen: 50, intro: 1978, art: 'cable' },
    { name: 'Glass Tube Bridge', speed: 680, cost: 3600, maxLen: 64, intro: 2020, art: 'tube' },
  ];
  const OK = (cost) => ({ ok: true, cost: cost || 0 });
  const ERR = (err) => ({ ok: false, cost: 0, err });
  B.ERR = ERR; B.OK = OK;

  const inf = (g, cid) => { g.infra = g.infra || {}; return g.infra[cid] || (g.infra[cid] = { rail: 0, road: 0, signals: 0, bridgeTiles: 0, tunnelTiles: 0 }); };
  B.infra = inf;
  const bits = (v) => { let n = 0; while (v) { n += v & 1; v >>= 1; } return n; };
  B.bits = bits;
  const ownerName = (g, o) => o === HL.OWNER_TOWN ? 'the local authority' : g.companies[o] ? g.companies[o].name : 'someone else';

  // nearest town whose influence covers tile
  B.townAt = function (g, x, y, extra) {
    let best = null, bd = 1e9;
    for (const tw of g.towns) {
      if (!tw) continue;
      const d = HL.manh(x, y, tw.x, tw.y);
      if (d <= tw.radius + (extra || 0) && d < bd) { bd = d; best = tw; }
    }
    return best;
  };
  B.closestTown = function (g, x, y) {
    let best = null, bd = 1e9;
    for (const tw of g.towns) { if (!tw) continue; const d = HL.manh(x, y, tw.x, tw.y); if (d < bd) { bd = d; best = tw; } }
    return best;
  };
  function townRating(g, cid, x, y, delta, min) {
    if (cid == null || cid >= 250) return;
    const tw = B.townAt(g, x, y);
    if (tw) HL.Towns.changeRating(g, tw, cid, delta, min);
  }

  // ---------- clearing ----------
  // Cost to make a tile CLEAR (trees, rocks, fields...). Does not demolish buildings or infrastructure.
  B.clearGroundCost = function (g, t) {
    const m = g.map;
    let c = 0;
    const gk = m.ground[t];
    c += gk === GR.ROCKS ? C.clearRocks : gk === GR.ROUGH ? C.clearRough : gk === GR.FIELD ? C.clearField : gk === GR.DIRT ? C.clearDirt : C.clearGrass;
    c += (m.trees[t] & 7) * C.clearTree;
    return Game.cost(g, c);
  };
  B.clearGround = function (g, cid, t) {
    const m = g.map;
    if (m.trees[t] & 7) townRating(g, cid, m.tx(t), m.ty(t), -12 * (m.trees[t] & 7), -400);
    m.trees[t] = 0;
    if (m.ground[t] !== GR.SAND && m.ground[t] !== GR.BEACH) { m.ground[t] = GR.DIRT; m.gdens[t] = 0; }
    m.mark(t);
  };

  // Full demolish of one tile by a company
  B.demolish = function (g, cid, x, y, exec) {
    const m = g.map; if (!m.inside(x, y)) return ERR('Off the map');
    const t = m.t(x, y), ty = m.type[t];
    switch (ty) {
      case T.CLEAR: {
        if (!(m.trees[t] & 7) && (m.ground[t] === GR.DIRT || m.ground[t] === GR.GRASS && m.gdens[t] === 0)) return ERR('Already clear');
        const cost = B.clearGroundCost(g, t);
        if (exec) B.clearGround(g, cid, t);
        return OK(cost);
      }
      case T.WATER: return ERR('Can\'t demolish water');
      case T.HOUSE: {
        const tw = g.towns[m.idx[t]];
        if (tw && HL.Towns.ratingOf(tw, cid) < -200 && tw.authorityStrict) return ERR('Local authority refuses to allow this');
        const tier = HL.Towns.houseTier(m, t);
        const cost = Game.cost(g, C.houseBase * Math.pow(1.6, tier));
        if (exec) { HL.Towns.removeHouse(g, t); townRating(g, cid, x, y, -60 - tier * 25, -600); }
        return OK(cost);
      }
      case T.IND: return ERR('Can\'t demolish an industry');
      case T.OBJECT: {
        const o = g.objects[m.idx[t]];
        if (o && o.kind === 'hq' && o.owner === cid) { if (exec) B.removeObject(g, o); return OK(Game.cost(g, 2000)); }
        if (o && o.kind === 'statue') return ERR('The town would never forgive you');
        return ERR('Can\'t demolish this');
      }
      case T.RAIL: {
        if (m.owner[t] !== cid) return ERR('Owned by ' + ownerName(g, m.owner[t]));
        const head = B.bridgeOrTunnelAt(g, t);
        if (head) return B.removeBridgeOrTunnel(g, cid, head, exec);
        let cost = 0;
        for (let p = 0; p < 6; p++) if (m.rail[t] & (1 << p)) { const r = B.removeRail(g, cid, x, y, p, exec); if (!r.ok) return r; cost += r.cost; }
        return OK(cost);
      }
      case T.ROAD: {
        const head = B.bridgeOrTunnelAt(g, t);
        if (head) { if (head.owner !== cid) return ERR('Owned by ' + ownerName(g, head.owner)); return B.removeBridgeOrTunnel(g, cid, head, exec); }
        if (m.owner[t] !== cid && m.rowner[t] !== cid) return ERR('Owned by ' + ownerName(g, m.rowner[t]));
        return B.removeRoad(g, cid, x, y, m.road[t], exec);
      }
      case T.STATION: return HL.Stations.removeTile(g, cid, x, y, exec);
      case T.DEPOT: return B.removeDepot(g, cid, x, y, exec);
    }
    return ERR('Can\'t demolish');
  };

  // ---------- leveling for structures that need flat land ----------
  function proxyMap(m) {
    return { W: m.W, H: m.H, h: m.h.slice(), inside: m.inside, t: m.t, tx: m.tx, ty: m.ty, ch: m.ch, corners: m.corners, tileMax: m.tileMax, tileMin: m.tileMin };
  }
  // Plan leveling rectangle of tiles [x0..x1]x[y0..y1] to height th (or best guess). Returns {ok, corners: Map, tiles: Set, cost, h}
  B.planLevel = function (g, x0, y0, x1, y1, th, allowOutside) {
    const m = g.map;
    if (th == null) {
      // try each height present in the area and keep the cheapest that works
      const hs = new Set();
      for (let y = y0; y <= y1 + 1; y++) for (let x = x0; x <= x1 + 1; x++) hs.add(Math.max(1, m.ch(x, y)));
      let best = null;
      for (const h of hs) { const p = B.planLevel(g, x0, y0, x1, y1, h, allowOutside); if (p.ok && (!best || p.cost < best.cost)) best = p; else if (!best || !best.ok) best = best && best.ok ? best : p; }
      return best;
    }
    if (th === 'mode') {
      // most common corner height
      const cnt = {};
      for (let y = y0; y <= y1 + 1; y++) for (let x = x0; x <= x1 + 1; x++) { const h = m.ch(x, y); cnt[h] = (cnt[h] || 0) + 1; }
      th = +Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a] || b - a)[0];
      if (th === 0) th = 1; // keep structures above the waterline
    }
    const pm = proxyMap(m);
    const changed = new Map();
    const tiles = new Set();
    let guard = 0;
    for (let y = y0; y <= y1 + 1; y++) for (let x = x0; x <= x1 + 1; x++) {
      while (pm.h[y * (m.W + 1) + x] !== th && guard++ < 2000) {
        const d = pm.h[y * (m.W + 1) + x] < th ? 1 : -1;
        const p = HL.planTerraform(pm, x, y, d);
        if (!p.ok) return { ok: false, err: p.err };
        for (const [cx, cy, v] of p.corners) { pm.h[cy * (m.W + 1) + cx] = v; changed.set(cy * (m.W + 1) + cx, v); }
        for (const tt of p.tiles) tiles.add(tt);
      }
    }
    let n = 0;
    for (const [k, v] of changed) if (m.h[k] !== v) n += Math.abs(m.h[k] - v);
    // tiles outside the rectangle that would change must be plain land
    for (const tt of tiles) {
      const tx = m.tx(tt), ty = m.ty(tt);
      const inside = tx >= x0 && tx <= x1 && ty >= y0 && ty <= y1;
      if (inside) continue;
      const k = m.type[tt];
      if (k !== T.CLEAR && !(allowOutside && (k === T.RAIL || k === T.ROAD) && !B.bridgeOrTunnelAt(g, tt))) return { ok: false, err: 'The earthworks would reach ' + (k === T.HOUSE ? 'a town building' : k === T.IND ? 'an industry' : k === T.WATER ? 'the water' : k === T.STATION ? 'a station' : 'something') + '. Try flatter ground.' };
      if (m.bridgeOver[tt] >= 0) return { ok: false, err: 'Bridge in the way' };
    }
    return { ok: true, corners: changed, tiles, cost: Game.cost(g, n * C.terraform), h: th };
  };
  B.applyLevel = function (g, plan) {
    const m = g.map, W1 = m.W + 1;
    for (const [k, v] of plan.corners) m.h[k] = v;
    for (const t of plan.tiles) { const x = m.tx(t), y = m.ty(t); m.markArea(x - 1, y - 1, x + 1, y + 1); if (m.type[t] === T.WATER && m.tileMax(x, y) > 0) { m.type[t] = T.CLEAR; m.owner[t] = HL.OWNER_NONE; m.ground[t] = GR.BEACH; } }
    HL.floodFrom(m, plan.tiles);
    g.blocksDirty = true;
  };

  // ---------- terraform tool ----------
  B.terraform = function (g, cid, cx, cy, delta, exec) {
    const m = g.map;
    const plan = HL.planTerraform(m, cx, cy, delta);
    if (!plan.ok) return ERR(plan.err);
    let cost = Game.cost(g, plan.cost * C.terraform);
    for (const t of plan.tiles) {
      const k = m.type[t];
      const x = m.tx(t), y = m.ty(t);
      if (k === T.CLEAR || k === T.WATER) { if (m.trees[t] & 7) cost += Game.cost(g, (m.trees[t] & 7) * C.clearTree); continue; }
      if ((k === T.RAIL || k === T.ROAD) && !B.bridgeOrTunnelAt(g, t)) continue;
      return ERR(k === T.HOUSE ? 'Building in the way' : k === T.IND ? 'Industry in the way' : k === T.STATION ? 'Station in the way' : k === T.DEPOT ? 'Depot in the way' : 'Something in the way');
    }
    // bridge clearance and tunnel cover
    const W1 = m.W + 1;
    const newH = new Map(plan.corners.map(([x, y, v]) => [y * W1 + x, v]));
    const hAt = (x, y) => newH.has(y * W1 + x) ? newH.get(y * W1 + x) : m.ch(x, y);
    for (const t of plan.tiles) {
      const bo = m.bridgeOver[t];
      if (bo >= 0) { const br = g.bridges[bo]; const x = m.tx(t), y = m.ty(t); const mx = Math.max(hAt(x, y), hAt(x + 1, y), hAt(x + 1, y + 1), hAt(x, y + 1)); if (mx > br.h - 1) return ERR('Bridge in the way'); }
      for (const tn of g.tunnels) {
        if (!tn) continue;
        const x = m.tx(t), y = m.ty(t);
        if (B.tunnelUnder(g, tn, x, y)) { const mn = Math.min(hAt(x, y), hAt(x + 1, y), hAt(x + 1, y + 1), hAt(x, y + 1)); if (mn < tn.h + 1) return ERR('Tunnel in the way'); }
      }
    }
    if (exec) {
      for (const t of plan.tiles) if (m.trees[t] & 7) B.clearGround(g, cid, t);
      HL.applyTerraform(m, plan);
      g.blocksDirty = true;
      HL.emit('terraform', plan);
    }
    return OK(cost);
  };
  // level an area to the height of the first corner
  B.levelArea = function (g, cid, x0, y0, x1, y1, th, exec) {
    const m = g.map;
    if (x0 > x1) [x0, x1] = [x1, x0]; if (y0 > y1) [y0, y1] = [y1, y0];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const k = m.type[m.t(x, y)]; if (k !== T.CLEAR && k !== T.WATER && k !== T.RAIL && k !== T.ROAD) return ERR('Something in the way'); }
    const plan = B.planLevel(g, x0, y0, x1, y1, th, true);
    if (!plan.ok) return ERR(plan.err);
    if (!plan.corners.size) return ERR('Already level');
    if (exec) B.applyLevel(g, plan);
    return OK(plan.cost);
  };

  // ---------- rail ----------
  B.railPieceCost = (g, rt) => Game.cost(g, C.rail * HL.RAILTYPES[rt].cost);
  B.buildRail = function (g, cid, x, y, piece, rt, exec) {
    const m = g.map; if (!m.inside(x, y)) return ERR('Off the map');
    const t = m.t(x, y), ty = m.type[t];
    const bit = 1 << piece;
    let cost = B.railPieceCost(g, rt);
    if (ty === T.WATER) return ERR('Can\'t build on water. Build a bridge.');
    if (x <= 0 || y <= 0 || x >= m.W - 1 || y >= m.H - 1) return ERR('Too close to edge of map');
    if (ty === T.RAIL) {
      if (m.owner[t] !== cid) return ERR('Owned by ' + ownerName(g, m.owner[t]));
      if (m.rail[t] & bit) return ERR('Already built');
      if (B.bridgeOrTunnelAt(g, t)) return ERR('Bridge or tunnel in the way');
      if (m.road[t]) return ERR('Level crossings must be straight');
      if (m.rtype[t] !== rt) return ERR('Different rail type already here');
      // no extra pieces next to signals on conflicting pieces
      for (let p = 0; p < 6; p++) if ((m.rail[t] & (1 << p)) && HL.pieceConflict(p, piece) && g.signals.has(t * 6 + p)) return ERR('Remove the signals first');
      if (exec) { m.rail[t] |= bit; m.mark(t); inf(g, cid).rail++; g.blocksDirty = true; HL.emit('build', 'rail', t); }
      return OK(cost);
    }
    if (ty === T.ROAD) {
      // level crossing
      const rb = m.road[t];
      const ok = (piece === 0 && (rb & ~5) === 0) || (piece === 1 && (rb & ~10) === 0);
      if (!ok) return ERR('Road in the way (crossings need straight road)');
      if (B.bridgeOrTunnelAt(g, t)) return ERR('Bridge or tunnel in the way');
      if (g.roadStopAt && g.roadStopAt(t)) return ERR('Road stop in the way');
      cost += Game.cost(g, 300);
      if (exec) {
        m.type[t] = T.RAIL; m.rail[t] = bit; m.rtype[t] = rt; m.owner[t] = cid; m.mark(t);
        inf(g, cid).rail++; g.blocksDirty = true; HL.emit('build', 'rail', t);
      }
      return OK(cost);
    }
    if (ty !== T.CLEAR) return ERR(ty === T.HOUSE ? 'Building in the way' : ty === T.IND ? 'Industry in the way' : ty === T.STATION ? 'Station in the way' : 'Something in the way');
    cost += B.clearGroundCost(g, t);
    if (exec) {
      B.clearGround(g, cid, t);
      m.type[t] = T.RAIL; m.rail[t] = bit; m.rtype[t] = rt; m.owner[t] = cid; m.road[t] = 0; m.mark(t);
      inf(g, cid).rail++; g.blocksDirty = true; HL.emit('build', 'rail', t);
    }
    return OK(cost);
  };
  B.removeRail = function (g, cid, x, y, piece, exec) {
    const m = g.map; const t = m.t(x, y);
    if (m.type[t] !== T.RAIL || !(m.rail[t] & (1 << piece))) return ERR('No track here');
    if (m.owner[t] !== cid) return ERR('Owned by ' + ownerName(g, m.owner[t]));
    if (B.bridgeOrTunnelAt(g, t)) return ERR('Remove the bridge or tunnel instead');
    if (HL.Rail && HL.Rail.pieceOccupied(g, t, piece)) return ERR('Train in the way');
    let cost = Game.cost(g, C.removeRail);
    const sk = t * 6 + piece;
    if (g.signals.has(sk)) cost += Game.cost(g, C.signal / 4);
    if (exec) {
      if (g.signals.has(sk)) { g.signals.delete(sk); inf(g, cid).signals--; }
      m.rail[t] &= ~(1 << piece);
      inf(g, cid).rail--;
      if (!m.rail[t]) {
        if (m.road[t]) { m.type[t] = T.ROAD; m.owner[t] = m.rowner[t]; }
        else { m.type[t] = T.CLEAR; m.owner[t] = HL.OWNER_NONE; m.ground[t] = GR.DIRT; m.gdens[t] = 0; }
      }
      m.mark(t); g.blocksDirty = true; HL.emit('build', 'rail', t);
    }
    return OK(cost);
  };
  // convert rail type on a tile (electrify etc.)
  B.convertRail = function (g, cid, x, y, rt, exec) {
    const m = g.map, t = m.t(x, y), k = m.type[t];
    if (!(k === T.RAIL || (k === T.STATION && HL.Stations.isRail(m, t)) || (k === T.DEPOT && (m.m1[t] >> 2) === 0))) return ERR('No track');
    if (m.owner[t] !== cid) return ERR('Owned by ' + ownerName(g, m.owner[t]));
    if (m.rtype[t] === rt) return ERR('Already this rail type');
    // trains that couldn't run on the new rail type block conversion
    if (HL.Rail && HL.Rail.tileHasIncompatibleTrain(g, t, rt)) return ERR('Train in the way that can\'t use this rail type');
    let n = k === T.RAIL ? bits(m.rail[t]) : 1;
    const bt = B.bridgeOrTunnelAt(g, t);
    let extra = 0;
    if (bt && bt.a === t) extra = bt.len;
    const cost = Game.cost(g, (n + extra) * C.convertRail * HL.RAILTYPES[rt].cost);
    if (exec) {
      m.rtype[t] = rt; m.mark(t);
      if (bt) { bt.rt = rt; m.rtype[bt.a] = rt; m.rtype[bt.b] = rt; m.mark(bt.a); m.mark(bt.b); for (const tt of B.spanTiles(g, bt)) m.mark(tt); }
      if (k === T.DEPOT) { const dp = g.depots[m.idx[t]]; if (dp) dp.rt = rt; }
      g.blocksDirty = true;
    }
    return OK(cost);
  };

  // ---------- signals ----------
  // type: 0 block, 1 path, 2 one-way path. dir: 0 for trains entering by the piece's first edge, 1 second, 2 both
  B.buildSignal = function (g, cid, x, y, piece, type, dir, exec) {
    const m = g.map, t = m.t(x, y);
    if (m.type[t] !== T.RAIL || !(m.rail[t] & (1 << piece))) return ERR('Signals need track');
    if (m.owner[t] !== cid) return ERR('Owned by ' + ownerName(g, m.owner[t]));
    if (m.road[t]) return ERR('Can\'t put signals on a level crossing');
    if (B.bridgeOrTunnelAt(g, t)) return ERR('Can\'t put signals on a bridge ramp or tunnel portal');
    for (let p = 0; p < 6; p++) if (p !== piece && (m.rail[t] & (1 << p)) && HL.pieceConflict(p, piece)) return ERR('Signals can\'t go on junctions or crossings');
    const k = t * 6 + piece;
    const ex = g.signals.get(k);
    if (type !== 0 && dir === 2) dir = 0;
    const cost = ex ? Game.cost(g, 40) : Game.cost(g, C.signal);
    if (exec) {
      if (!ex) inf(g, cid).signals++;
      g.signals.set(k, { type, dir });
      m.mark(t); g.blocksDirty = true; HL.emit('build', 'signal', t);
    }
    return OK(cost);
  };
  B.removeSignal = function (g, cid, x, y, piece, exec) {
    const m = g.map, t = m.t(x, y), k = t * 6 + piece;
    if (!g.signals.has(k)) return ERR('No signal here');
    if (m.owner[t] !== cid) return ERR('Owned by ' + ownerName(g, m.owner[t]));
    if (exec) { g.signals.delete(k); inf(g, cid).signals--; m.mark(t); g.blocksDirty = true; }
    return OK(Game.cost(g, C.signal / 4));
  };

  // ---------- road ----------
  B.buildRoad = function (g, cid, x, y, rbits, exec, town) {
    const m = g.map; if (!m.inside(x, y)) return ERR('Off the map');
    const t = m.t(x, y), ty = m.type[t];
    const owner = town ? HL.OWNER_TOWN : cid;
    if (x <= 0 || y <= 0 || x >= m.W - 1 || y >= m.H - 1) return ERR('Too close to edge of map');
    if (ty === T.WATER) return ERR('Can\'t build on water. Build a bridge.');
    if (ty === T.ROAD) {
      if (B.bridgeOrTunnelAt(g, t)) return ERR('Bridge or tunnel in the way');
      const add = rbits & ~m.road[t];
      if (!add) return ERR('Already built');
      const cost = Game.cost(g, C.road * bits(add) / 2);
      if (exec) { m.road[t] |= add; m.mark(t); if (!town) inf(g, cid).road += bits(add) / 2; HL.emit('build', 'road', t); }
      return OK(cost);
    }
    if (ty === T.RAIL) {
      // level crossing on a single straight piece
      if (B.bridgeOrTunnelAt(g, t)) return ERR('Bridge or tunnel in the way');
      const r = m.rail[t];
      const nb = m.road[t] | rbits;
      const ok = (r === 1 && (nb & ~5) === 0) || (r === 2 && (nb & ~10) === 0);
      if (!ok) return ERR('Railway in the way (crossings need straight track)');
      if (g.signals.has(t * 6 + (r === 1 ? 0 : 1))) return ERR('Remove the signal first');
      const add = nb & ~m.road[t];
      if (!add) return ERR('Already built');
      const cost = Game.cost(g, C.road * bits(add) / 2 + 300);
      if (exec) { m.road[t] = nb; if (m.rowner[t] === HL.OWNER_NONE) m.rowner[t] = owner; m.mark(t); if (!town) inf(g, cid).road += bits(add) / 2; g.blocksDirty = true; HL.emit('build', 'road', t); }
      return OK(cost);
    }
    if (ty !== T.CLEAR) return ERR(ty === T.HOUSE ? 'Building in the way' : ty === T.IND ? 'Industry in the way' : 'Something in the way');
    const cost = Game.cost(g, C.road * bits(rbits) / 2) + (town ? 0 : B.clearGroundCost(g, t));
    if (exec) {
      if (town) { m.trees[t] = 0; } else B.clearGround(g, cid, t);
      m.type[t] = T.ROAD; m.road[t] = rbits; m.owner[t] = owner; m.rowner[t] = owner; m.mark(t);
      if (!town) inf(g, cid).road += bits(rbits) / 2;
      HL.emit('build', 'road', t);
    }
    return OK(cost);
  };
  B.removeRoad = function (g, cid, x, y, rbits, exec) {
    const m = g.map, t = m.t(x, y);
    const ty = m.type[t];
    if (ty !== T.ROAD && !(ty === T.RAIL && m.road[t])) return ERR('No road here');
    const ro = m.rowner[t];
    if (ro !== cid) return ERR('Owned by ' + ownerName(g, ro));
    if (B.bridgeOrTunnelAt(g, t)) return ERR('Remove the bridge or tunnel instead');
    if (HL.Road && HL.Road.tileOccupied(g, t)) return ERR('Vehicle in the way');
    const rem = rbits & m.road[t];
    if (!rem) return ERR('No road here');
    const cost = Game.cost(g, C.removeRoad * bits(rem));
    if (exec) {
      m.road[t] &= ~rem;
      inf(g, cid).road -= bits(rem) / 2;
      if (!m.road[t]) {
        if (ty === T.ROAD) { m.type[t] = T.CLEAR; m.owner[t] = HL.OWNER_NONE; m.ground[t] = GR.DIRT; m.gdens[t] = 0; }
        m.rowner[t] = HL.OWNER_NONE;
      }
      m.mark(t); g.blocksDirty = true; HL.emit('build', 'road', t);
    }
    return OK(cost);
  };

  // ---------- depots ----------
  // kind: 0 rail, 1 road, 2 ship. dir: direction the depot opens toward
  B.buildDepot = function (g, cid, x, y, kind, dir, rt, exec) {
    const m = g.map; if (!m.inside(x, y)) return ERR('Off the map');
    const t = m.t(x, y), ty = m.type[t];
    if (kind === 2) {
      if (ty !== T.WATER) return ERR('Ship depots go on water');
      if (m.bridgeOver[t] >= 0) return ERR('Bridge in the way');
      const cost = Game.cost(g, C.shipDepot);
      if (exec) mkDepot(g, cid, t, kind, dir, 0);
      return OK(cost);
    }
    if (ty !== T.CLEAR) return ERR(ty === T.WATER ? 'Can\'t build on water' : 'Something in the way');
    if (m.bridgeOver[t] >= 0) return ERR('Bridge in the way');
    let cost = Game.cost(g, kind === 0 ? C.railDepot : C.roadDepot) + B.clearGroundCost(g, t);
    let lv = null;
    if (!m.isFlat(x, y) || m.tileMin(x, y) === 0) { lv = B.planLevel(g, x, y, x, y, null, true); if (!lv.ok) return ERR(lv.err || 'Land sloped in wrong direction'); cost += lv.cost; }
    if (exec) {
      if (lv) B.applyLevel(g, lv);
      B.clearGround(g, cid, t);
      mkDepot(g, cid, t, kind, dir, rt);
    }
    return OK(cost);
  };
  function mkDepot(g, cid, t, kind, dir, rt) {
    const m = g.map;
    const d = HL.alloc(g.depots, { owner: cid, kind, t, x: m.tx(t), y: m.ty(t), dir, rt: rt || 0 });
    const tw = B.closestTown(g, d.x, d.y);
    d.town = tw ? tw.id : -1;
    m.type[t] = T.DEPOT; m.owner[t] = cid; m.idx[t] = d.id; m.m1[t] = dir | (kind << 2); m.rtype[t] = rt || 0;
    if (kind === 1) { m.road[t] = 1 << dir; m.rowner[t] = cid; } else m.road[t] = 0;
    m.mark(t); g.blocksDirty = true;
    HL.emit('build', 'depot', t);
    return d;
  }
  B.removeDepot = function (g, cid, x, y, exec) {
    const m = g.map, t = m.t(x, y);
    const d = g.depots[m.idx[t]];
    if (!d) return ERR('No depot');
    if (d.owner !== cid) return ERR('Owned by ' + ownerName(g, d.owner));
    for (const v of g.vehicles) if (v && !v.part && v.depot === d.id && v.inDepot) return ERR('Vehicles are inside the depot');
    for (const v of g.vehicles) if (v && v.owner === cid && v.curTarget && v.curTarget.depot === d.id && !v.part) { /* will re-path */ }
    if (exec) {
      g.depots[d.id] = null;
      if (d.kind === 2) { m.type[t] = T.WATER; m.owner[t] = HL.OWNER_WATER; }
      else { m.type[t] = T.CLEAR; m.owner[t] = HL.OWNER_NONE; m.ground[t] = GR.DIRT; }
      m.idx[t] = -1; m.road[t] = 0; m.rowner[t] = HL.OWNER_NONE; m.m1[t] = 0;
      m.mark(t); g.blocksDirty = true;
      for (const o of g.orders) if (o) o.list = o.list.filter(od => !(od.depot === d.id));
    }
    return OK(Game.cost(g, 300));
  };

  // ---------- bridges ----------
  // transport: 'rail' | 'road'. from (ax,ay) to (bx,by) along a straight axis
  B.planBridge = function (g, cid, ax, ay, bx, by, transport) {
    const m = g.map;
    if (ax !== bx && ay !== by) return ERR('Bridges must be straight');
    if (ax === bx && ay === by) return ERR('Drag across the gap');
    const dir = ax === bx ? (by > ay ? 2 : 0) : (bx > ax ? 1 : 3);
    const len = Math.abs(bx - ax) + Math.abs(by - ay) - 1;
    if (len < 1) return ERR('Too short for a bridge');
    if (!m.inside(ax, ay) || !m.inside(bx, by)) return ERR('Off the map');
    const ta = m.t(ax, ay), tb = m.t(bx, by);
    for (const [hx, hy, ht] of [[ax, ay, ta], [bx, by, tb]]) {
      const k = m.type[ht];
      if (k !== T.CLEAR) return ERR('Bridge ends must be on clear land');
      if (m.bridgeOver[ht] >= 0) return ERR('Another bridge is in the way');
      if (hx <= 0 || hy <= 0 || hx >= m.W - 1 || hy >= m.H - 1) return ERR('Too close to edge of map');
    }
    const od = HL.opp(dir);
    // outer edge heights (where vehicles get on)
    const hA = m.edgeMidH(ax, ay, od), hB = m.edgeMidH(bx, by, dir);
    let spanMax = 0;
    const span = [];
    for (let i = 1; i <= len; i++) {
      const x = ax + HL.DX[dir] * i, y = ay + HL.DY[dir] * i;
      const t = m.t(x, y);
      span.push(t);
      if (m.bridgeOver[t] >= 0) return ERR('Another bridge is in the way');
      const k = m.type[t];
      if (k === T.HOUSE || k === T.IND || k === T.OBJECT || k === T.DEPOT) return ERR('Building in the way');
      if (k === T.STATION && !HL.Stations.lowStation(m, t)) return ERR('Station in the way');
      if (B.bridgeOrTunnelAt(g, t)) return ERR('Bridge ramp in the way');
      spanMax = Math.max(spanMax, m.tileMax(x, y) + (k === T.RAIL || k === T.ROAD || k === T.STATION ? 1 : 0));
    }
    const H = Math.max(spanMax + 1, Math.ceil(hA) + 1, Math.ceil(hB) + 1, m.tileMax(ax, ay), m.tileMax(bx, by));
    if (H - hA > 2.01 || H - hB > 2.01) return ERR('Bridge would be too steep. Start on higher ground.');
    return { ok: true, dir, len, ta, tb, H, hA, hB, span };
  };
  B.buildBridge = function (g, cid, ax, ay, bx, by, transport, btype, rt, exec) {
    const p = B.planBridge(g, cid, ax, ay, bx, by, transport);
    if (!p.ok) return p;
    const bt = HL.BRIDGES[btype];
    if (!bt) return ERR('No bridge type');
    if (p.len > bt.maxLen) return ERR(bt.name + ' can only span ' + bt.maxLen + ' tiles');
    const m = g.map;
    const per = transport === 'rail' ? HL.RAILTYPES[rt].cost : 0.8;
    const cost = Game.cost(g, (p.len + 2) * bt.cost * per) + B.clearGroundCost(g, p.ta) + B.clearGroundCost(g, p.tb);
    if (exec) {
      const br = HL.alloc(g.bridges, { owner: cid, transport, rt: rt || 0, type: btype, dir: p.dir, a: p.ta, b: p.tb, len: p.len, h: p.H, kind: 'bridge' });
      for (const t of [p.ta, p.tb]) {
        B.clearGround(g, cid, t);
        m.type[t] = transport === 'rail' ? T.RAIL : T.ROAD;
        m.owner[t] = cid; m.idx[t] = br.id; m.m1[t] = 0x8000;
        if (transport === 'rail') { m.rail[t] = (p.dir & 1) ? 1 : 2; m.rtype[t] = rt; m.road[t] = 0; inf(g, cid).rail++; }
        else { m.road[t] = (p.dir & 1) ? 10 : 5; m.rowner[t] = cid; m.rail[t] = 0; inf(g, cid).road++; }
        m.mark(t);
      }
      for (const t of p.span) { m.bridgeOver[t] = br.id; m.mark(t); }
      inf(g, cid).bridgeTiles += p.len;
      g.blocksDirty = true;
      HL.emit('build', 'bridge', p.ta);
    }
    return OK(cost);
  };
  B.spanTiles = function (g, br) {
    const m = g.map, out = [];
    const ax = m.tx(br.a), ay = m.ty(br.a);
    for (let i = 1; i <= br.len; i++) out.push(m.t(ax + HL.DX[br.dir] * i, ay + HL.DY[br.dir] * i));
    return out;
  };
  B.bridgeOrTunnelAt = function (g, t) {
    const m = g.map;
    if (!(m.m1[t] & 0xC000) || (m.type[t] !== T.RAIL && m.type[t] !== T.ROAD)) return null;
    return (m.m1[t] & 0x8000) ? g.bridges[m.idx[t]] : g.tunnels[m.idx[t]];
  };
  B.removeBridgeOrTunnel = function (g, cid, bt, exec) {
    const m = g.map;
    if (bt.owner !== cid) return ERR('Owned by ' + ownerName(g, bt.owner));
    if (HL.Veh && HL.Veh.onBridgeOrTunnel(g, bt)) return ERR('Vehicle in the way');
    const cost = Game.cost(g, 200 * (bt.len + 2));
    if (exec) {
      const isB = bt.kind === 'bridge';
      for (const t of [bt.a, bt.b]) {
        if (bt.transport === 'rail') { inf(g, cid).rail--; g.signals.delete(t * 6); g.signals.delete(t * 6 + 1); }
        else inf(g, cid).road--;
        m.type[t] = T.CLEAR; m.owner[t] = HL.OWNER_NONE; m.idx[t] = -1; m.m1[t] = 0; m.rail[t] = 0; m.road[t] = 0; m.rowner[t] = HL.OWNER_NONE;
        m.ground[t] = GR.DIRT; m.mark(t);
      }
      if (isB) { for (const t of B.spanTiles(g, bt)) { m.bridgeOver[t] = -1; m.mark(t); } inf(g, cid).bridgeTiles -= bt.len; g.bridges[bt.id] = null; }
      else { inf(g, cid).tunnelTiles -= bt.len; g.tunnels[bt.id] = null; }
      g.blocksDirty = true;
    }
    return OK(cost);
  };

  // ---------- tunnels ----------
  // click on a hillside sloping up in the direction you want to dig
  B.planTunnel = function (g, ax, ay) {
    const m = g.map;
    if (!m.inside(ax, ay)) return ERR('Off the map');
    const dir = m.inclineDir(ax, ay);
    if (dir < 0) return ERR('Tunnels start on a straight hillside');
    const ta = m.t(ax, ay);
    if (m.type[ta] !== T.CLEAR) return ERR('Clear the entrance first');
    const h = m.tileMin(ax, ay);
    for (let i = 1; i < 32; i++) {
      const x = ax + HL.DX[dir] * i, y = ay + HL.DY[dir] * i;
      if (!m.inside(x, y) || x <= 0 || y <= 0 || x >= m.W - 1 || y >= m.H - 1) return ERR('Tunnel would run off the map');
      const t = m.t(x, y);
      if (m.inclineDir(x, y) === HL.opp(dir) && m.tileMin(x, y) === h) {
        if (m.type[t] !== T.CLEAR) return ERR('Tunnel exit is blocked');
        if (i - 1 < 1) return ERR('Hill is too thin for a tunnel');
        // crossing tunnels at the same depth not allowed
        for (const tn of g.tunnels) if (tn && tn.h === h) for (let k = 1; k < i; k++) { const xx = ax + HL.DX[dir] * k, yy = ay + HL.DY[dir] * k; if (B.tunnelUnder(g, tn, xx, yy)) return ERR('Another tunnel is in the way'); }
        return { ok: true, dir, ta, tb: t, len: i - 1, h, bx: x, by: y };
      }
      if (m.tileMin(x, y) < h + 1) return ERR('Tunnel would come out in a valley');
    }
    return ERR('Tunnel too long');
  };
  B.buildTunnel = function (g, cid, ax, ay, transport, rt, exec) {
    const p = B.planTunnel(g, ax, ay);
    if (!p.ok) return p;
    const m = g.map;
    const cost = Game.cost(g, (p.len + 2) * C.tunnel * (transport === 'rail' ? HL.RAILTYPES[rt].cost : 0.8));
    if (exec) {
      const tn = HL.alloc(g.tunnels, { owner: cid, transport, rt: rt || 0, dir: p.dir, a: p.ta, b: p.tb, len: p.len, h: p.h, kind: 'tunnel' });
      for (const t of [p.ta, p.tb]) {
        B.clearGround(g, cid, t);
        m.type[t] = transport === 'rail' ? T.RAIL : T.ROAD;
        m.owner[t] = cid; m.idx[t] = tn.id; m.m1[t] = 0x4000;
        if (transport === 'rail') { m.rail[t] = (p.dir & 1) ? 1 : 2; m.rtype[t] = rt; inf(g, cid).rail++; }
        else { m.road[t] = (p.dir & 1) ? 10 : 5; m.rowner[t] = cid; inf(g, cid).road++; }
        m.mark(t);
      }
      inf(g, cid).tunnelTiles += p.len;
      g.blocksDirty = true;
      HL.emit('build', 'tunnel', p.ta);
    }
    return OK(cost);
  };
  B.tunnelUnder = function (g, tn, x, y) {
    const m = g.map;
    const ax = m.tx(tn.a), ay = m.ty(tn.a), bx = m.tx(tn.b), by = m.ty(tn.b);
    if (ax === bx) return x === ax && y > Math.min(ay, by) && y < Math.max(ay, by);
    return y === ay && x > Math.min(ax, bx) && x < Math.max(ax, bx);
  };

  // ---------- trees ----------
  B.plantTree = function (g, cid, x, y, spec, exec) {
    const m = g.map, t = m.t(x, y);
    if (m.type[t] !== T.CLEAR) return ERR('Something in the way');
    if ((m.trees[t] & 7) >= 4) return ERR('Already full of trees');
    if (m.ground[t] === GR.FIELD) return ERR('Field in the way');
    if (spec == null) spec = HL.pickTree(m, g.opts.climate, x, y, g.rng.next());
    const cost = Game.cost(g, C.plantTree);
    if (exec) {
      const n = m.trees[t] & 7;
      m.trees[t] = (n + 1) | ((n ? (m.trees[t] >> 3) & 3 : 0) << 3); m.tspec[t] = n ? m.tspec[t] : spec; m.mark(t);
      townRating(g, cid, x, y, 7, -1000);
    }
    return OK(cost);
  };

  // ---------- company HQ ----------
  B.buildHQ = function (g, cid, x, y, exec) {
    const m = g.map;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) { if (!m.inside(x + dx, y + dy)) return ERR('Off the map'); const t = m.t(x + dx, y + dy); if (m.type[t] !== T.CLEAR) return ERR('Something in the way'); }
    const lv = B.planLevel(g, x, y, x + 1, y + 1, null);
    if (!lv.ok) return ERR(lv.err);
    const c = g.companies[cid];
    let cost = Game.cost(g, C.hq) + lv.cost;
    if (exec) {
      if (c.hq) { const o = g.objects[c.hq]; if (o) B.removeObject(g, o); }
      B.applyLevel(g, lv);
      const o = HL.alloc(g.objects, { kind: 'hq', owner: cid, x, y, w: 2, h: 2, built: g.date });
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) { const t = m.t(x + dx, y + dy); B.clearGround(g, cid, t); m.type[t] = T.OBJECT; m.idx[t] = o.id; m.owner[t] = cid; m.m1[t] = dx + dy * 2; m.mark(t); }
      c.hq = o.id;
    }
    return OK(cost);
  };
  B.removeObject = function (g, o) {
    const m = g.map;
    for (let dy = 0; dy < o.h; dy++) for (let dx = 0; dx < o.w; dx++) { const t = m.t(o.x + dx, o.y + dy); m.type[t] = T.CLEAR; m.idx[t] = -1; m.owner[t] = HL.OWNER_NONE; m.ground[t] = GR.DIRT; m.mark(t); }
    if (o.kind === 'hq' && g.companies[o.owner]) g.companies[o.owner].hq = null;
    g.objects[o.id] = null;
  };

  // ---------- company removal (bankruptcy) ----------
  B.removeCompanyAssets = function (g, cid) {
    const m = g.map;
    for (const v of g.vehicles) if (v && v.owner === cid) HL.Veh.destroy(g, v, true);
    for (const s of g.stations) if (s && s.owner === cid) HL.Stations.destroy(g, s);
    for (let t = 0; t < m.W * m.H; t++) {
      if (m.owner[t] !== cid && m.rowner[t] !== cid) continue;
      const k = m.type[t];
      if (k === T.RAIL) { for (let p = 0; p < 6; p++) g.signals.delete(t * 6 + p); if (m.road[t] && m.rowner[t] !== cid) { m.type[t] = T.ROAD; m.rail[t] = 0; m.owner[t] = m.rowner[t]; } else { m.type[t] = T.CLEAR; m.rail[t] = 0; m.road[t] = 0; m.owner[t] = HL.OWNER_NONE; m.m1[t] = 0; m.idx[t] = -1; } }
      else if (k === T.ROAD) { if (m.rowner[t] === cid) { m.road[t] = 0; m.type[t] = T.CLEAR; m.owner[t] = HL.OWNER_NONE; m.m1[t] = 0; m.idx[t] = -1; } }
      else if (k === T.DEPOT) { const d = g.depots[m.idx[t]]; if (d) g.depots[d.id] = null; m.type[t] = d && d.kind === 2 ? T.WATER : T.CLEAR; m.idx[t] = -1; m.owner[t] = d && d.kind === 2 ? HL.OWNER_WATER : HL.OWNER_NONE; m.road[t] = 0; }
      else if (k === T.OBJECT) { const o = g.objects[m.idx[t]]; if (o && o.owner === cid) B.removeObject(g, o); }
      if (m.rowner[t] === cid) m.rowner[t] = HL.OWNER_NONE;
      m.mark(t);
    }
    for (const b of g.bridges) if (b && b.owner === cid) { for (const t of B.spanTiles(g, b)) { m.bridgeOver[t] = -1; m.mark(t); } g.bridges[b.id] = null; }
    for (const tn of g.tunnels) if (tn && tn.owner === cid) g.tunnels[tn.id] = null;
    for (const o of g.orders) if (o && o.owner === cid) g.orders[o.id] = null;
    if (g.infra) delete g.infra[cid];
    g.blocksDirty = true;
  };
})(typeof window !== 'undefined' ? window : globalThis);
