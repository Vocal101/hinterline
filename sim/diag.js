const HL = require('./load')();
const g = HL.Game.create({ w: 96, h: 96, seed: process.argv[2] || 'LONG1', climate: 'temperate', startYear: 1930, aiCount: 2 });
const days = +(process.argv[3] || 500);
const prof = {};
const wrap = (obj, name, label) => { const f = obj[name]; obj[name] = function (...a) { const t = performance.now(); try { return f.apply(this, a); } finally { prof[label] = (prof[label] || 0) + performance.now() - t; } }; };
wrap(HL.Rail, 'tick', 'rail'); wrap(HL.Road, 'tick', 'road'); wrap(HL.Air, 'tick', 'air'); wrap(HL.Ship, 'tick', 'ship');
wrap(HL.Rail, 'findRoute', 'railA*'); wrap(HL.Road, 'findRoute', 'roadA*'); wrap(HL.AI, 'think', 'ai'); wrap(HL.Game, 'tileLoop', 'tiles'); wrap(HL.Ind, 'tick', 'ind');
wrap(HL.Stations, 'daily', 'stations'); wrap(HL.Veh, 'daily', 'vehDaily');
const t0 = Date.now();
for (let d = 0; d < days; d++) for (let i = 0; i < 60; i++) HL.Game.step(g);
console.log('ms', Date.now() - t0, JSON.stringify(Object.fromEntries(Object.entries(prof).map(([k, v]) => [k, Math.round(v)]))));
for (const v of g.vehicles) if (v) console.log(v.owner, v.kind, HL.VEH[v.model].name.slice(0, 22).padEnd(22), 'st', (v.state + '/' + (v.airState || '')).padEnd(12), 'age', v.age, 'profit', Math.round(v.profitThisYear), Math.round(v.profitLastYear), 'load', HL.Veh.loadText(v), 'lost', v.lostSince || 0, 'brk', v.breakdowns, 'oi', v.oi, 'stop', v.stopped);
for (const c of g.companies) if (c) { console.log(c.name, 'money', Math.round(c.money), 'loan', c.loan, JSON.stringify(c.fin.cur)); if (c.ai) for (const p of c.ai.projects) console.log('  ', p.kind, p.cargo, g.stations[p.stA] && g.stations[p.stA].name, '->', g.stations[p.stB] && g.stations[p.stB].name, 'waitA', g.stations[p.stA] && HL.Stations.waiting(g.stations[p.stA], p.cargo)); }
