'use strict';
/* 枝江泡泡堂 —— A-SOUL 同人单机版（玩法致敬经典泡泡堂/Bomberman） */

const ASSET = '../../asoulResources/asoul-materials/assets/stickers/';
const COLS = 15, ROWS = 13, TILE = 48;
const W = COLS * TILE, H = ROWS * TILE;
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');

const CHARS = [
  { id: 'bella',  name: '贝拉', img: 'bella/bella_asoul.png',  color: '#DB7D74', slogan: '努力闪耀，让月光为我加冕' },
  { id: 'diana',  name: '嘉然', img: 'diana/diana_bixin.png',  color: '#E799B0', slogan: '关注嘉然，顿顿解馋！' },
  { id: 'eileen', name: '乃琳', img: 'eileen/eileen_wink.png', color: '#576690', slogan: '荷尔蒙甜蜜陷阱，等你来临' },
];
const ACAO = ['acao_guile', 'acao_jingxia', 'acao_kunrao', 'acao_yiwen', 'acao_liuhan', 'acao_jiaban'];
const LEVELS = [
  { enemies: 3, boxP: 0.55, enemySpeed: 62, chase: 0, farm: 0.5, attack: 0 },
  { enemies: 4, boxP: 0.60, enemySpeed: 74, chase: 0.45, farm: 0.4, attack: 0.5 },
  { enemies: 5, boxP: 0.62, enemySpeed: 86, chase: 0.65, farm: 0.35, attack: 0.75 },
];
// 难度在关卡基础值上增减：speed 倍率，chase/farm/attack 加减，range/bombs 初始加成，cd 放泡冷却倍率
const DIFFS = {
  easy:   { name: '简单', speed: 0.72, chase: -0.25, farm: -0.2, attack: -0.3, range: 0, bombs: 0, cd: 1.7 },
  medium: { name: '中等', speed: 1, chase: 0, farm: 0, attack: 0, range: 0, bombs: 0, cd: 1 },
  hard:   { name: '困难', speed: 1.25, chase: 0.25, farm: 0.2, attack: 0.3, range: 1, bombs: 1, cd: 0.65 },
};
const FUSE = 2.2, FLAME_T = 0.5;
const SWING_T = 0.3, HAMMER_RANGE = TILE * 1.25, STUN_T = 3;

// ---------- 随机数（可固定种子，便于验证） ----------
let rng = Math.random;
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function setSeed(s) { rng = mulberry32(s); }

// ---------- 图片 ----------
const images = {};
function loadImg(key, src) {
  const im = new Image();
  im.src = ASSET + src;
  images[key] = im;
  return im;
}
CHARS.forEach(c => loadImg(c.id, c.img));
ACAO.forEach(a => loadImg(a, 'acao/' + a + '.png'));

// ---------- 生成美术（草地/树篱/礼物盒/菜单插画） ----------
// 礼物盒绿幕抠像离线烘焙为 box-alpha.png（file:// 下运行时 getImageData 会 tainted canvas）
const ART = 'assets/art/';
const art = { grass: new Image(), hedge: new Image(), box: new Image() };
art.grass.src = ART + 'grass.png';
art.hedge.src = ART + 'hedge.png';
art.box.src = ART + 'box-alpha.png';
const okImg = im => im.complete && im.naturalWidth > 0;

// ---------- 音效（WebAudio 合成，无外部音频） ----------
let audioCtx = null, muted = false;
function beep(freq, dur, type, vol, slide) {
  if (muted) return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, audioCtx.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, audioCtx.currentTime + dur);
    g.gain.setValueAtTime(vol || 0.15, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + dur);
  } catch (e) { /* 音频不可用时静默 */ }
}
const sfx = {
  place: () => beep(520, 0.12, 'sine', 0.18, 320),
  boom: () => { beep(160, 0.35, 'sawtooth', 0.2, 40); beep(90, 0.4, 'square', 0.1, 30); },
  pick: () => { beep(760, 0.09, 'triangle', 0.15); setTimeout(() => beep(1140, 0.12, 'triangle', 0.15), 80); },
  hurt: () => beep(300, 0.35, 'square', 0.15, 80),
  swing: () => beep(240, 0.1, 'square', 0.1, 120),
  stun: () => beep(600, 0.2, 'triangle', 0.14, 180),
  die: () => beep(420, 0.25, 'triangle', 0.15, 120),
  clear: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.18, 'triangle', 0.15), i * 120)),
  over: () => [392, 330, 262, 196].forEach((f, i) => setTimeout(() => beep(f, 0.25, 'square', 0.1), i * 180)),
};

// ---------- 游戏状态 ----------
const G = {
  state: 'menu', // menu | playing | pause | clear | over | win
  level: 0, score: 0, lives: 3,
  aiCount: 3, diff: 'medium',
  best: Number(localStorage.getItem('zjppt_best') || 0),
  char: null,
  grid: [], boxes: [], bombs: [], flames: new Map(), items: [], enemies: [],
  particles: [], floaters: [],
  player: null,
  time: 0, clearTimer: 0, shake: 0,
  stats: { bombs: 1, range: 2, speed: 1 },
};

const key = (x, y) => y * COLS + x;
const inMap = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS;
const cellOf = e => ({ cx: Math.floor(e.x / TILE), cy: Math.floor(e.y / TILE) });

function newPlayer(charId) {
  const c = CHARS.find(c => c.id === charId) || CHARS[0];
  return {
    kind: 'player', char: c, img: images[c.id],
    x: TILE * 1.5, y: TILE * 1.5, r: TILE * 0.34,
    face: 1, moving: false, invuln: 2,
    speed: 140, maxBombs: 1, range: 2, speedLv: 1, bombCd: 0,
    hammer: 0, hamCd: 0, swing: 0, stun: 0,
  };
}

