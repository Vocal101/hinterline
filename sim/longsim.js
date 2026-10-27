// Long headless run with AI companies. Usage: node sim/longsim.js [years=20] [seed] [size=128] [ais=4] [climate]
const HL = require('./load')();
const years = +(process.argv[2] || 20), seed = process.argv[3] || 'LONG1', size = +(process.argv[4] || 128), ais = +(process.argv[5] || 4), climate = process.argv[6] || 'temperate';
const errors = [];
const oe = console.error; console.error = (...a) => { errors.push(a.join(' ')); if (errors.length < 6) oe(...a); };
const t0 = Date.now();
const g = HL.Game.create({ w: size, h: size, seed, climate, startYear: +(process.argv[7] || 1930), aiCount: ais, difficulty: 'normal' });
// the empty player slot would go broke on loan interest and end the game; keep it out of the way
g.companies[g.player].alive = false; g.endYear = 99999; g.continueAfterEnd = true;
console.log('world', size, climate, 'towns', g.towns.length, 'industries', g.industries.filter(Boolean).length, 'gen ms', Date.now() - t0);
function check(day) {
  const bad = [];
  for (const c of g.companies) { if (!c) continue; if (!isFinite(c.money) || !isFinite(c.loan)) bad.push('money NaN ' + c.name); }
  for (const v of g.vehicles) {
    if (!v) continue;
    if (!isFinite(v.px) || !isFinite(v.py) || (v.px < -5 || v.py < -5 || v.px > size + 5 || v.py > size + 5)) bad.push('veh pos ' + v.id + ' ' + v.kind + ' ' + v.px + ',' + v.py + ' ' + v.state + ' ' + v.airState);
    if (!isFinite(v.speed)) bad.push('veh speed NaN ' + v.id);
    for (const h of v.holds) { const s = h.p.reduce((a, p) => a + p.n, 0); if (s !== h.n || h.n > h.cap || h.n < 0) bad.push('hold mismatch ' + v.id + ' ' + s + ' ' + h.n + '/' + h.cap); }
  }
  for (const s of g.stations) { if (!s) continue; for (const c in s.cargo) { const cs = s.cargo[c]; const sum = cs.wait.reduce((a, p) => a + p.n, 0); if (sum !== cs.n || cs.n < 0) bad.push('station cargo mismatch ' + s.name + ' ' + c + ' ' + sum + ' ' + cs.n); } }
  // occupancy matches trains on the map
  if (g.occ) {
    const occ = new Uint8Array(g.occ.length);
    for (const v of g.vehicles) if (v && v.kind === 'rail' && v.path && !v.inDepot) for (const s of v.path) occ[HL.Rail.key(g, s)]++;
    let diff = 0; for (let i = 0; i < occ.length; i++) if (occ[i] !== g.occ[i]) diff++;
    if (diff) bad.push('occupancy mismatch ' + diff);
  }
  if (bad.length) { console.log('day', day, 'INVARIANT', bad.slice(0, 5).join(' | ')); errors.push(...bad); }
}
let lastY = HL.ymd(g.date).y;
for (let day = 0; day < years * 365; day++) {
  for (let i = 0; i < HL.TICKS_PER_DAY; i++) HL.Game.step(g);
  if (day % 30 === 0) check(day);
  const y = HL.ymd(g.date).y;
  if (y !== lastY) {
    lastY = y;
    const cs = g.companies.filter(c => c && c.ai);
    const kinds = {}; for (const v of g.vehicles) if (v) kinds[v.kind] = (kinds[v.kind] || 0) + 1;
    console.log(y, 'veh', JSON.stringify(kinds), 'cos', cs.map(c => `${c.name.slice(0, 18)}${c.alive ? '' : '(dead)'}: £${Math.round(c.money / 1000)}k v${Math.round(c.value / 1000)}k p${c.ai.projects.length} e${c.ai.errors || 0}`).join(' | '), 'crashes', cs.reduce((a, c) => a + c.stats.crashes, 0), 'pop', g.towns.reduce((a, t) => a + (t ? t.pop : 0), 0), 'ind', g.industries.filter(Boolean).length, 'ms', Date.now() - t0);
  }
}
check('end');
if (g.over) errors.push('game ended early at ' + HL.ymd(g.date).y);
console.log('final year', HL.ymd(g.date).y);
console.log('done', years, 'years in', ((Date.now() - t0) / 1000).toFixed(1), 's; errors', errors.length);
if (errors.length) { console.log(errors.slice(0, 10).join('\n')); process.exit(1); }
