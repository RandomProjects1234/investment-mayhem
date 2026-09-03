// Game state, rules and the main loop.
import { generateCompanies, generateFunds, generateProperties, generateAlts,
         generateBonds, generateCollectibles, generateCountries, generateStartups, startupOutcome,
         STARTUP_ROUND_TICKS, COLLECT_SPREAD, SECTORS } from './data.js?v=1.8';
import { priceAt, priceNow, nowTick, TICK_MS, policyRate, setFlow,
         quoteOption, nextExpiries, strikeLadder, realisedVol,
         isVacant, occupiedFraction } from './market.js?v=1.8';
import * as Net from './net.js?v=1.8';

export const FEE = 0.002;            // 0.2% trading commission
export const PROP_CLOSING = 0.03;    // 3% closing cost on property purchase
export const MORTGAGE_MAX = 0.7;     // you can finance up to 70% of a building
export const MORTGAGE_SPREAD = 1.5;  // mortgage rate = policy rate + this
export const RENO_COST = 0.12;       // a renovation costs 12% of the value
export const RENO_GAIN = 0.18;       // and lifts the rent by 18%
export const RENO_MAX = 3;
export const START_CASH = 100000;
export const MAX_OFFLINE_MIN = 240;  // income accrues for at most 4 hours away
export const SHORT_FEE = 8;          // % a year to borrow the units you short
export const SHORT_INITIAL = 0.5;    // equity needed to open, as a share of the short
export const SHORT_MAINT = 0.25;     // below this the position is bought in for you
export const LOAN_SPREAD = 3.5;      // margin loan rate = policy rate + this
export const LOAN_LTV = 0.5;         // you can borrow half your collateral
export const LOAN_CALL = 0.7;        // above this share of collateral you get called
export const MAX_ORDERS = 20;
export const SEASON_MS = 7 * 24 * 3600 * 1000;                 // a season is a week
export const SEASON_EPOCH = Date.UTC(2026, 8, 3);              // season 0 starts here
export const seasonIndex = () => Math.max(0, Math.floor((Date.now() - SEASON_EPOCH) / SEASON_MS));
export const seasonEndsAt = () => SEASON_EPOCH + (seasonIndex() + 1) * SEASON_MS;
const ORDER_LOOKBACK = 3000;         // ticks of history an order can fill against

// ---- universe (generated once) ----------------------------------------
export const STOCKS = generateCompanies();
export const FUNDS = generateFunds(STOCKS);
export const COMPANIES = [...STOCKS, ...FUNDS];   // everything on the Stocks tab
export const PROPERTIES = generateProperties(260);
export const ALTS = generateAlts();
export const BONDS = generateBonds();
export const COLLECTIBLES = generateCollectibles();
export const COUNTRIES = generateCountries();
export const ASSETS = new Map();
for (const a of [...COMPANIES, ...PROPERTIES, ...ALTS, ...BONDS, ...COLLECTIBLES, ...COUNTRIES]) ASSETS.set(a.id, a);
Net.registerKeys([...ASSETS.keys()]);

export const startupRound = () => Math.floor(nowTick() / STARTUP_ROUND_TICKS);
export function currentStartups() { return generateStartups(startupRound()); }
export const rateNow = () => policyRate(nowTick());

// ---- player state ------------------------------------------------------
function blankState() {
  return {
    name: null, cash: START_CASH, created: Date.now(),
    holdings: {},   // stocks and funds -> { shares, cost }
    alts: {},       // crypto and commodities -> { units, cost }
    bonds: {},      // bonds -> { units, cost }
    collect: {},    // collectibles -> { units, cost }
    countries: {},  // country stakes -> { units, cost }
    props: {},      // property id -> { price, bought, lastCollect }
    startups: {},   // startup id -> { name, amount, risk, matureTick, resolved, payout }
    savings: { balance: 0, last: Date.now() },
    shorts: {},     // assetId -> { units, proceeds, opened }
    orders: [],     // resting limit and stop orders
    loan: { principal: 0, last: Date.now() },
    options: {},    // contract id -> { assetId, kind, strike, expiryTick, qty, cost }
    trades: [],     // closed trades, newest first, for the analytics card
    orderTick: 0,   // last tick the order book was checked against
    startNetWorth: START_CASH, startIndex: 0,
    // Seasons rank you on what you made this week, not on who started first.
    season: { index: seasonIndex(), startNetWorth: START_CASH, startedAt: Date.now() },
    stats: { trades: 0, realized: 0, rentCollected: 0, dividends: 0, coupons: 0, interest: 0, sovereign: 0 },
    watch: {}, nwHistory: [],
    netWorth: START_CASH, lastDividend: Date.now(),
    log: [], savedAt: 0,
  };
}

export const state = blankState();

// Which book holds an asset, and what its quantity field is called.
export function bookOf(asset) {
  switch (asset && asset.kind) {
    case 'alt':     return { book: state.alts, key: 'units' };
    case 'bond':    return { book: state.bonds, key: 'units' };
    case 'collect': return { book: state.collect, key: 'units' };
    case 'country': return { book: state.countries, key: 'units' };
    case 'stock':
    case 'fund':    return { book: state.holdings, key: 'shares' };
    default:        return { book: null, key: 'units' };
  }
}

// You sell collectibles below the quoted value: they are illiquid.
export const spreadOf = asset => asset && asset.kind === 'collect' ? COLLECT_SPREAD : 0;
export const isFractional = asset => asset && (asset.kind === 'alt' || asset.kind === 'country');

export function toggleWatch(id) {
  if (state.watch[id]) delete state.watch[id]; else state.watch[id] = true;
  saveLocal();
  return !!state.watch[id];
}
export const isWatched = id => !!state.watch[id];

// ---- persistence -------------------------------------------------------
const LS_KEY = () => 'is_save_' + (Net.Net.uid || 'solo');

export function loadLocal() {
  try {
    const raw = localStorage.getItem(LS_KEY());
    if (raw) Object.assign(state, JSON.parse(raw));
  } catch (e) { /* a corrupt save should never block the game */ }
  migrate();
}

export function saveLocal() {
  try {
    state.savedAt = Date.now();
    localStorage.setItem(LS_KEY(), JSON.stringify(state));
  } catch (e) { /* quota or private mode: keep playing */ }
}

