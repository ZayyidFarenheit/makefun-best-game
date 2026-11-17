// INKBOUND — entry point. One job: own the canvas, the fixed-step loop, the
// screen state machine, and the debug handle the verification harness drives.

import { VIEW_W, VIEW_H, FIXED_DT, UPGRADES } from './config.js';
import { createRun, startRun, resetRunState, update, startChapter, applyUpgrade, chooseUpgrade, spawnEnemy } from './world.js';
import { render } from './render.js';
import { Input } from './input.js';
import { SoundBank } from './audio.js';

const canvas = document.getElementById('game');
canvas.width = VIEW_W;
canvas.height = VIEW_H;
const ctx = canvas.getContext('2d');

const params = new URLSearchParams(window.location.search);
const shotKind = params.get('shot');
const seed = Number(params.get('seed') || '1') || 1;

const run = createRun(seed);
const input = new Input(canvas);
const sfx = new SoundBank();
let best = 0;
try { best = Number(window.localStorage.getItem('inkbound-best') || '0') || 0; } catch (e) { /* storage off */ }

// --- autoplay bot: drives the same input surface a human uses, so the
// balance test measures the real game, not a shortcut. ---
function botTarget() {
  const p = run.player;
  if (!p) return null;
  // An eraser about to hit the Warden outranks everything: self-defence first.
  for (const e of run.enemies) {
    if (e.behavior === 'warden' && Math.hypot(e.x - p.x, e.y - p.y) < 220) return e;
  }
  // Otherwise shoot the enemy closest to the Tome — the real threat.
  let target = null, bestD = Infinity;
  for (const e of run.enemies) {
    const d = Math.hypot(e.x - 640, e.y - 360) - e.radius;
    if (d < bestD) { bestD = d; target = e; }
  }
  return target;
}

class BotInput {
  constructor() { this.mouseX = 640; this.mouseY = 300; this.mouseDown = true; }
  moveVector() {
    const p = run.player;
    if (!p) return { x: 0, y: 0 };
    // Kite away from an eraser that is about to touch the Warden.
    for (const e of run.enemies) {
      if (e.behavior === 'warden' && Math.hypot(e.x - p.x, e.y - p.y) < 100) {
        const dx = p.x - e.x, dy = p.y - e.y;
        const d = Math.hypot(dx, dy) || 1;
        return { x: dx / d, y: dy / d };
      }
    }
    // Otherwise hold a guard post near the Tome on the threatened side and
    // let the ink do the travelling: bullets cross the whole room.
    const target = botTarget();
    let gx = 640, gy = 480;
    if (target && target.behavior !== 'warden' && target.type !== 'boss') {
      const a = Math.atan2(target.y - 360, target.x - 640);
      gx = 640 + Math.cos(a) * 115;
      gy = 360 + Math.sin(a) * 115;
    } else if (target) { gx = target.x; gy = target.y; }
    const dx = gx - p.x, dy = gy - p.y;
    const d = Math.hypot(dx, dy);
    if (d < 10) return { x: 0, y: 0 };
    return { x: dx / d, y: dy / d };
  }
  down(key) {
    if (key !== ' ' && key !== 'shift') return false;
    const p = run.player;
    if (!p || p.dashCd > 0) return false;
    for (const e of run.enemies) {
      if (Math.hypot(e.x - p.x, e.y - p.y) < 78) return true;
    }
    return false;
  }
  wasPressed() { return false; }
}
const bot = new BotInput();
let autoplay = false;

function aimBot() {
  const target = botTarget();
  if (target) { bot.mouseX = target.x; bot.mouseY = target.y; }
  bot.mouseDown = true;
}

// --- deterministic screenshot stages (?shot=start|play|boss&seed=N) ---
// Staged with a NEUTRAL input (no shooting): the scene stays dense and alive
// for the screenshot instead of being mopped up by the bot before the shot.
const stageInput = {
  mouseX: 640, mouseY: 200, mouseDown: false,
  moveVector() { return { x: 0, y: 0 }; },
  down() { return false; },
  wasPressed() { return false; },
};

