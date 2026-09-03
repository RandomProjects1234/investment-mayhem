// Procedural asset universe. Nothing is stored in Firebase: every client
// regenerates the identical universe from a fixed WORLD_SEED in ~10ms.
import { rngFrom, hash32, pick, rr, clamp } from './rng.js';

export const WORLD_SEED = 'ledger-city-v1';

export const SECTORS = [
  { id: 'tech',    name: 'Technology',  vol: 1.35, color: '#5b8cff' },
  { id: 'energy',  name: 'Energy',      vol: 1.20, color: '#ffb03a' },
  { id: 'health',  name: 'Healthcare',  vol: 1.00, color: '#39d38a' },
  { id: 'retail',  name: 'Retail',      vol: 0.90, color: '#f2618c' },
  { id: 'fin',     name: 'Financials',  vol: 1.05, color: '#9b7bff' },
  { id: 'indus',   name: 'Industrials', vol: 0.85, color: '#8fa3b8' },
  { id: 'mat',     name: 'Materials',   vol: 0.95, color: '#c9a227' },
  { id: 'util',    name: 'Utilities',   vol: 0.55, color: '#4fc3c3' },
  { id: 'media',   name: 'Media',       vol: 1.15, color: '#ff7a59' },
  { id: 'trans',   name: 'Transport',   vol: 0.95, color: '#7ec8ff' },
  { id: 'agri',    name: 'Agriculture', vol: 0.80, color: '#8bd450' },
  { id: 'aero',    name: 'Aerospace',   vol: 1.10, color: '#b0b7ff' },
];

export const SECTOR_BY_ID = Object.fromEntries(SECTORS.map(s => [s.id, s]));

const PRE = ['Nova','Vertex','Helio','Quant','Aster','Orbis','Lumen','Kestrel','Pyra','Zenith','Cobalt','Meridian','Auric','Solace','Ironwood','Vantage','Halcyon','Corvid','Tessera','Bastion','Lyric','Onyx','Pallas','Ridge','Sable','Thorne','Umbra','Vireo','Wexler','Yarrow','Zephyr','Alder','Brimstone','Calder','Dovetail','Ember','Fathom','Granite','Harbor','Indigo','Juniper','Kite','Lodestar','Mistral','Nimbus','Opal','Quarry','Raven','Stonebridge','Talon','Ursa','Valen','Willow','Xander','Yield','Zircon','Argent','Beacon','Cinder','Drift','Everest','Foxglove','Glacier','Hollow','Ivory','Jetstream','Karst','Larkspur','Monarch','Nightfall','Orchard','Pinnacle','Quill','Rampart','Summit','Tidal','Upland','Verdant','Westgate','Axiom','Bramble','Copperline'];
const MID = ['','','','','Core','Dyne','Tech','Logic','Works','Wave','Point','Line','Field','Gate','Forge','Grid','Path','Peak','Stone','Star'];
const SUF = {
  tech:   ['Systems','Labs','Compute','Networks','Software','Dynamics','AI','Semiconductor'],
  energy: ['Petroleum','Energy','Power','Drilling','Renewables','Fuels','Resources'],
  health: ['Biotech','Health','Pharma','Medical','Therapeutics','Genomics','Care'],
  retail: ['Retail','Brands','Markets','Goods','Outfitters','Stores','Grocers'],
  fin:    ['Capital','Bancorp','Holdings','Financial','Trust','Partners','Insurance'],
  indus:  ['Industries','Manufacturing','Engineering','Tooling','Fabrication','Machinery'],
  mat:    ['Mining','Chemicals','Materials','Metals','Minerals','Composites'],
  util:   ['Utilities','Water','Electric','Gas and Light','Municipal'],
  media:  ['Media','Studios','Entertainment','Broadcasting','Interactive','Publishing'],
  trans:  ['Logistics','Shipping','Freight','Rail','Transit','Couriers'],
  agri:   ['Farms','Agriculture','Foods','Harvest','Growers','Fisheries'],
  aero:   ['Aerospace','Aviation','Orbital','Defense','Propulsion','Airframes'],
};

function makeTicker(seedName, used, rand) {
  const letters = seedName.toUpperCase().replace(/[^A-Z]/g, '');
  let t = letters.slice(0, 3);
  if (t.length < 3) t = (t + 'XYZ').slice(0, 3);
  if (!used.has(t)) { used.add(t); return t; }
  for (let i = 3; i < letters.length; i++) {
    const c = t + letters[i];
    if (!used.has(c)) { used.add(c); return c; }
  }
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (let i = 0; i < 4000; i++) {
    const c = t + A[Math.floor(rand() * 26)] + (i > 1000 ? A[Math.floor(rand() * 26)] : '');
    if (!used.has(c)) { used.add(c); return c; }
  }
  const c = 'Z' + used.size; used.add(c); return c;
}

