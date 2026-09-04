// The asset universe.
//
// Stocks are REAL listed companies (ticker, name, sector, an approximate
// starting price and market cap) from companies.js. Everything after tick zero
// — every price, every move — is simulated by market.js and has no connection
// to the real market. Properties, alt assets and startups are fictional and
// generated procedurally from WORLD_SEED, so nothing needs to be stored server
// side: every client rebuilds the identical universe in ~15ms.
import { rngFrom, hash32, pick, rr, clamp } from './rng.js?v=2.1';
import { SECTOR_ROWS, FUNDS } from './companies.js?v=2.1';

// Frozen on purpose. The seed decides every property, collectible and startup
// in the world; changing it would rebuild them all and orphan saved holdings,
// so it keeps its original value even though the game has been renamed.
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
    ['BNB','BNB', 570], ['TRX','TRON', 0.16], ['TON','Toncoin', 5.6],
    ['ATOM','Cosmos', 6.4], ['ARB','Arbitrum', 0.72], ['OP','Optimism', 1.6],
    ['APT','Aptos', 8.1], ['INJ','Injective', 21], ['NEAR','NEAR Protocol', 4.3],
    ['FIL','Filecoin', 3.7], ['ICP','Internet Computer', 8.5], ['SHIB','Shiba Inu', 0.000017],
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
    ['PLAT','Platinum (oz)', 985, 0.22], ['PALL','Palladium (oz)', 1010, 0.38],
    ['CORN','Corn (bu)', 4.2, 0.28], ['SOY','Soybeans (bu)', 10.4, 0.26],
    ['COFFEE','Coffee (lb)', 2.35, 0.40], ['COCOA','Cocoa (t)', 7800, 0.52],
    ['SUGAR','Sugar (lb)', 0.21, 0.30], ['COTTON','Cotton (lb)', 0.72, 0.27],
    ['ALUM','Aluminium (t)', 2450, 0.23], ['NICKEL','Nickel (t)', 16800, 0.35],
  ].map(([t, n, p, v]) => ({
    kind: 'alt', class: 'commodity', id: 'A:' + t, ticker: t, name: n, base: p,
    vol: v, beta: rr(rand, 0.3, 0.9), speed: rr(rand, 0.8, 1.6), seed: hash32('alt:' + t) | 0,
  }));
  return [...crypto, ...comm];
}

// ---------------- Fixed income ----------------
// Bond prices fall when the policy rate rises. Duration decides how hard, which
// is the whole lesson: a 30-year bond is a leveraged bet on rates.
export function generateBonds() {
  const defs = [
    ['UST2',  'Treasury Note 2 Year',   3.80, 1.9, 0.0],
    ['UST5',  'Treasury Note 5 Year',   4.00, 4.5, 0.0],
    ['UST10', 'Treasury Bond 10 Year',  4.20, 8.2, 0.0],
    ['UST30', 'Treasury Bond 30 Year',  4.50, 17.5, 0.0],
    ['MUNI',  'City Revenue Muni',      3.40, 6.0, 0.35],
    ['IGCORP','Investment Grade Corp',  5.40, 6.8, 0.85],
    ['HYCORP','High Yield Corp',        8.20, 4.2, 3.40],
    ['EMDEBT','Emerging Market Debt',   7.10, 5.6, 2.60],
  ];
  return defs.map(([t, n, coupon, dur, credit]) => ({
    kind: 'bond', id: 'B:' + t, ticker: t, name: n,
    par: 1000, base: 1000, coupon, duration: dur, credit,
    seed: hash32('bnd:' + t) | 0,
  }));
}

// ---------------- Collectibles ----------------
// Slow, illiquid and sold at a spread. They ignore the stock market almost
// entirely, which makes them the one thing that holds up in a crash.
export const COLLECT_SPREAD = 0.09;   // you sell 9% below the quoted value