// Fills in anything a save from an older build is missing, and refunds
// positions whose asset no longer exists so value can never vanish silently.
export function migrate() {
  const blank = blankState();
  for (const k of ['holdings', 'alts', 'bonds', 'collect', 'countries', 'props', 'startups', 'watch', 'shorts', 'options']) {
    if (!state[k] || typeof state[k] !== 'object') state[k] = {};
  }
  if (!Array.isArray(state.nwHistory)) state.nwHistory = [];
  if (!Array.isArray(state.orders)) state.orders = [];
  if (!Array.isArray(state.trades)) state.trades = [];
  if (!state.loan || typeof state.loan.principal !== 'number') state.loan = { principal: 0, last: Date.now() };
  if (!state.startNetWorth) state.startNetWorth = state.netWorth || START_CASH;
  if (!state.season || typeof state.season.startNetWorth !== 'number') {
    state.season = { index: seasonIndex(), startNetWorth: state.netWorth || START_CASH, startedAt: Date.now() };
  }
  if (!Array.isArray(state.log)) state.log = [];
  if (!state.savings || typeof state.savings.balance !== 'number') state.savings = { balance: 0, last: Date.now() };
  state.stats = Object.assign(blank.stats, state.stats || {});
  if (typeof state.cash !== 'number' || !isFinite(state.cash)) state.cash = START_CASH;
  if (!state.lastDividend) state.lastDividend = Date.now();

  let refunded = 0;
  for (const bookName of ['holdings', 'alts', 'bonds', 'collect', 'countries']) {
    for (const id of Object.keys(state[bookName])) {
      if (ASSETS.has(id)) continue;
      refunded += state[bookName][id].cost || 0;
      delete state[bookName][id];
    }
  }
  for (const id of Object.keys(state.props)) {
    if (ASSETS.has(id)) continue;
    refunded += state.props[id].price || 0;
    delete state.props[id];
  }
  if (refunded > 0) {
    state.cash += refunded;
    log('Refunded ' + fmt(refunded) + ' for assets removed in an update', true);
  }
}

// Going online for the first time: your solo game comes with you rather than
// being silently replaced by a fresh $100,000.
export function importSoloSave() {
  try {
    const raw = localStorage.getItem('is_save_solo');
    if (!raw) return false;
    const solo = JSON.parse(raw);
    if (!solo || typeof solo.cash !== 'number') return false;
    const name = state.name;
    Object.assign(state, solo);
    state.name = name || solo.name;
    migrate();
    log('Brought your solo progress online', true);
    saveLocal();
    return true;
  } catch (e) { return false; }
}

export function adopt(remote) {
  if (!remote) return;
  // The cloud save wins only if it is actually newer than what is on this
  // device, so a refresh can never roll you back to an older snapshot.
  const localAt = state.savedAt || 0;
  const remoteAt = remote.updated || 0;
  if (localAt > remoteAt + 2000 && state.name) { migrate(); return; }
  state.name = remote.name || state.name;
  state.cash = typeof remote.cash === 'number' ? remote.cash : state.cash;
  state.created = remote.created || state.created;
  state.holdings = remote.holdings || {};
  state.alts = remote.alts || {};
  state.bonds = remote.bonds || {};
  state.collect = remote.collect || {};
  state.countries = remote.countries || {};
  state.shorts = remote.shorts || {};
  state.options = remote.options || {};
  state.orders = Array.isArray(remote.orders) ? remote.orders : [];
  state.loan = remote.loan || state.loan;
  state.trades = Array.isArray(remote.trades) ? remote.trades : state.trades;
  state.startNetWorth = remote.startNetWorth || state.startNetWorth;
  state.startIndex = remote.startIndex || state.startIndex;
  state.season = remote.season || state.season;
  state.props = remote.props || {};
  state.startups = remote.startups || {};
  state.savings = remote.savings || state.savings;
  state.watch = remote.watch || state.watch || {};
  state.stats = Object.assign(state.stats, remote.stats || {});
  state.lastDividend = remote.lastDividend || state.lastDividend;
  migrate();
}

// ---- valuation ---------------------------------------------------------
function bookValue(book) {
  let total = 0;
  for (const id in book) {
    const a = ASSETS.get(id); if (!a) continue;
    const q = book[id].shares != null ? book[id].shares : book[id].units;
    total += q * priceNow(a);
  }
  return total;
}

export function positionsValue() {
  let property = 0, angel = 0;
  for (const id in state.props) {
    const a = ASSETS.get(id); if (!a) continue;
    property += priceNow(a) - (state.props[id].debt || 0);   // your equity, not the building
  }
  for (const id in state.startups) {
    if (!state.startups[id].resolved) angel += state.startups[id].amount;
  }
  const stocks = bookValue(state.holdings);
  const alt = bookValue(state.alts);
  const bonds = bookValue(state.bonds);
  const collect = bookValue(state.collect) * (1 - COLLECT_SPREAD);  // valued at what you could get
  const countries = bookValue(state.countries);
  const options = optionsValue();
  const savings = state.savings.balance;
  const shortLiability = shortsValue();
  const debt = state.loan.principal || 0;
  const gross = stocks + property + alt + bonds + collect + countries + angel + savings + options;
  return { stocks, property, alt, bonds, collect, countries, angel, savings, options,
           shortLiability, debt, gross, total: gross - shortLiability - debt };
}

// ---- options -----------------------------------------------------------
// You can only buy contracts, never write them, so the most you can lose is the
// premium. Settlement uses the price at the expiry tick, which is knowable
// exactly, so a contract pays out correctly even if you were away when it went.
export const OPTION_FEE = 0.01;   // 1% of premium, options are expensive to trade

export function optionsValue() {
  const t = nowTick();
  let total = 0;
  for (const id in state.options) {
    const o = state.options[id];
    const a = ASSETS.get(o.assetId); if (!a) continue;
    total += o.qty * quoteOption(a, o.kind, o.strike, o.expiryTick, t);
  }
  return total;
}

// Live premium for one contract you hold.
export function optionQuote(id) {
  const o = state.options[id];
  if (!o) return 0;
  const a = ASSETS.get(o.assetId);
  return a ? quoteOption(a, o.kind, o.strike, o.expiryTick, nowTick()) : 0;
}

export function canOption(a) {
  return !!a && (a.kind === 'stock' || a.kind === 'fund');
}

