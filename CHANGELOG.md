# Changelog

All notable changes to [Investment Mayhem](https://randomprojects1234.github.io/investment-mayhem/). Current build: **v1.5**.

This file is generated from `js/changelog.js`, which is also what the in-game
update log reads — click the version badge in the corner. Edit that file, then
run `node tools/release.mjs`.

## v1.5 — Countries, phones, and the first player report
*2026-09-03*

- **New** — Invest in countries. 54 national economies, quoted at GDP per capita, compounding at that country growth rate and paying a yield every minute. Rich economies grow slowly and pay more; emerging ones do the opposite. Straight from a player report by Yesman: invest in every single country, and invest in their GDP per capita.
- **New** — A real phone layout. The same report came from a 384 pixel screen, so the header, the tab bar and every table now have a narrow layout instead of a squeezed desktop one. Each table keeps the three columns that matter and the tab bar scrolls.
- **New** — The portfolio now shows coupons, savings interest and sovereign yield alongside dividends, so every income stream is visible.
- **Fix** — Cash could end a trade at a value like -0.0000000001, which the security rules reject, silently stopping every cloud save from then on. It is clamped now, and the status pill says "cloud save failing" if the server ever refuses a write instead of quietly pretending.
- **Fix** — Going online for the first time no longer replaces your solo game with a fresh 100,000. Your solo progress comes with you.
- **Fix** — A transfer could be credited twice if the delete that clears it failed. Claimed transfers are now remembered.
- **Fix** — A failed sign-in left the game believing it was connected, so solo play kept trying to write to the server.
- **Fix** — Two collectibles shared the ticker FIRST, which made them ambiguous when sending assets by ticker. Collectible tickers are unique now.
- **Fix** — The presence heartbeat could stack up duplicate timers on a reconnect.
- **Fix** — A country detail window said "undefined" where its type should be, and its chart was drawn over too short a window to show anything but noise.
- **Tuning** — Country shocks toned down. An economy should not move like a meme coin.

## v1.4 — Investment Mayhem, and multiplayer is live
*2026-09-03*

- **New** — The game is now called Investment Mayhem. New name in the header, the tab title and the market index; the site moved to /investment-mayhem/ and the old link redirects.
- **New** — The server is live. Press Play online and you are on the public world: shared leaderboard, live trade tape, chat, player transfers, presence, and prices that everyone nudges together.
- **New** — Bug reports filed from the game now actually reach the developer instead of only saving to your device.
- **Fix** — The published security rules were rejected by Firebase because they carried "comment" keys, which are not valid rule nodes. Found while publishing them for real.
- **Tuning** — Version numbers now run 1.4, 1.5, 1.6 and so on up to 2.0, instead of the 1.10 / 1.20 style. Earlier builds have been relabelled to match: what shipped as v1.10 is v1.2 here, and v1.20 is v1.3.
- **Fix** — A username that is already taken now says so plainly instead of reporting it as a failure to connect.
- **Fix** — Saves, watchlists and cloud profiles carry across the rename untouched. The world seed is deliberately unchanged, so every property and collectible is the same one you owned before.

## v1.3 — Bonds, savings, collectibles and bug reports
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

## v1.2 — Update log
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