export function generateCollectibles() {
  const rand = rngFrom(WORLD_SEED + ':collect');
  const defs = [
    ['Abstract Canvas, 1968', 'art', 420000], ['Bronze Study, 1931', 'art', 185000],
    ['Colour Field Triptych', 'art', 96000], ['Street Art Panel', 'art', 42000],
    ['Steel Chronograph, 1969', 'watch', 88000], ['Gold Dress Watch, 1952', 'watch', 34000],
    ['Dive Watch, First Series', 'watch', 61000], ['Skeleton Tourbillon', 'watch', 210000],
    ['Rookie Card, Basketball', 'card', 74000], ['Holo Monster Card, Sealed', 'card', 26000],
    ['Vintage Baseball Set', 'card', 12500], ['First Print Trading Box', 'card', 6800],
    ['Bordeaux Case, 1982', 'wine', 31000], ['Single Malt Cask, 1974', 'wine', 88000],
    ['Champagne Vertical', 'wine', 14500], ['Barolo Library Lot', 'wine', 9200],
    ['First Edition Comic', 'odd', 155000], ['Meteorite Slice', 'odd', 8400],
    ['Roman Coin Hoard', 'odd', 47000], ['Arcade Cabinet, Boxed', 'odd', 5600],
    ['Signed Tour Guitar', 'odd', 68000], ['Cinema Poster, 1977', 'odd', 21000],
    ['Antique Sea Chart', 'odd', 15800], ['Studio Pottery Vase', 'odd', 4300],
    ['Holo Starter Card, Graded 10', 'card', 118000], ['Shadowless Base Set Box', 'card', 96000],
    ['Promo Card, Tournament Only', 'card', 43000], ['Error Print Card', 'card', 17500],
    ['Full Art Chase Card', 'card', 9400], ['Sealed Booster Bundle', 'card', 3600],
    ['Signed Rookie Jersey', 'odd', 28000], ['Championship Ring', 'odd', 52000],
    ['Moon Landing Print, Signed', 'odd', 36000], ['Hand-drawn Animation Cel', 'art', 27000],
    ['Titanium Dive Watch, NOS', 'watch', 19500], ['Grower Champagne Case', 'wine', 6800],
  ];
  const CLASSES = { art: 'Art', watch: 'Watches', card: 'Cards', wine: 'Wine & spirits', odd: 'Curiosities' };
  const usedTickers = new Set();
  const uniqueTicker = name => {
    const words = name.replace(/[^A-Za-z ]/g, '').split(/\s+/).filter(Boolean);
    let t = (words[0] || 'LOT').toUpperCase().slice(0, 6);
    for (let i = 1; usedTickers.has(t) && i < words.length; i++) {
      t = ((words[0] || '').slice(0, 3) + words[i].slice(0, 3)).toUpperCase();
    }
    let n = 2;
    while (usedTickers.has(t)) t = t.slice(0, 5) + (n++);
    usedTickers.add(t);
    return t;
  };
  return defs.map(([name, cls, price]) => ({
    kind: 'collect', class: cls, className: CLASSES[cls],
    id: 'C:' + name.replace(/[^A-Za-z0-9]/g, '').slice(0, 18),
    ticker: uniqueTicker(name),
    name, base: price,
    vol: rr(rand, 0.12, 0.38), speed: rr(rand, 0.6, 1.4),
    seed: hash32('col:' + name) | 0,
  }));
}

// ---------------- Countries ----------------
// Suggested by a player ("invest in every single country's government - you can
// invest in their GDP per capita"). You buy a stake in a national economy: the
// quote is its GDP per capita, it drifts with that country's growth rate, and it
// pays a yield. Rich economies grow slowly and pay more; emerging ones are the
// opposite. Figures are rough real-world 2024 numbers used as a starting point.
// GROUP | name | GDP per capita | growth %/yr | volatility | yield %
const COUNTRY_ROWS = `
LUX|Luxembourg|128000|1.2|0.10|3.4
IRL|Ireland|106000|3.4|0.20|2.4
CHE|Switzerland|105000|1.3|0.09|2.9
NOR|Norway|87000|1.4|0.15|4.1
SGP|Singapore|85000|2.6|0.13|3.0
USA|United States|85000|2.2|0.11|2.6
ISL|Iceland|84000|2.0|0.16|3.2
DNK|Denmark|68000|1.9|0.10|3.0
AUS|Australia|65000|1.7|0.12|3.6
NLD|Netherlands|64000|1.6|0.10|3.1
AUT|Austria|56000|1.1|0.10|3.3
SWE|Sweden|56000|1.8|0.13|3.2
BEL|Belgium|55000|1.2|0.10|3.4
CAN|Canada|54000|1.6|0.12|3.3
DEU|Germany|54000|1.0|0.11|3.2
ISR|Israel|53000|2.4|0.22|2.6
FIN|Finland|53000|1.3|0.11|3.4
GBR|United Kingdom|51000|1.4|0.12|3.5
ARE|United Arab Emirates|49000|3.4|0.19|3.1
NZL|New Zealand|47000|1.6|0.13|3.6
FRA|France|46000|1.2|0.10|3.3
ITA|Italy|39000|0.8|0.11|3.8
KOR|South Korea|34000|2.3|0.15|2.4
ESP|Spain|34000|1.9|0.13|3.5
JPN|Japan|33000|0.9|0.11|2.6
SAU|Saudi Arabia|32000|2.8|0.21|4.2
CZE|Czechia|30000|2.3|0.15|3.1
EST|Estonia|30000|2.4|0.18|3.0
PRT|Portugal|28000|1.9|0.14|3.6
GRC|Greece|23000|2.1|0.19|4.0
POL|Poland|22000|3.3|0.16|2.9
HUN|Hungary|22000|2.6|0.19|3.5
URY|Uruguay|22000|2.4|0.20|3.8
ROU|Romania|18000|3.6|0.19|3.4
CHL|Chile|17000|2.4|0.21|3.9
CHN|China|13000|4.6|0.22|2.0
MYS|Malaysia|13000|4.2|0.20|3.2
MEX|Mexico|13000|2.3|0.20|3.7
TUR|Turkey|13000|3.4|0.34|4.6
ARG|Argentina|13000|2.0|0.42|5.2
RUS|Russia|14000|1.6|0.36|5.0
BRA|Brazil|10000|2.4|0.26|4.4
THA|Thailand|7500|3.0|0.20|3.4
ZAF|South Africa|6300|1.4|0.27|4.8
IDN|Indonesia|5000|5.0|0.21|3.0
VNM|Vietnam|4500|6.2|0.24|2.6
PHL|Philippines|4000|5.6|0.23|2.8
EGY|Egypt|3500|4.2|0.34|4.9
IND|India|2700|6.5|0.23|2.2
BGD|Bangladesh|2600|5.8|0.27|3.0
KEN|Kenya|2200|5.0|0.30|3.8
NGA|Nigeria|1600|3.2|0.36|5.1
PAK|Pakistan|1600|3.0|0.38|5.4
ETH|Ethiopia|1300|6.0|0.35|3.6
`;

