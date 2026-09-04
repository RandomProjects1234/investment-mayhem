// Network layer. Wraps Firebase Realtime Database behind a tiny interface so
// the game also runs fully offline (solo mode) with the exact same API.
//
// Firebase SDK is imported dynamically, so nothing is fetched in solo mode.

const CDN = 'https://www.gstatic.com/firebasejs/10.12.5/';

export const Net = {
  online: false,
  uid: null,
  slot: 1,          // which save slot this session is playing
  name: null,
  _db: null, _fb: null, _app: null,
  _listeners: [],
};

// A host can share their world with "#join=<base64 config>". Anyone who opens
// that link plays on the same server without touching Firebase themselves.
export function configFromLink() {
  const m = /[#&?]join=([A-Za-z0-9_\-=]+)/.exec(location.hash + location.search);
  if (!m) return null;
  try {
    const json = decodeURIComponent(escape(atob(m[1].replace(/-/g, '+').replace(/_/g, '/'))));
    const cfg = JSON.parse(json);
    return cfg && cfg.apiKey && cfg.databaseURL ? cfg : null;
  } catch (e) { return null; }
}

export function makeJoinLink(cfg) {
  const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(cfg))))
    .replace(/\+/g, '-').replace(/\//g, '_');
  return location.origin + location.pathname + '#join=' + b64;
}

export function loadConfig() {
  // Priority: a join link, then firebase-config.js, then localStorage.
  const shared = configFromLink();
  if (shared) { saveConfig(shared); return shared; }
  if (window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.apiKey && !/PASTE|YOUR_/.test(window.FIREBASE_CONFIG.apiKey)) {
    return window.FIREBASE_CONFIG;
  }
  try {
    const raw = localStorage.getItem('is_fb_config');
    if (raw) return JSON.parse(raw);
  } catch (e) { /* ignore */ }
  return null;
}

export function saveConfig(cfg) { localStorage.setItem('is_fb_config', JSON.stringify(cfg)); }
export function clearConfig() { localStorage.removeItem('is_fb_config'); }

export async function connect(cfg) {
  const [app, auth, db] = await Promise.all([
    import(CDN + 'firebase-app.js'),
    import(CDN + 'firebase-auth.js'),
    import(CDN + 'firebase-database.js'),
  ]);
  Net._fb = { ...app, ...auth, ...db };
  Net._app = app.initializeApp(cfg);
  const authInst = auth.getAuth(Net._app);
  Net._db = db.getDatabase(Net._app);

  const cred = await auth.signInAnonymously(authInst);
  Net.uid = cred.user.uid;
  Net.online = true;
  return Net.uid;
}

const R = p => Net._fb.ref(Net._db, p);

// Every slot is its own player as far as the server is concerned, so three runs
// from one browser are three separate names, profiles and board entries.
export const slotKey = () => Net.uid + '_s' + Net.slot;
const playerPath = (uid = Net.uid, slot = Net.slot) => 'players/' + uid + '/s' + slot;
export function splitKey(key) {
  const m = /^(.+)_s(\d+)$/.exec(key || '');
  return m ? { uid: m[1], slot: Number(m[2]) } : { uid: key, slot: 1 };
}

// ---- profile / username ------------------------------------------------
export async function claimUsername(name) {
  const key = name.toLowerCase();
  const { get, set } = Net._fb;
  const snap = await get(R('usernames/' + key));
  if (snap.exists() && snap.val() !== slotKey()) {
    throw new Error('That username is already taken on this server.');
  }
  await set(R('usernames/' + key), slotKey());
  Net.name = name;
  return true;
}

export async function loadPlayer() {
  const snap = await Net._fb.get(R(playerPath()));
  return snap.exists() ? snap.val() : null;
}

// Set by savePlayer so the UI can say when the cloud has stopped accepting
// writes instead of pretending everything is fine.
export const SaveState = { lastOk: 0, lastError: null, throttled: false };

