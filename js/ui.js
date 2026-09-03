// All DOM rendering. Rows are built once per filter change and only their
// number cells are rewritten on each tick, so 640 stocks stay smooth.
import * as G from './game.js';
import { priceNow, priceAt, changePct, history, nowTick, marketIndex,
         recentEvents, flowOf, flowImpact } from './market.js';
import { SECTORS, SECTOR_BY_ID, REGIONS, PROP_TYPES, STARTUP_ROUND_TICKS } from './data.js';
import * as Net from './net.js';

const $ = s => document.querySelector(s);
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const cls = n => n >= 0 ? 'up' : 'down';

export const UI = { tab: 'portfolio', toast, openAsset, refresh, boot, setLeaderboard, setFeed, setChat, setStatus };

let leaderboard = [], feed = [], chat = [];

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
  buildTransfer();
  buildTab();
}

function buildTab() {
  if (UI.tab === 'stocks') renderStockRows();
  if (UI.tab === 'property') renderPropRows();
  if (UI.tab === 'alts') renderAltRows();
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
  else if (UI.tab === 'stocks') tickStockRows();
  else if (UI.tab === 'property') tickPropRows();
  else if (UI.tab === 'alts') tickAltRows();
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
  const parts = [['Cash', G.state.cash, '#6b7a8f'], ['Stocks', v.stocks, '#5b8cff'],
    ['Property', v.property, '#39d38a'], ['Alternatives', v.alt, '#ffb03a'], ['Angel', v.angel, '#f2618c']];
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
  for (const id in G.state.alts) {
    const a = G.ASSETS.get(id); if (!a) continue;
    const pos = G.state.alts[id], px = priceNow(a), val = pos.units * px;
    rows.push({ a, label: a.ticker, sub: a.name, qty: pos.units, px, val, pl: val - pos.cost, cost: pos.cost });
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

// ---------------- news ----------------
let newsCache = { tick: -1, html: '' };
function renderNews() {
  const t = nowTick();
  if (t - newsCache.tick < 10) { return; }
  newsCache.tick = t;
  const sample = [];
  for (let i = 0; i < G.COMPANIES.length; i += 7) sample.push(G.COMPANIES[i]);
  const evs = recentEvents(sample, SECTORS, t, 18);
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
  for (const s of SECTORS) sel.appendChild(new Option(s.name, s.id));
  sel.addEventListener('change', () => { stockState.sector = sel.value; stockState.limit = 60; renderStockRows(); });
  $('#f-search').addEventListener('input', e => { stockState.q = e.target.value.trim().toLowerCase(); stockState.limit = 60; renderStockRows(); });
  $('#f-sort').addEventListener('change', e => { stockState.sort = e.target.value; renderStockRows(); });
  $('#f-more').addEventListener('click', () => { stockState.limit += 60; renderStockRows(); });
}

function filteredCompanies() {
  const { q, sector, sort } = stockState;
  let list = G.COMPANIES;
  if (sector !== 'all') list = list.filter(a => a.sector === sector);
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
    '<div class="c sym"><b>' + a.ticker + '</b><span>' + a.name + '</span></div>' +
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
    $('#m-buy').onclick = () => { toast(G.buy(a.id, Number($('#m-qty').value)).msg); refresh(); };
    $('#m-sell').onclick = () => { toast(G.sell(a.id, Number($('#m-qty').value)).msg); refresh(); };
    $('#m-max').onclick = () => {
      const px = priceNow(a) * (1 + G.FEE);
      $('#m-qty').value = a.kind === 'alt' ? (G.state.cash / px).toFixed(4) : String(Math.floor(G.state.cash / px));
    };
    $('#m-all').onclick = () => {
      const book = a.kind === 'alt' ? G.state.alts : G.state.holdings;
      const pos = book[a.id];
      $('#m-qty').value = pos ? String(pos[a.kind === 'alt' ? 'units' : 'shares']) : '0';
    };
  } else {
    $('#m-pbuy').onclick = () => { toast(G.buyProperty(a.id).msg); refresh(); tickModal(); };
    $('#m-psell').onclick = () => { toast(G.sellProperty(a.id).msg); refresh(); tickModal(); };
  }
  tickModal();
}
function closeModal() { $('#modal').hidden = true; modalAsset = null; }

function tickModal() {
  const a = modalAsset; if (!a) return;
  const px = priceNow(a);
  $('#m-price').textContent = a.kind === 'property' ? G.fmt(px) : G.fmtPx(px);
  const c = changePct(a, a.kind === 'property' ? 900 : 400);
  $('#m-change').textContent = G.fmtPct(c);
  $('#m-change').className = 'm-change ' + cls(c);
  drawChart($('#m-chart'), history(a, 160, a.kind === 'property' ? 12 : 4));

  const facts = [];
  if (a.kind === 'stock') {
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

function drawChart(cv, data) {
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