export function optionChain(assetId) {
  const a = ASSETS.get(assetId);
  if (!canOption(a)) return [];
  const t = nowTick();
  const expiry = nextExpiries(t, 1)[0];
  return strikeLadder(a, t).map(strike => ({
    strike, expiry,
    minsLeft: Math.max(0, Math.round((expiry - t) * 3 / 60)),
    call: quoteOption(a, 'call', strike, expiry, t),
    put: quoteOption(a, 'put', strike, expiry, t),
  }));
}

export function buyOption(assetId, kind, strike, expiryTick, qty) {
  const a = ASSETS.get(assetId);
  if (!canOption(a)) return { ok: false, msg: 'No options on that asset.' };
  qty = Math.floor(qty);
  if (!(qty > 0)) return { ok: false, msg: 'Enter how many contracts.' };
  const t = nowTick();
  if (expiryTick <= t) return { ok: false, msg: 'That expiry has passed.' };
  const premium = quoteOption(a, kind, strike, expiryTick, t);
  const cost = premium * qty * (1 + OPTION_FEE);
  if (cost > state.cash) return { ok: false, msg: 'Not enough cash (need ' + fmt(cost) + ').' };
  state.cash -= cost;
  const id = 'x' + a.ticker + kind + strike + expiryTick;
  const pos = state.options[id] || { assetId, kind, strike, expiryTick, qty: 0, cost: 0 };
  pos.qty += qty; pos.cost += cost;
  state.options[id] = pos;
  state.stats.trades++;
  log('Bought ' + qty + ' ' + a.ticker + ' ' + fmtPx(strike) + ' ' + kind +
      ' for ' + fmt(cost), true);
  saveLocal();
  return { ok: true, msg: 'Bought ' + qty + ' ' + kind + ' at ' + fmtPx(strike) };
}

export function sellOption(id, qty) {
  const pos = state.options[id];
  if (!pos) return { ok: false, msg: 'You do not hold that contract.' };
  const a = ASSETS.get(pos.assetId);
  qty = Math.min(Math.floor(qty) || pos.qty, pos.qty);
  const t = nowTick();
  const premium = quoteOption(a, pos.kind, pos.strike, pos.expiryTick, t);
  const gross = premium * qty * (1 - OPTION_FEE);
  const basis = pos.cost * (qty / pos.qty);
  pos.cost -= basis; pos.qty -= qty;
  if (pos.qty <= 0) delete state.options[id];
  state.cash += gross;
  state.stats.realized += gross - basis;
  recordTrade(a.ticker + ' ' + pos.kind, gross - basis, 'option');
  log('Sold ' + qty + ' ' + a.ticker + ' ' + pos.kind + ' for ' + fmt(gross), gross >= basis);
  saveLocal();
  return { ok: true, msg: 'Sold for ' + fmt(gross) };
}

function settleOptions() {
  const t = nowTick();
  for (const id of Object.keys(state.options)) {
    const o = state.options[id];
    if (o.expiryTick > t) continue;
    const a = ASSETS.get(o.assetId);
    if (!a) { delete state.options[id]; continue; }
    const settle = priceAt(a, o.expiryTick);
    const intrinsic = o.kind === 'call' ? Math.max(0, settle - o.strike) : Math.max(0, o.strike - settle);
    const payout = intrinsic * o.qty;
    state.cash += payout;
    state.stats.realized += payout - o.cost;
    recordTrade(a.ticker + ' ' + o.kind, payout - o.cost, 'option');
    log(o.qty + ' ' + a.ticker + ' ' + fmtPx(o.strike) + ' ' + o.kind +
        (payout > 0 ? ' expired in the money for ' + fmt(payout) : ' expired worthless'), payout > o.cost);
    delete state.options[id];
  }
}

// What it would cost right now to buy back everything you are short.
export function shortsValue() {
  let total = 0;
  for (const id in state.shorts) {
    const a = ASSETS.get(id); if (!a) continue;
    total += state.shorts[id].units * priceNow(a);
  }
  return total;
}

// Everything a lender would count as collateral: cash plus long positions.
export function collateral() {
  const v = positionsValue();
  return state.cash + v.gross;
}
export const maxLoan = () => Math.max(0, collateral() * LOAN_LTV);
export const loanRate = () => rateNow() + LOAN_SPREAD;

export function netWorth() {
  // Rounding can leave cash at -1e-12 after a trade. The security rules require
  // cash >= 0, so that tiny negative would make every cloud save fail silently.
  if (state.cash < 0 && state.cash > -0.01) state.cash = 0;
  state.netWorth = state.cash + positionsValue().total;
  return state.netWorth;
}

export function pendingRent() {
  const now = Date.now(), t = nowTick();
  let total = 0;
  for (const id in state.props) {
    const a = ASSETS.get(id); if (!a) continue;
    const p = state.props[id];
    const minutes = Math.min(MAX_OFFLINE_MIN, Math.max(0, (now - (p.lastCollect || now)) / 60000));
    const fromTick = t - Math.round(minutes * 20);
    const occ = occupiedFraction(a, fromTick, t);
    total += priceNow(a) * a.rentRate * renoMultiplier(p) * (1 - a.upkeep) * minutes * occ;
  }
  return total;
}

// ---- actions -----------------------------------------------------------
function log(text, good) {
  state.log.unshift({ text, good, ts: Date.now() });
  if (state.log.length > 60) state.log.length = 60;
}
export const getLog = () => state.log;

function recordTrade(sym, pl, kind) {
  state.trades.unshift({ sym, pl: Math.round(pl * 100) / 100, kind, ts: Date.now() });
  if (state.trades.length > 60) state.trades.length = 60;
}

export function buy(assetId, units) {
  const a = ASSETS.get(assetId);
  if (!a || !(units > 0) || !isFinite(units)) return { ok: false, msg: 'Invalid order.' };
  const { book, key } = bookOf(a);
  if (!book) return { ok: false, msg: 'That is not a tradable asset.' };
  if (!isFractional(a)) units = Math.floor(units);
  if (!(units > 0)) return { ok: false, msg: 'That is less than one unit of ' + a.ticker + '.' };
  const px = priceNow(a);
  const cost = px * units * (1 + FEE);
  if (cost > state.cash) return { ok: false, msg: 'Not enough cash (need ' + fmt(cost) + ').' };
  state.cash -= cost;
  const pos = book[assetId] || { [key]: 0, cost: 0 };
  pos[key] += units; pos.cost += cost;
  book[assetId] = pos;
  state.stats.trades++;
  Net.bumpFlow(assetId, units);
  Net.postFeed({ act: 'buy', sym: a.ticker, units, px: +px.toFixed(4), name: state.name });
  log('Bought ' + fmtUnits(units) + ' ' + a.ticker + ' @ ' + fmt(px), true);
  saveLocal();
  return { ok: true, msg: 'Bought ' + fmtUnits(units) + ' ' + a.ticker + ' for ' + fmt(cost) };
}

