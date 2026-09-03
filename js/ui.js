// All DOM rendering. Rows are built once per filter change and only their
// number cells are rewritten on each tick, so 640 stocks stay smooth.
import * as G from './game.js?v=1.20';
import { priceNow, priceAt, changePct, history, nowTick, marketIndex,
         recentEvents, flowOf, flowImpact, policyRate, bondYield } from './market.js?v=1.20';
import { SECTORS, SECTOR_BY_ID, REGIONS, PROP_TYPES, STARTUP_ROUND_TICKS } from './data.js?v=1.20';
import * as Net from './net.js?v=1.20';
import { RELEASES, NEXT, VERSION } from './changelog.js?v=1.20';

const $ = s => document.querySelector(s);
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const cls = n => n >= 0 ? 'up' : 'down';

export const UI = { tab: 'portfolio', toast, openAsset, refresh, boot, setLeaderboard, setFeed, setChat, setStatus, initChangelog, setOnline };

let leaderboard = [], feed = [], chat = [];

// ---------------- update log ----------------
// Rendered from js/changelog.js, the same source CHANGELOG.md is built from.
function initChangelog() {
  buildReport();
  $('#version').textContent = VERSION;
  $('#cl-version').textContent = VERSION;
  const open = () => { renderChangelog(); $('#changelog').hidden = false; };
  $('#version').addEventListener('click', open);
  const link = $('#cl-open');
  if (link) link.addEventListener('click', open);
  $('#cl-close').addEventListener('click', () => { $('#changelog').hidden = true; });
  $('#changelog').addEventListener('click', e => {
    if (e.target.id === 'changelog') $('#changelog').hidden = true;
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { $('#changelog').hidden = true; closeModal(); }
  });
}

let changelogBuilt = false;
function renderChangelog() {
  if (changelogBuilt) return;
  changelogBuilt = true;

  const next = $('#cl-next');
  next.className = 'cl-next';
  next.innerHTML = '<h3>Next up &mdash; <b>' + NEXT.version + '</b> ' + NEXT.title + '</h3>';
  for (const [name, why] of NEXT.items) {
    const d = el('div', 'cl-plan');
    d.innerHTML = '<b>' + name + '</b><span>' + why + '</span>';
    next.appendChild(d);
  }
  const later = el('div', 'cl-later');
  later.innerHTML = '<b>Further out:</b> ' + NEXT.later.map(x => x[0]).join(' &middot; ');
  later.title = NEXT.later.map(x => x[0] + ': ' + x[1]).join('\n');
  next.appendChild(later);

  const body = $('#cl-body');
  body.innerHTML = '';
  for (const rel of RELEASES) {
    const box = el('div', 'cl-rel');
    box.innerHTML = '<h3><b>' + rel.version + '</b>' + rel.title + '</h3>' +
      '<div class="cl-date">' + rel.date + '</div>';
    for (const [tag, text] of rel.items) {
      const line = el('div', 'cl-item');
      line.innerHTML = '<span class="cl-tag ' + tag + '">' +
        ({ new: 'new', bal: 'tuning', fix: 'fix' }[tag] || tag) + '</span><span>' + text + '</span>';
      box.appendChild(line);
    }
    body.appendChild(box);
  }
}

// ---------------- boot ----------------
function boot() {
  $('#app').hidden = false;
  document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => {
    UI.tab = b.dataset.tab;
    document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === b));
    document.querySelectorAll('.panel').forEach(p => p.hidden = p.id !== 'panel-' + UI.tab);
    buildTab();
  }));
  $('#modal-close').addEventListener('click', closeModal);
  $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
  buildStocksControls();
  buildPropControls();
  buildBank();
  buildTransfer();
  const rent2 = $('#p-collect2');
  if (rent2) rent2.addEventListener('click', e => {
    e.stopPropagation();
    const got = G.collectRent();
    toast(got > 0 ? 'Collected ' + G.fmt(got) + ' in rent' : 'No rent has accrued yet.');
    lastPortfolioBuild = 0;
  });
  buildTab();
}

function buildTab() {
  if (UI.tab === 'stocks') renderStockRows();
  if (UI.tab === 'property') renderPropRows();
  if (UI.tab === 'alts') { renderAltRows(); renderCollectRows(); }
  if (UI.tab === 'bank') renderBank();
  if (UI.tab === 'angel') renderAngel();
  if (UI.tab === 'social') { renderLeaderboard(); renderFeed(); renderChat(); }
  refresh();
}

// ---------------- header + tick ----------------
function refresh() {
  const nw = G.netWorth();
  $('#hdr-net').textContent = G.fmt(nw);
  $('#hdr-cash').textContent = G.fmt(G.state.cash);
  const idx = marketIndex(nowTick());
  const prev = marketIndex(nowTick() - 200);
  const ch = (idx - prev) / prev * 100;
  $('#hdr-index').textContent = idx.toFixed(1);
  $('#hdr-index-ch').textContent = G.fmtPct(ch);
  $('#hdr-index-ch').className = 'delta ' + cls(ch);
  $('#hdr-rent').textContent = G.fmt(G.pendingRent());

  if (UI.tab === 'portfolio') renderPortfolio();
  else if (UI.tab === 'stocks') { tickStockRows(); renderSectorStrip(); }
  else if (UI.tab === 'property') tickPropRows();
  else if (UI.tab === 'alts') { tickAltRows(); tickCollectRows(); }
  else if (UI.tab === 'bank') tickBank();
  else if (UI.tab === 'angel') tickAngel();
  if (modalAsset) tickModal();
  renderNews();
}

