// The asset universe.
//
// Stocks are REAL listed companies (ticker, name, sector, an approximate
// starting price and market cap) from companies.js. Everything after tick zero
// — every price, every move — is simulated by market.js and has no connection
// to the real market. Properties, alt assets and startups are fictional and
// generated procedurally from WORLD_SEED, so nothing needs to be stored server
// side: every client rebuilds the identical universe in ~15ms.
import { rngFrom, hash32, pick, rr, clamp } from './rng.js';
import { SECTOR_ROWS, FUNDS } from './companies.js';

export const WORLD_SEED = 'ledger-city-v1';

export const SECTORS = [
  { id: 'tech', name: 'Technology',      color: '#5b8cff' },
  { id: 'comm', name: 'Communications',  color: '#ff7a59' },
  { id: 'cons', name: 'Consumer',        color: '#f2618c' },
  { id: 'stap', name: 'Staples',         color: '#8bd450' },
  { id: 'enrg', name: 'Energy',          color: '#ffb03a' },
  { id: 'fin',  name: 'Financials',      color: '#9b7bff' },
  { id: 'hlth', name: 'Healthcare',      color: '#39d38a' },
  { id: 'ind',  name: 'Industrials',     color: '#8fa3b8' },
  { id: 'mat',  name: 'Materials',       color: '#c9a227' },
  { id: 'reit', name: 'Real Estate',     color: '#d98cff' },
  { id: 'util', name: 'Utilities',       color: '#4fc3c3' },
  { id: 'fund', name: 'Index Funds',     color: '#7ec8ff' },
];

export const SECTOR_BY_ID = Object.fromEntries(SECTORS.map(s => [s.id, s]));

// Per-sector character: how much idiosyncratic noise, how much market beta,
// and roughly how generous dividends are.
const PROFILE = {
  tech: { vol: 0.30, beta: 1.25, div: 0.6, payer: 0.55 },
  comm: { vol: 0.28, beta: 1.15, div: 0.9, payer: 0.50 },
  cons: { vol: 0.28, beta: 1.20, div: 1.0, payer: 0.55 },
  stap: { vol: 0.14, beta: 0.60, div: 2.7, payer: 0.95 },
  enrg: { vol: 0.30, beta: 0.95, div: 3.4, payer: 0.90 },
  fin:  { vol: 0.22, beta: 1.05, div: 2.4, payer: 0.90 },
  hlth: { vol: 0.22, beta: 0.75, div: 1.7, payer: 0.70 },
  ind:  { vol: 0.20, beta: 1.05, div: 1.5, payer: 0.85 },
  mat:  { vol: 0.26, beta: 1.10, div: 2.1, payer: 0.90 },
  reit: { vol: 0.20, beta: 0.90, div: 4.4, payer: 1.00 },
  util: { vol: 0.14, beta: 0.55, div: 3.4, payer: 1.00 },
};

function capClass(capB) {
  return capB >= 200 ? 'mega' : capB >= 30 ? 'large' : capB >= 8 ? 'mid' : 'small';
}
const SIZE_VOL = { mega: 0.70, large: 0.88, mid: 1.10, small: 1.45 };

export function generateCompanies() {
  const out = [];
  for (const [sector, block] of Object.entries(SECTOR_ROWS)) {
    const prof = PROFILE[sector];
    for (const line of block.split('\n')) {
      const row = line.trim();
      if (!row || row.indexOf('|') < 0) continue;
      const [ticker, name, priceStr, capStr] = row.split('|');
      const price = parseFloat(priceStr), capB = parseFloat(capStr);
      if (!(price > 0) || !(capB > 0)) continue;
      // Per-company personality is seeded off the ticker, so it never changes.
      const r = rngFrom('co:' + ticker);
      const cap = capClass(capB);
      out.push({
        kind: 'stock', id: 'S:' + ticker, ticker, name, sector, cap,
        base: price,
        floatShares: Math.round(capB * 1e9 / price),
        vol: clamp(prof.vol * SIZE_VOL[cap] * rr(r, 0.75, 1.35), 0.05, 0.62),
        beta: clamp(prof.beta * rr(r, 0.75, 1.3) * (cap === 'mega' ? 0.9 : 1), 0.2, 2.2),
        secBeta: rr(r, 0.6, 1.35),
        speed: rr(r, 0.8, 1.5),
        div: r() < prof.payer ? Math.round(prof.div * rr(r, 0.5, 1.6) * 100) / 100 : 0,
        seed: hash32('stk:' + ticker) | 0,
      });
    }
  }
  return out;
}

// Index funds hold a basket of the companies above; market.js prices them from
// their members, so a fund really does track whatever its holdings are doing.
export function generateFunds(companies) {
  const byCap = [...companies].sort((a, b) => b.base * b.floatShares - a.base * a.floatShares);
  return FUNDS.map(f => {
    let pool = f.sectors ? byCap.filter(c => f.sectors.includes(c.sector)) : byCap;
    if (f.mode === 'small') pool = [...pool].reverse().filter(c => c.cap === 'small' || c.cap === 'mid');
    if (f.mode === 'price') pool = [...pool].slice(0, 90).sort((a, b) => b.base - a.base);
    const members = pool.slice(0, f.members);
    const weights = members.map(m =>
      f.mode === 'price' ? m.base : Math.sqrt(m.base * m.floatShares));
    const total = weights.reduce((a, b) => a + b, 0) || 1;
    return {
      kind: 'fund', id: 'S:' + f.ticker, ticker: f.ticker, name: f.name, sector: 'fund',
      cap: 'fund', base: f.price,
      members: members.map((m, i) => ({ asset: m, w: weights[i] / total })),
      holdings: members.length,
      div: f.sectors && f.sectors[0] === 'reit' ? 3.6 : 1.2,
      floatShares: Math.round(rr(rngFrom('fund:' + f.ticker), 60, 900)) * 1e6,
      seed: hash32('fnd:' + f.ticker) | 0,
    };
  });
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
    ['BTC','Bitcoin', 62000], ['ETH','Ethereum', 2600], ['SOL','Solana', 145],
    ['XRP','XRP', 0.58], ['DOGE','Dogecoin', 0.13], ['ADA','Cardano', 0.42],
    ['AVAX','Avalanche', 28], ['LINK','Chainlink', 13], ['DOT','Polkadot', 5.4],
    ['MATIC','Polygon', 0.52], ['LTC','Litecoin', 68], ['UNI','Uniswap', 7.2],
  ].map(([t, n, p]) => ({
    kind: 'alt', class: 'crypto', id: 'A:' + t, ticker: t, name: n, base: p,
    vol: rr(rand, 0.55, 1.35), beta: rr(rand, 0.6, 2.0), speed: rr(rand, 2.2, 4.5),
    seed: hash32('alt:' + t) | 0,
  }));
  const comm = [
    ['GOLD','Gold (oz)', 2380, 0.16], ['SILVER','Silver (oz)', 29.4, 0.26],
    ['WTI','Crude Oil (bbl)', 78.2, 0.34], ['NATGAS','Natural Gas (mmBtu)', 2.65, 0.48],
    ['COPPER','Copper (lb)', 4.35, 0.24], ['WHEAT','Wheat (bu)', 6.1, 0.30],
    ['URANIUM','Uranium (lb)', 91, 0.31], ['LITHIUM','Lithium (t)', 14200, 0.42],
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
