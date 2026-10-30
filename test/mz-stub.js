// The parts of RPG Maker MZ's core scripts that HibiraOnline.js touches,
// written from the documented API (the real rmmz_*.js ship only with MZ).
// Loads in a browser page or in Node (globalThis).
(function (g) {
  g.window = g.window || g;
  const commands = {};
  g.PluginManager = {
    _params: {},
    parameters(name) {
      return this._params[name] || {};
    },
    registerCommand(plugin, name, fn) {
      commands[`${plugin}:${name}`] = fn;
    },
    callCommand(plugin, name, args) {
      commands[`${plugin}:${name}`](args);
    },
  };

  function Game_CharacterBase() {
    this.initialize(...arguments);
  }
  Game_CharacterBase.prototype.initialize = function () {
    this.initMembers();
  };
  Game_CharacterBase.prototype.initMembers = function () {
    this._x = 0;
    this._y = 0;
    this._realX = 0;
    this._realY = 0;
    this._direction = 2;
    this._characterName = '';
    this._characterIndex = 0;
    this._opacity = 255;
    this._through = false;
    this._moveSpeed = 4;
  };
  Object.defineProperty(Game_CharacterBase.prototype, 'x', { get() { return this._x; } });
  Object.defineProperty(Game_CharacterBase.prototype, 'y', { get() { return this._y; } });
  Object.assign(Game_CharacterBase.prototype, {
    setThrough(v) { this._through = v; },
    setMoveSpeed(v) { this._moveSpeed = v; },
    setOpacity(v) { this._opacity = v; },
    setImage(n, i) { this._characterName = n; this._characterIndex = i; },
    characterName() { return this._characterName; },
    characterIndex() { return this._characterIndex; },
    locate(x, y) { this._x = this._realX = x; this._y = this._realY = y; },
    setDirection(d) { this._direction = d; },
    direction() { return this._direction; },
    isMoving() { return this._realX !== this._x || this._realY !== this._y; },
    moveStraight(d) {
      this.setDirection(d);
      this._x += d === 6 ? 1 : d === 4 ? -1 : 0;
      this._y += d === 2 ? 1 : d === 8 ? -1 : 0;
    },
    update() {
      // One tile per frame in the stub.
      this._realX = this._x;
      this._realY = this._y;
    },
  });
  function Game_Character() {
    this.initialize(...arguments);
  }
  Game_Character.prototype = Object.create(Game_CharacterBase.prototype);
  Game_Character.prototype.constructor = Game_Character;
  g.Game_Character = Game_Character;
  g.Game_Player = function () { this.initialize(); };
  g.Game_Player.prototype = Object.create(Game_Character.prototype);

  function Bitmap() { this.fontSize = 0; this.outlineWidth = 0; this.texts = []; }
  Bitmap.prototype.clear = function () { this.texts = []; };
  Bitmap.prototype.drawText = function (t) { this.texts.push(t); };
  g.Bitmap = Bitmap;
  function Sprite(bitmap) { this.initialize(bitmap); }
  Sprite.prototype.initialize = function (bitmap) {
    this.bitmap = bitmap || null;
    this.children = [];
    this.anchor = { x: 0, y: 0 };
    this.parent = null;
    this.y = 0;
  };
  Sprite.prototype.addChild = function (c) { c.parent = this; this.children.push(c); };
  Sprite.prototype.removeChild = function (c) { this.children = this.children.filter((x) => x !== c); c.parent = null; };
  Sprite.prototype.update = function () {};
  g.Sprite = Sprite;
  function Sprite_Character(character) { this.initialize(character); }
  Sprite_Character.prototype = Object.create(Sprite.prototype);
  Sprite_Character.prototype.initialize = function (character) {
    Sprite.prototype.initialize.call(this);
    this._character = character;
  };
  Sprite_Character.prototype.patternHeight = function () { return 48; };
  g.Sprite_Character = Sprite_Character;

  g.Rectangle = function (x, y, w, h) { Object.assign(this, { x, y, width: w, height: h }); };
  g.Graphics = { boxWidth: 816, boxHeight: 624 };
  g.ColorManager = { systemColor: () => '#99ccff' };
  function Window_Base(rect) { this.initialize(rect); }
  Window_Base.prototype.initialize = function (rect) {
    this.rect = rect;
    this.contents = new Bitmap();
    this.visible = true;
    this.lines = [];
  };
  Object.assign(Window_Base.prototype, {
    fittingHeight: (n) => n * 36 + 24,
    lineHeight: () => 36,
    update() {},
    resetFontSettings() {},
    resetTextColor() {},
    changeTextColor() {},
    textWidth: (t) => t.length * 9,
    contentsWidth() { return this.rect.width - 24; },
    drawText(t) { this.contents.drawText(t); },
  });
  g.Window_Base = Window_Base;

  function Spriteset_Map() { this.initialize(); }
  Spriteset_Map.prototype.initialize = function () {
    this._tilemap = new Sprite();
    this._characterSprites = [];
    this.createCharacters();
  };
  Spriteset_Map.prototype.createCharacters = function () {};
  g.Spriteset_Map = Spriteset_Map;
  function Scene_Map() { this.windows = []; }
  Scene_Map.prototype.createAllWindows = function () {};
  Scene_Map.prototype.addWindow = function (w) { this.windows.push(w); };
  Scene_Map.prototype.start = function () {
    this._spriteset = new Spriteset_Map();
    this.createAllWindows();
  };
  g.Scene_Map = Scene_Map;
  g.SceneManager = { _scene: null };

  function Game_Map() { this._mapId = 1; }
  Game_Map.prototype.mapId = function () { return this._mapId; };
  Game_Map.prototype.update = function () {};
  g.Game_Map = Game_Map;
  function Game_Switches() { this._data = []; }
  Game_Switches.prototype.value = function (id) { return !!this._data[id]; };
  Game_Switches.prototype.setValue = function (id, v) { this._data[id] = v; };
  g.Game_Switches = Game_Switches;
  function Game_Variables() { this._data = []; }
  Game_Variables.prototype.value = function (id) { return this._data[id] || 0; };
  Game_Variables.prototype.setValue = function (id, v) { this._data[id] = typeof v === 'number' ? Math.floor(v) : v; };
  g.Game_Variables = Game_Variables;

  /** Sets up a new game: $gameMap, $gamePlayer and a map scene. */
  g.mzNewGame = function (name) {
    g.$gameMap = new Game_Map();
    g.$gameSwitches = new Game_Switches();
    g.$gameVariables = new Game_Variables();
    g.$gamePlayer = new Game_Character();
    g.$gamePlayer.setImage('Actor1', 0);
    g.$gameParty = { leader: () => ({ name: () => name }) };
    g.$gameTemp = { reserved: [], reserveCommonEvent(id) { this.reserved.push(id); } };
    const scene = new Scene_Map();
    g.SceneManager._scene = scene;
    scene.start();
    return scene;
  };
})(typeof window !== 'undefined' ? window : globalThis);
