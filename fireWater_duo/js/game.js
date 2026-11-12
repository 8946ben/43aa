/* ============================================================================
   闪耀双人舞台 · 冰火协奏 —— 游戏引擎
   ----------------------------------------------------------------------------
   依赖:js/data.js(先加载,提供 LEVELS / STAR_UNLOCK / MEMBERS / FIRE_IDS / WATER_IDS)
   运行环境:纯静态 file:// 双击即玩,零依赖零联网。
   搭档制:p1 恒为红莲侧(WASD,免疫火光池),p2 恒为沧海侧(方向键,免疫水池);
          具体成员由菜单「选择搭档」决定(3x2=6 种组合),只影响表现层。
   结构:
     1. 常量与工具        2. 音频(WebAudio 合成)   3. 输入
     4. 进度存取          5. 关卡解析 / 重置
     6. 玩家与箱子物理    7. 机关联动
     8. 粒子              9. 渲染(背景/瓦片/机关/角色/HUD/画面)
    10. 状态机与主循环   11. DOM 菜单绑定(含搭档选择)
   ========================================================================== */

/* ============================== 1. 常量与工具 ============================== */
var W = 960, H = 640;            // 画布尺寸
var T = 32;                      // 瓦片尺寸
var COLS = 30, ROWS = 20;        // 网格 30x20,恰好一屏(无卷轴)
var G = 1800;                    // 重力 px/s^2
var JV = 560;                    // 起跳速度(跳高约 2.7 格)
var MV = 220;                    // 水平最大速度(跳距约 4 格)
var PUSH_SPEED = 60;             // 推箱速度
var COYOTE = 0.08;               // 土狼时间
var JBUF = 0.12;                 // 跳跃输入缓冲

// 瓦片类型
var T_EMPTY = 0, T_SOLID = 1, T_ONEWAY = 2, T_FIRE = 3, T_WATER = 4, T_VOID = 5;

// 收集品色(成员个人应援色在 data.js 的 MEMBERS 里)
var C_NOTE = '#ff4d55';          // 红音符(红莲侧限定)
var C_STAR = '#7fd0ff';          // 蓝星光(沧海侧限定)
var C_FIRE = '#ff5a3c', C_WATER = '#3ca0ff', C_VOID = '#5fd35f', C_ICE = '#bfe8ff';

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function rectOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

var canvas = document.getElementById('game');
var ctx = canvas.getContext('2d');

/* ============================== 2. 音频合成 ============================== */
var audioCtx = null;
var muted = false;
try { muted = localStorage.getItem('firewater_muted') === '1'; } catch (e) {}

function ac() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}
// 单音:频率滑音 + 音量包络
function beep(f0, f1, dur, type, vol, delay) {
  var a = ac(); if (!a || muted) return;
  var t0 = a.currentTime + (delay || 0);
  var o = a.createOscillator(), g = a.createGain();
  o.type = type || 'square';
  o.frequency.setValueAtTime(f0, t0);
  o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol || 0.15, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(a.destination);
  o.start(t0); o.stop(t0 + dur + 0.05);
}
var sfx = {
  click:   function () { beep(660, 880, 0.07, 'square', 0.08); },
  jump:    function () { beep(320, 560, 0.13, 'square', 0.10); },
  swim:    function () { beep(220, 420, 0.16, 'sine', 0.12); },
  collect: function () { beep(880, 1318, 0.09, 'sine', 0.14); beep(1318, 1760, 0.12, 'sine', 0.10, 0.07); },
  lever:   function () { beep(180, 140, 0.06, 'square', 0.16); beep(420, 520, 0.05, 'square', 0.08, 0.06); },
  door:    function () { beep(523, 523, 0.10, 'triangle', 0.12); beep(659, 659, 0.12, 'triangle', 0.12, 0.08); beep(784, 784, 0.16, 'triangle', 0.12, 0.16); },
  freeze:  function () { beep(1400, 2200, 0.18, 'sine', 0.10); beep(900, 1500, 0.22, 'triangle', 0.08, 0.05); },
  die:     function () { beep(440, 60, 0.45, 'sawtooth', 0.18); },
  push:    function () { beep(120, 100, 0.06, 'square', 0.05); },
  star:    function () { beep(1568, 2093, 0.18, 'sine', 0.12); },
  win:     function () {
    var seq = [523, 659, 784, 1046, 784, 1046, 1318];
    for (var i = 0; i < seq.length; i++) beep(seq[i], seq[i], 0.13, 'triangle', 0.13, i * 0.11);
  },
  fan:     function () { beep(300, 500, 0.3, 'sine', 0.04); }
};

/* ============================== 3. 输入 ============================== */
var keys = {};
// 双人键位:红莲侧 WASD,沧海侧方向键(与具体选了哪位成员无关)
var KEYMAP = {
  fire:  { left: 'KeyA', right: 'KeyD', jump: 'KeyW', down: 'KeyS' },
  water: { left: 'ArrowLeft', right: 'ArrowRight', jump: 'ArrowUp', down: 'ArrowDown' }
};
window.addEventListener('keydown', function (e) {
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].indexOf(e.code) >= 0) e.preventDefault();
  keys[e.code] = true;
  onGlobalKey(e.code);
});
window.addEventListener('keyup', function (e) { keys[e.code] = false; });
window.addEventListener('mousedown', function () { ac(); }); // 首次交互解锁音频
function kd(code) { return !!keys[code]; }

/* ============================== 4. 进度存取 ============================== */
var PROG_KEY = 'firewater_progress_v2';
var prog = { stars: {}, unlocked: 1, partner: { fire: 'bella', water: 'eileen' } };
try {
  var saved = JSON.parse(localStorage.getItem(PROG_KEY));
  if (saved && saved.stars) prog = saved;
  if (!prog.unlocked) prog.unlocked = 1;
} catch (e) {}
// 当前搭档(默认推荐:贝拉 & 乃琳);从存档恢复时做合法性兜底
var PARTNERS = { fire: RECOMMEND.fire, water: RECOMMEND.water };
(function () {
  if (prog.partner &&
      FIRE_IDS.indexOf(prog.partner.fire) >= 0 &&
      WATER_IDS.indexOf(prog.partner.water) >= 0) {
    PARTNERS = { fire: prog.partner.fire, water: prog.partner.water };
  }
})();
function rememberPartners() {
  prog.partner = { fire: PARTNERS.fire, water: PARTNERS.water };
  saveProg();
}
function saveProg() { try { localStorage.setItem(PROG_KEY, JSON.stringify(prog)); } catch (e) {} }
function totalStars() {
  var s = 0;
  for (var i = 1; i <= 8; i++) s += prog.stars[i] || 0;
  return s;
}

/* ============================== 5. 关卡解析 / 重置 ============================== */
var lvIdx = 0, lv = null;

function tileAt(x, y) {
  if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return T_SOLID;
  return lv.grid[y][x];
}

function parseLevel(idx) {
  var def = LEVELS[idx];
  var L = {
    def: def,
    grid: [], items: [], exits: {}, spawns: {},
    plates: [], doors: [], levers: [], spots: [], fans: [], bridges: [], boxes: [],
    frozen: {},      // key "x,y" -> 1,聚光灯冻结的水
    solid: {},       // key "x,y" -> 1,动态实心(桥+关闭的门)
    p1: null, p2: null
  };
  // --- 解析字符画 ---
  for (var y = 0; y < ROWS; y++) {
    var row = def.map[y], line = [];
    for (var x = 0; x < COLS; x++) {
      var c = row.charAt(x), t = T_EMPTY;
      switch (c) {
        case '#': t = T_SOLID; break;
        case '=': t = T_ONEWAY; break;
        case 'F': t = T_FIRE; break;
        case 'W': t = T_WATER; break;
        case 'G': t = T_VOID; break;
        case '1': L.items.push({ kind: 'note', x: x, y: y, taken: false }); break;
        case '2': L.items.push({ kind: 'star', x: x, y: y, taken: false }); break;
        case 'f': t = T_FIRE;  L.items.push({ kind: 'note', x: x, y: y, taken: false }); break;
        case 'w': t = T_WATER; L.items.push({ kind: 'star', x: x, y: y, taken: false }); break;
        case 'A': L.spawns.fire = { x: x, y: y }; break;   // 红莲侧出生点
        case 'B': L.spawns.water = { x: x, y: y }; break;  // 沧海侧出生点
        case 'X': L.exits.fire = { x: x, y: y }; break;    // 红莲侧出口门
        case 'Y': L.exits.water = { x: x, y: y }; break;   // 沧海侧出口门
      }
      line.push(t);
    }
    L.grid.push(line);
  }
  // --- 实例化机关 ---
  (def.mechs || []).forEach(function (m) {
    switch (m.type) {
      case 'door':      L.doors.push({ id: m.id, x: m.x, y: m.y, h: m.h || 4, color: m.color || 'n', open: false }); break;
      case 'plate':     L.plates.push({ id: m.id, x: m.x, y: m.y, mode: m.mode || 'hold', targets: m.targets || [], pressed: false, locked: false, anim: 0 }); break;
      case 'lever':     L.levers.push({ id: m.id, x: m.x, y: m.y, state: m.state || 0, targets: m.targets || [], wasTouch: false }); break;
      case 'spotlight': L.spots.push({ id: m.id, x: m.x, y: m.y, zone: m.zone, active: false, glow: 0 }); break;
      case 'fan':       L.fans.push({ id: m.id, x: m.x, y: m.y, zone: m.zone, power: m.power || 2600 }); break;
      case 'bridge':    L.bridges.push({ id: m.id, group: m.group, tiles: m.tiles, on: false }); break;
      case 'box':       L.boxes.push({ id: m.id, isBox: true, x: m.x * T + 1, y: m.y * T + 2, w: 30, h: 30, vy: 0, pushed: 0 }); break;
    }
  });
  // --- 玩家(p1 恒为红莲侧 WASD,p2 恒为沧海侧方向键;成员只影响表现层)---
  L.p1 = makePlayer('fire', L.spawns.fire);
  L.p2 = makePlayer('water', L.spawns.water);
  return L;
}

function makePlayer(side, sp) {
  return {
    side: side, member: MEMBERS[PARTNERS[side]], keys: KEYMAP[side], isPlayer: true,
    x: sp.x * T + 6, y: sp.y * T + 4, w: 20, h: 28,
    vx: 0, vy: 0, face: 1, walkT: 0,
    onGround: false, coyote: 0, jumpBuf: 0, jumpHeld: false, dropT: 0,
    inLiquid: false, alive: true
  };
}

function resetLevel() {
  lv = parseLevel(lvIdx);
  parts = [];
  bannerT = 0; winTimer = 0; winT = 0;
  state = 'play';
}

