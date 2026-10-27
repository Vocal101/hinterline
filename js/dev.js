// ?dev test harness: open index.html?dev and use the global T from the console / automation.
(function (root) {
  const HL = root.HL;
  if (typeof location === 'undefined' || !/[?&]dev\b/.test(location.search)) return;
  const errs = [];
  addEventListener('error', e => errs.push(String(e.error && e.error.stack || e.message)));
  addEventListener('unhandledrejection', e => errs.push('promise: ' + String(e.reason && e.reason.stack || e.reason)));
  const oe = console.error; console.error = function (...a) { errs.push(a.map(String).join(' ')); oe.apply(console, a); };
  const g = () => HL.G.g;
  const step = (n) => { for (let i = 0; i < n; i++) HL.Game.step(g()); };
  const T = root.T = {
    get errs() { return errs; },
    clearErrs() { errs.length = 0; },
    async fresh() {
      const srcs = Array.from(document.scripts).map(s => s.src).filter(Boolean).concat([location.origin + '/css/style.css', location.href]);
      await Promise.all(srcs.map(u => fetch(u, { cache: 'reload' })));
      location.reload();
    },
    newGame(o) { HL.G.startGame(HL.Game.create(Object.assign({ w: 96, h: 96, seed: 'DEV1', aiCount: 2, startYear: 1950 }, o || {})), true); g().dev = true; return T.state(); },
    money(n) { const c = g().companies[g().player]; c.money = n == null ? 1e7 : n; return c.money; },
    unlockAll() { g().unlockAll = true; return 'all vehicles, rail types and airports unlocked'; },
    year(y) { const d = HL.ymd(g().date); g().date = HL.dateFromYear(y) + (g().date - HL.dateFromYear(d.y)); return HL.fmtDate(g().date); },
    month(m) { const d = HL.ymd(g().date); g().date = HL.dateFromYear(d.y) + [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334][m]; return HL.fmtDate(g().date); },
    // run the simulation instantly (blocks); keep to ~60 days per call in automation
    sim(days) { const t0 = performance.now(); step((days || 1) * HL.TICKS_PER_DAY); return { date: HL.fmtDate(g().date), ms: Math.round(performance.now() - t0), vehicles: g().vehicles.filter(Boolean).length }; },
    speed(s) { HL.G.setSpeed(s); return s; },
    pause() { HL.G.togglePause(); return g().paused; },
    spawnIndustry(type) { const ind = HL.Ind.spawnRandom(g(), true, type); if (ind) HL.G.centerOn(ind.x + 1, ind.y + 1); return ind ? ind.name : 'no site'; },
    spawnTown() {
      const gg = g(); for (let k = 0; k < 400; k++) { const x = 6 + gg.rng.int(gg.map.W - 12), y = 6 + gg.rng.int(gg.map.H - 12); if (!HL.Towns.goodSite(gg, x, y)) continue; const tw = HL.Towns.found(gg, x, y, gg.rng, false); for (let i = 0; i < 25; i++) HL.Towns.growStep(gg, tw, true); HL.Towns.completeAll(gg, tw); HL.G.centerOn(x, y); return tw.name; }
      return 'no site';
    },
    growTown(id, n) { const tw = g().towns[id || 0]; for (let i = 0; i < (n || 20); i++) HL.Towns.growStep(g(), tw, true); HL.Towns.completeAll(g(), tw); return tw.pop; },
    night(on) { g().realTime = on === false ? 0 : 60 * 6 * 0.75; return 'ok'; },
    weather(kind) { const w = g().weather; w.until = g().date + 10; w.snowy = kind === 'snow'; w.target = kind ? 1 : 0; w.storm = kind === 'storm'; if (kind === 'snow') w.snowfall = 1; else if (kind) w.rain = 1; else { w.rain = 0; w.snowfall = 0; } return kind; },
    goto(x, y, z) { HL.G.snapTo(x, y); if (z) HL.R.cam.z = HL.G.zoomTarget = z; return [x, y]; },
    gotoTown(i) { const t = g().towns[i || 0]; return T.goto(t.x, t.y); },
    gotoInd(type) { const i = g().industries.find(x => x && (!type || x.type === type)); if (i) T.goto(i.x + i.w / 2, i.y + i.h / 2); return i && i.name; },
    // build a working coal (or other) railway for the player with the AI planner
    autoRail(cargo) {
      const gg = g(), c = gg.companies[gg.player];
      c.money = Math.max(c.money, 2e6);
      const saveAI = c.ai;
      c.ai = { projects: [], w: {} };
      const ok = HL.AI.buildRailRoute(gg, c, 2e6);
      const p = c.ai.projects[0];
      c.ai = saveAI;
      if (!ok || !p) return 'failed';
      const s = gg.stations[p.stA]; HL.G.centerOn(s.x, s.y);
      return 'built ' + p.cargo + ' line ' + gg.stations[p.stA].name + ' -> ' + gg.stations[p.stB].name;
    },
    autoRoad() { const gg = g(), c = gg.companies[gg.player]; c.money = Math.max(c.money, 1e6); const save = c.ai; c.ai = { projects: [], w: {} }; const ok = HL.AI.buildTruckRoute(gg, c, 1e6) || HL.AI.buildBusRoute(gg, c, 1e6); const p = c.ai.projects[0]; c.ai = save; return ok && p ? 'built ' + p.kind + ' ' + gg.stations[p.stA].name : 'failed'; },
    autoAir() { const gg = g(), c = gg.companies[gg.player]; c.money = Math.max(c.money, 3e6); const save = c.ai; c.ai = { projects: [], w: {} }; const ok = HL.AI.buildAirRoute(gg, c, 3e6); const p = c.ai.projects[0]; c.ai = save; return ok && p ? 'built air ' + gg.stations[p.stA].name : 'failed'; },
    autoShip() { const gg = g(), c = gg.companies[gg.player]; c.money = Math.max(c.money, 3e6); const save = c.ai; c.ai = { projects: [], w: {} }; const ok = HL.AI.buildShipRoute(gg, c, 3e6); const p = c.ai.projects[0]; c.ai = save; return ok && p ? 'built ship ' + gg.stations[p.stA].name : 'failed'; },
    follow(kind) { const v = g().vehicles.find(x => x && !x.inDepot && (!kind || x.kind === kind)); if (v) { HL.G.followVeh = v.id; HL.R.cam.z = HL.G.zoomTarget = 1.6; } return v && HL.Veh.displayName(v); },
    state() {
      const gg = g(); if (!gg) return null;
      const c = gg.companies[gg.player];
      const kinds = {}; for (const v of gg.vehicles) if (v) kinds[v.kind] = (kinds[v.kind] || 0) + 1;
      return { date: HL.fmtDate(gg.date), money: Math.round(c.money), loan: c.loan, value: c.value, perf: c.perf, vehicles: kinds, companies: gg.companies.filter(Boolean).length, towns: gg.towns.length, frameMs: +HL.R.stats.frameMs.toFixed(1), sprites: HL.Gfx.spriteStats(), errs: errs.length, demo: !!gg.demo };
    },
    // long simulation in slices so the page stays responsive; check T.longResult
    longSim(years, check) {
      T.longResult = { running: true, years: 0, issues: [] };
      const target = g().date + (years || 10) * 365;
      const slice = () => {
        const t0 = performance.now();
        while (performance.now() - t0 < 120 && g().date < target) step(HL.TICKS_PER_DAY);
        const issues = T.invariants();
        if (issues.length) T.longResult.issues.push(...issues.slice(0, 5));
        T.longResult.date = HL.fmtDate(g().date);
        if (g().date < target && T.longResult.issues.length < 20) setTimeout(slice, 0); else T.longResult.running = false;
      };
      slice();
      return 'started';
    },
    invariants() {
      const gg = g(), bad = [];
      for (const c of gg.companies) if (c && (!isFinite(c.money) || !isFinite(c.value))) bad.push('company NaN ' + c.name);
      for (const v of gg.vehicles) { if (!v) continue; if (!isFinite(v.px) || !isFinite(v.py)) bad.push('vehicle pos NaN ' + v.id); for (const h of v.holds) if (h.n < 0 || h.n > h.cap) bad.push('hold ' + v.id); }
      for (const s of gg.stations) if (s) for (const k in s.cargo) if (s.cargo[k].n < 0) bad.push('station cargo ' + s.name);
      return bad;
    },
    async save(slot) { await HL.Save.toSlot(g(), slot || 'devtest', 'dev test'); return 'saved'; },
    async load(slot) { await HL.G.loadSlot(slot || 'devtest'); return T.state(); },
    // render frames directly (the rAF loop is throttled when the preview pane is hidden)
    frames(n, stepMs) {
      n = n || 1; stepMs = stepMs || 33;
      let t = performance.now();
      for (let i = 0; i < n; i++) {
        t += stepMs;
        if (!g().paused) for (let k = 0; k < Math.round(stepMs / 33); k++) HL.Game.step(g());
        const G2 = HL.G; if (G2.camTarget) { HL.R.cam.x = G2.camTarget[0]; HL.R.cam.y = G2.camTarget[1]; }
        HL.R.cam.z = G2.zoomTarget;
        HL.R.bakeAll = true; HL.R.frame(t); HL.R.bakeAll = false;
      }
      HL.UI.updateStatus(); HL.UI.refreshAll();
      return HL.R.stats.frameMs.toFixed(1) + 'ms';
    },
    // synthetic mouse input on the map at a tile (u,v inside the tile), exercising the real handlers
    tileXY(x, y, u, v) { const m = g().map; const fx = x + (u == null ? 0.5 : u), fy = y + (v == null ? 0.5 : v); return HL.R.tileToScreen(fx, fy, m.heightAt(fx, fy)); },
    mouse(type, sx, sy, btn, mods) {
      const ev = new PointerEvent(type, Object.assign({ clientX: sx, clientY: sy, button: btn || 0, buttons: type === 'pointerup' ? 0 : 1, bubbles: true, pointerId: 1 }, mods || {}));
      (type === 'pointerdown' ? HL.R.canvas : window).dispatchEvent(ev);
    },
    click(x, y, u, v, mods) { const [sx, sy] = T.tileXY(x, y, u, v); T.mouse('pointermove', sx, sy, 0, mods); T.mouse('pointerdown', sx, sy, 0, mods); T.mouse('pointerup', sx, sy, 0, mods); return [sx, sy]; },
    drag(x0, y0, x1, y1, u0, v0, u1, v1, mods) {
      const a = T.tileXY(x0, y0, u0, v0), b = T.tileXY(x1, y1, u1, v1);
      T.mouse('pointermove', a[0], a[1], 0, mods); T.mouse('pointerdown', a[0], a[1], 0, mods);
      for (let i = 1; i <= 6; i++) T.mouse('pointermove', a[0] + (b[0] - a[0]) * i / 6, a[1] + (b[1] - a[1]) * i / 6, 0, mods);
      T.mouse('pointerup', b[0], b[1], 0, mods);
      return [a, b];
    },
    // drive every construction tool through the real input handlers and report what worked
    toolTest(seed) {
      T.newGame({ seed: seed || 'TOOLS1', startYear: 1965, terrain: 2, sea: 2, w: 96, h: 96, aiCount: 0 }); T.money(2e7);
      const gg = g(), m = gg.map, cid = gg.player, T2 = HL.T, R = {};
      const pal = (k, id) => { if (!HL.UI.isOpen('build-' + k)) HL.UI.tb('build:' + k); document.querySelector('[data-win="build-' + k + '"] [data-v="' + id + '"]').click(); };
      const look = (x, y) => { HL.G.snapTo(x, y); HL.R.cam.z = HL.G.zoomTarget = 1; T.frames(1); };
      const clear = (x, y) => m.inside(x, y) && m.type[m.t(x, y)] === T2.CLEAR;
      const scan = (fn) => { for (let y = 10; y < m.H - 10; y++) for (let x = 10; x < m.W - 10; x++) { const r = fn(x, y); if (r) return r; } return null; };
      const spend0 = gg.companies[cid].money;
      // road, stops, depot, bus
      const row = scan((x, y) => { for (let i = 0; i < 7; i++) if (!clear(x + i, y) || m.tileMin(x + i, y) === 0) return null; for (let i = -1; i < 8; i++) for (let j = 1; j <= 2; j++) if (!clear(x + i, y + j) || m.tileMin(x + i, y + j) === 0) return null; return [x, y]; });
      look(row[0] + 3, row[1]); pal('road', 'road'); T.drag(row[0], row[1], row[0] + 6, row[1]);
      R.road = [1, 2, 3, 4, 5].every(i => m.road[m.t(row[0] + i, row[1])] === 10);
      pal('road', 'busstop'); T.click(row[0] + 1, row[1]); T.click(row[0] + 5, row[1]);
      R.busStops = [1, 5].every(i => m.type[m.t(row[0] + i, row[1])] === T2.STATION);
      pal('road', 'roaddepot'); T.click(row[0] + 3, row[1] + 1);
      const rd = gg.depots.find(d => d && d.kind === 1);
      R.roadDepot = !!rd && (m.road[m.t(row[0] + 3, row[1])] & 4) > 0;
      if (rd) {
        const b = HL.Veh.buy(gg, cid, rd.id, HL.AIBuild.bestRoadVeh(gg, 'pax').id);
        HL.Tools.startOrders(b.v.id); T.click(row[0] + 1, row[1]); T.click(row[0] + 5, row[1]); HL.Tools.cancel();
        b.v.stopped = false; T.sim(20);
        R.busRuns = !b.v.inDepot && HL.Veh.orderList(gg, b.v).length === 2;
        R.busVisited = !!(gg.stations[m.idx[m.t(row[0] + 1, row[1])]].cargo.pax || {}).everPicked;
      }
      // rail across hills: a straight run with height changes
      const hill = scan((x, y) => { let lo = 99, hi = 0; for (let i = 0; i < 12; i++) { if (!clear(x + i, y)) return null; lo = Math.min(lo, m.tileMin(x + i, y)); hi = Math.max(hi, m.tileMax(x + i, y)); } return hi - lo >= 2 && lo > 0 ? [x, y] : null; });
      R.hillFound = !!hill;
      if (hill) {
        look(hill[0] + 6, hill[1]); pal('rail', 'rail'); T.drag(hill[0], hill[1], hill[0] + 11, hill[1], 0.2, 0.5, 0.2, 0.5);
        R.railSlopes = [...Array(12).keys()].every(i => m.rail[m.t(hill[0] + i, hill[1])] & 1);
        pal('rail', 'signal'); T.click(hill[0] + 2, hill[1], 0.3, 0.5);
        const k = m.t(hill[0] + 2, hill[1]) * 6;
        R.signal = gg.signals.has(k); const d0 = gg.signals.get(k) && gg.signals.get(k).dir;
        T.click(hill[0] + 2, hill[1], 0.3, 0.5); R.signalCycle = !!gg.signals.get(k) && gg.signals.get(k).dir !== d0;
        T.drag(hill[0] + 4, hill[1], hill[0] + 11, hill[1], 0.3, 0.5, 0.5, 0.5);
        R.signalDrag = gg.signals.size >= 3;
        T.click(hill[0] + 2, hill[1], 0.3, 0.5, { ctrlKey: true }); R.signalRemove = !gg.signals.has(k);
        HL.Tools.opt.rt = 1; pal('rail', 'convert'); T.drag(hill[0], hill[1], hill[0] + 11, hill[1]); HL.Tools.opt.rt = 0;
        R.convert = m.rtype[m.t(hill[0] + 5, hill[1])] === 1;
        pal('rail', 'rail'); HL.Tools.opt.rt = 1; T.click(hill[0] + 7, hill[1], 0.2, 0.5, { ctrlKey: true }); HL.Tools.opt.rt = 0; R.railRemove = !(m.rail[m.t(hill[0] + 7, hill[1])] & 1);
      }
      // bridge over water
      const br = scan((x, y) => { if (!clear(x, y)) return null; for (let L = 2; L <= 5; L++) { let water = true; for (let i = 1; i <= L; i++) if (!m.inside(x + i, y) || m.type[m.t(x + i, y)] !== T2.WATER) water = false; if (!water) continue; if (!clear(x + L + 1, y)) continue; if (HL.Build.buildBridge(gg, cid, x, y, x + L + 1, y, 'rail', 2, 0, false).ok) return [x, y, x + L + 1, y]; } return null; });
      R.bridgeSite = !!br;
      if (br) {
        look(br[0] + 2, br[1]); pal('rail', 'bridge'); T.drag(br[0], br[1], br[2], br[3]);
        const pick = document.querySelector('[data-win="bridge"] [data-a="pick"]'); R.bridgePicker = !!pick;
        if (pick) pick.click();
        R.bridge = gg.bridges.some(b => b && b.owner === cid);
      }
      // tunnel
      const tn = scan((x, y) => (clear(x, y) && HL.Build.planTunnel(gg, x, y).ok && HL.Build.buildTunnel(gg, cid, x, y, 'rail', 0, false).ok) ? [x, y] : null);
      R.tunnelSite = !!tn;
      if (tn) { look(tn[0], tn[1]); pal('rail', 'tunnel'); T.click(tn[0], tn[1]); R.tunnel = gg.tunnels.some(t => t && t.owner === cid); }
      // water: dock, buoy, shipyard
      const dk = scan((x, y) => clear(x, y) && HL.Stations.buildDock(gg, cid, x, y, false).ok ? [x, y] : null);
      if (dk) { look(dk[0], dk[1]); pal('water', 'dock'); T.click(dk[0], dk[1]); R.dock = m.type[m.t(dk[0], dk[1])] === T2.STATION; }
      const wt = scan((x, y) => { for (let dy = -1; dy <= 2; dy++) for (let dx = -1; dx <= 2; dx++) if (!m.inside(x + dx, y + dy) || m.type[m.t(x + dx, y + dy)] !== T2.WATER) return null; return dk && HL.manh(x, y, dk[0], dk[1]) < 30 ? [x, y] : null; });
      if (wt) { look(wt[0], wt[1]); pal('water', 'buoy'); T.click(wt[0], wt[1]); R.buoy = gg.stations.some(s => s && s.buoy); pal('water', 'shipdepot'); T.click(wt[0] + 1, wt[1] + 1); R.shipDepot = gg.depots.some(d => d && d.kind === 2); }
      // airport
      HL.UI.tb('build:air');
      const ap = scan((x, y) => HL.Stations.buildAirport(gg, cid, x, y, 'city', false).ok ? [x, y] : null);
      if (ap) { look(ap[0] + 3, ap[1] + 2); document.querySelector('[data-win="build-air"] [data-v="city"]').click(); T.click(ap[0], ap[1]); R.airport = gg.stations.some(s => s && s.airport); }
      // landscaping
      const lt = scan((x, y) => { let lo = 99, hi = 0; for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { if (!clear(x + dx, y + dy) || m.tileMin(x + dx, y + dy) === 0) return null; lo = Math.min(lo, m.tileMin(x + dx, y + dy)); hi = Math.max(hi, m.tileMax(x + dx, y + dy)); } return hi - lo === 1 ? [x, y] : null; });
      look(lt[0], lt[1]);
      const h0 = m.ch(lt[0], lt[1]);
      pal('land', 'raise'); T.click(lt[0], lt[1], 0.1, 0.1); R.raise = m.ch(lt[0], lt[1]) === h0 + 1;
      pal('land', 'lower'); T.click(lt[0], lt[1], 0.1, 0.1); R.lower = m.ch(lt[0], lt[1]) === h0;
      pal('land', 'level'); T.drag(lt[0] - 2, lt[1] - 2, lt[0] + 2, lt[1] + 2, 0.1, 0.1, 0.5, 0.5);
      let flat = true; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (!m.isFlat(lt[0] + dx, lt[1] + dy)) flat = false; R.level = flat;
      const tr0 = m.trees[m.t(lt[0], lt[1])] & 7;
      pal('land', 'trees'); T.drag(lt[0] - 1, lt[1] - 1, lt[0] + 1, lt[1] + 1); R.trees = (m.trees[m.t(lt[0], lt[1])] & 7) > tr0;
      pal('land', 'demolish'); T.drag(lt[0] - 1, lt[1] - 1, lt[0] + 1, lt[1] + 1); R.demolish = (m.trees[m.t(lt[0], lt[1])] & 7) === 0;
      pal('land', 'hq'); T.click(lt[0], lt[1]); R.hq = gg.companies[cid].hq != null;
      HL.UI.tb('tool:query'); T.click(row[0], row[1]); R.query = HL.UI.isOpen('land');
      HL.Tools.cancel();
      R.spent = Math.round(spend0 - gg.companies[cid].money);
      R.errs = errs.slice(0, 5);
      R.toasts = [...document.querySelectorAll('.toast')].map(e => e.innerText);
      return R;
    },
    perf() { return Object.assign({}, HL.R.stats, { sprites: HL.Gfx.spriteStats(), chunks: HL.R.chunks.size, chunkMB: (HL.R.chunkBytes / 1048576).toFixed(0) }); },
  };
})(typeof window !== 'undefined' ? window : globalThis);
