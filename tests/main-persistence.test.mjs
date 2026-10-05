import test, {afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createGame} from '../game.js';
import {createGameStorage} from '../game-storage.js';
import {createBackupText,parseBackupText,MAX_BACKUP_BYTES} from '../game-backup.js';

// This is a Node integration test of the real entrypoint and game/storage code,
// not a WebGL or browser-E2E test. Only the imports are replaced by
// constructor arguments; the entrypoint's handlers and startup run unchanged.
// The renderer, minimal DOM/dialog contract and HTTP responses are test doubles.
const source = await readFile(new URL('../main.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const imports = [
  "import {createGame} from './game.js';",
  "import {createChessScene} from './scene.js';",
  "import {createGameStorage} from './game-storage.js';",
  "import {createBackupText,parseBackupText,MAX_BACKUP_BYTES} from './game-backup.js';"
];
let entrypoint = source;
for (const statement of imports) {
  assert.equal(entrypoint.split(statement).length, 2, 'Update the explicit test import seam if imports change');
  entrypoint = entrypoint.replace(statement, '');
}
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const runMain = new AsyncFunction('createGame', 'createChessScene', 'createGameStorage',
  'createBackupText', 'parseBackupText', 'MAX_BACKUP_BYTES',
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
        preventDefault() { this.defaultPrevented = true; },
        stopPropagation() { this.propagationStopped = true; }, ...details};
      await Promise.all((this.listeners.get(type) || []).map(listener => listener(event)));
      return event;
    }
    async click() {
      assert.equal(this.disabled, false, 'A user cannot click a disabled control');
      this.focus();
      if (this.tagName === 'A') document.downloads.push({href: this.href, name: this.download});
      await this.emit('click');
    }
    focus() { document.activeElement = this; }
    setAttribute(key, value) { this.attributes.set(key, String(value)); }
    getAttribute(key) { return this.attributes.get(key) ?? null; }
    closest(selector) {
      return selector.split(',').some(part=>part===this.tagName.toLowerCase()
        ||part==='[role="textbox"]'&&this.getAttribute('role')==='textbox'
        ||part==='[contenteditable]:not([contenteditable="false"])'&&this.attributes.has('contenteditable')&&this.getAttribute('contenteditable')!=='false')?this:null;
    }
    append(...children) { this.children.push(...children); }
    remove() {}
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
  const events=new Element('document');
  document.addEventListener=events.addEventListener.bind(events);
  document.emit=events.emit.bind(events);
  document.fullscreenElement=null;
  document.getElementById = id => {
    assert.ok(elements.has(id), `#${id} must exist in the actual index.html`);
    return elements.get(id);
  };
  document.createElement = tag => new Element(tag);
  document.body = new Element('body');
  document.downloads = [];
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
  const blobs = new Map();
  const window = {localStorage: storage, matchMedia: () => ({matches: false}), Blob,
    URL: {createObjectURL: blob => { const url = `blob:test-${blobs.size}`; blobs.set(url, blob); return url; }, revokeObjectURL() {}},
    setTimeout: callback => callback()};
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
    scene.drone={running:false,reducedMotion:false};
    const publishDrone=()=>options.onDroneChange({...scene.drone});
    options.onReady();
    return {
      update: state => { scene.state = state; },
      resetView: side => { scene.drone.running=false;publishDrone();scene.resetSides.push(side); options.onCameraChange(side); },
      setViewMode: mode => { scene.drone.running=false;publishDrone();scene.viewMode = mode; options.onViewModeChange(mode); },
      startDrone:()=>{scene.drone.running=true;publishDrone();},
      pauseDrone:()=>{scene.drone.running=false;publishDrone();},
      toggleDrone:()=>{scene.drone.running=!scene.drone.running;publishDrone();}
    };
  };
  const entry = await runMain(createGame, renderer, createGameStorage, createBackupText, parseBackupText, MAX_BACKUP_BYTES, document, window,
    {reload: () => assert.fail('No reload is expected in persistence flows')});
  const app = {storage, requests, scene, dispose: entry.dispose,
    canMove:()=>callbacks.canMove(),
    blockedInput:()=>callbacks.onInputBlocked(),
    fullscreen:async()=>{document.fullscreenElement=document.body;await document.emit('fullscreenchange');},
    key:details=>document.emit('keydown',{key:' ',code:'Space',target:document.getElementById('boardCanvas'),...details}),
    createElement:tag=>document.createElement(tag),
    reducedMotion:value=>{scene.drone.reducedMotion=value;scene.drone.running=false;callbacks.onDroneChange({...scene.drone});},
    async download() { const item = document.downloads.at(-1); return {name: item.name, text: await blobs.get(item.href).text()}; },
    async import(text, size = new TextEncoder().encode(text).length) {
      document.getElementById('backupFile').files = [{size, text: async () => text}];
      await document.getElementById('backupFile').emit('change');
    },
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

test('drone control updates accessible state, protects the saved game and disables with reduced motion',async()=>{
  const storage=memory(record(['e2e4','e7e5']));
  const app=await mount(storage),before=storage.raw();
  assert.equal(app.element('droneToggle').getAttribute('aria-pressed'),'true');
  assert.equal(app.element('droneLabel').textContent,'Spacebar to Start/Stop Rotation');
  await app.click('droneToggle');
  assert.equal(app.element('droneToggle').getAttribute('aria-pressed'),'false');
  assert.equal(app.element('droneLabel').textContent,'Spacebar to Start/Stop Rotation');
  await app.click('droneToggle');assert.equal(app.scene.drone.running,true);
  app.reducedMotion(true);
  assert.equal(app.element('droneToggle').disabled,true);
  assert.equal(app.element('droneLabel').textContent,'Rotation slået fra');
  assert.equal(storage.raw(),before);assert.equal(app.requests.length,0);
});

test('Space starts and stops rotation once per press without selecting a square, also in fullscreen',async()=>{
  const app=await mount(),before=app.storage.raw();
  const first=await app.key();
  assert.equal(app.scene.drone.running,false);assert.equal(first.defaultPrevented,true);assert.equal(first.propagationStopped,true);
  const held=await app.key({repeat:true});
  assert.equal(held.defaultPrevented,true);assert.equal(app.scene.drone.running,false);
  await app.key();assert.equal(app.scene.drone.running,true);
  await app.fullscreen();
  await app.key();assert.equal(app.scene.drone.running,false);
  await app.key({code:''});assert.equal(app.scene.drone.running,true);
  assert.equal(app.scene.state.selected,null);assert.equal(app.scene.state.moveLog.length,0);
  assert.equal(app.storage.raw(),before);assert.equal(app.requests.length,0);
});

test('rotation shortcut leaves focused controls, editable content, modified keys and open dialogs alone',async()=>{
  const app=await mount();
  const input=app.createElement('div');input.setAttribute('contenteditable','true');
  const textbox=app.createElement('div');textbox.setAttribute('role','textbox');
  const targets=['button','input','textarea','select','a','summary'].map(tag=>app.createElement(tag)).concat(input,textbox);
  for(const target of targets){const event=await app.key({target});assert.equal(event.defaultPrevented,false);assert.equal(app.scene.drone.running,true);}
  for(const details of [{altKey:true},{ctrlKey:true},{metaKey:true},{shiftKey:true},{defaultPrevented:true},{key:'Enter',code:'Enter'}]){
    await app.key(details);assert.equal(app.scene.drone.running,true);
  }
  for(const id of ['promotionModal','resetModal','drawModal','importModal','resumeModal']){
    app.element(id).open=true;
    assert.equal((await app.key()).defaultPrevented,false);assert.equal(app.scene.drone.running,true);
    app.element(id).open=false;
  }
  app.reducedMotion(true);await app.key();assert.equal(app.scene.drone.running,false);
});

test('fullscreen exposes the pending resume choice, preserves a declined save, and enables moves after continuing',async()=>{
  const storage=memory(record(['e2e4','e7e5'])),before=storage.raw();
  const app=await mount(storage,['d7d5']);
  await app.fullscreen();
  assert.equal(app.element('resumeModal').open,true);
  assert.equal(app.scene.drone.running,false);
  assert.equal(app.canMove(),false);
  assert.equal(storage.raw(),before);assert.equal(app.requests.length,0);
  await app.element('resumeModal').escape();
  assert.equal(app.canMove(),false);assert.equal(storage.raw(),before);
  assert.equal(app.blockedInput(),true,'A blocked grab opens the same choice without starting a camera gesture');
  assert.equal(app.element('resumeModal').open,true);
  await app.click('resumeContinue');
  assert.equal(app.element('resumeModal').open,false);
  assert.equal(app.canMove(),true);assert.equal(app.blockedInput(),false);
  assert.deepEqual(app.scene.state.moveLog.map(move=>move.uci),['e2e4','e7e5']);
  app.move('d2','d4');
  assert.deepEqual(storage.saved().game.moves,['e2e4','e7e5','d2d4']);
  await waitFor(()=>app.scene.state.moveLog.length===4,'resumed engine reply');
});

test('starting over from the resume dialog still requires confirmation and cancellation keeps the saved game',async()=>{
  const storage=memory(record(['e2e4','e7e5'])),before=storage.raw(),app=await mount(storage);
  app.blockedInput();await app.click('resumeFresh');
  assert.equal(app.element('resumeModal').open,false);
  assert.equal(app.element('resetModal').open,true);assert.equal(storage.raw(),before);
  await app.element('resetModal').close('cancel');
  assert.equal(app.canMove(),false);assert.equal(storage.raw(),before);
  app.blockedInput();await app.click('resumeFresh');
  await app.element('resetModal').close('confirm');
  assert.equal(app.canMove(),true);assert.deepEqual(storage.saved().game.moves,[]);
});

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
  assert.equal(resumed.canMove(),false,'Piece dragging must be blocked before choosing to resume');
  assert.equal(resumed.element('newGame').disabled, true);
  assert.equal(resumed.element('humanColor').disabled, true);
  assert.equal(resumed.scene.viewMode, 'play');
  resumed.move('d2', 'd4');
  await resumed.click('viewRoom');
  assert.equal(storage.raw(), before, 'Board input and camera controls must not destroy an unconfirmed save');
  assert.equal(storage.writes.length, writes);
  assert.equal(resumed.requests.length, 0);

  await resumed.click('resumeButton');
  assert.equal(resumed.canMove(),true,'Piece dragging is enabled after the saved game is resumed');
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

test('backup exports an unresumed save without replacing it or requesting an engine move', async () => {
  const storage = memory(record(['d2d4', 'd7d5'], {targetDepth: 12}));
  const app = await mount(storage);
  const before = storage.raw();
  await app.click('exportGame');
  const download = await app.download();
  assert.match(download.name, /^chess-parti-.*\.json$/);
  assert.deepEqual(parseBackupText(download.text), storage.saved());
  assert.equal(storage.raw(), before);
  assert.equal(storage.writes.length, 0);
  assert.equal(app.requests.length, 0);
});

test('invalid and oversized imports preserve the saved and live game without opening confirmation', async () => {
  const storage = memory(record(['e2e4', 'e7e5']));
  const app = await mount(storage);
  await app.click('resumeButton');
  const before = storage.raw();
  for (const [text, size] of [['{broken'], [JSON.stringify({format: 'emilian-chess-backup', ...record(['e2e5'])})], ['{}', 100001]]) {
    await app.import(text, size);
    assert.equal(storage.raw(), before);
    assert.equal(app.element('importModal').open, false);
    assert.deepEqual(app.scene.state.moveLog.map(move => move.uci), ['e2e4', 'e7e5']);
  }
  assert.equal(app.requests.length, 0);
});

test('import cancellation and Escape preserve an unresumed save; confirmation restores view, choices and undo', async () => {
  const storage = memory(record(['e2e4', 'e7e5']));
  const app = await mount(storage);
  const before = storage.raw();
  const incoming = createBackupText(record(['d2d4', 'd7d5'], {targetDepth: 12}).game, 'room');
  for (const cancel of ['button', 'escape']) {
    await app.import(incoming);
    assert.equal(storage.raw(), before, 'Reading and replay validation must never save the incoming game');
    assert.equal(app.element('importModal').open, true);
    if (cancel === 'button') await app.element('importModal').close('cancel');
    else await app.element('importModal').escape();
    assert.equal(storage.raw(), before);
    assert.equal(app.element('resumeGame').hidden, false);
  }
  await app.import(incoming);
  await app.element('importModal').close('confirm');
  assert.deepEqual(storage.saved(), {...record(['d2d4', 'd7d5'], {targetDepth: 12}), viewMode: 'room'});
  assert.equal(storage.saved().viewMode, 'room');
  assert.equal(app.scene.viewMode, 'room');
  assert.equal(app.element('skillLevel').value, '12');
  assert.equal(app.element('resumeGame').hidden, true);
  await app.click('undo');
  assert.deepEqual(storage.saved().game.moves, []);
});

test('restoring an engine turn requests its move only after confirmation', async () => {
  const storage = memory(record(['d2d4', 'd7d5']));
  const app = await mount(storage, ['e7e5']);
  const incoming = createBackupText(record(['e2e4']).game, 'play');
  await app.import(incoming);
  assert.equal(app.requests.length, 0);
  await app.element('importModal').close('confirm');
  await waitFor(() => app.scene.state.moveLog.length === 2, 'imported engine turn');
  assert.equal(app.requests.length, 1);
  assert.deepEqual(storage.saved().game.moves, ['e2e4', 'e7e5']);
});

test('a restored game remains exportable when browser storage rejects writes', async () => {
  const storage = memory();
  storage.setItem = () => { throw new Error('Storage blocked'); };
  const app = await mount(storage);
  await app.import(createBackupText(record(['e2e4', 'e7e5']).game, 'room'));
  await app.element('importModal').close('confirm');
  assert.match(app.element('saveMessage').textContent, /kunne ikke gemme/);
  await app.click('exportGame');
  assert.deepEqual(parseBackupText((await app.download()).text).game.moves, ['e2e4', 'e7e5']);
});

test('confirmed import rejects a late response from the game it replaces', async () => {
  const app = await mount(memory());
  let reply;
  globalThis.fetch = () => new Promise(resolve => { reply = resolve; });
  app.move('e2', 'e4');
  await waitFor(() => reply, 'outgoing game engine request');
  await app.import(createBackupText(record(['d2d4', 'd7d5']).game, 'play'));
  await app.element('importModal').close('confirm');
  reply({ok: true, json: async () => ({move: 'e7e5', depth: 3, eval: 0})});
  await pause(80);
  assert.deepEqual(app.storage.saved().game.moves, ['d2d4', 'd7d5']);
  assert.deepEqual(app.scene.state.moveLog.map(move => move.uci), ['d2d4', 'd7d5']);
});
