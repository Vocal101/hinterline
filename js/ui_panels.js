// Toolbar, status bar, build palettes, company/finance/graph windows, directories, minimap, settings.
(function (root) {
  const HL = root.HL, UI = HL.UI, R = HL.R;
  const W = HL.W;
  const g = () => HL.G.g;
  const esc = s => UI.esc(s);
  const Tools = () => HL.Tools;

  // ---------- main toolbar ----------
  const TB = [
    [['pause', 'pause', 'Pause (Space)'], ['gear', 'menu', 'Game menu: save, load, settings (Esc)'], ['ledger', 'saveload', 'Save or load a game']],
    [['map', 'minimap', 'Minimap (M)'], ['town', 'towns', 'Town directory'], ['factory', 'industries', 'Industry directory and funding'], ['ribbon', 'subsidies', 'Subsidies']],
    [['coins', 'finances', 'Finances (F)'], ['company', 'company', 'Company'], ['graph', 'graphs', 'Graphs (G)'], ['trophy', 'league', 'League table and goals']],
    [['train', 'list:rail', 'Trains'], ['bus', 'list:road', 'Road vehicles'], ['ship', 'list:ship', 'Ships'], ['plane', 'list:air', 'Aircraft']],
    [['rail', 'build:rail', 'Build railways (R)'], ['road', 'build:road', 'Build roads (T)'], ['anchor', 'build:water', 'Build docks and buoys (B)'], ['tower', 'build:air', 'Build airports (A)'], ['terrain', 'build:land', 'Landscaping (L)'], ['dozer', 'tool:demolish', 'Demolish (Del)'], ['query', 'tool:query', 'Land information (Q)']],
    [['news', 'news', 'News history'], ['help', 'help', 'Controls and help (F1)']],
  ];
  UI.buildToolbar = function () {
    const el = document.getElementById('toolbar');
    el.innerHTML = TB.map(gr => `<div class="tb-group">${gr.map(([ic, act, tip]) => `<button class="tbtn" data-tb="${act}" ${act.startsWith('tool:') ? `data-tool="${act.slice(5)}"` : ''} data-tip="${tip}" aria-label="${tip}">${UI.ICON[ic]}</button>`).join('')}</div>`).join('');
    el.addEventListener('click', (e) => { const b = e.target.closest('[data-tb]'); if (b) { if (HL.Audio) HL.Audio.ui('click'); UI.tb(b.dataset.tb); } });
  };
  UI.tb = function (act) {
    const [a, arg] = act.split(':');
    switch (a) {
      case 'pause': HL.G.togglePause(); break;
      case 'menu': UI.gameMenu(); break;
      case 'saveload': HL.W.saveLoad(); break;
      case 'minimap': UI.toggle('minimap', W.minimap); break;
      case 'towns': UI.toggle('towns', W.towns); break;
      case 'industries': UI.toggle('industries', W.industries); break;
      case 'subsidies': UI.toggle('subsidies', W.subsidies); break;
      case 'finances': UI.toggle('fin', () => W.finances()); break;
      case 'company': UI.toggle('company' + g().player, () => W.company(g().player)); break;
      case 'graphs': UI.toggle('graphs', W.graphs); break;
      case 'league': UI.toggle('league', W.league); break;
      case 'list': UI.toggle('vlist-' + arg, () => W.vehList(arg)); break;
      case 'build': UI.toggle('build-' + arg, () => W.buildBar(arg)); break;
      case 'tool': Tools().set(arg); break;
      case 'news': UI.toggle('newslog', W.newsLog); break;
      case 'help': UI.toggle('help', W.help); break;
    }
    UI.syncToolbar();
  };
  UI.syncToolbar = function () {
    const gg = g(); if (!gg) return;
    UI.$$('[data-tb]').forEach(b => {
      const a = b.dataset.tb;
      let on = false;
      if (a === 'pause') on = gg.paused;
      else if (a.startsWith('build:')) on = UI.isOpen('build-' + a.slice(6));
      else if (a.startsWith('list:')) on = UI.isOpen('vlist-' + a.slice(5));
      else if (a.startsWith('tool:')) on = Tools().cur === a.slice(5);
      else if (a === 'minimap') on = UI.isOpen('minimap');
      else if (a === 'finances') on = UI.isOpen('fin');
      else if (a === 'graphs') on = UI.isOpen('graphs');
      else if (a === 'news') on = UI.isOpen('newslog');
      b.classList.toggle('on', on);
    });
  };

  // ---------- status bar ----------
  UI.buildStatus = function () {
    const el = document.getElementById('status');
    el.innerHTML = `<div id="st-date" class="num"></div><div id="st-money" class="num" data-tip="Bank balance. Click for finances."></div><div id="st-news"></div>
      <div id="st-speed">${[['pause', 0, 'Pause'], ['play', 1, 'Normal speed (1)'], ['ff', 2, 'Fast (2)'], ['fff', 3, 'Very fast (3)'], ['fff', 4, 'Fastest (4)']].map(([ic, s, tip]) => `<button data-speed="${s}" data-tip="${tip}">${UI.ICON[ic]}${s === 4 ? '<span style="font:600 10px var(--f-num);margin-left:-4px">+</span>' : ''}</button>`).join('')}</div>
      <div id="st-env"></div>`;
    el.querySelector('#st-money').onclick = () => UI.tb('finances');
    el.querySelector('#st-news').onclick = () => { const n = g().news[g().news.length - 1]; if (n) HL.News.focus(n); };
    el.querySelector('#st-speed').addEventListener('click', (e) => { const b = e.target.closest('[data-speed]'); if (!b) return; const s = +b.dataset.speed; if (s === 0) HL.G.togglePause(); else HL.G.setSpeed(s); });
  };
  let lastStatus = '';
  UI.updateStatus = function () {
    const gg = g(); if (!gg) return;
    const c = gg.companies[gg.player];
    const d = HL.ymd(gg.date);
    const date = `${d.d} ${HL.MNAMES[d.m]} ${d.y}`;
    const money = HL.fmtMoney(c.money);
    const env = R.env;
    const envIcon = env.rain > 0.1 ? 'rain' : env.snow > 0.1 ? 'snow' : env.dark > 0.4 ? 'moon' : 'sun';
    const season = gg.opts.climate === 'desert' ? '' : ['Spring', 'Summer', 'Autumn', 'Winter'][env.season];
    const key = date + money + envIcon + season + gg.paused + gg.speed;
    if (key === lastStatus) return;
    lastStatus = key;
    document.getElementById('st-date').textContent = date;
    const me = document.getElementById('st-money'); me.textContent = money; me.className = 'num' + (c.money < 0 ? ' bad' : '');
    document.getElementById('st-env').innerHTML = `${UI.ICON[envIcon]}<span>${season}</span>`;
    UI.$$('#st-speed [data-speed]').forEach(b => { const s = +b.dataset.speed; b.classList.toggle('on', s === 0 ? gg.paused : !gg.paused && gg.speed === s); });
    UI.syncToolbar();
  };

  // ---------- build palettes ----------
  const PAL = {
    rail: { title: 'Railway Construction', tools: [['autorail', 'rail', 'Build track: drag along a line or diagonal. Ctrl-drag removes.'], ['depot', 'depot', 'Train depot: faces the nearest track'], ['station', 'station', 'Railway station'], ['signal', 'signal', 'Signals: click track to place or flip. Drag along track to place a series. Ctrl-click removes.'], ['bridge', 'bridge', 'Bridge: drag from one bank to the other'], ['tunnel', 'tunnel', 'Tunnel: click a straight hillside'], ['bolt', 'convert', 'Convert rail type: drag over track'], ['dozer', 'remove', 'Remove mode (or hold Ctrl)']] },
    road: { title: 'Road Construction', tools: [['road', 'road', 'Build road: drag along a straight line. Ctrl-drag removes.'], ['depot', 'roaddepot', 'Road vehicle depot'], ['bus', 'busstop', 'Bus stop (drive-through)'], ['station', 'truckstop', 'Lorry loading bay (drive-through)'], ['bridge', 'roadbridge', 'Road bridge'], ['tunnel', 'roadtunnel', 'Road tunnel'], ['dozer', 'remove', 'Remove mode (or hold Ctrl)']] },
    water: { title: 'Waterways', tools: [['anchor', 'dock', 'Dock: click a stretch of coast'], ['depot', 'shipdepot', 'Shipyard: build on open water'], ['buoy', 'buoy', 'Buoy: a waypoint ships can be routed via']] },
    land: { title: 'Landscaping', tools: [['raise', 'raise', 'Raise land: click a corner or drag an area'], ['lower', 'lower', 'Lower land: click a corner or drag an area'], ['level', 'level', 'Level land to the height of the first corner'], ['tree', 'trees', 'Plant trees (good for town ratings)'], ['dozer', 'demolish', 'Demolish'], ['company', 'hq', 'Build company headquarters (2×2)'], ['query', 'query', 'Land information']] },
  };
  W.buildBar = function (kind) {
    const gg = g();
    if (kind === 'air') return W.airportBar();
    const p = PAL[kind];
    UI.open('build-' + kind, {
      w: kind === 'rail' ? 420 : 330, posKey: 'build', x: innerWidth / 2 - 200, y: 60, title: p.title,
      onClose: () => { if (Tools().cur && p.tools.some(t => t[1] === Tools().cur)) Tools().cancel(); UI.syncToolbar(); },
      render: () => {
        const gg = g(), o = Tools().opt, yr = HL.ymd(gg.date).y;
        let h = `<div class="row" style="gap:3px">${p.tools.map(([ic, id, tip]) => `<button class="tbtn ${id === 'remove' ? (o.remove ? 'on' : '') : Tools().cur === id ? 'on' : ''}" data-a="${id === 'remove' ? 'rmode' : 'tool'}" data-v="${id}" data-tip="${tip}" aria-label="${tip}" style="border:1px solid var(--line)">${UI.ICON[ic]}</button>`).join('')}</div>`;
        if (kind === 'rail') {
          const types = HL.RAILTYPES.map((r, i) => ({ r, i })).filter(x => yr >= x.r.intro || gg.unlockAll);
          if (!types.some(x => x.i === o.rt)) o.rt = 0;
          h += `<div class="row" style="margin-top:8px"><span class="dim" style="font-size:12px">Track</span><div class="seg">${types.map(({ r, i }) => `<button class="${o.rt === i ? 'on' : ''}" data-a="rt" data-v="${i}">${r.name.replace(' Railway', '')}</button>`).join('')}</div></div>`;
          if (Tools().cur === 'station') h += `<div class="row"><span class="dim" style="font-size:12px;width:60px">Platforms</span><div class="seg">${[1, 2, 3, 4, 5].map(n => `<button class="${o.plat === n ? 'on' : ''}" data-a="plat" data-v="${n}">${n}</button>`).join('')}</div></div>
            <div class="row"><span class="dim" style="font-size:12px;width:60px">Length</span><div class="seg">${[1, 2, 3, 4, 5, 6, 7].map(n => `<button class="${o.len === n ? 'on' : ''}" data-a="len" data-v="${n}">${n}</button>`).join('')}</div></div>
            <div class="row"><span class="dim" style="font-size:12px;width:60px">Direction</span><div class="seg"><button class="${o.axis === 0 ? 'on' : ''}" data-a="axis" data-v="0">↘ X</button><button class="${o.axis === 1 ? 'on' : ''}" data-a="axis" data-v="1">↙ Y</button></div><span class="dim" style="font-size:12px">or press R</span></div>
            <label class="chk" style="margin-top:6px"><input type="checkbox" data-c="catch" ${o.showCatch ? 'checked' : ''}> Show catchment area</label>`;
          if (Tools().cur === 'signal') h += `<div class="row"><span class="dim" style="font-size:12px;width:60px">Type</span><div class="seg">${['Block', 'Path', 'One-way path'].map((n, i) => `<button class="${o.sigType === i ? 'on' : ''}" data-a="sig" data-v="${i}">${n}</button>`).join('')}</div></div>
            <div class="row"><span class="dim" style="font-size:12px;width:60px">Drag gap</span>${UI.ibtn('minus', 'dens', 'Closer', { arg: -1 })}<span class="num" style="width:56px;text-align:center">${o.density} tiles</span>${UI.ibtn('plus', 'dens', 'Further', { arg: 1 })}</div>
            <p class="lede" style="margin:6px 0 0">${['Block signals let one train into each section of track at a time. Two-way by default: click again to make them one-way.', 'Path signals reserve just the route a train needs, so trains can share junctions and pick free platforms.', 'One-way path signals also stop trains entering from behind. Ideal at the entrance to stations and junctions.'][o.sigType]}</p>`;
        }
        if (kind === 'road' && (Tools().cur === 'busstop' || Tools().cur === 'truckstop')) h += `<div class="row" style="margin-top:8px"><span class="dim" style="font-size:12px">On empty land face</span><div class="seg"><button class="${o.stopAxis === 0 ? 'on' : ''}" data-a="saxis" data-v="0">↘ X</button><button class="${o.stopAxis === 1 ? 'on' : ''}" data-a="saxis" data-v="1">↙ Y</button></div></div>`;
        if (kind === 'land' && Tools().cur === 'trees') {
          const specs = HL.TREES.map((t, i) => ({ t, i })).filter(x => x.t.climate === gg.opts.climate || (gg.opts.climate === 'temperate' && x.t.climate === 'temperate'));
          h += `<div class="row" style="margin-top:8px"><select data-c="tree"><option value="">Mixed native trees</option>${specs.map(({ t, i }) => `<option value="${i}" ${o.treeSpec === i ? 'selected' : ''}>${t.name}</option>`).join('')}</select></div>`;
        }
        return h;
      },
      actions: {
        tool: (id) => { Tools().set(id); },
        rmode: () => { Tools().opt.remove = !Tools().opt.remove; },
        rt: (i) => { Tools().opt.rt = +i; },
        plat: (n) => { Tools().opt.plat = +n; }, len: (n) => { Tools().opt.len = +n; }, axis: (a) => { Tools().opt.axis = +a; },
        catch: (v) => { Tools().opt.showCatch = v; },
        sig: (i) => { Tools().opt.sigType = +i; }, dens: (d) => { Tools().opt.density = HL.clamp(Tools().opt.density + (+d), 1, 12); },
        saxis: (a) => { Tools().opt.stopAxis = +a; },
        tree: (v) => { Tools().opt.treeSpec = v === '' ? null : +v; },
      },
    });
  };
  W.airportBar = function () {
    UI.open('build-air', {
      w: 360, posKey: 'build', x: innerWidth / 2 - 180, y: 60, title: 'Airports',
      onClose: () => { if (Tools().cur === 'airport') Tools().cancel(); UI.syncToolbar(); },
      render: () => {
        const gg = g(), yr = HL.ymd(gg.date).y, o = Tools().opt;
        const types = HL.AIRPORTS.filter(a => yr >= a.intro || gg.unlockAll);
        if (!types.length) return `<p class="lede">No airports yet. The first grass airstrips open in ${HL.AIRPORTS[0].intro}.</p>`;
        return `<div class="list">${types.map(a => `<div class="it ${Tools().cur === 'airport' && o.airport === a.id ? 'sel' : ''}" data-a="pick" data-v="${a.id}"><div class="grow"><div>${a.name} <span class="dim">${a.w}×${a.h}</span></div><div class="sub">${a.desc}</div></div><span class="num">${HL.fmtMoney(HL.Game.cost(gg, a.cost), true)}</span></div>`).join('')}</div>
          <label class="chk" style="margin-top:8px"><input type="checkbox" data-c="catch" ${o.showCatch ? 'checked' : ''}> Show catchment area</label>
          <p class="lede" style="margin:8px 0 0">Buy aircraft from the airport's hangar: click the airport, then Hangar.</p>`;
      },
      actions: { pick: (id) => Tools().set('airport', { airport: id }), catch: (v) => { Tools().opt.showCatch = v; } },
    });
  };

  // ---------- vehicle lists ----------
  W.vehList = function (kind) {
    const names = { rail: 'Trains', road: 'Road Vehicles', ship: 'Ships', air: 'Aircraft' };
    UI.open('vlist-' + kind, {
      w: 560, h: 420, resizable: true, title: () => g().companies[g().player].name + ' ' + names[kind],
      sort: 'unit', group: 'all',
      onClose: () => UI.syncToolbar(),
      render: (w) => {
        const gg = g();
        let vs = gg.vehicles.filter(v => v && v.owner === gg.player && v.kind === kind);
        const groups = gg.groups.filter(gr => gr && gr.owner === gg.player && gr.kind === kind);
        if (w.o.group !== 'all') vs = vs.filter(v => String(v.group) === String(w.o.group));
        const sortFns = { unit: (a, b) => a.unit - b.unit, profit: (a, b) => b.profitThisYear - a.profitThisYear, last: (a, b) => b.profitLastYear - a.profitLastYear, age: (a, b) => b.age - a.age };
        vs.sort(sortFns[w.o.sort]);
        const tot = vs.reduce((a, v) => a + v.profitThisYear, 0), totL = vs.reduce((a, v) => a + v.profitLastYear, 0);
        let h = `<div class="row" style="margin-bottom:8px"><select data-c="group"><option value="all">All ${names[kind].toLowerCase()} (${gg.vehicles.filter(v => v && v.owner === gg.player && v.kind === kind).length})</option><option value="-1" ${w.o.group === '-1' ? 'selected' : ''}>Ungrouped</option>${groups.map(gr => `<option value="${gr.id}" ${String(w.o.group) === String(gr.id) ? 'selected' : ''}>${esc(gr.name)}</option>`).join('')}</select>${UI.btn('New group', 'newgroup', { icon: 'group' })}${w.o.group !== 'all' && w.o.group !== '-1' ? UI.btn('Rename', 'rengroup', { icon: 'rename' }) : ''}<span style="flex:1"></span><span class="dim" style="font-size:12.5px">This year</span> ${UI.moneyGood(tot, true)}</div>`;
        h += `<table class="tt"><thead><tr><th class="sort" data-a="sort" data-v="unit">Vehicle</th><th>Status</th><th class="r sort" data-a="sort" data-v="profit">This year</th><th class="r sort" data-a="sort" data-v="last">Last year</th><th class="r sort" data-a="sort" data-v="age">Age</th><th></th></tr></thead><tbody>`;
        for (const v of vs) {
          h += `<tr class="click" data-a="open" data-v="${v.id}"><td>${esc(HL.Veh.displayName(v))}<div class="dim" style="font-size:11.5px">${esc(HL.VEH[v.model].name)}</div></td><td style="font-size:12px;max-width:180px" class="dim">${W.vehStatus(v)}</td><td class="r">${UI.moneyGood(v.profitThisYear, true)}</td><td class="r">${UI.moneyGood(v.profitLastYear, true)}</td><td class="r ${v.age > v.maxAge ? 'bad' : ''}">${Math.floor(v.age / 365)}y</td><td>${groups.length ? `<select data-c="setgroup" data-vid="${v.id}" onclick="event.stopPropagation()" style="height:24px;font-size:11px"><option value="-1">—</option>${groups.map(gr => `<option value="${gr.id}" ${v.group === gr.id ? 'selected' : ''}>${esc(gr.name)}</option>`).join('')}</select>` : ''}</td></tr>`;
        }
        if (!vs.length) h += `<tr><td colspan="6" class="dim">None yet. Build a depot${kind === 'air' ? ' (an airport has a hangar)' : ''} and buy one from there.</td></tr>`;
        h += `</tbody></table><p class="dim" style="font-size:12px;margin:8px 0 0">Last year total ${HL.fmtMoney(totL)}</p>`;
        return h;
      },
      actions: {
        open: (id) => W.vehicle(+id),
        sort: (k, el, e, w) => { w.o.sort = k; },
        group: (v, el, e, w) => { w.o.group = v; },
        setgroup: (val, el) => { const v = g().vehicles[+el.dataset.vid]; if (v) v.group = +val; },
        newgroup: (x, el, e, w) => UI.prompt('New group', names[kind] + ' group', n => { if (!n) return; const gr = HL.alloc(g().groups, { owner: g().player, kind, name: n }); w.o.group = String(gr.id); UI.render('vlist-' + kind); }),
        rengroup: (x, el, e, w) => { const gr = g().groups[+w.o.group]; if (gr) UI.prompt('Rename group', gr.name, n => { if (n) gr.name = n; }); },
      },
    });
  };

  // ---------- finances ----------
  W.finances = function () {
    UI.open('fin', {
      w: 470, title: () => g().companies[g().player].name + ' Finances',
      onClose: () => UI.syncToolbar(),
      render: () => {
        const gg = g(), c = gg.companies[gg.player], y = HL.ymd(gg.date).y;
        const cols = [];
        for (let k = Math.max(0, c.fin.years.length - 2); k < c.fin.years.length; k++) cols.push([c.fin.years[k].year, c.fin.years[k].cats]);
        cols.push([y, c.fin.cur]);
        let h = `<table class="tt"><thead><tr><th>Category</th>${cols.map(([yy]) => `<th class="r">${yy}</th>`).join('')}</tr></thead><tbody>`;
        for (const [k, name] of HL.FIN_CATS) h += `<tr><td>${name}</td>${cols.map(([, cats]) => `<td class="r">${cats[k] ? UI.moneyGood(cats[k]) : '<span class="dim">—</span>'}</td>`).join('')}</tr>`;
        h += `<tr class="total"><td>Total</td>${cols.map(([, cats]) => { const t = Object.values(cats).reduce((a, b) => a + b, 0); return `<td class="r">${UI.moneyGood(t)}</td>`; }).join('')}</tr></tbody></table>`;
        const max = HL.Game.maxLoan(gg);
        h += `<div class="sep"></div><dl class="kv"><dt>Bank balance</dt><dd>${UI.money(c.money)}</dd><dt>Loan</dt><dd>${UI.money(c.loan)}</dd><dt>Maximum loan</dt><dd>${UI.money(max)}</dd><dt>Interest</dt><dd>${gg.econ.interest}% a year</dd></dl>
          <div class="row" style="margin-top:10px">${UI.btn('Borrow ' + HL.fmtMoney(10000 * Math.max(1, Math.round(gg.econ.costMul)), true), 'borrow', { dis: c.loan >= max, tip: 'Shift-click to borrow the maximum' })}${UI.btn('Repay ' + HL.fmtMoney(10000 * Math.max(1, Math.round(gg.econ.costMul)), true), 'repay', { dis: c.loan <= 0 || c.money <= 0, tip: 'Shift-click to repay as much as possible' })}</div>`;
        return h;
      },
      actions: {
        borrow: (x, el, e) => { const gg = g(); HL.Game.borrow(gg, gg.player, e.shiftKey ? 1e12 : 10000 * Math.max(1, Math.round(gg.econ.costMul))); if (HL.Audio) HL.Audio.cash(); },
        repay: (x, el, e) => { const gg = g(); const r = HL.Game.repay(gg, gg.player, e.shiftKey ? 1e12 : 10000 * Math.max(1, Math.round(gg.econ.costMul))); if (!r) UI.toast('Not enough money to repay'); },
      },
    });
  };

  // ---------- company ----------
  W.company = function (cid) {
    UI.open('company' + cid, {
      w: 400, title: () => { const c = g().companies[cid]; return c ? c.name : 'Company'; },
      onClose: () => UI.syncToolbar(),
      render: () => {
        const gg = g(), c = gg.companies[cid];
        if (!c) return '';
        const mine = cid === gg.player;
        const counts = { rail: 0, road: 0, ship: 0, air: 0 };
        for (const v of gg.vehicles) if (v && v.owner === cid) counts[v.kind]++;
        const inf = (gg.infra && gg.infra[cid]) || { rail: 0, road: 0, signals: 0 };
        const stations = gg.stations.filter(s => s && s.owner === cid).length;
        let h = `<div class="row" style="gap:12px;flex-wrap:nowrap"><div style="width:46px;height:46px;border-radius:3px;background:${HL.LIVERY[c.color].main};box-shadow:inset 0 0 0 3px ${HL.LIVERY[c.color].accent}55,inset 0 -6px 0 ${HL.LIVERY[c.color].accent}"></div><div><div style="font-weight:600">${esc(c.name)}</div><div class="dim" style="font-size:12.5px">Chairman ${esc(c.manager)} · founded ${c.founded}${c.ai ? ' · rival' : ''}</div></div></div>
          <dl class="kv" style="margin-top:10px"><dt>Company value</dt><dd>${UI.money(c.value)}</dd><dt>Performance</dt><dd>${c.perf} <span class="dim">· ${HL.perfTitle(c.perf)}</span></dd>
          <dt>Vehicles</dt><dd>${counts.rail} trains · ${counts.road} road · ${counts.ship} ships · ${counts.air} aircraft</dd>
          <dt>Infrastructure</dt><dd>${HL.fmtInt(inf.rail)} track · ${HL.fmtInt(inf.road)} road · ${stations} stations · ${inf.signals} signals</dd></dl>`;
        if (mine) {
          h += `<h3>Livery</h3><div class="swatches">${HL.LIVERY.map((l, i) => { const taken = gg.companies.some(o => o && o !== c && o.alive && o.color === i); return `<button class="${c.color === i ? 'on' : ''}" ${taken ? 'disabled style="opacity:.25"' : ''} data-a="color" data-v="${i}" data-tip="${l.name}${taken ? ' (taken)' : ''}" style="background:linear-gradient(${l.main} 70%, ${l.accent} 70%)"></button>`; }).join('')}</div>
            <h3>Fleet care</h3><label class="chk"><input type="checkbox" data-c="autorenew" ${c.autorenew ? 'checked' : ''}> Autorenew vehicles when they get old</label>
            <div class="row" style="margin-top:6px"><span class="dim" style="font-size:12.5px">Service interval</span>${['rail', 'road', 'ship', 'air'].map(k => `<span class="dim" style="font-size:12px">${{ rail: 'Trains', road: 'Road', ship: 'Ships', air: 'Air' }[k]}</span><input type="number" min="30" max="800" step="10" value="${(c.serviceInt || {})[k] || HL.Veh.SERVICE[k]}" data-c="svc" data-k="${k}" style="width:60px">`).join('')}</div>
            <div class="row" style="margin-top:10px">${UI.btn(c.hq != null ? 'View HQ' : 'Build HQ', 'hq', { icon: 'company' })}${UI.btn('Autoreplace', 'replace', { icon: 'rotate', tip: 'Swap old engine models for newer ones when vehicles visit a depot' })}${UI.btn('Rename', 'rename', { icon: 'rename' })}${UI.btn('Chairman', 'mgr', { icon: 'rename' })}</div>`;
        }
        return h;
      },
      actions: {
        color: (i) => { g().companies[cid].color = +i; HL.Gfx.clearSprites('v:'); HL.Gfx.clearSprites('hq:'); HL.Gfx.clearSprites('dep:'); },
        autorenew: (v) => { g().companies[cid].autorenew = v; },
        svc: (val, el) => { const c = g().companies[cid]; c.serviceInt = c.serviceInt || {}; c.serviceInt[el.dataset.k] = HL.clamp(+val || 150, 30, 800); for (const v of g().vehicles) if (v && v.owner === cid && v.kind === el.dataset.k) v.serviceInt = c.serviceInt[el.dataset.k]; },
        hq: () => { const c = g().companies[cid]; if (c.hq != null) { const o = g().objects[c.hq]; if (o) HL.G.centerOn(o.x + 1, o.y + 1); } else { Tools().set('hq'); UI.toast('Click where the 2×2 headquarters should go', 'info'); } },
        rename: () => { const c = g().companies[cid]; UI.prompt('Company name', c.name, n => { if (n) c.name = n; }); },
        mgr: () => { const c = g().companies[cid]; UI.prompt('Chairman', c.manager, n => { if (n) c.manager = n; }); },
        replace: () => W.autoreplace(),
      },
    });
  };
  W.autoreplace = function () {
    UI.open('autoreplace', {
      w: 440, title: 'Autoreplace',
      render: () => {
        const gg = g(), c = gg.companies[gg.player], yr = HL.ymd(gg.date).y;
        c.replace = c.replace || {};
        const used = new Set(); for (const v of gg.vehicles) if (v && v.owner === gg.player) used.add(v.model);
        if (!used.size) return '<p class="lede">Buy some vehicles first.</p>';
        let h = `<p class="lede">When a vehicle of the left model visits a depot, it is swapped for the right one. You pay the difference.</p><table class="tt"><tbody>`;
        for (const mid of used) {
          const m = HL.VEH[mid];
          const opts = Object.values(HL.VEH).filter(o => o.kind === m.kind && o.id !== mid && !o.wagon && HL.vehAvailable(o, yr, gg.unlockAll) && (m.kind !== 'rail' || HL.railCompatible(o.rt, m.rt) || (o.rt === 0 && m.rt <= 1)) && (m.kind !== 'road' || o.cargo === m.cargo) && (m.kind !== 'air' || o.heli === m.heli));
          h += `<tr><td>${esc(m.name)}</td><td><select data-c="rep" data-m="${mid}"><option value="">Keep</option>${opts.map(o => `<option value="${o.id}" ${c.replace[mid] === o.id ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}</select></td></tr>`;
        }
        return h + '</tbody></table>';
      },
      actions: { rep: (val, el) => { const c = g().companies[g().player]; if (val) c.replace[el.dataset.m] = val; else delete c.replace[el.dataset.m]; } },
    });
  };

  // ---------- graphs ----------
  const GRAPHS = [['profit', 'Operating profit'], ['income', 'Income'], ['delivered', 'Cargo delivered'], ['perf', 'Performance'], ['value', 'Company value'], ['rates', 'Cargo payment rates']];
  W.graphs = function () {
    UI.open('graphs', {
      w: 620, title: 'Graphs', tab: 'profit',
      onClose: () => UI.syncToolbar(),
      render: (w) => {
        const gg = g();
        let h = `<div class="tabs">${GRAPHS.map(([k, l]) => `<button class="${w.o.tab === k ? 'on' : ''}" data-a="tab" data-v="${k}">${l}</button>`).join('')}</div><div class="graph"><canvas id="gr-c" width="1180" height="520"></canvas></div><div class="legend" id="gr-l"></div>`;
        return h;
      },
      after: (w) => drawGraph(w),
      actions: { tab: (k, el, e, w) => { w.o.tab = k; w.lastHtml = null; } },
    });
  };
  function drawGraph(w) {
    const gg = g(), c = UI.$('#gr-c', w.body); if (!c) return;
    const ctx = c.getContext('2d');
    const W2 = c.width, H2 = c.height, L = 110, B = 50, T = 16, Rr = 20;
    ctx.clearRect(0, 0, W2, H2);
    let series = [];
    const tab = w.o.tab;
    if (tab === 'rates') {
      const cl = HL.CLIMATES[gg.opts.climate].cargos;
      series = cl.map(cg => ({ name: HL.CARGO[cg].name, col: HL.CARGO[cg].col === '#2b2b33' ? '#7a7a8a' : HL.CARGO[cg].col === '#3a3633' ? '#9a948a' : HL.CARGO[cg].col, pts: HL.Econ.rateCurve(gg, cg).map(p => p[1]) }));
    } else {
      for (const co of gg.companies) {
        if (!co || (!co.alive && !co.quarters.length)) continue;
        const qs = co.quarters.slice(-24);
        const val = q => tab === 'profit' ? q.income - q.expenses : tab === 'income' ? q.income : tab === 'delivered' ? q.delivered : tab === 'perf' ? q.perf : q.value;
        series.push({ name: co.name, col: HL.LIVERY[co.color].main === '#24345e' ? '#5a74b8' : HL.LIVERY[co.color].main, pts: qs.map(val), me: co.id === gg.player });
      }
    }
    const n = Math.max(2, ...series.map(s => s.pts.length));
    let mn = 0, mx = 1;
    for (const s of series) for (const v of s.pts) { mn = Math.min(mn, v); mx = Math.max(mx, v); }
    const span = mx - mn || 1;
    const step = Math.pow(10, Math.floor(Math.log10(span / 4)));
    const nice = [1, 2, 2.5, 5, 10].map(k => k * step).find(k => span / k <= 6) || step * 10;
    const y0 = Math.floor(mn / nice) * nice, y1 = Math.ceil(mx / nice) * nice;
    const X = i => L + (W2 - L - Rr) * (n === 1 ? 0 : i / (n - 1)), Y = v => T + (H2 - T - B) * (1 - (v - y0) / (y1 - y0 || 1));
    ctx.font = '22px "Barlow Condensed", sans-serif'; ctx.fillStyle = '#b8b09e'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let v = y0; v <= y1 + 1e-9; v += nice) {
      ctx.strokeStyle = Math.abs(v) < 1e-9 ? 'rgba(236,229,211,0.45)' : 'rgba(236,229,211,0.1)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(L, Y(v)); ctx.lineTo(W2 - Rr, Y(v)); ctx.stroke();
      ctx.fillText(tab === 'delivered' || tab === 'perf' ? HL.fmtInt(v) : HL.fmtMoney(v, true), L - 10, Y(v));
    }
    ctx.textAlign = 'center';
    if (tab === 'rates') { for (let i = 0; i < n; i += 4) ctx.fillText((i * 10) + 'd', X(i), H2 - B + 22); }
    else {
      const me = gg.companies[gg.player];
      const qs = me.quarters.slice(-24);
      for (let i = 0; i < qs.length; i += Math.max(1, Math.round(qs.length / 8))) { const d = HL.ymd(qs[i].date || gg.date); ctx.fillText(HL.MNAMES[d.m] + ' ' + String(d.y).slice(2), X(i), H2 - B + 22); }
      if (!qs.length) ctx.fillText('Data appears after the first quarter', W2 / 2, H2 / 2);
    }
    for (const s of series) {
      if (!s.pts.length) continue;
      ctx.strokeStyle = s.col; ctx.lineWidth = s.me ? 5 : 3; ctx.lineJoin = 'round';
      ctx.beginPath(); s.pts.forEach((v, i) => { const x = X(tab === 'rates' ? i : i + (n - s.pts.length)), y = Y(v); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.stroke();
      const lv = s.pts[s.pts.length - 1];
      ctx.fillStyle = s.col; ctx.beginPath(); ctx.arc(X(tab === 'rates' ? s.pts.length - 1 : n - 1), Y(lv), s.me ? 6 : 4, 0, 7); ctx.fill();
    }
    UI.$('#gr-l', w.body).innerHTML = series.map(s => `<span><i class="sw" style="background:${s.col}"></i>${esc(s.name)}</span>`).join('') + (tab === 'rates' ? '<span class="dim">Payment for 10 units over 20 tiles, by days in transit</span>' : '<span class="dim">Per quarter</span>');
  }

  // ---------- league ----------
  W.league = function () {
    UI.open('league', {
      w: 480, title: 'Company League Table',
      render: () => {
        const gg = g();
        const cs = gg.companies.filter(c => c).sort((a, b) => (b.alive - a.alive) || b.perf - a.perf);
        let h = `<table class="tt"><thead><tr><th>#</th><th>Company</th><th class="r">Score</th><th class="r">Value</th></tr></thead><tbody>${cs.map((c, i) => `<tr class="click" data-a="co" data-v="${c.id}"><td class="num">${i + 1}</td><td>${UI.swatch(gg, c.id)}${esc(c.name)}${c.alive ? '' : ' <span class="bad">(bankrupt)</span>'}<div class="dim" style="font-size:11.5px">${HL.perfTitle(c.perf)}</div></td><td class="r">${c.perf}</td><td class="r">${HL.fmtMoney(c.value, true)}</td></tr>`).join('')}</tbody></table>`;
        if (gg.goals && gg.goals.length) h += `<div class="sep"></div>${W.goalsHtml()}`;
        h += `<p class="lede" style="margin-top:8px">Game ends in ${gg.endYear}. Your final score counts toward the high-score table.</p>`;
        return h;
      },
      actions: { co: (id) => W.company(+id) },
    });
  };
  W.goalsHtml = function () {
    const gg = g();
    if (!gg.goals || !gg.goals.length) return '';
    return `<h3>Goals</h3>` + gg.goals.map(goal => { const p = HL.Scenarios.progress(gg, goal); return `<div style="font-size:13px;margin:6px 0"><div class="row" style="justify-content:space-between;flex-wrap:nowrap"><span>${goal.done ? '<span class="good">✓</span> ' : ''}${esc(goal.text)}</span><span class="num dim">${esc(p.label)}</span></div><div class="bar" style="margin-top:3px"><i style="width:${Math.round(p.f * 100)}%;background:${goal.done ? 'var(--good)' : 'var(--gold)'}"></i></div></div>`; }).join('');
  };

  // ---------- directories ----------
  W.towns = function () {
    UI.open('towns', {
      w: 380, h: 440, resizable: true, title: 'Towns', sort: 'pop',
      render: (w) => {
        const gg = g();
        const ts = gg.towns.filter(Boolean).sort(w.o.sort === 'pop' ? (a, b) => b.pop - a.pop : (a, b) => a.name.localeCompare(b.name));
        return `<table class="tt"><thead><tr><th class="sort" data-a="sort" data-v="name">Town</th><th class="r sort" data-a="sort" data-v="pop">Population</th><th class="r">Your rating</th></tr></thead><tbody>${ts.map(t => `<tr class="click" data-a="go" data-v="${t.id}"><td>${esc(t.name)}${t.city ? ' <span class="flag">city</span>' : ''}</td><td class="r">${HL.fmtInt(t.pop)}</td><td class="r dim" style="font-family:var(--f-ui);font-size:12px">${HL.Towns.ratingName(HL.Towns.ratingOf(t, gg.player))}</td></tr>`).join('')}</tbody></table><p class="dim" style="font-size:12px;margin:8px 0 0">World population ${HL.fmtInt(ts.reduce((a, t) => a + t.pop, 0))}</p>`;
      },
      actions: { sort: (k, el, e, w) => { w.o.sort = k; }, go: (id) => { const t = g().towns[+id]; HL.G.centerOn(t.x + 0.5, t.y + 0.5); W.town(+id); } },
    });
  };
  W.industries = function () {
    UI.open('industries', {
      w: 520, h: 480, resizable: true, title: 'Industries', tab: 'list',
      render: (w) => {
        const gg = g();
        let h = `<div class="tabs"><button class="${w.o.tab === 'list' ? 'on' : ''}" data-a="tab" data-v="list">Directory</button><button class="${w.o.tab === 'fund' ? 'on' : ''}" data-a="tab" data-v="fund">Fund new industry</button><button class="${w.o.tab === 'chains' ? 'on' : ''}" data-a="tab" data-v="chains">Cargo chains</button></div>`;
        if (w.o.tab === 'list') {
          const is = gg.industries.filter(Boolean).sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
          h += `<table class="tt"><thead><tr><th>Industry</th><th>Production last month</th><th class="r">Moved</th></tr></thead><tbody>${is.map(i => `<tr class="click" data-a="go" data-v="${i.id}"><td>${esc(i.name)}${i.closing ? ' <span class="bad">closing</span>' : ''}</td><td style="font-size:12px">${Object.keys(i.prod).map(c => `<i class="sw" style="background:${HL.CARGO[c].col}"></i>${HL.fmtInt(i.prod[c].lastMade)} ${HL.CARGO[c].short}`).join(' ') || '<span class="dim">processes deliveries</span>'}</td><td class="r">${Object.keys(i.prod).length ? (i.pct || 0) + '%' : ''}</td></tr>`).join('')}</tbody></table>`;
        } else if (w.o.tab === 'fund') {
          const types = HL.Ind.typesFor(gg).filter(id => HL.Ind.yearOk(gg, HL.INDUSTRY[id]));
          h += `<p class="lede">Processing industries are placed where you choose. Raw-material sites have to be prospected first, and prospecting doesn't always find anything.</p><div class="list">${types.map(id => { const d = HL.INDUSTRY[id]; const prim = d.prod && !d.accepts; return `<div class="it" data-a="fund" data-v="${id}"><i class="sw" style="background:${d.col}"></i><div class="grow"><div>${d.name}</div><div class="sub">${prim ? 'Prospect' : 'Build'} · ${(d.prod || []).map(p => HL.CARGO[p[0]].name).concat((d.accepts || []).map(c => 'takes ' + HL.CARGO[c].name.toLowerCase())).join(', ')}</div></div><span class="num">${HL.fmtMoney(HL.Ind.fundCost(gg, id), true)}</span></div>`; }).join('')}</div>`;
        } else h += W.chainsHtml(gg);
        return h;
      },
      actions: {
        tab: (k, el, e, w) => { w.o.tab = k; },
        go: (id) => { const i = g().industries[+id]; HL.G.centerOn(i.x + i.w / 2, i.y + i.h / 2); W.industry(+id); },
        fund: (id) => {
          const d = HL.INDUSTRY[id];
          if (d.prod && !d.accepts) { const r = HL.Ind.fund(g(), g().player, id); if (!r.ok) UI.toast(r.err); else if (r.failed) UI.toast('Prospecting found nothing. The money is gone.'); else { UI.toast(r.ind.name + ' opens!', 'info'); HL.G.centerOn(r.ind.x + 1, r.ind.y + 1); } }
          else { Tools().set('fundind', { indType: id }); UI.toast('Click where to build the ' + d.name.toLowerCase(), 'info'); }
        },
      },
    });
  };
  W.chainsHtml = function (gg) {
    const types = HL.Ind.typesFor(gg);
    const prim = types.filter(t => HL.INDUSTRY[t].prod && !HL.INDUSTRY[t].accepts);
    let h = `<p class="lede">Raw materials on the left, what takes them on the right. Goods, food and water go to towns.</p><table class="tt"><tbody>`;
    for (const p of prim) {
      const d = HL.INDUSTRY[p];
      for (const [c] of d.prod) {
        const to = types.filter(t => (HL.INDUSTRY[t].accepts || []).includes(c));
        h += `<tr><td>${d.name}</td><td><i class="sw" style="background:${HL.CARGO[c].col}"></i>${HL.CARGO[c].name}</td><td>→ ${to.map(t => HL.INDUSTRY[t].name + (HL.INDUSTRY[t].out ? ' → ' + HL.INDUSTRY[t].out.map(o => HL.CARGO[o].name).join(', ') : '')).join('<br>→ ') || 'Towns'}</td></tr>`;
      }
    }
    return h + '</tbody></table>';
  };
  W.subsidies = function () {
    UI.open('subsidies', {
      w: 460, title: 'Subsidies',
      render: () => {
        const gg = g(), E = HL.Econ;
        const off = gg.subsidies.filter(s => s.awarded == null), aw = gg.subsidies.filter(s => s.awarded != null);
        let h = `<h3>On offer</h3>`;
        h += off.length ? off.map((s, i) => `<div class="it" style="padding:4px 0;cursor:pointer" data-a="go" data-v="${gg.subsidies.indexOf(s)}"><i class="sw" style="background:${HL.CARGO[s.c].col}"></i>${HL.CARGO[s.c].name} from <b>${esc(E.endName(gg, s.from))}</b> to <b>${esc(E.endName(gg, s.to))}</b> <span class="dim">· until ${HL.fmtDate(s.until)}</span></div>`).join('') : '<p class="lede">None at the moment.</p>';
        h += `<h3>Awarded</h3>`;
        h += aw.length ? aw.map(s => `<div style="padding:4px 0;font-size:13px">${UI.swatch(gg, s.awarded)}${HL.CARGO[s.c].name} from ${esc(E.endName(gg, s.from))} to ${esc(E.endName(gg, s.to))} <span class="good">×${s.mult}</span> <span class="dim">until ${HL.fmtDate(s.until)}</span></div>`).join('') : '<p class="lede">None yet.</p>';
        return h + `<p class="lede" style="margin-top:8px">The first company to carry the cargo between the two places wins higher payment on that route for a year.</p>`;
      },
      actions: { go: (i) => { const s = g().subsidies[+i]; const p = HL.Econ.endXY(g(), s.from); if (p) HL.G.centerOn(p[0], p[1]); } },
    });
  };
  W.newsLog = function () {
    UI.open('newslog', {
      w: 500, h: 460, resizable: true, title: 'News History',
      onClose: () => UI.syncToolbar(),
      render: () => {
        const gg = g();
        const ns = gg.news.slice(-80).reverse();
        return `<div class="list" style="max-height:none">${ns.map(n => `<div class="it" data-a="go" data-v="${n.id}"><span class="num dim" style="width:72px;flex:none">${HL.fmtDate(n.date)}</span><div class="grow"><div>${esc(n.title)}</div>${n.body ? `<div class="sub">${esc(n.body)}</div>` : ''}</div></div>`).join('') || '<div class="it dim">No news yet.</div>'}</div>`;
      },
      actions: { go: (id) => { const n = g().news.find(x => x.id === +id); if (n) HL.News.focus(n); } },
    });
  };

  // ---------- minimap ----------
  W.minimap = function () {
    UI.open('minimap', {
      w: 330, posKey: 'minimap', x: innerWidth - 350, y: 64, title: 'Map of the World', mode: 'terrain',
      onClose: () => UI.syncToolbar(),
      render: (w) => `<div class="seg" style="margin-bottom:8px">${[['terrain', 'Land'], ['owner', 'Owners'], ['ind', 'Industries'], ['veh', 'Vehicles']].map(([k, l]) => `<button class="${w.o.mode === k ? 'on' : ''}" data-a="mode" data-v="${k}">${l}</button>`).join('')}</div><canvas id="mm" width="600" height="300" style="width:100%;cursor:crosshair;display:block;border-radius:2px;background:#16202a"></canvas>`,
      after: (w) => {
        const c = UI.$('#mm', w.body);
        if (!c.onpointerdown) {
          const go = (e) => { const r = c.getBoundingClientRect(); const px = (e.clientX - r.left) / r.width * c.width, py = (e.clientY - r.top) / r.height * c.height; const m = g().map; const s = c.width / (m.W + m.H); const a = (px / s - m.H), b = py / s * 2; HL.G.centerOn((a + b) / 2, (b - a) / 2); };
          c.onpointerdown = (e) => { go(e); c.setPointerCapture(e.pointerId); c.onpointermove = go; };
          c.onpointerup = () => { c.onpointermove = null; };
        }
        W.drawMinimap(c, w.o.mode);
      },
      actions: { mode: (k, el, e, w) => { w.o.mode = k; w.mmT = 0; } },
    });
  };
  let mmCache = null;
  W.drawMinimap = function (c, mode) {
    const gg = g(), m = gg.map;
    const ctx = c.getContext('2d');
    const now = performance.now();
    if (!mmCache || mmCache.mode !== mode || now - mmCache.t > 4000 || mmCache.g !== gg) {
      const cols = R.minimapColors(mode === 'owner' ? 'owner' : 'terrain');
      if (mode === 'ind') { for (let t = 0; t < m.W * m.H; t++) { if (m.type[t] === HL.T.IND) continue; cols[t * 4] = cols[t * 4] * 0.45 + 30; cols[t * 4 + 1] = cols[t * 4 + 1] * 0.45 + 30; cols[t * 4 + 2] = cols[t * 4 + 2] * 0.45 + 30; } }
      const src = new ImageData(cols, m.W, m.H);
      const tmp = document.createElement('canvas'); tmp.width = m.W; tmp.height = m.H; tmp.getContext('2d').putImageData(src, 0, 0);
      mmCache = { mode, t: now, img: tmp, g: gg };
    }
    // draw the map rotated 45° and squashed, like the main view
    const s = c.width / (m.W + m.H);
    c.height = Math.round((m.W + m.H) * s / 2) + 4;
    ctx.fillStyle = '#16202a'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.save();
    ctx.setTransform(s, s / 2, -s, s / 2, m.H * s, 2);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(mmCache.img, 0, 0);
    if (mode === 'veh') for (const v of gg.vehicles) { if (!v || v.inDepot) continue; ctx.fillStyle = HL.LIVERY[(gg.companies[v.owner] || {}).color || 0].main; ctx.fillRect(v.px - 1, v.py - 1, 2.5, 2.5); }
    // viewport
    const corners = [[0, 0], [R.vw, 0], [R.vw, R.vh], [0, R.vh]].map(([sx, sy]) => { const [wx, wy] = R.toWorldPx(sx, sy); const a = wx / 32, b = (wy + 4 * 8) / 16; return [(a + b) / 2, (b - a) / 2]; });
    ctx.strokeStyle = '#ffeec0'; ctx.lineWidth = 1.5 / s;
    ctx.beginPath(); corners.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); ctx.stroke();
    ctx.restore();
  };

  // ---------- help ----------
  W.help = function () {
    UI.open('help', {
      w: 520, title: 'How to Play',
      onClose: () => UI.syncToolbar(),
      render: () => `<div style="font-size:13.5px;line-height:1.55">
        <h3>Getting started</h3><p style="margin:0 0 6px">Connect places that produce something to places that want it. Raw materials (coal, ore, grain, timber, oil) go to industries that accept them, which make finished goods for towns. Towns also make passengers and mail. You are paid by distance and speed: long, quick routes pay best.</p>
        <p style="margin:0 0 6px">A typical first route: a coal mine to a power station 20 to 50 tiles apart. Build a station next to each (the blue shading shows what a station reaches), lay track between them, add a depot, buy a locomotive and a few wagons, and give the train two orders: <b>full load</b> at the mine, then the power station.</p>
        <h3>Camera</h3><table class="tt"><tbody>
        <tr><td>Pan</td><td>Right-drag, or left-drag with no tool. Arrow keys.</td></tr><tr><td>Zoom</td><td>Mouse wheel, + and -</td></tr><tr><td>Cancel tool</td><td>Right-click or Esc</td></tr></tbody></table>
        <h3>Keys</h3><table class="tt"><tbody>
        <tr><td>Space</td><td>Pause</td></tr><tr><td>1 2 3 4</td><td>Game speed</td></tr><tr><td>R / T / B / A / L</td><td>Rail, road, water, airport, landscape tools</td></tr>
        <tr><td>R (station tool)</td><td>Rotate the station</td></tr><tr><td>Ctrl while building</td><td>Remove instead</td></tr><tr><td>Delete</td><td>Demolish tool</td></tr><tr><td>Q</td><td>Land information</td></tr>
        <tr><td>M / F / G</td><td>Minimap, finances, graphs</td></tr><tr><td>Ctrl+S</td><td>Quick save</td></tr></tbody></table>
        <h3>Signals in one paragraph</h3><p style="margin:0">One train per track section unless you add signals. Put one-way signals every few tiles on double track (one track each way) to run many trains. Path signals at junctions and station throats let trains reserve only the route they need.</p></div>`,
    });
  };

  // ---------- settings ----------
  W.settings = function () {
    UI.open('settings', {
      w: 420, title: 'Settings',
      render: () => {
        const s = HL.Meta.settings;
        const gg = g();
        const row = (label, inner) => `<label>${label}</label><div>${inner}</div>`;
        const rng = (k, label) => row(label, `<input type="range" min="0" max="100" value="${Math.round(s[k] * 100)}" data-c="${k}" style="width:100%">`);
        const chk = (k, label) => `<label class="chk"><input type="checkbox" data-c="${k}" ${s[k] ? 'checked' : ''}> ${label}</label>`;
        let h = `<h3>Sound</h3><div class="form">${rng('vol', 'Master')}${rng('sfx', 'Effects')}${rng('ambient', 'Ambience')}${rng('music', 'Music')}</div>
          <h3>Display</h3><div style="display:grid;gap:6px">${chk('dayNight', 'Day and night cycle')}${chk('weather', 'Weather (rain, snow, storms)')}${chk('grid', 'Tile grid lines')}${chk('townNames', 'Town names')}${chk('stationNames', 'Station signs')}${chk('industryNames', 'Industry names when zoomed in')}${chk('edgeScroll', 'Scroll at screen edges')}${chk('newspaper', 'Pop-up newspaper for big news')}</div>
          <h3>Game</h3><div class="form">${row('Autosave', `<select data-c="autosave">${[['0', 'Off'], ['1', 'Every month'], ['3', 'Every 3 months'], ['6', 'Every 6 months'], ['12', 'Every year']].map(([v, l]) => `<option value="${v}" ${String(s.autosave) === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}</div>`;
        if (gg) h += `<div style="display:grid;gap:6px;margin-top:8px"><label class="chk"><input type="checkbox" data-c="g_crash" ${gg.diff.crashes ? 'checked' : ''}> Trains can collide (no collisions: they brake for each other)</label><label class="chk"><input type="checkbox" data-c="g_brk" ${gg.diff.breakdowns ? 'checked' : ''}> Vehicle breakdowns</label><label class="chk"><input type="checkbox" data-c="g_infl" ${gg.diff.inflation ? 'checked' : ''}> Inflation</label></div>`;
        return h;
      },
      actions: Object.assign({}, ...['vol', 'sfx', 'ambient', 'music'].map(k => ({ [k]: (v) => { HL.Meta.settings[k] = v / 100; HL.Meta.save(); if (HL.Audio) HL.Audio.applyVolumes(); } })),
        ...['dayNight', 'weather', 'grid', 'townNames', 'stationNames', 'industryNames', 'edgeScroll', 'newspaper'].map(k => ({ [k]: (v) => { HL.Meta.settings[k] = v; HL.Meta.save(); HL.G.applySettings(); } })),
        { autosave: (v) => { HL.Meta.settings.autosave = +v; HL.Meta.save(); }, g_crash: (v) => { g().diff.crashes = v; }, g_brk: (v) => { g().diff.breakdowns = v ? 2 : 0; }, g_infl: (v) => { g().diff.inflation = v; } }),
    });
  };
})(typeof window !== 'undefined' ? window : globalThis);
