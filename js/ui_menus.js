// Main menu, new game, scenarios, save/load, game menu, scores, achievements, news display.
(function (root) {
  const HL = root.HL, UI = HL.UI, R = HL.R;
  const W = HL.W;
  const esc = s => UI.esc(s);
  const g = () => HL.G.g;

  // ---------- main menu ----------
  UI.mainMenu = function () {
    UI.closeAll();
    const el = document.getElementById('menu');
    const hasSaves = HL.Save.index().length > 0;
    el.innerHTML = `<div class="shade"></div><div class="card lined">
      <h1 class="logo">Hinterline<span></span></h1>
      <p class="tag">Lay track across open country, run trains, lorries, ships and aircraft, and build a transport company to outlast every rival.</p>
      <nav>
        ${hasSaves ? `<button class="main" data-m="continue">Continue <small>${esc(HL.Save.index().sort((a, b) => b.saved - a.saved)[0].label)}</small></button>` : ''}
        <button class="${hasSaves ? '' : 'main'}" data-m="new">New game <small>Choose a world</small></button>
        <button data-m="scenarios">Scenarios <small>${Object.keys(HL.Meta.scenariosWon).length} of ${HL.SCENARIOS.length} complete</small></button>
        <button data-m="tutorial">Tutorial <small>${HL.Meta.tutorialDone ? 'Done' : 'Start here'}</small></button>
        <button data-m="load">Load game</button>
        <button data-m="records">Records &amp; achievements <small>${Object.keys(HL.Meta.ach).length} of ${HL.ACHIEVEMENTS.length}</small></button>
        <button data-m="settings">Settings</button>
      </nav>
      <div class="foot"><span>v${HL.VERSION}</span><span>Saves stay in this browser</span></div></div>`;
    el.style.display = 'block';
    el.onclick = (e) => {
      const b = e.target.closest('[data-m]'); if (!b) return;
      if (HL.Audio) { HL.Audio.init(); HL.Audio.ui('click'); }
      const m = b.dataset.m;
      if (m === 'new') UI.newGame();
      else if (m === 'continue') { const s = HL.Save.index().sort((a, b) => b.saved - a.saved)[0]; HL.G.loadSlot(s.slot); }
      else if (m === 'load') W.saveLoad(true);
      else if (m === 'scenarios') UI.scenarios();
      else if (m === 'tutorial') HL.Tutorial.start();
      else if (m === 'records') UI.records();
      else if (m === 'settings') W.settings();
    };
    document.getElementById('toolbar').style.display = 'none';
    document.getElementById('status').style.display = 'none';
  };
  UI.hideMenu = function () { document.getElementById('menu').style.display = 'none'; document.getElementById('toolbar').style.display = ''; document.getElementById('status').style.display = ''; };

  // ---------- new game ----------
  const NG = { climate: 'temperate', size: 1, terrain: 1, sea: 1, towns: 2, industries: 2, trees: 2, startYear: 1930, difficulty: 'normal', aiCount: 3, seed: '', name: 'Hinterline Transport', color: 0, townGrowth: 2 };
  const SIZES = [[64, 64], [128, 128], [192, 192], [256, 256], [256, 128]];
  UI.newGame = function () {
    if (!NG.seed) NG.seed = HL.randomSeedString();
    UI.open('newgame', {
      w: 560, title: 'New Game', live: false,
      render: () => {
        const sel = (k, opts) => `<select data-c="${k}">${opts.map(([v, l]) => `<option value="${v}" ${String(NG[k]) === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
        const d = HL.DIFFICULTY[NG.difficulty];
        return `<div class="climates">${Object.keys(HL.CLIMATES).map(k => `<button class="climate ${NG.climate === k ? 'on' : ''}" data-a="climate" data-v="${k}"><canvas width="300" height="152" data-prev="${k}"></canvas><div><b>${HL.CLIMATES[k].name}</b><span>${HL.CLIMATES[k].blurb}</span></div></button>`).join('')}</div>
        <div class="form" style="margin-top:12px">
          <label>Map size</label><div>${sel('size', SIZES.map((s, i) => [i, s[0] + ' × ' + s[1] + (i === 0 ? ' (quick)' : i === 1 ? ' (standard)' : i >= 3 ? ' (huge)' : '')]))}</div>
          <label>Terrain</label><div>${sel('terrain', [[0, 'Flat'], [1, 'Hilly'], [2, 'Mountainous'], [3, 'Alpine']])} ${sel('sea', [[0, 'Landlocked'], [1, 'Some coast'], [2, 'Lots of sea'], [3, 'Archipelago']])}</div>
          <label>Towns · industries</label><div>${sel('towns', [[0, 'Very few towns'], [1, 'Few towns'], [2, 'Normal towns'], [3, 'Many towns'], [4, 'Crowded']])} ${sel('industries', [[0, 'Very few'], [1, 'Few'], [2, 'Normal'], [3, 'Many'], [4, 'Packed']])}</div>
          <label>Start year</label><div class="row" style="flex-wrap:nowrap"><input type="range" min="1860" max="2040" step="5" value="${NG.startYear}" data-c="startYear" style="flex:1"><span class="num" style="width:44px;font-size:16px">${NG.startYear}</span></div>
          <label>Difficulty</label><div>${sel('difficulty', Object.keys(HL.DIFFICULTY).map(k => [k, HL.DIFFICULTY[k].name]))} <span class="dim" style="font-size:12px">loan ${HL.fmtMoney(d.maxLoan, true)}, ${d.interest}% interest</span></div>
          <label>Rival companies</label><div>${sel('aiCount', [0, 1, 2, 3, 4, 5, 6, 7].map(n => [n, n === 0 ? 'None (sandbox)' : n]))}</div>
          <label>Town growth</label><div>${sel('townGrowth', [[0, 'Very slow'], [1, 'Slow'], [2, 'Normal'], [3, 'Fast'], [4, 'Very fast']])}</div>
          <label>Company name</label><div><input type="text" data-c="name" value="${esc(NG.name)}" maxlength="32" style="width:100%"></div>
          <label>Livery</label><div class="swatches">${HL.LIVERY.map((l, i) => `<button class="${NG.color === i ? 'on' : ''}" data-a="color" data-v="${i}" data-tip="${l.name}" style="background:linear-gradient(${l.main} 70%, ${l.accent} 70%)"></button>`).join('')}</div>
          <label>World seed</label><div class="row" style="flex-wrap:nowrap"><input type="text" data-c="seed" value="${esc(NG.seed)}" maxlength="16" style="width:140px;text-transform:uppercase">${UI.ibtn('rotate', 'reseed', 'Random seed')}<span class="dim" style="font-size:12px">Same seed, same world</span></div>
        </div>
        <div class="row" style="margin-top:14px;justify-content:flex-end">${UI.btn('Back', 'back')}${UI.btn('Found the company', 'go', { cls: 'primary' })}</div>`;
      },
      after: (w) => { UI.$$('canvas[data-prev]', w.body).forEach(c => drawClimatePreview(c, c.dataset.prev)); },
      actions: {
        climate: (k) => { NG.climate = k; },
        color: (i) => { NG.color = +i; },
        reseed: () => { NG.seed = HL.randomSeedString(); },
        back: () => UI.close('newgame'),
        go: () => {
          const sz = SIZES[NG.size];
          UI.close('newgame');
          HL.G.newGame({ climate: NG.climate, w: sz[0], h: sz[1], terrain: +NG.terrain, sea: +NG.sea, towns: +NG.towns, industries: +NG.industries, startYear: +NG.startYear, difficulty: NG.difficulty, aiCount: +NG.aiCount, seed: (NG.seed || HL.randomSeedString()).toUpperCase(), companyName: NG.name || 'Hinterline Transport', color: NG.color, townGrowth: +NG.townGrowth });
        },
        ...Object.fromEntries(['size', 'terrain', 'sea', 'towns', 'industries', 'difficulty', 'aiCount', 'townGrowth'].map(k => [k, (v) => { NG[k] = isNaN(+v) ? v : +v; }])),
        startYear: (v) => { NG.startYear = +v; },
        name: (v) => { NG.name = v; }, seed: (v) => { NG.seed = v.toUpperCase(); },
      },
    });
  };
  // little painted landscape per climate
  function drawClimatePreview(c, climate) {
    const ctx = c.getContext('2d'), w = c.width, h = c.height;
    const pal = { temperate: ['#a9c7d6', '#7aa452', '#5f8a3e', '#3f6a32', '#8a3d2c'], arctic: ['#b9cad6', '#e8eef2', '#9fb0a0', '#2f5a3e', '#8e3428'], desert: ['#e9cf9a', '#d8bf86', '#c9a46a', '#3f7a34', '#e8d4ae'] }[climate];
    const sky = ctx.createLinearGradient(0, 0, 0, h * 0.6); sky.addColorStop(0, pal[0]); sky.addColorStop(1, '#f0e8d6'); ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
    const r = new HL.RNG(HL.hashSeed(climate));
    ctx.fillStyle = HL.Gfx.css(HL.Gfx.mix(pal[2], pal[0], 0.45));
    ctx.beginPath(); ctx.moveTo(0, h * 0.62); for (let x = 0; x <= w; x += 10) ctx.lineTo(x, h * (0.42 + Math.sin(x / 40 + 1) * 0.07 + r.next() * 0.03)); ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.fill();
    ctx.fillStyle = pal[1];
    ctx.beginPath(); ctx.moveTo(0, h * 0.7); for (let x = 0; x <= w; x += 8) ctx.lineTo(x, h * (0.62 + Math.sin(x / 60) * 0.05)); ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.fill();
    // railway line with a train
    ctx.strokeStyle = '#4a3a2c'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, h * 0.84); ctx.lineTo(w, h * 0.78); ctx.stroke();
    ctx.fillStyle = '#7a2531'; ctx.fillRect(w * 0.52, h * 0.7, 46, 12); ctx.fillStyle = '#2a2a2a'; ctx.fillRect(w * 0.52 + 46, h * 0.69, 14, 13); ctx.fillStyle = '#ece5d3'; ctx.beginPath(); ctx.arc(w * 0.52 + 52, h * 0.64, 6, 0, 7); ctx.arc(w * 0.52 + 60, h * 0.58, 8, 0, 7); ctx.fill();
    for (let i = 0; i < 9; i++) {
      const x = r.next() * w, y = h * (0.66 + r.next() * 0.12);
      ctx.fillStyle = pal[3];
      if (climate === 'desert') { ctx.fillRect(x, y - 14, 2, 14); ctx.beginPath(); ctx.arc(x + 1, y - 15, 6, Math.PI, 0); ctx.fill(); }
      else { ctx.beginPath(); ctx.moveTo(x, y - 18); ctx.lineTo(x - 6, y); ctx.lineTo(x + 6, y); ctx.fill(); if (climate === 'arctic') { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(x, y - 18); ctx.lineTo(x - 3, y - 10); ctx.lineTo(x + 3, y - 10); ctx.fill(); } }
    }
    ctx.fillStyle = pal[4]; for (let i = 0; i < 4; i++) { const x = w * 0.12 + i * 16; ctx.fillRect(x, h * 0.62, 12, 12); ctx.fillStyle = '#4e555e'; ctx.beginPath(); ctx.moveTo(x - 1, h * 0.62); ctx.lineTo(x + 6, h * 0.55); ctx.lineTo(x + 13, h * 0.62); ctx.fill(); ctx.fillStyle = pal[4]; }
  }

  // ---------- scenarios ----------
  UI.scenarios = function () {
    UI.open('scenarios', {
      w: 560, title: 'Scenarios', sel: HL.SCENARIOS[0].id, live: false,
      render: (w) => {
        const s = HL.SCENARIOS.find(x => x.id === w.o.sel);
        return `<div class="buy" style="grid-template-columns:220px 1fr"><div class="list" style="max-height:360px">${HL.SCENARIOS.map(x => `<div class="it ${x.id === w.o.sel ? 'sel' : ''}" data-a="pick" data-v="${x.id}"><span class="grow">${x.name}</span>${HL.Meta.scenariosWon[x.id] ? '<span class="good" data-tip="Completed">✓</span>' : ''}</div>`).join('')}</div>
          <div class="preview"><div style="font:600 18px var(--f-num);letter-spacing:.03em">${s.name}</div><p style="font-size:13.5px;margin:6px 0 10px">${s.blurb}</p>
          <dl class="kv"><dt>Climate</dt><dd style="font-family:var(--f-ui);font-size:13px">${HL.CLIMATES[s.opts.climate].name}</dd><dt>Starts</dt><dd>${s.opts.startYear}</dd><dt>Map</dt><dd>${s.opts.w}×${s.opts.h}</dd><dt>Difficulty</dt><dd style="font-family:var(--f-ui);font-size:13px">${HL.DIFFICULTY[s.difficulty].name}</dd></dl>
          <h3>Goals</h3>${s.goals.map(gl => `<div style="font-size:13px;margin:3px 0">${UI.ICON.goal.replace('<svg', '<svg style="width:14px;height:14px;vertical-align:-2px;margin-right:6px;color:var(--gold-2)"')}${gl.text}</div>`).join('')}
          <div class="row" style="margin-top:14px">${UI.btn('Play this scenario', 'go', { cls: 'primary' })}</div></div></div>`;
      },
      actions: {
        pick: (id, el, e, w) => { w.o.sel = id; },
        go: (x, el, e, w) => { const s = HL.SCENARIOS.find(y => y.id === w.o.sel); UI.close('scenarios'); HL.G.newGame(Object.assign({ seed: 'SCN-' + s.id.toUpperCase(), difficulty: s.difficulty, scenario: s.id, companyName: NG.name || 'Hinterline Transport', color: NG.color, aiCount: s.opts.aiCount != null ? s.opts.aiCount : 3 }, s.opts)); },
      },
    });
  };

  // ---------- save / load ----------
  HL.Save.thumb = function (gg) {
    try {
      const m = gg.map, cols = R.minimapColors('terrain');
      const c = document.createElement('canvas'); c.width = m.W; c.height = m.H; c.getContext('2d').putImageData(new ImageData(cols, m.W, m.H), 0, 0);
      const t = document.createElement('canvas'); t.width = 120; t.height = 62;
      const ctx = t.getContext('2d'); ctx.fillStyle = '#16202a'; ctx.fillRect(0, 0, 120, 62);
      const s = 120 / (m.W + m.H); ctx.setTransform(s, s / 2, -s, s / 2, m.H * s, 1); ctx.drawImage(c, 0, 0);
      return t.toDataURL('image/jpeg', 0.7);
    } catch (e) { return null; }
  };
  W.saveLoad = function (loadOnly) {
    UI.open('saveload', {
      w: 520, title: loadOnly ? 'Load Game' : 'Save or Load', live: false, sel: null,
      render: (w) => {
        const list = HL.Save.index().sort((a, b) => b.saved - a.saved);
        let h = '';
        if (!loadOnly && g()) h += `<div class="row" style="margin-bottom:10px;flex-wrap:nowrap"><input type="text" id="sv-name" placeholder="Name this save" value="${esc(g().companies[g().player].name + ', ' + HL.ymd(g().date).y)}" style="flex:1">${UI.btn('Save new', 'save', { cls: 'primary', icon: 'ledger' })}${UI.btn('Overwrite selected', 'over', { dis: !w.o.sel || w.o.sel === 'auto' })}</div>`;
        h += `<div class="list" style="max-height:340px">${list.length ? list.map(s => `<div class="it ${w.o.sel === s.slot ? 'sel' : ''}" data-a="pick" data-v="${s.slot}">${s.thumb ? `<img src="${s.thumb}" width="96" height="50" alt="" style="border-radius:2px">` : ''}<div class="grow"><div>${esc(s.label)}${s.slot === 'auto' ? ' <span class="flag">autosave</span>' : ''}</div><div class="sub">${HL.fmtDate(s.date)} · ${HL.CLIMATES[s.climate].name} · ${s.size} · value ${HL.fmtMoney(s.value, true)}${s.scenario ? ' · ' + esc(s.scenario) : ''}</div><div class="sub">Saved ${new Date(s.saved).toLocaleString()}</div></div></div>`).join('') : '<div class="it dim">No saved games yet.</div>'}</div>
          <div class="row" style="margin-top:10px">${UI.btn('Load', 'load', { dis: !w.o.sel, cls: loadOnly ? 'primary' : '' })}${UI.btn('Delete', 'del', { dis: !w.o.sel })}</div>`;
        return h;
      },
      actions: {
        pick: (s, el, e, w) => { w.o.sel = s; },
        save: async () => { const name = (UI.$('#sv-name') || {}).value; try { await HL.Save.toSlot(g(), HL.Save.newSlotId(), name); UI.toast('Game saved', 'info'); UI.render('saveload'); UI.wins.get('saveload').lastHtml = null; UI.render('saveload'); } catch (e) { UI.toast('Could not save: ' + e.message); } },
        over: async (x, el, e, w) => { try { const meta = HL.Save.index().find(s => s.slot === w.o.sel); await HL.Save.toSlot(g(), w.o.sel, (UI.$('#sv-name') || {}).value || (meta && meta.label)); UI.toast('Game saved', 'info'); w.lastHtml = null; UI.render('saveload'); } catch (e) { UI.toast('Could not save: ' + e.message); } },
        load: (x, el, e, w) => { const s = w.o.sel; const go = () => { UI.close('saveload'); HL.G.loadSlot(s); }; if (g() && !loadOnly) UI.confirm('Load this game?', 'Unsaved progress in the current game will be lost.', go, { yes: 'Load' }); else go(); },
        del: (x, el, e, w) => UI.confirm('Delete this save?', 'This can\'t be undone.', () => { HL.Save.remove(w.o.sel); w.o.sel = null; const sw = UI.wins.get('saveload'); if (sw) { sw.lastHtml = null; UI.render('saveload'); } }, { yes: 'Delete' }),
      },
    });
  };

  // ---------- in-game menu ----------
  UI.gameMenu = function () {
    UI.toggle('gamemenu', () => UI.open('gamemenu', {
      w: 300, title: 'Game', live: false,
      render: () => `<div style="display:grid;gap:6px">${UI.btn('Resume', 'resume', { cls: 'primary' })}${UI.btn('Save or load', 'save', { icon: 'ledger' })}${UI.btn('Settings', 'settings', { icon: 'gear' })}${UI.btn('Achievements', 'ach', { icon: 'star' })}${UI.btn('How to play', 'help', { icon: 'help' })}${UI.btn('Quit to title', 'quit')}</div>`,
      actions: {
        resume: () => UI.close('gamemenu'),
        save: () => { UI.close('gamemenu'); W.saveLoad(); },
        settings: () => { UI.close('gamemenu'); W.settings(); },
        ach: () => { UI.close('gamemenu'); UI.records(); },
        help: () => { UI.close('gamemenu'); W.help(); },
        quit: () => UI.confirm('Quit to the title screen?', 'Your company was last autosaved on the most recent autosave date. Save first if you want to keep recent progress.', () => HL.G.quitToMenu(), { yes: 'Quit' }),
      },
    }));
  };
  UI.records = function () {
    UI.open('records', {
      w: 560, h: 520, resizable: true, title: 'Records & Achievements', tab: 'ach', live: false,
      render: (w) => {
        let h = `<div class="tabs"><button class="${w.o.tab === 'ach' ? 'on' : ''}" data-a="tab" data-v="ach">Achievements</button><button class="${w.o.tab === 'scores' ? 'on' : ''}" data-a="tab" data-v="scores">High scores</button></div>`;
        if (w.o.tab === 'ach') {
          h += `<p class="lede">${Object.keys(HL.Meta.ach).length} of ${HL.ACHIEVEMENTS.length} unlocked. Achievements can't be earned in the developer test mode.</p><div class="list" style="max-height:none">${HL.ACHIEVEMENTS.map(a => { const got = HL.Meta.ach[a.id]; return `<div class="it" style="cursor:default;${got ? '' : 'opacity:.55'}"><span style="width:20px;height:20px;color:${got ? 'var(--gold-2)' : 'var(--ink-faint)'}">${UI.ICON.star}</span><div class="grow"><div>${a.name}</div><div class="sub">${a.desc}</div></div>${got ? `<span class="dim num" style="font-size:12px">${new Date(got).toLocaleDateString()}</span>` : ''}</div>`; }).join('')}</div>`;
        } else {
          const sc = HL.Meta.scores;
          h += sc.length ? `<table class="tt"><thead><tr><th>#</th><th>Company</th><th>World</th><th class="r">Years</th><th class="r">Score</th></tr></thead><tbody>${sc.map((s, i) => `<tr><td class="num">${i + 1}</td><td>${esc(s.name)}<div class="dim" style="font-size:11.5px">${HL.perfTitle(s.score)} ${esc(s.manager)}</div></td><td style="font-size:12px">${HL.CLIMATES[s.climate].name}${s.scenario ? '<br><span class="dim">' + esc(s.scenario) + '</span>' : ''}</td><td class="r">${s.years}</td><td class="r">${s.score}</td></tr>`).join('')}</tbody></table>` : '<p class="lede">No finished games yet. A game ends at its final year (usually 100 years after the start), and your score is recorded here.</p>';
        }
        return h;
      },
      actions: { tab: (k, el, e, w) => { w.o.tab = k; } },
    });
  };
  UI.gameOver = function () {
    const gg = g(), c = gg.companies[gg.player];
    const rank = gg.playerBankrupt ? -1 : HL.Meta.addScore(gg);
    UI.open('gameover', {
      w: 440, title: gg.playerBankrupt ? 'Bankrupt' : 'The Final Reckoning', live: false,
      render: () => `<div style="text-align:center"><div style="font:400 30px var(--f-display);margin:6px 0 4px">${gg.playerBankrupt ? 'Wound Up' : HL.perfTitle(c.perf)}</div>
        <p class="lede" style="margin:0 auto 12px;text-align:center">${gg.playerBankrupt ? 'The bank has called in its loans and the company has been dissolved.' : esc(c.manager) + ' of ' + esc(c.name) + ' retires with a performance score of <b style="color:var(--ink)">' + c.perf + '</b>.' + (rank >= 0 && rank < 20 ? ' That is #' + (rank + 1) + ' on your high-score table.' : '')}</p></div>
        <dl class="kv"><dt>Company value</dt><dd>${UI.money(c.value)}</dd><dt>Years in business</dt><dd>${HL.ymd(gg.date).y - gg.stats.started}</dd><dt>Cargo delivered</dt><dd>${HL.fmtInt(Object.values(c.deliveredTotal).reduce((a, b) => a + b, 0))}</dd></dl>
        <div class="row" style="margin-top:14px;justify-content:center">${gg.playerBankrupt ? '' : UI.btn('Keep playing', 'cont', { cls: 'primary' })}${UI.btn('Title screen', 'menu')}</div>`,
      actions: { cont: () => { gg.continueAfterEnd = true; gg.over = false; gg.endYear = 99999; UI.close('gameover'); }, menu: () => HL.G.quitToMenu() },
    });
  };

  // ---------- news ----------
  const News = HL.News = {};
  let paperTimer = null;
  News.show = function (n) {
    const gg = g(); if (!gg) return;
    const el = document.getElementById('st-news');
    if (el) el.innerHTML = `<b>${HL.fmtDate(n.date)}</b>${esc(n.title)}`;
    if (!n.big || !HL.Meta.settings.newspaper || HL.G.fastForward) return;
    const p = document.getElementById('paper');
    const yr = HL.ymd(n.date).y;
    const mast = yr < 1950 ? 'The Hinterland Gazette' : yr < 2000 ? 'Hinterland Evening Post' : 'Hinterline News';
    p.className = yr >= 2000 ? 'modern' : '';
    p.innerHTML = `<div class="sheet"><div class="mast"><b>${mast}</b><span>${HL.fmtDate(n.date, true)}</span></div><span class="close">Click to ${n.tile != null || n.veh != null ? 'go there' : 'dismiss'}</span><h4>${esc(n.title)}</h4><p>${esc(n.body)}</p></div>`;
    p.style.display = 'block';
    p.onclick = () => { News.focus(n); p.style.display = 'none'; };
    clearTimeout(paperTimer);
    paperTimer = setTimeout(() => { p.style.display = 'none'; }, 9000);
    if (HL.Audio) HL.Audio.ui('news');
  };
  News.focus = function (n) {
    const gg = g();
    if (n.veh != null && gg.vehicles[n.veh]) { const v = gg.vehicles[n.veh]; HL.G.centerOn(v.px, v.py); if (v.owner === gg.player) W.vehicle(v.id); return; }
    if (n.tile != null) { const m = gg.map; HL.G.centerOn(m.tx(n.tile) + 0.5, m.ty(n.tile) + 0.5); }
  };
  HL.on('news', (n) => { if (HL.G && HL.G.g && !HL.G.headless) News.show(n); });
  HL.on('achievement', (a) => { if (HL.Audio) HL.Audio.ui('ach'); UI.toast(`<b style="color:var(--gold-2)">Achievement</b> · ${esc(a.name)}: ${esc(a.desc)}`, 'info'); });

  // goals strip on screen during scenarios
  UI.updateGoals = function () {
    const gg = g(), el = document.getElementById('goals');
    if (!gg || !gg.goals || !gg.goals.length || HL.Tutorial.active) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    el.innerHTML = `<h4>${esc(gg.scenario.name)}</h4>` + gg.goals.map(goal => { const p = HL.Scenarios.progress(gg, goal); return `<div class="g"><div class="row" style="justify-content:space-between;flex-wrap:nowrap;gap:6px"><span>${goal.done ? '<span class="good">✓</span> ' : goal.failed ? '<span class="bad">✗</span> ' : ''}${esc(goal.text)}</span></div><div class="dim num" style="font-size:12px">${esc(p.label)}</div><div class="bar"><i style="width:${Math.round(p.f * 100)}%;background:${goal.failed ? 'var(--bad)' : goal.done ? 'var(--good)' : 'var(--gold)'}"></i></div></div>`; }).join('');
  };
  HL.on('scenarioWon', (gg) => { if (HL.G.headless) return; UI.open('won', { w: 380, title: 'Scenario Complete', live: false, render: () => `<p style="font-size:14px">Every goal in <b>${esc(gg.scenario.name)}</b> is done. Your board is delighted.</p><p class="lede">You can keep playing this world as long as you like.</p><div class="row" style="justify-content:flex-end">${UI.btn('Keep playing', 'ok', { cls: 'primary' })}</div>`, actions: { ok: () => UI.close('won') } }); });
})(typeof window !== 'undefined' ? window : globalThis);
