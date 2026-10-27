// Economy: cargo payment, deliveries, transfers, subsidies, recessions.
(function (root) {
  const HL = root.HL;
  const Econ = HL.Econ = {};
  const Game = HL.Game;

  // Payment for n units carried dist tiles taking days in transit.
  Econ.timeFactor = function (c, days) {
    const C = HL.CARGO[c];
    const MAX = 255, MIN = 31;
    if (days <= C.d1) return MAX;
    if (days <= C.d1 + C.d2) return MAX - (days - C.d1);
    return Math.max(MIN, MAX - 2 * (days - C.d1) + C.d2);
  };
  Econ.payment = function (g, c, n, dist, days) {
    const C = HL.CARGO[c];
    const boom = g.econ.cargoPay && g.econ.cargoPay[c] ? g.econ.cargoPay[c].mult : 1;
    return C.price * n * dist * Econ.timeFactor(c, days) / 2097152 * g.econ.payMul * boom;
  };
  // payment curve for the cargo payment rates graph: 10 units over 20 tiles
  Econ.rateCurve = function (g, c) {
    const out = [];
    for (let d = 0; d <= 200; d += 10) out.push([d, Econ.payment(g, c, 10, 20, d)]);
    return out;
  };

  // Deliver packets at station s by vehicle v. Returns total paid to the company.
  Econ.deliver = function (g, v, s, c, packets) {
    let total = 0, feeder = 0, n = 0;
    for (const p of packets) {
      if (p.st === s.id && !p.fs) { HL.Stations.addCargo(g, s, c, p.n, p.sx, p.sy, p.st); continue; } // nobody pays to go nowhere
      const dist = HL.manh(p.sx, p.sy, s.x, s.y);
      let pay = Econ.payment(g, c, p.n, dist, p.d);
      const sub = Econ.subsidyFor(g, v.owner, c, p.st, s.id);
      if (sub) pay *= sub;
      total += pay; feeder += p.fs; n += p.n;
    }
    if (!n) return 0;
    total = Math.round(total);
    const kind = v.kind === 'rail' ? 'traininc' : v.kind === 'road' ? 'roadinc' : v.kind === 'air' ? 'airinc' : 'shipinc';
    Game.earn(g, v.owner, kind, total);
    v.profitThisYear += total - Math.round(feeder);
    v.lastIncome = total - Math.round(feeder);
    const co = g.companies[v.owner];
    co.cur.delivered += n;
    co.cur.cargo[c] = (co.cur.cargo[c] || 0) + n;
    co.deliveredTotal[c] = (co.deliveredTotal[c] || 0) + n;
    s.monthOut[c] = (s.monthOut[c] || 0) + n;
    HL.Towns.delivered(g, s, c, n);
    HL.Ind.deliver(g, s, c, n);
    Econ.checkSubsidyAward(g, v.owner, c, packets, s);
    HL.emit('income', v, total, s);
    if (HL.Meta && HL.Meta.onDeliver) HL.Meta.onDeliver(g, v, c, n, total);
    return total;
  };
  // Transfer: cargo waits at s for another vehicle; the feeder gets a virtual share now.
  Econ.transfer = function (g, v, s, c, packets) {
    let credit = 0;
    for (const p of packets) {
      const dist = HL.manh(p.sx, p.sy, s.x, s.y);
      const share = Math.max(0, Econ.payment(g, c, p.n, dist, p.d) * 0.75 - p.fs);
      p.fs += share; credit += share;
      const cs = HL.Stations.cs(s, c);
      cs.wait.push(p); cs.n += p.n;
    }
    v.profitThisYear += Math.round(credit);
    v.lastIncome = Math.round(credit);
    HL.emit('transfer', v, credit, s);
    return credit;
  };

  // ---------- subsidies ----------
  // offered: {c, from: {kind:'town'|'ind', id}, to: {...}, offered: date, until, awarded: cid|null, mult}
  Econ.monthly = function (g) {
    const rng = g.rng;
    // expire offers and awards
    g.subsidies = g.subsidies.filter(sb => {
      if (sb.awarded == null && g.date > sb.until) { Game.news(g, 'subsidy', 'Offer of subsidy expired', HL.CARGO[sb.c].name + ' from ' + Econ.endName(g, sb.from) + ' to ' + Econ.endName(g, sb.to) + ' is no longer subsidised.'); return false; }
      if (sb.awarded != null && g.date > sb.until) return false;
      return true;
    });
    if (g.subsidies.filter(s => s.awarded == null).length < 3 && rng.chance(0.35)) Econ.offerSubsidy(g);
    // recessions
    if (g.diff.economy && g.econ.recession < g.date && rng.chance(0.0035)) {
      g.econ.recession = g.date + 365;
      Game.news(g, 'economy', 'World recession!', 'Financial experts fear the worst as the economy slumps. Industries will produce half as much for a year.', { big: true });
    }
    if (g.econ.recession && g.econ.recession <= g.date && g.econ.recession > g.date - 31) {
      Game.news(g, 'economy', 'Recession over', 'Upturn in trade gives confidence to industries as the economy strengthens.', { big: true });
      g.econ.recession = 0;
    }
  };
  Econ.endName = (g, e) => e.kind === 'town' ? (g.towns[e.id] ? g.towns[e.id].name : '?') : (g.industries[e.id] ? g.industries[e.id].name : '?');
  Econ.endXY = (g, e) => { const o = e.kind === 'town' ? g.towns[e.id] : g.industries[e.id]; return o ? [o.x + (o.w ? o.w / 2 : 0), o.y + (o.h ? o.h / 2 : 0)] : null; };
  Econ.offerSubsidy = function (g) {
    const rng = g.rng;
    const cl = HL.CLIMATES[g.opts.climate];
    for (let tries = 0; tries < 20; tries++) {
      if (rng.chance(0.4)) {
        // passengers between towns
        const a = rng.pick(g.towns.filter(Boolean)), b = rng.pick(g.towns.filter(Boolean));
        if (!a || !b || a === b || a.pop < 300) continue;
        const d = HL.manh(a.x, a.y, b.x, b.y);
        if (d < 20 || d > 90) continue;
        return Econ.addSubsidy(g, 'pax', { kind: 'town', id: a.id }, { kind: 'town', id: b.id });
      }
      const src = rng.pick(g.industries.filter(i => i && HL.INDUSTRY[i.type].prod));
      if (!src) continue;
      const c = rng.pick(Object.keys(src.prod).filter(k => k !== 'pax' && k !== 'mail'));
      if (!c || !cl.cargos.includes(c)) continue;
      // destination: an accepting industry, or a town for goods/food/water
      let dest = null;
      const accepters = g.industries.filter(i => i && i !== src && (HL.INDUSTRY[i.type].accepts || []).includes(c));
      if (accepters.length) { const d = rng.pick(accepters); dest = { kind: 'ind', id: d.id }; }
      if (!dest) continue;
      const dxy = Econ.endXY(g, dest);
      const dist = HL.manh(src.x, src.y, dxy[0], dxy[1]);
      if (dist < 15 || dist > 100) continue;
      return Econ.addSubsidy(g, c, { kind: 'ind', id: src.id }, dest);
    }
    return null;
  };
  Econ.addSubsidy = function (g, c, from, to) {
    if (g.subsidies.some(s => s.c === c && s.from.kind === from.kind && s.from.id === from.id && s.to.id === to.id)) return null;
    const sb = { c, from, to, offered: g.date, until: g.date + 365, awarded: null, mult: [1.5, 2, 3, 4][g.rng.int(4)] };
    g.subsidies.push(sb);
    Game.news(g, 'subsidy', 'Offer of subsidy', 'First service carrying ' + HL.CARGO[c].name.toLowerCase() + ' from ' + Econ.endName(g, from) + ' to ' + Econ.endName(g, to) + ' will attract a year-long subsidy from the local authority.', { tile: g.map.t(...Econ.endXY(g, from).map(Math.floor)) });
    return sb;
  };
  // is the source/destination of a subsidy covered by a station?
  function endCovered(g, e, st) {
    if (!st) return false;
    if (e.kind === 'town') { const tw = g.towns[e.id]; return tw && st.town === tw.id && HL.manh(st.x, st.y, tw.x, tw.y) <= tw.radius + 4; }
    const ind = g.industries[e.id]; if (!ind) return false;
    return HL.Ind.stations(g, ind).includes(st.id);
  }
  Econ.checkSubsidyAward = function (g, cid, c, packets, s) {
    for (const sb of g.subsidies) {
      if (sb.awarded != null || sb.c !== c) continue;
      if (!endCovered(g, sb.to, s)) continue;
      if (!packets.some(p => endCovered(g, sb.from, g.stations[p.st]))) continue;
      sb.awarded = cid; sb.until = g.date + 365; sb.stFrom = packets[0].st; sb.stTo = s.id;
      const co = g.companies[cid];
      Game.news(g, 'subsidy', 'Subsidy awarded to ' + co.name + '!', HL.CARGO[c].name + ' from ' + Econ.endName(g, sb.from) + ' to ' + Econ.endName(g, sb.to) + ' pays ' + (sb.mult === 1.5 ? 'half again' : sb.mult + ' times') + ' the normal rate for the next year.', { big: cid === g.player, cid, tile: g.map.t(s.x, s.y) });
      if (HL.Meta && HL.Meta.unlock && cid === g.player) HL.Meta.unlock('subsidy');
    }
  };
  Econ.subsidyFor = function (g, cid, c, fromSt, toSt) {
    for (const sb of g.subsidies) if (sb.awarded === cid && sb.c === c && sb.stTo === toSt && sb.stFrom === fromSt) return sb.mult;
    return 0;
  };
})(typeof window !== 'undefined' ? window : globalThis);
