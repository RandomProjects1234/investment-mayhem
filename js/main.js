// Entry point: login screen, Firebase wiring, then hand off to the game loop.
import * as G from './game.js';
import * as Net from './net.js';
import { UI } from './ui.js';
import { setFlow } from './market.js';

const $ = s => document.querySelector(s);

function showSetup() {
  $('#setup').hidden = false;
  const cfg = Net.loadConfig();
  $('#cfg-json').value = cfg ? JSON.stringify(cfg, null, 2) : '';
  $('#setup-status').textContent = cfg
    ? 'A Firebase config is saved on this device. Sign in to play online.'
    : 'No Firebase config found - you can still play solo on this device.';
  $('#name').value = localStorage.getItem('is_name') || '';
  $('#btn-online').addEventListener('click', () => start(true));
  $('#btn-solo').addEventListener('click', () => start(false));
  $('#cfg-toggle').addEventListener('click', () => { $('#cfg-box').hidden = !$('#cfg-box').hidden; });
  $('#cfg-save').addEventListener('click', () => {
    try {
      const raw = $('#cfg-json').value.trim()
        .replace(/^const\s+\w+\s*=\s*/, '').replace(/;?\s*$/, '');
      const obj = raw.startsWith('{') && !raw.startsWith('{"')
        ? JSON.parse(raw.replace(/([{,]\s*)([A-Za-z0-9_]+)\s*:/g, '$1"$2":').replace(/'/g, '"'))
        : JSON.parse(raw);
      if (!obj.apiKey || !obj.databaseURL) throw new Error('Config needs apiKey and databaseURL.');
      Net.saveConfig(obj);
      $('#setup-status').textContent = 'Config saved. Now sign in to play online.';
    } catch (e) {
      $('#setup-status').textContent = 'Could not read that config: ' + e.message;
    }
  });
}

async function start(online) {
  const name = ($('#name').value || '').trim();
  if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) {
    $('#setup-status').textContent = 'Pick a username: 3-16 letters, digits or underscores.';
    return;
  }
  localStorage.setItem('is_name', name);
  $('#setup-status').textContent = 'Loading market...';

  if (online) {
    const cfg = Net.loadConfig();
    if (!cfg) { $('#setup-status').textContent = 'Add a Firebase config first (Server settings below).'; return; }
    try {
      await Net.connect(cfg);
      await Net.claimUsername(name);
      G.loadLocal();
      const remote = await Net.loadPlayer();
      if (remote) G.adopt(remote);
      wireOnline();
      UI.setStatus('online as ' + name, true);
    } catch (e) {
      $('#setup-status').textContent = 'Could not connect: ' + e.message;
      return;
    }
  } else {
    G.loadLocal();
    UI.setStatus('solo (this device)', false);
  }

  G.state.name = name;
  $('#hdr-name').textContent = name;
  $('#setup').hidden = true;
  G.onTick(UI.refresh);
  UI.boot();
  G.startLoop();
}

function wireOnline() {
  Net.watchFlow(flow => setFlow(flow));
  Net.watchLeaderboard(rows => UI.setLeaderboard(rows));
  Net.watchFeed(rows => UI.setFeed(rows));
  Net.watchChat(rows => UI.setChat(rows));
  Net.watchInbox(async items => {
    const keys = G.receiveInbox(items);
    if (keys.length) { await Net.clearInbox(keys); G.saveLocal(); }
  });
  window.addEventListener('beforeunload', () => { G.saveLocal(); Net.savePlayer(G.state).catch(() => {}); });
}

showSetup();
window.IS = { G, Net, UI };   // debug hook