function setStatus(text, on) {
  $('#status').textContent = text;
  $('#status').className = 'pill ' + (on ? 'ok' : 'warn');
}

// ---------------- portfolio ----------------
let lastPortfolioBuild = 0;
function renderPortfolio() {
  const v = G.positionsValue();
  $('#alloc').innerHTML = '';
  const parts = [['Cash', G.state.cash, '#6b7a8f'], ['Savings', v.savings, '#4fc3c3'],
    ['Stocks', v.stocks, '#5b8cff'], ['Bonds', v.bonds, '#9b7bff'],
    ['Property', v.property, '#39d38a'], ['Alternatives', v.alt, '#ffb03a'],
    ['Collectibles', v.collect, '#d98cff'], ['Angel', v.angel, '#f2618c']];
  const total = Math.max(1, G.state.netWorth);
  const bar = el('div', 'allocbar');
  for (const [name, val, color] of parts) {
    if (val <= 0) continue;
    const seg = el('div'); seg.style.width = (val / total * 100) + '%'; seg.style.background = color;
    seg.title = name + ' ' + G.fmt(val); bar.appendChild(seg);
  }
  $('#alloc').appendChild(bar);
  const legend = el('div', 'legend');
  for (const [name, val, color] of parts) {
    const s = el('span', 'lg');
    s.innerHTML = '<i style="background:' + color + '"></i>' + name + ' <b>' + G.fmt(val) + '</b>';
    legend.appendChild(s);
  }
  $('#alloc').appendChild(legend);
  drawNwChart();

  const st = G.state.stats;
  $('#stat-realized').textContent = G.fmt(st.realized);
  $('#stat-realized').className = 'v ' + cls(st.realized);
  $('#stat-trades').textContent = st.trades;
  $('#stat-rent').textContent = G.fmt(st.rentCollected);
  $('#stat-div').textContent = G.fmt(st.dividends);

  // Holdings tables rebuild at most twice a second; they are small.
  if (Date.now() - lastPortfolioBuild < 500) return;
  lastPortfolioBuild = Date.now();

  const hb = $('#holdings'); hb.innerHTML = '';
  const rows = [];
  for (const id in G.state.holdings) {
    const a = G.ASSETS.get(id); if (!a) continue;
    const pos = G.state.holdings[id], px = priceNow(a), val = pos.shares * px;
    rows.push({ a, label: a.ticker, sub: a.name, qty: pos.shares, px, val, pl: val - pos.cost, cost: pos.cost });
  }
  for (const bookName of ['alts', 'bonds', 'collect']) {
    for (const id in G.state[bookName]) {
      const a = G.ASSETS.get(id); if (!a) continue;
      const pos = G.state[bookName][id];
      const px = priceNow(a) * (1 - G.spreadOf(a));
      const val = pos.units * px;
      rows.push({ a, label: a.ticker, sub: a.name, qty: pos.units, px, val, pl: val - pos.cost, cost: pos.cost });
    }
  }
  rows.sort((x, y) => y.val - x.val);
  if (!rows.length) hb.appendChild(el('div', 'empty', 'No positions yet. Head to the Stocks tab and buy something.'));
  for (const r of rows) {
    const row = el('div', 'row hrow');
    row.innerHTML =
      '<div class="c sym"><b>' + r.label + '</b><span>' + r.sub + '</span></div>' +
      '<div class="c num">' + G.fmtUnits(r.qty) + '</div>' +
      '<div class="c num">' + G.fmtPx(r.px) + '</div>' +
      '<div class="c num">' + G.fmt(r.val) + '</div>' +
      '<div class="c num ' + cls(r.pl) + '">' + (r.pl >= 0 ? '+' : '') + G.fmt(r.pl) +
      ' <small>' + G.fmtPct(r.cost > 0 ? r.pl / r.cost * 100 : 0) + '</small></div>';
    row.addEventListener('click', () => openAsset(r.a.id));
    hb.appendChild(row);
  }

  const pb = $('#myprops'); pb.innerHTML = '';
  const pids = Object.keys(G.state.props);
  if (!pids.length) pb.appendChild(el('div', 'empty', 'You own no property.'));
  for (const id of pids) {
    const a = G.ASSETS.get(id); if (!a) continue;
    const p = G.state.props[id], px = priceNow(a);
    const rentMin = px * a.rentRate * (1 - a.upkeep);
    const row = el('div', 'row hrow');
    row.innerHTML =
      '<div class="c sym"><b>' + a.name + '</b><span>' + a.regionName + ' &middot; ' + a.typeName + '</span></div>' +
      '<div class="c num">' + G.fmt(px) + '</div>' +
      '<div class="c num">' + G.fmt(rentMin) + '<small>/min</small></div>' +
      '<div class="c num ' + cls(px - p.price) + '">' + G.fmtPct((px - p.price) / p.price * 100) + '</div>';
    const btn = el('button', 'mini danger', 'Sell');
    btn.addEventListener('click', e => { e.stopPropagation(); toast(G.sellProperty(id).msg); lastPortfolioBuild = 0; });
    const wrap = el('div', 'c act'); wrap.appendChild(btn); row.appendChild(wrap);
    row.addEventListener('click', () => openAsset(id));
    pb.appendChild(row);
  }

  const lb = $('#activity'); lb.innerHTML = '';
  for (const e of G.getLog().slice(0, 18)) {
    const d = el('div', 'logline ' + (e.good ? 'up' : 'down'), e.text);
    lb.appendChild(d);
  }
}

