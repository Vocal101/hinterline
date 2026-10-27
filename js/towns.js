// Towns: generation, growth, houses, passengers/mail, ratings and local authority actions.
(function (root) {
  const HL = root.HL;
  const T = HL.T, GR = HL.GR;
  const TW = HL.Towns = {};
  const Game = HL.Game;

  // house tile encoding (m1): bits 0-2 tier, 3-7 variant, 8-10 style era, bit 12 special, bits 13-15 special id
  // m2: bits 0-1 build stage (3 = done), bits 2-15 age in loops
  TW.STYLE_YEARS = [0, 1905, 1945, 1975, 2012];
  TW.styleFor = year => { let s = 0; for (let i = 0; i < TW.STYLE_YEARS.length; i++) if (year >= TW.STYLE_YEARS[i]) s = i; return s; };
  TW.TIER_YEARS = [0, 0, 0, 1890, 1948, 1968];
  const SPECIALS = ['townhall', 'church', 'market', 'hospital', 'stadium'];
  TW.SPECIALS = SPECIALS;
  TW.isSpecial = (m, t) => !!(m.m1[t] & 0x1000);
  TW.specialId = (m, t) => SPECIALS[(m.m1[t] >> 13) & 7];
  TW.houseTier = (m, t) => TW.isSpecial(m, t) ? 2 : m.m1[t] & 7;
  TW.houseStyle = (m, t) => (m.m1[t] >> 8) & 7;
  TW.houseVariant = (m, t) => (m.m1[t] >> 3) & 31;
  TW.stage = (m, t) => m.m2[t] & 3;
  TW.popOf = function (m, t) {
    if (TW.isSpecial(m, t)) return HL.HOUSE_SPECIAL[TW.specialId(m, t)].pop;
    const tier = m.m1[t] & 7, v = (m.m1[t] >> 3) & 31;
    const r = HL.HOUSE_TIERS[tier].pop;
    return Math.round(r[0] + (r[1] - r[0]) * ((v * 7) % 31) / 30);
  };
  TW.tileAccept = function (g, t) {
    const m = g.map;
    if (TW.stage(m, t) < 3) return {};
    const tw = g.towns[m.idx[t]];
    const acc = TW.isSpecial(m, t) ? HL.HOUSE_SPECIAL[TW.specialId(m, t)].acc : HL.HOUSE_TIERS[m.m1[t] & 7].acc;
    const out = {};
    const cl = g.opts.climate;
    for (const c in acc) {
      if (c === 'food' && !(tw && tw.needs.includes('food')) && cl !== 'arctic' && cl !== 'desert') continue;
      if (c === 'water' && !(tw && tw.needs.includes('water'))) continue;
      out[c] = acc[c];
    }
    return out;
  };

  // ---------- ratings ----------
  TW.RATING_NAMES = [[-1000, 'Appalling'], [-400, 'Very Poor'], [-200, 'Poor'], [0, 'Mediocre'], [200, 'Good'], [400, 'Very Good'], [600, 'Excellent'], [800, 'Outstanding']];
  TW.ratingName = r => { let n = 'Appalling'; for (const [v, s] of TW.RATING_NAMES) if (r >= v) n = s; return n; };
  TW.ratingOf = (tw, cid) => tw.ratings[cid] == null ? 175 : tw.ratings[cid];
  TW.changeRating = function (g, tw, cid, delta, limit) {
    const r = TW.ratingOf(tw, cid);
    let n = r + delta;
    if (delta < 0 && limit != null) n = Math.max(Math.min(r, limit), n);
    if (delta > 0 && limit != null) n = Math.min(Math.max(r, limit), n);
    tw.ratings[cid] = HL.clamp(Math.round(n), -1000, 1000);
  };

  // ---------- generation ----------
  TW.generate = function (g, o, rng) {
    const m = g.map;
    const area = m.W * m.H;
    const n = Math.max(2, Math.round(area / 1024 * [0.35, 0.55, 0.8, 1.05, 1.4][o.towns]));
    const used = new Set();
    let tries = 0;
    while (g.towns.length < n && tries++ < n * 300) {
      const x = 6 + rng.int(m.W - 12), y = 6 + rng.int(m.H - 12);
      if (!TW.goodSite(g, x, y)) continue;
      let far = true;
      for (const tw of g.towns) if (HL.manh(x, y, tw.x, tw.y) < 14) { far = false; break; }
      if (!far) continue;
      const city = rng.chance(0.12) || (g.towns.length === 0 && n > 3);
      const tw = TW.found(g, x, y, rng, city, used);
      if (!tw) continue;
      const steps = city ? 90 + rng.int(70) : 10 + rng.int(36);
      for (let i = 0; i < steps; i++) TW.growStep(g, tw, true);
      // finish construction instantly at world start
      TW.completeAll(g, tw);
    }
  };
  TW.goodSite = function (g, x, y) {
    const m = g.map;
    if (!m.inside(x, y) || m.type[m.t(x, y)] !== T.CLEAR) return false;
    if (!m.isFlat(x, y) || m.tileMin(x, y) === 0) return false;
    let land = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { if (m.inside(x + dx, y + dy) && m.type[m.t(x + dx, y + dy)] === T.CLEAR) land++; }
    if (land < 20) return false;
    if (g.opts.climate === 'arctic' && m.tileMax(x, y) > m.snowline + 3) return false;
    return true;
  };
  TW.found = function (g, x, y, rng, city, used) {
    const m = g.map;
    const tw = HL.alloc(g.towns, {
      name: HL.NAMES.town(rng, g.opts.climate, used || new Set(g.towns.filter(Boolean).map(t => t.name))),
      x, y, pop: 0, houses: 0, radius: 4, city: !!city, layout: rng.chance(0.3) ? 'grid' : 'organic',
      ratings: {}, statues: {}, advert: {}, exclusive: null, fundUntil: 0, roadworks: 0, bribeBan: {},
      growthTimer: 0, growthDays: 120, roads: [], specials: {},
      passMax: 0, passAct: 0, mailMax: 0, mailAct: 0, lastPassMax: 0, lastPassAct: 0, lastMailMax: 0, lastMailAct: 0,
      recv: {}, lastRecv: {}, needs: [], founded: HL.ymd(g.date).y, popHist: [],
    });
    // needs by climate
    const cl = g.opts.climate;
    if (cl === 'arctic' && m.tileMax(x, y) >= m.snowline) tw.needs = ['food'];
    if (cl === 'desert' && m.zone[m.t(x, y)] === 1) tw.needs = ['water', 'food'];
    // central crossroads
    const len = city ? 3 : 2;
    for (let d = 0; d < 4; d++) for (let i = 0; i <= len; i++) {
      const tx = x + HL.DX[d] * i, ty = y + HL.DY[d] * i;
      if (!m.inside(tx, ty)) break;
      const r = TW.townRoad(g, tw, tx, ty, (i > 0 ? 1 << HL.opp(d) : 0) | (i < len ? 1 << d : 0));
      if (!r) break;
    }
    // town hall next to the crossing
    for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      if (TW.placeHouse(g, tw, x + dx, y + dy, { special: 'townhall' })) break;
    }
    return tw;
  };
  // add road bits for a town; returns true if the tile now has road
  TW.townRoad = function (g, tw, x, y, rb) {
    const m = g.map;
    if (!m.inside(x, y) || x < 2 || y < 2 || x >= m.W - 2 || y >= m.H - 2) return false;
    const t = m.t(x, y), k = m.type[t];
    if (k === T.ROAD) {
      if (HL.Build.bridgeOrTunnelAt(g, t)) return false;
      if ((m.road[t] & rb) === rb) return true;
      if (m.rowner[t] !== HL.OWNER_TOWN && m.rowner[t] !== HL.OWNER_NONE) {
        // company road: towns may extend it
      }
      m.road[t] |= rb; m.mark(t); return true;
    }
    if (k !== T.CLEAR) return false;
    if (m.ground[t] === GR.ROCKS && g.rng.chance(0.7)) return false;
    m.type[t] = T.ROAD; m.road[t] = rb; m.owner[t] = HL.OWNER_TOWN; m.rowner[t] = HL.OWNER_TOWN; m.trees[t] = 0; m.idx[t] = tw.id;
    m.mark(t);
    tw.roads.push(t);
    return true;
  };

  TW.chooseTier = function (g, tw, x, y) {
    const year = HL.ymd(g.date).y, rng = g.rng;
    const d = HL.dist(x, y, tw.x, tw.y);
    const rad = Math.max(2.5, tw.radius);
    const dn = d / rad + (rng.next() - 0.5) * 0.25;
    const pop = tw.pop;
    let tier;
    if (dn < 0.22) tier = pop > 5000 ? 5 : pop > 2200 ? 4 : pop > 700 ? 3 : pop > 250 ? 2 : 1;
    else if (dn < 0.42) tier = pop > 4000 ? 4 : pop > 1200 ? 3 : pop > 300 ? 2 : 1;
    else if (dn < 0.65) tier = pop > 2500 ? 3 : pop > 600 ? (rng.chance(0.5) ? 2 : 1) : 1;
    else tier = pop > 3000 && rng.chance(0.3) ? 2 : rng.chance(0.55) ? 0 : 1;
    if (tier >= 3 && rng.chance(0.25)) tier--;
    while (tier > 0 && year < TW.TIER_YEARS[tier]) tier--;
    return tier;
  };
  TW.placeHouse = function (g, tw, x, y, o) {
    o = o || {};
    const m = g.map;
    if (!m.inside(x, y) || x < 1 || y < 1 || x >= m.W - 1 || y >= m.H - 1) return false;
    const t = m.t(x, y);
    if (m.type[t] !== T.CLEAR || m.bridgeOver[t] >= 0) return false;
    if (m.tileMin(x, y) === 0 && m.isCoast(x, y)) return false;
    // houses face a road: need a road neighbour
    let hasRoad = false;
    for (let d = 0; d < 4; d++) { const nx = x + HL.DX[d], ny = y + HL.DY[d]; if (m.inside(nx, ny) && m.road[m.t(nx, ny)] && (m.type[m.t(nx, ny)] === T.ROAD)) { hasRoad = true; break; } }
    if (!hasRoad) return false;
    const year = HL.ymd(g.date).y;
    const style = TW.styleFor(year);
    const variant = g.rng.int(32);
    let v;
    if (o.special) v = 0x1000 | (SPECIALS.indexOf(o.special) << 13) | (style << 8) | (variant << 3);
    else { const tier = o.tier != null ? o.tier : TW.chooseTier(g, tw, x, y); v = tier | (variant << 3) | (style << 8); }
    m.type[t] = T.HOUSE; m.idx[t] = tw.id; m.owner[t] = HL.OWNER_TOWN; m.m1[t] = v; m.m2[t] = o.instant ? 3 : 0;
    m.trees[t] = 0; m.ground[t] = GR.DIRT;
    m.mark(t);
    tw.houses++;
    if (o.special) tw.specials[o.special] = t;
    if (o.instant) { tw.pop += TW.popOf(m, t); }
    TW.updateRadius(tw);
    return true;
  };
  TW.completeAll = function (g, tw) {
    const m = g.map;
    const r = tw.radius + 3;
    for (let y = tw.y - r; y <= tw.y + r; y++) for (let x = tw.x - r; x <= tw.x + r; x++) {
      if (!m.inside(x, y)) continue;
      const t = m.t(x, y);
      if (m.type[t] === T.HOUSE && m.idx[t] === tw.id && (m.m2[t] & 3) < 3) { m.m2[t] = (m.m2[t] & ~3) | 3 | ((g.rng.int(400)) << 2); tw.pop += TW.popOf(m, t); }
    }
  };
  TW.updateRadius = tw => { tw.radius = Math.round(3 + Math.sqrt(tw.houses) * 1.05); };
  TW.removeHouse = function (g, t) {
    const m = g.map, tw = g.towns[m.idx[t]];
    if (tw) {
      if ((m.m2[t] & 3) === 3) tw.pop -= TW.popOf(m, t);
      tw.houses--;
      if (TW.isSpecial(m, t)) delete tw.specials[TW.specialId(m, t)];
      TW.updateRadius(tw);
    }
    m.type[t] = T.CLEAR; m.idx[t] = -1; m.owner[t] = HL.OWNER_NONE; m.m1[t] = 0; m.m2[t] = 0; m.ground[t] = GR.DIRT; m.gdens[t] = 0;
    m.mark(t);
  };

  // pick a town road tile, biased toward the centre
  function pickRoad(g, tw) {
    const m = g.map;
    for (let i = 0; i < 6 && tw.roads.length; i++) {
      let best = -1, bd = 1e9;
      for (let k = 0; k < 3; k++) {
        const j = g.rng.int(tw.roads.length), t = tw.roads[j];
        if (m.type[t] !== T.ROAD && !(m.type[t] === T.RAIL && m.road[t]) && m.type[t] !== T.STATION) { tw.roads.splice(j, 1); continue; }
        const d = HL.manh(m.tx(t), m.ty(t), tw.x, tw.y) + g.rng.next() * 3;
        if (d < bd) { bd = d; best = t; }
      }
      if (best >= 0) return best;
    }
    return -1;
  }
  const onGrid = (tw, x, y, axisX) => axisX ? ((y - tw.y) % 4 + 4) % 4 === 0 : ((x - tw.x) % 4 + 4) % 4 === 0;

  // one growth event: build a house or extend the road network
  TW.growStep = function (g, tw, instant) {
    const m = g.map, rng = g.rng;
    for (let attempt = 0; attempt < 24; attempt++) {
      const rt = pickRoad(g, tw);
      if (rt < 0) return false;
      const x = m.tx(rt), y = m.ty(rt);
      const rb = m.road[rt];
      const d = rng.int(4);
      const nx = x + HL.DX[d], ny = y + HL.DY[d];
      if (!m.inside(nx, ny)) continue;
      const nt = m.t(nx, ny);
      if (HL.dist(nx, ny, tw.x, tw.y) > tw.radius + 4 + (tw.city ? 3 : 0)) continue;
      if (rb & (1 << d)) {
        // road continues; occasionally extend a dead end further
        if (m.type[nt] === T.CLEAR && rng.chance(0.5)) {
          if (TW.tryExtend(g, tw, x, y, d)) return true;
        }
        continue;
      }
      // side of road: house, or a new branch
      const deadEnd = HL.Build.bits(rb) === 1;
      const axisX = (d & 1) === 1; // moving along x
      let branch = rng.chance(deadEnd ? 0.7 : 0.18);
      if (tw.layout === 'grid') branch = onGrid(tw, nx, ny, axisX) && onGrid(tw, x, y, axisX) && rng.chance(0.6);
      if (branch && m.type[nt] === T.CLEAR) {
        // avoid running parallel right next to another road
        if (tw.layout !== 'grid' && parallelRoad(m, nx, ny, d)) { if (TW.placeHouse(g, tw, nx, ny, { instant })) return true; continue; }
        if (TW.tryExtend(g, tw, x, y, d)) return true;
        continue;
      }
      if (m.type[nt] === T.CLEAR) {
        if (m.ground[nt] === GR.FIELD && rng.chance(0.6)) continue;
        if (TW.placeHouse(g, tw, nx, ny, { instant })) {
          TW.maybeSpecial(g, tw, instant);
          return true;
        }
      } else if (m.type[nt] === T.HOUSE && m.idx[nt] === tw.id && !TW.isSpecial(m, nt)) {
        // densify: rebuild with a bigger building
        const want = TW.chooseTier(g, tw, nx, ny);
        if (want > (m.m1[nt] & 7) && (m.m2[nt] & 3) === 3 && rng.chance(0.5)) { TW.rebuild(g, tw, nt, want, instant); return true; }
      }
    }
    return false;
  };
  function parallelRoad(m, x, y, d) {
    // a road one tile to the side, running the same way
    for (const s of [(d + 1) & 3, (d + 3) & 3]) {
      const sx = x + HL.DX[s], sy = y + HL.DY[s];
      if (m.inside(sx, sy) && m.type[m.t(sx, sy)] === T.ROAD) return true;
    }
    return false;
  }
  TW.tryExtend = function (g, tw, x, y, d) {
    const m = g.map;
    const n = 1 + g.rng.int(3);
    let cx = x, cy = y;
    let built = 0;
    for (let i = 0; i < n; i++) {
      const nx = cx + HL.DX[d], ny = cy + HL.DY[d];
      if (!m.inside(nx, ny)) break;
      const nt = m.t(nx, ny);
      const k = m.type[nt];
      if (k === T.ROAD) { TW.townRoad(g, tw, cx, cy, 1 << d); TW.townRoad(g, tw, nx, ny, 1 << HL.opp(d)); built++; break; }
      if (k !== T.CLEAR) break;
      if (m.tileMin(nx, ny) === 0) break;
      if (!TW.townRoad(g, tw, cx, cy, 1 << d)) break;
      TW.townRoad(g, tw, nx, ny, 1 << HL.opp(d));
      built++;
      cx = nx; cy = ny;
    }
    return built > 0;
  };
  TW.rebuild = function (g, tw, t, tier, instant) {
    const m = g.map;
    if ((m.m2[t] & 3) === 3) tw.pop -= TW.popOf(m, t);
    const style = TW.styleFor(HL.ymd(g.date).y);
    m.m1[t] = tier | (g.rng.int(32) << 3) | (style << 8);
    m.m2[t] = instant ? 3 : 0;
    if (instant) tw.pop += TW.popOf(m, t);
    m.mark(t);
  };
  TW.maybeSpecial = function (g, tw, instant) {
    const year = HL.ymd(g.date).y;
    for (const sp of SPECIALS) {
      if (tw.specials[sp] != null) continue;
      const def = HL.HOUSE_SPECIAL[sp];
      if (tw.pop < def.minPop || (def.year && year < def.year)) continue;
      // find a free spot near a road close to the centre
      for (let r = 1; r < tw.radius + 2; r++) for (let k = 0; k < 8; k++) {
        const x = tw.x + g.rng.range(-r, r), y = tw.y + g.rng.range(-r, r);
        if (TW.placeHouse(g, tw, x, y, { special: sp, instant })) return;
      }
      return;
    }
  };

  // ---------- per-tile loop ----------
  TW.houseLoop = function (g, t) {
    const m = g.map, tw = g.towns[m.idx[t]];
    if (!tw) return;
    const st = m.m2[t] & 3;
    if (st < 3) {
      m.m2[t] = (m.m2[t] & ~3) | (st + 1);
      if (st + 1 === 3) tw.pop += TW.popOf(m, t);
      m.mark(t);
      return;
    }
    m.m2[t] = Math.min(0xffff, m.m2[t] + 4);
    const pop = TW.popOf(m, t);
    const rng = g.rng;
    const list = g.catchIdx.get(t);
    const x = m.tx(t), y = m.ty(t);
    // passengers
    if (rng.int(256) < pop) {
      const amt = (rng.int(pop) >> 3) + 1;
      tw.passMax += amt;
      const moved = HL.Stations.moveToStations(g, 'pax', amt, list, x, y);
      tw.passAct += moved;
    }
    if (rng.int(256) < pop >> 1) {
      const amt = (rng.int(pop) >> 4) + 1;
      tw.mailMax += amt;
      const moved = HL.Stations.moveToStations(g, 'mail', amt, list, x, y);
      tw.mailAct += moved;
    }
    // ageing houses get replaced by newer, often bigger buildings
    const age = m.m2[t] >> 2;
    if (!TW.isSpecial(m, t) && age > 600 && rng.chance(0.004)) {
      const want = TW.chooseTier(g, tw, x, y);
      if (want >= (m.m1[t] & 7)) TW.rebuild(g, tw, t, want, false);
    }
  };

  // ---------- monthly ----------
  TW.activeStations = function (g, tw) {
    let n = 0;
    for (const s of g.stations) {
      if (!s || s.buoy || HL.manh(s.x, s.y, tw.x, tw.y) > tw.radius + 2) continue;
      for (const c in s.cargo) if (s.cargo[c].lastPick >= 0 && g.date - s.cargo[c].lastPick < 20) { n++; break; }
    }
    return n;
  };
  TW.monthly = function (g) {
    for (const tw of g.towns) {
      if (!tw) continue;
      tw.lastPassMax = tw.passMax; tw.lastPassAct = tw.passAct; tw.lastMailMax = tw.mailMax; tw.lastMailAct = tw.mailAct;
      tw.passMax = tw.passAct = tw.mailMax = tw.mailAct = 0;
      tw.lastRecv = tw.recv; tw.recv = {};
      tw.popHist.push(tw.pop); if (tw.popHist.length > 120) tw.popHist.shift();
      // growth rate from transport service
      const act = TW.activeStations(g, tw);
      tw.active = act;
      let days = act === 0 ? 300 : [300, 150, 110, 85, 70, 58][Math.min(5, act)] - Math.min(40, act > 5 ? (act - 5) * 4 : 0);
      if (tw.city) days = Math.round(days * 0.6);
      if (tw.fundUntil > g.date) days = Math.round(days / 3);
      days = Math.round(days * (g.opts.townGrowth != null ? [2.5, 1.5, 1, 0.65, 0.4][g.opts.townGrowth] : 1));
      // unmet needs halt growth
      tw.starved = false;
      if (tw.needs.length && tw.pop > 90) for (const c of tw.needs) if (!(tw.lastRecv[c] > 0)) tw.starved = true;
      tw.growthDays = days;
      // ratings per company that has stations here
      const seen = new Set();
      for (const s of g.stations) {
        if (!s || s.buoy || s.owner >= 250 || HL.manh(s.x, s.y, tw.x, tw.y) > tw.radius + 6) continue;
        seen.add(s.owner);
        let served = false;
        for (const c in s.cargo) if (s.cargo[c].lastPick >= 0 && g.date - s.cargo[c].lastPick < 20) served = true;
        TW.changeRating(g, tw, s.owner, served ? 12 : -15, served ? 800 : -400);
      }
      for (const cid in tw.statues) TW.changeRating(g, tw, +cid, 6, 1000);
      // ratings drift back toward neutral for companies with nothing here
      for (const cid in tw.ratings) if (!seen.has(+cid)) { const r = tw.ratings[cid]; if (r < 0) tw.ratings[cid] = Math.min(0, r + 8); }
    }
  };
  // called each day from Game via Events? Use the tile loop clock instead: daily growth timer
  TW.daily = function (g) {
    for (const tw of g.towns) {
      if (!tw) continue;
      if (tw.starved) continue;
      tw.growthTimer++;
      if (tw.growthTimer >= tw.growthDays) {
        tw.growthTimer = 0;
        const n = tw.fundUntil > g.date ? 2 : 1;
        for (let i = 0; i < n; i++) TW.growStep(g, tw, false);
        TW.milestones(g, tw);
      }
    }
  };
  TW.milestones = function (g, tw) {
    const marks = [1000, 2500, 5000, 10000, 20000, 50000];
    tw.milestone = tw.milestone || 0;
    for (const v of marks) if (tw.pop >= v && tw.milestone < v) {
      tw.milestone = v;
      if (g.ticks > 100) Game.news(g, 'town', tw.name + ' passes ' + HL.fmtInt(v) + ' residents', v >= 5000 ? 'The town has grown into a busy city. Planners expect taller buildings.' : 'New streets are being laid out on the edge of town.', { tile: g.map.t(tw.x, tw.y) });
    }
  };
  // record cargo delivered into a town (food/water/goods)
  TW.delivered = function (g, s, c, n) {
    const tw = g.towns[s.town];
    if (!tw || HL.manh(s.x, s.y, tw.x, tw.y) > tw.radius + 6) return;
    tw.recv[c] = (tw.recv[c] || 0) + n;
  };

  // ---------- local authority ----------
  TW.ACTIONS = [
    { id: 'adSmall', name: 'Small advertising campaign', cost: 20000, desc: 'Posters around town. Boosts station ratings nearby for a few weeks.' },
    { id: 'adMed', name: 'Medium advertising campaign', cost: 42000, desc: 'Newspaper ads across the district. Bigger, longer boost to station ratings.' },
    { id: 'adLarge', name: 'Large advertising campaign', cost: 70000, desc: 'A full campaign with radio spots. Station ratings across the whole area jump.' },
    { id: 'roads', name: 'Fund local road reconstruction', cost: 110000, desc: 'Digs up the town\'s roads for six months. Everyone\'s road vehicles crawl. Including yours.' },
    { id: 'statue', name: 'Build statue of company owner', cost: 140000, desc: 'A permanent bronze reminder. Improves town rating and station ratings forever.' },
    { id: 'fund', name: 'Fund new buildings', cost: 220000, desc: 'Pays for construction. The town grows three times faster for three months.' },
    { id: 'exclusive', name: 'Buy exclusive transport rights', cost: 300000, desc: 'For one year, only your stations here receive passengers and cargo.' },
    { id: 'bribe', name: 'Bribe the local authority', cost: 180000, desc: 'Improves your rating a lot, unless someone finds out.' },
  ];
  TW.actionCost = (g, a) => Math.round(a.cost * g.econ.costMul);
  TW.canDo = function (g, tw, cid, id) {
    const r = TW.ratingOf(tw, cid);
    if (id === 'statue' && tw.statues[cid]) return 'Statue already built';
    if (id === 'exclusive' && tw.exclusive && tw.exclusive.until > g.date) return 'Rights already sold';
    if (id === 'bribe' && (r >= 600 || (tw.bribeBan[cid] || 0) > g.date)) return r >= 600 ? 'Rating is already excellent' : 'The council won\'t talk to you';
    if (id === 'roads' && tw.roadworks > g.date) return 'Roadworks already underway';
    return null;
  };
  TW.doAction = function (g, tw, cid, id) {
    const a = TW.ACTIONS.find(x => x.id === id);
    const err = TW.canDo(g, tw, cid, id);
    if (err) return { ok: false, err };
    const cost = TW.actionCost(g, a);
    if (!Game.canAfford(g, cid, cost)) return { ok: false, err: 'Not enough money' };
    Game.spend(g, cid, 'other', cost);
    const c = g.companies[cid];
    switch (id) {
      case 'adSmall': tw.advert[cid] = g.date + 30; boostStations(g, tw, cid, 6, 18); TW.changeRating(g, tw, cid, 20, 1000); break;
      case 'adMed': tw.advert[cid] = g.date + 50; boostStations(g, tw, cid, 10, 30); TW.changeRating(g, tw, cid, 35, 1000); break;
      case 'adLarge': tw.advert[cid] = g.date + 80; boostStations(g, tw, cid, 16, 45); TW.changeRating(g, tw, cid, 50, 1000); break;
      case 'roads': tw.roadworks = g.date + 180; Game.news(g, 'town', 'Road chaos in ' + tw.name, 'Road reconstruction funded by ' + c.name + ' brings six months of misery to motorists.', { tile: g.map.t(tw.x, tw.y) }); break;
      case 'statue': {
        tw.statues[cid] = true; TW.changeRating(g, tw, cid, 200, 1000);
        TW.placeStatue(g, tw, cid);
        Game.news(g, 'town', 'Statue unveiled in ' + tw.name, 'A statue in honour of ' + c.manager + ', chairman of ' + c.name + ', now stands in the town square.', { tile: g.map.t(tw.x, tw.y), cid });
        break;
      }
      case 'fund': tw.fundUntil = g.date + 92; TW.growStep(g, tw, false); TW.growStep(g, tw, false); Game.news(g, 'town', 'Building boom in ' + tw.name, c.name + ' funds new construction across town.', { tile: g.map.t(tw.x, tw.y) }); break;
      case 'exclusive': tw.exclusive = { cid, until: g.date + 365 }; Game.news(g, 'town', c.name + ' buys exclusive transport rights in ' + tw.name, 'Residents will use no other transport company for a year.', { tile: g.map.t(tw.x, tw.y), cid }); break;
      case 'bribe':
        if (g.rng.chance(1 / 12)) {
          tw.ratings[cid] = -1000; tw.bribeBan[cid] = g.date + 182;
          Game.news(g, 'company', 'Bribery scandal in ' + tw.name, 'Officials caught taking money from ' + c.name + '. The council will refuse all dealings for six months.', { big: true, tile: g.map.t(tw.x, tw.y), cid });
        } else TW.changeRating(g, tw, cid, 200, 1000);
        break;
    }
    return { ok: true, cost };
  };
  function boostStations(g, tw, cid, radius, amt) {
    for (const s of g.stations) {
      if (!s || s.owner !== cid || HL.manh(s.x, s.y, tw.x, tw.y) > tw.radius + radius) continue;
      for (const c in s.cargo) if (s.cargo[c].everPicked) s.cargo[c].rating = Math.min(255, s.cargo[c].rating + amt);
    }
  }
  TW.placeStatue = function (g, tw, cid) {
    const m = g.map;
    for (let r = 1; r < tw.radius + 3; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const x = tw.x + dx, y = tw.y + dy;
      if (!m.inside(x, y)) continue;
      const t = m.t(x, y);
      if (m.type[t] !== T.CLEAR || !m.isFlat(x, y)) continue;
      const o = HL.alloc(g.objects, { kind: 'statue', owner: cid, x, y, w: 1, h: 1, town: tw.id });
      m.type[t] = T.OBJECT; m.idx[t] = o.id; m.owner[t] = cid; m.trees[t] = 0; m.mark(t);
      return;
    }
  };
  // shared by Game.newDay
  HL.on && 0;
})(typeof window !== 'undefined' ? window : globalThis);
