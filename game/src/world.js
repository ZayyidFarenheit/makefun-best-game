// INKBOUND — the simulation. One job: fixed-step game logic (movement, combat,
// spawning, chapters, upgrades, win/lose). Rendering and input live elsewhere.

import { CHAPTERS, CHAPTER_WAVES, ENEMIES, PLAYER_BASE, TOME_BASE, UPGRADES, CHAIN_WINDOW, CHAPTER_BREAK_HEAL, TOME_X, TOME_Y, TOME_R, VIEW_W, VIEW_H } from './config.js';
import { makeRng } from './random.js';

export function createRun(seed) {
  const run = {
    seed: seed || 1,
    rng: makeRng(seed || 1),
    phase: 'title', // title | playing | upgrade | paused | won | lost
    time: 0,
    chapter: 0,
    chapterTime: 0,
    spawnQueue: [],
    chapterTotal: 0,
    score: 0,
    chain: 0,
    chainTimer: 0,
    kills: 0,
    shotsFired: 0,
    hitsLanded: 0,
    tome: { integrity: TOME_BASE.integrity, max: TOME_BASE.max },
    player: null,
    stats: null,
    upgradesOwned: {},
    upgradeOffer: [],
    enemies: [],
    bullets: [],
    particles: [],
    floaters: [],
    pickups: [],
    traps: [],
    shelves: [],
    boss: null,
    trapTimer: 6,
    shake: 0,
    banner: null,
    loseReason: '',
    winStats: null,
    muted: false,
  };
  resetRunState(run);
  return run;
}

// Reset every run-scoped value. Called on a fresh start AND on restart, so no
// stale flag, timer or frozen state survives into a new run (lesson 4.1.4).
export function resetRunState(run) {
  run.time = 0;
  run.chapter = 0;
  run.chapterTime = 0;
  run.spawnQueue = [];
  run.chapterTotal = 0;
  run.score = 0;
  run.chain = 0;
  run.chainTimer = 0;
  run.kills = 0;
  run.shotsFired = 0;
  run.hitsLanded = 0;
  run.tome.integrity = TOME_BASE.integrity;
  run.tome.max = TOME_BASE.max;
  run.player = {
    x: TOME_X, y: TOME_Y + 130, hp: PLAYER_BASE.hp, maxHp: PLAYER_BASE.maxHp,
    ink: PLAYER_BASE.maxInk, angle: -Math.PI / 2,
    fireCd: 0, dashCd: 0, dashTime: 0, dashX: 0, dashY: 0,
    hurtTimer: 0, regenDelay: 0, speed: PLAYER_BASE.speed,
  };
  run.stats = {
    damageMul: 1, fireRateMul: 1, projectiles: 1, traps: 0, shelves: 0,
    maxInk: PLAYER_BASE.maxInk, inkRegen: PLAYER_BASE.inkRegen, dashCooldownMul: 1,
  };
  run.upgradesOwned = {};
  run.upgradeOffer = [];
  run.enemies = [];
  run.bullets = [];
  run.particles = [];
  run.floaters = [];
  run.pickups = [];
  run.traps = [];
  run.shelves = [];
  run.boss = null;
  run.trapTimer = 6;
  run.shake = 0;
  run.banner = null;
  run.loseReason = '';
  run.winStats = null;
}

export function setBanner(run, text, sub, dur) {
  run.banner = { text, sub: sub || '', t: 0, dur: dur || 2.4 };
}

export function startRun(run) {
  resetRunState(run);
  run.phase = 'playing';
  startChapter(run, 1);
}

export function buildSpawnQueue(run, chapter) {
  const queue = [];
  const groups = CHAPTER_WAVES[chapter] || [];
  groups.forEach(([type, count, gap], gi) => {
    for (let k = 0; k < count; k++) queue.push({ type, at: k * gap + gi * 0.5 });
  });
  queue.sort((a, b) => a.at - b.at);
  return queue;
}