function stageShot(kind) {
  if (kind === 'start') { run.phase = 'title'; return; }
  startRun(run);
  if (kind === 'play') {
    startChapter(run, 3);
    run.spawnQueue = run.spawnQueue.slice(0, 6);
    applyUpgrade(run, 'damage'); applyUpgrade(run, 'spread');
    applyUpgrade(run, 'trap'); applyUpgrade(run, 'shelf');
    run.score = 1240; run.chain = 6; run.chainTimer = 999;
    run.tome.integrity = 82;
    run.player.ink = 64;
    run.player.x = 640; run.player.y = 480;
    const spots = [[400, 220], [840, 200], [500, 160], [800, 280], [360, 400], [900, 420], [640, 140], [300, 280], [980, 300], [480, 540], [800, 560], [640, 560], [420, 480], [860, 480], [540, 240], [820, 520]];
    const kinds = ['blot', 'worm', 'page', 'blot', 'eraser', 'mite', 'spill', 'worm', 'blot', 'page', 'mite', 'worm', 'blot', 'eraser', 'page', 'worm'];
    spots.forEach((s, i) => spawnEnemy(run, kinds[i], s[0], s[1]));
    // Ink bolts already in flight, a trap blooming, splats and numbers.
    for (let i = 0; i < 8; i++) {
      const a = -Math.PI / 2 + (i - 3.5) * 0.22;
      // Staged bolt: a long life so it is still flying when the shot is taken.
      run.bullets.push({ x: 640 + Math.cos(a) * (30 + i * 12), y: 480 + Math.sin(a) * (30 + i * 12), vx: Math.cos(a) * 640, vy: Math.sin(a) * 640, damage: 18, life: 4 });
    }
    run.traps.push({ x: 500, y: 300, radius: 46, life: 25, tickCd: 0 });
    // Staged splats and numbers: a long life so they are still visible at shot time.
    for (let i = 0; i < 14; i++) {
      run.particles.push({ x: 480 + i * 12, y: 300 + (i % 3) * 14, vx: 20, vy: -30, life: 4, max: 4, color: '#7b2ff7', size: 4 });
    }
    run.floaters.push({ x: 560, y: 240, text: '-18', color: '#ffd166', life: 4, max: 4 });
    run.floaters.push({ x: 820, y: 200, text: '+32', color: '#8ecae6', life: 4, max: 4 });
    for (let i = 0; i < 25; i++) update(run, stageInput, FIXED_DT, null);
    // The staged fight must show the intended numbers: bites taken while the
    // scene settles are staging noise, not the game.
    run.chain = 6; run.chainTimer = 999;
    run.tome.integrity = 82; run.score = 1240;
  } else if (kind === 'boss') {
    startChapter(run, 7);
    applyUpgrade(run, 'damage'); applyUpgrade(run, 'damage');
    applyUpgrade(run, 'spread'); applyUpgrade(run, 'spread');
    applyUpgrade(run, 'firerate'); applyUpgrade(run, 'trap'); applyUpgrade(run, 'shelf');
    run.score = 2480; run.chain = 5; run.chainTimer = 999;
    run.tome.integrity = 64;
    run.player.x = 640; run.player.y = 540;
    // The boss enters mid-field for the shot (it spawns off-screen by design),
    // far enough from the Tome that it cannot bite it before the shot.
    if (run.boss) { run.boss.x = 640; run.boss.y = 150; run.boss.hp = 720; }
    const spots = [[400, 280], [880, 260], [500, 440], [860, 480], [700, 560], [320, 480], [960, 480], [600, 480]];
    const kinds = ['mite', 'worm', 'page', 'mite', 'worm', 'blot', 'page', 'eraser'];
    spots.forEach((s, i) => spawnEnemy(run, kinds[i], s[0], s[1]));
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i - 2.5) * 0.2;
      // Staged bolt: a long life so it is still flying when the shot is taken.
      run.bullets.push({ x: 640 + Math.cos(a) * (30 + i * 14), y: 540 + Math.sin(a) * (30 + i * 14), vx: Math.cos(a) * 640, vy: Math.sin(a) * 640, damage: 18, life: 4 });
    }
    run.traps.push({ x: 480, y: 420, radius: 46, life: 25, tickCd: 0 });
    for (let i = 0; i < 25; i++) update(run, stageInput, FIXED_DT, null);
    // The staged fight must show the intended numbers: bites taken while the
    // scene settles are staging noise, not the game.
    run.chain = 5; run.chainTimer = 999;
    run.tome.integrity = 64; run.score = 2480;
  }
}

