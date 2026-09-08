import test, {afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createGame} from '../game.js';
import {createGameStorage} from '../game-storage.js';

// This is a Node integration test of the real entrypoint and game/storage code,
// not a WebGL or browser-E2E test. Only the three imports are replaced by
// constructor arguments; the entrypoint's handlers and startup run unchanged.
// The renderer, minimal DOM/dialog contract and HTTP responses are test doubles.
const source = await readFile(new URL('../main.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const imports = [
  "import {createGame} from './game.js';",
  "import {createChessScene} from './scene.js';",
  "import {createGameStorage} from './game-storage.js';"
];
let entrypoint = source;
for (const statement of imports) {
  assert.equal(entrypoint.split(statement).length, 2, 'Update the explicit test import seam if imports change');
  entrypoint = entrypoint.replace(statement, '');
}
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const runMain = new AsyncFunction('createGame', 'createChessScene', 'createGameStorage',
  'document', 'window', 'location', `${entrypoint}\nreturn {dispose: () => game.dispose()};`);
const originalWindow = globalThis.window;
const originalFetch = globalThis.fetch;
const apps = [];
afterEach(() => {
  for (const app of apps.splice(0)) app.dispose();
  globalThis.fetch = originalFetch;
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
});

const STORAGE_KEY = 'emilian-chess-game-v1';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(predicate, message) {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await pause(5);
  }
  assert.fail(`Timed out: ${message}`);
}
function memory(record) {
  const entries = new Map(record ? [[STORAGE_KEY, JSON.stringify(record)]] : []);
  return {
    writes: [],
    getItem: key => entries.get(key) ?? null,
    setItem(key, value) { this.writes.push({key, value}); entries.set(key, value); },
    saved() { return JSON.parse(entries.get(STORAGE_KEY)); },
    raw() { return entries.get(STORAGE_KEY); }
  };
}
const record = (moves, options = {}) => ({version: 1, viewMode: 'play',
  game: {version: 1, humanColor: 'w', targetDepth: 3, moves, ...options}});

function fakeDocument() {
  const document = {activeElement: null};
  class Element {
    constructor(tag, attrs = '') {
      this.tagName = tag.toUpperCase();
      this.listeners = new Map();
      this.attributes = new Map();
      this.dataset = {};
      this.children = [];
      this.disabled = /\sdisabled(?:\s|$)/.test(attrs);
      this.hidden = /\shidden(?:\s|$)/.test(attrs);
      this.value = '';
      this.open = false;
      this.returnValue = '';
      this.textContent = '';
      this.scrollHeight = 0;
    }
    addEventListener(type, listener) {
      const listeners = this.listeners.get(type) || [];
      listeners.push(listener);
      this.listeners.set(type, listeners);
    }
    async emit(type, details = {}) {
      const event = {target: this, defaultPrevented: false,
        preventDefault() { this.defaultPrevented = true; }, ...details};
      await Promise.all((this.listeners.get(type) || []).map(listener => listener(event)));
      return event;
    }
    async click() {
      assert.equal(this.disabled, false, 'A user cannot click a disabled control');
      this.focus();
      await this.emit('click');
    }
    focus() { document.activeElement = this; }
    setAttribute(key, value) { this.attributes.set(key, String(value)); }
    getAttribute(key) { return this.attributes.get(key) ?? null; }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = [...children]; }
    get options() { return this.children; }
    showModal() { assert.equal(this.open, false); this.open = true; }
    async close(value) {
      if (!this.open) return;
      if (value !== undefined) this.returnValue = value;
      this.open = false;
      await this.emit('close');
    }
    async escape() {
      const event = await this.emit('cancel');
      if (!event.defaultPrevented) await this.close();
    }
    querySelectorAll(selector) {
      assert.equal(selector, '[data-promote]');
      return this.promotions || [];
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  }
  const elements = new Map([...html.matchAll(/<([a-z]+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)]
    .map(([, tag, attrs, id]) => [id, new Element(tag, attrs)]));
  document.getElementById = id => {
    assert.ok(elements.has(id), `#${id} must exist in the actual index.html`);
    return elements.get(id);
  };
  document.createElement = tag => new Element(tag);
  document.getElementById('promotionModal').promotions = [...html.matchAll(/data-promote="([qrbn])"/g)]
    .map(([, type]) => { const button = new Element('button'); button.dataset.promote = type; return button; });
  // The dialog form owns these return values in the browser. Check that the
  // real markup still provides them before simulating a native form close.
  const reset = html.match(/<dialog id="resetModal"[\s\S]*?<\/dialog>/)?.[0];
  assert.match(reset, /<form method="dialog"/);
  assert.match(reset, /value="cancel"/);
  assert.match(reset, /value="confirm"/);
  return document;
}

async function mount(storage = memory(), replies = []) {
  const document = fakeDocument();
  const window = {localStorage: storage, matchMedia: () => ({matches: false})};
  globalThis.window = window;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({url, body: JSON.parse(options.body)});
    const move = replies.shift();
    assert.ok(move, 'Every engine request must have a declared fixture response');
    return {ok: true, json: async () => ({move, depth: 3, eval: 0})};
  };
  const scene = {state: null, resetSides: [], viewMode: null};
  let callbacks;
  const renderer = async options => {
    callbacks = options;
    scene.viewMode = options.viewMode;
    options.onReady();
    return {
      update: state => { scene.state = state; },
      resetView: side => { scene.resetSides.push(side); options.onCameraChange(side); },
      setViewMode: mode => { scene.viewMode = mode; options.onViewModeChange(mode); }
    };
  };
  const entry = await runMain(createGame, renderer, createGameStorage, document, window,
    {reload: () => assert.fail('No reload is expected in persistence flows')});
  const app = {storage, requests, scene, dispose: entry.dispose,
    element: id => document.getElementById(id),
    click: id => document.getElementById(id).click(),
    async change(id, value) {
      const select = document.getElementById(id);
      assert.equal(select.disabled, false);
      select.value = value;
      await select.emit('change');
    },
    square(name) { callbacks.onSquare(8 - Number(name[1]), name.charCodeAt(0) - 97); },
    move(from, to) { this.square(from); this.square(to); }
  };
  apps.push(app);
  return app;
}