/* ============================== 6. 玩家与箱子物理 ============================== */
// 实体与某瓦片格的防夹重叠检测(桥/门/冰出现时不挤死玩家)
function entOnTile(e, tx, ty) {
  return e.x < (tx + 1) * T && e.x + e.w > tx * T && e.y < (ty + 1) * T && e.y + e.h > ty * T;
}
// 动态实心查询:冻结冰面无条件实体(冻结瞬间会把水中玩家托出冰面,见 updateMechs);
// 桥/关闭的门对"身体与之重叠的玩家"豁免,防止门落/桥现时把玩家挤死;箱子始终被阻挡。
function dynSolidAt(e, tx, ty) {
  var k = tx + ',' + ty;
  if (lv.frozen[k]) return true;
  if (lv.solid[k]) {
    if (e && e.isBox) return true; // 箱子始终被动态实心阻挡
    // 有玩家站里面时暂不实心,防止夹住
    var players = [lv.p1, lv.p2];
    for (var i = 0; i < 2; i++) if (players[i].alive && entOnTile(players[i], tx, ty)) return false;
    return true;
  }
  return false;
}
// 静态+动态实心(不含单向平台)
function solidFor(e, tx, ty) {
  var t = tileAt(tx, ty);
  if (t === T_SOLID) return true;
  if (t === T_EMPTY) return dynSolidAt(e, tx, ty);
  // 聚光灯冻结的水池是实体冰桥(玩家恰好在格内时由 dynSolidAt 防夹豁免)
  if (t === T_WATER && lv.frozen[tx + ',' + ty]) return dynSolidAt(e, tx, ty);
  return false;
}

// X 轴移动,返回是否撞墙
function moveX(e, dx) {
  e.x += dx;
  var top = Math.floor(e.y / T), bot = Math.floor((e.y + e.h - 0.01) / T);
  var hit = false;
  if (dx > 0) {
    var r = Math.floor((e.x + e.w - 0.01) / T);
    for (var ty = top; ty <= bot; ty++) {
      if (solidFor(e, r, ty)) { e.x = r * T - e.w - 0.01; hit = true; }
    }
  } else if (dx < 0) {
    var l = Math.floor(e.x / T);
    for (var ty2 = top; ty2 <= bot; ty2++) {
      if (solidFor(e, l, ty2)) { e.x = (l + 1) * T + 0.01; hit = true; }
    }
  }
  return hit;
}
// Y 轴移动:1=落地 -1=撞头 0=无;单向平台只挡下落
function moveY(e, dy) {
  var prevBot = e.y + e.h;
  e.y += dy;
  var left = Math.floor(e.x / T), right = Math.floor((e.x + e.w - 0.01) / T);
  if (dy > 0) {
    var b = Math.floor((e.y + e.h - 0.01) / T);
    for (var tx = left; tx <= right; tx++) {
      if (solidFor(e, tx, b)) { e.y = b * T - e.h - 0.01; return 1; }
      if (tileAt(tx, b) === T_ONEWAY && !(e.dropT > 0) && prevBot <= b * T + 8) {
        e.y = b * T - e.h - 0.01; return 1;
      }
    }
    // 落到箱顶(玩家可站上音箱垫脚;箱也可叠在箱上)
    for (var bi = 0; bi < lv.boxes.length; bi++) {
      var bk = lv.boxes[bi];
      if (bk === e) continue;
      if (rectOverlap(e, bk) && prevBot <= bk.y + 8) {
        e.y = bk.y - e.h - 0.01; return 1;
      }
    }
  } else if (dy < 0) {
    var t = Math.floor(e.y / T);
    for (var tx2 = left; tx2 <= right; tx2++) {
      if (solidFor(e, tx2, t)) { e.y = (t + 1) * T + 0.01; return -1; }
    }
  }
  return 0;
}

function fanAt(e) {
  for (var i = 0; i < lv.fans.length; i++) {
    var f = lv.fans[i], z = f.zone;
    var zx = z[0] * T, zy = z[1] * T, zw = z[2] * T, zh = z[3] * T;
    if (e.x + e.w > zx && e.x < zx + zw && e.y + e.h > zy && e.y < zy + zh) return f;
  }
  return null;
}

function updatePlayer(p, dt) {
  if (!p.alive) return;
  var kL = kd(p.keys.left), kR = kd(p.keys.right), kJ = kd(p.keys.jump), kD = kd(p.keys.down);

  // --- 水平 ---
  var maxV = p.inLiquid ? MV * 0.55 : MV;
  var acc = 2000;
  if (kL) { p.vx -= acc * dt; p.face = -1; }
  else if (kR) { p.vx += acc * dt; p.face = 1; }
  else {
    var fr = Math.pow(0.0002, dt);
    p.vx *= fr;
    if (Math.abs(p.vx) < 4) p.vx = 0;
  }
  p.vx = clamp(p.vx, -maxV, maxV);

  // --- 跳跃(缓冲 + 土狼时间;液体里可游泳上浮)---
  if (kJ && !p.jumpHeld) p.jumpBuf = JBUF;
  p.jumpHeld = kJ;
  p.jumpBuf -= dt; p.coyote -= dt; p.dropT -= dt;
  var canJump = p.onGround || p.coyote > 0 || p.inLiquid;
  if (p.jumpBuf > 0 && canJump) {
    // 液体里也是满跳:保证从水面浮点起跳能稳上 2 格高的平台/河岸(容错 ~8px)
    p.vy = -JV;
    p.jumpBuf = 0; p.coyote = 0; p.onGround = false;
    if (p.inLiquid) sfx.swim(); else sfx.jump();
  }
  // 可变跳跃高度:松开跳跃键截断上升
  if (!kJ && p.vy < -170 && !p.inLiquid) p.vy = -170;

  // --- 垂直(液体浮力 / 风扇气流 / 普通重力)---
  var fan = fanAt(p);
  if (p.inLiquid) {
    var g = G * 0.26 * (kD ? 2.4 : 1);
    if (kJ) p.vy = Math.max(p.vy - 2400 * dt, -240); // 按住跳 = 游泳上浮
    p.vy = clamp(p.vy + g * dt, -240, 110);
  } else if (fan) {
    p.vy = clamp(p.vy - fan.power * dt, -250, 90);
  } else {
    p.vy = Math.min(p.vy + G * dt, 950);
  }

  // --- 按下键从单向平台落下 ---
  if (kD && p.onGround) p.dropT = 0.18;

  // --- 分轴移动 ---
  var wasGround = p.onGround;
  p.onGround = false;
  moveX(p, p.vx * dt);
  pushBoxes(p, dt);                       // 推音箱
  var vyRes = moveY(p, p.vy * dt);
  if (vyRes === 1) {
    p.onGround = true; p.coyote = COYOTE;
    if (p.vy > 500) { /* 落地小尘 */ }
    p.vy = 0;
  } else if (vyRes === -1) {
    p.vy = 0;
  } else if (wasGround && p.vy >= 0) {
    p.coyote = COYOTE;                    // 离地瞬间保留土狼时间
  }
  if (p.onGround || p.inLiquid) p.walkT += Math.abs(p.vx) * dt * 0.06;
  else p.walkT += dt * 2;

  // --- 液体与致命判定(取身体中心点所在格,宽松友好)---
  var cx = p.x + p.w / 2, cy = p.y + p.h / 2;
  var t = tileAt(Math.floor(cx / T), Math.floor(cy / T));
  if (t === T_VOID) { killPlayer(p); return; }
  if (t === T_FIRE && p.side !== 'fire') { killPlayer(p); return; }   // 沧海侧碰火光池即败
  if (t === T_WATER && p.side !== 'water') { killPlayer(p); return; } // 红莲侧碰水池即败
  p.inLiquid = (t === T_FIRE && p.side === 'fire') || (t === T_WATER && p.side === 'water');
  // 出水/出火瞬间:按住跳跃键则带惯性跃出液面,保证一定能游回岸上
  if (p.inLiquid) {
    p.wasLiquid = true;
  } else if (p.wasLiquid) {
    p.wasLiquid = false;
    if (kJ) p.vy = -JV * 0.85;
  }

  // --- 拉杆 ---
  for (var i = 0; i < lv.levers.length; i++) {
    var lvr = lv.levers[i];
    var r = { x: lvr.x * T + 6, y: lvr.y * T + 4, w: T - 12, h: T - 8 };
    var touch = rectOverlap(p, r);
    if (touch && !lvr.wasTouch) {
      lvr.state = 1 - lvr.state;
      sfx.lever();
      spawnBurst(lvr.x * T + T / 2, lvr.y * T + 10, '#ffd75e', 8, 90);
    }
    lvr.wasTouch = touch;
  }

  // --- 收集品(玫红音符→心宜,紫星光→思诺)---
  for (var j = 0; j < lv.items.length; j++) {
    var it = lv.items[j];
    if (it.taken) continue;
    if (it.kind === 'note' && p.side !== 'fire') continue;   // 红音符:红莲侧限定
    if (it.kind === 'star' && p.side !== 'water') continue;  // 蓝星光:沧海侧限定
    var ir = { x: it.x * T + 4, y: it.y * T + 4, w: T - 8, h: T - 8 };
    if (rectOverlap(p, ir)) {
      it.taken = true;
      sfx.collect();
      var col = it.kind === 'note' ? C_NOTE : C_STAR;
      spawnBurst(it.x * T + T / 2, it.y * T + T / 2, col, 14, 130);
    }
  }

  // --- 边界保护 ---
  p.x = clamp(p.x, 0, W - p.w);
}

// 推音箱:玩家与箱重叠时尝试推动;推不动则玩家贴住停步
function pushBoxes(p, dt) {
  for (var i = 0; i < lv.boxes.length; i++) {
    var b = lv.boxes[i];
    // 只有脚部低于箱顶才推(跳跃越过时不推)
    if (!rectOverlap(p, b)) continue;
    if (p.y + p.h < b.y + 8) continue;
    var dir = p.vx > 0 ? 1 : (p.vx < 0 ? -1 : 0);
    if (dir === 0) continue;
    var step = dir * PUSH_SPEED * dt;
    var ox = b.x;
    b.x += step;
    // 箱碰撞:墙 / 液体格 / 关闭的门桥 / 其他箱
    var top = Math.floor(b.y / T), bot = Math.floor((b.y + b.h - 0.01) / T);
    var l = Math.floor(b.x / T), r = Math.floor((b.x + b.w - 0.01) / T);
    var blocked = false;
    for (var tx = l; tx <= r && !blocked; tx++) {
      for (var ty = top; ty <= bot && !blocked; ty++) {
        var t = tileAt(tx, ty);
        if (t === T_SOLID || t === T_FIRE || t === T_WATER || t === T_VOID) blocked = true;
        else if (dynSolidAt(b, tx, ty)) blocked = true;
      }
    }
    for (var o = 0; o < lv.boxes.length; o++) {
      var ob = lv.boxes[o];
      if (ob !== b && rectOverlap(b, ob)) blocked = true;
    }
    if (blocked) {
      b.x = ox;
      p.x = dir > 0 ? b.x - p.w - 0.01 : b.x + b.w + 0.01;
      p.vx = 0;
    } else {
      // 贴着推
      p.x = dir > 0 ? b.x - p.w - 0.01 : b.x + b.w + 0.01;
      b.pushed = 0.15;
      if (Math.random() < dt * 8) sfx.push();
    }
  }
}