// Net worth over time, sampled every 15s by the game loop.
function drawNwChart() {
  const cv = $('#nw-chart');
  const hist = G.state.nwHistory || [];
  const pts = hist.map(h => h[1]).concat([G.state.netWorth]);
  const note = $('#nw-note');
  if (pts.length < 3) {
    cv.hidden = true; note.hidden = false;
    return;
  }
  cv.hidden = false; note.hidden = true;
  const first = pts[0], last = pts[pts.length - 1];
  $('#nw-delta').textContent = (last >= first ? '+' : '') + G.fmt(last - first) +
    '  ' + G.fmtPct(first > 0 ? (last - first) / first * 100 : 0);
  $('#nw-delta').className = 'nwdelta ' + cls(last - first);
  drawChart(cv, pts, { flat: G.START_CASH });
}

// ---------------- sector heat strip ----------------
let stripCache = -1;
function renderSectorStrip() {
  const t = nowTick();
  if (t - stripCache < 8 && $('#sector-strip').children.length) return;
  stripCache = t;
  const box = $('#sector-strip');
  box.innerHTML = '';
  for (const sec of SECTORS) {
    if (sec.id === 'fund') continue;
    const members = G.STOCKS.filter(a => a.sector === sec.id);
    if (!members.length) continue;
    let sum = 0, n = 0;
    for (let i = 0; i < members.length; i += Math.max(1, Math.floor(members.length / 12))) {
      sum += changePct(members[i]); n++;
    }
    const avg = n ? sum / n : 0;
    const b = el('button', 'heat ' + cls(avg));
    const strength = Math.min(1, Math.abs(avg) / 12);
    b.style.background = (avg >= 0 ? 'rgba(57,211,138,' : 'rgba(255,95,109,') + (0.10 + strength * 0.5) + ')';
    b.innerHTML = '<b>' + sec.name + '</b><span>' + G.fmtPct(avg) + '</span>';
    b.addEventListener('click', () => {
      const sel = $('#f-sector');
      sel.value = stockState.sector === sec.id ? 'all' : sec.id;
      stockState.sector = sel.value; stockState.limit = 60;
      renderStockRows();
    });
    box.appendChild(b);
  }
}

// ---------------- news ----------------
let newsCache = { tick: -1, html: '' };
function renderNews() {
  const t = nowTick();
  if (t - newsCache.tick < 10) { return; }
  newsCache.tick = t;
  const sample = [];
  for (let i = 0; i < G.STOCKS.length; i += 7) sample.push(G.STOCKS[i]);
  const evs = recentEvents(sample, SECTORS.filter(x => x.id !== 'fund'), t, 18);
  const box = $('#news'); box.innerHTML = '';
  for (const e of evs) {
    const d = el('div', 'newsitem ' + cls(e.mag));
    d.innerHTML = '<span class="dot"></span>' + e.text;
    if (e.id) d.addEventListener('click', () => openAsset(e.id));
    box.appendChild(d);
  }
  const marquee = evs.slice(0, 8).map(e => e.text).join('   •   ');
  $('#ticker-text').textContent = marquee || 'Markets are quiet.';
}

// ---------------- stocks ----------------
const stockState = { q: '', sector: 'all', sort: 'cap', limit: 60 };
let stockRows = [];

function buildStocksControls() {
  const sel = $('#f-sector');
  sel.appendChild(new Option('★ Watchlist', '_watch'));
  sel.appendChild(new Option('Owned', '_own'));
  for (const s of SECTORS) sel.appendChild(new Option(s.name, s.id));
  sel.addEventListener('change', () => { stockState.sector = sel.value; stockState.limit = 60; renderStockRows(); });
  $('#f-search').addEventListener('input', e => { stockState.q = e.target.value.trim().toLowerCase(); stockState.limit = 60; renderStockRows(); });
  $('#f-sort').addEventListener('change', e => { stockState.sort = e.target.value; renderStockRows(); });
  $('#f-more').addEventListener('click', () => { stockState.limit += 60; renderStockRows(); });
}

function filteredCompanies() {
  const { q, sector, sort } = stockState;
  let list = G.COMPANIES;
  if (sector === '_watch') list = list.filter(a => G.isWatched(a.id));
  else if (sector === '_own') list = list.filter(a => G.state.holdings[a.id]);
  else if (sector !== 'all') list = list.filter(a => a.sector === sector);
  if (q) list = list.filter(a => a.ticker.toLowerCase().includes(q) || a.name.toLowerCase().includes(q));
  const t = nowTick();
  if (sort === 'gain') list = [...list].sort((a, b) => changePct(b) - changePct(a));
  else if (sort === 'loss') list = [...list].sort((a, b) => changePct(a) - changePct(b));
  else if (sort === 'price') list = [...list].sort((a, b) => priceAt(b, t) - priceAt(a, t));
  else if (sort === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name));
  else list = [...list].sort((a, b) => b.floatShares * priceAt(b, t) - a.floatShares * priceAt(a, t));
  return list;
}

function renderStockRows() {
  renderSectorStrip();
  const list = filteredCompanies();
  const shown = list.slice(0, stockState.limit);
  $('#f-count').textContent = list.length + ' listed';
  $('#f-more').hidden = shown.length >= list.length;
  const body = $('#stock-body');
  body.innerHTML = '';
  stockRows = shown.map(a => makeAssetRow(a, body, true));
  tickStockRows();
}

