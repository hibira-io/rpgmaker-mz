(() => {
  'use strict';

  const PLUGIN = 'HibiraOnline';
  const raw = PluginManager.parameters(PLUGIN);

  const list = (s) => {
    try {
      return JSON.parse(s || '[]').map(Number).filter((n) => n > 0);
    } catch (e) {
      return [];
    }
  };
  const P = {
    appKey: String(raw.appKey || ''),
    host: String(raw.host || 'ws.hibira.io'),
    port: Number(raw.port || 443),
    tls: raw.tls !== 'false',
    authEndpoint: String(raw.authEndpoint || ''),
    roomPrefix: String(raw.roomPrefix || 'presence-mz-'),
    nameVariable: Number(raw.nameVariable || 0),
    showGhosts: raw.showGhosts !== 'false',
    ghostOpacity: Number(raw.ghostOpacity || 160),
    showNames: raw.showNames !== 'false',
    syncSwitches: list(raw.syncSwitches),
    syncVariables: list(raw.syncVariables),
    connectedSwitch: Number(raw.connectedSwitch || 0),
    membersVariable: Number(raw.membersVariable || 0),
    chatWindow: raw.chatWindow !== 'false',
    chatLines: Number(raw.chatLines || 5),
    chatSeconds: Number(raw.chatSeconds || 8),
  };

  // Client events share one budget: at most 10 per second per connection.
  const MAX_PER_SECOND = 8;
  const MOVE = 'client-mz-move';
  const CHAT = 'client-mz-chat';
  const SET = 'client-mz-set';
  const STATE = 'client-mz-state';
  const EVENT = 'client-mz-event';

  // ---------------------------------------------------------------------------
  // Connection and room
  // ---------------------------------------------------------------------------

  const Online = {
    pusher: null,
    channel: null,
    room: '',
    myId: '',
    members: new Map(), // id -> { name, pos }
    handlers: new Map(), // event name -> [{ variable, commonEvent }]
    chat: [], // { name, text, at }
    queue: [],
    sentAt: [],
    lastMove: '',
    applying: false,

    playerName() {
      if (P.nameVariable > 0) {
        const v = $gameVariables.value(P.nameVariable);
        if (v !== 0 && v !== '') return String(v).slice(0, 20);
      }
      const actor = $gameParty.leader();
      return actor ? actor.name() : 'Player';
    },

    userId() {
      const key = 'hibira-mz-player';
      try {
        let id = localStorage.getItem(key);
        if (!id) {
          id = (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()) + String(Math.random()).slice(2);
          localStorage.setItem(key, id);
        }
        return id;
      } catch (e) {
        return String(Date.now()) + String(Math.random()).slice(2);
      }
    },

    connect() {
      if (this.pusher) return this.pusher;
      if (!P.appKey || !P.authEndpoint) {
        console.warn(`${PLUGIN}: set the App key and Auth endpoint parameters`);
        return null;
      }
      this.pusher = new Pusher(P.appKey, {
        cluster: 'hkg', // required by pusher-js, unused once wsHost is set
        wsHost: P.host,
        wsPort: P.port,
        wssPort: P.port,
        forceTLS: P.tls,
        enabledTransports: ['ws', 'wss'],
        channelAuthorization: {
          endpoint: P.authEndpoint,
          transport: 'ajax',
          paramsProvider: () => ({ user_id: this.userId(), name: this.playerName() }),
        },
      });
      return this.pusher;
    },

    join(room) {
      room = String(room || '').replace(/[^A-Za-z0-9_\-=@,.;]/g, '').slice(0, 60);
      if (!room) return;
      if (this.room === room) return;
      this.leave();
      const pusher = this.connect();
      if (!pusher) return;
      this.room = room;
      const ch = pusher.subscribe(P.roomPrefix + room);
      this.channel = ch;
      ch.bind('pusher:subscription_succeeded', (members) => {
        this.myId = members.me.id;
        this.members.clear();
        members.each((m) => {
          if (m.id !== this.myId) this.members.set(m.id, { name: (m.info && m.info.name) || '?', pos: null });
        });
        this.status(true);
        this.lastMove = '';
        this.sendMove();
      });
      ch.bind('pusher:subscription_error', (e) => {
        console.warn(`${PLUGIN}: could not join room ${room}`, e);
        this.room = '';
        this.channel = null;
        this.status(false);
      });
      ch.bind('pusher:member_added', (m) => {
        this.members.set(m.id, { name: (m.info && m.info.name) || '?', pos: null });
        this.status(true);
        // Tell the newcomer where we are, and (from the first member) the shared state.
        this.lastMove = '';
        this.sendMove();
        if (this.isFirst()) this.send(STATE, this.snapshot());
      });
      ch.bind('pusher:member_removed', (m) => {
        this.members.delete(m.id);
        Ghosts.remove(m.id);
        this.status(true);
      });
      ch.bind(MOVE, (d, meta) => this.onMove(d, meta));
      ch.bind(CHAT, (d, meta) => this.onChat(d, meta));
      ch.bind(SET, (d) => this.apply(d));
      ch.bind(STATE, (d) => (d.s || []).concat(d.v || []).forEach((x) => this.apply(x)));
      ch.bind(EVENT, (d, meta) => this.onEvent(d, meta));
    },

    leave() {
      if (this.channel && this.pusher) this.pusher.unsubscribe(this.channel.name);
      this.channel = null;
      this.room = '';
      this.members.clear();
      this.queue = [];
      Ghosts.clear();
      this.status(false);
    },

    status(connected) {
      if (P.connectedSwitch > 0) $gameSwitches.setValue(P.connectedSwitch, connected);
      if (P.membersVariable > 0) $gameVariables.setValue(P.membersVariable, connected ? this.members.size + 1 : 0);
    },

    /** The member with the smallest ID sends the shared state to newcomers. */
    isFirst() {
      for (const id of this.members.keys()) if (id < this.myId) return false;
      return true;
    },

    snapshot() {
      return {
        s: P.syncSwitches.map((id) => ({ k: 's', id, v: $gameSwitches.value(id) })),
        v: P.syncVariables.map((id) => ({ k: 'v', id, v: $gameVariables.value(id) })),
      };
    },

    ready() {
      return Boolean(this.channel && this.channel.subscribed);
    },

    /** Queues a client event; moves replace the previous unsent move. */
    send(event, data) {
      if (!this.ready()) return;
      if (event === MOVE) this.queue = this.queue.filter((q) => q.event !== MOVE);
      this.queue.push({ event, data });
    },

    flush() {
      if (!this.ready() || this.queue.length === 0) return;
      const now = performance.now();
      this.sentAt = this.sentAt.filter((t) => now - t < 1000);
      while (this.queue.length && this.sentAt.length < MAX_PER_SECOND) {
        const { event, data } = this.queue.shift();
        this.channel.trigger(event, data);
        this.sentAt.push(now);
      }
    },

    sendMove() {
      if (!this.ready() || !$gamePlayer) return;
      const d = {
        m: $gameMap.mapId(),
        x: $gamePlayer.x,
        y: $gamePlayer.y,
        d: $gamePlayer.direction(),
        c: $gamePlayer.characterName(),
        i: $gamePlayer.characterIndex(),
      };
      const key = JSON.stringify(d);
      if (key === this.lastMove) return;
      this.lastMove = key;
      this.send(MOVE, d);
    },

    onMove(d, meta) {
      const id = meta && meta.user_id;
      const m = id && this.members.get(id);
      if (!m) return;
      m.pos = d;
      Ghosts.move(id, m.name, d);
    },

    say(text) {
      text = String(text || '').trim().slice(0, 200);
      if (!text) return;
      this.send(CHAT, { t: text });
      this.addChat(this.playerName(), text);
    },

    onChat(d, meta) {
      const m = meta && this.members.get(meta.user_id);
      this.addChat(m ? m.name : '?', String(d.t || '').slice(0, 200));
    },

    addChat(name, text) {
      this.chat.push({ name, text, at: performance.now() });
      if (this.chat.length > 50) this.chat.shift();
    },

    /** Applies a switch or variable change from another player, without sending it back. */
    apply(x) {
      if (!x || (x.k !== 's' && x.k !== 'v')) return;
      const id = Number(x.id);
      this.applying = true;
      try {
        if (x.k === 's' && P.syncSwitches.includes(id)) $gameSwitches.setValue(id, Boolean(x.v));
        if (x.k === 'v' && P.syncVariables.includes(id) && (typeof x.v === 'number' || typeof x.v === 'string')) {
          $gameVariables.setValue(id, x.v);
        }
      } finally {
        this.applying = false;
      }
    },

    sendEvent(name, value) {
      name = String(name || '').slice(0, 40);
      if (!name) return;
      this.send(EVENT, { n: name, v: value });
    },

    onEvent(d, meta) {
      const list = this.handlers.get(String(d.n)) || [];
      for (const h of list) {
        if (h.variable > 0 && (typeof d.v === 'number' || typeof d.v === 'string')) $gameVariables.setValue(h.variable, d.v);
        if (h.senderVariable > 0) {
          const m = meta && this.members.get(meta.user_id);
          $gameVariables.setValue(h.senderVariable, m ? m.name : '');
        }
        if (h.commonEvent > 0) $gameTemp.reserveCommonEvent(h.commonEvent);
      }
    },
  };

  // ---------------------------------------------------------------------------
  // Other players on the map
  // ---------------------------------------------------------------------------

  class Game_HibiraGhost extends Game_Character {
    initMembers() {
      super.initMembers();
      this.setThrough(true);
      this.setMoveSpeed(4);
      this._targetX = 0;
      this._targetY = 0;
      this._targetD = 2;
      this.hibiraName = '';
    }

    follow(d) {
      if (this.characterName() !== d.c || this.characterIndex() !== d.i) this.setImage(d.c, d.i);
      this._targetX = d.x;
      this._targetY = d.y;
      this._targetD = d.d;
      const far = Math.abs(d.x - this.x) + Math.abs(d.y - this.y) > 2;
      if (far || !this._placed) {
        this.locate(d.x, d.y);
        this.setDirection(d.d);
        this._placed = true;
      }
    }

    update() {
      if (!this.isMoving()) {
        if (this.x !== this._targetX || this.y !== this._targetY) {
          const dx = this._targetX - this.x;
          const dy = this._targetY - this.y;
          this.moveStraight(Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 6 : 4) : dy > 0 ? 2 : 8);
        } else if (this.direction() !== this._targetD) {
          this.setDirection(this._targetD);
        }
      }
      super.update();
    }
  }

  const Ghosts = {
    all: new Map(), // id -> Game_HibiraGhost

    move(id, name, d, set) {
      if (!P.showGhosts || !$gameMap) return;
      if (d.m !== $gameMap.mapId()) {
        this.remove(id);
        return;
      }
      let g = this.all.get(id);
      if (!g) {
        g = new Game_HibiraGhost();
        g.setOpacity(P.ghostOpacity);
        this.all.set(id, g);
        Ghosts.attach(g, set || this.spriteset());
      }
      g.hibiraName = name;
      g.follow(d);
    },

    remove(id) {
      const g = this.all.get(id);
      if (!g) return;
      this.all.delete(id);
      Ghosts.detach(g);
    },

    clear() {
      for (const id of [...this.all.keys()]) this.remove(id);
    },

    update() {
      for (const g of this.all.values()) g.update();
    },

    spriteset() {
      const scene = SceneManager._scene;
      return scene instanceof Scene_Map ? scene._spriteset : null;
    },

    attach(g, set) {
      if (!set || !set._tilemap) return;
      const sprite = new Sprite_HibiraGhost(g);
      g._hibiraSprite = sprite;
      set._characterSprites.push(sprite);
      set._tilemap.addChild(sprite);
    },

    detach(g) {
      const sprite = g._hibiraSprite;
      const set = this.spriteset();
      if (!sprite) return;
      if (sprite.parent) sprite.parent.removeChild(sprite);
      if (set) set._characterSprites = set._characterSprites.filter((s) => s !== sprite);
      g._hibiraSprite = null;
    },
  };

  class Sprite_HibiraGhost extends Sprite_Character {
    initialize(character) {
      super.initialize(character);
      if (P.showNames) {
        this._nameSprite = new Sprite(new Bitmap(160, 24));
        this._nameSprite.anchor.x = 0.5;
        this._nameSprite.anchor.y = 1;
        this.addChild(this._nameSprite);
        this._drawnName = null;
      }
    }

    update() {
      super.update();
      if (this._nameSprite && this._character.hibiraName !== this._drawnName) {
        this._drawnName = this._character.hibiraName;
        const b = this._nameSprite.bitmap;
        b.clear();
        b.fontSize = 14;
        b.outlineWidth = 3;
        b.drawText(this._drawnName, 0, 0, 160, 24, 'center');
      }
      if (this._nameSprite) this._nameSprite.y = -this.patternHeight();
    }
  }

  // ---------------------------------------------------------------------------
  // Chat window
  // ---------------------------------------------------------------------------

  class Window_HibiraChat extends Window_Base {
    initialize() {
      const lines = Math.max(1, P.chatLines);
      const h = this.fittingHeight(lines);
      super.initialize(new Rectangle(0, Graphics.boxHeight - h, Math.min(560, Graphics.boxWidth), h));
      this.opacity = 0;
      this.contentsOpacity = 255;
      this._shown = '';
    }

    update() {
      super.update();
      const now = performance.now();
      const recent = Online.chat.filter((c) => now - c.at < P.chatSeconds * 1000).slice(-P.chatLines);
      const key = recent.map((c) => c.at).join(',');
      if (key === this._shown) return;
      this._shown = key;
      this.contents.clear();
      this.visible = recent.length > 0;
      const top = P.chatLines - recent.length;
      recent.forEach((c, i) => {
        this.resetFontSettings();
        this.contents.fontSize = 18;
        const y = (top + i) * this.lineHeight();
        this.changeTextColor(ColorManager.systemColor());
        const w = this.textWidth(c.name + ': ');
        this.drawText(c.name + ':', 0, y, w);
        this.resetTextColor();
        this.contents.fontSize = 18;
        this.drawText(c.text, w, y, this.contentsWidth() - w);
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Engine hooks
  // ---------------------------------------------------------------------------

  const _Game_Map_update = Game_Map.prototype.update;
  Game_Map.prototype.update = function (sceneActive) {
    _Game_Map_update.call(this, sceneActive);
    Ghosts.update();
    Online.sendMove();
    Online.flush();
  };

  const _Spriteset_Map_createCharacters = Spriteset_Map.prototype.createCharacters;
  Spriteset_Map.prototype.createCharacters = function () {
    _Spriteset_Map_createCharacters.call(this);
    // A new map scene (its scene._spriteset is not set yet): ghosts from the
    // members' last positions.
    Ghosts.all.clear();
    for (const [id, m] of Online.members) if (m.pos) Ghosts.move(id, m.name, m.pos, this);
  };

  const _Scene_Map_createAllWindows = Scene_Map.prototype.createAllWindows;
  Scene_Map.prototype.createAllWindows = function () {
    _Scene_Map_createAllWindows.call(this);
    if (P.chatWindow) {
      this._hibiraChat = new Window_HibiraChat();
      this.addWindow(this._hibiraChat);
    }
  };

  const _Game_Switches_setValue = Game_Switches.prototype.setValue;
  Game_Switches.prototype.setValue = function (id, value) {
    const before = this.value(id);
    _Game_Switches_setValue.call(this, id, value);
    if (!Online.applying && P.syncSwitches.includes(id) && before !== this.value(id)) {
      Online.send(SET, { k: 's', id, v: this.value(id) });
    }
  };

  const _Game_Variables_setValue = Game_Variables.prototype.setValue;
  Game_Variables.prototype.setValue = function (id, value) {
    const before = this.value(id);
    _Game_Variables_setValue.call(this, id, value);
    if (!Online.applying && P.syncVariables.includes(id) && before !== this.value(id)) {
      Online.send(SET, { k: 'v', id, v: this.value(id) });
    }
  };

  // ---------------------------------------------------------------------------
  // Plugin commands
  // ---------------------------------------------------------------------------

  const text = (args, plain, variable) => {
    const v = Number(args[variable] || 0);
    return v > 0 ? String($gameVariables.value(v)) : String(args[plain] || '');
  };

  PluginManager.registerCommand(PLUGIN, 'joinRoom', (args) => Online.join(text(args, 'room', 'roomVariable')));
  PluginManager.registerCommand(PLUGIN, 'leaveRoom', () => Online.leave());
  PluginManager.registerCommand(PLUGIN, 'sendChat', (args) => Online.say(text(args, 'text', 'textVariable')));
  PluginManager.registerCommand(PLUGIN, 'sendEvent', (args) => {
    const v = Number(args.valueVariable || 0);
    Online.sendEvent(args.name, v > 0 ? $gameVariables.value(v) : 0);
  });
  PluginManager.registerCommand(PLUGIN, 'onEvent', (args) => {
    const name = String(args.name || '');
    if (!name) return;
    const handler = {
      variable: Number(args.valueVariable || 0),
      senderVariable: Number(args.senderVariable || 0),
      commonEvent: Number(args.commonEvent || 0),
    };
    // Running the command again replaces the handler instead of adding another.
    Online.handlers.set(name, [handler]);
  });

  // For other plugins and script calls: HibiraOnline.join('ABCD'), .say('hi'), .members ...
  window.HibiraOnline = Online;
})();