// Buy a dollar amount rather than a unit count.
export function buyValue(assetId, dollars) {
  const a = ASSETS.get(assetId);
  if (!a || !(dollars > 0)) return { ok: false, msg: 'Enter an amount.' };
  const px = priceNow(a) * (1 + FEE);
  const raw = dollars / px;
  return buy(assetId, isFractional(a) ? raw : Math.floor(raw));
}

export function sell(assetId, units) {
  const a = ASSETS.get(assetId);
  const { book, key } = bookOf(a);
  const pos = book && book[assetId];
  if (!a || !pos || !(units > 0)) return { ok: false, msg: 'You do not own that many.' };
  if (!isFractional(a)) units = Math.floor(units);
  if (units > pos[key] + 1e-9) units = pos[key];
  if (!(units > 0)) return { ok: false, msg: 'You do not own that many.' };
  const px = priceNow(a) * (1 - spreadOf(a));
  const gross = px * units * (1 - FEE);
  const basis = pos.cost * (units / pos[key]);
  pos.cost -= basis; pos[key] -= units;
  if (pos[key] <= 1e-9) delete book[assetId];
  state.cash += gross;
  state.stats.trades++;
  state.stats.realized += gross - basis;
  recordTrade(a.ticker, gross - basis, 'sell');
  Net.bumpFlow(assetId, -units);
  Net.postFeed({ act: 'sell', sym: a.ticker, units, px: +px.toFixed(4), name: state.name });
  log('Sold ' + fmtUnits(units) + ' ' + a.ticker + ' @ ' + fmt(px) +
      ' (' + (gross - basis >= 0 ? '+' : '') + fmt(gross - basis) + ')', gross - basis >= 0);
  saveLocal();
  return { ok: true, msg: 'Sold for ' + fmt(gross) };
}

export function buyProperty(id, financeShare = 0) {
  const a = ASSETS.get(id);
  if (!a || a.kind !== 'property') return { ok: false, msg: 'Unknown property.' };
  if (state.props[id]) return { ok: false, msg: 'You already own it.' };
  const px = priceNow(a);
  const finance = Math.max(0, Math.min(MORTGAGE_MAX, financeShare));
  const debt = px * finance;
  const cost = px * (1 + PROP_CLOSING) - debt;
  if (cost > state.cash) {
    return { ok: false, msg: 'Not enough cash (need ' + fmt(cost) +
      (finance > 0 ? ' as a deposit).' : ').') };
  }
  state.cash -= cost;
  state.props[id] = {
    price: px, bought: Date.now(), lastCollect: Date.now(),
    debt, reno: 0, mortLast: Date.now(),
  };
  Net.bumpFlow(id, 1);
  Net.postFeed({ act: 'buy', sym: 'PROPERTY', units: 1, px: +px.toFixed(0), name: state.name, extra: a.name });
  log('Bought ' + a.name + ' for ' + fmt(cost) +
      (debt > 0 ? ' with a ' + fmt(debt) + ' mortgage at ' + mortgageRate().toFixed(2) + '%' : ''), true);
  saveLocal();
  return { ok: true, msg: 'Purchased ' + a.name + (debt > 0 ? ' with a mortgage' : '') };
}

export function sellProperty(id) {
  const a = ASSETS.get(id), p = state.props[id];
  if (!a || !p) return { ok: false, msg: 'You do not own that.' };
  collectRent(id);
  accrueMortgages();
  const px = priceNow(a) * (1 - 0.02);
  const debt = p.debt || 0;
  state.cash += px - debt;
  state.stats.realized += (px - debt) - (p.price - (p.origDebt || debt));
  if (debt > 0) log('Cleared the ' + fmt(debt) + ' mortgage on sale', true);
  delete state.props[id];
  Net.bumpFlow(id, -1);
  log('Sold ' + a.name + ' for ' + fmt(px), px >= p.price);
  saveLocal();
  return { ok: true, msg: 'Sold ' + a.name + ' for ' + fmt(px) };
}

export function collectRent(only) {
  const now = Date.now(), t = nowTick();
  let total = 0;
  for (const id in state.props) {
    if (only && id !== only) continue;
    const a = ASSETS.get(id); if (!a) continue;
    const p = state.props[id];
    const minutes = Math.min(MAX_OFFLINE_MIN, Math.max(0, (now - (p.lastCollect || now)) / 60000));
    const occ = occupiedFraction(a, t - Math.round(minutes * 20), t);
    total += priceNow(a) * a.rentRate * renoMultiplier(p) * (1 - a.upkeep) * minutes * occ;
    p.lastCollect = now;
  }
  if (total > 0) {
    state.cash += total;
    state.stats.rentCollected += total;
    log('Collected ' + fmt(total) + ' in rent', true);
    saveLocal();
  }
  return total;
}

// ---- seasons -----------------------------------------------------------
// Every week the ranking starts over. Nobody loses their portfolio: the board
// measures what you made since the season began, so a player who joins on day
// six is competing on the same terms as everyone else.
export function seasonReturn() {
  const base = state.season.startNetWorth || START_CASH;
  return base > 0 ? (state.netWorth - base) / base * 100 : 0;
}

function rollSeason() {
  const now = seasonIndex();
  if (state.season.index === now) return;
  const finished = state.season.index;
  const ret = seasonReturn();
  state.season = { index: now, startNetWorth: state.netWorth, startedAt: Date.now() };
  log('Season ' + (finished + 1) + ' closed: you finished ' + fmtPct(ret) +
      '. Season ' + (now + 1) + ' starts now, from where you stand.', ret >= 0);
  saveLocal();
}

// ---- resting orders ----------------------------------------------------
// Because price is a pure function of the tick, an order does not need a server
// or a live tab: when the game next runs it replays every tick since the order
// was last checked and fills at the exact tick the price crossed.
function orderTriggers(o, px) {
  if (o.side === 'buy') return o.type === 'limit' ? px <= o.price : px >= o.price;
  return o.type === 'limit' ? px >= o.price : px <= o.price;
}