export function generateCountries() {
  const out = [];
  for (const line of COUNTRY_ROWS.split('\n')) {
    const row = line.trim();
    if (!row || row.indexOf('|') < 0) continue;
    const [code, name, gdp, growth, vol, yld] = row.split('|');
    const r = rngFrom('cty:' + code);
    out.push({
      kind: 'country', id: 'N:' + code, ticker: code, name,
      base: parseFloat(gdp),
      growth: parseFloat(growth),
      vol: parseFloat(vol),
      yield: parseFloat(yld),
      speed: rr(r, 0.8, 1.3),
      seed: hash32('cty:' + code) | 0,
    });
  }
  return out;
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

// ---------------- Films ----------------
// Yesman asked to invest in films that have not come out yet, and to be paid on
// how popular they turn out and how many tickets they sell. A slate rotates
// every fifteen minutes; each one has a budget, a hype level, and an opening.
export const FILM_ROUND_TICKS = 300;

const FILM_A = ['Return to', 'The Last', 'Rise of', 'Beyond', 'Echoes of', 'Legacy of', 'Night of', 'The Second', 'Shadows of', 'Kingdom of'];
const FILM_B = ['Aurora', 'the Deep', 'Ironhold', 'the Vault', 'Redwater', 'the Ninth', 'Glasstown', 'the Comet', 'Blackpine', 'the Harbour'];
const FILM_GENRE = ['blockbuster sequel', 'animated sequel', 'superhero follow-up', 'space epic', 'heist sequel', 'monster feature', 'spy thriller', 'disaster picture'];

export function generateFilms(round) {
  const rand = rngFrom(WORLD_SEED + ':films:' + round);
  const out = [];
  for (let i = 0; i < 6; i++) {
    const hype = Math.round(rr(rand, 25, 98));
    out.push({
      kind: 'film', id: 'F:' + round + ':' + i,
      title: pick(rand, FILM_A) + ' ' + pick(rand, FILM_B),
      genre: pick(rand, FILM_GENRE),
      budget: Math.round(rr(rand, 40, 320)) * 1e6,
      hype,
      ask: Math.round(rr(rand, 2000, 60000) / 500) * 500,
      maturity: Math.round(rr(rand, 80, 200)),
      round,
    });
  }
  return out;
}

// Box office decides the payout: hype raises the average, but a flop is always
// possible and a sleeper hit can run a long way.
export function filmOutcome(filmId, hype) {
  const r = rngFrom('boxoffice:' + filmId);
  const roll = r();
  const lean = hype / 100;
  if (roll < 0.28 - lean * 0.12) return 0.15 + r() * 0.35;      // bombed
  if (roll < 0.62 - lean * 0.10) return 0.7 + r() * 0.6;        // made its money back
  if (roll < 0.94) return 1.4 + r() * (1.2 + lean * 2.2);       // a hit
  return 3.5 + r() * (3 + lean * 6);                            // a phenomenon
}

// ---------------- The street market ----------------
// Also Yesman: buy knock-off designer gear cheap and try to sell it on. Some
// lots are worth a fortune to the right buyer; some are seized at the border
// and you get nothing. You do not find out which until you try to sell.
export const STREET_LOTS = [
  ['Box of 40 hoodies', 1800], ['Pallet of trainers', 5200], ['Case of watches', 9500],
  ['Crate of handbags', 7400], ['Bundle of jackets', 3100], ['Sack of sunglasses', 950],
  ['Container of tracksuits', 15800], ['Rack of belts', 640], ['Carton of perfume', 2300],
  ['Job lot of scarves', 480], ['Suitcase of jewellery', 12500], ['Trolley of caps', 720],
].map(([name, price], i) => ({
  kind: 'street', id: 'X:' + i, name,
  price, seed: hash32('street:' + i) | 0,
}));

// What a lot fetches, fixed the moment you bought it and revealed when you sell.
export function streetOutcome(lotId, boughtTick) {
  const r = rngFrom('street:' + lotId + ':' + Math.floor(boughtTick / 20));
  const roll = r();
  if (roll < 0.18) return 0;                       // seized, the lot is gone
  if (roll < 0.45) return 0.4 + r() * 0.5;         // shifted at a loss
  if (roll < 0.85) return 1.1 + r() * 0.9;         // a decent turn
  return 2.2 + r() * 2.6;                          // the right buyer walked in
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