function updateBox(b, dt) {
  // 重力下落
  b.vy = Math.min(b.vy + G * dt, 900);
  var res = moveY(b, b.vy * dt);
  if (res === 1) b.vy = 0;
  b.pushed = Math.max(0, b.pushed - dt);
  // 被风? 不:箱子不受风扇影响,保持简单
  // 箱不能出界
  b.x = clamp(b.x, 0, W - b.w);
}

function killPlayer(p) {
  if (!p.alive) return;
  p.alive = false;
  sfx.die();
  spawnBurst(p.x + p.w / 2, p.y + p.h / 2, p.member.color, 26, 220);
  spawnBurst(p.x + p.w / 2, p.y + p.h / 2, '#ffffff', 10, 120);
  state = 'dying';
  dieTimer = 1.05;
}

/* ============================== 7. 机关联动 ============================== */
var winTimer = 0, bannerT = 0, dieTimer = 0, winT = 0, winStars = 0;
var endingT = 0, endingMode = 0, time = 0;

// 踏板/拉杆对某 target 的"激活"判定
function sourceActive(src, targetId) {
  if (src.targets.indexOf(targetId) < 0) return false;
  if (src.mode) { // plate
    return src.mode === 'once' ? src.locked : src.pressed;
  }
  return src.state === 1; // lever
}

function updateMechs(dt) {
  var players = [lv.p1, lv.p2];

  // --- 压力踏板 ---
  for (var i = 0; i < lv.plates.length; i++) {
    var pl = lv.plates[i];
    var r = { x: pl.x * T + 2, y: pl.y * T + T - 10, w: T - 4, h: 10 };
    var hit = false;
    for (var a = 0; a < 2; a++) if (players[a].alive && rectOverlap(players[a], r)) hit = true;
    for (var b = 0; b < lv.boxes.length; b++) if (rectOverlap(lv.boxes[b], r)) hit = true;
    if (hit && !pl.pressed) sfx.lever();
    pl.pressed = hit;
    if (hit && pl.mode === 'once' && !pl.locked) {
      pl.locked = true;
      sfx.door();
      spawnBurst(pl.x * T + T / 2, pl.y * T + T - 6, '#7de0d8', 12, 110);
    }
    pl.anim = lerp(pl.anim, hit ? 1 : 0, Math.min(1, dt * 14));
  }

  // --- 门 ---
  for (var d = 0; d < lv.doors.length; d++) {
    var dr = lv.doors[d];
    var open = false;
    for (var s = 0; s < lv.plates.length; s++) if (sourceActive(lv.plates[s], dr.id)) open = true;
    for (var s2 = 0; s2 < lv.levers.length; s2++) if (sourceActive(lv.levers[s2], dr.id)) open = true;
    if (open && !dr.open) { sfx.door(); spawnBurst(dr.x * T + T / 2, (dr.y + dr.h) * T - T / 2, '#ffd75e', 12, 120); }
    dr.open = open;
  }

  // --- 红蓝桥:任一关联拉杆 state === group 时该桥实体 ---
  for (var br = 0; br < lv.bridges.length; br++) {
    var bridge = lv.bridges[br];
    var on = false;
    for (var s3 = 0; s3 < lv.levers.length; s3++) {
      var lvr = lv.levers[s3];
      if (lvr.targets.indexOf(bridge.id) >= 0 && lvr.state === bridge.group) on = true;
    }
    bridge.on = on;
  }

  // --- 聚光灯:激活时冻结光区内的水 ---
  for (var sp = 0; sp < lv.spots.length; sp++) {
    var spot = lv.spots[sp];
    var act = false;
    for (var s4 = 0; s4 < lv.plates.length; s4++) if (sourceActive(lv.plates[s4], spot.id)) act = true;
    for (var s5 = 0; s5 < lv.levers.length; s5++) if (sourceActive(lv.levers[s5], spot.id)) act = true;
    if (act !== spot.active) {
      sfx.freeze();
      spot.glow = 1;
    }
    spot.active = act;
    spot.glow = Math.max(0, spot.glow - dt * 2);
    var z = spot.zone;
    for (var ty = z[1]; ty < z[1] + z[3]; ty++) {
      for (var tx = z[0]; tx < z[0] + z[2]; tx++) {
        var key = tx + ',' + ty;
        if (act) {
          // 直接冻结:冻结冰面为无条件实体,泡在水里的玩家在下面统一托出
          if (tileAt(tx, ty) === T_WATER) lv.frozen[key] = 1;
        } else {
          delete lv.frozen[key];
        }
      }
    }
    // 冻结瞬间:把泡在水里的沧海侧玩家托上冰面(防夹死;红莲侧在水中早已判负)
    if (act) {
      for (var pj = 0; pj < players.length; pj++) {
        var pp = players[pj];
        if (!pp.alive || pp.side !== 'water') continue;
        var pcx = Math.floor((pp.x + pp.w / 2) / T), pcy = Math.floor((pp.y + pp.h / 2) / T);
        if (tileAt(pcx, pcy) === T_WATER) {
          pp.y = z[1] * T - pp.h - 0.01;
          pp.vy = Math.min(pp.vy, 0);
          pp.inLiquid = false;
          spawnBurst(pp.x + pp.w / 2, pp.y + pp.h, '#bfe8ff', 12, 100);
        }
      }
    }
  }

  // --- 重建动态实心集合(桥 + 关闭的门),带防夹 ---
  lv.solid = {};
  for (var br2 = 0; br2 < lv.bridges.length; br2++) {
    var b2 = lv.bridges[br2];
    if (!b2.on) continue;
    for (var t2 = 0; t2 < b2.tiles.length; t2++) {
      var k2 = b2.tiles[t2][0] + ',' + b2.tiles[t2][1];
      lv.solid[k2] = 1;
    }
  }
  for (var d2 = 0; d2 < lv.doors.length; d2++) {
    var dr2 = lv.doors[d2];
    if (dr2.open) continue;
    for (var yy = dr2.y; yy < dr2.y + dr2.h; yy++) {
      var k3 = dr2.x + ',' + yy;
      lv.solid[k3] = 1;
    }
  }
}

/* ============================== 8. 粒子 ============================== */
var parts = [];
function spawnBurst(x, y, color, n, spd) {
  for (var i = 0; i < n; i++) {
    var a = Math.random() * Math.PI * 2, v = spd * (0.4 + Math.random() * 0.8);
    parts.push({
      x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40,
      life: 0.5 + Math.random() * 0.5, max: 1, color: color, size: 2 + Math.random() * 3, grav: 420
    });
  }
}
function spawnConfetti() {
  var cols = [MEMBERS[PARTNERS.fire].color, MEMBERS[PARTNERS.water].color, '#ffd75e', '#7de0d8', '#ffffff'];
  parts.push({
    x: Math.random() * W, y: -10,
    vx: (Math.random() - 0.5) * 40, vy: 60 + Math.random() * 60,
    life: 5, max: 5, color: cols[Math.floor(Math.random() * cols.length)],
    size: 3 + Math.random() * 3, grav: 8, conf: true
  });
}
function updateParticles(dt) {
  for (var i = parts.length - 1; i >= 0; i--) {
    var p = parts[i];
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vy += p.grav * dt;
    p.life -= dt;
    if (p.conf && p.y > H + 10) p.life = 0;
    if (p.life <= 0) parts.splice(i, 1);
  }
}
function drawParticles() {
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i];
    ctx.globalAlpha = p.conf ? 0.85 : clamp(p.life / 0.5, 0, 1);
    ctx.fillStyle = p.color;
    if (p.conf) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.x * 0.05 + time * 2);
      ctx.fillRect(-p.size / 2, -p.size, p.size, p.size * 2);
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * clamp(p.life, 0, 1), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

/* ============================== 9. 渲染 ============================== */
// --- 背景舞台:幕布 + 顶部灯带 ---
function drawBackground() {
  var g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#241a3d');
  g.addColorStop(0.55, '#1a1230');
  g.addColorStop(1, '#120d20');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // 顶部灯带
  ctx.fillStyle = 'rgba(255,215,94,0.12)';
  ctx.fillRect(0, 0, W, 26);
  for (var i = 0; i < 15; i++) {
    var x = 32 + i * 64;
    var flick = 0.55 + 0.45 * Math.sin(time * 3 + i * 1.7);
    ctx.fillStyle = 'rgba(255,225,130,' + (0.35 + 0.3 * flick).toFixed(3) + ')';
    ctx.beginPath(); ctx.arc(x, 13, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,225,130,' + (0.05 * flick).toFixed(3) + ')';
    ctx.beginPath(); ctx.arc(x, 13, 18, 0, Math.PI * 2); ctx.fill();
  }
  // 左右侧幕
  for (var s = 0; s < 2; s++) {
    var sx = s === 0 ? 0 : W - 26;
    var sg = ctx.createLinearGradient(sx, 0, sx + 26, 0);
    if (s === 0) { sg.addColorStop(0, '#5e1430'); sg.addColorStop(1, 'rgba(94,20,48,0)'); }
    else { sg.addColorStop(0, 'rgba(94,20,48,0)'); sg.addColorStop(1, '#5e1430'); }
    ctx.fillStyle = sg;
    ctx.fillRect(sx, 0, 26, H);
  }
  // 远处观众席光点
  for (var r = 0; r < 26; r++) {
    var px = (r * 137.5 + 40) % W, py = 60 + (r * 83.3) % (H - 120);
    ctx.fillStyle = 'rgba(255,255,255,' + (0.03 + 0.025 * Math.sin(time * 2 + r)).toFixed(3) + ')';
    ctx.fillRect(px, py, 2, 2);
  }
}

// --- 瓦片 ---
function drawTiles() {
  for (var y = 0; y < ROWS; y++) {
    for (var x = 0; x < COLS; x++) {
      var t = lv.grid[y][x];
      var px = x * T, py = y * T;
      if (t === T_SOLID) {
        // 舞台地板砖
        ctx.fillStyle = '#3b2c58';
        ctx.fillRect(px, py, T, T);
        ctx.fillStyle = '#4d3a72';
        ctx.fillRect(px + 1, py + 1, T - 2, 4);
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fillRect(px, py + T - 3, T, 3);
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.strokeRect(px + 0.5, py + 0.5, T - 1, T - 1);
      } else if (t === T_ONEWAY) {
        // 单向平台:薄板
        ctx.fillStyle = '#8a6fc0';
        ctx.fillRect(px, py, T, 8);
        ctx.fillStyle = '#b79ae8';
        ctx.fillRect(px, py, T, 3);
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fillRect(px + 3, py + 3, 4, 2);
        ctx.fillRect(px + T - 7, py + 3, 4, 2);
      } else if (t === T_FIRE || t === T_WATER || t === T_VOID) {
        drawLiquid(x, y, t);
      }
    }
  }
  // 冻结冰砖(聚光灯产物)
  for (var key in lv.frozen) {
    var k = key.split(',');
    drawIce(parseInt(k[0], 10), parseInt(k[1], 10));
  }
}

