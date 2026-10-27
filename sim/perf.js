const HL = require('./load')();
const g = HL.Game.create({ w: 128, h: 128, seed: 'LONG2', climate: 'temperate', startYear: 1930, aiCount: 4 });
for (let d = 0; d < 365 * 3; d++) for (let i = 0; i < 60; i++) HL.Game.step(g);
console.log('vehicles', g.vehicles.filter(Boolean).length);
const t0 = Date.now();
for (let d = 0; d < 60; d++) for (let i = 0; i < 60; i++) HL.Game.step(g);
console.log('60 days ms', Date.now() - t0);
