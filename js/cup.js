// The Cup: a knockout football tournament you can invest in.
//
// Asked for twice through the report button - by theasoltani-afk ("make
// champions league investments... you will need to sim it anyway") and by
// Yesman ("invest on a team to win tournaments").
//
// Like the rest of the game the result is a pure function of the edition and
// the round, so every player watches the same tournament without a server
// running it. That also means a player reading this file could work out a
// result before backing it; the honest fix is settling from a server, which is
// the same open problem as the rest of the game and is on the roadmap.
import { rngFrom, hashF } from './rng.js?v=1.9';
import { nowTick } from './market.js?v=1.9';

export const EDITION_TICKS = 1200;        // a new tournament every hour
export const OPEN_WINDOW = 300;           // the first 15 minutes are for betting
export const ROUND_GAP = 180;             // then a round every 9 minutes
export const ROUNDS = ['Round of 32', 'Round of 16', 'Quarter-final', 'Semi-final', 'Final'];

// Real clubs, with a strength that decides how they play. Nothing here is a
// prediction about the real teams; it is a rating for a simulated cup.
const TEAM_ROWS = `
Real Madrid|92|ESP
Manchester City|91|ENG
Bayern Munich|90|GER
Paris Saint-Germain|88|FRA
Liverpool|88|ENG
Inter Milan|86|ITA
Arsenal|86|ENG
Barcelona|85|ESP
Bayer Leverkusen|83|GER
Atletico Madrid|83|ESP
Borussia Dortmund|82|GER
Juventus|81|ITA
AC Milan|81|ITA
Chelsea|81|ENG
Napoli|80|ITA
Atalanta|79|ITA
Tottenham|78|ENG
Benfica|77|POR
Porto|76|POR
RB Leipzig|76|GER
Sporting CP|75|POR
PSV Eindhoven|74|NED
Feyenoord|73|NED
Villarreal|73|ESP
Ajax|72|NED
Monaco|72|FRA
Marseille|71|FRA
Celtic|69|SCO
Galatasaray|69|TUR
Club Brugge|67|BEL
Shakhtar Donetsk|66|UKR
Copenhagen|64|DEN
`;

export const TEAMS = TEAM_ROWS.split('\n')
  .map(l => l.trim()).filter(l => l.includes('|'))
  .map((l, i) => {
    const [name, strength, country] = l.split('|');
    return { id: 'T' + i, name, country, strength: Number(strength) };
  });

const byId = Object.fromEntries(TEAMS.map(t => [t.id, t]));
export const team = id => byId[id];

export const editionOf = t => Math.floor(t / EDITION_TICKS);
export const editionStart = e => e * EDITION_TICKS;
export const editionEnd = e => editionStart(e) + EDITION_TICKS;
export const currentEdition = () => editionOf(nowTick());

// Which round has been played by tick t: 0 means none yet, 5 means finished.
export function roundsPlayed(edition, t) {
  const since = t - editionStart(edition) - OPEN_WINDOW;
  if (since < 0) return 0;
  return Math.max(0, Math.min(ROUNDS.length, Math.floor(since / ROUND_GAP) + 1));
}

export const bettingOpen = (edition, t) => t < editionStart(edition) + OPEN_WINDOW;

export function nextRoundTick(edition, t) {
  const played = roundsPlayed(edition, t);
  return editionStart(edition) + OPEN_WINDOW + played * ROUND_GAP;
}

// The draw: a deterministic shuffle of the 32 teams for this edition.
export function draw(edition) {
  const rand = rngFrom('cup:' + edition);
  const list = TEAMS.map(t => t.id);
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

// Goals from a hash, shaped by the two ratings. Better teams score more and
// concede less, but the tail is long enough for an upset.
function goalsFor(seedKey, attack, defence) {
  const lambda = 0.35 + 2.4 * (attack / (attack + defence));
  const u = hashF(0x60a1, hashKey(seedKey));
  // inverse transform on a Poisson with mean lambda
  let p = Math.exp(-lambda), cum = p, k = 0;
  while (u > cum && k < 9) { k++; p *= lambda / k; cum += p; }
  return k;
}

function hashKey(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 131) + s.charCodeAt(i)) | 0;
  return h;
}

export function playMatch(edition, round, index, a, b) {
  const ta = team(a), tb = team(b);
  const ga = goalsFor(`${edition}:${round}:${index}:A`, ta.strength, tb.strength);
  const gb = goalsFor(`${edition}:${round}:${index}:B`, tb.strength, ta.strength);
  let winner;
  if (ga !== gb) winner = ga > gb ? a : b;
  else {
    // penalties, tilted a little towards the better side
    const u = hashF(0x9e11, hashKey(`${edition}:${round}:${index}:pens`));
    winner = u < ta.strength / (ta.strength + tb.strength) ? a : b;
  }
  return { a, b, ga, gb, winner, pens: ga === gb };
}

// The whole tournament, computed in one pass. 31 matches, so it is cheap.
export function simulate(edition) {
  let alive = draw(edition);
  const rounds = [];
  for (let r = 0; r < ROUNDS.length; r++) {
    const matches = [];
    const next = [];
    for (let i = 0; i < alive.length; i += 2) {
      const m = playMatch(edition, r, i / 2, alive[i], alive[i + 1]);
      matches.push(m);
      next.push(m.winner);
    }
    rounds.push({ name: ROUNDS[r], matches });
    alive = next;
  }
  const goals = {};
  for (const round of rounds) {
    for (const m of round.matches) {
      goals[m.a] = (goals[m.a] || 0) + m.ga;
      goals[m.b] = (goals[m.b] || 0) + m.gb;
    }
  }
  let topScorer = null;
  for (const id of Object.keys(goals)) {
    if (!topScorer || goals[id] > goals[topScorer] ||
        (goals[id] === goals[topScorer] && team(id).strength > team(topScorer).strength)) {
      topScorer = id;
    }
  }
  return { edition, rounds, champion: alive[0], goals, topScorer };
}

// Odds come from the ratings, never from the simulated result, with a 12% book
// margin. Backing the favourite pays little; backing Copenhagen pays plenty.
function impliedWin(t) { return Math.pow(t.strength / 60, 9); }

export function odds(market, teamId) {
  const t = team(teamId);
  if (!t) return 1;
  const pool = TEAMS.reduce((sum, x) => sum + impliedWin(x), 0);
  let p = impliedWin(t) / pool;
  if (market === 'final') p = Math.min(0.95, p * 3.2);      // reaching the final
  if (market === 'goals') p = Math.min(0.95, p * 2.4);      // most goals in the cup
  return Math.max(1.05, Math.round((0.88 / p) * 100) / 100);
}

export const MARKETS = [
  { id: 'winner', name: 'Wins the cup' },
  { id: 'final', name: 'Reaches the final' },
  { id: 'goals', name: 'Most goals' },
];

// Did a bet come in? Only meaningful once the tournament has finished.
export function betWon(result, market, teamId) {
  if (market === 'winner') return result.champion === teamId;
  if (market === 'goals') return result.topScorer === teamId;
  if (market === 'final') {
    const final = result.rounds[result.rounds.length - 1].matches[0];
    return final.a === teamId || final.b === teamId;
  }
  return false;
}