export function placeOrder({ assetId, side, type, price, units }) {
  const a = ASSETS.get(assetId);
  if (!a) return { ok: false, msg: 'Unknown asset.' };
  if (!bookOf(a).book) return { ok: false, msg: 'That asset cannot be traded on an order.' };
  if (!(price > 0)) return { ok: false, msg: 'Enter a trigger price.' };
  if (!(units > 0)) return { ok: false, msg: 'Enter a quantity.' };
  if (!isFractional(a)) units = Math.floor(units);
  if (!(units > 0)) return { ok: false, msg: 'That is less than one unit.' };
  if (state.orders.filter(o => o.status === 'open').length >= MAX_ORDERS) {
    return { ok: false, msg: 'You already have ' + MAX_ORDERS + ' orders working.' };
  }
  const px = priceNow(a);
  if (side === 'buy' && type === 'limit' && price >= px) return { ok: false, msg: 'A buy limit has to sit below the current price.' };
  if (side === 'buy' && type === 'stop' && price <= px) return { ok: false, msg: 'A buy stop has to sit above the current price.' };
  if (side === 'sell' && type === 'limit' && price <= px) return { ok: false, msg: 'A sell limit has to sit above the current price.' };
  if (side === 'sell' && type === 'stop' && price >= px) return { ok: false, msg: 'A sell stop has to sit below the current price.' };

  let reserved = 0;
  if (side === 'buy') {
    // Hold the cash so a working order cannot be spent twice.
    reserved = price * units * (1 + FEE) * 1.02;
    if (reserved > state.cash) return { ok: false, msg: 'Not enough cash to reserve ' + fmt(reserved) + '.' };
    state.cash -= reserved;
  } else {
    const { book, key } = bookOf(a);
    const owned = book[assetId] ? book[assetId][key] : 0;
    if (units > owned + 1e-9) return { ok: false, msg: 'You only own ' + fmtUnits(owned) + '.' };
  }
  state.orders.unshift({
    id: 'o' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36),
    assetId, side, type, price, units, reserved,
    placed: Date.now(), placedTick: nowTick(), status: 'open',
  });
  log('Placed ' + side + ' ' + type + ' for ' + fmtUnits(units) + ' ' + a.ticker + ' at ' + fmtPx(price), true);
  saveLocal();
  return { ok: true, msg: side + ' ' + type + ' order working' };
}

export function cancelOrder(id) {
  const o = state.orders.find(x => x.id === id && x.status === 'open');
  if (!o) return { ok: false, msg: 'That order is not working.' };
  o.status = 'cancelled';
  if (o.reserved) { state.cash += o.reserved; o.reserved = 0; }
  const a = ASSETS.get(o.assetId);
  log('Cancelled ' + o.side + ' order on ' + (a ? a.ticker : o.assetId), false);
  saveLocal();
  return { ok: true, msg: 'Order cancelled' };
}

export const openOrders = () => state.orders.filter(o => o.status === 'open');

function fillOrder(o, tick, px) {
  const a = ASSETS.get(o.assetId);
  const { book, key } = bookOf(a);
  o.status = 'filled'; o.filledTick = tick; o.filledPrice = px; o.filled = Date.now();

  if (o.side === 'buy') {
    const cost = px * o.units * (1 + FEE);
    state.cash += o.reserved; o.reserved = 0;
    if (cost > state.cash) {
      o.status = 'cancelled';
      log('Order on ' + a.ticker + ' expired: not enough cash at the fill', false);
      return;
    }
    state.cash -= cost;
    const pos = book[o.assetId] || { [key]: 0, cost: 0 };
    pos[key] += o.units; pos.cost += cost;
    book[o.assetId] = pos;
    log(o.type + ' buy filled: ' + fmtUnits(o.units) + ' ' + a.ticker + ' at ' + fmtPx(px), true);
  } else {
    const pos = book[o.assetId];
    const units = Math.min(o.units, pos ? pos[key] : 0);
    if (!(units > 0)) {
      o.status = 'cancelled';
      log('Order on ' + a.ticker + ' expired: nothing left to sell', false);
      return;
    }
    const gross = px * units * (1 - FEE) * (1 - spreadOf(a));
    const basis = pos.cost * (units / pos[key]);
    pos.cost -= basis; pos[key] -= units;
    if (pos[key] <= 1e-9) delete book[o.assetId];
    state.cash += gross;
    state.stats.realized += gross - basis;
    recordTrade(a.ticker, gross - basis, 'sell');
    log(o.type + ' sell filled: ' + fmtUnits(units) + ' ' + a.ticker + ' at ' + fmtPx(px), gross >= basis);
  }
  state.stats.trades++;
  Net.bumpFlow(o.assetId, o.side === 'buy' ? o.units : -o.units);
}

function checkOrders() {
  const t = nowTick();
  const working = openOrders();
  if (!working.length) { state.orderTick = t; return; }
  const from = Math.max(state.orderTick || t - 1, t - ORDER_LOOKBACK);
  for (const o of working) {
    const a = ASSETS.get(o.assetId);
    if (!a) { o.status = 'cancelled'; continue; }
    for (let tick = from + 1; tick <= t; tick++) {
      const px = priceAt(a, tick);
      if (orderTriggers(o, px)) { fillOrder(o, tick, px); break; }
    }
  }
  state.orderTick = t;
}

// ---- short selling -----------------------------------------------------
export function canShort(a) {
  return !!a && (a.kind === 'stock' || a.kind === 'fund' || a.kind === 'alt' || a.kind === 'country');
}

export function openShort(assetId, units) {
  const a = ASSETS.get(assetId);
  if (!canShort(a)) return { ok: false, msg: 'You can only short stocks, funds, crypto and countries.' };
  if (!(units > 0)) return { ok: false, msg: 'Enter a quantity.' };
  if (!isFractional(a)) units = Math.floor(units);
  if (!(units > 0)) return { ok: false, msg: 'That is less than one unit.' };
  const px = priceNow(a);
  const notional = px * units;
  const equity = netWorth();
  if (notional * SHORT_INITIAL > equity) {
    return { ok: false, msg: 'You need ' + fmt(notional * SHORT_INITIAL) + ' of equity to short that much.' };
  }
  const proceeds = notional * (1 - FEE);
  state.cash += proceeds;
  const pos = state.shorts[assetId] || { units: 0, proceeds: 0, opened: Date.now() };
  pos.units += units; pos.proceeds += proceeds;
  state.shorts[assetId] = pos;
  state.stats.trades++;
  Net.bumpFlow(assetId, -units);
  Net.postFeed({ act: 'sell', sym: a.ticker, units, px: +px.toFixed(4), name: state.name });
  log('Shorted ' + fmtUnits(units) + ' ' + a.ticker + ' at ' + fmtPx(px), true);
  saveLocal();
  return { ok: true, msg: 'Shorted ' + fmtUnits(units) + ' ' + a.ticker + ' for ' + fmt(proceeds) };
}

