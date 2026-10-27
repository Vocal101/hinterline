// Saving and loading. The world's typed arrays are packed as base64, everything else as JSON,
// and the whole thing is gzipped when the platform supports CompressionStream.
(function (root) {
  const HL = root.HL;
  const Save = HL.Save = {};
  const PREFIX = 'hinterline_save_', INDEX = 'hinterline_saves_index';
  const MAP_ARRAYS = ['h', 'type', 'owner', 'ground', 'gdens', 'trees', 'tspec', 'rail', 'rtype', 'road', 'rowner', 'idx', 'm1', 'm2', 'zone', 'bridgeOver'];
  const SKIP = new Set(['map', 'rng', 'signals', 'catchIdx', 'occ', 'res', 'blk', 'blockOcc', 'blockClaim', 'blockRes', 'crossClose', 'aiQueueRuntime', '_cruise']);

  Save.serialize = function (g) {
    const m = g.map;
    const mapOut = { W: m.W, H: m.H, snowline: m.snowline };
    for (const k of MAP_ARRAYS) mapOut[k] = HL.b64.enc(new Uint8Array(m[k].buffer, m[k].byteOffset, m[k].byteLength));
    const state = {};
    for (const k in g) if (!SKIP.has(k)) state[k] = g[k];
    state.rngS = g.rng.s;
    state.signalsArr = Array.from(g.signals.entries());
    const json = JSON.stringify({ v: 1, map: mapOut, state }, (k, v) => (k && k[0] === '_') ? undefined : v);
    return json;
  };
  Save.deserialize = function (json) {
    const d = typeof json === 'string' ? JSON.parse(json) : json;
    const mo = d.map;
    const map = new HL.GameMap(mo.W, mo.H);
    map.snowline = mo.snowline;
    for (const k of MAP_ARRAYS) {
      const u8 = HL.b64.dec(mo[k]);
      const Ctor = map[k].constructor;
      const arr = new Ctor(u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength));
      map[k] = arr;
    }
    const g = d.state;
    g.map = map;
    g.rng = new HL.RNG(g.rngS); delete g.rngS;
    g.signals = new Map(g.signalsArr || []); delete g.signalsArr;
    g.blocksDirty = true;
    HL.Stations.init(g);
    for (const v of g.vehicles) if (v) { v.posDirty = true; v.rc = null; if (v.kind === 'rail' && v.path) { v.route = null; } if (v.kind === 'road') v.route = null; }
    if (HL.Rail) HL.Rail.ensure(g);
    for (const v of g.vehicles) if (v && v.kind === 'rail' && v.path) HL.Rail.updatePos(g, v);
    for (const v of g.vehicles) if (v && v.kind === 'road' && v.seg) HL.Road.updatePos(g, v);
    return g;
  };

  async function gz(str) {
    if (typeof CompressionStream === 'undefined') return 'R' + str;
    const cs = new CompressionStream('gzip');
    const buf = await new Response(new Blob([str]).stream().pipeThrough(cs)).arrayBuffer();
    return 'Z' + HL.b64.enc(new Uint8Array(buf));
  }
  async function gunz(s) {
    if (s[0] === 'R') return s.slice(1);
    const u8 = HL.b64.dec(s.slice(1));
    const ds = new DecompressionStream('gzip');
    return await new Response(new Blob([u8]).stream().pipeThrough(ds)).text();
  }
  Save.pack = gz; Save.unpack = gunz;

  const store = () => { try { return localStorage; } catch (e) { return null; } };
  Save.index = function () { const s = store(); if (!s) return []; try { return JSON.parse(s.getItem(INDEX) || '[]'); } catch (e) { return []; } };
  function writeIndex(list) { store().setItem(INDEX, JSON.stringify(list)); }
  Save.metaFor = function (g, slot, label) {
    const c = g.companies[g.player];
    return { slot, label: label || c.name, date: g.date, company: c.name, money: c.money, value: c.value, climate: g.opts.climate, size: g.map.W + '×' + g.map.H, saved: Date.now(), scenario: g.scenario ? g.scenario.name : null, thumb: Save.thumb ? Save.thumb(g) : null };
  };
  Save.toSlot = async function (g, slot, label) {
    const s = store(); if (!s) throw new Error('Saving is not available in this browser');
    const data = await gz(Save.serialize(g));
    const meta = Save.metaFor(g, slot, label);
    try { s.setItem(PREFIX + slot, data); }
    catch (e) {
      // out of space: drop the oldest non-auto save and retry once
      const idx = Save.index().filter(x => x.slot !== slot && x.slot !== 'auto').sort((a, b) => a.saved - b.saved);
      if (!idx.length) throw new Error('Browser storage is full');
      s.removeItem(PREFIX + idx[0].slot); writeIndex(Save.index().filter(x => x.slot !== idx[0].slot));
      s.setItem(PREFIX + slot, data);
    }
    const list = Save.index().filter(x => x.slot !== slot);
    list.push(meta);
    writeIndex(list);
    return meta;
  };
  Save.fromSlot = async function (slot) {
    const s = store(); const data = s && s.getItem(PREFIX + slot);
    if (!data) throw new Error('Save not found');
    return Save.deserialize(await gunz(data));
  };
  Save.remove = function (slot) { const s = store(); if (!s) return; s.removeItem(PREFIX + slot); writeIndex(Save.index().filter(x => x.slot !== slot)); };
  Save.newSlotId = function () { const used = new Set(Save.index().map(x => x.slot)); let i = 1; while (used.has('s' + i)) i++; return 's' + i; };
})(typeof window !== 'undefined' ? window : globalThis);
