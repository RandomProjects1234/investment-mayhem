// Rival traders.
//
// A quiet server used to mean an empty leaderboard. These eight are simulated
// investors who trade the same market you do, each with a fixed personality.
//
// They need no server and no storage: a rival's decision at any point is a pure
// function of the prices it could see at that moment, and prices are themselves
// a pure function of the tick. So every browser replays the identical rivals and
// agrees on their net worth to the cent, exactly like the market itself.
import { hashF } from './rng.js?v=2.1';
import { nowTick, priceAt, marketIndex, policyRate } from './market.js?v=2.1';

// Rivals rebalance every four hours, not every few minutes. That matters: a
// strategy that re-picked the single best or worst mover every six minutes was
// harvesting this market's short-term mean reversion and compounding to
// billions of percent within a day. Real money moves slower, in baskets.
export const STEP = 4800;           // four hours between rebalances
export const HISTORY = 42;          // replay at most a week of them
export const BASKET = 5;            // and hold this many names at a time
export const START_CASH = 100000;
export const EPOCH = Math.floor(Date.UTC(2026, 8, 4) / 3000);   // rivals began here

// Each rival picks one asset to hold for the next window. What differs is how
// they choose, which is the whole personality.
// `risk` is how much of the book actually rides on the pick. Nobody here is
// all-in: without that, a strategy that always buys the biggest faller farms
// this market's mean reversion and compounds to nonsense within a day.
export const RIVALS = [
  { id: 'r1', name: 'IndexAnt',   blurb: 'Buys the broad fund and refuses to touch it', style: 'index', risk: 0.95 },
  { id: 'r2', name: 'MomentumMo', blurb: 'Chases whatever ran hardest last window', style: 'momentum', risk: 0.45 },
  { id: 'r3', name: 'DipDiana',   blurb: 'Buys whatever fell hardest instead', style: 'dip', risk: 0.45 },
  { id: 'r4', name: 'CoinCarl',   blurb: 'Crypto only, and never in moderation', style: 'crypto', risk: 0.7 },
  { id: 'r5', name: 'BondBarb',   blurb: 'Long bonds, and quietly smug when rates fall', style: 'bond', risk: 0.9 },
  { id: 'r6', name: 'BigCapBen',  blurb: 'Only the largest companies, nothing clever', style: 'mega', risk: 0.8 },
  { id: 'r7', name: 'RiskRhea',   blurb: 'Rotates through the wildest thing she can find', style: 'wild', risk: 0.55 },
  { id: 'r8', name: 'CashCliff',  blurb: 'Mostly sits in savings and waits for a crash', style: 'cash', risk: 0.15 },
];

// Filled in by game.js once the universe exists, so this module stays free of
// circular imports.
let POOL = null;
export function setUniverse({ stocks, funds, alts, bonds }) {
  const byTicker = t => stocks.find(s => s.ticker === t);
  POOL = {
    index: [funds.find(f => f.ticker === 'SPY') || funds[0]],
    mega: stocks.filter(s => s.cap === 'mega').slice(0, 24),
    crypto: alts.filter(a => a.class === 'crypto'),
    bonds: bonds.filter(b => b.duration > 5),
    broad: stocks.filter(s => s.cap === 'mega' || s.cap === 'large').slice(0, 60),
    wild: alts.filter(a => a.class === 'crypto').concat(stocks.filter(s => s.vol > 0.45).slice(0, 20)),
    byTicker,
  };
}

const ret = (asset, from, to) => {
  const a = priceAt(asset, from);
  return a > 0 ? priceAt(asset, to) / a : 1;
};

// What a rival holds for the four hours starting at `tick`: an equally weighted
// basket, not a single all-in bet.
function basket(rival, tick) {
  if (!POOL) return [];
  const prev = tick - STEP;
  const rank = (list, best) => [...list]
    .map(a => ({ a, r: ret(a, prev, tick) }))
    .sort((x, y) => best ? y.r - x.r : x.r - y.r)
    .slice(0, BASKET)
    .map(x => x.a);
  const spin = (list, salt, n) => {
    const out = [];
    for (let i = 0; i < n && list.length; i++) {
      out.push(list[Math.floor(hashF(salt + i * 7919, tick) * list.length) % list.length]);
    }
    return out;
  };

  switch (rival.style) {
    case 'index':    return POOL.index;
    case 'crypto':   return spin(POOL.crypto, 0xc0, 3);
    case 'bond':     return spin(POOL.bonds, 0xb0, 2);
    case 'mega':     return spin(POOL.mega, 0x11, BASKET);
    case 'wild':     return spin(POOL.wild, 0x77, 4);
    case 'momentum': return rank(POOL.broad, true);
    case 'dip':      return rank(POOL.broad, false);
    case 'cash':
    default:         return POOL.index;      // CashCliff keeps a toe in
  }
}

// Replay a rival from the epoch to now. Cached per rival per window, so the
// leaderboard costs a few hundred price lookups a minute, not a few hundred
// thousand.
const cache = new Map();

export function equityOf(rival, t = nowTick()) {
  if (!POOL) return START_CASH;
  const window = Math.floor((t - EPOCH) / STEP);
  const key = rival.id + '|' + window;
  const hit = cache.get(key);
  if (hit !== undefined) return hit * liveLeg(rival, t, window);

  const first = Math.max(0, window - HISTORY);
  let equity = START_CASH;
  for (let w = first; w < window; w++) {
    const from = EPOCH + w * STEP;
    const to = from + STEP;
    equity *= windowReturn(rival, from, to);
    if (!isFinite(equity) || equity < 1) { equity = Math.max(1, START_CASH * 0.01); break; }
  }
  if (cache.size > 4000) cache.clear();
  cache.set(key, equity);
  return equity * liveLeg(rival, t, window);
}

// One window of a rival's performance: part of the book rides on the pick, the
// rest earns the savings rate, and a single window is capped so no personality
// can compound its way to the moon.
function windowReturn(rival, from, to) {
  const cash = 1 + (policyRate(from) / 100) * ((to - from) / 20 / 52);
  const held = basket(rival, from);
  if (!held.length) return cash;
  let sum = 0;
  for (const a of held) sum += ret(a, from, to);
  const raw = Math.min(2.2, Math.max(0.45, sum / held.length));
  const w = rival.risk;
  return (raw * w + cash * (1 - w)) * 0.999;   // commission on the rebalance
}

// The part of the current, unfinished window.
function liveLeg(rival, t, window) {
  const from = EPOCH + window * STEP;
  if (t <= from) return 1;
  return windowReturn(rival, from, t);
}

export function board(t = nowTick()) {
  return RIVALS.map(r => {
    const equity = equityOf(r, t);
    const held = basket(r, EPOCH + Math.floor((t - EPOCH) / STEP) * STEP);
    return {
      uid: 'bot:' + r.id,
      bot: true,
      name: r.name,
      blurb: r.blurb,
      holding: held.length ? held.map(a => a.ticker).join(', ') : 'savings',
      netWorth: equity,
      ret: (equity - START_CASH) / START_CASH * 100,
      ts: Date.now(),
    };
  }).sort((a, b) => b.ret - a.ret);
}