export function coverShort(assetId, units, forced) {
  const a = ASSETS.get(assetId);
  const pos = state.shorts[assetId];
  if (!a || !pos) return { ok: false, msg: 'You are not short that.' };
  if (!(units > 0)) return { ok: false, msg: 'Enter a quantity.' };
  units = Math.min(units, pos.units);
  const px = priceNow(a);
  let cost = px * units * (1 + FEE);
  if (cost > state.cash) {
    if (!forced) return { ok: false, msg: 'Not enough cash to buy back (need ' + fmt(cost) + ').' };
    // A buy-in can only buy what the cash covers. The rest stays short and the
    // caller keeps liquidating.
    units = Math.min(units, state.cash / (px * (1 + FEE)));
    if (!isFractional(a)) units = Math.floor(units);
    if (!(units > 0)) return { ok: false, msg: 'No cash left to buy in with.' };
    cost = px * units * (1 + FEE);
  }
  const share = units / pos.units;
  const proceedsShare = pos.proceeds * share;
  state.cash -= cost;
  pos.units -= units; pos.proceeds -= proceedsShare;
  if (pos.units <= 1e-9) delete state.shorts[assetId];
  const pl = proceedsShare - cost;
  state.stats.realized += pl;
  state.stats.trades++;
  recordTrade(a.ticker, pl, 'short');
  Net.bumpFlow(assetId, units);
  log((forced ? 'Bought in ' : 'Covered ') + fmtUnits(units) + ' ' + a.ticker + ' at ' + fmtPx(px) +
      ' (' + (pl >= 0 ? '+' : '') + fmt(pl) + ')', pl >= 0);
  saveLocal();
  return { ok: true, msg: 'Covered for ' + fmt(cost) + ' (' + (pl >= 0 ? '+' : '') + fmt(pl) + ')' };
}

// ---- margin loan -------------------------------------------------------
export function borrow(amount) {
  if (!(amount > 0)) return { ok: false, msg: 'Enter an amount.' };
  accrueLoan();
  const room = maxLoan() - state.loan.principal;
  if (amount > room) return { ok: false, msg: 'You can borrow at most ' + fmt(Math.max(0, room)) + ' against what you hold.' };
  state.loan.principal += amount;
  state.cash += amount;
  log('Borrowed ' + fmt(amount) + ' on margin at ' + loanRate().toFixed(2) + '%', true);
  saveLocal();
  return { ok: true, msg: 'Borrowed ' + fmt(amount) };
}

export function repay(amount) {
  accrueLoan();
  if (!(amount > 0)) return { ok: false, msg: 'Enter an amount.' };
  amount = Math.min(amount, state.loan.principal, state.cash);
  if (!(amount > 0)) return { ok: false, msg: 'Nothing to repay, or no cash to repay it with.' };
  state.loan.principal -= amount;
  state.cash -= amount;
  log('Repaid ' + fmt(amount) + ' of margin debt', true);
  saveLocal();
  return { ok: true, msg: 'Repaid ' + fmt(amount) };
}

function accrueLoan() {
  const now = Date.now();
  const minutes = Math.min(MAX_OFFLINE_MIN, (now - (state.loan.last || now)) / 60000);
  state.loan.last = now;
  if (!(state.loan.principal > 0) || minutes <= 0) return;
  state.loan.principal += state.loan.principal * (loanRate() / 100) * (minutes / 52);
}

// Margin calls. Debt gets liquidated down; a runaway short gets bought in.
function marginCalls() {
  const col = collateral();
  if (col > 0 && state.loan.principal > col * LOAN_CALL) {
    log('Margin call: your debt outgrew your collateral', false);
    let guard = 40;
    while (state.loan.principal > collateral() * LOAN_LTV && guard-- > 0) {
      if (!liquidateLargest()) break;
      const pay = Math.min(state.cash, state.loan.principal);
      if (pay > 0) { state.loan.principal -= pay; state.cash -= pay; }
    }
  }
  const liability = shortsValue();
  if (liability > 0 && netWorth() < liability * SHORT_MAINT) {
    log('Margin call: your short position ran away', false);
    forceBuyIn();
  }
}

// Buying in a short you cannot afford: sell longs to raise the cash, then cover
// as much as the cash allows, and keep going until the position is closed or
// there is nothing left to sell.
function forceBuyIn() {
  for (const id of Object.keys(state.shorts)) {
    let guard = 40;
    while (state.shorts[id] && guard-- > 0) {
      const a = ASSETS.get(id);
      if (!a) { delete state.shorts[id]; break; }
      const pos = state.shorts[id];
      const needed = pos.units * priceNow(a) * (1 + FEE);
      if (needed <= state.cash) { coverShort(id, pos.units, true); break; }
      if (!liquidateLargest()) {
        // Nothing left to sell. Cover whatever the remaining cash buys.
        const res = coverShort(id, pos.units, true);
        if (!res.ok) {
          log('Could not fully buy in ' + a.ticker + ': you are out of cash and assets', false);
        }
        break;
      }
    }
  }
}

// Sell the biggest liquid position to raise cash during a margin call.
function liquidateLargest() {
  let best = null;
  for (const bookName of ['holdings', 'alts', 'bonds', 'countries', 'collect']) {
    for (const id in state[bookName]) {
      const a = ASSETS.get(id); if (!a) continue;
      const p = state[bookName][id];
      const q = p.shares != null ? p.shares : p.units;
      const val = q * priceNow(a);
      if (!best || val > best.val) best = { id, val, q };
    }
  }
  if (!best) return false;
  sell(best.id, best.q);
  return true;
}

