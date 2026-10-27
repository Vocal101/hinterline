// AI health report: node sim/ai_report.js [years] [seed] [startYear] [size]
const HL = require('./load')();
const years = +(process.argv[2] || 10), seed = process.argv[3] || 'AIR1', start = +(process.argv[4] || 1950), size = +(process.argv[5] || 128);
const g = HL.Game.create({ w: size, h: size, seed, climate: 'temperate', startYear: start, aiCount: 3 });
g.companies[g.player].alive = false;
const t0 = Date.now();
for (let y = 0; y < years; y++) {
  for (let d = 0; d < 365; d++) for (let i = 0; i < 60; i++) HL.Game.step(g);
  const line = g.companies.filter(c => c && c.ai).map(c => { const kinds = {}; for (const v of g.vehicles) if (v && v.owner === c.id) { const k = v.kind; kinds[k] = kinds[k] || [0, 0]; kinds[k][0]++; kinds[k][1] += v.profitLastYear; } return `${c.name.slice(0, 14)}${c.alive ? '' : '†'} £${Math.round(c.money / 1000)}k L${Math.round(c.loan / 1000)}k V${Math.round(c.value / 1000)}k ` + Object.entries(kinds).map(([k, [n, p]]) => `${k}${n}:${Math.round(p / n / 1000)}k`).join(' '); });
  console.log(HL.ymd(g.date).y, line.join(' | '));
}
console.log('ms', Date.now() - t0);
for (const c of g.companies) if (c && c.ai) console.log(c.name, JSON.stringify(c.ai.stats), 'persona', c.ai.persona);
