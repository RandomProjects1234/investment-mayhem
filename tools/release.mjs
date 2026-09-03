// Release helper. Run: node tools/release.mjs
//
// 1. Regenerates CHANGELOG.md and ROADMAP.md from js/changelog.js.
// 2. Stamps the version into index.html and onto every module import.
//
// Step 2 matters more than it looks: browsers cache ES modules hard, and
// bumping only index.html left players running a mix of old and new modules
// after a deploy. Every import carries ?v=<version>, so a release invalidates
// the whole graph at once.
import { writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { RELEASES, NEXT, VERSION } from '../js/changelog.js';

const root = new URL('../', import.meta.url);
const LABEL = { new: 'New', bal: 'Tuning', fix: 'Fix' };
const PLAY = 'https://randomprojects1234.github.io/investment-mayhem/';
const V = VERSION.replace(/^v/, '');

// ---- docs ----------------------------------------------------------------
const changelog = [
  '# Changelog',
  '',
  `All notable changes to [Investment Mayhem](${PLAY}). Current build: **${VERSION}**.`,
  '',
  'This file is generated from `js/changelog.js`, which is also what the in-game',
  'update log reads — click the version badge in the corner. Edit that file, then',
  'run `node tools/release.mjs`.',
  '',
  ...RELEASES.flatMap(r => [
    `## ${r.version} — ${r.title}`,
    `*${r.date}*`,
    '',
    ...r.items.map(([tag, text]) => `- **${LABEL[tag] || tag}** — ${text}`),
    '',
  ]),
].join('\n');

const roadmap = [
  '# Roadmap',
  '',
  `## Next up — ${NEXT.version}: ${NEXT.title}`,
  '',
  ...NEXT.items.flatMap(([name, why]) => [`### ${name}`, '', why, '']),
  '## Further out',
  '',
  ...NEXT.later.map(([name, why]) => `- **${name}** — ${why}`),
  '',
  '---',
  '',
  'Generated from `js/changelog.js` by `node tools/release.mjs`.',
].join('\n');

writeFileSync(new URL('CHANGELOG.md', root), changelog);
writeFileSync(new URL('ROADMAP.md', root), roadmap);

// ---- version stamping ----------------------------------------------------
let touched = 0;

for (const file of readdirSync(new URL('js/', root))) {
  if (!file.endsWith('.js')) continue;
  const url = new URL('js/' + file, root);
  const src = readFileSync(url, 'utf8');
  const out = src.replace(/(from\s+'\.\/[A-Za-z0-9_-]+\.js)(\?v=[^']*)?'/g, `$1?v=${V}'`);
  if (out !== src) { writeFileSync(url, out); touched++; }
}

const htmlUrl = new URL('index.html', root);
const html = readFileSync(htmlUrl, 'utf8')
  .replace(/href="style\.css(\?v=[^"]*)?"/, `href="style.css?v=${V}"`)
  .replace(/src="js\/main\.js(\?v=[^"]*)?"/, `src="js/main.js?v=${V}"`)
  .replace(/>v[0-9.]+<\/button>/, `>${VERSION}</button>`)
  .replace(/<b>v[0-9.]+<\/b>/, `<b>${VERSION}</b>`)
  .replace(/<b id="cl-version">v[0-9.]+<\/b>/, `<b id="cl-version">${VERSION}</b>`);
writeFileSync(htmlUrl, html);

console.log(`${VERSION}: wrote CHANGELOG.md, ROADMAP.md, stamped ${touched} modules and index.html`);
