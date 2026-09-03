// Release history and roadmap. Rendered in-game (click the version badge) and
// mirrored in CHANGELOG.md / ROADMAP.md so the repo tells the same story.

export const VERSION = 'v1.21';

export const RELEASES = [
  {
    version: 'v1.21',
    date: '2026-09-03',
    title: 'Investment Mayhem',
    items: [
      ['new', 'The game is now called Investment Mayhem. New name in the header, the tab title and the market index; the site moved to /investment-mayhem/ and the old link redirects.'],
      ['fix', 'Saves, watchlists and cloud profiles carry across the rename untouched. The world seed is deliberately unchanged, so every property and collectible is the same one you owned yesterday.'],
    ],
  },
  {
    version: 'v1.20',
    date: '2026-09-03',
    title: 'Bonds, savings, collectibles and bug reports',
    items: [
      ['new', 'Bonds. Eight of them, from a 2 year treasury to high yield corporate debt. Prices move against a central bank policy rate, scaled by duration, and each one pays its coupon every minute.'],
      ['new', 'A savings account. Cash parked there is never at risk and earns interest that follows the policy rate. Safe, and deliberately slower than the market.'],
      ['new', 'Collectibles. Twenty-four lots across art, watches, cards, wine and curiosities. They barely notice the stock market and sell 9% below the quoted value, because illiquidity should cost you something.'],
      ['new', 'Twelve more cryptocurrencies and ten more commodities.'],
      ['new', 'Report a bug from inside the game. Reports go to the server for the developer to read, and every report also has a one-click GitHub issue link. Fixes appear in this log.'],
      ['new', 'Live player count in the header, backed by real presence, and a join link that lets a host share their world without anyone else touching Firebase.'],
      ['fix', 'Progress is now saved after every trade, when the tab is hidden, and when it closes, instead of only every five seconds.'],
      ['fix', 'A cloud save can no longer overwrite newer local progress on refresh. Whichever is newer wins.'],
      ['fix', 'Income earned while you were away is capped at four hours. Coming back after a week no longer pays out a fortune in dividends, rent and interest.'],
      ['fix', 'Positions in an asset removed by an update are refunded at cost instead of silently vanishing. Crypto tickers changed in this release, so old holdings are paid back.'],
      ['fix', 'The watchlist, savings, bonds and collectibles are all written to the cloud save. Previously the watchlist was dropped.'],
      ['fix', 'Every module import carries the version, so a release can no longer leave a browser running a half-updated mix of cached files. This was breaking real deploys.'],
      ['fix', 'Buying a property from its detail window now updates the property table behind it, and rent can be collected straight from the portfolio.'],
      ['fix', 'Fractional orders are rejected for assets that do not support them, instead of quietly creating a third of a share.'],
    ],
  },
  {
    version: 'v1.10',
    date: '2026-09-03',
    title: 'Update log',
    items: [
      ['new', 'Click the version badge in the corner, or "what\'s new" on the login card, for the full update log and what is coming next.'],
      ['new', 'CHANGELOG.md and ROADMAP.md in the repo, generated from the same data the game reads.'],
      ['fix', 'Index funds no longer show up in the news feed as if they were a sector.'],
      ['fix', 'The trade box remembers whether you were working in shares or dollars, across assets and across reloads.'],
    ],
  },
  {
    version: 'v1.1',
    date: '2026-09-03',
    title: 'Real companies',
    items: [
      ['new', '624 real listed companies across 11 sectors replace the invented universe. Tickers and names are real; every price is simulated.'],
      ['new', 'Volatility, market beta and dividend policy are derived from each company sector and size class, so a utility behaves like a utility.'],
      ['new', '10 index funds (SPY, QQQ, DIA, IWM, VTI and sector funds) priced from their own holdings, so they genuinely track the basket.'],
      ['new', 'Watchlist stars, with Watchlist and Owned filters on the stocks table.'],
      ['new', 'Sector heat strip across the top of the stocks tab. Click a sector to filter.'],
      ['new', 'Orders can be placed in dollars instead of share counts.'],
      ['new', 'Net worth chart on the portfolio, sampled every 15 seconds against your starting bankroll.'],
      ['bal', 'Market and sector swings halved. Twenty-minute sector moves went from an absurd -35% to a believable range.'],
      ['fix', 'The price function is memoised per asset and tick, which matters now that a fund re-prices 40 members per chart frame.'],
    ],
  },
  {
    version: 'v1.0',
    date: '2026-09-03',
    title: 'First public build',
    items: [
      ['new', 'A market that nobody simulates: price is a pure function of (asset, tick), so every browser draws the identical chart with no server.'],
      ['new', 'Stocks, real estate across 7 districts, crypto, commodities and rotating angel deals.'],
      ['new', 'Firebase multiplayer: live net worth leaderboard, trade tape, chat, and cash or share transfers by username.'],
      ['new', 'Global market impact. The net units all players hold nudge the price for everyone, capped at plus or minus 22%.'],
      ['new', 'Solo mode with no backend at all, so the game runs before you own a Firebase project.'],
    ],
  },
];

// What the next update is aiming at. Ordered by what would change the game most.
export const NEXT = {
  version: 'v1.3',
  title: 'Orders and leverage',
  items: [
    ['Limit and stop orders',
     'Resting orders that fill when the price crosses them. The price curve is a pure function of time, so an order can be checked against every tick since you placed it and filled at the exact tick it triggered, even if you had the tab closed.'],
    ['Short selling',
     'Borrow shares, sell them, buy them back. Needs a borrow fee and a forced buy-in when a position runs away from you.'],
    ['Margin and loans',
     'Borrow against your portfolio at an interest rate tied to the policy rate that now exists, with a maintenance requirement and a real margin call.'],
    ['An earnings calendar',
     'Company shocks currently arrive unannounced. Scheduling them per company and showing the date turns news from weather into something you can trade ahead of.'],
    ['Everything reported since v1.20',
     'Bug reports are read before every release. Whatever comes in through the report button gets triaged here and fixed items are listed in this log.'],
    ['Portfolio analytics',
     'Best and worst trade, per-sector exposure, return against the index rather than against zero.'],
  ],
  later: [
    ['Server-authoritative trading',
     'Move buy and sell into a Cloud Function so the leaderboard cannot be edited from the browser console. The rest of the architecture does not have to change.'],
    ['Weekly seasons', 'The leaderboard resets on a schedule and past seasons are archived, so a player who joins late still has something to win.'],
    ['Property depth', 'Mortgages, renovations that raise rent, and tenants who leave.'],
    ['Options', 'Simple calls and puts on the larger names, priced off the same curve.'],
    ['Mobile layout', 'The tables work on a phone, but they were designed for a wide screen.'],
  ],
};
