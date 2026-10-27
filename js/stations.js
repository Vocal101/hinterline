// Stations: placement, joining, naming, catchment, acceptance, waiting cargo and ratings.
(function (root) {
  const HL = root.HL;
  const T = HL.T, GR = HL.GR;
  const S = HL.Stations = {};
  const Game = HL.Game;
  const ERR = (e) => ({ ok: false, cost: 0, err: e });
  const OK = (c) => ({ ok: true, cost: c || 0 });

  // station tile kinds (low 3 bits of m1)
  const K = S.K = { RAIL: 0, BUS: 1, TRUCK: 2, DOCK: 3, AIR: 4, BUOY: 5, RIG: 6 };
  S.FAC = { rail: 1, truck: 2, bus: 4, dock: 8, air: 16, buoy: 32 };
  S.RADIUS = { rail: 4, bus: 3, truck: 3, dock: 4, buoy: 0 };

  HL.AIRPORTS = [
    { id: 'strip', name: 'Grass Airstrip', w: 4, h: 3, intro: 1922, cost: 16000, size: 0, stands: 2, catchment: 3, desc: 'Short grass runway. Small aircraft only.' },
    { id: 'heli', name: 'Heliport', w: 1, h: 1, intro: 1958, cost: 8000, size: -1, stands: 1, catchment: 3, heliOnly: true, desc: 'A rooftop pad for helicopters and tiltrotors.' },
    { id: 'city', name: 'City Airport', w: 6, h: 5, intro: 1948, cost: 42000, size: 1, stands: 4, catchment: 4, desc: 'Paved runway, four stands. Big jets risk overrunning it.' },
    { id: 'intl', name: 'International Airport', w: 8, h: 7, intro: 1966, cost: 98000, size: 2, stands: 8, catchment: 5, twoRunways: true, desc: 'Two runways and eight stands. Handles anything.' },
  ];
  S.airportType = id => HL.AIRPORTS.find(a => a.id === id);

  S.init = function (g) {
    g.catchIdx = new Map();
    g.catchVer = 0;
    for (const s of g.stations) if (s) S.updateCatch(g, s);
  };
  S.isRail = (m, t) => m.type[t] === T.STATION && (m.m1[t] & 7) === K.RAIL;
  S.kindAt = (m, t) => m.type[t] === T.STATION ? (m.m1[t] & 7) : -1;
  S.axisAt = (m, t) => (m.m1[t] >> 3) & 1;
  S.lowStation = (m, t) => { const k = S.kindAt(m, t); return k === K.BUS || k === K.TRUCK || k === K.BUOY; };
  S.at = (g, t) => g.map.type[t] === T.STATION ? g.stations[g.map.idx[t]] : null;

  function newStation(g, cid, x, y) {
    const tw = HL.Build.closestTown(g, x, y);
    const s = HL.alloc(g.stations, {
      owner: cid, x, y, town: tw ? tw.id : -1, name: '', fac: 0, tileCount: 0,
      rect: { x0: x, y0: y, x1: x, y1: y }, catch: null, cargo: {}, accepts: {}, built: g.date,
      platforms: [], stops: [], dock: null, airport: null, heliport: false, rig: null,
      lastVeh: {}, monthIn: {}, monthOut: {}, lastIn: {}, lastOut: {},
    });
    s.name = S.makeName(g, s);
    return s;
  }
  S.makeName = function (g, s) {
    const tw = g.towns[s.town];
    const base = tw ? tw.name : 'Remote';
    const used = new Set(g.stations.filter(o => o && o !== s).map(o => o.name));
    // name after a nearby industry if there is one
    let indSuf = null;
    for (const ind of g.industries) {
      if (!ind) continue;
      if (HL.manh(s.x, s.y, ind.x + ind.w / 2, ind.y + ind.h / 2) <= 6) {
        const n = HL.INDUSTRY[ind.type].name;
        indSuf = n.includes('Mine') ? ' Mines' : n.includes('Farm') || n.includes('Orchard') || n.includes('Plantation') ? ' Fields' : n.includes('Timber') || n.includes('Logging') ? ' Woods' : n.includes('Power') ? ' Power' : n.includes('Oil') ? ' Oilfield' : n.includes('Refinery') ? ' Refinery' : ' Works';
        break;
      }
    }
    const cands = [];
    if (tw && HL.manh(s.x, s.y, tw.x, tw.y) <= 3) cands.push('', ' Central');
    if (indSuf) cands.push(indSuf);
    if (tw) {
      const dx = s.x - tw.x, dy = s.y - tw.y;
      // screen-ish compass: x+ is south-east, y+ is south-west; use simple quadrants
      const ns = dx + dy > 4 ? ' South' : dx + dy < -4 ? ' North' : '';
      const ew = dx - dy > 4 ? ' East' : dx - dy < -4 ? ' West' : '';
      if (ns) cands.push(ns); if (ew) cands.push(ew);
    }
    cands.push(...HL.NAMES.STATION_SUFFIX);
    for (const c of cands) { const n = base + c; if (!used.has(n)) return n; }
    let i = 2; while (used.has(base + ' ' + i)) i++;
    return base + ' ' + i;
  };

  // find an own station adjacent to rectangle to join
  function adjacentStation(g, cid, x0, y0, x1, y1, join) {
    const m = g.map;
    if (join != null) { const s = g.stations[join]; if (s && s.owner === cid) return s; }
    for (let y = y0 - 1; y <= y1 + 1; y++) for (let x = x0 - 1; x <= x1 + 1; x++) {
      if (!m.inside(x, y)) continue;
      const t = m.t(x, y);
      if (m.type[t] === T.STATION) { const s = g.stations[m.idx[t]]; if (s && s.owner === cid && S.kindAt(m, t) !== K.BUOY) return s; }
    }
    return null;
  }
  function townAllows(g, cid, x, y) {
    const tw = HL.Build.townAt(g, x, y, 6);
    if (!tw || cid >= 250) return null;
    if (HL.Towns.ratingOf(tw, cid) < -200) return 'Local authority of ' + tw.name + ' refuses to allow this. Your rating there is too low.';
    return null;
  }
  function spreadOk(s, x0, y0, x1, y1) {
    if (!s) return true;
    const nx0 = Math.min(s.rect.x0, x0), ny0 = Math.min(s.rect.y0, y0), nx1 = Math.max(s.rect.x1, x1), ny1 = Math.max(s.rect.y1, y1);
    return nx1 - nx0 < 16 && ny1 - ny0 < 16;
  }
  function addTiles(g, s, x0, y0, x1, y1) {
    if (!s.tileCount) s.rect = { x0, y0, x1, y1 };
    else { s.rect.x0 = Math.min(s.rect.x0, x0); s.rect.y0 = Math.min(s.rect.y0, y0); s.rect.x1 = Math.max(s.rect.x1, x1); s.rect.y1 = Math.max(s.rect.y1, y1); }
    s.tileCount += (x1 - x0 + 1) * (y1 - y0 + 1);
  }
  S.recomputeRect = function (g, s) {
    const m = g.map;
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, n = 0, fac = 0;
    const r = s.rect;
    for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) {
      if (!m.inside(x, y)) continue;
      const t = m.t(x, y);
      if (m.type[t] !== T.STATION || m.idx[t] !== s.id) continue;
      n++; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      const k = S.kindAt(m, t);
      fac |= k === K.RAIL ? S.FAC.rail : k === K.BUS ? S.FAC.bus : k === K.TRUCK ? S.FAC.truck : k === K.DOCK ? S.FAC.dock : k === K.AIR ? S.FAC.air : k === K.BUOY ? S.FAC.buoy : k === K.RIG ? S.FAC.dock : 0;
    }
    s.tileCount = n; s.fac = fac;
    if (n) s.rect = { x0, y0, x1, y1 };
  };
  S.radius = function (s) {
    let r = 0;
    if (s.fac & S.FAC.rail) r = Math.max(r, 4);
    if (s.fac & (S.FAC.bus | S.FAC.truck)) r = Math.max(r, 3);
    if (s.fac & S.FAC.dock) r = Math.max(r, 4);
    if (s.airport) r = Math.max(r, S.airportType(s.airport.type).catchment);
    return r;
  };
  // rebuild catchment index for one station
  S.updateCatch = function (g, s) {
    const m = g.map;
    if (s.catch) {
      const c = s.catch;
      for (let y = c.y0; y <= c.y1; y++) for (let x = c.x0; x <= c.x1; x++) {
        const t = y * m.W + x, arr = g.catchIdx.get(t);
        if (arr) { const i = arr.indexOf(s.id); if (i >= 0) arr.splice(i, 1); if (!arr.length) g.catchIdx.delete(t); }
      }
    }
    s.catch = null;
    if (!s.tileCount || s.fac === S.FAC.buoy) { g.catchVer++; return; }
    const r = S.radius(s);
    const c = s.catch = { x0: Math.max(0, s.rect.x0 - r), y0: Math.max(0, s.rect.y0 - r), x1: Math.min(m.W - 1, s.rect.x1 + r), y1: Math.min(m.H - 1, s.rect.y1 + r) };
    for (let y = c.y0; y <= c.y1; y++) for (let x = c.x0; x <= c.x1; x++) {
      const t = y * m.W + x; let arr = g.catchIdx.get(t);
      if (!arr) g.catchIdx.set(t, arr = []);
      arr.push(s.id);
    }
    g.catchVer++;
    S.updateAcceptance(g, s);
  };
  S.stationsCovering = (g, t) => g.catchIdx.get(t) || [];

  // acceptance in eighths over the catchment
  S.acceptanceAt = function (g, x0, y0, x1, y1) {
    const m = g.map, acc = {};
    for (let y = Math.max(0, y0); y <= Math.min(m.H - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(m.W - 1, x1); x++) {
      const t = y * m.W + x, k = m.type[t];
      if (k === T.HOUSE) { const a = HL.Towns.tileAccept(g, t); for (const c in a) acc[c] = (acc[c] || 0) + a[c]; }
      else if (k === T.IND) { const ind = g.industries[m.idx[t]]; if (ind) for (const c of HL.INDUSTRY[ind.type].accepts || []) acc[c] = (acc[c] || 0) + 8; }
      else if (k === T.STATION && S.kindAt(m, t) === K.RIG) { /* rig: no acceptance */ }
    }
    return acc;
  };
  S.updateAcceptance = function (g, s) {
    const old = s.accepts || {};
    s.accepts = {};
    if (!s.catch) return;
    const c = s.catch;
    s.acc8 = S.acceptanceAt(g, c.x0, c.y0, c.x1, c.y1);
    for (const k in s.acc8) if (s.acc8[k] >= 8) s.accepts[k] = true;
    // the town-specific needs (water/food) only count where the climate uses them
    for (const k in s.accepts) if (!HL.CLIMATES[g.opts.climate].cargos.includes(k)) delete s.accepts[k];
    if (s.owner === g.player && g.ticks > 10) {
      const gained = Object.keys(s.accepts).filter(k => !old[k]), lost = Object.keys(old).filter(k => !s.accepts[k]);
      if (lost.length && s.everAccepted) Game.news(g, 'advice', s.name + ' no longer accepts ' + lost.map(k => HL.CARGO[k].name.toLowerCase()).join(', '), '', { tile: g.map.t(s.x, s.y), cid: s.owner });
      if (gained.length && s.everAccepted) Game.news(g, 'advice', s.name + ' now accepts ' + gained.map(k => HL.CARGO[k].name.toLowerCase()).join(', '), '', { tile: g.map.t(s.x, s.y), cid: s.owner });
    }
    s.everAccepted = true;
  };
  // industries in catchment (cached until catchment version changes)
  S.industriesNear = function (g, s) {
    if (s._indVer === g.catchVer && s._ind) return s._ind;
    const out = new Set();
    if (s.catch) {
      const m = g.map, c = s.catch;
      for (let y = c.y0; y <= c.y1; y++) for (let x = c.x0; x <= c.x1; x++) { const t = y * m.W + x; if (m.type[t] === T.IND) out.add(m.idx[t]); }
    }
    s._ind = Array.from(out); s._indVer = g.catchVer;
    return s._ind;
  };

  // ---------- placing ----------
  S.buildRail = function (g, cid, x, y, axis, plat, len, rt, exec, join) {
    const m = g.map;
    const w = axis === 0 ? len : plat, h = axis === 0 ? plat : len;
    const x1 = x + w - 1, y1 = y + h - 1;
    if (x < 1 || y < 1 || x1 >= m.W - 1 || y1 >= m.H - 1) return ERR('Too close to edge of map');
    const ta = townAllows(g, cid, x, y); if (ta) return ERR(ta);
    let cost = 0;
    for (let yy = y; yy <= y1; yy++) for (let xx = x; xx <= x1; xx++) {
      const t = m.t(xx, yy), k = m.type[t];
      if (m.bridgeOver[t] >= 0) return ERR('Bridge in the way');
      if (k === T.CLEAR) { cost += HL.Build.clearGroundCost(g, t); continue; }
      if (k === T.RAIL && m.owner[t] === cid && m.rail[t] === (axis === 0 ? 1 : 2) && !m.road[t] && !HL.Build.bridgeOrTunnelAt(g, t) && !g.signals.has(t * 6 + axis) && m.rtype[t] === rt) {
        if (HL.Rail && HL.Rail.pieceOccupied(g, t, axis)) return ERR('Train in the way');
        continue;
      }
      if (k === T.STATION && S.isRail(m, t) && m.owner[t] === cid && S.axisAt(m, t) === axis) return ERR('Already a platform here');
      return ERR(k === T.WATER ? 'Can\'t build on water' : k === T.HOUSE ? 'Building in the way' : k === T.RAIL ? 'Track in the way (only straight own track can become a platform)' : 'Something in the way');
    }
    const lv = B().planLevel(g, x, y, x1, y1, null, true);
    if (!lv.ok) return ERR(lv.err);
    cost += lv.cost;
    cost += Game.cost(g, w * h * HL.COST.railStation * HL.RAILTYPES[rt].cost);
    let st = adjacentStation(g, cid, x, y, x1, y1, join);
    if (!spreadOk(st, x, y, x1, y1)) return ERR('Station would be too spread out');
    if (exec) {
      B().applyLevel(g, lv);
      if (!st) st = newStation(g, cid, x + (w >> 1), y + (h >> 1));
      for (let yy = y; yy <= y1; yy++) for (let xx = x; xx <= x1; xx++) {
        const t = m.t(xx, yy);
        if (m.type[t] === T.RAIL) HL.Build.infra(g, cid).rail--;
        else HL.Build.clearGround(g, cid, t);
        m.type[t] = T.STATION; m.idx[t] = st.id; m.owner[t] = cid; m.rtype[t] = rt; m.road[t] = 0; m.rail[t] = axis === 0 ? 1 : 2;
        // building style: buildings on the middle platform tiles, canopies elsewhere
        const along = axis === 0 ? xx - x : yy - y, across = axis === 0 ? yy - y : xx - x;
        let vis = 0; // 0 plain, 1 canopy, 2 station building, 3 end ramp
        if (len >= 3 && along === (len >> 1) && across === 0) vis = 2;
        else if (along > 0 && along < len - 1) vis = 1;
        else vis = 3;
        m.m1[t] = K.RAIL | (axis << 3) | (vis << 4) | ((across === plat - 1 ? 1 : 0) << 7) | ((across === 0 ? 1 : 0) << 8);
        m.m2[t] = 0;
        m.mark(t);
      }
      addTiles(g, st, x, y, x1, y1);
      S.recomputeRect(g, st);
      S.updateCatch(g, st);
      g.blocksDirty = true;
      HL.emit('build', 'station', m.t(x, y));
    }
    return OK(cost);
  };
  const B = () => HL.Build;

  S.buildRoadStop = function (g, cid, x, y, truck, axisHint, exec, join) {
    const m = g.map; if (!m.inside(x, y)) return ERR('Off the map');
    const t = m.t(x, y), k = m.type[t];
    const ta = townAllows(g, cid, x, y); if (ta) return ERR(ta);
    let axis, cost = Game.cost(g, HL.COST.roadStop);
    if (k === T.ROAD) {
      if (HL.Build.bridgeOrTunnelAt(g, t)) return ERR('Bridge or tunnel in the way');
      const rb = m.road[t];
      if ((rb & ~5) === 0) axis = 1; else if ((rb & ~10) === 0) axis = 0; else return ERR('Drive-through stops need a straight road');
      if (m.rowner[t] !== cid && m.rowner[t] !== HL.OWNER_TOWN) return ERR('Road owned by another company');
      if (HL.Road && HL.Road.tileOccupied(g, t)) return ERR('Vehicle in the way');
    } else if (k === T.CLEAR) {
      axis = axisHint || 0;
      cost += Game.cost(g, HL.COST.road) + HL.Build.clearGroundCost(g, t);
    } else return ERR('Road stops go on straight roads');
    if (m.bridgeOver[t] >= 0) return ERR('Bridge in the way');
    let st = adjacentStation(g, cid, x, y, x, y, join);
    if (!spreadOk(st, x, y, x, y)) return ERR('Station would be too spread out');
    if (exec) {
      if (!st) st = newStation(g, cid, x, y);
      if (k === T.CLEAR) { HL.Build.clearGround(g, cid, t); m.road[t] = axis === 0 ? 10 : 5; m.rowner[t] = cid; HL.Build.infra(g, cid).road++; }
      m.road[t] = axis === 0 ? 10 : 5;
      m.type[t] = T.STATION; m.idx[t] = st.id; m.owner[t] = cid;
      m.m1[t] = (truck ? K.TRUCK : K.BUS) | (axis << 3);
      m.mark(t);
      addTiles(g, st, x, y, x, y);
      S.recomputeRect(g, st); S.updateCatch(g, st);
      HL.emit('build', 'station', t);
    }
    return OK(cost);
  };

  S.buildDock = function (g, cid, x, y, exec, join) {
    const m = g.map; if (!m.inside(x, y)) return ERR('Off the map');
    const t = m.t(x, y);
    if (m.type[t] !== T.CLEAR) return ERR('Docks go on clear coastline');
    if (m.tileMin(x, y) !== 0) return ERR('Docks must be built at the water\'s edge');
    const ta = townAllows(g, cid, x, y); if (ta) return ERR(ta);
    let dir = -1;
    const inc = m.inclineDir(x, y);
    const order = inc >= 0 ? [HL.opp(inc), 0, 1, 2, 3] : [0, 1, 2, 3];
    for (const d of order) { const nx = x + HL.DX[d], ny = y + HL.DY[d]; if (m.inside(nx, ny) && m.type[m.t(nx, ny)] === T.WATER && m.bridgeOver[m.t(nx, ny)] < 0) { dir = d; break; } }
    if (dir < 0) return ERR('Docks need open water next to them');
    const wt = m.t(x + HL.DX[dir], y + HL.DY[dir]);
    let st = adjacentStation(g, cid, x, y, x, y, join);
    if (st && st.dock) st = null;
    if (!spreadOk(st, x, y, x, y)) return ERR('Station would be too spread out');
    const cost = Game.cost(g, HL.COST.dock) + HL.Build.clearGroundCost(g, t);
    if (exec) {
      if (!st) st = newStation(g, cid, x, y);
      HL.Build.clearGround(g, cid, t);
      m.type[t] = T.STATION; m.idx[t] = st.id; m.owner[t] = cid; m.m1[t] = K.DOCK | (dir << 3); m.mark(t);
      st.dock = { t, water: wt, dir };
      addTiles(g, st, x, y, x, y);
      S.recomputeRect(g, st); S.updateCatch(g, st);
      HL.emit('build', 'station', t);
    }
    return OK(cost);
  };

  S.buildBuoy = function (g, cid, x, y, exec) {
    const m = g.map; if (!m.inside(x, y)) return ERR('Off the map');
    const t = m.t(x, y);
    if (m.type[t] !== T.WATER) return ERR('Buoys go on water');
    if (m.bridgeOver[t] >= 0) return ERR('Bridge in the way');
    const cost = Game.cost(g, HL.COST.buoy);
    if (exec) {
      const st = newStation(g, cid, x, y);
      st.name = (g.towns[st.town] ? g.towns[st.town].name : 'Open Water') + ' Buoy';
      const used = new Set(g.stations.filter(o => o && o !== st).map(o => o.name));
      let n = 2; const base = st.name; while (used.has(st.name)) st.name = base + ' ' + n++;
      st.buoy = true;
      m.type[t] = T.STATION; m.idx[t] = st.id; m.owner[t] = cid; m.m1[t] = K.BUOY; m.mark(t);
      addTiles(g, st, x, y, x, y);
      S.recomputeRect(g, st);
    }
    return OK(cost);
  };

  S.buildAirport = function (g, cid, x, y, typeId, exec, join) {
    const m = g.map;
    const at = S.airportType(typeId);
    if (!at) return ERR('Unknown airport');
    const x1 = x + at.w - 1, y1 = y + at.h - 1;
    if (x < 1 || y < 1 || x1 >= m.W - 1 || y1 >= m.H - 1) return ERR('Too close to edge of map');
    const ta = townAllows(g, cid, x, y); if (ta) return ERR(ta);
    let cost = Game.cost(g, at.cost);
    for (let yy = y; yy <= y1; yy++) for (let xx = x; xx <= x1; xx++) {
      const t = m.t(xx, yy);
      if (m.type[t] !== T.CLEAR) return ERR(m.type[t] === T.WATER ? 'Can\'t build on water' : 'Something in the way');
      if (m.bridgeOver[t] >= 0) return ERR('Bridge in the way');
      cost += HL.Build.clearGroundCost(g, t);
    }
    const lv = HL.Build.planLevel(g, x, y, x1, y1, null);
    if (!lv.ok) return ERR(lv.err);
    cost += lv.cost;
    let st = adjacentStation(g, cid, x, y, x1, y1, join);
    if (st && st.airport) st = null;
    if (!spreadOk(st, x, y, x1, y1)) return ERR('Station would be too spread out');
    // town noise: towns accept a limited number of airports nearby
    const tw = HL.Build.townAt(g, x, y, 10);
    if (tw && at.size >= 1) {
      let near = 0;
      for (const s of g.stations) if (s && s.airport && HL.manh(s.x, s.y, tw.x, tw.y) < tw.radius + 12) near++;
      const allow = 1 + Math.floor(tw.pop / 2500);
      if (near >= allow) return ERR('Local authority of ' + tw.name + ' won\'t allow another airport (noise limit)');
    }
    if (exec) {
      HL.Build.applyLevel(g, lv);
      if (!st) st = newStation(g, cid, x + (at.w >> 1), y + (at.h >> 1));
      for (let yy = y; yy <= y1; yy++) for (let xx = x; xx <= x1; xx++) {
        const t = m.t(xx, yy);
        HL.Build.clearGround(g, cid, t);
        m.type[t] = T.STATION; m.idx[t] = st.id; m.owner[t] = cid;
        m.m1[t] = K.AIR | (((xx - x) + (yy - y) * at.w) << 4);
        m.mark(t);
      }
      st.airport = { type: typeId, x, y, w: at.w, h: at.h, built: g.date, stands: new Array(at.stands).fill(-1), runwayBusy: 0, runway2Busy: 0, queue: [] };
      if (typeId === 'heli') st.heliport = true;
      addTiles(g, st, x, y, x1, y1);
      S.recomputeRect(g, st); S.updateCatch(g, st);
      HL.emit('build', 'station', m.t(x, y));
    }
    return OK(cost);
  };

  // oil platform station (owned by nobody, usable by every company's ships)
  S.makeRigStation = function (g, ind) {
    const m = g.map;
    const st = newStation(g, HL.OWNER_NONE, ind.x + 1, ind.y + 1);
    st.name = (g.towns[st.town] ? g.towns[st.town].name : 'Offshore') + ' Platform';
    st.rig = ind.id;
    // dock water = a water tile next to the rig
    let wt = -1;
    for (const d of [2, 1, 3, 0]) for (let i = 0; i < ind.w && wt < 0; i++) {
      const x = d === 0 ? ind.x + i : d === 2 ? ind.x + i : d === 1 ? ind.x + ind.w : ind.x - 1;
      const y = d === 0 ? ind.y - 1 : d === 2 ? ind.y + ind.h : ind.y + i;
      if (m.inside(x, y) && m.type[m.t(x, y)] === T.WATER) { wt = m.t(x, y); break; }
    }
    st.dock = { t: m.t(ind.x + 1, ind.y + 1), water: wt, dir: 0 };
    st.fac = S.FAC.dock; st.tileCount = 1;
    st.rect = { x0: ind.x, y0: ind.y, x1: ind.x + ind.w - 1, y1: ind.y + ind.h - 1 };
    S.updateCatch(g, st);
    ind.station = st.id;
    return st;
  };

  // ---------- removal ----------
  S.removeTile = function (g, cid, x, y, exec) {
    const m = g.map, t = m.t(x, y);
    const st = g.stations[m.idx[t]];
    if (!st) return ERR('No station');
    if (st.owner !== cid) return ERR(st.owner === HL.OWNER_NONE ? 'Can\'t remove this' : 'Owned by ' + g.companies[st.owner].name);
    const k = S.kindAt(m, t);
    if (k === K.AIR) {
      const ap = st.airport;
      for (const v of g.vehicles) if (v && v.kind === 'air' && !v.part && (v.airSt === st.id) && v.airState !== 'fly') return ERR('Aircraft in the way');
      if (exec) {
        for (let yy = ap.y; yy < ap.y + ap.h; yy++) for (let xx = ap.x; xx < ap.x + ap.w; xx++) { const tt = m.t(xx, yy); clearStationTile(g, tt); }
        st.airport = null; st.heliport = false;
        afterRemove(g, st);
      }
      return OK(Game.cost(g, S.airportType(ap.type).cost * 0.1));
    }
    if (k === K.RAIL && HL.Rail && HL.Rail.pieceOccupied(g, t, S.axisAt(m, t))) return ERR('Train in the way');
    if ((k === K.BUS || k === K.TRUCK) && HL.Road && HL.Road.tileOccupied(g, t)) return ERR('Vehicle in the way');
    if (exec) {
      if (k === K.RAIL) {
        // leave the track behind
        m.type[t] = T.RAIL; m.idx[t] = -1; m.m1[t] = 0; HL.Build.infra(g, cid).rail++;
        m.mark(t);
      } else if (k === K.BUS || k === K.TRUCK) {
        m.type[t] = T.ROAD; m.idx[t] = -1; m.m1[t] = 0; m.owner[t] = m.rowner[t]; m.mark(t);
      } else if (k === K.DOCK) { st.dock = null; clearStationTile(g, t); }
      else if (k === K.BUOY) { m.type[t] = T.WATER; m.owner[t] = HL.OWNER_WATER; m.idx[t] = -1; m.m1[t] = 0; m.mark(t); }
      afterRemove(g, st);
      g.blocksDirty = true;
    }
    return OK(Game.cost(g, 300));
  };
  function clearStationTile(g, t) {
    const m = g.map;
    m.type[t] = T.CLEAR; m.owner[t] = HL.OWNER_NONE; m.idx[t] = -1; m.m1[t] = 0; m.rail[t] = 0; m.road[t] = 0; m.ground[t] = GR.DIRT; m.gdens[t] = 0; m.mark(t);
  }
  function afterRemove(g, st) {
    S.recomputeRect(g, st);
    if (!st.tileCount) S.destroy(g, st);
    else S.updateCatch(g, st);
  }
  S.destroy = function (g, st) {
    const m = g.map;
    // clear tiles if any remain (bankruptcy)
    if (st.tileCount && !st.rig) {
      for (let y = st.rect.y0; y <= st.rect.y1; y++) for (let x = st.rect.x0; x <= st.rect.x1; x++) {
        const t = m.t(x, y);
        if (m.type[t] === T.STATION && m.idx[t] === st.id) {
          const k = S.kindAt(m, t);
          if (k === K.BUOY) { m.type[t] = T.WATER; m.owner[t] = HL.OWNER_WATER; m.idx[t] = -1; m.m1[t] = 0; m.mark(t); }
          else if ((k === K.BUS || k === K.TRUCK) && m.rowner[t] !== st.owner) { m.type[t] = T.ROAD; m.idx[t] = -1; m.m1[t] = 0; m.owner[t] = m.rowner[t]; m.mark(t); }
          else clearStationTile(g, t);
        }
      }
    }
    st.tileCount = 0;
    S.updateCatch(g, st);
    g.stations[st.id] = null;
    for (const o of g.orders) if (o) for (const od of o.list) if (od.st === st.id) od.dead = true;
    g.blocksDirty = true;
  };

  // ---------- cargo at stations ----------
  S.cs = function (s, c) {
    return s.cargo[c] || (s.cargo[c] = { wait: [], n: 0, rating: 175, lastPick: -1, everPicked: false, lastSpeed: 0, lastAge: 0, daysSince: 0 });
  };
  S.waiting = (s, c) => s.cargo[c] ? s.cargo[c].n : 0;
  // put cargo produced somewhere into a station
  S.addCargo = function (g, s, c, n, sx, sy, srcSt) {
    if (n <= 0) return;
    const cs = S.cs(s, c);
    const last = cs.wait[cs.wait.length - 1];
    if (last && last.st === srcSt && last.d === 0 && !last.fs && last.sx === sx && last.sy === sy) last.n += n;
    else cs.wait.push({ n, sx, sy, st: srcSt, d: 0, fs: 0 });
    cs.n += n;
    s.monthIn[c] = (s.monthIn[c] || 0) + n;
  };
  // take up to n units destined anywhere except the station they came from
  S.takeCargo = function (g, s, c, n, notTo) {
    const cs = s.cargo[c]; if (!cs || !cs.n || n <= 0) return [];
    const out = [];
    for (let i = 0; i < cs.wait.length && n > 0;) {
      const p = cs.wait[i];
      if (notTo != null && p.st === notTo && p.d === 0 && !p.fs) { i++; continue; }
      if (p.n <= n) { out.push(p); n -= p.n; cs.n -= p.n; cs.wait.splice(i, 1); }
      else {
        const share = p.fs * n / p.n;
        out.push({ n, sx: p.sx, sy: p.sy, st: p.st, d: p.d, fs: share });
        p.n -= n; p.fs -= share; cs.n -= n; n = 0;
      }
    }
    return out;
  };
  // distribute generated cargo to the (up to 2) best rated stations covering the source
  S.moveToStations = function (g, c, amt, list, sx, sy) {
    if (!list || !list.length || amt <= 0) return 0;
    let best = null, second = null;
    for (const sid of list) {
      const s = g.stations[sid];
      if (!s || s.buoy) continue;
      const cs = s.cargo[c];
      if (!cs || !cs.everPicked) continue;
      if (!S.servesCargo(s, c)) continue;
      if (!best || cs.rating > best.cargo[c].rating) { second = best; best = s; }
      else if (!second || cs.rating > second.cargo[c].rating) second = s;
    }
    if (!best) return 0;
    const r1 = best.cargo[c].rating;
    // exclusive transport rights
    const tw = g.towns[best.town];
    if (tw && tw.exclusive && tw.exclusive.until > g.date && tw.exclusive.cid !== best.owner && HL.manh(sx, sy, tw.x, tw.y) < tw.radius + 4) {
      if (second && second.owner === tw.exclusive.cid) { best = second; second = null; } else return 0;
    }
    if (!second) {
      const moved = Math.floor(amt * (r1 + 1) / 256 + (g.rng.next() < ((amt * (r1 + 1)) % 256) / 256 ? 1 : 0));
      S.addCargo(g, best, c, moved, sx, sy, best.id);
      return moved;
    }
    const r2 = second.cargo[c].rating;
    const total = Math.floor(amt * (Math.max(r1, r2) + 1) / 256 + 0.5);
    const a1 = Math.round(total * r1 / (r1 + r2 || 1));
    S.addCargo(g, best, c, a1, sx, sy, best.id);
    S.addCargo(g, second, c, total - a1, sx, sy, second.id);
    return total;
  };
  // does the station have a facility able to load this cargo type at all?
  S.servesCargo = function (s, c) {
    if (c === 'pax') return !!(s.fac & (S.FAC.rail | S.FAC.bus | S.FAC.dock | S.FAC.air));
    if (c === 'mail') return !!(s.fac & (S.FAC.rail | S.FAC.truck | S.FAC.dock | S.FAC.air));
    return !!(s.fac & (S.FAC.rail | S.FAC.truck | S.FAC.dock));
  };

  // ---------- ratings (every 2.5 days per station, staggered) ----------
  S.daily = function (g) {
    const day = g.date;
    for (const s of g.stations) {
      if (!s || s.buoy) continue;
      if ((s.id + day) % 3 !== 0) continue;
      for (const c in s.cargo) S.updateRating(g, s, c);
    }
    // acceptance refresh every 10 days, staggered
    for (const s of g.stations) if (s && !s.buoy && (s.id + day) % 10 === 0) S.updateAcceptance(g, s);
  };
  S.updateRating = function (g, s, c) {
    const cs = s.cargo[c];
    if (!cs.everPicked) return;
    cs.daysSince = cs.lastPick >= 0 ? g.date - cs.lastPick : 999;
    let r = 0;
    const sp = cs.lastSpeed;
    if (sp > 85) r += Math.min(42, Math.floor((sp - 85) / 4));
    let ds = cs.daysSince;
    if (cs.lastShip) ds = Math.floor(ds / 4);
    r += ds > 21 ? 0 : ds > 12 ? 25 : ds > 6 ? 45 : ds > 3 ? 65 : 95;
    const w = cs.n;
    r += w > 1500 ? -90 : w > 1000 ? -35 : w > 600 ? 0 : w > 300 ? 10 : w > 100 ? 30 : 40;
    const age = cs.lastAge;
    r += age < 1 ? 33 : age < 2 ? 20 : age < 3 ? 10 : 0;
    const tw = g.towns[s.town];
    if (tw && tw.statues && tw.statues[s.owner]) r += 26;
    if (tw && tw.advert && tw.advert[s.owner] > g.date) r += 30;
    r += 40; // base
    r = HL.clamp(r, 0, 255);
    // move toward target slowly
    const diff = r - cs.rating;
    cs.rating += HL.clamp(diff, -2, 2) * (Math.abs(diff) > 2 ? 1 : 1);
    if (Math.abs(diff) > 2) cs.rating += Math.sign(diff) * 0; // smoothing kept intentionally gentle
    cs.rating = HL.clamp(Math.round(cs.rating), 0, 255);
    // poor ratings make waiting cargo give up
    if (cs.n > 100 && cs.rating < 128 && g.rng.chance((128 - cs.rating) / 256)) {
      const lose = Math.max(1, Math.floor(cs.n * (0.02 + (128 - cs.rating) / 2048)));
      S.takeCargo(g, s, c, lose);
    }
    if (cs.n > 4095) S.takeCargo(g, s, c, cs.n - 4095);
  };
  S.monthly = function (g) {
    for (const s of g.stations) {
      if (!s) continue;
      s.lastIn = s.monthIn; s.lastOut = s.monthOut; s.monthIn = {}; s.monthOut = {};
    }
  };
  // record a vehicle trying to load here (enables cargo delivery to this station)
  S.noteVisit = function (g, s, c, v) {
    const cs = S.cs(s, c);
    if (!cs.everPicked) { cs.everPicked = true; cs.rating = 175; }
    cs.lastPick = g.date;
    const m = HL.VEH[v.model];
    cs.lastSpeed = Math.round(Math.min(255, (v.kind === 'air' ? m.speed * HL.PLANE_SPEED : m.speed)));
    cs.lastAge = Math.floor(v.age / 365);
    cs.lastShip = v.kind === 'ship';
  };
  S.ratingPct = (s, c) => s.cargo[c] && s.cargo[c].everPicked ? Math.round(s.cargo[c].rating * 100 / 255) : null;
})(typeof window !== 'undefined' ? window : globalThis);