function makeAssetRow(a, body, withSpark) {
  const row = el('div', 'row arow');
  const sec = SECTOR_BY_ID[a.sector];
  row.innerHTML =
    '<div class="c sym"><button class="star' + (G.isWatched(a.id) ? ' on' : '') +
      '" title="Add to watchlist">★</button>' +
      '<span class="symtext"><b>' + a.ticker + '</b><span>' + a.name + '</span></span></div>' +
    '<div class="c tag">' + (sec ? '<i style="background:' + sec.color + '"></i>' + sec.name : (a.class || '')) + '</div>' +
    '<div class="c num px"></div>' +
    '<div class="c num ch"></div>' +
    '<div class="c spark"></div>' +
    '<div class="c num own"></div>';
  if (withSpark) {
    const cv = document.createElement('canvas');
    cv.width = 120; cv.height = 30; row.querySelector('.spark').appendChild(cv);
    row._canvas = cv;
  }
  const star = row.querySelector('.star');
  if (star) star.addEventListener('click', e => {
    e.stopPropagation();
    star.classList.toggle('on', G.toggleWatch(a.id));
  });
  row.addEventListener('click', () => openAsset(a.id));
  body.appendChild(row);
  return { a, row, px: row.querySelector('.px'), ch: row.querySelector('.ch'), own: row.querySelector('.own'), lastSpark: 0 };
}

function tickAssetRow(r, book) {
  const p = priceNow(r.a);
  r.px.textContent = G.fmtPx(p);
  const c = changePct(r.a);
  r.ch.textContent = G.fmtPct(c);
  r.ch.className = 'c num ch ' + cls(c);
  const pos = book[r.a.id];
  const key = r.a.kind === 'alt' ? 'units' : 'shares';
  r.own.textContent = pos ? G.fmtUnits(pos[key]) : '';
  const t = nowTick();
  if (r.row._canvas && t - r.lastSpark >= 2) {
    r.lastSpark = t;
    drawSpark(r.row._canvas, history(r.a, 40, 6), c >= 0);
  }
}

const tickStockRows = () => stockRows.forEach(r => tickAssetRow(r, G.state.holdings));

// ---------------- alternatives ----------------
let altRows = [];
function renderAltRows() {
  const body = $('#alt-body'); body.innerHTML = '';
  altRows = G.ALTS.map(a => makeAssetRow(a, body, true));
  tickAltRows();
}
const tickAltRows = () => altRows.forEach(r => tickAssetRow(r, G.state.alts));

// ---------------- collectibles ----------------
let collectRows = [];
function renderCollectRows() {
  const body = $('#collect-body'); body.innerHTML = '';
  collectRows = G.COLLECTIBLES.map(a => makeAssetRow(a, body, true));
  tickCollectRows();
}
function tickCollectRows() {
  for (const r of collectRows) {
    const p = priceNow(r.a);
    r.px.textContent = G.fmt(p);
    const c = changePct(r.a, 900);
    r.ch.textContent = G.fmtPct(c);
    r.ch.className = 'c num ch ' + cls(c);
    const pos = G.state.collect[r.a.id];
    r.own.textContent = pos ? G.fmtUnits(pos.units) : '';
    const t = nowTick();
    if (r.row._canvas && t - r.lastSpark >= 4) {
      r.lastSpark = t;
      drawSpark(r.row._canvas, history(r.a, 40, 40), c >= 0);
    }
  }
}

// ---------------- bank and bonds ----------------
let bondRows = [];
function buildBank() {
  $('#bank-deposit').addEventListener('click', () => {
    toast(G.deposit(Number($('#bank-amount').value)).msg); tickBank();
  });
  $('#bank-withdraw').addEventListener('click', () => {
    toast(G.withdraw(Number($('#bank-amount').value)).msg); tickBank();
  });
}

function renderBank() {
  const body = $('#bond-body'); body.innerHTML = '';
  bondRows = G.BONDS.map(a => {
    const row = el('div', 'row brow2');
    row.innerHTML =
      '<div class="c sym"><b>' + a.ticker + '</b><span>' + a.name + '</span></div>' +
      '<div class="c num">' + a.coupon.toFixed(2) + '%</div>' +
      '<div class="c num yld"></div>' +
      '<div class="c num">' + a.duration.toFixed(1) + 'y</div>' +
      '<div class="c num px"></div>' +
      '<div class="c num ch"></div>' +
      '<div class="c num own"></div>';
    row.addEventListener('click', () => openAsset(a.id));
    body.appendChild(row);
    return { a, row, px: row.querySelector('.px'), ch: row.querySelector('.ch'),
             yld: row.querySelector('.yld'), own: row.querySelector('.own') };
  });
  tickBank();
}

function tickBank() {
  const t = nowTick();
  $('#bank-rate').textContent = policyRate(t).toFixed(2) + '%';
  $('#bank-myrate').textContent = G.savingsRate().toFixed(2) + '%';
  $('#bank-balance').textContent = G.fmt(G.state.savings.balance);
  $('#bank-earned').textContent = G.fmt(G.state.stats.interest || 0);
  for (const r of bondRows) {
    const p = priceNow(r.a);
    r.px.textContent = G.fmt(p);
    r.yld.textContent = bondYield(r.a, t).toFixed(2) + '%';
    const c = changePct(r.a, 900);
    r.ch.textContent = G.fmtPct(c);
    r.ch.className = 'c num ch ' + cls(c);
    const pos = G.state.bonds[r.a.id];
    r.own.textContent = pos ? G.fmtUnits(pos.units) : '';
  }
  const cv = $('#rate-chart');
  if (cv && UI.tab === 'bank') {
    const pts = [];
    for (let i = 119; i >= 0; i--) pts.push(policyRate(t - i * 20));
    drawChart(cv, pts);
  }
}

