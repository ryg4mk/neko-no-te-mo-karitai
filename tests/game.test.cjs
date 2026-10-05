// Optional regression checks: node tests/game.test.cjs (no packages required).
// Run the production script with a small DOM/Canvas mock and a virtual clock.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'game.js'), 'utf8');
const storage = new Map();

function boot({ blocked = false, width = 360, height = 640 } = {}) {
  let now = 0, frames = [], listenerCount = 0;
  const context = new Proxy({ measureText: s => ({ width: s.length * 20 }) }, {
    get: (target, key) => key in target ? target[key] : () => {},
    set: (target, key, value) => { target[key] = value; return true; }
  });
  function element() {
    const listeners = new Map(), captures = new Set();
    return {
      style: {}, hidden: false, textContent: '', width: 360, height: 640,
      addEventListener(name, fn) { listenerCount++; listeners.set(name, [...(listeners.get(name) || []), fn]); },
      fire(name, event = {}) { for (const fn of listeners.get(name) || []) fn(event); },
      setAttribute() {}, focus() {}, matches: () => false,
      getContext: () => context,
      getBoundingClientRect: () => ({ left: 0, top: 0, width, height }),
      setPointerCapture: id => captures.add(id),
      hasPointerCapture: id => captures.has(id),
      releasePointerCapture: id => captures.delete(id)
    };
  }
  const elements = Object.fromEntries(['game', 'canvas', 'action', 'status'].map(id => [id, element()]));
  const document = Object.assign(element(), {
    getElementById: id => elements[id], hidden: false,
    documentElement: { clientWidth: width }, body: { clientHeight: height }
  });
  const window = Object.assign(element(), { devicePixelRatio: 2, matchMedia: () => ({ matches: false }) });
  const sandbox = {
    document, window, performance: { now: () => now },
    getComputedStyle: () => ({ paddingLeft: '0', paddingRight: '0', paddingTop: '0', paddingBottom: '0' }),
    requestAnimationFrame: fn => frames.push(fn),
    localStorage: {
      getItem(key) { if (blocked) throw Error('blocked'); return storage.get(key) ?? null; },
      setItem(key, value) { if (blocked) throw Error('blocked'); storage.set(key, value); }
    }
  };
  const instrumented = source.replace(/\}\)\(\);\s*$/, `
    globalThis.inspect = () => ({state, items, hand, held, bins, elapsed, best, newBest, effects, startedAt, pointerId});
  })();`);
  vm.runInNewContext(instrumented, sandbox, { filename: 'game.js' });
  function advance(ms) {
    const end = now + ms;
    while (now < end) {
      now = Math.min(end, now + 10);
      const pending = frames; frames = [];
      assert.equal(pending.length, 1, 'exactly one animation loop');
      pending[0](now);
    }
  }
  function pointer(name, x, y, extra = {}) {
    elements.canvas.fire(name, { pointerId: 1, isPrimary: true, button: 0, pointerType: 'touch',
      clientX: x * width / 360, clientY: y * height / 640, preventDefault() {}, ...extra });
  }
  function move(x, y) {
    pointer('pointerdown', x, y + 60);
    advance(400);
    pointer('pointerup', x, y + 60);
  }
  function start() {
    elements.action.fire('click');
    assert.equal(sandbox.inspect().state, 'COUNTDOWN');
    advance(10); assert.equal(elements.status.textContent, '3');
    pointer('pointerdown', 80, 305);
    assert.equal(sandbox.inspect().pointerId, null, 'countdown blocks input');
    advance(640); assert.equal(elements.status.textContent, '2');
    advance(650); assert.equal(elements.status.textContent, '1');
    advance(650); assert.equal(sandbox.inspect().state, 'PLAYING');
    assert.equal(sandbox.inspect().elapsed, 0, 'clock starts when 1 disappears');
  }
  function complete() {
    for (const id of ['towel', 'can', 'mouse', 'sock', 'paper', 'ball']) {
      const item = sandbox.inspect().items.find(i => i.id === id);
      move(item.x, item.y);
      assert.equal(sandbox.inspect().held.item.id, id);
      move([65, 180, 295][item.target], 170);
      assert.equal(item.active, false, `${id} goes to its matching destination`);
    }
    assert.equal(sandbox.inspect().state, 'CLEAR');
    const stopped = sandbox.inspect().elapsed;
    advance(700);
    assert.equal(sandbox.inspect().state, 'RESULT');
    assert.equal(sandbox.inspect().elapsed, stopped, 'effects do not add to the result');
    assert.equal(elements.action.hidden, false);
    return stopped;
  }
  return { inspect: sandbox.inspect, elements, start, move, pointer, advance, complete,
    listeners: () => listenerCount };
}

const game = boot();
assert.equal(game.inspect().state, 'TITLE');
const originalListeners = game.listeners();
game.start();
game.move(80, 245);
assert.equal(game.inspect().held.item.id, 'towel');
assert.equal(game.inspect().pointerId, null);
game.advance(500);
assert.equal(game.inspect().held.item.id, 'towel', 'release retains the held object');
game.move(65, 170);
assert.equal(game.inspect().held.item.id, 'towel', 'wrong bin keeps object');
const shakeAt = game.inspect().bins[0].shake;
game.advance(100);
assert.equal(game.inspect().bins[0].shake, shakeAt, 'wrong-bin cooldown');
game.pointer('pointerdown', 80, 305);
game.pointer('pointerdown', 280, 445, { pointerId: 2, isPrimary: false });
assert.equal(game.inspect().pointerId, 1, 'second touch is ignored');
game.pointer('pointercancel', 80, 305);
assert.equal(game.inspect().pointerId, null);
assert.equal(game.inspect().held.item.id, 'towel', 'cancel retains held object');
game.move(180, 345);
assert.equal(game.inspect().held.item.id, 'towel', 'only one item at a time');
game.advance(1500);
const first = game.complete();
assert.equal(game.inspect().best, first);
assert.equal(game.inspect().newBest, true);
assert.equal(Number(storage.get('nekonotemokaritai.best.v1')), first);

game.start();
assert.equal(game.inspect().items.filter(i => i.active).length, 6);
assert.equal(game.inspect().hand.x, 180);
assert.equal(game.inspect().hand.y, 555);
assert.equal(game.inspect().held, null);
const second = game.complete();
assert.ok(second < first);
assert.equal(game.inspect().best, second);
assert.equal(game.inspect().newBest, true);
game.start(); game.advance(2000); game.complete();
assert.equal(game.inspect().newBest, false);
assert.equal(game.inspect().best, second);
assert.equal(game.listeners(), originalListeners, 'retries never install additional handlers');
assert.equal(boot().inspect().best, second, 'saved best survives a fresh page');

storage.set('nekonotemokaritai.best.v1', 'NaN');
assert.equal(boot().inspect().best, null);
const privateGame = boot({ blocked: true, width: 320, height: 568 });
privateGame.start(); privateGame.complete();
assert.ok(privateGame.inspect().best > 0, 'blocked storage retains a session best');
const resized = boot({ width: 320, height: 568 });
assert.ok(parseFloat(resized.elements.game.style.width) <= 320);
assert.ok(parseFloat(resized.elements.game.style.height) <= 568);
console.log('PASS: complete runs, countdown, touch input, capture/cancel, wrong destinations, timer, storage, retries and narrow layout.');
