const HL = require('./load')();
const g = HL.Game.create({ w: 128, h: 128, seed: process.argv[2] || 'LONG2', climate: 'temperate', startYear: 1930, aiCount: 3 });
for (let d = 0; d < 365 * 4; d++) for (let i = 0; i < 60; i++) HL.Game.step(g);
for (const c of g.companies) if (c && c.ai) {
  const y = c.fin.years[c.fin.years.length - 1];
  console.log(c.name, c.alive ? '' : 'DEAD', 'money', Math.round(c.money), 'loan', c.loan, 'last year', JSON.stringify(y && y.cats));
  const byKind = {};
  for (const v of g.vehicles) if (v && v.owner === c.id) { const k = v.kind + ':' + (v.holds[0] ? v.holds[0].c : '-'); const o = byKind[k] || (byKind[k] = { n: 0, p: 0, neg: 0, wait: 0 }); o.n++; o.p += v.profitLastYear; if (v.profitLastYear < 0) o.neg++; }
  for (const k in byKind) console.log('   ', k, 'n', byKind[k].n, 'avg profit', Math.round(byKind[k].p / byKind[k].n), 'neg', byKind[k].neg);
}