// ---------------- presence ----------------
function setOnline(names) {
  const pill = $('#hdr-online');
  if (!names || !names.length) { pill.hidden = true; return; }
  pill.hidden = false;
  pill.className = 'pill ok';
  pill.textContent = names.length + (names.length === 1 ? ' player online' : ' players online');
  pill.title = names.join(', ');
}

// ---------------- bug reports ----------------
const REPO = 'https://github.com/RandomProjects1234/ledger-city';

function buildReport() {
  const box = $('#report');
  const open = () => { $('#report-status').textContent = ''; box.hidden = false; syncGithubLink(); };
  $('#report-open').addEventListener('click', open);
  $('#report-close').addEventListener('click', () => { box.hidden = true; });
  box.addEventListener('click', e => { if (e.target.id === 'report') box.hidden = true; });
  ['#report-title', '#report-body', '#report-kind', '#report-attach']
    .forEach(sel => $(sel).addEventListener('input', syncGithubLink));
  $('#report-send').addEventListener('click', sendReport);
}

function reportContext() {
  const v = G.positionsValue();
  return [
    'version: ' + VERSION,
    'mode: ' + (Net.Net.online ? 'online' : 'solo'),
    'tab: ' + UI.tab,
    'net worth: ' + G.fmt(G.state.netWorth) + ' (cash ' + G.fmt(G.state.cash) + ')',
    'positions: ' + Object.keys(G.state.holdings).length + ' equity, ' +
      Object.keys(G.state.alts).length + ' alt, ' + Object.keys(G.state.bonds).length + ' bond, ' +
      Object.keys(G.state.collect).length + ' collectible, ' +
      Object.keys(G.state.props).length + ' property',
    'screen: ' + window.innerWidth + 'x' + window.innerHeight,
    'agent: ' + navigator.userAgent,
  ].join('\n');
}

function syncGithubLink() {
  const title = $('#report-title').value.trim() || 'Bug report';
  const kind = $('#report-kind').value;
  let body = $('#report-body').value.trim();
  if ($('#report-attach').checked) body += '\n\n---\n```\n' + reportContext() + '\n```';
  $('#report-github').href = REPO + '/issues/new?labels=' + encodeURIComponent(kind) +
    '&title=' + encodeURIComponent(title) + '&body=' + encodeURIComponent(body);
}

async function sendReport() {
  const title = $('#report-title').value.trim();
  const body = $('#report-body').value.trim();
  const status = $('#report-status');
  if (title.length < 4) { status.textContent = 'Give it a one line summary first.'; return; }

  const report = {
    kind: $('#report-kind').value, title: title.slice(0, 90), body: body.slice(0, 1500),
    context: $('#report-attach').checked ? reportContext() : '',
  };
  // Keep a local copy either way, so nothing is lost if the send fails.
  try {
    const mine = JSON.parse(localStorage.getItem('is_reports') || '[]');
    mine.unshift({ ...report, ts: Date.now(), sent: Net.Net.online });
    localStorage.setItem('is_reports', JSON.stringify(mine.slice(0, 30)));
  } catch (e) { /* ignore */ }

  if (!Net.Net.online) {
    status.textContent = 'Saved on this device. Solo mode has nowhere to send it, so use ' +
      'the GitHub link to file it where the developer will see it.';
    return;
  }
  try {
    await Net.submitReport(report);
    status.textContent = 'Sent. Thank you - reports are read before every update.';
    $('#report-title').value = ''; $('#report-body').value = '';
  } catch (e) {
    status.textContent = 'Could not send it (' + e.message + '). The GitHub link still works.';
  }
}

// ---------------- property ----------------
const propState = { region: 'all', type: 'all', limit: 40, mineOnly: false };
let propRows = [];

function buildPropControls() {
  const rs = $('#p-region');
  for (const r of REGIONS) rs.appendChild(new Option(r.name, r.id));
  rs.addEventListener('change', () => { propState.region = rs.value; propState.limit = 40; renderPropRows(); });
  const ts = $('#p-type');
  for (const t of PROP_TYPES) ts.appendChild(new Option(t.name, t.id));
  ts.addEventListener('change', () => { propState.type = ts.value; propState.limit = 40; renderPropRows(); });
  $('#p-more').addEventListener('click', () => { propState.limit += 40; renderPropRows(); });
  $('#p-collect').addEventListener('click', () => {
    const got = G.collectRent();
    toast(got > 0 ? 'Collected ' + G.fmt(got) + ' in rent' : 'No rent has accrued yet.');
  });
}

function renderPropRows() {
  let list = G.PROPERTIES;
  if (propState.region !== 'all') list = list.filter(p => p.region === propState.region);
  if (propState.type !== 'all') list = list.filter(p => p.type === propState.type);
  const shown = list.slice(0, propState.limit);
  $('#p-count').textContent = list.length + ' on the market';
  $('#p-more').hidden = shown.length >= list.length;
  const body = $('#prop-body'); body.innerHTML = '';
  propRows = shown.map(a => {
    const row = el('div', 'row prow');
    row.innerHTML =
      '<div class="c sym"><b>' + a.name + '</b><span>' + a.regionName + '</span></div>' +
      '<div class="c tag">' + a.typeName + '</div>' +
      '<div class="c num px"></div>' +
      '<div class="c num rent"></div>' +
      '<div class="c num yld"></div>' +
      '<div class="c act"></div>';
    const btn = el('button', 'mini', 'Buy');
    btn.addEventListener('click', e => { e.stopPropagation(); toast(G.buyProperty(a.id).msg); renderPropRows(); });
    row.querySelector('.act').appendChild(btn);
    row.addEventListener('click', () => openAsset(a.id));
    body.appendChild(row);
    return { a, row, px: row.querySelector('.px'), rent: row.querySelector('.rent'), yld: row.querySelector('.yld'), btn };
  });
  tickPropRows();
}

