// Guided tutorial: a coal railway from start to first delivery, then a bus line.
(function (root) {
  const HL = root.HL, UI = HL.UI, R = HL.R;
  const Tut = HL.Tutorial = { active: false, step: 0 };
  const g = () => HL.G.g;
  const T = HL.T;
  let ctx = null; // {mine, plant, town}

  const mineRect = () => ctx && { x0: ctx.mine.x, y0: ctx.mine.y, x1: ctx.mine.x + ctx.mine.w - 1, y1: ctx.mine.y + ctx.mine.h - 1 };
  function myStationNear(ind, cargo, accept) {
    const gg = g();
    for (const sid of HL.Ind.stations(gg, ind)) {
      const s = gg.stations[sid];
      if (!s || s.owner !== gg.player || !(s.fac & HL.Stations.FAC.rail)) continue;
      if (accept && !s.accepts[cargo]) continue;
      return s;
    }
    return null;
  }
  function connected(a, b) {
    const gg = g();
    if (!a || !b) return false;
    const m = gg.map;
    const fake = { id: -9, owner: gg.player, need: 0, path: [], kind: 'rail' };
    // any platform tile of A, both directions
    for (let y = a.rect.y0; y <= a.rect.y1; y++) for (let x = a.rect.x0; x <= a.rect.x1; x++) {
      const t = m.t(x, y);
      if (!HL.Stations.isRail(m, t) || m.idx[t] !== a.id) continue;
      const p = HL.Stations.axisAt(m, t) ? 1 : 0;
      for (const d of [0, 1]) {
        const seg = { k: 0, t, p, d };
        const r = HL.Rail.findRoute(gg, fake, HL.Rail.next(gg, fake, seg), { kind: 'st', id: b.id }, { maxExp: 20000 });
        if (r) return true;
      }
      return false;
    }
    return false;
  }
  const myTrain = () => g().vehicles.find(v => v && v.owner === g().player && v.kind === 'rail');
  const STEPS = [
    { title: 'Welcome to Hinterline', text: 'You run a new transport company. This tutorial builds your first money-maker: a railway carrying coal from a mine to a power station.<br><br>Move the view with a right-drag (or left-drag when no tool is selected). Zoom with the mouse wheel.', next: true, focus: 'mine' },
    { title: 'The mine and the power station', text: 'The gold markers show a coal mine and a power station. The mine produces coal every few days, but it only goes to a station that a train has called at. Your job is to link the two.', next: true, focus: 'both' },
    { title: 'Open the railway toolbar', text: 'Click the <b>railway</b> button on the toolbar at the top (or press R).', hl: '[data-tb="build:rail"]', done: () => UI.isOpen('build-rail') },
    { title: 'Build a station by the mine', text: 'Pick the <b>station</b> tool (the canopy icon). Platforms 1 and length 4 is plenty. Press R to turn it. The blue shading shows the catchment: it must touch the mine. Click to build next to the mine.', hl: '[data-win="build-rail"] [data-v="station"]', done: () => !!myStationNear(ctx.mine), focus: 'mine' },
    { title: 'Now one by the power station', text: 'Build a second station so that its catchment covers the power station. The station window will list Coal under Accepts when it does.', done: () => !!myStationNear(ctx.plant, 'coal', true), focus: 'plant' },
    { title: 'Lay the track', text: 'Choose the <b>track</b> tool (the curving rails). Drag from the end of one platform toward the other station. Drags go straight or diagonal. Build a line in a few drags and connect it to both platform ends. Hold Ctrl to remove pieces. Bridges cross rivers and roads.', hl: '[data-win="build-rail"] [data-v="rail"]', done: () => connected(myStationNear(ctx.mine), myStationNear(ctx.plant, 'coal', true)) },
    { title: 'Build a depot', text: 'Trains are bought and serviced at a depot. Choose the <b>depot</b> tool and click a free tile right beside your track. It turns to face the line and joins up by itself.', hl: '[data-win="build-rail"] [data-v="depot"]', done: () => g().depots.some(d => d && d.owner === g().player && d.kind === 0 && HL.Rail.next(g(), { owner: g().player, need: 0 }, { k: 3, t: d.t, p: (d.dir & 1) ? 0 : 1, d: HL.PIECE_EDGES[(d.dir & 1) ? 0 : 1][0] === HL.opp(d.dir) ? 0 : 1 }).length > 0) },
    { title: 'Buy a train', text: 'Click your depot, then <b>New engines &amp; wagons</b>. Buy a locomotive, then switch to the Wagons tab and add three or four <b>Coal Hoppers</b>.', done: () => { const v = myTrain(); return v && v.holds.filter(h => h.c === 'coal').length >= 2; } },
    { title: 'Give it orders', text: 'Open the train (click it in the depot list, then Open), go to the <b>Orders</b> tab, press <b>Add</b> and click the mine\'s station and then the power station. Select the first order and set it to <b>Full load</b> so the train waits for a full load of coal.', done: () => { const v = myTrain(); if (!v) return false; const l = HL.Veh.orderList(g(), v); return l.length >= 2 && l.some(o => o.load === 1); } },
    { title: 'Start the train', text: 'Press <b>Start</b> in the train window. It will leave the depot, collect coal, and deliver it.', done: () => { const v = myTrain(); return v && !v.inDepot; } },
    { title: 'Your first delivery', text: 'Speed the game up with the buttons on the bottom right (or keys 2 and 3) and watch for the first delivery. Payment depends on distance and journey time.', done: () => (g().companies[g().player].deliveredTotal.coal || 0) > 0 },
    { title: 'Money in the bank', text: 'That is your company working. A few more things to know:<br><br><b>Buses</b>: build two drive-through bus stops on town roads with the road toolbar, a road depot, and a bus with orders between the stops.<br><b>Signals</b> let several trains share one line safely.<br><b>Finances</b> and <b>graphs</b> show where money comes from. Old vehicles break down more often, so replace them in time.', next: true, finish: true },
  ];
  Tut.start = function () {
    HL.Audio && HL.Audio.init();
    const g0 = HL.Game.create({ w: 80, h: 80, seed: 'TUTORIAL7', climate: 'temperate', startYear: 1932, aiCount: 0, terrain: 0, sea: 1, towns: 2, industries: 2, difficulty: 'easy', companyName: 'Hinterline Transport' });
    // pick a mine and a power station a sensible distance apart (place one if needed)
    const mines = g0.industries.filter(i => i && i.type === 'coal_mine');
    let best = null;
    for (const a of mines) for (const b of g0.industries.filter(i => i && i.type === 'power_plant')) { const d = HL.manh(a.x, a.y, b.x, b.y); if (d >= 14 && d <= 32 && (!best || Math.abs(d - 20) < Math.abs(best.d - 20))) best = { a, b, d }; }
    if (!best && mines[0]) {
      const a = mines[0];
      for (let k = 0; k < 300 && !best; k++) { const ang = k * 0.7, x = Math.round(a.x + Math.cos(ang) * 18), y = Math.round(a.y + Math.sin(ang) * 18); const p = HL.Ind.tryPlace(g0, 'power_plant', x, y, g0.rng, {}); if (p) best = { a, b: p, d: HL.manh(a.x, a.y, p.x, p.y) }; }
    }
    if (!best) { UI.toast('Could not set up the tutorial world'); return; }
    ctx = { mine: best.a, plant: best.b };
    g0.tutorial = true;
    g0.companies[g0.player].money = g0.companies[g0.player].loan = 300000;
    HL.G.startGame(g0, false);
    HL.G.snapTo((best.a.x + best.b.x) / 2 + 1, (best.a.y + best.b.y) / 2 + 1);
    R.cam.z = HL.G.zoomTarget = 0.9;
    Tut.active = true; Tut.step = 0;
    render();
  };
  Tut.stop = function () { Tut.active = false; ctx = null; const el = document.getElementById('tutor'); el.style.display = 'none'; UI.$$('.hl').forEach(e => e.classList.remove('hl')); };
  function render() {
    const el = document.getElementById('tutor');
    const s = STEPS[Tut.step];
    el.style.display = 'block';
    el.innerHTML = `<div class="step">STEP ${Tut.step + 1} OF ${STEPS.length}</div><h4>${s.title}</h4><p>${s.text}</p><div class="row" style="justify-content:space-between">${UI.btn('Leave tutorial', 'tq')}${s.next ? UI.btn(s.finish ? 'Finish' : 'Next', 'tn', { cls: 'primary' }) : `<span class="dim" style="font-size:12px">Waiting for you…</span>`}</div>`;
    el.onclick = (e) => {
      const a = e.target.closest('[data-a]'); if (!a) return;
      if (a.dataset.a === 'tq') Tut.stop();
      if (a.dataset.a === 'tn') advance();
    };
    UI.$$('.hl').forEach(e => e.classList.remove('hl'));
    if (s.focus === 'mine') HL.G.centerOn(ctx.mine.x + 2, ctx.mine.y + 1);
    if (s.focus === 'plant') HL.G.centerOn(ctx.plant.x + 1, ctx.plant.y + 1);
    if (s.focus === 'both') HL.G.centerOn((ctx.mine.x + ctx.plant.x) / 2 + 1, (ctx.mine.y + ctx.plant.y) / 2 + 1);
  }
  function advance() {
    const s = STEPS[Tut.step];
    if (s.finish) { HL.Meta.tutorialDone = true; HL.Meta.save(); Tut.stop(); UI.toast('Tutorial complete. The world is yours.', 'info'); return; }
    Tut.step++;
    if (HL.Audio) HL.Audio.ui('ach');
    render();
  }
  Tut.tick = function () {
    if (!Tut.active || !ctx) return;
    if (!g().tutorial) { Tut.stop(); return; }
    const s = STEPS[Tut.step];
    if (s.hl) { const el = UI.$(s.hl); UI.$$('.hl').forEach(e => { if (e !== el) e.classList.remove('hl'); }); if (el) el.classList.add('hl'); }
    if (s.done && s.done()) advance();
  };
  // gold markers over the industries involved
  Tut.drawMarker = function (cx) {
    if (!Tut.active || !ctx) return;
    const t = performance.now() / 300;
    for (const ind of [ctx.mine, ctx.plant]) {
      const [sx, sy] = R.tileToScreen(ind.x + ind.w / 2, ind.y + ind.h / 2);
      const y = sy - 70 * Math.min(1.4, R.cam.z) - Math.sin(t) * 5;
      cx.fillStyle = '#e6c472'; cx.strokeStyle = '#3a2a10'; cx.lineWidth = 2;
      cx.beginPath(); cx.moveTo(sx, y + 18); cx.lineTo(sx - 10, y); cx.lineTo(sx + 10, y); cx.closePath(); cx.fill(); cx.stroke();
      cx.font = '600 13px "Barlow Condensed", sans-serif'; cx.textAlign = 'center';
      const label = ind === ctx.mine ? 'Coal mine' : 'Power station';
      const w = cx.measureText(label).width + 12;
      cx.fillStyle = 'rgba(22,27,24,0.9)'; cx.fillRect(sx - w / 2, y - 22, w, 18);
      cx.fillStyle = '#e6c472'; cx.fillText(label, sx, y - 12);
      cx.textAlign = 'left';
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
