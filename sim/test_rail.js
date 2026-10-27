// End-to-end: build a coal line with the AI planner, run a train, check it earns money.
const HL = require('./load')();
const seed = process.argv[2] || 'RAILTEST';
const g = HL.Game.create({ w: 96, h: 96, seed, climate: 'temperate', startYear: 1935, aiCount: 0, terrain: 1, industries: 3 });
const cid = g.player;
g.companies[cid].money = 2e6;
const mines = g.industries.filter(i => i && i.type === 'coal_mine');
const plants = g.industries.filter(i => i && i.type === 'power_plant');
let pair = null;
for (const a of mines) for (const b of plants) { const d = HL.manh(a.x, a.y, b.x, b.y); if (d > 15 && d < 50 && (!pair || d < pair.d)) pair = { a, b, d }; }
if (!pair) { console.log('no pair'); process.exit(1); }
console.log('pair', pair.a.name, '->', pair.b.name, 'dist', pair.d);
const rt = 0;
const rect = i => ({ x0: i.x, y0: i.y, x1: i.x + i.w - 1, y1: i.y + i.h - 1 });
const sA = HL.AIBuild.railStationSites(g, cid, rect(pair.a), { x: pair.b.x, y: pair.b.y }, 4, rt);
const sB = HL.AIBuild.railStationSites(g, cid, rect(pair.b), { x: pair.a.x, y: pair.a.y }, 4, rt);
console.log('sites', sA.length, sB.length);
let done = false;
for (const a of sA) { for (const b of sB) {
  const path = HL.AIBuild.planRail(g, cid, a.exit.x, a.exit.y, a.exit.dir, b.exit.x, b.exit.y, { endDir: HL.opp(b.exit.dir) });
  if (!path) continue;
  console.log('path len', path.length, 'bridges', path.filter(p => p.bridge).length);
  let r = HL.Stations.buildRail(g, cid, a.x, a.y, a.axis, 1, a.len, rt, true); if (!r.ok) { console.log('stA', r.err); continue; }
  r = HL.Stations.buildRail(g, cid, b.x, b.y, b.axis, 1, b.len, rt, true); if (!r.ok) { console.log('stB', r.err); continue; }
  // connect station exits: path starts at exit tile of A moving away; first tile piece needs entry from station side
  const full = [{ x: a.exit.x - HL.DX[a.exit.dir], y: a.exit.y - HL.DY[a.exit.dir], din: a.exit.dir, dout: a.exit.dir }].concat(path);
  full.push({ x: b.exit.x - HL.DX[b.exit.dir], y: b.exit.y - HL.DY[b.exit.dir], din: HL.opp(b.exit.dir), dout: HL.opp(b.exit.dir) });
  r = HL.AIBuild.layRail(g, cid, full, rt, true); if (!r.ok) { console.log('lay', r.err, JSON.stringify(r.at)); continue; }
  const dep = HL.AIBuild.placeRailDepot(g, cid, full, rt, true); if (!dep.ok) { console.log('depot fail'); continue; }
  const eng = HL.AIBuild.bestEngine(g, cid, rt, true);
  const wag = HL.AIBuild.bestWagon(g, rt, 'coal');
  const b1 = HL.Veh.buy(g, cid, dep.depot.id, eng.id); if (!b1.ok) { console.log(b1.err); process.exit(1); }
  const tr = b1.v;
  for (let i = 0; i < 4; i++) HL.Veh.addWagon(g, tr, wag.id);
  const stA = g.stations[g.map.idx[g.map.t(a.x, a.y)]], stB = g.stations[g.map.idx[g.map.t(b.x, b.y)]];
  HL.Veh.addOrder(g, tr, { st: stA.id, load: 1 });
  HL.Veh.addOrder(g, tr, { st: stB.id });
  tr.stopped = false;
  console.log('train', HL.Veh.displayName(tr), eng.name, 'cars', tr.cars.length, 'len', tr.len.toFixed(2), 'stations', stA.name, stB.name, 'accepts coal at B', !!stB.accepts.coal);
  done = { tr, stA, stB };
  break; } if (done) break; }
if (!done) { console.log('could not build'); process.exit(1); }
const money0 = g.companies[cid].money;
const t0 = Date.now();
let lastState = '';
for (let day = 0; day < 365 * 2; day++) {
  for (let i = 0; i < HL.TICKS_PER_DAY; i++) HL.Game.step(g);
  const tr = done.tr;
  const st = tr.state + (tr.load ? ':' + tr.load.phase : '') + ' oi' + tr.oi;
  if (day % 30 === 0 || (st !== lastState && day < 120)) console.log('day', day, st, 'speed', tr.speed.toFixed(0), 'pos', tr.px && tr.px.toFixed(1), tr.py && tr.py.toFixed(1), 'load', HL.Veh.loadText(tr), 'waitA', HL.Stations.waiting(done.stA, 'coal'), 'profit', Math.round(tr.profitThisYear));
  lastState = st;
}
console.log('money delta', Math.round(g.companies[cid].money - money0), 'delivered', JSON.stringify(g.companies[cid].deliveredTotal), 'ms', Date.now() - t0);
