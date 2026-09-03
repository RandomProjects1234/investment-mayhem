# Roadmap

## Next up — v1.5: Orders and leverage

### Limit and stop orders

Resting orders that fill when the price crosses them. The price curve is a pure function of time, so an order can be checked against every tick since you placed it and filled at the exact tick it triggered, even if you had the tab closed.

### Short selling

Borrow shares, sell them, buy them back. Needs a borrow fee and a forced buy-in when a position runs away from you.

### Margin and loans

Borrow against your portfolio at an interest rate tied to the policy rate that now exists, with a maintenance requirement and a real margin call.

### An earnings calendar

Company shocks currently arrive unannounced. Scheduling them per company and showing the date turns news from weather into something you can trade ahead of.

### Everything reported since v1.4

Bug reports are read before every release. Whatever comes in through the report button gets triaged here and fixed items are listed in this log.

### Portfolio analytics

Best and worst trade, per-sector exposure, return against the index rather than against zero.

## Further out

- **Server-authoritative trading** — Move buy and sell into a Cloud Function so the leaderboard cannot be edited from the browser console. The rest of the architecture does not have to change.
- **Weekly seasons** — The leaderboard resets on a schedule and past seasons are archived, so a player who joins late still has something to win.
- **Property depth** — Mortgages, renovations that raise rent, and tenants who leave.
- **Options** — Simple calls and puts on the larger names, priced off the same curve.
- **Mobile layout** — The tables work on a phone, but they were designed for a wide screen.

---

Generated from `js/changelog.js` by `node tools/release.mjs`.