// ---------- 地图 ----------
function buildLevel(n) {
  const cfg = LEVELS[n];
  const d = DIFFS[G.diff] || DIFFS.medium;
  G.grid = []; G.boxes = []; G.bombs = []; G.flames.clear();
  G.items = []; G.enemies = []; G.particles = []; G.floaters = [];
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const border = x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1;
      const pillar = x % 2 === 0 && y % 2 === 0;
      G.grid[key(x, y)] = (border || pillar) ? 1 : 0;
    }
  }
  const spawns = [[1, 1], [COLS - 2, ROWS - 2], [1, ROWS - 2], [COLS - 2, 1], [Math.floor(COLS / 2) | 1, ROWS - 2], [Math.floor(COLS / 2) | 1, 1], [5, 1], [9, 1], [5, ROWS - 2]];
  const count = Math.min(G.aiCount || cfg.enemies, spawns.length - 1);
  const safe = new Set();
  for (const [sx, sy] of spawns.slice(0, 1 + count)) {
    safe.add(key(sx, sy));
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
      if (inMap(sx + dx, sy + dy) && G.grid[key(sx + dx, sy + dy)] === 0) safe.add(key(sx + dx, sy + dy));
    });
  }
  for (let y = 1; y < ROWS - 1; y++) {
    for (let x = 1; x < COLS - 1; x++) {
      const k = key(x, y);
      if (G.grid[k] === 0 && !safe.has(k) && rng() < cfg.boxP) {
        G.grid[k] = 2;
        G.boxes.push({ cx: x, cy: y, hue: rng() < 0.5 ? 0 : 1, drop: null });
      }
    }
  }
  // 保底道具：每关至少 4 个盒子藏道具，避免整关见不到 pickup
  const types = ['bomb', 'range', 'speed', 'hammer'];
  const poolBoxes = G.boxes.slice();
  for (let i = 0; i < types.length && poolBoxes.length; i++) {
    const b = poolBoxes.splice(Math.floor(rng() * poolBoxes.length), 1)[0];
    b.drop = types[i];
  }
  const p = G.player;
  p.x = TILE * 1.5; p.y = TILE * 1.5; p.invuln = 2; p.face = 1;
  for (let i = 0; i < count; i++) {
    const [sx, sy] = spawns[1 + i];
    const tough = n === 2 && i === count - 1;
    G.enemies.push({
      kind: 'enemy', img: images[ACAO[(i + n * 2) % ACAO.length]],
      x: (sx + 0.5) * TILE, y: (sy + 0.5) * TILE, r: TILE * 0.32,
      tx: sx, ty: sy, speed: cfg.enemySpeed * d.speed * (tough ? 1.15 : 1),
      hp: tough ? 2 : 1, big: tough, face: 1,
      chase: Math.max(0, Math.min(0.9, cfg.chase + d.chase)),
      farm: Math.max(0, Math.min(0.95, cfg.farm + d.farm)),
      attack: Math.max(0, Math.min(0.95, cfg.attack + d.attack)),
      maxBombs: (tough ? 2 : 1) + d.bombs, range: (tough ? 3 : 2) + d.range,
      bombCd: (1 + rng() * 2) * d.cd, cdMul: d.cd, path: [],
      hammer: 0, hamCd: 0, swing: 0, stun: 0,
      wob: rng() * 6.28,
    });
  }
}

// ---------- 碰撞 ----------
function solidCell(cx, cy, ent) {
  if (!inMap(cx, cy)) return true;
  const v = G.grid[key(cx, cy)];
  if (v === 1 || v === 2) return true;
  for (const b of G.bombs) {
    if (b.cx === cx && b.cy === cy) {
      if (ent && b.owner === ent && b.ownerPass) continue;
      return true;
    }
  }
  return false;
}
function boxFree(x, y, r, ent) {
  const x0 = Math.floor((x - r) / TILE), x1 = Math.floor((x + r) / TILE);
  const y0 = Math.floor((y - r) / TILE), y1 = Math.floor((y + r) / TILE);
  for (let cy = y0; cy <= y1; cy++)
    for (let cx = x0; cx <= x1; cx++)
      if (solidCell(cx, cy, ent)) return false;
  return true;
}
function moveEntity(e, dx, dy, dt) {
  const dist = e.speed * dt;
  let moved = false;
  if (dx) {
    const nx = e.x + dx * dist;
    if (boxFree(nx, e.y, e.r, e)) { e.x = nx; moved = true; }
    else {
      // 拐角辅助：贴近通道中心时纵向滑入
      const cy = Math.round(e.y / TILE - 0.5);
      const centerY = (cy + 0.5) * TILE;
      const off = e.y - centerY;
      if (Math.abs(off) > 0.5 && Math.abs(off) < TILE * 0.42) {
        const ny = e.y - Math.sign(off) * Math.min(Math.abs(off), dist);
        if (boxFree(e.x, ny, e.r, e)) { e.y = ny; moved = true; }
      }
      if (!moved) e.x = Math.round(e.x); // 防止抖动
    }
    if (dx > 0) e.face = 1; else e.face = -1;
  }
  if (dy) {
    const ny = e.y + dy * dist;
    if (boxFree(e.x, ny, e.r, e)) { e.y = ny; moved = true; }
    else {
      const cx = Math.round(e.x / TILE - 0.5);
      const centerX = (cx + 0.5) * TILE;
      const off = e.x - centerX;
      if (Math.abs(off) > 0.5 && Math.abs(off) < TILE * 0.42) {
        const nx = e.x - Math.sign(off) * Math.min(Math.abs(off), dist);
        if (boxFree(nx, e.y, e.r, e)) { e.x = nx; moved = true; }
      }
    }
  }
  return moved;
}

