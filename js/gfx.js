// Graphics toolkit: colour helpers, a tiny flat-shaded 3D model renderer that bakes dimetric sprites,
// a sprite cache keyed by zoom bucket, procedural ground textures and painted trees.
(function (root) {
  const HL = root.HL;
  const G = HL.Gfx = {};

  // projection constants at zoom 1
  G.TW2 = 32; G.TH2 = 16; G.HS = 8;      // half tile width/height, px per height level
  G.ZS = 39.19;                           // px per world unit of model height (true 2:1 dimetric)
  G.LEVEL = G.HS / G.ZS;                  // model units per terrain level
  // light comes from the upper left of the screen; V points from the scene toward the camera
  const Lr = [-0.55, 0.32, 0.78], Ll = Math.hypot(...Lr);
  G.L = Lr.map(v => v / Ll);
  G.V = [0.6124, 0.6124, 0.5];

  // ---------- colour ----------
  const cache = {};
  G.rgb = function (hex) {
    if (Array.isArray(hex)) return hex;
    let c = cache[hex]; if (c) return c;
    let h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    c = cache[hex] = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    return c;
  };
  G.css = (c, a) => a == null || a >= 1 ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  G.mix = (a, b, t) => { a = G.rgb(a); b = G.rgb(b); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; };
  const WARM = [255, 238, 205], COOL = [52, 64, 104];
  // b: 1 = neutral, >1 lit (toward warm), <1 shaded (toward cool blue)
  G.shade = function (col, b) {
    const c = G.rgb(col);
    if (b >= 1) { const t = Math.min(1, (b - 1) * 1.4); return [c[0] + (WARM[0] - c[0]) * t * 0.45, c[1] + (WARM[1] - c[1]) * t * 0.45, c[2] + (WARM[2] - c[2]) * t * 0.45].map((v, i) => Math.min(255, v * (1 + (b - 1) * 0.35))); }
    const t = 1 - b;
    return [c[0] * b + COOL[0] * t * 0.55, c[1] * b + COOL[1] * t * 0.55, c[2] * b + COOL[2] * t * 0.6];
  };
  G.shadeCss = (col, b, a) => G.css(G.shade(col, b), a);
  G.lightOf = function (n) {
    const d = n[0] * G.L[0] + n[1] * G.L[1] + n[2] * G.L[2];
    return 0.62 + 0.52 * Math.max(0, d) - 0.1 * Math.max(0, -d);
  };

  G.canvas = function (w, h) {
    if (typeof OffscreenCanvas !== 'undefined' && !G.forceDom) { const c = new OffscreenCanvas(Math.max(1, Math.ceil(w)), Math.max(1, Math.ceil(h))); return c; }
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c;
  };

  // ---------- 3D model ----------
  class Model {
    constructor() { this.faces = []; this.lights = []; this.noShadow = false; }
    face(pts, col, o) { const f = Object.assign({ pts, col }, o || {}); if (f.paint) f.frame = [pts[0].slice(), pts[1].slice(), pts[pts.length - 1].slice()]; this.faces.push(f); return f; }
    // copy of this model clipped to the column above [x0,x1]x[y0,y1], shifted so (x0,y0) is the origin
    clip(x0, y0, x1, y1) {
      const out = new Model(); out.noShadow = true;
      const planes = [[0, x0, 1], [0, x1, -1], [1, y0, 1], [1, y1, -1]];
      for (const f of this.faces) {
        let poly = f.pts;
        for (const [ax, v, sg] of planes) {
          if (!poly.length) break;
          const res = [];
          for (let i = 0; i < poly.length; i++) {
            const p = poly[i], q = poly[(i + 1) % poly.length];
            const pin = (p[ax] - v) * sg >= -1e-7, qin = (q[ax] - v) * sg >= -1e-7;
            if (pin) res.push(p);
            if (pin !== qin) { const k = (v - p[ax]) / (q[ax] - p[ax]); res.push([p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k, p[2] + (q[2] - p[2]) * k]); }
          }
          poly = res;
        }
        if (poly.length < 3) continue;
        const nf = Object.assign({}, f, { pts: poly.map(p => [p[0] - x0, p[1] - y0, p[2]]) });
        if (f.frame) nf.frame = f.frame.map(p => [p[0] - x0, p[1] - y0, p[2]]);
        // keep the original normal: clipping can leave the first three points nearly collinear
        nf.normalOf = f.normalOf || f.pts;
        nf.normalShift = [x0, y0];
        out.faces.push(nf);
      }
      for (const l of this.lights) if (l[0] >= x0 && l[0] < x1 && l[1] >= y0 && l[1] < y1) out.lights.push([l[0] - x0, l[1] - y0, l[2], l[3], l[4]]);
      return out;
    }
    // axis aligned box; o.top/o.sx/o.sy/o.nx/o.ny override colours, o.paint = {top,x,y,nx,ny}
    box(x0, y0, z0, x1, y1, z1, col, o) {
      o = o || {}; const p = o.paint || {};
      const top = o.top || col;
      if (!o.noTop) this.face([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], top, { paint: p.top, emit: o.emit });
      this.face([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], o.sx || col, { paint: p.x });
      this.face([[x1, y1, z0], [x0, y1, z0], [x0, y1, z1], [x1, y1, z1]], o.sy || col, { paint: p.y });
      this.face([[x0, y1, z0], [x0, y0, z0], [x0, y0, z1], [x0, y1, z1]], o.nx || o.sx || col, { paint: p.nx || p.x });
      this.face([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], o.ny || o.sy || col, { paint: p.ny || p.y });
      return this;
    }
    // gable roof over rectangle; ridge along axis 'x' or 'y'; overhang ov
    gable(x0, y0, x1, y1, z0, z1, axis, col, o) {
      o = o || {}; const ov = o.ov == null ? 0.03 : o.ov; const end = o.end || col;
      x0 -= ov; y0 -= ov; x1 += ov; y1 += ov;
      if (axis === 'x') {
        const ym = (y0 + y1) / 2;
        this.face([[x0, y0, z0], [x1, y0, z0], [x1, ym, z1], [x0, ym, z1]], col, { paint: o.paint });
        this.face([[x1, y1, z0], [x0, y1, z0], [x0, ym, z1], [x1, ym, z1]], col, { paint: o.paint });
        this.face([[x1 - ov, y0 + ov, z0], [x1 - ov, y1 - ov, z0], [x1 - ov, ym, z1 - 0.005]], end);
        this.face([[x0 + ov, y1 - ov, z0], [x0 + ov, y0 + ov, z0], [x0 + ov, ym, z1 - 0.005]], end);
      } else {
        const xm = (x0 + x1) / 2;
        this.face([[x1, y0, z0], [x1, y1, z0], [xm, y1, z1], [xm, y0, z1]], col, { paint: o.paint });
        this.face([[x0, y1, z0], [x0, y0, z0], [xm, y0, z1], [xm, y1, z1]], col, { paint: o.paint });
        this.face([[x1 - ov, y1 - ov, z0], [x0 + ov, y1 - ov, z0], [xm, y1 - ov, z1 - 0.005]], end);
        this.face([[x0 + ov, y0 + ov, z0], [x1 - ov, y0 + ov, z0], [xm, y0 + ov, z1 - 0.005]], end);
      }
      return this;
    }
    // hipped roof (pyramid when square)
    hip(x0, y0, x1, y1, z0, z1, col, o) {
      o = o || {}; const ov = o.ov == null ? 0.03 : o.ov;
      x0 -= ov; y0 -= ov; x1 += ov; y1 += ov;
      const w = x1 - x0, d = y1 - y0, inset = Math.min(w, d) / 2;
      const a = [x0 + inset, y0 + inset, z1], b = [x1 - inset, y0 + inset, z1], c = [x1 - inset, y1 - inset, z1], e = [x0 + inset, y1 - inset, z1];
      this.face([[x0, y0, z0], [x1, y0, z0], b, a], col, { paint: o.paint });
      this.face([[x1, y0, z0], [x1, y1, z0], c, b], col, { paint: o.paint });
      this.face([[x1, y1, z0], [x0, y1, z0], e, c], col, { paint: o.paint });
      this.face([[x0, y1, z0], [x0, y0, z0], a, e], col, { paint: o.paint });
      return this;
    }
    // vertical cylinder (n-gon prism)
    cyl(cx, cy, z0, z1, r, col, o) {
      o = o || {}; const n = o.n || 10, r1 = o.r1 == null ? r : o.r1;
      const ring0 = [], ring1 = [];
      for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; ring0.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, z0]); ring1.push([cx + Math.cos(a) * r1, cy + Math.sin(a) * r1, z1]); }
      for (let i = 0; i < n; i++) { const j = (i + 1) % n; this.face([ring0[i], ring0[j], ring1[j], ring1[i]], col, { paint: o.paint, smooth: true }); }
      if (!o.noTop) this.face(ring1.slice(), o.top || col, { emit: o.emit });
      return this;
    }
    // horizontal cylinder along x (boilers, tanks); axis 'x' or 'y'
    cylH(a0, a1, cb, cz, r, col, o) {
      o = o || {}; const n = o.n || 10; const ax = o.axis || 'x';
      const P = (a, ang) => { const u = Math.cos(ang) * r, v = Math.sin(ang) * r; return ax === 'x' ? [a, cb + u, cz + v] : [cb + u, a, cz + v]; };
      for (let i = 0; i < n; i++) {
        const t0 = (i / n) * Math.PI * 2, t1 = ((i + 1) / n) * Math.PI * 2;
        const q = [P(a0, t0), P(a0, t1), P(a1, t1), P(a1, t0)];
        this.face(ax === 'x' ? q : [q[1], q[0], q[3], q[2]], col, { smooth: true, paint: o.paint });
      }
      const cap0 = [], cap1 = [];
      for (let i = 0; i < n; i++) { const t = (i / n) * Math.PI * 2; cap1.push(P(a1, t)); cap0.push(P(a0, -t)); }
      this.face(ax === 'x' ? cap1 : cap1.slice().reverse(), o.cap || col);
      this.face(ax === 'x' ? cap0 : cap0.slice().reverse(), o.cap || col);
      return this;
    }
    // flat disc/plate lying on z
    disc(cx, cy, z, r, col, n) { const p = []; n = n || 12; for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; p.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, z]); } this.face(p, col); return this; }
    // light point for night overlay (world coords), radius px at zoom 1
    light(x, y, z, r, col) { this.lights.push([x, y, z, r, col || '#ffd27a']); return this; }
    translate(dx, dy, dz) { for (const f of this.faces) for (const p of f.pts) { p[0] += dx; p[1] += dy; p[2] += dz; } for (const l of this.lights) { l[0] += dx; l[1] += dy; l[2] += dz; } return this; }

    // project and draw. opt: yaw (rad), pitch (rad, nose up), shadow (bool), alpha
    draw(ctx, s, ox, oy, opt) {
      opt = opt || {};
      const cy = Math.cos(opt.yaw || 0), sy = Math.sin(opt.yaw || 0);
      const cp = Math.cos(opt.pitch || 0), sp = Math.sin(opt.pitch || 0);
      const tf = (p) => {
        let x = p[0], y = p[1], z = p[2];
        if (opt.pitch) { const nx = x * cp - z * sp; z = x * sp + z * cp; x = nx; }
        if (opt.yaw) { const nx = x * cy - y * sy; y = x * sy + y * cy; x = nx; }
        return [x, y, z];
      };
      const P = (p) => [ox + (p[0] - p[1]) * G.TW2 * s, oy + ((p[0] + p[1]) * G.TH2 - p[2] * G.ZS) * s];
      const list = [];
      for (const f of this.faces) {
        const w = f.pts.map(tf);
        const nsrc = f.normalOf ? f.normalOf.map(tf) : w;
        const a = nsrc[0], b = nsrc[1], c = nsrc[2];
        const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
        const nl = Math.hypot(n[0], n[1], n[2]) || 1; n = [n[0] / nl, n[1] / nl, n[2] / nl];
        const vis = n[0] * G.V[0] + n[1] * G.V[1] + n[2] * G.V[2];
        if (vis <= 1e-4 && !f.twoSided) continue;
        let cx = 0, cyy = 0, cz = 0; for (const p of w) { cx += p[0]; cyy += p[1]; cz += p[2]; }
        const k = w.length; cx /= k; cyy /= k; cz /= k;
        list.push({ f, w, n, d: cx * G.V[0] + cyy * G.V[1] + cz * G.V[2] + (f.bias || 0) });
      }
      if (opt.night) { this.drawNight(ctx, s, ox, oy, list, P, tf); return; }
      if (opt.shadow !== false && !this.noShadow) {
        const pts = [];
        const sz = opt.shadowZ || 0;
        for (const f of this.faces) for (const p0 of f.pts) {
          const p = tf(p0); const h = p[2] - sz; if (h < -0.01) continue;
          pts.push(P([p[0] - G.L[0] * h / G.L[2], p[1] - G.L[1] * h / G.L[2], sz]));
        }
        const hull = convexHull(pts);
        if (hull.length > 2) {
          ctx.fillStyle = opt.shadowCol || 'rgba(30,38,58,0.26)';
          ctx.beginPath(); ctx.moveTo(hull[0][0], hull[0][1]); for (let i = 1; i < hull.length; i++) ctx.lineTo(hull[i][0], hull[i][1]); ctx.closePath(); ctx.fill();
        }
      }
      list.sort((a, b) => a.d - b.d);
      for (const it of list) {
        const f = it.f;
        const sp2 = it.w.map(P);
        const br = f.emit ? 1.15 : G.lightOf(it.n) * (opt.bright || 1);
        const col = G.shade(f.col, br);
        ctx.beginPath(); ctx.moveTo(sp2[0][0], sp2[0][1]);
        for (let i = 1; i < sp2.length; i++) ctx.lineTo(sp2[i][0], sp2[i][1]);
        ctx.closePath();
        ctx.fillStyle = G.css(col, f.alpha);
        ctx.fill();
        // hairline in the same colour hides anti-aliasing seams between faces
        if (!f.noSeam) { ctx.strokeStyle = G.css(col, f.alpha); ctx.lineWidth = 0.6; ctx.stroke(); }
        if (f.paint && sp2.length >= 3) {
          const fr = f.frame ? f.frame.map(tf) : null;
          const a3 = fr ? fr[0] : it.w[0], b3 = fr ? fr[1] : it.w[1], d3 = fr ? fr[2] : it.w[sp2.length - 1];
          const lu = Math.hypot(b3[0] - a3[0], b3[1] - a3[1], b3[2] - a3[2]), lv = Math.hypot(d3[0] - a3[0], d3[1] - a3[1], d3[2] - a3[2]);
          if (lu > 1e-4 && lv > 1e-4) {
            const S0 = P(a3), S1 = P(b3), S3 = P(d3);
            ctx.save();
            ctx.clip();
            ctx.transform((S1[0] - S0[0]) / lu, (S1[1] - S0[1]) / lu, (S3[0] - S0[0]) / lv, (S3[1] - S0[1]) / lv, S0[0], S0[1]);
            f.paint(ctx, lu, lv, (c, a) => G.css(G.shade(c, br), a), br);
            ctx.restore();
          }
        }
      }
    }
    // lit windows only: faces become clip masks and painters draw glowing glass
    drawNight(ctx, s, ox, oy, list, P, tf) {
      list.sort((a, b) => a.d - b.d);
      for (const it of list) {
        const f = it.f;
        const sp2 = it.w.map(P);
        ctx.save();
        ctx.beginPath(); ctx.moveTo(sp2[0][0], sp2[0][1]);
        for (let i = 1; i < sp2.length; i++) ctx.lineTo(sp2[i][0], sp2[i][1]);
        ctx.closePath();
        // occlude windows behind this face
        ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = '#000'; ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        if (f.paint) {
          const fr = f.frame ? f.frame.map(tf) : it.w;
          const a3 = fr[0], b3 = fr[1], d3 = fr[fr.length - 1];
          const lu = Math.hypot(b3[0] - a3[0], b3[1] - a3[1], b3[2] - a3[2]), lv = Math.hypot(d3[0] - a3[0], d3[1] - a3[1], d3[2] - a3[2]);
          if (lu > 1e-4 && lv > 1e-4) {
            const S0 = P(a3), S1 = P(b3), S3 = P(d3);
            ctx.clip();
            ctx.transform((S1[0] - S0[0]) / lu, (S1[1] - S0[1]) / lu, (S3[0] - S0[0]) / lv, (S3[1] - S0[1]) / lv, S0[0], S0[1]);
            f.paint(ctx, lu, lv, NIGHT_SH, 1, true);
          }
        }
        if (f.emitNight) { ctx.fillStyle = f.emitNight; ctx.fill(); }
        ctx.restore();
      }
    }
    bounds(s, opt) {
      opt = opt || {};
      const cy = Math.cos(opt.yaw || 0), sy = Math.sin(opt.yaw || 0);
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      const add = (X, Y, Z) => { const sx = (X - Y) * G.TW2 * s, syy = ((X + Y) * G.TH2 - Z * G.ZS) * s; if (sx < x0) x0 = sx; if (sx > x1) x1 = sx; if (syy < y0) y0 = syy; if (syy > y1) y1 = syy; };
      for (const f of this.faces) for (const p of f.pts) {
        let x = p[0], y = p[1]; const z = p[2];
        if (opt.yaw) { const nx = x * cy - y * sy; y = x * sy + y * cy; x = nx; }
        add(x, y, z);
        if (opt.shadow !== false && !this.noShadow && z > 0) add(x - G.L[0] * z / G.L[2], y - G.L[1] * z / G.L[2], 0);
      }
      return { x0: Math.floor(x0) - 3, y0: Math.floor(y0) - 3, x1: Math.ceil(x1) + 3, y1: Math.ceil(y1) + 3 };
    }
  }
  G.Model = Model;
  // in night mode painters get this shader: glass glows, everything else is invisible
  const NIGHT_SH = (c, a) => 'rgba(0,0,0,0)';
  G.NIGHT = NIGHT_SH;

  function convexHull(pts) {
    if (pts.length < 3) return pts;
    pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = []; for (const p of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    const up = []; for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    up.pop(); lo.pop(); return lo.concat(up);
  }
  G.convexHull = convexHull;

  // ---------- sprite cache ----------
  // A sprite is {c: canvas, ox, oy}: draw at (screenX - ox, screenY - oy) where screen point is the anchor.
  const sprites = new Map();
  let spriteBytes = 0;
  G.spriteStats = () => ({ n: sprites.size, mb: (spriteBytes / 1048576).toFixed(1) });
  G.clearSprites = (prefix) => { for (const k of Array.from(sprites.keys())) if (!prefix || k.startsWith(prefix)) { const s = sprites.get(k); spriteBytes -= s.c.width * s.c.height * 4; sprites.delete(k); } };
  // from a Model builder function
  G.modelSprite = function (key, s, build, opt) {
    const k = key + '@' + s;
    let sp = sprites.get(k);
    if (sp) return sp;
    const m = build();
    const b = m.bounds(s, opt);
    const c = G.canvas(b.x1 - b.x0, b.y1 - b.y0);
    const ctx = c.getContext('2d');
    m.draw(ctx, s, -b.x0, -b.y0, opt);
    sp = { c, ox: -b.x0, oy: -b.y0, lights: m.lights, model: null };
    if (m.lights.length) sp.lights = m.lights;
    sprites.set(k, sp); spriteBytes += c.width * c.height * 4;
    return sp;
  };
  // lit-window overlay for a model sprite (same bounds as the day sprite)
  G.nightSprite = function (key, s, build, opt) {
    const k = key + '@n' + s;
    let sp = sprites.get(k);
    if (sp !== undefined) return sp;
    const day = G.modelSprite(key, s, build, opt);
    const m = build();
    const c = G.canvas(day.c.width, day.c.height);
    m.draw(c.getContext('2d'), s, day.ox, day.oy, Object.assign({}, opt, { night: true }));
    sp = { c, ox: day.ox, oy: day.oy };
    sprites.set(k, sp); spriteBytes += c.width * c.height * 4;
    return sp;
  };
  // from a 2D painter: bounds {w,h,ox,oy} at scale 1
  G.paintSprite = function (key, s, bounds, paint) {
    const k = key + '@' + s;
    let sp = sprites.get(k);
    if (sp) return sp;
    const c = G.canvas(bounds.w * s, bounds.h * s);
    const ctx = c.getContext('2d');
    ctx.scale(s, s); ctx.translate(bounds.ox, bounds.oy);
    paint(ctx);
    sp = { c, ox: bounds.ox * s, oy: bounds.oy * s };
    sprites.set(k, sp); spriteBytes += c.width * c.height * 4;
    return sp;
  };
  G.hasSprite = (key, s) => sprites.has(key + '@' + s);

  // ---------- tileable textures (grayscale, mid-grey = neutral, used with soft-light) ----------
  function periodicNoise(size, cells, seed) {
    const r = new HL.RNG(seed); const g = [];
    for (let i = 0; i < cells * cells; i++) g.push(r.next());
    const out = new Float32Array(size * size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const fx = x / size * cells, fy = y / size * cells;
      const ix = Math.floor(fx), iy = Math.floor(fy), tx = HL.smooth(fx - ix), ty = HL.smooth(fy - iy);
      const a = g[(iy % cells) * cells + ix % cells], b = g[(iy % cells) * cells + (ix + 1) % cells];
      const c = g[((iy + 1) % cells) * cells + ix % cells], d = g[((iy + 1) % cells) * cells + (ix + 1) % cells];
      out[y * size + x] = HL.lerp(HL.lerp(a, b, tx), HL.lerp(c, d, tx), ty);
    }
    return out;
  }
  G.textures = {};
  G.makeTextures = function () {
    const S = 128;
    const mk = (name, fn) => {
      const c = G.canvas(S, S), ctx = c.getContext('2d');
      const img = ctx.createImageData(S, S);
      const n1 = periodicNoise(S, 8, 11 + name.length * 7), n2 = periodicNoise(S, 32, 23 + name.length), n3 = periodicNoise(S, 64, 37 + name.length * 3);
      const r = new HL.RNG(HL.hashSeed(name));
      for (let i = 0; i < S * S; i++) {
        const v = fn(n1[i], n2[i], n3[i], r.next(), i % S, (i / S) | 0);
        img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = HL.clamp(v, 0, 255);
        img.data[i * 4 + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      G.textures[name] = c;
      return ctx;
    };
    // grass: soft clumps + blade flecks
    let ctx = mk('grass', (a, b, c, r) => 128 + (a - 0.5) * 34 + (b - 0.5) * 30 + (c - 0.5) * 26 + (r - 0.5) * 18);
    blades(ctx, S, 520, 1);
    ctx = mk('rough', (a, b, c, r) => 124 + (a - 0.5) * 50 + (b - 0.5) * 46 + (c - 0.5) * 30 + (r - 0.5) * 24);
    blades(ctx, S, 700, 1.6); pebbles(ctx, S, 22);
    ctx = mk('dirt', (a, b, c, r) => 126 + (a - 0.5) * 40 + (b - 0.5) * 34 + (r - 0.5) * 34);
    pebbles(ctx, S, 40);
    mk('sand', (a, b, c, r, x, y) => 130 + Math.sin((x + y * 0.35 + a * 40) * 0.22) * 7 + (b - 0.5) * 22 + (r - 0.5) * 16);
    mk('snow', (a, b, c, r) => 136 + (a - 0.5) * 26 + (b - 0.5) * 14 + (r - 0.5) * 6);
    ctx = mk('rock', (a, b, c, r) => 120 + (a - 0.5) * 60 + (b - 0.5) * 50 + (c - 0.5) * 40 + (r - 0.5) * 20);
    pebbles(ctx, S, 60);
    mk('water', (a, b, c, r, x, y) => 128 + Math.sin((x * 0.7 - y * 0.45) * 0.2 + a * 8) * 10 + (b - 0.5) * 18);
    mk('beach', (a, b, c, r) => 132 + (a - 0.5) * 22 + (b - 0.5) * 18 + (r - 0.5) * 22);
  };
  function blades(ctx, S, n, w) {
    const r = new HL.RNG(77 + n);
    for (let i = 0; i < n; i++) {
      const x = r.next() * S, y = r.next() * S, l = 2 + r.next() * 4, dark = r.next() < 0.55;
      ctx.strokeStyle = dark ? `rgba(40,40,40,${0.18 + r.next() * 0.2})` : `rgba(230,230,230,${0.12 + r.next() * 0.18})`;
      ctx.lineWidth = w * (0.6 + r.next() * 0.6);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (r.next() - 0.5) * 2, y - l); ctx.stroke();
      // wrap
      if (x < 4 || y < 6) { ctx.beginPath(); ctx.moveTo(x + S, y + S); ctx.lineTo(x + S, y + S - l); ctx.stroke(); }
    }
  }
  function pebbles(ctx, S, n) {
    const r = new HL.RNG(99 + n);
    for (let i = 0; i < n; i++) {
      const x = r.next() * S, y = r.next() * S, rr = 0.8 + r.next() * 2.2;
      ctx.fillStyle = 'rgba(40,40,40,0.35)'; ctx.beginPath(); ctx.ellipse(x + 0.6, y + 0.6, rr, rr * 0.6, 0, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(225,225,225,0.4)'; ctx.beginPath(); ctx.ellipse(x, y, rr * 0.9, rr * 0.5, 0, 0, 7); ctx.fill();
    }
  }

  // ---------- trees ----------
  // Painted in 2D (not polygons): layered foliage blobs with light from upper left.
  // season: 0 spring 1 summer 2 autumn 3 winter; snow: bool
  G.TREE_BOUNDS = { w: 60, h: 88, ox: 30, oy: 76 };
  G.treeSprite = function (spec, variant, stage, season, snow, s) {
    const kind = HL.TREES[spec].kind;
    const key = `tree:${spec}:${variant}:${stage}:${season}:${snow ? 1 : 0}`;
    const grow = [0.4, 0.58, 0.76, 0.96][stage];
    return G.paintSprite(key, s, G.TREE_BOUNDS, (ctx) => {
      const r = new HL.RNG(spec * 977 + variant * 131 + 7);
      ctx.scale(grow, grow);
      paintTree(ctx, kind, r, season, snow, variant);
    });
  };
  function mixHex(a, b, t) { return G.css(G.mix(a, b, t)); }
  function blob(ctx, x, y, rx, ry, base, light, dark) {
    const g = ctx.createRadialGradient(x - rx * 0.35, y - ry * 0.45, rx * 0.1, x, y, Math.max(rx, ry) * 1.05);
    g.addColorStop(0, light); g.addColorStop(0.55, base); g.addColorStop(1, dark);
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
  }
  function leafSpeckle(ctx, r, cx, cy, rx, ry, n, col) {
    ctx.fillStyle = col;
    for (let i = 0; i < n; i++) { const a = r.next() * 6.28, d = Math.sqrt(r.next()); ctx.fillRect(cx + Math.cos(a) * rx * d, cy + Math.sin(a) * ry * d, 1.1, 1.1); }
  }
  function groundShadow(ctx, w) {
    ctx.fillStyle = 'rgba(28,36,52,0.28)';
    ctx.beginPath(); ctx.ellipse(w * 0.45, 0, w * 0.75, w * 0.32, 0, 0, Math.PI * 2); ctx.fill();
  }
  function trunk(ctx, h, w, col) {
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(-w, 0); ctx.lineTo(-w * 0.5, -h); ctx.lineTo(w * 0.5, -h); ctx.lineTo(w, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, -h, w * 0.8, h);
  }
  const SEASON_BROAD = [
    ['#6f9a3c', '#a9cf6a', '#3f5f22'],   // spring
    ['#4f7f2e', '#89b553', '#2d4a1b'],   // summer
    ['#c27a2c', '#efb355', '#7f3f1a'],   // autumn
    null,                                  // winter: bare
  ];
  function paintTree(ctx, kind, r, season, snow, variant) {
    const lean = (r.next() - 0.5) * 2;
    if (kind === 'broad' || kind === 'poplar' || kind === 'birch') {
      const tall = kind === 'poplar';
      const h = tall ? 12 : 6 + r.next() * 3;
      groundShadow(ctx, tall ? 10 : 14);
      trunk(ctx, h + 8, 1.9, kind === 'birch' ? '#e8e2d2' : '#5d4330');
      if (kind === 'birch') { ctx.fillStyle = '#2b2622'; for (let i = 0; i < 4; i++) ctx.fillRect(-1.5, -3 - i * 4 - r.next() * 2, 2, 0.8); }
      let pal = SEASON_BROAD[season];
      if (kind === 'birch' && pal) pal = season === 2 ? ['#d9a835', '#f5d36a', '#9a6d1c'] : ['#7fa846', '#b8da78', '#4d6c2a'];
      if (kind === 'broad' && season === 2 && variant % 3 === 1) pal = ['#a8402a', '#e0764f', '#5e2014'];
      if (!pal) {
        // winter: branches
        ctx.strokeStyle = '#4e3a2c'; ctx.lineCap = 'round';
        const br = (x, y, a, l, w, d) => {
          if (d > 4 || l < 2) return;
          const x2 = x + Math.cos(a) * l, y2 = y + Math.sin(a) * l;
          ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke();
          br(x2, y2, a - 0.45 - r.next() * 0.3, l * 0.72, w * 0.65, d + 1);
          br(x2, y2, a + 0.45 + r.next() * 0.3, l * 0.72, w * 0.65, d + 1);
        };
        br(0, -h, -Math.PI / 2 + lean * 0.1, tall ? 12 : 8, 1.6, 0);
        if (snow) { ctx.fillStyle = 'rgba(245,248,252,0.8)'; for (let i = 0; i < 10; i++) ctx.fillRect(-9 + r.next() * 18, -h - 6 - r.next() * 14, 2.4, 1.1); }
        return;
      }
      const [base, light, dark] = pal;
      const cy = -h - (tall ? 12 : 7);
      const RX = tall ? 6 : 11 + r.next() * 3, RY = tall ? 15 : 9 + r.next() * 2;
      // silhouette mass, then clumps lit from the upper left, darker underside
      ctx.fillStyle = dark;
      ctx.beginPath();
      const pts = 14;
      for (let i = 0; i <= pts; i++) {
        const a = (i / pts) * Math.PI * 2, wob = 0.82 + r.next() * 0.3;
        const px = lean + Math.cos(a) * RX * wob, py = cy + Math.sin(a) * RY * wob;
        if (i === 0) ctx.moveTo(px, py); else ctx.quadraticCurveTo(lean + Math.cos(a - 0.2) * RX * 1.08, cy + Math.sin(a - 0.2) * RY * 1.08, px, py);
      }
      ctx.closePath(); ctx.fill();
      const n = tall ? 9 : 13;
      const clumps = [];
      for (let i = 0; i < n; i++) {
        const a = r.next() * Math.PI * 2, d = Math.sqrt(r.next()) * 0.72;
        clumps.push([lean + Math.cos(a) * RX * d, cy + Math.sin(a) * RY * d, (tall ? 3.2 : 4.2) + r.next() * 2.2]);
      }
      // upper-left clumps last so they catch the light on top
      clumps.sort((p, q) => (q[0] + q[1]) - (p[0] + p[1]));
      for (const [x, y, rr] of clumps) {
        const lit = HL.clamp(0.5 - (x - lean) / RX * 0.35 - (y - cy) / RY * 0.45, 0, 1);
        blob(ctx, x, y, rr, rr * 0.86, mixHex(base, light, lit * 0.6), mixHex(light, '#fff8d8', lit * 0.25), dark);
      }
      leafSpeckle(ctx, r, lean - RX * 0.25, cy - RY * 0.3, RX * 0.6, RY * 0.5, 30, 'rgba(255,255,220,0.32)');
      leafSpeckle(ctx, r, lean + RX * 0.2, cy + RY * 0.3, RX * 0.7, RY * 0.5, 26, 'rgba(10,25,10,0.28)');
      if (season === 0 && kind === 'broad' && variant % 2 === 0) leafSpeckle(ctx, r, lean, cy, RX * 0.85, RY * 0.8, 36, variant % 4 === 0 ? 'rgba(255,214,228,0.9)' : 'rgba(255,255,245,0.85)');
      return;
    }
    if (kind === 'pine' || kind === 'spruce' || kind === 'larch') {
      const h = kind === 'spruce' ? 30 : 26 + r.next() * 4;
      groundShadow(ctx, 9);
      trunk(ctx, 8, 1.6, '#4d3626');
      let base = kind === 'larch' ? (season === 2 ? '#c99a3a' : season === 3 ? '#8a7b5a' : '#6f9a48') : kind === 'spruce' ? '#2f5a3e' : '#3b6436';
      let light = kind === 'larch' ? (season === 2 ? '#f0c86a' : '#a5c873') : kind === 'spruce' ? '#5f8c66' : '#6f9a5a';
      const dark = '#1d3324';
      const layers = 5;
      for (let i = 0; i < layers; i++) {
        const t = i / (layers - 1);
        const y = -6 - t * h * 0.8, w = 10 * (1 - t * 0.75), hh = h * 0.32;
        ctx.fillStyle = dark;
        ctx.beginPath(); ctx.moveTo(-w - 1 + lean * 0.2, y + 1); ctx.lineTo(lean * 0.4, y - hh); ctx.lineTo(w + 1 + lean * 0.2, y + 1);
        // jagged bottom edge
        for (let k = 4; k >= 0; k--) ctx.lineTo(-w + (2 * w) * (k / 4), y + (k % 2 ? 2.5 : 0));
        ctx.closePath(); ctx.fill();
        const g = ctx.createLinearGradient(-w, y - hh, w, y);
        g.addColorStop(0, light); g.addColorStop(0.5, base); g.addColorStop(1, dark);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(-w + lean * 0.2, y); ctx.lineTo(lean * 0.4, y - hh + 1); ctx.lineTo(w * 0.6 + lean * 0.2, y - 1);
        for (let k = 3; k >= 0; k--) ctx.lineTo(-w + (1.6 * w) * (k / 3), y + (k % 2 ? 1.6 : 0));
        ctx.closePath(); ctx.fill();
        if (snow) {
          ctx.fillStyle = 'rgba(244,248,252,0.92)';
          ctx.beginPath(); ctx.moveTo(-w * 0.9 + lean * 0.2, y - 1); ctx.lineTo(lean * 0.4, y - hh + 2); ctx.lineTo(w * 0.3, y - hh * 0.45); ctx.lineTo(-w * 0.2, y - 1.5); ctx.closePath(); ctx.fill();
        }
      }
      return;
    }
    if (kind === 'palm' || kind === 'fanpalm') {
      groundShadow(ctx, 10);
      const h = 22 + r.next() * 6, bend = (r.next() - 0.3) * 8;
      ctx.strokeStyle = '#8a6a44'; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(bend * 0.2, -h * 0.6, bend, -h); ctx.stroke();
      ctx.strokeStyle = 'rgba(60,40,20,0.5)'; ctx.lineWidth = 1;
      for (let i = 1; i < 7; i++) { const t = i / 7; const x = bend * t * t, y = -h * t; ctx.beginPath(); ctx.moveTo(x - 1.3, y); ctx.lineTo(x + 1.3, y - 0.6); ctx.stroke(); }
      const fr = kind === 'fanpalm' ? 9 : 7;
      for (let i = 0; i < fr; i++) {
        const a = -Math.PI + (i / (fr - 1)) * Math.PI + (r.next() - 0.5) * 0.3;
        const L = 10 + r.next() * 4;
        const x2 = bend + Math.cos(a) * L, y2 = -h + Math.sin(a) * L * 0.6 + 4;
        ctx.strokeStyle = i % 2 ? '#3f7a34' : '#5f9a44'; ctx.lineWidth = kind === 'fanpalm' ? 3.2 : 2.4;
        ctx.beginPath(); ctx.moveTo(bend, -h); ctx.quadraticCurveTo(bend + Math.cos(a) * L * 0.6, -h + Math.sin(a) * L * 0.4 - 4, x2, y2); ctx.stroke();
      }
      ctx.fillStyle = '#6b4a2a'; ctx.beginPath(); ctx.arc(bend + 1, -h + 1.5, 1.6, 0, 7); ctx.fill();
      return;
    }
    if (kind === 'cactus') {
      groundShadow(ctx, 6);
      const h = 14 + r.next() * 8;
      const body = (x, y0, y1, w) => {
        const g = ctx.createLinearGradient(x - w, 0, x + w, 0); g.addColorStop(0, '#8fb56a'); g.addColorStop(0.5, '#5d8a45'); g.addColorStop(1, '#35552c');
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - w, y0); ctx.lineTo(x - w, y1 + w); ctx.arc(x, y1 + w, w, Math.PI, 0); ctx.lineTo(x + w, y0); ctx.closePath(); ctx.fill();
      };
      body(0, 0, -h, 2.4);
      if (r.next() < 0.8) { body(-5, -h * 0.35, -h * 0.75, 1.6); ctx.fillStyle = '#5d8a45'; ctx.fillRect(-5, -h * 0.4, 4, 2.4); }
      if (r.next() < 0.6) { body(5, -h * 0.5, -h * 0.85, 1.5); ctx.fillStyle = '#4a7239'; ctx.fillRect(1.5, -h * 0.55, 3.8, 2.2); }
      return;
    }
    if (kind === 'jungle') {
      groundShadow(ctx, 14);
      trunk(ctx, 16, 2, '#4a3a2a');
      const cy = -22;
      blob(ctx, 0, cy, 13, 8, '#1f4a22', '#3c6b30', '#132e15');
      for (let i = 0; i < 6; i++) blob(ctx, (r.next() - 0.5) * 16, cy - 3 + (r.next() - 0.5) * 6, 5 + r.next() * 3, 4 + r.next() * 2, '#2e5f2a', '#6f9c4a', '#183a1a');
      leafSpeckle(ctx, r, 0, cy - 2, 12, 6, 30, 'rgba(220,255,180,0.3)');
      return;
    }
    if (kind === 'acacia') {
      groundShadow(ctx, 14);
      ctx.strokeStyle = '#5a4430'; ctx.lineCap = 'round';
      ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-1, -10); ctx.lineTo(-6, -16); ctx.moveTo(-1, -10); ctx.lineTo(5, -17); ctx.stroke();
      blob(ctx, 0, -19, 14, 4.2, '#6d8a3a', '#a7bf62', '#3d5222');
      leafSpeckle(ctx, r, 0, -20, 12, 3, 22, 'rgba(255,250,200,0.35)');
    }
  }

  // ---------- small helpers for painters ----------
  // rows of windows on a wall face (painter coords: u along wall, v up)
  G.windows = function (ctx, w, h, opt, sh, br, night) {
    const fl = opt.floors || 1, fh = opt.fh || h / fl, cols = opt.cols || Math.max(1, Math.round(w / 0.18));
    const ww = opt.ww || 0.06, wh = opt.wh || fh * 0.42, z0 = opt.z0 || 0;
    for (let f = 0; f < fl; f++) for (let c = 0; c < cols; c++) {
      const x = (c + 0.5) * w / cols - ww / 2, y = z0 + f * fh + fh * 0.3;
      if (opt.skip && opt.skip(f, c)) continue;
      if (night) {
        const lit = HL.hash2(f * 31 + c, (opt.seed || 0) + Math.round(w * 100), 9);
        if (lit < (opt.litFrac == null ? 0.55 : opt.litFrac)) { ctx.fillStyle = lit < 0.12 ? '#cfe3ff' : lit < 0.3 ? '#ffd889' : '#ffc46b'; ctx.fillRect(x, y, ww, wh); }
        continue;
      }
      ctx.fillStyle = sh(opt.frame || '#e9e2cf'); ctx.fillRect(x - 0.008, y - 0.008, ww + 0.016, wh + 0.016);
      ctx.fillStyle = sh(opt.glass || '#36495a'); ctx.fillRect(x, y, ww, wh);
      ctx.fillStyle = sh('#9fb6c8', 0.45); ctx.fillRect(x, y + wh * 0.55, ww * 0.45, wh * 0.4);
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