export function startChapter(run, n) {
  run.chapter = n;
  run.chapterTime = 0;
  run.spawnQueue = buildSpawnQueue(run, n);
  run.chapterTotal = run.spawnQueue.length;
  run.enemies = [];
  run.bullets = [];
  run.traps = [];
  if (n === CHAPTERS) {
    spawnBoss(run);
    setBanner(run, 'CHAPTER 7 — THE UNWRITTEN', 'The final chapter. Slay the blot that eats words.', 3.2);
  } else {
    setBanner(run, 'CHAPTER ' + n + ' OF ' + CHAPTERS, chapterSubtitle(n), 2.4);
  }
}

function chapterSubtitle(n) {
  return [
    '', 'The blot creeps in from the margins.',
    'Pages tear loose and drift toward the Tome.',
    'Something hunts the Warden now.',
    'The ink spills. It splits. It keeps coming.',
    'The shelves groan. Hold the line.',
    'One chapter left. Then the Unwritten wakes.',
  ][n] || '';
}

function edgeSpawn(run) {
  const side = run.rng.int(0, 3);
  if (side === 0) return { x: run.rng.range(-30, VIEW_W + 30), y: -30 };
  if (side === 1) return { x: run.rng.range(-30, VIEW_W + 30), y: VIEW_H + 30 };
  if (side === 2) return { x: -30, y: run.rng.range(-30, VIEW_H + 30) };
  return { x: VIEW_W + 30, y: run.rng.range(-30, VIEW_H + 30) };
}

export function spawnEnemy(run, type, x, y) {
  const def = ENEMIES[type];
  const p = (x === undefined) ? edgeSpawn(run) : { x, y };
  const e = {
    type, name: def.name, x: p.x, y: p.y,
    hp: def.hp, maxHp: def.hp, speed: def.speed * run.rng.range(0.92, 1.08),
    radius: def.radius, dmg: def.dmg, score: def.score,
    behavior: def.behavior, color: def.color, desc: def.desc,
    attackCd: 0, flash: 0, wobble: run.rng.range(0, Math.PI * 2),
    telegraph: 0, telegraphAngle: 0, chargeTime: 0, chargeX: 0, chargeY: 0,
    spawnMiteCd: 10, chargeCd: 7, hitCd: 0,
  };
  run.enemies.push(e);
  if (type === 'boss') run.boss = e;
  return e;
}

function spawnBoss(run) {
  spawnEnemy(run, 'boss', TOME_X, -70);
}

export function applyUpgrade(run, id) {
  const def = UPGRADES[id];
  if (!def) return false;
  const level = (run.upgradesOwned[id] || 0) + 1;
  if (level > def.maxLevel) return false;
  def.apply(run.stats, run);
  run.upgradesOwned[id] = level;
  // Shelves are physical: each level adds one bookshelf on the ring.
  if (id === 'shelf') {
    const angle = (Object.keys(run.upgradesOwned).length * 2.399) + run.shelves.length * 1.1;
    run.shelves.push({ angle, dist: 122, hp: 60, maxHp: 60, radius: 20 });
  }
  return true;
}

export function rollUpgradeOffer(run) {
  const pool = Object.keys(UPGRADES).filter((id) => (run.upgradesOwned[id] || 0) < UPGRADES[id].maxLevel);
  const offer = [];
  while (offer.length < 3 && pool.length > 0) {
    const i = Math.floor(run.rng.next() * pool.length);
    offer.push(pool.splice(i, 1)[0]);
  }
  return offer;
}

function addFloater(run, x, y, text, color) {
  run.floaters.push({ x, y, text, color: color || '#ffffff', life: 0.9, max: 0.9 });
}

function burst(run, x, y, color, n, speed) {
  for (let i = 0; i < n; i++) {
    const a = run.rng.angle();
    const s = run.rng.range(speed * 0.3, speed);
    run.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: run.rng.range(0.3, 0.7), max: 0.7, color, size: run.rng.range(2, 5) });
  }
}

