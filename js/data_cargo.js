// Cargo types, climates and industry chains.
(function (root) {
  const HL = root.HL;

  // price: payment base (see econ.payment); d1/d2: days before the rate starts dropping, then drops twice as fast.
  // wt: tonnes per unit (train weight). unit: label for amounts. col: map/graph/wagon-load colour.
  HL.CARGO = {
    pax:     { name: 'Passengers', unit: 'passengers', short: 'pax', price: 3185, d1: 0, d2: 24, wt: 0.0625, col: '#e8c66a' },
    mail:    { name: 'Mail', unit: 'bags', short: 'bags', price: 4550, d1: 20, d2: 90, wt: 0.25, col: '#d9d4c2' },
    coal:    { name: 'Coal', unit: 'tonnes', short: 't', price: 5916, d1: 7, d2: 255, wt: 1, col: '#3a3633', load: '#26231f' },
    ore:     { name: 'Iron Ore', unit: 'tonnes', short: 't', price: 5120, d1: 9, d2: 255, wt: 1, col: '#9a5a3c', load: '#7b4a35' },
    steel:   { name: 'Steel', unit: 'tonnes', short: 't', price: 5688, d1: 7, d2: 255, wt: 1, col: '#8aa0b4', load: '#7d8a96' },
    stock:   { name: 'Livestock', unit: 'head', short: 'head', price: 4322, d1: 4, d2: 18, wt: 0.25, col: '#c99a6b' },
    grain:   { name: 'Grain', unit: 'tonnes', short: 't', price: 4778, d1: 4, d2: 40, wt: 1, col: '#e3c25a', load: '#d8b24c' },
    wood:    { name: 'Timber', unit: 'tonnes', short: 't', price: 5005, d1: 15, d2: 255, wt: 1, col: '#8c6239', load: '#9a6b3f' },
    goods:   { name: 'Goods', unit: 'crates', short: 'crates', price: 6144, d1: 5, d2: 28, wt: 0.5, col: '#c46a5a' },
    oil:     { name: 'Oil', unit: 'kL', short: 'kL', price: 4437, d1: 25, d2: 255, wt: 0.9, col: '#2b2b33' },
    valu:    { name: 'Valuables', unit: 'bags', short: 'bags', price: 7509, d1: 1, d2: 32, wt: 0.1, col: '#e0d07a' },
    paper:   { name: 'Paper', unit: 'tonnes', short: 't', price: 5461, d1: 7, d2: 60, wt: 1, col: '#e9e4d6' },
    food:    { name: 'Food', unit: 'tonnes', short: 't', price: 5688, d1: 0, d2: 30, wt: 1, col: '#d07c3b' },
    gold:    { name: 'Gold', unit: 'bags', short: 'bags', price: 5802, d1: 10, d2: 40, wt: 0.1, col: '#f0c23a' },
    water:   { name: 'Water', unit: 'kL', short: 'kL', price: 4664, d1: 20, d2: 80, wt: 1, col: '#4f9bc9' },
    fruit:   { name: 'Fruit', unit: 'tonnes', short: 't', price: 4209, d1: 0, d2: 15, wt: 1, col: '#e0703a', load: '#d8752f' },
    maize:   { name: 'Maize', unit: 'tonnes', short: 't', price: 4322, d1: 4, d2: 40, wt: 1, col: '#f2d24a', load: '#e8c43c' },
    copper:  { name: 'Copper Ore', unit: 'tonnes', short: 't', price: 4892, d1: 12, d2: 255, wt: 1, col: '#5aa38c', load: '#4f8f78' },
    rubber:  { name: 'Rubber', unit: 'kL', short: 'kL', price: 4437, d1: 2, d2: 20, wt: 0.9, col: '#6b5a48' },
    gems:    { name: 'Diamonds', unit: 'bags', short: 'bags', price: 5802, d1: 10, d2: 255, wt: 0.05, col: '#bfe6f0' },
  };
  HL.CARGO_IDS = Object.keys(HL.CARGO);

  // wagon/van shape for each cargo: hopper (open, shows load), tank, van (closed), flat (shows load), coach, armour
  HL.CARGO_BODY = { pax: 'coach', mail: 'van', coal: 'hopper', ore: 'hopper', steel: 'flat', stock: 'stock', grain: 'hopper', wood: 'logs', goods: 'van', oil: 'tank', valu: 'armour', paper: 'van', food: 'reefer', gold: 'armour', water: 'tank', fruit: 'hopper', maize: 'hopper', copper: 'hopper', rubber: 'tank', gems: 'armour' };

  HL.CLIMATES = {
    temperate: {
      name: 'Temperate Vales', blurb: 'Rolling green farmland, coal country and busy ports. Seasons turn every year.',
      cargos: ['pax', 'mail', 'coal', 'ore', 'steel', 'stock', 'grain', 'wood', 'goods', 'oil', 'valu'],
      townNeeds: [],
    },
    arctic: {
      name: 'Northern Reaches', blurb: 'Pine forests under a long winter. Towns above the snowline starve without food deliveries.',
      cargos: ['pax', 'mail', 'coal', 'stock', 'grain', 'wood', 'paper', 'goods', 'oil', 'food', 'gold'],
      townNeeds: ['food'], // only above snowline
    },
    desert: {
      name: 'Sunward Coast', blurb: 'Dunes, oases and rainforest valleys. Desert towns only grow with water and food.',
      cargos: ['pax', 'mail', 'water', 'food', 'fruit', 'maize', 'copper', 'wood', 'rubber', 'goods', 'oil', 'gems'],
      townNeeds: ['water', 'food'], // only for towns in desert zone
    },
  };

  // Industries. prod: [[cargo, base units per production cycle]], accepts: cargo list, out: processing output.
  // place: 'land' | 'sea' | 'town' | 'desert' | 'rainforest' | 'snow' | 'lowland' | 'shore'
  // years: [first, last] years it may be founded. art: renderer key.
  HL.INDUSTRY = {
    coal_mine:   { name: 'Coal Mine', climates: ['temperate', 'arctic'], w: 4, h: 3, prod: [['coal', 14]], place: 'land', art: 'coal_mine', freq: 8, prospect: 1, cost: 45000, col: '#3d3b38', smoke: 0 },
    power_plant: { name: 'Power Station', climates: ['temperate', 'arctic', 'desert'], w: 3, h: 3, accepts: ['coal'], place: 'land', art: 'power', freq: 5, cost: 70000, col: '#b5524a' },
    iron_mine:   { name: 'Iron Ore Mine', climates: ['temperate'], w: 4, h: 3, prod: [['ore', 13]], place: 'land', art: 'ore_mine', freq: 5, cost: 50000, col: '#a0603e' },
    steel_mill:  { name: 'Steelworks', climates: ['temperate'], w: 4, h: 4, accepts: ['ore'], out: ['steel'], place: 'land', art: 'steel', freq: 3, cost: 120000, col: '#6f7f8c' },
    farm:        { name: 'Farm', climates: ['temperate', 'arctic'], w: 3, h: 3, prod: [['grain', 10], ['stock', 9]], place: 'lowland', art: 'farm', freq: 9, cost: 35000, col: '#c9b26a', fields: true },
    forest:      { name: 'Timber Camp', climates: ['temperate', 'arctic'], w: 4, h: 4, prod: [['wood', 13]], place: 'land', art: 'forest', freq: 6, cost: 30000, col: '#3f6b35' },
    sawmill:     { name: 'Sawmill', climates: ['temperate'], w: 3, h: 3, accepts: ['wood'], out: ['goods'], place: 'land', art: 'sawmill', freq: 3, cost: 60000, col: '#b88a55' },
    oil_wells:   { name: 'Oil Field', climates: ['temperate', 'arctic', 'desert'], w: 4, h: 4, prod: [['oil', 12]], place: 'land', art: 'oil_wells', freq: 4, years: [0, 1955], cost: 55000, col: '#30302f' },
    oil_rig:     { name: 'Offshore Platform', climates: ['temperate', 'arctic', 'desert'], w: 3, h: 3, prod: [['oil', 15], ['pax', 3], ['mail', 1]], place: 'sea', art: 'oil_rig', freq: 3, years: [1958, 9999], cost: 90000, col: '#d0a84a', station: true },
    refinery:    { name: 'Refinery', climates: ['temperate', 'arctic', 'desert'], w: 4, h: 4, accepts: ['oil'], out: ['goods'], place: 'shore', art: 'refinery', freq: 3, cost: 110000, col: '#d9d2bf' },
    factory:     { name: 'Factory', climates: ['temperate'], w: 4, h: 4, accepts: ['grain', 'stock', 'steel'], out: ['goods'], place: 'land', art: 'factory', freq: 3, cost: 100000, col: '#a34a3a' },
    bank:        { name: 'Bank', climates: ['temperate'], w: 2, h: 1, prod: [['valu', 5]], accepts: ['valu'], place: 'town', minPop: 1200, art: 'bank', freq: 2, cost: 60000, col: '#d6c98e' },
    // arctic
    paper_mill:  { name: 'Pulp & Paper Mill', climates: ['arctic'], w: 4, h: 3, accepts: ['wood'], out: ['paper'], place: 'land', art: 'paper_mill', freq: 3, cost: 90000, col: '#c9c4b4' },
    printer:     { name: 'Printing Works', climates: ['arctic'], w: 3, h: 3, accepts: ['paper'], out: ['goods'], place: 'land', art: 'printer', freq: 3, cost: 70000, col: '#8a6f9c' },
    food_plant:  { name: 'Food Cannery', climates: ['arctic', 'desert'], w: 3, h: 3, accepts: ['grain', 'stock', 'fruit', 'maize'], out: ['food'], place: 'land', art: 'food_plant', freq: 4, cost: 80000, col: '#d07c3b' },
    gold_mine:   { name: 'Gold Mine', climates: ['arctic'], w: 3, h: 3, prod: [['gold', 6]], place: 'snow', art: 'gold_mine', freq: 3, cost: 70000, col: '#e2b73a' },
    vault:       { name: 'Bullion Vault', climates: ['arctic', 'desert'], w: 2, h: 1, accepts: ['gold', 'gems'], place: 'town', minPop: 900, art: 'vault', freq: 2, cost: 50000, col: '#b9a26a' },
    // desert
    water_source:{ name: 'Water Bore', climates: ['desert'], w: 2, h: 2, prod: [['water', 14]], place: 'desert', art: 'water_source', freq: 6, cost: 30000, col: '#4f9bc9' },
    water_tower: { name: 'Water Tower', climates: ['desert'], w: 1, h: 1, accepts: ['water'], place: 'town', minPop: 300, art: 'water_tower', freq: 5, cost: 20000, col: '#6bb3dc' },
    orchard:     { name: 'Fruit Orchard', climates: ['desert'], w: 4, h: 4, prod: [['fruit', 12]], place: 'land', art: 'orchard', freq: 5, cost: 35000, col: '#e0703a' },
    maize_farm:  { name: 'Maize Farm', climates: ['desert'], w: 3, h: 3, prod: [['maize', 11]], place: 'desert', art: 'maize_farm', freq: 5, cost: 35000, col: '#e8c43c', fields: true },
    copper_mine: { name: 'Copper Mine', climates: ['desert'], w: 3, h: 3, prod: [['copper', 13]], place: 'land', art: 'copper_mine', freq: 4, cost: 50000, col: '#4f8f78' },
    lumber_yard: { name: 'Rainforest Logging', climates: ['desert'], w: 3, h: 3, prod: [['wood', 13]], place: 'rainforest', art: 'lumber', freq: 4, cost: 40000, col: '#4b7d3a' },
    rubber_farm: { name: 'Rubber Plantation', climates: ['desert'], w: 3, h: 3, prod: [['rubber', 11]], place: 'rainforest', art: 'rubber', freq: 4, cost: 35000, col: '#6b5a48' },
    works:       { name: 'Assembly Works', climates: ['desert'], w: 4, h: 3, accepts: ['copper', 'wood', 'rubber'], out: ['goods'], place: 'land', art: 'factory', freq: 3, cost: 100000, col: '#a34a3a' },
    gem_mine:    { name: 'Diamond Mine', climates: ['desert'], w: 3, h: 3, prod: [['gems', 6]], place: 'land', art: 'gem_mine', freq: 2, cost: 75000, col: '#bfe6f0' },
  };
  HL.INDUSTRY_IDS = Object.keys(HL.INDUSTRY);

  // Town building classes. tier gates by distance from centre and town size; pop/mail per building.
  // acc: acceptance in eighths for pax/mail/goods/food/water.
  HL.HOUSE_TIERS = [
    { name: 'Cottage', pop: [6, 14], acc: { pax: 3, mail: 1, food: 2, water: 1 } },
    { name: 'Terrace', pop: [16, 34], acc: { pax: 4, mail: 2, goods: 1, food: 3, water: 2 } },
    { name: 'Shopfront', pop: [28, 60], acc: { pax: 6, mail: 3, goods: 3, food: 4, water: 3 } },
    { name: 'Flats', pop: [60, 120], acc: { pax: 8, mail: 4, goods: 3, food: 5, water: 4 } },
    { name: 'Tower Block', pop: [120, 260], acc: { pax: 8, mail: 6, goods: 5, food: 6, water: 5 } },
    { name: 'High-rise', pop: [220, 420], acc: { pax: 8, mail: 8, goods: 6, food: 8, water: 6 } },
  ];
  // special buildings (one per town when large enough)
  HL.HOUSE_SPECIAL = {
    church:    { name: 'Church', minPop: 250, pop: 8, acc: { pax: 3, mail: 1 } },
    townhall:  { name: 'Town Hall', minPop: 0, pop: 20, acc: { pax: 5, mail: 4, goods: 2 } },
    market:    { name: 'Market Hall', minPop: 900, pop: 30, acc: { pax: 6, mail: 2, goods: 6, food: 8, water: 4 } },
    stadium:   { name: 'Stadium', minPop: 4000, pop: 40, acc: { pax: 8, mail: 2 }, year: 1900 },
    hospital:  { name: 'Hospital', minPop: 2500, pop: 80, acc: { pax: 8, mail: 6, goods: 4, food: 8, water: 8 }, year: 1920 },
  };
})(typeof window !== 'undefined' ? window : globalThis);
