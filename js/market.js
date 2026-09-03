// Deterministic market simulation.
//
// price(asset, tick) is a PURE function of the asset's seed and the tick index,
// plus one shared multiplayer term (net player flow, read from Firebase).
// Because the tick index comes from wall-clock time, every browser in the world
// draws the same chart without any server doing the simulating.
import { fbm, hashF, clamp } from './rng.js?v=1.5';

export const TICK_MS = 3000;               // one market tick = 3 real seconds
export const nowTick = () => Math.floor(Date.now() / TICK_MS);

// Fixed reference point for anything that compounds over time, frozen at the
// v1.5 release so every client agrees. Trading income runs on a fast clock (one
// real minute stands in for a week), but a national economy has to grow on a
// slow one, so countries use four real hours per simulated year.
export const EPOCH_TICK = Math.floor(Date.UTC(2026, 8, 3) / TICK_MS);
export const TICKS_PER_COUNTRY_YEAR = 4800;
export const countryYears = t => Math.max(0, (t - EPOCH_TICK) / TICKS_PER_COUNTRY_YEAR);

const MKT_SEED = 0x51ed | 0;
const EVENT_SLOT = 10;      // events can only begin on ticks divisible by this
const EVENT_WINDOW = 26;    // how many slots back we look (26 * 10 = 260 ticks)
const EVENT_TAU = 70;       // decay constant, in ticks

// ---- broad market ------------------------------------------------------
export function marketFactor(t) {
  return fbm(MKT_SEED, t / 260, 4) * 0.15 + fbm(MKT_SEED + 31, t / 900, 2) * 0.13;
}

function sectorSeed(sectorId) {
  let h = 0;
  for (let i = 0; i < sectorId.length; i++) h = (Math.imul(h, 131) + sectorId.charCodeAt(i)) | 0;
  return h;
}
const secSeedCache = new Map();
const secSeed = id => {
  let v = secSeedCache.get(id);
  if (v === undefined) { v = sectorSeed(id); secSeedCache.set(id, v); }
  return v;
};

export function sectorFactor(sectorId, t) {
  const s = secSeed(sectorId);
  return fbm(s, t / 170, 3) * 0.13 + eventEffect(s ^ 0x7a5, t, 0.09, 0.26);
}

// ---- discrete shock events --------------------------------------------
// Instead of replaying a random walk from t=0 we sum a handful of decaying
// shocks drawn from a hash of the slot index: O(26) work, no history needed.
function eventEffect(seed, t, prob, scale) {
  const slot0 = Math.floor(t / EVENT_SLOT);
  let sum = 0;
  for (let k = 0; k < EVENT_WINDOW; k++) {
    const slot = slot0 - k;
    const roll = hashF(seed, slot);
    if (roll < prob) {
      const mag = (hashF(seed ^ 0x1234, slot) - 0.45) * 2 * scale;
      const age = t - slot * EVENT_SLOT;
      sum += mag * Math.exp(-age / EVENT_TAU) * (1 - Math.exp(-age / 4));
    }
  }
  return sum;
}

// Human-readable version of the same events, for the news ticker.
const GOOD = ['beats earnings expectations', 'lands a major government contract', 'announces a surprise buyback', 'gets regulatory approval', 'reports record quarterly margins', 'is added to a major index'];
const BAD  = ['misses earnings badly', 'faces a regulatory probe', 'issues a profit warning', 'loses its largest customer', 'halts production after an incident', 'sees its CEO resign abruptly'];
const SEC_GOOD = ['sees a wave of investor optimism', 'benefits from new subsidies', 'rallies on strong demand data'];
const SEC_BAD  = ['is hit by tighter regulation', 'slides on weak demand data', 'faces a supply crunch'];

export function recentEvents(assets, sectors, t, limit = 24) {
  const out = [];
  const slot0 = Math.floor(t / EVENT_SLOT);
  for (const sec of sectors) {
    const seed = secSeed(sec.id) ^ 0x7a5;
    for (let k = 0; k < 10; k++) {
      const slot = slot0 - k;
      if (hashF(seed, slot) < 0.10) {
        const mag = (hashF(seed ^ 0x1234, slot) - 0.45) * 2 * 0.26;
        out.push({ tick: slot * EVENT_SLOT, mag, text: sec.name + ' ' + phrase(mag, SEC_GOOD, SEC_BAD, slot ^ seed), scope: 'sector' });
      }
    }
  }
  for (const a of assets) {
    const seed = a.seed ^ 0x99;
    for (let k = 0; k < 6; k++) {
      const slot = slot0 - k;
      if (hashF(seed, slot) < 0.045) {
        const mag = (hashF(seed ^ 0x1234, slot) - 0.45) * 2 * 0.30;
        out.push({ tick: slot * EVENT_SLOT, mag, text: a.name + ' (' + a.ticker + ') ' + phrase(mag, GOOD, BAD, slot ^ a.seed), scope: 'stock', id: a.id });
      }
    }
  }
  out.sort((x, y) => y.tick - x.tick);
  return out.slice(0, limit);
}

function phrase(mag, good, bad, slot) {
  const list = mag >= 0 ? good : bad;
  return list[Math.floor(hashF(0x5eed, slot) * list.length) % list.length];
}

// ---- interest rates ----------------------------------------------------
// One policy rate drives every bond, the savings account, and (gently) the
// market itself. It moves slowly, the way a central bank does.
export function policyRate(t) {
  return 3.9 + fbm(0x2717, t / 1400, 3) * 2.4 + fbm(0x2718, t / 380, 2) * 0.5;
}