export function generateCompanies(count = 640) {
  const rand = rngFrom(WORLD_SEED + ':companies');
  const used = new Set();
  const out = [];
  for (let i = 0; i < count; i++) {
    const sec = SECTORS[i % SECTORS.length];
    const pre = pick(rand, PRE);
    const mid = pick(rand, MID);
    const suf = pick(rand, SUF[sec.id]);
    const name = (pre + (mid ? ' ' + mid : '') + ' ' + suf).replace(/\s+/g, ' ');
    const ticker = makeTicker(pre + mid, used, rand);
    const sizeRoll = rand();
    const cap = sizeRoll > 0.90 ? 'mega' : sizeRoll > 0.70 ? 'large' : sizeRoll > 0.35 ? 'mid' : 'small';
    const capMul = { mega: 1.0, large: 0.85, mid: 0.68, small: 0.45 }[cap];
    out.push({
      kind: 'stock', id: 'S:' + ticker, ticker, name, sector: sec.id, cap,
      base: Math.max(1.2, Math.round(rr(rand, 4, 900) * capMul * 100) / 100),
      vol: clamp(rr(rand, 0.10, 0.42) * sec.vol * (cap === 'small' ? 1.5 : cap === 'mega' ? 0.7 : 1), 0.06, 0.60),
      beta: clamp(rr(rand, 0.45, 1.7) * (cap === 'mega' ? 0.85 : 1.1), 0.2, 2.2),
      secBeta: rr(rand, 0.5, 1.4),
      speed: rr(rand, 0.8, 1.5),
      div: rand() < 0.42 ? Math.round(rr(rand, 0.4, 4.2) * 100) / 100 : 0,
      floatShares: Math.round(rr(rand, 20, 4200)) * 1e6,
      seed: hash32('stk:' + ticker) | 0,
    });
  }
  return out;
}

// ---------------- Real estate ----------------
export const REGIONS = [
  { id: 'downtown',   name: 'Downtown Core',    mul: 2.4,  vol: 1.25 },
  { id: 'harbor',     name: 'Harbor District',  mul: 1.7,  vol: 1.10 },
  { id: 'midtown',    name: 'Midtown',          mul: 1.3,  vol: 0.95 },
  { id: 'suburb',     name: 'Northern Suburbs', mul: 0.9,  vol: 0.70 },
  { id: 'industrial', name: 'Ironworks Flats',  mul: 0.7,  vol: 1.05 },
  { id: 'coast',      name: 'Silver Coast',     mul: 2.0,  vol: 1.35 },
  { id: 'rural',      name: 'Outer Valley',     mul: 0.45, vol: 0.60 },
];

export const PROP_TYPES = [
  { id: 'res', name: 'Residential', yld: [0.0011, 0.0023], scale: [90e3, 1.4e6] },
  { id: 'com', name: 'Commercial',  yld: [0.0014, 0.0030], scale: [260e3, 6.5e6] },
  { id: 'ind', name: 'Industrial',  yld: [0.0018, 0.0038], scale: [180e3, 4.2e6] },
];

const STREETS = ['Alder','Bishop','Copper','Dunmore','Elm','Fairlane','Granby','Hawthorn','Ivory','Juniper','Kingsway','Larch','Maple','Norwood','Oakfield','Pembroke','Quayside','Rosemont','Sycamore','Thistle','Union','Verona','Windmill','Yale','Zephyr'];
const KIND = {
  res: ['Apartment','Townhouse','Duplex','Loft','Bungalow','Condo Unit','Row House','Penthouse'],
  com: ['Office Floor','Retail Unit','Coffee Bar','Boutique Mall','Clinic Suite','Coworking Floor','Hotel Wing'],
  ind: ['Warehouse','Cold Store','Machine Shop','Depot','Fabrication Bay','Logistics Hub','Recycling Yard'],
};

export function generateProperties(count = 260) {
  const rand = rngFrom(WORLD_SEED + ':property');
  const out = [];
  for (let i = 0; i < count; i++) {
    const region = REGIONS[i % REGIONS.length];
    const type = PROP_TYPES[Math.floor(rand() * PROP_TYPES.length)];
    const base = Math.round(rr(rand, type.scale[0], type.scale[1]) * region.mul / 1000) * 1000;
    const id = 'P:' + region.id + i;
    out.push({
      kind: 'property', id,
      name: Math.floor(rr(rand, 12, 980)) + ' ' + pick(rand, STREETS) + ' ' + (rand() < 0.5 ? 'St' : 'Ave') + ' - ' + pick(rand, KIND[type.id]),
      region: region.id, regionName: region.name, type: type.id, typeName: type.name,
      base, vol: rr(rand, 0.05, 0.16) * region.vol, speed: rr(rand, 0.25, 0.55),
      rentRate: rr(rand, type.yld[0], type.yld[1]), // share of value paid per real minute
      upkeep: rr(rand, 0.15, 0.35),                 // share of gross rent lost to upkeep
      seed: hash32('prp:' + id) | 0,
    });
  }
  return out;
}

