# Roadmap

## Next up — v1.9: The cup

### Champions league investing

Asked for by theasoltani-afk: back teams to score the most goals, to reach a final, and to win the thing, with the rounds simulated. A 32 team knockout, a new edition every few hours, and odds set from team strength.

### A result nobody can look up in advance

Every price here is a function of time, so a player reading the source could work out a match before betting on it. Each round will instead be settled from a seed written to the database at kickoff, which cannot be overwritten once it exists. The cost is that cup betting needs an online server, and the game will say so rather than quietly taking a solo bet.

### Price alerts

Tell the game to shout when something crosses a level. The order engine already replays the ticks you missed, so an alert can tell you what happened while you were away.

### A first run walkthrough

There is a lot in here now. A new player deserves a guided first ten minutes.

## Further out

- **Server-authoritative trading** — The honest fix for cheating: run buy and sell inside a Cloud Function so a browser cannot invent a net worth. It needs Firebase on the paid plan, so it is a decision to make rather than a thing to code.
- **Trade history export** — Take your fills away as a file.
- **Bots** — A few simulated traders so a quiet server still has a market worth beating.

---

Generated from `js/changelog.js` by `node tools/release.mjs`.