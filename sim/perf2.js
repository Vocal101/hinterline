const HL = require('./load')();
const g = HL.Game.create({ w: 128, h: 128, seed: 'LONG2', climate: 'temperate', startYear: 1930, aiCount: 4 });
for (let d = 0; d < 365 * 3; d++) for (let i = 0; i < 60; i++) HL.Game.step(g);
let calls = 0, fast = 0;
const orig = HL.Road.tick; HL.Road.tick = function (g, v) { calls++; const rc = v.rc; if (rc && rc.until > g.ticks && rc.seg === v.seg) fast++; return orig(g, v); };
const st = {};
for (let i = 0; i < 600; i++) { HL.Game.step(g); }
for (const v of g.vehicles) if (v && v.kind === 'road') { const k = v.state + (v.stopped ? 'S' : '') + (v.inDepot ? 'D' : '') + (v.broken ? 'B' : ''); st[k] = (st[k] || 0) + 1; }
console.log('calls/tick', calls / 600, 'fast frac', (fast / calls).toFixed(2), JSON.stringify(st));
const t0 = performance.now(); for (let i = 0; i < 600; i++) orig.call(null, g, g.vehicles.find(v => v && v.kind === 'road' && v.state === 'run')); console.log('single veh 600 ticks ms', (performance.now() - t0).toFixed(1));
