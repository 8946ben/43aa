/* ============================================================
 * 《守护五周年 · 应援防线》 主逻辑 —— js/game.js
 * ------------------------------------------------------------
 * 经典塔防：敌人沿固定路径参数化推进，塔以射程圈索敌 +
 * 冷却计时开火。全部渲染在 960×640 canvas 上完成，
 * HUD 与菜单/图鉴/结算使用 HTML 覆盖层。
 *
 * 依赖：js/data.js（须先于本文件引入）
 * ============================================================ */
(function () {
  'use strict';

  var TAU = Math.PI * 2;
  var RAD = Math.PI / 180;

  /* ================= 小工具 ================= */
  function $(id) { return document.getElementById(id); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function len(x, y) { return Math.sqrt(x * x + y * y); }
  function dist2(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  /* 圆角矩形路径（不依赖 ctx.roundRect，兼容旧浏览器） */
  function rr(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }
  var LV_ROMAN = ['I', 'II', 'III'];

  /* ================= 音效模块（WebAudio 合成，零素材） ================= */
  var Sfx = {
    ctx: null,
    master: null,
    muted: false,
    lastPlay: {},           // 同名音效节流表
    init: function () {
      if (this.ctx) return;
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.45;
        this.master.connect(this.ctx.destination);
      } catch (e) { this.ctx = null; }
    },
    resume: function () {
      if (this.ctx && this.ctx.state === 'suspended') { try { this.ctx.resume(); } catch (e) {} }
    },
    setMuted: function (m) { this.muted = m; },
    /* 基础合成音：频率从 f0 滑到 f1，指数包络 */
    tone: function (f0, f1, dur, type, vol, delay) {
      if (!this.ctx || this.muted) return;
      try {
        var t0 = this.ctx.currentTime + (delay || 0);
        var o = this.ctx.createOscillator();
        var g = this.ctx.createGain();
        o.type = type || 'sine';
        o.frequency.setValueAtTime(Math.max(1, f0), t0);
        o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        o.connect(g); g.connect(this.master);
        o.start(t0); o.stop(t0 + dur + 0.05);
      } catch (e) {}
    },
    play: function (name) {
      if (this.muted || !this.ctx) return;
      var now = performance.now();
      if (this.lastPlay[name] && now - this.lastPlay[name] < 50) return; // 节流
      this.lastPlay[name] = now;
      var T = this.tone.bind(this);
      switch (name) {
        case 'click':        T(700, 700, 0.05, 'square', 0.07); break;
        case 'build':        T(440, 660, 0.10, 'triangle', 0.24); T(660, 990, 0.12, 'triangle', 0.20, 0.09); break;
        case 'upgrade':      T(523, 523, 0.09, 'triangle', 0.22); T(659, 659, 0.09, 'triangle', 0.22, 0.08); T(784, 784, 0.16, 'triangle', 0.24, 0.16); break;
        case 'sell':         T(660, 440, 0.12, 'sine', 0.20); T(440, 220, 0.16, 'sine', 0.16, 0.10); break;
        case 'error':        T(180, 130, 0.15, 'square', 0.14); break;
        case 'hit':          T(900, 700, 0.03, 'square', 0.03); break;
        case 'kill':         T(520, 920, 0.07, 'triangle', 0.13); break;
        case 'shoot_bella':  T(1250, 850, 0.05, 'sawtooth', 0.05); break;
        case 'shoot_diana':  T(340, 200, 0.10, 'sine', 0.11); break;
        case 'splat':        T(240, 110, 0.12, 'triangle', 0.14); break;
        case 'shoot_gladys': T(1500, 420, 0.20, 'sawtooth', 0.08); break;
        case 'pulse':        T(210, 90, 0.09, 'square', 0.10); break;
        case 'charm':        T(880, 1320, 0.16, 'sine', 0.10); T(1100, 1650, 0.16, 'sine', 0.08, 0.06); break;
        case 'boost':        T(200, 400, 0.25, 'sawtooth', 0.14); break;
        case 'leak':         T(240, 90, 0.40, 'sawtooth', 0.26); break;
        case 'wave':         T(392, 392, 0.10, 'triangle', 0.20); T(523, 523, 0.10, 'triangle', 0.20, 0.10); T(659, 659, 0.18, 'triangle', 0.22, 0.20); break;
        case 'clear':        T(659, 659, 0.08, 'triangle', 0.18); T(784, 784, 0.14, 'triangle', 0.20, 0.08); break;
        case 'win':          T(523, 523, 0.12, 'triangle', 0.24); T(659, 659, 0.12, 'triangle', 0.24, 0.12); T(784, 784, 0.12, 'triangle', 0.24, 0.24); T(1046, 1046, 0.14, 'triangle', 0.26, 0.36); T(1318, 1318, 0.34, 'triangle', 0.28, 0.50); T(262, 262, 0.60, 'sine', 0.18, 0.36); break;
        case 'lose':         T(392, 392, 0.25, 'sine', 0.24); T(330, 330, 0.25, 'sine', 0.24, 0.22); T(262, 262, 0.25, 'sine', 0.22, 0.44); T(196, 150, 0.55, 'sine', 0.24, 0.66); break;
      }
    }
  };

  /* ================= 素材加载 ================= */
  var IMG = {};        // key -> Image 对象
  var imgLoaded = 0;   // 已完成数（仅用于调试，渲染自动兜底）
  function loadAssets() {
    var keys = Object.keys(DATA.ASSETS);
    keys.forEach(function (k) {
      var img = new Image();
      img.onload = function () { imgLoaded++; };
      img.onerror = function () { /* 缺素材时绘制层会自动用应援色圆底兜底 */ };
      img.src = DATA.ASSETS[k].src;
      IMG[k] = img;
    });
  }
  /* 头像绘制：圆形裁剪 + 应援色垫底；白底 JPG 放大裁边；
   * 图片缺失时退化为"应援色圆 + 成员名首字"。 */
  function drawAvatar(c, key, x, y, r, color, label) {
    var info = DATA.ASSETS[key] || {};
    var img = IMG[key];
    var ok = img && img.complete && img.naturalWidth > 0;
    c.save();
    c.beginPath();
    c.arc(x, y, r, 0, TAU);
    c.clip();
    c.fillStyle = color;
    c.fillRect(x - r, y - r, r * 2, r * 2);
    if (ok) {
      var zoom = info.flat ? 1.22 : 1.06;   // 白底 JPG 放大裁掉白边
      var s = Math.max(r * 2 / img.naturalWidth, r * 2 / img.naturalHeight) * zoom;
      var w = img.naturalWidth * s, h = img.naturalHeight * s;
      c.drawImage(img, x - w / 2, y - h / 2, w, h);
    } else {
      c.fillStyle = 'rgba(255,255,255,0.92)';
      c.font = 'bold ' + Math.round(r * 1.1) + 'px "Microsoft YaHei", sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(label || '?', x, y + 1);
    }
    c.restore();
  }

  /* ================= 路径（参数化折线） ================= */
  var PATH = (function (pts) {
    var segs = [], total = 0, i, dx, dy, l;
    for (i = 0; i < pts.length - 1; i++) {
      dx = pts[i + 1][0] - pts[i][0];
      dy = pts[i + 1][1] - pts[i][1];
      l = len(dx, dy);
      segs.push({ x: pts[i][0], y: pts[i][1], dx: dx / l, dy: dy / l, l: l, acc: total });
      total += l;
    }
    return { pts: pts, segs: segs, total: total };
  })(DATA.PATH_POINTS);

  /* 距离 -> 路径上的坐标 */
  function pathPoint(d) {
    d = clamp(d, 0, PATH.total);
    var segs = PATH.segs, i, seg;
    for (i = 0; i < segs.length; i++) {
      seg = segs[i];
      if (d <= seg.acc + seg.l || i === segs.length - 1) {
        return { x: seg.x + seg.dx * (d - seg.acc), y: seg.y + seg.dy * (d - seg.acc) };
      }
    }
    return { x: segs[segs.length - 1].x, y: segs[segs.length - 1].y };
  }

  /* ================= 游戏状态 ================= */
  var canvas, ctx, bgCanvas;      // 画布与预渲染背景
  var D = {};                     // DOM 元素缓存
  var OVERLAY_IDS = ['overlay-menu', 'overlay-towers', 'overlay-enemies', 'overlay-help', 'overlay-result', 'overlay-pause'];

  var G = {
    state: 'menu',       // menu | playing | paused | win | lose
    time: 0,             // 游戏内时间（受暂停/倍速影响）
    gold: 0, lives: 0, kills: 0,
    speed: 1, muted: false,
    waveIndex: -1,       // 已开始的最后一波下标（-1 = 尚未开始）
    waveActive: false, countdown: 0, waveTime: 0,
    spawnQueue: [],      // [{at, t, m}] 本波出怪时间表
    enemies: [], towers: [], projectiles: [], beams: [], particles: [], popups: [],
    spotTower: [],       // 空地下标 -> 塔（null 为空）
    ringMenu: null,      // 打开环形菜单的空地下标
    selTower: null,      // 当前选中（查看射程/升级/卖出）的塔
    hoverSpot: -1, hoverTower: null, hoverSlice: -1,
    mouse: { x: -99, y: -99 },
    shake: 0, leakFlash: 0,
    banner: null,        // {text, sub, t}
    bossPulse: null      // Boss 光环特效 {x, y, t}
  };

  var hudCache = {};   // HUD 脏检查缓存

  /* ================= 本地存档（最高星 / 最远波次） ================= */
  function loadBest() {
    try {
      var s = localStorage.getItem('guardtour_best_v1');
      if (s) { var v = JSON.parse(s); return { bestStars: v.bestStars | 0, bestWave: v.bestWave | 0 }; }
    } catch (e) {}
    return { bestStars: 0, bestWave: 0 };
  }
  function saveBest(b) {
    try { localStorage.setItem('guardtour_best_v1', JSON.stringify(b)); } catch (e) {}
  }
  function loadMute() {
    try { return localStorage.getItem('guardtour_mute_v1') === '1'; } catch (e) { return false; }
  }
  function saveMute(m) {
    try { localStorage.setItem('guardtour_mute_v1', m ? '1' : '0'); } catch (e) {}
  }

  /* ================= 波次控制 ================= */
  /* 由波次数据生成本波出怪时间表 */
  function buildSpawnQueue(waveDef) {
    var list = [];
    waveDef.groups.forEach(function (g) {
      for (var i = 0; i < g.n; i++) {
        list.push({ at: g.d + i * g.iv, t: g.t, m: g.m });
      }
    });
    list.sort(function (a, b) { return a.at - b.at; });
    return list;
  }

  function startWave() {
    if (G.waveIndex >= DATA.WAVES.length - 1) return;
    G.waveIndex++;
    var wv = DATA.WAVES[G.waveIndex];
    G.spawnQueue = buildSpawnQueue(wv);
    G.waveTime = 0;
    G.waveActive = true;
    G.banner = {
      text: '第 ' + (G.waveIndex + 1) + ' 波',
      sub: G.waveIndex === DATA.WAVES.length - 1 ? '最终波 —— 虚无之主降临！' : '',
      t: 0
    };
    Sfx.play('wave');
  }

  /* 波间提前召唤：按剩余秒数发奖励（第一波不奖励） */
  function callNextWave() {
    if (G.state !== 'playing' || G.waveActive) return;
    if (G.waveIndex >= 0 && G.countdown > 0) {
      var bonus = Math.ceil(G.countdown * DATA.CONF.earlyBonus);
      G.gold += bonus;
      addPopup(480, 120, '提前召唤 +' + bonus + ' 金', '#ffd76e');
    }
    startWave();
  }

  /* ================= 敌人 ================= */
  function spawnEnemy(typeKey, hpMul) {
    var def = DATA.ENEMIES[typeKey];
    if (!def) return;
    var e = {
      key: typeKey, def: def,
      hp: def.hp * hpMul, maxHp: def.hp * hpMul,
      dist: 0, baseSpeed: def.speed, r: def.r,
      x: DATA.PATH_POINTS[0][0], y: DATA.PATH_POINTS[0][1],
      alive: true, leaked: false,
      slowF: 1, slowUntil: 0, charmUntil: 0, boostUntil: 0,
      sprintClock: Math.random() * 2.2, sprinting: false,
      auraCd: 4, hitFlash: 0, bobSeed: Math.random() * TAU
    };
    G.enemies.push(e);
  }

  /* 敌人当前实际移速：基础 * 冲刺 * 减速 * Boss光环，被魅惑时为 0 */
  function enemySpeed(e, now) {
    var sp = e.baseSpeed;
    if (e.def.sprint && e.sprinting) sp *= 2.1;
    if (now < e.slowUntil) sp *= e.slowF;
    if (now < e.boostUntil) sp *= 1.6;
    if (now < e.charmUntil) sp = 0;
    return sp;
  }

  function updateEnemies(dt) {
    var now = G.time;
    for (var i = 0; i < G.enemies.length; i++) {
      var e = G.enemies[i];
      if (!e.alive) continue;
      e.hitFlash = Math.max(0, e.hitFlash - dt);

      /* 节奏风暴：2.2s 一轮，后 0.9s 冲刺 */
      if (e.def.sprint) {
        e.sprintClock = (e.sprintClock + dt) % 2.2;
        e.sprinting = e.sprintClock > 1.3;
      }

      /* Boss 技能「冷言冷语」：周期性加速周围小怪 */
      if (e.def.boss) {
        e.auraCd -= dt;
        if (e.auraCd <= 0) {
          e.auraCd = 6;
          G.bossPulse = { x: e.x, y: e.y, t: 0 };
          for (var j = 0; j < G.enemies.length; j++) {
            var o = G.enemies[j];
            if (o !== e && o.alive && dist2(o.x, o.y, e.x, e.y) < 140 * 140) {
              o.boostUntil = now + 2.5;
            }
          }
          Sfx.play('boost');
        }
      }

      e.dist += enemySpeed(e, now) * dt;
      if (e.dist >= PATH.total) { leakEnemy(e); continue; }
      var p = pathPoint(e.dist);
      e.x = p.x; e.y = p.y;
    }
    /* 清理阵亡/漏怪 */
    G.enemies = G.enemies.filter(function (e) { return e.alive; });
  }

  function applyDamage(e, dmg) {
    if (!e.alive) return;
    e.hp -= dmg;
    e.hitFlash = 0.08;
    Sfx.play('hit');
    if (e.hp <= 0) killEnemy(e);
  }

  function killEnemy(e) {
    e.alive = false;
    G.kills++;
    G.gold += e.def.gold;
    addPopup(e.x, e.y - e.r - 6, '+' + e.def.gold, '#ffd76e');
    for (var i = 0; i < (e.def.boss ? 26 : 8); i++) {
      G.particles.push({
        x: e.x, y: e.y,
        vx: rand(-90, 90), vy: rand(-120, 30),
        life: rand(0.3, 0.7), max: 0.7, r: rand(1.5, 3.5),
        color: e.def.boss ? '#a06bff' : '#6b5b95'
      });
    }
    Sfx.play('kill');
    if (e.def.boss) { G.shake = 6; }
  }

  function leakEnemy(e) {
    e.alive = false;
    e.leaked = true;
    G.lives -= e.def.lives;
    G.shake = 8;
    G.leakFlash = 1;
    addPopup(860, 300, '灯要灭了！-' + e.def.lives + ' 耐久', '#ff7a8a');
    Sfx.play('leak');
    if (G.lives <= 0) {
      G.lives = 0;
      gameOver(false);
    }
  }

  /* ================= 塔：建造 / 升级 / 出售 ================= */
  function towerStatLines(def, lv) {
    /* 生成面板用的属性文本（按塔种区分） */
    switch (def.key) {
      case 'bella':  return '伤害 ' + lv.dmg + ' ｜ 攻速 ' + lv.interval.toFixed(2) + 's ｜ 射程 ' + lv.range;
      case 'diana':  return '伤害 ' + lv.dmg + ' ｜ 溅射 ' + lv.splash + ' ｜ 减速 ' + Math.round((1 - lv.slow) * 100) + '% ｜ 射程 ' + lv.range;
      case 'eileen': return '光环 ' + lv.dps + '/s ｜ 魅惑 ' + lv.charmDur.toFixed(1) + 's ｜ 射程 ' + lv.range;
      case 'fiona':  return '冲击 ' + lv.dmg + '（全体）｜ 攻速 ' + lv.interval.toFixed(2) + 's ｜ 射程 ' + lv.range;
      case 'gladys': return '音波 ' + lv.dmg + '（贯穿）｜ 攻速 ' + lv.interval.toFixed(2) + 's ｜ 射程 ' + lv.range;
    }
    return '';
  }

  function tryBuild(spotIdx, towerKey) {
    var def = DATA.TOWERS[towerKey];
    if (!def || G.spotTower[spotIdx]) return;
    if (G.gold < def.cost) {
      addPopup(DATA.BUILD_SPOTS[spotIdx][0], DATA.BUILD_SPOTS[spotIdx][1] - 30, '应援值不足！', '#ff7a8a');
      Sfx.play('error');
      G.ringMenu = null;
      return;
    }
    G.gold -= def.cost;
    var sp = DATA.BUILD_SPOTS[spotIdx];
    var t = {
      key: towerKey, def: def, spot: spotIdx, x: sp[0], y: sp[1],
      level: 0, invested: def.cost,
      cd: 0, tickT: 0, charmT: 0, pulseT: 1, angle: -Math.PI / 2
    };
    G.towers.push(t);
    G.spotTower[spotIdx] = t;
    G.ringMenu = null;
    addPopup(t.x, t.y - 34, '-' + def.cost, '#ffb3c7');
    Sfx.play('build');
  }

  function upgradeTower(t) {
    if (!t || t.level >= 2) return;
    var cost = t.def.upCosts[t.level];
    if (G.gold < cost) {
      addPopup(t.x, t.y - 34, '应援值不足！', '#ff7a8a');
      Sfx.play('error');
      return;
    }
    G.gold -= cost;
    t.invested += cost;
    t.level++;
    for (var i = 0; i < 10; i++) {
      G.particles.push({
        x: t.x, y: t.y, vx: rand(-60, 60), vy: rand(-100, -20),
        life: rand(0.3, 0.6), max: 0.6, r: rand(1.5, 3), color: t.def.color
      });
    }
    addPopup(t.x, t.y - 34, '升级！Lv.' + (t.level + 1), t.def.color);
    Sfx.play('upgrade');
    showTowerPanel(t);   // 刷新面板
  }

  function sellTower(t) {
    if (!t) return;
    var refund = Math.floor(t.invested * DATA.CONF.sellRate);
    G.gold += refund;
    addPopup(t.x, t.y - 34, '+' + refund, '#ffd76e');
    G.spotTower[t.spot] = null;
    G.towers.splice(G.towers.indexOf(t), 1);
    if (G.selTower === t) { G.selTower = null; hideTowerPanel(); }
    Sfx.play('sell');
  }

  /* ================= 塔：索敌与开火 ================= */
  /* 射程圈内取"沿路径走得最远"的敌人（经典 TD 索敌） */
  function acquireTarget(t, range) {
    var best = null, bestDist = -1, r2;
    for (var i = 0; i < G.enemies.length; i++) {
      var e = G.enemies[i];
      if (!e.alive) continue;
      r2 = (range + e.r) * (range + e.r);
      if (dist2(t.x, t.y, e.x, e.y) <= r2 && e.dist > bestDist) {
        best = e; bestDist = e.dist;
      }
    }
    return best;
  }

  function enemyInRadius(x, y, radius, fn) {
    var r2 = radius * radius;
    for (var i = 0; i < G.enemies.length; i++) {
      var e = G.enemies[i];
      if (e.alive && dist2(x, y, e.x, e.y) <= r2 + e.r * e.r + 2 * radius * e.r) {
        fn(e);
      }
    }
  }

  function updateTowers(dt) {
    var now = G.time;
    for (var i = 0; i < G.towers.length; i++) {
      var t = G.towers[i];
      var lv = t.def.levels[t.level];
      t.pulseT = Math.min(1, t.pulseT + dt / 0.35);

      if (t.def.key === 'bella') {
        /* 单体速射激光：命中即伤 */
        t.cd -= dt;
        if (t.cd <= 0) {
          var tgt = acquireTarget(t, lv.range);
          if (tgt) {
            t.cd = lv.interval;
            t.angle = Math.atan2(tgt.y - t.y, tgt.x - t.x);
            applyDamage(tgt, lv.dmg);
            G.beams.push({ x1: t.x, y1: t.y, x2: tgt.x, y2: tgt.y, life: 0.09, max: 0.09, color: t.def.color, w: 2.5 });
            Sfx.play('shoot_bella');
          }
        }
      } else if (t.def.key === 'gladys') {
        /* 直线穿透音波 */
        t.cd -= dt;
        if (t.cd <= 0) {
          var gt = acquireTarget(t, lv.range);
          if (gt) {
            t.cd = lv.interval;
            t.angle = Math.atan2(gt.y - t.y, gt.x - t.x);
            var dirx = Math.cos(t.angle), diry = Math.sin(t.angle);
            var reach = lv.range + 40;
            var ex = t.x + dirx * reach, ey = t.y + diry * reach;
            G.beams.push({ x1: t.x, y1: t.y, x2: ex, y2: ey, life: 0.18, max: 0.18, color: t.def.color, w: 6 });
            for (var k = 0; k < G.enemies.length; k++) {
              var e2 = G.enemies[k];
              if (!e2.alive) continue;
              var px = e2.x - t.x, py = e2.y - t.y;
              var along = px * dirx + py * diry;
              var perp = Math.abs(px * diry - py * dirx);
              if (along > 0 && along < reach && perp < e2.r + 9) applyDamage(e2, lv.dmg);
            }
            Sfx.play('shoot_gladys');
          }
        }
      } else if (t.def.key === 'fiona') {
        /* 劲舞冲击波：范围全体近战拦截 */
        t.cd -= dt;
        if (t.cd <= 0) {
          var has = false;
          enemyInRadius(t.x, t.y, lv.range, function () { has = true; });
          if (has) {
            t.cd = lv.interval;
            t.pulseT = 0;
            enemyInRadius(t.x, t.y, lv.range, function (e3) { applyDamage(e3, lv.dmg); });
            Sfx.play('pulse');
          }
        }
      } else if (t.def.key === 'eileen') {
        /* 魅力光环：持续伤害 + 周期魅惑 */
        t.tickT += dt;
        while (t.tickT >= 0.5) {
          t.tickT -= 0.5;
          enemyInRadius(t.x, t.y, lv.range, function (e4) { applyDamage(e4, lv.dps * 0.5); });
        }
        t.charmT += dt;
        if (t.charmT >= lv.charmEvery) {
          t.charmT = 0;
          var charmed = 0;
          enemyInRadius(t.x, t.y, lv.range, function (e5) {
            var dur = e5.def.boss ? lv.charmDur * 0.5 : lv.charmDur;  // Boss 抗性
            e5.charmUntil = now + dur;
            charmed++;
          });
          if (charmed > 0) {
            Sfx.play('charm');
            for (var h = 0; h < 5; h++) {
              G.particles.push({
                x: t.x + rand(-lv.range * 0.6, lv.range * 0.6), y: t.y + rand(-lv.range * 0.6, lv.range * 0.6),
                vx: rand(-15, 15), vy: rand(-50, -20),
                life: rand(0.5, 0.9), max: 0.9, r: rand(3, 5), color: '#ff9bb5', heart: true
              });
            }
          }
        }
      } else if (t.def.key === 'diana') {
        /* 投喂塔：抛物线蛋糕 + 溅射减速 */
        t.cd -= dt;
        if (t.cd <= 0) {
          var dt2 = acquireTarget(t, lv.range);
          if (dt2) {
            t.cd = lv.interval;
            t.angle = Math.atan2(dt2.y - t.y, dt2.x - t.x);
            var flight = Math.max(0.3, len(dt2.x - t.x, dt2.y - t.y) / 380);
            G.projectiles.push({
              sx: t.x, sy: t.y, tx: dt2.x, ty: dt2.y,
              target: dt2, t: 0, dur: flight, h: 55 + len(dt2.x - t.x, dt2.y - t.y) * 0.12,
              dmg: lv.dmg, splash: lv.splash, slow: lv.slow, slowDur: lv.slowDur, color: t.def.color
            });
            Sfx.play('shoot_diana');
          }
        }
      }
    }
  }

  function updateProjectiles(dt) {
    for (var i = G.projectiles.length - 1; i >= 0; i--) {
      var p = G.projectiles[i];
      /* 目标仍存活则追踪落点（轻微追踪，视觉自然） */
      if (p.target && p.target.alive && !p.target.leaked) { p.tx = p.target.x; p.ty = p.target.y; }
      p.t += dt / p.dur;
      if (p.t >= 1) {
        /* 落地：溅射 + 减速 */
        enemyInRadius(p.tx, p.ty, p.splash, function (e) {
          applyDamage(e, p.dmg);
          var f = e.def.boss ? 1 - (1 - p.slow) * 0.5 : p.slow;   // Boss 减速减半
          e.slowF = f;
          e.slowUntil = Math.max(e.slowUntil, G.time + p.slowDur);
        });
        for (var j = 0; j < 8; j++) {
          G.particles.push({
            x: p.tx, y: p.ty, vx: rand(-70, 70), vy: rand(-90, -10),
            life: rand(0.25, 0.5), max: 0.5, r: rand(1.5, 3), color: '#f7d9a0'
          });
        }
        Sfx.play('splat');
        G.projectiles.splice(i, 1);
      }
    }
  }

  function updateFx(dt) {
    var i;
    for (i = G.beams.length - 1; i >= 0; i--) {
      G.beams[i].life -= dt;
      if (G.beams[i].life <= 0) G.beams.splice(i, 1);
    }
    for (i = G.particles.length - 1; i >= 0; i--) {
      var pt = G.particles[i];
      pt.life -= dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vy += 160 * dt;
      if (pt.life <= 0) G.particles.splice(i, 1);
    }
    for (i = G.popups.length - 1; i >= 0; i--) {
      var pp = G.popups[i];
      pp.life -= dt;
      pp.y -= 26 * dt;
      if (pp.life <= 0) G.popups.splice(i, 1);
    }
    if (G.banner) {
      G.banner.t += dt;
      if (G.banner.t > 2.2) G.banner = null;
    }
    if (G.bossPulse) {
      G.bossPulse.t += dt;
      if (G.bossPulse.t > 0.5) G.bossPulse = null;
    }
  }

  function addPopup(x, y, text, color) {
    G.popups.push({ x: x, y: y, text: text, color: color || '#fff', life: 1.0, max: 1.0 });
  }

  /* ================= 胜负结算 ================= */
  function calcStars() {
    if (G.lives >= 9) return 3;
    if (G.lives >= 5) return 2;
    return 1;
  }

  function gameOver(win) {
    if (G.state === 'win' || G.state === 'lose') return;
    G.state = win ? 'win' : 'lose';
    var best = loadBest();
    if (win) {
      var stars = calcStars();
      best.bestStars = Math.max(best.bestStars, stars);
      best.bestWave = Math.max(best.bestWave, DATA.WAVES.length);
      Sfx.play('win');
    } else {
      best.bestWave = Math.max(best.bestWave, G.waveIndex + 1);
      Sfx.play('lose');
    }
    saveBest(best);
    showResult(win, stars);
  }

  function showResult(win, stars) {
    showOverlay('overlay-result');
    var img = $('res-img');
    img.src = win ? 'assets/acao_kaixin.png' : 'assets/res_fail.png';
    $('res-title').textContent = win ? '演唱会照常开演！' : '灯，暂时熄灭了……';
    $('res-title').style.color = win ? '#ffd76e' : '#ff7a8a';
    var starStr = '';
    if (win) {
      for (var i = 0; i < 3; i++) starStr += i < stars ? '★' : '☆';
    } else {
      starStr = '－ － －';
    }
    $('res-stars').textContent = starStr;
    $('res-quote').textContent = win
      ? '「五周年的灯，一盏都没灭！」——阿草开心到打滚。'
      : '「遇到困难的话……先睡一觉，明天再战！」——阿草向你看齐。';
    $('res-stats').innerHTML =
      '击杀敌人：<b>' + G.kills + '</b> 个<br>' +
      '剩余耐久：<b>' + G.lives + ' / ' + DATA.CONF.startLives + '</b><br>' +
      '坚持波次：<b>第 ' + clamp(G.waveIndex + 1, 1, DATA.WAVES.length) + ' / ' + DATA.WAVES.length + ' 波</b><br>' +
      '历史最佳：<b>' + (loadBest().bestStars > 0 ? loadBest().bestStars + ' 星' : '尚无') +
      ' · 最远第 ' + loadBest().bestWave + ' 波</b>';
  }

  /* ================= 流程控制 ================= */
  function resetGame() {
    G.time = 0;
    G.gold = DATA.CONF.startGold;
    G.lives = DATA.CONF.startLives;
    G.kills = 0;
    G.speed = 1;
    G.waveIndex = -1;
    G.waveActive = false;
    G.countdown = DATA.CONF.firstGap;
    G.waveTime = 0;
    G.spawnQueue = [];
    G.enemies = [];
    G.towers = [];
    G.projectiles = [];
    G.beams = [];
    G.particles = [];
    G.popups = [];
    G.spotTower = [];
    for (var i = 0; i < DATA.BUILD_SPOTS.length; i++) G.spotTower.push(null);
    G.ringMenu = null;
    G.selTower = null;
    G.hoverSpot = -1;
    G.hoverTower = null;
    G.hoverSlice = -1;
    G.shake = 0;
    G.leakFlash = 0;
    G.banner = null;
    G.bossPulse = null;
    hideTowerPanel();
  }

  function startGame() {
    resetGame();
    G.state = 'playing';
    showOverlay(null);
    Sfx.play('click');
  }

  function toMenu() {
    G.state = 'menu';
    showOverlay('overlay-menu');
    hideTowerPanel();
  }

  function togglePause() {
    if (G.state === 'playing') {
      G.state = 'paused';
      showOverlay('overlay-pause');
    } else if (G.state === 'paused') {
      G.state = 'playing';
      showOverlay(null);
    }
  }

  function toggleMute() {
    G.muted = !G.muted;
    Sfx.setMuted(G.muted);
    saveMute(G.muted);
    var label = G.muted ? '音效:关 (M)' : '音效:开 (M)';
    D.btnMute.textContent = label;
    D.btnMuteMenu.textContent = G.muted ? '音效：关' : '音效：开';
  }

  /* ================= 主更新 ================= */
  function update(dt) {
    G.time += dt;

    /* 波间倒计时 */
    if (!G.waveActive) {
      G.countdown -= dt;
      if (G.countdown <= 0) startWave();
    }

    /* 出怪 */
    G.waveTime += dt;
    while (G.spawnQueue.length && G.spawnQueue[0].at <= G.waveTime) {
      var s = G.spawnQueue.shift();
      spawnEnemy(s.t, s.m);
    }

    updateEnemies(dt);
    if (G.state !== 'playing') return;   // 漏怪可能已触发失败
    updateTowers(dt);
    updateProjectiles(dt);
    updateFx(dt);

    /* 清波判断 */
    if (G.waveActive && G.spawnQueue.length === 0 && G.enemies.length === 0) {
      var wv = DATA.WAVES[G.waveIndex];
      G.gold += wv.bonus;
      addPopup(480, 90, '清波奖励 +' + wv.bonus + ' 金', '#ffd76e');
      Sfx.play('clear');
      if (G.waveIndex >= DATA.WAVES.length - 1) {
        gameOver(true);
        return;
      }
      G.waveActive = false;
      G.countdown = DATA.CONF.waveGap;
    }
  }

  /* ================= 渲染 ================= */
  function prerenderBackground() {
    bgCanvas = document.createElement('canvas');
    bgCanvas.width = DATA.CONF.canvasW;
    bgCanvas.height = DATA.CONF.canvasH;
    var c = bgCanvas.getContext('2d');
    var W = DATA.CONF.canvasW, H = DATA.CONF.canvasH;
    var i, x, y;

    /* 舞馆地板：深紫渐变 */
    var grad = c.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#241436');
    grad.addColorStop(1, '#150c26');
    c.fillStyle = grad;
    c.fillRect(0, 0, W, H);

    /* 星点氛围 */
    c.fillStyle = 'rgba(255,255,255,0.35)';
    for (i = 0; i < 110; i++) {
      x = rand(0, W); y = rand(0, H);
      c.globalAlpha = rand(0.08, 0.4);
      c.fillRect(x, y, rand(1, 2.2), rand(1, 2.2));
    }
    c.globalAlpha = 1;

    /* 路径：外发光 -> 深底 -> 内面 -> 中央虚线（圆角拐弯） */
    function strokePath(w, color, dash) {
      c.save();
      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.lineWidth = w;
      c.strokeStyle = color;
      if (dash) c.setLineDash(dash);
      c.beginPath();
      var pts = DATA.PATH_POINTS;
      c.moveTo(pts[0][0], pts[0][1]);
      for (i = 1; i < pts.length - 1; i++) {
        c.arcTo(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], 26);
      }
      c.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
      c.stroke();
      c.restore();
    }
    strokePath(54, 'rgba(122,75,208,0.22)');
    strokePath(46, '#0e0819');
    strokePath(38, '#2a1b3d');
    strokePath(2, 'rgba(255,255,255,0.13)', [14, 12]);

    /* 出生点：虚无漩涡 */
    c.save();
    c.translate(8, 130);
    for (i = 0; i < 3; i++) {
      c.strokeStyle = 'rgba(122,75,208,' + (0.5 - i * 0.13) + ')';
      c.lineWidth = 3;
      c.beginPath();
      c.arc(0, 0, 14 + i * 8, i * 1.2, i * 1.2 + 4.2);
      c.stroke();
    }
    c.restore();

    /* 五周年舞台（右侧终点） */
    var sx = 915, sy = 320;
    var sg = c.createRadialGradient(sx, sy, 10, sx, sy, 90);
    sg.addColorStop(0, 'rgba(255,157,181,0.35)');
    sg.addColorStop(1, 'rgba(255,157,181,0)');
    c.fillStyle = sg;
    c.beginPath(); c.arc(sx, sy, 90, 0, TAU); c.fill();
    c.fillStyle = '#2a1440';
    c.strokeStyle = '#DB7D74';
    c.lineWidth = 3;
    c.beginPath(); c.arc(sx, sy, 56, 0, TAU); c.fill(); c.stroke();
    c.strokeStyle = 'rgba(231,153,176,0.6)';
    c.lineWidth = 1.5;
    c.beginPath(); c.arc(sx, sy, 47, 0, TAU); c.stroke();

    /* 可建空地格 */
    DATA.BUILD_SPOTS.forEach(function (sp) {
      rr(c, sp[0] - 24, sp[1] - 24, 48, 48, 10);
      c.fillStyle = 'rgba(255,255,255,0.05)';
      c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.16)';
      c.lineWidth = 1.5;
      c.stroke();
      c.strokeStyle = 'rgba(255,255,255,0.2)';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(sp[0] - 6, sp[1]); c.lineTo(sp[0] + 6, sp[1]);
      c.moveTo(sp[0], sp[1] - 6); c.lineTo(sp[0], sp[1] + 6);
      c.stroke();
    });

    /* 左下角 A-SOUL 字样 */
    c.fillStyle = 'rgba(255,255,255,0.14)';
    c.font = 'bold 13px "Microsoft YaHei", sans-serif';
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
    c.fillText('A-SOUL · 5TH ANNIVERSARY DEFENSE', 16, 626);
  }

  function drawDeco() {
    var t = G.time;
    /* 舞台聚光灯（两束摆动的光锥） */
    ctx.save();
    ctx.globalAlpha = 0.05 + 0.03 * Math.sin(t * 1.3);
    ctx.fillStyle = '#ff9bb5';
    ctx.beginPath();
    ctx.moveTo(915, 10);
    ctx.lineTo(915 - 60 + Math.sin(t * 0.7) * 30, 250);
    ctx.lineTo(915 + 60 + Math.sin(t * 0.7) * 30, 250);
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 0.05 + 0.03 * Math.sin(t * 1.1 + 2);
    ctx.fillStyle = '#9bb5ff';
    ctx.beginPath();
    ctx.moveTo(480, 0);
    ctx.lineTo(420 + Math.sin(t * 0.5 + 1) * 40, 180);
    ctx.lineTo(540 + Math.sin(t * 0.5 + 1) * 40, 180);
    ctx.closePath(); ctx.fill();
    ctx.restore();

    /* 舞台内容：logo + 五周年 */
    var logo = IMG.logo;
    if (logo && logo.complete && logo.naturalWidth > 0) {
      ctx.drawImage(logo, 915 - 26, 272 - 26, 52, 52);
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffd9e8';
    ctx.font = 'bold 20px "Microsoft YaHei", sans-serif';
    ctx.fillText('五周年', 915, 322);
    ctx.fillStyle = 'rgba(255,217,232,0.7)';
    ctx.font = 'bold 10px "Microsoft YaHei", sans-serif';
    ctx.fillText('L I V E', 915, 344);

    /* 阿草吉祥物：平时开心，漏怪时惊慌 */
    var acao = G.leakFlash > 0 ? IMG.acao_kunrao : IMG.acao_kaixin;
    var bob = Math.sin(t * 2.4) * 3;
    if (acao && acao.complete && acao.naturalWidth > 0) {
      ctx.drawImage(acao, 30, 560 + bob, 52, 52);
    }
  }

  function drawRanges() {
    /* 选中塔的射程圈 */
    function rangeCircle(x, y, r, color, strong) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fillStyle = strong ? hexA(color, 0.10) : hexA(color, 0.06);
      ctx.fill();
      ctx.setLineDash([8, 6]);
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = hexA(color, strong ? 0.8 : 0.4);
      ctx.stroke();
      ctx.restore();
    }
    if (G.selTower) {
      rangeCircle(G.selTower.x, G.selTower.y, G.selTower.def.levels[G.selTower.level].range, G.selTower.def.color, true);
    }
    /* 悬停已建塔：白色描边提示 */
    if (G.hoverTower && G.hoverTower !== G.selTower) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(G.hoverTower.x, G.hoverTower.y, 26, 0, TAU);
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
    /* 环形菜单悬停切片：预览该塔 1 级射程 */
    if (G.ringMenu !== null && G.hoverSlice >= 0) {
      var key = DATA.TOWER_ORDER[G.hoverSlice];
      var sp = DATA.BUILD_SPOTS[G.ringMenu];
      rangeCircle(sp[0], sp[1], DATA.TOWERS[key].levels[0].range, DATA.TOWERS[key].color, false);
    }
  }

  /* 颜色 -> rgba */
  function hexA(hex, a) {
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }

  function drawTowers() {
    var t, i;
    for (i = 0; i < G.towers.length; i++) {
      t = G.towers[i];
      ctx.save();
      ctx.translate(t.x, t.y);

      /* 底座 */
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.ellipse(0, 14, 22, 8, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#1c1130';
      ctx.beginPath(); ctx.arc(0, 0, 22, 0, TAU); ctx.fill();

      /* 应援色光环：层数随等级增加，缓慢旋转 */
      ctx.strokeStyle = t.def.color;
      ctx.lineWidth = 2.5;
      ctx.rotate(G.time * 0.8);
      ctx.beginPath(); ctx.arc(0, 0, 21, 0, TAU); ctx.stroke();
      if (t.level >= 1) { ctx.globalAlpha = 0.65; ctx.beginPath(); ctx.arc(0, 0, 25, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1; }
      if (t.level >= 2) { ctx.globalAlpha = 0.4; ctx.beginPath(); ctx.arc(0, 0, 29, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1; }
      ctx.rotate(-G.time * 0.8);

      /* 乃琳光环（常驻淡显） */
      if (t.def.key === 'eileen') {
        var r0 = t.def.levels[t.level].range;
        ctx.fillStyle = hexA(t.def.color, 0.08 + 0.03 * Math.sin(G.time * 3));
        ctx.beginPath(); ctx.arc(0, 0, r0, 0, TAU); ctx.fill();
        /* 环绕的小心心 */
        for (var hI = 0; hI < 3; hI++) {
          var ha = G.time * 1.6 + hI * TAU / 3;
          drawHeart(ctx, Math.cos(ha) * r0 * 0.62, Math.sin(ha) * r0 * 0.62, 7, 'rgba(255,155,181,0.85)');
        }
      }

      /* 心宜劲舞冲击波扩散环 */
      if (t.def.key === 'fiona' && t.pulseT < 1) {
        var pr = t.def.levels[t.level].range;
        var pt = t.pulseT;
        ctx.strokeStyle = hexA(t.def.color, 0.7 * (1 - pt));
        ctx.lineWidth = 4 * (1 - pt) + 1;
        ctx.beginPath(); ctx.arc(0, 0, pr * (0.25 + 0.75 * pt), 0, TAU); ctx.stroke();
      }

      /* 成员头像 */
      drawAvatar(ctx, 'tower_' + t.key, 0, 0, 16, t.def.color, t.def.member[0]);

      /* 等级星点 */
      ctx.fillStyle = '#ffd76e';
      for (var pI = 0; pI <= t.level; pI++) {
        ctx.beginPath();
        ctx.arc(-8 + pI * 8, 27, 2.4, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  /* ---------- 敌人矢量绘制 ---------- */
  function drawHeart(c, x, y, s, color) {
    c.save();
    c.translate(x, y);
    c.scale(s / 12, s / 12);
    c.fillStyle = color;
    c.beginPath();
    c.moveTo(0, 5);
    c.bezierCurveTo(-9, -3, -4, -11, 0, -5);
    c.bezierCurveTo(4, -11, 9, -3, 0, 5);
    c.fill();
    c.restore();
  }

  function drawEnemyBody(c, e, time) {
    var r = e.r, k = e.key;
    c.save();
    c.translate(e.x, e.y + Math.sin(time * 4 + e.bobSeed) * 1.5);

    if (k === 'douzi') {
      /* 黑子豆豆：黑色小团子 + 豆芽 + 怒目 */
      c.fillStyle = '#23232e';
      c.strokeStyle = '#0c0c12';
      c.lineWidth = 1.5;
      c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill(); c.stroke();
      c.strokeStyle = '#4d7a3a';
      c.beginPath(); c.moveTo(0, -r); c.lineTo(0, -r - 5); c.stroke();
      c.fillStyle = '#6aa14e';
      c.beginPath(); c.ellipse(3, -r - 5, 4, 2, -0.5, 0, TAU); c.fill();
      c.fillStyle = '#fff';
      c.beginPath(); c.arc(-r * 0.35, -r * 0.15, r * 0.24, 0, TAU); c.arc(r * 0.35, -r * 0.15, r * 0.24, 0, TAU); c.fill();
      c.fillStyle = '#111';
      c.beginPath(); c.arc(-r * 0.32, -r * 0.1, r * 0.1, 0, TAU); c.arc(r * 0.38, -r * 0.1, r * 0.1, 0, TAU); c.fill();
      c.strokeStyle = '#fff';
      c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(-r * 0.55, -r * 0.48); c.lineTo(-r * 0.18, -r * 0.36); c.moveTo(r * 0.55, -r * 0.48); c.lineTo(r * 0.18, -r * 0.36); c.stroke();
    } else if (k === 'gongshou') {
      /* 杠精弓手：瘦长身形 + 键盘弓 + 红头巾 */
      c.fillStyle = '#3d4356';
      c.strokeStyle = '#20242f';
      c.lineWidth = 1.5;
      c.beginPath(); c.ellipse(0, 1, r * 0.85, r * 1.1, 0, 0, TAU); c.fill(); c.stroke();
      c.fillStyle = '#c0392b';
      c.fillRect(-r * 0.8, -r * 0.72, r * 1.6, r * 0.3);
      c.strokeStyle = '#c9a15a';
      c.lineWidth = 2;
      c.beginPath(); c.arc(r * 1.1, 0, r * 0.75, -1.2, 1.2); c.stroke();
      c.strokeStyle = '#ddd';
      c.lineWidth = 1;
      c.beginPath(); c.moveTo(r * 1.1 + Math.cos(-1.2) * r * 0.75, Math.sin(-1.2) * r * 0.75); c.lineTo(r * 1.1 + Math.cos(1.2) * r * 0.75, Math.sin(1.2) * r * 0.75); c.stroke();
      c.fillStyle = '#fff';
      c.beginPath(); c.arc(-r * 0.25, -r * 0.25, r * 0.16, 0, TAU); c.arc(r * 0.2, -r * 0.25, r * 0.16, 0, TAU); c.fill();
      c.fillStyle = '#111';
      c.beginPath(); c.arc(-r * 0.22, -r * 0.22, r * 0.07, 0, TAU); c.arc(r * 0.23, -r * 0.22, r * 0.07, 0, TAU); c.fill();
    } else if (k === 'nvgong') {
      /* 数据女工：淡紫方块 + 眼镜 + 头戴式耳麦 */
      c.fillStyle = '#6b5b95';
      c.strokeStyle = '#463a68';
      c.lineWidth = 1.5;
      rr(c, -r * 0.85, -r * 0.85, r * 1.7, r * 1.7, r * 0.4);
      c.fill(); c.stroke();
      c.strokeStyle = '#eee';
      c.lineWidth = 1.4;
      c.beginPath(); c.arc(-r * 0.32, -r * 0.1, r * 0.26, 0, TAU); c.stroke();
      c.beginPath(); c.arc(r * 0.32, -r * 0.1, r * 0.26, 0, TAU); c.stroke();
      c.beginPath(); c.moveTo(-r * 0.06, -r * 0.1); c.lineTo(r * 0.06, -r * 0.1); c.stroke();
      c.strokeStyle = '#2c2440';
      c.beginPath(); c.arc(0, -r * 0.15, r * 0.95, Math.PI * 1.15, Math.PI * 1.85); c.stroke();
      c.fillStyle = '#2c2440';
      c.fillRect(-r, -r * 0.35, r * 0.22, r * 0.4);
      c.fillRect(r * 0.78, -r * 0.35, r * 0.22, r * 0.4);
    } else if (k === 'fengbao') {
      /* 节奏风暴：旋转漩涡，冲刺时拖尾 */
      if (e.sprinting) {
        c.strokeStyle = 'rgba(140,230,220,0.6)';
        c.lineWidth = 2;
        for (var li = 1; li <= 3; li++) {
          c.beginPath();
          c.moveTo(-r - li * 7, -4 + li * 3);
          c.lineTo(-r - li * 7 - 9, -4 + li * 3);
          c.stroke();
        }
      }
      c.fillStyle = '#1f5f5b';
      c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill();
      c.strokeStyle = '#8ce6dc';
      c.lineWidth = 2;
      var sw = time * 6;
      for (var si = 0; si < 3; si++) {
        c.beginPath();
        c.arc(0, 0, r * (0.85 - si * 0.26), sw + si * 2.1, sw + si * 2.1 + 1.8);
        c.stroke();
      }
      c.fillStyle = '#fff';
      c.beginPath(); c.arc(-r * 0.22, -r * 0.1, r * 0.13, 0, TAU); c.arc(r * 0.22, -r * 0.1, r * 0.13, 0, TAU); c.fill();
    } else if (k === 'tanke') {
      /* 虚无坦克：履带 + 装甲 + 紫色核心 */
      c.fillStyle = '#191322';
      rr(c, -r, r * 0.35, r * 2, r * 0.62, 4); c.fill();
      c.fillStyle = '#3a3350';
      for (var wi = 0; wi < 4; wi++) {
        c.beginPath(); c.arc(-r * 0.72 + wi * r * 0.48, r * 0.66, r * 0.16, 0, TAU); c.fill();
      }
      c.fillStyle = '#4a3f68';
      c.strokeStyle = '#2a2340';
      rr(c, -r * 0.92, -r * 0.55, r * 1.84, r * 1.05, 5);
      c.fill(); c.stroke();
      c.fillStyle = '#5d5184';
      c.beginPath(); c.arc(0, -r * 0.55, r * 0.55, Math.PI, 0); c.fill();
      var glow = 0.6 + 0.4 * Math.sin(time * 5);
      c.fillStyle = 'rgba(179,146,255,' + glow + ')';
      c.beginPath(); c.arc(0, -r * 0.62, r * 0.22, 0, TAU); c.fill();
      c.fillStyle = '#fff';
      c.fillRect(-r * 0.55, -r * 0.18, r * 0.4, r * 0.12);
      c.fillRect(r * 0.15, -r * 0.18, r * 0.4, r * 0.12);
    } else if (k === 'boss') {
      /* 虚无之主：巨大紫黑球体 + 金冠 + 灼目 */
      var bg = c.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.2, 0, 0, r);
      bg.addColorStop(0, '#4a2f7e');
      bg.addColorStop(1, '#150a26');
      c.fillStyle = bg;
      c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill();
      c.strokeStyle = '#7a4bd0';
      c.lineWidth = 2;
      c.stroke();
      /* 皇冠 */
      c.fillStyle = '#ffd76e';
      c.beginPath();
      c.moveTo(-r * 0.55, -r * 0.85);
      c.lineTo(-r * 0.35, -r * 1.25);
      c.lineTo(-r * 0.15, -r * 0.9);
      c.lineTo(0, -r * 1.32);
      c.lineTo(r * 0.15, -r * 0.9);
      c.lineTo(r * 0.35, -r * 1.25);
      c.lineTo(r * 0.55, -r * 0.85);
      c.closePath(); c.fill();
      /* 灼目 */
      c.fillStyle = '#ff5f7a';
      c.beginPath(); c.ellipse(-r * 0.32, -r * 0.1, r * 0.2, r * 0.1, 0.35, 0, TAU); c.fill();
      c.beginPath(); c.ellipse(r * 0.32, -r * 0.1, r * 0.2, r * 0.1, -0.35, 0, TAU); c.fill();
      /* 锯齿嘴 */
      c.strokeStyle = '#ff5f7a';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(-r * 0.4, r * 0.4);
      for (var ti = 0; ti < 4; ti++) {
        c.lineTo(-r * 0.4 + (ti + 0.5) * r * 0.2, r * 0.28);
        c.lineTo(-r * 0.4 + (ti + 1) * r * 0.2, r * 0.4);
      }
      c.stroke();
    }
    c.restore();
  }

  function drawEnemies() {
    /* 按 y 排序让下方敌人压在上方的，视觉自然 */
    var list = G.enemies.slice().sort(function (a, b) { return a.y - b.y; });
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      drawEnemyBody(ctx, e, G.time);

      /* 状态标记：减速(蓝环) / 魅惑(心) / 加速(红箭头) / 受击(白闪) */
      if (G.time < e.slowUntil) {
        ctx.strokeStyle = 'rgba(159,216,255,0.75)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 4, 0, TAU); ctx.stroke();
      }
      if (G.time < e.charmUntil) {
        drawHeart(ctx, e.x, e.y - e.r - 12, 9, '#ff9bb5');
      }
      if (G.time < e.boostUntil) {
        ctx.strokeStyle = 'rgba(255,122,110,0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(e.x - e.r - 8, e.y - 4); ctx.lineTo(e.x - e.r - 3, e.y); ctx.lineTo(e.x - e.r - 8, e.y + 4);
        ctx.stroke();
      }
      if (e.hitFlash > 0) {
        ctx.fillStyle = 'rgba(255,255,255,' + (e.hitFlash / 0.08 * 0.5) + ')';
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, TAU); ctx.fill();
      }
      /* 血条（满血不显示） */
      if (e.hp < e.maxHp) {
        var w = e.r * 2;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(e.x - w / 2, e.y - e.r - 8, w, 4);
        var frac = clamp(e.hp / e.maxHp, 0, 1);
        ctx.fillStyle = frac > 0.5 ? '#7ed957' : (frac > 0.25 ? '#ffd76e' : '#ff5f6d');
        ctx.fillRect(e.x - w / 2, e.y - e.r - 8, w * frac, 4);
      }
    }
  }

  function drawProjectiles() {
    for (var i = 0; i < G.projectiles.length; i++) {
      var p = G.projectiles[i];
      var t = Math.min(p.t, 1);
      var x = lerp(p.sx, p.tx, t);
      var y = lerp(p.sy, p.ty, t) - Math.sin(Math.PI * t) * p.h;
      /* 奶油蛋糕：双层 + 顶上草莓 */
      ctx.fillStyle = '#f6e0b8';
      ctx.beginPath(); ctx.arc(x, y, 7, 0, TAU); ctx.fill();
      ctx.fillStyle = '#e88ba0';
      ctx.beginPath(); ctx.arc(x, y - 2, 5, 0, TAU); ctx.fill();
      ctx.fillStyle = '#e5484d';
      ctx.beginPath(); ctx.arc(x, y - 6, 2.4, 0, TAU); ctx.fill();
    }
  }

  function drawBeams() {
    for (var i = 0; i < G.beams.length; i++) {
      var b = G.beams[i];
      var a = b.life / b.max;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.strokeStyle = b.color;
      ctx.lineWidth = b.w;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(b.x1, b.y1);
      ctx.lineTo(b.x2, b.y2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = Math.max(1, b.w * 0.35);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawParticles() {
    for (var i = 0; i < G.particles.length; i++) {
      var p = G.particles[i];
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      if (p.heart) {
        drawHeart(ctx, p.x, p.y, p.r * 2, p.color);
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawPopups() {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (var i = 0; i < G.popups.length; i++) {
      var p = G.popups[i];
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.font = 'bold 14px "Microsoft YaHei", sans-serif';
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 3;
      ctx.strokeText(p.text, p.x, p.y);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y);
    }
    ctx.globalAlpha = 1;
  }

  function drawRingMenu() {
    if (G.ringMenu === null) return;
    var c0 = ringCenter();
    var cx = c0.x, cy = c0.y;
    ctx.save();
    ctx.fillStyle = 'rgba(10,5,20,0.5)';
    ctx.beginPath(); ctx.arc(cx, cy, 92, 0, TAU); ctx.fill();

    for (var i = 0; i < DATA.TOWER_ORDER.length; i++) {
      var key = DATA.TOWER_ORDER[i];
      var def = DATA.TOWERS[key];
      var a0 = (-90 + i * 72 - 36) * RAD;
      var a1 = a0 + 72 * RAD;
      var mid = (-90 + i * 72) * RAD;
      var hover = (G.hoverSlice === i);
      var afford = G.gold >= def.cost;

      ctx.beginPath();
      ctx.arc(cx, cy, 86, a0, a1);
      ctx.arc(cx, cy, 27, a1, a0, true);
      ctx.closePath();
      if (hover) {
        ctx.fillStyle = hexA(def.color, 0.6);
      } else if (afford) {
        ctx.fillStyle = hexA(def.color, 0.32);
      } else {
        ctx.fillStyle = 'rgba(70,70,80,0.4)';
      }
      ctx.fill();
      ctx.strokeStyle = hover ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      /* 塔头像 + 价格 */
      var ix = cx + Math.cos(mid) * 55;
      var iy = cy + Math.sin(mid) * 55;
      ctx.globalAlpha = afford ? 1 : 0.45;
      drawAvatar(ctx, 'tower_' + key, ix, iy, 17, def.color, def.member[0]);
      ctx.globalAlpha = 1;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 11px "Microsoft YaHei", sans-serif';
      ctx.fillStyle = afford ? '#ffd76e' : '#ff7a8a';
      ctx.fillText(def.cost + '金', cx + Math.cos(mid) * 78, cy + Math.sin(mid) * 78);
      if (hover) {
        ctx.font = 'bold 13px "Microsoft YaHei", sans-serif';
        ctx.fillStyle = '#fff';
        ctx.fillText(def.name, cx, Math.max(14, cy - 102));
      }
    }
    /* 中心点 */
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath(); ctx.arc(cx, cy, 5, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function drawBanner() {
    if (!G.banner) return;
    var b = G.banner;
    var a = b.t < 0.3 ? b.t / 0.3 : (b.t > 1.7 ? clamp((2.2 - b.t) / 0.5, 0, 1) : 1);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 40px "Microsoft YaHei", sans-serif';
    ctx.strokeStyle = 'rgba(0,0,0,0.65)';
    ctx.lineWidth = 6;
    ctx.strokeText(b.text, 480, 300);
    ctx.fillStyle = '#ffd76e';
    ctx.fillText(b.text, 480, 300);
    if (b.sub) {
      ctx.font = 'bold 18px "Microsoft YaHei", sans-serif';
      ctx.strokeText(b.sub, 480, 340);
      ctx.fillStyle = '#ff9bb5';
      ctx.fillText(b.sub, 480, 340);
    }
    ctx.restore();
  }

  function drawBossBar() {
    var boss = null;
    for (var i = 0; i < G.enemies.length; i++) {
      if (G.enemies[i].def.boss && G.enemies[i].alive) { boss = G.enemies[i]; break; }
    }
    if (!boss) return;
    ctx.save();
    rr(ctx, 240, 12, 480, 18, 9);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fill();
    var frac = clamp(boss.hp / boss.maxHp, 0, 1);
    if (frac > 0) {
      rr(ctx, 242, 14, 476 * frac, 14, 7);
      ctx.fillStyle = '#7a4bd0';
      ctx.fill();
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 12px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#e8d9ff';
    ctx.fillText('虚无之主 ' + Math.ceil(boss.hp) + ' / ' + Math.ceil(boss.maxHp), 480, 21);
    ctx.restore();
  }

  function drawCountdown() {
    if (G.state !== 'playing' || G.waveActive) return;
    var sec = Math.ceil(G.countdown);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 22px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = 'rgba(255,215,110,' + (0.6 + 0.3 * Math.sin(G.time * 4)) + ')';
    ctx.fillText((G.waveIndex < 0 ? '准备开演  ' : '下一波  ') + sec + 's', 480, 30);
    ctx.restore();
  }

  function drawBossPulse() {
    if (!G.bossPulse) return;
    var p = G.bossPulse;
    var frac = p.t / 0.5;
    ctx.save();
    ctx.globalAlpha = 1 - frac;
    ctx.strokeStyle = '#ff5f7a';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 140 * frac, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  function render() {
    var W = DATA.CONF.canvasW, H = DATA.CONF.canvasH;
    ctx.save();
    /* 漏怪屏幕抖动 */
    if (G.shake > 0) {
      ctx.translate(rand(-G.shake, G.shake) * 0.5, rand(-G.shake, G.shake) * 0.5);
    }
    ctx.drawImage(bgCanvas, 0, 0);
    drawDeco();
    /* 悬停空地高亮 */
    if (G.hoverSpot >= 0 && !G.spotTower[G.hoverSpot] && G.ringMenu === null) {
      var hsp = DATA.BUILD_SPOTS[G.hoverSpot];
      rr(ctx, hsp[0] - 24, hsp[1] - 24, 48, 48, 10);
      ctx.fillStyle = 'rgba(255,215,110,0.14)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,215,110,0.75)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    drawRanges();
    drawTowers();
    drawEnemies();
    drawProjectiles();
    drawBeams();
    drawParticles();
    drawBossPulse();
    drawPopups();
    drawRingMenu();
    drawBanner();
    drawBossBar();
    drawCountdown();
    /* 漏怪红光提示 */
    if (G.leakFlash > 0) {
      ctx.fillStyle = 'rgba(255,60,80,' + (G.leakFlash * 0.22) + ')';
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  }

  /* ================= HUD ================= */
  function setTxt(id, v) {
    if (hudCache[id] !== v) {
      hudCache[id] = v;
      D[id].textContent = v;
    }
  }

  function updateHUD() {
    setTxt('hud-gold', Math.floor(G.gold));
    var wvShow = clamp(G.waveIndex + (G.waveActive ? 1 : 2), 1, DATA.WAVES.length);
    setTxt('hud-wave', wvShow + ' / ' + DATA.WAVES.length);
    setTxt('hud-lives', G.lives);
    setTxt('hud-kills', G.kills);

    /* 「下一波」按钮：波间可点（含奖励提示），进攻中禁用 */
    var btn = D.btnNext;
    var label, disabled;
    if (G.state === 'playing' && !G.waveActive) {
      disabled = false;
      label = G.waveIndex < 0 ? '开始防守!' : '下一波 +' + Math.ceil(G.countdown * DATA.CONF.earlyBonus) + ' (' + Math.ceil(G.countdown) + 's)';
    } else if (G.state === 'playing') {
      disabled = true;
      label = '进攻中…';
    } else {
      disabled = true;
      label = '下一波';
    }
    if (hudCache._next !== label) { hudCache._next = label; btn.textContent = label; }
    if (hudCache._nextD !== disabled) { hudCache._nextD = disabled; btn.disabled = disabled; }

    var spd = '倍速 x' + G.speed;
    if (hudCache._spd !== spd) { hudCache._spd = spd; D.btnSpeed.textContent = spd; }

    /* 面板打开时，升级按钮可负担状态随金币实时刷新 */
    var st = G.selTower;
    if (st && st.level < 2 && !D.towerPanel.classList.contains('hidden')) {
      var can = G.gold >= st.def.upCosts[st.level];
      if (hudCache._tpUpD !== can) { hudCache._tpUpD = can; D.tpUp.disabled = !can; }
    }
  }

  /* ================= 覆盖层 / 面板 ================= */
  function showOverlay(id) {
    OVERLAY_IDS.forEach(function (oid) {
      D[oid].classList.toggle('hidden', oid !== id);
    });
  }

  function showTowerPanel(t) {
    if (!t) { hideTowerPanel(); return; }
    D.towerPanel.classList.remove('hidden');
    D.tpAvatar.src = 'assets/tower_' + t.key + (t.key === 'fiona' || t.key === 'gladys' ? '.jpg' : '.png');
    D.tpAvatar.style.borderColor = t.def.color;
    var lv = t.def.levels[t.level];
    D.tpName.textContent = t.def.name + '  Lv.' + LV_ROMAN[t.level];
    D.tpName.style.color = t.def.color;
    D.tpStats.innerHTML =
      towerStatLines(t.def, lv) +
      '<br>DPS ≈ ' + (t.def.key === 'eileen'
        ? lv.dps + '（范围）'
        : Math.round(lv.dmg / lv.interval * 10) / 10 + (t.def.key === 'gladys' ? '（可穿透多目标）' : '')) +
      ' ｜ 已投入 ' + t.invested + ' 金';
    if (t.level >= 2) {
      D.tpUp.textContent = '已满级';
      D.tpUp.disabled = true;
      hudCache._tpUpD = null;
    } else {
      D.tpUp.textContent = '升级 ' + t.def.upCosts[t.level] + ' 金';
      D.tpUp.disabled = G.gold < t.def.upCosts[t.level];
      hudCache._tpUpD = !D.tpUp.disabled;
    }
    D.tpSell.textContent = '卖出 +' + Math.floor(t.invested * DATA.CONF.sellRate) + ' 金';
  }

  function hideTowerPanel() {
    D.towerPanel.classList.add('hidden');
  }

  /* ================= 输入 ================= */
  function canvasPos(ev) {
    var r = canvas.getBoundingClientRect();
    return {
      x: (ev.clientX - r.left) * (canvas.width / r.width),
      y: (ev.clientY - r.top) * (canvas.height / r.height)
    };
  }

  function spotAt(x, y, r) {
    for (var i = 0; i < DATA.BUILD_SPOTS.length; i++) {
      var sp = DATA.BUILD_SPOTS[i];
      if (dist2(x, y, sp[0], sp[1]) <= r * r) return i;
    }
    return -1;
  }

  function towerAt(x, y, r) {
    for (var i = 0; i < G.towers.length; i++) {
      var t = G.towers[i];
      if (dist2(x, y, t.x, t.y) <= r * r) return t;
    }
    return null;
  }

  /* 环形菜单圆心：贴近空地，但整体钳制在画布内（避免顶部空地被裁切）。
   * 绘制与命中判定必须使用同一圆心。 */
  function ringCenter() {
    var sp = DATA.BUILD_SPOTS[G.ringMenu];
    return {
      x: clamp(sp[0], 92, DATA.CONF.canvasW - 92),
      y: clamp(sp[1], 96, DATA.CONF.canvasH - 96)
    };
  }

  /* 环形菜单命中判定：半径 [27,86]，每片 72°，顶部为 0 号（贝拉） */
  function ringSliceAt(x, y) {
    var c = ringCenter();
    var dx = x - c.x, dy = y - c.y;
    var d = len(dx, dy);
    if (d < 27 || d > 86) return -1;
    var ang = Math.atan2(dy, dx) / RAD;   // -180..180
    var idx = Math.round((ang + 90) / 72); // 顶部=0
    idx = ((idx % 5) + 5) % 5;
    return idx;
  }

  function onMouseMove(ev) {
    var p = canvasPos(ev);
    G.mouse.x = p.x; G.mouse.y = p.y;
    G.hoverSpot = spotAt(p.x, p.y, 30);
    G.hoverTower = towerAt(p.x, p.y, 28);
    G.hoverSlice = (G.ringMenu !== null) ? ringSliceAt(p.x, p.y) : -1;
    canvas.style.cursor = (G.hoverSpot >= 0 || G.hoverTower || G.hoverSlice >= 0) ? 'pointer' : 'default';
  }

  function onClick(ev) {
    Sfx.init();
    Sfx.resume();
    if (G.state !== 'playing') return;
    var p = canvasPos(ev);
    var x = p.x, y = p.y;

    /* 1) 环形菜单切片优先 */
    if (G.ringMenu !== null) {
      var slice = ringSliceAt(x, y);
      if (slice >= 0) {
        tryBuild(G.ringMenu, DATA.TOWER_ORDER[slice]);
        return;
      }
      G.ringMenu = null;   // 点在菜单外 -> 继续往下判断
    }

    /* 2) 选中已建塔 */
    var t = towerAt(x, y, 28);
    if (t) {
      G.selTower = t;
      showTowerPanel(t);
      Sfx.play('click');
      return;
    }

    /* 3) 打开空地环形菜单 */
    var si = spotAt(x, y, 30);
    if (si >= 0 && !G.spotTower[si]) {
      G.ringMenu = si;
      G.selTower = null;
      hideTowerPanel();
      Sfx.play('click');
      return;
    }

    /* 4) 点空白：收起所有面板 */
    G.selTower = null;
    hideTowerPanel();
  }

  function onKey(ev) {
    Sfx.init();
    Sfx.resume();
    var k = ev.key;
    if (k === 'm' || k === 'M') { toggleMute(); return; }
    if (k === 'p' || k === 'P' || k === 'Escape') {
      if (G.state === 'playing' && (G.ringMenu !== null || G.selTower) && k === 'Escape') {
        G.ringMenu = null; G.selTower = null; hideTowerPanel();
        return;
      }
      togglePause();
    }
  }

  /* ================= 图鉴 / 帮助（HTML 生成） ================= */
  function towerCodexStats(def) {
    var l1 = def.levels[0], l3 = def.levels[2];
    function core(lv) {
      switch (def.key) {
        case 'bella':  return '伤害 ' + lv.dmg + ' · 攻速 ' + lv.interval.toFixed(2) + 's · 射程 ' + lv.range;
        case 'diana':  return '伤害 ' + lv.dmg + ' · 溅射 ' + lv.splash + ' · 减速 ' + Math.round((1 - lv.slow) * 100) + '% · 射程 ' + lv.range;
        case 'eileen': return '光环 ' + lv.dps + '/s · 魅惑 ' + lv.charmDur.toFixed(1) + 's · 射程 ' + lv.range;
        case 'fiona':  return '冲击 ' + lv.dmg + '（全体）· 攻速 ' + lv.interval.toFixed(2) + 's · 射程 ' + lv.range;
        case 'gladys': return '音波 ' + lv.dmg + '（贯穿）· 攻速 ' + lv.interval.toFixed(2) + 's · 射程 ' + lv.range;
      }
      return '';
    }
    return '1 级：' + core(l1) + '<br>3 级：' + core(l3);
  }

  function buildTowerCodex() {
    var html = '';
    DATA.TOWER_ORDER.forEach(function (key) {
      var d = DATA.TOWERS[key];
      var ext = (key === 'fiona' || key === 'gladys') ? '.jpg' : '.png';
      html += '<div class="card" style="border-top:4px solid ' + d.color + '">' +
        '<div class="card-head">' +
          '<img class="card-avatar" src="assets/tower_' + key + ext + '" alt="' + d.member + '" style="border-color:' + d.color + '">' +
          '<div><div class="card-title" style="color:' + d.color + '">' + d.name + '</div>' +
          '<div class="card-cost">造价 ' + d.cost + ' 金 ｜ 升级 ' + d.upCosts.join(' / ') + ' 金</div></div>' +
        '</div>' +
        '<div class="card-stats">' + towerCodexStats(d) + '</div>' +
        '<div class="card-desc">' + d.desc + '</div>' +
        '<div class="card-quote">' + d.quote + '</div>' +
        '</div>';
    });
    D.codexTowerList.innerHTML = html;
  }

  function buildEnemyCodex() {
    var html = '';
    var order = ['douzi', 'gongshou', 'nvgong', 'fengbao', 'tanke', 'boss'];
    order.forEach(function (key) {
      var d = DATA.ENEMIES[key];
      html += '<div class="card enemy-card">' +
        '<canvas class="enemy-preview" id="cv-' + key + '" width="76" height="76"></canvas>' +
        '<div><div class="card-title" style="color:#c9b8ff">' + d.name + '</div>' +
        '<div class="card-cost">血量 ' + d.hp + ' ｜ 速度 ' + d.speed + ' ｜ 击杀 +' + d.gold + ' 金 ｜ 突破 -' + d.lives + ' 耐久</div>' +
        '<div class="card-desc">' + d.desc + '</div></div>' +
        '</div>';
    });
    D.codexEnemyList.innerHTML = html;
    /* 用游戏内同款矢量函数画预览 */
    order.forEach(function (key) {
      var cv = $('cv-' + key);
      if (!cv || !cv.getContext) return;
      var c = cv.getContext('2d');
      var d = DATA.ENEMIES[key];
      var fake = {
        key: key, def: d, x: 38, y: 42, r: d.r * (d.boss ? 1.1 : 1.55),
        hp: 1, maxHp: 1, sprinting: false, hitFlash: 0, bobSeed: 0
      };
      drawEnemyBody(c, fake, 0.9);
    });
  }

  function buildHelp() {
    D.helpList.innerHTML =
      '<div class="help-item"><b>目标</b>：敌人（虚无 & 小黑子）从左侧入场，沿路进攻右侧五周年舞台。舞台耐久 10 点，漏怪扣耐久，归零则失败；撑过全部 15 波即胜利。</div>' +
      '<div class="help-item"><b>建造</b>：点击发光空地格 → 弹出环形菜单，点选成员塔（显示头像与价格）。</div>' +
      '<div class="help-item"><b>管理</b>：点击已建塔 → 查看射程圈，可升级（3 级）或卖出（返还 70% 投入）。</div>' +
      '<div class="help-item"><b>波次</b>：波与波之间有倒计时，点「下一波」提前召唤，剩余每 1 秒奖励 2 应援值。</div>' +
      '<div class="help-item"><b>经济</b>：击杀掉应援值，清波另有奖励。初始 220 金，后期补塔还是升级，请自行取舍。</div>' +
      '<div class="help-item"><b>五塔定位</b>：贝拉点名速射 ｜ 嘉然溅射减速 ｜ 乃琳光环控场 ｜ 心宜近身群伤 ｜ 思诺直线贯穿。</div>' +
      '<div class="help-item"><b>敌人提示</b>：数据女工量大管饱，节奏风暴会冲刺，虚无坦克又硬又慢；第 15 波虚无之主会加速周围小怪，对减速与魅惑有抗性。</div>' +
      '<div class="help-item"><b>快捷键</b>：P / Esc 暂停 ｜ M 静音 ｜ 2x 倍速省时间。</div>';
  }

  /* ================= 主循环 ================= */
  var lastTs = 0;
  function loop(ts) {
    var dt = Math.min((ts - lastTs) / 1000, 0.05);   // 钳制 dt，防切页回来跳帧
    lastTs = ts;
    frame(dt);
    window.requestAnimationFrame(loop);
  }

  function frame(dt) {
    if (G.state === 'playing') {
      update(dt * G.speed);
      /* 特效衰减（漏怪红光/震屏用真实 dt，暂停时不衰减无妨） */
      G.leakFlash = Math.max(0, G.leakFlash - dt * 2);
      G.shake = Math.max(0, G.shake - dt * 24);
    }
    render();
    updateHUD();
  }

  /* ================= 初始化 ================= */
  function init() {
    canvas = $('game');
    ctx = canvas.getContext('2d');

    /* 缓存 DOM */
    ['hud-gold', 'hud-wave', 'hud-lives', 'hud-kills',
     'overlay-menu', 'overlay-towers', 'overlay-enemies', 'overlay-help', 'overlay-result', 'overlay-pause',
     'codex-tower-list', 'codex-enemy-list', 'help-list',
     'tp-up', 'tp-sell', 'tp-name', 'tp-stats', 'tp-avatar'
    ].forEach(function (id) { D[id] = $(id); });
    D.towerPanel = $('tower-panel');
    /* 驼峰别名（带连字符的 id 手写麻烦） */
    D.tpAvatar = D['tp-avatar'];
    D.tpName = D['tp-name'];
    D.tpStats = D['tp-stats'];
    D.tpUp = D['tp-up'];
    D.tpSell = D['tp-sell'];
    D.btnNext = $('btn-next');
    D.btnSpeed = $('btn-speed');
    D.btnMute = $('btn-mute');
    D.btnMuteMenu = $('btn-mute-menu');
    D.codexTowerList = D['codex-tower-list'];
    D.codexEnemyList = D['codex-enemy-list'];
    D.helpList = D['help-list'];

    G.muted = loadMute();
    Sfx.setMuted(G.muted);
    D.btnMute.textContent = G.muted ? '音效:关 (M)' : '音效:开 (M)';
    D.btnMuteMenu.textContent = G.muted ? '音效：关' : '音效：开';

    prerenderBackground();
    loadAssets();
    buildTowerCodex();
    buildEnemyCodex();
    buildHelp();
    resetGame();

    /* 事件绑定 */
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseleave', function () {
      G.hoverSpot = -1; G.hoverTower = null; G.hoverSlice = -1;
    });
    canvas.addEventListener('click', onClick);
    canvas.addEventListener('contextmenu', function (ev) {
      ev.preventDefault();
      G.ringMenu = null;
      G.selTower = null;
      hideTowerPanel();
    });
    D.btnNext.addEventListener('click', function () { callNextWave(); });
    D.btnSpeed.addEventListener('click', function () {
      G.speed = G.speed === 1 ? 2 : 1;
      Sfx.play('click');
    });
    $('btn-pause').addEventListener('click', function () { if (G.state === 'playing' || G.state === 'paused') togglePause(); });
    D.btnMute.addEventListener('click', toggleMute);
    D.btnMuteMenu.addEventListener('click', toggleMute);
    $('btn-start').addEventListener('click', startGame);
    $('btn-codex-tower').addEventListener('click', function () { showOverlay('overlay-towers'); Sfx.play('click'); });
    $('btn-codex-enemy').addEventListener('click', function () { showOverlay('overlay-enemies'); Sfx.play('click'); });
    $('btn-help').addEventListener('click', function () { showOverlay('overlay-help'); Sfx.play('click'); });
    $('btn-back-tower').addEventListener('click', function () { showOverlay('overlay-menu'); });
    $('btn-back-enemy').addEventListener('click', function () { showOverlay('overlay-menu'); });
    $('btn-back-help').addEventListener('click', function () { showOverlay('overlay-menu'); });
    $('btn-restart').addEventListener('click', startGame);
    $('btn-back-menu').addEventListener('click', toMenu);
    $('btn-resume').addEventListener('click', togglePause);
    $('btn-pause-restart').addEventListener('click', startGame);
    $('btn-pause-menu').addEventListener('click', toMenu);

    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', function () { Sfx.init(); Sfx.resume(); });
    /* 切页自动暂停，防止回来被偷家 */
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && G.state === 'playing') togglePause();
    });

    showOverlay('overlay-menu');
    window.requestAnimationFrame(loop);
  }

  /* 调试/测试钩子（不影响正常游戏） */
  window.GT = {
    G: G, DATA: DATA, Sfx: Sfx,
    startGame: startGame, frame: frame, resetGame: resetGame,
    tryBuild: tryBuild, upgradeTower: upgradeTower, startWave: startWave,
    callNextWave: callNextWave
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