// ---------- 水泡与爆炸 ----------
function placeBombFor(ent) {
  const { cx, cy } = cellOf(ent);
  if (G.bombs.some(b => b.cx === cx && b.cy === cy)) return false;
  if (G.bombs.filter(b => b.owner === ent).length >= ent.maxBombs) return false;
  // 对方正站在该格时不允许放泡，避免把对手卡死在泡格里
  const others = ent.kind === 'player' ? G.enemies : [G.player];
  if (others.some(o => { const c = cellOf(o); return c.cx === cx && c.cy === cy; })) return false;
  G.bombs.push({ cx, cy, t: FUSE, range: ent.range, owner: ent, ownerPass: true });
  ent.bombCd = ent.kind === 'player' ? 0.25 : 2.5 * (ent.cdMul || 1);
  return true;
}
function placeBomb() {
  const p = G.player;
  if (p.bombCd > 0 || p.stun > 0) return;
  if (placeBombFor(p)) sfx.place();
}
// 锤子：原版效果为近战敲击造成眩晕；消耗次数，双方对称可用
function trySwing(ent) {
  if (ent.hammer <= 0 || ent.hamCd > 0 || ent.stun > 0) return false;
  ent.hammer--;
  ent.swing = SWING_T;
  ent.hamCd = ent.kind === 'player' ? 0.6 : 1.5;
  sfx.swing();
  let hit = false;
  if (ent.kind === 'player') {
    for (const e of G.enemies) {
      if (e.dead || Math.hypot(e.x - ent.x, e.y - ent.y) > HAMMER_RANGE) continue;
      e.stun = STUN_T;
      hit = true;
      addFloater(e.x, e.y - 24, '晕!', '#ffd76e');
    }
  } else {
    const p = G.player;
    if (p.invuln <= 0 && Math.hypot(p.x - ent.x, p.y - ent.y) <= HAMMER_RANGE) {
      p.stun = STUN_T;
      hit = true;
      addFloater(p.x, p.y - 26, '被敲晕了!', '#ff8f6e');
    }
  }
  if (hit) sfx.stun();
  return true;
}
function explode(b) {
  if (b.dead) return;
  b.dead = true;
  sfx.boom();
  G.shake = 0.25;
  const cells = [[b.cx, b.cy]];
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    for (let i = 1; i <= b.range; i++) {
      const x = b.cx + dx * i, y = b.cy + dy * i;
      if (!inMap(x, y) || G.grid[key(x, y)] === 1) break;
      cells.push([x, y]);
      if (G.grid[key(x, y)] === 2) { destroyBox(x, y); break; }
      const other = G.bombs.find(o => !o.dead && o.cx === x && o.cy === y);
      if (other) explode(other);
    }
  }
  for (const [x, y] of cells) {
    G.flames.set(key(x, y), { t: FLAME_T, cx: x, cy: y });
    spawnSplash((x + 0.5) * TILE, (y + 0.5) * TILE);
  }
}
function destroyBox(x, y) {
  const box = G.boxes.find(b => b.cx === x && b.cy === y);
  G.grid[key(x, y)] = 0;
  G.boxes = G.boxes.filter(b => !(b.cx === x && b.cy === y));
  G.score += 10;
  spawnDebris((x + 0.5) * TILE, (y + 0.5) * TILE);
  if (box && box.drop) {
    G.items.push({ cx: x, cy: y, type: box.drop, bob: rng() * 6.28 });
  } else if (rng() < 0.5) {
    const r = rng();
    const type = r < 0.34 ? 'bomb' : r < 0.62 ? 'range' : r < 0.82 ? 'speed' : 'hammer';
    G.items.push({ cx: x, cy: y, type, bob: rng() * 6.28 });
  }
}
function applyItem(it) {
  const p = G.player;
  if (it.type === 'bomb') p.maxBombs = Math.min(6, p.maxBombs + 1);
  if (it.type === 'range') p.range = Math.min(8, p.range + 1);
  if (it.type === 'speed') { p.speedLv = Math.min(5, p.speedLv + 1); p.speed = 140 + (p.speedLv - 1) * 22; }
  if (it.type === 'hammer') p.hammer = Math.min(9, p.hammer + 3);
  G.score += 50;
  addFloater(p.x, p.y - 24, it.type === 'bomb' ? '水泡+1' : it.type === 'range' ? '水花+1' : it.type === 'hammer' ? '锤子+3' : '加速!', '#ffd76e');
  sfx.pick();
}

