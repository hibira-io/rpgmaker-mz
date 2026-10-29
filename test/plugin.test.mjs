// Loads dist/HibiraOnline.js into the MZ stub with a fake pusher-js, and
// checks what the plugin sends and how it applies what it receives.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function load(params = {}) {
  const ctx = { console, performance, crypto, localStorage: memoryStorage(), JSON, Math, Date, Map, Set, Number, String, Boolean, Array, Object, Error };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(readFileSync(new URL('./mz-stub.js', import.meta.url), 'utf8'), ctx);
  ctx.PluginManager._params.HibiraOnline = {
    appKey: 'k',
    authEndpoint: 'https://auth.example/',
    syncSwitches: '["3"]',
    syncVariables: '["5"]',
    connectedSwitch: '9',
    membersVariable: '10',
    ...params,
  };
  ctx.Pusher = FakePusher;
  ctx.window.Pusher = FakePusher;
  const plugin = readFileSync(new URL('../dist/HibiraOnline.js', import.meta.url), 'utf8');
  vm.runInContext(plugin, ctx);
  const scene = ctx.mzNewGame('Aiko');
  return { ctx, scene, online: ctx.HibiraOnline, cmd: (name, args = {}) => ctx.PluginManager.callCommand('HibiraOnline', name, args) };
}

// Arrays made inside the vm context have another Array prototype.
const plain = (x) => JSON.parse(JSON.stringify(x));

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}

class FakeChannel {
  constructor(name) {
    this.name = name;
    this.subscribed = false;
    this.handlers = {};
    this.sent = [];
  }
  bind(ev, fn) {
    (this.handlers[ev] ||= []).push(fn);
  }
  emit(ev, data, meta) {
    for (const fn of this.handlers[ev] || []) fn(data, meta);
  }
  trigger(ev, data) {
    this.sent.push([ev, JSON.parse(JSON.stringify(data))]);
    return true;
  }
}

class FakePusher {
  constructor(key, options) {
    this.key = key;
    this.options = options;
    this.channels = {};
  }
  subscribe(name) {
    return (this.channels[name] ||= new FakeChannel(name));
  }
  unsubscribe(name) {
    delete this.channels[name];
  }
}

function members(me, others) {
  const all = [me, ...others];
  return { me: { id: me.id }, each: (fn) => all.forEach((m) => fn({ id: m.id, info: { name: m.name } })) };
}

function joined(t, others = [{ id: 'b', name: 'Bao' }]) {
  t.cmd('joinRoom', { room: 'town', roomVariable: '0' });
  const ch = t.online.channel;
  ch.subscribed = true;
  ch.emit('pusher:subscription_succeeded', members({ id: 'a', name: 'Aiko' }, others));
  return ch;
}

test('joins presence-mz-<room> with the auth endpoint and player name', () => {
  const t = load();
  const ch = joined(t);
  assert.equal(ch.name, 'presence-mz-town');
  const opts = t.online.pusher.options;
  assert.equal(opts.wsHost, 'ws.hibira.io');
  assert.equal(opts.channelAuthorization.endpoint, 'https://auth.example/');
  assert.equal(opts.channelAuthorization.paramsProvider().name, 'Aiko');
  assert.equal(t.ctx.$gameSwitches.value(9), true);
  assert.equal(t.ctx.$gameVariables.value(10), 2);
});

test('sends moves when the player moves, at most 8 events a second', () => {
  const t = load();
  const ch = joined(t);
  t.ctx.$gameMap.update(true);
  assert.deepEqual(ch.sent.at(-1), ['client-mz-move', { m: 1, x: 0, y: 0, d: 2, c: 'Actor1', i: 0 }]);
  const before = ch.sent.length;
  t.ctx.$gameMap.update(true);
  assert.equal(ch.sent.length, before, 'no move when nothing changed');
  for (let i = 0; i < 20; i++) t.online.say('spam ' + i);
  t.ctx.$gameMap.update(true);
  assert.ok(ch.sent.length <= 8, `sent ${ch.sent.length} in one second`);
});

test('shows other players on the same map and removes them when they leave or change maps', () => {
  const t = load();
  const ch = joined(t);
  ch.emit('client-mz-move', { m: 1, x: 4, y: 5, d: 6, c: 'Actor2', i: 3 }, { user_id: 'b' });
  const set = t.scene._spriteset;
  const ghost = set._characterSprites[0]._character;
  assert.equal(ghost.x, 4);
  assert.equal(ghost.characterName(), 'Actor2');
  assert.equal(ghost.hibiraName, 'Bao');
  ch.emit('client-mz-move', { m: 1, x: 5, y: 5, d: 6, c: 'Actor2', i: 3 }, { user_id: 'b' });
  t.ctx.$gameMap.update(true);
  assert.equal(ghost.x, 5, 'walks one tile');
  ch.emit('client-mz-move', { m: 2, x: 1, y: 1, d: 2, c: 'Actor2', i: 3 }, { user_id: 'b' });
  assert.equal(set._characterSprites.length, 0, 'another map');
  ch.emit('client-mz-move', { m: 1, x: 1, y: 1, d: 2, c: 'Actor2', i: 3 }, { user_id: 'b' });
  ch.emit('pusher:member_removed', { id: 'b' });
  assert.equal(set._characterSprites.length, 0, 'left');
  ch.emit('client-mz-move', { m: 1, x: 1, y: 1, d: 2, c: 'X', i: 0 }, { user_id: 'stranger' });
  assert.equal(set._characterSprites.length, 0, 'ignores non-members');
});

