// Player profile: settings, achievements, high scores. Stored in localStorage (guarded for Node).
(function (root) {
  const HL = root.HL;
  const Meta = HL.Meta = {};
  const KEY = 'hinterline_profile_v1';
  const DEFAULTS = { vol: 0.8, sfx: 0.8, ambient: 0.55, music: 0.45, dayNight: true, weather: true, grid: true, townNames: true, stationNames: true, industryNames: false, edgeScroll: false, newspaper: true, autosave: 3, tips: true };
  Meta.settings = Object.assign({}, DEFAULTS);
  Meta.ach = {};
  Meta.scores = [];
  Meta.tutorialDone = false;
  Meta.scenariosWon = {};
  const store = () => { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; } };
  Meta.load = function () {
    const s = store(); if (!s) return;
    try {
      const d = JSON.parse(s.getItem(KEY) || '{}');
      Object.assign(Meta.settings, d.settings || {});
      Meta.ach = d.ach || {}; Meta.scores = d.scores || []; Meta.tutorialDone = !!d.tutorialDone; Meta.tipsSeen = d.tipsSeen || {}; Meta.scenariosWon = d.scenariosWon || {};
    } catch (e) { /* corrupt profile: start fresh */ }
  };
  Meta.save = function () {
    const s = store(); if (!s) return;
    try { s.setItem(KEY, JSON.stringify({ settings: Meta.settings, ach: Meta.ach, scores: Meta.scores, tutorialDone: Meta.tutorialDone, tipsSeen: Meta.tipsSeen, scenariosWon: Meta.scenariosWon })); } catch (e) { /* storage full or blocked */ }
  };

  // ---------- achievements ----------
  HL.ACHIEVEMENTS = [
    { id: 'first_train', name: 'Steam Up', desc: 'Run your first train.' },
    { id: 'first_bus', name: 'All Aboard', desc: 'Run your first bus.' },
    { id: 'first_ship', name: 'Cast Off', desc: 'Launch your first ship.' },
    { id: 'first_plane', name: 'Wheels Up', desc: 'Fly your first aircraft.' },
    { id: 'all_modes', name: 'Every Which Way', desc: 'Own a train, a road vehicle, a ship and an aircraft at the same time.' },
    { id: 'profit_10k', name: 'In the Black', desc: 'Have one vehicle earn £10,000 profit in a year.' },
    { id: 'profit_100k', name: 'Flagship Service', desc: 'Have one vehicle earn £100,000 profit in a year.' },
    { id: 'money_1m', name: 'Millionaire', desc: 'Hold £1,000,000 in the bank.' },
    { id: 'money_100m', name: 'Captain of Industry', desc: 'Hold £100,000,000 in the bank.' },
    { id: 'value_10m', name: 'Blue Chip', desc: 'Reach a company value of £10,000,000.' },
    { id: 'no_loan', name: 'Debt Free', desc: 'Pay off your entire loan.' },
    { id: 'fleet_50', name: 'Fleet Manager', desc: 'Run 50 vehicles.' },
    { id: 'fleet_200', name: 'Transport Empire', desc: 'Run 200 vehicles.' },
    { id: 'cargo_100k', name: 'Heavy Haul', desc: 'Deliver 100,000 units of cargo in total.' },
    { id: 'pax_100k', name: 'People Mover', desc: 'Carry 100,000 passengers.' },
    { id: 'chain', name: 'Full Circle', desc: 'Deliver goods that you made by delivering raw materials.' },
    { id: 'subsidy', name: 'Public Money', desc: 'Win a subsidy.' },
    { id: 'statue', name: 'Cast in Bronze', desc: 'Have a statue built in your honour.' },
    { id: 'town_5k', name: 'City Maker', desc: 'Help a town you serve grow past 5,000 people.' },
    { id: 'electric', name: 'Live Wire', desc: 'Run an electric train.' },
    { id: 'maglev', name: 'Float On', desc: 'Run a maglev train.' },
    { id: 'jet', name: 'Jet Age', desc: 'Fly a jet airliner.' },
    { id: 'tunnel', name: 'Mole', desc: 'Dig a tunnel.' },
    { id: 'bridge', name: 'Bridge Builder', desc: 'Build a bridge.' },
    { id: 'perf_600', name: 'Director', desc: 'Reach a performance score of 600.' },
    { id: 'perf_900', name: 'Tycoon', desc: 'Reach a performance score of 900.' },
    { id: 'top', name: 'Top of the League', desc: 'Lead the league table against at least three rivals.' },
    { id: 'century', name: 'A Hundred Years On', desc: 'Play a single company for 100 years.' },
    { id: 'crash', name: 'Lessons Learned', desc: 'Survive a train crash. (Signals help.)' },
    { id: 'scenario', name: 'Mission Accomplished', desc: 'Complete any scenario.' },
    { id: 'all_scen', name: 'Every Challenge Met', desc: 'Complete every scenario.' },
    { id: 'arctic_town', name: 'Bread on the Ice', desc: 'Grow a snowbound town by delivering food.' },
    { id: 'desert_town', name: 'Make the Desert Bloom', desc: 'Grow a desert town with water and food.' },
  ];
  Meta.unlock = function (id) {
    if (Meta.ach[id] || !HL.G || !HL.G.g || HL.G.g.dev) return;
    const a = HL.ACHIEVEMENTS.find(x => x.id === id); if (!a) return;
    Meta.ach[id] = Date.now();
    Meta.save();
    HL.emit('achievement', a);
  };
  // periodic checks from the game loop (player company only)
  Meta.check = function (g) {
    const c = g.companies[g.player]; if (!c) return;
    const kinds = { rail: 0, road: 0, ship: 0, air: 0 };
    let n = 0, best = 0;
    for (const v of g.vehicles) {
      if (!v || v.owner !== g.player) continue;
      n++;
      if (!v.inDepot || !v.stopped) kinds[v.kind]++;
      best = Math.max(best, v.profitLastYear, v.profitThisYear);
      if (v.kind === 'rail' && !v.inDepot) { const m = HL.VEH[v.model]; if (m.fuel === 'electric') Meta.unlock('electric'); if (m.fuel === 'maglev') Meta.unlock('maglev'); }
      if (v.kind === 'air' && !v.inDepot && /jet|jumbo|sst|eliner/.test(HL.VEH[v.model].art)) Meta.unlock('jet');
    }
    if (kinds.rail) Meta.unlock('first_train');
    if (kinds.road && g.vehicles.some(v => v && v.owner === g.player && v.kind === 'road' && v.holds[0].c === 'pax')) Meta.unlock('first_bus');
    if (kinds.ship) Meta.unlock('first_ship');
    if (kinds.air) Meta.unlock('first_plane');
    if (kinds.rail && kinds.road && kinds.ship && kinds.air) Meta.unlock('all_modes');
    if (best >= 10000) Meta.unlock('profit_10k');
    if (best >= 100000) Meta.unlock('profit_100k');
    if (c.money >= 1e6) Meta.unlock('money_1m');
    if (c.money >= 1e8) Meta.unlock('money_100m');
    if (c.value >= 1e7) Meta.unlock('value_10m');
    if (c.loan === 0 && HL.ymd(g.date).y > g.stats.started) Meta.unlock('no_loan');
    if (n >= 50) Meta.unlock('fleet_50');
    if (n >= 200) Meta.unlock('fleet_200');
    const tot = Object.values(c.deliveredTotal).reduce((a, b) => a + b, 0);
    if (tot >= 100000) Meta.unlock('cargo_100k');
    if ((c.deliveredTotal.pax || 0) >= 100000) Meta.unlock('pax_100k');
    if (c.perf >= 600) Meta.unlock('perf_600');
    if (c.perf >= 900) Meta.unlock('perf_900');
    const alive = g.companies.filter(o => o && o.alive);
    if (alive.length >= 4 && alive.every(o => o === c || o.perf < c.perf) && HL.ymd(g.date).y > g.stats.started + 2) Meta.unlock('top');
    if (HL.ymd(g.date).y - g.stats.started >= 100) Meta.unlock('century');
    if (c.stats.crashes > 0) Meta.unlock('crash');
    if (g.towns.some(t => t && t.statues[g.player])) Meta.unlock('statue');
    if (g.bridges.some(b => b && b.owner === g.player)) Meta.unlock('bridge');
    if (g.tunnels.some(t => t && t.owner === g.player)) Meta.unlock('tunnel');
    for (const tw of g.towns) {
      if (!tw || tw.pop < 5000) continue;
      if (g.stations.some(s => s && s.owner === g.player && s.town === tw.id)) Meta.unlock('town_5k');
    }
    for (const tw of g.towns) {
      if (!tw || !tw.needs.length || tw.starved || tw.pop < 600) continue;
      if (!tw.needs.every(cg => (tw.lastRecv[cg] || 0) > 0)) continue;
      if (g.opts.climate === 'arctic') Meta.unlock('arctic_town'); else Meta.unlock('desert_town');
    }
  };
  Meta.onDeliver = function (g, v, c, n) {
    if (v.owner !== g.player) return;
    if (c === 'goods' || c === 'food' || c === 'paper' || c === 'steel') {
      // goods made from cargo this company delivered earlier
      const co = g.companies[g.player];
      if (co.deliveredTotal.coal || co.deliveredTotal.ore || co.deliveredTotal.wood || co.deliveredTotal.grain || co.deliveredTotal.oil || co.deliveredTotal.stock || co.deliveredTotal.fruit || co.deliveredTotal.maize || co.deliveredTotal.copper || co.deliveredTotal.rubber) Meta.unlock('chain');
    }
  };

  // ---------- high scores ----------
  Meta.addScore = function (g) {
    const c = g.companies[g.player];
    const entry = { name: c.name, manager: c.manager, score: c.perf, value: c.value, years: HL.ymd(g.date).y - g.stats.started, climate: g.opts.climate, diff: g.opts.difficulty || 'normal', scenario: g.scenario ? g.scenario.id : null, when: Date.now() };
    Meta.scores.push(entry);
    Meta.scores.sort((a, b) => b.score - a.score || b.value - a.value);
    Meta.scores = Meta.scores.slice(0, 20);
    Meta.save();
    return Meta.scores.indexOf(entry);
  };
})(typeof window !== 'undefined' ? window : globalThis);