// ---------- 敌人 AI ----------
function blastCells(cx, cy, range) {
  const set = new Set([key(cx, cy)]);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    for (let i = 1; i <= range; i++) {
      const x = cx + dx * i, y = cy + dy * i;
      if (!inMap(x, y) || G.grid[key(x, y)] === 1) break;
      set.add(key(x, y));
      if (G.grid[key(x, y)] === 2) break;
    }
  }
  return set;
}
function escapePath(e, blast) {
  const sc = cellOf(e);
  const start = key(sc.cx, sc.cy);
  const maxSteps = Math.floor((FUSE - 0.35) * e.speed / TILE);
  const seen = new Set([start]);
  const q = [[start]];
  while (q.length) {
    const path = q.shift();
    const cur = path[path.length - 1];
    if (path.length > 1 && !blast.has(cur)) {
      return path.slice(1).map(k => [k % COLS, Math.floor(k / COLS)]);
    }
    if (path.length - 1 >= maxSteps) continue;
    const cx = cur % COLS, cy = Math.floor(cur / COLS);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (!inMap(nx, ny)) continue;
      const k = key(nx, ny);
      if (seen.has(k) || G.grid[k] !== 0 || G.flames.has(k)) continue;
      if (G.bombs.some(b => !b.dead && b.cx === nx && b.cy === ny)) continue;
      seen.add(k);
      q.push(path.concat(k));
    }
  }
  return null;
}
function playerInLine(e) {
  const ec = cellOf(e), pc = cellOf(G.player);
  if (ec.cx === pc.cx && ec.cy !== pc.cy) {
    const d = Math.abs(pc.cy - ec.cy);
    if (d > e.range) return false;
    const s = Math.sign(pc.cy - ec.cy);
    for (let i = 1; i < d; i++) if (G.grid[key(ec.cx, ec.cy + s * i)] !== 0) return false;
    return true;
  }
  if (ec.cy === pc.cy && ec.cx !== pc.cx) {
    const d = Math.abs(pc.cx - ec.cx);
    if (d > e.range) return false;
    const s = Math.sign(pc.cx - ec.cx);
    for (let i = 1; i < d; i++) if (G.grid[key(ec.cx + s * i, ec.cy)] !== 0) return false;
    return true;
  }
  return false;
}
function tryEnemyBomb(e, force) {
  if (e.bombCd > 0) return false;
  const { cx, cy } = cellOf(e);
  if (G.bombs.some(b => b.cx === cx && b.cy === cy)) return false;
  if (G.bombs.filter(b => b.owner === e).length >= e.maxBombs) return false;
  if (!force) {
    const attack = e.attack > 0 && playerInLine(e) && rng() < e.attack;
    const farm = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => inMap(cx + dx, cy + dy) && G.grid[key(cx + dx, cy + dy)] === 2) && rng() < e.farm;
    if (!attack && !farm) return false;
  }
  const path = escapePath(e, blastCells(cx, cy, e.range));
  if (!path) return false;
  if (!placeBombFor(e)) return false;
  e.path = path;
  sfx.place();
  return true;
}
function enemyPick(e) {
  const cx = Math.round(e.x / TILE - 0.5), cy = Math.round(e.y / TILE - 0.5);
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const open = [], safe = [];
  const dangerBlast = new Set();
  for (const b of G.bombs) if (!b.dead && b.t < 1.1) for (const k of blastCells(b.cx, b.cy, b.range)) dangerBlast.add(k);
  for (const [dx, dy] of dirs) {
    const nx = cx + dx, ny = cy + dy;
    if (solidCell(nx, ny, e)) continue;
    open.push([nx, ny, dx, dy]);
    const k = key(nx, ny);
    const danger = G.flames.has(k) || dangerBlast.has(k) || G.bombs.some(b => !b.dead && b.cx === nx && b.cy === ny);
    if (!danger) safe.push([nx, ny, dx, dy]);
  }
  let pool = safe.length ? safe : open;
  if (!pool.length) { e.tx = cx; e.ty = cy; return; }
  if (!safe.length) {
    // 邻格全危险但当前格安全时原地等待，避免走回爆炸区送死
    const ck = key(cx, cy);
    const curDanger = G.flames.has(ck) || dangerBlast.has(ck) || G.bombs.some(b => !b.dead && b.cx === cx && b.cy === cy);
    if (!curDanger) { e.tx = cx; e.ty = cy; return; }
  }
  let pick;
  const p = G.player;
  const pdist = Math.abs(p.x - e.x) + Math.abs(p.y - e.y);
  const chase = e.hammer > 0 ? Math.max(e.chase, 0.7) : e.chase;
  if (chase > 0 && pdist < TILE * 6 && rng() < chase) {
    pool = pool.slice().sort((a, b) => {
      const da = Math.abs((a[0] + 0.5) * TILE - p.x) + Math.abs((a[1] + 0.5) * TILE - p.y);
      const db = Math.abs((b[0] + 0.5) * TILE - p.x) + Math.abs((b[1] + 0.5) * TILE - p.y);
      return da - db;
    });
    pick = pool[0];
  } else {
    const fwd = pool.filter(d => d[2] === (e.lastDx || 0) && d[3] === (e.lastDy || 0));
    pick = (fwd.length && rng() < 0.6) ? fwd[0] : pool[Math.floor(rng() * pool.length)];
  }
  e.tx = pick[0]; e.ty = pick[1];
  e.lastDx = pick[2]; e.lastDy = pick[3];
  if (pick[2]) e.face = pick[2];
}
function updateEnemy(e, dt) {
  if (e.stun > 0) { e.wob += dt * 8; return; }
  if (e.hammer > 0 && e.hamCd <= 0 && G.player.invuln <= 0 &&
      Math.hypot(G.player.x - e.x, G.player.y - e.y) <= HAMMER_RANGE) trySwing(e);
  const gx = (e.tx + 0.5) * TILE, gy = (e.ty + 0.5) * TILE;
  const dx = gx - e.x, dy = gy - e.y;
  const d = Math.hypot(dx, dy);
  const step = e.speed * dt;
  if (d <= step) {
    e.x = gx; e.y = gy;
    if (e.path && e.path.length) {
      const n = e.path.shift(); e.tx = n[0]; e.ty = n[1];
    } else {
      tryEnemyBomb(e);
      if (e.path && e.path.length) { const n = e.path.shift(); e.tx = n[0]; e.ty = n[1]; }
      else enemyPick(e);
    }
  } else {
    const nx = e.x + dx / d * step, ny = e.y + dy / d * step;
    const cx = Math.floor(nx / TILE), cy = Math.floor(ny / TILE);
    if (solidCell(cx, cy, e) && !(cx === Math.floor(e.x / TILE) && cy === Math.floor(e.y / TILE))) {
      // 去路被新水泡挡住：退回当前格重新选路
      e.path = [];
      const ccx = Math.round(e.x / TILE - 0.5), ccy = Math.round(e.y / TILE - 0.5);
      e.x = (ccx + 0.5) * TILE; e.y = (ccy + 0.5) * TILE;
      enemyPick(e);
    } else { e.x = nx; e.y = ny; }
  }
  e.wob += dt * 8;
}

// ---------- 粒子 / 飘字 ----------
function spawnSplash(x, y) {
  for (let i = 0; i < 6; i++) {
    const a = rng() * 6.28, s = 40 + rng() * 120;
    G.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, t: 0.5, max: 0.5, c: rng() < 0.5 ? '#8fd3ff' : '#ffffff', r: 2 + rng() * 3 });
  }
}
function spawnDebris(x, y) {
  for (let i = 0; i < 8; i++) {
    const a = rng() * 6.28, s = 30 + rng() * 100;
    G.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, t: 0.6, max: 0.6, c: rng() < 0.5 ? '#ffb7ce' : '#ffd76e', r: 2 + rng() * 3 });
  }
}
function addFloater(x, y, txt, c) { G.floaters.push({ x, y, txt, c, t: 1 }); }

// ---------- 受伤 / 流程 ----------
function hurtPlayer() {
  const p = G.player;
  if (p.invuln > 0) return;
  G.lives--;
  sfx.hurt();
  G.shake = 0.4;
  addFloater(p.x, p.y - 26, '-1 ♥', '#ff6b81');
  if (G.lives <= 0) { endGame(false); return; }
  p.x = TILE * 1.5; p.y = TILE * 1.5; p.invuln = 2.5;
}
function killEnemy(e) {
  e.hp--;
  if (e.hp > 0) { addFloater(e.x, e.y - 24, '还有一下!', '#8fd3ff'); return; }
  e.dead = true;
  G.score += e.big ? 300 : 100;
  addFloater(e.x, e.y - 24, '+' + (e.big ? 300 : 100), '#ffd76e');
  spawnSplash(e.x, e.y);
  sfx.die();
}
function startGame(charId) {
  G.char = charId;
  G.aiCount = Number(document.getElementById('sel-ai').value) || 3;
  G.diff = document.getElementById('sel-diff').value || 'medium';
  G.player = newPlayer(charId);
  const c = G.player.char;
  document.getElementById('hud-char').innerHTML = '<img src="' + ASSET + c.img + '" alt=""> ' + c.name;
  G.level = 0; G.score = 0; G.lives = 3;
  G.stats = { bombs: 1, range: 2, speed: 1 };
  buildLevel(0);
  G.state = 'playing';
  hideOverlays();
}
function nextLevel() {
  G.level++;
  if (G.level >= LEVELS.length) { G.level = LEVELS.length - 1; endGame(true); return; }
  const p = G.player;
  buildLevel(G.level);
  p.speed = 140 + (p.speedLv - 1) * 22;
  G.state = 'playing';
  hideOverlays();
}
function endGame(win) {
  G.state = win ? 'win' : 'over';
  if (G.score > G.best) { G.best = G.score; localStorage.setItem('zjppt_best', String(G.best)); }
  win ? sfx.clear() : sfx.over();
  showOverlay(win ? 'win' : 'over');
}
function levelCleared() {
  G.state = 'clear';
  G.clearTimer = 2.2;
  G.score += 200;
  sfx.clear();
  showOverlay('clear');
}
function goHome() {
  if (G.score > G.best) { G.best = G.score; localStorage.setItem('zjppt_best', String(G.best)); }
  for (const k in keys) keys[k] = false;
  G.state = 'menu';
  overlay.classList.add('hidden');
  menu.classList.remove('hidden');
  updateHud();
}

