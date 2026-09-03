# Ledger City — a multiplayer investing sim on GitHub Pages

**Play it: <https://randomprojects1234.github.io/ledger-city/>** &nbsp;·&nbsp; version **v1.0**

Pure static frontend (HTML + CSS + ES modules, no build step) with Firebase
Realtime Database as the only backend. 640 fictional companies across 12 sectors,
260 properties, 12 cryptos, 8 commodities, and a rotating slate of angel deals.

## Architecture

```
        browser (GitHub Pages, static)                Firebase (serverless)
  ┌───────────────────────────────────────┐     ┌───────────────────────────────┐
  │ data.js   procedural universe          │     │ Anonymous Auth  → uid         │
  │           (640 co. from one seed)      │     ├───────────────────────────────┤
  │ market.js price(asset, tick)  ← pure   │◄────┤ /market/flow/{asset}  net units│
  │ game.js   portfolio, rules, loop       │     │ /players/{uid}        savegame │
  │ ui.js     rendering                    │────►│ /players/{uid}/inbox  transfers│
  │ net.js    Firebase adapter (dynamic    │     │ /leaderboard/{uid}    net worth│
  │           import; solo mode if absent) │     │ /feed, /chat          social   │
  └───────────────────────────────────────┘     └───────────────────────────────┘
```

The key trick: **nobody simulates the market.** `priceAt(asset, tick)` is a pure
function of the asset's seed and the tick index, where `tick = floor(Date.now() / 3000)`.
Layered value noise (market factor × beta + sector factor + idiosyncratic noise)
plus a handful of decaying hash-drawn shock events give a price that looks like a
random walk but is computed in O(1) — no history to store, no server to run, and
every player's chart matches to the last cent.

The one shared term is `/market/flow/{assetId}`: the net units all players hold.
It is bumped with a Firebase transaction on every trade and folded into the price
as `tanh(net / scale) * 0.22`, so a crowded trade really does inflate the tape
globally (capped at ±22% so one whale can't own an asset outright).

## Running locally

ES modules need HTTP — `file://` will not work.

```bash
python -m http.server 3491
```

Then open <http://localhost:3491>. (Windows: `Start Ledger City.bat` in the parent folder.)

## Deploying to GitHub Pages

1. Push this folder to a repo (or copy it into `docs/`).
2. Settings → Pages → deploy from branch, `/` or `/docs`.
3. Add your Pages domain under Firebase → Authentication → Settings → Authorized domains.

## Firebase setup

1. Create a project, then **Realtime Database** (not Firestore — the rules here are RTDB).
2. Authentication → Sign-in method → enable **Anonymous**.
3. Paste your web config into `firebase-config.js`, or leave the placeholders and
   let each player paste theirs into the in-game "Server settings" box.
   A web `apiKey` is not a secret; access is controlled by the rules below.
4. Publish `database.rules.json` (Database → Rules, or `firebase deploy --only database`).

### What the rules enforce

| Path | Read | Write |
|---|---|---|
| `/usernames/{name}` | public | claim only if free or already yours; must equal your uid |
| `/players/{uid}` | owner only | owner only; cash/netWorth must be sane numbers |
| `/players/{uid}/inbox` | owner only | anyone signed in may *add* a transfer stamped with their own uid; only the owner reads or deletes |
| `/leaderboard/{uid}` | public | owner only, shape-validated, indexed on `netWorth` |
| `/market/flow/{asset}` | public | any signed-in player, clamped to ±5e9 |
| `/feed`, `/chat` | public | append-only, must carry your own uid, length-capped |

**Honest limitation:** this is a client-authoritative game. The rules stop players
from editing *other people's* data, spoofing identities, or writing garbage shapes,
but a determined player can still edit their own savegame in the console. That is
the price of having no server. If you ever want real integrity, move `buy`/`sell`
into a Cloud Function and make `/players` write-only through it — the rest of the
architecture does not change.

## Game rules at a glance

- Start with **$100,000**. 0.2% commission on trades, 3% closing cost on property, 2% on sale.
- **Stocks** — 640 companies, 12 sectors, market/sector/idiosyncratic noise + shock events.
  Dividend payers credit cash every real minute (1 minute = 1 simulated week).
- **Real estate** — 7 districts × 3 types. Value drifts slowly; net rent accrues per
  real minute (capped at 12h of uncollected rent) and is claimed with **Collect rent**.
- **Alternatives** — crypto (violent, fast) and commodities (slower, market-correlated).
  Fractional units allowed.
- **Angel** — a new slate of 8 startups every ~10 minutes. Most return zero; the
  extreme-risk tier pays up to ~45x. Outcomes are a deterministic hash, fixed the
  moment the deal is generated, and revealed at maturity.
- **Players** — live net-worth leaderboard, trade tape, chat, and cash/asset transfers by username.

## Files

| File | Role |
|---|---|
| `index.html` / `style.css` | shell and dark trading-terminal theme |
| `js/rng.js` | hashing, seeded PRNG, value noise / fbm |
| `js/data.js` | procedural companies, properties, alts, startups |
| `js/market.js` | pricing, events, news, flow impact |
| `js/game.js` | state, trading rules, valuation, main loop |
| `js/ui.js` | all rendering, charts, modal |
| `js/net.js` | Firebase adapter + solo fallback |
| `js/main.js` | login screen and wiring |
| `database.rules.json` | RTDB security rules |

Debug hook: `window.IS` exposes `{ G, Net, UI }` in the console.