function drawLiquid(x, y, t) {
  var px = x * T, py = y * T;
  var c1, c2, surface;
  if (t === T_FIRE) { c1 = '#ff5a3c'; c2 = '#a32213'; surface = '#ffb08a'; }
  else if (t === T_WATER) { c1 = '#3ca0ff'; c2 = '#134a9e'; surface = '#a8d8ff'; }
  else { c1 = '#5fd35f'; c2 = '#1e7a2e'; surface = '#c2f5b8'; }
  var grad = ctx.createLinearGradient(0, py, 0, py + T);
  grad.addColorStop(0, c1); grad.addColorStop(1, c2);
  ctx.fillStyle = grad;
  ctx.fillRect(px, py, T, T);
  // 液面波光(仅表面格:上方不是同类液体)
  if (tileAt(x, y - 1) !== t) {
    var wave = Math.sin(time * 4 + x * 1.3) * 2;
    ctx.fillStyle = surface;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(px, py + 2 + wave, T, 3);
    ctx.globalAlpha = 0.3;
    ctx.fillRect(px, py + 6 + wave, T, 2);
    ctx.globalAlpha = 1;
  }
  // 气泡
  var seed = (x * 7 + y * 13);
  if ((seed + Math.floor(time * 2)) % 5 === 0) {
    var bx = px + 6 + (seed % 20), by = py + T - 6 - ((time * 30 + seed * 9) % (T - 8));
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.arc(bx, by, 1.6, 0, Math.PI * 2); ctx.fill();
  }
  // 虚无液:骷髅警示纹
  if (t === T_VOID && (x + y) % 2 === 0) {
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(px + 8, py + 12, 4, 4);
    ctx.fillRect(px + 20, py + 18, 4, 4);
  }
}

function drawIce(x, y) {
  var px = x * T, py = y * T;
  var grad = ctx.createLinearGradient(0, py, 0, py + T);
  grad.addColorStop(0, '#dff4ff'); grad.addColorStop(1, '#8ec9ee');
  ctx.fillStyle = grad;
  ctx.fillRect(px, py, T, T);
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.strokeRect(px + 1.5, py + 1.5, T - 3, T - 3);
  // 霜纹
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.beginPath();
  ctx.moveTo(px + 5, py + T - 6); ctx.lineTo(px + T - 8, py + 6);
  ctx.moveTo(px + 6, py + 10); ctx.lineTo(px + 16, py + T - 8);
  ctx.stroke();
}

