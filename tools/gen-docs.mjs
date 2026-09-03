// Regenerates CHANGELOG.md and ROADMAP.md from js/changelog.js so the repo and
// the in-game update log can never drift apart.  Run: node tools/gen-docs.mjs
import { writeFileSync } from 'node:fs';
import { RELEASES, NEXT, VERSION } from '../js/changelog.js';

const LABEL = { new: 'New', bal: 'Tuning', fix: 'Fix' };
const PLAY = 'https://randomprojects1234.github.io/ledger-city/';

const changelog = [
  '# Changelog',
  '',
  `All notable changes to [Ledger City](${PLAY}). Current build: **${VERSION}**.`,
  '',
  'This file is generated from `js/changelog.js`, which is also what the in-game',
  'update log reads — click the version badge in the corner. Edit that file, then',
  'run `node tools/gen-docs.mjs`.',
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
  'Generated from `js/changelog.js` by `node tools/gen-docs.mjs`.',
].join('\n');

writeFileSync(new URL('../CHANGELOG.md', import.meta.url), changelog);
writeFileSync(new URL('../ROADMAP.md', import.meta.url), roadmap);
console.log('wrote CHANGELOG.md and ROADMAP.md');