function tickPropRows() {
  for (const r of propRows) {
    const p = priceNow(r.a);
    const rent = p * r.a.rentRate * (1 - r.a.upkeep);
    r.px.textContent = G.fmt(p);
    r.rent.textContent = G.fmt(rent) + '/min';
    const c = changePct(r.a, 900);
    r.yld.textContent = G.fmtPct(c);
    r.yld.className = 'c num yld ' + cls(c);
    const owned = !!G.state.props[r.a.id];
    r.btn.textContent = owned ? 'Owned' : 'Buy';
    r.btn.disabled = owned;
    r.row.classList.toggle('owned', owned);
  }
}

// ---------------- angel ----------------
function renderAngel() {
  const body = $('#angel-body'); body.innerHTML = '';
  for (const su of G.currentStartups()) {
    const card = el('div', 'card startup');
    const mine = G.state.startups[su.id];
    card.innerHTML =
      '<div class="su-head"><b>' + su.name + '</b><span class="risk ' + su.risk + '">' + su.risk + ' risk</span></div>' +
      '<p>' + su.pitch + '</p>' +
      '<div class="su-meta">Raising <b>' + G.fmt(su.ask) + '</b> &middot; resolves in ~' +
        Math.round(su.maturity * 3 / 60) + ' min</div>';
    if (mine) {
      card.appendChild(el('div', 'su-mine', mine.resolved
        ? (mine.mult === 0 ? 'Failed. Lost ' + G.fmt(mine.amount) : 'Exited ' + mine.mult.toFixed(2) + 'x for ' + G.fmt(mine.payout))
        : 'Backed with ' + G.fmt(mine.amount) + ' - awaiting outcome'));
    } else {
      const row = el('div', 'su-buy');
      const inp = el('input'); inp.type = 'number'; inp.placeholder = 'Amount'; inp.min = '100';
      inp.value = String(Math.min(su.ask, Math.floor(G.state.cash * 0.05)) || 1000);
      const b = el('button', 'mini', 'Invest');
      b.addEventListener('click', () => { toast(G.investStartup(su, Number(inp.value)).msg); renderAngel(); });
      row.append(inp, b); card.appendChild(row);
    }
    body.appendChild(card);
  }
  const list = $('#angel-mine'); list.innerHTML = '';
  const ids = Object.keys(G.state.startups);
  if (!ids.length) list.appendChild(el('div', 'empty', 'No angel investments yet.'));
  for (const id of ids.reverse()) {
    const s = G.state.startups[id];
    const d = el('div', 'row hrow');
    const left = nowTick() >= s.matureTick ? 0 : Math.ceil((s.matureTick - nowTick()) * 3 / 60);
    d.innerHTML = '<div class="c sym"><b>' + s.name + '</b><span>' + s.risk + ' risk</span></div>' +
      '<div class="c num">' + G.fmt(s.amount) + '</div>' +
      '<div class="c num ' + (s.resolved ? cls(s.payout - s.amount) : '') + '">' +
        (s.resolved ? G.fmt(s.payout) : left + ' min left') + '</div>';
    list.appendChild(d);
  }
  $('#angel-next').textContent = Math.ceil((STARTUP_ROUND_TICKS - (nowTick() % STARTUP_ROUND_TICKS)) * 3 / 60) + ' min';
}
function tickAngel() {
  $('#angel-next').textContent = Math.ceil((STARTUP_ROUND_TICKS - (nowTick() % STARTUP_ROUND_TICKS)) * 3 / 60) + ' min';
}

// ---------------- social ----------------
function setLeaderboard(rows) { leaderboard = rows; if (UI.tab === 'social') renderLeaderboard(); }
function setFeed(rows) { feed = rows; if (UI.tab === 'social') renderFeed(); }
function setChat(rows) { chat = rows; if (UI.tab === 'social') renderChat(); }

function renderLeaderboard() {
  const b = $('#board'); b.innerHTML = '';
  const rows = leaderboard.length ? leaderboard
    : [{ uid: Net.Net.uid || 'solo', name: G.state.name || 'You', netWorth: G.state.netWorth }];
  rows.forEach((r, i) => {
    const d = el('div', 'row brow' + (r.uid === Net.Net.uid ? ' me' : ''));
    d.innerHTML = '<div class="c rank">#' + (i + 1) + '</div>' +
      '<div class="c sym"><b>' + escapeHtml(r.name || 'anon') + '</b></div>' +
      '<div class="c num">' + G.fmt(r.netWorth) + '</div>';
    b.appendChild(d);
  });
  if (!Net.Net.online) b.appendChild(el('div', 'empty', 'Solo mode - connect Firebase to see other players.'));
}

