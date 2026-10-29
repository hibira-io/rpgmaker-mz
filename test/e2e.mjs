// Two games in Chromium against a real Hibira-compatible server, with
// server/worker.js as the auth endpoint. Needs Playwright and:
//   HIBIRA_E2E_KEY, HIBIRA_E2E_SECRET, HIBIRA_E2E_HOST
//   (HIBIRA_E2E_PORT, HIBIRA_E2E_TLS=false for a local server)
// node test/e2e.mjs
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import worker from '../server/worker.js';

const env = process.env;
if (!env.HIBIRA_E2E_KEY || !env.HIBIRA_E2E_SECRET || !env.HIBIRA_E2E_HOST) {
  console.log('skipped: set HIBIRA_E2E_KEY, HIBIRA_E2E_SECRET and HIBIRA_E2E_HOST');
  process.exit(0);
}
const { chromium } = createRequire(import.meta.url)('playwright');
const tls = env.HIBIRA_E2E_TLS !== 'false';
const port = env.HIBIRA_E2E_PORT || (tls ? '443' : '80');
const file = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const server = createServer(async (req, res) => {
  if (req.url === '/auth') {
    const body = await new Promise((r) => {
      let b = '';
      req.on('data', (c) => (b += c)).on('end', () => r(b));
    });
    const out = await worker.fetch(
      new Request('http://localhost/auth', { method: req.method, body: req.method === 'POST' ? body : undefined, headers: req.headers }),
      { HIBIRA_APP_KEY: env.HIBIRA_E2E_KEY, HIBIRA_APP_SECRET: env.HIBIRA_E2E_SECRET },
    );
    res.writeHead(out.status, Object.fromEntries(out.headers));
    return res.end(await out.text());
  }
  const params = {
    appKey: env.HIBIRA_E2E_KEY, host: env.HIBIRA_E2E_HOST, port, tls: String(tls), authEndpoint: '/auth',
    syncSwitches: '["3"]', syncVariables: '["5"]', membersVariable: '10',
  };
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><script>${file('test/mz-stub.js')}</script>
<script>PluginManager._params.HibiraOnline = ${JSON.stringify(params)};</script>
<script>${file('dist/HibiraOnline.js')}</script>
<script>window.scene = mzNewGame(new URLSearchParams(location.search).get('name'));
setInterval(() => $gameMap.update(true), 50);</script>`);
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}`;

const browser = await chromium.launch();
const errors = [];
const open = async (name) => {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  await page.goto(`${base}/?name=${name}`);
  return page;
};
try {
  const a = await open('Aiko');
  const b = await open('Bao');
  const join = (p) => p.evaluate(() => PluginManager.callCommand('HibiraOnline', 'joinRoom', { room: 'e2e-' + 'town', roomVariable: '0' }));
  await join(a);
  await a.waitForFunction(() => HibiraOnline.ready());
  await a.evaluate(() => $gameSwitches.setValue(3, true)); // before Bao joins: comes with the state
  await join(b);
  await b.waitForFunction(() => HibiraOnline.ready() && $gameVariables.value(10) === 2);
  await b.waitForFunction(() => $gameSwitches.value(3) === true);

  await a.evaluate(() => { $gamePlayer.locate(6, 7); });
  await b.waitForFunction(() => {
    const s = scene._spriteset._characterSprites[0];
    return s && s._character.x === 6 && s._character.y === 7 && s._character.hibiraName === 'Aiko';
  });

  await b.evaluate(() => { $gameVariables.setValue(5, 77); HibiraOnline.say('こんにちは'); });
  await a.waitForFunction(() => $gameVariables.value(5) === 77 && HibiraOnline.chat.some((c) => c.name === 'Bao' && c.text === 'こんにちは'));

  await a.evaluate(() => PluginManager.callCommand('HibiraOnline', 'onEvent', { name: 'boss', valueVariable: '20', senderVariable: '21', commonEvent: '4' }));
  await b.evaluate(() => { $gameVariables.setValue(30, 9); PluginManager.callCommand('HibiraOnline', 'sendEvent', { name: 'boss', valueVariable: '30' }); });
  await a.waitForFunction(() => $gameVariables.value(20) === 9 && $gameVariables.value(21) === 'Bao' && $gameTemp.reserved.includes(4));

  await b.evaluate(() => PluginManager.callCommand('HibiraOnline', 'leaveRoom', {}));
  await a.waitForFunction(() => scene._spriteset._characterSprites.length === 0 && $gameVariables.value(10) === 1);
  assert.deepEqual(errors, []);
  console.log('e2e passed: join, shared state for newcomers, other players, shared variables, chat, custom events, leave');
} finally {
  await browser.close();
  server.close();
}
