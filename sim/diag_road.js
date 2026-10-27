const HL = require('./load')();
const g = HL.Game.create({ w: 96, h: 96, seed: 'LONG1', climate: 'temperate', startYear: 1930, aiCount: 2 });
for (let d = 0; d < +(process.argv[2]||250); d++) for (let i = 0; i < 60; i++) HL.Game.step(g);
const m = g.map;
const v = g.vehicles.find(v => v && v.kind === 'road' && v.lostSince);
if (!v) { console.log('no lost'); process.exit(); }
const tgt = HL.Veh.target(g, v);
const s = g.stations[tgt.id];
console.log('veh at seg', JSON.stringify(v.seg), 'tile', m.tx(v.seg.t), m.ty(v.seg.t), 'target', s.name, s.rect, 'fac', s.fac, 'bus?', HL.Veh.isBus(v));
// print road bits around target
const dump = (cx, cy, r) => { for (let y = cy - r; y <= cy + r; y++) { let row = ''; for (let x = cx - r; x <= cx + r; x++) { const t = m.t(x, y); const ty = m.type[t]; row += ty === 3 ? m.road[t].toString(16) : ty === 6 ? 'S' : ty === 7 ? 'D' : ty === 0 ? '.' : ty === 2 ? (m.road[t] ? 'x' : 'r') : ty === 4 ? 'h' : ty === 5 ? 'I' : ty === 1 ? '~' : '?'; } console.log(row); } };
dump(s.x, s.y, 6);
console.log('---- vehicle area');
dump(m.tx(v.seg.t), m.ty(v.seg.t), 6);
const opts = HL.Road.next(g, v, v.seg, tgt);
console.log('opts', JSON.stringify(opts));
const r = HL.Road.findRoute(g, v, opts, tgt, 50000);
console.log('route', r && r.length);
console.log('stop tile road bits', m.road[m.t(s.x, s.y)], 'kind', m.m1[m.t(s.x, s.y)] & 7);
// BFS over road connectivity from vehicle tile
const seen = new Set([v.seg.t]); const q = [v.seg.t];
while (q.length) { const t = q.pop(); const b = HL.Road.bitsAt(g, t); for (let d = 0; d < 4; d++) { if (!(b & (1 << d))) continue; const x = m.tx(t) + HL.DX[d], y = m.ty(t) + HL.DY[d]; const n = m.t(x, y); if (seen.has(n)) continue; const nb = HL.Road.bitsAt(g, n); if (nb & (1 << HL.opp(d))) { seen.add(n); q.push(n); } } }
console.log('reachable tiles', seen.size, 'stop reachable', seen.has(m.t(s.x, s.y)));
// find the frontier closest to the stop
let best = null; for (const t of seen) { const d = HL.manh(m.tx(t), m.ty(t), s.x, s.y); if (!best || d < best.d) best = { t, d }; }
console.log('closest reachable', m.tx(best.t), m.ty(best.t), 'dist', best.d, 'bits', HL.Road.bitsAt(g, best.t), 'type', m.type[best.t]);
dump(m.tx(best.t), m.ty(best.t), 4);
for (let d = 0; d < 4; d++) { const x = m.tx(best.t) + HL.DX[d], y = m.ty(best.t) + HL.DY[d]; const n = m.t(x, y); console.log('dir', d, 'nb type', m.type[n], 'bits', m.road[n], 'm1', m.m1[n], 'bridgeOver', m.bridgeOver[n]); }
