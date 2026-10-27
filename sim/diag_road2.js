const HL = require('./load')();
const g = HL.Game.create({ w: 96, h: 96, seed: 'LONG1', climate: 'temperate', startYear: 1930, aiCount: 2 });
for (let d = 0; d < 260; d++) for (let i = 0; i < 60; i++) HL.Game.step(g);
const m = g.map;
const vs = g.vehicles.filter(v => v && v.kind === 'road').slice(0, 6);
for (let k = 0; k < 8; k++) {
  for (let i = 0; i < 120; i++) HL.Game.step(g);
  console.log('--- day', g.date % 365);
  for (const v of vs) { const tgt = HL.Veh.target(g, v); console.log(v.id, v.state, 'spd', v.speed.toFixed(1), 'blk', v.blocked, 'tile', m.tx(v.seg ? v.seg.t : 0), m.ty(v.seg ? v.seg.t : 0), 'seg', v.seg && v.seg.k + ':' + v.seg.en + '>' + v.seg.ex, 'sd', v.sd && v.sd.toFixed(2), 'route', v.route ? v.route.length : null, 'tgt', tgt && g.stations[tgt.id] && g.stations[tgt.id].name, 'broken', v.broken, 'load', HL.Veh.loadText(v), 'goDepot', JSON.stringify(v.goDepot)); }
}
