// Network layer. Wraps Firebase Realtime Database behind a tiny interface so
// the game also runs fully offline (solo mode) with the exact same API.
//
// Firebase SDK is imported dynamically, so nothing is fetched in solo mode.

const CDN = 'https://www.gstatic.com/firebasejs/10.12.5/';

export const Net = {
  online: false,
  uid: null,
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

// ---- profile / username ------------------------------------------------
export async function claimUsername(name) {
  const key = name.toLowerCase();
  const { get, set } = Net._fb;
  const snap = await get(R('usernames/' + key));
  if (snap.exists() && snap.val() !== Net.uid) {
    throw new Error('That username is already taken on this server.');
  }
  await set(R('usernames/' + key), Net.uid);
  Net.name = name;
  return true;
}

export async function loadPlayer() {
  const snap = await Net._fb.get(R('players/' + Net.uid));
  return snap.exists() ? snap.val() : null;
}

export async function savePlayer(state) {
  const { update, set } = Net._fb;
  const payload = {
    name: state.name, nameLower: (state.name || '').toLowerCase(),
    cash: state.cash, created: state.created || Date.now(),
    updated: Date.now(), netWorth: state.netWorth || 0,
    holdings: state.holdings || {}, props: state.props || {},
    alts: state.alts || {}, bonds: state.bonds || {}, collect: state.collect || {},
    savings: state.savings || { balance: 0, last: Date.now() },
    startups: state.startups || {}, lastDividend: state.lastDividend || Date.now(),
    watch: state.watch || {}, stats: state.stats || {},
  };
  await update(R('players/' + Net.uid), payload);
  await set(R('leaderboard/' + Net.uid), {
    name: state.name, netWorth: Math.round(state.netWorth || 0), ts: Date.now(),
  });
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
export function watchLeaderboard(cb, n = 50) {
  if (!Net.online) return () => {};
  const { onValue, query, orderByChild, limitToLast } = Net._fb;
  const q = query(R('leaderboard'), orderByChild('netWorth'), limitToLast(n));
  const un = onValue(q, snap => {
    const rows = [];
    snap.forEach(c => { rows.push({ uid: c.key, ...c.val() }); });
    rows.sort((a, b) => b.netWorth - a.netWorth);
    cb(rows);
  });
  Net._listeners.push(un);
  return un;
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
    snap.forEach(c => rows.push({ key: c.key, ...c.val() }));
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

export async function sendTransfer(toUid, payload) {
  const { push, set } = Net._fb;
  await set(push(R('players/' + toUid + '/inbox')), {
    ...payload, from: Net.uid, fromName: Net.name, ts: Date.now(),
  });
}

export function watchInbox(cb) {
  if (!Net.online) return () => {};
  const { onValue } = Net._fb;
  const un = onValue(R('players/' + Net.uid + '/inbox'), snap => {
    const items = [];
    snap.forEach(c => items.push({ key: c.key, ...c.val() }));
    if (items.length) cb(items);
  });
  Net._listeners.push(un);
  return un;
}

export async function clearInbox(keys) {
  const { update } = Net._fb;
  const patch = {};
  for (const k of keys) patch[k] = null;
  await update(R('players/' + Net.uid + '/inbox'), patch);
}

// ---- presence ----------------------------------------------------------
// Who is on the server right now. onDisconnect clears the entry server side,
// so a closed tab does not leave a ghost behind.
export function joinPresence(name) {
  if (!Net.online) return;
  const { ref, set, onDisconnect, serverTimestamp } = Net._fb;
  const mine = ref(Net._db, 'presence/' + Net.uid);
  onDisconnect(mine).remove();
  set(mine, { name, ts: Date.now() }).catch(() => {});
  setInterval(() => set(mine, { name, ts: Date.now() }).catch(() => {}), 60000);
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
export async function submitReport(report) {
  if (!Net.online) throw new Error('offline');
  const { push, set } = Net._fb;
  await set(push(R('reports')), {
    ...report, uid: Net.uid, name: Net.name || 'anon', ts: Date.now(),
  });
}

// ---- chat --------------------------------------------------------------
export function sendChat(text) {
  if (!Net.online) return;
  const { push, set } = Net._fb;
  set(push(R('chat')), { name: Net.name, uid: Net.uid, text: text.slice(0, 200), ts: Date.now() }).catch(() => {});
}

export function watchChat(cb, n = 40) {
  if (!Net.online) return () => {};
  const { onValue, query, orderByChild, limitToLast } = Net._fb;
  const un = onValue(query(R('chat'), orderByChild('ts'), limitToLast(n)), snap => {
    const rows = []; snap.forEach(c => rows.push({ key: c.key, ...c.val() })); cb(rows);
  });
  Net._listeners.push(un);
  return un;
}

// Firebase keys cannot contain . $ # [ ] /
export const encodeKey = k => k.replace(/[.$#\[\]\/]/g, '_');
const decodeMap = new Map();
export function decodeKey(k) { return decodeMap.get(k) || k; }
export function registerKeys(ids) { for (const id of ids) decodeMap.set(encodeKey(id), id); }
