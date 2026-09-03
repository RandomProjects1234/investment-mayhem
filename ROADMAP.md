# Roadmap

## Next up — v1.8: Alerts and a smoother first hour

### Price alerts

Tell the game to shout when something crosses a level, instead of you sitting and watching for it. The order engine already replays missed ticks, so an alert can tell you what happened while you were away.

### A first run walkthrough

There is a lot here now: stocks, funds, property, bonds, savings, collectibles, countries, angel deals, orders, shorts, margin and options. A new player deserves a guided first ten minutes.

### Trade history you can take with you

Export your fills, so a season can be argued about properly.

### Sector and country detail pages

A page per sector and per country, with its members, its news and how it has moved.

### Everything reported since v1.7

Reports are read before every release and reported back to the developer. The country market came from one. Keep them coming through the Report a bug button.

## Further out

- **Server-authoritative trading** — The honest fix for cheating: run buy and sell inside a Cloud Function so a browser cannot invent a net worth. It needs Firebase on the paid Blaze plan, so it is a decision to make rather than a thing to code.
- **Dividend reinvestment** — Let income buy more of what paid it, automatically.
- **Bots** — A few simulated traders so a quiet server still has a market and a leaderboard worth beating.

---

Generated from `js/changelog.js` by `node tools/release.mjs`.