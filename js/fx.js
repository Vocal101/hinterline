// Particles (smoke, steam, exhaust, wakes, fire, explosions) in world space, plus screen-space weather.
(function (root) {
  const HL = root.HL, Gx = HL.Gfx, R = HL.R;
  const Fx = HL.Fx = {};
  const MAX = 2600;
  const parts = [];
  const emitters = new Map();
  let lastNow = 0;
  const KIND = {
    steam: { col: [245, 245, 240], a: 0.75, grow: 1.6, life: 2.2, rise: 0.22, size: 3.2 },
    grey: { col: [150, 148, 145], a: 0.55, grow: 1.4, life: 4.5, rise: 0.12, size: 4 },
    dark: { col: [52, 50, 48], a: 0.6, grow: 1.5, life: 3.5, rise: 0.14, size: 4 },
    exhaust: { col: [110, 110, 112], a: 0.35, grow: 1.2, life: 1.4, rise: 0.08, size: 2 },
    fire: { col: [255, 150, 50], a: 0.9, grow: 0.5, life: 0.8, rise: 0.25, size: 3, add: true },
    spark: { col: [255, 220, 120], a: 1, grow: 0, life: 0.6, rise: 0, size: 1.2, add: true, grav: true },
    wake: { col: [240, 248, 252], a: 0.55, grow: 1.8, life: 1.6, rise: 0, size: 2.2, flat: true },
    dust: { col: [170, 150, 120], a: 0.45, grow: 1.6, life: 1.4, rise: 0.05, size: 3 },
    splash: { col: [230, 245, 255], a: 0.7, grow: 1.2, life: 0.8, rise: 0.1, size: 2, grav: true },
  };
  const sprites = {};
  function puffSprite(kind) {
    if (sprites[kind]) return sprites[kind];
    const k = KIND[kind];
    const c = Gx.canvas(32, 32), x = c.getContext('2d');
    const g = x.createRadialGradient(13, 12, 1, 16, 16, 15);
    const [r, gg, b] = k.col;
    g.addColorStop(0, `rgba(${Math.min(255, r + 20)},${Math.min(255, gg + 20)},${Math.min(255, b + 20)},1)`);
    g.addColorStop(0.5, `rgba(${r},${gg},${b},0.7)`);
    g.addColorStop(1, `rgba(${r},${gg},${b},0)`);
    x.fillStyle = g; x.fillRect(0, 0, 32, 32);
    return (sprites[kind] = c);
  }
  // z in model units (tile-relative heights are converted by the caller)
  Fx.puff = function (x, y, z, kind, scale, vx, vy, vz) {
    if (parts.length >= MAX) parts.shift();
    const k = KIND[kind];
    parts.push({ x, y, z, kind, t: 0, life: k.life * (0.8 + Math.random() * 0.4), s: (scale || 1) * k.size * (0.8 + Math.random() * 0.4), vx: vx != null ? vx : (Math.random() - 0.5) * 0.05, vy: vy != null ? vy : (Math.random() - 0.5) * 0.05, vz: vz != null ? vz : k.rise * (0.7 + Math.random() * 0.6) });
  };
  // continuous emitter: called every frame while the source is visible; rate per second
  Fx.emitter = function (key, x, y, z, kind, rate, big) {
    let e = emitters.get(key);
    if (!e) { e = { acc: Math.random(), seen: 0 }; emitters.set(key, e); }
    e.seen = lastNow;
    e.x = x; e.y = y; e.z = z; e.kind = kind; e.rate = rate; e.big = big;
  };
  Fx.explosion = function (x, y, z) {
    for (let i = 0; i < 24; i++) Fx.puff(x, y, z + 0.05, 'fire', 1.6, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5, 0.2 + Math.random() * 0.5);
    for (let i = 0; i < 18; i++) Fx.puff(x, y, z + 0.1, 'dark', 2.2, (Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.2, 0.15 + Math.random() * 0.2);
    for (let i = 0; i < 20; i++) Fx.puff(x, y, z + 0.1, 'spark', 1, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8, 0.6 + Math.random() * 0.6);
  };
  HL.on('explosion', (x, y, zLevels) => Fx.explosion(x, y, (zLevels || 0) * Gx.LEVEL));
  Fx.clear = () => { parts.length = 0; emitters.clear(); };

  const wp = (x, y, h) => [(x - y) * Gx.TW2, (x + y) * Gx.TH2 - h * Gx.ZS];
  Fx.draw = function (ctx, wx0, wy0, wx1, wy1, b, now) {
    const dt = lastNow ? Math.min(0.1, (now - lastNow) / 1000) : 0.016;
    lastNow = now;
    const speed = R.g && R.g.speed ? Math.min(3, R.g.paused ? 0 : 1 + (R.g.speed - 1) * 0.3) : 1;
    // spawn
    for (const [k, e] of emitters) {
      if (e.seen !== now) { if (now - e.seen > 2000) emitters.delete(k); continue; }
      if (b < 0.5 && !e.big) continue;
      e.acc += e.rate * dt * speed;
      while (e.acc >= 1) { e.acc -= 1; Fx.puff(e.x + (Math.random() - 0.5) * 0.04, e.y + (Math.random() - 0.5) * 0.04, e.z, e.kind, e.big ? 2.4 : 1); }
    }
    // wind pushes smoke gently toward the right of the screen
    const wind = R.g && R.g.weather && R.g.weather.storm ? 0.25 : 0.06;
    let n = 0;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      p.t += dt * speed;
      if (p.t >= p.life) continue;
      const k = KIND[p.kind];
      p.x += (p.vx + wind) * dt * speed; p.y += (p.vy - wind * 0.6) * dt * speed; p.z += p.vz * dt * speed;
      if (k.grav) p.vz -= 1.2 * dt * speed;
      if (p.z < -0.05 && k.grav) { p.t = p.life; continue; }
      parts[n++] = p;
    }
    parts.length = n;
    // draw (back to front by depth is unnecessary for soft puffs)
    const add = [];
    for (const p of parts) {
      const k = KIND[p.kind];
      const q = wp(p.x, p.y, p.z);
      if (q[0] < wx0 - 60 || q[0] > wx1 + 60 || q[1] < wy0 - 60 || q[1] > wy1 + 60) continue;
      if (k.add) { add.push(p); continue; }
      const f = p.t / p.life;
      const sz = p.s * (1 + f * k.grow) * 2;
      ctx.globalAlpha = k.a * (1 - f) * (f < 0.1 ? f * 10 : 1);
      if (k.flat) ctx.drawImage(puffSprite(p.kind), q[0] - sz, q[1] - sz * 0.5, sz * 2, sz);
      else ctx.drawImage(puffSprite(p.kind), q[0] - sz, q[1] - sz, sz * 2, sz * 2);
    }
    if (add.length) {
      ctx.globalCompositeOperation = 'lighter';
      for (const p of add) {
        const k = KIND[p.kind], f = p.t / p.life;
        const q = wp(p.x, p.y, p.z);
        const sz = p.s * (1 + f * k.grow) * 2;
        ctx.globalAlpha = k.a * (1 - f);
        ctx.drawImage(puffSprite(p.kind), q[0] - sz, q[1] - sz, sz * 2, sz * 2);
        if (p.kind === 'fire' && Math.random() < 0.3) R.addLight(q[0], q[1], 30, '#ff8a3a', 0.6);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
  };

  // ---------- weather (screen space) ----------
  const drops = [];
  let flash = 0;
  Fx.weather = function (ctx, W, H, now) {
    const e = R.env;
    const rain = e.rain, snow = e.snow;
    const target = Math.round((rain + snow) * 420);
    while (drops.length < target) drops.push({ x: Math.random() * W, y: Math.random() * H, s: 0.5 + Math.random(), snow: snow > rain });
    if (drops.length > target) drops.length = target;
    if (!drops.length) { flash = 0; return; }
    const dt = 1 / 60;
    const paused = R.g && R.g.paused;
    ctx.save();
    for (const d of drops) {
      if (d.snow) {
        if (!paused) { d.y += (30 + d.s * 30) * dt; d.x += Math.sin(now / 700 + d.s * 9) * 0.4 + 0.2; }
        ctx.fillStyle = `rgba(255,255,255,${0.55 + d.s * 0.3})`;
        ctx.beginPath(); ctx.arc(d.x, d.y, 1 + d.s, 0, 7); ctx.fill();
      } else {
        if (!paused) { d.y += (520 + d.s * 300) * dt; d.x += 90 * dt; }
        ctx.strokeStyle = `rgba(200,215,230,${0.22 + d.s * 0.18})`; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - 3, d.y - 12 * d.s); ctx.stroke();
      }
      if (d.y > H + 10) { d.y = -10; d.x = Math.random() * W; }
      if (d.x > W + 10) d.x = -10;
    }
    ctx.restore();
    // lightning in storms
    const w = R.g && R.g.weather;
    if (w && w.storm && !paused && Math.random() < 0.002) { flash = 1; if (HL.Audio) HL.Audio.thunder(); }
    if (flash > 0) { ctx.fillStyle = `rgba(235,240,255,${flash * 0.5})`; ctx.fillRect(0, 0, W, H); flash -= 0.08; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
