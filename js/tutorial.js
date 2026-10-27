// Guided tutorial in five parts: finding your way, how money is made, a coal railway, running the business, a bus line.
// Also HL.Tips: one-off hints in normal games for players who skipped the tutorial.
(function (root) {
  const HL = root.HL, UI = HL.UI, R = HL.R;
  const Tut = HL.Tutorial = { active: false, step: 0 };
  const g = () => HL.G.g;
  let ctx = null; // {mine, plant, town}
  let st = {}; // per-step scratch: camera start, pause seen...
  let min = false; // panel collapsed

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
  const mineSt = () => myStationNear(ctx.mine);
  const plantSt = () => myStationNear(ctx.plant, 'coal', true);
  const myTrain = () => g().vehicles.find(v => v && v.owner === g().player && v.kind === 'rail');
  const myBus = () => g().vehicles.find(v => v && v.owner === g().player && v.kind === 'road' && v.holds.some(h => h.c === 'pax'));
  const busStops = () => g().stations.filter(s => s && s.owner === g().player && (s.fac & HL.Stations.FAC.bus) && HL.manh(s.x, s.y, ctx.town.x, ctx.town.y) <= ctx.town.radius + 4);
  const orders = v => v ? HL.Veh.orderList(g(), v) : [];
  const railDepotOk = () => g().depots.some(d => d && d.owner === g().player && d.kind === 0 && HL.Rail.next(g(), { owner: g().player, need: 0 }, { k: 3, t: d.t, p: (d.dir & 1) ? 0 : 1, d: HL.PIECE_EDGES[(d.dir & 1) ? 0 : 1][0] === HL.opp(d.dir) ? 0 : 1 }).length > 0);
  const roadDepot = () => g().depots.some(d => d && d.owner === g().player && d.kind === 1);
  // world pixels; a glide the tutorial itself started doesn't count
  const camMoved = () => { if (HL.G.camTarget && HL.G.followVeh == null) { st.cx = R.cam.x; st.cy = R.cam.y; return false; } return Math.hypot(R.cam.x - st.cx, R.cam.y - st.cy) > 60; };

  const PARTS = ['Finding your way', 'How you earn money', 'Build a railway', 'Running the business', 'Passengers by bus'];
  // part: index into PARTS. next: read-only step with a Next button. done(): action step, advances by itself.
  // checks: [label, fn] sub-tasks ticked off as you go. hl: element to point at. focus/mark: what to show on the map.
  const STEPS = [
    { part: 0, title: 'Welcome to Hinterline', next: true, focus: 'both',
      text: () => `You run a new transport company. You make money by carrying things that need to move: coal to power stations, passengers between towns, and much more.<br><br>This tutorial has five short parts and takes about fifteen minutes. First you'll build a coal railway, then a bus line. You can leave at any time and restart it from the title screen.` },
    { part: 0, title: 'Look around', begin: () => { st.cx = R.cam.x; st.cy = R.cam.y; st.cz = R.cam.z; },
      text: () => `Hold the <b>right mouse button</b> and drag to move the map. Left-drag also works when no tool is selected, and so do the arrow keys.<br><br>Scroll the <b>mouse wheel</b> to zoom in and out.`,
      checks: [['Move the map', () => st.moved || (st.moved = camMoved())], ['Zoom in or out', () => st.zoomed || (st.zoomed = Math.abs(R.cam.z - st.cz) > 0.08)]] },
    { part: 0, title: 'The bar along the bottom', next: true, hl: '#status',
      text: () => `<b>Left:</b> today's date and your bank balance. Click the balance to see your finances.<br><b>Middle:</b> the latest news. Click it to jump to the place it mentions.<br><b>Right:</b> pause and game speed.<br><br>The bank has lent you £300,000 to get started. You pay a little interest on it every month.` },
    { part: 0, title: 'Stop the clock', hl: '#st-speed', begin: () => { st.sawPause = false; },
      text: () => `Time only passes while the game runs. Press <b>Space</b> (or the pause button) to stop the clock, then press it again to carry on.<br><br>You can still build and plan while the game is paused, so pause whenever you need to think.`,
      checks: [['Pause the game', () => st.sawPause || (st.sawPause = g().paused)], ['Carry on', () => st.sawPause && !g().paused]] },
    { part: 0, title: 'The toolbar', next: true, hl: '#toolbar',
      text: () => `Everything else lives in the toolbar at the top. From left to right:<ul><li><b>Game</b>: pause, menu, save</li><li><b>Information</b>: map, towns, industries, subsidies</li><li><b>Your company</b>: finances, graphs, league table</li><li><b>Your vehicles</b>: trains, road vehicles, ships, aircraft</li><li><b>Construction</b>: rail, road, docks, airports, landscaping, demolish</li><li><b>News and help</b></li></ul>Hover over any button to see what it does.` },

    { part: 1, title: 'Visit the coal mine', focus: 'mine', mark: ['mine'],
      text: () => `A gold marker points at a coal mine. Click on the mine's buildings to open its window.`,
      done: () => UI.isOpen('ind' + ctx.mine.id) },
    { part: 1, title: 'Nobody is collecting', next: true, mark: ['mine'],
      text: () => `The window shows how much coal the mine produced last month and how much of it was transported. Right now that's nothing.<br><br>Cargo only leaves an industry when one of your stations is close enough <b>and</b> a vehicle has called there to load. Until then it goes to waste.` },
    { part: 1, title: 'Visit the power station', focus: 'plant', mark: ['plant'],
      text: () => `The other marker points at a power station. Click on it.`,
      done: () => UI.isOpen('ind' + ctx.plant.id) },
    { part: 1, title: 'Supply and demand', next: true, focus: 'both',
      text: () => `The power station lists <b>Coal</b> under what it accepts. So coal mine → power station is a route that pays.<br><br>You're paid for each delivery by how much you carry, how far it goes and how quickly it gets there. Longer, faster routes pay more per load.<br><br>Most industries form chains. Raw materials like coal, timber or grain go to industries that use them, some of those make goods that towns buy, and towns make passengers and mail.` },

    { part: 2, title: 'Open the railway toolbar', hl: '[data-tb="build:rail"]', focus: 'both',
      text: () => `Close the industry windows if they're in the way. Then click the <b>railway</b> button on the toolbar (or press R).`,
      done: () => UI.isOpen('build-rail') },
    { part: 2, title: 'A station by the mine', hl: '[data-win="build-rail"] [data-v="station"]', focus: 'mine', mark: ['mine'],
      text: () => `Pick the <b>station</b> tool (the canopy icon). One platform of length 4 is plenty.<br><br>As you move the mouse, <b>blue shading</b> shows the station's catchment: the area it collects cargo from and delivers to. Place the station so the shading covers part of the mine. Press <b>R</b> to turn it if it doesn't fit.`,
      done: () => !!mineSt() },
    { part: 2, title: 'A station by the power station', focus: 'plant', mark: ['plant'],
      text: () => `Now build a second station whose blue shading covers the power station. Line it up with the first one if you can, so the track between them can run straight.`,
      done: () => !!plantSt() },
    { part: 2, title: 'Lay the track', hl: '[data-win="build-rail"] [data-v="rail"]', focus: 'both',
      text: () => `Choose the <b>track</b> tool (the curving rails), then click and drag to lay track. Each drag goes straight or diagonally, so build the line in a few pieces.<br><br>Trains enter a platform at its <b>ends</b>, not its sides. Start at the end of one platform and finish at the end of the other.<br><br>Made a mistake? Hold <b>Ctrl</b> and drag over it to take it up. Use the bridge tool to cross rivers and roads.`,
      status: () => st.linked ? '' : 'The stations aren\'t joined by track yet.',
      done: () => (st.linked = connected(mineSt(), plantSt())) },
    { part: 2, title: 'Build a depot', hl: '[data-win="build-rail"] [data-v="depot"]',
      text: () => `Trains are bought and serviced at a depot. Choose the <b>depot</b> tool and click a free tile right beside your track. It turns to face the line and joins up by itself.`,
      done: railDepotOk },
    { part: 2, title: 'Buy a train',
      text: () => `Right-click once to put the depot tool away. Then click your depot to open it and press <b>New engines &amp; wagons</b>. Buy a locomotive first.<br><br>Then switch to the <b>Wagons &amp; coaches</b> tab, pick the <b>Coal Hopper</b> and add three or four. They attach to the engine you just bought.`,
      checks: [['Buy a locomotive', () => !!myTrain()], ['Add at least two coal hoppers', () => { const v = myTrain(); return !!v && v.holds.filter(h => h.c === 'coal').length >= 2; }]] },
    { part: 2, title: 'Give it orders',
      text: () => `Orders tell a vehicle where to go. In the depot window, click your train and press <b>Open</b>. Go to the <b>Orders</b> tab, press <b>Add</b>, then click the mine's station and then the power station's.<br><br>Click the first order, then click its load button until it says <b>Full load</b>. The train will then wait at the mine until every wagon is full, so it never runs half empty.`,
      checks: [['Order to the mine\'s station', () => orders(myTrain()).length >= 1], ['Order to the power station', () => orders(myTrain()).length >= 2], ['Full load at the mine', () => orders(myTrain()).some(o => o.load === 1)]] },
    { part: 2, title: 'Start the train',
      text: () => `Press <b>Start</b> in the train window. It will leave the depot and head for the mine.`,
      done: () => { const v = myTrain(); return !!v && !v.inDepot; } },

    { part: 3, title: 'Waiting for coal', hl: '#st-speed', focus: 'mine',
      text: () => `Your train is on its way. The first load takes a while, so speed things up with the fast-forward buttons or keys <b>2</b> and <b>3</b>.<br><br>Click the train to follow it, or click the mine's station to see the coal waiting there.`,
      done: () => (g().companies[g().player].deliveredTotal.coal || 0) > 0 },
    { part: 3, title: 'Paid in full', next: true,
      text: () => `That was your first delivery. The income floated up from the power station when the coal arrived.<br><br>The train also costs money: running costs every year, plus servicing. Old vehicles break down more often, so replace them before they get too old.<br><br>You might want to slow the game down again with key <b>1</b>.` },
    { part: 3, title: 'Check your finances', hl: '#st-money',
      text: () => `Click your bank balance in the bottom bar, or press <b>F</b>.`,
      done: () => UI.isOpen('fin') },
    { part: 3, title: 'Reading the accounts', next: true,
      text: () => `This window splits each year's money into income and costs. The <b>loan</b> controls are here too. Borrow more to build faster, and pay it back when you can to save interest.<br><br>A company does well when its income beats running costs, maintenance and interest. The vehicle lists show each vehicle's profit this year and last, so you can spot ones that lose money.` },
    { part: 3, title: 'How to grow', next: true,
      text: () => `To earn more, add trains to busy routes, connect more industries, and carry passengers between towns.<br><br>Industries you serve well tend to grow. Ones nobody serves may shrink and close.<br><br>Two trains on one line need <b>signals</b> so they don't run into each other. The signal tool is in the railway toolbar, and hovering over it explains the types.` },

    { part: 4, title: 'Visit a town', focus: 'town', mark: ['town'],
      text: () => `A marker points at <b>${UI.esc(ctx.town.name)}</b>. Click one of its buildings or its name to open the town window.`,
      done: () => UI.isOpen('town' + ctx.town.id) },
    { part: 4, title: 'Towns and their councils', next: true, mark: ['town'],
      text: () => `Bigger towns produce more passengers and mail, and towns grow faster when they're well served.<br><br>Each town council rates your company. Knocking down buildings or trees lowers the rating, and good service raises it. If it drops too low, the council won't let you build there.` },
    { part: 4, title: 'Two bus stops', hl: () => UI.isOpen('build-road') ? '[data-win="build-road"] [data-v="busstop"]' : '[data-tb="build:road"]', focus: 'town', mark: ['town'],
      text: () => `Open the <b>road</b> toolbar (or press T) and choose the <b>bus stop</b> tool. Click on a town road to build a drive-through stop.<br><br>Build two stops in different parts of town, a few streets apart. Like stations, bus stops have a catchment: more houses inside it means more passengers.`,
      checks: [['Open the road toolbar', () => st.roadOpen || (st.roadOpen = UI.isOpen('build-road'))], ['First bus stop', () => busStops().length >= 1], ['Second bus stop', () => busStops().length >= 2]] },
    { part: 4, title: 'A road depot', hl: '[data-win="build-road"] [data-v="roaddepot"]', focus: 'town',
      text: () => `Choose the road <b>depot</b> tool and click a free tile next to a road. Its door turns to face the road.`,
      done: roadDepot },
    { part: 4, title: 'Buy a bus',
      text: () => `Right-click to put the depot tool away, open the road depot and press <b>New vehicles</b>. Buy a bus: any vehicle that carries passengers, such as an omnibus or motor coach. Give it orders to your two stops, the same way as the train. Passengers don't need a full load, so leave the orders as they are. Then press <b>Start</b>.`,
      checks: [['Buy a bus', () => !!myBus()], ['Orders to both stops', () => orders(myBus()).length >= 2], ['Start it', () => { const v = myBus(); return !!v && !v.inDepot; }]] },
    { part: 4, title: 'Over to you', next: true, finish: true,
      text: () => `You've built a railway and a bus line. That's the heart of Hinterline.<br><br>Some ideas for what to try next:<ul><li>Find more routes with the <b>Industries</b> directory on the toolbar.</li><li>Press <b>F1</b> at any time for the controls and help.</li><li>Try a <b>Scenario</b> from the title screen for goals to aim at, or found your own company in a new world.</li></ul>This map is yours to keep playing.` },
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
    const town = g0.towns.filter(Boolean).sort((a, b) => b.pop - a.pop)[0];
    ctx = { mine: best.a, plant: best.b, town };
    g0.tutorial = true;
    g0.companies[g0.player].money = g0.companies[g0.player].loan = 300000;
    HL.G.startGame(g0, false);
    HL.G.snapTo((best.a.x + best.b.x) / 2 + 1, (best.a.y + best.b.y) / 2 + 1);
    R.cam.z = HL.G.zoomTarget = 0.9;
    Tut.active = true; Tut.step = 0; min = false;
    enter();
  };
  Tut.stop = function () { Tut.active = false; ctx = null; const el = document.getElementById('tutor'); el.style.display = 'none'; UI.$$('.hl').forEach(e => e.classList.remove('hl')); };

  function enter() {
    st = {};
    const s = STEPS[Tut.step];
    if (s.focus === 'mine') HL.G.centerOn(ctx.mine.x + 2, ctx.mine.y + 1);
    if (s.focus === 'plant') HL.G.centerOn(ctx.plant.x + 1, ctx.plant.y + 1);
    if (s.focus === 'both') HL.G.centerOn((ctx.mine.x + ctx.plant.x) / 2 + 1, (ctx.mine.y + ctx.plant.y) / 2 + 1);
    if (s.focus === 'town') HL.G.centerOn(ctx.town.x + 0.5, ctx.town.y + 0.5);
    // camera moves above shouldn't count as the player looking around
    if (s.begin) s.begin();
    render();
  }
  // the panel is redrawn only when something it shows changes, so buttons stay clickable
  let shown = '';
  function render() {
    const el = document.getElementById('tutor');
    const s = STEPS[Tut.step];
    const inPart = STEPS.filter(x => x.part === s.part), k = inPart.indexOf(s);
    const checks = s.checks ? s.checks.map(([l, f]) => [l, !!f()]) : null;
    const status = s.status ? s.status() : '';
    const prev = STEPS[Tut.step - 1];
    const back = prev && prev.next && !s.finish;
    const key = [Tut.step, min, status, checks && checks.map(c => c[1]).join()].join('|');
    if (key === shown && el.style.display === 'block') return;
    shown = key;
    el.style.display = 'block';
    el.classList.toggle('min', min);
    const head = `<div class="tut-head"><div class="step">PART ${s.part + 1} OF ${PARTS.length} · ${PARTS[s.part].toUpperCase()}</div><button class="wbtn" data-a="tmin" data-tip="${min ? 'Show' : 'Hide'} the tutorial">${min ? '+' : '–'}</button></div>`;
    if (min) { el.innerHTML = head + `<h4>${s.title}</h4>`; }
    else el.innerHTML = head
      + `<div class="pips">${inPart.map((x, i) => `<i class="${i < k ? 'did' : i === k ? 'cur' : ''}"></i>`).join('')}</div>`
      + `<h4>${s.title}</h4><div class="tut-text">${s.text()}</div>`
      + (checks ? `<ul class="checks">${checks.map(([l, ok]) => `<li class="${ok ? 'ok' : ''}">${l}</li>`).join('')}</ul>` : '')
      + (status ? `<p class="tut-status">${status}</p>` : '')
      + `<div class="row" style="justify-content:space-between;margin-top:10px">${UI.btn('Leave tutorial', 'tq')}<span class="row" style="gap:6px">${back ? UI.btn('Back', 'tb') : ''}${s.next ? UI.btn(s.finish ? 'Finish' : 'Next', 'tn', { cls: 'primary' }) : `<span class="dim" style="font-size:12px">Your turn…</span>`}</span></div>`;
    el.onclick = (e) => {
      const a = e.target.closest('[data-a]'); if (!a) return;
      if (a.dataset.a === 'tq') UI.confirm('Leave the tutorial?', 'You can keep playing this map. The tutorial restarts from the beginning on the title screen.', () => Tut.stop(), { yes: 'Leave', no: 'Stay' });
      if (a.dataset.a === 'tn') advance();
      if (a.dataset.a === 'tb') { Tut.step--; enter(); }
      if (a.dataset.a === 'tmin') { min = !min; render(); }
    };
  }
  function advance() {
    const s = STEPS[Tut.step];
    if (s.finish) { HL.Meta.tutorialDone = true; HL.Meta.save(); Tut.stop(); UI.toast('Tutorial complete. The world is yours.', 'info'); return; }
    Tut.step++;
    if (HL.Audio) HL.Audio.ui('ach');
    enter();
  }
  Tut.tick = function () {
    if (!Tut.active || !ctx) return;
    if (!g().tutorial) { Tut.stop(); return; }
    const s = STEPS[Tut.step];
    const sel = typeof s.hl === 'function' ? s.hl() : s.hl;
    const hel = sel && !min ? UI.$(sel) : null;
    UI.$$('.hl').forEach(e => { if (e !== hel) e.classList.remove('hl'); });
    if (hel) hel.classList.add('hl');
    const finished = s.done ? s.done() : s.checks ? s.checks.every(([, f]) => f()) : false;
    render();
    if (finished) {
      // let the last tick show before moving on
      if (s.checks && !st.pending) { st.pending = true; setTimeout(() => { if (Tut.active && STEPS[Tut.step] === s) advance(); }, 700); }
      else if (!s.checks) advance();
    }
  };
  // gold markers over the places the current step is about
  Tut.drawMarker = function (cx) {
    if (!Tut.active || !ctx) return;
    const s = STEPS[Tut.step];
    const marks = s.mark || (s.part === 4 ? ['town'] : ['mine', 'plant']);
    const t = performance.now() / 300;
    for (const k of marks) {
      const o = ctx[k];
      const [sx, sy] = k === 'town' ? R.tileToScreen(o.x + 0.5, o.y + 0.5) : R.tileToScreen(o.x + o.w / 2, o.y + o.h / 2);
      const y = sy - 70 * Math.min(1.4, R.cam.z) - Math.sin(t) * 5;
      cx.fillStyle = '#e6c472'; cx.strokeStyle = '#3a2a10'; cx.lineWidth = 2;
      cx.beginPath(); cx.moveTo(sx, y + 18); cx.lineTo(sx - 10, y); cx.lineTo(sx + 10, y); cx.closePath(); cx.fill(); cx.stroke();
      cx.font = '600 13px "Barlow Condensed", sans-serif'; cx.textAlign = 'center';
      const label = k === 'mine' ? 'Coal mine' : k === 'plant' ? 'Power station' : o.name;
      const w = cx.measureText(label).width + 12;
      cx.fillStyle = 'rgba(22,27,24,0.9)'; cx.fillRect(sx - w / 2, y - 22, w, 18);
      cx.fillStyle = '#e6c472'; cx.fillText(label, sx, y - 12);
      cx.textAlign = 'left';
    }
  };
  Tut.steps = STEPS; Tut.ctx = () => ctx; // for the dev harness

  // ---------- tips for normal games ----------
  // Each fires once per profile, only when its situation comes up. Can be turned off in Settings.
  const Tips = HL.Tips = {};
  const TIPS = {
    start: { title: 'Getting started', text: 'A good first route is coal from a mine to a power station 15 to 30 tiles away. Open the <b>Industries</b> directory on the toolbar to find one.<br><br>New to this? The <b>Tutorial</b> on the title screen walks you through it step by step.' },
    noVehicle: { title: 'Stations need vehicles', text: 'A station only starts collecting cargo after one of your vehicles has called there to load. Build a depot beside your line and buy a vehicle there.' },
    noOrders: { title: 'Waiting in the depot', text: 'A new vehicle stays in its depot until it has orders and is started. Open it, add stops on the <b>Orders</b> tab, then press <b>Start</b>.' },
    signals: { title: 'Two trains, one line', text: 'Trains sharing track need <b>signals</b>, or they can run into each other. Build a passing loop or a second track, and place signals from the railway toolbar.' },
    broke: { title: 'In the red', text: 'Your bank balance is below zero. You can borrow more in the <b>Finances</b> window (press F), and sell vehicles that are losing money. If you stay in debt too long, the company goes bankrupt.' },
    breakdown: { title: 'A breakdown', text: 'Vehicles break down now and then, and more often as they age. Regular depot visits keep them reliable, and <b>autorenew</b> replaces old ones for you.' },
    loss: { title: 'Some vehicles lost money', text: 'At least one of your vehicles made a loss last year. Sort a vehicle list by profit to find them. A route may be too short, or the vehicle may be running half empty.' },
  };
  const seen = () => HL.Meta.tipsSeen || (HL.Meta.tipsSeen = {});
  const on = () => { const gg = g(); return gg && !gg.demo && !gg.tutorial && !HL.G.headless && HL.Meta.settings.tips !== false; };
  Tips.show = function (id) {
    if (!on() || seen()[id] || !TIPS[id] || (id === 'start' && HL.Meta.tutorialDone)) return;
    seen()[id] = true; HL.Meta.save();
    const el = document.getElementById('tipcard') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'tipcard', className: 'lined' }));
    el.innerHTML = `<div class="step">TIP</div><h4>${TIPS[id].title}</h4><p>${TIPS[id].text}</p><div class="row" style="justify-content:space-between">${UI.btn('No more tips', 'off')}${UI.btn('Got it', 'ok', { cls: 'primary' })}</div>`;
    el.style.display = 'block';
    el.onclick = (e) => {
      const a = e.target.closest('[data-a]'); if (!a) return;
      if (a.dataset.a === 'off') { HL.Meta.settings.tips = false; HL.Meta.save(); }
      el.style.display = 'none';
    };
    if (HL.Audio) HL.Audio.ui('news');
  };
  Tips.hide = () => { const el = document.getElementById('tipcard'); if (el) el.style.display = 'none'; };
  let since = {};
  Tips.tick = function () {
    if (!on()) return;
    const gg = g(), me = gg.player, now = gg.date;
    const mine = gg.vehicles.filter(v => v && v.owner === me);
    const sts = gg.stations.some(s => s && s.owner === me);
    // conditions must hold for a while before the tip appears
    const hold = (id, cond, days) => { if (!cond) { delete since[id]; return; } if (since[id] == null) since[id] = now; if (now - since[id] >= days) Tips.show(id); };
    hold('noVehicle', sts && !mine.length, 45);
    hold('noOrders', mine.some(v => v.inDepot && !HL.Veh.orderList(gg, v).length), 20);
    hold('broke', gg.companies[me].money < 0, 3);
  };
  Tips.reset = () => { since = {}; Tips.hide(); };
  HL.on('leaveDepot', (v) => { const gg = g(); if (!gg || v.owner !== gg.player || v.kind !== 'rail') return; if (gg.vehicles.filter(x => x && x.owner === gg.player && x.kind === 'rail' && !x.inDepot).length >= 2) Tips.show('signals'); });
  HL.on('breakdown', (v) => { const gg = g(); if (gg && v.owner === gg.player) Tips.show('breakdown'); });
  HL.on('year', (gg) => { if (gg === g() && gg.vehicles.some(v => v && v.owner === gg.player && v.profitLastYear < 0 && v.age > 365)) Tips.show('loss'); });
})(typeof window !== 'undefined' ? window : globalThis);
