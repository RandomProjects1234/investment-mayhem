# Roadmap

## Next up — v1.7: Seasons and a fairer market

### Weekly seasons

The leaderboard resets on a schedule and past seasons are archived, so somebody joining on day nine still has something to win.

### Server-authoritative trading

Move buy and sell into a Cloud Function so the leaderboard cannot be edited from the browser console. Nothing else about the architecture has to change.

### Options

Simple calls and puts on the larger names, priced off the same curve the rest of the game already uses.

### Property depth

Mortgages so you can lever a building, renovations that raise rent, and tenants who leave.

### Everything reported since v1.6

Reports are read before every release and reported back. The country market in v1.5 came from one, so keep them coming through the Report a bug button.

## Further out

- **Alerts** — Tell the game to shout when something crosses a price, instead of you watching for it.
- **Trade history export** — Take your fills away as a file.
- **Tutorial** — A first-run walkthrough, because there is a lot here now.

---

Generated from `js/changelog.js` by `node tools/release.mjs`.