function renderFeed() {
  const b = $('#feed'); b.innerHTML = '';
  if (!feed.length) b.appendChild(el('div', 'empty', 'No trades on the tape yet.'));
  for (const f of feed) {
    const d = el('div', 'feeditem ' + (f.act === 'buy' ? 'up' : 'down'));
    d.textContent = (f.name || 'someone') + ' ' + f.act + ' ' + G.fmtUnits(f.units) + ' ' +
      (f.extra || f.sym) + ' @ ' + G.fmtPx(f.px);
    b.appendChild(d);
  }
}

function renderChat() {
  const b = $('#chat'); b.innerHTML = '';
  for (const m of chat) {
    const d = el('div', 'chatline');
    d.innerHTML = '<b>' + escapeHtml(m.name || 'anon') + ':</b> ' + escapeHtml(m.text || '');
    b.appendChild(d);
  }
  b.scrollTop = b.scrollHeight;
}

function buildTransfer() {
  $('#tr-send').addEventListener('click', async () => {
    const who = $('#tr-user').value.trim();
    const amt = Number($('#tr-amount').value);
    const asset = $('#tr-asset').value.trim().toUpperCase();
    let res;
    if (asset) {
      const a = [...G.ASSETS.values()].find(x => x.ticker === asset);
      res = a ? await G.transferShares(who, a.id, amt) : { ok: false, msg: 'Unknown ticker ' + asset };
    } else {
      res = await G.transferCash(who, amt);
    }
    toast(res.msg);
  });
  $('#chat-send').addEventListener('click', sendChatMsg);
  $('#chat-input').addEventListener('keydown', e => { if (e.key === 'Enter') sendChatMsg(); });
}
function sendChatMsg() {
  const v = $('#chat-input').value.trim();
  if (!v) return;
  Net.sendChat(v);
  $('#chat-input').value = '';
}

// ---------------- asset modal ----------------
let modalAsset = null;
let tradeMode = (() => {
  try { return localStorage.getItem('is_trade_mode') === 'cash' ? 'cash' : 'units'; }
  catch (e) { return 'units'; }
})();

function setTradeMode(mode) {
  tradeMode = mode;
  try { localStorage.setItem('is_trade_mode', mode); } catch (e) { /* ignore */ }
  const a = modalAsset;
  $('#m-mode').textContent = mode === 'cash' ? '$ amount' : 'Quantity';
  $('#m-qty').placeholder = mode === 'cash' ? 'Dollars to spend' : 'Number of units';
  if (a) $('#m-qty').value = mode === 'cash' ? '1000' : (a.kind === 'alt' ? '1' : '1');
}
function openAsset(id) {
  const a = G.ASSETS.get(id);
  if (!a) return;
  modalAsset = a;
  $('#modal').hidden = false;
  $('#m-title').textContent = a.name;
  $('#m-sub').textContent = a.kind === 'property'
    ? a.regionName + ' · ' + a.typeName
    : a.ticker + ' · ' + (SECTOR_BY_ID[a.sector] ? SECTOR_BY_ID[a.sector].name : a.class);
  const isProp = a.kind === 'property';
  $('#m-trade').hidden = isProp;
  $('#m-proptrade').hidden = !isProp;
  if (!isProp) {
    $('#m-qty').value = '1';
    setTradeMode(tradeMode);
    $('#m-mode').onclick = () => setTradeMode(tradeMode === 'units' ? 'cash' : 'units');
    $('#m-buy').onclick = () => {
      const v = Number($('#m-qty').value);
      toast((tradeMode === 'cash' ? G.buyValue(a.id, v) : G.buy(a.id, v)).msg);
      refresh();
    };
    $('#m-sell').onclick = () => {
      let units = Number($('#m-qty').value);
      if (tradeMode === 'cash') units = units / priceNow(a);
      toast(G.sell(a.id, units).msg); refresh();
    };
    $('#m-max').onclick = () => {
      if (tradeMode === 'cash') { $('#m-qty').value = Math.floor(G.state.cash); return; }
      const px = priceNow(a) * (1 + G.FEE);
      $('#m-qty').value = a.kind === 'alt' ? (G.state.cash / px).toFixed(4) : String(Math.floor(G.state.cash / px));
    };
    $('#m-all').onclick = () => {
      const book = a.kind === 'alt' ? G.state.alts : G.state.holdings;
      const pos = book[a.id];
      const q = pos ? pos[a.kind === 'alt' ? 'units' : 'shares'] : 0;
      $('#m-qty').value = tradeMode === 'cash' ? Math.floor(q * priceNow(a)) : String(q);
    };
  } else {
    $('#m-pbuy').onclick = () => {
      toast(G.buyProperty(a.id).msg); refresh(); tickModal();
      if (UI.tab === 'property') renderPropRows();
    };
    $('#m-psell').onclick = () => {
      toast(G.sellProperty(a.id).msg); refresh(); tickModal();
      if (UI.tab === 'property') renderPropRows();
    };
  }
  tickModal();
}
function closeModal() { $('#modal').hidden = true; modalAsset = null; }

