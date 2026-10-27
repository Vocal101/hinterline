// Map interaction: camera, picking, construction tools with previews, map labels.
(function (root) {
  const HL = root.HL, R = HL.R, Gx = HL.Gfx, UI = HL.UI;
  const T = HL.T;
  const Tools = HL.Tools = {};
  const g = () => HL.G.g;
  const B = HL.Build, S = HL.Stations;

  Tools.cur = null;
  Tools.opt = { rt: 0, plat: 2, len: 4, axis: 0, sigType: 0, density: 4, airport: 'strip', remove: false, depotDir: 1, stopAxis: 0, showCatch: true, treeSpec: null, bridgeType: null };
  const mouse = Tools.mouse = { sx: 0, sy: 0, tile: null, down: false, btn: -1, start: null, panning: false, moved: 0, ctrl: false, shift: false };

  // ---------- tool selection ----------
  Tools.set = function (id, o) {
    if (Tools.cur === id && !o) { Tools.cancel(); return; }
    Tools.cur = id;
    if (o) Object.assign(Tools.opt, o);
    mouse.start = null;
    UI.$$('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === id));
    R.canvas.style.cursor = id ? 'crosshair' : 'default';
    HL.emit('tool', id);
  };
  Tools.cancel = function () {
    Tools.cur = null; mouse.start = null; Tools.orderFor = null;
    UI.$$('[data-tool]').forEach(b => b.classList.remove('on'));
    R.canvas.style.cursor = 'default';
    showCost(null);
    HL.emit('tool', null);
  };
  const removing = () => Tools.opt.remove || mouse.ctrl;

  // ---------- input ----------
  Tools.attach = function (cv) {
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('pointerdown', onDown);
    addEventListener('pointermove', onMove);
    addEventListener('pointerup', onUp);
    cv.addEventListener('wheel', onWheel, { passive: false });
    cv.addEventListener('dblclick', (e) => { if (!Tools.cur) { const t = R.pick(e.clientX, e.clientY); if (t) HL.G.zoomTo(Math.min(2, R.cam.z * 1.6), e.clientX, e.clientY); } });
  };
  function onWheel(e) {
    e.preventDefault();
    const f = Math.pow(1.0015, -e.deltaY * (e.deltaMode === 1 ? 30 : 1));
    HL.G.zoomTo(HL.clamp(HL.G.zoomTarget * f, 0.125, 4), e.clientX, e.clientY);
  }
  function onDown(e) {
    mouse.sx = e.clientX; mouse.sy = e.clientY; mouse.ctrl = e.ctrlKey || e.metaKey; mouse.shift = e.shiftKey;
    mouse.btn = e.button; mouse.moved = 0; mouse.down = true;
    mouse.downAt = [e.clientX, e.clientY];
    if (e.button === 2 || e.button === 1 || (e.button === 0 && !Tools.cur)) { mouse.panning = true; mouse.panFrom = [e.clientX, e.clientY]; HL.G.followVeh = null; return; }
    if (e.button === 0 && Tools.cur) {
      const t = R.pick(e.clientX, e.clientY);
      if (!t) return;
      mouse.start = { x: t.x, y: t.y, u: t.u, v: t.v, piece: pickPiece(t.u, t.v), sx: e.clientX, sy: e.clientY };
      toolDown(t);
    }
  }
  function onMove(e) {
    mouse.sx = e.clientX; mouse.sy = e.clientY; mouse.ctrl = e.ctrlKey || e.metaKey; mouse.shift = e.shiftKey;
    if (mouse.panning && mouse.down) {
      const dx = e.clientX - mouse.panFrom[0], dy = e.clientY - mouse.panFrom[1];
      mouse.moved += Math.abs(dx) + Math.abs(dy);
      R.cam.x -= dx / R.cam.z; R.cam.y -= dy / R.cam.z;
      mouse.panFrom = [e.clientX, e.clientY];
      return;
    }
    if (e.target !== R.canvas && !mouse.down) { mouse.tile = null; return; }
    mouse.tile = R.pick(e.clientX, e.clientY);
    if (mouse.start && mouse.down) mouse.moved += 1;
    updateCost();
    if (!Tools.cur && !mouse.down) hoverTip(e);
  }
  function onUp(e) {
    const wasPan = mouse.panning, moved = mouse.moved;
    mouse.down = false; mouse.panning = false;
    if (wasPan) {
      if (moved < 6 && mouse.btn === 0 && !Tools.cur) clickSelect(e.clientX, e.clientY);
      if (moved < 6 && mouse.btn === 2 && Tools.cur) Tools.cancel();
      return;
    }
    if (mouse.start && Tools.cur && mouse.btn === 0) { const t = R.pick(e.clientX, e.clientY) || mouse.tile; if (t) toolUp(t); }
    mouse.start = null;
    showCost(null);
  }

  // ---------- clicking things ----------
  Tools.vehicleAt = function (sx, sy) {
    let best = null, bd = 18 * 18;
    const consider = (it, z) => {
      const v = it.v;
      const px = it.car ? it.car.px : v.px, py = it.car ? it.car.py : v.py, pz = it.car ? it.car.pz : v.pz;
      const p = R.tileToScreen(px, py, pz + (v.kind === 'air' ? 0.5 : 0.6));
      const d = (p[0] - sx) ** 2 + (p[1] - sy) ** 2;
      if (d < bd) { bd = d; best = v; }
    };
    for (const list of R.vehicleBuckets.values()) for (const it of list) if (!it.shadowOnly) consider(it);
    for (const v of HL.Vis.airborne) consider({ v });
    return best;
  };
  function clickSelect(sx, sy) {
    const gg = g();
    // labels first
    for (const L of Tools.labels) if (sx >= L.x0 && sx <= L.x1 && sy >= L.y0 && sy <= L.y1) { if (L.town != null) HL.W.town(L.town); else if (L.st != null) HL.W.station(L.st); return; }
    const v = Tools.vehicleAt(sx, sy);
    if (v) { HL.W.vehicle(v.id); return; }
    const t = R.pick(sx, sy);
    if (!t) return;
    const m = gg.map, ti = m.t(t.x, t.y), ty = m.type[ti];
    if (ty === T.STATION) { const s = gg.stations[m.idx[ti]]; if (s) { if (s.rig != null) HL.W.industry(s.rig); else HL.W.station(s.id); } return; }
    if (ty === T.DEPOT) { const d = gg.depots[m.idx[ti]]; if (d && d.owner === gg.player) HL.W.depot(d.id); else HL.W.landInfo(t.x, t.y); return; }
    if (ty === T.IND) { HL.W.industry(m.idx[ti]); return; }
    if (ty === T.HOUSE) { HL.W.town(m.idx[ti]); return; }
    if (ty === T.OBJECT) { const o = gg.objects[m.idx[ti]]; if (o && o.kind === 'hq') HL.W.company(o.owner); else if (o && o.town != null) HL.W.town(o.town); return; }
    if (ty === T.ROAD && m.rowner[ti] === HL.OWNER_TOWN) { const tw = B.closestTown(gg, t.x, t.y); if (tw) HL.W.town(tw.id); return; }
  }
  function hoverTip(e) {
    const v = Tools.vehicleAt(e.clientX, e.clientY);
    if (v) { UI.showTipAt(`<b>${UI.esc(HL.Veh.displayName(v))}</b><br>${UI.esc(HL.VEH[v.model].name)}<br><span class="dim">${HL.W.vehStatus(v)}</span>`, e.clientX, e.clientY); return; }
    UI.showTipAt(null);
  }

  // ---------- piece picking (autorail) ----------
  function pickPiece(u, v) {
    if (u + v < 0.38) return 2;
    if (u - v > 0.62) return 3;
    if (u + v > 1.62) return 4;
    if (v - u > 0.62) return 5;
    return Math.abs(v - 0.5) < Math.abs(u - 0.5) ? 0 : 1;
  }
  Tools.pickPiece = pickPiece;
  // pieces from a drag, OpenTTD style
  function railLine(st, x1, y1) {
    const out = [];
    const dx = x1 - st.x, dy = y1 - st.y;
    let p = st.piece;
    if (dx === 0 && dy === 0) return [[st.x, st.y, p]];
    const adx = Math.abs(dx), ady = Math.abs(dy);
    if (p <= 1 || adx > ady * 2 || ady > adx * 2) {
      if (adx >= ady) { const s = Math.sign(dx); for (let i = 0; i <= adx; i++) out.push([st.x + s * i, st.y, 0]); }
      else { const s = Math.sign(dy); for (let i = 0; i <= ady; i++) out.push([st.x, st.y + s * i, 1]); }
      return out;
    }
    // diagonal: E/W pieces run down/up the screen, N/S run across it
    const sdx = Math.sign(dx), sdy = Math.sign(dy);
    const vertical = sdx === sdy;
    if (vertical && (p === 2 || p === 4)) p = 3;
    if (!vertical && (p === 3 || p === 5)) p = 2;
    let x = st.x, y = st.y;
    const steps = adx + ady;
    for (let i = 0; i <= steps; i++) {
      out.push([x, y, p]);
      if (vertical) {
        const down = sdx > 0;
        if (p === 3) { if (down) x++; else y--; p = 5; }
        else { if (down) y++; else x--; p = 3; }
      } else {
        const right = sdx > 0;
        if (p === 2) { if (right) y--; else x--; p = 4; }
        else { if (right) x++; else y++; p = 2; }
      }
    }
    return out;
  }
  function straightLine(st, x1, y1) {
    const dx = x1 - st.x, dy = y1 - st.y, out = [];
    if (Math.abs(dx) >= Math.abs(dy)) { const s = Math.sign(dx) || 1; for (let i = 0; i <= Math.abs(dx); i++) out.push([st.x + s * i, st.y]); return { tiles: out, axis: 0, dir: dx >= 0 ? 1 : 3 }; }
    const s = Math.sign(dy); for (let i = 0; i <= Math.abs(dy); i++) out.push([st.x, st.y + s * i]); return { tiles: out, axis: 1, dir: dy >= 0 ? 2 : 0 };
  }
  function rectOf(a, b) { return [Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x, b.x), Math.max(a.y, b.y)]; }
  // corner nearest to the mouse
  function cornerOf(t) { return [t.x + (t.u > 0.5 ? 1 : 0), t.y + (t.v > 0.5 ? 1 : 0)]; }

  // ---------- footprints ----------
  function stationRect(t) {
    const o = Tools.opt;
    const w = o.axis === 0 ? o.len : o.plat, h = o.axis === 0 ? o.plat : o.len;
    return { x: t.x, y: t.y, w, h };
  }
  function airportRect(t) { const at = S.airportType(Tools.opt.airport); return { x: t.x, y: t.y, w: at.w, h: at.h }; }
  function autoDepotDir(t, kind) {
    const m = g().map;
    for (let d = 0; d < 4; d++) {
      const nx = t.x + HL.DX[d], ny = t.y + HL.DY[d];
      if (!m.inside(nx, ny)) continue;
      const n = m.t(nx, ny);
      if (kind === 0 && (m.type[n] === T.RAIL || HL.Stations.isRail(m, n)) && m.owner[n] === g().player) return d;
      if (kind === 1 && (m.type[n] === T.ROAD || (m.type[n] === T.STATION && m.road[n]))) return d;
      if (kind === 2 && m.type[n] === T.WATER) return d;
    }
    return Tools.opt.depotDir;
  }

  // ---------- actions ----------
  function tileScreen(x, y) { return R.tileToScreen(x + 0.5, y + 0.5); }
  function dust(x, y, n) { if (HL.Fx) for (let i = 0; i < (n || 4); i++) HL.Fx.puff(x + Math.random(), y + Math.random(), g().map.heightAt(x + 0.5, y + 0.5) * Gx.LEVEL + 0.05, 'dust', 1.5); }
  function runMany(list, fn, o) {
    // execute a sequence of single-tile commands; stop at the first real error
    const gg = g(), cid = gg.player;
    let total = 0, n = 0, err = null;
    for (const it of list) {
      const t = fn(it, false);
      if (!t.ok) { if (t.err === 'Already built' || t.err === 'Already clear' || t.err === 'Already this rail type') continue; err = t.err; break; }
      if (gg.companies[cid].money < t.cost) { err = 'Not enough money'; break; }
      const r = fn(it, true);
      if (!r.ok) { err = r.err; break; }
      HL.Game.spend(gg, cid, o && o.cat || 'construction', r.cost); total += r.cost; n++;
      if (o && o.dust) dust(it[0], it[1], 2);
    }
    if (err && (!n || !(o && o.quietPartial))) UI.toast(err);
    if (n && HL.Audio) HL.Audio.build(o && o.sound || 'rail');
    if (total) UI.cashPop(-total, mouse.sx, mouse.sy);
    return { n, total, err };
  }
  function toolDown(t) {
    const id = Tools.cur;
    if (id === 'signal') return;
  }
  function toolUp(t) {
    const gg = g(), cid = gg.player, o = Tools.opt, st = mouse.start;
    const m = gg.map;
    switch (Tools.cur) {
      case 'rail': {
        const line = railLine(st, t.x, t.y);
        if (removing()) runMany(line, (it, ex) => B.removeRail(gg, cid, it[0], it[1], it[2], ex), { sound: 'demolish' });
        else runMany(line, (it, ex) => B.buildRail(gg, cid, it[0], it[1], it[2], o.rt, ex), { sound: 'rail', dust: true });
        break;
      }
      case 'road': {
        const L = straightLine(st, t.x, t.y);
        const tiles = L.tiles.map((p, i) => { let b = 0; if (i > 0) b |= 1 << HL.opp(L.dir); if (i < L.tiles.length - 1) b |= 1 << L.dir; if (L.tiles.length === 1) b = L.axis === 0 ? 10 : 5; if (L.tiles.length === 1 && (st.u - 0.5) ** 2 < (st.v - 0.5) ** 2) b = 10; else if (L.tiles.length === 1) b = 5; return [p[0], p[1], b]; });
        if (removing()) runMany(tiles, (it, ex) => B.removeRoad(gg, cid, it[0], it[1], it[2], ex), { sound: 'demolish' });
        else runMany(tiles, (it, ex) => B.buildRoad(gg, cid, it[0], it[1], it[2], ex), { sound: 'road', dust: true });
        break;
      }
      case 'station': { const r = stationRect(t); UI.cmd(ex => S.buildRail(gg, cid, r.x, r.y, o.axis, o.plat, o.len, o.rt, ex), { at: [mouse.sx, mouse.sy], sound: 'station' }); for (let i = 0; i < 3; i++) dust(r.x + i, r.y); break; }
      case 'depot': {
        const dir = autoDepotDir(t, 0);
        const r = UI.cmd(ex => B.buildDepot(gg, cid, t.x, t.y, 0, dir, o.rt, ex), { at: [mouse.sx, mouse.sy], sound: 'station' });
        if (r.ok) { connectDepotRail(gg, cid, t.x, t.y, dir, o.rt); dust(t.x, t.y, 6); }
        break;
      }
      case 'signal': {
        const line = Tools.signalPlan(st, t);
        if (!line.length) break;
        if (line.length === 1 && mouse.moved < 4) {
          const [x, y, p] = line[0];
          const k = m.t(x, y) * 6 + p;
          const ex = gg.signals.get(k);
          if (removing() && ex) { UI.cmd(e2 => B.removeSignal(gg, cid, x, y, p, e2), { sound: 'demolish' }); break; }
          if (ex && ex.type === o.sigType) {
            const nd = o.sigType === 0 ? (ex.dir + 1) % 3 : 1 - ex.dir;
            UI.cmd(e2 => B.buildSignal(gg, cid, x, y, p, o.sigType, nd, e2), { sound: 'signal' });
          } else UI.cmd(e2 => B.buildSignal(gg, cid, x, y, p, o.sigType, o.sigType === 0 ? 2 : line[0][3], e2), { sound: 'signal' });
        } else runMany(line, (it, ex) => removing() ? B.removeSignal(gg, cid, it[0], it[1], it[2], ex) : B.buildSignal(gg, cid, it[0], it[1], it[2], o.sigType, it[3], ex), { sound: 'signal', quietPartial: true });
        break;
      }
      case 'bridge': case 'roadbridge': {
        if (st.x === t.x && st.y === t.y) { UI.toast('Drag from one side of the gap to the other'); break; }
        HL.W.bridgePicker(st.x, st.y, t.x, t.y, Tools.cur === 'roadbridge' ? 'road' : 'rail');
        break;
      }
      case 'tunnel': case 'roadtunnel': UI.cmd(ex => B.buildTunnel(gg, cid, t.x, t.y, Tools.cur === 'roadtunnel' ? 'road' : 'rail', o.rt, ex), { at: [mouse.sx, mouse.sy], sound: 'dig' }); break;
      case 'convert': {
        const [x0, y0, x1, y1] = rectOf(st, t);
        const list = []; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) list.push([x, y]);
        const r = runMany(list, (it, ex) => B.convertRail(gg, cid, it[0], it[1], o.rt, ex), { sound: 'rail', quietPartial: true });
        if (!r.n && !r.err) UI.toast('No track of yours to convert there');
        break;
      }
      case 'busstop': case 'truckstop': UI.cmd(ex => S.buildRoadStop(gg, cid, t.x, t.y, Tools.cur === 'truckstop', o.stopAxis, ex), { at: [mouse.sx, mouse.sy], sound: 'station' }); break;
      case 'roaddepot': {
        const dir = autoDepotDir(t, 1);
        const r = UI.cmd(ex => B.buildDepot(gg, cid, t.x, t.y, 1, dir, 0, ex), { at: [mouse.sx, mouse.sy], sound: 'station' });
        if (r.ok) { const nx = t.x + HL.DX[dir], ny = t.y + HL.DY[dir]; const rr = B.buildRoad(gg, cid, nx, ny, 1 << HL.opp(dir), false); if (rr.ok) { B.buildRoad(gg, cid, nx, ny, 1 << HL.opp(dir), true); HL.Game.spend(gg, cid, 'construction', rr.cost); } }
        break;
      }
      case 'dock': UI.cmd(ex => S.buildDock(gg, cid, t.x, t.y, ex), { at: [mouse.sx, mouse.sy], sound: 'station' }); break;
      case 'shipdepot': UI.cmd(ex => B.buildDepot(gg, cid, t.x, t.y, 2, autoDepotDir(t, 2), 0, ex), { at: [mouse.sx, mouse.sy], sound: 'station' }); break;
      case 'buoy': UI.cmd(ex => S.buildBuoy(gg, cid, t.x, t.y, ex), { at: [mouse.sx, mouse.sy], sound: 'splash' }); break;
      case 'airport': { const r = airportRect(t); UI.cmd(ex => S.buildAirport(gg, cid, r.x, r.y, o.airport, ex), { at: [mouse.sx, mouse.sy], sound: 'station' }); break; }
      case 'raise': case 'lower': {
        if (st.x === t.x && st.y === t.y) { const [cx, cy] = cornerOf(t); UI.cmd(ex => B.terraform(gg, cid, cx, cy, Tools.cur === 'raise' ? 1 : -1, ex), { at: [mouse.sx, mouse.sy], sound: 'dig' }); dust(t.x, t.y, 5); }
        else {
          const [x0, y0, x1, y1] = rectOf(st, t);
          const list = []; for (let y = y0; y <= y1 + 1; y++) for (let x = x0; x <= x1 + 1; x++) list.push([x, y]);
          runMany(list, (it, ex) => B.terraform(gg, cid, it[0], it[1], Tools.cur === 'raise' ? 1 : -1, ex), { sound: 'dig', quietPartial: true, dust: true });
        }
        break;
      }
      case 'level': {
        const [x0, y0, x1, y1] = rectOf(st, t);
        const [cx, cy] = cornerOf(st);
        UI.cmd(ex => B.levelArea(gg, cid, x0, y0, x1, y1, m.ch(cx, cy), ex), { at: [mouse.sx, mouse.sy], sound: 'dig' });
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (Math.random() < 0.4) dust(x, y, 1);
        break;
      }
      case 'trees': {
        const [x0, y0, x1, y1] = rectOf(st, t);
        const list = []; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) list.push([x, y]);
        runMany(list, (it, ex) => B.plantTree(gg, cid, it[0], it[1], o.treeSpec, ex), { sound: 'tree', quietPartial: true });
        break;
      }
      case 'demolish': {
        const [x0, y0, x1, y1] = rectOf(st, t);
        const list = []; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) list.push([x, y]);
        let houses = 0; for (const [x, y] of list) if (m.type[m.t(x, y)] === T.HOUSE) houses++;
        const go = () => runMany(list, (it, ex) => B.demolish(gg, cid, it[0], it[1], ex), { sound: 'demolish', quietPartial: true, dust: true });
        if (houses >= 3) UI.confirm('Demolish buildings?', `This knocks down ${houses} town buildings. The local authority will not be pleased.`, go, { yes: 'Demolish' }); else go();
        break;
      }
      case 'query': HL.W.landInfo(t.x, t.y); break;
      case 'hq': UI.cmd(ex => B.buildHQ(gg, cid, t.x, t.y, ex), { at: [mouse.sx, mouse.sy], sound: 'station' }); Tools.cancel(); break;
      case 'order': Tools.orderClick(t); break;
      case 'fundind': {
        const r = HL.Ind.fund(gg, cid, Tools.opt.indType, t.x, t.y);
        if (!r.ok) UI.toast(r.err); else { if (HL.Audio) HL.Audio.build('station'); UI.cashPop(-r.cost, mouse.sx, mouse.sy); Tools.cancel(); }
        break;
      }
    }
  }
  function connectDepotRail(gg, cid, x, y, dir, rt) {
    const m = gg.map, nx = x + HL.DX[dir], ny = y + HL.DY[dir];
    if (!m.inside(nx, ny)) return;
    const n = m.t(nx, ny);
    if (m.type[n] !== T.RAIL || m.owner[n] !== cid) return;
    const en = HL.opp(dir);
    let has = false; for (let p = 0; p < 6; p++) if ((m.rail[n] & (1 << p)) && HL.PIECE_EDGES[p].includes(en)) has = true;
    if (has) return;
    const edges = new Set(); for (let p = 0; p < 6; p++) if (m.rail[n] & (1 << p)) for (const e of HL.PIECE_EDGES[p]) edges.add(e);
    for (const e of edges) { if (e === en) continue; const pc = HL.pieceFor(en, e); const r = B.buildRail(gg, cid, nx, ny, pc, rt, false); if (r.ok) { B.buildRail(gg, cid, nx, ny, pc, rt, true); HL.Game.spend(gg, cid, 'construction', r.cost); } }
  }
  // signals: one per `density` tiles along the track in the drag direction
  Tools.signalPlan = function (st, t) {
    const gg = g(), m = gg.map;
    if (!st) return [];
    const t0 = m.t(st.x, st.y);
    if (m.type[t0] !== T.RAIL) return [];
    // nearest existing piece on the start tile
    let piece = -1, bd = 9;
    for (let p = 0; p < 6; p++) {
      if (!(m.rail[t0] & (1 << p))) continue;
      const [a, b] = HL.PIECE_EDGES[p].map(e => HL.EDGE_MID[e]);
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      const d = (mx - st.u) ** 2 + (my - st.v) ** 2;
      if (d < bd) { bd = d; piece = p; }
    }
    if (piece < 0) return [];
    // direction: drag toward which end of the piece?
    const E = HL.PIECE_EDGES[piece];
    const ddx = t.x - st.x, ddy = t.y - st.y;
    let df = 0;
    if (ddx || ddy) { const e1 = E[1]; if (HL.DX[e1] * ddx + HL.DY[e1] * ddy < 0) df = 1; }
    const out = [[st.x, st.y, piece, df]];
    if (!(ddx || ddy)) return out;
    // walk the track
    const v = { owner: gg.player, need: 0, id: -1, path: [] };
    let seg = { k: 0, t: t0, p: piece, d: df };
    let dist = 0;
    const far = Math.abs(ddx) + Math.abs(ddy);
    for (let i = 0; i < 200 && dist < far; i++) {
      const nx = HL.Rail.next(gg, v, seg);
      if (nx.length !== 1 || nx[0].k !== 0) { if (nx.length === 1) { seg = nx[0]; dist += nx[0].len || 1; continue; } break; }
      seg = nx[0];
      dist += HL.Rail.segLen(seg);
      if (Math.round(dist) % Tools.opt.density === 0 && Math.abs(dist - Math.round(dist)) < 0.3) {
        // skip junction tiles
        let ok = true; for (let p = 0; p < 6; p++) if (p !== seg.p && (m.rail[seg.t] & (1 << p)) && HL.pieceConflict(p, seg.p)) ok = false;
        if (ok && !m.road[seg.t]) out.push([m.tx(seg.t), m.ty(seg.t), seg.p, seg.d]);
      }
    }
    return out;
  };

  // ---------- cost preview ----------
  let costEl;
  function showCost(v) {
    costEl = costEl || document.getElementById('cost');
    if (v == null) { costEl.style.display = 'none'; return; }
    const c = g().companies[g().player];
    costEl.style.display = 'block';
    costEl.textContent = (v.err ? v.err : HL.fmtMoney(v.cost));
    costEl.style.color = v.err ? '#ec7562' : v.cost > c.money ? '#ec7562' : '#8ccb6c';
    costEl.style.left = (mouse.sx + 18) + 'px'; costEl.style.top = (mouse.sy + 14) + 'px';
  }
  function sumCost(list, fn) {
    let cost = 0, err = null;
    for (const it of list) { const r = fn(it); if (!r.ok) { if (r.err === 'Already built') continue; err = err || r.err; continue; } cost += r.cost; }
    return { cost, err: cost ? null : err };
  }
  function updateCost() {
    const t = mouse.tile, gg = g();
    if (!Tools.cur || !t) { showCost(null); return; }
    const cid = gg.player, o = Tools.opt, st = mouse.start;
    let r = null;
    try {
      switch (Tools.cur) {
        case 'rail': { if (!st) { r = B.buildRail(gg, cid, t.x, t.y, pickPiece(t.u, t.v), o.rt, false); if (!r.ok && r.err === 'Already built') r = null; break; } const line = railLine(st, t.x, t.y); r = removing() ? sumCost(line, it => B.removeRail(gg, cid, it[0], it[1], it[2], false)) : sumCost(line, it => B.buildRail(gg, cid, it[0], it[1], it[2], o.rt, false)); break; }
        case 'road': if (st) { const L = straightLine(st, t.x, t.y); r = sumCost(L.tiles, p => removing() ? B.removeRoad(gg, cid, p[0], p[1], 15, false) : B.buildRoad(gg, cid, p[0], p[1], L.axis === 0 ? 10 : 5, false)); } break;
        case 'station': { const s = stationRect(t); r = S.buildRail(gg, cid, s.x, s.y, o.axis, o.plat, o.len, o.rt, false); break; }
        case 'airport': { const a = airportRect(t); r = S.buildAirport(gg, cid, a.x, a.y, o.airport, false); break; }
        case 'depot': r = B.buildDepot(gg, cid, t.x, t.y, 0, autoDepotDir(t, 0), o.rt, false); break;
        case 'roaddepot': r = B.buildDepot(gg, cid, t.x, t.y, 1, autoDepotDir(t, 1), 0, false); break;
        case 'shipdepot': r = B.buildDepot(gg, cid, t.x, t.y, 2, 1, 0, false); break;
        case 'busstop': case 'truckstop': r = S.buildRoadStop(gg, cid, t.x, t.y, Tools.cur === 'truckstop', o.stopAxis, false); break;
        case 'dock': r = S.buildDock(gg, cid, t.x, t.y, false); break;
        case 'buoy': r = S.buildBuoy(gg, cid, t.x, t.y, false); break;
        case 'tunnel': case 'roadtunnel': r = B.buildTunnel(gg, cid, t.x, t.y, Tools.cur === 'roadtunnel' ? 'road' : 'rail', o.rt, false); break;
        case 'raise': case 'lower': if (!st || (st.x === t.x && st.y === t.y)) { const [cx, cy] = cornerOf(t); r = B.terraform(gg, cid, cx, cy, Tools.cur === 'raise' ? 1 : -1, false); } break;
        case 'level': if (st) { const [x0, y0, x1, y1] = rectOf(st, t); const [cx, cy] = cornerOf(st); r = B.levelArea(gg, cid, x0, y0, x1, y1, gg.map.ch(cx, cy), false); } break;
        case 'demolish': if (st) { const [x0, y0, x1, y1] = rectOf(st, t); const list = []; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) list.push([x, y]); r = sumCost(list, it => B.demolish(gg, cid, it[0], it[1], false)); } else { r = B.demolish(gg, cid, t.x, t.y, false); } break;
        case 'trees': if (st) { const [x0, y0, x1, y1] = rectOf(st, t); const list = []; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) list.push([x, y]); r = sumCost(list, it => B.plantTree(gg, cid, it[0], it[1], o.treeSpec, false)); } break;
        case 'hq': r = B.buildHQ(gg, cid, t.x, t.y, false); break;
        case 'bridge': case 'roadbridge': if (st && (st.x !== t.x || st.y !== t.y)) { const p = B.planBridge(gg, cid, st.x, st.y, t.x, t.y, Tools.cur === 'roadbridge' ? 'road' : 'rail'); r = p.ok ? { ok: true, cost: 0, label: p.len + ' tile span' } : p; } break;
      }
    } catch (e) { r = null; }
    if (!r) { showCost(null); return; }
    if (r.label) { costEl = costEl || document.getElementById('cost'); costEl.style.display = 'block'; costEl.textContent = r.label; costEl.style.color = '#ece5d3'; costEl.style.left = (mouse.sx + 18) + 'px'; costEl.style.top = (mouse.sy + 14) + 'px'; return; }
    showCost(r.ok ? { cost: r.cost } : { err: r.err });
  }

  // ---------- previews (world space) ----------
  const wp = (x, y, h) => [(x - y) * Gx.TW2, (x + y) * Gx.TH2 - h * Gx.HS];
  function tilePoly(ctx, x, y, inset) {
    const m = g().map; if (!m.inside(x, y)) return;
    const c = m.corners(x, y);
    const i = inset || 0;
    const P = [wp(x + i, y + i, c[0]), wp(x + 1 - i, y + i, c[1]), wp(x + 1 - i, y + 1 - i, c[2]), wp(x + i, y + 1 - i, c[3])];
    ctx.beginPath(); ctx.moveTo(P[0][0], P[0][1]); for (let k = 1; k < 4; k++) ctx.lineTo(P[k][0], P[k][1]); ctx.closePath();
  }
  function rectPoly(ctx, x0, y0, x1, y1, fill, stroke) {
    ctx.fillStyle = fill; ctx.strokeStyle = stroke; ctx.lineWidth = 1.2;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { tilePoly(ctx, x, y, 0.02); ctx.fill(); }
    // outline of the whole rectangle
    const m = g().map;
    ctx.beginPath();
    const pts = [];
    for (let x = x0; x <= x1 + 1; x++) pts.push([x, y0]);
    for (let y = y0 + 1; y <= y1 + 1; y++) pts.push([x1 + 1, y]);
    for (let x = x1; x >= x0; x--) pts.push([x, y1 + 1]);
    for (let y = y1; y > y0; y--) pts.push([x0, y]);
    pts.forEach((p, i) => { const q = wp(p[0], p[1], m.inside(Math.min(p[0], m.W), Math.min(p[1], m.H)) || true ? m.ch(Math.min(p[0], m.W), Math.min(p[1], m.H)) : 0); if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); });
    ctx.closePath(); ctx.stroke();
  }
  function pieceLine(ctx, x, y, p, col, w) {
    const m = g().map;
    const [a, b] = HL.PIECE_EDGES[p].map(e => HL.EDGE_MID[e]);
    ctx.strokeStyle = col; ctx.lineWidth = w || 3; ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i <= 4; i++) { const f = i / 4, px = x + a[0] + (b[0] - a[0]) * f, py = y + a[1] + (b[1] - a[1]) * f; const q = wp(px, py, m.heightAt(px, py) + 0.15); if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); }
    ctx.stroke();
  }
  function catchment(ctx, x0, y0, x1, y1, r) {
    const m = g().map;
    ctx.fillStyle = 'rgba(127,178,212,0.13)';
    for (let y = Math.max(0, y0 - r); y <= Math.min(m.H - 1, y1 + r); y++) for (let x = Math.max(0, x0 - r); x <= Math.min(m.W - 1, x1 + r); x++) { tilePoly(ctx, x, y, 0.04); ctx.fill(); }
  }
  Tools.drawPreview = function (ctx, view) {
    const t = mouse.tile, gg = g();
    if (!gg) return;
    // selected station's catchment
    if (Tools.showStationCatch != null) { const s = gg.stations[Tools.showStationCatch]; if (s && s.catch) catchment(ctx, s.catch.x0, s.catch.y0, s.catch.x1, s.catch.y1, 0); }
    if (!Tools.cur || !t) return;
    const o = Tools.opt, st = mouse.start, m = gg.map;
    const OK = 'rgba(140,203,108,0.28)', BAD = 'rgba(236,117,98,0.3)', LINE = 'rgba(255,240,200,0.85)';
    switch (Tools.cur) {
      case 'rail': {
        const pieces = st && mouse.down ? railLine(st, t.x, t.y) : [[t.x, t.y, pickPiece(t.u, t.v)]];
        for (const [x, y, p] of pieces) { ctx.fillStyle = 'rgba(255,240,200,0.10)'; tilePoly(ctx, x, y, 0.03); ctx.fill(); pieceLine(ctx, x, y, p, removing() ? 'rgba(236,117,98,0.95)' : 'rgba(255,236,170,0.95)', 3.2); }
        break;
      }
      case 'road': {
        const tiles = st && mouse.down ? straightLine(st, t.x, t.y).tiles : [[t.x, t.y]];
        ctx.fillStyle = removing() ? BAD : 'rgba(255,240,200,0.2)'; ctx.strokeStyle = LINE; ctx.lineWidth = 1;
        for (const [x, y] of tiles) { tilePoly(ctx, x, y, 0.03); ctx.fill(); ctx.stroke(); }
        break;
      }
      case 'station': {
        const r = stationRect(t);
        const ok = S.buildRail(gg, gg.player, r.x, r.y, o.axis, o.plat, o.len, o.rt, false).ok;
        if (o.showCatch) catchment(ctx, r.x, r.y, r.x + r.w - 1, r.y + r.h - 1, 4);
        rectPoly(ctx, r.x, r.y, r.x + r.w - 1, r.y + r.h - 1, ok ? OK : BAD, LINE);
        for (let i = 0; i < (o.axis === 0 ? r.h : r.w); i++) for (let j = 0; j < (o.axis === 0 ? r.w : r.h); j++) pieceLine(ctx, r.x + (o.axis === 0 ? j : i), r.y + (o.axis === 0 ? i : j), o.axis === 0 ? 0 : 1, 'rgba(255,240,200,0.5)', 1.5);
        break;
      }
      case 'airport': {
        const r = airportRect(t);
        const ok = S.buildAirport(gg, gg.player, r.x, r.y, o.airport, false).ok;
        if (o.showCatch) catchment(ctx, r.x, r.y, r.x + r.w - 1, r.y + r.h - 1, S.airportType(o.airport).catchment);
        rectPoly(ctx, r.x, r.y, r.x + r.w - 1, r.y + r.h - 1, ok ? OK : BAD, LINE);
        break;
      }
      case 'busstop': case 'truckstop': case 'dock': {
        if (o.showCatch) catchment(ctx, t.x, t.y, t.x, t.y, Tools.cur === 'dock' ? 4 : 3);
        const ok = Tools.cur === 'dock' ? S.buildDock(gg, gg.player, t.x, t.y, false).ok : S.buildRoadStop(gg, gg.player, t.x, t.y, Tools.cur === 'truckstop', o.stopAxis, false).ok;
        rectPoly(ctx, t.x, t.y, t.x, t.y, ok ? OK : BAD, LINE);
        break;
      }
      case 'depot': case 'roaddepot': case 'shipdepot': case 'buoy': case 'query': case 'tunnel': case 'roadtunnel': {
        ctx.fillStyle = 'rgba(255,240,200,0.18)'; ctx.strokeStyle = LINE; ctx.lineWidth = 1.2; tilePoly(ctx, t.x, t.y, 0.02); ctx.fill(); ctx.stroke();
        if (Tools.cur.endsWith('depot')) {
          const dir = autoDepotDir(t, Tools.cur === 'depot' ? 0 : Tools.cur === 'roaddepot' ? 1 : 2);
          const a = HL.EDGE_MID[dir], c = [t.x + 0.5, t.y + 0.5];
          const p0 = wp(c[0], c[1], m.heightAt(c[0], c[1]) + 0.3), p1 = wp(t.x + a[0], t.y + a[1], m.heightAt(t.x + a[0], t.y + a[1]) + 0.3);
          ctx.strokeStyle = 'rgba(255,236,170,0.95)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke();
        }
        if (Tools.cur === 'tunnel' || Tools.cur === 'roadtunnel') { const p = B.planTunnel(gg, t.x, t.y); if (p.ok) { ctx.fillStyle = OK; tilePoly(ctx, p.bx, p.by, 0.02); ctx.fill(); ctx.stroke(); } }
        break;
      }
      case 'signal': {
        const plan = Tools.signalPlan(st && mouse.down ? st : { x: t.x, y: t.y, u: t.u, v: t.v }, t);
        for (const [x, y, p, d] of plan) {
          pieceLine(ctx, x, y, p, 'rgba(255,236,170,0.5)', 2);
          const E = HL.PIECE_EDGES[p], a = HL.EDGE_MID[E[d]];
          const q = wp(x + a[0] * 0.7 + 0.15, y + a[1] * 0.7 + 0.15, m.heightAt(x + 0.5, y + 0.5) + 0.5);
          ctx.fillStyle = 'rgba(255,236,170,0.95)'; ctx.beginPath(); ctx.arc(q[0], q[1], 3, 0, 7); ctx.fill();
        }
        break;
      }
      case 'bridge': case 'roadbridge': case 'convert': case 'level': case 'trees': case 'demolish': {
        const a = st && mouse.down ? st : t;
        if (Tools.cur === 'bridge' || Tools.cur === 'roadbridge') { const L = straightLine(a, t.x, t.y).tiles; ctx.fillStyle = 'rgba(255,240,200,0.2)'; ctx.strokeStyle = LINE; for (const [x, y] of L) { tilePoly(ctx, x, y, 0.03); ctx.fill(); ctx.stroke(); } break; }
        const [x0, y0, x1, y1] = rectOf(a, t);
        rectPoly(ctx, x0, y0, x1, y1, Tools.cur === 'demolish' ? BAD : 'rgba(255,240,200,0.16)', LINE);
        break;
      }
      case 'raise': case 'lower': {
        const [cx, cy] = cornerOf(t);
        const q = wp(cx, cy, m.ch(cx, cy));
        ctx.fillStyle = Tools.cur === 'raise' ? '#8ccb6c' : '#ec7562'; ctx.strokeStyle = '#111'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(q[0], q[1], 4, 0, 7); ctx.fill(); ctx.stroke();
        if (st && mouse.down) { const [x0, y0, x1, y1] = rectOf(st, t); rectPoly(ctx, x0, y0, x1, y1, 'rgba(255,240,200,0.12)', LINE); }
        break;
      }
      case 'hq': rectPoly(ctx, t.x, t.y, t.x + 1, t.y + 1, B.buildHQ(gg, gg.player, t.x, t.y, false).ok ? OK : BAD, LINE); break;
      case 'fundind': { const d = HL.INDUSTRY[o.indType]; rectPoly(ctx, t.x, t.y, t.x + d.w - 1, t.y + d.h - 1, HL.Ind.siteCheck(gg, o.indType, t.x, t.y) ? OK : BAD, LINE); break; }
      case 'order': { ctx.fillStyle = 'rgba(255,240,200,0.2)'; tilePoly(ctx, t.x, t.y, 0.02); ctx.fill(); break; }
    }
  };

  // ---------- order targeting ----------
  Tools.startOrders = function (vid) { Tools.set('order'); Tools.orderFor = vid; };
  Tools.orderClick = function (t) {
    const gg = g(), m = gg.map, v = gg.vehicles[Tools.orderFor];
    if (!v) { Tools.cancel(); return; }
    // a station sign or tile, a depot, or a vehicle (share orders)
    for (const L of Tools.labels) if (mouse.sx >= L.x0 && mouse.sx <= L.x1 && mouse.sy >= L.y0 && mouse.sy <= L.y1 && L.st != null) { addOrderSt(gg, v, L.st); return; }
    const tile = m.t(t.x, t.y), ty = m.type[tile];
    if (ty === T.STATION) { addOrderSt(gg, v, m.idx[tile]); return; }
    if (ty === T.IND) { const ind = gg.industries[m.idx[tile]]; if (ind && ind.station >= 0) { addOrderSt(gg, v, ind.station); return; } }
    if (ty === T.DEPOT) {
      const d = gg.depots[m.idx[tile]];
      if (d && d.owner === v.owner && HL.Veh.depotKindOk(v, d)) { HL.Veh.addOrder(gg, v, { type: 'depot', depot: d.id }, HL.W.orderInsertAt(v)); if (HL.Audio) HL.Audio.ui('click'); return; }
    }
    const ov = Tools.vehicleAt(mouse.sx, mouse.sy);
    if (ov && ov !== v && ov.owner === v.owner && ov.kind === v.kind) { HL.Veh.shareOrders(gg, v, ov); UI.toast('Now sharing orders with ' + HL.Veh.displayName(ov), 'info'); Tools.cancel(); return; }
    UI.toast('Click a station, depot or buoy to add it to the orders');
  };
  function addOrderSt(gg, v, sid) {
    const s = gg.stations[sid];
    if (!s) return;
    if (s.owner !== v.owner && !(s.owner === HL.OWNER_NONE) && !s.buoy) { UI.toast('That station belongs to ' + gg.companies[s.owner].name); return; }
    if (!HL.Veh.stationKindOk(gg, v, s)) { UI.toast(s.name + ' has no facilities for this vehicle'); return; }
    HL.Veh.addOrder(gg, v, { type: s.buoy ? 'via' : 'go', st: sid }, HL.W.orderInsertAt(v));
    if (HL.Audio) HL.Audio.ui('click');
  }

  // ---------- labels (screen space) ----------
  Tools.labels = [];
  Tools.drawLabels = function (ctx) {
    const gg = g(); if (!gg) return;
    Tools.labels.length = 0;
    const z = R.cam.z;
    const m = gg.map;
    ctx.textBaseline = 'middle';
    const opts = HL.Meta ? HL.Meta.settings : {};
    if (z >= 0.18 && opts.townNames !== false) {
      ctx.font = `600 ${z < 0.4 ? 12 : 14}px "Barlow Condensed", "Arial Narrow", sans-serif`;
      for (const tw of gg.towns) {
        if (!tw) continue;
        const [sx, sy] = R.tileToScreen(tw.x + 0.5, tw.y + 0.5);
        if (sx < -100 || sy < -40 || sx > R.vw + 100 || sy > R.vh + 40) continue;
        const txt = tw.name + (z >= 0.55 ? ' · ' + HL.fmtInt(tw.pop) : '');
        const w = ctx.measureText(txt).width + 14, h = z < 0.4 ? 18 : 21;
        const x0 = sx - w / 2, y0 = sy - (z >= 1 ? 60 * z : 26) - h / 2;
        ctx.fillStyle = 'rgba(22,27,24,0.88)'; roundRect(ctx, x0, y0, w, h, 3); ctx.fill();
        ctx.strokeStyle = 'rgba(201,162,78,0.55)'; ctx.lineWidth = 1; roundRect(ctx, x0 + 1.5, y0 + 1.5, w - 3, h - 3, 2); ctx.stroke();
        ctx.fillStyle = tw.starved ? '#f0b8a8' : '#ece5d3'; ctx.textAlign = 'center'; ctx.fillText(txt, sx, y0 + h / 2 + 0.5);
        Tools.labels.push({ x0, y0, x1: x0 + w, y1: y0 + h, town: tw.id });
      }
    }
    if (z >= 0.45 && opts.stationNames !== false) {
      ctx.font = '600 12px "Barlow Condensed", "Arial Narrow", sans-serif';
      for (const s of gg.stations) {
        if (!s || !s.tileCount) continue;
        const cx = (s.rect.x0 + s.rect.x1 + 1) / 2, cy = (s.rect.y0 + s.rect.y1 + 1) / 2;
        const [sx, sy] = R.tileToScreen(cx, cy, m.heightAt(Math.min(m.W - 1, cx), Math.min(m.H - 1, cy)));
        if (sx < -80 || sy < -30 || sx > R.vw + 80 || sy > R.vh + 30) continue;
        const co = gg.companies[s.owner];
        const col = co ? HL.LIVERY[co.color] : { main: '#5a5e62', accent: '#ece5d3' };
        const w = ctx.measureText(s.name).width + 12, h = 16;
        const x0 = sx - w / 2, y0 = sy - 34 * Math.min(1.2, z) - h;
        ctx.fillStyle = col.main; roundRect(ctx, x0, y0, w, h, 2); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x0, y0 + h - 3, w, 3);
        ctx.fillStyle = '#fff6e4'; ctx.textAlign = 'center'; ctx.fillText(s.name, sx, y0 + h / 2);
        if (s.owner === gg.player && Tools.cur === 'order') { ctx.strokeStyle = '#e6c472'; ctx.lineWidth = 1.5; roundRect(ctx, x0 - 1, y0 - 1, w + 2, h + 2, 3); ctx.stroke(); }
        Tools.labels.push({ x0, y0, x1: x0 + w, y1: y0 + h, st: s.id });
      }
    }
    if (z >= 1.2 && opts.industryNames) {
      ctx.font = '500 11px "Barlow", sans-serif';
      for (const ind of gg.industries) {
        if (!ind) continue;
        const [sx, sy] = R.tileToScreen(ind.x + ind.w / 2, ind.y + ind.h / 2);
        if (sx < -80 || sy < -30 || sx > R.vw + 80 || sy > R.vh + 30) continue;
        ctx.fillStyle = 'rgba(16,20,18,0.7)'; const w = ctx.measureText(ind.name).width + 8; ctx.fillRect(sx - w / 2, sy + 8, w, 15);
        ctx.fillStyle = '#d8d0bc'; ctx.textAlign = 'center'; ctx.fillText(ind.name, sx, sy + 16);
      }
    }
    ctx.textAlign = 'left';
  };
  function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  Tools.roundRect = roundRect;
})(typeof window !== 'undefined' ? window : globalThis);