export async function savePlayer(state, season, seasonRet) {
  const { update, set } = Net._fb;
  const payload = {
    name: state.name, nameLower: (state.name || '').toLowerCase(),
    cash: state.cash, created: state.created || Date.now(),
    updated: Date.now(), netWorth: state.netWorth || 0,
    holdings: state.holdings || {}, props: state.props || {},
    alts: state.alts || {}, bonds: state.bonds || {}, collect: state.collect || {},
    countries: state.countries || {}, options: state.options || {},
    bets: (state.bets || []).slice(0, 40),
    films: state.films || {}, street: state.street || {},
    shorts: state.shorts || {}, loan: state.loan || { principal: 0, last: Date.now() },
    orders: (state.orders || []).filter(o => o.status === 'open').slice(0, 20),
    season: state.season || null, startNetWorth: state.startNetWorth || 0,
    startIndex: state.startIndex || 0,
    savings: state.savings || { balance: 0, last: Date.now() },
    startups: state.startups || {}, lastDividend: state.lastDividend || Date.now(),
    watch: state.watch || {}, stats: state.stats || {},
  };
  try {
    await update(R(playerPath()), payload);
    SaveState.lastOk = Date.now();
    SaveState.lastError = null;
  } catch (e) {
    SaveState.lastError = e.message || String(e);
    throw e;
  }

  // The board is rate limited on the server to make console-edited net worths
  // hard to post. A refusal here is not a broken save, so it is reported
  // separately rather than as a failure.
  try {
    await set(R('leaderboard/' + season + '/' + slotKey()), {
      name: state.name,
      netWorth: Math.round(state.netWorth || 0),
      ret: Math.round((seasonRet || 0) * 100) / 100,
      ts: Date.now(),
    });
    SaveState.throttled = false;
  } catch (e) {
    SaveState.throttled = true;
  }
}

// A small public card about a player: enough for someone to see how you are
// doing without exposing your whole book.
export async function saveProfile(profile) {
  if (!Net.online) return;
  const { set } = Net._fb;
  try {
    await set(R('profiles/' + slotKey()), { ...profile, ts: Date.now() });
  } catch (e) { /* a profile is optional; never break the save over it */ }
}

export async function loadProfile(key) {
  if (!Net.online) return null;
  const snap = await Net._fb.get(R('profiles/' + key));
  return snap.exists() ? snap.val() : null;
}

// ---- market flow (global multiplayer price impact) ---------------------
export function bumpFlow(assetId, units) {
  if (!Net.online) return;
  const { runTransaction } = Net._fb;
  runTransaction(R('market/flow/' + encodeKey(assetId)), cur => {
    const next = (cur || 0) + units;
    // Flow decays naturally because we clamp it; keeps one whale from owning a stock forever.
    return Math.max(-5e9, Math.min(5e9, next));
  }).catch(() => {});
}

export function watchFlow(cb) {
  if (!Net.online) return () => {};
  const { onValue } = Net._fb;
  const un = onValue(R('market/flow'), snap => {
    const raw = snap.val() || {};
    const out = Object.create(null);
    for (const k in raw) out[decodeKey(k)] = raw[k];
    cb(out);
  });
  Net._listeners.push(un);
  return un;
}

// ---- leaderboard -------------------------------------------------------
export function watchLeaderboard(season, cb, n = 50) {
  if (!Net.online) return () => {};
  const { onValue, query, orderByChild, limitToLast } = Net._fb;
  const q = query(R('leaderboard/' + season), orderByChild('ret'), limitToLast(n));
  const un = onValue(q, snap => {
    const rows = [];
    snap.forEach(c => { rows.push({ uid: c.key, ...c.val() }); });
    rows.sort((a, b) => (b.ret || 0) - (a.ret || 0));
    cb(rows);
  });
  Net._listeners.push(un);
  return un;
}

// One-off read of a finished season, for the archive.
export async function loadSeason(season, n = 25) {
  if (!Net.online) return [];
  const { get, query, orderByChild, limitToLast } = Net._fb;
  const snap = await get(query(R('leaderboard/' + season), orderByChild('ret'), limitToLast(n)));
  const rows = [];
  snap.forEach(c => { rows.push({ uid: c.key, ...c.val() }); });
  return rows.sort((a, b) => (b.ret || 0) - (a.ret || 0));
}

// ---- trade feed --------------------------------------------------------
export function postFeed(entry) {
  if (!Net.online) return;
  const { push, set } = Net._fb;
  set(push(R('feed')), { ...entry, uid: Net.uid, ts: Date.now() }).catch(() => {});
}

export function watchFeed(cb, n = 30) {
  if (!Net.online) return () => {};
  const { onValue, query, orderByChild, limitToLast } = Net._fb;
  const q = query(R('feed'), orderByChild('ts'), limitToLast(n));
  const un = onValue(q, snap => {
    const rows = [];
    snap.forEach(c => { rows.push({ key: c.key, ...c.val() }); });
    cb(rows.reverse());
  });
  Net._listeners.push(un);
  return un;
}

// ---- player-to-player transfers ---------------------------------------
export async function findUid(username) {
  const snap = await Net._fb.get(R('usernames/' + username.toLowerCase()));
  return snap.exists() ? snap.val() : null;
}