test('entrypoint autosaves played moves and resumes without overwriting the saved game on startup', async () => {
  const storage = memory();
  const first = await mount(storage, ['e7e5']);
  first.move('e2', 'e4');
  assert.deepEqual(storage.saved().game.moves, ['e2e4'], 'The human move is saved before the engine replies');
  await waitFor(() => first.scene.state.moveLog.length === 2, 'engine reply');
  assert.deepEqual(storage.saved().game.moves, ['e2e4', 'e7e5']);
  await first.click('viewPlay');
  assert.equal(storage.saved().viewMode, 'play');
  first.dispose();

  const before = storage.raw();
  const writes = storage.writes.length;
  const resumed = await mount(storage, ['b8c6']);
  assert.equal(resumed.element('resumeGame').hidden, false);
  assert.equal(resumed.element('newGame').disabled, true);
  assert.equal(resumed.element('humanColor').disabled, true);
  assert.equal(resumed.scene.viewMode, 'play');
  resumed.move('d2', 'd4');
  await resumed.click('viewRoom');
  assert.equal(storage.raw(), before, 'Board input and camera controls must not destroy an unconfirmed save');
  assert.equal(storage.writes.length, writes);
  assert.equal(resumed.requests.length, 0);

  await resumed.click('resumeButton');
  assert.equal(resumed.element('resumeGame').hidden, true);
  assert.equal(resumed.element('newGame').disabled, false);
  assert.equal(resumed.element('moveCount').textContent, '2 træk');
  assert.deepEqual(resumed.scene.state.moveLog.map(move => move.uci), ['e2e4', 'e7e5']);
  resumed.move('g1', 'f3');
  await waitFor(() => resumed.scene.state.moveLog.length === 4, 'continued engine reply');
  assert.deepEqual(storage.saved().game.moves, ['e2e4', 'e7e5', 'g1f3', 'b8c6']);
  await resumed.click('mobileUndo');
  assert.deepEqual(storage.saved().game.moves, ['e2e4', 'e7e5'], 'Undo also updates the persisted transcript');
});

