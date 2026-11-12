/* ============================================================================
   一个魂零食大作战（副题：深夜零食大作战 · 嘉然今天吃什么？）
   ------------------------------------------------------------------------
   玩法：借鉴 4399《黄金矿工》的钟摆钩爪 + A-SOUL 主题的原创订单制改造。
   - 默认三人组可选：贝拉 / 嘉然 / 乃琳，各带真实生效的专属被动
     · 嘉然（吃货）：订单食物得分 +20%，连击倍率上限 ×4.0
     · 贝拉（队长·加练）：每关 +10 秒，摆动速度 +15%
     · 乃琳（Queen·控场）：阿草偷吃概率减半、被钩住定身翻倍、爆炸惩罚减半
   - 点击 / 空格 / J 放钩，钩中零食拉回，越重越慢
   - 凑齐「今日菜单」订单并达到解馋值目标即过关（周一 ~ 周日共 7 关）
   - 阿草（雪貂）会偷吃：吃掉场上零食、被钩住会拖走 5 秒并偷吃背包
   - 汽水罐是炸弹：钩中爆炸震碎周围零食并损失时间
   - 连续抓中订单食物提升连击倍率
   纯静态零依赖：双击 index.html 即可游玩（file:// 协议）。
   ============================================================================ */
(function () {
  'use strict';

  /* ============================== 基础常量 ============================== */
  var W = 960, H = 640;              // 内部分辨率
  var TAU = Math.PI * 2;
  var PIVOT_X = 480, PIVOT_Y = 148;  // 钩爪悬挂点（餐桌下沿）
  var HOOK_MIN = 24;                 // 绳的最短长度
  var HOOK_EXT_SPEED = 440;          // 放钩速度（px/s）
  var HOOK_PULL_BASE = 300;          // 拉回基准速度（实际 = 基准 / 重量）
  var HOOK_PULL_MIN = 68;            // 拉回速度下限
  var MAX_SWING = 75 * Math.PI / 180;// 摆动最大角度
  var FIELD_TOP = 150;               // 地窖场地起始 y
  var BOMB_RADIUS = 95;              // 爆炸波及半径
  var BOMB_TIME_LOSS = 5;            // 爆炸损失时间（秒）
  var ACAO_DRAG_TIME = 5;            // 阿草被钩住拖走的时间（秒）
  var COMBO_STEP = 0.2;              // 每级连击的倍率增量

  // 游戏状态机
  var ST = {
    TITLE: 'title', ORDER: 'order', PLAY: 'play', PAUSE: 'pause',
    CLEAR: 'clear', FAIL: 'fail', WIN: 'win'
  };

  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');

  /* ============================== 小工具 ============================== */
  function rand(a, b) { return a + Math.random() * (b - a); }
  function randi(a, b) { return Math.floor(rand(a, b + 1)); }
  function choice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function dist(x1, y1, x2, y2) { var dx = x2 - x1, dy = y2 - y1; return Math.sqrt(dx * dx + dy * dy); }

  // 圆角矩形路径（自带 polyfill，兼容旧浏览器）
  function pathRR(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }
  function fillRR(x, y, w, h, r, color) {
    ctx.fillStyle = color; pathRR(ctx, x, y, w, h, r); ctx.fill();
  }
  function strokeRR(x, y, w, h, r, color, lw) {
    ctx.strokeStyle = color; ctx.lineWidth = lw || 2; pathRR(ctx, x, y, w, h, r); ctx.stroke();
  }
  // '#RRGGBB' -> 'rgba(r,g,b,a)'
  function hexA(hex, a) {
    var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }
  // 文本（居中/左对齐快捷封装）
  function txt(s, x, y, size, color, align, weight, font) {
    ctx.fillStyle = color;
    ctx.font = (weight || 'bold') + ' ' + size + 'px "' + (font || 'Microsoft YaHei') + '", "PingFang SC", sans-serif';
    ctx.textAlign = align || 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(s, x, y);
  }
  // 带描边文字
  function txtO(s, x, y, size, color, strokeColor, align, lw) {
    ctx.font = 'bold ' + size + 'px "Microsoft YaHei", "PingFang SC", sans-serif';
    ctx.textAlign = align || 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = lw || 4;
    ctx.strokeStyle = strokeColor || 'rgba(30,10,40,0.85)';
    ctx.lineJoin = 'round';
    ctx.strokeText(s, x, y);
    ctx.fillStyle = color;
    ctx.fillText(s, x, y);
  }

  /* ============================== 本地存档 ============================== */
  function lsGet(key, def) {
    try {
      var raw = localStorage.getItem(key);
      if (raw === null) return def;
      return JSON.parse(raw);
    } catch (e) { return def; }
  }
  function lsSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* 隐私模式下静默失败 */ }
  }
  // 按角色记录的最高分 {bella:{score,day}, diana:{...}, eileen:{...}}
  var curChar = DEFAULT_CHAR; // 当前可选角色（默认嘉然，之后按存档恢复）
  var bestV2 = lsGet(LS_BEST_V2, null);
  if (!bestV2 || typeof bestV2 !== 'object') {
    bestV2 = {};
    // 旧版（嘉然单人时期）纪录迁移
    var legacy = Number(lsGet(LS_BEST_V1, 0)) || 0;
    if (legacy > 0) bestV2.diana = { score: legacy, day: '—' };
  }
  function bestOf(charId) {
    return (bestV2[charId] && bestV2[charId].score) || 0;
  }
  function saveBestScore(charId, score, day) {
    var cur = bestV2[charId] || { score: 0, day: '—' };
    if (score > cur.score) {
      bestV2[charId] = { score: score, day: day || cur.day };
      lsSet(LS_BEST_V2, bestV2);
    }
  }
  var progress = lsGet(LS_PROGRESS, null) || { unlocked: 1 };
  if (typeof progress.unlocked !== 'number' || progress.unlocked < 1) progress.unlocked = 1;
  progress.unlocked = clamp(progress.unlocked, 1, LEVEL_DEFS.length);
  if (CHAR_DEFS[progress.char]) curChar = progress.char; // 记住上次选人
  function saveProgress() { lsSet(LS_PROGRESS, progress); }

  /* ============================== 音效系统 ==============================
   * 全部用 WebAudio 振荡器现场合成，无外部音频文件。
   * ==================================================================== */
  var Snd = {
    ctx: null,
    muted: lsGet('snackclaw_muted_v1', false) === true,
    bgmTimer: null, bgmStep: 0, bgmBase: 0, bgmOn: false, bgmPaused: false,

    ensure: function () {
      if (!this.ctx) {
        try {
          var AC = window.AudioContext || window.webkitAudioContext;
          if (AC) this.ctx = new AC();
        } catch (e) { this.ctx = null; }
      }
      if (this.ctx && this.ctx.state === 'suspended') { this.ctx.resume(); }
    },
    // 单音：freq -> freqEnd 滑音，dur 秒，delay 秒后播放
    tone: function (freq, freqEnd, dur, type, vol, delay) {
      if (!this.ctx || this.muted) return;
      var t0 = this.ctx.currentTime + (delay || 0);
      try {
        var o = this.ctx.createOscillator();
        var g = this.ctx.createGain();
        o.type = type || 'sine';
        o.frequency.setValueAtTime(Math.max(1, freq), t0);
        if (freqEnd && freqEnd !== freq) {
          o.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur);
        }
        g.gain.setValueAtTime(vol || 0.12, t0);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        o.connect(g); g.connect(this.ctx.destination);
        o.start(t0); o.stop(t0 + dur + 0.03);
      } catch (e) { /* 音频失败不影响游戏 */ }
    },
    // 白噪声（爆炸等）
    noise: function (dur, vol, delay) {
      if (!this.ctx || this.muted) return;
      var t0 = this.ctx.currentTime + (delay || 0);
      try {
        var n = Math.floor(this.ctx.sampleRate * dur);
        var buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
        var d = buf.getChannelData(0);
        for (var i = 0; i < n; i++) { d[i] = (Math.random() * 2 - 1) * (1 - i / n); }
        var src = this.ctx.createBufferSource(); src.buffer = buf;
        var g = this.ctx.createGain();
        g.gain.setValueAtTime(vol || 0.2, t0);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        src.connect(g); g.connect(this.ctx.destination);
        src.start(t0);
      } catch (e) { /* 忽略 */ }
    },
    // 音效分发表
    play: function (name, opt) {
      opt = opt || {};
      switch (name) {
        case 'click':  this.tone(660, 440, 0.06, 'square', 0.06); break;
        case 'badClick': this.tone(220, 180, 0.08, 'square', 0.05); break;
        case 'drop':   this.tone(520, 240, 0.12, 'square', 0.10); break;
        case 'grab':   this.tone(300, 560, 0.09, 'triangle', 0.14); break;
        case 'score':
          this.tone(660, 660, 0.08, 'sine', 0.13);
          this.tone(990, 990, 0.12, 'sine', 0.11, 0.07);
          break;
        case 'combo':
          var n = opt.n || 1;
          this.tone(500 + n * 55, 760 + n * 55, 0.1, 'triangle', 0.13);
          break;
        case 'bad':    this.tone(220, 130, 0.22, 'sawtooth', 0.10); break;
        case 'boom':
          this.noise(0.5, 0.30);
          this.tone(95, 38, 0.5, 'sine', 0.30);
          this.tone(300, 60, 0.25, 'sawtooth', 0.12);
          break;
        case 'steal':  this.tone(900, 180, 0.32, 'sawtooth', 0.09); break;
        case 'acao':
          this.tone(700, 1100, 0.08, 'square', 0.07);
          this.tone(1100, 700, 0.08, 'square', 0.07, 0.1);
          break;
        case 'tick':   this.tone(880, 880, 0.05, 'square', 0.05); break;
        case 'order':  // 今日菜单展示
          this.tone(523, 523, 0.1, 'triangle', 0.12);
          this.tone(659, 659, 0.1, 'triangle', 0.12, 0.1);
          this.tone(784, 784, 0.16, 'triangle', 0.12, 0.2);
          break;
        case 'clear':  // 过关琶音
          this.tone(523, 523, 0.12, 'triangle', 0.14, 0);
          this.tone(659, 659, 0.12, 'triangle', 0.14, 0.09);
          this.tone(784, 784, 0.12, 'triangle', 0.14, 0.18);
          this.tone(1047, 1047, 0.25, 'triangle', 0.14, 0.27);
          break;
        case 'fail':
          this.tone(392, 392, 0.18, 'sawtooth', 0.10, 0);
          this.tone(330, 330, 0.18, 'sawtooth', 0.10, 0.18);
          this.tone(262, 262, 0.32, 'sawtooth', 0.10, 0.36);
          break;
        case 'win':    // 通关庆典号角
          var seq = [523, 659, 784, 1047, 784, 1047, 1319];
          for (var i = 0; i < seq.length; i++) {
            this.tone(seq[i], seq[i], 0.16, 'triangle', 0.13, i * 0.12);
          }
          this.tone(1319, 1319, 0.5, 'sine', 0.10, seq.length * 0.12);
          break;
      }
    },
    // 轻量 BGM：16 步五声音阶循环（每关升一个key，音量很低）
    MELODY: [60, 64, 67, 72, 69, 67, 64, 60, 62, 65, 69, 74, 72, 69, 65, 62],
    startBGM: function (levelIdx) {
      this.bgmBase = 55 + (levelIdx || 0) * 2; // 半音偏移
      this.bgmStep = 0;
      this.bgmOn = true;
      this.bgmPaused = false;
      if (!this.bgmTimer) {
        var self = this;
        this.bgmTimer = setInterval(function () { self.tickBGM(); }, 225);
      }
    },
    stopBGM: function () { this.bgmOn = false; },
    setPaused: function (p) { this.bgmPaused = p; },
    tickBGM: function () {
      if (!this.ctx || this.muted || !this.bgmOn || this.bgmPaused) return;
      var semi = this.MELODY[this.bgmStep % this.MELODY.length] + this.bgmBase - 60;
      var f = 440 * Math.pow(2, semi / 12);
      this.tone(f, f, 0.16, 'triangle', 0.028);
      if (this.bgmStep % 4 === 0) { // 低音陪衬
        this.tone(f / 2, f / 2, 0.3, 'sine', 0.04);
      }
      this.bgmStep++;
    },
    toggleMute: function () {
      this.muted = !this.muted;
      lsSet('snackclaw_muted_v1', this.muted);
    }
  };

  /* ============================== 图片素材 ============================== */
  var IMG_SRC = {
    // 嘉然
    ganfan: 'assets/diana_ganfan.png',
    liukoushui: 'assets/diana_liukoushui.png',
    xindong: 'assets/diana_xindong.png',
    bengbuzhule: 'assets/diana_bengbuzhule.png',
    qiaoda: 'assets/diana_qiaoda.png',
    mua: 'assets/diana_mua.png',
    jiaxintang: 'assets/diana_jiaxintang.png',
    chuitou: 'assets/diana_chuitousangqi.png',
    fanqie: 'assets/diana_fanqiechaodanquan.png',
    asoul: 'assets/diana_asoul.png',
    // 贝拉
    bellaJiayou: 'assets/bella_jiayou.png',
    bellaHahaha: 'assets/bella_hahaha.png',
    bellaKanwokeaima: 'assets/bella_kanwokeaima.png',
    bellaHan: 'assets/bella_han.png',
    bellaBuhuiba: 'assets/bella_buhuiba.png',
    bellaLeipa: 'assets/bella_leipa.png',
    bellaBietoulan: 'assets/bella_bietoulan.png',
    bellaWoyunle: 'assets/bella_woyunle.png',
    bellaBixin: 'assets/bella_bixin.png',
    // 乃琳
    eileenWink: 'assets/eileen_wink.png',
    eileenTaixihuanle: 'assets/eileen_taixihuanle.png',
    eileenNuwangdekending: 'assets/eileen_nuwangdekending.png',
    eileenMua: 'assets/eileen_mua.png',
    eileenYudaokunnan: 'assets/eileen_yudaokunnan.png',
    eileenJingxiaxiaonailin: 'assets/eileen_jingxiaxiaonailin.png',
    eileenQuzhengzhong: 'assets/eileen_quzhengzhong.png',
    eileenXiaoxile: 'assets/eileen_xiaoxile.png',
    // 吉祥物与团体
    acaoKaixin: 'assets/acao_kaixin.png',
    acaoKunrao: 'assets/acao_kunrao.png',
    acaoShuijiao: 'assets/acao_shuijiao.png',
    acaoJingxia: 'assets/acao_jingxia.png',
    acaoLiuhan: 'assets/acao_liuhan.png',
    logo: 'assets/logo_asoul.png'
  };
  var IMG = {};
  var imagesReady = false; // 全部素材加载（或失败跳过）后置 true

  function loadImages(cb) {
    var keys = [];
    for (var k in IMG_SRC) { keys.push(k); }
    var left = keys.length;
    keys.forEach(function (key) {
      var im = new Image();
      im.onload = im.onerror = function () {
        left--;
        if (left <= 0) { imagesReady = true; cb(); }
      };
      im.src = IMG_SRC[key];
      IMG[key] = im;
    });
  }
  // 安全绘制：图片缺失时不报错
  function imgOK(key) {
    var im = IMG[key];
    return im && im.complete && im.naturalWidth > 0;
  }
  function drawImg(key, x, y, w, h) {
    if (!imgOK(key)) return false;
    ctx.drawImage(IMG[key], x, y, w, h);
    return true;
  }
  // 圆形头像裁剪绘制
  function drawImgCircle(key, cx, cy, r) {
    if (!imgOK(key)) {
      ctx.fillStyle = '#E799B0';
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
      return false;
    }
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.clip();
    ctx.drawImage(IMG[key], cx - r, cy - r, r * 2, r * 2);
    ctx.restore();
    return true;
  }

  /* ============================== 全局状态 ============================== */
  var state = ST.TITLE;          // 当前状态机
  var buttons = [];              // 当前帧的可用按钮（渲染时生成，点击时消费）
  var mouse = { x: -99, y: -99 };
  var frameT = 0;                // 全局时间（动画用）

  var game = null;               // 对局数据（进入关卡时创建）

  // 标题页装饰（星星 / 漂浮零食）
  var titleStars = [];
  var titleFloats = [];
  // 地窖装饰（静态生成一次）
  var caveRocks = [];
  var caveMush = [];
  var skyStars = [];
  var skyClouds = [];

  function initDeco() {
    var i;
    for (i = 0; i < 70; i++) {
      titleStars.push({ x: rand(0, W), y: rand(0, H * 0.75), r: rand(0.6, 2.0), ph: rand(0, TAU), sp: rand(0.8, 2.2) });
    }
    for (i = 0; i < 10; i++) {
      titleFloats.push({
        type: choice(['chicken', 'milktea', 'cake', 'candy', 'melon']),
        x: rand(40, W - 40), y: rand(H * 0.25, H - 60),
        vy: rand(8, 20), rot: rand(0, TAU), vr: rand(-0.4, 0.4), s: rand(0.5, 0.9)
      });
    }
    for (i = 0; i < 46; i++) {
      caveRocks.push({ x: rand(15, W - 15), y: rand(FIELD_TOP + 15, H - 12), r: rand(2.5, 6), shade: rand(-10, 10) });
    }
    for (i = 0; i < 9; i++) {
      caveMush.push({
        x: rand(30, W - 30), y: rand(FIELD_TOP + 30, H - 20),
        c: choice(MUSHROOM_COLORS), s: rand(0.7, 1.3), ph: rand(0, TAU)
      });
    }
    for (i = 0; i < 60; i++) {
      skyStars.push({ x: rand(0, W), y: rand(0, FIELD_TOP - 10), r: rand(0.6, 1.8), ph: rand(0, TAU) });
    }
    skyClouds.push({ x: 150, y: 52, w: 120, sp: 6 });
    skyClouds.push({ x: 700, y: 34, w: 90, sp: 4 });
  }

  /* ============================== 对局构建 ============================== */
  function newGame(levelIdx, keepChances) {
    var L = LEVEL_DEFS[levelIdx];
    var CH = CHAR_DEFS[curChar];
    game = {
      levelIdx: levelIdx,
      level: L,
      ch: CH,              // 当前角色（被动参数/贴图/台词）
      items: [],
      acao: null,
      hook: null,
      backpack: [],      // 已抓回的食物 {type, value}，末尾是最新
      collected: {},     // 订单计数
      score: 0,
      combo: 0,
      bestCombo: 0,
      time: L.time + CH.p.timeBonus,   // 贝拉被动：每关 +10 秒
      chances: keepChances ? (game ? game.chances : 3) : 3,
      lowWarned: false,
      ambientT: rand(4, 8),
      bubble: null,      // {text, t}
      floaters: [],
      particles: [],
      shake: 0,
      face: 'play',      // 当前表情类别（CHAR_DEFS.imgs 的键）
      faceT: 0,          // 表情剩余时间
      runScores: (game && game.runScores) ? game.runScores : {}
    };
    L.order.forEach(function (o) { game.collected[o[0]] = 0; });
    genItems(L);
    spawnAcao(L);
    resetHook();
    game.time = L.time + CH.p.timeBonus;
    Snd.startBGM(levelIdx);
  }

  // 选择角色（标题界面点击卡片）
  function selectChar(id) {
    if (!CHAR_DEFS[id]) return;
    curChar = id;
    progress.char = id;
    saveProgress();
  }

  // 深度价值系数：越深越值钱
  function depthMult(y) { return clamp(1 + (y - 180) / 1000, 1, 1.6); }

  // 按权重随机选键
  function weightedPick(weights) {
    var total = 0, k;
    for (k in weights) total += weights[k];
    var r = Math.random() * total;
    for (k in weights) {
      r -= weights[k];
      if (r <= 0) return k;
    }
    return 'stone';
  }

  // 找一个不重叠的位置（拒绝采样）
  function findSpot(r, y0, y1, list) {
    for (var t = 0; t < 60; t++) {
      var x = rand(r + 22, W - r - 22);
      var y = rand(y0, y1);
      var ok = true;
      for (var i = 0; i < list.length; i++) {
        if (dist(x, y, list[i].x, list[i].y) < r + list[i].r + 10) { ok = false; break; }
      }
      if (ok) return { x: x, y: y };
    }
    return null;
  }

  function makeItem(type, x, y) {
    var d = ITEM_DEFS[type];
    var vMul = depthMult(y);
    return {
      type: type, x: x, y: y, r: d.r, w: d.w,
      v: Math.round(d.v * vMul),
      held: false, dead: false, wob: rand(0, TAU)
    };
  }

  function genItems(L) {
    game.items = [];
    var target = L.density;
    var guard = 0;
    while (game.items.length < target && guard < 900) {
      guard++;
      var band = DEPTH_BANDS[randi(0, 2)];
      var weights = BAND_WEIGHTS[DEPTH_BANDS.indexOf(band)];
      var type = weightedPick(weights);
      if (type === 'hotpot' && game.levelIdx !== 6) continue; // 火锅周日限定
      var pad = ITEM_DEFS[type].r + 8;
      var spot = findSpot(ITEM_DEFS[type].r, band.y0 + pad * 0.2, band.y1 - pad * 0.2, game.items);
      if (!spot) continue;
      game.items.push(makeItem(type, spot.x, spot.y));
    }
    // 保证订单物品数量足够（需求 + 2 件余量）
    L.order.forEach(function (o) {
      var type = o[0], need = o[1];
      var count = 0;
      game.items.forEach(function (it) { if (it.type === type) count++; });
      var want = need + 2;
      var d = ITEM_DEFS[type];
      var tries = 0;
      while (count < want && tries < 40) {
        tries++;
        var bandIdx = clamp(d.deep, 0, 2);
        var bd = DEPTH_BANDS[bandIdx];
        var pad2 = d.r + 8;
        var sp = findSpot(d.r, bd.y0 + pad2 * 0.2, bd.y1 - pad2 * 0.2, game.items);
        if (!sp) break;
        game.items.push(makeItem(type, sp.x, sp.y));
        count++;
      }
    });
  }

  function resetHook() {
    game.hook = {
      mode: 'swing',     // swing | extend | pull
      t: rand(0, TAU),
      angle: 0,
      len: HOOK_MIN,
      item: null,        // 抓住的物品
      empty: false,      // 空钩（快速收回）
      acaoCaught: false, // 钩住了阿草
      dragT: 0           // 阿草拖走倒计时
    };
  }

  /* ============================== 阿草 ============================== */
  function spawnAcao(L) {
    var stealFreq = game.ch.p.acaoStealFreq;
    game.acao = {
      mode: 'swim',            // swim | dash | stuck | gone
      x: rand(90, W - 90),
      y: rand(260, 560),
      vx: choice([-1, 1]) * rand(55, 95) * (1 + game.levelIdx * 0.04),
      vy: 0,
      target: null,
      eatLeft: Math.max(1, Math.round(2 * stealFreq)), // 乃琳：单关偷吃次数减半（2→1）
      hungerT: rand(L.acao * 0.6, L.acao) / stealFreq, // 乃琳：偷吃触发间隔 ×2
      respawnT: 0,
      anim: rand(0, TAU)
    };
  }

  function acaoSteal() {
    var a = game.acao;
    var canSteal = !(game.ch.p.acaoStealFreq < 1 && Math.random() < 0.5); // 乃琳：挣脱偷吃概率减半
    if (game.backpack.length > 0 && canSteal) {
      var it = game.backpack.pop();
      game.collected[it.type] = Math.max(0, (game.collected[it.type] || 0) - 1);
      game.score = Math.max(0, game.score - it.value);
      say(quoteOf('acaoSteal'));
      setFace('angry', 2.2);
      addFloater(it.x || PIVOT_X, 200, '阿草偷吃了「' + ITEM_DEFS[it.type].name + '」！', '#ff6b81');
      addFloater(PIVOT_X + 120, 96, '-' + it.value, '#ff6b81');
      Snd.play('steal');
    } else if (game.backpack.length > 0 && !canSteal) {
      // 乃琳被动：女王的气场震住了阿草
      say(['阿草被女王的气场钉在原地…空手而逃！', '阿草刚想伸手，被乃琳的眼神冻住了！']);
      addFloater(PIVOT_X, 210, '阿草偷吃失败！', '#a0e7a0');
      Snd.play('acao');
    } else {
      say(['阿草：咦？背包是空的？！', '阿草扑了个空，悻悻地跑了…']);
      Snd.play('acao');
    }
    a.mode = 'gone';
    a.respawnT = 4 * game.ch.p.acaoStunMult; // 乃琳：被钩住后的定身时间翻倍（4→8 秒）
    a.target = null;
  }

  function updateAcao(dt) {
    var a = game.acao;
    if (!a) return;
    a.anim += dt * 6;
    if (a.mode === 'swim') {
      a.x += a.vx * dt;
      if (a.x < 60) { a.x = 60; a.vx = Math.abs(a.vx); }
      if (a.x > W - 60) { a.x = W - 60; a.vx = -Math.abs(a.vx); }
      a.y += Math.sin(a.anim * 0.5) * 8 * dt;
      a.hungerT -= dt;
      if (a.hungerT <= 0) {
        a.hungerT = rand(game.level.acao * 0.8, game.level.acao * 1.3) / game.ch.p.acaoStealFreq; // 乃琳：偷吃频率减半
        if (a.eatLeft > 0 && !game.hook.acaoCaught) {
          // 寻找最近的可口食物（不吃石头/炸弹/蔬菜）
          var best = null, bestD = 1e9;
          game.items.forEach(function (it) {
            if (it.dead || it.held) return;
            if (it.type === 'stone' || it.type === 'soda' || it.type === 'broccoli') return;
            var d = dist(a.x, a.y, it.x, it.y);
            if (d < bestD) { bestD = d; best = it; }
          });
          if (best) { a.mode = 'dash'; a.target = best; }
        }
      }
    } else if (a.mode === 'dash') {
      var t = a.target;
      if (!t || t.dead || t.held) { a.mode = 'swim'; a.target = null; return; }
      var dx = t.x - a.x, dy = t.y - a.y;
      var dd = Math.sqrt(dx * dx + dy * dy);
      var sp = 300;
      if (dd < t.r + 12) {
        // 吃掉！
        t.dead = true;
        a.eatLeft--;
        a.mode = 'swim';
        a.target = null;
        addFloater(t.x, t.y, '阿草吃掉了「' + ITEM_DEFS[t.type].name + '」！', '#ffd166');
        crumbParticles(t.x, t.y, '#fff');
        say(['阿草嗷呜一口——没了！', '阿草吃得飞快，根本拦不住！']);
        Snd.play('steal');
      } else {
        a.x += dx / dd * sp * dt;
        a.y += dy / dd * sp * dt;
      }
    } else if (a.mode === 'stuck') {
      // 由钩爪拖着走（位置在 updateHook 同步）
      a.x = PIVOT_X + Math.sin(game.hook.angle) * game.hook.len;
      a.y = PIVOT_Y + Math.cos(game.hook.angle) * game.hook.len;
    } else if (a.mode === 'gone') {
      a.respawnT -= dt;
      if (a.respawnT <= 0) {
        a.mode = 'swim';
        a.x = choice([60, W - 60]);
        a.y = rand(260, 560);
        a.vx = (a.x < W / 2 ? 1 : -1) * rand(55, 95);
      }
    }
  }

  /* ============================== 台词 / 漂浮字 / 粒子 ============================== */
  // 按当前角色取台词库：角色专属 → 全局兜底（嘉然原版台词）
  function quoteOf(cat) {
    var q = game.ch.quotes;
    return (q && q[cat]) || EVENT_QUOTES[cat] || IDLE_QUOTES;
  }
  // say('boom') 按类别取词；say(['自定义']) 直接使用数组
  function say(catOrList) {
    var list = (catOrList instanceof Array) ? catOrList : quoteOf(catOrList);
    game.bubble = { text: choice(list), t: 2.8 };
  }
  function setFace(key, t) {
    game.face = key; game.faceT = t;
  }
  function addFloater(x, y, text, color) {
    game.floaters.push({ x: x, y: y, text: text, color: color || '#fff', t: 1.4, vy: -34 });
  }
  function sparkParticles(x, y, color) {
    for (var i = 0; i < 10; i++) {
      var a = rand(0, TAU), sp = rand(40, 130);
      game.particles.push({
        kind: 'spark', x: x, y: y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        r: rand(2, 4), color: color || '#ffd6e8',
        t: rand(0.3, 0.6), maxT: 0.6
      });
    }
  }
  function crumbParticles(x, y, color) {
    for (var i = 0; i < 8; i++) {
      game.particles.push({
        kind: 'spark', x: x, y: y,
        vx: rand(-70, 70), vy: rand(-90, -20),
        r: rand(2, 3.5), color: color || '#f7d794',
        t: rand(0.3, 0.7), maxT: 0.7
      });
    }
  }
  function boomParticles(x, y) {
    var i, a, sp;
    for (i = 0; i < 26; i++) {
      a = rand(0, TAU); sp = rand(60, 260);
      game.particles.push({
        kind: 'spark', x: x, y: y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        r: rand(3, 7), color: choice(['#ff9f43', '#ff6b6b', '#feca57', '#fff']),
        t: rand(0.35, 0.7), maxT: 0.7
      });
    }
  }
  function confettiParticles() {
    var colors = ['#E799B0', '#DB7D74', '#576690', '#C93773', '#7252C0', '#ffd166', '#6ee7d8'];
    for (var i = 0; i < 4; i++) {
      game.particles.push({
        kind: 'confetti',
        x: rand(0, W), y: -10,
        vx: rand(-30, 30), vy: rand(70, 150),
        r: rand(3, 6),
        color: choice(colors),
        rot: rand(0, TAU), vr: rand(-4, 4),
        t: 6, maxT: 6
      });
    }
  }

  /* ============================== 爆炸 ============================== */
  function explode(bombItem) {
    bombItem.dead = true;
    game.shake = 0.42;
    var loss = BOMB_TIME_LOSS * game.ch.p.bombMult; // 乃琳被动：爆炸惩罚减半（5→2.5 秒）
    game.time = Math.max(0, game.time - loss);
    addFloater(bombItem.x, bombItem.y - 20, '轰！！-' + (loss % 1 ? loss.toFixed(1) : loss) + 's', '#ff6b6b');
    boomParticles(bombItem.x, bombItem.y);
    say('boom');
    setFace('boom', 2.4);
    Snd.play('boom');
    // 震碎周围物品（不含已钩住的）
    game.items.forEach(function (it) {
      if (it === bombItem || it.dead || it.held) return;
      if (dist(it.x, it.y, bombItem.x, bombItem.y) < BOMB_RADIUS) {
        it.dead = true;
        crumbParticles(it.x, it.y);
        addFloater(it.x, it.y, '被震碎！', '#feca57');
      }
    });
  }

  /* ============================== 收取 / 得分 ============================== */
  function orderNeed(type) {
    var need = 0;
    game.level.order.forEach(function (o) { if (o[0] === type) need = o[1]; });
    return need;
  }
  function orderAllDone() {
    return game.level.order.every(function (o) {
      return (game.collected[o[0]] || 0) >= o[1];
    });
  }

  // 钩爪把物品拉回顶端
  function collect(item) {
    item.dead = true;
    var d = ITEM_DEFS[item.type];
    var need = orderNeed(item.type);
    var isOrderItem = need > 0 && (game.collected[item.type] || 0) < need;
    var val;
    if (isOrderItem) {
      game.combo++;
      game.bestCombo = Math.max(game.bestCombo, game.combo);
      var cap = game.ch.p.comboCap;             // 嘉然 ×4.0，其余 ×3.0
      var mult = Math.min(1 + COMBO_STEP * (game.combo - 1), cap);
      val = Math.round(item.v * mult * game.ch.p.orderBonus); // 嘉然被动：订单食物 +20%
      game.collected[item.type]++;
      game.backpack.push({ type: item.type, value: val, x: item.x, y: item.y });
      addFloater(item.x, item.y, '+' + val + (mult > 1 ? ' x' + mult.toFixed(1) : ''), '#ff8fab');
      sparkParticles(item.x, item.y, '#ffd6e8');
      if (game.combo >= 2) {
        Snd.play('combo', { n: Math.min(game.combo, 8) });
        addFloater(PIVOT_X - 150, 92, '连击 x' + game.combo, '#ffd166');
      } else {
        Snd.play('score');
      }
      if (game.combo === 3) say('combo3');
      if (game.combo === 5) { say('combo5'); setFace('excited', 2); }
      if (orderAllDone()) {
        say('orderDone');
        setFace('happy', 2);
        addFloater(PIVOT_X, 60, '订单完成！', '#7CFC9A');
      }
    } else {
      game.combo = 0;
      if (item.type === 'stone') {
        val = d.v;
        say('stone');
        setFace('dizzy', 2);
        Snd.play('bad');
      } else if (item.type === 'broccoli') {
        val = d.v;
        say('broccoli');
        setFace('angry', 2);
        Snd.play('bad');
      } else {
        // 非订单零食：只有小分
        val = Math.max(1, Math.round(d.v * 0.4));
        Snd.play('score');
      }
      addFloater(item.x, item.y, (val >= 0 ? '+' : '') + val, val >= 0 ? '#cfd8e3' : '#ff6b81');
      if (val < 0) game.score = Math.max(0, game.score + val);
      else game.score += val;
      checkLevelClear();
      return;
    }
    game.score += val;
    checkLevelClear();
  }

  function checkLevelClear() {
    if (orderAllDone() && game.score >= game.level.target) {
      levelClear();
    }
  }

  function levelClear() {
    var bonus = Math.round(game.time * 8); // 剩余时间奖励
    game.timeBonus = bonus;
    game.score += bonus;
    saveBestScore(curChar, game.score, game.level.day); // 按角色记录最高解馋值
    game.runScores[game.levelIdx] = Math.max(game.runScores[game.levelIdx] || 0, game.score);
    progress.unlocked = clamp(Math.max(progress.unlocked, game.levelIdx + 2), 1, LEVEL_DEFS.length);
    saveProgress();
    say('clear');
    Snd.stopBGM();
    if (game.levelIdx === LEVEL_DEFS.length - 1) {
      // 周日火锅大宴通关 → 五周年干饭庆典
      Snd.play('win');
      state = ST.WIN;
    } else {
      Snd.play('clear');
      state = ST.CLEAR;
    }
  }

  function onTimeUp() {
    game.chances--;
    game.time = 0;
    Snd.stopBGM();
    Snd.play('fail');
    say('fail');
    state = ST.FAIL;
  }

  /* ============================== 钩爪更新 ============================== */
  function hookTip() {
    return {
      x: PIVOT_X + Math.sin(game.hook.angle) * game.hook.len,
      y: PIVOT_Y + Math.cos(game.hook.angle) * game.hook.len
    };
  }

  function updateHook(dt) {
    var hk = game.hook;
    if (hk.mode === 'swing') {
      hk.t += dt * game.level.swing * game.ch.p.swingMult; // 贝拉被动：摆动 +15%
      hk.angle = Math.sin(hk.t) * MAX_SWING;
      hk.len = HOOK_MIN;
    } else if (hk.mode === 'extend') {
      hk.len += HOOK_EXT_SPEED * dt;
      var tip = hookTip();
      // 出界 → 空钩收回
      if (tip.y > H - 8 || tip.x < 10 || tip.x > W - 10 || hk.len > 720) {
        hk.mode = 'pull'; hk.empty = true;
        return;
      }
      // 碰撞检测
      for (var i = 0; i < game.items.length; i++) {
        var it = game.items[i];
        if (it.dead || it.held) continue;
        if (dist(tip.x, tip.y, it.x, it.y) < it.r + 7) {
          if (ITEM_DEFS[it.type].bomb) {
            explode(it);
            hk.mode = 'pull'; hk.empty = true;
          } else {
            it.held = true;
            hk.item = it;
            hk.mode = 'pull';
            Snd.play('grab');
          }
          return;
        }
      }
      // 阿草碰撞
      var a = game.acao;
      if (a && a.mode !== 'gone' && a.mode !== 'stuck' &&
          dist(tip.x, tip.y, a.x, a.y) < 30) {
        hk.acaoCaught = true;
        hk.dragT = ACAO_DRAG_TIME;
        a.mode = 'stuck';
        hk.mode = 'pull';
        // 彩蛋：抓到阿草不扣分，但挣脱时会尝试偷吃背包
        say('acaoCaught');
        addFloater(a.x, a.y - 30, '抓到阿草！+0 解馋值', '#a0e7a0');
        Snd.play('acao');
        setFace('excited', 1.6);
      }
    } else if (hk.mode === 'pull') {
      var speed;
      if (hk.acaoCaught) {
        speed = 58;                       // 阿草死沉，拖 5 秒
        hk.dragT -= dt;
        if (hk.dragT <= 0) {
          // 5 秒到：阿草挣脱并偷吃
          hk.acaoCaught = false;
          hk.mode = 'pull'; hk.empty = true;
          acaoSteal();
          return;
        }
      } else if (hk.empty) {
        speed = 480;
      } else {
        speed = Math.max(HOOK_PULL_MIN, HOOK_PULL_BASE / hk.item.w);
      }
      hk.len -= speed * dt;
      var tip2 = hookTip();
      if (hk.item) {
        hk.item.x = tip2.x; hk.item.y = tip2.y;
      }
      if (hk.len <= HOOK_MIN) {
        if (hk.acaoCaught) {              // 极限情况：硬把阿草拖回了家
          hk.acaoCaught = false;
          game.acao.mode = 'gone';
          game.acao.respawnT = 5;
          acaoSteal();
        } else if (hk.item) {
          collect(hk.item);
          hk.item = null;
        }
        hk.mode = 'swing'; hk.empty = false;
      }
    }
  }

  /* ============================== 对局更新 ============================== */
  function updatePlay(dt) {
    // 时间
    game.time -= dt;
    if (game.time <= 0) { onTimeUp(); return; }
    if (!game.lowWarned && game.time < 10) {
      game.lowWarned = true;
      say('timeLow');
      Snd.play('tick');
    }
    if (game.lowWarned && game.time < 10) {
      // 最后 10 秒滴答提示音（每整秒）
      if (Math.floor(game.time + dt) !== Math.floor(game.time)) Snd.play('tick');
    }

    updateHook(dt);
    updateAcao(dt);

    // 表情复位
    if (game.faceT > 0) {
      game.faceT -= dt;
      if (game.faceT <= 0) game.face = 'play';
    }
    // 环境台词（当前角色的闲聊库）
    game.ambientT -= dt;
    if (game.ambientT <= 0) {
      game.ambientT = rand(6, 11);
      if (!game.bubble) say('idle');
    }
    // 屏幕震动衰减
    if (game.shake > 0) game.shake = Math.max(0, game.shake - dt);
  }

  function updateFx(dt) {
    var i;
    if (game) {
      if (game.bubble) {
        game.bubble.t -= dt;
        if (game.bubble.t <= 0) game.bubble = null;
      }
      for (i = game.floaters.length - 1; i >= 0; i--) {
        var f = game.floaters[i];
        f.t -= dt; f.y += f.vy * dt;
        if (f.t <= 0) game.floaters.splice(i, 1);
      }
      for (i = game.particles.length - 1; i >= 0; i--) {
        var p = game.particles[i];
        p.t -= dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.kind === 'confetti') { p.rot += p.vr * dt; p.vx += Math.sin(frameT * 3 + p.y * 0.01) * 12 * dt; }
        else { p.vx *= (1 - 2.2 * dt); p.vy *= (1 - 2.2 * dt); }
        if (p.t <= 0) game.particles.splice(i, 1);
      }
    }
    // 标题页漂浮零食
    if (state === ST.TITLE) {
      titleFloats.forEach(function (fl) {
        fl.y += fl.vy * dt;
        fl.rot += fl.vr * dt;
        if (fl.y > H + 40) { fl.y = -40; fl.x = rand(40, W - 40); }
      });
    }
    // 胜利彩带（限速生成，避免粒子堆积）
    if (state === ST.WIN && Math.random() < 0.35) confettiParticles();
  }

  function update(dt) {
    frameT += dt;
    updateFx(dt);
    if (state === ST.PLAY) updatePlay(dt);
  }

  /* ============================== 场景渲染 ============================== */
  function drawNightSky(topY) {
    var g = ctx.createLinearGradient(0, 0, 0, topY);
    g.addColorStop(0, '#160c2e');
    g.addColorStop(1, '#2c1a4d');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, topY);
    // 星星
    skyStars.forEach(function (s) {
      var tw = 0.5 + 0.5 * Math.sin(frameT * 2 + s.ph);
      ctx.globalAlpha = 0.35 + 0.65 * tw;
      ctx.fillStyle = '#fff8e7';
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill();
    });
    ctx.globalAlpha = 1;
    // 月亮
    ctx.fillStyle = 'rgba(255,247,214,0.12)';
    ctx.beginPath(); ctx.arc(864, 58, 44, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff4c9';
    ctx.beginPath(); ctx.arc(864, 58, 26, 0, TAU); ctx.fill();
    ctx.fillStyle = '#f3e3a8';
    ctx.beginPath(); ctx.arc(856, 52, 5, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(872, 66, 4, 0, TAU); ctx.fill();
    // 夜云
    skyClouds.forEach(function (c) {
      var cx = (c.x + frameT * c.sp) % (W + 200) - 100;
      ctx.fillStyle = 'rgba(90,70,140,0.35)';
      ctx.beginPath(); ctx.ellipse(cx, c.y, c.w * 0.5, 14, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx + 30, c.y - 8, c.w * 0.3, 11, 0, 0, TAU); ctx.fill();
    });
  }

  function drawCave() {
    var colors = ['#4a3266', '#3d2a57', '#31214a'];
    for (var i = 0; i < 3; i++) {
      var b = DEPTH_BANDS[i];
      var y0 = i === 0 ? FIELD_TOP : b.y0;
      var y1 = i === 2 ? H : b.y1;
      ctx.fillStyle = colors[i];
      ctx.fillRect(0, y0, W, y1 - y0);
    }
    // 地层交界虚线 + 深度标签
    ctx.setLineDash([8, 8]);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1.5;
    [DEPTH_BANDS[1].y0, DEPTH_BANDS[2].y0].forEach(function (yy) {
      ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(W, yy); ctx.stroke();
    });
    ctx.setLineDash([]);
    // 地层标签（数据来自 DEPTH_BANDS.label）
    txt('—— ' + DEPTH_BANDS[0].label + ' ——', 60, DEPTH_BANDS[0].y0 + 14, 12, 'rgba(255,255,255,0.28)', 'center', 'normal');
    txt('—— ' + DEPTH_BANDS[1].label + ' ——', 60, DEPTH_BANDS[1].y0 + 14, 12, 'rgba(255,255,255,0.28)', 'center', 'normal');
    txt('—— ' + DEPTH_BANDS[2].label + ' · 越深越值钱 ——', 96, DEPTH_BANDS[2].y0 + 14, 12, 'rgba(255,255,255,0.28)', 'center', 'normal');
    // 小石子
    caveRocks.forEach(function (r) {
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      ctx.beginPath(); ctx.arc(r.x - r.r * 0.3, r.y - r.r * 0.3, r.r * 0.5, 0, TAU); ctx.fill();
    });
    // 发光蘑菇（深夜氛围）
    caveMush.forEach(function (m) {
      var glow = 0.5 + 0.5 * Math.sin(frameT * 1.8 + m.ph);
      ctx.globalAlpha = 0.16 + 0.2 * glow;
      ctx.fillStyle = m.c;
      ctx.beginPath(); ctx.arc(m.x, m.y, 10 * m.s, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = m.c;
      ctx.beginPath(); ctx.arc(m.x, m.y - 3 * m.s, 4.5 * m.s, Math.PI, 0); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillRect(m.x - 1.6 * m.s, m.y - 3 * m.s, 3.2 * m.s, 6 * m.s);
    });
  }

  /* ---------- 矢量物品绘制（以原点为中心，scale 缩放） ---------- */
  function drawItemArt(type, t) {
    // t: 动画时间（HUD 传 0）
    var i;
    switch (type) {
      case 'chicken': // 炸鸡腿
        ctx.rotate(-0.5);
        ctx.fillStyle = '#fff';
        ctx.fillRect(-3, 4, 7, 16);
        ctx.beginPath(); ctx.arc(-4, 21, 5, 0, TAU); ctx.arc(5, 21, 5, 0, TAU); ctx.fill();
        ctx.fillStyle = '#d2924f';
        ctx.beginPath(); ctx.ellipse(0, -5, 14, 17, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#b97a3c';
        ctx.beginPath(); ctx.ellipse(3, -2, 9, 11, 0.4, 0, TAU); ctx.fill();
        ctx.fillStyle = '#eec08a';
        ctx.beginPath(); ctx.ellipse(-5, -11, 5, 7, -0.4, 0, TAU); ctx.fill();
        break;
      case 'milktea': // 奶茶
        ctx.fillStyle = '#f2dfc4';
        ctx.beginPath();
        ctx.moveTo(-13, -12); ctx.lineTo(13, -12); ctx.lineTo(10, 18); ctx.lineTo(-10, 18);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#b97a56';
        ctx.beginPath();
        ctx.moveTo(-11.4, -2); ctx.lineTo(11.4, -2); ctx.lineTo(10, 18); ctx.lineTo(-10, 18);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#4a2c1a'; // 珍珠
        for (i = 0; i < 4; i++) {
          ctx.beginPath(); ctx.arc(-6 + (i % 2) * 8, 10 + Math.floor(i / 2) * 5, 2.6, 0, TAU); ctx.fill();
        }
        ctx.fillStyle = '#fff3e0'; // 奶盖
        ctx.beginPath(); ctx.ellipse(0, -12, 13.5, 4.5, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ff8fab'; // 吸管
        ctx.save(); ctx.rotate(0.18); ctx.fillRect(3, -26, 4.5, 18); ctx.restore();
        break;
      case 'cake': // 草莓蛋糕
        ctx.fillStyle = '#fff';
        ctx.beginPath(); // 底盘
        ctx.ellipse(0, 16, 22, 5, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#f7a8c4';
        ctx.beginPath();
        ctx.moveTo(-18, 15); ctx.lineTo(18, 15); ctx.lineTo(4, -10); ctx.lineTo(-6, -10);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#fff0f5'; // 奶油夹层
        ctx.beginPath();
        ctx.moveTo(-14.5, 6); ctx.lineTo(14.8, 6); ctx.lineTo(12, 1); ctx.lineTo(-11.5, 1);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#e8537a'; // 顶部草莓
        ctx.beginPath(); ctx.arc(-1, -13, 5.5, 0, TAU); ctx.fill();
        ctx.fillStyle = '#5fa843';
        ctx.beginPath(); ctx.ellipse(-1, -18.5, 4, 2, 0, 0, TAU); ctx.fill();
        break;
      case 'candy': // 嘉心糖
        ctx.fillStyle = '#f4bccf';
        ctx.beginPath(); // 两侧包装翼
        ctx.moveTo(-8, 0); ctx.lineTo(-19, -8); ctx.lineTo(-16, 0); ctx.lineTo(-19, 8);
        ctx.closePath(); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(8, 0); ctx.lineTo(19, -8); ctx.lineTo(16, 0); ctx.lineTo(19, 8);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#f78fb3';
        ctx.beginPath(); ctx.arc(0, 0, 9.5, 0, TAU); ctx.fill();
        ctx.fillStyle = '#fff'; // 小爱心
        ctx.beginPath();
        ctx.moveTo(0, 4.5);
        ctx.bezierCurveTo(-6, -1, -3, -6, 0, -2.5);
        ctx.bezierCurveTo(3, -6, 6, -1, 0, 4.5);
        ctx.fill();
        break;
      case 'melon': // 西瓜（切面朝上）
        ctx.fillStyle = '#2f9e44';
        ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#d8f5c0';
        ctx.beginPath(); ctx.arc(0, 0, 26, 0, Math.PI); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ff6b6b';
        ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#26160f';
        for (i = 0; i < 5; i++) {
          var ma = Math.PI * (0.18 + i * 0.16);
          ctx.beginPath();
          ctx.ellipse(Math.cos(ma) * 13, 4 + Math.sin(ma) * 11, 1.8, 3, ma, 0, TAU);
          ctx.fill();
        }
        break;
      case 'broccoli': // 西兰花
        ctx.fillStyle = '#a8d878';
        pathRR(ctx, -5, 0, 10, 16, 4); ctx.fill();
        ctx.fillStyle = '#4c8f35';
        [[-9, -6, 9], [8, -7, 8], [0, -12, 10], [-3, -2, 8], [5, -1, 7]].forEach(function (b) {
          ctx.beginPath(); ctx.arc(b[0], b[1], b[2], 0, TAU); ctx.fill();
        });
        ctx.fillStyle = '#5fa843';
        [[-6, -10, 4], [4, -13, 3.4], [0, -4, 4.2]].forEach(function (b) {
          ctx.beginPath(); ctx.arc(b[0], b[1], b[2], 0, TAU); ctx.fill();
        });
        break;
      case 'stone': // 石头
        ctx.fillStyle = '#8a8f98';
        ctx.beginPath();
        ctx.moveTo(-20, 8); ctx.lineTo(-14, -10); ctx.lineTo(2, -16);
        ctx.lineTo(17, -6); ctx.lineTo(20, 8); ctx.lineTo(6, 16); ctx.lineTo(-10, 15);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#a6abb5';
        ctx.beginPath();
        ctx.moveTo(-12, -6); ctx.lineTo(0, -12); ctx.lineTo(10, -5); ctx.lineTo(-2, -1);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#5f646d'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(-4, 2); ctx.lineTo(3, 8); ctx.lineTo(1, 13); ctx.stroke();
        break;
      case 'soda': // 汽水罐（炸弹）
        ctx.fillStyle = '#e04848';
        pathRR(ctx, -11, -14, 22, 30, 4); ctx.fill();
        ctx.fillStyle = '#c0c0c8';
        ctx.beginPath(); ctx.ellipse(0, -14, 11, 3.4, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('!', 0, 2);
        ctx.strokeStyle = '#feca57'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, -17); ctx.quadraticCurveTo(6, -22, 3, -26); ctx.stroke();
        // 火花
        var fs = 1 + Math.sin((t || 0) * 12) * 0.4;
        ctx.fillStyle = '#ffd166';
        ctx.beginPath(); ctx.arc(3, -27, 3 * fs, 0, TAU); ctx.fill();
        break;
      case 'hotpot': // 小火锅
        ctx.fillStyle = '#c0392b';
        ctx.beginPath();
        ctx.moveTo(-24, -8); ctx.lineTo(24, -8); ctx.lineTo(19, 16);
        ctx.quadraticCurveTo(0, 22, -19, 16);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#f1c40f'; // 双耳
        ctx.beginPath(); ctx.arc(-26, -6, 5, 0, TAU); ctx.arc(26, -6, 5, 0, TAU); ctx.fill();
        ctx.fillStyle = '#8e2820';
        ctx.beginPath(); ctx.ellipse(0, -8, 24, 6, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#e74c3c'; // 红汤
        ctx.beginPath(); ctx.ellipse(0, -8, 20, 4.4, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.8)'; // 蒸汽
        for (i = 0; i < 2; i++) {
          var sx = -7 + i * 14;
          var sv = Math.sin((t || 0) * 3 + i * 2) * 3;
          ctx.beginPath();
          ctx.ellipse(sx + sv, -20 - ((t || 0) * 10 + i * 8) % 10, 3.4, 6, 0, 0, TAU);
          ctx.fill();
        }
        break;
    }
  }

  function drawItems() {
    game.items.forEach(function (it) {
      if (it.dead) return;
      ctx.save();
      ctx.translate(it.x, it.y);
      // 阴影
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.ellipse(3, it.r * 0.75, it.r * 0.85, it.r * 0.4, 0, 0, TAU); ctx.fill();
      ctx.rotate(Math.sin(it.wob + frameT * 1.2) * 0.08);
      drawItemArt(it.type, frameT);
      ctx.restore();
    });
  }

  /* ---------- 阿草渲染 ---------- */
  function acaoImgKey(a) {
    if (a.mode === 'stuck') {
      // 被钩住的瞬间是惊吓，之后变成困扰
      if (game.hook.acaoCaught && game.hook.dragT > ACAO_DRAG_TIME - 0.5) return 'acaoJingxia';
      return 'acaoKunrao';
    }
    if (a.mode === 'dash') return 'acaoLiuhan';
    return 'acaoKaixin';
  }
  function drawAcao() {
    var a = game.acao;
    if (!a || a.mode === 'gone') return;
    ctx.save();
    ctx.translate(a.x, a.y + Math.sin(a.anim) * 2);
    // 影子
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(0, 26, 24, 7, 0, 0, TAU); ctx.fill();
    var face = a.vx >= 0 ? -1 : 1; // 素材默认朝向左，右移时翻转
    if (a.mode === 'dash') face = a.target && a.target.x > a.x ? -1 : 1;
    ctx.scale(face, 1);
    var key = acaoImgKey(a);
    if (!drawImg(key, -30, -30, 60, 60)) {
      // 兜底：白色小貂矢量
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.ellipse(0, 0, 22, 16, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#333';
      ctx.beginPath(); ctx.arc(-8, -4, 2, 0, TAU); ctx.arc(2, -4, 2, 0, TAU); ctx.fill();
      ctx.fillStyle = '#a8d878';
      pathRR(ctx, -6, 2, 12, 5, 2); ctx.fill();
    }
    ctx.restore();
    // 被钩住时的惊呼
    if (a.mode === 'stuck') {
      txtO('呀！！', a.x + 34, a.y - 26, 15, '#ffd166');
    }
    // 冲刺时的“偷吃”预警
    if (a.mode === 'dash') {
      txtO('目标锁定！', a.x, a.y - 38, 13, '#ff8fab');
    }
  }

  /* ---------- 钩爪与绳 ---------- */
  function drawHook() {
    var hk = game.hook;
    var tip = hookTip();
    // 绳
    ctx.strokeStyle = '#c9a227';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(PIVOT_X, PIVOT_Y); ctx.lineTo(tip.x, tip.y); ctx.stroke();
    // 钩爪
    ctx.save();
    ctx.translate(tip.x, tip.y);
    ctx.rotate(hk.mode === 'swing' ? hk.angle : 0);
    if (hk.mode === 'pull' && !hk.empty && hk.item) {
      ctx.rotate(Math.sin(frameT * 6) * 0.06);
    }
    ctx.fillStyle = '#e8b23a';
    ctx.beginPath(); ctx.arc(0, 0, 6.5, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#e8b23a';
    ctx.lineWidth = 4.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(-6, 8, 6, Math.PI * 0.9, Math.PI * 1.9); ctx.stroke();
    ctx.beginPath(); ctx.arc(6, 8, 6, Math.PI * 1.1, Math.PI * 0.1); ctx.stroke();
    ctx.restore();
  }

  /* ---------- 当前角色 + 餐桌（钩爪上方的成员立绘，按所选角色切换配色/头像） ---------- */
  function drawMember() {
    var CH = game.ch;
    var cx = PIVOT_X, headY = 84, headR = 40;
    // 身体（矢量简笔：应援色裙 + 手臂搭桌）
    ctx.fillStyle = CH.color;
    ctx.beginPath();
    ctx.moveTo(cx - 52, 122);
    ctx.quadraticCurveTo(cx - 44, 92, cx, 90);
    ctx.quadraticCurveTo(cx + 44, 92, cx + 52, 122);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,240,245,0.9)'; // 围裙
    ctx.beginPath();
    ctx.moveTo(cx - 22, 104);
    ctx.quadraticCurveTo(cx, 100, cx + 22, 104);
    ctx.lineTo(cx + 18, 122); ctx.lineTo(cx - 18, 122);
    ctx.closePath(); ctx.fill();
    // 手臂
    ctx.strokeStyle = '#ffd9c4'; ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx - 34, 108); ctx.lineTo(cx - 14, 116); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + 34, 108); ctx.lineTo(cx + 14, 116); ctx.stroke();
    // 头像（圆形裁剪的成员表情包，按表情类别取图）
    var headKey = CH.imgs[game.face] || CH.imgs.play;
    drawImgCircle(headKey, cx, headY, headR);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(cx, headY, headR, 0, TAU); ctx.stroke();
    // 名牌
    txtO(CH.name, cx - 74, 106, 12, '#fff', 'rgba(60,20,50,0.85)', 'center', 3);
    // 桌子
    fillRR(cx - 110, 118, 220, 30, 10, '#8b5a3c');
    fillRR(cx - 116, 114, 232, 10, 5, '#f6c6d8');
    fillRR(cx - 110, 148, 14, 16, 4, '#6f4529');
    fillRR(cx + 96, 148, 14, 16, 4, '#6f4529');
    // 桌上嘉心糖罐
    ctx.fillStyle = '#f78fb3';
    pathRR(ctx, cx + 62, 100, 26, 18, 5); ctx.fill();
    ctx.fillStyle = '#ffd166';
    pathRR(ctx, cx + 62, 96, 26, 7, 3); ctx.fill();
    txtO('嘉心糖', cx + 75, 112, 8, '#fff', 'rgba(120,40,70,0.9)', 'center', 2);
    // 绳子挂点滑轮
    ctx.fillStyle = '#5a4633';
    ctx.beginPath(); ctx.arc(PIVOT_X, PIVOT_Y, 5, 0, TAU); ctx.fill();
  }

  /* ---------- HUD ---------- */
  function drawHUD() {
    // 顶栏
    ctx.fillStyle = 'rgba(12,7,24,0.8)';
    ctx.fillRect(0, 0, W, 30);
    var L = game.level;
    txt(game.ch.name + ' · ' + L.day + ' · ' + L.name, 14, 15, 15, '#ffd6e8', 'left');
    // 时间
    var timeColor = game.time < 10 ? (Math.sin(frameT * 8) > 0 ? '#ff6b6b' : '#ffd166') : '#fff';
    txtO('剩余 ' + Math.ceil(game.time) + 's', W / 2 - 40, 15, 16, timeColor);
    // 解馋值
    txt('解馋值 ' + game.score + ' / ' + L.target, 950, 15, 15, '#ffe9a8', 'right');
    // 静音提示
    txt('[M]' + (Snd.muted ? '已静音' : '音效开'), 795, 15, 11, 'rgba(255,255,255,0.55)', 'center', 'normal');

    // 左侧：机会 + 连击
    fillRR(14, 40, 200, 86, 10, 'rgba(255,255,255,0.10)');
    strokeRR(14, 40, 200, 86, 10, 'rgba(255,255,255,0.18)', 1.5);
    txt('机会', 30, 58, 13, 'rgba(255,255,255,0.8)', 'left');
    for (var i = 0; i < 3; i++) {
      var hx = 88 + i * 32;
      if (i < game.chances) {
        if (!drawImg('jiaxintang', hx - 13, 44, 26, 26)) {
          ctx.fillStyle = '#f78fb3';
          ctx.beginPath(); ctx.arc(hx, 57, 11, 0, TAU); ctx.fill();
        }
      } else {
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(hx, 57, 11, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(hx - 8, 49); ctx.lineTo(hx + 8, 65); ctx.stroke();
      }
    }
    // 连击
    if (game.combo >= 2) {
      var mult = Math.min(1 + COMBO_STEP * (game.combo - 1), game.ch.p.comboCap);
      txtO('连击 x' + game.combo, 34, 88, 18, '#ffd166', 'rgba(80,20,60,0.9)', 'left');
      txt('倍率 x' + mult.toFixed(1), 34, 110, 13, '#ff8fab', 'left');
    } else {
      txt('连续抓中订单食物', 30, 90, 12, 'rgba(255,255,255,0.55)', 'left');
      txt('可提升连击倍率', 30, 108, 12, 'rgba(255,255,255,0.55)', 'left');
    }

    // 右侧：今日订单卡
    var rows = L.order.length;
    var cardH = 46 + rows * 32 + 40;
    var cx0 = 700, cy0 = 40, cw = 246;
    fillRR(cx0, cy0, cw, cardH, 12, 'rgba(255,255,255,0.92)');
    fillRR(cx0, cy0, cw, 26, 10, '#e799b0');
    ctx.fillStyle = '#e799b0'; ctx.fillRect(cx0, cy0 + 16, cw, 10);
    txt('今日订单', cx0 + cw / 2, cy0 + 13, 14, '#fff');
    L.order.forEach(function (o, idx) {
      var type = o[0], need = o[1];
      var got = Math.min(game.collected[type] || 0, need);
      var ry = cy0 + 34 + idx * 32;
      // 迷你图标
      ctx.save();
      ctx.translate(cx0 + 28, ry + 10);
      ctx.scale(0.55, 0.55);
      drawItemArt(type, 0);
      ctx.restore();
      var done = got >= need;
      txt(ITEM_DEFS[type].name, cx0 + 52, ry + 10, 14, '#5a3d55', 'left');
      txt(got + '/' + need, cx0 + 168, ry + 10, 15, done ? '#3fae5a' : '#c2497a', 'right');
      if (done) txtO('✓', cx0 + 196, ry + 10, 17, '#3fae5a', 'rgba(255,255,255,0.9)', 'center', 3);
      // 完成度小条
      fillRR(cx0 + 180, ry + 20, 40, 4, 2, 'rgba(0,0,0,0.1)');
      fillRR(cx0 + 180, ry + 20, 40 * (got / need), 4, 2, '#e799b0');
    });
    // 背包（最近抓到的食物）
    var by = cy0 + cardH - 22;
    txt('背包', cx0 + 22, by, 11, '#9a7f96', 'left', 'normal');
    var shown = game.backpack.slice(-5);
    shown.forEach(function (bp, idx) {
      ctx.save();
      ctx.translate(cx0 + 62 + idx * 26, by);
      ctx.scale(0.38, 0.38);
      drawItemArt(bp.type, 0);
      ctx.restore();
    });
    if (shown.length === 0) txt('空空如也…', cx0 + 130, by, 11, '#c9b3c6', 'left', 'normal');

    // 目标提示（未达标时）
    if (!orderAllDone() || game.score < L.target) {
      var missing = [];
      L.order.forEach(function (o) {
        if ((game.collected[o[0]] || 0) < o[1]) missing.push(ITEM_DEFS[o[0]].name);
      });
      var tipText = game.score < L.target ? '解馋值还差 ' + (L.target - game.score) : '';
      if (missing.length) tipText += (tipText ? ' · 还缺 ' : '还缺 ') + missing.join('、');
      fillRR(W / 2 - 190, 616, 380, 20, 10, 'rgba(12,7,24,0.6)');
      txt(tipText, W / 2, 626, 12, '#ffe9a8');
    } else {
      fillRR(W / 2 - 190, 616, 380, 20, 10, 'rgba(63,174,90,0.75)');
      txt('目标达成！', W / 2, 626, 12, '#fff');
    }
  }

  /* ---------- 台词气泡 ---------- */
  function drawBubble() {
    if (!game.bubble) return;
    var b = game.bubble;
    var bx = 560, by = 46;
    ctx.font = 'bold 15px "Microsoft YaHei", "PingFang SC", sans-serif';
    var tw = ctx.measureText(b.text).width;
    var bw = tw + 26, bh = 32;
    var alpha = clamp(b.t / 0.4, 0, 1); // 淡出
    ctx.globalAlpha = alpha;
    fillRR(bx, by, bw, bh, 12, 'rgba(255,255,255,0.95)');
    // 尾巴
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.moveTo(bx + 4, by + bh - 6); ctx.lineTo(bx - 12, by + bh + 8); ctx.lineTo(bx + 18, by + bh - 2);
    ctx.closePath(); ctx.fill();
    strokeRR(bx, by, bw, bh, 12, '#e799b0', 2);
    txt(b.text, bx + bw / 2, by + bh / 2 + 1, 15, '#8a3d63');
    ctx.globalAlpha = 1;
  }

  function drawFloaters() {
    game.floaters.forEach(function (f) {
      ctx.globalAlpha = clamp(f.t / 0.5, 0, 1);
      txtO(f.text, f.x, f.y, 15, f.color);
      ctx.globalAlpha = 1;
    });
  }

  function drawParticles() {
    game.particles.forEach(function (p) {
      ctx.globalAlpha = p.kind === 'confetti' ? 1 : clamp(p.t / p.maxT, 0, 1);
      if (p.kind === 'confetti') {
        ctx.save();
        ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.r, -p.r * 0.5, p.r * 2, p.r);
        ctx.restore();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
    });
  }

  /* ---------- 对局场景 ---------- */
  function drawScene() {
    drawNightSky(FIELD_TOP);
    drawCave();
    drawItems();
    drawAcao();
    drawHook();
    drawMember();  // 桌子在绳之上，遮住绳根
    drawHUD();
    drawBubble();
    drawFloaters();
    drawParticles();
    // 深夜小彩蛋
    txt('深夜 23:33 · 干饭时间', 12, H - 12, 11, 'rgba(255,255,255,0.3)', 'left', 'normal');
  }

  /* ============================== 界面按钮系统 ============================== */
  function button(x, y, w, h, label, cb, opts) {
    opts = opts || {};
    var hot = mouse.x >= x && mouse.x <= x + w && mouse.y >= y && mouse.y <= y + h;
    var enabled = opts.enabled !== false;
    var base = opts.color || (hot && enabled ? '#ff8fb5' : '#e799b0');
    fillRR(x, y, w, h, 10, enabled ? base : '#6b5a70');
    strokeRR(x, y, w, h, 10, 'rgba(255,255,255,0.5)', 1.5);
    if (opts.sub) {
      txt(label, x + w / 2, y + h / 2 - 7, opts.size || 16, enabled ? '#fff' : '#c9c0cc');
      txt(opts.sub, x + w / 2, y + h / 2 + 12, 11, 'rgba(255,255,255,0.75)', 'center', 'normal');
    } else {
      txt(label, x + w / 2, y + h / 2, opts.size || 16, enabled ? '#fff' : '#c9c0cc');
    }
    buttons.push({ x: x, y: y, w: w, h: h, cb: cb, enabled: enabled });
  }

  function handleClick() {
    // 从上层按钮开始消费（后画的在上层）
    for (var i = buttons.length - 1; i >= 0; i--) {
      var b = buttons[i];
      if (b.enabled && mouse.x >= b.x && mouse.x <= b.x + b.w && mouse.y >= b.y && mouse.y <= b.y + b.h) {
        Snd.play('click');
        b.cb();
        return true;
      }
    }
    return false;
  }

  /* ============================== 界面绘制 ============================== */
  // 小锁图标
  function drawLock(x, y) {
    ctx.strokeStyle = '#9a8aa5'; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.arc(x, y - 3, 4.5, Math.PI, 0); ctx.stroke();
    ctx.fillStyle = '#9a8aa5';
    pathRR(ctx, x - 6, y - 3, 12, 10, 2.5); ctx.fill();
  }

  /* ---------- 角色选择卡（默认三人组：贝拉 / 嘉然 / 乃琳） ---------- */
  function drawCharCards() {
    var cw2 = 220, ch2 = 104, gap = 24;
    var x0 = (W - (cw2 * 3 + gap * 2)) / 2, y0 = 96;
    CHAR_ORDER.forEach(function (id, i) {
      var CH = CHAR_DEFS[id];
      var bx = x0 + i * (cw2 + gap), by = y0;
      var sel = curChar === id;
      fillRR(bx, by, cw2, ch2, 12, sel ? hexA(CH.color, 0.34) : 'rgba(255,255,255,0.10)');
      strokeRR(bx, by, cw2, ch2, 12, sel ? '#ffffff' : hexA(CH.color, 0.85), sel ? 3 : 2);
      // 成员头像（圆形裁剪表情包）
      drawImgCircle(CH.imgs.play, bx + 42, by + 52, 30);
      ctx.strokeStyle = CH.color; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(bx + 42, by + 52, 30, 0, TAU); ctx.stroke();
      // 名字 + 称号
      txt(CH.name + ' ' + CH.en, bx + 84, by + 22, 15, '#fff', 'left');
      txt('「' + CH.title + '」', bx + 84, by + 41, 11, 'rgba(255,255,255,0.8)', 'left', 'normal');
      // 被动说明（真实机制，见 CHAR_DEFS.p）
      txt('· ' + CH.passiveText[0], bx + 84, by + 61, 11, '#ffe9a8', 'left', 'normal');
      txt('· ' + CH.passiveText[1], bx + 84, by + 77, 11, '#ffe9a8', 'left', 'normal');
      // 该角色的单关最高纪录
      var b = bestV2[id];
      var bs = (b && b.score > 0) ? ('最高 ' + b.score + (b.day && b.day !== '—' ? ' (' + b.day + ')' : '')) : '最高 0';
      txt(bs, bx + 84, by + 94, 11, 'rgba(255,255,255,0.72)', 'left', 'normal');
      // 选中徽章
      if (sel) {
        fillRR(bx + cw2 - 60, by + 8, 52, 18, 9, CH.color);
        txt('已选择', bx + cw2 - 34, by + 17, 10, '#fff');
      }
      buttons.push({
        x: bx, y: by, w: cw2, h: ch2, enabled: true,
        cb: (function (cid) { return function () { selectChar(cid); }; })(id)
      });
    });
  }

  function drawTitle() {
    // 背景
    drawNightSky(H);
    ctx.fillStyle = 'rgba(30,16,54,0.6)';
    ctx.fillRect(0, 0, W, H);
    // 漂浮零食
    titleFloats.forEach(function (fl) {
      ctx.save();
      ctx.translate(fl.x, fl.y);
      ctx.rotate(fl.rot);
      ctx.globalAlpha = 0.5;
      ctx.scale(fl.s, fl.s);
      drawItemArt(fl.type, 0);
      ctx.restore();
      ctx.globalAlpha = 1;
    });

    txtO('一个魂零食大作战', W / 2, 44, 44, '#ffd6e8', 'rgba(90,20,60,0.9)', 'center', 8);
    txtO('深夜零食大作战 · 嘉然今天吃什么？', W / 2, 80, 18, '#ffe9a8', 'rgba(90,20,60,0.9)', 'center', 5);
    // logo（左上）
    if (!drawImg('logo', 36, 26, 56, 56)) {
      ctx.fillStyle = '#e799b0';
      ctx.beginPath(); ctx.arc(64, 54, 26, 0, TAU); ctx.fill();
    }
    txt('一个魂', 64, 96, 12, '#c9b3e8');
    // 角色选择卡（默认三人组）
    drawCharCards();

    // 左侧：玩法 + 操作说明
    var px = 40, py = 214, pw = 430, ph = 248;
    fillRR(px, py, pw, ph, 14, 'rgba(255,255,255,0.10)');
    strokeRR(px, py, pw, ph, 14, 'rgba(255,255,255,0.25)', 1.5);
    txt('玩法说明', px + pw / 2, py + 22, 16, '#ffd6e8');
    var lines = [
      '· 点击 / 空格 / J 放钩，抓取零食拉回（越重越慢）',
      '· 凑齐「今日菜单」订单，并达到解馋值目标即过关',
      '· 一周 7 关（周一~周日），周日是火锅大宴',
      '· 连续抓中订单食物提升连击倍率（嘉然上限 ×4.0）',
      '· 越深的零食越值钱；汽水罐是炸弹（爆炸损 5 秒）',
      '· 阿草会偷吃零食；被钩住会拖走 5 秒并偷吃背包',
      '· 时间归零未完成订单扣 1 次机会，3 次用完失败'
    ];
    lines.forEach(function (s, i) {
      txt(s, px + 22, py + 50 + i * 24, 13, 'rgba(255,255,255,0.88)', 'left', 'normal');
    });
    txt('操作：点击 / 空格 / J 放钩 · P 或 Esc 暂停 · M 静音',
      px + pw / 2, py + ph - 16, 13, '#ffe9a8');

    // 右侧：关卡选择
    var gx = 500, gy = 214, gw = 420, gh = 248;
    fillRR(gx, gy, gw, gh, 14, 'rgba(255,255,255,0.10)');
    strokeRR(gx, gy, gw, gh, 14, 'rgba(255,255,255,0.25)', 1.5);
    txt('关卡选择（已解锁可重玩）', gx + gw / 2, gy + 24, 17, '#ffd6e8');
    var bw = 91, bh = 58, gapX = 10, gapY = 14;
    LEVEL_DEFS.forEach(function (L, i) {
      var col = i % 4, row = Math.floor(i / 4);
      var bx = gx + 13 + col * (bw + gapX);
      var by = gy + 48 + row * (bh + gapY);
      var unlocked = i < progress.unlocked;
      button(bx, by, bw, bh, L.day, (function (idx) {
        return function () {
          if (idx < progress.unlocked) { startRun(idx); }
          else Snd.play('badClick');
        };
      })(i), {
        enabled: unlocked,
        color: unlocked ? (i === 6 ? '#c93773' : '#e799b0') : '#6b5a70',
        sub: unlocked ? L.name : '敬请期待',
        size: 15
      });
      if (!unlocked) drawLock(bx + bw - 17, by + 17); // 锁图标移到右上角，避免遮住“未解锁”文字
      else if (i === 6) { // 周日标记
        txt('最终', bx + bw - 16, by + 12, 9, '#ffe9a8', 'center', 'normal');
      }
    });
    // 最高分按角色记录（见选人卡），解锁进度三人共享
    txt('最高分按角色记录（见上方选人卡）· 解锁进度三人共享',
      gx + gw / 2, gy + gh - 22, 12, 'rgba(255,255,255,0.55)', 'center', 'normal');

    // 底部主按钮
    button(W / 2 - 110, 476, 220, 52, '开始游戏', function () {
      startRun(Math.min(progress.unlocked, LEVEL_DEFS.length) - 1);
    }, { color: '#ff8fb5', size: 20, sub: '从最新解锁关卡开始' });
    button(W - 118, 480, 96, 44, '音效:' + (Snd.muted ? '关' : '开'), function () { Snd.toggleMute(); },
      { color: '#576690', size: 14 });
    txt('A-SOUL 同人作品 · 非商用 · 素材来源于官方表情包',
      W / 2, H - 16, 11, 'rgba(255,255,255,0.4)', 'center', 'normal');
  }

  // 今日菜单展示页
  function drawOrderShow() {
    drawScene();
    ctx.fillStyle = 'rgba(10,5,22,0.72)';
    ctx.fillRect(0, 0, W, H);
    var L = game.level;
    var cx = W / 2, cw = 470, ch = 96 + L.order.length * 56 + 150;
    var cy = (H - ch) / 2 - 10;
    fillRR(cx - cw / 2, cy, cw, ch, 16, '#fff7f2');
    strokeRR(cx - cw / 2, cy, cw, ch, 16, '#e799b0', 3);
    fillRR(cx - cw / 2, cy, cw, 54, 16, '#e799b0');
    ctx.fillStyle = '#e799b0'; ctx.fillRect(cx - cw / 2, cy + 34, cw, 20);
    // 当前角色头像（今日菜单页）
    drawImgCircle(game.ch.imgs.play, cx - cw / 2 + 30, cy + 27, 18);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx - cw / 2 + 30, cy + 27, 18, 0, TAU); ctx.stroke();
    txt('今日菜单 · ' + L.day + ' ' + L.name, cx + 15, cy + 28, 21, '#fff');
    L.order.forEach(function (o, i) {
      var ry = cy + 78 + i * 56;
      ctx.save();
      ctx.translate(cx - 150, ry + 14);
      ctx.scale(1.0, 1.0);
      drawItemArt(o[0], frameT);
      ctx.restore();
      txt(ITEM_DEFS[o[0]].name, cx - 110, ry + 14, 18, '#5a3d55', 'left');
      txt('x ' + o[1], cx + 150, ry + 14, 19, '#c2497a');
      // 装饰虚线
      ctx.strokeStyle = 'rgba(231,153,176,0.3)'; ctx.setLineDash([4, 5]);
      ctx.beginPath(); ctx.moveTo(cx - 60, ry + 14); ctx.lineTo(cx + 118, ry + 14); ctx.stroke();
      ctx.setLineDash([]);
    });
    var iy = cy + 78 + L.order.length * 56 + 16;
    txt('解馋值目标：' + L.target + '   ·   限时：' + Math.round(game.time) + ' 秒   ·   机会：3 次',
      cx, iy, 15, '#8a5a7d');
    txt('小心：汽水罐是炸弹！阿草会偷吃！越深越值钱！',
      cx, iy + 24, 12.5, '#b08aa5', 'center', 'normal');
    button(cx - 90, iy + 42, 180, 46, '开饭！', function () {
      state = ST.PLAY;
      Snd.startBGM(game.levelIdx);
    }, { color: '#ff8fb5', size: 19, sub: '或按空格键' });
  }

  function drawPause() {
    drawScene();
    ctx.fillStyle = 'rgba(10,5,22,0.66)';
    ctx.fillRect(0, 0, W, H);
    txtO('暂 停 中', W / 2, 200, 42, '#ffd6e8');
    txt(game.ch.name + '正在擦擦嘴…', W / 2, 248, 15, 'rgba(255,255,255,0.7)', 'center', 'normal');
    button(W / 2 - 100, 300, 200, 46, '继续游戏', function () { state = ST.PLAY; Snd.setPaused(false); },
      { color: '#ff8fb5', size: 17, sub: 'P / Esc / 空格' });
    button(W / 2 - 100, 362, 200, 46, '重开本关', function () {
      newGame(game.levelIdx, false); state = ST.ORDER;
    }, { color: '#e799b0', size: 17 });
    button(W / 2 - 100, 424, 200, 46, '返回菜单', function () {
      Snd.stopBGM(); state = ST.TITLE;
    }, { color: '#576690', size: 17 });
  }

  function drawClear() {
    drawScene();
    ctx.fillStyle = 'rgba(10,5,22,0.6)';
    ctx.fillRect(0, 0, W, H);
    var L = game.level;
    var cx = W / 2, cw = 460, ch = L.order.length * 34 + 300, cy = (H - ch) / 2 - 4;
    fillRR(cx - cw / 2, cy, cw, ch, 16, '#fff7f2');
    strokeRR(cx - cw / 2, cy, cw, ch, 16, '#3fae5a', 3);
    fillRR(cx - cw / 2, cy, cw, 56, 16, '#3fae5a');
    ctx.fillStyle = '#3fae5a'; ctx.fillRect(cx - cw / 2, cy + 36, cw, 20);
    txt(L.day + ' · ' + L.name + ' 过关！', cx, cy + 29, 22, '#fff');
    drawImgCircle(game.ch.imgs.happy, cx - 150, cy + 110, 40); // 当前角色立绘
    // 订单清单
    L.order.forEach(function (o, i) {
      var ry = cy + 84 + i * 34;
      ctx.save();
      ctx.translate(cx - 62, ry + 8);
      ctx.scale(0.5, 0.5);
      drawItemArt(o[0], 0);
      ctx.restore();
      txt(ITEM_DEFS[o[0]].name + ' x' + o[1], cx - 34, ry + 8, 14, '#5a3d55', 'left');
      txtO('✓', cx + 96, ry + 8, 16, '#3fae5a', 'rgba(255,255,255,0.9)', 'center', 3);
    });
    var sy = cy + 92 + L.order.length * 34;
    txt('解馋值：' + (game.score - (game.timeBonus || 0)), cx, sy, 16, '#8a5a7d');
    txt('剩余时间奖励：+' + (game.timeBonus || 0), cx, sy + 26, 14, '#3fae5a', 'center', 'normal');
    txt('最终解馋值：' + game.score, cx, sy + 54, 19, '#c2497a');
    txt('最大连击：x' + game.bestCombo, cx, sy + 82, 14, '#8a5a7d', 'center', 'normal');
    txt('历史最高解馋值：' + bestOf(curChar), cx, sy + 106, 13, '#b08aa5', 'center', 'normal');
    var byy = cy + ch - 56;
    button(cx - 210, byy, 130, 44, '下一天', function () {
      startRun(game.levelIdx + 1);
    }, { color: '#ff8fb5', size: 16, sub: '空格' });
    button(cx - 65, byy, 130, 44, '再玩一次', function () {
      startRun(game.levelIdx);
    }, { color: '#e799b0', size: 16 });
    button(cx + 80, byy, 130, 44, '返回菜单', function () {
      Snd.stopBGM(); state = ST.TITLE;
    }, { color: '#576690', size: 16 });
  }

  function drawFail() {
    drawScene();
    ctx.fillStyle = 'rgba(20,8,26,0.78)';
    ctx.fillRect(0, 0, W, H);
    drawImgCircle(game.ch.imgs.sad, W / 2, 190, 62); // 当前角色失败立绘
    txtO('深夜干饭失败…', W / 2, 292, 34, '#ff8fab');
    if (game.chances > 0) {
      txt('剩余机会：' + game.chances + ' / 3', W / 2, 340, 17, '#ffe9a8');
      txt('订单没凑齐，解馋值不够…再来一次！', W / 2, 368, 14, 'rgba(255,255,255,0.75)', 'center', 'normal');
      button(W / 2 - 190, 410, 180, 48, '再战本关', function () {
        newGame(game.levelIdx, true); state = ST.ORDER;
      }, { color: '#ff8fb5', size: 18, sub: '空格' });
      button(W / 2 + 10, 410, 180, 48, '返回菜单', function () {
        Snd.stopBGM(); state = ST.TITLE;
      }, { color: '#576690', size: 18 });
    } else {
      txt('三次机会全部用完…', W / 2, 344, 18, '#ffd166');
      txt('嘉然表示：明天一定顿顿解馋！', W / 2, 374, 14, 'rgba(255,255,255,0.75)', 'center', 'normal');
      button(W / 2 - 100, 420, 200, 48, '返回菜单', function () {
        Snd.stopBGM(); state = ST.TITLE;
      }, { color: '#e799b0', size: 18, sub: '已解锁关卡可重玩' });
    }
  }

  function drawWin() {
    // 庆典夜空
    drawNightSky(H);
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(231,153,176,0.16)');
    g.addColorStop(0.5, 'rgba(114,82,192,0.12)');
    g.addColorStop(1, 'rgba(201,55,115,0.2)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    drawParticles();

    txtO('五周年干饭庆典', W / 2, 90, 46, '#ffd6e8', 'rgba(90,20,60,0.95)', 'center', 8);
    txtO('一周七夜 · 顿顿解馋 · 全部通关！', W / 2, 136, 20, '#ffe9a8');
    drawImgCircle(game.ch.imgs.win, W / 2 - 190, 230, 58); // 当前角色庆祝立绘
    drawImgCircle('asoul', W / 2 + 190, 230, 58);
    // 阿草吃饱后在角落睡着（吉祥物彩蛋）
    ctx.save();
    if (!drawImg('acaoShuijiao', 842, 522, 76, 76)) {
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.ellipse(880, 560, 30, 22, 0, 0, TAU); ctx.fill();
    }
    ctx.restore();
    txt('阿草：吃饱了…zZZ', 880, 612, 11, 'rgba(255,255,255,0.6)', 'center', 'normal');

    // 总分
    var total = 0, k;
    for (k in game.runScores) total += game.runScores[k];
    txtO('庆典总解馋值：' + total, W / 2, 208, 24, '#fff');
    txt(CHAR_DEFS[curChar].name + '的单关最高纪录：' + bestOf(curChar) + ' · 阿草已被喂得饱饱的！', W / 2, 300, 14, 'rgba(255,255,255,0.8)', 'center', 'normal');

    // 成员应援横幅（客串）
    var bw = 150, bx0 = W / 2 - (VICTORY_BANNER.length * (bw + 14) - 14) / 2;
    VICTORY_BANNER.forEach(function (m, i) {
      var bx = bx0 + i * (bw + 14), by = 336;
      fillRR(bx, by, bw, 66, 12, 'rgba(255,255,255,0.10)');
      strokeRR(bx, by, bw, 66, 12, m.color, 2.5);
      ctx.fillStyle = m.color;
      ctx.beginPath(); ctx.arc(bx + 24, by + 33, 15, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath(); ctx.arc(bx + 24, by + 33, 7, 0, TAU); ctx.fill();
      txt(m.name, bx + 48, by + 22, 13, '#fff', 'left');
      txt(m.text, bx + 48, by + 44, 11, 'rgba(255,255,255,0.7)', 'left', 'normal');
    });

    txt('关注嘉然，顿顿解馋！一个魂，五周年快乐！', W / 2, 432, 17, '#ffd166');
    button(W / 2 - 100, 470, 200, 50, '返回菜单', function () {
      Snd.stopBGM(); state = ST.TITLE;
    }, { color: '#ff8fb5', size: 18, sub: '空格' });
    txt('A-SOUL 同人作品 · 非商用', W / 2, H - 16, 11, 'rgba(255,255,255,0.4)', 'center', 'normal');
  }

  function render() {
    buttons = [];
    ctx.clearRect(0, 0, W, H);
    if (!imagesReady) {
      ctx.fillStyle = '#1b1038';
      ctx.fillRect(0, 0, W, H);
      txt('素材加载中…', W / 2, H / 2, 20, '#ffd6e8');
      return;
    }
    ctx.save();
    if (game && game.shake > 0 && state === ST.PLAY) {
      ctx.translate(rand(-1, 1) * game.shake * 14, rand(-1, 1) * game.shake * 14);
    }
    switch (state) {
      case ST.TITLE: drawTitle(); break;
      case ST.ORDER: drawOrderShow(); break;
      case ST.PLAY: drawScene(); break;
      case ST.PAUSE: drawPause(); break;
      case ST.CLEAR: drawClear(); break;
      case ST.FAIL: drawFail(); break;
      case ST.WIN: drawWin(); break;
    }
    ctx.restore();
  }

  /* ============================== 流程辅助 ============================== */
  // 从菜单 / 关卡按钮发起一次完整关卡（重置 3 次机会）
  function startRun(levelIdx) {
    levelIdx = clamp(levelIdx, 0, LEVEL_DEFS.length - 1);
    newGame(levelIdx, false);
    state = ST.ORDER;
    Snd.play('order');
  }

  /* ============================== 输入 ============================== */
  function primaryAction() {
    if (state === ST.TITLE) {
      // 标题页空格/回车 = 从最新解锁关卡开始
      startRun(Math.min(progress.unlocked, LEVEL_DEFS.length) - 1);
    } else if (state === ST.PLAY) {
      if (game.hook.mode === 'swing') {
        game.hook.mode = 'extend';
        Snd.play('drop');
      }
    } else if (state === ST.ORDER) {
      state = ST.PLAY;
      Snd.startBGM(game.levelIdx);
    } else if (state === ST.PAUSE) {
      state = ST.PLAY; Snd.setPaused(false);
    } else if (state === ST.CLEAR) {
      startRun(game.levelIdx + 1);
    } else if (state === ST.FAIL) {
      if (game.chances > 0) { newGame(game.levelIdx, true); state = ST.ORDER; }
    } else if (state === ST.WIN) {
      Snd.stopBGM(); state = ST.TITLE;
    }
  }

  function togglePause() {
    if (state === ST.PLAY) { state = ST.PAUSE; Snd.setPaused(true); Snd.play('click'); }
    else if (state === ST.PAUSE) { state = ST.PLAY; Snd.setPaused(false); Snd.play('click'); }
  }

  function canvasPos(e) {
    var r = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * W / r.width,
      y: (e.clientY - r.top) * H / r.height
    };
  }

  canvas.addEventListener('mousemove', function (e) {
    var p = canvasPos(e);
    mouse.x = p.x; mouse.y = p.y;
  });
  canvas.addEventListener('mousedown', function (e) {
    Snd.ensure();
    var p = canvasPos(e);
    mouse.x = p.x; mouse.y = p.y;
    if (handleClick()) return;
    // 未命中按钮：游戏中视为放钩
    if (state === ST.PLAY) primaryAction();
  });
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  window.addEventListener('keydown', function (e) {
    Snd.ensure();
    if (e.code === 'Space' || e.code === 'ArrowDown' || e.code === 'ArrowUp') e.preventDefault();
    switch (e.code) {
      case 'Space': case 'KeyJ': case 'Enter':
        primaryAction();
        break;
      case 'KeyP': case 'Escape':
        togglePause();
        break;
      case 'KeyM':
        Snd.toggleMute();
        break;
      case 'KeyR':
        if (state === ST.PLAY || state === ST.PAUSE) {
          newGame(game.levelIdx, false); state = ST.ORDER; Snd.setPaused(false);
        } else if (state === ST.CLEAR) {
          startRun(game.levelIdx);
        }
        break;
      case 'Digit1': case 'Numpad1':
        if (state === ST.PAUSE) { state = ST.PLAY; Snd.setPaused(false); }
        break;
      case 'Digit2': case 'Numpad2':
        if (state === ST.PAUSE) { newGame(game.levelIdx, false); state = ST.ORDER; Snd.setPaused(false); }
        break;
      case 'Digit3': case 'Numpad3':
        if (state === ST.PAUSE) { Snd.stopBGM(); state = ST.TITLE; }
        break;
    }
  });

  // 点击页面任意处激活音频上下文（浏览器自动播放策略）
  window.addEventListener('mousedown', function () { Snd.ensure(); }, { passive: true });

  /* ============================== 主循环 ============================== */
  var lastTs = 0;
  function frame(ts) {
    var dt = (ts - lastTs) / 1000;
    lastTs = ts;
    if (!(dt > 0) || dt > 0.05) dt = Math.min(Math.max(dt, 0.0001), 0.05);
    update(dt);
    render();
    requestAnimationFrame(frame);
  }

  /* ============================== 启动 ============================== */
  initDeco();
  loadImages(function () {
    requestAnimationFrame(frame);
  });
})();