// --- main loop: fixed-step simulation, render every frame ---
let last = performance.now();
let acc = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  acc += dt;
  let steps = 0;
  while (acc >= FIXED_DT && steps < 5) {
    acc -= FIXED_DT;
    steps++;
    if (run.phase === 'playing') {
      if (autoplay) aimBot();
      update(run, autoplay ? bot : input, FIXED_DT, sfx);
      if (run.phase === 'upgrade' && autoplay) chooseUpgrade(run, 0, sfx);
    } else {
      run.time += FIXED_DT;
      if (run.banner) { run.banner.t += FIXED_DT; if (run.banner.t > run.banner.dur) run.banner = null; }
    }
  }
  if (steps === 5) acc = 0;
  // Keep the best score across sessions (local only, never a network load).
  if ((run.phase === 'won' || run.phase === 'lost') && run.winStats && run.winStats.score > best) {
    best = run.winStats.score;
    try { window.localStorage.setItem('inkbound-best', String(best)); } catch (e) { /* storage off */ }
  }
  sfx.update(dt);
  render(ctx, run, input, best);
  handleKeys();
  requestAnimationFrame(frame);
}

function handleKeys() {
  // Edge-triggered keys, consumed once per frame.
  if (input.wasPressed('m')) {
    sfx.ensure();
    run.muted = sfx.toggleMute();
  }
  if (input.wasPressed('p') || input.wasPressed('escape')) {
    if (run.phase === 'playing') run.phase = 'paused';
    else if (run.phase === 'paused') run.phase = 'playing';
  }
  if (input.wasPressed('r')) {
    if (run.phase === 'won' || run.phase === 'lost' || run.phase === 'paused') {
      sfx.ensure();
      startRun(run);
    }
  }
  if (input.wasPressed('enter')) {
    if (run.phase === 'title') { sfx.ensure(); startRun(run); }
    else if (run.phase === 'won' || run.phase === 'lost') { sfx.ensure(); startRun(run); }
  }
  if (run.phase === 'upgrade') {
    if (input.wasPressed('1')) chooseUpgrade(run, 0, sfx);
    else if (input.wasPressed('2')) chooseUpgrade(run, 1, sfx);
    else if (input.wasPressed('3')) chooseUpgrade(run, 2, sfx);
  }
  if (input.consumeClick()) {
    sfx.ensure();
    if (run.phase === 'title') startRun(run);
    else if (run.phase === 'won' || run.phase === 'lost') startRun(run);
    else if (run.phase === 'upgrade') {
      // Click a card: cards are laid out by render.js — recompute the same geometry.
      const cards = run.upgradeOffer;
      const cw = 300, ch = 210, gap = 30;
      const x0 = 640 - (cards.length * cw + (cards.length - 1) * gap) / 2;
      cards.forEach((id, i) => {
        const x = x0 + i * (cw + gap);
        if (input.mouseX >= x && input.mouseX <= x + cw && input.mouseY >= 200 && input.mouseY <= 200 + ch) {
          chooseUpgrade(run, i, sfx);
        }
      });
    }
  }
  input.consumePressed();
}

// --- debug handle for live verification (auto-play, upgrade tests, staging) ---
window.__inkbound = {
  run,
  version: 'inkbound-1.0.0',
  errors: [],
  state() {
    const counts = {};
    for (const e of run.enemies) counts[e.type] = (counts[e.type] || 0) + 1;
    return {
      phase: run.phase, chapter: run.chapter, score: run.score, chain: run.chain,
      kills: run.kills, time: Math.round(run.time * 10) / 10,
      tome: Math.round(run.tome.integrity), tomeMax: run.tome.max,
      playerHp: Math.round(run.player.hp), ink: Math.round(run.player.ink),
      stats: { ...run.stats }, upgrades: { ...run.upgradesOwned },
      enemies: counts, enemyTotal: run.enemies.length,
      queued: run.spawnQueue.length, bossHp: run.boss ? Math.round(run.boss.hp) : null,
      shots: run.shotsFired, hits: run.hitsLanded,
      offer: run.upgradeOffer.slice(), loseReason: run.loseReason,
    };
  },
  autoplay(on) { autoplay = !!on; return autoplay; },
  step(n) { for (let i = 0; i < n; i++) { if (autoplay) aimBot(); update(run, autoplay ? bot : input, FIXED_DT, null); } return this.state(); },
  start() { startRun(run); return this.state(); },
  giveUpgrade(id) { const ok = applyUpgrade(run, id); return { ok, stats: { ...run.stats }, upgrades: { ...run.upgradesOwned } }; },
  spawn(type, x, y) { return spawnEnemy(run, type, x, y); },
  choose(i) { return chooseUpgrade(run, i, sfx); },
  setPhase(p) { run.phase = p; return run.phase; },
};
window.addEventListener('error', (e) => { window.__inkbound.errors.push(String(e.message)); });
window.addEventListener('unhandledrejection', (e) => { window.__inkbound.errors.push('rejection: ' + String(e.reason)); });

if (shotKind) stageShot(shotKind);
requestAnimationFrame(frame);