function damageEnemy(run, e, dmg, sfx) {
  e.hp -= dmg;
  e.flash = 0.09;
  run.hitsLanded++;
  addFloater(run, e.x, e.y - e.radius - 6, String(Math.round(dmg)), '#ffd166');
  if (e.hp <= 0) killEnemy(run, e, sfx);
}

function killEnemy(run, e, sfx) {
  e.dead = true;
  run.kills++;
  // The chain caps at 50: beyond that the bonus would dwarf the kill itself
  // and the HUD would read like a broken counter.
  run.chain = Math.min(50, run.chain + 1);
  run.chainTimer = CHAIN_WINDOW;
  const gained = e.score + run.chain * 2;
  run.score += gained;
  addFloater(run, e.x, e.y - e.radius - 18, '+' + gained, '#8ecae6');
  burst(run, e.x, e.y, e.color, e.type === 'boss' ? 40 : 12, 160);
  if (sfx) sfx.enemyDie();
  if (e.type === 'spill') {
    for (let i = 0; i < 2; i++) spawnEnemy(run, 'blot', e.x + (i === 0 ? -18 : 18), e.y + (i === 0 ? 10 : -10));
  }
  if (e.type === 'boss') {
    run.bossDefeated = true;
    run.boss = null;
    run.shake = 14;
    setBanner(run, 'THE UNWRITTEN IS UNDONE', 'Every word returns to the page.', 2.6);
  }
  if (run.rng.next() < 0.22 && e.type !== 'boss') {
    run.pickups.push({ x: e.x, y: e.y, value: 12, life: 12 });
  }
}

function loseRun(run, reason, sfx) {
  if (run.phase !== 'playing') return;
  run.loseReason = reason;
  run.winStats = { score: run.score, kills: run.kills, chapter: run.chapter, time: run.time };
  run.phase = 'lost';
  if (sfx) sfx.lose();
}

function winRun(run, sfx) {
  run.winStats = { score: run.score, kills: run.kills, chapter: run.chapter, time: run.time };
  run.phase = 'won';
  if (sfx) sfx.win();
}

function chapterCleared(run, sfx) {
  if (run.chapter >= CHAPTERS) { winRun(run, sfx); return; }
  run.tome.integrity = Math.min(run.tome.max, run.tome.integrity + CHAPTER_BREAK_HEAL);
  run.upgradeOffer = rollUpgradeOffer(run);
  run.phase = 'upgrade';
  if (sfx) sfx.chapter();
}

export function chooseUpgrade(run, index, sfx) {
  const id = run.upgradeOffer[index];
  if (!id || run.phase !== 'upgrade') return false;
  if (!applyUpgrade(run, id)) return false;
  if (sfx) sfx.upgrade();
  setBanner(run, UPGRADES[id].name + ' — Lv ' + run.upgradesOwned[id], UPGRADES[id].desc, 1.8);
  startChapter(run, run.chapter + 1);
  run.phase = 'playing';
  return true;
}