test('resuming a save made before the engine reply starts that reply only after Fortsæt', async () => {
  const storage = memory(record(['e2e4']));
  const app = await mount(storage, ['e7e5']);
  assert.equal(app.requests.length, 0);
  assert.equal(storage.writes.length, 0);
  await app.click('resumeButton');
  await waitFor(() => app.scene.state.moveLog.length === 2, 'resumed engine turn');
  assert.equal(app.requests.length, 1);
  assert.equal(app.requests[0].body.fen.split(' ')[1], 'b');
  assert.deepEqual(storage.saved().game.moves, ['e2e4', 'e7e5']);
});

test('Nyt spil cancellation and Escape keep the live save; confirmation replaces it', async () => {
  const storage = memory(record(['e2e4', 'e7e5']));
  const app = await mount(storage);
  await app.click('resumeButton');
  const before = storage.raw();
  for (const cancel of ['button', 'escape']) {
    await app.click('newGame');
    assert.equal(app.element('resetModal').open, true);
    assert.equal(storage.raw(), before);
    if (cancel === 'button') await app.element('resetModal').close('cancel');
    else await app.element('resetModal').escape();
    assert.equal(app.scene.state.moveLog.length, 2);
    assert.equal(storage.raw(), before);
  }
  await app.click('newGame');
  await app.element('resetModal').close('confirm');
  assert.equal(app.scene.state.moveLog.length, 0);
  assert.deepEqual(storage.saved().game.moves, []);
  assert.equal(app.element('moveCount').textContent, '0 træk');
});

test('changing colour asks first, preserves the choice on cancel and saves the confirmed black game', async () => {
  const storage = memory(record(['e2e4', 'e7e5']));
  const app = await mount(storage, ['d2d4']);
  await app.click('resumeButton');
  const before = storage.raw();
  await app.change('humanColor', 'b');
  assert.equal(app.element('resetModal').open, true);
  assert.equal(app.element('humanColor').value, 'w', 'The select must reflect the still-active game');
  await app.element('resetModal').close('cancel');
  assert.equal(storage.raw(), before);
  assert.equal(app.scene.state.humanColor, 'w');
  await app.change('humanColor', 'b');
  await app.element('resetModal').close('confirm');
  assert.equal(app.scene.state.humanColor, 'b');
  assert.equal(app.element('humanColor').value, 'b');
  assert.equal(storage.saved().game.humanColor, 'b');
  assert.deepEqual(storage.saved().game.moves, []);
  assert.equal(app.scene.resetSides.at(-1), 'b');
  await waitFor(() => app.scene.state.moveLog.length === 1, 'computer opens for black');
  assert.deepEqual(storage.saved().game.moves, ['d2d4']);
});

test('Start forfra protects an unresumed saved game until its confirmation', async () => {
  const storage = memory(record(['d2d4', 'd7d5']));
  const app = await mount(storage);
  const before = storage.raw();
  await app.click('freshButton');
  await app.element('resetModal').close('cancel');
  assert.equal(app.element('resumeGame').hidden, false);
  assert.equal(storage.raw(), before);
  await app.click('freshButton');
  await app.element('resetModal').close('confirm');
  assert.equal(app.element('resumeGame').hidden, true);
  assert.deepEqual(storage.saved().game.moves, []);
  assert.equal(app.element('newGame').disabled, false);
});

test('an empty saved black game restores its colour and camera before the computer opens', async () => {
  const storage = memory(record([], {humanColor: 'b', targetDepth: 9}));
  const app = await mount(storage, ['e2e4']);
  assert.equal(app.element('resumeGame').hidden, true, 'There is no played position requiring a resume choice');
  assert.equal(app.element('humanColor').value, 'b');
  assert.equal(app.element('skillLevel').value, '9');
  assert.equal(app.scene.resetSides.at(-1), 'b');
  assert.equal(app.element('viewSide').textContent, 'SORTS SIDE');
  assert.equal(storage.saved().game.humanColor, 'b');
  await waitFor(() => app.scene.state.moveLog.length === 1, 'saved black game computer opening');
  assert.equal(app.requests[0].body.depth, 9);
  assert.ok(storage.writes.every(({value}) => JSON.parse(value).game.humanColor === 'b'),
    'Startup must never persist a temporary white game');
  assert.deepEqual(storage.saved().game.moves, ['e2e4']);
});
