// Game state, rules and the main loop.
import { generateCompanies, generateFunds, generateProperties, generateAlts,
         generateBonds, generateCollectibles, generateStartups, startupOutcome,
         STARTUP_ROUND_TICKS, COLLECT_SPREAD, SECTORS } from './data.js?v=1.4';
import { priceAt, priceNow, nowTick, TICK_MS, policyRate, setFlow } from './market.js?v=1.4';
import * as Net from './net.js?v=1.4';

export const FEE = 0.002;            // 0.2% trading commission
export const PROP_CLOSING = 0.03;    // 3% closing cost on property purchase
export const START_CASH = 100000;
export const MAX_OFFLINE_MIN = 240;  // income accrues for at most 4 hours away

// ---- universe (generated once) ----------------------------------------
export const STOCKS = generateCompanies();
export const FUNDS = generateFunds(STOCKS);
export const COMPANIES = [...STOCKS, ...FUNDS];   // everything on the Stocks tab
export const PROPERTIES = generateProperties(260);
export const ALTS = generateAlts();
export const BONDS = generateBonds();
export const COLLECTIBLES = generateCollectibles();
export const ASSETS = new Map();
for (const a of [...COMPANIES, ...PROPERTIES, ...ALTS, ...BONDS, ...COLLECTIBLES]) ASSETS.set(a.id, a);
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
    props: {},      // property id -> { price, bought, lastCollect }
    startups: {},   // startup id -> { name, amount, risk, matureTick, resolved, payout }
    savings: { balance: 0, last: Date.now() },
    stats: { trades: 0, realized: 0, rentCollected: 0, dividends: 0, coupons: 0, interest: 0 },
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
    case 'stock':
    case 'fund':    return { book: state.holdings, key: 'shares' };
    default:        return { book: null, key: 'units' };
  }
}

// You sell collectibles below the quoted value: they are illiquid.
export const spreadOf = asset => asset && asset.kind === 'collect' ? COLLECT_SPREAD : 0;
export const isFractional = asset => asset && (asset.kind === 'alt');

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
  for (const k of ['holdings', 'alts', 'bonds', 'collect', 'props', 'startups', 'watch']) {
    if (!state[k] || typeof state[k] !== 'object') state[k] = {};
  }
  if (!Array.isArray(state.nwHistory)) state.nwHistory = [];
  if (!Array.isArray(state.log)) state.log = [];
  if (!state.savings || typeof state.savings.balance !== 'number') state.savings = { balance: 0, last: Date.now() };
  state.stats = Object.assign(blank.stats, state.stats || {});
  if (typeof state.cash !== 'number' || !isFinite(state.cash)) state.cash = START_CASH;
  if (!state.lastDividend) state.lastDividend = Date.now();

  let refunded = 0;
  for (const bookName of ['holdings', 'alts', 'bonds', 'collect']) {
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
    property += priceNow(a);
  }
  for (const id in state.startups) {
    if (!state.startups[id].resolved) angel += state.startups[id].amount;
  }
  const stocks = bookValue(state.holdings);
  const alt = bookValue(state.alts);
  const bonds = bookValue(state.bonds);
  const collect = bookValue(state.collect) * (1 - COLLECT_SPREAD);  // valued at what you could get
  const savings = state.savings.balance;
  return { stocks, property, alt, bonds, collect, angel, savings,
           total: stocks + property + alt + bonds + collect + angel + savings };
}

export function netWorth() {
  state.netWorth = state.cash + positionsValue().total;
  return state.netWorth;
}

export function pendingRent() {
  const now = Date.now();
  let total = 0;
  for (const id in state.props) {
    const a = ASSETS.get(id); if (!a) continue;
    const p = state.props[id];
    const minutes = Math.min(MAX_OFFLINE_MIN, Math.max(0, (now - (p.lastCollect || now)) / 60000));
    total += priceNow(a) * a.rentRate * (1 - a.upkeep) * minutes;
  }
  return total;
}

// ---- actions -----------------------------------------------------------
function log(text, good) {
  state.log.unshift({ text, good, ts: Date.now() });
  if (state.log.length > 60) state.log.length = 60;
}
export const getLog = () => state.log;

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
  Net.bumpFlow(assetId, -units);
  Net.postFeed({ act: 'sell', sym: a.ticker, units, px: +px.toFixed(4), name: state.name });
  log('Sold ' + fmtUnits(units) + ' ' + a.ticker + ' @ ' + fmt(px) +
      ' (' + (gross - basis >= 0 ? '+' : '') + fmt(gross - basis) + ')', gross - basis >= 0);
  saveLocal();
  return { ok: true, msg: 'Sold for ' + fmt(gross) };
}

export function buyProperty(id) {
  const a = ASSETS.get(id);
  if (!a || a.kind !== 'property') return { ok: false, msg: 'Unknown property.' };
  if (state.props[id]) return { ok: false, msg: 'You already own it.' };
  const px = priceNow(a), cost = px * (1 + PROP_CLOSING);
  if (cost > state.cash) return { ok: false, msg: 'Not enough cash (need ' + fmt(cost) + ').' };
  state.cash -= cost;
  state.props[id] = { price: px, bought: Date.now(), lastCollect: Date.now() };
  Net.bumpFlow(id, 1);
  Net.postFeed({ act: 'buy', sym: 'PROPERTY', units: 1, px: +px.toFixed(0), name: state.name, extra: a.name });
  log('Bought ' + a.name + ' for ' + fmt(cost), true);
  saveLocal();
  return { ok: true, msg: 'Purchased ' + a.name };
}

export function sellProperty(id) {
  const a = ASSETS.get(id), p = state.props[id];
  if (!a || !p) return { ok: false, msg: 'You do not own that.' };
  collectRent(id);
  const px = priceNow(a) * (1 - 0.02);
  state.cash += px;
  state.stats.realized += px - p.price;
  delete state.props[id];
  Net.bumpFlow(id, -1);
  log('Sold ' + a.name + ' for ' + fmt(px), px >= p.price);
  saveLocal();
  return { ok: true, msg: 'Sold ' + a.name + ' for ' + fmt(px) };
}

export function collectRent(only) {
  const now = Date.now();
  let total = 0;
  for (const id in state.props) {
    if (only && id !== only) continue;
    const a = ASSETS.get(id); if (!a) continue;
    const p = state.props[id];
    const minutes = Math.min(MAX_OFFLINE_MIN, Math.max(0, (now - (p.lastCollect || now)) / 60000));
    total += priceNow(a) * a.rentRate * (1 - a.upkeep) * minutes;
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
  accrueInterest();

  if (divs > 0.01) { state.cash += divs; state.stats.dividends += divs; }
  if (coupons > 0.01) { state.cash += coupons; state.stats.coupons += coupons; }
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

export function receiveInbox(items) {
  const claimed = [];
  for (const it of items) {
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
  if (Net.Net.online) Net.savePlayer(state).catch(() => {});
}

export function startLoop() {
  const step = () => {
    resolveStartups();
    payIncome();
    netWorth();
    sampleNetWorth();
    onTickCb();
    const now = Date.now();
    if (now - lastSave > 5000) { saveLocal(); lastSave = now; }
    if (Net.Net.online && now - lastCloud > 15000) {
      lastCloud = now;
      Net.savePlayer(state).catch(() => {});
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