// One fixed step of the playing simulation. input: {moveVector(), down(k),
// mouseX, mouseY, mouseDown}. sfx may be null in headless tests.
export function update(run, input, dt, sfx) {
  if (run.phase !== 'playing') return;
  run.time += dt;
  run.chapterTime += dt;
  if (run.banner) { run.banner.t += dt; if (run.banner.t > run.banner.dur) run.banner = null; }
  if (run.shake > 0) run.shake = Math.max(0, run.shake - dt * 22);
  if (run.chainTimer > 0) { run.chainTimer -= dt; if (run.chainTimer <= 0) run.chain = 0; }

  const p = run.player;
  const st = run.stats;

  // --- spawning ---
  while (run.spawnQueue.length > 0 && run.spawnQueue[0].at <= run.chapterTime) {
    const s = run.spawnQueue.shift();
    spawnEnemy(run, s.type);
  }

  // --- player movement + dash ---
  const mv = input.moveVector();
  p.angle = Math.atan2(input.mouseY - p.y, input.mouseX - p.x);
  if ((input.down(' ') || input.down('shift')) && p.dashCd <= 0 && (mv.x !== 0 || mv.y !== 0)) {
    p.dashTime = PLAYER_BASE.dashTime;
    p.dashCd = PLAYER_BASE.dashCooldown * st.dashCooldownMul;
    p.dashX = mv.x; p.dashY = mv.y;
    if (sfx) sfx.dash();
  }
  if (p.dashCd > 0) p.dashCd -= dt;
  if (p.hurtTimer > 0) p.hurtTimer -= dt;
  if (p.regenDelay > 0) p.regenDelay -= dt;
  else if (p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + 2 * dt);
  let speed = p.speed;
  if (p.dashTime > 0) {
    p.dashTime -= dt;
    speed = PLAYER_BASE.dashSpeed;
    run.particles.push({ x: p.x, y: p.y, vx: 0, vy: 0, life: 0.35, max: 0.35, color: '#06d6a0', size: 7 });
  }
  p.x += mv.x * speed * dt;
  p.y += mv.y * speed * dt;
  p.x = Math.max(20, Math.min(VIEW_W - 20, p.x));
  p.y = Math.max(20, Math.min(VIEW_H - 20, p.y));

  // --- ink regen ---
  p.ink = Math.min(st.maxInk, p.ink + st.inkRegen * dt);

  // --- shooting ---
  if (p.fireCd > 0) p.fireCd -= dt;
  if (input.mouseDown && p.fireCd <= 0) {
    if (p.ink >= PLAYER_BASE.shotCost) {
      p.ink -= PLAYER_BASE.shotCost;
      p.fireCd = PLAYER_BASE.fireInterval / st.fireRateMul;
      run.shotsFired++;
      const n = st.projectiles;
      for (let i = 0; i < n; i++) {
        const off = (i - (n - 1) / 2) * 0.14;
        const a = p.angle + off;
        run.bullets.push({
          x: p.x + Math.cos(a) * 22, y: p.y + Math.sin(a) * 22,
          vx: Math.cos(a) * 640, vy: Math.sin(a) * 640,
          damage: PLAYER_BASE.damage * st.damageMul, life: 1.1,
        });
      }
      if (sfx) sfx.shoot();
    } else {
      p.fireCd = 0.2;
      if (sfx) sfx.dryClick();
    }
  }

  // --- ink traps bloom near the Tome ---
  if (st.traps > 0) {
    run.trapTimer -= dt;
    if (run.trapTimer <= 0) {
      run.trapTimer = 10;
      const active = run.traps.filter((t) => t.life > 0).length;
      if (active < st.traps) {
        const a = run.rng.angle();
        const d = run.rng.range(130, 210);
        run.traps.push({ x: TOME_X + Math.cos(a) * d, y: TOME_Y + Math.sin(a) * d, radius: 46, life: 25, tickCd: 0 });
        if (sfx) sfx.trapPop();
      }
    }
  }

  // --- bullets ---
  for (const b of run.bullets) {
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    if (b.life <= 0 || b.x < -20 || b.x > VIEW_W + 20 || b.y < -20 || b.y > VIEW_H + 20) { b.dead = true; continue; }
    for (const e of run.enemies) {
      if (e.dead) continue;
      const dx = e.x - b.x, dy = e.y - b.y;
      if (dx * dx + dy * dy < (e.radius + 5) * (e.radius + 5)) {
        damageEnemy(run, e, b.damage, sfx);
        burst(run, b.x, b.y, '#7b2ff7', 4, 90);
        if (sfx) sfx.hit();
        b.dead = true;
        break;
      }
    }
  }
  run.bullets = run.bullets.filter((b) => !b.dead);

  // --- traps damage enemies standing in them ---
  for (const t of run.traps) {
    t.life -= dt;
    t.tickCd -= dt;
    if (t.tickCd <= 0) {
      t.tickCd = 0.5;
      for (const e of run.enemies) {
        if (e.dead) continue;
        const dx = e.x - t.x, dy = e.y - t.y;
        if (dx * dx + dy * dy < (t.radius + e.radius) * (t.radius + e.radius)) damageEnemy(run, e, 10, sfx);
      }
    }
  }
  run.traps = run.traps.filter((t) => t.life > 0);

  // --- enemies ---
  for (const e of run.enemies) {
    if (e.dead) continue;
    if (e.flash > 0) e.flash -= dt;
    if (e.attackCd > 0) e.attackCd -= dt;
    if (e.hitCd > 0) e.hitCd -= dt;

    // Boss charge: telegraph, then a fast dash at the Warden.
    if (e.type === 'boss') {
      e.spawnMiteCd -= dt;
      if (e.spawnMiteCd <= 0) {
        e.spawnMiteCd = 13;
        for (let i = 0; i < 3; i++) spawnEnemy(run, 'mite', e.x + run.rng.range(-40, 40), e.y + run.rng.range(-40, 40));
        setBanner(run, 'THE UNWRITTEN SPAWNS MITES', '', 1.4);
      }
      const pd = Math.hypot(p.x - e.x, p.y - e.y);
      e.chargeCd -= dt;
      if (e.chargeTime > 0) {
        e.chargeTime -= dt;
        e.x += e.chargeX * 520 * dt;
        e.y += e.chargeY * 520 * dt;
      } else if (e.telegraph > 0) {
        e.telegraph -= dt;
        if (e.telegraph <= 0) {
          e.chargeTime = 0.5;
          const a = Math.atan2(p.y - e.y, p.x - e.x);
          e.chargeX = Math.cos(a); e.chargeY = Math.sin(a);
          if (sfx) sfx.bossRoar();
        }
      } else if (e.chargeCd <= 0 && pd < 460) {
        e.telegraph = 0.9;
        e.telegraphAngle = Math.atan2(p.y - e.y, p.x - e.x);
        e.chargeCd = 9;
      }
    }

    // Choose target: boss and erasers hunt the Warden; the rest hunt the Tome.
    const tx = (e.behavior === 'warden' || e.type === 'boss') ? p.x : TOME_X;
    const ty = (e.behavior === 'warden' || e.type === 'boss') ? p.y : TOME_Y;
    let dx = tx - e.x, dy = ty - e.y;
    const dist = Math.hypot(dx, dy) || 1;
    dx /= dist; dy /= dist;

    // Zigzag drift for torn pages.
    if (e.behavior === 'zigzag') {
      e.wobble += dt * 3;
      const perp = Math.sin(e.wobble) * 0.7;
      const px = -dy * perp, py = dx * perp;
      dx += px; dy += py;
      const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    }

    // Bookshelf barricades block Tome-bound enemies: they stop and chew the shelf.
    let blocked = null;
    if (e.behavior !== 'warden') {
      for (const s of run.shelves) {
        const sx = TOME_X + Math.cos(s.angle) * s.dist;
        const sy = TOME_Y + Math.sin(s.angle) * s.dist;
        if (Math.hypot(e.x - sx, e.y - sy) < s.radius + e.radius + 4) { blocked = s; break; }
      }
    }
    if (blocked) {
      if (e.attackCd <= 0) {
        e.attackCd = 0.8;
        blocked.hp -= e.dmg;
        addFloater(run, TOME_X + Math.cos(blocked.angle) * blocked.dist, TOME_Y + Math.sin(blocked.angle) * blocked.dist - 24, '-' + e.dmg, '#e07a5f');
        if (blocked.hp <= 0) {
          run.shelves = run.shelves.filter((s) => s !== blocked);
          burst(run, TOME_X + Math.cos(blocked.angle) * blocked.dist, TOME_Y + Math.sin(blocked.angle) * blocked.dist, '#e07a5f', 14, 140);
        }
      }
      continue;
    }

    // Move (not while telegraphing).
    if (!(e.type === 'boss' && e.telegraph > 0)) {
      e.x += dx * e.speed * dt;
      e.y += dy * e.speed * dt;
    }

    // Attack the Tome on contact.
    const tomeDist = Math.hypot(e.x - TOME_X, e.y - TOME_Y);
    if (tomeDist < TOME_R + e.radius + 2 && e.attackCd <= 0) {
      e.attackCd = 1.0;
      run.tome.integrity -= e.dmg;
      run.shake = Math.max(run.shake, 5);
      addFloater(run, TOME_X, TOME_Y - TOME_R - 10, '-' + e.dmg, '#ff5d73');
      burst(run, e.x, e.y, '#ff5d73', 6, 100);
      if (sfx) sfx.tomeHit();
      if (run.tome.integrity <= 0) { run.tome.integrity = 0; loseRun(run, 'tome', sfx); return; }
    }

    // Touch the Warden: erasers and the boss hurt; a dashing Warden hurts them.
    const pd = Math.hypot(p.x - e.x, p.y - e.y);
    if (pd < e.radius + PLAYER_BASE.radius) {
      if (p.dashTime > 0) {
        if (e.hitCd <= 0) { e.hitCd = 0.3; damageEnemy(run, e, 20, sfx); e.x += dx * 30; e.y += dy * 30; }
      } else if ((e.behavior === 'warden' || e.type === 'boss') && e.attackCd <= 0) {
        e.attackCd = 0.8;
        p.hp -= e.dmg;
        p.hurtTimer = 0.25;
        p.regenDelay = 5;
        run.shake = Math.max(run.shake, 6);
        addFloater(run, p.x, p.y - 24, '-' + e.dmg, '#ff5d73');
        if (sfx) sfx.playerHurt();
        if (p.hp <= 0) { p.hp = 0; loseRun(run, 'warden', sfx); return; }
      }
    }
  }

  // Light separation so enemies do not stack into one blob.
  const list = run.enemies;
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      if (a.dead || b.dead) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      const min = a.radius + b.radius;
      if (d > 0 && d < min) {
        const push = (min - d) / 2;
        const nx = dx / d, ny = dy / d;
        a.x -= nx * push; a.y -= ny * push;
        b.x += nx * push; b.y += ny * push;
      }
    }
  }
  run.enemies = run.enemies.filter((e) => !e.dead);

  // --- pickups drift to the Warden and refill ink ---
  for (const pk of run.pickups) {
    pk.life -= dt;
    const d = Math.hypot(p.x - pk.x, p.y - pk.y);
    if (d < 110) { pk.x += (p.x - pk.x) / d * 160 * dt; pk.y += (p.y - pk.y) / d * 160 * dt; }
    if (d < 24) {
      pk.dead = true;
      p.ink = Math.min(st.maxInk, p.ink + pk.value);
      addFloater(run, p.x, p.y - 24, '+' + pk.value + ' INK', '#06d6a0');
      if (sfx) sfx.pickup();
    }
  }
  run.pickups = run.pickups.filter((pk) => !pk.dead && pk.life > 0);

  // --- particles and floaters ---
  for (const pt of run.particles) { pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.vx *= 0.94; pt.vy *= 0.94; pt.life -= dt; }
  run.particles = run.particles.filter((pt) => pt.life > 0);
  for (const f of run.floaters) { f.y -= 34 * dt; f.life -= dt; }
  run.floaters = run.floaters.filter((f) => f.life > 0);

  // --- chapter cleared? ---
  if (run.spawnQueue.length === 0 && run.enemies.length === 0 && run.phase === 'playing') {
    chapterCleared(run, sfx);
  }
}
