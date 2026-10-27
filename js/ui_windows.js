// Information windows for vehicles, depots, purchases, orders, stations, towns, industries.
(function (root) {
  const HL = root.HL, UI = HL.UI, R = HL.R, Gx = HL.Gfx;
  const W = HL.W = {};
  const T = HL.T;
  const g = () => HL.G.g;
  const V = HL.Veh;
  const esc = s => UI.esc(s);

  // ---------- thumbnails ----------
  const thumbs = new Map();
  W.modelThumb = function (modelId, cid, w, h, cargo) {
    const gg = g();
    const liv = HL.LIVERY[(gg.companies[cid] || {}).color || 0];
    const key = modelId + ':' + liv.main + ':' + w + 'x' + h + ':' + (cargo || '');
    if (thumbs.has(key)) return thumbs.get(key);
    const md = HL.VEH[modelId];
    const c = document.createElement('canvas'); c.width = w * 2; c.height = h * 2;
    const ctx = c.getContext('2d');
    const m = HL.Vis.buildModel(key, md.art, md.len, liv, { gen: md.gen, fill: 2, cargo: cargo || md.cargo, body: md.body });
    const yaw = -0.42;
    const b1 = m.bounds(1, { yaw, shadow: false });
    const sc = Math.min(w * 2 * 0.92 / (b1.x1 - b1.x0 - 6), h * 2 * 0.88 / (b1.y1 - b1.y0 - 6));
    const b = m.bounds(sc, { yaw, shadow: false });
    m.draw(ctx, sc, (w * 2 - (b.x1 - b.x0)) / 2 - b.x0, (h * 2 - (b.y1 - b.y0)) / 2 - b.y0, { yaw, shadow: false });
    const url = c.toDataURL();
    thumbs.set(key, url);
    return url;
  };
  W.vehThumb = function (v, w, h) {
    if (v.kind !== 'rail') return W.modelThumb(v.model, v.owner, w, h, v.holds[0] && v.holds[0].c);
    return W.modelThumb(v.cars[0].model, v.owner, w, h);
  };
  W.trainStrip = function (v) {
    // engine + wagons side by side
    return v.cars.map((c, i) => `<img src="${W.modelThumb(c.model, v.owner, 52, 30)}" width="52" height="30" alt="${esc(HL.VEH[c.model].name)}" data-tip="${esc(HL.VEH[c.model].name)}" ${i === 0 ? '' : 'style="margin-left:-10px"'}>`).join('');
  };

  // ---------- vehicle status ----------
  W.vehStatus = function (v) {
    const gg = g();
    if (v.state === 'crashed') return '<span class="bad">Crashed!</span>';
    if (v.kind === 'air' && v.airState === 'hangar') return v.stopped ? 'Stopped in hangar' : 'Leaving hangar';
    if (v.inDepot) return v.stopped ? 'Stopped in depot' : 'Leaving depot';
    if (v.broken > 0) return '<span class="bad">Broken down</span>';
    if (v.stopped) return '<span class="warn">Stopped</span>';
    if (v.state === 'load') { const s = gg.stations[v.load && v.load.st]; return 'Loading / unloading at ' + esc(s ? s.name : '?'); }
    const t = V.target(gg, v);
    const where = !t ? 'No orders' : t.kind === 'depot' ? (t.service ? 'Heading for depot for service' : 'Heading for depot') : 'Heading for ' + esc(gg.stations[t.id] ? gg.stations[t.id].name : '?');
    let extra = '';
    if (v.kind === 'air') extra = { taxi: ', taxiing', takeoff: ', taking off', land: ', landing', hold: ', holding' }[v.airState] || '';
    const lost = v.lostSince ? ' <span class="warn">(lost)</span>' : '';
    if (v.kind === 'rail' && v.speed === 0 && v.waitTicks > 30) extra = ', waiting at signal';
    if (v.kind === 'road' && v.blocked > 40) extra = ', queuing';
    return where + extra + (v.speed > 0 ? ', ' + UI.fmtSpeed(v.kind === 'air' ? v.speed / HL.PLANE_SPEED : v.speed) : '') + lost;
  };
  W.vehMaxSpeed = function (v) { if (v.kind === 'rail') return v.vmax; return HL.VEH[v.model].speed; };

  // ---------- vehicle window ----------
  W.vehicle = function (id) {
    const gg = g();
    const v = gg.vehicles[id]; if (!v) return;
    UI.open('veh' + id, {
      w: 420, posKey: 'veh', title: () => { const vv = g().vehicles[id]; return vv ? V.displayName(vv) : 'Vehicle'; },
      tab: 'main', sel: -1,
      render: (w) => {
        const v = g().vehicles[id];
        if (!v) { setTimeout(() => UI.close('veh' + id), 0); return '<p class="lede">This vehicle no longer exists.</p>'; }
        R.selVeh = id;
        const gg = g(), mine = v.owner === gg.player;
        const md = HL.VEH[v.model];
        const inDep = v.inDepot || (v.kind === 'air' && v.airState === 'hangar');
        let h = `<div class="row" style="gap:12px;align-items:flex-start;flex-wrap:nowrap">
          <div style="flex:none;width:96px;height:56px;display:grid;place-items:center;background:#151a17;border:1px solid var(--line);border-radius:3px">${v.kind === 'rail' ? `<img src="${W.vehThumb(v, 92, 52)}" width="92" height="52" alt="">` : `<img src="${W.vehThumb(v, 92, 52)}" width="92" height="52" alt="">`}</div>
          <div style="min-width:0"><div style="font-weight:600">${esc(md.name)}${v.kind === 'rail' && v.cars.length > 1 ? ` <span class="dim">+ ${v.cars.length - 1} cars</span>` : ''}</div>
          <div class="dim" style="font-size:12.5px;margin-top:2px">${W.vehStatus(v)}</div>
          <div style="font-size:12.5px;margin-top:2px">${esc(V.loadText(v)) || ''}</div>
          ${mine ? '' : `<div style="font-size:12px;margin-top:2px">${UI.swatch(gg, v.owner)}${esc(gg.companies[v.owner].name)}</div>`}</div></div>`;
        h += `<div class="tabs" style="margin-top:10px">${['main:Details', 'orders:Orders'].map(s => { const [k, l] = s.split(':'); return `<button class="${w.o.tab === k ? 'on' : ''}" data-a="tab" data-v="${k}">${l}</button>`; }).join('')}</div>`;
        if (w.o.tab === 'orders') h += W.ordersPanel(v, w);
        else {
          const rel = Math.round(v.rel * 100);
          h += `<dl class="kv">
            <dt>Profit this year</dt><dd>${UI.moneyGood(v.profitThisYear)}</dd>
            <dt>Profit last year</dt><dd>${UI.moneyGood(v.profitLastYear)}</dd>
            <dt>Age</dt><dd class="${v.age > v.maxAge ? 'bad' : ''}">${Math.floor(v.age / 365)} of ${Math.round(v.maxAge / 365)} years</dd>
            <dt>Max speed</dt><dd>${UI.fmtSpeed(W.vehMaxSpeed(v))}</dd>
            ${v.kind === 'rail' ? `<dt>Power / weight</dt><dd>${HL.fmtInt(v.power)} hp / ${HL.fmtInt(v.wt)} t</dd>` : ''}
            <dt>Capacity</dt><dd>${esc(V.capacityText(v))}</dd>
            <dt>Reliability</dt><dd><span class="${rel < 60 ? 'bad' : ''}">${rel}%</span> <span class="dim">(${v.breakdowns} breakdowns)</span></dd>
            <dt>Last serviced</dt><dd>${HL.fmtDate(v.lastService)} <span class="dim">every ${v.serviceInt}d</span></dd>
            <dt>Value</dt><dd>${UI.money(v.value)}</dd>
            <dt>Running cost</dt><dd>${UI.money(Math.round((v.kind === 'rail' ? v.cars.reduce((a, c) => a + HL.VEH[c.model].run, 0) : md.run) * gg.econ.costMul * gg.diff.runCost))}/yr</dd>
          </dl>`;
          if (v.kind === 'rail') h += `<div class="row" style="margin-top:8px;overflow-x:auto;flex-wrap:nowrap">${W.trainStrip(v)}</div>`;
        }
        if (mine) {
          h += `<div class="sep"></div><div class="row">
            ${UI.btn(v.stopped ? 'Start' : 'Stop', 'startstop', { icon: v.stopped ? 'play' : 'stop', cls: v.stopped ? 'primary' : '' })}
            ${UI.ibtn('goDepot', 'depot', v.goDepot ? 'Cancel depot visit' : 'Send to depot (shift-click: stop there)', { cls: v.goDepot ? 'on' : '' })}
            ${UI.ibtn('target', 'center', 'Centre view on vehicle')}
            ${UI.ibtn('follow', 'follow', 'Follow with the camera', { cls: HL.G.followVeh === id ? 'on' : '' })}
            ${UI.ibtn('skip', 'skip', 'Skip to next order')}
            ${UI.ibtn('clone', 'clone', 'Build a copy (in its depot)')}
            ${(md.refit && md.refit.length > 1) ? UI.ibtn('wrench', 'refit', 'Refit to another cargo (in a depot)') : ''}
            ${UI.ibtn('rename', 'rename', 'Rename')}
            ${UI.ibtn('sell', 'sell', inDep && v.stopped ? 'Sell for ' + HL.fmtMoney(V.sellValue(v)) : 'Stop it in a depot to sell', { dis: !(inDep && v.stopped) })}
          </div>`;
        } else h += `<div class="sep"></div><div class="row">${UI.ibtn('target', 'center', 'Centre view on vehicle')}${UI.ibtn('follow', 'follow', 'Follow', { cls: HL.G.followVeh === id ? 'on' : '' })}</div>`;
        return h;
      },
      onClose: () => { if (R.selVeh === id) R.selVeh = null; if (HL.G.followVeh === id) HL.G.followVeh = null; if (HL.Tools.orderFor === id) HL.Tools.cancel(); },
      actions: Object.assign({
        tab: (k, el, e, w) => { w.o.tab = k; },
        startstop: () => { const v = g().vehicles[id]; v.stopped = !v.stopped; if (!v.stopped && !V.orderList(g(), v).length && v.kind !== 'rail') UI.toast('This vehicle has no orders yet', 'info'); },
        depot: (x, el, e) => { const v = g().vehicles[id]; if (v.goDepot) { v.goDepot = null; v.route = null; return; } const r = V.sendToDepot(g(), v, e.shiftKey); if (!r.ok) UI.toast(r.err); },
        center: () => { const v = g().vehicles[id]; HL.G.centerOn(v.px, v.py); },
        follow: () => { HL.G.followVeh = HL.G.followVeh === id ? null : id; },
        skip: () => V.skipOrder(g(), g().vehicles[id]),
        clone: () => { const v = g().vehicles[id]; const r = V.clone(g(), v, v.kind === 'air' ? (v.hangarSt != null ? v.hangarSt : v.airSt) : v.depot, false); if (!r.ok) UI.toast(r.err); else { if (HL.Audio) HL.Audio.ui('buy'); W.vehicle(r.v.id); } },
        refit: () => W.refit(id),
        rename: () => { const v = g().vehicles[id]; UI.prompt('Rename vehicle', V.displayName(v), (s) => { v.name = s || null; UI.render('veh' + id); }); },
        sell: () => { const v = g().vehicles[id]; UI.confirm('Sell ' + V.displayName(v) + '?', 'You will receive ' + HL.fmtMoney(V.sellValue(v)) + '.', () => { const r = V.sell(g(), v); if (!r.ok) UI.toast(r.err); else { if (HL.Audio) HL.Audio.cash(); UI.close('veh' + id); } }, { yes: 'Sell' }); },
      }, W.orderActions(id)),
    });
  };
  W.refit = function (id) {
    const v = g().vehicles[id], md = HL.VEH[v.model];
    UI.open('refit' + id, {
      title: 'Refit ' + V.displayName(v), w: 300, live: false,
      render: () => `<p class="lede">Refitting happens in a depot or hangar and costs about 5% of the vehicle price.</p><div class="list">${md.refit.map(c => `<div class="it" data-a="pick" data-v="${c}"><i class="sw" style="background:${HL.CARGO[c].col}"></i><span class="grow">${HL.CARGO[c].name}</span><span class="num">${HL.refitCap(md, c)} ${HL.CARGO[c].short}</span></div>`).join('')}</div>`,
      actions: { pick: (c) => { const r = V.refit(g(), g().vehicles[id], c); if (!r.ok) UI.toast(r.err); else UI.close('refit' + id); } },
    });
  };

  // ---------- orders ----------
  const LOADN = ['', 'Full load', 'Full load any', 'No loading'];
  const UNLOADN = ['', 'Unload all', 'Transfer', 'No unloading'];
  W.orderText = function (o) {
    const gg = g();
    if (o.type === 'depot') { const d = gg.depots[o.depot]; const tw = d && gg.towns[d.town]; return (o.service ? 'Service at ' : 'Go to ') + (tw ? tw.name + ' depot' : 'depot') + (o.halt ? ' and stop' : ''); }
    const s = gg.stations[o.st];
    const nm = s ? esc(s.name) : '<span class="bad">(removed)</span>';
    let t = (o.type === 'via' ? 'Go via ' : 'Go to ') + nm;
    if (o.load) t += `<span class="flag">${LOADN[o.load]}</span>`;
    if (o.unload) t += `<span class="flag">${UNLOADN[o.unload]}</span>`;
    if (o.wait) t += `<span class="flag">wait ${o.wait}d</span>`;
    return t;
  };
  W.orderInsertAt = function (v) {
    const w = UI.wins.get('veh' + v.id);
    const sel = w ? w.o.sel : -1;
    return sel >= 0 ? sel + 1 : V.orderList(g(), v).length;
  };
  W.ordersPanel = function (v, w) {
    const gg = g(), list = V.orderList(gg, v);
    const shared = V.sharedWith(gg, v).length;
    const mine = v.owner === gg.player;
    let h = `<div class="list orders" style="max-height:220px">`;
    if (!list.length) h += `<div class="it dim" style="cursor:default">No orders. Click <b>Add</b>, then click stations on the map.</div>`;
    list.forEach((o, i) => { h += `<div class="it ${w.o.sel === i ? 'sel' : ''} ${v.oi === i ? 'cur' : ''}" data-a="osel" data-v="${i}"><span class="idx">${i + 1}</span><span class="grow">${W.orderText(o)}</span></div>`; });
    h += `<div class="it dim" data-a="osel" data-v="-1" style="font-size:12px">— end of orders —</div></div>`;
    if (shared) h += `<p class="lede" style="margin:6px 0 0">Orders shared with ${shared} other vehicle${shared > 1 ? 's' : ''}. Changes apply to all of them.</p>`;
    if (!mine) return h;
    const o = w.o.sel >= 0 ? list[w.o.sel] : null;
    const isSt = o && o.type !== 'depot';
    h += `<div class="row" style="margin-top:8px">
      ${UI.btn('Add', 'oadd', { icon: 'plus', cls: HL.Tools.orderFor === v.id ? 'on' : 'primary', tip: 'Click stations, depots or buoys on the map. Click another of your vehicles to share its orders.' })}
      ${UI.btn('Delete', 'odel', { icon: 'minus', dis: !o })}
      ${UI.btn('Go here', 'ogo', { icon: 'skip', dis: !o, tip: 'Make this the current order' })}
      ${UI.btn('Depot', 'odepot', { icon: 'depot', tip: 'Add a service stop at the nearest depot' })}
    </div><div class="row">
      ${UI.btn(o && o.load ? LOADN[o.load] : 'Load if available', 'oload', { dis: !isSt, tip: 'Cycle: normal, full load (all), full load (any cargo), no loading' })}
      ${UI.btn(o && o.unload ? UNLOADN[o.unload] : 'Unload if accepted', 'ounload', { dis: !isSt, tip: 'Cycle: normal, unload all, transfer (leave for another vehicle), no unloading' })}
      ${UI.btn(o && o.type === 'via' ? 'Go via' : 'Stop here', 'ovia', { dis: !isSt, tip: 'Pass through without stopping' })}
    </div><div class="row">
      <span class="dim" style="font-size:12.5px">Wait at station</span>${UI.ibtn('minus', 'owait', 'Shorter', { arg: -1, dis: !isSt })}<span class="num" style="min-width:36px;text-align:center">${o && o.wait ? o.wait + ' days' : '—'}</span>${UI.ibtn('plus', 'owait', 'Longer', { arg: 1, dis: !isSt })}
      <span style="flex:1"></span>
      ${shared ? UI.btn('Unshare', 'ounshare', { icon: 'link', tip: 'Give this vehicle its own copy of the orders' }) : ''}
    </div>`;
    return h;
  };
  W.orderActions = function (id) {
    const cur = (w) => { const v = g().vehicles[id]; const l = V.orderList(g(), v); return { v, l, o: l[w.o.sel] }; };
    return {
      osel: (i, el, e, w) => { w.o.sel = +i; },
      oadd: (x, el, e, w) => { if (HL.Tools.orderFor === id) HL.Tools.cancel(); else { HL.Tools.startOrders(id); UI.toast('Click stations or depots on the map to add orders', 'info'); } },
      odel: (x, el, e, w) => { const { v } = cur(w); if (w.o.sel >= 0) { V.removeOrder(g(), v, w.o.sel); w.o.sel = Math.min(w.o.sel, V.orderList(g(), v).length - 1); } },
      ogo: (x, el, e, w) => { const { v } = cur(w); V.skipOrder(g(), v, w.o.sel); },
      oload: (x, el, e, w) => { const { o } = cur(w); if (o) o.load = ((o.load || 0) + 1) % 4; },
      ounload: (x, el, e, w) => { const { o } = cur(w); if (o) o.unload = ((o.unload || 0) + 1) % 4; },
      ovia: (x, el, e, w) => { const { o } = cur(w); if (o) o.type = o.type === 'via' ? 'go' : 'via'; },
      owait: (d, el, e, w) => { const { o } = cur(w); if (o) o.wait = HL.clamp((o.wait || 0) + (+d) * (e.shiftKey ? 10 : 1), 0, 120); },
      ounshare: () => { V.unshare(g(), g().vehicles[id]); },
      odepot: (x, el, e, w) => { const v = g().vehicles[id]; if (v.kind === 'air') { UI.toast('Aircraft service at their home hangar automatically'); return; } const d = V.nearestDepot(g(), v); if (!d) { UI.toast('No depot for this vehicle yet'); return; } V.addOrder(g(), v, { type: 'depot', depot: d.id, service: true }, W.orderInsertAt(v)); },
    };
  };

  // ---------- depot ----------
  W.depot = function (id) {
    const d0 = g().depots[id]; if (!d0) return;
    const kindName = ['Train Depot', 'Road Vehicle Depot', 'Shipyard'][d0.kind];
    UI.open('dep' + id, {
      w: 460, posKey: 'depot', title: () => { const d = g().depots[id]; const tw = d && g().towns[d.town]; return (tw ? tw.name + ' ' : '') + kindName; },
      sel: null,
      render: (w) => {
        const gg = g(), d = gg.depots[id];
        if (!d) return '<p class="lede">Depot removed.</p>';
        const vs = gg.vehicles.filter(v => v && !v.part && v.inDepot && v.depot === id);
        let h = `<div class="list" style="max-height:260px;min-height:90px">`;
        if (!vs.length) h += `<div class="it dim" style="cursor:default">Empty. Buy a vehicle to get started.</div>`;
        for (const v of vs) {
          h += `<div class="it ${w.o.sel === v.id ? 'sel' : ''}" data-a="sel" data-v="${v.id}">
            <div style="flex:none;${v.kind === 'rail' ? 'max-width:250px;overflow:hidden;white-space:nowrap' : ''}">${v.kind === 'rail' ? W.trainStrip(v) : `<img src="${W.vehThumb(v, 64, 38)}" width="64" height="38" alt="">`}</div>
            <div class="grow"><div>${esc(V.displayName(v))}</div><div class="sub">${v.stopped ? 'Stopped' : 'Leaving'} · ${esc(V.capacityText(v))}</div></div>
            <button class="btn icon" data-a="go" data-v="${v.id}" data-tip="${v.stopped ? 'Start' : 'Stop'}">${v.stopped ? UI.ICON.play : UI.ICON.stop}</button></div>`;
        }
        h += `</div><div class="row" style="margin-top:8px">${UI.btn(d.kind === 0 ? 'New engines & wagons' : 'New vehicles', 'buy', { icon: 'plus', cls: 'primary' })}
          ${UI.btn('Open', 'open', { dis: w.o.sel == null, icon: 'info' })}${UI.btn('Sell', 'sell', { dis: w.o.sel == null, icon: 'sell' })}
          ${UI.ibtn('target', 'center', 'Centre view on depot')}</div>`;
        if (d.kind === 0) h += `<p class="lede" style="margin:8px 0 0">Select a train, then buy wagons to add them to it. Click a car in the train window strip to remove it.</p>`;
        const sel = gg.vehicles[w.o.sel];
        if (sel && sel.kind === 'rail' && sel.inDepot && sel.depot === id) {
          h += `<div class="sep"></div><h3>Consist of ${esc(V.displayName(sel))}</h3><div class="row" style="flex-wrap:nowrap;overflow-x:auto">${sel.cars.map((c, i) => `<img src="${W.modelThumb(c.model, sel.owner, 52, 30)}" width="52" height="30" data-a="rmcar" data-v="${i}" style="cursor:pointer" data-tip="Remove ${esc(HL.VEH[c.model].name)}" alt="">`).join('')}</div><div class="dim" style="font-size:12px;margin-top:4px">Length ${sel.len.toFixed(1)} tiles · ${HL.fmtInt(sel.power)} hp · ${HL.fmtInt(sel.wt)} t · ${UI.fmtSpeed(sel.vmax)}</div>`;
        }
        return h;
      },
      actions: {
        sel: (vid, el, e, w) => { w.o.sel = +vid; },
        go: (vid) => { const v = g().vehicles[+vid]; v.stopped = !v.stopped; },
        open: (x, el, e, w) => W.vehicle(w.o.sel),
        sell: (x, el, e, w) => { const v = g().vehicles[w.o.sel]; if (!v) return; v.stopped = true; const r = V.sell(g(), v); if (!r.ok) UI.toast(r.err); else { w.o.sel = null; if (HL.Audio) HL.Audio.cash(); } },
        rmcar: (i, el, e, w) => { const v = g().vehicles[w.o.sel]; v.stopped = true; const r = V.removeCar(g(), v, +i); if (!r.ok) UI.toast(r.err); else if (!g().vehicles[v.id]) w.o.sel = null; },
        buy: (x, el, e, w) => W.purchase({ depot: id, train: w.o.sel }),
        center: () => { const d = g().depots[id]; HL.G.centerOn(d.x + 0.5, d.y + 0.5); },
      },
    });
  };

  // ---------- purchase ----------
  W.purchase = function (o) {
    const gg = g();
    const d = o.depot != null ? gg.depots[o.depot] : null;
    const kind = o.air != null ? 'air' : ['rail', 'road', 'ship'][d.kind];
    const id = 'buy-' + (o.air != null ? 'a' + o.air : 'd' + o.depot);
    UI.open(id, {
      w: 640, posKey: 'buy', title: { rail: 'Buy Engines & Wagons', road: 'Buy Road Vehicles', ship: 'Buy Ships', air: 'Buy Aircraft' }[kind],
      sel: null, filter: kind === 'rail' ? 'engines' : 'all', cargo: null,
      render: (w) => {
        const gg = g(), yr = HL.ymd(gg.date).y;
        let models = HL.vehList(kind).filter(m => HL.vehAvailable(m, yr, gg.unlockAll));
        if (kind === 'rail') {
          const drt = d.rt;
          models = models.filter(m => m.engine ? HL.railCompatible(m.rt, drt) : (m.rt === drt || (m.rt === 0 && drt === 1)));
          models = models.filter(m => w.o.filter === 'engines' ? m.engine : !m.engine);
          if (w.o.filter === 'wagons') { const best = {}; for (const m of models) if (!best[m.cargo] || m.gen > best[m.cargo].gen) best[m.cargo] = m; models = Object.values(best).filter(m => HL.CLIMATES[gg.opts.climate].cargos.includes(m.cargo)); }
        }
        if (kind === 'road') models = models.filter(m => HL.CLIMATES[gg.opts.climate].cargos.includes(m.cargo));
        if (kind === 'air') { const s = gg.stations[o.air]; const at = HL.Stations.airportType(s.airport.type); models = models.filter(m => at.heliOnly ? m.heli : (m.heli || m.size <= Math.max(at.size, at.size >= 1 ? 2 : 0))); }
        models.sort((a, b) => (a.cargo || '').localeCompare(b.cargo || '') || a.intro - b.intro);
        const sel = HL.VEH[w.o.sel] || models[0];
        if (sel) w.o.sel = sel.id;
        const train = o.train != null ? gg.vehicles[o.train] : null;
        let h = '';
        if (kind === 'rail') h += `<div class="tabs"><button class="${w.o.filter === 'engines' ? 'on' : ''}" data-a="flt" data-v="engines">Locomotives</button><button class="${w.o.filter === 'wagons' ? 'on' : ''}" data-a="flt" data-v="wagons">Wagons &amp; coaches</button><span style="flex:1"></span><span class="dim" style="font-size:12px;align-self:center">Depot track: ${HL.RAILTYPES[d.rt].name}</span></div>`;
        h += `<div class="buy"><div class="list" style="max-height:340px">`;
        for (const m of models) {
          const cost = HL.Game.vehCost(gg, m);
          h += `<div class="it ${sel && sel.id === m.id ? 'sel' : ''}" data-a="pick" data-v="${m.id}"><img src="${W.modelThumb(m.id, gg.player, 56, 32)}" width="56" height="32" alt=""><div class="grow"><div>${esc(m.name)}</div><div class="sub">${m.engine ? HL.fmtInt(m.power) + ' hp · ' : ''}${UI.fmtSpeed(m.speed)}${m.cap ? ' · ' + m.cap + ' ' + HL.CARGO[m.cargo].short : ''}</div></div><span class="num">${HL.fmtMoney(cost, true)}</span></div>`;
        }
        if (!models.length) h += `<div class="it dim">Nothing available for this depot yet.</div>`;
        h += `</div><div class="preview">`;
        if (sel) {
          const cost = HL.Game.vehCost(gg, sel), run = Math.round(sel.run * gg.econ.costMul * gg.diff.runCost);
          const refit = sel.refit && sel.refit.length > 1;
          if (refit && (!w.o.cargo || !sel.refit.includes(w.o.cargo))) w.o.cargo = sel.cargo;
          h += `<canvas id="buy-prev" width="440" height="220"></canvas><div style="font-weight:600;margin-bottom:4px">${esc(sel.name)}</div>
            <dl class="kv"><dt>Price</dt><dd>${UI.money(cost)}</dd><dt>Speed</dt><dd>${UI.fmtSpeed(sel.speed)}</dd>
            ${sel.engine ? `<dt>Power</dt><dd>${HL.fmtInt(sel.power)} hp</dd>` : ''}${sel.kind === 'rail' ? `<dt>Weight</dt><dd>${sel.wt} t</dd>` : ''}
            ${sel.cap ? `<dt>Capacity</dt><dd>${refit ? HL.refitCap(sel, w.o.cargo) + ' ' + HL.CARGO[w.o.cargo].short : sel.cap + ' ' + HL.CARGO[sel.cargo].short}${sel.mailCap ? ' + ' + sel.mailCap + ' bags' : ''}</dd>` : ''}
            ${run ? `<dt>Running cost</dt><dd>${HL.fmtMoney(run)}/yr</dd>` : ''}<dt>Reliability</dt><dd>${Math.round(HL.Veh.modelRel(gg, sel) * 100)}%</dd>
            <dt>Lifespan</dt><dd>${sel.age} years</dd><dt>Designed</dt><dd>${sel.intro}</dd>
            ${sel.kind === 'rail' ? `<dt>Track</dt><dd>${HL.RAILTYPES[sel.rt].name}</dd>` : ''}
            ${sel.kind === 'air' ? `<dt>Needs</dt><dd>${sel.heli ? 'Heliport or any airport' : sel.size >= 2 ? 'International airport' : sel.size >= 1 ? 'City airport or larger' : 'Any airport'}</dd>` : ''}</dl>
            ${sel.desc ? `<p class="lede" style="margin:6px 0 0">${esc(sel.desc)}</p>` : ''}
            ${refit ? `<div class="row" style="margin-top:6px"><span class="dim" style="font-size:12px">Carry</span><select data-c="cargo">${sel.refit.filter(c => HL.CLIMATES[gg.opts.climate].cargos.includes(c)).map(c => `<option value="${c}" ${c === w.o.cargo ? 'selected' : ''}>${HL.CARGO[c].name}</option>`).join('')}</select></div>` : ''}
            <div class="row" style="margin-top:8px">`;
          if (sel.wagon) h += UI.btn(train ? 'Add to ' + esc(V.displayName(train)) : 'Select a train first', 'buyw', { cls: 'primary', dis: !train, icon: 'plus' });
          else h += UI.btn('Buy for ' + HL.fmtMoney(cost, true), 'buyv', { cls: 'primary', icon: 'plus' });
          h += `</div>`;
        }
        h += `</div></div>`;
        return h;
      },
      after: (w) => {
        const sel = HL.VEH[w.o.sel]; const c = UI.$('#buy-prev', w.body); if (!sel || !c) return;
        const key = sel.id + ':' + (w.o.cargo || '');
        if (c.dataset.k === key) return; c.dataset.k = key;
        const ctx = c.getContext('2d'); ctx.clearRect(0, 0, c.width, c.height);
        const liv = HL.LIVERY[g().companies[g().player].color];
        const m = HL.Vis.buildModel('prev', sel.art, sel.len, liv, { gen: sel.gen, fill: 2, cargo: w.o.cargo || sel.cargo, body: sel.body });
        const yaw = -0.48;
        const b1 = m.bounds(1, { yaw });
        const sc = Math.min(440 * 0.8 / (b1.x1 - b1.x0 - 6), 220 * 0.8 / (b1.y1 - b1.y0 - 6));
        const b = m.bounds(sc, { yaw });
        m.draw(ctx, sc, (440 - (b.x1 - b.x0)) / 2 - b.x0, (220 - (b.y1 - b.y0)) / 2 - b.y0 + 10, { yaw });
      },
      actions: {
        flt: (f, el, e, w) => { w.o.filter = f; w.o.sel = null; },
        pick: (mid, el, e, w) => { w.o.sel = mid; },
        cargo: (c, el, e, w) => { w.o.cargo = c; },
        buyv: (x, el, e, w) => {
          const gg = g();
          const r = kind === 'air' ? V.buyAircraft(gg, gg.player, o.air, w.o.sel, { cargo: w.o.cargo }) : V.buy(gg, gg.player, o.depot, w.o.sel, { cargo: w.o.cargo });
          if (!r.ok) { UI.toast(r.err); return; }
          if (HL.Audio) HL.Audio.ui('buy');
          if (kind === 'rail') { o.train = r.v.id; const dw = UI.wins.get('dep' + o.depot); if (dw) dw.o.sel = r.v.id; w.o.filter = 'wagons'; w.o.sel = null; }
          else W.vehicle(r.v.id);
          HL.emit('bought', r.v);
        },
        buyw: (x, el, e, w) => { const gg = g(); const tr = gg.vehicles[o.train]; const r = V.addWagon(gg, tr, w.o.sel); if (!r.ok) UI.toast(r.err); else if (HL.Audio) HL.Audio.ui('buy'); },
      },
    });
  };

  // ---------- station ----------
  W.station = function (id) {
    if (!g().stations[id]) return;
    UI.open('st' + id, {
      w: 380, posKey: 'station', title: () => { const s = g().stations[id]; return s ? s.name : 'Station'; },
      onClose: () => { if (HL.Tools.showStationCatch === id) HL.Tools.showStationCatch = null; },
      render: (w) => {
        const gg = g(), s = gg.stations[id];
        if (!s) return '<p class="lede">Station removed.</p>';
        const F = HL.Stations.FAC;
        const facs = [[F.rail, 'train', 'Railway station'], [F.bus, 'bus', 'Bus stop'], [F.truck, 'truck', 'Lorry bay'], [F.dock, 'ship', 'Dock'], [F.air, 'plane', 'Airport']].filter(f => s.fac & f[0]);
        let h = `<div class="row" style="gap:10px">${facs.map(f => `<span data-tip="${f[2]}" style="width:22px;height:22px;display:inline-block;color:var(--gold-2)">${UI.ICON[f[1] === 'truck' ? 'bus' : f[1]]}</span>`).join('')}<span style="flex:1"></span>${s.owner < 250 ? `<span style="font-size:12.5px">${UI.swatch(gg, s.owner)}${esc(gg.companies[s.owner].name)}</span>` : '<span class="dim" style="font-size:12.5px">Open to all companies</span>'}</div>`;
        h += `<h3 style="margin-top:12px">Waiting cargo</h3>`;
        const cs = Object.keys(s.cargo).filter(c => s.cargo[c].everPicked || s.cargo[c].n);
        if (!cs.length) h += `<p class="lede">Nothing yet. Cargo only starts arriving once a vehicle has called here to load it.</p>`;
        for (const c of cs) {
          const r = HL.Stations.ratingPct(s, c), n = s.cargo[c].n;
          h += `<div class="cargo-row"><span><i class="sw" style="background:${HL.CARGO[c].col}"></i>${HL.CARGO[c].name}</span><span class="num">${HL.fmtInt(n)}</span><span data-tip="Station rating: how much of the available cargo comes here">${r != null ? `<div class="bar"><i style="width:${r}%;background:${r < 40 ? 'var(--bad)' : r < 65 ? 'var(--warn)' : 'var(--good)'}"></i></div>` : ''}</span></div>`;
        }
        const acc = Object.keys(s.accepts).map(c => HL.CARGO[c].name);
        h += `<h3>Accepts</h3><p style="margin:0;font-size:13px">${acc.length ? acc.join(', ') : '<span class="dim">Nothing</span>'}</p>`;
        const lastIn = Object.keys(s.lastIn || {}).reduce((a, c) => a + s.lastIn[c], 0), lastOut = Object.keys(s.lastOut || {}).reduce((a, c) => a + s.lastOut[c], 0);
        h += `<dl class="kv" style="margin-top:8px"><dt>Supplied last month</dt><dd>${HL.fmtInt(lastIn)}</dd><dt>Delivered last month</dt><dd>${HL.fmtInt(lastOut)}</dd><dt>Built</dt><dd>${HL.fmtDate(s.built)}</dd></dl>`;
        const vs = gg.vehicles.filter(v => v && v.owner === gg.player && V.orderList(gg, v).some(o => o.st === id));
        h += `<h3>Vehicles calling (${vs.length})</h3>`;
        if (vs.length) h += `<div class="list" style="max-height:120px">${vs.slice(0, 40).map(v => `<div class="it" data-a="veh" data-v="${v.id}"><span class="grow">${esc(V.displayName(v))}</span><span class="sub">${esc(HL.VEH[v.model].name)}</span></div>`).join('')}</div>`;
        h += `<div class="sep"></div><div class="row">${UI.ibtn('target', 'center', 'Centre view')}${UI.btn('Catchment', 'catch', { cls: HL.Tools.showStationCatch === id ? 'on' : '', tip: 'Show the area this station collects from and delivers to' })}${s.owner === gg.player ? UI.ibtn('rename', 'rename', 'Rename') : ''}${s.airport && s.owner === gg.player ? UI.btn('Hangar', 'hangar', { icon: 'plane' }) : ''}</div>`;
        return h;
      },
      actions: {
        center: () => { const s = g().stations[id]; HL.G.centerOn(s.x + 0.5, s.y + 0.5); },
        catch: () => { HL.Tools.showStationCatch = HL.Tools.showStationCatch === id ? null : id; },
        rename: () => { const s = g().stations[id]; UI.prompt('Rename station', s.name, n => { if (n) s.name = n; }); },
        veh: (vid) => W.vehicle(+vid),
        hangar: () => W.hangar(id),
      },
    });
  };
  W.hangar = function (sid) {
    UI.open('hangar' + sid, {
      w: 420, posKey: 'depot', title: () => { const s = g().stations[sid]; return (s ? s.name : '') + ' Hangar'; },
      render: () => {
        const gg = g(), s = gg.stations[sid];
        if (!s || !s.airport) return '<p class="lede">No airport here any more.</p>';
        const vs = gg.vehicles.filter(v => v && v.kind === 'air' && v.airState === 'hangar' && v.hangarSt === sid);
        return `<div class="list" style="min-height:80px">${vs.length ? vs.map(v => `<div class="it" data-a="veh" data-v="${v.id}"><img src="${W.vehThumb(v, 64, 38)}" width="64" height="38" alt=""><div class="grow"><div>${esc(V.displayName(v))}</div><div class="sub">${v.stopped ? 'Stopped' : 'Leaving'}</div></div><button class="btn icon" data-a="go" data-v="${v.id}">${v.stopped ? UI.ICON.play : UI.ICON.stop}</button></div>`).join('') : '<div class="it dim">No aircraft in the hangar.</div>'}</div><div class="row" style="margin-top:8px">${UI.btn('New aircraft', 'buy', { cls: 'primary', icon: 'plus' })}</div>`;
      },
      actions: { veh: (v) => W.vehicle(+v), go: (v) => { const vv = g().vehicles[+v]; vv.stopped = !vv.stopped; }, buy: () => W.purchase({ air: sid }) },
    });
  };

  // ---------- town ----------
  W.town = function (id) {
    if (!g().towns[id]) return;
    UI.open('town' + id, {
      w: 360, posKey: 'town', title: () => g().towns[id].name,
      render: () => {
        const gg = g(), tw = gg.towns[id];
        const r = HL.Towns.ratingOf(tw, gg.player);
        const growth = tw.starved ? `<span class="bad">Not growing: needs ${tw.needs.map(c => HL.CARGO[c].name.toLowerCase()).join(' and ')}</span>` : tw.growthDays >= 300 ? '<span class="dim">Growing slowly. Serve it with stations to speed things up</span>' : `Grows every ~${tw.growthDays} days`;
        let h = `<dl class="kv"><dt>Population</dt><dd>${HL.fmtInt(tw.pop)}</dd><dt>Buildings</dt><dd>${tw.houses}</dd>
          <dt>Passengers last month</dt><dd>${HL.fmtInt(tw.lastPassAct)} <span class="dim">of ${HL.fmtInt(tw.lastPassMax)}</span></dd>
          <dt>Mail last month</dt><dd>${HL.fmtInt(tw.lastMailAct)} <span class="dim">of ${HL.fmtInt(tw.lastMailMax)}</span></dd>
          ${tw.needs.map(c => `<dt>${HL.CARGO[c].name} delivered</dt><dd class="${tw.lastRecv[c] ? '' : 'bad'}">${HL.fmtInt(tw.lastRecv[c] || 0)}</dd>`).join('')}
          ${tw.lastRecv.goods ? `<dt>Goods delivered</dt><dd>${HL.fmtInt(tw.lastRecv.goods)}</dd>` : ''}
          <dt>Stations served</dt><dd>${tw.active || 0}</dd></dl><p style="font-size:13px;margin:8px 0 0">${growth}${tw.fundUntil > gg.date ? ' · <span class="good">building boom</span>' : ''}${tw.roadworks > gg.date ? ' · <span class="warn">roadworks</span>' : ''}</p>`;
        h += `<h3>Company ratings</h3><table class="tt">`;
        const cs = Object.keys(tw.ratings).map(Number).filter(c => gg.companies[c] && gg.companies[c].alive);
        if (!cs.includes(gg.player)) cs.unshift(gg.player);
        for (const c of cs) { const rv = HL.Towns.ratingOf(tw, c); h += `<tr><td>${UI.swatch(gg, c)}${esc(gg.companies[c].name)}</td><td class="r ${rv < 0 ? 'bad' : rv >= 400 ? 'good' : ''}">${HL.Towns.ratingName(rv)}</td></tr>`; }
        h += `</table>`;
        if (tw.exclusive && tw.exclusive.until > gg.date) h += `<p class="lede" style="margin-top:6px">Exclusive rights: ${esc(gg.companies[tw.exclusive.cid].name)} until ${HL.fmtDate(tw.exclusive.until)}</p>`;
        h += `<div class="sep"></div><div class="row">${UI.ibtn('target', 'center', 'Centre view')}${UI.btn('Local authority', 'auth', { icon: 'town' })}</div>`;
        return h;
      },
      actions: { center: () => { const t = g().towns[id]; HL.G.centerOn(t.x + 0.5, t.y + 0.5); }, auth: () => W.authority(id) },
    });
  };
  W.authority = function (id) {
    UI.open('auth' + id, {
      w: 430, title: () => g().towns[id].name + ' Local Authority',
      sel: 'adSmall',
      render: (w) => {
        const gg = g(), tw = gg.towns[id], r = HL.Towns.ratingOf(tw, gg.player);
        let h = `<p class="lede">Your rating here: <b style="color:var(--ink)">${HL.Towns.ratingName(r)}</b>. Below Poor, the council refuses new stations and won't let you knock buildings down.</p><div class="list">`;
        for (const a of HL.Towns.ACTIONS) {
          const err = HL.Towns.canDo(gg, tw, gg.player, a.id);
          h += `<div class="it ${w.o.sel === a.id ? 'sel' : ''}" data-a="pick" data-v="${a.id}"><span class="grow ${err ? 'dim' : ''}">${a.name}</span><span class="num">${HL.fmtMoney(HL.Towns.actionCost(gg, a), true)}</span></div>`;
        }
        const a = HL.Towns.ACTIONS.find(x => x.id === w.o.sel);
        const err = HL.Towns.canDo(gg, tw, gg.player, a.id);
        h += `</div><p style="font-size:13px;margin:10px 0">${a.desc}${err ? `<br><span class="warn">${err}</span>` : ''}</p><div class="row">${UI.btn('Do it for ' + HL.fmtMoney(HL.Towns.actionCost(gg, a)), 'do', { cls: 'primary', dis: !!err })}</div>`;
        return h;
      },
      actions: {
        pick: (a, el, e, w) => { w.o.sel = a; },
        do: (x, el, e, w) => { const r = HL.Towns.doAction(g(), g().towns[id], g().player, w.o.sel); if (!r.ok) UI.toast(r.err); else { if (HL.Audio) HL.Audio.cash(); UI.toast('Done. ' + HL.fmtMoney(r.cost) + ' spent.', 'info'); } },
      },
    });
  };

  // ---------- industry ----------
  W.industry = function (id) {
    if (!g().industries[id]) return;
    UI.open('ind' + id, {
      w: 360, posKey: 'industry', title: () => { const i = g().industries[id]; return i ? i.name : 'Industry'; },
      render: () => {
        const gg = g(), ind = gg.industries[id];
        if (!ind) return '<p class="lede">This industry has closed down.</p>';
        const def = HL.INDUSTRY[ind.type];
        let h = '';
        if (ind.closing) h += `<p class="bad" style="margin:0 0 8px">Closing down soon.</p>`;
        const prods = Object.keys(ind.prod);
        if (prods.length) {
          h += `<h3>Production last month</h3>`;
          for (const c of prods) { const p = ind.prod[c]; h += `<div class="cargo-row"><span><i class="sw" style="background:${HL.CARGO[c].col}"></i>${HL.CARGO[c].name}</span><span class="num">${HL.fmtInt(p.lastMade)} ${HL.CARGO[c].short}</span><span><div class="bar" data-tip="${p.pct || 0}% transported"><i style="width:${p.pct || 0}%"></i></div></span></div>`; }
          h += `<p class="lede" style="margin:6px 0 0">Industries served well (over 60% transported) tend to grow. Neglected ones shrink and close.</p>`;
        }
        if (def.accepts) {
          h += `<h3>Accepts</h3><div style="font-size:13px">${def.accepts.map(c => `<div class="cargo-row"><span><i class="sw" style="background:${HL.CARGO[c].col}"></i>${HL.CARGO[c].name}</span><span class="num">${HL.fmtInt((ind.lastAcc || {})[c] || 0)}</span><span class="dim" style="font-size:12px">last month</span></div>`).join('')}</div>`;
          if (def.out) h += `<p class="lede" style="margin:6px 0 0">Turns deliveries into ${def.out.map(c => HL.CARGO[c].name.toLowerCase()).join(' and ')}.</p>`;
        }
        const sts = HL.Ind.stations(gg, ind).map(s => gg.stations[s]).filter(Boolean);
        h += `<h3>Nearby stations</h3><p style="margin:0;font-size:13px">${sts.length ? sts.map(s => `${s.owner < 250 ? UI.swatch(gg, s.owner) : ''}${esc(s.name)}`).join('<br>') : '<span class="dim">None</span>'}</p>`;
        h += `<div class="sep"></div><div class="row">${UI.ibtn('target', 'center', 'Centre view')}<span class="dim" style="font-size:12px">Founded ${HL.ymd(ind.founded).y}</span></div>`;
        return h;
      },
      actions: { center: () => { const i = g().industries[id]; HL.G.centerOn(i.x + i.w / 2, i.y + i.h / 2); } },
    });
  };

  // ---------- land info ----------
  W.landInfo = function (x, y) {
    UI.open('land', {
      w: 320, title: 'Land Area Information', live: false,
      render: () => {
        const gg = g(), m = gg.map, t = m.t(x, y);
        const names = ['Clear land', 'Water', 'Railway track', 'Road', 'Town building', 'Industry', 'Station', 'Depot', 'Structure'];
        const owner = m.owner[t] === HL.OWNER_TOWN ? 'Town' : m.owner[t] === HL.OWNER_NONE || m.owner[t] === HL.OWNER_WATER ? 'None' : (gg.companies[m.owner[t]] || {}).name || '?';
        const gnames = ['Grass', 'Rough land', 'Rocks', 'Farmland', 'Bare earth', 'Desert', 'Beach'];
        const tw = HL.Build.closestTown(gg, x, y);
        const acc = HL.Stations.acceptanceAt(gg, x - 4, y - 4, x + 4, y + 4);
        const accL = Object.keys(acc).filter(c => acc[c] >= 8 && HL.CLIMATES[gg.opts.climate].cargos.includes(c)).map(c => HL.CARGO[c].name);
        let what = names[m.type[t]];
        if (m.type[t] === T.CLEAR) what = gnames[m.ground[t]] + ((m.trees[t] & 7) ? ' with trees' : '');
        if (m.type[t] === T.HOUSE) what = HL.Towns.isSpecial(m, t) ? HL.HOUSE_SPECIAL[HL.Towns.specialId(m, t)].name : HL.HOUSE_TIERS[m.m1[t] & 7].name;
        const clear = HL.Build.demolish(gg, gg.player, x, y, false);
        return `<dl class="kv"><dt>Type</dt><dd style="font-family:var(--f-ui);font-size:13px">${esc(what)}</dd><dt>Owner</dt><dd style="font-family:var(--f-ui);font-size:13px">${esc(owner)}</dd>
          <dt>Location</dt><dd>${x}, ${y}</dd><dt>Height</dt><dd>${m.tileMin(x, y) * 10} m</dd>
          ${gg.opts.climate === 'desert' ? `<dt>Zone</dt><dd style="font-family:var(--f-ui);font-size:13px">${['Normal', 'Desert', 'Rainforest'][m.zone[t]]}</dd>` : ''}
          <dt>Cost to clear</dt><dd>${clear.ok ? HL.fmtMoney(clear.cost) : '<span class="dim">' + esc(clear.err) + '</span>'}</dd>
          <dt>Local authority</dt><dd style="font-family:var(--f-ui);font-size:13px">${tw ? esc(tw.name) : 'None'}</dd></dl>
          <h3>Acceptance within 4 tiles</h3><p style="margin:0;font-size:13px">${accL.length ? accL.join(', ') : '<span class="dim">Nothing</span>'}</p>`;
      },
    });
  };

  // ---------- bridge picker ----------
  W.bridgePicker = function (ax, ay, bx, by, transport) {
    const gg = g(), cid = gg.player;
    const p = HL.Build.planBridge(gg, cid, ax, ay, bx, by, transport);
    if (!p.ok) { UI.toast(p.err); return; }
    const yr = HL.ymd(gg.date).y;
    const types = HL.BRIDGES.map((b, i) => ({ b, i })).filter(x => yr >= x.b.intro || gg.unlockAll);
    UI.open('bridge', {
      w: 380, title: 'Choose a Bridge', live: false,
      render: () => `<p class="lede">${p.len}-tile span, deck ${(p.H - Math.min(p.hA, p.hB)) * 10} m above the ends.</p><div class="list">${types.map(({ b, i }) => {
        const r = HL.Build.buildBridge(gg, cid, ax, ay, bx, by, transport, i, Tools().opt.rt, false);
        return `<div class="it ${r.ok ? '' : 'dim'}" data-a="${r.ok ? 'pick' : ''}" data-v="${i}"><div class="grow"><div>${b.name}</div><div class="sub">${r.ok ? 'Up to ' + UI.fmtSpeed(b.speed) : esc(r.err)}</div></div><span class="num">${r.ok ? HL.fmtMoney(r.cost, true) : ''}</span></div>`;
      }).join('')}</div>`,
      actions: { pick: (i) => { UI.close('bridge'); UI.cmd(ex => HL.Build.buildBridge(gg, cid, ax, ay, bx, by, transport, +i, Tools().opt.rt, ex), { sound: 'bridge' }); } },
    });
  };
  const Tools = () => HL.Tools;
})(typeof window !== 'undefined' ? window : globalThis);