// ---------------- Alternatives ----------------
export function generateAlts() {
  const rand = rngFrom(WORLD_SEED + ':alts');
  const crypto = [
    ['BITZ','Bitzcoin', 41000], ['ETHR','Etheria', 2600], ['DOGZ','Dogzcoin', 0.19],
    ['SOLA','Solaris', 118], ['MOON','Moonbase', 0.0042], ['QNTM','Quantum Chain', 74],
    ['LEDG','LedgerX', 9.4], ['PEPR','Peppercoin', 0.00031], ['NOVA','NovaNet', 312],
    ['HELI','Helion', 1.8], ['ZKAP','ZK Apex', 26], ['GRIN','Grinstone', 0.63],
  ].map(([t, n, p]) => ({
    kind: 'alt', class: 'crypto', id: 'A:' + t, ticker: t, name: n, base: p,
    vol: rr(rand, 0.55, 1.35), beta: rr(rand, 0.6, 2.0), speed: rr(rand, 2.2, 4.5),
    seed: hash32('alt:' + t) | 0,
  }));
  const comm = [
    ['GOLD','Gold (oz)', 2380, 0.16], ['SILV','Silver (oz)', 29.4, 0.26],
    ['OILW','Crude Oil (bbl)', 78.2, 0.34], ['NGAS','Natural Gas (mmBtu)', 2.65, 0.48],
    ['COPR','Copper (lb)', 4.35, 0.24], ['WHET','Wheat (bu)', 6.1, 0.30],
    ['URAN','Uranium (lb)', 91, 0.31], ['LITH','Lithium (t)', 14200, 0.42],
  ].map(([t, n, p, v]) => ({
    kind: 'alt', class: 'commodity', id: 'A:' + t, ticker: t, name: n, base: p,
    vol: v, beta: rr(rand, 0.3, 0.9), speed: rr(rand, 0.8, 1.6), seed: hash32('alt:' + t) | 0,
  }));
  return [...crypto, ...comm];
}

// Angel investing: a rotating slate of startups, deterministic per round.
export const STARTUP_ROUND_TICKS = 200;
const SU_A = ['Hyper','Loop','Bright','Chrono','Deep','Echo','Flux','Glide','Hush','Iris','Jolt','Knit','Lumo','Mesh','Nook','Orbit','Prism','Quill','Rove','Sift','Tally','Umber','Vault','Wisp'];
const SU_B = ['ly','io','base','stack','works','labs','flow','forge','byte','nest','pilot','loop','wave','core'];
const SU_P = ['drone delivery for rural clinics','an AI that negotiates your bills','vertical farms in parking garages','carbon-negative concrete','a marketplace for idle GPUs','protein grown from methane','robot dishwashers for restaurants','a bank built for teenagers','sleep tracking without wearables','fusion component machining','a social network for hobbies','on-demand welding crews','plastic-eating enzymes','satellite crop insurance','a language model for lawyers','same-day pharmacy drones'];

export function generateStartups(round) {
  const rand = rngFrom(WORLD_SEED + ':startups:' + round);
  const out = [];
  for (let i = 0; i < 8; i++) {
    const risk = rand();
    out.push({
      kind: 'startup', id: 'U:' + round + ':' + i, round,
      name: pick(rand, SU_A) + pick(rand, SU_B),
      pitch: pick(rand, SU_P),
      ask: Math.round(rr(rand, 2000, 90000) / 500) * 500,
      maturity: Math.round(rr(rand, 60, 160)),
      risk: risk < 0.34 ? 'moderate' : risk < 0.72 ? 'high' : 'extreme',
    });
  }
  return out;
}

// Deterministic payout multiple, only revealed once the investment matures.
const OUTCOME_TABLE = {
  moderate: [[0.45, 0], [0.75, 1.4], [0.94, 3.0], [1, 8]],
  high:     [[0.62, 0], [0.84, 1.8], [0.965, 6.0], [1, 18]],
  extreme:  [[0.78, 0], [0.90, 2.2], [0.982, 11.0], [1, 45]],
};

export function startupOutcome(startupId, risk) {
  const r = rngFrom('outcome:' + startupId);
  const roll = r();
  for (const [p, m] of (OUTCOME_TABLE[risk] || OUTCOME_TABLE.high)) {
    if (roll < p) return m === 0 ? 0 : Math.max(0, m + (r() - 0.5) * m * 0.35);
  }
  return 0;
}
