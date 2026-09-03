// Deterministic market simulation.
//
// price(asset, tick) is a PURE function of the asset's seed and the tick index,
// plus one shared multiplayer term (net player flow, read from Firebase).
// Because the tick index comes from wall-clock time, every browser in the world
// draws the same chart without any server doing the simulating.
import { fbm, hashF, vnoise, clamp } from './rng.js?v=1.8';

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

// ---- earnings ----------------------------------------------------------
// Unlike the random shocks below, earnings are on a schedule you can see coming.
// Each company reports every EARN_PERIOD ticks, offset by its own seed, and the
// result is a hash of the quarter number: fixed in advance, revealed on the day.
export const EARN_PERIOD = 900;          // ticks between reports, about 45 min

export const earnOffset = asset => Math.abs(asset.seed % EARN_PERIOD);

export function earningsQuarter(asset, t) {
  return Math.floor((t - earnOffset(asset)) / EARN_PERIOD);
}

export function nextEarningsTick(asset, t) {
  return (earningsQuarter(asset, t) + 1) * EARN_PERIOD + earnOffset(asset);
}

// How far the last few reports moved the price, decaying away.
export function earningsSurprise(asset, q) {
  return (hashF(asset.seed ^ 0xEA71, q) - 0.47) * 2;   // roughly -1..1
}

function earningsEffect(asset, t) {
  const q0 = earningsQuarter(asset, t);
  let sum = 0;
  for (let i = 0; i < 3; i++) {
    const q = q0 - i;
    if (q < 0) continue;
    const et = q * EARN_PERIOD + earnOffset(asset);
    if (et > t) continue;
    const age = t - et;
    sum += earningsSurprise(asset, q) * asset.vol * 0.9 *
      Math.exp(-age / 220) * (1 - Math.exp(-age / 3));
  }
  return sum;
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
      + eventEffect(asset.seed ^ 0x99, t, 0.045, 0.30)
      + earningsEffect(asset, t);
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

// ---- tenancy -----------------------------------------------------------
// Buildings sit empty sometimes. Deterministic like everything else, and in
// blocks rather than flickering, so a vacancy is something you notice.
export function occupancyAt(prop, t) {
  return vnoise((prop.seed ^ 0x7c1a) | 0, t / 240) < 0.13 ? 0 : 1;
}

export const isVacant = (prop, t) => occupancyAt(prop, t) === 0;

// Share of a window the place was actually let, sampled across the period.
export function occupiedFraction(prop, fromTick, toTick) {
  const span = Math.max(1, toTick - fromTick);
  const samples = Math.min(12, Math.max(2, Math.round(span / 40)));
  let occupied = 0;
  for (let i = 0; i < samples; i++) {
    occupied += occupancyAt(prop, fromTick + (span * (i + 0.5)) / samples);
  }
  return occupied / samples;
}

// ---- options -----------------------------------------------------------
// Contracts expire on a shared 30 minute cycle, and because the price at any
// tick is known exactly, an expired contract settles at the true price of its
// expiry tick whether or not anyone was watching.
export const EXPIRY_CYCLE = 600;                 // ticks between expiries
export const TICKS_PER_INCOME_YEAR = 1040;       // the clock dividends use

export function nextExpiries(t, n = 2) {
  const first = Math.ceil((t + 30) / EXPIRY_CYCLE) * EXPIRY_CYCLE;
  return Array.from({ length: n }, (_, i) => first + i * EXPIRY_CYCLE);
}

// Realised volatility of the recent tape, annualised on the income clock.
const volCache = new Map();
export function realisedVol(asset, t) {
  const bucket = Math.floor(t / 60);
  const key = asset.id + '|' + bucket;
  const hit = volCache.get(key);
  if (hit !== undefined) return hit;
  let sum = 0, sum2 = 0;
  const n = 60, step = 4;
  for (let i = 0; i < n; i++) {
    const a = priceAt(asset, t - (i + 1) * step);
    const b = priceAt(asset, t - i * step);
    const r = Math.log(b / a);
    sum += r; sum2 += r * r;
  }
  const mean = sum / n;
  const varPerStep = Math.max(1e-12, sum2 / n - mean * mean);
  const v = Math.sqrt(varPerStep / step * TICKS_PER_INCOME_YEAR);
  const out = Math.min(6, Math.max(0.05, v));
  if (volCache.size > 4000) volCache.clear();
  volCache.set(key, out);
  return out;
}

// erf via Abramowitz and Stegun 7.1.26, then the normal CDF from it.
function erf(z) {
  const sign = z < 0 ? -1 : 1;
  z = Math.abs(z);
  const a = [0.254829592, -0.284496736, 1.421413741, -1.453152027, 1.061405429];
  const t = 1 / (1 + 0.3275911 * z);
  let poly = 0, term = t;
  for (let i = 0; i < a.length; i++) { poly += a[i] * term; term *= t; }
  return sign * (1 - poly * Math.exp(-z * z));
}

function normCdf(x) { return 0.5 * (1 + erf(x / Math.SQRT2)); }

// Black-Scholes, with the game's own policy rate as the risk free rate.
export function optionPrice(kind, S, K, years, sigma, r) {
  if (years <= 0) return Math.max(0, kind === 'call' ? S - K : K - S);
  const sqrtT = Math.sqrt(years);
  const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * years) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const disc = Math.exp(-r * years);
  return kind === 'call'
    ? S * normCdf(d1) - K * disc * normCdf(d2)
    : K * disc * normCdf(-d2) - S * normCdf(-d1);
}

export function quoteOption(asset, kind, strike, expiryTick, t) {
  const S = priceAt(asset, t);
  const years = Math.max(0, (expiryTick - t) / TICKS_PER_INCOME_YEAR);
  const sigma = realisedVol(asset, t);
  const r = policyRate(t) / 100;
  return Math.max(0.01, optionPrice(kind, S, strike, years, sigma, r));
}

// A tidy ladder of strikes around the money.
const NICE_STEPS = [0.0001, 0.001, 0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 25, 50, 100, 250, 500];

export function strikeLadder(asset, t) {
  const S = priceAt(asset, t);
  const want = S * 0.04;                       // strikes about 4% apart
  let step = NICE_STEPS[NICE_STEPS.length - 1];
  for (const c of NICE_STEPS) if (c >= want) { step = c; break; }
  const atm = Math.round(S / step) * step;
  const dp = step < 1 ? 4 : 2;
  return [-2, -1, 0, 1, 2]
    .map(i => +(atm + i * step).toFixed(dp))
    .filter(k => k > 0);
}

// Index of the whole market, for the header.
export function marketIndex(t) {
  return 1000 * Math.exp(marketFactor(t) * 1.6);
}
