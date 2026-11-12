/* ============================================================
 * 《星火机忆 · Spark Engine》 主逻辑 —— js/game.js
 * ------------------------------------------------------------
 * 核心循环：一张无向星图，你只有一个「火种」。
 *   • 火种停在某个节点上；再点一个「吸附相连」的节点即可点亮它，
 *     花费星尘（基础造价 + 点亮费）。
 *   • 只有从核心出发、沿着「已点亮」的连线能走到的节点才算「链路接通」：
 *     接通的生产器产燃料，接通的资源产出星尘，接通的塔位自动开火。
 *   • 所以真正的决策是：先接供给，还是先扩火力？
 *     接了命脉的节点会被啃食者盯上——它们会一路走来啃灯。
 *
 * 依赖：js/data.js（数值）、js/graph.js（星图与供给传播），须先引入。
 * ============================================================ */
(function () {
  'use strict';

  var D = window.DATA;
  var GR = window.Graph;
  var C = D.CONF;
  var CORE = D.CORE;
  var TAU = Math.PI * 2;
  var RAD = Math.PI / 180;

  /* ================= 小工具 ================= */
  function $(id) { return document.getElementById(id); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function randInt(a, b) { return Math.floor(a + Math.random() * (b - a + 1)); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function dist(ax, ay, bx, by) { return Math.sqrt((ax - bx) * (ax - bx) + (ay - by) * (ay - by)); }
  function fmt(n) { return Math.round(n).toString(); }

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

  /* ================= 音效（WebAudio 合成，零素材） ================= */
  var Sfx = {
    ctx: null, master: null, muted: false, last: {},
    init: function () {
      if (this.ctx) return;
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.5;
        this.master.connect(this.ctx.destination);
      } catch (e) { this.ctx = null; }
    },
    resume: function () {
      if (this.ctx && this.ctx.state === 'suspended') { try { this.ctx.resume(); } catch (e) { } }
    },
    toggle: function () { this.muted = !this.muted; return this.muted; },
    tone: function (f0, f1, dur, type, vol, delay) {
      if (!this.ctx || this.muted) return;
      try {
        var t0 = this.ctx.currentTime + (delay || 0);
        var o = this.ctx.createOscillator();
        var g = this.ctx.createGain();
        o.type = type || 'sine';
        o.frequency.setValueAtTime(f0, t0);
        if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(vol || 0.2, t0 + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        o.connect(g); g.connect(this.master);
        o.start(t0); o.stop(t0 + dur + 0.02);
      } catch (e) { }
    },
    noise: function (dur, vol, delay) {
      if (!this.ctx || this.muted) return;
      try {
        var n = Math.floor(this.ctx.sampleRate * dur);
        var buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
        var d = buf.getChannelData(0);
        for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
        var src = this.ctx.createBufferSource();
        var g = this.ctx.createGain();
        g.gain.value = vol;
        src.buffer = buf;
        src.connect(g); g.connect(this.master);
        src.start(this.ctx.currentTime + (delay || 0));
      } catch (e) { }
    },
    /* 播放带节流，避免一帧几百发时炸耳机 */
    play: function (name) {
      var now = performance.now();
      var gap = { shoot: 90, hit: 60, bite: 140, leak: 120 }[name] || 0;
      if (this.last[name] && now - this.last[name] < gap) return;
      this.last[name] = now;
      switch (name) {
        case 'lite': this.tone(440, 880, 0.16, 'triangle', 0.20); break;
        case 'match': this.tone(660, 990, 0.10, 'sine', 0.16); break;
        case 'shoot': this.tone(1200, 700, 0.045, 'square', 0.045); break;
        case 'hit': this.tone(300, 160, 0.05, 'square', 0.05); break;
        case 'bite': this.noise(0.09, 0.10); break;
        case 'leak': this.tone(180, 60, 0.3, 'sawtooth', 0.18); this.noise(0.15, 0.10); break;
        case 'wave': this.tone(300, 300, 0.14, 'triangle', 0.16); this.tone(450, 450, 0.22, 'triangle', 0.14, 0.14); break;
        case 'clear': this.tone(523, 523, 0.12, 'sine', 0.18); this.tone(659, 659, 0.12, 'sine', 0.18, 0.1); this.tone(784, 784, 0.24, 'sine', 0.18, 0.2); break;
        case 'relic': this.tone(880, 1320, 0.14, 'sine', 0.16); this.tone(1320, 1320, 0.12, 'sine', 0.10, 0.09); break;
        case 'win': [523, 659, 784, 1046].forEach(function (f, i) { Sfx.tone(f, f, 0.28, 'sine', 0.18, i * 0.13); }); break;
        case 'lose': [440, 349, 262].forEach(function (f, i) { Sfx.tone(f, f * 0.98, 0.4, 'triangle', 0.18, i * 0.18); }); break;
      }
    }
  };

  /* ================= 存档 ================= */
  var KEY_BEST = 'xinghuo_best_v1';
  function loadBest() {
    try { return JSON.parse(localStorage.getItem(KEY_BEST) || 'null') || { score: 0, stars: 0, wave: 0 }; }
    catch (e) { return { score: 0, stars: 0, wave: 0 }; }
  }
  function saveBest(b) {
    try { localStorage.setItem(KEY_BEST, JSON.stringify(b)); } catch (e) { }
  }

  /* ================= 游戏状态 ================= */
  var G = {
    state: 'menu',       // menu | playing | paused | result
    t: 0,                // 全局时钟（秒，受暂停影响）
    star: null,          // 星图 emblem（当前星座）
    mods: null,
    nodes: [], links: [], coreAdj: [],
    powered: [],         // 供给布尔数组
    hops: [],            // 到核心的图距离
    lit: 0,              // 已点亮节点数
    dust: 0, fuel: 0,
    fuelMax: C.maxFuel,
    coreHp: CORE.hp, coreShield: CORE.shield, coreHpMax: CORE.hp,
    seedNode: -1,        // 火种所在节点
    enemies: [], shots: [], popups: [], particles: [],
    wave: 0,             // 当前波序号（1-based），0 = 还没开始
    waveState: 'calm',   // calm | active
    waveTimer: C.firstWave,
    spawnAcc: 0,
    tickAcc: 0,
    score: 0, kills: 0, litTotal: 0, bestChain: 0,
    relics: [],          // 本局已获得遗物 key 列表
    relicCount: {},      // 每种遗物数量
    hoverNode: -1,
    hoverPos: { x: -999, y: -999 },
    bubble: null,        // { text, t, life }
    shake: 0,
    log: [],
    stats: { leaked: 0, eaten: 0, dimmed: 0, shots: 0 },
    startedAt: 0
  };

  /* ================= 画布与尺寸 ================= */
  var canvas, ctx, stageWrap, dpr = 1;

  function resizeCanvas() {
    if (!canvas) return;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = C.W * dpr;
    canvas.height = C.H * dpr;
    // 显示尺寸完全交给 CSS（见 style.css），这里只负责内部分辨率与缩放变换。
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
  }

  function canvasPos(ev) {
    var r = canvas.getBoundingClientRect();
    return {
      x: (ev.clientX - r.left) * (C.W / r.width),
      y: (ev.clientY - r.top) * (C.H / r.height)
    };
  }

  /* ================= 星图生成 / 开局 ================= */
  function newRun(constelKey, seed) {
    var constel = null;
    for (var i = 0; i < D.CONSTELLATIONS.length; i++) {
      if (D.CONSTELLATIONS[i].key === constelKey) constel = D.CONSTELLATIONS[i];
    }
    if (!constel) constel = D.CONSTELLATIONS[0];
    G.star = constel;
    G.mods = constel.mods;

    // 三选一用同一个星图，保证「公平对比」
    var map = GR.generateMap({ seed: seed });
    G.nodes = map.nodes.map(function (n) {
      var t = D.NODE_TYPES[n.type];
      var maxHp = Math.round(t.hp * (G.mods.nodeHp || 1));
      return {
        i: n.id, type: n.type, x: n.x, y: n.y, ring: n.ring, seed: n.seed,
        on: false, powered: false,
        hp: maxHp, maxHp: maxHp,
        eaten: false,      // 被啃灭过（复燃更贵）
        cool: 0, angle: rand(0, TAU), boost: 0,
        litAt: 0
      };
    });
    G.links = GR.buildLinks(G.nodes, D.CORE);
    G.coreAdj = GR.coreLinks(G.nodes, D.CORE);

    G.state = 'playing';
    G.t = 0;
    G.dust = C.startDust;
    G.fuel = C.startFuel;
    G.fuelMax = C.maxFuel;
    G.coreHp = CORE.hp;
    G.coreShield = 0;
    G.coreHpMax = CORE.hp;
    G.seedNode = -1;
    G.enemies = []; G.shots = []; G.popups = []; G.particles = [];
    G.wave = 0;
    G.waveState = 'calm';
    G.waveTimer = C.firstWave;
    G.spawnAcc = 0;
    G.tickAcc = 0;
    G.starving = false;
    G.dimWarned = false;
    G.score = 0; G.kills = 0; G.litTotal = 0; G.bestChain = 0;
    G.relics = []; G.relicCount = {};
    G.hoverNode = -1;
    G.bubble = null;
    G.shake = 0;
    G.log = [];
    G.stats = { leaked: 0, eaten: 0, dimmed: 0, shots: 0 };
    G.startedAt = Date.now();

    refreshSupply();
    hideAllOverlays();
    say(pick(D.QUOTES.firstLit), 2.2);
    renderRelics();
    updateHud(true);
    Sfx.play('wave');
    return G;
  }

  /* 遗物数量（带默认值） */
  function relicMul(key) { return G.relicCount[key] || 0; }

  /* ================= 供给与数值 ================= */
  function refreshSupply() {
    G.powered = GR.computeSupply(G.nodes, G.links, G.coreAdj);
    G.hops = GR.hopDistances(G.nodes, G.links, G.coreAdj);
    var lit = 0;
    for (var i = 0; i < G.nodes.length; i++) {
      var n = G.nodes[i];
      n.powered = G.powered[i];
      if (n.on) lit++;
    }
    G.lit = lit;
  }

  /* 星尘产出。注意「星图越大，每颗星尘源效率越低」——
   * 这是全局的扩张惩罚：铺满全图不算最优，取舍才有意义。 */
  function oreEfficiency() {
    // 点亮越多节点，单颗星尘源的效率越低（下限 45%）
    return clamp(1 - G.lit * 0.035, 0.45, 1);
  }

  function nodeDust(n) {
    var t = D.NODE_TYPES[n.type];
    return (t.dust || 0) * (G.mods.oreDust || 1) * (1 + 0.25 * relicMul('harvest')) * oreEfficiency();
  }
  function nodeFuel(n) {
    var t = D.NODE_TYPES[n.type];
    return (t.fuel || 0) * (G.mods.fuelGain || 1) * (1 + 0.25 * relicMul('condenser'));
  }
  function nodeDps(n) {
    var t = D.NODE_TYPES[n.type];
    return (t.dps || 0) * (G.mods.turretDps || 1) * (1 + 0.15 * relicMul('crit'));
  }
  function nodeRange(n) {
    var t = D.NODE_TYPES[n.type];
    return (t.range || 0) * (G.mods.range || 1) * (1 + 0.18 * relicMul('prism'));
  }
  function nodeShield(n) {
    var t = D.NODE_TYPES[n.type];
    return (t.shield || 0) * (G.mods.wardShield || 1);
  }
  function nodeHeal(n) {
    var t = D.NODE_TYPES[n.type];
    return (t.heal || 0) * (G.mods.wardShield || 1);
  }

  function costsOf(n) {
    var type = n.type;
    var base = GR.litCost({ type: type }, G.mods, n.eaten);
    var toSeed = (G.seedNode >= 0) ? 0 : 1;  // 第一次点：不花移动费（火种还没落地）
    return { base: base, walk: toSeed, total: base + toSeed };
  }

  /* 该节点是否「可点」（吸附相连、未点亮） */
  /* n 是节点对象；这里统一用「数组下标」作为节点身份（G.nodes[idx]），
   * 不要用 n.i（那是给调试看的字符串 id）。 */
  function canLight(n) {
    if (!n || n.on) return false;
    if (G.seedNode < 0) return true;         // 火种还没落地：任意节点都能当起点
    if (!G.nodes[G.seedNode]) { G.seedNode = -1; return true; }
    var j = nodeIndex(n);
    if (j < 0) return false;
    return isLinked(G.seedNode, j);
  }

  function nodeIndex(n) {
    for (var k = 0; k < G.nodes.length; k++) if (G.nodes[k] === n) return k;
    return -1;
  }

  /* 两点是否直接相连：交给 graph.js 的唯一判定，避免两处规则漂移 */
  function isLinked(a, b) {
    return GR.canLink(G.nodes, CORE, a, b);
  }

  function lightNode(i) {
    var n = G.nodes[i];
    if (G.state !== 'playing') return false;
    if (n.on) {
      popup(n.x, n.y - 30, '已经点亮了', '#9c8fc4');
      return false;
    }
    if (!canLight(n)) {
      popup(n.x, n.y - 30, '不相邻，点不到', '#9c8fc4');
      Sfx.play('hit');
      return false;
    }
    var cost = costsOf(n);
    if (G.dust < cost.total) {
      popup(n.x, n.y - 30, '星尘不够（需 ' + cost.total + '）', '#ff8f8f');
      Sfx.play('hit');
      return false;
    }

    G.dust -= cost.total;
    var wasEaten = n.eaten;
    n.on = true;
    n.eaten = false;
    n.hp = n.maxHp;
    n.litAt = G.t;
    G.litTotal++;
    G.seedNode = i;

    // 点亮奖励：链路上越远的节点，说明这张图你铺得越开
    refreshSupply();
    var hop = G.hops[i];
    if (hop < 1e8) G.bestChain = Math.max(G.bestChain, hop);
    var scoreGain = 10 + (hop < 1e8 ? hop * 4 : 0) + (wasEaten ? 8 : 0);
    G.score += scoreGain;
    addFloat(n.x, n.y, '+' + scoreGain, '#ffe08a');

    // 首次点亮有概率附赠遗物
    if (!wasEaten && Math.random() < 0.22) grantRelic();

    burst(n.x, n.y, D.NODE_TYPES[n.type].color, 18);
    Sfx.play('lite');
    if (G.litTotal === 1) say(pick(D.QUOTES.firstLit), 2.4);
    else if (Math.random() < 0.35) say(pick(D.QUOTES.lit), 2.0);

    refreshSupply();
    updateHud(true);
    return true;
  }

  function grantRelic() {
    var key = pick(D.RELIC_KEYS);
    var relic = D.RELICS[key];
    if (key === 'bloom') { G.dust += 3; G.fuel = Math.min(G.fuelMax, G.fuel + 6); }
    if (key === 'battery') {
      // 蓄能池：立即给全场节点加血上限（只加一次，可以叠）
      for (var i = 0; i < G.nodes.length; i++) {
        var n = G.nodes[i];
        n.maxHp = Math.round(n.maxHp * 1.2);
        n.hp = Math.round(n.hp * 1.2);
      }
    }
    G.relics.push(key);
    G.relicCount[key] = (G.relicCount[key] || 0) + 1;
    renderRelics();
    Sfx.play('relic');
    addFloat(D.CORE.x, D.CORE.y - 52, '遗物：' + relic.name, relic.color);
  }

  /* ================= 回合结算（每 tick） ================= */
  function tickEconomy() {
    var gainDust = 0, gainFuel = 0, shield = 0, heal = 0;

    // 星图变暗时，除了发电以外的生产全部停摆
    if (G.starving) { updateHud(true); return; }

    for (var i = 0; i < G.nodes.length; i++) {
      var n = G.nodes[i];
      if (!n.on || !n.powered) continue;       // 链路断了 = 不工作
      var t = D.NODE_TYPES[n.type];
      if (n.type === 'ore') gainDust += nodeDust(n);
      if (n.type === 'fuel') gainFuel += nodeFuel(n);
      if (n.type === 'ward') { shield += nodeShield(n); heal += nodeHeal(n); }
      if (n.type === 'turret') n.boost = 1;
    }

    if (gainDust > 0) {
      G.dust += gainDust;
      addFloat(D.CORE.x - 54, D.CORE.y + 6, '+' + Math.round(gainDust * 10) / 10 + ' 尘', '#8FA8FF');
    }
    if (gainFuel > 0) {
      G.fuel = Math.min(G.fuelMax, G.fuel + gainFuel);
      addFloat(D.CORE.x + 54, D.CORE.y + 6, '+' + Math.round(gainFuel * 10) / 10 + ' 燃料', '#7BE0C4');
    }
    if (shield > 0) {
      G.coreShield = Math.min(30, G.coreShield + shield);
      G.coreHp = Math.min(G.coreHpMax, G.coreHp + heal);
    }

    /* 燃料结算：
     * 点燃的节点越多，星图越费燃料（1 + lit × fuelPerNode）。
     * 生产器净产出为正就能维持；燃料见底 → 全场变暗停产，
     * 但核心本身不会因此掉血——它的伤害只来自机群撞上来。
     */
    var drain = 1 + G.lit * C.fuelPerNode;
    if (G.fuel <= 0) {
      G.fuel = 0;
      G.starving = true;
      G.stats.dimmed++;
      if (!G.dimWarned) {
        G.dimWarned = true;
        G.shake = Math.max(G.shake, 4);
        say(pick(D.QUOTES.dim), 2.4);
        addFloat(CORE.x, CORE.y - 46, '燃料耗尽 · 星图变暗', '#ff9f6b');
        Sfx.play('leak');
      }
    } else {
      G.fuel = Math.max(0, G.fuel - drain);
      if (G.fuel > 0) { G.dimWarned = false; G.starving = false; }
    }

    refreshSupply();
    updateHud(true);
  }

  /* ================= 波次 ================= */
  function startWave(idx) {
    G.wave = idx;
    G.waveState = 'active';
    G.waveTimer = D.WAVES[idx - 1].duration;
    G.spawnAcc = 0;
    say(pick(D.QUOTES.waveStart), 2.4);
    banner(D.WAVES[idx - 1].name, D.WAVES[idx - 1].greet);
    Sfx.play('wave');
    updateHud(true);
  }

  function endWave() {
    var w = D.WAVES[G.wave - 1];
    G.waveState = 'calm';
    G.score += 120 + G.wave * 60;
    addFloat(D.CORE.x, D.CORE.y - 46, '波次清空 +' + (120 + G.wave * 60), '#ffe08a');
    say(pick(D.QUOTES.waveClear), 2.6);
    banner('清空', w.name.replace(/^第.波 · /, '') + ' —— 喘口气，铺一下星图。');
    Sfx.play('clear');

    if (G.wave >= C.maxWaves) {
      // 最后一波打完：把残余机群留一会儿再结算
      G.waveTimer = 1e9;
      setTimeout(function () { if (G.state === 'playing') finishRun(true); }, 1800);
    } else {
      G.waveTimer = C.waveGap;
    }
    updateHud(true);
  }

  function updateWaves(dt) {
    if (G.wave >= C.maxWaves && G.waveState === 'calm') return;
    G.waveTimer -= dt;

    if (G.waveState === 'calm' && G.wave < C.maxWaves) {
      if (G.waveTimer <= 0) startWave(G.wave + 1);
    } else if (G.waveState === 'active') {
      var w = D.WAVES[G.wave - 1];
      G.spawnAcc -= dt;
      var interval = w.spawnMs / 1000;
      if (G.spawnAcc <= 0) {
        spawnEnemy(w);
        G.spawnAcc = interval * rand(0.85, 1.15);
      }
      if (G.waveTimer <= 0) endWave();
    }
  }

  /* ================= 机群 ================= */
  function spawnEnemy(waveDef) {
    // 按权重抽类型
    var total = 0, k;
    for (k = 0; k < waveDef.groups.length; k++) total += waveDef.groups[k].weight;
    var r = Math.random() * total;
    var typeKey = waveDef.groups[0].type;
    for (k = 0; k < waveDef.groups.length; k++) {
      r -= waveDef.groups[k].weight;
      if (r <= 0) { typeKey = waveDef.groups[k].type; break; }
    }
    var def = D.ENEMIES[typeKey];
    var hpMul = 1 + (G.wave - 1) * 0.28;

    // 出生点：核心周围一圈，正好落在「生成环」上
    var ang = rand(0, TAU);
    var rad = 168 + rand(-16, 16);
    var sx = D.CORE.x + Math.cos(ang) * rad;
    var sy = D.CORE.y + Math.sin(ang) * rad;

    var target = pickTarget(typeKey);
    G.enemies.push({
      key: typeKey, def: def,
      x: sx, y: sy,
      hp: def.hp * hpMul, maxHp: def.hp * hpMul,
      speed: def.speed * rand(1 - def.speedJitter, 1 + def.speedJitter),
      wob: rand(0, TAU),
      target: target,
      biteT: 0,
      stun: 0,
      alive: true,
      born: G.t
    });
  }

  /* 啃食者优先挑「接通但最靠近它」的节点 */
  function pickTarget(typeKey) {
    var best = -1, bestD = 1e9;
    if (typeKey === 'chewer') {
      for (var i = 0; i < G.nodes.length; i++) {
        var n = G.nodes[i];
        if (!n.on) continue;
        var d = dist(n.x, n.y, D.CORE.x, D.CORE.y);
        if (d < bestD) { bestD = d; best = i; }
      }
      if (best < 0) {
        // 没有点亮的节点，就随便挑一个（会把灯啃掉）
        for (var j = 0; j < G.nodes.length; j++) {
          if (G.nodes[j].hp <= 0) continue;
          best = j; break;
        }
      }
      return best;
    }
    return -1;  // 其余直接冲核心
  }

  function updateEnemies(dt) {
    var alive = [];
    for (var i = 0; i < G.enemies.length; i++) {
      var e = G.enemies[i];
      if (!e.alive) continue;
      if (e.stun > 0) { e.stun -= dt; }
      var tx, ty;
      if (e.target >= 0 && G.nodes[e.target]) {
        var tn = G.nodes[e.target];
        if (!tn.on) {
          // 目标被啃灭了，换下一个（或者冲核心）
          e.target = pickTarget(e.key);
        }
        if (e.target >= 0 && G.nodes[e.target]) {
          tx = G.nodes[e.target].x; ty = G.nodes[e.target].y;
        } else { tx = D.CORE.x; ty = D.CORE.y; }
      } else { tx = D.CORE.x; ty = D.CORE.y; }

      var dx = tx - e.x, dy = ty - e.y;
      var d = Math.sqrt(dx * dx + dy * dy) || 1;
      var spd = e.speed * (e.stun > 0 ? 0.25 : 1);

      // 抵达：啃灯 or 撞核心
      if (e.target >= 0 && d < C.nodeR + e.def.radius - 4) {
        e.biteT -= dt;
        if (e.biteT <= 0) {
          e.biteT = e.def.biteEvery || 0.8;
          biteNode(e, G.nodes[e.target]);
        }
      } else if (e.target < 0 && d < C.coreR + e.def.radius) {
        hitCore(e);
        e.alive = false;
        continue;
      } else {
        e.x += (dx / d) * spd * dt;
        e.y += (dy / d) * spd * dt;
      }
      e.wob += dt * 6;
      alive.push(e);
    }
    G.enemies = alive;
  }

  function biteNode(e, n) {
    n.hp -= e.def.bite || 6;
    n.boost = 1;
    Sfx.play('bite');
    burst(n.x, n.y, '#ff9fb0', 6, 0.6);
    if (n.hp <= 0) {
      killNode(n);
      e.alive = false;
    }
  }

  function killNode(n) {
    n.on = false;
    n.eaten = true;
    n.hp = 0;
    G.stats.eaten++;
    G.shake = Math.max(G.shake, 7);
    say(pick(D.QUOTES.eaten), 2.2);
    addFloat(n.x, n.y - 34, '节点熄灭', '#ff8fa8');
    burst(n.x, n.y, '#ff7a9c', 26, 1.2);
    Sfx.play('leak');
    if (G.seedNode >= 0 && G.nodes[G.seedNode] === n) {
      // 火种所在节点被啃掉了：火种退回核心
      G.seedNode = -1;
    }
    refreshSupply();
    updateHud(true);
  }

  function hitCore(e) {
    var dmg = (e.def.damage || 5) + (G.wave - 1) * 1;
    if (G.coreShield > 0) {
      var absorbed = Math.min(G.coreShield, dmg);
      G.coreShield -= absorbed;
      dmg -= absorbed;
    }
    G.coreHp -= dmg;
    G.stats.leaked++;
    G.shake = Math.max(G.shake, 8);
    addFloat(D.CORE.x, D.CORE.y - 40, '-' + Math.round(dmg), '#ff6b6b');
    burst(D.CORE.x, D.CORE.y, '#ff6b6b', 14, 1.0);
    say(pick(D.QUOTES.hit), 1.8);
    Sfx.play('leak');
    if (G.coreHp <= 0) { G.coreHp = 0; finishRun(false); }
    updateHud(true);
  }

  /* ================= 火力 ================= */
  function updateTurrets(dt) {
    for (var i = 0; i < G.nodes.length; i++) {
      var n = G.nodes[i];
      if (n.type !== 'turret') continue;
      n.boost = Math.max(0, n.boost - dt * 2);
      if (!n.on || !n.powered) continue;
      var range = nodeRange(n);
      n.cool -= dt * (1 + 0.2 * relicMul('quick'));
      if (n.cool > 0) continue;

      // 找射程内最近的敌人
      var best = null, bestD = 1e9;
      for (var j = 0; j < G.enemies.length; j++) {
        var e = G.enemies[j];
        if (!e.alive) continue;
        var d = dist(n.x, n.y, e.x, e.y);
        if (d < range && d < bestD) { bestD = d; best = e; }
      }
      if (!best) continue;

      n.cool = 0.55;
      n.angle = Math.atan2(best.y - n.y, best.x - n.x);
      var dmg = nodeDps(n) * 0.55;
      G.shots.push({
        x: n.x, y: n.y, tx: best.x, ty: best.y,
        target: best, dmg: dmg, t: 0, life: 0.12,
        color: D.NODE_TYPES.turret.color,
        from: i
      });
      G.stats.shots++;
      Sfx.play('shoot');
    }
  }

  function updateShots(dt) {
    var keep = [];
    for (var i = 0; i < G.shots.length; i++) {
      var s = G.shots[i];
      s.t += dt;
      if (s.target && s.target.alive) { s.tx = s.target.x; s.ty = s.target.y; }
      if (s.t >= s.life) {
        if (s.target && s.target.alive) damageEnemy(s.target, s.dmg);
        else {
          // 目标没了就打在落点上（视觉残留）
        }
        burst(s.tx, s.ty, '#ffd7a8', 4, 0.45);
        Sfx.play('hit');
      } else keep.push(s);
    }
    G.shots = keep;
  }

  function damageEnemy(e, dmg) {
    e.hp -= dmg;
    if (e.hp <= 0 && e.alive) {
      e.alive = false;
      G.kills++;
      G.score += 6 + G.wave * 3;
      G.dust += e.def.dust * 0.5;
      G.fuel = Math.min(G.fuelMax, G.fuel + e.def.fuel * 0.5);
      burst(e.x, e.y, e.def.color, 12, 0.8);
      addFloat(e.x, e.y - 12, '+' + (6 + G.wave * 3), '#c9f5d0');
    }
  }

  /* ================= 特效 ================= */
  function burst(x, y, color, n, power) {
    n = n || 10; power = power || 1;
    for (var i = 0; i < n; i++) {
      var a = rand(0, TAU), sp = rand(40, 180) * power;
      G.particles.push({
        x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: rand(0.25, 0.6), t: 0, color: color, size: rand(1.5, 3.6)
      });
    }
  }

  function addFloat(x, y, text, color) { popup(x, y, text, color); }

  function popup(x, y, text, color) {
    G.popups.push({ x: x, y: y, text: text, color: color || '#fff', t: 0, life: 1.1 });
  }

  function updateFx(dt) {
    var i;
    for (i = G.particles.length - 1; i >= 0; i--) {
      var p = G.particles[i];
      p.t += dt;
      if (p.t >= p.life) { G.particles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.94; p.vy *= 0.94;
    }
    for (i = G.popups.length - 1; i >= 0; i--) {
      var q = G.popups[i];
      q.t += dt;
      q.y -= 26 * dt;
      if (q.t >= q.life) G.popups.splice(i, 1);
    }
    if (G.bubble) {
      G.bubble.t += dt;
      if (G.bubble.t >= G.bubble.life) G.bubble = null;
    }
    G.shake = Math.max(0, G.shake - dt * 26);
  }

  function say(text, life) {
    G.bubble = { text: text, t: 0, life: life || 2.2 };
  }

  /* 波次横幅：DOM 层，2.6 秒后自动淡出 */
  var bannerTimer = null;
  function banner(title, sub) {
    var host = $('banner');
    if (!host) return;
    var tEl = $('banner-title'), sEl = $('banner-sub');
    if (tEl) tEl.textContent = title || '';
    if (sEl) sEl.textContent = sub || '';
    host.classList.remove('hidden');
    host.classList.remove('out');
    void host.offsetWidth;          // 触发重排以重放入场动画
    host.classList.add('in');
    if (bannerTimer) clearTimeout(bannerTimer);
    bannerTimer = setTimeout(function () {
      host.classList.remove('in');
      host.classList.add('out');
      bannerTimer = setTimeout(function () {
        host.classList.add('hidden');
        host.classList.remove('out');
      }, 420);
    }, 2600);
  }

  /* ================= 结算 ================= */
  function finishRun(win) {
    if (G.state === 'result') return;
    G.state = 'result';
    var stars = 0;
    if (win) {
      G.score += 500 + Math.round(G.coreHp * 3) + G.bestChain * 20;
      stars = G.coreHp >= 70 ? 3 : (G.coreHp >= 40 ? 2 : 1);
      Sfx.play('win');
      say(pick(D.QUOTES.win), 5);
    } else {
      Sfx.play('lose');
      say(pick(D.QUOTES.lose), 5);
    }
    var best = loadBest();
    var isNew = G.score > (best.score || 0);
    if (isNew) { best.score = G.score; best.stars = Math.max(best.stars || 0, stars); best.wave = Math.max(best.wave || 0, G.wave); saveBest(best); }
    showResult(win, stars, isNew);
    updateHud(true);
  }

  /* ================= HUD ================= */
  var hudCache = {};
  function setText(id, txt) {
    if (hudCache[id] === txt) return;
    hudCache[id] = txt;
    var el = $(id);
    if (el) el.textContent = txt;
  }

  function updateHud(force) {
    if (force) hudCache = {};
    setText('hud-dust', fmt(G.dust));
    setText('hud-fuel', fmt(G.fuel) + '/' + G.fuelMax);
    setText('hud-hp', fmt(G.coreHp));
    setText('hud-score', fmt(G.score));
    setText('hud-wave', G.wave === 0 ? '准备' : (G.wave + ' / ' + C.maxWaves));
    setText('hud-lit', G.lit + '');

    var fuelBar = $('fuel-bar');
    if (fuelBar) fuelBar.style.width = clamp((G.fuel / G.fuelMax) * 100, 0, 100) + '%';
    var hpBar = $('hp-bar');
    if (hpBar) hpBar.style.width = clamp((G.coreHp / G.coreHpMax) * 100, 0, 100) + '%';
    var shBar = $('shield-bar');
    if (shBar) shBar.style.width = clamp((G.coreShield / 30) * 100, 0, 100) + '%';

    var tip = $('hud-tip');
    if (tip) {
      var txt;
      if (G.state === 'menu') txt = '选一张星图开始。';
      else if (G.waveState === 'active') txt = D.WAVES[Math.max(0, G.wave - 1)].name + ' · 剩 ' + Math.ceil(Math.max(0, G.waveTimer)) + 's';
      else if (G.wave === 0) txt = '第一波 ' + Math.ceil(Math.max(0, G.waveTimer)) + 's 后抵达';
      else if (G.wave >= C.maxWaves) txt = '最后一波已清空';
      else txt = '下一波 ' + Math.ceil(Math.max(0, G.waveTimer)) + 's';
      setText('hud-tip', txt);
    }

    var runBtn = $('btn-run');
    if (runBtn) {
      var run = G.state === 'playing';
      runBtn.textContent = run ? '暂停 (P)' : '继续 (P)';
      runBtn.disabled = (G.state === 'menu' || G.state === 'result');
    }
  }

  /* ================= 渲染 ================= */
  var stars = [];
  (function () {
    var r = GR.makeRng(20261112);
    for (var i = 0; i < 130; i++) {
      stars.push({ x: r() * C.W, y: r() * C.H, a: 0.15 + r() * 0.6, s: 0.5 + r() * 1.6, ph: r() * TAU });
    }
  })();

  function drawBackground(c, t) {
    var g = c.createRadialGradient(C.W / 2, C.H / 2, 60, C.W / 2, C.H / 2, 620);
    g.addColorStop(0, '#1d1740');
    g.addColorStop(0.55, '#141033');
    g.addColorStop(1, '#0a0820');
    c.fillStyle = g;
    c.fillRect(0, 0, C.W, C.H);

    // 星野
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      var tw = 0.65 + 0.35 * Math.sin(t * 1.4 + s.ph);
      c.globalAlpha = s.a * tw;
      c.fillStyle = s.s > 1.6 ? '#cfd8ff' : '#ffffff';
      c.fillRect(s.x, s.y, s.s, s.s);
    }
    c.globalAlpha = 1;

    // 机群生成环（虚线）
    c.save();
    c.strokeStyle = 'rgba(150,130,255,0.16)';
    c.setLineDash([3, 9]);
    c.lineWidth = 1;
    c.beginPath();
    c.arc(D.CORE.x, D.CORE.y, 168, 0, TAU);
    c.stroke();
    c.restore();
  }

  function drawLinks(c) {
    // 1) 潜在连线（很淡的星网底纹）
    c.lineWidth = 1;
    for (var i = 0; i < G.links.length; i++) {
      var l = G.links[i];
      var a = G.nodes[l.a], b = G.nodes[l.b];
      var lit = a.on && b.on;
      if (lit) continue;
      c.strokeStyle = 'rgba(140,130,210,0.13)';
      c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
    }
    // 2) 已连通（两端都亮且都通电）→ 青色流光
    for (var j = 0; j < G.links.length; j++) {
      var l2 = G.links[j];
      var a2 = G.nodes[l2.a], b2 = G.nodes[l2.b];
      if (!(a2.on && b2.on)) continue;
      var both = a2.powered && b2.powered;
      if (both) {
        c.strokeStyle = 'rgba(123,224,196,0.55)';
        c.lineWidth = 2;
      } else {
        c.strokeStyle = 'rgba(200,160,255,0.30)';
        c.lineWidth = 1.5;
      }
      c.beginPath(); c.moveTo(a2.x, a2.y); c.lineTo(b2.x, b2.y); c.stroke();
      if (both) {
        // 流动的光点
        var ph = ((G.t * 0.4) + j * 0.13) % 1;
        var px = a2.x + (b2.x - a2.x) * ph;
        var py = a2.y + (b2.y - a2.y) * ph;
        c.fillStyle = 'rgba(180,255,235,0.9)';
        c.beginPath(); c.arc(px, py, 2.2, 0, TAU); c.fill();
      }
    }
    // 3) 核心 → 内环节点
    for (var k = 0; k < G.coreAdj.length; k++) {
      var idx = G.coreAdj[k];
      var n = G.nodes[idx];
      if (n.on && n.powered) {
        c.strokeStyle = 'rgba(123,224,196,0.55)'; c.lineWidth = 2;
      } else {
        c.strokeStyle = 'rgba(140,130,210,0.13)'; c.lineWidth = 1;
      }
      c.beginPath(); c.moveTo(D.CORE.x, D.CORE.y); c.lineTo(n.x, n.y); c.stroke();
    }
  }

  function drawCore(c, t) {
    var x = D.CORE.x, y = D.CORE.y;
    // 光晕
    var g = c.createRadialGradient(x, y, 4, x, y, 90);
    g.addColorStop(0, 'rgba(255,196,107,0.34)');
    g.addColorStop(1, 'rgba(255,196,107,0)');
    c.fillStyle = g;
    c.beginPath(); c.arc(x, y, 90, 0, TAU); c.fill();

    // 护盾环
    if (G.coreShield > 0.5) {
      c.strokeStyle = 'rgba(201,160,255,' + (0.35 + 0.3 * (G.coreShield / 30)) + ')';
      c.lineWidth = 3;
      c.beginPath(); c.arc(x, y, C.coreR + 9, 0, TAU); c.stroke();
    }

    // 核心本体（呼吸）
    var pulse = 1 + Math.sin(t * 2.4) * 0.03;
    var r = C.coreR * pulse;
    var cg = c.createRadialGradient(x - r * 0.3, y - r * 0.3, 2, x, y, r);
    var hpRate = G.coreHp / G.coreHpMax;
    cg.addColorStop(0, '#fff3d4');
    cg.addColorStop(0.45, hpRate > 0.4 ? '#ffc46b' : '#ff8a7a');
    cg.addColorStop(1, '#b8722e');
    c.fillStyle = cg;
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();

    c.strokeStyle = 'rgba(255,240,200,0.8)';
    c.lineWidth = 1.5;
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke();

    // 内圈刻度
    c.save();
    c.translate(x, y);
    c.rotate(t * 0.35);
    c.strokeStyle = 'rgba(255,240,200,0.45)';
    c.lineWidth = 1;
    for (var i = 0; i < 8; i++) {
      var a = (TAU / 8) * i;
      c.beginPath();
      c.moveTo(Math.cos(a) * (r - 7), Math.sin(a) * (r - 7));
      c.lineTo(Math.cos(a) * (r - 2), Math.sin(a) * (r - 2));
      c.stroke();
    }
    c.restore();

    // 血量弧
    c.strokeStyle = hpRate > 0.4 ? 'rgba(140,255,200,0.9)' : 'rgba(255,110,110,0.95)';
    c.lineWidth = 3;
    c.beginPath();
    c.arc(x, y, C.coreR + 15, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(hpRate, 0, 1));
    c.stroke();
  }

  function nodeColor(n) {
    return D.NODE_TYPES[n.type].color;
  }

  function drawNode(c, n, i, t) {
    var lit = n.on;
    var powered = n.powered;
    var hovered = G.hoverNode === i && G.state === 'playing';
    var lightable = G.state === 'playing' && canLight(n);
    var color = nodeColor(n);

    var pop = lit ? clamp((t - n.litAt) * 5, 0, 1) : 0;
    var scale = lit ? (1 + (1 - pop) * 0.5) : 1;
    var r = C.nodeR * scale;

    // 火种标记（当前可以点到的节点描边脉动）
    if (lightable) {
      var pl = 0.5 + 0.5 * Math.sin(t * 4 + n.seed * 6);
      c.strokeStyle = 'rgba(255,214,110,' + (0.28 + pl * 0.5) + ')';
      c.lineWidth = 2;
      c.setLineDash([4, 5]);
      c.lineDashOffset = -t * 18;
      c.beginPath(); c.arc(n.x, n.y, r + 9, 0, TAU); c.stroke();
      c.setLineDash([]);
    }

    if (hovered) {
      c.strokeStyle = 'rgba(255,255,255,0.85)';
      c.lineWidth = 2;
      c.beginPath(); c.arc(n.x, n.y, r + 6, 0, TAU); c.stroke();
    }

    // 底座
    if (lit) {
      // 已点亮
      var glowA = powered ? 0.34 : 0.12;
      var gg = c.createRadialGradient(n.x, n.y, 2, n.x, n.y, r + 22);
      gg.addColorStop(0, hexA(color, glowA + 0.18));
      gg.addColorStop(1, hexA(color, 0));
      c.fillStyle = gg;
      c.beginPath(); c.arc(n.x, n.y, r + 22, 0, TAU); c.fill();

      c.fillStyle = powered ? hexA(color, 0.92) : '#3a3357';
      c.beginPath(); c.arc(n.x, n.y, r, 0, TAU); c.fill();
      c.strokeStyle = powered ? '#ffffff' : '#6a6390';
      c.lineWidth = powered ? 2 : 1.5;
      c.beginPath(); c.arc(n.x, n.y, r, 0, TAU); c.stroke();

      // 内圈
      c.fillStyle = powered ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.25)';
      c.beginPath(); c.arc(n.x, n.y, r * 0.66, 0, TAU); c.fill();
    } else {
      // 未点亮
      c.fillStyle = 'rgba(30,24,58,0.92)';
      c.beginPath(); c.arc(n.x, n.y, r, 0, TAU); c.fill();
      c.strokeStyle = hexA(color, 0.55);
      c.lineWidth = 1.5;
      c.setLineDash([3, 4]);
      c.beginPath(); c.arc(n.x, n.y, r, 0, TAU); c.stroke();
      c.setLineDash([]);
    }

    // 图示
    drawNodeIcon(c, n, r, lit, powered, t, color);

    // 残血条
    if (lit && n.hp < n.maxHp) {
      var w = r * 1.7, h = 3.5;
      c.fillStyle = 'rgba(0,0,0,0.5)';
      rr(c, n.x - w / 2, n.y + r + 8, w, h, 2); c.fill();
      c.fillStyle = '#8ef0c0';
      rr(c, n.x - w / 2, n.y + r + 8, w * clamp(n.hp / n.maxHp, 0, 1), h, 2); c.fill();
    }

    // 费用标签（可点但未点亮的时候）
    if (lightable) {
      var cost = costsOf(n).total;
      var afford = G.dust >= cost;
      var label = cost + ' 尘';
      c.font = 'bold 11px "PingFang SC", "Microsoft YaHei", sans-serif';
      var tw = c.measureText(label).width + 12;
      c.fillStyle = afford ? 'rgba(255,214,110,0.16)' : 'rgba(255,90,90,0.16)';
      rr(c, n.x - tw / 2, n.y + r + 6, tw, 15, 7.5);
      c.fill();
      c.fillStyle = afford ? '#ffd76e' : '#ff9a9a';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(label, n.x, n.y + r + 13.5);
    }
  }

  function drawNodeIcon(c, n, r, lit, powered, t, color) {
    c.save();
    c.translate(n.x, n.y);
    var ico = '#ffffff';
    var dim = lit ? (powered ? 1 : 0.5) : 0.85;
    c.globalAlpha = dim;
    c.fillStyle = lit ? ico : hexA(color, 0.9);
    c.strokeStyle = c.fillStyle;
    c.lineWidth = 2;
    var s = r * 0.42;

    if (n.type === 'ore') {
      // 菱形结晶
      c.beginPath();
      c.moveTo(0, -s); c.lineTo(s * 0.8, 0); c.lineTo(0, s); c.lineTo(-s * 0.8, 0);
      c.closePath(); c.fill();
      if (lit) {
        c.fillStyle = hexA('#0b0820', 0.55);
        c.beginPath();
        c.moveTo(0, -s * 0.55); c.lineTo(s * 0.42, 0); c.lineTo(0, s * 0.55); c.lineTo(-s * 0.42, 0);
        c.closePath(); c.fill();
      }
    } else if (n.type === 'fuel') {
      // 火焰
      c.beginPath();
      c.moveTo(0, -s * 1.15);
      c.bezierCurveTo(s * 0.95, -s * 0.1, s * 0.7, s * 1.05, 0, s * 1.05);
      c.bezierCurveTo(-s * 0.7, s * 1.05, -s * 0.95, -s * 0.1, 0, -s * 1.15);
      c.fill();
      if (lit) {
        c.fillStyle = hexA('#0b0820', 0.5);
        c.beginPath(); c.ellipse(0, s * 0.42, s * 0.34, s * 0.44, 0, 0, TAU); c.fill();
      }
    } else if (n.type === 'turret') {
      // 炮塔：底座 + 指向当前目标的炮管
      c.beginPath(); c.arc(0, 0, s * 0.95, 0, TAU); c.fill();
      c.fillStyle = lit ? hexA('#0b0820', 0.6) : hexA(color, 0.35);
      c.beginPath(); c.arc(0, 0, s * 0.55, 0, TAU); c.fill();
      c.save();
      c.rotate(n.angle || 0);
      c.fillStyle = lit ? ico : hexA(color, 0.9);
      rr(c, s * 0.1, -s * 0.22, s * 1.05, s * 0.44, s * 0.2);
      c.fill();
      c.restore();
    } else if (n.type === 'ward') {
      // 盾牌
      c.beginPath();
      c.moveTo(0, -s * 1.1);
      c.lineTo(s * 0.95, -s * 0.55);
      c.lineTo(s * 0.95, s * 0.2);
      c.quadraticCurveTo(s * 0.9, s * 1.0, 0, s * 1.2);
      c.quadraticCurveTo(-s * 0.9, s * 1.0, -s * 0.95, s * 0.2);
      c.lineTo(-s * 0.95, -s * 0.55);
      c.closePath(); c.fill();
      if (lit) {
        c.strokeStyle = hexA('#0b0820', 0.5);
        c.lineWidth = 1.6;
        c.beginPath(); c.moveTo(0, -s * 0.7); c.lineTo(0, s * 0.7); c.stroke();
      }
    }
    c.restore();

    // 通电时围着节点转的小光点
    if (lit && powered) {
      var a0 = t * 1.1 + n.seed * TAU;
      c.fillStyle = hexA(color, 0.9);
      for (var k = 0; k < 3; k++) {
        var a = a0 + (TAU / 3) * k;
        c.beginPath();
        c.arc(n.x + Math.cos(a) * (r + 5), n.y + Math.sin(a) * (r + 5), 1.8, 0, TAU);
        c.fill();
      }
    }
  }

  function hexA(hex, a) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var r = parseInt(h.substr(0, 2), 16), g = parseInt(h.substr(2, 2), 16), b = parseInt(h.substr(4, 2), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }

  function drawEnemies(c, t) {
    for (var i = 0; i < G.enemies.length; i++) {
      var e = G.enemies[i];
      var d = e.def;
      var pulse = 1 + Math.sin(e.wob) * 0.06;
      var r = d.radius * pulse;

      // 拖尾光晕
      var gg = c.createRadialGradient(e.x, e.y, 1, e.x, e.y, r * 2.6);
      gg.addColorStop(0, hexA(d.color, 0.55));
      gg.addColorStop(1, hexA(d.color, 0));
      c.fillStyle = gg;
      c.beginPath(); c.arc(e.x, e.y, r * 2.6, 0, TAU); c.fill();

      c.fillStyle = d.color;
      c.beginPath(); c.arc(e.x, e.y, r, 0, TAU); c.fill();
      c.strokeStyle = d.ring;
      c.lineWidth = 1.6;
      c.beginPath(); c.arc(e.x, e.y, r, 0, TAU); c.stroke();

      // 内部：一只盯着的眼
      c.fillStyle = 'rgba(10,8,24,0.85)';
      c.beginPath(); c.arc(e.x, e.y, r * 0.45, 0, TAU); c.fill();
      c.fillStyle = d.ring;
      c.beginPath(); c.arc(e.x, e.y, r * 0.2, 0, TAU); c.fill();

      // 血条
      if (e.hp < e.maxHp) {
        var w = r * 2.2;
        c.fillStyle = 'rgba(0,0,0,0.45)';
        rr(c, e.x - w / 2, e.y - r - 8, w, 3, 1.5); c.fill();
        c.fillStyle = '#ffb0c0';
        rr(c, e.x - w / 2, e.y - r - 8, w * clamp(e.hp / e.maxHp, 0, 1), 3, 1.5); c.fill();
      }

      // 瞄准目标时的连线提示（啃食者）
      if (e.key === 'chewer' && e.target >= 0 && G.nodes[e.target] && G.nodes[e.target].on) {
        var tn = G.nodes[e.target];
        c.strokeStyle = 'rgba(255,120,150,0.18)';
        c.lineWidth = 1;
        c.setLineDash([2, 6]);
        c.beginPath(); c.moveTo(e.x, e.y); c.lineTo(tn.x, tn.y); c.stroke();
        c.setLineDash([]);
      }
    }
  }

  function drawShots(c) {
    for (var i = 0; i < G.shots.length; i++) {
      var s = G.shots[i];
      var k = clamp(s.t / s.life, 0, 1);
      c.strokeStyle = 'rgba(255,220,160,' + (0.9 - k * 0.7) + ')';
      c.lineWidth = 2;
      c.beginPath(); c.moveTo(s.x, s.y); c.lineTo(s.tx, s.ty); c.stroke();
      c.fillStyle = '#fff1cf';
      c.beginPath(); c.arc(s.tx, s.ty, 2.6, 0, TAU); c.fill();
    }
  }

  function drawFx(c) {
    for (var i = 0; i < G.particles.length; i++) {
      var p = G.particles[i];
      var a = 1 - p.t / p.life;
      c.globalAlpha = a;
      c.fillStyle = p.color;
      c.beginPath(); c.arc(p.x, p.y, p.size * a, 0, TAU); c.fill();
    }
    c.globalAlpha = 1;

    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (var j = 0; j < G.popups.length; j++) {
      var q = G.popups[j];
      var k = 1 - q.t / q.life;
      c.globalAlpha = clamp(k * 1.4, 0, 1);
      c.font = 'bold 13px "PingFang SC", "Microsoft YaHei", sans-serif';
      c.fillStyle = 'rgba(0,0,0,0.45)';
      c.fillText(q.text, q.x + 1, q.y + 1);
      c.fillStyle = q.color;
      c.fillText(q.text, q.x, q.y);
    }
    c.globalAlpha = 1;
  }

  function drawBubble(c) {
    if (!G.bubble) return;
    var b = G.bubble;
    var k = Math.min(1, b.t / 0.16) * Math.min(1, (b.life - b.t) / 0.3);
    k = clamp(k, 0, 1);
    c.globalAlpha = k;
    c.font = '13px "PingFang SC", "Microsoft YaHei", sans-serif';
    var tw = c.measureText(b.text).width;
    var w = tw + 26, h = 32;
    var x = D.CORE.x - w / 2, y = D.CORE.y - 96 - (1 - k) * 8;

    c.fillStyle = 'rgba(16,12,34,0.92)';
    c.strokeStyle = 'rgba(201,160,255,0.55)';
    c.lineWidth = 1;
    rr(c, x, y, w, h, 12); c.fill(); c.stroke();
    // 小三角
    c.beginPath();
    c.moveTo(D.CORE.x - 6, y + h); c.lineTo(D.CORE.x + 6, y + h); c.lineTo(D.CORE.x, y + h + 8);
    c.closePath(); c.fill();

    c.fillStyle = '#efe6ff';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(b.text, D.CORE.x, y + h / 2 + 0.5);
    c.globalAlpha = 1;
  }

  function render() {
    if (!ctx) return;
    var c = ctx;
    var t = G.t;
    c.save();
    if (G.shake > 0.4) c.translate(rand(-G.shake, G.shake) * 0.5, rand(-G.shake, G.shake) * 0.5);

    drawBackground(c, t);
    drawLinks(c);
    drawCore(c, t);
    for (var i = 0; i < G.nodes.length; i++) drawNode(c, G.nodes[i], i, t);
    drawEnemies(c, t);
    drawShots(c);
    drawFx(c);
    drawBubble(c);

    c.restore();
  }

  /* ================= 主循环 ================= */
  var lastTs = 0;
  function loop(ts) {
    if (!lastTs) lastTs = ts;
    var dt = Math.min(0.05, (ts - lastTs) / 1000);
    lastTs = ts;

    if (G.state === 'playing') {
      G.t += dt;
      G.tickAcc += dt;
      if (G.tickAcc >= C.tickEvery) {
        G.tickAcc -= C.tickEvery;
        tickEconomy();
      }
      updateWaves(dt);
      updateEnemies(dt);
      updateTurrets(dt);
      updateShots(dt);
      updateFx(dt);
      updateHud();
      updateSpawnHint();
    } else if (G.state === 'menu') {
      G.t += dt;
    }
    render();
    requestAnimationFrame(loop);
  }

  /* ================= 覆盖层 ================= */
  function hideAllOverlays() {
    var ids = ['ov-menu', 'ov-pause', 'ov-result', 'ov-help'];
    for (var i = 0; i < ids.length; i++) {
      var el = $(ids[i]);
      if (el) el.classList.add('hidden');
    }
    document.body.classList.add('playing');
  }

  function showOverlay(id) {
    var el = $(id);
    if (el) el.classList.remove('hidden');
  }

  function showResult(win, starsN, isNew) {
    var box = $('ov-result');
    if (!box) return;
    box.classList.remove('hidden');
    $('res-title').textContent = win ? '星图守住了' : '核心破了';
    $('res-sub').textContent = win ? '「三波都过去了。谢谢你，一个魂。」' : '「灯……灭了。下次先把供给接稳。」';
    $('res-title').className = win ? 'res-win' : 'res-lose';

    var starEl = $('res-stars');
    starEl.innerHTML = '';
    for (var i = 0; i < 3; i++) {
      var s = document.createElement('i');
      s.textContent = '★';
      s.className = i < starsN ? 'on' : 'off';
      starEl.appendChild(s);
    }

    var rows = [
      ['得分', fmt(G.score) + (isNew ? '  ● 新纪录' : '')],
      ['坚持波次', (G.wave || 0) + ' / ' + C.maxWaves],
      ['核心剩余', fmt(G.coreHp) + ' / ' + G.coreHpMax],
      ['点亮节点', G.litTotal + ' 次'],
      ['最长链路', G.bestChain + ' 跳'],
      ['击杀机群', G.kills + ' 只'],
      ['遗物', G.relics.length ? G.relics.map(function (k) { return D.RELICS[k].name; }).join(' · ') : '—']
    ];
    var host = $('res-stats');
    host.innerHTML = '';
    rows.forEach(function (r) {
      var d = document.createElement('div');
      d.className = 'res-row';
      d.innerHTML = '<span>' + r[0] + '</span><b>' + r[1] + '</b>';
      host.appendChild(d);
    });
  }

  function renderRelics() {
    var host = $('relic-list');
    if (!host) return;
    host.innerHTML = '';
    var seen = {};
    for (var i = 0; i < G.relics.length; i++) {
      var key = G.relics[i];
      if (seen[key]) { seen[key]++; continue; }
      seen[key] = 1;
    }
    var keys = Object.keys(seen);
    if (!keys.length) {
      host.innerHTML = '<span class="relic-empty">还没捡到遗物</span>';
      return;
    }
    keys.forEach(function (k) {
      var r = D.RELICS[k];
      var el = document.createElement('span');
      el.className = 'relic-chip';
      el.style.setProperty('--rc', r.color);
      el.title = r.desc;
      el.innerHTML = r.name + (seen[k] > 1 ? '<i>×' + seen[k] + '</i>' : '');
      host.appendChild(el);
    });
  }

  /* 顶部提示：卡关时给一句「下一步」 */
  function updateSpawnHint() {
    var el = $('hud-hint');
    if (!el) return;
    var hint = '';
    if (G.state !== 'playing') { setText('hud-hint', ''); return; }
    if (G.seedNode < 0 && G.litTotal === 0) hint = '点亮一个节点当火种';
    else if (G.powered) {
      var hasFuel = false, hasTurret = false;
      for (var i = 0; i < G.nodes.length; i++) {
        var n = G.nodes[i];
        if (n.on && n.powered && n.type === 'fuel') hasFuel = true;
        if (n.on && n.powered && n.type === 'turret') hasTurret = true;
      }
      if (!hasFuel) hint = '还没接生产器 → 燃料会断';
      else if (!hasTurret) hint = '还没有火力在开火';
    }
    setText('hud-hint', hint);
  }

  /* ================= 输入 ================= */
  function nodeAt(x, y) {
    var best = -1, bd = 1e9;
    for (var i = 0; i < G.nodes.length; i++) {
      var n = G.nodes[i];
      var d = dist(x, y, n.x, n.y);
      if (d <= C.nodeR + 12 && d < bd) { bd = d; best = i; }
    }
    return best;
  }

  function onPointerMove(ev) {
    if (!canvas) return;
    var p = canvasPos(ev);
    G.hoverPos = p;
    G.hoverNode = G.state === 'playing' ? nodeAt(p.x, p.y) : -1;
  }

  function onPointerDown(ev) {
    Sfx.init(); Sfx.resume();
    if (!canvas) return;
    if (G.state !== 'playing') return;
    var p = canvasPos(ev);
    var idx = nodeAt(p.x, p.y);
    if (idx >= 0) { lightNode(idx); return; }
    // 点空白处：显示该处最近的可连节点提示
  }

  function onKey(ev) {
    var k = ev.key.toLowerCase();
    if (k === 'p' || ev.key === 'Escape') {
      if (G.state === 'playing') pauseGame();
      else if (G.state === 'paused') resumeGame();
      else if (G.state === 'result') { /* 保持 */ }
      return;
    }
    if (k === 'm') {
      var muted = Sfx.toggle();
      var btn = $('btn-mute');
      if (btn) btn.textContent = muted ? '音效：关 (M)' : '音效：开 (M)';
      return;
    }
    if (k === 'r' && (G.state === 'playing' || G.state === 'paused')) {
      if (confirm('重开本局？')) restartRun();
    }
  }

  /* ================= 场景切换 ================= */
  function pauseGame() {
    if (G.state !== 'playing') return;
    G.state = 'paused';
    showOverlay('ov-pause');
    updateHud(true);
  }
  function resumeGame() {
    if (G.state !== 'paused') return;
    G.state = 'playing';
    $('ov-pause').classList.add('hidden');
    updateHud(true);
  }
  function toMenu() {
    G.state = 'menu';
    var ids = ['ov-pause', 'ov-result', 'ov-help'];
    for (var i = 0; i < ids.length; i++) $(ids[i]).classList.add('hidden');
    showOverlay('ov-menu');
    document.body.classList.remove('playing');
    buildMenuStars();
    updateHud(true);
  }

  var currentConstel = 'bella', currentSeed = 0;

  function startFromMenu(key) {
    currentConstel = key;
    restartRun();
  }

  function restartRun() {
    newRun(currentConstel, currentSeed);
  }

  /* 菜单：抽一个星图种子，三张卡共用 */
  function buildMenuStars() {
    currentSeed = Math.floor(Math.random() * 899999) + 100000;
    G.t = G.t || 0;
  }

  function buildMenuCards() {
    var host = $('constel-grid');
    if (!host) return;
    host.innerHTML = '';
    D.CONSTELLATIONS.forEach(function (cs) {
      var el = document.createElement('button');
      el.className = 'constel-card';
      el.style.setProperty('--cc', cs.color);
      el.innerHTML =
        '<div class="cc-name">' + cs.name + '</div>' +
        '<div class="cc-owner">' + cs.owner + '</div>' +
        '<p class="cc-desc">' + cs.desc + '</p>' +
        '<p class="cc-hint">' + cs.hint + '</p>' +
        '<div class="cc-play">用这张星图开局 ▶</div>';
      el.addEventListener('click', function () {
        Sfx.init(); Sfx.resume();
        startFromMenu(cs.key);
      });
      host.appendChild(el);
    });
  }

  /* ================= 启动 ================= */
  function bindUi() {
    canvas = $('game');
    ctx = canvas.getContext('2d');
    resizeCanvas();

    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('orientationchange', function () { setTimeout(resizeCanvas, 120); });
    document.addEventListener('pointerdown', function () { Sfx.init(); Sfx.resume(); }, { passive: true });

    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerleave', function () { G.hoverNode = -1; });
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    document.addEventListener('keydown', onKey);

    var btn = $('btn-pause');
    if (btn) btn.addEventListener('click', function () {
      if (G.state === 'playing') pauseGame();
      else if (G.state === 'paused') resumeGame();
    });
    var btnRun = $('btn-run');
    if (btnRun) btnRun.addEventListener('click', function () {
      if (G.state === 'playing') pauseGame();
      else if (G.state === 'paused') resumeGame();
      else if (G.state === 'result') toMenu();
    });
    var btnMute = $('btn-mute');
    if (btnMute) btnMute.addEventListener('click', function () {
      var muted = Sfx.toggle();
      btnMute.textContent = muted ? '音效：关 (M)' : '音效：开 (M)';
    });
    var btnRestart = $('btn-resume-restart');
    if (btnRestart) btnRestart.addEventListener('click', function () {
      if (confirm('重开本局？')) restartRun();
    });
    var btnMenu = $('btn-resume-menu');
    if (btnMenu) btnMenu.addEventListener('click', toMenu);
    var btnAgain = $('btn-again');
    if (btnAgain) btnAgain.addEventListener('click', function () { restartRun(); });
    var btnToMenu = $('btn-to-menu');
    if (btnToMenu) btnToMenu.addEventListener('click', toMenu);
    var btnHelp = $('btn-help');
    if (btnHelp) btnHelp.addEventListener('click', function () {
      showOverlay('ov-help');
    });
    var btnHelpBack = $('btn-help-back');
    if (btnHelpBack) btnHelpBack.addEventListener('click', function () {
      $('ov-help').classList.add('hidden');
    });
    var ovHelp = $('ov-help');
    if (ovHelp) ovHelp.addEventListener('click', function (e) {
      if (e.target === ovHelp) ovHelp.classList.add('hidden');
    });

    buildMenuCards();
    buildMenuStars();
    showOverlay('ov-menu');
    updateHud(true);

    var best = loadBest();
    var bestEl = $('menu-best');
    if (bestEl) bestEl.textContent = best.score ? ('最高分 ' + best.score + ' · 最多 ' + (best.stars || 0) + ' 星') : '还没有纪录';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { bindUi(); requestAnimationFrame(loop); });
  } else {
    bindUi();
    requestAnimationFrame(loop);
  }

  /* 暴露给控制台调试（不影响游戏） */
  window.__XINGHUO__ = {
    G: G,
    canLight: canLight,
    costsOf: costsOf,
    newRun: newRun,
    lightNode: lightNode,
    tick: tickEconomy,
    finish: finishRun,
    refresh: refreshSupply
  };
})();