// --- 机关 ---
function drawMechs() {
  var players = [lv.p1, lv.p2];

  // 红蓝桥
  for (var i = 0; i < lv.bridges.length; i++) {
    var br = lv.bridges[i];
    var col = br.group === 0 ? MEMBERS[PARTNERS.fire].color : MEMBERS[PARTNERS.water].color;
    for (var j = 0; j < br.tiles.length; j++) {
      var tx = br.tiles[j][0], ty = br.tiles[j][1];
      var px = tx * T, py = ty * T;
      if (br.on) {
        ctx.fillStyle = col;
        ctx.globalAlpha = 0.85;
        ctx.fillRect(px, py + 4, T, T - 12);
        ctx.globalAlpha = 1;
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillRect(px, py + 4, T, 3);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        for (var r = 0; r < 3; r++) ctx.fillRect(px + 5 + r * 10, py + T / 2, 2, 2);
      } else {
        ctx.strokeStyle = col;
        ctx.globalAlpha = 0.28;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(px + 2.5, py + 6.5, T - 5, T - 15);
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }
    }
  }

  // 门(墙体门洞)
  for (var d = 0; d < lv.doors.length; d++) {
    var dr = lv.doors[d];
    var px = dr.x * T, pyTop = dr.y * T, ph = dr.h * T;
    // 门框
    ctx.fillStyle = '#d8b24a';
    ctx.fillRect(px - 3, pyTop - 4, 4, ph + 4);
    ctx.fillRect(px + T - 1, pyTop - 4, 4, ph + 4);
    ctx.fillRect(px - 3, pyTop - 6, T + 6, 5);
    if (!dr.open) {
      var g = ctx.createLinearGradient(px, 0, px + T, 0);
      g.addColorStop(0, '#6b5390'); g.addColorStop(0.5, '#8a6fc0'); g.addColorStop(1, '#6b5390');
      ctx.fillStyle = g;
      ctx.fillRect(px + 1, pyTop, T - 2, ph);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(px + T / 2 - 1, pyTop, 2, ph);
      // 锁孔
      ctx.fillStyle = '#ffd75e';
      ctx.beginPath(); ctx.arc(px + T / 2, pyTop + ph / 2, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#6b5390';
      ctx.fillRect(px + T / 2 - 1.5, pyTop + ph / 2, 3, 8);
    } else {
      // 敞开:光柱
      var lg = ctx.createLinearGradient(0, pyTop, 0, pyTop + ph);
      lg.addColorStop(0, 'rgba(255,240,180,0.5)');
      lg.addColorStop(1, 'rgba(255,240,180,0.08)');
      ctx.fillStyle = lg;
      ctx.fillRect(px + 1, pyTop, T - 2, ph);
    }
  }

  // 压力踏板
  for (var p = 0; p < lv.plates.length; p++) {
    var pl = lv.plates[p];
    var px = pl.x * T, py = pl.y * T;
    var baseCol = pl.mode === 'once' ? '#7de0d8' : '#ffd75e';
    // 底座
    ctx.fillStyle = '#241a3d';
    ctx.fillRect(px + 4, py + T - 6, T - 8, 6);
    // 踏板(压下时下沉)
    var dy = pl.anim * 5;
    ctx.fillStyle = baseCol;
    ctx.globalAlpha = (pl.locked || pl.pressed) ? 1 : 0.75;
    ctx.fillRect(px + 3, py + T - 10 + dy, T - 6, 5);
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillRect(px + 5, py + T - 10 + dy, T - 10, 1.5);
    // once 锁定标记
    if (pl.mode === 'once' && pl.locked) {
      ctx.fillStyle = '#7de0d8';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText('✓', px + T / 2 - 4, py + T - 14);
    }
    // 指向提示(连接的目标)
    ctx.strokeStyle = baseCol;
    ctx.globalAlpha = 0.5;
    ctx.setLineDash([3, 3]);
    for (var t2 = 0; t2 < pl.targets.length; t2++) {
      var tgt = findMech(pl.targets[t2]);
      if (tgt && !tgt.open) {
        ctx.beginPath();
        ctx.moveTo(px + T / 2, py + T - 12);
        ctx.lineTo(tgt.x * T + T / 2, (tgt.y + (tgt.h || 1) * T) - T / 2);
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  // 拉杆
  for (var l = 0; l < lv.levers.length; l++) {
    var lvr = lv.levers[l];
    var px = lvr.x * T, py = lvr.y * T;
    ctx.fillStyle = '#241a3d';
    ctx.fillRect(px + 8, py + T - 6, T - 16, 6);
    // 杆(左右倾斜表示状态)
    var ang = lvr.state === 0 ? -0.6 : 0.6;
    ctx.save();
    ctx.translate(px + T / 2, py + T - 6);
    ctx.rotate(ang);
    ctx.fillStyle = '#c8bfe0';
    ctx.fillRect(-2, -20, 4, 20);
    ctx.fillStyle = '#ffd75e';
    ctx.beginPath(); ctx.arc(0, -21, 5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // 聚光灯
  for (var s = 0; s < lv.spots.length; s++) {
    var sp = lv.spots[s];
    var z = sp.zone;
    var cx = sp.x * T + T / 2, cy = sp.y * T + T / 2;
    var zcx = (z[0] + z[2] / 2) * T, zcy = (z[1] + z[3] / 2) * T;
    // 光束
    if (sp.active) {
      ctx.save();
      ctx.globalAlpha = 0.30 + 0.08 * Math.sin(time * 6);
      var bg = ctx.createLinearGradient(cx, cy, zcx, zcy);
      bg.addColorStop(0, 'rgba(200,240,255,0.95)');
      bg.addColorStop(1, 'rgba(140,200,255,0.3)');
      ctx.fillStyle = bg;
      var dx = zcx - cx, dyy = zcy - cy;
      var nx = -dyy, ny = dx;
      var nl = Math.sqrt(nx * nx + ny * ny);
      nx /= nl; ny /= nl;
      var w0 = 8, w1 = z[2] * T / 2;
      ctx.beginPath();
      ctx.moveTo(cx + nx * w0, cy + ny * w0);
      ctx.lineTo(zcx + nx * w1, zcy + ny * w1);
      ctx.lineTo(zcx - nx * w1, zcy - ny * w1);
      ctx.lineTo(cx - nx * w0, cy - ny * w0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      // 冻结区边框闪
      ctx.strokeStyle = 'rgba(190,235,255,' + (0.35 + 0.2 * Math.sin(time * 5)).toFixed(3) + ')';
      ctx.strokeRect(z[0] * T + 1, z[1] * T + 1, z[2] * T - 2, z[3] * T - 2);
    } else {
      ctx.strokeStyle = 'rgba(160,180,220,0.25)';
      ctx.setLineDash([5, 5]);
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(zcx, zcy); ctx.stroke();
      ctx.setLineDash([]);
    }
    // 灯体
    ctx.fillStyle = '#2c2044';
    ctx.beginPath(); ctx.arc(cx, cy, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = sp.active ? '#cfeeff' : '#565077';
    ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#d8b24a';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, 10, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 1;
  }

  // 风扇
  for (var f = 0; f < lv.fans.length; f++) {
    var fan = lv.fans[f];
    var fx = fan.x * T, fy = fan.y * T;
    // 底座
    ctx.fillStyle = '#2c2044';
    ctx.beginPath();
    ctx.moveTo(fx + 2, fy + T); ctx.lineTo(fx + T - 2, fy + T);
    ctx.lineTo(fx + T - 7, fy + 12); ctx.lineTo(fx + 7, fy + 12);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#565077';
    ctx.fillRect(fx + 5, fy + 8, T - 10, 5);
    // 旋转扇叶
    ctx.save();
    ctx.translate(fx + T / 2, fy + 10);
    ctx.rotate(time * 14);
    ctx.fillStyle = '#a8d8ff';
    for (var bl = 0; bl < 3; bl++) {
      ctx.rotate(Math.PI * 2 / 3);
      ctx.beginPath();
      ctx.ellipse(0, -5, 3, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // 上升气流线
    var z = fan.zone;
    for (var w = 0; w < z[2] * 2; w++) {
      var wx = z[0] * T + (w + 0.5) * T / 2;
      var prog2 = ((time * 0.9 + w * 0.37) % 1);
      var wy = (z[1] + z[3]) * T - prog2 * z[3] * T;
      ctx.strokeStyle = 'rgba(168,216,255,' + (0.5 * (1 - prog2)).toFixed(3) + ')';
      ctx.beginPath();
      ctx.moveTo(wx + Math.sin(time * 5 + w) * 3, wy);
      ctx.lineTo(wx + Math.sin(time * 5 + w) * 3, wy - 9);
      ctx.stroke();
    }
  }

  // 音箱(可推箱子)
  for (var b = 0; b < lv.boxes.length; b++) {
    var bo = lv.boxes[b];
    var bx = bo.x, by = bo.y;
    ctx.fillStyle = '#191225';
    ctx.fillRect(bx, by, bo.w, bo.h);
    ctx.strokeStyle = '#565077';
    ctx.strokeRect(bx + 0.5, by + 0.5, bo.w - 1, bo.h - 1);
    // 提手
    ctx.strokeStyle = '#565077';
    ctx.beginPath();
    ctx.moveTo(bx + 8, by); ctx.lineTo(bx + 8, by - 4); ctx.lineTo(bx + 22, by - 4); ctx.lineTo(bx + 22, by);
    ctx.stroke();
    // 振膜
    ctx.fillStyle = '#3b2c58';
    ctx.beginPath(); ctx.arc(bx + 10, by + 19, 6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(bx + 10, by + 19, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#241a3d';
    ctx.fillRect(bx + 18, by + 8, 8, 14);
    // LED 随音乐闪
    var led = 0.5 + 0.5 * Math.sin(time * 8 + bx);
    ctx.fillStyle = 'rgba(255,215,94,' + (0.4 + 0.6 * led).toFixed(3) + ')';
    ctx.fillRect(bx + 20, by + 10, 4, 3);
    ctx.fillStyle = 'rgba(125,224,216,' + (0.4 + 0.6 * (1 - led)).toFixed(3) + ')';
    ctx.fillRect(bx + 20, by + 16, 4, 3);
  }
}

function findMech(id) {
  var all = lv.doors.concat(lv.spots, lv.levers, lv.plates);
  for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
  return null;
}

// --- 收集品 ---
function drawItems() {
  for (var i = 0; i < lv.items.length; i++) {
    var it = lv.items[i];
    if (it.taken) continue;
    var cx = it.x * T + T / 2, cy = it.y * T + T / 2 + Math.sin(time * 3 + i * 1.4) * 3;
    if (it.kind === 'note') {
      drawNote(cx, cy, C_NOTE);
    } else {
      drawStar(cx, cy, C_STAR);
    }
  }
}
function drawNote(cx, cy, color) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.ellipse(-2, 4, 4.4, 3.2, -0.4, 0, Math.PI * 2); ctx.fill();
  ctx.fillRect(1.6, -9, 2, 13);
  ctx.beginPath();
  ctx.moveTo(3.6, -9); ctx.quadraticCurveTo(9, -7, 7, -1);
  ctx.quadraticCurveTo(6.5, -5, 3.6, -5);
  ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 0.35;
  ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();
}
function drawStar(cx, cy, color) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(time * 0.8);
  ctx.fillStyle = color;
  ctx.beginPath();
  for (var i = 0; i < 8; i++) {
    var r = i % 2 === 0 ? 9 : 3.6;
    var a = i * Math.PI / 4 - Math.PI / 2;
    ctx[i === 0 ? 'moveTo' : 'lineTo'](Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 0.3;
  ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();
}

// --- 出口门(颜色跟随两位成员的应援色)---
function drawExits(readyF, readyW) {
  drawExitDoor(lv.exits.fire, MEMBERS[PARTNERS.fire].color, readyF, 'note');
  drawExitDoor(lv.exits.water, MEMBERS[PARTNERS.water].color, readyW, 'star');
}
function drawExitDoor(ex, color, ready, mark) {
  if (!ex) return;
  var px = ex.x * T, pyBot = (ex.y + 1) * T;
  var top = pyBot - 4 * T;
  // 门内光
  var g = ctx.createLinearGradient(0, top, 0, pyBot);
  g.addColorStop(0, ready ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.25)');
  g.addColorStop(1, color);
  ctx.fillStyle = g;
  ctx.globalAlpha = ready ? 0.95 : 0.55;
  ctx.fillRect(px + 3, top + 4, T - 6, 4 * T - 8);
  ctx.globalAlpha = 1;
  // 门框
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.strokeRect(px + 1.5, top + 2.5, T - 3, 4 * T - 5);
  // 拱顶
  ctx.beginPath();
  ctx.arc(px + T / 2, top + 4, T / 2 - 1, Math.PI, 0);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 1;
  // 标记
  if (mark === 'note') drawNote(px + T / 2, top - 10, C_NOTE);
  else drawStar(px + T / 2, top - 10, C_STAR);
  // 就位标记
  if (ready) {
    ctx.fillStyle = '#7de07d';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText('✓', px + T / 2 - 5, top + 22);
  }
}

/* --- Q 版角色绘制(按成员参数化:发色/发型剪影/应援色裙装)---
   x,y 为脚底中心;m 为 MEMBERS 成员;opts: {face, walk(相位), air, liquid, cheer(欢呼举手), highfive(击掌)}
   五种发型剪影:pony=贝拉高马尾 / buns=嘉然双丸子 / twintail=心宜双马尾 / long=乃琳长卷发 / straight=思诺长直发 */
function drawChibi(x, y, m, o) {
  var main = m.color, hairD = m.hairDark, style = m.hair;
  var skin = '#ffe3d0';
  var face = o.face || 1;
  var phase = o.walk || 0;
  var air = !!o.air;
  var cheer = !!o.cheer;
  var hi5 = !!o.highfive;
  var legSwing = air ? 2.5 : Math.sin(phase) * 3.5;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(face, 1);

  // 影子
  if (!air) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(0, 1, 9, 2.6, 0, 0, Math.PI * 2); ctx.fill();
  }

  // --- 腿 ---
  ctx.strokeStyle = '#3f3158';
  ctx.lineWidth = 3.6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-3, -10); ctx.lineTo(-3 - legSwing, air ? -4 : 0);
  ctx.moveTo(3, -10); ctx.lineTo(3 + legSwing, air ? -5 : 0);
  ctx.stroke();
  // 靴子
  ctx.fillStyle = '#2c2044';
  ctx.beginPath(); ctx.arc(-3 - legSwing, air ? -4 : -1, 2.4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(3 + legSwing, air ? -5 : -1, 2.4, 0, Math.PI * 2); ctx.fill();

  // --- 背发(发型剪影主体,画在身体后面)---
  if (style === 'straight') {
    // 思诺:长直发垂到裙摆
    ctx.fillStyle = hairD;
    ctx.beginPath();
    ctx.moveTo(-8, -30);
    ctx.quadraticCurveTo(-10, -14, -7, -5);
    ctx.lineTo(7, -5);
    ctx.quadraticCurveTo(10, -14, 8, -30);
    ctx.closePath(); ctx.fill();
  } else if (style === 'long') {
    // 乃琳:飘逸长卷发,下摆三段波浪
    ctx.fillStyle = hairD;
    ctx.beginPath();
    ctx.moveTo(-8.5, -30);
    ctx.quadraticCurveTo(-11.5, -16, -9, -6);
    ctx.quadraticCurveTo(-6.5, -1.5, -4.5, -6);
    ctx.quadraticCurveTo(-2.2, -1.5, 0, -6);
    ctx.quadraticCurveTo(2.2, -1.5, 4.5, -6);
    ctx.quadraticCurveTo(6.5, -1.5, 9, -6);
    ctx.quadraticCurveTo(11.5, -16, 8.5, -30);
    ctx.closePath(); ctx.fill();
  } else if (style === 'pony') {
    // 贝拉:高马尾,随步伐甩动
    ctx.save();
    ctx.translate(-6, -33);
    ctx.rotate(-0.55 + Math.sin(phase * 0.7) * 0.14);
    ctx.fillStyle = hairD;
    ctx.beginPath(); ctx.ellipse(0, 9, 3.8, 11, 0.18, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  } else if (style === 'twintail') {
    // 心宜:双马尾(后侧)
    ctx.fillStyle = hairD;
    ctx.beginPath(); ctx.ellipse(-9.5, -21 + Math.sin(phase * 0.7) * 1.2, 3.4, 8.5, 0.15, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(9.5, -21 - Math.sin(phase * 0.7) * 1.2, 3.4, 8.5, -0.15, 0, Math.PI * 2); ctx.fill();
  }
  // 嘉然(丸子头)无背发,丸子画在前发层

  // --- 身体(裙装)---
  ctx.fillStyle = main;
  ctx.beginPath();
  ctx.moveTo(-6.5, -22);
  ctx.lineTo(6.5, -22);
  ctx.lineTo(9, -8);
  ctx.lineTo(-9, -8);
  ctx.closePath(); ctx.fill();
  // 裙摆高光
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(-7, -10, 14, 2);
  // 衣领
  ctx.fillStyle = '#fff6fb';
  ctx.beginPath();
  ctx.moveTo(-3, -22); ctx.lineTo(0, -19); ctx.lineTo(3, -22);
  ctx.closePath(); ctx.fill();
  // 腰带
  ctx.fillStyle = 'rgba(255,215,94,0.9)';
  ctx.fillRect(-6, -17, 12, 2);

  // --- 手臂 ---
  ctx.strokeStyle = main;
  ctx.lineWidth = 3.2;
  var armSwing = air ? -2 : -legSwing * 0.8;
  ctx.beginPath();
  if (cheer) {
    ctx.moveTo(-6, -20); ctx.lineTo(-10, -30);
    ctx.moveTo(6, -20); ctx.lineTo(10, -30);
  } else if (hi5) {
    ctx.moveTo(6, -20); ctx.lineTo(13, -31);   // 内侧手高高举起,与搭档击掌
    ctx.moveTo(-6, -20); ctx.lineTo(-8 - armSwing, -12);
  } else {
    ctx.moveTo(-6, -20); ctx.lineTo(-8 - armSwing, -12);
    ctx.moveTo(6, -20); ctx.lineTo(8 + armSwing, -12);
  }
  ctx.stroke();
  // 手
  ctx.fillStyle = skin;
  if (cheer) {
    ctx.beginPath(); ctx.arc(-10, -30, 2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(10, -30, 2, 0, Math.PI * 2); ctx.fill();
  } else if (hi5) {
    ctx.beginPath(); ctx.arc(13, -31, 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(-8 - armSwing, -12, 1.8, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.beginPath(); ctx.arc(-8 - armSwing, -12, 1.8, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(8 + armSwing, -12, 1.8, 0, Math.PI * 2); ctx.fill();
  }

  // --- 头 ---
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.arc(0, -27, 8.5, 0, Math.PI * 2); ctx.fill();

  // --- 前发 ---
  ctx.fillStyle = main;
  // 头顶
  ctx.beginPath();
  ctx.arc(0, -27.5, 8.8, Math.PI * 0.95, Math.PI * 2.05);
  ctx.closePath(); ctx.fill();
  // 刘海尖
  ctx.beginPath();
  ctx.moveTo(-8.5, -28);
  ctx.lineTo(-5.5, -24.5); ctx.lineTo(-2.5, -28.5);
  ctx.lineTo(0.5, -24.5); ctx.lineTo(3.5, -28.5);
  ctx.lineTo(6.5, -24.5); ctx.lineTo(8.5, -28);
  ctx.lineTo(8.5, -31); ctx.lineTo(-8.5, -31);
  ctx.closePath(); ctx.fill();
  if (style === 'twintail') {
    // 心宜:呆毛 + 前侧马尾
    ctx.strokeStyle = main;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -35);
    ctx.quadraticCurveTo(3, -40, 6, -38);
    ctx.stroke();
    ctx.fillStyle = main;
    ctx.beginPath(); ctx.ellipse(-8.8, -23, 3, 7, 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(8.8, -23, 3, 7, -0.2, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 1;
  } else if (style === 'pony') {
    // 贝拉:短侧发 + 金色发绳
    ctx.fillStyle = main;
    ctx.fillRect(-9.5, -30, 3, 9);
    ctx.fillRect(6.5, -30, 3, 9);
    ctx.fillStyle = '#ffd75e';
    ctx.beginPath(); ctx.arc(-6.2, -33.5, 2, 0, Math.PI * 2); ctx.fill();
  } else if (style === 'buns') {
    // 嘉然:双丸子头 + 短侧发
    ctx.fillStyle = main;
    ctx.fillRect(-9.5, -30, 3, 8);
    ctx.fillRect(6.5, -30, 3, 8);
    ctx.beginPath(); ctx.arc(-6.6, -34.2, 4.1, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(6.6, -34.2, 4.1, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = hairD;
    ctx.beginPath(); ctx.arc(-6.6, -34.2, 1.8, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(6.6, -34.2, 1.8, 0, Math.PI * 2); ctx.fill();
  } else if (style === 'long') {
    // 乃琳:长侧发 + 金色爱心发夹
    ctx.fillStyle = main;
    ctx.beginPath(); ctx.ellipse(-9, -21, 3.1, 9.5, 0.12, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(8.6, -21, 3.1, 9.5, -0.12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd75e';
    ctx.beginPath(); ctx.arc(7.2, -30.2, 1.4, 0, Math.PI * 2); ctx.arc(9.6, -30.2, 1.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(5.9, -29.6); ctx.lineTo(10.9, -29.6); ctx.lineTo(8.4, -26.4); ctx.closePath(); ctx.fill();
  } else {
    // 思诺:前侧垂发 + 星星发饰
    ctx.fillStyle = main;
    ctx.fillRect(-9.5, -30, 3.5, 18);
    ctx.fillRect(6, -30, 3.5, 18);
    ctx.fillStyle = '#ffd75e';
    ctx.beginPath(); ctx.arc(7.8, -31, 1.8, 0, Math.PI * 2); ctx.fill();
  }

  // --- 表情 ---
  ctx.fillStyle = '#2a1e3e';
  var ex = 1.8;
  ctx.beginPath(); ctx.arc(-ex + 1, -26.5, 1.25, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(ex + 1, -26.5, 1.25, 0, Math.PI * 2); ctx.fill();
  // 腮红
  ctx.fillStyle = 'rgba(255,120,150,0.45)';
  ctx.beginPath(); ctx.arc(-4.6, -24.2, 1.7, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(6.2, -24.2, 1.7, 0, Math.PI * 2); ctx.fill();
  // 微笑
  ctx.strokeStyle = '#2a1e3e';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(1, -23.8, 1.8, 0.15, Math.PI - 0.15); ctx.stroke();

  ctx.restore();
}

// --- 玩家 ---
function drawPlayers() {
  var ps = [lv.p1, lv.p2];
  for (var i = 0; i < 2; i++) {
    var p = ps[i];
    if (!p.alive) continue;
    var fx = p.x + p.w / 2, fy = p.y + p.h;
    drawChibi(fx, fy + (p.inLiquid ? 2 : 0), p.member, {
      face: p.face,
      walk: p.walkT,
      air: !p.onGround && !p.inLiquid,
      liquid: p.inLiquid
    });
    // 开场横幅期间在头顶亮出成员名,方便认人
    if (bannerT < 1.8) {
      ctx.font = 'bold 12px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = p.member.color;
      ctx.fillText(p.member.name, fx, fy - 42);
      ctx.textAlign = 'left';
    }
    // 浸入液体:叠一层液面
    if (p.inLiquid) {
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = p.side === 'fire' ? C_FIRE : C_WATER;
      ctx.fillRect(p.x - 2, p.y + p.h - 9, p.w + 4, 9);
      ctx.globalAlpha = 1;
    }
  }
}

// --- 阿草教学牌 ---
var ACAO = ['acao_kaixin', 'acao_yiwen', 'acao_kunrao', 'acao_aixin', 'acao_keai', 'acao_guile', 'acao_jingxia', 'acao_shuijiao', 'acao_liuhan'];
var IMG = {};
ACAO.forEach(function (n) {
  var im = new Image();
  im.src = 'assets/' + n + '.png';
  IMG[n] = im;
});
var LOGO_IMG = new Image();
LOGO_IMG.src = 'assets/asoul_logo.png';
// 成员立绘/表情包预载(搭档卡片、结算小像、结局相框用)
Object.keys(MEMBERS).forEach(function (id) {
  MEMBERS[id].portrait.forEach(function (f, i) {
    var im = new Image();
    im.src = 'assets/' + f;
    IMG['pt_' + id + '_' + i] = im;
  });
});
function ptImg(id, i) { return IMG['pt_' + id + '_' + i]; }
// 带白底相框的小立绘(表情包多为透明底/白底,统一卡片观感)
function drawPortraitFrame(im, x, y, size, color) {
  if (!im || !im.complete) return;
  ctx.fillStyle = '#fdf6ff';
  ctx.fillRect(x - 3, y - 3, size + 6, size + 6);
  ctx.drawImage(im, x, y, size, size);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.strokeRect(x - 3.5, y - 3.5, size + 7, size + 7);
  ctx.lineWidth = 1;
}

function drawTips() {
  var tips = lv.def.tips || [];
  for (var i = 0; i < tips.length; i++) {
    var tp = tips[i];
    var cx = tp.x * T, cy = tp.y * T + Math.sin(time * 2 + i * 1.3) * 3; // 悬浮精灵轻轻上下漂
    // 悬浮光圈
    var halo = ctx.createRadialGradient(cx, cy - 17, 4, cx, cy - 17, 26);
    halo.addColorStop(0, 'rgba(125,224,123,0.28)');
    halo.addColorStop(1, 'rgba(125,224,123,0)');
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(cx, cy - 17, 26, 0, Math.PI * 2); ctx.fill();
    // 阿草
    var im = IMG[tp.sticker];
    if (im && im.complete) {
      ctx.drawImage(im, cx - 17, cy - 34, 34, 34);
    } else {
      ctx.fillStyle = '#7de07d';
      ctx.beginPath(); ctx.arc(cx, cy - 17, 12, 0, Math.PI * 2); ctx.fill();
    }
    // 靠近弹出气泡
    var near = false;
    var ps = [lv.p1, lv.p2];
    for (var j = 0; j < 2; j++) {
      var px2 = ps[j].x + ps[j].w / 2, py2 = ps[j].y + ps[j].h / 2;
      var dist = Math.hypot(px2 - cx, py2 - (cy - 10));
      if (dist < T * 3.4) near = true;
    }
    if (near) {
      // {F}/{W} 代号替换为当前搭档两位成员的名字
      var lines = tp.text.replace(/\{F\}/g, MEMBERS[PARTNERS.fire].name)
                         .replace(/\{W\}/g, MEMBERS[PARTNERS.water].name)
                         .split('\n');
      ctx.font = '12.5px "Microsoft YaHei", sans-serif';
      var wMax = 0;
      for (var l = 0; l < lines.length; l++) wMax = Math.max(wMax, ctx.measureText(lines[l]).width);
      var bw = wMax + 20, bh = lines.length * 17 + 12;
      var bx = clamp(cx - bw / 2, 6, W - bw - 6);
      var by = cy - 42 - bh;
      // 气泡框
      ctx.fillStyle = 'rgba(253,250,255,0.94)';
      roundRect(bx, by, bw, bh, 8);
      ctx.fill();
      ctx.strokeStyle = '#b893ff';
      ctx.stroke();
      // 小三角
      ctx.fillStyle = 'rgba(253,250,255,0.94)';
      ctx.beginPath();
      ctx.moveTo(cx - 5, by + bh); ctx.lineTo(cx + 5, by + bh); ctx.lineTo(cx, by + bh + 7);
      ctx.closePath(); ctx.fill();
      // 文字
      ctx.fillStyle = '#3a2d55';
      for (var l2 = 0; l2 < lines.length; l2++) {
        ctx.fillText(lines[l2], bx + 10, by + 17 + l2 * 17);
      }
    }
  }
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

// --- HUD ---
function drawHUD() {
  ctx.fillStyle = 'rgba(10,6,20,0.55)';
  ctx.fillRect(0, 0, W, 30);
  ctx.font = 'bold 14px "Microsoft YaHei", sans-serif';
  ctx.fillStyle = '#fdf6ff';
  ctx.textAlign = 'left';
  ctx.fillText('LV.' + (lvIdx + 1) + ' ' + lv.def.name, 12, 20);
  // 当前搭档署名(应援色)
  var mF = MEMBERS[PARTNERS.fire], mW = MEMBERS[PARTNERS.water];
  ctx.font = '12px "Microsoft YaHei", sans-serif';
  ctx.fillStyle = mF.color;
  ctx.fillText(mF.name, 190, 20);
  ctx.fillStyle = '#9d8fc0';
  ctx.fillText('&', 190 + ctx.measureText(mF.name).width + 5, 20);
  ctx.fillStyle = mW.color;
  ctx.fillText(mW.name, 190 + ctx.measureText(mF.name).width + 19, 20);
  ctx.font = 'bold 14px "Microsoft YaHei", sans-serif';
  // 收集计数
  var nGot = 0, nAll = 0, sGot = 0, sAll = 0;
  for (var i = 0; i < lv.items.length; i++) {
    var it = lv.items[i];
    if (it.kind === 'note') { nAll++; if (it.taken) nGot++; }
    else { sAll++; if (it.taken) sGot++; }
  }
  ctx.textAlign = 'center';
  drawNote(W / 2 - 60, 14, C_NOTE);
  ctx.fillStyle = nGot === nAll ? '#ffd75e' : '#ffb3a8';
  ctx.fillText(nGot + '/' + nAll, W / 2 - 40, 20);
  drawStar(W / 2 + 8, 14, C_STAR);
  ctx.fillStyle = sGot === sAll ? '#ffd75e' : '#a8d4ff';
  ctx.fillText(sGot + '/' + sAll, W / 2 + 28, 20);
  // 右侧按键提示
  ctx.font = '12px "Microsoft YaHei", sans-serif';
  ctx.fillStyle = '#9d8fc0';
  ctx.textAlign = 'right';
  ctx.fillText((muted ? '♪已静音' : '♪') + '  P暂停  R重开', W - 12, 20);
  ctx.textAlign = 'left';
}

// --- 开场横幅 ---
function drawBanner() {
  if (bannerT > 1.6) return;
  var a = bannerT < 0.25 ? bannerT / 0.25 : (bannerT > 1.25 ? (1.6 - bannerT) / 0.35 : 1);
  ctx.globalAlpha = clamp(a, 0, 1);
  ctx.fillStyle = 'rgba(10,6,20,0.6)';
  ctx.fillRect(0, H / 2 - 64, W, 108);
  var g = ctx.createLinearGradient(0, H / 2 - 64, W, H / 2 + 44);
  g.addColorStop(0, 'rgba(201,55,115,0.5)');
  g.addColorStop(1, 'rgba(114,82,192,0.5)');
  ctx.fillStyle = g;
  ctx.fillRect(0, H / 2 - 64, W, 4);
  ctx.fillRect(0, H / 2 + 40, W, 4);
  ctx.textAlign = 'center';
  ctx.font = 'bold 34px "Microsoft YaHei", sans-serif';
  ctx.fillStyle = '#fdf6ff';
  ctx.fillText('第 ' + (lvIdx + 1) + ' 关 · ' + lv.def.name, W / 2, H / 2 - 8);
  ctx.font = '16px "Microsoft YaHei", sans-serif';
  ctx.fillStyle = '#c9b8f2';
  ctx.fillText(lv.def.sub, W / 2, H / 2 + 24);
  ctx.textAlign = 'left';
  ctx.globalAlpha = 1;
}

// --- 过关画面 ---
function drawWin() {
  ctx.fillStyle = 'rgba(10,6,20,0.72)';
  ctx.fillRect(0, 0, W, H);
  var pw = 460, ph = 300, px = (W - pw) / 2, py = (H - ph) / 2;
  ctx.fillStyle = '#241a3d';
  roundRect(px, py, pw, ph, 16); ctx.fill();
  ctx.strokeStyle = '#d8b24a'; ctx.stroke();
  ctx.textAlign = 'center';
  ctx.font = 'bold 30px "Microsoft YaHei", sans-serif';
  ctx.fillStyle = '#ffd75e';
  ctx.fillText('舞 台 达 成 !', W / 2, py + 52);
  // 两位成员署名(应援色)+ 结算小像
  var mF = MEMBERS[PARTNERS.fire], mW = MEMBERS[PARTNERS.water];
  ctx.font = 'bold 17px "Microsoft YaHei", sans-serif';
  var wF = ctx.measureText(mF.name).width, wAmp = ctx.measureText(' & ').width;
  var nx = W / 2 - (wF + wAmp + ctx.measureText(mW.name).width) / 2;
  ctx.textAlign = 'left';
  ctx.fillStyle = mF.color; ctx.fillText(mF.name, nx, py + 80);
  ctx.fillStyle = '#e8dcef'; ctx.fillText(' & ', nx + wF, py + 80);
  ctx.fillStyle = mW.color; ctx.fillText(mW.name, nx + wF + wAmp, py + 80);
  ctx.textAlign = 'center';
  drawPortraitFrame(ptImg(PARTNERS.fire, 2), px + 18, py + 18, 52, mF.color);
  drawPortraitFrame(ptImg(PARTNERS.water, 2), px + pw - 70, py + 18, 52, mW.color);
  ctx.font = '15px "Microsoft YaHei", sans-serif';
  ctx.fillStyle = '#c9b8f2';
  ctx.fillText('第 ' + (lvIdx + 1) + ' 关 · ' + lv.def.name, W / 2, py + 104);
  // 星星逐颗弹出
  for (var i = 0; i < 3; i++) {
    var t = clamp((winT - 0.25 - i * 0.3) / 0.25, 0, 1);
    if (t <= 0) continue;
    var scale = 0.3 + 0.7 * (1 - Math.pow(1 - t, 2));
    var on = i < winStars;
    ctx.save();
    ctx.translate(W / 2 + (i - 1) * 64, py + 140);
    ctx.scale(scale, scale);
    ctx.globalAlpha = t;
    drawStar(0, 0, on ? '#ffd75e' : '#4d4270');
    ctx.restore();
    ctx.globalAlpha = 1;
    if (on && t >= 1 && !lv['starSfx' + i]) {
      lv['starSfx' + i] = true;
      sfx.star();
    }
  }
  // 收集详情
  var nGot = 0, nAll = 0, sGot = 0, sAll = 0;
  for (var j = 0; j < lv.items.length; j++) {
    var it = lv.items[j];
    if (it.kind === 'note') { nAll++; if (it.taken) nGot++; }
    else { sAll++; if (it.taken) sGot++; }
  }
  ctx.font = '15px "Microsoft YaHei", sans-serif';
  ctx.fillStyle = '#e8dcef';
  ctx.fillText('玫红音符 ' + nGot + '/' + nAll + '    紫色星光 ' + sGot + '/' + sAll, W / 2, py + 202);
  ctx.fillStyle = '#9d8fc0';
  var isLast = lvIdx === 7, isHidden = lvIdx === 8;
  var hintText = isLast ? (totalStars() >= STAR_UNLOCK ? '安可舞台已解锁!按 Enter 观看结局' : '按 Enter 观看结局(累计 ' + totalStars() + '/' + STAR_UNLOCK + ' 星,集满解锁隐藏关)') : (isHidden ? '按 Enter 返回选关' : '按 Enter 下一关 · R 重玩 · Esc 选关');
  ctx.fillText(hintText, W / 2, py + 250);
  ctx.textAlign = 'left';
}

// --- 结局画面(两位成员走向中央击掌 + 「闪耀舞台开演」)---
function drawEnding() {
  var t = endingT;
  // 背景
  var g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#3d1030'); g.addColorStop(1, '#1a1230');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  var mF = MEMBERS[PARTNERS.fire], mW = MEMBERS[PARTNERS.water];
  // 两道追光(成员应援色)
  for (var i = 0; i < 2; i++) {
    var sx = i === 0 ? W * 0.3 : W * 0.7;
    ctx.save();
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = i === 0 ? mF.color : mW.color;
    ctx.beginPath();
    ctx.moveTo(sx - 14, 0); ctx.lineTo(sx + 14, 0);
    ctx.lineTo(sx + 90, H); ctx.lineTo(sx - 90, H);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  // logo
  if (LOGO_IMG.complete) ctx.drawImage(LOGO_IMG, W / 2 - 40, 26, 80, 80);
  // 两人走向中央,会师击掌
  var walk = clamp(t / 1.4, 0, 1);
  var off = lerp(280, 22, walk);
  var groundY = H * 0.68;
  drawChibi(W / 2 - off, groundY, mF, { face: 1, walk: t * 9, highfive: walk >= 1 });
  drawChibi(W / 2 + off, groundY, mW, { face: -1, walk: t * 9, highfive: walk >= 1 });
  // 击掌星爆
  if (walk >= 1 && t < 1.6) {
    if (Math.random() < 0.5) spawnBurst(W / 2, groundY - 40, '#ffd75e', 3, 150);
  }
  if (walk >= 1 && endingT < 1.65 && endingT > 1.55) {
    ctx.fillStyle = 'rgba(255,255,255,' + (1.65 - endingT).toFixed(2) + ')';
    ctx.fillRect(0, 0, W, H);
  }
  // 文案
  if (t > 1.8) {
    ctx.textAlign = 'center';
    ctx.globalAlpha = clamp((t - 1.8) / 0.6, 0, 1);
    ctx.font = 'bold 40px "Microsoft YaHei", sans-serif';
    var grad = ctx.createLinearGradient(W / 2 - 200, 0, W / 2 + 200, 0);
    grad.addColorStop(0, mF.color); grad.addColorStop(1, mW.color);
    ctx.fillStyle = grad;
    ctx.fillText(endingMode === 0 ? '闪 耀 舞 台 ,正 式 开 演 !' : '安 可 舞 台 ,完 美 谢 幕 !', W / 2, H * 0.30);
    // 成员相框立绘
    drawPortraitFrame(ptImg(PARTNERS.fire, 3), W / 2 - 344, H * 0.30 - 42, 68, mF.color);
    drawPortraitFrame(ptImg(PARTNERS.water, 3), W / 2 + 276, H * 0.30 - 42, 68, mW.color);
    ctx.font = '17px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#e8dcef';
    if (endingMode === 0) {
      var unlockMsg = totalStars() >= STAR_UNLOCK ? '✨ 隐藏关「安可舞台」已解锁,选关界面见!' : '累计 ' + totalStars() + '/' + STAR_UNLOCK + ' 星可解锁隐藏关「安可舞台」';
      ctx.fillText(unlockMsg, W / 2, H * 0.30 + 44);
    } else {
      ctx.fillText(mF.name + ' & ' + mW.name + ' · 闪耀双人舞台 · 感谢观看', W / 2, H * 0.30 + 44);
      ctx.fillText('冰与火的双重奏,今天也响彻整个舞台~', W / 2, H * 0.30 + 70);
    }
    ctx.globalAlpha = 1;
    ctx.font = '14px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#9d8fc0';
    ctx.fillText('按 Enter 返回选关', W / 2, H - 40);
    ctx.textAlign = 'left';
  }
  // 彩带
  if (Math.random() < 0.3) spawnConfetti();
}

// --- 菜单背景(canvas 上仍在动,被 DOM 覆盖但四周可见)---
function drawMenuBg() {
  drawBackground();
  // 简单舞台
  ctx.fillStyle = '#241a3d';
  ctx.fillRect(0, H - 120, W, 120);
  ctx.fillStyle = '#4d3a72';
  ctx.fillRect(0, H - 120, W, 5);
  drawChibi(W / 2 - 90, H - 120, MEMBERS[PARTNERS.fire], { face: 1, walk: time * 4 });
  drawChibi(W / 2 + 90, H - 120, MEMBERS[PARTNERS.water], { face: -1, walk: time * 4 + 2 });
  if (Math.random() < 0.12) spawnConfetti();
  updateParticles(1 / 60);
  drawParticles();
}

// --- 失败提示 ---
function drawDying() {
  ctx.fillStyle = 'rgba(120,20,40,0.25)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.font = 'bold 26px "Microsoft YaHei", sans-serif';
  ctx.fillStyle = '#ff8fa8';
  ctx.fillText('演出事故!', W / 2, H / 2 - 60);
  ctx.font = '16px "Microsoft YaHei", sans-serif';
  ctx.fillStyle = '#e8dcef';
  var im = IMG['acao_guile'];
  if (im && im.complete) ctx.drawImage(im, W / 2 - 32, H / 2 - 40, 64, 64);
  ctx.fillText('重来一次,相信彼此!', W / 2, H / 2 + 56);
  ctx.textAlign = 'left';
}

/* ============================== 主更新与渲染 ============================== */
function update(dt) {
  bannerT += dt;
  updateMechs(dt);
  updatePlayer(lv.p1, dt);
  updatePlayer(lv.p2, dt);
  for (var i = 0; i < lv.boxes.length; i++) updateBox(lv.boxes[i], dt);
  updateParticles(dt);

  // 过关判定:两人各站上自己应援色的出口门(红莲侧→X,沧海侧→Y)
  var readyF = false, readyW = false;
  var p1 = lv.p1, p2 = lv.p2;
  if (p1.alive) {
    var exF = lv.exits.fire;
    var rF = { x: exF.x * T + 3, y: (exF.y - 3) * T, w: T - 6, h: 4 * T };
    readyF = p1.x + p1.w / 2 > rF.x && p1.x + p1.w / 2 < rF.x + rF.w && p1.y + p1.h > rF.y && p1.y < rF.y + rF.h;
  }
  if (p2.alive) {
    var exW = lv.exits.water;
    var rW = { x: exW.x * T + 3, y: (exW.y - 3) * T, w: T - 6, h: 4 * T };
    readyW = p2.x + p2.w / 2 > rW.x && p2.x + p2.w / 2 < rW.x + rW.w && p2.y + p2.h > rW.y && p2.y < rW.y + rW.h;
  }
  exitReady = { f: readyF, w: readyW };
  if (readyF && readyW) {
    winTimer += dt;
    if (winTimer > 0.55) doWin();
  } else {
    winTimer = 0;
  }
}
var exitReady = { f: false, g: false };

function doWin() {
  // 计算星数:全收集 3 星,过半 2 星,过关 1 星
  var got = 0, all = lv.items.length;
  for (var i = 0; i < all; i++) if (lv.items[i].taken) got++;
  winStars = got === all ? 3 : (got >= Math.ceil(all / 2) ? 2 : 1);
  var key = String(lvIdx + 1);
  prog.stars[key] = Math.max(prog.stars[key] || 0, winStars);
  if (lvIdx + 2 > prog.unlocked) prog.unlocked = Math.min(lvIdx + 2, 9);
  if (totalStars() >= STAR_UNLOCK) prog.unlocked = 9;
  saveProg();
  state = 'win';
  winT = 0;
  lv.starSfx0 = lv.starSfx1 = lv.starSfx2 = false; // 结算星星音效标记
  sfx.win();
  spawnConfetti(); spawnConfetti();
}

function render() {
  if (state === 'menu') { drawMenuBg(); return; }
  if (state === 'ending') { drawEnding(); drawParticles(); return; }
  drawBackground();
  drawTiles();
  drawMechs();
  drawItems();
  drawExits(exitReady.f, exitReady.w);
  drawPlayers();
  drawTips();
  drawParticles();
  drawHUD();
  drawBanner();
  if (state === 'dying') drawDying();
  if (state === 'win') drawWin();
}

/* ============================== 10. 状态机与主循环 ============================== */
var state = 'menu';
var paused = false;

function startLevel(idx) {
  lvIdx = clamp(idx, 0, LEVELS.length - 1);
  resetLevel();
  paused = false;
  showScreen(null);
  sfx.click();
}

function onGlobalKey(code) {
  if (code === 'KeyM') {
    muted = !muted;
    try { localStorage.setItem('firewater_muted', muted ? '1' : '0'); } catch (e) {}
    return;
  }
  if (code === 'KeyP' || code === 'Escape') {
    if (state === 'play') {
      paused = !paused;
      showScreen(paused ? 'screen-pause' : null);
    } else if (state === 'win' && code === 'Escape') {
      state = 'menu'; paused = false;
      buildSelect(); showScreen('screen-select');
    }
    return;
  }
  if (code === 'KeyR') {
    if (state === 'play' || state === 'dying' || state === 'win' || paused) {
      resetLevel(); paused = false; showScreen(null);
    }
    return;
  }
  if (code === 'Enter') {
    if (state === 'win') {
      if (lvIdx === 7) {          // 第 8 关通关 → 结局
        endingMode = 0; state = 'ending'; endingT = 0; parts = [];
      } else if (lvIdx === 8) {   // 第 9 关通关 → 真结局
        endingMode = 1; state = 'ending'; endingT = 0; parts = [];
      } else {
        startLevel(lvIdx + 1);
      }
    } else if (state === 'ending') {
      state = 'menu'; parts = [];
      buildSelect(); showScreen('screen-select');
    }
  }
}

var last = 0;
function frame(ts) {
  requestAnimationFrame(frame);
  if (!last) last = ts;
  var dt = Math.min((ts - last) / 1000, 1 / 30);
  last = ts;
  time += dt;
  if (state === 'play' && !paused) {
    update(dt);
  } else if (state === 'dying') {
    updateParticles(dt);
    dieTimer -= dt;
    if (dieTimer <= 0) resetLevel();
  } else if (state === 'win') {
    winT += dt;
    updateParticles(dt);
  } else if (state === 'ending') {
    endingT += dt;
    updateParticles(dt);
  }
  render();
}
requestAnimationFrame(frame);

/* ============================== 11. DOM 菜单绑定 ============================== */
var screens = ['screen-main', 'screen-partner', 'screen-select', 'screen-help', 'screen-pause'];
function showScreen(id) {
  for (var i = 0; i < screens.length; i++) {
    document.getElementById(screens[i]).className = 'screen' + (screens[i] === id ? '' : ' hidden');
  }
  document.getElementById('overlay').style.pointerEvents = id ? 'auto' : 'none';
}

function buildSelect() {
  var grid = document.getElementById('level-grid');
  grid.innerHTML = '';
  var tipEl = document.getElementById('select-tip');
  var sum = totalStars();
  tipEl.textContent = '累计星数:' + sum + ' / ' + STAR_UNLOCK + '(隐藏关需集满)' ;
  for (var i = 0; i < LEVELS.length; i++) {
    (function (idx) {
      var def = LEVELS[idx];
      var cell = document.createElement('div');
      var locked, needLabel = '';
      if (idx === 8) {
        locked = totalStars() < STAR_UNLOCK;
        needLabel = locked ? '🔒 集满 ' + STAR_UNLOCK + ' 星解锁' : '✨ 隐藏关';
      } else {
        locked = (idx + 1) > prog.unlocked;
      }
      cell.className = 'lv-cell' + (locked ? ' locked' : '') + (idx === 8 ? ' hidden9' : '');
      var stars = prog.stars[String(idx + 1)] || 0;
      var starHtml = '';
      for (var s = 0; s < 3; s++) {
        starHtml += '<span class="' + (s < stars ? 'star-on' : 'star-off') + '">★</span>';
      }
      cell.innerHTML =
        '<div class="lv-no">STAGE ' + (idx + 1) + '</div>' +
        '<div class="lv-name">' + def.name + '</div>' +
        '<div class="lv-mech">' + (idx === 8 ? (locked ? '隐藏关' : def.sub) : def.sub) + '</div>' +
        '<div class="lv-stars">' + starHtml + '</div>' +
        (locked ? '<div class="lv-lock">🔒</div>' : '');
      if (!locked) {
        cell.onclick = function () { startLevel(idx); };
      }
      grid.appendChild(cell);
    })(i);
  }
}

/* ---------------- 搭档选择 ----------------
   红莲组选 1 人 + 沧海组选 1 人,共 3x2=6 种组合;
   默认高亮推荐「贝拉 & 乃琳」。组合差异只在表现层。 */
function buildPartnerCards(elId, ids, grp) {
  var box = document.getElementById(elId);
  box.innerHTML = '';
  ids.forEach(function (id) {
    var m = MEMBERS[id];
    var card = document.createElement('div');
    card.className = 'p-card' + (PARTNERS[grp] === id ? ' sel' : '');
    card.innerHTML =
      (RECOMMEND[grp] === id ? '<div class="p-reco">★ 推荐</div>' : '') +
      '<img class="p-img" src="assets/' + m.portrait[0] + '" alt="' + m.name + '">' +
      '<div class="p-name" style="color:' + m.color + '">' + m.name + '</div>' +
      '<div class="p-tag">' + m.title + '</div>' +
      '<div class="p-quote">“' + m.quote + '”</div>';
    card.onclick = function () {
      PARTNERS[grp] = id;
      sfx.click();
      buildPartnerCards('fire-cards', FIRE_IDS, 'fire');
      buildPartnerCards('water-cards', WATER_IDS, 'water');
      updateComboLine();
    };
    box.appendChild(card);
  });
}
function updateComboLine() {
  var f = MEMBERS[PARTNERS.fire], w = MEMBERS[PARTNERS.water];
  document.getElementById('combo-line').innerHTML =
    '<span style="color:' + f.color + '">' + f.name + '</span>' +
    '<span class="amp"> & </span>' +
    '<span style="color:' + w.color + '">' + w.name + '</span>';
  document.getElementById('combo-quote').textContent = '“' + f.quote + '”  ·  “' + w.quote + '”';
}
function buildPartner() {
  buildPartnerCards('fire-cards', FIRE_IDS, 'fire');
  buildPartnerCards('water-cards', WATER_IDS, 'water');
  updateComboLine();
}
// 主画面成员亮相条(点任意成员也能进入搭档选择)
function buildMemberStrip() {
  [['ms-fire', FIRE_IDS], ['ms-water', WATER_IDS]].forEach(function (pair) {
    var box = document.getElementById(pair[0]);
    box.innerHTML = '';
    pair[1].forEach(function (id) {
      var m = MEMBERS[id];
      var c = document.createElement('div');
      c.className = 'ms-card';
      c.innerHTML = '<img src="assets/' + m.portrait[0] + '" alt="' + m.name + '">' +
        '<div class="ms-name" style="color:' + m.color + '">' + m.name + '</div>';
      c.onclick = function () { ac(); sfx.click(); buildPartner(); showScreen('screen-partner'); };
      box.appendChild(c);
    });
  });
}
buildMemberStrip();

// 帮助页成员图鉴(全部 5 位成员 + 阿草)
function buildRoster() {
  var ul = document.getElementById('roster');
  ul.innerHTML = '';
  FIRE_IDS.concat(WATER_IDS).forEach(function (id) {
    var m = MEMBERS[id];
    var li = document.createElement('li');
    li.innerHTML =
      '<img src="assets/' + m.portrait[1] + '" alt="' + m.name + '">' +
      '<span class="r-name" style="color:' + m.color + '">' + m.name + '</span>' +
      '<span class="r-role">' + (m.group === 'fire' ? '红莲组 · ' : '沧海组 · ') + m.title + '</span>' +
      '<span class="r-meme">' + m.quote + '</span>';
    ul.appendChild(li);
  });
  var li2 = document.createElement('li');
  li2.innerHTML =
    '<img src="assets/acao_kaixin.png" alt="阿草">' +
    '<span class="r-name" style="color:#7de07d">阿草</span>' +
    '<span class="r-role">吉祥物 · 雪貂</span>' +
    '<span class="r-meme">第 1 关举牌教学,舞台幕后打杂</span>';
  ul.appendChild(li2);
}
buildRoster();

document.getElementById('btn-start').onclick = function () {
  ac(); sfx.click();
  buildPartner();
  showScreen('screen-partner');
};
document.getElementById('btn-partner-go').onclick = function () {
  ac(); sfx.click();
  rememberPartners();
  startLevel(Math.min(prog.unlocked, 9) - 1);
};
document.getElementById('btn-partner-back').onclick = function () { sfx.click(); showScreen('screen-main'); };
document.getElementById('btn-select').onclick = function () { ac(); sfx.click(); buildSelect(); showScreen('screen-select'); };
document.getElementById('btn-help').onclick = function () { ac(); sfx.click(); showScreen('screen-help'); };
document.getElementById('btn-select-back').onclick = function () { sfx.click(); showScreen('screen-main'); };
document.getElementById('btn-help-back').onclick = function () { sfx.click(); showScreen('screen-main'); };
document.getElementById('btn-resume').onclick = function () { sfx.click(); paused = false; showScreen(null); };
document.getElementById('btn-restart').onclick = function () { sfx.click(); resetLevel(); paused = false; showScreen(null); };
document.getElementById('btn-quit').onclick = function () { sfx.click(); paused = false; state = 'menu'; buildSelect(); showScreen('screen-select'); };
