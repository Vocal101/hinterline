// Vehicles: purchase, consists, orders, loading/unloading, ageing, breakdowns, servicing, renewal.
(function (root) {
  const HL = root.HL;
  const V = HL.Veh = {};
  const Game = HL.Game;
  const TPD = HL.TICKS_PER_DAY;
  V.KMH_TILE = 28; // km/h that covers one tile per day
  V.tpt = kmh => kmh / V.KMH_TILE / TPD;
  V.KIND_NAME = { rail: 'Train', road: 'Road Vehicle', ship: 'Ship', air: 'Aircraft' };
  V.RUN_CAT = { rail: 'trainrun', road: 'roadrun', ship: 'shiprun', air: 'airrun' };
  V.SERVICE = { rail: 150, road: 150, ship: 360, air: 100 };
  V.MAX_CARS = 18;

  // ---------- orders ----------
  V.newOrders = (g, cid) => HL.alloc(g.orders, { owner: cid, list: [] });
  V.orderList = (g, v) => g.orders[v.orders] ? g.orders[v.orders].list : [];
  V.mkOrder = (o) => Object.assign({ type: 'go', st: -1, depot: -1, load: 0, unload: 0, wait: 0 }, o);
  V.curOrder = function (g, v) {
    const l = V.orderList(g, v);
    if (!l.length) return null;
    if (v.oi >= l.length) v.oi = 0;
    return l[v.oi];
  };
  V.sharedWith = (g, v) => g.vehicles.filter(o => o && o !== v && !o.part && o.orders === v.orders);
  V.addOrder = function (g, v, o, at) {
    const l = V.orderList(g, v);
    if (at == null || at > l.length) at = l.length;
    l.splice(at, 0, V.mkOrder(o));
    for (const w of [v, ...V.sharedWith(g, v)]) if (w.oi >= at && l.length > 1 && w.oi < l.length - 1 && at <= w.oi) w.oi++;
    HL.emit('orders', v);
  };
  V.removeOrder = function (g, v, i) {
    const l = V.orderList(g, v);
    l.splice(i, 1);
    for (const w of [v, ...V.sharedWith(g, v)]) { if (w.oi > i) w.oi--; if (w.oi >= l.length) w.oi = 0; w.route = null; }
    HL.emit('orders', v);
  };
  V.shareOrders = function (g, v, other) {
    const old = v.orders;
    v.orders = other.orders; v.oi = 0; v.route = null;
    if (old !== other.orders && !g.vehicles.some(o => o && o.orders === old)) g.orders[old] = null;
    HL.emit('orders', v);
  };
  V.copyOrders = function (g, v, other) {
    const ol = V.newOrders(g, v.owner);
    ol.list = V.orderList(g, other).map(o => Object.assign({}, o));
    const old = v.orders;
    v.orders = ol.id; v.oi = 0; v.route = null;
    if (!g.vehicles.some(o => o && o.orders === old)) g.orders[old] = null;
    HL.emit('orders', v);
  };
  V.unshare = function (g, v) { V.copyOrders(g, v, v); };
  V.skipOrder = function (g, v, to) {
    const l = V.orderList(g, v);
    if (!l.length) return;
    v.oi = to != null ? to % l.length : (v.oi + 1) % l.length;
    v.route = null;
    if (v.state === 'load') V.depart(g, v, true);
  };
  // is the order something this vehicle can actually go to?
  V.orderValid = function (g, v, o) {
    if (!o || o.dead) return false;
    if (o.type === 'depot') { const d = g.depots[o.depot]; return !!d && V.depotKindOk(v, d); }
    const s = g.stations[o.st];
    if (!s) return false;
    return V.stationKindOk(g, v, s);
  };
  V.depotKindOk = (v, d) => (v.kind === 'rail' && d.kind === 0) || (v.kind === 'road' && d.kind === 1) || (v.kind === 'ship' && d.kind === 2);
  V.stationKindOk = function (g, v, s) {
    const F = HL.Stations.FAC;
    if (v.kind === 'rail') return !!(s.fac & F.rail);
    if (v.kind === 'road') return V.isBus(v) ? !!(s.fac & F.bus) : !!(s.fac & F.truck);
    if (v.kind === 'ship') return !!s.dock || !!s.buoy;
    if (v.kind === 'air') { if (!s.airport) return false; const at = HL.Stations.airportType(s.airport.type), m = HL.VEH[v.model]; if (at.heliOnly) return !!m.heli; if (m.size > 1 && at.size < 1) return false; if (m.size >= 1 && at.size < 1) return false; return true; }
    return false;
  };
  V.isBus = v => v.holds[0] && v.holds[0].c === 'pax';

  // ---------- creation ----------
  V.unitNumber = function (g, cid, kind) {
    const used = new Set(g.vehicles.filter(v => v && v.owner === cid && v.kind === kind && !v.part).map(v => v.unit));
    let n = 1; while (used.has(n)) n++;
    return n;
  };
  V.mkHold = (c, cap) => ({ c, cap, n: 0, p: [] });
  function baseVeh(g, cid, kind, model, depot) {
    const m = HL.VEH[model];
    const yr = HL.ymd(g.date).y;
    const relMax = V.modelRel(g, m);
    return {
      kind, owner: cid, model, unit: V.unitNumber(g, cid, kind), name: null, group: -1, built: g.date,
      age: 0, maxAge: m.age * 365, rel: relMax, relMax, lastService: g.date, serviceInt: ((g.companies[cid] || {}).serviceInt || {})[kind] || V.SERVICE[kind], broken: 0, breakdowns: 0,
      value: Game.vehCost(g, m), profitThisYear: 0, profitLastYear: 0, lastIncome: 0, income: 0,
      orders: V.newOrders(g, cid).id, oi: 0, stopped: true, inDepot: true, depot: depot ? depot.id : -1, state: 'depot',
      speed: 0, holds: [], px: depot ? depot.x + 0.5 : 0, py: depot ? depot.y + 0.5 : 0, pz: 0, yaw: 0, built_year: yr,
    };
  }
  V.modelRel = function (g, m) {
    const yr = HL.ymd(g.date).y;
    let r = m.rel;
    const end = m.intro + m.life;
    if (yr > end) r *= Math.max(0.55, 1 - (yr - end) * 0.025);
    if (yr < m.intro + 2) r *= 0.94; // teething troubles
    return r;
  };
  V.buy = function (g, cid, depotId, modelId, o) {
    o = o || {};
    const d = g.depots[depotId], m = HL.VEH[modelId];
    if (!d || !m) return { ok: false, err: 'No depot' };
    if (d.owner !== cid) return { ok: false, err: 'Not your depot' };
    const year = HL.ymd(g.date).y;
    if (!HL.vehAvailable(m, year, g.unlockAll)) return { ok: false, err: 'Not available' };
    const cost = Game.vehCost(g, m);
    if (!Game.canAfford(g, cid, cost)) return { ok: false, err: 'Not enough money - ' + HL.fmtMoney(cost) + ' needed' };
    let v;
    if (m.kind === 'rail') {
      if (d.kind !== 0) return { ok: false, err: 'Trains are bought at train depots' };
      if (!HL.railCompatible(m.rt, d.rt) && !(m.rt === 0 && d.rt === 1)) return { ok: false, err: 'This depot is on ' + HL.RAILTYPES[d.rt].name.toLowerCase() };
      if (m.wagon) {
        const tr = o.train != null ? g.vehicles[o.train] : null;
        if (!tr) return { ok: false, err: 'Select a train in the depot to attach wagons to' };
        return V.addWagon(g, tr, modelId);
      }
      v = baseVeh(g, cid, 'rail', modelId, d);
      v.cars = [{ model: modelId, flip: false }];
      v.holds = [];
    } else if (m.kind === 'road') {
      if (d.kind !== 1) return { ok: false, err: 'Road vehicles are bought at road depots' };
      v = baseVeh(g, cid, 'road', modelId, d);
      v.holds = [V.mkHold(m.cargo, m.cap)];
    } else if (m.kind === 'ship') {
      if (d.kind !== 2) return { ok: false, err: 'Ships are bought at shipyards' };
      v = baseVeh(g, cid, 'ship', modelId, d);
      const c = o.cargo && m.refit.includes(o.cargo) ? o.cargo : m.cargo;
      v.holds = [V.mkHold(c, HL.refitCap(m, c))];
    } else if (m.kind === 'air') {
      // aircraft are bought at an airport's hangar: depotId is a station id here
      return { ok: false, err: 'Use buyAircraft' };
    }
    HL.alloc(g.vehicles, v);
    Game.spend(g, cid, 'newveh', cost);
    g.companies[cid].vehiclesBuilt++;
    V.recalc(g, v);
    HL.emit('vehBought', v);
    return { ok: true, v, cost };
  };
  V.buyAircraft = function (g, cid, stId, modelId, o) {
    o = o || {};
    const s = g.stations[stId], m = HL.VEH[modelId];
    if (!s || !s.airport || s.owner !== cid) return { ok: false, err: 'No hangar' };
    if (s.airport.type === 'heli' && !m.heli) return { ok: false, err: 'Heliports only take helicopters' };
    const at = HL.Stations.airportType(s.airport.type);
    if (m.size >= 1 && at.size < 1 && !m.heli) return { ok: false, err: 'This aircraft is too big for an airstrip' };
    if (!HL.vehAvailable(m, HL.ymd(g.date).y, g.unlockAll)) return { ok: false, err: 'Not available' };
    const cost = Game.vehCost(g, m);
    if (!Game.canAfford(g, cid, cost)) return { ok: false, err: 'Not enough money - ' + HL.fmtMoney(cost) + ' needed' };
    const v = baseVeh(g, cid, 'air', modelId, null);
    const c = o.cargo === 'mail' ? 'mail' : 'pax';
    v.holds = c === 'mail' ? [V.mkHold('mail', HL.refitCap(m, 'mail'))] : [V.mkHold('pax', m.cap), V.mkHold('mail', m.mailCap)];
    v.airSt = s.id; v.airState = 'hangar'; v.hangarSt = s.id;
    const ap = s.airport;
    v.px = ap.x + 0.5; v.py = ap.y + 0.5;
    HL.alloc(g.vehicles, v);
    Game.spend(g, cid, 'newveh', cost);
    g.companies[cid].vehiclesBuilt++;
    HL.emit('vehBought', v);
    return { ok: true, v, cost };
  };
  V.addWagon = function (g, tr, modelId) {
    const m = HL.VEH[modelId];
    if (!tr.inDepot) return { ok: false, err: 'Train must be stopped in a depot' };
    if (tr.cars.length >= V.MAX_CARS) return { ok: false, err: 'Train too long' };
    const em = HL.VEH[tr.model];
    if (!(m.rt === em.rt || (m.rt === 0 && em.rt === 1) || (m.rt === 1 && em.rt === 0))) return { ok: false, err: 'Wagon doesn\'t fit this rail type' };
    const cost = Game.vehCost(g, m);
    if (!Game.canAfford(g, tr.owner, cost)) return { ok: false, err: 'Not enough money' };
    if (m.engine) { if (!HL.railCompatible(m.rt, g.depots[tr.depot].rt) && !(m.rt === 0)) return { ok: false, err: 'Wrong rail type' }; }
    tr.cars.push({ model: modelId, flip: false });
    Game.spend(g, tr.owner, 'newveh', cost);
    tr.value += cost;
    V.recalc(g, tr);
    return { ok: true, v: tr, cost };
  };
  V.removeCar = function (g, tr, i) {
    if (!tr.inDepot || !tr.stopped) return { ok: false, err: 'Train must be stopped in a depot' };
    if (tr.cars.length <= 1) return V.sell(g, tr);
    const m = HL.VEH[tr.cars[i].model];
    if (i === 0 && m.engine && !tr.cars.slice(1).some(c => HL.VEH[c.model].engine)) return { ok: false, err: 'Sell the whole train to remove its only engine' };
    const share = Math.round(tr.value * Game.vehCost(g, m) / Math.max(1, V.trainCost(g, tr)));
    tr.cars.splice(i, 1);
    tr.value -= share;
    Game.earn(g, tr.owner, 'newveh', share);
    V.recalc(g, tr);
    return { ok: true, cost: -share };
  };
  V.trainCost = (g, tr) => tr.cars.reduce((a, c) => a + Game.vehCost(g, HL.VEH[c.model]), 0);
  // rebuild holds, length, weight, power after consist change
  V.recalc = function (g, v) {
    if (v.kind !== 'rail') { v.len = HL.VEH[v.model].len; return; }
    const old = v.holds || [];
    v.holds = [];
    let len = 0, wt = 0, power = 0, maxSpd = 9999, nEng = 0;
    for (const car of v.cars) {
      const m = HL.VEH[car.model];
      len += m.len + 0.02; wt += m.wt; maxSpd = Math.min(maxSpd, m.speed);
      if (m.engine) { power += m.power; nEng++; }
      if (m.cap) { car.hold = v.holds.length; const h = old.find(o => o._car === car) || V.mkHold(m.cargo, m.cap); h._car = car; h.cap = m.cap; v.holds.push(h); }
      else car.hold = -1;
    }
    // first engine defines the train model
    const eng = v.cars.find(c => HL.VEH[c.model].engine);
    if (eng) v.model = eng.model;
    v.len = len; v.wt = wt; v.power = power; v.vmax = maxSpd; v.nEng = nEng;
    v.rt = v.cars.reduce((r, c) => Math.max(r, HL.VEH[c.model].rt === 1 ? 1 : HL.VEH[c.model].rt), 0);
  };
  V.sellValue = v => Math.round(v.value);
  V.sell = function (g, v) {
    if (!v.inDepot && v.kind !== 'air') return { ok: false, err: 'Vehicle must be stopped inside a depot' };
    if (v.kind === 'air' && v.airState !== 'hangar') return { ok: false, err: 'Aircraft must be in a hangar' };
    const val = V.sellValue(v);
    Game.earn(g, v.owner, 'newveh', val);
    V.destroy(g, v, true);
    return { ok: true, cost: -val };
  };
  V.destroy = function (g, v, silent) {
    if (v.kind === 'rail' && HL.Rail) HL.Rail.removeFromMap(g, v);
    if (v.kind === 'air' && HL.Air) HL.Air.release(g, v);
    // drop cargo on board
    g.vehicles[v.id] = null;
    if (!g.vehicles.some(o => o && o.orders === v.orders)) g.orders[v.orders] = null;
    HL.emit('vehDestroyed', v);
  };
  V.clone = function (g, v, depotId, share) {
    let r;
    if (v.kind === 'air') r = V.buyAircraft(g, v.owner, depotId, v.model, { cargo: v.holds[0].c });
    else r = V.buy(g, v.owner, depotId, v.kind === 'rail' ? v.cars[0].model : v.model, { cargo: v.holds[0] && v.holds[0].c });
    if (!r.ok) return r;
    const nv = r.v;
    let cost = r.cost;
    if (v.kind === 'rail') for (const car of v.cars.slice(1)) { const a = V.addWagon(g, nv, car.model); if (!a.ok) return Object.assign(a, { v: nv }); cost += a.cost; }
    if (share) V.shareOrders(g, nv, v); else V.copyOrders(g, nv, v);
    nv.group = v.group; nv.serviceInt = v.serviceInt;
    return { ok: true, v: nv, cost };
  };
  V.displayName = (v) => v.name || (V.KIND_NAME[v.kind] + ' ' + v.unit);
  V.capacityText = function (v) {
    const by = {};
    for (const h of v.holds) by[h.c] = (by[h.c] || 0) + h.cap;
    return Object.keys(by).map(c => HL.fmtInt(by[c]) + ' ' + HL.CARGO[c].unit).join(', ') || 'none';
  };
  V.loadText = function (v) {
    const by = {}, cap = {};
    for (const h of v.holds) { by[h.c] = (by[h.c] || 0) + h.n; cap[h.c] = (cap[h.c] || 0) + h.cap; }
    return Object.keys(cap).map(c => HL.fmtInt(by[c]) + '/' + HL.fmtInt(cap[c]) + ' ' + HL.CARGO[c].short).join(', ');
  };
  V.refit = function (g, v, c) {
    const m = HL.VEH[v.model];
    if (!v.inDepot && !(v.kind === 'air' && v.airState === 'hangar')) return { ok: false, err: 'Must be in a depot' };
    if (!m.refit || !m.refit.includes(c)) return { ok: false, err: 'Can\'t carry that' };
    const cost = Math.round(Game.vehCost(g, m) * 0.05);
    if (!Game.canAfford(g, v.owner, cost)) return { ok: false, err: 'Not enough money' };
    Game.spend(g, v.owner, 'other', cost);
    if (v.kind === 'air') v.holds = c === 'mail' ? [V.mkHold('mail', HL.refitCap(m, 'mail'))] : [V.mkHold('pax', m.cap), V.mkHold('mail', m.mailCap)];
    else v.holds = [V.mkHold(c, HL.refitCap(m, c))];
    return { ok: true, cost };
  };

  // ---------- targets ----------
  // current destination: {kind:'st', id, order} or {kind:'depot', id} or null
  V.target = function (g, v) {
    if (v.goDepot) return { kind: 'depot', id: v.goDepot.depot, service: true };
    const l = V.orderList(g, v);
    for (let k = 0; k < l.length; k++) {
      const o = V.curOrder(g, v);
      if (V.orderValid(g, v, o)) {
        if (o.type === 'depot') {
          // service-only depot orders are skipped if service isn't due
          if (o.service && !V.needsService(g, v)) { v.oi = (v.oi + 1) % l.length; continue; }
          return { kind: 'depot', id: o.depot, order: o };
        }
        return { kind: 'st', id: o.st, order: o, via: o.type === 'via' };
      }
      v.oi = (v.oi + 1) % l.length;
    }
    return null;
  };
  V.needsService = (g, v) => g.diff.breakdowns > 0 && g.date - v.lastService > v.serviceInt;

  // ---------- loading ----------
  V.arrive = function (g, v, s, order) {
    v.state = 'load'; v.speed = 0;
    v.load = { st: s.id, step: 0, waited: 0, phase: 0, start: g.date, order };
    s.lastVeh[v.kind] = g.date;
    // first vehicle to arrive at a station gets a celebration
    const key = 'first_' + v.kind;
    if (!s[key] && s.owner === v.owner) {
      s[key] = g.date;
      const tw = g.towns[s.town];
      const what = { rail: 'train', road: V.isBus(v) ? 'bus' : 'truck', ship: 'ship', air: 'aircraft' }[v.kind];
      Game.news(g, 'arrival', 'Citizens celebrate... first ' + what + ' arrives at ' + s.name + '!', tw ? 'Crowds gather as ' + tw.name + ' welcomes its new service.' : '', { tile: g.map.t(s.x, s.y), veh: v.id, cid: v.owner, big: v.owner === g.player });
      HL.emit('firstArrival', v, s);
    }
    if (HL.Meta && HL.Meta.onArrive) HL.Meta.onArrive(g, v, s);
  };
  const LOAD_EVERY = 8;
  V.loadTick = function (g, v) {
    const ld = v.load;
    const s = g.stations[ld.st];
    if (!s) { V.depart(g, v, true); return; }
    if (++ld.step % LOAD_EVERY) return;
    const o = ld.order || V.curOrder(g, v) || {};
    const rate = v.kind === 'ship' ? 24 : v.kind === 'air' ? 12 : v.kind === 'road' ? 6 : 0;
    if (ld.phase === 0) {
      let any = false;
      for (const h of v.holds) {
        if (!h.n) continue;
        const r = rate || Math.max(5, Math.round(h.cap * 0.25));
        const accepts = s.accepts[h.c];
        const mode = o.unload || 0; // 0 normal, 1 unload all, 2 transfer, 3 no unloading
        if (mode === 3) continue;
        if (mode === 0 && !accepts) continue;
        const take = takeFromHold(h, r);
        if (!take.length) continue;
        any = true;
        if (mode === 2 || (mode === 1 && !accepts)) HL.Econ.transfer(g, v, s, h.c, take);
        else HL.Econ.deliver(g, v, s, h.c, take);
      }
      if (!any) ld.phase = 1;
      return;
    }
    // loading
    const lmode = o.load || 0; // 0 normal, 1 full load all, 2 full load any, 3 no loading
    let loaded = false;
    if (lmode !== 3) {
      const seen = new Set();
      for (const h of v.holds) {
        if (!seen.has(h.c)) { HL.Stations.noteVisit(g, s, h.c, v); seen.add(h.c); }
        const space = h.cap - h.n;
        if (space <= 0) continue;
        const r = rate || Math.max(5, Math.round(h.cap * 0.25));
        const got = HL.Stations.takeCargo(g, s, h.c, Math.min(space, r));
        for (const p of got) { h.p.push(p); h.n += p.n; loaded = true; }
      }
    }
    v.loadAnim = loaded ? g.ticks : v.loadAnim;
    const days = g.date - ld.start;
    if (o.wait && days < o.wait) return;
    if (loaded) return;
    if (lmode === 1) { if (v.holds.some(h => h.cap > 0 && h.n < h.cap)) return; }
    if (lmode === 2) {
      const types = {};
      for (const h of v.holds) { const t = types[h.c] || (types[h.c] = [0, 0]); t[0] += h.n; t[1] += h.cap; }
      if (!Object.values(types).some(t => t[1] > 0 && t[0] >= t[1])) return;
    }
    V.depart(g, v, false);
  };
  function takeFromHold(h, n) {
    const out = [];
    while (n > 0 && h.p.length) {
      const p = h.p[0];
      if (p.n <= n) { out.push(p); h.p.shift(); h.n -= p.n; n -= p.n; }
      else { const share = p.fs * n / p.n; out.push({ n, sx: p.sx, sy: p.sy, st: p.st, d: p.d, fs: share }); p.n -= n; p.fs -= share; h.n -= n; n = 0; }
    }
    return out;
  }
  V.depart = function (g, v, skip) {
    v.state = 'run';
    v.load = null;
    const l = V.orderList(g, v);
    if (l.length) v.oi = (v.oi + 1) % l.length;
    v.route = null;
    v.lastDepart = g.date;
    if (v.kind === 'air' && HL.Air) HL.Air.onDepart(g, v);
    HL.emit('depart', v);
  };

  // ---------- depots ----------
  V.enterDepot = function (g, v, depot) {
    v.inDepot = true; v.state = 'depot'; v.depot = depot ? depot.id : v.depot; v.speed = 0;
    v.lastService = g.date; v.rel = v.relMax = V.modelRel(g, HL.VEH[v.model]); v.broken = 0;
    const gd = v.goDepot;
    v.goDepot = null;
    V.autoRenew(g, v);
    // depot order: advance and maybe stop
    const o = V.curOrder(g, v);
    if (o && o.type === 'depot' && (!gd || o.depot === (depot && depot.id))) { v.oi = (v.oi + 1) % V.orderList(g, v).length; if (o.halt) v.stopped = true; }
    if (gd && gd.stop) { v.stopped = true; if (v.owner === g.player) Game.news(g, 'advice', V.displayName(v) + ' is waiting in depot', '', { veh: v.id, cid: v.owner }); }
    v.route = null;
    HL.emit('enterDepot', v);
  };
  V.sendToDepot = function (g, v, stop) {
    if (v.kind === 'air') { v.goDepot = { stop: !!stop, depot: -1, hangar: true }; return { ok: true }; }
    const d = V.nearestDepot(g, v);
    if (!d) return { ok: false, err: 'Can\'t find a depot to go to' };
    v.goDepot = { depot: d.id, stop: !!stop };
    v.route = null;
    return { ok: true };
  };
  // the depot we were heading for has no route from here (often one on another network):
  // try the next nearest, and give up on a routine service rather than wander lost for ever
  V.depotUnreachable = function (g, v) {
    const gd = v.goDepot;
    if (!gd || gd.hangar) return false;
    const tried = gd.tried || (gd.tried = []);
    if (!tried.includes(gd.depot)) tried.push(gd.depot);
    const d = tried.length < 8 && V.nearestDepot(g, v, tried);
    if (d) { gd.depot = d.id; return true; }
    if (gd.service && !gd.stop) { v.goDepot = null; v.lastService = g.date; return true; }
    // nowhere to go yet: start over in a month in case the roads or track get fixed
    gd.retryAt = gd.retryAt || g.date + 30;
    if (g.date >= gd.retryAt) { gd.tried = []; gd.retryAt = 0; const n = V.nearestDepot(g, v); if (n) gd.depot = n.id; }
    return false;
  };
  // nearest depot of the right kind by straight distance (path checked by movement code)
  V.nearestDepot = function (g, v, skip) {
    let best = null, bd = 1e9;
    for (const d of g.depots) {
      if (!d || d.owner !== v.owner || !V.depotKindOk(v, d) || (skip && skip.includes(d.id))) continue;
      if (v.kind === 'rail' && !HL.railCompatible(v.rt === 1 ? 1 : HL.VEH[v.model].rt, d.rt) && !(HL.VEH[v.model].rt === 0 && d.rt === 1)) continue;
      const dd = HL.manh(v.px, v.py, d.x, d.y);
      if (dd < bd) { bd = dd; best = d; }
    }
    return best;
  };
  V.autoRenew = function (g, v) {
    const c = g.companies[v.owner];
    if (!c) return;
    // autoreplace to a chosen newer model first
    const rep = c.replace && c.replace[v.model];
    const yr = HL.ymd(g.date).y;
    if (rep && HL.VEH[rep] && HL.vehAvailable(HL.VEH[rep], yr, g.unlockAll)) {
      const nm = HL.VEH[rep];
      const cost = Game.vehCost(g, nm) - Math.round(v.value);
      if (Game.canAfford(g, v.owner, cost + (c.renewReserve || 0))) {
        Game.spend(g, v.owner, 'newveh', cost);
        if (v.kind === 'rail') { const idx = v.cars.findIndex(cc => cc.model === v.model); if (idx >= 0) v.cars[idx].model = rep; V.recalc(g, v); }
        else { v.model = rep; const h = v.holds[0]; if (h && v.kind === 'road') { h.cap = nm.cap; } }
        v.age = 0; v.maxAge = nm.age * 365; v.value = Game.vehCost(g, nm); v.rel = v.relMax = V.modelRel(g, nm);
        if (v.owner === g.player) Game.news(g, 'vehicle', V.displayName(v) + ' upgraded to ' + nm.name, '', { veh: v.id, cid: v.owner });
        return;
      }
    }
    if (!c.autorenew || v.age < v.maxAge - 180) return;
    const m = HL.VEH[v.model];
    if (!HL.vehAvailable(m, yr, g.unlockAll)) return;
    const cost = (v.kind === 'rail' ? V.trainCost(g, v) : Game.vehCost(g, m)) - Math.round(v.value);
    if (!Game.canAfford(g, v.owner, cost + (c.renewReserve || 0))) return;
    Game.spend(g, v.owner, 'newveh', cost);
    v.age = 0; v.value = v.kind === 'rail' ? V.trainCost(g, v) : Game.vehCost(g, m); v.rel = v.relMax = V.modelRel(g, m); v.breakdowns = 0;
    if (v.owner === g.player) Game.news(g, 'vehicle', V.displayName(v) + ' has been renewed', 'Cost ' + HL.fmtMoney(cost) + '.', { veh: v.id, cid: v.owner });
  };

  // ---------- per tick ----------
  V.tickAll = function (g) {
    const vs = g.vehicles;
    for (let i = 0; i < vs.length; i++) {
      const v = vs[i];
      if (!v) continue;
      if (v.state === 'crashed') { if (--v.crashTimer <= 0) V.destroy(g, v, true); continue; }
      if (v.inDepot) {
        if (!v.stopped && v.kind !== 'air') { const mod = V.mod(v); if (mod) mod.leaveDepot(g, v); }
        else if (v.kind === 'air' && !v.stopped && v.airState === 'hangar') HL.Air.tick(g, v);
        continue;
      }
      if (v.kind === 'air') { HL.Air.tick(g, v); continue; }
      if (v.broken > 0) { v.speed = Math.max(0, v.speed - 2); if (v.kind === 'rail') HL.Rail.tick(g, v, true); continue; }
      if (v.state === 'load') { V.loadTick(g, v); if (v.kind === 'rail') HL.Rail.tick(g, v, true); continue; }
      if (v.stopped) { v.speed = Math.max(0, v.speed - 2); const mod = V.mod(v); if (v.kind === 'rail' && mod) mod.tick(g, v, true); continue; }
      const mod = V.mod(v);
      if (mod) mod.tick(g, v);
    }
  };
  V.mod = v => v.kind === 'rail' ? HL.Rail : v.kind === 'road' ? HL.Road : v.kind === 'ship' ? HL.Ship : HL.Air;

  // ---------- daily ----------
  V.daily = function (g) {
    const brk = g.diff.breakdowns;
    for (const v of g.vehicles) {
      if (!v || v.state === 'crashed') continue;
      v.age++;
      // running costs (none while stopped in a depot)
      if (!(v.inDepot && v.stopped) && !(v.kind === 'air' && v.airState === 'hangar' && v.stopped)) {
        let run = 0;
        if (v.kind === 'rail') { for (const c of v.cars) run += HL.VEH[c.model].run; }
        else run = HL.VEH[v.model].run;
        const cost = run * g.econ.costMul * g.diff.runCost / 365;
        v.runAcc = (v.runAcc || 0) + cost;
        if (v.runAcc >= 1) { const n = Math.floor(v.runAcc); v.runAcc -= n; Game.spend(g, v.owner, V.RUN_CAT[v.kind], n); v.profitThisYear -= n; }
      }
      // cargo ageing
      for (const h of v.holds) for (const p of h.p) p.d++;
      if (v.inDepot) continue;
      // reliability and breakdowns
      v.rel = Math.max(0.05, v.rel - (0.0009 + (1 - v.relMax) * 0.002));
      if (v.broken > 0) { if (--v.broken === 0) v.speed = 0; continue; }
      if (brk && v.state !== 'load' && !(v.kind === 'air' && v.airState !== 'fly')) {
        const p = Math.pow(1 - v.rel, 2) * (brk === 1 ? 0.012 : 0.03);
        if (g.rng.chance(p)) {
          v.broken = 2 + g.rng.int(3); v.breakdowns++;
          if (v.kind === 'air') { v.broken = 0; v.slowFlight = true; }
          HL.emit('breakdown', v);
          if (v.owner === g.player && v.breakdowns === 3) Game.news(g, 'advice', V.displayName(v) + ' keeps breaking down', 'Have it serviced more often, or replace it.', { veh: v.id, cid: v.owner });
        }
      }
      // go for service
      if (brk && !v.goDepot && V.needsService(g, v) && v.state === 'run') {
        if (v.kind === 'air') v.goDepot = { stop: false, hangar: true, service: true };
        else { const d = V.nearestDepot(g, v); if (d && HL.manh(v.px, v.py, d.x, d.y) < 40) { v.goDepot = { depot: d.id, stop: false, service: true }; v.route = null; } }
      }
    }
  };
  V.monthly = function (g) {
    // value depreciation
    for (const v of g.vehicles) if (v) v.value *= 0.988;
  };
  V.yearly = function (g) {
    for (const v of g.vehicles) {
      if (!v) continue;
      if (v.owner === g.player && v.age > 730 && v.profitThisYear < 0 && v.kind) Game.news(g, 'advice', V.displayName(v) + ' is unprofitable', 'Last year\'s profit: ' + HL.fmtMoney(v.profitThisYear), { veh: v.id, cid: v.owner });
      v.profitLastYear = v.profitThisYear; v.profitThisYear = 0;
      if (v.owner === g.player && v.age > v.maxAge - 365 && v.age <= v.maxAge) Game.news(g, 'advice', V.displayName(v) + ' is getting old', 'Replace it soon, or turn on autorenew.', { veh: v.id, cid: v.owner });
    }
  };

  // ---------- crashes ----------
  V.crash = function (g, v, why) {
    if (v.state === 'crashed') return;
    v.state = 'crashed'; v.crashTimer = TPD * 4; v.speed = 0;
    for (const h of v.holds) { h.p = []; h.n = 0; }
    const co = g.companies[v.owner];
    if (co) co.stats.crashes++;
    let victims = 0;
    for (const h of v.holds) if (h.c === 'pax') victims += h.n;
    HL.emit('crash', v);
    Game.news(g, 'accident', why || ('Disaster! ' + V.displayName(v) + ' crashes!'), co ? co.name + ' is investigating.' : '', { veh: v.id, cid: v.owner, big: true, tile: g.map.t(Math.floor(v.px), Math.floor(v.py)) });
  };
  V.onBridgeOrTunnel = function (g, bt) {
    for (const v of g.vehicles) if (v && !v.inDepot && (v.onBridge === bt.id + (bt.kind === 'bridge' ? 0 : 100000) || v.inTunnel === bt.id)) return true;
    for (const v of g.vehicles) {
      if (!v || v.inDepot || !v.path) continue;
      for (const s of v.path) if (s.br === bt.id && s.k === (bt.kind === 'bridge' ? 1 : 2)) return true;
    }
    return false;
  };
})(typeof window !== 'undefined' ? window : globalThis);
