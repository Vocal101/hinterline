// Random events and disasters, new-model announcements, and scenarios with goals.
(function (root) {
  const HL = root.HL;
  const Ev = HL.Events = {};
  const T = HL.T;
  const Game = HL.Game;

  Ev.daily = function (g) { };
  Ev.monthly = function (g) {
    const rng = g.rng;
    // timed cargo booms expire
    for (const c in g.econ.cargoPay) if (g.econ.cargoPay[c].until < g.date) { delete g.econ.cargoPay[c]; }
    if (rng.chance(0.03)) Ev.boom(g);
    if (g.diff.disasters && rng.chance(0.012)) Ev.disaster(g);
    HL.Scenarios.monthly(g);
  };
  Ev.yearly = function (g, y) {
    for (const m of Object.values(HL.VEH)) {
      if (m.intro !== y || m.wagon) continue;
      if (m.kind === 'road' && !HL.CLIMATES[g.opts.climate].cargos.includes(m.cargo)) continue;
      const what = { rail: m.engine ? 'locomotive' : 'rolling stock', road: m.cargo === 'pax' ? 'bus' : 'lorry', ship: 'ship', air: 'aircraft' }[m.kind];
      Game.news(g, 'vehicle', 'New ' + what + ' available: ' + m.name, (m.desc ? m.desc + ' ' : '') + 'Top speed ' + m.speed + ' km/h.', { big: m.kind === 'rail' && m.engine || m.kind === 'air', img: m.id });
    }
    for (const rt of HL.RAILTYPES) if (rt.intro === y) Game.news(g, 'vehicle', rt.name + ' now available', 'New track can be built from the railway construction toolbar.', { big: true });
    for (const a of HL.AIRPORTS) if (a.intro === y) Game.news(g, 'vehicle', 'New airport design: ' + a.name, a.desc, { big: false });
    for (const b of HL.BRIDGES) if (b.intro === y && y > 0) Game.news(g, 'vehicle', 'New bridge design: ' + b.name, 'Spans up to ' + b.maxLen + ' tiles at up to ' + b.speed + ' km/h.');
  };
  HL.on('year', (g, y) => Ev.yearly(g, y));

  // a cargo pays more for a year
  Ev.boom = function (g) {
    const cl = HL.CLIMATES[g.opts.climate].cargos.filter(c => c !== 'pax' && c !== 'mail');
    const c = g.rng.pick(cl);
    if (g.econ.cargoPay[c]) return;
    const mult = 1.25 + g.rng.int(3) * 0.15;
    g.econ.cargoPay[c] = { mult, until: g.date + 365 };
    Game.news(g, 'economy', HL.CARGO[c].name + ' prices soar', 'Shortages push up rates: ' + HL.CARGO[c].name.toLowerCase() + ' pays ' + Math.round((mult - 1) * 100) + '% more for the next year.', { big: true });
  };
  Ev.disaster = function (g) {
    const rng = g.rng, m = g.map;
    const kind = rng.int(4);
    if (kind === 0) {
      const mines = g.industries.filter(i => i && /mine/.test(i.type) && !i.closing);
      const i = rng.pick(mines); if (!i) return;
      i.closing = 1;
      Game.news(g, 'industry', 'Subsidence at ' + i.name + '!', 'The workings have collapsed. The mine will close.', { big: true, tile: m.t(i.x, i.y) });
    } else if (kind === 1) {
      const facs = g.industries.filter(i => i && HL.INDUSTRY[i.type].prod && !i.closing);
      const i = rng.pick(facs); if (!i) return;
      i.level = Math.max(4, i.level >> 1);
      Game.news(g, 'industry', 'Fire at ' + i.name, 'Production has been badly hit while repairs go on.', { big: true, tile: m.t(i.x, i.y) });
    } else if (kind === 2) {
      // storm surge washes away coastal track and road (not under trains)
      for (let tries = 0; tries < 40; tries++) {
        const x = 3 + rng.int(m.W - 6), y = 3 + rng.int(m.H - 6);
        if (!m.isCoast(x, y)) continue;
        let hit = 0, owner = -1;
        for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
          const tx = x + dx, ty = y + dy; if (!m.inside(tx, ty) || m.tileMin(tx, ty) > 0) continue;
          const t = m.t(tx, ty);
          if (m.type[t] === T.RAIL && !(m.m1[t] & 0xC000) && !m.road[t]) {
            let busy = false; for (let p = 0; p < 6; p++) if (HL.Rail.pieceOccupied(g, t, p)) busy = true;
            if (busy) continue;
            owner = m.owner[t];
            for (let p = 0; p < 6; p++) if (m.rail[t] & (1 << p)) HL.Build.removeRail(g, owner, tx, ty, p, true);
            hit++;
          }
        }
        if (hit) { Game.news(g, 'accident', 'Storm surge washes away railway', hit + ' stretches of coastal track belonging to ' + g.companies[owner].name + ' have been destroyed.', { big: owner === g.player, tile: m.t(x, y), cid: owner }); return; }
      }
    } else {
      // heatwave: vehicles wear out faster for a while
      for (const v of g.vehicles) if (v && !v.inDepot) v.rel = Math.max(0.1, v.rel - 0.15);
      Game.news(g, 'general', 'Heatwave grips the country', 'Engines overheat and breakdowns are expected. Keep vehicles serviced.', { big: false });
    }
  };

  // ================= scenarios =================
  const Sc = HL.Scenarios = {};
  HL.SCENARIOS = [
    { id: 'coal', name: 'The Coal Road', blurb: 'A young country runs on coal. Get it from the pits to the power stations before anyone else does.', opts: { climate: 'temperate', startYear: 1878, w: 96, h: 96, terrain: 1, sea: 1, industries: 3, towns: 2 }, difficulty: 'normal',
      goals: [{ type: 'deliver', cargo: 'coal', amount: 25000, by: 1900, text: 'Deliver 25,000 t of coal by 1900' }, { type: 'value', amount: 400000, by: 1900, text: 'Company value of £400,000 by 1900' }] },
    { id: 'islands', name: 'Island Hopper', blurb: 'An archipelago with no land route between the larger islands. Ships and aircraft are your friends.', opts: { climate: 'temperate', startYear: 1950, w: 128, h: 128, terrain: 1, sea: 3, towns: 3, industries: 2 }, difficulty: 'normal',
      goals: [{ type: 'value', amount: 3000000, by: 1980, text: 'Company value of £3,000,000 by 1980' }, { type: 'modes', amount: 2, by: 1980, text: 'Run both ships and aircraft' }] },
    { id: 'frost', name: 'Bread on the Ice', blurb: 'Towns above the snowline will only grow if somebody feeds them. Somebody should.', opts: { climate: 'arctic', startYear: 1930, w: 128, h: 128, terrain: 2, sea: 1, towns: 2, industries: 3 }, difficulty: 'normal',
      goals: [{ type: 'needTown', amount: 2500, by: 1965, text: 'Grow a snowbound town to 2,500 people' }] },
    { id: 'oasis', name: 'Make the Desert Bloom', blurb: 'Desert towns are dying of thirst. Bring water and food and watch them flourish.', opts: { climate: 'desert', startYear: 1940, w: 128, h: 128, terrain: 1, sea: 1, towns: 2, industries: 3 }, difficulty: 'normal',
      goals: [{ type: 'needTown', amount: 2500, by: 1975, text: 'Grow a desert town to 2,500 people' }, { type: 'deliver', cargo: 'water', amount: 30000, by: 1975, text: 'Deliver 30,000 kL of water' }] },
    { id: 'rivals', name: 'Rival Lines', blurb: 'Five hungry competitors and a short loan. Out-build them all.', opts: { climate: 'temperate', startYear: 1950, w: 160, h: 160, terrain: 1, sea: 1, towns: 3, industries: 3, aiCount: 5 }, difficulty: 'hard',
      goals: [{ type: 'rank', amount: 1, by: 1980, text: 'Top the league table by 1980' }] },
    { id: 'express', name: 'The Express', blurb: 'Big cities far apart and travellers in a hurry. Fast passenger trains will make your name.', opts: { climate: 'temperate', startYear: 1955, w: 160, h: 160, terrain: 1, sea: 1, towns: 4, industries: 1 }, difficulty: 'normal',
      goals: [{ type: 'deliver', cargo: 'pax', amount: 250000, by: 1990, text: 'Carry 250,000 passengers by 1990' }] },
    { id: 'shoestring', name: 'On a Shoestring', blurb: 'The bank will lend you almost nothing. Every pound has to work.', opts: { climate: 'temperate', startYear: 1905, w: 96, h: 96, terrain: 1, sea: 1, towns: 2, industries: 2, diffOverride: { maxLoan: 70000 } }, difficulty: 'normal',
      goals: [{ type: 'money', amount: 1000000, by: 1945, text: 'Have £1,000,000 in the bank by 1945' }] },
    { id: 'future', name: 'Into the Future', blurb: 'Monorail and maglev are on the drawing board. Build the fastest network in the world.', opts: { climate: 'temperate', startYear: 2015, w: 128, h: 128, terrain: 2, sea: 1, towns: 3, industries: 2 }, difficulty: 'normal',
      goals: [{ type: 'perf', amount: 750, by: 2045, text: 'Reach a performance score of 750' }, { type: 'maglev', amount: 1, by: 2045, text: 'Run a maglev service' }] },
  ];
  Sc.setup = function (g) {
    const s = HL.SCENARIOS.find(x => x.id === g.opts.scenario);
    if (!s) return;
    g.scenario = { id: s.id, name: s.name };
    g.goals = s.goals.map(x => Object.assign({ done: false, failed: false }, x));
    g.endYear = Math.max(...s.goals.map(x => x.by)) + 10;
  };
  Sc.value = function (g, goal) {
    const c = g.companies[g.player];
    switch (goal.type) {
      case 'deliver': return c.deliveredTotal[goal.cargo] || 0;
      case 'value': return c.value;
      case 'money': return c.money;
      case 'perf': return c.perf;
      case 'rank': { const cs = g.companies.filter(o => o && o.alive).sort((a, b) => b.perf - a.perf); return cs.indexOf(c) + 1; }
      case 'modes': { let n = 0; for (const k of ['ship', 'air']) if (g.vehicles.some(v => v && v.owner === g.player && v.kind === k && !v.inDepot)) n++; return n; }
      case 'needTown': { let best = 0; for (const t of g.towns) if (t && t.needs.length) best = Math.max(best, t.pop); return best; }
      case 'maglev': return g.vehicles.some(v => v && v.owner === g.player && v.kind === 'rail' && !v.inDepot && HL.VEH[v.model].fuel === 'maglev') ? 1 : 0;
    }
    return 0;
  };
  Sc.progress = function (g, goal) {
    const v = Sc.value(g, goal);
    if (goal.type === 'rank') return { f: goal.done ? 1 : 1 / Math.max(1, v), label: goal.done ? 'done' : '#' + v + ' · by ' + goal.by };
    const f = HL.clamp(v / goal.amount, 0, 1);
    const fmt = goal.type === 'value' || goal.type === 'money' ? HL.fmtMoney(v, true) + ' / ' + HL.fmtMoney(goal.amount, true) : HL.fmtInt(v) + ' / ' + HL.fmtInt(goal.amount);
    return { f: goal.done ? 1 : f, label: goal.done ? 'done' : (goal.failed ? 'failed' : fmt + ' · by ' + goal.by) };
  };
  Sc.monthly = function (g) {
    if (!g.goals || !g.goals.length) return;
    const y = HL.ymd(g.date).y;
    for (const goal of g.goals) {
      if (goal.done || goal.failed) continue;
      const v = Sc.value(g, goal);
      const met = goal.type === 'rank' ? v <= goal.amount : v >= goal.amount;
      if (met) { goal.done = true; Game.news(g, 'company', 'Goal reached: ' + goal.text, 'Well done.', { big: true }); }
      else if (y > goal.by) { goal.failed = true; Game.news(g, 'company', 'Goal missed: ' + goal.text, 'The deadline has passed.', { big: true }); }
    }
    if (!g.scenarioWon && g.goals.every(x => x.done)) {
      g.scenarioWon = true;
      if (HL.Meta && !g.dev) {
        HL.Meta.scenariosWon[g.scenario.id] = true; HL.Meta.save();
        HL.Meta.unlock('scenario');
        if (HL.SCENARIOS.every(s => HL.Meta.scenariosWon[s.id])) HL.Meta.unlock('all_scen');
      }
      HL.emit('scenarioWon', g);
    }
    if (!g.scenarioLost && g.goals.some(x => x.failed)) { g.scenarioLost = true; HL.emit('scenarioLost', g); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