// ---------- 更新 ----------
const keys = {};
function update(dt) {
  if (G.state === 'clear') {
    G.time += dt;
    G.clearTimer -= dt;
    if (G.clearTimer <= 0) nextLevel();
    return;
  }
  if (G.state !== 'playing') return;
  G.time += dt;
  const p = G.player;
  p.invuln = Math.max(0, p.invuln - dt);
  p.bombCd = Math.max(0, p.bombCd - dt);
  p.hamCd = Math.max(0, p.hamCd - dt);
  p.swing = Math.max(0, p.swing - dt);
  p.stun = Math.max(0, p.stun - dt);
  let dx = 0, dy = 0;
  if (keys.ArrowLeft || keys.KeyA) dx -= 1;
  if (keys.ArrowRight || keys.KeyD) dx += 1;
  if (keys.ArrowUp || keys.KeyW) dy -= 1;
  if (keys.ArrowDown || keys.KeyS) dy += 1;
  if (dx && dy) { dx *= 0.7071; dy *= 0.7071; }
  p.moving = !!(dx || dy);
  if (p.moving && p.stun <= 0) moveEntity(p, dx, dy, dt);

  for (const b of G.bombs) {
    if (b.ownerPass && b.owner) {
      const o = b.owner;
      // 包围盒完全离开泡格后才对放置者 solid，否则跨格瞬间会把自己卡死
      if (o.x - o.r >= (b.cx + 1) * TILE || o.x + o.r <= b.cx * TILE ||
          o.y - o.r >= (b.cy + 1) * TILE || o.y + o.r <= b.cy * TILE) b.ownerPass = false;
    }
    b.t -= dt;
    if (b.t <= 0) explode(b);
  }
  G.bombs = G.bombs.filter(b => !b.dead);
  for (const [k, f] of G.flames) {
    f.t -= dt;
    if (f.t <= 0) G.flames.delete(k);
  }

  // 水花伤害（双方水泡 alike）
  for (const f of G.flames.values()) {
    const pc = cellOf(p);
    if (pc.cx === f.cx && pc.cy === f.cy) hurtPlayer();
    if (!f.hit) f.hit = new Set();
    for (const e of G.enemies) {
      if (e.dead || f.hit.has(e)) continue;
      const ec = cellOf(e);
      if (ec.cx === f.cx && ec.cy === f.cy) { f.hit.add(e); killEnemy(e); }
    }
  }
  G.enemies = G.enemies.filter(e => !e.dead);

  for (const e of G.enemies) {
    e.bombCd = Math.max(0, e.bombCd - dt);
    e.hamCd = Math.max(0, e.hamCd - dt);
    e.swing = Math.max(0, e.swing - dt);
    e.stun = Math.max(0, e.stun - dt);
  }
  for (const e of G.enemies) if (!window.__dbgFreezeEnemies) updateEnemy(e, dt);

  // 拾取道具（玩家与阿草 alike）
  const pc = cellOf(p);
  for (const it of G.items) {
    if (it.cx === pc.cx && it.cy === pc.cy) { it.taken = true; applyItem(it); }
  }
  for (const e of G.enemies) {
    const ec = cellOf(e);
    for (const it of G.items) {
      if (it.taken || it.cx !== ec.cx || it.cy !== ec.cy) continue;
      it.taken = true;
      if (it.type === 'bomb') e.maxBombs = Math.min(3, e.maxBombs + 1);
      if (it.type === 'range') e.range = Math.min(5, e.range + 1);
      if (it.type === 'speed') e.speed = Math.min(130, e.speed + 15);
      if (it.type === 'hammer') e.hammer = Math.min(6, e.hammer + 3);
      addFloater(e.x, e.y - 24, '阿草抢走了!', '#ff8f6e');
      sfx.pick();
    }
  }
  G.items = G.items.filter(it => !it.taken);

  // 粒子与飘字
  for (const pt of G.particles) { pt.t -= dt; pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.vy += 220 * dt; }
  G.particles = G.particles.filter(pt => pt.t > 0);
  for (const fl of G.floaters) { fl.t -= dt; fl.y -= 26 * dt; }
  G.floaters = G.floaters.filter(fl => fl.t > 0);
  G.shake = Math.max(0, G.shake - dt);

  if (G.state === 'playing' && G.enemies.length === 0) levelCleared();
  G.stats = { bombs: p.maxBombs, range: p.range, speed: p.speedLv };
}

