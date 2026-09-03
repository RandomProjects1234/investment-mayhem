// Game state, rules and the main loop.
import { generateCompanies, generateProperties, generateAlts, generateStartups,
         startupOutcome, STARTUP_ROUND_TICKS, SECTORS } from './data.js';
import { priceAt, priceNow, nowTick, TICK_MS, setFlow } from './market.js';
import * as Net from './net.js';

export const FEE = 0.002;            // 0.2% trading commission
export const PROP_CLOSING = 0.03;    // 3% closing cost on property purchase
export const START_CASH = 100000;

// ---- universe (generated once) ----------------------------------------
export const COMPANIES = generateCompanies(640);
export const PROPERTIES = generateProperties(260);
export const ALTS = generateAlts();
export const ASSETS = new Map();
for (const a of [...COMPANIES, ...PROPERTIES, ...ALTS]) ASSETS.set(a.id, a);
Net.registerKeys([...ASSETS.keys()]);

export const startupRound = () => Math.floor(nowTick() / STARTUP_ROUND_TICKS);
export function currentStartups() { return generateStartups(startupRound()); }

// ---- player state ------------------------------------------------------
export const state = {
  name: null, cash: START_CASH, created: Date.now(),
  holdings: {},   // ticker -> { shares, cost }
  props: {},      // propId  -> { price, bought, lastCollect }
  alts: {},       // altId   -> { units, cost }
  startups: {},   // startupId -> { name, amount, risk, matureTick, resolved, payout }
  stats: { trades: 0, realized: 0, rentCollected: 0, dividends: 0 },
  netWorth: START_CASH, lastDividend: Date.now(),
  log: [],
};

const LS_KEY = () => 'is_save_' + (Net.Net.uid || 'solo');

export function loadLocal() {
  try {
    const raw = localStorage.getItem(LS_KEY());
    if (raw) Object.assign(state, JSON.parse(raw));
  } catch (e) { /* ignore */ }
}
export function saveLocal() {
  try { localStorage.setItem(LS_KEY(), JSON.stringify(state)); } catch (e) { /* ignore */ }
}

export function adopt(remote) {
  if (!remote) return;
  state.name = remote.name || state.name;
  state.cash = typeof remote.cash === 'number' ? remote.cash : state.cash;
  state.created = remote.created || state.created;
  state.holdings = remote.holdings || {};
  state.props = remote.props || {};
  state.alts = remote.alts || {};
  state.startups = remote.startups || {};
  state.stats = Object.assign(state.stats, remote.stats || {});
}

// ---- valuation ---------------------------------------------------------
export function positionsValue() {
  let stocks = 0, property = 0, alt = 0, angel = 0;
  for (const id in state.holdings) {
    const a = ASSETS.get(id); if (!a) continue;
    stocks += state.holdings[id].shares * priceNow(a);
  }
  for (const id in state.props) {
    const a = ASSETS.get(id); if (!a) continue;
    property += priceNow(a);
  }
  for (const id in state.alts) {
    const a = ASSETS.get(id); if (!a) continue;
    alt += state.alts[id].units * priceNow(a);
  }
  for (const id in state.startups) {
    const s = state.startups[id];
    if (!s.resolved) angel += s.amount;   // held at cost until it resolves
  }
  return { stocks, property, alt, angel, total: stocks + property + alt + angel };
}

export function netWorth() {
  const v = positionsValue();
  state.netWorth = state.cash + v.total;
  return state.netWorth;
}

