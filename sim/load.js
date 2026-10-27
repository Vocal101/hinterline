// Loads the DOM-free game files into a sandbox for headless runs.
const fs = require('fs'), path = require('path'), vm = require('vm');
const FILES = ['core', 'data_cargo', 'data_vehicles', 'data_names', 'world', 'mapgen', 'game', 'build', 'stations', 'towns', 'industries', 'econ', 'veh_core', 'rail', 'road', 'water_air', 'ai_build', 'ai', 'events', 'save', 'meta'];
module.exports = function load() {
  const ctx = { console, Math, Date, JSON, Buffer, performance: { now: () => Number(process.hrtime.bigint()) / 1e6 }, CompressionStream: globalThis.CompressionStream, DecompressionStream: globalThis.DecompressionStream, Response: globalThis.Response, Blob: globalThis.Blob, TextEncoder, TextDecoder };
  ctx.globalThis = ctx; vm.createContext(ctx);
  for (const f of FILES) {
    const p = path.join(__dirname, '..', 'js', f + '.js');
    if (!fs.existsSync(p)) continue;
    vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: f + '.js' });
  }
  return ctx.HL;
};