test('a new map scene shows the members already there', () => {
  const t = load();
  const ch = joined(t);
  ch.emit('client-mz-move', { m: 1, x: 2, y: 2, d: 2, c: 'Actor2', i: 0 }, { user_id: 'b' });
  t.scene.start();
  assert.equal(t.scene._spriteset._characterSprites.length, 1);
});

test('shares switches and variables both ways without echoing', () => {
  const t = load();
  const ch = joined(t);
  t.ctx.$gameSwitches.setValue(3, true);
  t.ctx.$gameSwitches.setValue(4, true); // not shared
  t.ctx.$gameVariables.setValue(5, 42);
  t.ctx.$gameMap.update(true);
  const sets = ch.sent.filter(([e]) => e === 'client-mz-set').map(([, d]) => d);
  assert.deepEqual(sets, [{ k: 's', id: 3, v: true }, { k: 'v', id: 5, v: 42 }]);
  ch.sent.length = 0;
  ch.emit('client-mz-set', { k: 'v', id: 5, v: 'gold' });
  ch.emit('client-mz-set', { k: 'v', id: 6, v: 99 }); // not shared: ignored
  t.ctx.$gameMap.update(true);
  assert.equal(t.ctx.$gameVariables.value(5), 'gold');
  assert.equal(t.ctx.$gameVariables.value(6), 0);
  assert.equal(ch.sent.filter(([e]) => e === 'client-mz-set').length, 0, 'no echo');
});

test('the first member sends the shared state to newcomers', () => {
  const t = load();
  const ch = joined(t, [{ id: 'c', name: 'Chen' }]); // a < c, so we are first
  t.ctx.$gameSwitches.setValue(3, true);
  ch.sent.length = 0;
  ch.emit('pusher:member_added', { id: 'd', info: { name: 'Dara' } });
  t.ctx.$gameMap.update(true);
  const state = ch.sent.find(([e]) => e === 'client-mz-state');
  assert.deepEqual(state[1], { s: [{ k: 's', id: 3, v: true }], v: [{ k: 'v', id: 5, v: 0 }] });
  const t2 = load();
  const ch2 = joined(t2, [{ id: '0', name: 'Old' }]); // '0' < 'a'
  ch2.sent.length = 0;
  ch2.emit('pusher:member_added', { id: 'd', info: { name: 'Dara' } });
  t2.ctx.$gameMap.update(true);
  assert.ok(!ch2.sent.some(([e]) => e === 'client-mz-state'));
  ch2.emit('client-mz-state', { s: [{ k: 's', id: 3, v: true }], v: [{ k: 'v', id: 5, v: 7 }] });
  assert.equal(t2.ctx.$gameSwitches.value(3), true);
  assert.equal(t2.ctx.$gameVariables.value(5), 7);
});

test('chat lines show in the chat window', () => {
  const t = load();
  const ch = joined(t);
  t.cmd('sendChat', { text: 'hello', textVariable: '0' });
  ch.emit('client-mz-chat', { t: '你好' }, { user_id: 'b' });
  const win = t.scene.windows[0];
  win.update();
  assert.deepEqual(plain(win.contents.texts), ['Aiko:', 'hello', 'Bao:', '你好']);
  t.ctx.$gameMap.update(true);
  assert.deepEqual(ch.sent.find(([e]) => e === 'client-mz-chat'), ['client-mz-chat', { t: 'hello' }]);
});

test('custom events store the value and sender and run a common event', () => {
  const t = load();
  const ch = joined(t);
  t.cmd('onEvent', { name: 'boss', valueVariable: '20', senderVariable: '21', commonEvent: '7' });
  t.ctx.$gameVariables.setValue(30, 3);
  t.cmd('sendEvent', { name: 'boss', valueVariable: '30' });
  t.ctx.$gameMap.update(true);
  assert.deepEqual(ch.sent.find(([e]) => e === 'client-mz-event'), ['client-mz-event', { n: 'boss', v: 3 }]);
  ch.emit('client-mz-event', { n: 'boss', v: 12 }, { user_id: 'b' });
  assert.equal(t.ctx.$gameVariables.value(20), 12);
  assert.equal(t.ctx.$gameVariables.value(21), 'Bao');
  assert.deepEqual(plain(t.ctx.$gameTemp.reserved), [7]);
});

test('leaving clears the room', () => {
  const t = load();
  joined(t);
  t.cmd('leaveRoom');
  assert.equal(t.online.channel, null);
  assert.equal(t.ctx.$gameSwitches.value(9), false);
  assert.equal(t.ctx.$gameVariables.value(10), 0);
});

test('does nothing without an app key or auth endpoint', () => {
  const t = load({ appKey: '' });
  const warn = console.warn;
  console.warn = () => {};
  try {
    t.cmd('joinRoom', { room: 'town', roomVariable: '0' });
  } finally {
    console.warn = warn;
  }
  assert.equal(t.online.channel, null);
});