export function bondYield(asset, t) {
  const creditCycle = asset.credit
    ? asset.credit * (1 + fbm(asset.seed ^ 0x5c, t / 500, 3) * 0.8)
    : 0;
  return policyRate(t) + creditCycle;
}

// ---- multiplayer flow --------------------------------------------------
// /market/flow/{assetId} holds the net units bought by all players. It nudges
// the price for everyone, so a crowded trade really does move the tape.
let FLOW = Object.create(null);
export function setFlow(obj) { FLOW = obj || Object.create(null); }
export function flowOf(id) { return FLOW[id] || 0; }
export function flowImpact(asset) {
  const net = FLOW[asset.id] || 0;
  if (asset.kind === 'bond') return 0;   // rates set bond prices, not crowds
  if (asset.kind === 'country') return Math.tanh((FLOW[asset.id] || 0) / 900) * 0.10;
  const scale = (asset.kind === 'stock' || asset.kind === 'fund') ? (asset.floatShares || 1e9) / 4e5
              : asset.kind === 'alt' ? 4000 : asset.kind === 'collect' ? 12 : 25;
  return Math.tanh(net / scale) * 0.22;   // capped at +/-22%
}

// ---- price -------------------------------------------------------------
// Prices without the multiplayer flow term are memoised: charts ask for the
// same (asset, tick) pairs over and over, and funds re-read their members.
const pxCache = new Map();

function rawPrice(asset, t) {
  const key = asset.id + '|' + t;
  const hit = pxCache.get(key);
  if (hit !== undefined) return hit;

  let logMul;
  if (asset.kind === 'stock') {
    logMul = marketFactor(t) * asset.beta
      + sectorFactor(asset.sector, t) * asset.secBeta
      + fbm(asset.seed, t / (45 / asset.speed), 4) * asset.vol * 0.45
      + fbm(asset.seed ^ 0x2f, t / (7 / asset.speed), 2) * asset.vol * 0.22
      + eventEffect(asset.seed ^ 0x99, t, 0.045, 0.30);
  } else if (asset.kind === 'alt') {
    logMul = marketFactor(t) * asset.beta
      + fbm(asset.seed, t / (70 / asset.speed), 5) * asset.vol
      + fbm(asset.seed ^ 0x2f, t / (9 / asset.speed), 3) * asset.vol * 0.5
      + eventEffect(asset.seed ^ 0x99, t, 0.055, asset.class === 'crypto' ? 0.85 : 0.5);
  } else if (asset.kind === 'bond') {
    // Price moves inversely with yield, scaled by duration. A 30-year bond
    // loses roughly a fifth of its value when rates rise two points.
    const y = bondYield(asset, t);
    const px = asset.par * (1 + (asset.coupon - y) / 100 * asset.duration * 0.92)
      * (1 + fbm(asset.seed, t / 90, 2) * 0.004);
    const p = Math.max(asset.par * 0.25, Math.min(asset.par * 2.2, px));
    if (pxCache.size > 60000) pxCache.clear();
    pxCache.set(key, p);
    return p;
  } else if (asset.kind === 'country') {
    // A national economy: a growth trend that saturates, plus a business cycle
    // and the odd shock. Emerging economies grow faster and swing harder.
    // tanh so growth eases off instead of hitting a wall, and no country can
    // run away forever.
    const raw = asset.growth / 100 * countryYears(t);
    const drift = 1.5 * Math.tanh(raw / 1.5);
    logMul = drift
      + fbm(asset.seed, t / (320 / asset.speed), 3) * asset.vol
      + fbm(asset.seed ^ 0x3d, t / (60 / asset.speed), 2) * asset.vol * 0.35
      + marketFactor(t) * 0.25
      + eventEffect(asset.seed ^ 0x99, t, 0.025, asset.vol * 0.9);
  } else if (asset.kind === 'collect') {
    // Collectibles barely notice the stock market. They drift for a long time
    // and then jump when a comparable sells at auction.
    logMul = marketFactor(t) * 0.12
      + fbm(asset.seed, t / (1300 / asset.speed), 3) * asset.vol * 1.8
      + eventEffect(asset.seed ^ 0x99, t, 0.018, 0.55);
  } else { // property: slow, low-frequency, mildly correlated with the market
    logMul = marketFactor(t) * 0.35
      + fbm(asset.seed, t / (900 / asset.speed), 3) * asset.vol * 3
      + eventEffect(asset.seed ^ 0x99, t, 0.02, 0.35);
  }
  const p = Math.max(asset.base * 0.01, asset.base * Math.exp(logMul));
  if (pxCache.size > 60000) pxCache.clear();
  pxCache.set(key, p);
  return p;
}

// A fund is worth what its holdings are worth: the weighted average of how far
// each member has moved from its own starting price.
function fundPrice(asset, t) {
  let ratio = 0;
  for (const m of asset.members) ratio += m.w * (priceAt(m.asset, t) / m.asset.base);
  return asset.base * ratio;
}

export function priceAt(asset, t) {
  const raw = asset.kind === 'fund' ? fundPrice(asset, t) : rawPrice(asset, t);
  return raw * (1 + flowImpact(asset));
}

export function priceNow(asset) { return priceAt(asset, nowTick()); }

export function changePct(asset, lookback = 400) {
  const t = nowTick();
  const then = priceAt(asset, t - lookback);
  return then > 0 ? (priceAt(asset, t) - then) / then * 100 : 0;
}

export function history(asset, points = 120, step = 4) {
  const t = nowTick();
  const out = new Array(points);
  for (let i = 0; i < points; i++) out[i] = priceAt(asset, t - (points - 1 - i) * step);
  return out;
}

// Index of the whole market, for the header.
export function marketIndex(t) {
  return 1000 * Math.exp(marketFactor(t) * 1.6);
}
