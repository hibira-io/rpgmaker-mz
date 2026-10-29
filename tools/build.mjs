// node tools/build.mjs → dist/HibiraOnline.js: the plugin header, pusher-js
// and the plugin, in the one file RPG Maker MZ loads from js/plugins/.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const { version } = JSON.parse(read('package.json'));
const pusher = read('vendor/pusher.min.js').replace(/^\/\*! For license information.*\*\/\n?/, '');

const out = [
  read('src/header.js'),
  `// HibiraOnline.js ${version} — https://github.com/hibira-io/rpgmaker-mz (MIT)`,
  '// Includes pusher-js 8.6.0 (MIT, https://github.com/pusher/pusher-js).',
  '',
  // Shadow CommonJS and AMD globals so pusher-js sets window.Pusher, also in NW.js.
  'if (!window.Pusher) (function (exports, module, define) {',
  pusher.trim(),
  '}).call(window);',
  '',
  read('src/HibiraOnline.body.js'),
].join('\n');

mkdirSync(new URL('../dist', import.meta.url), { recursive: true });
writeFileSync(new URL('../dist/HibiraOnline.js', import.meta.url), out);
console.log(`dist/HibiraOnline.js ${(out.length / 1024).toFixed(1)} KB`);
