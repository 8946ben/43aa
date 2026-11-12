/* ========================================================================
 * 一个魂 · 购物之夜 —— 主逻辑
 * 致敬经典《吃豆人》的 A-SOUL 同人小游戏，纯静态零依赖。
 *
 * 手感核心：
 *  - 实体永远朝“下一格心”移动，转向/吃豆/鬼决策只发生在格心；
 *  - 玩家转向预输入缓冲（want 方向一直保留到可用为止）；
 *  - 中途允许直接反向（经典吃豆人手感）。
 * ======================================================================== */

'use strict';

(function () {

  /* ============================ 基础常量 ============================ */
  var T = 26;                       // 瓦片尺寸（像素）
  var COLS = 21, ROWS = 23;         // 迷宫规格
  var W = COLS * T, H = ROWS * T;   // 画布逻辑尺寸 546 × 598
  var STEP = 1 / 120;               // 固定逻辑步长（秒）

  // 格子编码
  var CELL_EMPTY = 0, CELL_WALL = 1, CELL_PELLET = 2,
      CELL_POWER = 3, CELL_DOOR = 4, CELL_TUNNEL = 5;

  // 四方向（按经典优先级：上 左 右 下；鬼决策平局时靠前优先）
  var DIRS = [
    { x: 0, y: -1 }, { x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }
  ];

  /* ============================ 全局状态 ============================ */
  var G = {
    scene: 'menu',        // menu | cutscene | ready | playing | dying | levelclear | gameover | victory
    paused: false,
    level: 0,
    score: 0,
    lives: TUNING.lives,
    shield: 0,            // 乃琳护身剩余次数
    charId: 'bella',
    grid: [],
    tunnelRow: 10,
    pelletsLeft: 0,
    dotsEaten: 0,         // 本关已吃珠宝豆数（礼盒阈值判定）
    giftFlags: [false, false, false],
    gift: null,           // { c, r, t } 剩余时间
    frightTimer: 0,
    frightMax: 1,
    ghostChain: 0,
    player: null,
    ghosts: [],
    floats: [],           // 漂浮得分文字
    invincible: 0,
    readyT: 0,
    dyingT: 0,
    clearT: 0,
    cutT: 0,
    time: 0,              // 全局时间（动画用）
    def: MAZES[0],
    staticCv: null,       // 每关预渲染的静态迷宫
    flashT: 0             // 过关闪白计时
  };

  /* ============================ DOM 引用 ============================ */
  var $ = function (id) { return document.getElementById(id); };
  var cv, ctx, dpr = 1;
  var elScore, elBest, elLevel, elLives, elShield, elFx, fxBar, fxLabel,
      btnMute, scrMenu, scrCut, scrPause, scrSettle, charCards,
      menuBest, menuTotal, cutLevel, cutQuote, cutImg,
      settleTitle, settleImg, settleLines, settleUnlock;

  /* ============================ 存档 ============================ */
  var KEY_BEST = 'pacnight_best_v1';
  var KEY_TOTAL = 'pacnight_total_v1';
  var KEY_MUTE = 'pacnight_muted_v1';

  function loadNum(key) {
    try {
      var v = parseFloat(localStorage.getItem(key));
      return isNaN(v) ? 0 : v;
    } catch (e) { return 0; }
  }
  function saveNum(key, v) {
    try { localStorage.setItem(key, String(v)); } catch (e) { /* 隐私模式忽略 */ }
  }
  var bestScore = loadNum(KEY_BEST);
  var totalScore = loadNum(KEY_TOTAL);

  /* ============================ 音效（WebAudio 合成） ============================ */
  var AU = {
    ctx: null, master: null,
    muted: (function () { try { return localStorage.getItem(KEY_MUTE) === '1'; } catch (e) { return false; } })(),
    sirenOsc: null, sirenGain: null, sirenLfo: null,

    init: function () {
      if (this.ctx) return;
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.9;
        this.master.connect(this.ctx.destination);
      } catch (e) { this.ctx = null; }
    },
    resume: function () {
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    },
    setMuted: function (m) {
      this.muted = m;
      saveNum(KEY_MUTE, m ? '1' : '0');
      if (this.master) this.master.gain.value = m ? 0 : 0.9;
    },
    /* 单音：freq→slideTo 滑音，type 波形，vol 音量，dur 时长 */
    beep: function (freq, dur, type, vol, slideTo, delay) {
      if (!this.ctx || this.muted) return;
      var t0 = this.ctx.currentTime + (delay || 0);
      var o = this.ctx.createOscillator();
      var g = this.ctx.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, t0);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t0 + dur);
      g.gain.setValueAtTime(vol || 0.12, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(this.master);
      o.start(t0); o.stop(t0 + dur + 0.02);
    },
    waka: function (alt) { this.beep(alt ? 540 : 430, 0.07, 'square', 0.10); },
    power: function () { this.beep(180, 0.35, 'sawtooth', 0.14, 640); },
    eatGhost: function () {
      this.beep(380, 0.09, 'square', 0.14);
      this.beep(580, 0.09, 'square', 0.14, null, 0.07);
      this.beep(880, 0.14, 'square', 0.14, null, 0.14);
    },
    death: function () {
      this.beep(620, 0.9, 'triangle', 0.18, 70);
      this.beep(310, 0.9, 'sawtooth', 0.08, 45, 0.05);
    },
    jingle: function () {
      var notes = [523, 659, 784, 1047];
      for (var i = 0; i < notes.length; i++) this.beep(notes[i], 0.16, 'triangle', 0.15, null, i * 0.13);
      this.beep(1319, 0.4, 'triangle', 0.15, null, notes.length * 0.13);
    },
    gift: function () {
      this.beep(880, 0.12, 'sine', 0.16);
      this.beep(1320, 0.22, 'sine', 0.16, null, 0.1);
    },
    shield: function () {
      this.beep(300, 0.4, 'sine', 0.16, 900);
      this.beep(600, 0.4, 'triangle', 0.1, 1400, 0.05);
    },
    /* 背景警笛：普通巡逻低鸣，恐惧时变高变急 */
    sirenStart: function () {
      if (!this.ctx || this.sirenOsc) return;
      try {
        this.sirenOsc = this.ctx.createOscillator();
        this.sirenGain = this.ctx.createGain();
        this.sirenOsc.type = 'triangle';
        this.sirenGain.gain.value = 0.028;
        this.sirenOsc.connect(this.sirenGain);
        this.sirenGain.connect(this.master);
        this.sirenOsc.start();
      } catch (e) { this.sirenOsc = null; }
    },
    sirenStop: function () {
      if (this.sirenOsc) {
        try { this.sirenOsc.stop(); } catch (e) { /* 已停止 */ }
        this.sirenOsc = null; this.sirenGain = null;
      }
    },
    sirenUpdate: function (fright, t) {
      if (!this.sirenOsc) return;
      var f = fright ? (420 + Math.sin(t * 18) * 60) : (150 + Math.sin(t * 5) * 26);
      try { this.sirenOsc.frequency.setValueAtTime(f, this.ctx.currentTime); } catch (e) { /* 忽略 */ }
    }
  };

  /* ============================ 图片素材 ============================ */
  var IMGS = {};
  function preloadImages() {
    for (var i = 0; i < CHARACTERS.length; i++) {
      var ch = CHARACTERS[i];
      var list = [ch.img, ch.bubble, ch.winImg, ch.loseImg];
      for (var j = 0; j < list.length; j++) {
        if (!IMGS[list[j]]) IMGS[list[j]] = makeImg(list[j]);
      }
    }
    IMGS['assets/asoul_logo.png'] = makeImg('assets/asoul_logo.png');
  }
  function makeImg(src) {
    var im = new Image();
    im.src = src; // file:// 相对路径可直接加载；加载失败时 <img> 由 alt 兜底
    return im;
  }

  /* ============================ 工具函数 ============================ */
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function tileDist(ax, ay, bx, by) {
    var dx = ax - bx, dy = ay - by;
    return Math.sqrt(dx * dx + dy * dy);
  }
  function isReverse(a, b) { return a.x === -b.x && a.y === -b.y && (a.x !== 0 || a.y !== 0); }

  /* ============================ 迷宫 / 关卡 ============================ */
  function cellAt(c, r) {
    if (r < 0 || r >= ROWS) return CELL_WALL;
    if (c < 0 || c >= COLS) return (r === G.tunnelRow) ? CELL_TUNNEL : CELL_WALL;
    return G.grid[r][c];
  }
  /* 是否可通行。ghost=true 时鬼可过鬼屋门；玩家永远不能进门。 */
  function passable(c, r, ghost) {
    var v = cellAt(c, r);
    if (v === CELL_WALL) return false;
    if (v === CELL_DOOR) return !!ghost;
    return true;
  }

  function buildLevel(idx) {
    G.def = MAZES[idx];
    G.tunnelRow = G.def.tunnelRow;
    G.grid = [];
    var powers = 0, pellets = 0;
    for (var r = 0; r < ROWS; r++) {
      var row = [], src = G.def.rows[r];
      for (var c = 0; c < COLS; c++) {
        var ch = src.charAt(c), v = CELL_EMPTY;
        if (ch === '#') v = CELL_WALL;
        else if (ch === '.') { v = CELL_PELLET; pellets++; }
        else if (ch === 'o') { v = CELL_POWER; powers++; pellets++; }
        else if (ch === '=') v = CELL_DOOR;
        else if (ch === 'T') v = CELL_TUNNEL;
        row.push(v);
      }
      G.grid.push(row);
    }
    // 清出出生点 / 鬼出屋点 / 鬼屋内（防止出生点压着豆）
    var clears = [
      [PLAYER_START.c, PLAYER_START.r],
      [HOUSE.doorOut.c, HOUSE.doorOut.r],
      [HOUSE.centerX - 2, HOUSE.centerY], [HOUSE.centerX + 2, HOUSE.centerY],
      [HOUSE.centerX, HOUSE.centerY]
    ];
    for (var i = 0; i < clears.length; i++) {
      var cc = clears[i][0], rr = clears[i][1];
      if (G.grid[rr][cc] === CELL_PELLET || G.grid[rr][cc] === CELL_POWER) {
        G.grid[rr][cc] = CELL_EMPTY; pellets--;
      }
    }
    G.pelletsLeft = pellets;
    G.dotsEaten = 0;
    G.giftFlags = [false, false, false];
    G.gift = null;
    G.frightTimer = 0;
    G.ghostChain = 0;
    G.invincible = 0;   // 关卡重建时清空无敌，防止残留到下一关/新对局
    G.floats = [];
    G.staticCv = renderMazeStatic();
    resetPlayer();
    resetGhosts(G.def.releaseTimes.slice());
  }

  /* 预渲染静态迷宫（墙体霓虹描边 + 隧道 + 鬼屋门） */
  function renderMazeStatic() {
    var c2 = document.createElement('canvas');
    c2.width = W * dpr; c2.height = H * dpr;
    var c = c2.getContext('2d');
    c.scale(dpr, dpr);
    // 底色
    c.fillStyle = '#0b0d20';
    c.fillRect(0, 0, W, H);
    // 隧道地面 + 方向箭头
    for (var r = 0; r < ROWS; r++) {
      for (var cc = 0; cc < COLS; cc++) {
        if (G.grid[r][cc] === CELL_TUNNEL) {
          c.fillStyle = '#151a38';
          c.fillRect(cc * T, r * T, T, T);
        }
      }
    }
    // 墙体：第一遍整体描边色，第二遍内缩填充形成霓虹轮廓
    c.fillStyle = G.def.accent;
    for (r = 0; r < ROWS; r++) {
      for (cc = 0; cc < COLS; cc++) {
        if (G.grid[r][cc] === CELL_WALL) c.fillRect(cc * T, r * T, T, T);
      }
    }
    c.fillStyle = '#12173d';
    for (r = 0; r < ROWS; r++) {
      for (cc = 0; cc < COLS; cc++) {
        if (G.grid[r][cc] !== CELL_WALL) continue;
        var inL = isWall(cc - 1, r) ? 0 : 3;
        var inR = isWall(cc + 1, r) ? 0 : 3;
        var inT = isWall(cc, r - 1) ? 0 : 3;
        var inB = isWall(cc, r + 1) ? 0 : 3;
        c.fillRect(cc * T + inL, r * T + inT, T - inL - inR, T - inT - inB);
      }
    }
    // 鬼屋门（粉色横杆）
    for (r = 0; r < ROWS; r++) {
      for (cc = 0; cc < COLS; cc++) {
        if (G.grid[r][cc] === CELL_DOOR) {
          c.fillStyle = '#e78ab0';
          c.fillRect(cc * T, r * T + T / 2 - 2, T, 4);
        }
      }
    }
    // 隧道箭头（指向边界外）
    c.fillStyle = '#39406e';
    var tr = G.tunnelRow;
    for (var k = 0; k < 3; k++) {
      drawChevron(c, 1.5 * T + k * 8, tr * T + T / 2, -1);
      drawChevron(c, W - 1.5 * T - k * 8, tr * T + T / 2, 1);
    }
    return c2;
  }
  function isWall(c, r) { return cellAt(c, r) === CELL_WALL; }
  function drawChevron(c, x, y, dir) {
    c.beginPath();
    c.moveTo(x + 3 * dir, y - 4);
    c.lineTo(x - 3 * dir, y);
    c.lineTo(x + 3 * dir, y + 4);
    c.lineTo(x + 1 * dir, y);
    c.closePath();
    c.fill();
  }

  /* ============================ 实体 ============================ */
  function makePlayer() {
    return {
      tx: PLAYER_START.c, ty: PLAYER_START.r,
      dir: { x: -1, y: 0 },   // 初始朝左
      want: null,             // 预输入缓冲
      prog: 0,
      stopped: false,
      boost: 0,               // 思诺隧道加速剩余时间
      facing: { x: -1, y: 0 } // 绘制朝向（停下时保留）
    };
  }
  function resetPlayer() {
    G.player = makePlayer();
  }
  function resetGhosts(releaseTimes) {
    G.ghosts = [];
    for (var i = 0; i < GHOSTS_DEF.length; i++) {
      var d = GHOSTS_DEF[i];
      var g = {
        id: d.id, name: d.name, kind: d.kind, color: d.color,
        personality: d.personality,
        mode: 'house',        // house | exit | normal | eyes | enter
        tx: 0, ty: 0, prog: 0, dir: { x: -1, y: 0 },
        px: 0, py: 0,         // 屋内/出屋 scripted 像素坐标
        releaseT: releaseTimes[i],
        fright: false,
        stun: 0,
        halt: false,          // 眼睛到家的“本步终止”标记
        wp: 0,                // 阿草巡逻目标索引
        bobPhase: i * 1.7
      };
      if (i === 0) {          // 小黑子A：开局就在门外
        g.mode = 'normal';
        g.tx = HOUSE.doorOut.c; g.ty = HOUSE.doorOut.r;
        g.dir = { x: -1, y: 0 };
      } else {
        g.px = (HOUSE.centerX + (i === 1 ? -2 : (i === 2 ? 2 : 0)) + 0.5) * T;
        g.py = (HOUSE.centerY + 0.5) * T;
      }
      G.ghosts.push(g);
    }
  }

  /* 实体像素坐标（格心 + 方向 * 进度） */
  function entX(e) { return (e.tx + 0.5 + e.dir.x * e.prog) * T; }
  function entY(e) { return (e.ty + 0.5 + e.dir.y * e.prog) * T; }
  function ghostX(g) { return (g.mode === 'house' || g.mode === 'exit' || g.mode === 'enter') ? g.px : entX(g); }
  function ghostY(g) {
    if (g.mode === 'house') return g.py + Math.sin(G.time * 5 + g.bobPhase) * 3;
    return (g.mode === 'exit' || g.mode === 'enter') ? g.py : entY(g);
  }

  /* ============================ 网格移动（手感核心） ============================
   * 实体朝下一格心推进；到达格心时回调 onCenter 做决策。
   * dist 单位：格。isPlayer：越界时触发隧道回绕 + 思诺被动。
   */
  function stepMove(e, dist, onCenter, isPlayer) {
    var guard = 0;
    while (dist > 1e-6 && guard++ < 8) {
      if (e.stopped) break;
      var room = 1 - e.prog;
      if (dist >= room) {
        dist -= room;
        e.tx += e.dir.x; e.ty += e.dir.y; e.prog = 0;
        // 隧道回绕
        if (e.tx < 0) { e.tx = COLS - 1; if (isPlayer) onTunnelWrap(); }
        else if (e.tx >= COLS) { e.tx = 0; if (isPlayer) onTunnelWrap(); }
        onCenter(e);
        if (e.stopped || e.halt) break;
      } else {
        e.prog += dist;
        dist = 0;
      }
    }
  }

  function onTunnelWrap() {
    var ch = charDef();
    if (ch.id === 'gladys') {
      // 思诺被动：声波震慑——自身加速 + 全场鬼僵直
      G.player.boost = TUNING.gladysBoostTime;
      for (var i = 0; i < G.ghosts.length; i++) {
        var g = G.ghosts[i];
        if (g.mode === 'normal') g.stun = Math.max(g.stun, TUNING.gladysStunTime);
      }
      addFloat(entX(G.player), entY(G.player) - 14, '♪ 声波震慑！', '#9fe8ff');
      AU.beep(1200, 0.25, 'sine', 0.12, 500);
    }
  }

  /* 玩家格心回调：吃豆 → 转向决策（只在格心发生） */
  function onPlayerCenter(p) {
    eatAt(p.tx, p.ty);
    var want = p.want;
    if (want && passable(p.tx + want.x, p.ty + want.y, false)) {
      p.dir = { x: want.x, y: want.y };
      p.want = null;
    }
    if (!passable(p.tx + p.dir.x, p.ty + p.dir.y, false)) {
      p.stopped = true;
    }
    p.facing = { x: p.dir.x, y: p.dir.y };
  }

  function updatePlayer(dt) {
    var p = G.player;
    if (p.boost > 0) p.boost = Math.max(0, p.boost - dt);

    // 中途反向：随时允许（经典手感）
    if (p.want && !p.stopped && p.prog > 1e-4 && isReverse(p.want, p.dir)) {
      p.tx += p.dir.x; p.ty += p.dir.y;
      if (p.tx < 0) p.tx = COLS - 1; else if (p.tx >= COLS) p.tx = 0;
      p.dir = { x: p.want.x, y: p.want.y };
      p.prog = 1 - p.prog;
      p.want = null;
      p.facing = { x: p.dir.x, y: p.dir.y };
    }
    // 停在格心：先尝试预输入，再尝试原方向
    if (p.stopped) {
      var w = p.want;
      if (w && passable(p.tx + w.x, p.ty + w.y, false)) {
        p.dir = { x: w.x, y: w.y }; p.want = null; p.stopped = false;
      } else if (passable(p.tx + p.dir.x, p.ty + p.dir.y, false)) {
        p.stopped = false;
      }
    }
    if (!p.stopped) {
      stepMove(p, playerSpeed() * dt, onPlayerCenter, true);
    }
  }

  function playerSpeed() {
    var ch = charDef();
    var sp = TUNING.playerSpeed;
    if (ch.id === 'bella') sp *= TUNING.bellaSpeedMul;          // 贝拉被动
    if (G.player.boost > 0) sp *= TUNING.gladysBoostMul;        // 思诺被动加速
    return sp;
  }

  /* ============================ 鬼 AI ============================ */
  function ghostSpeed(g) {
    var base = G.def.ghostSpeed;
    if (g.mode === 'eyes') base *= 1.9;                 // 眼睛回屋速度快
    else if (g.fright) base *= 0.55;                    // 恐惧时减速
    // 阿草人格：玩家靠近 5 格内 → “凑热闹”加速
    if (g.personality === 'patrol' && !g.fright && g.mode === 'normal') {
      var px = entX(G.player) / T - 0.5, py = entY(G.player) / T - 0.5;
      if (tileDist(g.tx, g.ty, px, py) <= 5) base *= 1.45;
    }
    // 隧道内减速（经典设定）
    if (g.ty === G.tunnelRow && (g.tx <= 3 || g.tx >= COLS - 4) && g.mode !== 'eyes') base *= 0.6;
    return base;
  }

  /* 各鬼目标格：人格在这里体现 */
  function ghostTarget(g) {
    var p = G.player;
    var pt = { c: p.tx, r: p.ty };
    switch (g.personality) {
      case 'chase':   // 黑子A：直线追击玩家
        return pt;
      case 'ambush':  // 黑子B：预测玩家前方 4 格，埋伏截击
        var f = p.stopped ? p.facing : p.dir;
        return { c: pt.c + f.x * 4, r: pt.r + f.y * 4 };
      case 'patrol':  // 阿草：巡逻四角，靠近玩家时扑向玩家
        if (tileDist(g.tx, g.ty, pt.c, pt.r) <= 5) return pt;
        return PATROL_POINTS[g.wp];
      default:        // 黑子C：随机游走
        return null;
    }
  }

  /* 格心决策：不能原地回头（除非死路），恐惧时优先远离玩家 */
  function chooseGhostDir(g) {
    var cands = [];
    for (var i = 0; i < DIRS.length; i++) {
      var d = DIRS[i];
      if (isReverse(d, g.dir)) continue;
      if (passable(g.tx + d.x, g.ty + d.y, g.mode === 'eyes')) cands.push(d);
    }
    if (cands.length === 0) {
      var back = { x: -g.dir.x, y: -g.dir.y };
      if (passable(g.tx + back.x, g.ty + back.y, g.mode === 'eyes')) return back;
      return g.dir;
    }
    // 眼睛状态：BFS 最短路回屋（保证能到家）
    if (g.mode === 'eyes') {
      var bd = bfsDir(g.tx, g.ty, HOUSE.eyesTarget.c, HOUSE.eyesTarget.r);
      if (bd) return bd;
    }
    if (g.fright) {
      // 恐惧：反向逃跑——选择离玩家最远的方向
      var px = entX(G.player), py = entY(G.player);
      var bestD = null, bestScore = -1;
      for (i = 0; i < cands.length; i++) {
        var nc = (g.tx + cands[i].x + 0.5) * T;
        var nr = (g.ty + cands[i].y + 0.5) * T;
        var dd = tileDist(nc, nr, px, py);
        if (dd > bestScore) { bestScore = dd; bestD = cands[i]; }
      }
      return bestD;
    }
    var target = ghostTarget(g);
    if (!target) {  // 随机人格
      return cands[Math.floor(Math.random() * cands.length)];
    }
    // 追击/埋伏/巡逻：贪心逼近，平局按 上>左>右>下 经典优先级
    var best = null, bestDist = Infinity;
    for (i = 0; i < cands.length; i++) {
      var tc = g.tx + cands[i].x, tr2 = g.ty + cands[i].y;
      var dist = tileDist(tc, tr2, target.c, target.r);
      if (dist < bestDist - 1e-9) { bestDist = dist; best = cands[i]; }
    }
    return best;
  }

  /* BFS 最短路第一步（眼睛回屋专用；小图开销可忽略） */
  function bfsDir(sc, sr, tc, tr) {
    if (sc === tc && sr === tr) return null;
    var N = COLS * ROWS;
    var prev = new Int16Array(N);
    var visited = new Uint8Array(N);
    var qx = [sc], qy = [sr];
    visited[sr * COLS + sc] = 1;
    var head = 0, found = false;
    while (head < qx.length) {
      var c = qx[head], r = qy[head]; head++;
      if (c === tc && r === tr) { found = true; break; }
      for (var i = 0; i < DIRS.length; i++) {
        var d = DIRS[i];
        var nc = c + d.x, nr = r + d.y;
        if (nc < 0) nc = COLS - 1; else if (nc >= COLS) nc = 0; // 隧道行回绕
        if (nr < 0 || nr >= ROWS) continue;
        var key = nr * COLS + nc;
        if (visited[key]) continue;
        if (!passable(nc, nr, true)) continue; // 眼睛可穿门
        visited[key] = 1;
        prev[key] = r * COLS + c;
        qx.push(nc); qy.push(nr);
      }
    }
    if (!found) return null;
    var cur = tr * COLS + tc, start = sr * COLS + sc;
    while (prev[cur] !== start) {
      if (prev[cur] < 0) return null;
      cur = prev[cur];
    }
    var cc = cur % COLS, rr = (cur - cc) / COLS;
    var dx = cc - sc, dy = rr - sr;
    if (dx > 1) dx = -1; else if (dx < -1) dx = 1; // 跨隧道回绕时归一化
    return { x: dx, y: dy };
  }

  function onGhostCenter(g) {
    // 眼睛到家 → 转入“进屋”脚本（在格心立即切换，防止残余位移冲过门口）
    if (g.mode === 'eyes' && g.tx === HOUSE.eyesTarget.c && g.ty === HOUSE.eyesTarget.r) {
      g.mode = 'enter';
      g.px = (HOUSE.centerX + 0.5) * T;
      g.py = (HOUSE.doorOut.r + 0.5) * T;
      g.halt = true;
      return;
    }
    var d = chooseGhostDir(g);
    g.dir = { x: d.x, y: d.y };
    // 阿草到达巡逻点 → 换下一个角
    if (g.personality === 'patrol' && g.mode !== 'eyes') {
      var wp = PATROL_POINTS[g.wp];
      if (g.tx === wp.c && g.ty === wp.r) g.wp = (g.wp + 1) % PATROL_POINTS.length;
    }
  }

  function updateGhost(g, dt) {
    if (g.stun > 0) { g.stun -= dt; return; }  // 思诺声波僵直
    switch (g.mode) {
      case 'house':
        g.releaseT -= dt;
        if (g.releaseT <= 0) { g.mode = 'exit'; }
        break;
      case 'exit': { // 出屋：先水平对齐屋中心，再向上穿门
        var sp = 3.2 * T * dt;
        var cx = (HOUSE.centerX + 0.5) * T;
        var oy = (HOUSE.doorOut.r + 0.5) * T;
        if (Math.abs(g.px - cx) > 0.5) {
          g.px += (g.px < cx ? 1 : -1) * Math.min(sp, Math.abs(g.px - cx));
        } else {
          g.px = cx;
          g.py -= sp;
          if (g.py <= oy) {
            g.py = oy;
            g.mode = 'normal';
            g.tx = HOUSE.doorOut.c; g.ty = HOUSE.doorOut.r; g.prog = 0;
            g.dir = Math.random() < 0.5 ? { x: -1, y: 0 } : { x: 1, y: 0 };
          }
        }
        break;
      }
      case 'enter': { // 眼睛进屋：从门口垂直下降
        var sp2 = 4.5 * T * dt;
        g.py += sp2;
        if (g.py >= (HOUSE.centerY + 0.5) * T) {
          g.py = (HOUSE.centerY + 0.5) * T;
          g.mode = 'house';
          g.releaseT = 0.8;
          g.fright = false;
        }
        break;
      }
      case 'normal':
      case 'eyes':
        stepMove(g, ghostSpeed(g) * dt, onGhostCenter, false);
        g.halt = false;
        break;
    }
  }

  /* ============================ 吃豆 / 道具 ============================ */
  function eatAt(c, r) {
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return;
    var v = G.grid[r][c];
    if (v === CELL_PELLET) {
      G.grid[r][c] = CELL_EMPTY;
      G.pelletsLeft--; G.dotsEaten++;
      G.score += 10;
      AU.waka(G.dotsEaten % 2 === 0);
      checkGiftSpawn();
      if (G.pelletsLeft <= 0) levelCleared();
    } else if (v === CELL_POWER) {
      G.grid[r][c] = CELL_EMPTY;
      G.pelletsLeft--; G.dotsEaten++;
      G.score += 50;
      triggerFright();
      checkGiftSpawn();
      if (G.pelletsLeft <= 0) levelCleared();
    }
    // 打烊礼盒：站在礼盒格上拾取
    if (G.gift && G.gift.c === c && G.gift.r === r) pickupGift();
  }

  function checkGiftSpawn() {
    var th = GIFT_CONFIG.thresholds;
    for (var i = 0; i < th.length; i++) {
      if (!G.giftFlags[i] && G.dotsEaten >= th[i]) {
        G.giftFlags[i] = true;
        G.gift = { c: GIFT_CONFIG.tile.c, r: GIFT_CONFIG.tile.r, t: GIFT_CONFIG.lifetime };
        addFloat((G.gift.c + 0.5) * T, (G.gift.r - 0.2) * T, '打烊礼盒！', '#ffd27a');
        AU.gift();
      }
    }
  }
  function pickupGift() {
    if (!G.gift) return;
    G.score += GIFT_CONFIG.score;
    addFloat((G.gift.c + 0.5) * T, (G.gift.r + 0.5) * T, '+' + GIFT_CONFIG.score, '#ffe9a8');
    G.gift = null;
    AU.gift();
  }
  function updateGift(dt) {
    if (!G.gift) return;
    G.gift.t -= dt;
    if (G.gift.t <= 0) {
      addFloat((G.gift.c + 0.5) * T, (G.gift.r + 0.5) * T, '礼盒被抢空了…', '#8a90b8');
      G.gift = null;
      return;
    }
    // 路过即拾取（防止礼盒刷在脚下却吃不到）
    var p = G.player;
    if (p && tileDist(entX(p), entY(p), (G.gift.c + 0.5) * T, (G.gift.r + 0.5) * T) < T * 0.55) {
      pickupGift();
    }
  }

  /* ============================ 恐惧 / 吃鬼 / 死亡 ============================ */
  function triggerFright() {
    var ch = charDef();
    var t = G.def.frightTime;
    if (ch.id === 'diana') t += TUNING.dianaFrightBonus; // 嘉然被动
    G.frightTimer = t;
    G.frightMax = t;
    G.ghostChain = 0;
    frightGhosts();
    AU.power();
  }
  function frightGhosts() {
    for (var i = 0; i < G.ghosts.length; i++) {
      var g = G.ghosts[i];
      if (g.mode === 'normal' || g.mode === 'exit') {
        g.fright = true;
        // 恐惧瞬间原地掉头（经典行为）
        flipDir(g);
      }
    }
  }
  function flipDir(g) {
    g.tx += g.dir.x; g.ty += g.dir.y;
    if (g.tx < 0) g.tx = COLS - 1; else if (g.tx >= COLS) g.tx = 0;
    g.dir = { x: -g.dir.x, y: -g.dir.y };
    g.prog = 1 - g.prog;
  }

  function eatGhost(g) {
    var ch = charDef();
    var base = TUNING.ghostChainScores[Math.min(G.ghostChain, TUNING.ghostChainScores.length - 1)];
    var gain = (ch.id === 'fiona') ? base * TUNING.fionaGhostMul : base; // 心宜被动
    G.score += gain;
    G.ghostChain++;
    addFloat(ghostX(g), ghostY(g), '+' + gain, '#8fd0ff');
    g.fright = false;
    if (g.mode === 'exit') {
      // 出屋途中被吃：先对齐到门口格，避免眼睛状态使用失效坐标
      g.tx = HOUSE.doorOut.c; g.ty = HOUSE.doorOut.r; g.prog = 0;
      g.dir = { x: 0, y: -1 };
    }
    g.mode = 'eyes';
    AU.eatGhost();
  }

  /* 乃琳被动：被抓瞬间自动消耗护身 → 全场恐惧 3 秒 */
  function useEileenShield() {
    G.shield--;
    G.frightTimer = TUNING.eileenFrightTime;
    G.frightMax = TUNING.eileenFrightTime;
    G.ghostChain = 0;
    frightGhosts();
    G.invincible = 0.8; // 防止同一帧连续判定
    addFloat(entX(G.player), entY(G.player) - 16, '甜蜜陷阱护身！', '#f0a8c8');
    AU.shield();
    updateHUD();
  }

  function checkCollisions() {
    if (G.invincible > 0) return;
    var px = entX(G.player), py = entY(G.player);
    for (var i = 0; i < G.ghosts.length; i++) {
      var g = G.ghosts[i];
      if (g.mode === 'house' || g.mode === 'eyes' || g.mode === 'enter') continue;
      var d = tileDist(ghostX(g), ghostY(g), px, py);
      if (d < T * 0.55) {
        if (g.fright) {
          eatGhost(g);
        } else if (G.shield > 0 && charDef().id === 'eileen') {
          useEileenShield();
        } else {
          startDeath();
          return;
        }
      }
    }
  }

  function startDeath() {
    G.scene = 'dying';
    G.dyingT = 1.7;
    G.frightTimer = 0;
    AU.death();
    AU.sirenStop();
  }
  function afterDeath() {
    G.lives--;
    updateHUD();
    if (G.lives <= 0) { endGame(false); return; }
    // 重置位置，短暂无敌，错峰出屋（比开局更快）
    resetPlayer();
    resetGhosts([0, 0.6, 2, 4]);
    G.frightTimer = 0;
    G.ghostChain = 0;
    G.gift = null;
    G.invincible = TUNING.invincibleAfterDeath;
    G.readyT = 1.4;
    G.scene = 'ready';
  }

  function levelCleared() {
    G.scene = 'levelclear';
    G.clearT = 2.4;
    G.gift = null;
    AU.jingle();
    AU.sirenStop();
  }

  function endGame(win) {
    // 结算：更新最高分与累计分（跨局解锁用）
    var prevTotal = totalScore;
    totalScore += G.score;
    if (G.score > bestScore) bestScore = G.score;
    saveNum(KEY_TOTAL, totalScore);
    saveNum(KEY_BEST, bestScore);
    // 解锁检测
    var newly = [];
    for (var i = 0; i < CHARACTERS.length; i++) {
      var ch = CHARACTERS[i];
      if (ch.unlockAt > 0 && prevTotal < ch.unlockAt && totalScore >= ch.unlockAt) newly.push(ch);
    }
    showSettle(win, newly);
  }

  /* ============================ 漂浮文字 ============================ */
  function addFloat(x, y, txt, color) {
    G.floats.push({ x: x, y: y, txt: txt, color: color || '#fff', t: 1.1 });
  }
  function updateFloats(dt) {
    for (var i = G.floats.length - 1; i >= 0; i--) {
      var f = G.floats[i];
      f.t -= dt; f.y -= 22 * dt;
      if (f.t <= 0) G.floats.splice(i, 1);
    }
  }

  /* ============================ 主更新 ============================ */
  function update(dt) {
    G.time += dt;
    updateFloats(dt);
    switch (G.scene) {
      case 'cutscene':
        G.cutT -= dt;
        if (G.cutT <= 0) beginReady();
        break;
      case 'ready':
        G.readyT -= dt;
        if (G.readyT <= 0) {
          G.scene = 'playing';
          AU.sirenStart();
        }
        break;
      case 'playing':
        if (G.invincible > 0) G.invincible -= dt;
        if (G.frightTimer > 0) {
          G.frightTimer -= dt;
          if (G.frightTimer <= 0) {
            G.frightTimer = 0;
            for (var i = 0; i < G.ghosts.length; i++) G.ghosts[i].fright = false;
          }
        }
        updatePlayer(dt);
        for (i = 0; i < G.ghosts.length; i++) updateGhost(G.ghosts[i], dt);
        updateGift(dt);
        checkCollisions();
        AU.sirenUpdate(G.frightTimer > 0, G.time);
        updateFxBar();
        break;
      case 'dying':
        G.dyingT -= dt;
        if (G.dyingT <= 0) afterDeath();
        break;
      case 'levelclear':
        G.clearT -= dt;
        G.flashT += dt;
        if (G.clearT <= 0) {
          G.level++;
          if (G.level >= MAZES.length) endGame(true);
          else { buildLevel(G.level); showCutscene(); }
        }
        break;
    }
  }

  /* ============================ 渲染 ============================ */
  function draw() {
    ctx.clearRect(0, 0, W, H);
    if (G.staticCv) ctx.drawImage(G.staticCv, 0, 0, W, H);
    drawPellets();
    drawGift();
    // 鬼（死亡动画期间隐藏，让位给角色退场演出）
    if (G.scene !== 'dying') {
      for (var i = 0; i < G.ghosts.length; i++) drawGhost(G.ghosts[i]);
    }
    if (G.scene !== 'menu') drawPlayerSprite();
    drawFloatsFn();
    drawSceneText();
    if (G.scene === 'menu' || G.scene === 'gameover' || G.scene === 'victory') {
      ctx.fillStyle = 'rgba(6,8,20,0.55)';
      ctx.fillRect(0, 0, W, H);
    }
  }

  function drawPellets() {
    var pulse = 0.75 + Math.sin(G.time * 6) * 0.25;
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var v = G.grid[r][c];
        if (v === CELL_PELLET) {
          // 珠宝豆：小菱形
          var x = (c + 0.5) * T, y = (r + 0.5) * T;
          ctx.fillStyle = '#ffd98c';
          ctx.beginPath();
          ctx.moveTo(x, y - 3.2);
          ctx.lineTo(x + 3.2, y);
          ctx.lineTo(x, y + 3.2);
          ctx.lineTo(x - 3.2, y);
          ctx.closePath();
          ctx.fill();
        } else if (v === CELL_POWER) {
          // 大颗奶油宝石：脉动圆
          var x2 = (c + 0.5) * T, y2 = (r + 0.5) * T, rad = 5 + pulse * 2;
          ctx.fillStyle = 'rgba(255,240,214,0.25)';
          ctx.beginPath(); ctx.arc(x2, y2, rad + 3.5, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#fff3d6';
          ctx.beginPath(); ctx.arc(x2, y2, rad, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#f7c8a0';
          ctx.beginPath(); ctx.arc(x2 - 1.4, y2 - 1.4, 1.5, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
  }

  function drawGift() {
    if (!G.gift) return;
    var x = (G.gift.c + 0.5) * T, y = (G.gift.r + 0.5) * T + Math.sin(G.time * 5) * 2;
    var frac = clamp(G.gift.t / GIFT_CONFIG.lifetime, 0, 1);
    // 剩余时间环
    ctx.strokeStyle = '#ffd27a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y - 4, 14, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
    ctx.stroke();
    // 盒身
    ctx.fillStyle = '#d24b4e';
    ctx.fillRect(x - 9, y - 4, 18, 12);
    ctx.fillStyle = '#e8636a';
    ctx.fillRect(x - 10, y - 7, 20, 4);   // 盒盖
    ctx.fillStyle = '#ffd27a';
    ctx.fillRect(x - 1.5, y - 7, 3, 15);  // 竖丝带
    // 蝴蝶结
    ctx.beginPath();
    ctx.moveTo(x, y - 7);
    ctx.lineTo(x - 5, y - 10);
    ctx.lineTo(x - 1, y - 8.5);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x, y - 7);
    ctx.lineTo(x + 5, y - 10);
    ctx.lineTo(x + 1, y - 8.5);
    ctx.closePath(); ctx.fill();
  }

  /* ---------- 玩家：Q 版少女矢量造型 ---------- */
  function drawPlayerSprite() {
    var p = G.player;
    if (!p) return;
    var ch = charDef();
    var x = entX(p), y = entY(p);
    // 重生无敌闪烁
    if (G.invincible > 0 && Math.floor(G.time * 10) % 2 === 0 && G.scene === 'playing') return;
    if (G.scene === 'dying') {
      drawDying(x, y, ch);
      return;
    }
    drawChibi(ctx, x, y, ch, p.facing, 1);
  }

  function drawDying(x, y, ch) {
    var k = clamp(G.dyingT / 1.7, 0, 1); // 1 → 0
    if (k > 0.75) {
      // 定格闪烁
      if (Math.floor(G.time * 14) % 2 === 0) drawChibi(ctx, x, y, ch, { x: 0, y: 1 }, 1);
      return;
    }
    var s = k / 0.75;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((1 - s) * 6);
    drawChibi(ctx, 0, 0, ch, { x: 0, y: 1 }, s);
    ctx.restore();
    if (k < 0.15) {
      // 消散圆环
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.8 * (1 - k / 0.15)) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, (0.15 - k) * 220, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  /* Q 版少女：大头 + 发型差异 + 小身体 */
  function drawChibi(c, x, y, ch, facing, scale) {
    var s = scale;
    c.save();
    c.translate(x, y);
    c.scale(s, s);
    var skin = '#ffe3cd';
    var fx = facing.x, fy = facing.y;
    // 身体
    c.fillStyle = ch.color;
    c.fillRect(-6, 3, 12, 9);
    c.fillStyle = '#ffffff';
    c.fillRect(-3, 3, 6, 2.2);           // 白领
    c.fillStyle = 'rgba(0,0,0,0.18)';
    c.fillRect(-6, 10.6, 12, 1.4);       // 裙摆阴影
    // 后发（长发角色先铺大圆）
    c.fillStyle = ch.hair;
    if (ch.style.long) {
      c.beginPath(); c.arc(0, -3.5, 10, 0, Math.PI * 2); c.fill();
      c.fillRect(-10, -3.5, 20, 12);      // 长发披肩
    } else {
      c.beginPath(); c.arc(0, -4, 9.4, 0, Math.PI * 2); c.fill();
    }
    // 双马尾（心宜）
    if (ch.style.tails) {
      c.beginPath(); c.ellipse(-9.5, 1, 3, 6, 0.25, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.ellipse(9.5, 1, 3, 6, -0.25, 0, Math.PI * 2); c.fill();
    }
    // 脸
    c.fillStyle = skin;
    c.beginPath(); c.arc(0, -3.6, 7, 0, Math.PI * 2); c.fill();
    // 刘海
    c.fillStyle = ch.hair;
    c.beginPath();
    c.arc(0, -4.6, 7.4, Math.PI * 0.95, Math.PI * 2.05);
    c.lineTo(7.2, -5.6);
    c.quadraticCurveTo(4.5, -4.2, 2.6, -5.4);
    c.quadraticCurveTo(0.8, -6.4, -1.4, -5.2);
    c.quadraticCurveTo(-3.6, -4.0, -6.2, -5.8);
    c.closePath();
    c.fill();
    // 丸子头（嘉然）
    if (ch.style.buns) {
      c.beginPath(); c.arc(-8.2, -9, 3.1, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(8.2, -9, 3.1, 0, Math.PI * 2); c.fill();
    }
    // 呆毛（贝拉）
    if (ch.style.ahoge) {
      c.strokeStyle = ch.hair; c.lineWidth = 1.4;
      c.beginPath();
      c.moveTo(0, -11.5);
      c.quadraticCurveTo(2.5, -14.5, 5, -12.5);
      c.stroke();
    }
    // 星星发夹（贝拉）
    if (ch.style.pin) {
      c.fillStyle = '#ffd76a';
      c.beginPath();
      c.arc(-5.4, -7.6, 1.7, 0, Math.PI * 2);
      c.fill();
    }
    // 发箍（思诺）
    if (ch.style.band) {
      c.strokeStyle = '#cfc3ff'; c.lineWidth = 1.8;
      c.beginPath(); c.arc(0, -4.6, 7.6, Math.PI * 1.1, Math.PI * 1.9); c.stroke();
    }
    // 眼睛（随朝向偏移）
    var ex = fx * 1.5, ey = fy * 1.2;
    c.fillStyle = '#33261f';
    c.beginPath(); c.arc(-2.7 + ex, -3.4 + ey, 1.25, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(2.7 + ex, -3.4 + ey, 1.25, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#ffffff';
    c.beginPath(); c.arc(-2.3 + ex, -3.8 + ey, 0.45, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(3.1 + ex, -3.8 + ey, 0.45, 0, Math.PI * 2); c.fill();
    // 腮红
    c.fillStyle = 'rgba(240,130,150,0.5)';
    c.beginPath(); c.arc(-4.8 + fx, -1.4, 1.2, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(4.8 + fx, -1.4, 1.2, 0, Math.PI * 2); c.fill();
    // 嘴
    c.strokeStyle = '#b05f4e'; c.lineWidth = 0.9;
    c.beginPath();
    if (fy < 0) { c.arc(ex * 0.5, -0.9, 1.3, 0, Math.PI); }
    else { c.arc(ex * 0.5, -0.4, 1.3, 0, Math.PI); }
    c.stroke();
    c.restore();
  }

  /* ---------- 鬼：小黑子（灰绿连帽衫）与阿草（白色雪貂） ---------- */
  function drawGhost(g) {
    var x = ghostX(g), y = ghostY(g);
    if (g.mode === 'eyes' || g.mode === 'enter') {
      drawGhostEyes(ctx, x, y, g);
      return;
    }
    var fright = g.fright;
    var flash = fright && G.frightTimer < 2 && Math.floor(G.time * 8) % 2 === 0;
    if (g.kind === 'ferret') drawFerret(ctx, x, y, g, fright, flash);
    else drawBazi(ctx, x, y, g, fright, flash);
    if (g.stun > 0) drawNote(ctx, x, y - 16);
  }

  function drawBazi(c, x, y, g, fright, flash) {
    var body = fright ? (flash ? '#eef0ff' : '#2734c8') : g.color;
    // 连帽身体：圆顶 + 波浪下摆
    c.fillStyle = body;
    c.beginPath();
    c.arc(x, y - 2, 9, Math.PI, 0);
    c.lineTo(x + 9, y + 7);
    var seg = 3;
    for (var i = 0; i < seg; i++) {
      var x1 = x + 9 - (i * 2 + 1) * (9 / seg);
      var x2 = x + 9 - (i * 2 + 2) * (9 / seg);
      c.quadraticCurveTo(x1, y + 10.5, x2, y + 7);
    }
    c.closePath();
    c.fill();
    // 帽檐阴影
    c.fillStyle = 'rgba(0,0,0,0.22)';
    c.beginPath(); c.arc(x, y - 4.5, 6.6, Math.PI, 0); c.fill();
    if (fright) {
      // 恐惧脸：白眼 + 波浪嘴（闪白时嘴变红）
      c.fillStyle = flash ? '#d24b4e' : '#f2f2ff';
      c.beginPath(); c.arc(x - 3.2, y - 3.5, 1.6, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(x + 3.2, y - 3.5, 1.6, 0, Math.PI * 2); c.fill();
      c.strokeStyle = flash ? '#d24b4e' : '#f2f2ff';
      c.lineWidth = 1.1;
      c.beginPath();
      c.moveTo(x - 4, y + 2.5);
      for (var k = 0; k < 4; k++) {
        c.lineTo(x - 4 + (k + 0.5) * 2, y + (k % 2 === 0 ? 0.8 : 2.5));
      }
      c.lineTo(x + 4, y + 2.5);
      c.stroke();
    } else {
      drawGhostEyes(c, x, y - 2, g);
    }
    // 小黑子头顶呆羽
    c.strokeStyle = body; c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(x, y - 11);
    c.lineTo(x + 2.5, y - 14);
    c.stroke();
  }

  function drawGhostEyes(c, x, y, g) {
    var dx = g.dir.x, dy = g.dir.y;
    c.fillStyle = '#ffffff';
    c.beginPath(); c.ellipse(x - 3.2 + dx * 1.4, y - 2 + dy * 1.4, 2.4, 3, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(x + 3.2 + dx * 1.4, y - 2 + dy * 1.4, 2.4, 3, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#2a3550';
    c.beginPath(); c.arc(x - 3.2 + dx * 2.4, y - 2 + dy * 2.2, 1.15, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(x + 3.2 + dx * 2.4, y - 2 + dy * 2.2, 1.15, 0, Math.PI * 2); c.fill();
  }

  function drawFerret(c, x, y, g, fright, flash) {
    c.save();
    if (g.dir.x < 0) { c.translate(x, y); c.scale(-1, 1); c.translate(-x, -y); }
    var body = fright ? (flash ? '#eef0ff' : '#7d8ce8') : '#f7f3ea';
    // 尾巴
    c.fillStyle = fright ? body : '#e3ddd0';
    c.beginPath();
    c.moveTo(x - 9, y + 1);
    c.lineTo(x - 15, y - 4);
    c.lineTo(x - 9, y - 3);
    c.closePath(); c.fill();
    // 长条身体（雪貂形）
    c.fillStyle = body;
    c.beginPath();
    c.ellipse(x, y, 11, 5.6, 0, 0, Math.PI * 2);
    c.fill();
    // 耳朵
    c.fillStyle = body;
    c.beginPath(); c.arc(x + 5.5, y - 5.4, 2.4, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(x + 9.5, y - 4.6, 2.2, 0, Math.PI * 2); c.fill();
    if (!fright) {
      c.fillStyle = '#f0b8c0';
      c.beginPath(); c.arc(x + 5.5, y - 5.2, 1.1, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(x + 9.5, y - 4.4, 1.0, 0, Math.PI * 2); c.fill();
    }
    // 眼睛与鼻子（朝前）
    c.fillStyle = '#2a2530';
    c.beginPath(); c.arc(x + 7, y - 1.2, 1.15, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(x + 11, y - 0.6, 1.15, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#e88aa0';
    c.beginPath(); c.arc(x + 13.4, y + 0.6, 1.05, 0, Math.PI * 2); c.fill();
    // 背部花纹
    if (!fright) {
      c.fillStyle = '#d8d0bf';
      c.beginPath(); c.ellipse(x - 3, y + 1.5, 4.5, 2, 0, 0, Math.PI * 2); c.fill();
    }
    c.restore();
    if (fright && !flash) {
      // 汗滴
      c.fillStyle = 'rgba(140,190,255,0.9)';
      c.beginPath();
      c.moveTo(x + 9, y - 12);
      c.quadraticCurveTo(x + 11.5, y - 8.5, x + 9, y - 7);
      c.quadraticCurveTo(x + 6.5, y - 8.5, x + 9, y - 12);
      c.fill();
    }
  }

  /* 僵直时头顶的音符（思诺声波震慑标记） */
  function drawNote(c, x, y) {
    c.strokeStyle = '#9fe8ff';
    c.fillStyle = '#9fe8ff';
    c.lineWidth = 1.2;
    c.beginPath(); c.arc(x - 1.5, y + 3, 2, 0, Math.PI * 2); c.fill();
    c.beginPath();
    c.moveTo(x + 0.5, y + 3);
    c.lineTo(x + 0.5, y - 4);
    c.lineTo(x + 4.5, y - 6);
    c.lineTo(x + 4.5, y + 0.5);
    c.stroke();
  }

  function drawFloatsFn() {
    ctx.font = 'bold 12px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    for (var i = 0; i < G.floats.length; i++) {
      var f = G.floats[i];
      ctx.globalAlpha = clamp(f.t / 0.9, 0, 1);
      ctx.fillStyle = f.color;
      ctx.fillText(f.txt, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }

  function drawSceneText() {
    ctx.textAlign = 'center';
    if (G.scene === 'ready') {
      ctx.fillStyle = '#ffd27a';
      ctx.font = 'bold 30px "Microsoft YaHei", sans-serif';
      ctx.fillText('READY!', W / 2, H / 2 + 96);
      ctx.fillStyle = '#aeb6e8';
      ctx.font = '14px "Microsoft YaHei", sans-serif';
      ctx.fillText(G.def.name, W / 2, H / 2 + 120);
    } else if (G.scene === 'levelclear') {
      // 打烊闪白
      var on = Math.floor(G.flashT * 8) % 2 === 0;
      if (on) {
        ctx.fillStyle = 'rgba(255,244,220,0.22)';
        ctx.fillRect(0, 0, W, H);
      }
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 24px "Microsoft YaHei", sans-serif';
      ctx.fillText('本站打烊完成！', W / 2, H / 2 + 90);
    }
  }

  /* ============================ HUD ============================ */
  function updateHUD() {
    elScore.textContent = String(G.score);
    elBest.textContent = String(Math.max(bestScore, G.score));
    elLevel.textContent = (G.level + 1) + '/3 ' + G.def.name.replace(/^第.站 · /, '');
    // 生命
    var html = '';
    var ch = charDef();
    for (var i = 0; i < G.lives; i++) {
      html += '<span class="life-dot" style="background:' + ch.color + '"></span>';
    }
    elLives.innerHTML = html || '<span class="life-none">无</span>';
    // 护身（仅乃琳显示）
    if (ch.id === 'eileen') {
      elShield.innerHTML = '护身 <b>×' + G.shield + '</b>';
      elShield.style.display = '';
    } else {
      elShield.style.display = 'none';
    }
    elFx.style.display = 'none'; // 状态条随场景刷新
  }
  function updateFxBar() {
    if (G.frightTimer > 0) {
      showFx('甜蜜陷阱 ' + G.frightTimer.toFixed(1) + 's', G.frightTimer / G.frightMax, '#5a6cf0');
    } else if (G.player && G.player.boost > 0) {
      showFx('声波加速 ' + G.player.boost.toFixed(1) + 's', G.player.boost / TUNING.gladysBoostTime, '#38b6d8');
    } else {
      elFx.style.display = 'none';
    }
  }
  function showFx(label, frac, color) {
    elFx.style.display = '';
    fxLabel.textContent = label;
    fxBar.style.width = clamp(frac * 100, 0, 100) + '%';
    fxBar.style.background = color;
  }

  /* ============================ 场景 / 界面 ============================ */
  function charDef() {
    for (var i = 0; i < CHARACTERS.length; i++) {
      if (CHARACTERS[i].id === G.charId) return CHARACTERS[i];
    }
    return CHARACTERS[0];
  }
  function isUnlocked(ch) { return ch.unlockAt <= 0 || totalScore >= ch.unlockAt; }

  function hideScreens() {
    scrMenu.classList.add('hidden');
    scrCut.classList.add('hidden');
    scrPause.classList.add('hidden');
    scrSettle.classList.add('hidden');
  }

  function showMenu() {
    G.scene = 'menu';
    G.paused = false;
    hideScreens();
    scrMenu.classList.remove('hidden');
    AU.sirenStop();
    // 预览第一关迷宫作背景
    if (G.scene === 'menu' && (!G.staticCv || G.level !== 0)) buildLevel(0);
    applyMenuScores();
    buildCards();
    updateHUD();
  }

  function applyMenuScores() {
    menuBest.textContent = String(bestScore);
    menuTotal.textContent = String(totalScore);
  }

  /* 选人卡（含解锁进度条） */
  function buildCards() {
    var html = '';
    for (var i = 0; i < CHARACTERS.length; i++) {
      var ch = CHARACTERS[i];
      var unlocked = isUnlocked(ch);
      var selected = ch.id === G.charId;
      var cls = 'card' + (selected ? ' selected' : '') + (unlocked ? '' : ' locked');
      html += '<div class="' + cls + '" data-id="' + ch.id + '">';
      html += '<div class="card-img' + (ch.img.indexOf('.jpg') >= 0 ? ' round' : '') + '" style="border-color:' + ch.color + '">';
      html += '<img src="' + ch.img + '" alt="' + ch.name + '">';
      if (!unlocked) html += '<div class="card-lock">未解锁</div>';
      html += '</div>';
      html += '<div class="card-name" style="color:' + ch.color + '">' + ch.name + ' <small>' + ch.en + '</small></div>';
      html += '<div class="card-role">' + ch.role + '</div>';
      html += '<div class="card-passive">' + ch.passive + '</div>';
      if (unlocked) {
        html += '<div class="card-quote">「' + ch.quote + '」</div>';
      } else {
        var pct = clamp(totalScore / ch.unlockAt * 100, 0, 100);
        html += '<div class="card-progress"><div class="bar"><div class="fill" style="width:' + pct + '%;background:' + ch.color + '"></div></div>';
        html += '<div class="prog-txt">累计 ' + totalScore + ' / ' + ch.unlockAt + '</div></div>';
      }
      html += '</div>';
    }
    charCards.innerHTML = html;
    // 绑定点击
    var nodes = charCards.children;
    for (var j = 0; j < nodes.length; j++) {
      (function (node) {
        node.addEventListener('click', function () {
          var ch2 = null;
          for (var k = 0; k < CHARACTERS.length; k++) if (CHARACTERS[k].id === node.getAttribute('data-id')) ch2 = CHARACTERS[k];
          if (!ch2 || !isUnlocked(ch2)) return;
          G.charId = ch2.id;
          buildCards();
          AU.beep(660, 0.06, 'square', 0.08);
        });
      })(nodes[j]);
    }
  }

  function startGame(charId) {
    AU.init(); AU.resume();
    G.charId = charId;
    G.score = 0;
    G.lives = TUNING.lives;
    G.level = 0;
    G.paused = false;
    G.shield = (charDef().id === 'eileen') ? TUNING.eileenShield : 0; // 乃琳被动：每局 1 次护身
    buildLevel(0);
    updateHUD();
    showCutscene();
  }

  function showCutscene() {
    G.scene = 'cutscene';
    G.cutT = 2.8;
    hideScreens();
    var ch = charDef();
    cutLevel.textContent = G.def.name + '（第 ' + (G.level + 1) + ' 关）';
    cutQuote.textContent = '「' + ch.quote + '」';
    cutImg.src = ch.bubble;
    scrCut.classList.remove('hidden');
    updateHUD();
  }

  function beginReady() {
    hideScreens();
    G.scene = 'ready';
    G.readyT = 1.6;
  }

  function showSettle(win, newly) {
    G.scene = win ? 'victory' : 'gameover';
    hideScreens();
    var ch = charDef();
    settleTitle.textContent = win ? '午夜收货 · 满载而归' : '购物之夜 · 弹尽粮绝';
    settleTitle.style.color = win ? '#ffd27a' : '#8a90b8';
    settleImg.src = win ? ch.winImg : ch.loseImg;
    var lines = [];
    lines.push('本局得分：<b>' + G.score + '</b>');
    lines.push('历史最高：<b>' + bestScore + '</b>');
    lines.push('累计总分：<b>' + totalScore + '</b>（跨局解锁成员）');
    lines.push(win ? '三张地图全部打烊，满载而归！' : '3 条命用完了，下次加练！');
    settleLines.innerHTML = lines.join('<br>');
    var unlockHtml = '';
    for (var i = 0; i < newly.length; i++) {
      unlockHtml += '<div class="unlock-item" style="border-color:' + newly[i].color + '">新成员解锁：<b style="color:' + newly[i].color + '">' +
        newly[i].name + ' ' + newly[i].en + '</b> —— ' + newly[i].passive + '</div>';
    }
    settleUnlock.innerHTML = unlockHtml;
    scrSettle.classList.remove('hidden');
  }

  function togglePause() {
    if (G.scene !== 'playing' && G.scene !== 'ready') return;
    G.paused = !G.paused;
    if (G.paused) {
      scrPause.classList.remove('hidden');
      AU.sirenStop();
    } else {
      scrPause.classList.add('hidden');
      if (G.scene === 'playing') AU.sirenStart();
    }
  }

  function backToMenu() {
    G.paused = false;
    showMenu();
  }

  /* ============================ 输入 ============================ */
  var KEY_DIR = {
    ArrowUp: { x: 0, y: -1 }, KeyW: { x: 0, y: -1 },
    ArrowDown: { x: 0, y: 1 }, KeyS: { x: 0, y: 1 },
    ArrowLeft: { x: -1, y: 0 }, KeyA: { x: -1, y: 0 },
    ArrowRight: { x: 1, y: 0 }, KeyD: { x: 1, y: 0 }
  };

  function bindInput() {
    document.addEventListener('keydown', function (ev) {
      AU.init(); AU.resume();
      var code = ev.code;
      if (KEY_DIR[code]) {
        ev.preventDefault();
        if (G.player) G.player.want = { x: KEY_DIR[code].x, y: KEY_DIR[code].y };
        return;
      }
      switch (code) {
        case 'KeyM':
          AU.setMuted(!AU.muted);
          updateMuteLabel();
          break;
        case 'KeyP':
        case 'Escape':
          ev.preventDefault();
          if (G.scene === 'playing' || G.scene === 'ready') togglePause();
          break;
        case 'Enter':
        case 'Space':
          ev.preventDefault();
          if (G.scene === 'menu') startGame(G.charId);
          else if (G.scene === 'cutscene' && G.cutT < 2.4) beginReady();
          else if (G.scene === 'gameover' || G.scene === 'victory') startGame(G.charId);
          break;
        case 'KeyR':
          if (G.scene === 'gameover' || G.scene === 'victory') startGame(G.charId);
          break;
        default:
          // 过场阶段：任意键出发（防误触：过场前 0.4 秒内不响应）
          if (G.scene === 'cutscene' && G.cutT < 2.4) beginReady();
          break;
      }
    });
    // 切出窗口自动暂停
    window.addEventListener('blur', function () {
      if (G.scene === 'playing' && !G.paused) togglePause();
    });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && G.scene === 'playing' && !G.paused) togglePause();
    });
  }

  function bindButtons() {
    $('btnStart').addEventListener('click', function () { startGame(G.charId); });
    $('btnMute').addEventListener('click', function () {
      AU.init(); AU.resume();
      AU.setMuted(!AU.muted);
      updateMuteLabel();
    });
    $('btnPause').addEventListener('click', function () { togglePause(); });
    $('btnResume').addEventListener('click', function () { togglePause(); });
    $('btnQuit').addEventListener('click', function () { backToMenu(); });
    $('btnRetry').addEventListener('click', function () { startGame(G.charId); });
    $('btnMenu2').addEventListener('click', function () { backToMenu(); });
    // 过场点击直接开打
    scrCut.addEventListener('click', function () {
      if (G.scene === 'cutscene' && G.cutT < 2.4) beginReady();
    });
  }

  function updateMuteLabel() {
    btnMute.textContent = AU.muted ? '音效:关 (M)' : '音效:开 (M)';
  }

  /* ============================ 主循环 ============================ */
  var lastTs = 0, acc = 0;
  function frame(ts) {
    requestAnimationFrame(frame);
    if (!lastTs) lastTs = ts;
    var dt = (ts - lastTs) / 1000;
    lastTs = ts;
    if (dt > 0.1) dt = 0.1;   // 切页后回来不做大步飞跃
    if (!G.paused) {
      acc += dt;
      var guard = 0;
      while (acc >= STEP && guard++ < 12) {
        update(STEP);
        acc -= STEP;
      }
    }
    draw();
  }

  /* ============================ 启动 ============================ */
  function init() {
    cv = $('game');
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = W * dpr; cv.height = H * dpr;
    ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr);

    elScore = $('hudScore'); elBest = $('hudBest'); elLevel = $('hudLevel');
    elLives = $('hudLives'); elShield = $('hudShield'); elFx = $('hudFx');
    fxBar = $('fxBar'); fxLabel = $('fxLabel');
    btnMute = $('btnMute');
    scrMenu = $('scrMenu'); scrCut = $('scrCut'); scrPause = $('scrPause'); scrSettle = $('scrSettle');
    charCards = $('charCards');
    menuBest = $('menuBest'); menuTotal = $('menuTotal');
    cutLevel = $('cutLevel'); cutQuote = $('cutQuote'); cutImg = $('cutImg');
    settleTitle = $('settleTitle'); settleImg = $('settleImg');
    settleLines = $('settleLines'); settleUnlock = $('settleUnlock');

    preloadImages();
    bindInput();
    bindButtons();
    updateMuteLabel();
    showMenu();
    requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
