// AI companies: found routes (trucks, buses, rail, air, sea), expand busy ones, cull losers, manage money.
(function (root) {
  const HL = root.HL;
  const T = HL.T;
  const AI = HL.AI = {};
  const AB = () => HL.AIBuild;
  const Game = HL.Game, V = () => HL.Veh;

  const PERSONAS = [
    { name: 'railway', w: { rail: 5, road: 2, air: 1, ship: 1, bus: 1 } },
    { name: 'haulier', w: { rail: 1, road: 5, air: 1, ship: 1, bus: 3 } },
    { name: 'airline', w: { rail: 1, road: 1, air: 5, ship: 1, bus: 2 } },
    { name: 'mixed', w: { rail: 4, road: 3, air: 2, ship: 2, bus: 2 } },
    { name: 'mariner', w: { rail: 2, road: 2, air: 1, ship: 4, bus: 1 } },
  ];

  AI.daily = function (g) {
    // found new AI companies on schedule
    if (g.aiQueue && g.aiQueue.length && g.date >= g.aiQueue[0].at) {
      g.aiQueue.shift();
      AI.found(g);
    }
    // replace rivals that went under, after a while
    const want = g.opts.aiCount != null ? g.opts.aiCount : g.diff.aiCount;
    if (g.aiQueue && !g.aiQueue.length && (g.date % 30) === 0) {
      const alive = g.companies.filter(c => c && c.alive && c.ai).length;
      if (alive < want && g.companies.filter(c => c && c.ai).length < 14) g.aiQueue.push({ at: g.date + 300 + g.rng.int(700) });
    }
    for (const c of g.companies) {
      if (!c || !c.alive || !c.ai) continue;
      if (g.date < c.ai.next) continue;
      c.ai.next = g.date + Math.round((12 + g.rng.int(30)) / g.diff.aiSpeed);
      try { AI.think(g, c); } catch (e) { if (typeof console !== 'undefined') console.error('AI error', c.name, e && e.stack || e); c.ai.errors = (c.ai.errors || 0) + 1; }
    }
  };
  AI.found = function (g) {
    const used = new Set(g.companies.filter(Boolean).map(c => c.color));
    let color = 0; for (let i = 0; i < HL.LIVERY.length; i++) if (!used.has(i)) { color = i; break; }
    const persona = g.rng.pick(PERSONAS);
    const c = Game.newCompany(g, { ai: { persona: persona.name, w: persona.w, next: g.date + 5, projects: [], fails: 0 }, color });
    c.autorenew = true;
    Game.news(g, 'company', 'New transport company launched!', c.name + ' starts operations under ' + c.manager + '.', { cid: c.id, big: false });
    return c;
  };

  AI.think = function (g, c) {
    const ai = c.ai;
    const k = g.econ.costMul;
    // money management: keep a cash cushion, pay the loan back when comfortable
    const maxLoan = Game.maxLoan(g);
    if (c.money < 25000 * k && c.loan < maxLoan) Game.borrow(g, c.id, Math.min(maxLoan - c.loan, 60000 * k));
    if (c.money > 250000 * k && c.loan > 0) Game.repay(g, c.id, Math.min(c.loan, c.money - 200000 * k));
    AI.manageVehicles(g, c);
    // in trouble: sell the worst earners, and don't build
    if (c.money < 0 && c.loan >= maxLoan) { AI.retrench(g, c); return; }
    // new project when there's money to spare beyond a reserve
    const reserve = 20000 * k;
    const funds = c.money + (maxLoan - c.loan) - reserve;
    const busy = ai.projects.filter(p => g.date - p.built < 90).length;
    const recentLoss = c.quarters.length && c.quarters[c.quarters.length - 1].income < c.quarters[c.quarters.length - 1].expenses * 0.7 && ai.projects.length > 3;
    if (busy === 0 && !recentLoss && funds > 40000 * k && ai.projects.length < 40) {
      const kinds = AI.availableKinds(g, c);
      for (let tries = 0; tries < 3; tries++) {
        const kind = g.rng.weighted(kinds);
        if (!kind) break;
        const ok = AI.build(g, c, kind, funds);
        if (ok) { ai.fails = 0; break; }
        ai.fails++;
      }
    }
  };
  AI.retrench = function (g, c) {
    const mine = g.vehicles.filter(v => v && v.owner === c.id && !v.aiSell && v.age > 180).sort((a, b) => (a.profitLastYear + a.profitThisYear) - (b.profitLastYear + b.profitThisYear));
    for (const v of mine.slice(0, Math.max(1, Math.ceil(mine.length * 0.15)))) { if (v.profitLastYear + v.profitThisYear > 0 && mine.length > 3) break; v.aiSell = true; V().sendToDepot(g, v, true); }
  };
  AI.availableKinds = function (g, c) {
    const yr = HL.ymd(g.date).y, w = c.ai.w;
    const early = yr < 1935 ? 0.4 : 1;
    const out = [];
    if (AB().bestRoadVeh(g, 'coal') || AB().bestRoadVeh(g, 'goods')) out.push(['road', w.road * early]);
    if (AB().bestRoadVeh(g, 'pax')) out.push(['bus', w.bus * early]);
    // rail pays best: once our own trains prove it, lean hard into it
    const trains = g.vehicles.filter(v => v && v.owner === c.id && v.kind === 'rail' && v.age > 365);
    const railAvg = trains.length ? trains.reduce((a, v) => a + v.profitLastYear, 0) / trains.length : 0;
    const railW = w.rail * 1.5 * (railAvg > 15000 * g.econ.payMul ? 3 : 1);
    if (c.money + Game.maxLoan(g) - c.loan > 100000 * g.econ.costMul) out.push(['rail', railW]);
    if (yr >= 1950) out.push(['air', w.air * (yr > 1965 ? 1.5 : 0.7)]);
    if (g.stations.some(s => s && s.rig != null) || g.towns.some(t => t && g.map.isCoast(t.x, t.y))) out.push(['ship', w.ship]);
    return out;
  };
  AI.build = function (g, c, kind, funds) {
    const st = c.ai.stats || (c.ai.stats = {}); const k = st[kind] || (st[kind] = { tries: 0, ok: 0 }); k.tries++;
    const r = AI.buildKind(g, c, kind, funds);
    if (r) k.ok++;
    return r;
  };
  AI.buildKind = function (g, c, kind, funds) {
    switch (kind) {
      case 'road': return AI.buildTruckRoute(g, c, funds);
      case 'bus': return AI.buildBusRoute(g, c, funds);
      case 'rail': return AI.buildRailRoute(g, c, funds);
      case 'air': return AI.buildAirRoute(g, c, funds);
      case 'ship': return AI.buildShipRoute(g, c, funds);
    }
    return false;
  };
  const rectOf = i => ({ x0: i.x, y0: i.y, x1: i.x + i.w - 1, y1: i.y + i.h - 1 });
  const townRect = (t, r) => ({ x0: t.x - r, y0: t.y - r, x1: t.x + r, y1: t.y + r });
  // spend inside a "transaction": run with exec false first, then true
  function afford(g, c, cost) { if (c.money >= cost) return true; const need = cost - c.money + 5000; return Game.borrow(g, c.id, need) >= need - 1 || c.money >= cost; }

  // industry pairs: producer -> acceptor of one of its cargos
  function cargoPairs(g, c, minD, maxD, n) {
    const out = [];
    const prods = g.industries.filter(i => i && HL.INDUSTRY[i.type].prod);
    for (let k = 0; k < 60 && out.length < n; k++) {
      const a = g.rng.pick(prods);
      if (!a) break;
      const cargos = Object.keys(a.prod).filter(x => x !== 'pax' && x !== 'mail' && HL.INDUSTRY[a.type].prod.some(p => p[0] === x));
      const cg = g.rng.pick(cargos);
      if (!cg) continue;
      // avoid industries this company already serves, unless cargo is piling up there
      const served = c.ai.projects.filter(p => p.src === a.id && p.cargo === cg);
      if (served.length >= 2 || served.some(p => { const s = g.stations[p.stA]; return !s || HL.Stations.waiting(s, cg) < 300; })) continue;
      const accs = g.industries.filter(i => i && i !== a && (HL.INDUSTRY[i.type].accepts || []).includes(cg));
      const b = g.rng.pick(accs.filter(i => { const d = HL.manh(a.x, a.y, i.x, i.y); return d >= minD && d <= maxD; }));
      if (!b) continue;
      out.push({ a, b, cargo: cg, d: HL.manh(a.x, a.y, b.x, b.y) });
    }
    // prefer productive sources
    out.sort((p, q) => (q.a.prod[q.cargo].lastMade || q.a.prod[q.cargo].base * q.a.level) - (p.a.prod[p.cargo].lastMade || p.a.prod[p.cargo].base * p.a.level));
    return out;
  }

  // rough yearly profit for one vehicle shuttling dist tiles (full one way, empty back)
  AI.estimate = function (g, model, cargo, dist, bothWays) {
    const tpd = model.speed / 28;
    const oneWay = dist / Math.max(0.1, tpd);
    const trips = 365 / (2 * oneWay + 8);
    const cap = model.cap || 0;
    const rev = HL.Econ.payment(g, cargo, cap, dist, oneWay) * (bothWays ? 2 : 1);
    return trips * rev - Game.runCost(g, model);
  };
  // ---------- trucks ----------
  AI.buildTruckRoute = function (g, c, funds) {
    const pairs = cargoPairs(g, c, 10, 40, 4);
    for (const pr of pairs) {
      const model = AB().bestRoadVeh(g, pr.cargo);
      if (!model) continue;
      if (AI.estimate(g, model, pr.cargo, pr.d, false) < Game.vehCost(g, model) * 0.3) continue;
      const r = AI.roadLink(g, c, rectOf(pr.a), rectOf(pr.b), true, funds - Game.vehCost(g, model) * 3);
      if (!r) continue;
      const n = Math.min(5, 2 + Math.floor(pr.d / 15));
      const vs = AI.buyRoadFleet(g, c, r.depot, model, n, [{ st: r.sA.id, load: 1 }, { st: r.sB.id, unload: 0 }]);
      if (!vs.length) continue;
      c.ai.projects.push({ kind: 'road', src: pr.a.id, dst: pr.b.id, cargo: pr.cargo, stA: r.sA.id, stB: r.sB.id, depot: r.depot.id, built: g.date, model: model.id });
      return true;
    }
    return false;
  };
  // connect two areas by road with a stop at each end; returns {sA, sB, depot} or null
  AI.roadLink = function (g, c, rA, rB, truck, budget) {
    const m = g.map;
    const cB = { x: (rB.x0 + rB.x1) >> 1, y: (rB.y0 + rB.y1) >> 1 }, cA = { x: (rA.x0 + rA.x1) >> 1, y: (rA.y0 + rA.y1) >> 1 };
    const siteA = AB().roadStopSite(g, c.id, rA, truck, { toward: cB, radius: 2 });
    const siteB = AB().roadStopSite(g, c.id, rB, truck, { toward: cA, radius: 2 });
    if (!siteA || !siteB || (siteA.x === siteB.x && siteA.y === siteB.y)) return null;
    const path = AB().planRoad(g, c.id, siteA.x, siteA.y, siteB.x, siteB.y);
    if (!path || path.length < 4) return null;
    // stops must sit on straight pieces of the path: adjust the end sites if the path turns
    const est = AB().layRoad(g, c.id, path, false);
    if (!est.ok) return null;
    const total = est.cost + 2 * Game.cost(g, HL.COST.roadStop) + Game.cost(g, HL.COST.roadDepot);
    if (total > budget || !afford(g, c, total)) return null;
    const lr = AB().layRoad(g, c.id, path, true);
    if (!lr.ok) return null;
    const stopOn = (i0, dirStep) => {
      for (let k = 0; k < 4; k++) {
        const i = i0 + k * dirStep;
        if (i < 0 || i >= path.length) break;
        const p = path[i];
        const r = HL.Stations.buildRoadStop(g, c.id, p.x, p.y, truck, 0, true);
        if (r.ok) { Game.spend(g, c.id, 'construction', r.cost); return HL.Stations.at(g, p.t); }
      }
      return null;
    };
    Game.spend(g, c.id, 'construction', lr.cost);
    const sA = stopOn(0, 1), sB = stopOn(path.length - 1, -1);
    if (!sA || !sB || sA === sB) return null;
    const dep = AB().placeRoadDepot(g, c.id, path[1].x, path[1].y, true);
    if (!dep.ok) return null;
    Game.spend(g, c.id, 'construction', dep.cost);
    return { sA, sB, depot: dep.depot };
  };
  AI.buyRoadFleet = function (g, c, depot, model, n, orders) {
    const out = [];
    let first = null;
    for (let i = 0; i < n; i++) {
      if (!afford(g, c, Game.vehCost(g, model))) break;
      const r = V().buy(g, c.id, depot.id, model.id);
      if (!r.ok) break;
      if (!first) { first = r.v; for (const o of orders) V().addOrder(g, r.v, o); }
      else V().shareOrders(g, r.v, first);
      r.v.stopped = false;
      // stagger departures
      r.v.oi = i % 2 && orders.length > 1 ? 1 : 0;
      out.push(r.v);
    }
    return out;
  };

  // ---------- buses ----------
  AI.buildBusRoute = function (g, c, funds) {
    const towns = g.towns.filter(t => t && t.pop > 250);
    for (let k = 0; k < 6; k++) {
      const a = g.rng.pick(towns), b = g.rng.pick(towns);
      if (!a || !b) return false;
      const model = AB().bestRoadVeh(g, 'pax');
      if (!model) return false;
      let r;
      if (a === b) {
        if (a.pop < 1500) continue;
        r = AI.roadLink(g, c, townRect(a, 1), { x0: a.x + a.radius - 2, y0: a.y - 1, x1: a.x + a.radius, y1: a.y + 1 }, false, funds);
      } else {
        const d = HL.manh(a.x, a.y, b.x, b.y);
        if (d < 10 || d > 35) continue;
        if (AI.estimate(g, model, 'pax', d, true) * 0.6 < Game.vehCost(g, model) * 0.3) continue;
        if (c.ai.projects.some(p => p.kind === 'bus' && ((p.src === a.id && p.dst === b.id) || (p.src === b.id && p.dst === a.id)))) continue;
        r = AI.roadLink(g, c, townRect(a, 2), townRect(b, 2), false, funds);
      }
      if (!r) continue;
      const vs = AI.buyRoadFleet(g, c, r.depot, model, 2, [{ st: r.sA.id }, { st: r.sB.id }]);
      if (!vs.length) continue;
      c.ai.projects.push({ kind: 'bus', src: a.id, dst: b.id, cargo: 'pax', stA: r.sA.id, stB: r.sB.id, depot: r.depot.id, built: g.date, model: model.id });
      return true;
    }
    return false;
  };

  // ---------- rail ----------
  AI.buildRailRoute = function (g, c, funds) {
    const yr = HL.ymd(g.date).y;
    const rt = yr >= 2030 && g.rng.chance(0.4) ? 3 : yr >= 2008 && g.rng.chance(0.3) ? 2 : yr >= 1960 && g.rng.chance(0.5) ? 1 : 0;
    const freight = g.rng.chance(0.7);
    let pairs;
    if (freight) pairs = cargoPairs(g, c, 20, 70, 3).map(p => ({ ra: rectOf(p.a), rb: rectOf(p.b), cargo: p.cargo, src: p.a.id, dst: p.b.id }));
    else {
      pairs = [];
      const towns = g.towns.filter(t => t && t.pop > 600);
      for (let k = 0; k < 8; k++) { const a = g.rng.pick(towns), b = g.rng.pick(towns); if (!a || !b || a === b) continue; const d = HL.manh(a.x, a.y, b.x, b.y); if (d >= 25 && d <= 80) pairs.push({ ra: townRect(a, 2), rb: townRect(b, 2), cargo: 'pax', src: a.id, dst: b.id, town: true }); }
    }
    for (const pr of pairs) {
      const eng = AB().bestEngine(g, c.id, rt, pr.cargo !== 'pax');
      const wag = AB().bestWagon(g, rt, pr.cargo);
      if (!eng || !wag) continue;
      const len = funds > 400000 * g.econ.costMul ? 5 : 4;
      const toward = (r) => ({ x: (r.x0 + r.x1) >> 1, y: (r.y0 + r.y1) >> 1 });
      const sA = AB().railStationSites(g, c.id, pr.ra, toward(pr.rb), len, rt, null, { max: 3, radius: pr.town ? 4 : 3 });
      const sB = AB().railStationSites(g, c.id, pr.rb, toward(pr.ra), len, rt, null, { max: 3, radius: pr.town ? 4 : 3 });
      for (const a of sA) for (const b of sB) {
        if (rectsOverlap(a, b)) continue;
        const avoid = new Set();
        for (const s of [a, b]) for (let i = 0; i < s.len; i++) avoid.add(g.map.t(s.x + (s.axis === 0 ? i : 0), s.y + (s.axis === 1 ? i : 0)));
        let path = AB().planRail(g, c.id, a.exit.x, a.exit.y, a.exit.dir, b.exit.x, b.exit.y, { rt, endDir: HL.opp(b.exit.dir), avoid, maxExp: 30000 });
        if (!path) {
          // arrive from the side and curve into the platform on the last tile
          path = AB().planRail(g, c.id, a.exit.x, a.exit.y, a.exit.dir, b.exit.x, b.exit.y, { rt, avoid, maxExp: 30000 });
          if (path) { const last = path[path.length - 1]; if (last.din === b.exit.dir || path.length < 2 || last.bridge) path = null; else last.dout = HL.opp(b.exit.dir); }
        }
        if (!path) continue;
        const full = [{ x: a.exit.x - HL.DX[a.exit.dir], y: a.exit.y - HL.DY[a.exit.dir], din: a.exit.dir, dout: a.exit.dir }].concat(path);
        full.push({ x: b.exit.x - HL.DX[b.exit.dir], y: b.exit.y - HL.DY[b.exit.dir], din: HL.opp(b.exit.dir), dout: HL.opp(b.exit.dir) });
        const est = AB().layRail(g, c.id, full, rt, false);
        if (!est.ok) continue;
        const nW = Math.max(2, Math.floor((len - eng.len) / 0.52));
        const vehCost = Game.vehCost(g, eng) + nW * Game.vehCost(g, wag);
        const total = est.cost + 2 * len * Game.cost(g, HL.COST.railStation * HL.RAILTYPES[rt].cost) + Game.cost(g, HL.COST.railDepot) + vehCost + 20000 * g.econ.costMul;
        if (total > funds || !afford(g, c, total)) return false;
        let r = HL.Stations.buildRail(g, c.id, a.x, a.y, a.axis, 1, a.len, rt, true); if (!r.ok) continue; Game.spend(g, c.id, 'construction', r.cost);
        r = HL.Stations.buildRail(g, c.id, b.x, b.y, b.axis, 1, b.len, rt, true); if (!r.ok) continue; Game.spend(g, c.id, 'construction', r.cost);
        r = AB().layRail(g, c.id, full, rt, true); if (!r.ok) continue; Game.spend(g, c.id, 'construction', r.cost);
        const dep = AB().placeRailDepot(g, c.id, full, rt, true);
        if (!dep.ok) continue;
        Game.spend(g, c.id, 'construction', dep.cost);
        const stA = HL.Stations.at(g, g.map.t(a.x, a.y)), stB = HL.Stations.at(g, g.map.t(b.x, b.y));
        const tr = V().buy(g, c.id, dep.depot.id, eng.id);
        if (!tr.ok) continue;
        for (let i = 0; i < nW; i++) V().addWagon(g, tr.v, wag.id);
        V().addOrder(g, tr.v, { st: stA.id, load: pr.cargo === 'pax' ? 0 : 1 });
        V().addOrder(g, tr.v, { st: stB.id });
        tr.v.stopped = false;
        c.ai.projects.push({ kind: 'rail', src: pr.src, dst: pr.dst, cargo: pr.cargo, stA: stA.id, stB: stB.id, depot: dep.depot.id, built: g.date, model: eng.id, rt });
        if (c.id !== g.player) Game.news(g, 'company', c.name + ' opens a new railway', 'Trains now run between ' + stA.name + ' and ' + stB.name + '.', { cid: c.id, tile: g.map.t(stA.x, stA.y) });
        return true;
      }
    }
    return false;
  };
  function rectsOverlap(a, b) {
    const aw = a.axis === 0 ? a.len : 1, ah = a.axis === 0 ? 1 : a.len, bw = b.axis === 0 ? b.len : 1, bh = b.axis === 0 ? 1 : b.len;
    return a.x < b.x + bw + 1 && a.x + aw + 1 > b.x && a.y < b.y + bh + 1 && a.y + ah + 1 > b.y;
  }

  // ---------- air ----------
  AI.buildAirRoute = function (g, c, funds) {
    const yr = HL.ymd(g.date).y;
    const types = HL.AIRPORTS.filter(a => yr >= a.intro && a.id !== 'heli').sort((a, b) => b.size - a.size);
    const towns = g.towns.filter(t => t && t.pop > 700);
    for (let k = 0; k < 6; k++) {
      const a = g.rng.pick(towns), b = g.rng.pick(towns);
      if (!a || !b || a === b) continue;
      const d = HL.manh(a.x, a.y, b.x, b.y);
      if (d < 35) continue;
      for (const at of types) {
        if (at.cost * g.econ.costMul * 2.6 > funds) continue;
        const pa = AI.airportSite(g, c, a, at), pb = AI.airportSite(g, c, b, at);
        if (!pa || !pb) continue;
        const plane = AB().bestPlane(g, at.size, false);
        if (!plane || plane.cap < 28) continue;
        const total = pa.cost + pb.cost + Game.vehCost(g, plane) * 2;
        if (total > funds || !afford(g, c, total)) return false;
        let r = HL.Stations.buildAirport(g, c.id, pa.x, pa.y, at.id, true); if (!r.ok) continue; Game.spend(g, c.id, 'construction', r.cost);
        const sA = HL.Stations.at(g, g.map.t(pa.x, pa.y));
        r = HL.Stations.buildAirport(g, c.id, pb.x, pb.y, at.id, true); if (!r.ok) continue; Game.spend(g, c.id, 'construction', r.cost);
        const sB = HL.Stations.at(g, g.map.t(pb.x, pb.y));
        let first = null;
        for (let i = 0; i < 2; i++) {
          const bv = V().buyAircraft(g, c.id, i ? sB.id : sA.id, plane.id);
          if (!bv.ok) break;
          if (!first) { first = bv.v; V().addOrder(g, bv.v, { st: sA.id }); V().addOrder(g, bv.v, { st: sB.id }); }
          else { V().shareOrders(g, bv.v, first); bv.v.oi = 1; }
          bv.v.stopped = false;
        }
        c.ai.projects.push({ kind: 'air', src: a.id, dst: b.id, cargo: 'pax', stA: sA.id, stB: sB.id, built: g.date, model: plane.id });
        return true;
      }
    }
    return false;
  };
  AI.airportSite = function (g, c, tw, at) {
    let best = null;
    for (let r = Math.max(2, tw.radius - 2); r < tw.radius + 8 && !best; r += 2) {
      for (let k = 0; k < 16; k++) {
        const ang = k / 16 * Math.PI * 2;
        const x = Math.round(tw.x + Math.cos(ang) * r - at.w / 2), y = Math.round(tw.y + Math.sin(ang) * r - at.h / 2);
        // must catch some of the town
        if (HL.manh(x + at.w / 2, y + at.h / 2, tw.x, tw.y) > tw.radius + at.catchment + 2) continue;
        const res = HL.Stations.buildAirport(g, c.id, x, y, at.id, false);
        if (res.ok && (!best || res.cost < best.cost)) best = { x, y, cost: res.cost };
      }
    }
    return best;
  };

  // ---------- ships ----------
  AI.buildShipRoute = function (g, c, funds) {
    // oil platforms to refineries, then any coastal producer to acceptor
    const rigs = g.industries.filter(i => i && i.type === 'oil_rig' && i.station >= 0);
    const cands = [];
    for (const rg of rigs) for (const rf of g.industries.filter(i => i && (HL.INDUSTRY[i.type].accepts || []).includes('oil'))) cands.push({ a: rg, b: rf, cargo: 'oil', rig: true });
    for (const p of cargoPairs(g, c, 15, 80, 6)) cands.push({ a: p.a, b: p.b, cargo: p.cargo });
    g.rng.shuffle(cands);
    for (const pr of cands.slice(0, 6)) {
      if (c.ai.projects.some(p => p.kind === 'ship' && p.src === pr.a.id)) continue;
      const model = AB().bestShip(g, pr.cargo);
      if (!model) continue;
      let sA = pr.rig ? g.stations[pr.a.station] : null;
      const dA = sA ? null : AI.dockSite(g, c, rectOf(pr.a));
      const dB = AI.dockSite(g, c, rectOf(pr.b));
      if ((!sA && !dA) || !dB) continue;
      const wA = sA ? sA.dock.water : dA.water, wB = dB.water;
      if (wA < 0) continue;
      const path = HL.Ship.findPath(g, wA, wB);
      if (!path) continue;
      const total = (dA ? dA.cost : 0) + dB.cost + Game.cost(g, HL.COST.shipDepot) + Game.vehCost(g, model) * 2;
      if (total > funds || !afford(g, c, total)) return false;
      if (dA) { const r = HL.Stations.buildDock(g, c.id, dA.x, dA.y, true); if (!r.ok) continue; Game.spend(g, c.id, 'construction', r.cost); sA = HL.Stations.at(g, g.map.t(dA.x, dA.y)); }
      const r2 = HL.Stations.buildDock(g, c.id, dB.x, dB.y, true); if (!r2.ok) continue; Game.spend(g, c.id, 'construction', r2.cost);
      const sB = HL.Stations.at(g, g.map.t(dB.x, dB.y));
      // shipyard on open water near the source dock
      const dep = AI.shipDepotNear(g, c, wA);
      if (!dep) continue;
      const fleet = [];
      for (let i = 0; i < 2; i++) {
        const b = V().buy(g, c.id, dep.id, model.id, { cargo: pr.cargo });
        if (!b.ok) break;
        if (!fleet.length) { V().addOrder(g, b.v, { st: sA.id, load: 1 }); V().addOrder(g, b.v, { st: sB.id }); } else V().shareOrders(g, b.v, fleet[0]);
        b.v.stopped = false; fleet.push(b.v);
      }
      c.ai.projects.push({ kind: 'ship', src: pr.a.id, dst: pr.b.id, cargo: pr.cargo, stA: sA.id, stB: sB.id, depot: dep.id, built: g.date, model: model.id });
      return true;
    }
    return false;
  };
  AI.dockSite = function (g, c, rect) {
    const m = g.map;
    let best = null;
    for (let y = rect.y0 - 4; y <= rect.y1 + 4; y++) for (let x = rect.x0 - 4; x <= rect.x1 + 4; x++) {
      if (!m.inside(x, y)) continue;
      const res = HL.Stations.buildDock(g, c.id, x, y, false);
      if (!res.ok) continue;
      let water = -1;
      for (let d = 0; d < 4; d++) { const nx = x + HL.DX[d], ny = y + HL.DY[d]; if (m.inside(nx, ny) && m.type[m.t(nx, ny)] === T.WATER) { water = m.t(nx, ny); break; } }
      const dd = HL.manh(x, y, (rect.x0 + rect.x1) / 2, (rect.y0 + rect.y1) / 2);
      if (!best || dd < best.d) best = { x, y, cost: res.cost, water, d: dd };
    }
    return best;
  };
  AI.shipDepotNear = function (g, c, wt) {
    const m = g.map, x0 = m.tx(wt), y0 = m.ty(wt);
    for (let r = 2; r < 8; r++) for (let y = y0 - r; y <= y0 + r; y++) for (let x = x0 - r; x <= x0 + r; x++) {
      if (!m.inside(x, y)) continue;
      const t = m.t(x, y);
      if (m.type[t] !== T.WATER) continue;
      // keep open water on all sides so ships can pass
      let open = 0; for (let d = 0; d < 4; d++) { const nx = x + HL.DX[d], ny = y + HL.DY[d]; if (m.inside(nx, ny) && m.type[m.t(nx, ny)] === T.WATER) open++; }
      if (open < 4) continue;
      const r1 = HL.Build.buildDepot(g, c.id, x, y, 2, 1, 0, true);
      if (r1.ok) { Game.spend(g, c.id, 'construction', r1.cost); return g.depots[m.idx[t]]; }
    }
    return null;
  };

  // ---------- fleet management ----------
  AI.manageVehicles = function (g, c) {
    const mine = g.vehicles.filter(v => v && v.owner === c.id);
    // sell what's been sent home
    for (const v of mine) {
      if (v.aiSell && (v.inDepot || (v.kind === 'air' && v.airState === 'hangar')) ) { v.stopped = true; V().sell(g, v); continue; }
      if (!v.aiSell && v.age > 365 * 2 && v.profitLastYear < -1000 * g.econ.costMul && v.profitThisYear < 0) {
        const sib = V().sharedWith(g, v);
        if (sib.length >= 1 || v.age > 365 * 4) { v.aiSell = true; V().sendToDepot(g, v, true); }
      }
      // stuck crashed or lost for ages
      if (v.lostSince && g.date - v.lostSince > 400 && !v.aiSell) { v.aiSell = true; V().sendToDepot(g, v, true); }
    }
    // grow busy routes
    for (const p of c.ai.projects) {
      if (p.dead) continue;
      const sA = g.stations[p.stA], sB = g.stations[p.stB];
      if (!sA || !sB) { p.dead = true; continue; }
      if (p.kind === 'rail') continue;
      const fleet = mine.filter(v => !v.aiSell && V().orderList(g, v).some(o => o.st === p.stA) && V().orderList(g, v).some(o => o.st === p.stB));
      if (!fleet.length) continue;
      const waiting = HL.Stations.waiting(sA, p.cargo) + (p.kind === 'bus' || p.kind === 'air' ? HL.Stations.waiting(sB, p.cargo) : 0);
      const cap = fleet[0].holds.reduce((a, h) => a + h.cap, 0);
      const maxN = p.kind === 'air' ? 6 : p.kind === 'ship' ? 4 : 7;
      const old = fleet.filter(v => v.age > 365);
      const profitable = old.length > 0 && old.reduce((a, v) => a + v.profitLastYear, 0) / old.length > HL.Game.vehCost(g, HL.VEH[fleet[0].model]) * 0.15;
      if (waiting > cap * 2.5 && fleet.length < maxN && profitable && (!p.grown || g.date - p.grown > 120)) {
        const model = HL.VEH[fleet[0].model];
        if (!afford(g, c, Game.vehCost(g, model) + 15000 * g.econ.costMul)) continue;
        let r;
        if (p.kind === 'air') r = V().clone(g, fleet[0], p.stA, true);
        else { const dep = g.depots[p.depot]; if (!dep) continue; r = V().clone(g, fleet[0], dep.id, true); }
        if (r && r.ok) { r.v.stopped = false; p.grown = g.date; }
      }
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
