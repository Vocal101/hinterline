// Game controller: boot, game lifecycle, main loop, camera, keyboard.
(function (root) {
  const HL = root.HL, R = HL.R, UI = HL.UI;
  const G = HL.G = { g: null, speed: 1, zoomTarget: 1, followVeh: null, camTarget: null, fastForward: false };
  const TPS = [0, 30, 90, 300, 2000]; // ticks per second by speed setting
  let acc = 0, last = 0, uiT = 0, ambT = 0, achT = 0, keys = new Set();

  G.boot = function () {
    HL.Meta.load();
    R.init(document.getElementById('map'));
    UI.buildToolbar(); UI.buildStatus(); UI.initTips();
    HL.Tools.attach(R.canvas);
    R.worldOverlays2 = [HL.Tools.drawPreview];
    R.overlays.push(HL.Tools.drawLabels);
    if (HL.Tutorial) R.overlays.push(HL.Tutorial.drawMarker);
    HL.Audio.hook();
    addEventListener('resize', () => R.resize());
    addEventListener('keydown', onKey);
    addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
    addEventListener('blur', () => keys.clear());
    addEventListener('pointerdown', () => HL.Audio.init(), { once: true });
    addEventListener('keydown', () => HL.Audio.init(), { once: true });
    HL.on('gameover', (g) => { if (g === G.g && !g.demo) setTimeout(() => UI.gameOver(), 50); });
    HL.on('month', (g) => { if (g === G.g && !g.demo) autosave(g); });
    G.applySettings();
    G.demo();
    requestAnimationFrame(loop);
    const ld = document.getElementById('loading'); if (ld) ld.remove();
  };

  // ---------- lifecycle ----------
  G.setGame = function (g) {
    UI.closeAll();
    HL.Tools.cancel();
    if (HL.Fx) HL.Fx.clear();
    G.g = g;
    HL.Rail.ensure(g);
    R.setGame(g);
    g.paused = false; G.speed = g.demo ? 2 : 1;
    G.followVeh = null; R.selVeh = null;
    G.applySettings();
  };
  G.demo = function () {
    const seed = 'TITLE' + (Math.random() * 1000 | 0);
    const g = HL.Game.create({ w: 96, h: 96, seed, climate: ['temperate', 'temperate', 'arctic', 'desert'][Math.random() * 4 | 0], startYear: 1952, aiCount: 3, terrain: 1, sea: 1, towns: 2, industries: 2, difficulty: 'easy' });
    g.demo = true; g.diff.aiSpeed = 4;
    g.companies[g.player].alive = false;
    // let the rivals get something running before we show it
    G.headless = true;
    for (let i = 0; i < 160 * HL.TICKS_PER_DAY; i++) HL.Game.step(g);
    G.headless = false;
    G.setGame(g);
    const big = g.towns.filter(Boolean).sort((a, b) => b.pop - a.pop)[0];
    G.snapTo(big ? big.x + 4 : 48, big ? big.y + 4 : 48);
    R.cam.z = G.zoomTarget = 1;
    UI.mainMenu();
  };
  G.newGame = function (opts) {
    showLoading('Surveying the land…');
    setTimeout(() => {
      const g = HL.Game.create(opts);
      G.startGame(g, true);
      hideLoading();
    }, 30);
  };
  G.startGame = function (g, fresh) {
    UI.hideMenu();
    G.setGame(g);
    const c = g.companies[g.player];
    // start the camera on the biggest town
    const big = g.towns.filter(Boolean).sort((a, b) => b.pop - a.pop)[0];
    G.snapTo(big ? big.x : g.map.W / 2, big ? big.y : g.map.H / 2);
    R.cam.z = G.zoomTarget = 1;
    if (HL.Tips) { HL.Tips.reset(); if (fresh) setTimeout(() => { if (G.g === g) HL.Tips.show('start'); }, 2500); }
    if (fresh) HL.Game.news(g, 'company', c.name + ' is founded', `${c.manager} opens an office in ${big ? big.name : 'the hinterland'} with ${HL.fmtMoney(c.money)} of borrowed money. ${g.scenario ? 'Scenario: ' + g.scenario.name + '.' : 'Make it count.'}`, { big: true });
  };
  G.loadSlot = async function (slot) {
    showLoading('Unpacking the ledgers…');
    try {
      const g = await HL.Save.fromSlot(slot);
      G.startGame(g, false);
      UI.toast('Game loaded', 'info');
    } catch (e) { UI.toast('Could not load: ' + e.message); console.error(e); }
    hideLoading();
  };
  G.quitToMenu = function () { UI.closeAll(); G.demo(); };
  function showLoading(t) { let d = document.getElementById('loadmsg'); if (!d) { d = document.createElement('div'); d.id = 'loadmsg'; d.className = 'loading'; document.body.appendChild(d); } d.innerHTML = `<div>Hinterline<small>${t}</small></div>`; }
  function hideLoading() { const d = document.getElementById('loadmsg'); if (d) d.remove(); }
  let lastAutoMonth = -1;
  function autosave(g) {
    const n = HL.Meta.settings.autosave; if (!n) return;
    const d = HL.ymd(g.date), mi = d.y * 12 + d.m;
    if (mi % n !== 0 || mi === lastAutoMonth) return;
    lastAutoMonth = mi;
    HL.Save.toSlot(g, 'auto', g.companies[g.player].name + ' (autosave)').catch(e => console.warn('autosave failed', e));
  }
  G.applySettings = function () {
    const s = HL.Meta.settings;
    const gridChanged = R.opts.grid !== s.grid;
    R.opts.dayNight = s.dayNight; R.opts.weather = s.weather; R.opts.grid = s.grid;
    if (gridChanged && R.chunks) R.markAllStale();
  };

  // ---------- speed ----------
  G.togglePause = function () { if (!G.g) return; G.g.paused = !G.g.paused; UI.updateStatus(); };
  G.setSpeed = function (s) { if (!G.g) return; G.g.paused = false; G.g.speed = G.speed = s; UI.updateStatus(); };

  // ---------- camera ----------
  G.snapTo = function (fx, fy) { R.centerOn(fx, fy); G.camTarget = null; };
  G.centerOn = function (fx, fy) {
    const p = R.wp(fx, fy, G.g.map.heightAt(HL.clamp(fx, 0, G.g.map.W - 1), HL.clamp(fy, 0, G.g.map.H - 1)));
    G.camTarget = p;
  };
  let zoomAnchor = null;
  G.zoomTarget = 1;
  G.zoomTo = function (z, sx, sy) { G.zoomTarget = z; zoomAnchor = sx != null ? [sx, sy] : null; };
  function cameraStep(dt) {
    const c = R.cam;
    if (Math.abs(c.z - G.zoomTarget) > 1e-4) {
      const anchor = zoomAnchor || [R.vw / 2, R.vh / 2];
      const before = R.toWorldPx(anchor[0], anchor[1]);
      const k = 1 - Math.pow(0.0005, dt);
      c.z += (G.zoomTarget - c.z) * k;
      if (Math.abs(c.z - G.zoomTarget) < 1e-3) c.z = G.zoomTarget;
      const after = R.toWorldPx(anchor[0], anchor[1]);
      c.x += before[0] - after[0]; c.y += before[1] - after[1];
    }
    if (G.followVeh != null) {
      const v = G.g.vehicles[G.followVeh];
      if (!v) G.followVeh = null;
      else { const p = R.wp(v.kind === 'rail' && v.cars[0].px != null ? v.cars[0].px : v.px, v.kind === 'rail' && v.cars[0].py != null ? v.cars[0].py : v.py, v.pz || 0); G.camTarget = p; }
    }
    if (G.camTarget) {
      const k = 1 - Math.pow(0.002, dt);
      c.x += (G.camTarget[0] - c.x) * k; c.y += (G.camTarget[1] - c.y) * k;
      if (Math.hypot(G.camTarget[0] - c.x, G.camTarget[1] - c.y) < 0.5 && G.followVeh == null) G.camTarget = null;
    }
    // keyboard and edge scrolling
    const sp = 700 * dt / c.z;
    let dx = 0, dy = 0;
    if (keys.has('arrowleft')) dx -= sp; if (keys.has('arrowright')) dx += sp; if (keys.has('arrowup')) dy -= sp; if (keys.has('arrowdown')) dy += sp;
    const m = HL.Tools.mouse;
    if (HL.Meta.settings.edgeScroll && document.hasFocus()) { if (m.sx < 6) dx -= sp; if (m.sx > R.vw - 6) dx += sp; if (m.sy < 6) dy -= sp; if (m.sy > R.vh - 6) dy += sp; }
    if (dx || dy) { c.x += dx; c.y += dy; G.camTarget = null; G.followVeh = null; }
    // keep the camera over the map
    const mp = G.g.map;
    const minX = -mp.H * 32 - 200, maxX = mp.W * 32 + 200, minY = -300, maxY = (mp.W + mp.H) * 16 + 200;
    c.x = HL.clamp(c.x, minX, maxX); c.y = HL.clamp(c.y, minY, maxY);
  }

  // ---------- loop ----------
  function loop(now) {
    requestAnimationFrame(loop);
    const g = G.g;
    if (!g) return;
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0.016;
    last = now;
    g.realTime = (g.realTime || 0) + dt * (g.paused ? 0.15 : 1);
    if (g.demo) { R.cam.x += dt * 9; R.cam.y += dt * 2; }
    // simulation
    if (!g.paused && !(g.over && !g.continueAfterEnd)) {
      const tps = TPS[g.demo ? 2 : G.speed];
      acc += dt * tps;
      const t0 = performance.now();
      const budget = G.speed >= 4 ? 22 : 14;
      let n = 0;
      while (acc >= 1) { HL.Game.step(g); acc -= 1; n++; if (performance.now() - t0 > budget) { acc = Math.min(acc, tps * 0.05); break; } }
      G.fastForward = G.speed >= 3;
    } else acc = 0;
    cameraStep(dt);
    try { R.frame(now); } catch (e) { console.error(e); }
    if (now - uiT > 250) {
      uiT = now;
      if (!g.demo) { UI.updateStatus(); UI.refreshAll(); UI.updateGoals(); if (HL.Tutorial.active) HL.Tutorial.tick(); else HL.Tips.tick(); }
    }
    if (now - ambT > 900) { ambT = now; ambientView(); }
    if (now - achT > 3000 && !g.demo) { achT = now; HL.Meta.check(g); }
  }
  // sample what the camera sees for the ambient mix
  function ambientView() {
    if (!HL.Audio.ready) return;
    const m = G.g.map;
    let water = 0, trees = 0, town = 0, grass = 0, n = 0, hsum = 0;
    for (let i = 0; i < 40; i++) {
      const t = R.pick(Math.random() * R.vw, Math.random() * R.vh);
      if (!t) continue;
      n++;
      const ti = m.t(t.x, t.y), ty = m.type[ti];
      if (ty === HL.T.WATER) water++;
      else if (ty === HL.T.HOUSE || ty === HL.T.ROAD) town++;
      else if (m.trees[ti] & 7) trees++;
      else grass++;
      hsum += m.tileMax(t.x, t.y);
    }
    if (!n) return;
    const zf = Math.min(1, 0.35 + R.cam.z * 0.5);
    HL.Audio.ambientTick({ water: water / n * zf, trees: trees / n * zf, town: town / n * zf, grass: grass / n, height: hsum / n });
  }

  // ---------- keyboard ----------
  function onKey(e) {
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    const k = e.key.toLowerCase();
    keys.add(k);
    const g = G.g; if (!g) return;
    if (k === 'escape') {
      if (HL.Tools.cur) { HL.Tools.cancel(); UI.syncToolbar(); return; }
      if (document.getElementById('menu').style.display === 'block') return;
      const top = Array.from(UI.wins.values()).sort((a, b) => (+b.el.style.zIndex) - (+a.el.style.zIndex))[0];
      if (top) { UI.close(top.id); UI.syncToolbar(); return; }
      UI.gameMenu(); return;
    }
    if (g.demo) return;
    if (e.ctrlKey && k === 's') { e.preventDefault(); HL.Save.toSlot(g, 'quick', g.companies[g.player].name + ' (quick save)').then(() => UI.toast('Quick saved', 'info')).catch(err => UI.toast('Could not save: ' + err.message)); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    switch (k) {
      case ' ': e.preventDefault(); G.togglePause(); break;
      case '1': case '2': case '3': case '4': G.setSpeed(+k); break;
      case 'r': if (HL.Tools.cur === 'station') { HL.Tools.opt.axis ^= 1; UI.render('build-rail'); } else UI.tb('build:rail'); break;
      case 't': UI.tb('build:road'); break;
      case 'b': UI.tb('build:water'); break;
      case 'a': UI.tb('build:air'); break;
      case 'l': UI.tb('build:land'); break;
      case 'q': UI.tb('tool:query'); break;
      case 'delete': UI.tb('tool:demolish'); break;
      case 'm': UI.tb('minimap'); break;
      case 'f': UI.tb('finances'); break;
      case 'g': UI.tb('graphs'); break;
      case 'f1': e.preventDefault(); UI.tb('help'); break;
      case '+': case '=': G.zoomTo(HL.clamp(G.zoomTarget * 1.3, 0.125, 4)); break;
      case '-': case '_': G.zoomTo(HL.clamp(G.zoomTarget / 1.3, 0.125, 4)); break;
      case 'home': { const c = g.companies[g.player]; const o = c.hq != null && g.objects[c.hq]; if (o) G.centerOn(o.x + 1, o.y + 1); break; }
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
