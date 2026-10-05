(() => {
  'use strict';

  const W = 360, H = 640;
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const host = document.getElementById('game');
  const action = document.getElementById('action');
  const status = document.getElementById('status');
  const C = {
    bg: '#F3E5CF', ink: '#4A382E', brown: '#C9824B', stripe: '#A9653B',
    white: '#F5EFE4', pink: '#D98989', blue: '#6E98B5', shadow: '#DFCCAF',
    muted: '#8B7561', red: '#C9584D', yellow: '#D8B75B'
  };
  const FONT = '"Hiragino Kaku Gothic ProN", "Yu Gothic", Meiryo, sans-serif';
  const MONO = '"SFMono-Regular", Consolas, "Liberation Mono", monospace';
  const BEST_KEY = 'nekonotemokaritai.best.v1';
  const COUNT_BEAT = 650;
  const INITIAL = [
    { id: 'towel', type: 'towel', name: 'ハンドタオル', target: 1, x: 80, y: 245 },
    { id: 'can', type: 'can', name: '空き缶', target: 0, x: 180, y: 225 },
    { id: 'mouse', type: 'mouse', name: 'ねずみのおもちゃ', target: 2, x: 285, y: 255 },
    { id: 'ball', type: 'ball', name: 'ボール', target: 2, x: 90, y: 365 },
    { id: 'paper', type: 'paper', name: '丸めた紙', target: 0, x: 185, y: 345 },
    { id: 'sock', type: 'sock', name: '靴下', target: 1, x: 280, y: 385 }
  ];
  const bins = [65, 180, 295].map((x, id) => ({ id, x, y: 115, shake: -Infinity, flash: -Infinity, cooldown: 0 }));
  const hand = { x: 180, y: 555, tx: 180, ty: 555, close: 0 };
  let state = 'TITLE', items = [], held = null, effects = [];
  let stateAt = 0, startedAt = 0, elapsed = 0, lastFrame = performance.now();
  let best = loadBest(), newBest = false, pointerId = null, lastCount = 0;
  let focused = false, pressed = false, hovered = false;
  const keys = new Set();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function loadBest() {
    try {
      const raw = localStorage.getItem(BEST_KEY);
      const value = Number(raw);
      return raw !== null && Number.isFinite(value) && value > 0 ? value : null;
    } catch { return null; }
  }

  function announce(message) { status.textContent = message; }
  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
  function timeLabel(ms) { return (ms / 1000).toFixed(2); }

  function resize() {
    const style = getComputedStyle(document.body);
    const width = document.documentElement.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const height = document.body.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    const scale = Math.min(width / W, height / H, 1.3);
    host.style.width = `${W * scale}px`;
    host.style.height = `${H * scale}px`;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(W * scale * dpr);
    canvas.height = Math.round(H * scale * dpr);
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
  }

  function releasePointer() {
    const id = pointerId;
    pointerId = null;
    if (id !== null && canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
  }

  function start() {
    if (state !== 'TITLE' && state !== 'RESULT') return;
    releasePointer();
    keys.clear();
    items = INITIAL.map(item => ({ ...item, active: true }));
    held = null;
    effects = [];
    elapsed = 0;
    newBest = false;
    Object.assign(hand, { x: 180, y: 555, tx: 180, ty: 555, close: 0 });
    bins.forEach(bin => Object.assign(bin, { shake: -Infinity, flash: -Infinity, cooldown: 0 }));
    state = 'COUNTDOWN';
    stateAt = performance.now();
    lastCount = 0;
    action.hidden = true;
    pressed = false;
    canvas.focus({ preventScroll: true });
  }

  function finish(now) {
    elapsed = now - startedAt;
    state = 'CLEAR';
    stateAt = now;
    releasePointer();
    keys.clear();
    const stored = loadBest();
    if (stored !== null && (best === null || stored < best)) best = stored;
    newBest = best === null || elapsed < best;
    if (newBest) {
      best = elapsed;
      try { localStorage.setItem(BEST_KEY, String(best)); } catch { /* Play still works when storage is blocked. */ }
    }
  }

  function pointerPosition(event) {
    const rect = canvas.getBoundingClientRect();
    hand.tx = clamp((event.clientX - rect.left) * W / rect.width, 45, 315);
    hand.ty = clamp((event.clientY - rect.top) * H / rect.height - 60, 170, 570);
  }

  canvas.addEventListener('pointerdown', event => {
    if (state !== 'PLAYING' || pointerId !== null || !event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    pointerId = event.pointerId;
    canvas.setPointerCapture(pointerId);
    pointerPosition(event);
  });
  canvas.addEventListener('pointermove', event => {
    if (state !== 'PLAYING' || event.pointerId !== pointerId) return;
    event.preventDefault();
    pointerPosition(event);
  });
  for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    canvas.addEventListener(eventName, event => {
      if (event.pointerId === pointerId) releasePointer();
    });
  }
  canvas.addEventListener('contextmenu', event => event.preventDefault());
  canvas.addEventListener('keydown', event => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      if (state === 'PLAYING') keys.add(event.key);
    }
  });
  window.addEventListener('keyup', event => keys.delete(event.key));
  window.addEventListener('blur', () => { keys.clear(); releasePointer(); pressed = false; });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { keys.clear(); releasePointer(); }
  });
  action.addEventListener('click', start);
  action.addEventListener('focus', () => { focused = true; });
  action.addEventListener('blur', () => { focused = false; pressed = false; });
  action.addEventListener('pointerenter', () => { hovered = true; });
  action.addEventListener('pointerleave', () => { hovered = false; pressed = false; });
  action.addEventListener('pointerdown', () => { pressed = true; });
  window.addEventListener('pointerup', () => { pressed = false; });
  action.addEventListener('pointercancel', () => { pressed = false; });
  window.addEventListener('resize', resize);
  window.visualViewport?.addEventListener('resize', resize);

  function heldPosition(now) {
    const p = clamp((now - held.caughtAt) / 100, 0, 1);
    const ease = 1 - (1 - p) ** 3;
    return { x: held.fromX + (hand.x - held.fromX) * ease, y: held.fromY + (hand.y - held.fromY) * ease };
  }

  function collisions(now) {
    if (!held) {
      const item = items.find(item => item.active && Math.abs(item.x - hand.x) <= 19 && Math.abs(item.y - hand.y) <= 20);
      if (item) {
        held = { item, caughtAt: now, fromX: item.x, fromY: item.y };
        announce(`${item.name}をつかみました。`);
      }
      return;
    }
    const pos = heldPosition(now);
    // The generous entrance extends down to y=185, within the hands' y>=170 reach.
    const bin = bins.find(bin => Math.abs(pos.x - bin.x) <= 40 && pos.y >= 78 && pos.y <= 185);
    if (!bin) return;
    if (bin.id !== held.item.target) {
      if (now >= bin.cooldown) {
        bin.shake = now;
        bin.cooldown = now + 750;
        announce('ここではないみたい。別の箱へ運びましょう。');
      }
      return;
    }
    const item = held.item;
    item.active = false;
    effects.push({ item, x: pos.x, y: pos.y, toX: bin.x, toY: 116, at: now });
    bin.flash = now;
    held = null;
    announce(`${item.name}を片付けました。`);
    if (items.every(item => !item.active)) finish(now);
  }

  function update(now, dt) {
    if (state === 'COUNTDOWN') {
      const count = 3 - Math.floor((now - stateAt) / COUNT_BEAT);
      if (count <= 0) {
        state = 'PLAYING';
        startedAt = now; // This is also the frame where 1 disappears and input becomes available.
        announce('スタート。6個の物を片付けましょう。');
      } else if (count !== lastCount) { lastCount = count; announce(String(count)); }
    }
    if (state === 'PLAYING') {
      elapsed = now - startedAt;
      let dx = Number(keys.has('ArrowRight')) - Number(keys.has('ArrowLeft'));
      let dy = Number(keys.has('ArrowDown')) - Number(keys.has('ArrowUp'));
      if (dx || dy) {
        const length = Math.hypot(dx, dy);
        hand.tx = clamp(hand.tx + dx / length * dt * 0.32, 45, 315);
        hand.ty = clamp(hand.ty + dy / length * dt * 0.32, 170, 570);
      }
      const follow = 1 - Math.exp(-dt / 42);
      dx = (hand.tx - hand.x) * follow;
      dy = (hand.ty - hand.y) * follow;
      // Sweep in small steps so a fast drag cannot skip a 38px pickup zone.
      const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 8));
      for (let step = 0; step < steps && state === 'PLAYING'; step++) {
        hand.x += dx / steps;
        hand.y += dy / steps;
        collisions(now);
      }
    }
    hand.close += ((held ? 6 : 0) - hand.close) * (1 - Math.exp(-dt / 35));
    effects = effects.filter(effect => now - effect.at < 150);
    // The last item vanishes in 150ms, followed by 450ms of the empty desk.
    if (state === 'CLEAR' && now - stateAt >= 600) {
      state = 'RESULT';
      action.textContent = 'もう一回';
      action.setAttribute('aria-label', 'もう一回');
      action.hidden = false;
      action.focus({ preventScroll: true });
      announce(`${timeLabel(elapsed)}秒。ベスト${timeLabel(best)}秒。${newBest ? 'ベストタイム更新。' : ''}もう一回で再挑戦できます。`);
    }
  }

  // Drawing helpers: every visible element is a Canvas path or text.
  function path(draw, fill, stroke = C.ink, width = 2.5) {
    ctx.beginPath(); draw();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
  }
  function roundRect(x, y, w, h, r, fill, stroke = C.ink, width = 2.5) {
    path(() => ctx.roundRect(x, y, w, h, r), fill, stroke, width);
  }
  function ellipse(x, y, rx, ry, fill, stroke = null, width = 2.5) {
    path(() => ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2), fill, stroke, width);
  }
  function line(points, color = C.ink, width = 2) {
    path(() => { ctx.moveTo(...points[0]); points.slice(1).forEach(p => ctx.lineTo(...p)); }, null, color, width);
  }
  function text(value, x, y, size, color = C.ink, weight = 700, font = FONT) {
    ctx.fillStyle = color;
    ctx.font = `${weight} ${size}px ${font}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(value, x, y);
  }
  function desk() {
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    line([[0, 192], [360, 192]], '#E9D8BD', 1.3);
    line([[0, 433], [360, 433]], '#E9D8BD', 1.3);
    line([[29, 202], [56, 202]], '#E9D8BD', 1.3);
    line([[291, 443], [325, 443]], '#E9D8BD', 1.3);
    roundRect(0, 627, W, 13, 0, '#EAD7B9', null);
    line([[0, 627], [360, 627]], '#D8BF9E', 1.5);
  }

  function drawBin(bin, now) {
    const age = now - bin.shake;
    const shake = age < 320 && !reducedMotion.matches ? Math.sin(age / 320 * Math.PI * 6) * 3 * (1 - age / 320) : 0;
    ctx.save(); ctx.translate(bin.x + shake, bin.y);
    ellipse(0, 37, 38, 7, C.shadow);
    const flashAge = now - bin.flash;
    if (flashAge < 320) {
      ctx.globalAlpha = 1 - flashAge / 320;
      line([[-44, -9], [-49, -13]], C.stripe, 2.5);
      line([[44, -9], [49, -13]], C.stripe, 2.5);
      line([[0, -42], [0, -47]], C.stripe, 2.5);
      ctx.globalAlpha = 1;
    }
    if (bin.id === 0) {
      path(() => { ctx.moveTo(-31, -23); ctx.lineTo(-26, 31); ctx.quadraticCurveTo(0, 38, 26, 31); ctx.lineTo(31, -23); ctx.closePath(); }, '#7C8585');
      ellipse(0, -23, 35, 8, '#A6AAA2', C.ink);
      ellipse(0, -23, 25, 3, '#5D6564');
      line([[-22, -10], [-19, 23]], '#A6AAA2', 2);
      line([[22, -10], [19, 23]], '#646E6C', 2);
      roundRect(-9, -3, 18, 23, 3, null, C.white, 2);
      line([[-13, -6], [13, -6]], C.white, 2.5);
      line([[-4, -7], [-4, -11], [4, -11], [4, -7]], C.white, 2);
      line([[-3, 3], [-3, 13]], C.white, 1.6);
      line([[3, 3], [3, 13]], C.white, 1.6);
    } else if (bin.id === 1) {
      roundRect(-23, -34, 46, 24, 9, null, C.blue, 4);
      path(() => { ctx.moveTo(-35, -21); ctx.lineTo(-29, 31); ctx.quadraticCurveTo(0, 37, 29, 31); ctx.lineTo(35, -21); ctx.closePath(); }, '#E9DFC9');
      for (const x of [-23, 23]) for (const y of [-6, 5, 16]) roundRect(x - 3, y, 6, 4, 2, C.blue, null);
      roundRect(-37, -25, 74, 9, 4, C.blue);
      path(() => { ctx.moveTo(-7, -8); ctx.lineTo(-17, -2); ctx.lineTo(-12, 7); ctx.lineTo(-7, 4); ctx.lineTo(-7, 23); ctx.lineTo(8, 23); ctx.lineTo(8, 4); ctx.lineTo(13, 7); ctx.lineTo(18, -2); ctx.lineTo(8, -8); ctx.quadraticCurveTo(0, 1, -7, -8); ctx.closePath(); }, C.white, C.blue, 2);
    } else {
      roundRect(-34, -25, 68, 13, 5, '#A9653B');
      ellipse(-13, -21, 10, 11, C.yellow, C.ink, 2);
      path(() => { ctx.moveTo(2, -21); ctx.lineTo(9, -36); ctx.lineTo(24, -29); ctx.lineTo(18, -15); ctx.closePath(); }, C.blue, C.ink, 2);
      roundRect(-35, -18, 70, 51, 6, '#C99058');
      roundRect(-37, -23, 74, 9, 3, '#DBAA76');
      line([[-25, 25], [25, 25]], '#AD7343', 2);
      ellipse(0, 6, 13, 13, C.yellow, C.ink, 2);
      path(() => { ctx.moveTo(-10, -2); ctx.quadraticCurveTo(0, 6, 10, 14); }, null, C.ink, 1.8);
      path(() => { ctx.moveTo(9, -3); ctx.quadraticCurveTo(-1, 4, -8, 16); }, null, C.ink, 1.8);
    }
    ctx.restore();
  }

  function drawItem(type, x, y, scale = 1, shadow = true) {
    ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
    if (shadow) ellipse(1, 21, type === 'towel' ? 24 : 19, 5, C.shadow);
    if (type === 'can') {
      ctx.rotate(-0.15);
      roundRect(-13, -20, 26, 40, 5, C.red);
      path(() => { ctx.moveTo(-12, -6); ctx.bezierCurveTo(-4, -12, 3, 8, 12, 1); ctx.lineTo(12, 8); ctx.bezierCurveTo(3, 15, -4, -4, -12, 1); ctx.closePath(); }, C.white, null);
      roundRect(-13, 15, 26, 6, 3, '#C6C7BD', C.ink, 2);
      ellipse(0, -19, 13, 4, '#C6C7BD', C.ink, 2);
      ellipse(1, -19, 4, 1.6, '#7C8585');
    } else if (type === 'paper') {
      path(() => { ctx.moveTo(-18, -7); ctx.lineTo(-10, -17); ctx.lineTo(1, -20); ctx.lineTo(15, -11); ctx.lineTo(20, 2); ctx.lineTo(13, 16); ctx.lineTo(-2, 19); ctx.lineTo(-17, 10); ctx.lineTo(-21, 0); ctx.closePath(); }, '#EEE8DA');
      line([[-10, -16], [-5, -6], [-12, 1], [-6, 10]], '#B8B4A8', 1.8);
      line([[14, -10], [3, -6], [8, 4], [1, 12], [12, 16]], '#B8B4A8', 1.8);
      line([[-5, -6], [3, -6]], '#B8B4A8', 1.8);
    } else if (type === 'sock') {
      ctx.rotate(0.2);
      path(() => { ctx.moveTo(-5, -24); ctx.lineTo(14, -24); ctx.lineTo(14, 9); ctx.quadraticCurveTo(13, 20, 1, 23); ctx.lineTo(-17, 23); ctx.quadraticCurveTo(-29, 21, -24, 11); ctx.lineTo(-5, 3); ctx.closePath(); }, C.white);
      path(() => { ctx.moveTo(-20, 10); ctx.quadraticCurveTo(-11, 14, -13, 23); ctx.lineTo(-19, 23); ctx.quadraticCurveTo(-30, 19, -24, 12); ctx.closePath(); }, C.blue, null);
      path(() => { ctx.moveTo(5, 6); ctx.lineTo(13, 5); ctx.quadraticCurveTo(14, 15, 5, 19); ctx.quadraticCurveTo(1, 14, 5, 6); }, C.blue, null);
      line([[-3, -17], [12, -17]], C.blue, 3);
      line([[-3, -12], [12, -12]], C.blue, 2);
    } else if (type === 'towel') {
      ctx.rotate(-0.1);
      roundRect(-23, -15, 46, 34, 5, '#709EAE');
      roundRect(-23, -19, 46, 31, 5, '#8EB9C7');
      line([[-15, -16], [-15, 9]], '#C6DFDF', 2.5);
      line([[14, -16], [14, 9]], '#C6DFDF', 2.5);
      line([[-17, 16], [17, 16]], '#B6D2D7', 1.6);
    } else if (type === 'ball') {
      ellipse(0, 0, 20, 20, C.yellow);
      ctx.save(); ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.clip();
      path(() => { ctx.moveTo(-21, -20); ctx.lineTo(6, -20); ctx.bezierCurveTo(-6, -8, -6, 8, 4, 21); ctx.lineTo(-21, 21); ctx.closePath(); }, '#C95E55', C.ink, 1.8);
      path(() => { ctx.moveTo(12, -21); ctx.bezierCurveTo(0, -6, 12, 4, 21, 5); ctx.lineTo(24, -21); ctx.closePath(); }, '#668EA8', C.ink, 1.8);
      ctx.restore(); ellipse(0, 0, 20, 20, null, C.ink);
    } else if (type === 'mouse') {
      path(() => { ctx.moveTo(15, 7); ctx.bezierCurveTo(36, 21, 36, -7, 23, -2); }, null, C.ink, 4.5);
      path(() => { ctx.moveTo(15, 7); ctx.bezierCurveTo(36, 21, 36, -7, 23, -2); }, null, '#D28D94', 2.5);
      path(() => { ctx.moveTo(-22, 8); ctx.bezierCurveTo(-18, -9, -5, -17, 7, -12); ctx.bezierCurveTo(25, -8, 23, 14, 8, 16); ctx.quadraticCurveTo(-10, 18, -22, 8); ctx.closePath(); }, '#858181');
      ellipse(-4, -10, 8, 9, '#D28D94', C.ink, 2);
      ellipse(-4, -10, 4, 5, '#E8B4B4');
      ellipse(-13, 2, 2, 2, C.ink);
      ellipse(-22, 8, 2.8, 2.8, C.pink, C.ink, 1.5);
    }
    ctx.restore();
  }

  function onePaw(x, y, mirror) {
    ctx.save(); ctx.translate(x, y); ctx.scale(mirror, 1);
    // Draw the same bent foreleg twice, mirroring the second one exactly.
    path(() => {
      ctx.moveTo(-24, H - y + 8); ctx.lineTo(-24, 20);
      ctx.bezierCurveTo(-29, 7, -27, -17, -17, -27);
      ctx.bezierCurveTo(-13, -35, -4, -37, 1, -31);
      ctx.bezierCurveTo(7, -37, 16, -30, 16, -24);
      ctx.bezierCurveTo(26, -25, 30, -13, 24, -6);
      ctx.bezierCurveTo(36, 0, 27, 19, 17, 22);
      ctx.quadraticCurveTo(13, 30, 14, 48); ctx.lineTo(18, H - y + 8); ctx.closePath();
    }, C.brown);
    path(() => {
      ctx.moveTo(-24, 10); ctx.bezierCurveTo(-31, -5, -22, -27, -17, -27);
      ctx.bezierCurveTo(-13, -35, -4, -37, 1, -31);
      ctx.bezierCurveTo(7, -37, 16, -30, 16, -24);
      ctx.bezierCurveTo(26, -25, 30, -13, 24, -6);
      ctx.bezierCurveTo(36, 0, 27, 19, 17, 22);
      ctx.lineTo(10, 31); ctx.quadraticCurveTo(0, 22, -5, 29);
      ctx.quadraticCurveTo(-13, 22, -24, 26); ctx.closePath();
    }, C.white, null);
    path(() => { ctx.moveTo(-23, 46); ctx.quadraticCurveTo(-12, 43, -6, 49); ctx.quadraticCurveTo(-15, 54, -23, 54); }, C.stripe, null);
    path(() => { ctx.moveTo(-23, 66); ctx.quadraticCurveTo(-13, 62, -4, 69); ctx.quadraticCurveTo(-13, 73, -23, 73); }, C.stripe, null);
    line([[1, -30], [0, -20]], C.ink, 1.8);
    line([[16, -23], [12, -15]], C.ink, 1.8);
    ellipse(20, 4, 5, 8, C.pink);
    ellipse(19, -9, 3, 3.5, C.pink);
    ctx.restore();
  }

  function paws() {
    onePaw(hand.x - 35 + hand.close, hand.y, 1);
    onePaw(hand.x + 35 - hand.close, hand.y, -1);
  }

  function pawMark() {
    ctx.save(); ctx.translate(180, 205); ctx.rotate(-0.13);
    ellipse(0, 5, 12, 10, C.brown);
    for (const [x, y, r] of [[-14, -7, 5], [-5, -14, 5.5], [7, -13, 5.5], [16, -4, 4.5]]) ellipse(x, y, r, r + 1, C.brown);
    ctx.restore();
  }

  function button(label) {
    const offset = pressed ? 3 : 0;
    roundRect(80, 363, 200, 62, 20, '#BBA080', null);
    roundRect(80, 358 + offset, 200, 62, 20, hovered ? '#D58E55' : C.brown, C.ink, 2.5);
    text(label, 180, 389 + offset, 19, C.white);
    if (focused && action.matches(':focus-visible')) roundRect(74, 352, 212, 74, 25, null, C.ink, 2);
  }

  function draw(now) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    desk();
    if (state === 'TITLE') {
      pawMark();
      text('猫の手も借りたい', 180, 266, 30);
      text('猫の手で、ぜんぶお片付け。', 180, 309, 13, C.muted, 500);
      button('スタート');
      paws();
      return;
    }
    if (state === 'RESULT') {
      // Results use the same resting hands and uncluttered desk as the title.
      const savedX = hand.x, savedY = hand.y;
      hand.x = 180; hand.y = 555; paws(); hand.x = savedX; hand.y = savedY;
      if (newBest) {
        line([[107, 219], [99, 216]], C.stripe, 2);
        line([[253, 219], [261, 216]], C.stripe, 2);
        text('NEW BEST!', 180, 218, 14, C.stripe, 700, MONO);
      }
      const result = timeLabel(elapsed);
      const size = result.length > 6 ? 37 : 48;
      ctx.font = `700 ${size}px ${MONO}`;
      const numberWidth = ctx.measureText(result).width;
      const total = numberWidth + 27;
      text(result, 180 - 13.5, 271, size, C.ink, 700, MONO);
      text('秒', 180 + total / 2 - 9, 282, 17);
      text(`BEST ${timeLabel(best)}秒`, 180, 319, 14, C.muted, 500);
      button('もう一回');
      return;
    }
    bins.forEach(bin => drawBin(bin, now));
    // Forelegs sit behind desk objects; the held item is always on top.
    paws();
    items.forEach(item => {
      if (item.active && item !== held?.item) drawItem(item.type, item.x, item.y);
    });
    if (held) {
      const pos = heldPosition(now);
      drawItem(held.item.type, pos.x, pos.y, 1, false);
    }
    effects.forEach(effect => {
      const p = clamp((now - effect.at) / 150, 0, 1);
      ctx.globalAlpha = 1 - p;
      drawItem(effect.item.type, effect.x + (effect.toX - effect.x) * p, effect.y + (effect.toY - effect.y) * p, 1 - p * 0.65, false);
      ctx.globalAlpha = 1;
    });
    text(timeLabel(elapsed), 180, 39, 29, C.ink, 600, MONO);
    if (state === 'COUNTDOWN') {
      ctx.fillStyle = 'rgba(243,229,207,0.56)'; ctx.fillRect(0, 66, W, 441);
      const phase = ((now - stateAt) % COUNT_BEAT) / COUNT_BEAT;
      const scale = reducedMotion.matches ? 1 : 1 + 0.12 * Math.max(0, 1 - phase * 4);
      ctx.save(); ctx.translate(180, 310); ctx.scale(scale, scale);
      ellipse(0, 3, 48, 48, C.shadow);
      ellipse(0, -2, 48, 48, C.white, C.ink, 2.5);
      text(String(lastCount || 3), 0, -1, 48, C.ink, 700, MONO);
      ctx.restore();
    }
  }

  function frame(now) {
    const dt = Math.min(Math.max(0, now - lastFrame), 50);
    lastFrame = now;
    update(now, dt);
    draw(now);
    requestAnimationFrame(frame);
  }

  resize();
  requestAnimationFrame(frame);
})();
