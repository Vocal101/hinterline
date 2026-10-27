// UI core: icons, window manager, tooltips, toasts, prompts, command execution.
(function (root) {
  const HL = root.HL;
  const UI = HL.UI = {};

  // ---------- icons (24x24, single stroke weight) ----------
  const S = (d, extra) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}${extra || ''}</svg>`;
  UI.ICON = {
    pause: S('<path d="M8 5v14M16 5v14"/>'),
    play: S('<path d="M7 5l12 7-12 7z"/>'),
    ff: S('<path d="M4 6l8 6-8 6zM12 6l8 6-8 6z"/>'),
    fff: S('<path d="M2 7l6 5-6 5zM9 7l6 5-6 5zM16 7l6 5-6 5z"/>'),
    gear: S('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>'),
    ledger: S('<path d="M5 4h11a3 3 0 013 3v13H8a3 3 0 01-3-3z"/><path d="M5 17a3 3 0 013-3h11M9 8h6"/>'),
    map: S('<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>'),
    town: S('<path d="M3 20V11l5-4 5 4v9M13 20V8l4-3 4 3v12M3 20h18"/><path d="M7 20v-4h2v4"/>'),
    factory: S('<path d="M3 20V10l5 3V10l5 3V6h3l1-3h2l1 3v14z"/><path d="M3 20h18"/>'),
    ribbon: S('<circle cx="12" cy="9" r="5"/><path d="M9 13l-2 8 5-3 5 3-2-8"/>'),
    coins: S('<ellipse cx="9" cy="7" rx="5" ry="2.5"/><path d="M4 7v4c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5V7"/><ellipse cx="15" cy="14" rx="5" ry="2.5"/><path d="M10 14v4c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5v-4"/>'),
    company: S('<path d="M4 21V8h10v13M14 12h6v9M4 21h17"/><path d="M8 4v4M8 4l5 1.5L8 7"/><path d="M7 12h1M10 12h1M7 16h1M10 16h1"/>'),
    graph: S('<path d="M3 3v18h18"/><path d="M6 15l4-5 4 3 6-7"/>'),
    trophy: S('<path d="M8 4h8v5a4 4 0 01-8 0z"/><path d="M8 6H4c0 3 2 4 4 4M16 6h4c0 3-2 4-4 4M12 13v4M8 21h8M9 17h6"/>'),
    train: S('<rect x="6" y="3" width="12" height="13" rx="2"/><path d="M6 10h12M9 19l-2 2M15 19l2 2"/><circle cx="9" cy="13" r=".8" fill="currentColor"/><circle cx="15" cy="13" r=".8" fill="currentColor"/>'),
    bus: S('<rect x="4" y="4" width="16" height="13" rx="2"/><path d="M4 11h16M8 17v2M16 17v2"/><circle cx="8" cy="14" r=".8" fill="currentColor"/><circle cx="16" cy="14" r=".8" fill="currentColor"/>'),
    ship: S('<path d="M3 15l2 4h14l2-4z"/><path d="M6 15V9h8l3 6M10 9V5h3v4"/><path d="M2 21c2 0 2-1 4-1s2 1 4 1 2-1 4-1 2 1 4 1 2-1 4-1"/>'),
    plane: S('<path d="M2 13l8-1 5-8h2l-2 8 5 .5 2-2.5h1l-1 4 1 4h-1l-2-2.5-5 .5 2 8h-2l-5-8-8-1z"/>'),
    rail: S('<path d="M8 2l-3 20M16 2l3 20M6.5 6h11M6 11h12M5.3 16h13.4"/>'),
    road: S('<path d="M8 2L4 22M16 2l4 20M12 4v3M12 11v3M12 18v3"/>'),
    anchor: S('<circle cx="12" cy="5" r="2"/><path d="M12 7v14M5 13c0 4 3 7 7 7s7-3 7-7M8 11h8"/>'),
    tower: S('<path d="M9 22l1-12h4l1 12M8 10h8l-1-4H9z"/><path d="M12 6V3M5 22h14"/>'),
    terrain: S('<path d="M2 19l6-9 4 5 3-4 7 8z"/><path d="M15 4l2-2 2 2M17 2v5"/>'),
    tree: S('<path d="M12 22v-5M7 17h10L12 3z"/><path d="M9 12h6"/>'),
    dozer: S('<path d="M3 16h12v-5H8l-2 5M15 13h3l3 3v2"/><circle cx="6" cy="18" r="2"/><circle cx="13" cy="18" r="2"/><path d="M2 20h20"/>'),
    news: S('<path d="M4 5h13v14a2 2 0 002 2H6a2 2 0 01-2-2z"/><path d="M17 9h3v10a2 2 0 01-2 2M7 9h7M7 13h7M7 17h4"/>'),
    help: S('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 015 0c0 2-2.5 2-2.5 4M12 17h.01"/>'),
    close: S('<path d="M6 6l12 12M18 6L6 18"/>'),
    info: S('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>'),
    depot: S('<path d="M3 21V9l9-6 9 6v12"/><path d="M7 21v-8h10v8"/>'),
    station: S('<path d="M2 10l10-5 10 5M5 10v6M19 10v6M2 16h20M5 20h14"/>'),
    signal: S('<path d="M12 22V9M9 22h6"/><rect x="9" y="2" width="6" height="8" rx="2"/><circle cx="12" cy="6" r="1" fill="currentColor"/>'),
    bridge: S('<path d="M2 10h20M4 10v10M20 10v10M4 18c3-6 13-6 16 0"/>'),
    tunnel: S('<path d="M2 20l5-13h10l5 13"/><path d="M8 20v-5a4 4 0 018 0v5"/>'),
    bolt: S('<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>'),
    raise: S('<path d="M3 20l6-8 4 4 3-3 5 7z"/><path d="M12 8V2M9 5l3-3 3 3"/>'),
    lower: S('<path d="M3 20l6-8 4 4 3-3 5 7z"/><path d="M12 2v6M9 5l3 3 3-3"/>'),
    level: S('<path d="M3 16h18M3 20h18"/><path d="M6 12l3-4 3 2 3-3 3 5"/>'),
    buoy: S('<path d="M8 17l4-12 4 12z"/><path d="M2 20c2 0 2-1 4-1s2 1 4 1 2-1 4-1 2 1 4 1 2-1 4-1"/>'),
    query: S('<circle cx="10" cy="10" r="6"/><path d="M15 15l6 6"/>'),
    target: S('<circle cx="12" cy="12" r="7"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/>'),
    list: S('<path d="M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01"/>'),
    wrench: S('<path d="M14 6a4 4 0 015 5l-9 9-4-4 9-9z"/><path d="M16 4l-2 2"/>'),
    clone: S('<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M4 16V5a2 2 0 012-2h11"/>'),
    sell: S('<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>'),
    goDepot: S('<path d="M3 21V9l9-6 9 6v12"/><path d="M8 15h8M13 12l3 3-3 3"/>'),
    skip: S('<path d="M5 5l9 7-9 7zM18 5v14"/>'),
    link: S('<path d="M10 14a4 4 0 006 0l3-3a4 4 0 00-6-6l-1 1"/><path d="M14 10a4 4 0 00-6 0l-3 3a4 4 0 006 6l1-1"/>'),
    sound: S('<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9a4 4 0 010 6M19 6a8 8 0 010 12"/>'),
    music: S('<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>'),
    star: S('<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>'),
    goal: S('<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>'),
    sun: S('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
    moon: S('<path d="M20 14A8 8 0 0110 4a8 8 0 1010 10z"/>'),
    rain: S('<path d="M7 15a5 5 0 1110-3 4 4 0 010 8H7a3 3 0 010-6"/><path d="M9 19l-1 3M13 19l-1 3"/>'),
    snow: S('<path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7"/>'),
    follow: S('<circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>'),
    rename: S('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>'),
    plus: S('<path d="M12 5v14M5 12h14"/>'),
    minus: S('<path d="M5 12h14"/>'),
    rotate: S('<path d="M20 11a8 8 0 10-2.3 5.7"/><path d="M20 4v7h-7"/>'),
    group: S('<rect x="3" y="4" width="7" height="7" rx="1"/><rect x="14" y="4" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>'),
    stop: S('<rect x="6" y="6" width="12" height="12" rx="1"/>'),
    loan: S('<path d="M3 10l9-6 9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 20h18"/>'),
    autorail: S('<path d="M5 19c4-1 8-5 9-14M11 20c4-2 7-6 8-13"/><path d="M6 15l4 2M8 11l4 2M11 7l3 2"/>'),
  };

  // ---------- helpers ----------
  UI.esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  UI.money = (v, short) => `<span class="num ${v < 0 ? 'bad' : ''}">${HL.fmtMoney(v, short)}</span>`;
  UI.moneyGood = (v, short) => `<span class="num ${v < 0 ? 'bad' : v > 0 ? 'good' : ''}">${HL.fmtMoney(v, short)}</span>`;
  UI.btn = (label, act, o) => { o = o || {}; return `<button class="btn ${o.cls || ''}" data-a="${act}"${o.arg != null ? ` data-v="${UI.esc(o.arg)}"` : ''}${o.tip ? ` data-tip="${UI.esc(o.tip)}"` : ''}${o.dis ? ' disabled' : ''}>${o.icon ? UI.ICON[o.icon] : ''}${label ? `<span>${label}</span>` : ''}</button>`; };
  UI.ibtn = (icon, act, tip, o) => UI.btn('', act, Object.assign({ icon, tip, cls: 'icon ' + ((o && o.cls) || '') }, o || {}));
  UI.$ = (sel, el) => (el || document).querySelector(sel);
  UI.$$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));
  const livery = (g, cid) => HL.LIVERY[(g.companies[cid] || {}).color || 0];
  UI.swatch = (g, cid) => `<i class="sw" style="background:${livery(g, cid).main}"></i>`;

  // ---------- windows ----------
  UI.wins = new Map();
  let zTop = 10;
  const posMemory = {};
  UI.open = function (id, o) {
    let w = UI.wins.get(id);
    if (w) { Object.assign(w.o, o); UI.front(id); UI.render(id); return w; }
    const el = document.createElement('div');
    el.className = 'win lined' + (o.resizable ? ' resizable' : '') + (o.cls ? ' ' + o.cls : '');
    el.dataset.win = id;
    el.innerHTML = `<div class="win-title"><h2></h2>${o.help ? `<button class="wbtn" data-wa="help" data-tip="What is this?">${UI.ICON.help}</button>` : ''}${o.pin !== false ? '' : ''}<button class="wbtn" data-wa="close" data-tip="Close (Esc)">${UI.ICON.close}</button></div><div class="win-body"></div>`;
    if (o.w) el.style.width = o.w + 'px';
    if (o.h) el.style.height = o.h + 'px';
    document.getElementById('ui').appendChild(el);
    w = { id, el, o, body: el.querySelector('.win-body') };
    UI.wins.set(id, w);
    // position: remembered, cascaded, or centred
    const mem = posMemory[o.posKey || id];
    const vw = innerWidth, vh = innerHeight;
    let x, y;
    if (mem) { x = mem[0]; y = mem[1]; }
    else if (o.x != null) { x = o.x; y = o.y; }
    else {
      const n = UI.wins.size;
      const ww = o.w || 340;
      x = Math.max(8, Math.min(vw - ww - 8, vw / 2 - ww / 2 + (n % 6) * 26 - 60));
      y = Math.max(60, Math.min(vh - 200, 90 + (n % 6) * 26));
    }
    el.style.left = x + 'px'; el.style.top = y + 'px';
    el.addEventListener('mousedown', () => UI.front(id), true);
    el.querySelector('.win-title').addEventListener('mousedown', (e) => startDrag(e, w));
    el.addEventListener('click', (e) => onClick(e, w));
    el.addEventListener('change', (e) => onChange(e, w));
    el.addEventListener('input', (e) => onInput(e, w));
    UI.front(id);
    UI.render(id);
    clampWin(w);
    // on short screens lift a tall window so its bottom (often the main buttons) is on screen
    const hb = w.el.getBoundingClientRect();
    if (hb.bottom > innerHeight - 8) w.el.style.top = Math.max(52, innerHeight - hb.height - 8) + 'px';
    syncMenu();
    if (HL.Audio) HL.Audio.ui('open');
    return w;
  };
  // the title menu steps back (card hidden, shade under the windows) while a window opened from it is up
  function syncMenu() { const m = document.getElementById('menu'); if (m) m.classList.toggle('sub', UI.wins.size > 0); }
  UI.isOpen = id => UI.wins.has(id);
  UI.close = function (id) {
    const w = UI.wins.get(id); if (!w) return;
    const r = w.el.getBoundingClientRect();
    posMemory[w.o.posKey || id] = [r.left, r.top];
    if (w.o.onClose) w.o.onClose(w);
    w.el.remove(); UI.wins.delete(id);
    syncMenu();
    if (HL.Audio) HL.Audio.ui('close');
  };
  UI.closeAll = function (keep) { for (const id of Array.from(UI.wins.keys())) if (!keep || !keep(id)) UI.close(id); };
  UI.toggle = function (id, make) { if (UI.wins.has(id)) UI.close(id); else make(); };
  UI.front = function (id) {
    const w = UI.wins.get(id); if (!w) return;
    for (const o of UI.wins.values()) o.el.classList.remove('front');
    w.el.style.zIndex = ++zTop; w.el.classList.add('front');
  };
  UI.render = function (id) {
    const w = UI.wins.get(id); if (!w) return;
    const title = typeof w.o.title === 'function' ? w.o.title(w) : w.o.title;
    w.el.querySelector('h2').textContent = title;
    if (!w.o.render) return;
    // keep scroll position and skip while an input has focus inside
    const ae = document.activeElement;
    if (ae && w.body.contains(ae) && (ae.tagName === 'INPUT' || ae.tagName === 'SELECT') && w.rendered) return;
    const st = w.body.scrollTop;
    const lists = UI.$$('.list', w.body).map(l => l.scrollTop);
    const html = w.o.render(w);
    if (typeof html === 'string') {
      if (html !== w.lastHtml) { w.body.innerHTML = html; w.lastHtml = html; }
    }
    if (w.o.after) w.o.after(w);
    w.body.scrollTop = st;
    UI.$$('.list', w.body).forEach((l, i) => { if (lists[i] != null) l.scrollTop = lists[i]; });
    w.rendered = true;
  };
  UI.refreshAll = function () { for (const [id, w] of UI.wins) if (w.o.live !== false) UI.render(id); };
  function clampWin(w) {
    const r = w.el.getBoundingClientRect();
    let x = r.left, y = r.top;
    x = Math.max(4, Math.min(innerWidth - Math.min(r.width, innerWidth - 8) - 4, x));
    y = Math.max(52, Math.min(innerHeight - 60, y));
    w.el.style.left = x + 'px'; w.el.style.top = y + 'px';
  }
  function startDrag(e, w) {
    if (e.target.closest('.wbtn')) return;
    e.preventDefault();
    const r = w.el.getBoundingClientRect();
    const ox = e.clientX - r.left, oy = e.clientY - r.top;
    const mv = (ev) => { w.el.style.left = (ev.clientX - ox) + 'px'; w.el.style.top = (ev.clientY - oy) + 'px'; };
    const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); clampWin(w); posMemory[w.o.posKey || w.id] = [parseFloat(w.el.style.left), parseFloat(w.el.style.top)]; };
    addEventListener('mousemove', mv); addEventListener('mouseup', up);
  }
  function onClick(e, w) {
    const wb = e.target.closest('[data-wa]');
    if (wb) { if (wb.dataset.wa === 'close') UI.close(w.id); else if (wb.dataset.wa === 'help' && w.o.help) UI.helpPopup(w.o.help); return; }
    const a = e.target.closest('[data-a]');
    if (!a || a.disabled) return;
    const fn = w.o.actions && w.o.actions[a.dataset.a];
    if (fn) { if (HL.Audio) HL.Audio.ui('click'); fn(a.dataset.v, a, e, w); UI.render(w.id); }
  }
  function onChange(e, w) { const a = e.target.closest('[data-c]'); if (!a) return; const fn = w.o.actions && w.o.actions[a.dataset.c]; if (fn) { fn(a.type === 'checkbox' ? a.checked : a.value, a, e, w); w.lastHtml = null; UI.render(w.id); } }
  function onInput(e, w) { const a = e.target.closest('[data-i]'); if (!a) return; const fn = w.o.actions && w.o.actions[a.dataset.i]; if (fn) fn(a.value, a, e, w); }

  // ---------- tooltips ----------
  let tipEl, tipTarget = null;
  UI.initTips = function () {
    tipEl = document.getElementById('tip');
    document.addEventListener('mouseover', (e) => {
      const t = e.target.closest('[data-tip]');
      if (t === tipTarget) return;
      tipTarget = t;
      if (!t) { tipEl.style.display = 'none'; return; }
      tipEl.innerHTML = t.dataset.tip;
      tipEl.style.display = 'block';
      const r = t.getBoundingClientRect();
      const tr = tipEl.getBoundingClientRect();
      let x = r.left + r.width / 2 - tr.width / 2, y = r.bottom + 8;
      if (y + tr.height > innerHeight - 40) y = r.top - tr.height - 8;
      tipEl.style.left = Math.max(6, Math.min(innerWidth - tr.width - 6, x)) + 'px';
      tipEl.style.top = y + 'px';
    });
  };
  UI.showTipAt = function (html, x, y) {
    if (!html) { tipEl.style.display = 'none'; return; }
    tipEl.innerHTML = html; tipEl.style.display = 'block';
    const tr = tipEl.getBoundingClientRect();
    tipEl.style.left = Math.min(innerWidth - tr.width - 6, x + 16) + 'px'; tipEl.style.top = Math.min(innerHeight - tr.height - 40, y + 18) + 'px';
  };

  // ---------- toasts and cash pops ----------
  UI.toast = function (msg, kind) {
    const box = document.getElementById('toasts');
    const t = document.createElement('div');
    t.className = 'toast' + (kind === 'info' ? ' info' : '');
    t.innerHTML = msg;
    box.appendChild(t);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => t.remove(), kind === 'info' ? 2600 : 3200);
    if (kind !== 'info' && HL.Audio) HL.Audio.ui('error');
  };
  UI.cashPop = function (amount, sx, sy) {
    if (sx < 0 || sy < 0 || sx > innerWidth || sy > innerHeight) return;
    const d = document.createElement('div');
    d.className = 'cash-pop' + (amount < 0 ? ' neg' : '');
    d.textContent = (amount >= 0 ? '+' : '') + HL.fmtMoney(amount);
    d.style.left = (sx - 20) + 'px'; d.style.top = (sy - 20) + 'px';
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 1700);
  };

  // ---------- modal prompts ----------
  UI.prompt = function (title, value, cb, o) {
    o = o || {};
    UI.open('prompt', {
      title, w: 340, live: false,
      render: () => `<p class="lede">${o.text || ''}</p><input type="text" id="pr-in" maxlength="${o.max || 40}" value="${UI.esc(value || '')}" style="width:100%"><div class="row" style="margin-top:10px;justify-content:flex-end">${UI.btn('Cancel', 'cancel')}${UI.btn(o.ok || 'OK', 'ok', { cls: 'primary' })}</div>`,
      after: (w) => { const i = UI.$('#pr-in', w.body); if (!w.focused) { w.focused = true; i.focus(); i.select(); i.onkeydown = (e) => { if (e.key === 'Enter') { UI.close('prompt'); cb(i.value.trim()); } if (e.key === 'Escape') UI.close('prompt'); }; } },
      actions: { ok: (v, el, e, w) => { const i = UI.$('#pr-in', w.body); UI.close('prompt'); cb(i.value.trim()); }, cancel: () => UI.close('prompt') },
    });
  };
  UI.confirm = function (title, text, ok, o) {
    o = o || {};
    UI.open('confirm', {
      title, w: 360, live: false,
      render: () => `<p class="lede" style="color:var(--ink)">${text}</p><div class="row" style="justify-content:flex-end">${UI.btn(o.no || 'Cancel', 'no')}${UI.btn(o.yes || 'OK', 'yes', { cls: 'primary' })}</div>`,
      actions: { yes: () => { UI.close('confirm'); ok(); }, no: () => UI.close('confirm') },
    });
  };
  UI.helpPopup = function (text) { UI.open('help-pop', { title: 'Help', w: 360, live: false, render: () => `<div style="font-size:13.5px;line-height:1.55">${text}</div>` }); };

  // ---------- commands ----------
  // run a build command: test, check money, execute, charge
  UI.cmd = function (fn, o) {
    o = o || {};
    const g = HL.G.g, cid = g.player;
    const test = fn(false);
    if (!test.ok) { if (!o.quiet) UI.toast(test.err || 'Can\'t do that'); return test; }
    const c = g.companies[cid];
    if (test.cost > 0 && c.money < test.cost) { if (!o.quiet) UI.toast('Not enough money. This costs ' + HL.fmtMoney(test.cost) + '.'); return { ok: false, err: 'money' }; }
    const r = fn(true);
    if (!r.ok) { if (!o.quiet) UI.toast(r.err || 'Can\'t do that'); return r; }
    if (r.cost) HL.Game.spend(g, cid, o.cat || 'construction', r.cost);
    if (o.sound !== false && HL.Audio) HL.Audio.build(o.sound || 'build');
    if (o.at && r.cost && !o.noPop) UI.cashPop(-r.cost, o.at[0], o.at[1]);
    HL.emit('cmd', r);
    return r;
  };
  UI.fmtSpeed = kmh => Math.round(kmh) + ' km/h';
})(typeof window !== 'undefined' ? window : globalThis);
