# Changelog

All notable changes to [Investment Mayhem](https://randomprojects1234.github.io/investment-mayhem/). Current build: **v1.21**.

This file is generated from `js/changelog.js`, which is also what the in-game
update log reads — click the version badge in the corner. Edit that file, then
run `node tools/release.mjs`.

## v1.21 — Investment Mayhem
*2026-09-03*

- **New** — The game is now called Investment Mayhem. New name in the header, the tab title and the market index; the site moved to /investment-mayhem/ and the old link redirects.
- **Fix** — Saves, watchlists and cloud profiles carry across the rename untouched. The world seed is deliberately unchanged, so every property and collectible is the same one you owned yesterday.

## v1.20 — Bonds, savings, collectibles and bug reports
*2026-09-03*

- **New** — Bonds. Eight of them, from a 2 year treasury to high yield corporate debt. Prices move against a central bank policy rate, scaled by duration, and each one pays its coupon every minute.
- **New** — A savings account. Cash parked there is never at risk and earns interest that follows the policy rate. Safe, and deliberately slower than the market.
- **New** — Collectibles. Twenty-four lots across art, watches, cards, wine and curiosities. They barely notice the stock market and sell 9% below the quoted value, because illiquidity should cost you something.
- **New** — Twelve more cryptocurrencies and ten more commodities.
- **New** — Report a bug from inside the game. Reports go to the server for the developer to read, and every report also has a one-click GitHub issue link. Fixes appear in this log.
- **New** — Live player count in the header, backed by real presence, and a join link that lets a host share their world without anyone else touching Firebase.
- **Fix** — Progress is now saved after every trade, when the tab is hidden, and when it closes, instead of only every five seconds.
- **Fix** — A cloud save can no longer overwrite newer local progress on refresh. Whichever is newer wins.
- **Fix** — Income earned while you were away is capped at four hours. Coming back after a week no longer pays out a fortune in dividends, rent and interest.
- **Fix** — Positions in an asset removed by an update are refunded at cost instead of silently vanishing. Crypto tickers changed in this release, so old holdings are paid back.
- **Fix** — The watchlist, savings, bonds and collectibles are all written to the cloud save. Previously the watchlist was dropped.
- **Fix** — Every module import carries the version, so a release can no longer leave a browser running a half-updated mix of cached files. This was breaking real deploys.
- **Fix** — Buying a property from its detail window now updates the property table behind it, and rent can be collected straight from the portfolio.
- **Fix** — Fractional orders are rejected for assets that do not support them, instead of quietly creating a third of a share.

## v1.10 — Update log
*2026-09-03*

- **New** — Click the version badge in the corner, or "what's new" on the login card, for the full update log and what is coming next.
- **New** — CHANGELOG.md and ROADMAP.md in the repo, generated from the same data the game reads.
- **Fix** — Index funds no longer show up in the news feed as if they were a sector.
- **Fix** — The trade box remembers whether you were working in shares or dollars, across assets and across reloads.

## v1.1 — Real companies
*2026-09-03*

- **New** — 624 real listed companies across 11 sectors replace the invented universe. Tickers and names are real; every price is simulated.
- **New** — Volatility, market beta and dividend policy are derived from each company sector and size class, so a utility behaves like a utility.
- **New** — 10 index funds (SPY, QQQ, DIA, IWM, VTI and sector funds) priced from their own holdings, so they genuinely track the basket.
- **New** — Watchlist stars, with Watchlist and Owned filters on the stocks table.
- **New** — Sector heat strip across the top of the stocks tab. Click a sector to filter.
- **New** — Orders can be placed in dollars instead of share counts.
- **New** — Net worth chart on the portfolio, sampled every 15 seconds against your starting bankroll.
- **Tuning** — Market and sector swings halved. Twenty-minute sector moves went from an absurd -35% to a believable range.
- **Fix** — The price function is memoised per asset and tick, which matters now that a fund re-prices 40 members per chart frame.

## v1.0 — First public build
*2026-09-03*

- **New** — A market that nobody simulates: price is a pure function of (asset, tick), so every browser draws the identical chart with no server.
- **New** — Stocks, real estate across 7 districts, crypto, commodities and rotating angel deals.
- **New** — Firebase multiplayer: live net worth leaderboard, trade tape, chat, and cash or share transfers by username.
- **New** — Global market impact. The net units all players hold nudge the price for everyone, capped at plus or minus 22%.
- **New** — Solo mode with no backend at all, so the game runs before you own a Firebase project.
