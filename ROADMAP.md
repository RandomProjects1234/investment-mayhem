# Roadmap

## Next up — v1.2: Orders and leverage

### Limit and stop orders

Resting orders that fill when the price crosses them. The price curve is a pure function of time, so an order can be checked against every tick since you placed it and filled at the exact tick it triggered, even if you had the tab closed.

### Short selling

Borrow shares, sell them, buy them back. Needs a borrow fee and a forced buy-in when a position runs away from you.

### Margin and loans

Borrow against your portfolio at an interest rate, with a maintenance requirement and a real margin call. Leverage is the fastest way to make the leaderboard interesting.

### An earnings calendar

Company shocks currently arrive unannounced. Scheduling them per company and showing the date turns news from weather into something you can trade ahead of.

### Portfolio analytics

Best and worst trade, per-sector exposure, return against the index rather than against zero.

### Weekly seasons

The leaderboard resets on a schedule and past seasons are archived, so a player who joins on day nine still has something to win.

## Further out

- **Server-authoritative trading** — Move buy and sell into a Cloud Function so the leaderboard cannot be edited from the browser console. The rest of the architecture does not have to change.
- **Property depth** — Mortgages, renovations that raise rent, and tenants who leave.
- **Bonds and a rate cycle** — A policy rate that moves, pays cash, and pushes the sectors around the way real rates do.
- **Options** — Simple calls and puts on the larger names, priced off the same curve.
- **Mobile layout** — The tables work on a phone, but they were designed for a wide screen.

---

Generated from `js/changelog.js` by `node tools/gen-docs.mjs`.