export function pendingRent() {
  const now = Date.now();
  let total = 0;
  for (const id in state.props) {
    const a = ASSETS.get(id); if (!a) continue;
    const p = state.props[id];
    const minutes = Math.max(0, (now - (p.lastCollect || now)) / 60000);
    total += priceNow(a) * a.rentRate * (1 - a.upkeep) * Math.min(minutes, 720);
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
  if (!a || !(units > 0)) return { ok: false, msg: 'Invalid order.' };
  const px = priceNow(a);
  const cost = px * units * (1 + FEE);
  if (cost > state.cash) return { ok: false, msg: 'Not enough cash (need ' + fmt(cost) + ').' };
  state.cash -= cost;
  const book = a.kind === 'alt' ? state.alts : state.holdings;
  const key = a.kind === 'alt' ? 'units' : 'shares';
  const pos = book[assetId] || { [key]: 0, cost: 0 };
  pos[key] += units; pos.cost += cost;
  book[assetId] = pos;
  state.stats.trades++;
  Net.bumpFlow(assetId, units);
  Net.postFeed({ act: 'buy', sym: a.ticker, units, px: +px.toFixed(4), name: state.name });
  log('Bought ' + fmtUnits(units) + ' ' + a.ticker + ' @ ' + fmt(px), true);
  return { ok: true, msg: 'Bought ' + fmtUnits(units) + ' ' + a.ticker + ' for ' + fmt(cost) };
}

export function sell(assetId, units) {
  const a = ASSETS.get(assetId);
  const book = a && a.kind === 'alt' ? state.alts : state.holdings;
  const key = a && a.kind === 'alt' ? 'units' : 'shares';
  const pos = book[assetId];
  if (!a || !pos || !(units > 0) || units > pos[key] + 1e-9) return { ok: false, msg: 'You do not own that many.' };
  const px = priceNow(a);
  const gross = px * units * (1 - FEE);
  const basis = pos.cost * (units / pos[key]);
  pos.cost -= basis; pos[key] -= units;
  if (pos[key] <= 1e-9) delete book[assetId];
  state.cash += gross;
  state.stats.trades++;
  state.stats.realized += gross - basis;
  Net.bumpFlow(assetId, -units);
  Net.postFeed({ act: 'sell', sym: a.ticker, units, px: +px.toFixed(4), name: state.name });
  log('Sold ' + fmtUnits(units) + ' ' + a.ticker + ' @ ' + fmt(px) + ' (' + (gross - basis >= 0 ? '+' : '') + fmt(gross - basis) + ')', gross - basis >= 0);
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
  return { ok: true, msg: 'Sold ' + a.name + ' for ' + fmt(px) };
}

export function collectRent(only) {
  const now = Date.now();
  let total = 0;
  for (const id in state.props) {
    if (only && id !== only) continue;
    const a = ASSETS.get(id); if (!a) continue;
    const p = state.props[id];
    const minutes = Math.min(720, Math.max(0, (now - (p.lastCollect || now)) / 60000));
    total += priceNow(a) * a.rentRate * (1 - a.upkeep) * minutes;
    p.lastCollect = now;
  }
  if (total > 0) {
    state.cash += total;
    state.stats.rentCollected += total;
    log('Collected ' + fmt(total) + ' in rent', true);
  }
  return total;
}

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
  }
}

// Dividends are paid out of the annual yield, prorated per real minute.
function payDividends() {
  const now = Date.now();
  const minutes = (now - (state.lastDividend || now)) / 60000;
  if (minutes < 1) return;
  state.lastDividend = now;
  let total = 0;
  for (const id in state.holdings) {
    const a = ASSETS.get(id);
    if (!a || !a.div) continue;
    // 1 real minute == 1 simulated week
    total += state.holdings[id].shares * priceNow(a) * (a.div / 100) * (minutes / 52);
  }
  if (total > 0.01) { state.cash += total; state.stats.dividends += total; }
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
  return { ok: true, msg: 'Sent ' + fmt(amount) + ' to ' + username };
}

export async function transferShares(username, assetId, units) {
  if (!Net.Net.online) return { ok: false, msg: 'Transfers need an online server.' };
  const a = ASSETS.get(assetId);
  const book = a && a.kind === 'alt' ? state.alts : state.holdings;
  const key = a && a.kind === 'alt' ? 'units' : 'shares';
  const pos = book[assetId];
  if (!a || !pos || !(units > 0) || units > pos[key] + 1e-9) return { ok: false, msg: 'You do not own that many.' };
  const uid = await Net.findUid(username);
  if (!uid) return { ok: false, msg: 'No player named "' + username + '".' };
  const basis = pos.cost * (units / pos[key]);
  pos.cost -= basis; pos[key] -= units;
  if (pos[key] <= 1e-9) delete book[assetId];
  await Net.sendTransfer(uid, { type: 'asset', assetId, units, cost: basis });
  log('Sent ' + fmtUnits(units) + ' ' + a.ticker + ' to ' + username, true);
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
      if (a) {
        const book = a.kind === 'alt' ? state.alts : state.holdings;
        const key = a.kind === 'alt' ? 'units' : 'shares';
        const pos = book[it.assetId] || { [key]: 0, cost: 0 };
        pos[key] += it.units; pos.cost += it.cost || 0;
        book[it.assetId] = pos;
        log('Received ' + fmtUnits(it.units) + ' ' + a.ticker + ' from ' + (it.fromName || 'a player'), true);
      }
    }
    claimed.push(it.key);
  }
  return claimed;
}

// ---- loop --------------------------------------------------------------
let onTickCb = () => {};
export function onTick(cb) { onTickCb = cb; }

let lastSave = 0, lastCloud = 0;
export function startLoop() {
  const step = () => {
    resolveStartups();
    payDividends();
    netWorth();
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
  // Realtime price repaint runs at the tick rate.
  setInterval(() => onTickCb(), TICK_MS / 3);
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
