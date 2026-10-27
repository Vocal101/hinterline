// Vehicle models. Everything is original: names, numbers and shapes.
// Common fields: kind rail|road|ship|air, name, intro (year), life (years on sale), age (max service years),
// speed (km/h), cost (£ base), run (£/year base), rel (base reliability 0..1), art (renderer style).
(function (root) {
  const HL = root.HL;
  const V = HL.VEH = {};
  const add = (id, o) => { o.id = id; V[id] = o; return o; };

  // ---------- rail types ----------
  HL.RAILTYPES = [
    { name: 'Railway', intro: 0, cost: 1, speed: 9999, short: 'rail' },
    { name: 'Electrified Railway', intro: 1952, cost: 1.6, speed: 9999, short: 'elrail' },
    { name: 'Monorail', intro: 2002, cost: 2.4, speed: 9999, short: 'mono' },
    { name: 'Maglev', intro: 2024, cost: 3.6, speed: 9999, short: 'maglev' },
  ];
  // which track an engine/wagon can run on: rt0 vehicles run on 0 and 1; rt1 (electric) only on 1
  HL.railCompatible = (vehRt, trackRt) => vehRt === trackRt || (vehRt === 0 && trackRt === 1);

  // ---------- locomotives ----------
  // power hp, wt tonnes, len (tile units), fuel: steam|diesel|electric|mono|maglev
  const E = (id, name, intro, speed, power, wt, cost, run, o) => add(id, Object.assign({ kind: 'rail', engine: true, name, intro, speed, power, wt, cost, run, life: 45, age: 30, rel: 0.82, rt: 0, len: 0.66 }, o));
  E('plover', 'Plover 2-4-0', 1860, 64, 320, 30, 7200, 1600, { fuel: 'steam', art: 'steam_small', life: 60, rel: 0.75, desc: 'Light tank engine. Cheap and slow.' });
  E('workhorse', 'Workhorse 0-6-0', 1872, 52, 480, 44, 9400, 1900, { fuel: 'steam', art: 'steam_goods', life: 70, rel: 0.78, desc: 'Sure-footed goods engine for heavy mineral trains.' });
  E('saltire', 'Saltire 4-4-0', 1890, 92, 650, 48, 13200, 2300, { fuel: 'steam', art: 'steam_express', life: 55, rel: 0.8, desc: 'Express passenger engine with tall driving wheels.' });
  E('goliath', 'Goliath 2-8-0', 1908, 76, 1150, 88, 19800, 3100, { fuel: 'steam', art: 'steam_heavy', life: 55, rel: 0.82, len: 0.75, desc: 'Eight coupled wheels. Hauls anything, slowly.' });
  E('cormorant', 'Cormorant 4-6-2', 1924, 120, 1700, 96, 27400, 3900, { fuel: 'steam', art: 'steam_pacific', life: 45, len: 0.75, desc: 'Big-boilered mixed-traffic engine.' });
  E('swiftwing', 'Swiftwing 4-6-2', 1937, 152, 2050, 102, 36800, 4600, { fuel: 'steam', art: 'steam_streamline', life: 30, len: 0.78, rel: 0.79, desc: 'Streamlined record breaker. Thirsty and temperamental.' });
  E('pony', 'Pony D1 Shunter', 1934, 58, 420, 34, 9800, 1300, { fuel: 'diesel', art: 'diesel_shunter', life: 45, rel: 0.88, len: 0.5, desc: 'Small diesel, very reliable, cheap to run.' });
  E('prairie', 'Prairie D20', 1949, 108, 1800, 82, 33000, 3600, { fuel: 'diesel', art: 'diesel_hood', life: 45, rel: 0.86, desc: 'Hood-unit diesel with a deep growl.' });
  E('marshal', 'Marshal DE3', 1958, 125, 2750, 106, 46000, 4400, { fuel: 'diesel', art: 'diesel_cab', life: 40, rel: 0.87, len: 0.75, desc: 'Double-cab diesel-electric, the backbone of the fleet.' });
  E('volta1', 'Volta E1', 1956, 135, 3500, 84, 52000, 3300, { fuel: 'electric', art: 'electric_box', rt: 1, life: 40, rel: 0.9, desc: 'Needs electrified track. Strong and quiet.' });
  E('arrow', 'Arrow 200 Power Car', 1972, 200, 2250, 70, 64000, 5200, { fuel: 'diesel', art: 'hst', life: 40, rel: 0.85, len: 0.75, desc: 'Wedge-nosed express diesel.' });
  E('atlas', 'Atlas DE6', 1976, 120, 3900, 128, 71000, 5600, { fuel: 'diesel', art: 'diesel_heavy', life: 40, rel: 0.88, len: 0.8, desc: 'Six-axle freight diesel for long heavy trains.' });
  E('volta5', 'Volta E5', 1986, 176, 5800, 88, 98000, 4600, { fuel: 'electric', art: 'electric_modern', rt: 1, life: 40, rel: 0.91, desc: 'Fast mixed-traffic electric.' });
  E('stormglass', 'Stormglass HS', 1996, 285, 8200, 70, 168000, 7800, { fuel: 'electric', art: 'hsr', rt: 1, life: 40, rel: 0.9, len: 0.8, desc: 'High-speed electric with a long glass nose.' });
  E('cargoliner', 'Cargoliner E8', 2008, 160, 9600, 132, 142000, 6900, { fuel: 'electric', art: 'electric_freight', rt: 1, life: 40, rel: 0.92, len: 0.8, desc: 'Heavy electric freight locomotive.' });
  E('ferrite', 'Ferrite M1', 2004, 230, 6200, 60, 190000, 8000, { fuel: 'mono', art: 'mono', rt: 2, life: 40, rel: 0.9, desc: 'Monorail power unit.' });
  E('ferrite2', 'Ferrite M3', 2020, 300, 9400, 64, 260000, 9600, { fuel: 'mono', art: 'mono', rt: 2, life: 40, rel: 0.92, desc: 'Second-generation monorail unit.' });
  E('halcyon', 'Halcyon ML', 2026, 410, 12000, 58, 380000, 12000, { fuel: 'maglev', art: 'maglev', rt: 3, life: 45, rel: 0.93, len: 0.8, desc: 'Magnetic levitation. Nothing touches the rail.' });
  E('halcyonx', 'Halcyon MX', 2046, 520, 16000, 60, 520000, 14500, { fuel: 'maglev', art: 'maglev2', rt: 3, life: 45, rel: 0.95, len: 0.8, desc: 'Even faster maglev with active damping.' });
  E('lumen', 'Lumen Vac-Line', 2068, 640, 22000, 62, 760000, 18000, { fuel: 'maglev', art: 'maglev3', rt: 3, life: 60, rel: 0.96, len: 0.85, desc: 'The future, arriving early.' });

  // ---------- wagons: generated per cargo and generation ----------
  // base capacities per cargo for a gen-1 wagon
  const WCAP = { pax: 30, mail: 22, coal: 20, ore: 20, steel: 18, stock: 16, grain: 20, wood: 18, goods: 16, oil: 18, valu: 10, paper: 16, food: 16, gold: 8, water: 20, fruit: 16, maize: 20, copper: 20, rubber: 18, gems: 8 };
  const WGEN = [
    // rt, intro, speed limit, cap mult, cost, empty wt, label
    { rt: 0, intro: 1860, speed: 96, mult: 1, cost: 1700, wt: 9, tag: 'Mk I', life: 95 },
    { rt: 0, intro: 1938, speed: 145, mult: 1.35, cost: 2600, wt: 12, tag: 'Mk II', life: 70 },
    { rt: 0, intro: 1982, speed: 240, mult: 1.7, cost: 3800, wt: 14, tag: 'Mk III', life: 150 },
    { rt: 2, intro: 2004, speed: 400, mult: 1.9, cost: 6200, wt: 12, tag: 'Monorail', life: 60 },
    { rt: 3, intro: 2026, speed: 700, mult: 2.1, cost: 8800, wt: 11, tag: 'Maglev', life: 80 },
  ];
  const BODY_NAMES = { coach: 'Coach', van: 'Van', hopper: 'Hopper', flat: 'Flat', stock: 'Cattle Van', logs: 'Log Car', tank: 'Tanker', armour: 'Armoured Van', reefer: 'Reefer' };
  HL.CARGO_IDS.forEach(c => {
    WGEN.forEach((g, gi) => {
      const body = HL.CARGO_BODY[c];
      const nm = c === 'pax' ? 'Passenger Coach' : c === 'mail' ? 'Mail Van' : HL.CARGO[c].name + ' ' + BODY_NAMES[body];
      add('w_' + c + '_' + gi, {
        kind: 'rail', engine: false, wagon: true, cargo: c, cap: Math.round(WCAP[c] * g.mult),
        name: nm + ' (' + g.tag + ')', intro: g.intro, life: g.life, age: 40, speed: g.speed, wt: g.wt, cost: g.cost, run: 0, rel: 1,
        rt: g.rt, gen: gi, len: 0.5, art: 'wagon_' + body,
      });
    });
  });

  // ---------- road vehicles ----------
  const R = (id, name, intro, speed, cap, cargo, cost, run, o) => add(id, Object.assign({ kind: 'road', name, intro, speed, cap, cargo, cost, run, life: 35, age: 15, rel: 0.85, len: 0.42 }, o));
  R('charabanc', 'Charabanc Motor Coach', 1904, 32, 26, 'pax', 3600, 700, { art: 'bus0', rel: 0.75, life: 30 });
  R('omnibus', 'Brougham Omnibus', 1926, 58, 34, 'pax', 5200, 900, { art: 'bus1' });
  R('roadliner', 'Roadliner Coach', 1951, 90, 40, 'pax', 8700, 1150, { art: 'bus2' });
  R('metrobus', 'Metrobus 70', 1971, 112, 46, 'pax', 13200, 1350, { art: 'bus3' });
  R('citylink', 'Citylink Articulated', 1994, 126, 72, 'pax', 21000, 1800, { art: 'bus4', len: 0.6 });
  R('glide', 'Glide e-Coach', 2024, 160, 64, 'pax', 34000, 1200, { art: 'bus5', rel: 0.94, life: 60 });
  // trucks by generation
  const TGEN = [
    { intro: 1914, speed: 48, mult: 1, cost: 4100, run: 820, tag: 'Dray', art: 'truck0', rel: 0.76 },
    { intro: 1944, speed: 80, mult: 1.25, cost: 7300, run: 1050, tag: 'Hauler', art: 'truck1', rel: 0.83 },
    { intro: 1975, speed: 112, mult: 1.5, cost: 12400, run: 1300, tag: 'Freightmaster', art: 'truck2', rel: 0.87 },
    { intro: 2009, speed: 145, mult: 1.8, cost: 21000, run: 1500, tag: 'Vector', art: 'truck3', rel: 0.92 },
  ];
  const TCAP = { mail: 22, coal: 20, ore: 20, steel: 15, stock: 14, grain: 20, wood: 18, goods: 15, oil: 21, valu: 2, paper: 15, food: 17, gold: 2, water: 21, fruit: 16, maize: 20, copper: 20, rubber: 20, gems: 2 };
  HL.CARGO_IDS.forEach(c => {
    if (c === 'pax') return;
    TGEN.forEach((g, gi) => {
      const cap = TCAP[c] <= 2 ? 2 + gi : Math.round(TCAP[c] * g.mult);
      add('t_' + c + '_' + gi, { kind: 'road', name: g.tag + ' ' + HL.CARGO[c].name + ' Truck', intro: g.intro + (c === 'valu' || c === 'gold' || c === 'gems' ? 2 : 0), speed: g.speed, cap, cargo: c, cost: g.cost, run: g.run, life: 35, age: 15, rel: g.rel, len: 0.42, art: g.art, body: HL.CARGO_BODY[c] });
    });
  });

  // ---------- ships ----------
  const S = (id, name, intro, speed, cap, cargo, cost, run, o) => add(id, Object.assign({ kind: 'ship', name, intro, speed, cap, cargo, cost, run, life: 50, age: 30, rel: 0.86, len: 1.0 }, o));
  S('paddler', 'Paddle Steamer', 1860, 26, 120, 'pax', 15000, 1900, { art: 'ship_paddle', refit: ['pax', 'mail'] });
  S('ferry', 'Coastal Ferry', 1932, 42, 220, 'pax', 32000, 2600, { art: 'ship_ferry', refit: ['pax', 'mail'] });
  S('hydrofoil', 'Skimmer Hydrofoil', 1966, 88, 180, 'pax', 58000, 3700, { art: 'ship_hydro', refit: ['pax', 'mail'], rel: 0.83 });
  S('hovercraft', 'Skirt Hovercraft', 2012, 120, 260, 'pax', 96000, 4600, { art: 'ship_hover', refit: ['pax', 'mail'], rel: 0.9 });
  const BULK = ['coal', 'ore', 'grain', 'maize', 'copper', 'wood', 'fruit', 'stock'];
  const GEN = ['goods', 'steel', 'paper', 'food', 'valu', 'gold', 'gems', 'mail'];
  const LIQ = ['oil', 'water', 'rubber'];
  S('collier', 'Steam Collier', 1860, 22, 160, 'coal', 18000, 2000, { art: 'ship_bulk', refit: BULK });
  S('bulker', 'Lake Bulker', 1948, 38, 380, 'coal', 41000, 2800, { art: 'ship_bulk2', refit: BULK, len: 1.3 });
  S('oretrain', 'Ore Carrier', 1985, 48, 640, 'ore', 82000, 3600, { art: 'ship_bulk3', refit: BULK, len: 1.5 });
  S('coaster', 'Cargo Coaster', 1880, 24, 110, 'goods', 20000, 2100, { art: 'ship_cargo', refit: GEN });
  S('freighter', 'Container Freighter', 1968, 44, 300, 'goods', 64000, 3300, { art: 'ship_container', refit: GEN, len: 1.4 });
  S('tanker1', 'Coastal Tanker', 1898, 26, 180, 'oil', 22000, 2200, { art: 'ship_tanker', refit: LIQ });
  S('tanker2', 'Supertanker', 1962, 40, 560, 'oil', 78000, 3800, { art: 'ship_tanker2', refit: LIQ, len: 1.6 });

  // ---------- aircraft ----------
  // size: 0 small (airstrip ok), 1 large (city airport+), heli. Speeds are real; movement uses HL.PLANE_SPEED.
  const A = (id, name, intro, speed, cap, mailCap, cost, run, o) => add(id, Object.assign({ kind: 'air', name, intro, speed, cap, cargo: 'pax', mailCap, cost, run, life: 35, age: 20, rel: 0.85, size: 0, len: 0.8, refit: ['pax', 'mail'] }, o));
  A('dragonfly', 'Dragonfly Biplane', 1922, 190, 16, 4, 16000, 2100, { art: 'biplane', rel: 0.76, len: 0.6 });
  A('kestrel', 'Kestrel Twin', 1936, 300, 28, 8, 28000, 3000, { art: 'twinprop' });
  A('starliner', 'Starliner Four', 1951, 480, 64, 14, 62000, 5200, { art: 'propliner', size: 1, len: 1.0 });
  A('jetwind', 'Jetwind 6', 1959, 820, 112, 24, 118000, 8300, { art: 'jet_narrow', size: 1, len: 1.1 });
  A('gyro', 'Gyro H2 Helicopter', 1961, 210, 18, 6, 44000, 3900, { art: 'heli', heli: true, len: 0.55 });
  A('turbo', 'Puddle-jumper Turboprop', 1974, 520, 46, 10, 52000, 3600, { art: 'turboprop', rel: 0.89 });
  A('behemoth', 'Behemoth 400', 1971, 910, 360, 60, 265000, 15500, { art: 'jumbo', size: 2, len: 1.5 });
  A('silverline', 'Silverline 300', 1996, 940, 240, 40, 210000, 11800, { art: 'jet_wide', size: 1, len: 1.3, rel: 0.9 });
  A('rotor2', 'Skylift Tiltrotor', 2015, 480, 34, 10, 120000, 6400, { art: 'tiltrotor', heli: true, len: 0.7, rel: 0.9 });
  A('aurora', 'Aurora Supersonic', 2032, 2150, 150, 20, 520000, 26000, { art: 'sst', size: 2, len: 1.5, rel: 0.88 });
  A('zephyr', 'Zephyr e-Liner', 2050, 1050, 300, 50, 420000, 9000, { art: 'eliner', size: 1, len: 1.3, rel: 0.95 });
  HL.PLANE_SPEED = 0.25;

  HL.vehList = (kind) => Object.values(V).filter(v => v.kind === kind);
  // availability for a given year; life extends availability window
  HL.vehAvailable = (m, year, unlockAll) => unlockAll || (year >= m.intro && year < m.intro + m.life + 10);
  // capacity for a model refitted to cargo c
  HL.refitCap = function (m, c) {
    if (!c || c === m.cargo) return m.cap;
    if (m.kind === 'air') return c === 'mail' ? Math.round(m.cap / 3) + m.mailCap : m.cap;
    if (c === 'mail') return Math.round(m.cap * 0.75);
    if (m.cargo === 'pax' && c !== 'pax') return Math.round(m.cap * 0.75);
    const wFrom = HL.CARGO[m.cargo].wt, wTo = HL.CARGO[c].wt;
    if (wTo < 0.2) return Math.max(4, Math.round(m.cap * 0.15));
    return Math.round(m.cap * Math.min(1.4, Math.max(0.7, wFrom / wTo)));
  };
})(typeof window !== 'undefined' ? window : globalThis);
