// Game state, companies, calendar ticking and finances. DOM-free.
(function (root) {
  const HL = root.HL;
  const Game = HL.Game = {};

  HL.LIVERY = [
    { name: 'Crimson Lake', main: '#8e2a33', accent: '#e2c068' },
    { name: 'Brunswick Green', main: '#1f5a3e', accent: '#e8d48a' },
    { name: 'Caledonian Blue', main: '#3c6fb0', accent: '#f2ead0' },
    { name: 'Ochre', main: '#c8892e', accent: '#3a2a1c' },
    { name: 'Plum', main: '#6c3a6e', accent: '#e9d7a0' },
    { name: 'Teal', main: '#22807f', accent: '#f0e6c8' },
    { name: 'Signal Red', main: '#c4382c', accent: '#f4efe4' },
    { name: 'Slate', main: '#4c5966', accent: '#e6b85a' },
    { name: 'Chocolate', main: '#5e3b27', accent: '#e8d2a8' },
    { name: 'Lime', main: '#7ca53a', accent: '#24341a' },
    { name: 'Navy', main: '#24345e', accent: '#d9b35a' },
    { name: 'Cream', main: '#d9cba2', accent: '#6b2a2a' },
  ];

  HL.DIFFICULTY = {
    easy:   { name: 'Relaxed', maxLoan: 500000, interest: 2, runCost: 0.8, buildCost: 0.85, breakdowns: 1, aiCount: 2, aiSpeed: 0.6, townAttitude: 0, economy: 0, crashes: true, inflation: false, disasters: false, startMoneyBonus: 1.0, payMul: 1.65 },
    normal: { name: 'Standard', maxLoan: 300000, interest: 3, runCost: 1, buildCost: 1, breakdowns: 2, aiCount: 3, aiSpeed: 1, townAttitude: 1, economy: 1, crashes: true, inflation: true, disasters: true, startMoneyBonus: 1.0, payMul: 1.5 },
    hard:   { name: 'Cut-throat', maxLoan: 150000, interest: 4, runCost: 1.25, buildCost: 1.2, breakdowns: 2, aiCount: 5, aiSpeed: 1.5, townAttitude: 2, economy: 1, crashes: true, inflation: true, disasters: true, startMoneyBonus: 1.0, payMul: 1.3 },
  };

  HL.FIN_CATS = [
    ['construction', 'Construction'], ['newveh', 'New vehicles'], ['trainrun', 'Train running costs'], ['roadrun', 'Road vehicle running costs'],
    ['airrun', 'Aircraft running costs'], ['shiprun', 'Ship running costs'], ['property', 'Property maintenance'],
    ['traininc', 'Train income'], ['roadinc', 'Road vehicle income'], ['airinc', 'Aircraft income'], ['shipinc', 'Ship income'],
    ['interest', 'Loan interest'], ['other', 'Other'],
  ];

  Game.newCompany = function (g, o) {
    const rng = g.rng;
    const d = g.diff;
    const c = HL.alloc(g.companies, {
      name: o.name || HL.NAMES.company(rng, g.towns), manager: o.manager || HL.NAMES.manager(rng),
      color: o.color != null ? o.color : 0, ai: o.ai || null, human: !o.ai,
      money: 0, loan: 0, founded: HL.ymd(g.date).y, alive: true,
      fin: { cur: {}, years: [] }, quarters: [], cur: Game.emptyQuarter(),
      value: 0, perf: 0, perfParts: {}, bankruptQ: 0,
      delivered: {}, deliveredTotal: {}, vehiclesBuilt: 0, hq: null, achievements: {},
      stats: { maxValue: 0, maxPerf: 0, crashes: 0 },
    });
    const loan = Math.round(d.maxLoan * g.econ.costMul / 10000) * 10000;
    c.loan = loan; c.money = loan;
    g.companyRatingsInit && g.companyRatingsInit(c);
    return c;
  };
  Game.emptyQuarter = () => ({ income: 0, expenses: 0, delivered: 0, cargo: {}, value: 0, perf: 0 });

  Game.maxLoan = g => Math.round(g.diff.maxLoan * g.econ.costMul / 10000) * 10000;

  // ---------- creating a game ----------
  Game.create = function (opts) {
    const o = Object.assign({}, HL.MAPGEN_DEFAULTS, opts);
    const diff = Object.assign({}, HL.DIFFICULTY[o.difficulty || 'normal'], o.diffOverride || {});
    const g = {
      v: 1, opts: o, diff,
      date: HL.dateFromYear(o.startYear) + (o.startDay || 0), tick: 0, ticks: 0, realTime: 0,
      rng: new HL.RNG(HL.hashSeed(o.seed + 'game')),
      companies: [], towns: [], industries: [], stations: [], depots: [], vehicles: [], orders: [], groups: [],
      bridges: [], tunnels: [], signals: new Map(), objects: [],
      news: [], newsSeq: 0, subsidies: [],
      econ: { costMul: 1, payMul: diff.payMul || 1, interest: diff.interest, recession: 0, inflYears: 0, cargoPay: {} },
      weather: { rain: 0, snowfall: 0, until: 0 },
      player: 0, paused: false, speed: 1, over: false,
      scenario: o.scenario || null, goals: [], stats: { started: o.startYear },
      endYear: o.endYear || (o.startYear + 100),
    };
    g.catchIdx = new Map(); g.catchVer = 0;
    HL.generateWorld(g, o);
    const human = Game.newCompany(g, { name: o.companyName || 'Hinterline Transport', manager: o.manager || 'You', color: o.color != null ? o.color : 0 });
    g.player = human.id;
    if (o.scenario && HL.Scenarios && HL.Scenarios.setup) HL.Scenarios.setup(g);
    g.aiQueue = [];
    const nAI = o.aiCount != null ? o.aiCount : diff.aiCount;
    for (let i = 0; i < nAI; i++) g.aiQueue.push({ at: g.date + 30 + i * Math.round(120 / diff.aiSpeed) + g.rng.int(60) });
    Game.updateValues(g);
    return g;
  };

  // ---------- money ----------
  Game.spend = function (g, cid, cat, amt) {
    const c = g.companies[cid]; if (!c) return;
    c.money -= amt;
    c.fin.cur[cat] = (c.fin.cur[cat] || 0) - amt;
    c.cur.expenses += amt;
  };
  Game.earn = function (g, cid, cat, amt) {
    const c = g.companies[cid]; if (!c) return;
    c.money += amt;
    c.fin.cur[cat] = (c.fin.cur[cat] || 0) + amt;
    c.cur.income += amt;
  };
  Game.canAfford = (g, cid, amt) => { const c = g.companies[cid]; return !!c && (amt <= 0 || c.money >= amt); };
  Game.borrow = function (g, cid, amt) {
    const c = g.companies[cid]; const max = Game.maxLoan(g);
    amt = Math.min(amt, max - c.loan); if (amt <= 0) return 0;
    c.loan += amt; c.money += amt; return amt;
  };
  Game.repay = function (g, cid, amt) {
    const c = g.companies[cid];
    amt = Math.min(amt, c.loan, Math.max(0, c.money)); amt = Math.floor(amt / 10000) * 10000 || Math.min(c.loan, Math.max(0, Math.floor(c.money)));
    if (amt <= 0) return 0;
    c.loan -= amt; c.money -= amt; return amt;
  };
  // cost of something in today's money for a company (construction multiplier)
  Game.cost = (g, base) => Math.round(base * g.econ.costMul * g.diff.buildCost);
  Game.vehCost = (g, m) => Math.round(m.cost * g.econ.costMul);
  Game.runCost = (g, m) => Math.round(m.run * g.econ.costMul * g.diff.runCost);

  // ---------- news ----------
  // kind: 'arrival' | 'accident' | 'company' | 'economy' | 'industry' | 'vehicle' | 'general' | 'advice' | 'subsidy' | 'town'
  Game.news = function (g, kind, title, body, o) {
    o = o || {};
    const n = { id: ++g.newsSeq, kind, title, body: body || '', date: g.date, tile: o.tile != null ? o.tile : null, veh: o.veh != null ? o.veh : null, cid: o.cid != null ? o.cid : null, big: !!o.big, img: o.img || null };
    // advice about other companies' vehicles is noise
    if (kind === 'advice' && n.cid != null && n.cid !== g.player) return null;
    g.news.push(n);
    if (g.news.length > 200) g.news.splice(0, g.news.length - 200);
    HL.emit('news', n);
    return n;
  };

  // ---------- ticking ----------
  Game.step = function (g) {
    if (g.over && !g.continueAfterEnd) return;
    g.ticks++;
    HL.Veh && HL.Veh.tickAll(g);
    Game.tileLoop(g);
    HL.Ind && HL.Ind.tick(g);
    if (++g.tick >= HL.TICKS_PER_DAY) { g.tick = 0; Game.newDay(g); }
  };
  // visit every tile about every 4 days
  Game.tileLoop = function (g) {
    const m = g.map, n = m.W * m.H;
    const per = Math.max(1, Math.ceil(n / (HL.TICKS_PER_DAY * 4)));
    if (g.tlPos == null) g.tlPos = 0;
    // stride by a large prime so neighbouring tiles aren't processed together
    const stride = 7919 % n || 1;
    for (let i = 0; i < per; i++) {
      g.tlPos = (g.tlPos + stride) % n;
      const t = g.tlPos;
      const ty = m.type[t];
      if (ty === HL.T.HOUSE) HL.Towns.houseLoop(g, t);
      else if (ty === HL.T.CLEAR) Game.clearLoop(g, t);
    }
  };
  // grass regrowth, tree growth and spread, field upkeep
  Game.clearLoop = function (g, t) {
    const m = g.map, rng = g.rng;
    const gk = m.ground[t];
    if (gk === HL.GR.DIRT && rng.chance(0.15)) { m.ground[t] = HL.GR.GRASS; m.gdens[t] = 0; m.mark(t); return; }
    if (gk === HL.GR.GRASS && m.gdens[t] < 3 && rng.chance(0.25)) { m.gdens[t]++; m.mark(t); }
    const tr = m.trees[t];
    if (tr & 7) {
      const stage = (tr >> 3) & 3;
      if (stage < 3 && rng.chance(0.2)) { m.trees[t] = (tr & 7) | ((stage + 1) << 3); m.mark(t); }
      else if (stage === 3 && rng.chance(0.004)) {
        // spread to a neighbour
        const d = rng.int(4), x = m.tx(t) + HL.DX[d], y = m.ty(t) + HL.DY[d];
        if (m.inside(x, y)) {
          const n = m.t(x, y);
          if (m.type[n] === HL.T.CLEAR && !(m.trees[n] & 7) && m.ground[n] !== HL.GR.FIELD && m.ground[n] !== HL.GR.BEACH && (g.opts.climate !== 'desert' || m.zone[n] !== 1)) m.setTrees(n, 1, m.tspec[t], 0);
        }
      } else if (stage === 3 && (tr & 7) < 4 && rng.chance(0.01)) { m.trees[t] = ((tr & 7) + 1) | (3 << 3); m.mark(t); }
    }
  };

  Game.newDay = function (g) {
    g.date++;
    const d = HL.ymd(g.date);
    HL.Veh && HL.Veh.daily(g);
    HL.Stations.daily(g);
    HL.Towns.daily(g);
    HL.AI && HL.AI.daily(g);
    Game.weatherDaily(g);
    HL.Events && HL.Events.daily(g);
    if (d.d === 1) Game.newMonth(g, d);
  };
  Game.newMonth = function (g, d) {
    HL.Towns.monthly(g);
    HL.Ind.monthly(g);
    HL.Stations.monthly(g);
    HL.Veh && HL.Veh.monthly(g);
    Game.companiesMonthly(g);
    HL.Econ && HL.Econ.monthly(g);
    HL.Events && HL.Events.monthly(g);
    if (d.m % 3 === 0) Game.quarterly(g, d);
    if (d.m === 0) Game.newYear(g, d);
    HL.emit('month', g);
  };
  Game.companiesMonthly = function (g) {
    for (const c of g.companies) {
      if (!c || !c.alive) continue;
      // loan interest
      const intr = Math.round(c.loan * g.econ.interest / 100 / 12);
      if (intr) Game.spend(g, c.id, 'interest', intr);
      // property maintenance
      const prop = Game.propertyCost(g, c.id);
      if (prop) Game.spend(g, c.id, 'property', prop);
    }
  };
  // monthly upkeep of track, roads, stations
  Game.propertyCost = function (g, cid) {
    let n = 0;
    for (const s of g.stations) if (s && s.owner === cid) n += s.tileCount * 8 + (s.airport ? 60 : 0);
    const inf = g.infra && g.infra[cid];
    if (inf) n += inf.rail * 1.3 + inf.road * 0.5 + inf.signals * 2 + inf.bridgeTiles * 4 + inf.tunnelTiles * 4;
    return Math.round(n * g.econ.costMul);
  };
  Game.quarterly = function (g, d) {
    Game.updateValues(g);
    for (const c of g.companies) {
      if (!c || !c.alive) continue;
      c.cur.value = c.value; c.cur.perf = c.perf;
      c.cur.date = g.date;
      c.quarters.push(c.cur);
      if (c.quarters.length > 96) c.quarters.shift();
      c.cur = Game.emptyQuarter();
      c.stats.maxValue = Math.max(c.stats.maxValue, c.value);
      c.stats.maxPerf = Math.max(c.stats.maxPerf, c.perf);
      // bankruptcy
      if (c.money < 0) {
        c.bankruptQ++;
        if (c.id === g.player) {
          if (c.bankruptQ === 1) Game.news(g, 'company', 'Bank warns ' + c.name, 'Your company is in debt. If money is still negative in three quarters the bank will wind the company up. Sell unprofitable vehicles or take a loan.', { big: true, cid: c.id });
          else if (c.bankruptQ === 3) Game.news(g, 'company', 'Final warning', 'The bank will wind up ' + c.name + ' next quarter unless the accounts recover.', { big: true, cid: c.id });
          else if (c.bankruptQ >= 4) Game.bankrupt(g, c);
        } else if (c.bankruptQ >= 4) Game.bankrupt(g, c);
      } else c.bankruptQ = 0;
    }
    HL.emit('quarter', g);
    if (HL.Meta && HL.Meta.onQuarter) HL.Meta.onQuarter(g);
  };
  Game.newYear = function (g, d) {
    for (const c of g.companies) {
      if (!c || !c.alive) continue;
      c.fin.years.push({ year: d.y - 1, cats: c.fin.cur });
      if (c.fin.years.length > 30) c.fin.years.shift();
      c.fin.cur = {};
    }
    // inflation
    if (g.diff.inflation && d.y < 2100) {
      g.econ.costMul *= 1 + (0.012 + g.rng.next() * 0.016);
      g.econ.payMul *= 1 + (0.01 + g.rng.next() * 0.014);
      g.econ.inflYears++;
    }
    HL.Veh && HL.Veh.yearly(g);
    HL.emit('year', g, d.y);
    if (!g.over && d.y >= g.endYear) Game.endGame(g);
  };
  Game.endGame = function (g) {
    g.over = true;
    Game.updateValues(g);
    HL.emit('gameover', g);
  };
  Game.bankrupt = function (g, c) {
    c.alive = false;
    Game.news(g, 'company', c.name + ' goes bankrupt!', 'All of its vehicles and property have been removed.', { big: true, cid: c.id });
    HL.Build && HL.Build.removeCompanyAssets(g, c.id);
    if (c.id === g.player) { g.over = true; g.playerBankrupt = true; HL.emit('gameover', g); }
  };

  // ---------- company value and performance ----------
  Game.updateValues = function (g) {
    for (const c of g.companies) {
      if (!c || !c.alive) continue;
      let vv = 0, nVeh = 0, profitable = 0, minProfit = Infinity;
      for (const v of g.vehicles) {
        if (!v || v.owner !== c.id || v.part) continue;
        vv += v.value; nVeh++;
        if (v.profitLastYear > 0) profitable++;
        if (v.age > 730) minProfit = Math.min(minProfit, v.profitLastYear);
      }
      let stations = 0, cargoTypes = new Set();
      for (const s of g.stations) if (s && s.owner === c.id) { stations++; for (const k in s.cargo) if (s.cargo[k].everPicked) cargoTypes.add(k); }
      c.value = Math.max(0, Math.round(vv + c.money - c.loan + stations * 2000 * g.econ.costMul));
      // performance (0..1000)
      const q = c.quarters.length ? c.quarters[c.quarters.length - 1] : c.cur;
      const inc = q ? q.income - q.expenses : 0;
      const delivered = q ? q.delivered : 0;
      const parts = {
        vehicles: Math.min(120, profitable * 120 / 120),
        stations: Math.min(80, stations * 80 / 80),
        minProfit: minProfit === Infinity ? 0 : HL.clamp(minProfit / (10000 * g.econ.payMul) * 100, 0, 100),
        income: HL.clamp(inc / (100000 * g.econ.payMul) * 100, 0, 100),
        cargo: Math.min(100, delivered * 100 / 40000),
        types: Math.min(100, cargoTypes.size * 100 / 8),
        money: HL.clamp(c.money / (10000000 * g.econ.costMul) * 50, 0, 50),
        loan: c.loan === 0 ? 50 : 0,
        value: HL.clamp(c.value / (5000000 * g.econ.costMul) * 100, 0, 100),
        vehicleCount: Math.min(100, nVeh * 100 / 100),
      };
      // weights add to 1000 when every part is maxed
      c.perfParts = parts;
      c.perf = Math.round(parts.vehicles + parts.stations + parts.minProfit + parts.income + parts.cargo + parts.types * 1.0 + parts.money + parts.loan + parts.value + parts.vehicleCount + 50 * 0);
      c.perf = Math.min(1000, c.perf);
    }
  };
  HL.PERF_TITLES = [[0, 'Junior Clerk'], [120, 'Clerk'], [220, 'Traffic Manager'], [320, 'District Superintendent'], [420, 'Divisional Engineer'], [520, 'General Manager'], [620, 'Director'], [720, 'Chairman'], [820, 'Baron of the Line'], [920, 'Transport Tycoon of the Age']];
  HL.perfTitle = p => { let t = HL.PERF_TITLES[0][1]; for (const [v, n] of HL.PERF_TITLES) if (p >= v) t = n; return t; };

  // ---------- weather ----------
  Game.weatherDaily = function (g) {
    const w = g.weather, d = HL.ymd(g.date), rng = g.rng;
    const climate = g.opts.climate;
    if (g.date >= w.until) {
      const winter = d.m <= 1 || d.m === 11;
      let pRain = climate === 'desert' ? 0.03 : climate === 'arctic' ? 0.08 : 0.12;
      if (rng.chance(pRain)) {
        const snowy = climate === 'arctic' ? (winter || rng.chance(0.4)) : climate === 'temperate' && winter && rng.chance(0.5);
        w.target = 0.4 + rng.next() * 0.6; w.snowy = snowy; w.until = g.date + 2 + rng.int(6); w.storm = !snowy && rng.chance(0.25);
      } else { w.target = 0; w.until = g.date + 3 + rng.int(10); w.storm = false; }
    }
    const tgt = w.target || 0;
    const cur = w.snowy ? w.snowfall : w.rain;
    const nv = cur + (tgt - cur) * 0.5;
    if (w.snowy) { w.snowfall = nv; w.rain = w.rain * 0.4; } else { w.rain = nv; w.snowfall = w.snowfall * 0.4; }
    if (w.rain < 0.02) w.rain = 0; if (w.snowfall < 0.02) w.snowfall = 0;
  };

  // ---------- serialization of typed arrays ----------
  HL.b64 = {
    enc(u8) { let s = ''; const CH = 0x8000; for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH)); return (typeof btoa !== 'undefined' ? btoa(s) : Buffer.from(s, 'binary').toString('base64')); },
    dec(str) { const s = typeof atob !== 'undefined' ? atob(str) : Buffer.from(str, 'base64').toString('binary'); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; },
  };
})(typeof window !== 'undefined' ? window : globalThis);