function tickModal() {
  const a = modalAsset; if (!a) return;
  const px = priceNow(a);
  $('#m-price').textContent = (a.kind === 'property' || a.kind === 'collect' || px >= 1000)
    ? G.fmt(px) : G.fmtPx(px);
  const c = changePct(a, a.kind === 'property' ? 900 : 400);
  $('#m-change').textContent = G.fmtPct(c);
  $('#m-change').className = 'm-change ' + cls(c);
  drawChart($('#m-chart'), history(a, 160, a.kind === 'property' ? 12 : 4));

  const facts = [];
  if (a.kind === 'bond') {
    facts.push(['Coupon', a.coupon.toFixed(2) + '% / yr'],
      ['Current yield', bondYield(a, nowTick()).toFixed(2) + '%'],
      ['Duration', a.duration.toFixed(1) + ' years'],
      ['Credit spread', a.credit ? a.credit.toFixed(2) + '%' : 'none (government)'],
      ['Par value', G.fmt(a.par)]);
  } else if (a.kind === 'collect') {
    facts.push(['Class', a.className], ['Quoted value', G.fmt(px)],
      ['You would get', G.fmt(px * (1 - G.spreadOf(a)))],
      ['Spread', (G.spreadOf(a) * 100).toFixed(0) + '%']);
  } else if (a.kind === 'fund') {
    facts.push(['Type', 'Index fund'], ['Holdings', a.holdings + ' companies'],
      ['Distribution', a.div.toFixed(2) + '% / yr'],
      ['Top holding', a.members[0].asset.ticker + ' (' + (a.members[0].w * 100).toFixed(1) + '%)']);
  } else if (a.kind === 'stock') {
    facts.push(['Market cap', G.fmt(px * a.floatShares)], ['Class', a.cap],
      ['Dividend', a.div ? a.div.toFixed(2) + '% / yr' : 'none'],
      ['Volatility', (a.vol * 100).toFixed(0)], ['Beta', a.beta.toFixed(2)]);
  } else if (a.kind === 'alt') {
    facts.push(['Type', a.class], ['Volatility', (a.vol * 100).toFixed(0)], ['Beta', a.beta.toFixed(2)]);
  } else {
    facts.push(['Region', a.regionName], ['Type', a.typeName],
      ['Gross rent', G.fmt(px * a.rentRate) + '/min'],
      ['Upkeep', (a.upkeep * 100).toFixed(0) + '%'],
      ['Net rent', G.fmt(px * a.rentRate * (1 - a.upkeep)) + '/min']);
  }
  const fi = flowImpact(a);
  facts.push(['Player flow', (fi >= 0 ? '+' : '') + (fi * 100).toFixed(2) + '% (' + G.fmtUnits(flowOf(a.id)) + ' net)']);
  const book = a.kind === 'alt' ? G.state.alts : G.state.holdings;
  const pos = a.kind === 'property' ? G.state.props[a.id] : book[a.id];
  if (pos) {
    if (a.kind === 'property') facts.push(['You paid', G.fmt(pos.price)]);
    else {
      const q = pos[a.kind === 'alt' ? 'units' : 'shares'];
      facts.push(['You own', G.fmtUnits(q)], ['Avg cost', G.fmtPx(pos.cost / q)],
        ['Unrealised', G.fmt(q * px - pos.cost)]);
    }
  }
  $('#m-facts').innerHTML = facts.map(([k, v]) => '<div><span>' + k + '</span><b>' + v + '</b></div>').join('');
  if (a.kind === 'property') {
    const owned = !!G.state.props[a.id];
    $('#m-pbuy').disabled = owned; $('#m-psell').disabled = !owned;
  }
}

// ---------------- charts ----------------
function drawSpark(cv, data, up) {
  const ctx = cv.getContext('2d');
  const w = cv.width, h = cv.height;
  ctx.clearRect(0, 0, w, h);
  let lo = Infinity, hi = -Infinity;
  for (const v of data) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const span = hi - lo || 1;
  ctx.beginPath();
  data.forEach((v, i) => {
    const x = i / (data.length - 1) * (w - 2) + 1;
    const y = h - 2 - (v - lo) / span * (h - 4);
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.strokeStyle = up ? '#39d38a' : '#ff5f6d';
  ctx.lineWidth = 1.4; ctx.stroke();
}

function drawChart(cv, data, opts = {}) {
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth || 620, h = cv.clientHeight || 220;
  if (cv.width !== w * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  let lo = Infinity, hi = -Infinity;
  for (const v of data) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const pad = (hi - lo) * 0.12 || hi * 0.05 || 1;
  lo -= pad; hi += pad;
  const span = hi - lo || 1;
  const X = i => i / (data.length - 1) * (w - 54) + 6;
  const Y = v => h - 18 - (v - lo) / span * (h - 30);

  ctx.strokeStyle = 'rgba(255,255,255,.07)';
  ctx.fillStyle = '#6b7a8f'; ctx.font = '11px ui-monospace,monospace';
  for (let i = 0; i <= 4; i++) {
    const v = lo + span * i / 4, y = Y(v);
    ctx.beginPath(); ctx.moveTo(6, y); ctx.lineTo(w - 48, y); ctx.stroke();
    ctx.fillText(v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v.toFixed(v < 1 ? 4 : 2), w - 44, y + 3);
  }
  const up = data[data.length - 1] >= data[0];
  const color = up ? '#39d38a' : '#ff5f6d';
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, up ? 'rgba(57,211,138,.28)' : 'rgba(255,95,109,.28)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.beginPath();
  data.forEach((v, i) => i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v)));
  ctx.strokeStyle = color; ctx.lineWidth = 1.8; ctx.stroke();
  ctx.lineTo(X(data.length - 1), h - 18); ctx.lineTo(X(0), h - 18); ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();

  // Optional reference line (e.g. the starting bankroll on the net worth chart).
  if (opts.flat != null && opts.flat > lo && opts.flat < hi) {
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(6, Y(opts.flat)); ctx.lineTo(w - 48, Y(opts.flat)); ctx.stroke();
    ctx.restore();
  }
}

// ---------------- misc ----------------
let toastTimer;
function toast(msg) {
  if (!msg) return;
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
