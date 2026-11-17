// INKBOUND — defend the Great Library. Game tuning and content tables.
// One job: every number and name the simulation and renderer share.

export const VIEW_W = 1280;
export const VIEW_H = 720;
export const TOME_X = 640;
export const TOME_Y = 360;
export const TOME_R = 46;
export const FIXED_DT = 1 / 60;
export const CHAPTERS = 7;

// Enemy kinds. behavior: 'tome' walks at the Great Tome, 'warden' hunts the player,
// 'zigzag' drifts toward the Tome on a sine path, 'split' bursts into blots on death.
export const ENEMIES = {
  blot:   { name: 'Ink Blot',    hp: 26, speed: 55,  radius: 14, dmg: 6,  score: 10, color: '#7b2ff7', behavior: 'tome',    desc: 'shambles at the Tome' },
  worm:   { name: 'Bookworm',    hp: 14, speed: 98,  radius: 10, dmg: 4,  score: 15, color: '#e8a33d', behavior: 'tome',    desc: 'fast, wiggles' },
  page:   { name: 'Torn Page',   hp: 20, speed: 72,  radius: 12, dmg: 5,  score: 15, color: '#f2ead8', behavior: 'zigzag',  desc: 'drifts, veers' },
  spill:  { name: 'Spilled Ink', hp: 70, speed: 32,  radius: 24, dmg: 12, score: 30, color: '#3d1a78', behavior: 'split',   desc: 'slow, splits in two' },
  eraser: { name: 'Eraser',      hp: 36, speed: 82,  radius: 13, dmg: 8,  score: 20, color: '#ff5d73', behavior: 'warden',  desc: 'hunts the Warden' },
  mite:   { name: 'Dust Mite',   hp: 7,  speed: 122, radius: 7,  dmg: 2,  score: 5,  color: '#9fb3c8', behavior: 'tome',    desc: 'swarms in packs' },
  boss:   { name: 'The Unwritten', hp: 950, speed: 27, radius: 58, dmg: 20, score: 500, color: '#12041f', behavior: 'boss', desc: 'eats words, spawns mites' },
};

// What each chapter throws at the Tome: [kind, count, gapSeconds].
// Chapter 7 is the boss plus a trickle; the boss itself spawns separately.
export const CHAPTER_WAVES = {
  1: [['blot', 8, 1.6], ['worm', 4, 1.2], ['mite', 6, 0.7]],
  2: [['blot', 10, 1.3], ['worm', 8, 1.0], ['page', 5, 1.4], ['mite', 8, 0.6]],
  3: [['blot', 12, 1.1], ['worm', 10, 0.9], ['page', 8, 1.1], ['eraser', 4, 1.8], ['mite', 10, 0.5]],
  4: [['blot', 12, 1.0], ['worm', 10, 0.8], ['page', 8, 1.0], ['spill', 3, 2.5], ['eraser', 5, 1.5], ['mite', 10, 0.5]],
  5: [['blot', 13, 0.9], ['worm', 11, 0.7], ['page', 10, 0.9], ['spill', 4, 2.2], ['eraser', 6, 1.3], ['mite', 12, 0.4]],
  6: [['blot', 14, 0.8], ['worm', 13, 0.6], ['page', 11, 0.8], ['spill', 5, 2.0], ['eraser', 8, 1.2], ['mite', 15, 0.4]],
  7: [['worm', 8, 1.5], ['mite', 16, 0.6], ['page', 6, 1.8], ['blot', 8, 1.4]],
};

// Upgrades offered between chapters. Each stacks to maxLevel. effect is applied
// to the run's stats object by world.applyUpgrade; every effect is a plain number
// on the stats so the upgrade test can re-read it after 60+ sim steps.
export const UPGRADES = {
  damage:   { name: 'Sharper Quill',  maxLevel: 3, icon: '✒', color: '#ffd166', desc: '+30% ink damage',        apply: (s) => { s.damageMul *= 1.3; } },
  firerate: { name: 'Swift Script',   maxLevel: 3, icon: '≫', color: '#8ecae6', desc: '+25% fire rate',         apply: (s) => { s.fireRateMul *= 1.25; } },
  spread:   { name: 'Split Ink',      maxLevel: 3, icon: '✦', color: '#c77dff', desc: '+1 ink bolt per shot',   apply: (s) => { s.projectiles += 1; } },
  trap:     { name: 'Ink Trap',       maxLevel: 3, icon: '◎', color: '#06d6a0', desc: '+1 trap blooms near Tome', apply: (s) => { s.traps += 1; } },
  shelf:    { name: 'Oak Shelf',      maxLevel: 3, icon: '▦', color: '#e07a5f', desc: '+1 barricade guards Tome', apply: (s) => { s.shelves += 1; } },
  inkwell:  { name: 'Deep Inkwell',   maxLevel: 3, icon: '◉', color: '#118ab2', desc: '+40 ink, faster refill',  apply: (s) => { s.maxInk += 40; s.inkRegen += 6; } },
  dash:     { name: 'Marginalia Dash', maxLevel: 3, icon: '➤', color: '#f4a261', desc: 'dash recharges 30% faster', apply: (s) => { s.dashCooldownMul *= 0.7; } },
  rebind:   { name: 'Rebind the Tome', maxLevel: 3, icon: '✚', color: '#90be6d', desc: 'restore 30 Tome integrity', apply: (s, run) => { run.tome.integrity = Math.min(run.tome.max, run.tome.integrity + 30); } },
};

export const PLAYER_BASE = {
  hp: 100, maxHp: 100, speed: 285, radius: 16,
  maxInk: 100, inkRegen: 14, shotCost: 3,
  damage: 18, fireInterval: 0.22, projectiles: 1,
  dashSpeed: 720, dashTime: 0.16, dashCooldown: 2.2,
};

export const TOME_BASE = { integrity: 100, max: 100 };
export const CHAIN_WINDOW = 2.5; // seconds between kills to keep the chain alive
export const CHAPTER_BREAK_HEAL = 8; // Tome integrity rebound between chapters