// ---------- 渲染 ----------
function drawTileBase() {
  if (okImg(art.grass)) ctx.drawImage(art.grass, 0, 0, W, H);
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      ctx.fillStyle = (x + y) % 2 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
      ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
      if (!okImg(art.grass)) {
        ctx.fillStyle = (x + y) % 2 ? '#7ecb6a' : '#76c263';
        ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
    }
  }
}
function drawWall(x, y) {
  const px = x * TILE, py = y * TILE;
  if (okImg(art.hedge)) {
    ctx.save();
    if ((x + y) % 2) { ctx.translate(px + TILE, py); ctx.scale(-1, 1); ctx.drawImage(art.hedge, 0, 0, TILE, TILE); }
    else ctx.drawImage(art.hedge, px, py, TILE, TILE);
    ctx.restore();
    ctx.strokeStyle = '#00000026';
    ctx.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
    return;
  }
  ctx.fillStyle = '#3e7d46';
  ctx.fillRect(px + 1, py + 1, TILE - 2, TILE - 2);
  ctx.fillStyle = '#4f9959';
  ctx.fillRect(px + 3, py + 3, TILE - 6, TILE - 10);
  ctx.fillStyle = '#66b06e';
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(px + 10 + i * 13, py + 12 + (i % 2) * 8, 4, 0, 6.28);
    ctx.fill();
  }
}
function drawBox(b) {
  const px = b.cx * TILE, py = b.cy * TILE;
  if (okImg(art.box)) {
    ctx.save();
    if (b.hue) ctx.filter = 'hue-rotate(185deg)';
    ctx.drawImage(art.box, px + 1, py + 1, TILE - 2, TILE - 2);
    ctx.restore();
    return;
  }
  const c1 = b.hue ? '#f7a8c0' : '#9ecbf5';
  const c2 = b.hue ? '#e7799d' : '#6da3d8';
  ctx.fillStyle = c2;
  ctx.fillRect(px + 5, py + 9, TILE - 10, TILE - 14);
  ctx.fillStyle = c1;
  ctx.fillRect(px + 5, py + 9, TILE - 10, 10);
  ctx.fillStyle = '#ffd76e';
  ctx.fillRect(px + TILE / 2 - 3, py + 9, 6, TILE - 14);
  ctx.fillRect(px + 5, py + 18, TILE - 10, 5);
  ctx.strokeStyle = '#00000022';
  ctx.strokeRect(px + 5.5, py + 9.5, TILE - 11, TILE - 15);
}
function drawBomb(b) {
  const x = (b.cx + 0.5) * TILE, y = (b.cy + 0.5) * TILE;
  const urgent = b.t < 0.7;
  const foe = b.owner && b.owner.kind === 'enemy';
  const pulse = 1 + Math.sin(G.time * (urgent ? 22 : 7)) * 0.07;
  const r = TILE * 0.32 * pulse;
  const grad = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.15, x, y, r);
  grad.addColorStop(0, urgent ? '#ffd0d0' : foe ? '#ffe3ec' : '#d6f0ff');
  grad.addColorStop(0.55, urgent ? '#ff8f8f' : foe ? '#f78fb0' : '#6fc3f7');
  grad.addColorStop(1, urgent ? '#e05555' : foe ? '#c2406c' : '#3d8fd1');
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.arc(x, y, r, 0, 6.28); ctx.fill();
  ctx.fillStyle = '#ffffffcc';
  ctx.beginPath(); ctx.ellipse(x - r * 0.35, y - r * 0.45, r * 0.22, r * 0.13, -0.6, 0, 6.28); ctx.fill();
  const face = foe ? '#5c1230' : '#123a5c';
  ctx.fillStyle = face;
  ctx.beginPath(); ctx.arc(x - r * 0.26, y + r * 0.05, r * 0.09, 0, 6.28); ctx.fill();
  ctx.beginPath(); ctx.arc(x + r * 0.26, y + r * 0.05, r * 0.09, 0, 6.28); ctx.fill();
  ctx.strokeStyle = face;
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(x, y + r * 0.18, r * 0.16, 0.3, Math.PI - 0.3); ctx.stroke();
  ctx.fillStyle = foe ? '#c2406c' : '#3d8fd1';
  ctx.fillRect(x - 3, y - r - 5, 6, 6);
}
function drawFlame(f) {
  const x = f.cx * TILE, y = f.cy * TILE;
  const a = Math.min(1, f.t / FLAME_T * 1.6);
  const wob = Math.sin(G.time * 30 + f.cx * 2 + f.cy) * 2;
  ctx.globalAlpha = a * 0.9;
  ctx.fillStyle = '#4aa3e0';
  roundRect(x + 2 + wob * 0.3, y + 2, TILE - 4, TILE - 4, 12); ctx.fill();
  ctx.fillStyle = '#8fd3ff';
  roundRect(x + 8, y + 8 + wob * 0.4, TILE - 16, TILE - 16, 9); ctx.fill();
  ctx.fillStyle = '#e8f7ff';
  ctx.beginPath(); ctx.arc(x + TILE / 2, y + TILE / 2, 7 + wob, 0, 6.28); ctx.fill();
  ctx.globalAlpha = 1;
}
function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function drawItem(it) {
  const x = (it.cx + 0.5) * TILE, y = (it.cy + 0.5) * TILE + Math.sin(G.time * 3 + it.bob) * 3;
  ctx.fillStyle = '#ffffffd9';
  roundRect(x - 15, y - 15, 30, 30, 8); ctx.fill();
  ctx.strokeStyle = '#00000022'; ctx.stroke();
  if (it.type === 'bomb') {
    ctx.fillStyle = '#4aa3e0';
    ctx.beginPath(); ctx.arc(x, y + 2, 9, 0, 6.28); ctx.fill();
    ctx.fillStyle = '#ffffffcc';
    ctx.beginPath(); ctx.arc(x - 3, y - 1, 2.5, 0, 6.28); ctx.fill();
  } else if (it.type === 'range') {
    ctx.fillStyle = '#ff8f6e';
    ctx.beginPath();
    ctx.moveTo(x, y - 11);
    ctx.quadraticCurveTo(x + 10, y - 1, x + 6, y + 7);
    ctx.quadraticCurveTo(x, y + 12, x - 6, y + 7);
    ctx.quadraticCurveTo(x - 10, y - 1, x, y - 11);
    ctx.fill();
    ctx.fillStyle = '#ffd76e';
    ctx.beginPath(); ctx.arc(x, y + 4, 4, 0, 6.28); ctx.fill();
  } else if (it.type === 'speed') {
    ctx.fillStyle = '#f5b93e';
    roundRect(x - 10, y - 4, 20, 9, 4); ctx.fill();
    ctx.fillStyle = '#c98d1e';
    ctx.fillRect(x - 10, y + 4, 20, 3);
    ctx.fillStyle = '#fff';
    ctx.fillRect(x - 6, y - 2, 6, 2);
  } else {
    ctx.strokeStyle = '#8a5a33'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(x - 7, y + 9); ctx.lineTo(x + 4, y - 4); ctx.stroke();
    ctx.save(); ctx.translate(x + 5, y - 5); ctx.rotate(-0.6);
    ctx.fillStyle = '#9aa5b1'; ctx.fillRect(-9, -6, 18, 12);
    ctx.fillStyle = '#c3ccd6'; ctx.fillRect(-9, -6, 18, 4);
    ctx.restore();
  }
}
function drawEntity(e) {
  const bob = e.kind === 'player' ? (e.moving ? Math.sin(G.time * 14) * 2 : 0) : Math.sin(e.wob) * 2;
  const size = e.big ? TILE * 1.05 : TILE * 0.92;
  ctx.fillStyle = '#00000030';
  ctx.beginPath(); ctx.ellipse(e.x, e.y + size * 0.38, size * 0.32, size * 0.12, 0, 0, 6.28); ctx.fill();
  if (e.kind === 'player' && e.invuln > 0 && Math.floor(G.time * 10) % 2) ctx.globalAlpha = 0.35;
  ctx.save();
  ctx.translate(e.x, e.y + bob);
  ctx.scale(e.face, 1);
  if (e.img && e.img.complete && e.img.naturalWidth > 0) {
    ctx.drawImage(e.img, -size / 2, -size / 2, size, size);
  } else {
    ctx.fillStyle = e.kind === 'player' ? (e.char ? e.char.color : '#DB7D74') : '#8a7f5c';
    ctx.beginPath(); ctx.arc(0, 0, size * 0.4, 0, 6.28); ctx.fill();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
  if (e.swing > 0) drawSwing(e);
  if (e.stun > 0) drawStun(e);
}
function drawSwing(e) {
  const pr = 1 - e.swing / SWING_T;
  const a = -Math.PI * 0.5 + pr * Math.PI * 1.6;
  const rx = e.x + Math.cos(a) * TILE * 0.62, ry = e.y + Math.sin(a) * TILE * 0.62;
  ctx.strokeStyle = '#8a5a33'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(rx, ry); ctx.stroke();
  ctx.save(); ctx.translate(rx, ry); ctx.rotate(a);
  ctx.fillStyle = e.kind === 'player' ? '#8fd3ff' : '#f78fb0';
  ctx.fillRect(-6, -12, 12, 24);
  ctx.strokeStyle = '#00000033'; ctx.strokeRect(-6, -12, 12, 24);
  ctx.restore();
}
function drawStun(e) {
  ctx.fillStyle = '#ffd76e';
  for (let i = 0; i < 3; i++) {
    const a = G.time * 5 + i * 2.09;
    ctx.beginPath(); ctx.arc(e.x + Math.cos(a) * 14, e.y - TILE * 0.55 + Math.sin(a) * 5, 3, 0, 6.28); ctx.fill();
  }
}
function render() {
  ctx.save();
  if (G.shake > 0) ctx.translate((rng() - 0.5) * G.shake * 14, (rng() - 0.5) * G.shake * 14);
  drawTileBase();
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++)
      if (G.grid[key(x, y)] === 1) drawWall(x, y);
  for (const b of G.boxes) drawBox(b);
  for (const it of G.items) drawItem(it);
  for (const b of G.bombs) drawBomb(b);
  const ents = [...G.enemies];
  if (G.player) ents.push(G.player);
  ents.sort((a, b) => a.y - b.y);
  for (const e of ents) drawEntity(e);
  for (const f of G.flames.values()) drawFlame(f);
  for (const pt of G.particles) {
    ctx.globalAlpha = pt.t / pt.max;
    ctx.fillStyle = pt.c;
    ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.r, 0, 6.28); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.font = 'bold 15px "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';
  for (const fl of G.floaters) {
    ctx.globalAlpha = Math.min(1, fl.t * 2);
    ctx.fillStyle = fl.c;
    ctx.fillText(fl.txt, fl.x, fl.y);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  updateHud();
}
function updateHud() {
  const p = G.player;
  document.getElementById('hud-level').textContent = G.level + 1;
  document.getElementById('hud-diff').textContent = (DIFFS[G.diff] || DIFFS.medium).name;
  document.getElementById('hud-score').textContent = G.score;
  document.getElementById('hud-best').textContent = G.best;
  document.getElementById('hud-enemies').textContent = G.enemies.length;
  document.getElementById('hud-lives').textContent = '♥'.repeat(Math.max(0, G.lives)) + '♡'.repeat(Math.max(0, 3 - G.lives));
  if (p) {
    document.getElementById('hud-bombs').textContent = p.maxBombs;
    document.getElementById('hud-range').textContent = p.range;
    document.getElementById('hud-speed').textContent = p.speedLv;
    document.getElementById('hud-hammer').textContent = p.hammer;
  }
}

// ---------- 覆盖层 ----------
const overlay = document.getElementById('overlay');
const menu = document.getElementById('menu');
function hideOverlays() { overlay.classList.add('hidden'); menu.classList.add('hidden'); }
function showOverlay(kind) {
  overlay.classList.remove('hidden');
  if (kind === 'clear') {
    const last = G.level === LEVELS.length - 1;
    overlay.innerHTML = '<h2>' + (last ? '最终关通过！' : '关卡通过！') + '</h2><p class="score-line">奖励 +200 ・ 当前分数 ' + G.score + '</p><p class="tip">' + (last ? '回车查看结算' : '即将进入第 ' + (G.level + 2) + ' 关…（回车立即继续）') + '</p>';
  } else if (kind === 'win') {
    const cname = G.char ? CHARS.find(c => c.id === G.char).name : '';
    overlay.innerHTML = '<h2>枝江恢复了和平！</h2><p class="score-line">最终分数 ' + G.score + (G.score >= G.best ? ' ・ 新纪录！' : ' ・ 最高 ' + G.best) + '</p><p class="tip">' + cname + ' 为大家带来了胜利！</p><div class="btn-row"><button id="btn-again">再来一局 (Enter)</button><button id="btn-home" class="ghost">返回主页</button></div>';
  } else if (kind === 'over') {
    overlay.innerHTML = '<h2>被阿草闹翻了…</h2><p class="score-line">分数 ' + G.score + ' ・ 最高 ' + G.best + '</p><div class="btn-row"><button id="btn-again">重新挑战 (Enter)</button><button id="btn-home" class="ghost">返回主页</button></div>';
  } else if (kind === 'pause') {
    overlay.innerHTML = '<h2>已暂停</h2><p class="tip">按 P / Esc 继续，或返回主页重新设置对局</p><div class="btn-row"><button id="btn-resume">继续游戏</button><button id="btn-home" class="ghost">返回主页</button></div>';
  }
  const btn = document.getElementById('btn-again');
  if (btn) btn.onclick = () => startGame(G.char || 'bella');
  const resume = document.getElementById('btn-resume');
  if (resume) resume.onclick = () => { G.state = 'playing'; hideOverlays(); };
  const home = document.getElementById('btn-home');
  if (home) home.onclick = goHome;
}

// ---------- 菜单 ----------
let selected = null;
const cardsEl = document.getElementById('cards');
CHARS.forEach((c, i) => {
  const d = document.createElement('div');
  d.className = 'card';
  d.innerHTML = '<img src="' + ASSET + c.img + '" alt="' + c.name + '"><div class="nm" style="color:' + c.color + '">' + c.name + '</div><div class="sl">' + c.slogan + '</div>';
  d.onclick = () => {
    selected = c.id;
    document.querySelectorAll('.card').forEach(x => x.classList.remove('sel'));
    d.classList.add('sel');
    document.getElementById('btn-start').disabled = false;
  };
  cardsEl.appendChild(d);
});
document.getElementById('btn-start').onclick = () => { if (selected) startGame(selected); };
['sel-ai', 'sel-diff'].forEach(id => {
  const el = document.getElementById(id);
  el.addEventListener('change', () => el.blur()); // 避免焦点留在下拉框时 Enter/数字键被菜单快捷键抢占
});
document.getElementById('hud-char').innerHTML = '';

// ---------- 输入 ----------
window.addEventListener('keydown', e => {
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
  if (e.repeat) { keys[e.code] = true; return; }
  keys[e.code] = true;
  if (G.state === 'menu') {
    if (document.activeElement && document.activeElement.tagName === 'SELECT') return;
    if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3') {
      const idx = Number(e.code.slice(-1)) - 1;
      cardsEl.children[idx].click();
    }
    if (e.code === 'Enter' && selected) startGame(selected);
    return;
  }
  if (e.code === 'KeyM') toggleMute();
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (G.state === 'playing') { G.state = 'pause'; showOverlay('pause'); }
    else if (G.state === 'pause') { G.state = 'playing'; hideOverlays(); }
    return;
  }
  if (G.state === 'playing' && (e.code === 'Space' || e.code === 'KeyJ')) placeBomb();
  if (G.state === 'playing' && e.code === 'KeyK') trySwing(G.player);
  if (e.code === 'Enter') {
    if (G.state === 'clear') nextLevel();
    else if (G.state === 'over' || G.state === 'win') startGame(G.char || 'bella');
  }
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
function toggleMute() {
  muted = !muted;
  document.getElementById('btn-mute').classList.toggle('off', muted);
}
document.getElementById('btn-mute').onclick = toggleMute;

// ---------- 主循环 ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!window.__dbgManual) update(dt);
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------- 调试/验证接口（固定种子 + 同步步进） ----------
window.__dbg = {
  manual(on) { window.__dbgManual = !!on; },
  setSeed,
  start(charId) { startGame(charId || 'bella'); },
  config(ai, diff) {
    if (ai != null) document.getElementById('sel-ai').value = String(ai);
    if (diff) document.getElementById('sel-diff').value = diff;
  },
  key(code, down) {
    keys[code] = !!down;
    if (down && G.state === 'playing' && (code === 'Space' || code === 'KeyJ')) placeBomb();
    if (down && G.state === 'playing' && code === 'KeyK') trySwing(G.player);
    if (down && code === 'Enter' && G.state === 'clear') nextLevel();
  },
  tick(ms) { update(ms / 1000); render(); },
  placeBomb,
  swing() { return trySwing(G.player); },
  state() {
    const p = G.player;
    return {
      state: G.state, level: G.level, score: G.score, lives: G.lives, aiCount: G.aiCount, diff: G.diff, time: Math.round(G.time * 1000) / 1000,
      boxes: G.boxes.length, bombs: G.bombs.map(b => ({ cx: b.cx, cy: b.cy, side: b.owner ? b.owner.kind : '?' })), flames: G.flames.size,
      items: G.items.map(i => ({ cx: i.cx, cy: i.cy, type: i.type })),
      enemies: G.enemies.map(e => ({ x: Math.round(e.x), y: Math.round(e.y), hp: e.hp, maxBombs: e.maxBombs, range: e.range, speed: Math.round(e.speed), hammer: e.hammer, stun: Math.round(e.stun * 10) / 10 })),
      player: p ? { x: Math.round(p.x), y: Math.round(p.y), cell: cellOf(p), maxBombs: p.maxBombs, range: p.range, speedLv: p.speedLv, invuln: p.invuln > 0, hammer: p.hammer, stun: p.stun > 0 } : null,
    };
  },
  grid() { return G.grid.slice(); },
  art() { return { grass: okImg(art.grass), hedge: okImg(art.hedge), box: okImg(art.box) }; },
  // 测试辅助：直接设置玩家位置 / 生成道具 / 引爆
  teleport(x, y) { G.player.x = x; G.player.y = y; },
  teleportEnemy(i, x, y) { const e = G.enemies[i]; if (e) { e.x = x; e.y = y; e.tx = Math.round(x / TILE - 0.5); e.ty = Math.round(y / TILE - 0.5); e.path = []; } },
  enemyTryBomb(i, force) { const e = G.enemies[i]; return e ? tryEnemyBomb(e, !!force) : false; },
  stepEnemy(i, ms) { const e = G.enemies[i]; if (e) updateEnemy(e, ms / 1000); },
  noInvuln() { G.player.invuln = 0; },
  freezeEnemies(on) { window.__dbgFreezeEnemies = !!on; },
  spawnItem(cx, cy, type) { G.items.push({ cx, cy, type, bob: 0 }); },
  detonate() { for (const b of G.bombs) explode(b); G.bombs = G.bombs.filter(b => !b.dead); },
  clearEnemies() { G.enemies = []; },
};