// ---- mortgages and renovations -----------------------------------------
export function accrueMortgages() {
  const now = Date.now();
  const rate = mortgageRate();
  for (const id in state.props) {
    const p = state.props[id];
    if (!(p.debt > 0)) { p.mortLast = now; continue; }
    const minutes = Math.min(MAX_OFFLINE_MIN, (now - (p.mortLast || now)) / 60000);
    p.mortLast = now;
    if (minutes <= 0) continue;
    const interest = p.debt * (rate / 100) * (minutes / 52);
    p.debt += interest;
    state.stats.mortgageInterest = (state.stats.mortgageInterest || 0) + interest;
  }
}

export const totalMortgageDebt = () => {
  let d = 0;
  for (const id in state.props) d += state.props[id].debt || 0;
  return d;
};

export function payMortgage(id, amount) {
  const p = state.props[id];
  if (!p || !(p.debt > 0)) return { ok: false, msg: 'Nothing owed on that one.' };
  accrueMortgages();
  amount = Math.min(amount || p.debt, p.debt, state.cash);
  if (!(amount > 0)) return { ok: false, msg: 'No cash to pay it down with.' };
  p.debt -= amount; state.cash -= amount;
  const a = ASSETS.get(id);
  log('Paid ' + fmt(amount) + ' off the mortgage on ' + (a ? a.name : id), true);
  saveLocal();
  return { ok: true, msg: 'Paid down ' + fmt(amount) };
}

export function renovate(id) {
  const a = ASSETS.get(id), p = state.props[id];
  if (!a || !p) return { ok: false, msg: 'You do not own that.' };
  if ((p.reno || 0) >= RENO_MAX) return { ok: false, msg: 'That building is already fully renovated.' };
  const cost = priceNow(a) * RENO_COST;
  if (cost > state.cash) return { ok: false, msg: 'A renovation costs ' + fmt(cost) + '.' };
  state.cash -= cost;
  p.reno = (p.reno || 0) + 1;
  state.stats.renovations = (state.stats.renovations || 0) + 1;
  log('Renovated ' + a.name + ' for ' + fmt(cost) + '. Rent is now ' +
      Math.round((renoMultiplier(p) - 1) * 100) + '% higher', true);
  saveLocal();
  return { ok: true, msg: 'Renovated. Rent up ' + Math.round(RENO_GAIN * 100) + '%' };
}

// ---- savings account ---------------------------------------------------
export function deposit(amount) {
  if (!(amount > 0)) return { ok: false, msg: 'Enter an amount.' };
  amount = Math.min(amount, state.cash);
  if (!(amount > 0)) return { ok: false, msg: 'No cash to deposit.' };
  accrueInterest();
  state.cash -= amount;
  state.savings.balance += amount;
  log('Deposited ' + fmt(amount) + ' into savings', true);
  saveLocal();
  return { ok: true, msg: 'Deposited ' + fmt(amount) };
}

export function withdraw(amount) {
  accrueInterest();
  if (!(amount > 0)) return { ok: false, msg: 'Enter an amount.' };
  amount = Math.min(amount, state.savings.balance);
  if (!(amount > 0)) return { ok: false, msg: 'Nothing to withdraw.' };
  state.savings.balance -= amount;
  state.cash += amount;
  log('Withdrew ' + fmt(amount) + ' from savings', true);
  saveLocal();
  return { ok: true, msg: 'Withdrew ' + fmt(amount) };
}

export const savingsRate = () => Math.max(0.25, rateNow() - 0.6);
export const mortgageRate = () => rateNow() + MORTGAGE_SPREAD;
export const renoMultiplier = p => 1 + RENO_GAIN * (p.reno || 0);

function accrueInterest() {
  const now = Date.now();
  const minutes = Math.min(MAX_OFFLINE_MIN, (now - (state.savings.last || now)) / 60000);
  state.savings.last = now;
  if (state.savings.balance <= 0 || minutes <= 0) return 0;
  const gain = state.savings.balance * (savingsRate() / 100) * (minutes / 52);
  state.savings.balance += gain;
  state.stats.interest += gain;
  return gain;
}

// ---- angel -------------------------------------------------------------
export function investStartup(su, amount) {
  if (!(amount > 0)) return { ok: false, msg: 'Enter an amount.' };
  if (amount > state.cash) return { ok: false, msg: 'Not enough cash.' };
  if (state.startups[su.id]) return { ok: false, msg: 'Already backed this round.' };
  state.cash -= amount;
  state.startups[su.id] = {
    name: su.name, amount, risk: su.risk,
    matureTick: nowTick() + su.maturity, resolved: false, payout: 0,
  };
  log('Backed ' + su.name + ' with ' + fmt(amount), true);
  saveLocal();
  return { ok: true, msg: 'Invested ' + fmt(amount) + ' in ' + su.name };
}

function resolveStartups() {
  const t = nowTick();
  for (const id in state.startups) {
    const s = state.startups[id];
    if (s.resolved || t < s.matureTick) continue;
    const mult = startupOutcome(id, s.risk);
    const payout = s.amount * mult;
    s.resolved = true; s.payout = payout; s.mult = mult;
    state.cash += payout;
    state.stats.realized += payout - s.amount;
    log(s.name + (mult === 0 ? ' shut down. Total loss of ' + fmt(s.amount)
        : ' exited at ' + mult.toFixed(2) + 'x -> ' + fmt(payout)), mult >= 1);
    saveLocal();
  }
}

// ---- income ------------------------------------------------------------
// Dividends, bond coupons and savings interest all pay per real minute, where
// one minute stands in for a simulated week. Time away is capped so coming back
// after a week does not hand you a fortune.
function payIncome() {
  const now = Date.now();
  const minutes = Math.min(MAX_OFFLINE_MIN, (now - (state.lastDividend || now)) / 60000);
  if (minutes < 1) { accrueInterest(); return; }
  state.lastDividend = now;

  let divs = 0;
  for (const id in state.holdings) {
    const a = ASSETS.get(id);
    if (!a || !a.div) continue;
    divs += state.holdings[id].shares * priceNow(a) * (a.div / 100) * (minutes / 52);
  }
  let coupons = 0;
  for (const id in state.bonds) {
    const a = ASSETS.get(id);
    if (!a) continue;
    coupons += state.bonds[id].units * a.par * (a.coupon / 100) * (minutes / 52);
  }
  let sovereign = 0;
  for (const id in state.countries) {
    const a = ASSETS.get(id);
    if (!a) continue;
    sovereign += state.countries[id].units * priceNow(a) * (a.yield / 100) * (minutes / 52);
  }
  accrueInterest();
  accrueLoan();
  accrueMortgages();

  let borrowCost = 0;
  for (const id in state.shorts) {
    const a = ASSETS.get(id); if (!a) continue;
    borrowCost += state.shorts[id].units * priceNow(a) * (SHORT_FEE / 100) * (minutes / 52);
  }
  if (borrowCost > 0.01) {
    state.cash -= borrowCost;
    state.stats.borrowFees = (state.stats.borrowFees || 0) + borrowCost;
  }

  if (divs > 0.01) { state.cash += divs; state.stats.dividends += divs; }
  if (coupons > 0.01) { state.cash += coupons; state.stats.coupons += coupons; }
  if (sovereign > 0.01) { state.cash += sovereign; state.stats.sovereign += sovereign; }
}