export async function sendTransfer(toKey, payload) {
  const { push, set } = Net._fb;
  const { uid, slot } = splitKey(toKey);
  await set(push(R(playerPath(uid, slot) + '/inbox')), {
    ...payload, from: Net.uid, fromName: Net.name, ts: Date.now(),
  });
}

export function watchInbox(cb) {
  if (!Net.online) return () => {};
  const { onValue } = Net._fb;
  const un = onValue(R(playerPath() + '/inbox'), snap => {
    const items = [];
    snap.forEach(c => { items.push({ key: c.key, ...c.val() }); });
    if (items.length) cb(items);
  });
  Net._listeners.push(un);
  return un;
}

export async function clearInbox(keys) {
  const { update } = Net._fb;
  const patch = {};
  for (const k of keys) patch[k] = null;
  await update(R(playerPath() + '/inbox'), patch);
}

// ---- presence ----------------------------------------------------------
// Who is on the server right now. onDisconnect clears the entry server side,
// so a closed tab does not leave a ghost behind.
let presenceTimer = null;
export function joinPresence(name) {
  if (!Net.online) return;
  const { ref, set, onDisconnect } = Net._fb;
  const mine = ref(Net._db, 'presence/' + slotKey());
  onDisconnect(mine).remove();
  set(mine, { name, ts: Date.now() }).catch(() => {});
  if (presenceTimer) clearInterval(presenceTimer);   // never stack heartbeats
  presenceTimer = setInterval(() => set(mine, { name, ts: Date.now() }).catch(() => {}), 60000);
}

export function watchPresence(cb) {
  if (!Net.online) return () => {};
  const { onValue } = Net._fb;
  const un = onValue(R('presence'), snap => {
    const cutoff = Date.now() - 5 * 60000;
    const rows = [];
    snap.forEach(c => { const v = c.val() || {}; if ((v.ts || 0) > cutoff) rows.push(v.name || 'anon'); });
    cb(rows);
  });
  Net._listeners.push(un);
  return un;
}

// ---- bug reports -------------------------------------------------------
// Players file reports from inside the game; they land in /reports where the
// developer can read them. Write-only for everyone but the report's author.
// A report has to reach the developer whether or not you are playing online.
// Solo players get a second, quiet Firebase connection used only for this: it
// never touches your save, your presence or the leaderboard.
let reporter = null;

async function reporterLink() {
  if (Net.online) return { fb: Net._fb, db: Net._db, uid: Net.uid };
  if (reporter) return reporter;
  const cfg = loadConfig();
  if (!cfg) throw new Error('no server configured');
  const [app, auth, db] = await Promise.all([
    import(CDN + 'firebase-app.js'),
    import(CDN + 'firebase-auth.js'),
    import(CDN + 'firebase-database.js'),
  ]);
  const appInst = app.initializeApp(cfg, 'reporter');
  const cred = await auth.signInAnonymously(auth.getAuth(appInst));
  reporter = { fb: { ...app, ...auth, ...db }, db: db.getDatabase(appInst), uid: cred.user.uid };
  return reporter;
}

export async function submitReport(report) {
  const link = await reporterLink();
  const { push, set, ref } = link.fb;
  await set(push(ref(link.db, 'reports')), {
    ...report, uid: link.uid, name: Net.name || report.name || 'anon', ts: Date.now(),
  });
}

// ---- chat --------------------------------------------------------------
export async function sendChat(text) {
  if (!Net.online) throw new Error('You are playing solo, so there is nobody to chat to.');
  const { push, set } = Net._fb;
  await set(push(R('chat')), {
    name: Net.name || 'anon', uid: Net.uid,
    text: text.slice(0, 200), ts: Date.now(),
  });
}

// Ordered by key rather than by a ts index. Push ids are already chronological,
// and the indexed version was quietly returning a stale, partial view of the
// room: messages wrote fine and were readable one by one, but the collection
// listener never showed them. That is what "chat is not working" looked like.
export function watchChat(cb, n = 60) {
  if (!Net.online) return () => {};
  const { onValue, query, limitToLast } = Net._fb;
  const un = onValue(query(R('chat'), limitToLast(n)), snap => {
    const rows = [];
    snap.forEach(c => { rows.push({ key: c.key, ...c.val() }); });
    rows.sort((a, b) => (a.ts || 0) - (b.ts || 0));
    cb(rows);
  }, err => console.warn('chat listener:', err && err.message));
  Net._listeners.push(un);
  return un;
}

// Firebase keys cannot contain . $ # [ ] /
export const encodeKey = k => k.replace(/[.$#\[\]\/]/g, '_');
const decodeMap = new Map();
export function decodeKey(k) { return decodeMap.get(k) || k; }
export function registerKeys(ids) { for (const id of ids) decodeMap.set(encodeKey(id), id); }
