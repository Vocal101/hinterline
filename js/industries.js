// Industries: placement, production, processing chains, monthly changes, openings and closures.
(function (root) {
  const HL = root.HL;
  const T = HL.T, GR = HL.GR;
  const Ind = HL.Ind = {};
  const Game = HL.Game;
  const CYCLE = 240; // ticks between production runs (4 days)

  Ind.typesFor = (g) => HL.INDUSTRY_IDS.filter(id => HL.INDUSTRY[id].climates.includes(g.opts.climate));
  Ind.yearOk = (g, def) => { const y = HL.ymd(g.date).y; return !def.years || (y >= def.years[0] && y <= def.years[1]); };

  Ind.generate = function (g, o, rng) {
    const m = g.map;
    const types = Ind.typesFor(g).filter(id => Ind.yearOk(g, HL.INDUSTRY[id]));
    const area = m.W * m.H;
    const target = Math.round(area / 1024 * [1.1, 1.9, 2.8, 3.8, 5][o.industries]);
    // every chain gets at least one of each building first
    const order = types.slice();
    for (let i = order.length; i < target; i++) order.push(rng.weighted(types.map(id => [id, HL.INDUSTRY[id].freq])));
    for (const id of order) {
      for (let k = 0; k < 400; k++) {
        const x = 3 + rng.int(m.W - 6), y = 3 + rng.int(m.H - 6);
        if (Ind.tryPlace(g, id, x, y, rng, { gen: true })) break;
      }
    }
  };

  Ind.siteCheck = function (g, id, x, y) {
    const m = g.map, def = HL.INDUSTRY[id];
    const w = def.w, h = def.h;
    if (x < 2 || y < 2 || x + w >= m.W - 2 || y + h >= m.H - 2) return false;
    let desert = 0, rain = 0, snow = 0;
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
      const t = m.t(x + dx, y + dy);
      if (def.place === 'sea') { if (m.type[t] !== T.WATER || m.bridgeOver[t] >= 0) return false; continue; }
      if (m.type[t] !== T.CLEAR || m.bridgeOver[t] >= 0) return false;
      if (m.tileMin(x + dx, y + dy) === 0) return false;
      if (m.zone[t] === 1) desert++; if (m.zone[t] === 2) rain++;
      if (m.tileMax(x + dx, y + dy) >= m.snowline) snow++;
    }
    const n = w * h;
    if (def.place === 'sea') {
      // open water all round
      for (let dy = -2; dy < h + 2; dy++) for (let dx = -2; dx < w + 2; dx++) { if (!m.inside(x + dx, y + dy) || m.type[m.t(x + dx, y + dy)] !== T.WATER) return false; }
    }
    if (def.place === 'desert' && desert < n * 0.7) return false;
    if (def.place === 'rainforest' && rain < n * 0.7) return false;
    if (def.place === 'snow' && snow < n * 0.6) return false;
    if (def.place === 'lowland') { if (g.opts.climate === 'arctic' ? snow > 0 : m.tileMax(x, y) > 7) return false; }
    if (g.opts.climate === 'desert' && (def.place === 'land') && rain > n * 0.5 && id === 'water_source') return false;
    if (def.place === 'shore') {
      let near = false;
      for (let r = 0; r < 60 && !near; r++) { const a = g.rng.next() * 6.28, d = 2 + g.rng.next() * 9; const tx = Math.round(x + Math.cos(a) * d), ty = Math.round(y + Math.sin(a) * d); if (m.inside(tx, ty) && m.type[m.t(tx, ty)] === T.WATER) near = true; }
      let anySea = false; for (let i = 0; i < 40; i++) if (m.type[g.rng.int(m.W * m.H)] === T.WATER) anySea = true;
      if (!near && anySea) return false;
    }
    // keep clear of towns and other industries
    for (const tw of g.towns) {
      if (!tw) continue;
      const d = HL.manh(x + w / 2, y + h / 2, tw.x, tw.y);
      if (def.place === 'town') continue;
      if (d < tw.radius + 3) return false;
    }
    if (def.place === 'town') {
      let ok = false;
      for (const tw of g.towns) if (tw && tw.pop >= (def.minPop || 0) && HL.manh(x, y, tw.x, tw.y) <= tw.radius + 1 && HL.manh(x, y, tw.x, tw.y) >= 1) ok = true;
      if (!ok) return false;
      // town buildings must touch a road
      let road = false;
      for (let dy = -1; dy <= h; dy++) for (let dx = -1; dx <= w; dx++) { if (m.inside(x + dx, y + dy) && m.type[m.t(x + dx, y + dy)] === T.ROAD) road = true; }
      if (!road) return false;
    }
    for (const o of g.industries) {
      if (!o) continue;
      const gap = 3;
      if (x < o.x + o.w + gap && x + w + gap > o.x && y < o.y + o.h + gap && y + h + gap > o.y) return false;
      if (o.type === id && HL.manh(x, y, o.x, o.y) < 16) return false;
    }
    return true;
  };

  Ind.tryPlace = function (g, id, x, y, rng, opts) {
    const def = HL.INDUSTRY[id];
    if (!Ind.siteCheck(g, id, x, y)) return null;
    const m = g.map;
    if (def.place !== 'sea') {
      const lv = HL.Build.planLevel(g, x, y, x + def.w - 1, y + def.h - 1, null, false);
      if (!lv.ok) return null;
      if (lv.h === 0) return null;
      HL.Build.applyLevel(g, lv);
    }
    return Ind.create(g, id, x, y, rng, opts);
  };

  Ind.create = function (g, id, x, y, rng, opts) {
    const m = g.map, def = HL.INDUSTRY[id];
    const tw = HL.Build.closestTown(g, x, y);
    const ind = HL.alloc(g.industries, {
      type: id, x, y, w: def.w, h: def.h, town: tw ? tw.id : -1,
      name: (tw ? tw.name + ' ' : '') + def.name, level: 16, prod: {}, stock: {}, acc: {}, lastAcc: {},
      founded: g.date, closing: 0, lowMonths: 0, seed: rng.int(1 << 30), station: -1,
    });
    // production levels vary a little from the start
    if (def.prod) {
      ind.level = rng.weighted([[8, 2], [12, 3], [16, 6], [24, 3], [32, 1]]);
      for (const [c, base] of def.prod) ind.prod[c] = { base, made: 0, moved: 0, lastMade: 0, lastMoved: 0, hist: [] };
    }
    if (def.out) for (const c of def.out) ind.prod[c] = { base: 0, made: 0, moved: 0, lastMade: 0, lastMoved: 0, hist: [] };
    for (let dy = 0; dy < def.h; dy++) for (let dx = 0; dx < def.w; dx++) {
      const t = m.t(x + dx, y + dy);
      if (def.place !== 'sea') { m.trees[t] = 0; m.ground[t] = GR.DIRT; }
      m.type[t] = T.IND; m.idx[t] = ind.id; m.owner[t] = HL.OWNER_NONE; m.m1[t] = dx + dy * def.w; m.m2[t] = 0;
      m.mark(t);
    }
    if (def.fields) Ind.plantFields(g, ind, rng);
    if (id === 'forest' || id === 'lumber_yard' || id === 'rubber_farm') Ind.plantForest(g, ind, rng);
    if (def.station) HL.Stations.makeRigStation(g, ind);
    // stations nearby now cover a new industry
    g.catchVer++;
    for (const s of g.stations) if (s && s.catch && rectOverlap(s.catch, x, y, def.w, def.h)) HL.Stations.updateAcceptance(g, s);
    return ind;
  };
  const rectOverlap = (c, x, y, w, h) => x <= c.x1 && x + w - 1 >= c.x0 && y <= c.y1 && y + h - 1 >= c.y0;

  Ind.plantFields = function (g, ind, rng) {
    const m = g.map;
    const n = 10 + rng.int(14);
    for (let i = 0; i < n * 3; i++) {
      const x = ind.x - 4 + rng.int(ind.w + 8), y = ind.y - 4 + rng.int(ind.h + 8);
      if (!m.inside(x, y)) continue;
      const t = m.t(x, y);
      if (m.type[t] !== T.CLEAR || m.tileMin(x, y) === 0) continue;
      // fields come in rectangular patches sharing a crop and row direction
      const crop = (HL.hash2(x >> 1, y >> 1, ind.seed) * 4) | 0, axis = HL.hash2(x >> 2, y >> 2, ind.seed + 1) < 0.5 ? 1 : 0;
      m.ground[t] = GR.FIELD; m.gdens[t] = crop | (axis << 2); m.trees[t] = 0; m.m2[t] = rng.int(24);
      m.mark(t);
    }
  };
  Ind.plantForest = function (g, ind, rng) {
    const m = g.map;
    for (let i = 0; i < 40; i++) {
      const x = ind.x - 3 + rng.int(ind.w + 6), y = ind.y - 3 + rng.int(ind.h + 6);
      if (!m.inside(x, y)) continue;
      const t = m.t(x, y);
      if (m.type[t] !== T.CLEAR || m.ground[t] === GR.FIELD) continue;
      m.trees[t] = (2 + rng.int(3)) | (3 << 3); m.tspec[t] = HL.pickTree(m, g.opts.climate, x, y, rng.next()); m.mark(t);
    }
  };

  // stations whose catchment touches the industry
  Ind.stations = function (g, ind) {
    if (ind._sv === g.catchVer && ind._st) return ind._st;
    const m = g.map, set = new Set();
    for (let dy = 0; dy < ind.h; dy++) for (let dx = 0; dx < ind.w; dx++) {
      const l = g.catchIdx.get(m.t(ind.x + dx, ind.y + dy));
      if (l) for (const s of l) set.add(s);
    }
    if (ind.station >= 0) set.add(ind.station);
    ind._st = Array.from(set); ind._sv = g.catchVer;
    return ind._st;
  };

  Ind.tick = function (g) {
    const phase = g.ticks % CYCLE;
    for (const ind of g.industries) {
      if (!ind || (ind.seed % CYCLE) !== phase) continue;
      Ind.produce(g, ind);
    }
  };
  Ind.produce = function (g, ind) {
    const def = HL.INDUSTRY[ind.type];
    const cx = ind.x + (ind.w >> 1), cy = ind.y + (ind.h >> 1);
    const list = Ind.stations(g, ind);
    if (def.prod) for (const [c] of def.prod) {
      const p = ind.prod[c];
      let amt = Math.round(p.base * 1.4 * ind.level / 16 * (0.85 + g.rng.next() * 0.3));
      if (g.econ.recession > g.date) amt = amt >> 1;
      if (amt <= 0) continue;
      p.made += amt;
      p.moved += HL.Stations.moveToStations(g, c, amt, list, cx, cy);
    }
    if (def.out) {
      let total = 0;
      for (const c in ind.stock) { total += ind.stock[c]; ind.stock[c] = 0; }
      if (total > 0) for (const c of def.out) {
        const p = ind.prod[c];
        p.made += total;
        p.moved += HL.Stations.moveToStations(g, c, total, list, cx, cy);
      }
    }
  };
  // cargo delivered to a station: give it to the nearest accepting industry in range
  Ind.deliver = function (g, s, c, n) {
    let best = null, bd = 1e9;
    for (const id of HL.Stations.industriesNear(g, s)) {
      const ind = g.industries[id]; if (!ind) continue;
      const def = HL.INDUSTRY[ind.type];
      if (!def.accepts || !def.accepts.includes(c)) continue;
      const d = HL.manh(s.x, s.y, ind.x, ind.y);
      if (d < bd) { bd = d; best = ind; }
    }
    if (!best) return null;
    const def = HL.INDUSTRY[best.type];
    best.acc[c] = (best.acc[c] || 0) + n;
    if (def.out) best.stock[c] = (best.stock[c] || 0) + n;
    best.lastServed = g.date;
    return best;
  };

  Ind.monthly = function (g) {
    const rng = g.rng;
    for (const ind of g.industries) {
      if (!ind) continue;
      const def = HL.INDUSTRY[ind.type];
      let anyPct = 0, served = false;
      for (const c in ind.prod) {
        const p = ind.prod[c];
        p.lastMade = p.made; p.lastMoved = p.moved;
        p.pct = p.made ? Math.round(p.moved * 100 / p.made) : 0;
        p.hist.push([p.made, p.moved]); if (p.hist.length > 24) p.hist.shift();
        anyPct = Math.max(anyPct, p.pct);
        if (p.moved > 0) served = true;
        p.made = 0; p.moved = 0;
      }
      ind.lastAcc = ind.acc; ind.acc = {};
      ind.pct = anyPct;
      if (Object.keys(ind.lastAcc).length) served = true;
      ind.lowMonths = served ? 0 : ind.lowMonths + 1;
      if (ind.closing) { ind.closing--; if (!ind.closing) Ind.close(g, ind); continue; }
      // primary industries change production
      if (def.prod && !def.station !== undefined && def.prod.length && rng.chance(g.diff.economy ? 0.05 : 0.02)) {
        const good = anyPct > 60;
        const up = good ? rng.chance(0.67) : rng.chance(0.33);
        const old = ind.level;
        if (up) ind.level = Math.min(128, Math.round(ind.level * (1.04 + rng.next() * 0.3)));
        else ind.level = Math.max(4, Math.round(ind.level * (0.96 - rng.next() * 0.3)));
        if (served && Math.abs(ind.level - old) >= old * 0.2 && ind.type !== 'bank') {
          const pct = Math.round((ind.level / old - 1) * 100);
          Game.news(g, 'industry', ind.name + (pct > 0 ? ' increases production' : ' cuts production'), (pct > 0 ? 'Output up ' : 'Output down ') + Math.abs(pct) + '%.', { tile: g.map.t(ind.x, ind.y) });
        }
        if (ind.level <= 4 && !served && rng.chance(0.25)) Ind.announceClose(g, ind);
      }
      // long-neglected industries close
      const ageY = (g.date - ind.founded) / 365;
      if (!ind.closing && ageY > 5 && ind.lowMonths > 36 && rng.chance(0.012) && ind.type !== 'oil_rig') Ind.announceClose(g, ind);
      // temperate oil fields run dry after their era
      if (!ind.closing && ind.type === 'oil_wells' && g.opts.climate === 'temperate' && HL.ymd(g.date).y > 1960 && rng.chance(0.02)) Ind.announceClose(g, ind);
    }
    // new industries
    if (g.opts.industries > 0 && rng.chance(0.06 * (1 + g.opts.industries * 0.4) * Math.sqrt(g.map.W * g.map.H) / 128)) Ind.spawnRandom(g, true);
  };
  Ind.announceClose = function (g, ind) {
    ind.closing = 3;
    Game.news(g, 'industry', ind.name + ' announces imminent closure', 'Without enough business the owners will shut it down within months.', { tile: g.map.t(ind.x, ind.y), big: true });
  };
  Ind.close = function (g, ind) {
    const m = g.map;
    for (let dy = 0; dy < ind.h; dy++) for (let dx = 0; dx < ind.w; dx++) {
      const t = m.t(ind.x + dx, ind.y + dy);
      if (m.type[t] !== T.IND || m.idx[t] !== ind.id) continue;
      if (HL.INDUSTRY[ind.type].place === 'sea') { m.type[t] = T.WATER; m.owner[t] = HL.OWNER_WATER; }
      else { m.type[t] = T.CLEAR; m.owner[t] = HL.OWNER_NONE; m.ground[t] = GR.DIRT; m.gdens[t] = 0; }
      m.idx[t] = -1; m.m1[t] = 0; m.mark(t);
    }
    if (ind.station >= 0 && g.stations[ind.station]) HL.Stations.destroy(g, g.stations[ind.station]);
    g.industries[ind.id] = null;
    g.catchVer++;
    for (const s of g.stations) if (s && s.catch && rectOverlap(s.catch, ind.x, ind.y, ind.w, ind.h)) HL.Stations.updateAcceptance(g, s);
    HL.emit('industryClosed', ind);
  };
  Ind.spawnRandom = function (g, announce, typeId) {
    const rng = g.rng, m = g.map;
    const types = Ind.typesFor(g).filter(id => Ind.yearOk(g, HL.INDUSTRY[id]));
    const id = typeId || rng.weighted(types.map(t => [t, HL.INDUSTRY[t].freq]));
    for (let k = 0; k < 600; k++) {
      const x = 3 + rng.int(m.W - 6), y = 3 + rng.int(m.H - 6);
      const ind = Ind.tryPlace(g, id, x, y, rng, {});
      if (ind) {
        if (announce) Game.news(g, 'industry', 'New ' + HL.INDUSTRY[id].name.toLowerCase() + ' near ' + (g.towns[ind.town] ? g.towns[ind.town].name : 'the coast'), 'Construction has finished on the ' + ind.name + '.', { tile: m.t(ind.x, ind.y), big: true });
        return ind;
      }
    }
    return null;
  };
  // player-funded industry: secondary industries can be placed, primaries are prospected
  Ind.fundCost = (g, id) => Math.round(HL.INDUSTRY[id].cost * g.econ.costMul);
  Ind.fund = function (g, cid, id, x, y) {
    const def = HL.INDUSTRY[id];
    const cost = Ind.fundCost(g, id);
    if (!Game.canAfford(g, cid, cost)) return { ok: false, err: 'Not enough money' };
    let ind;
    if (x != null) {
      if (!Ind.siteCheck(g, id, x, y)) return { ok: false, err: 'Can\'t build that here' };
      ind = Ind.tryPlace(g, id, x, y, g.rng, {});
      if (!ind) return { ok: false, err: 'Site not suitable' };
    } else {
      // prospecting can fail
      if (def.prod && !def.accepts && g.rng.chance(0.35)) { Game.spend(g, cid, 'other', cost); return { ok: true, cost, failed: true }; }
      ind = Ind.spawnRandom(g, false, id);
      if (!ind) return { ok: false, err: 'No suitable site found anywhere' };
    }
    Game.spend(g, cid, 'other', cost);
    Game.news(g, 'industry', 'New ' + def.name.toLowerCase() + ' opens', g.companies[cid].name + ' funded the new ' + ind.name + '.', { tile: g.map.t(ind.x, ind.y), cid });
    return { ok: true, cost, ind };
  };
  Ind.monthlyOutput = (ind) => { let o = {}; for (const c in ind.prod) o[c] = ind.prod[c].lastMade; return o; };
})(typeof window !== 'undefined' ? window : globalThis);