// ---- transfers ---------------------------------------------------------
export async function transferCash(username, amount) {
  if (!Net.Net.online) return { ok: false, msg: 'Transfers need an online server.' };
  if (!(amount > 0) || amount > state.cash) return { ok: false, msg: 'Invalid amount.' };
  const uid = await Net.findUid(username);
  if (!uid) return { ok: false, msg: 'No player named "' + username + '".' };
  if (uid === Net.Net.uid) return { ok: false, msg: 'You cannot pay yourself.' };
  await Net.sendTransfer(uid, { type: 'cash', amount });
  state.cash -= amount;
  log('Sent ' + fmt(amount) + ' to ' + username, true);
  saveLocal();
  return { ok: true, msg: 'Sent ' + fmt(amount) + ' to ' + username };
}

export async function transferShares(username, assetId, units) {
  if (!Net.Net.online) return { ok: false, msg: 'Transfers need an online server.' };
  const a = ASSETS.get(assetId);
  const { book, key } = bookOf(a);
  const pos = book && book[assetId];
  if (!a || !pos || !(units > 0) || units > pos[key] + 1e-9) return { ok: false, msg: 'You do not own that many.' };
  const uid = await Net.findUid(username);
  if (!uid) return { ok: false, msg: 'No player named "' + username + '".' };
  if (uid === Net.Net.uid) return { ok: false, msg: 'You cannot send to yourself.' };
  const basis = pos.cost * (units / pos[key]);
  pos.cost -= basis; pos[key] -= units;
  if (pos[key] <= 1e-9) delete book[assetId];
  await Net.sendTransfer(uid, { type: 'asset', assetId, units, cost: basis });
  log('Sent ' + fmtUnits(units) + ' ' + a.ticker + ' to ' + username, true);
  saveLocal();
  return { ok: true, msg: 'Sent ' + fmtUnits(units) + ' ' + a.ticker + ' to ' + username };
}

const claimedInbox = new Set();

export function receiveInbox(items) {
  const claimed = [];
  for (const it of items) {
    // The inbox listener refires until the delete lands; without this guard a
    // failed delete would credit the same transfer again.
    if (claimedInbox.has(it.key)) { claimed.push(it.key); continue; }
    claimedInbox.add(it.key);
    if (it.type === 'cash' && it.amount > 0) {
      state.cash += it.amount;
      log('Received ' + fmt(it.amount) + ' from ' + (it.fromName || 'a player'), true);
    } else if (it.type === 'asset') {
      const a = ASSETS.get(it.assetId);
      const { book, key } = bookOf(a);
      if (a && book && it.units > 0) {
        const pos = book[it.assetId] || { [key]: 0, cost: 0 };
        pos[key] += it.units; pos.cost += it.cost || 0;
        book[it.assetId] = pos;
        log('Received ' + fmtUnits(it.units) + ' ' + a.ticker + ' from ' + (it.fromName || 'a player'), true);
      }
    }
    claimed.push(it.key);
  }
  saveLocal();
  return claimed;
}

// ---- loop --------------------------------------------------------------
let onTickCb = () => {};
export function onTick(cb) { onTickCb = cb; }

let lastSave = 0, lastCloud = 0, lastSample = 0;

function sampleNetWorth() {
  const now = Date.now();
  if (now - lastSample < 15000) return;
  lastSample = now;
  state.nwHistory.push([Math.round(now / 1000), Math.round(state.netWorth)]);
  if (state.nwHistory.length > 480) state.nwHistory.splice(0, state.nwHistory.length - 480);
}

export function saveNow() {
  saveLocal();
  if (Net.Net.online) Net.savePlayer(state, seasonIndex(), seasonReturn()).catch(() => {});
}

export function startLoop() {
  const step = () => {
    rollSeason();
    settleOptions();
    resolveStartups();
    checkOrders();
    payIncome();
    marginCalls();
    netWorth();
    sampleNetWorth();
    onTickCb();
    const now = Date.now();
    if (now - lastSave > 5000) { saveLocal(); lastSave = now; }
    if (Net.Net.online && now - lastCloud > 15000) {
      lastCloud = now;
      Net.savePlayer(state, seasonIndex(), seasonReturn()).catch(() => {});
    }
  };
  step();
  setInterval(step, 1000);
  setInterval(() => onTickCb(), TICK_MS / 3);

  // Never lose progress on a refresh, a closed tab, or a backgrounded phone.
  window.addEventListener('beforeunload', saveNow);
  window.addEventListener('pagehide', saveNow);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveNow();
  });
}

// ---- formatting --------------------------------------------------------
export function fmt(n) {
  if (!isFinite(n)) return '$0';
  const neg = n < 0; n = Math.abs(n);
  let s;
  if (n >= 1e12) s = (n / 1e12).toFixed(2) + 'T';
  else if (n >= 1e9) s = (n / 1e9).toFixed(2) + 'B';
  else if (n >= 1e6) s = (n / 1e6).toFixed(2) + 'M';
  else if (n >= 1000) s = n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  else if (n >= 1) s = n.toFixed(2);
  else s = n.toPrecision(3);
  return (neg ? '-$' : '$') + s;
}
export const fmtPx = n => n >= 1 ? '$' + n.toFixed(2) : '$' + n.toPrecision(4);
export const fmtUnits = n => n >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 0 })
  : (Math.abs(n - Math.round(n)) < 1e-9 ? String(Math.round(n)) : n.toFixed(4));
export const fmtPct = n => (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
export { SECTORS };
