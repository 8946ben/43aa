/**
 * 主循环：物理世界装配、碰撞结算、胜负判定、关卡装载。
 */
(function () {
  'use strict';

  const { Engine, Composite, Events, Bodies, Body, Vector } = Matter;

  const W = 1280;
  const H = 720;
  const GROUND_Y = 660;
  const STEP = 1000 / 60;

  /* ---------------- 引擎 ---------------- */

  const engine = Engine.create();
  engine.gravity.y = 1;
  engine.positionIterations = 8;
  engine.velocityIterations = 6;

  const gravityScale = engine.gravity.scale != null ? engine.gravity.scale : 0.001;
  // 与 Matter 内部积分一致的重力增量：a = g.y * g.scale * dt^2
  const gStep = engine.gravity.y * gravityScale * STEP * STEP;

  /* ---------------- 游戏状态 ---------------- */

  const game = {
    W: W,
    H: H,
    GROUND_Y: GROUND_Y,
    gStep: gStep,
    sling: { x: 200, y: 470 },
    pull: { x: 0, y: 0 },
    cfg: {
      maxStretch: 110,      // 皮筋最大拉伸像素
      power: 0.16,          // 拉伸量 -> 初速度 的换算系数
      dmgMinSpeed: 4,       // 低于这个相对速度不产生伤害
      dmgPerSpeed: 7.5,     // 每单位速度造成的伤害
      settleSpeed: 0.9,     // 视为"停稳"的速度阈值
      settleFrames: 26,
      maxFlightMs: 6500,
      nextDelayMs: 650
    },
    levelIndex: 0,
    state: 'aiming',        // aiming | flying | settling | over
    result: null,           // win | lose
    score: 0,
    birdsTotal: 0,          // 本关总弹数，用于计算出场角色轮换
    birdsLeft: 0,
    bird: null,
    hammer: null,           // 贝拉技能投出的锤子（同时只存在一把）
    previewBird: null,
    pigs: [],
    blocks: [],
    clones: [],             // 嘉然一分为三分出的分身（不影响回合数）
    trajectory: [],
    timers: { launchedAt: 0, stillFrames: 0, settleAt: 0 }
  };

  /* ---------------- 画布 ---------------- */

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /* ---------------- 静态地形 ---------------- */

  function buildStatics() {
    const ground = Bodies.rectangle(W / 2, GROUND_Y + 200, W * 4, 400, { isStatic: true });
    const leftWall = Bodies.rectangle(-60, 0, 120, 4000, { isStatic: true });
    Composite.add(engine.world, [ground, leftWall]);
  }

  /* ---------------- 碰撞伤害 ---------------- */

  Events.on(engine, 'collisionStart', function (evt) {
    for (let i = 0; i < evt.pairs.length; i++) {
      const a = evt.pairs[i].bodyA;
      const b = evt.pairs[i].bodyB;
      if (a.isStatic && b.isStatic) continue;

      // 投掷锤：碰到任何东西（不拆投掷者自己的台）立刻引爆
      if (a.gameType === 'hammer' && b !== game.bird) explodeHammer(a);
      if (b.gameType === 'hammer' && a !== game.bird) explodeHammer(b);

      const rel = Vector.magnitude(Vector.sub(a.velocity, b.velocity));
      if (rel < game.cfg.dmgMinSpeed) continue;

      const dmg = (rel - game.cfg.dmgMinSpeed) * game.cfg.dmgPerSpeed;
      if (!a.isStatic) Entities.damage(a, dmg);
      if (!b.isStatic) Entities.damage(b, dmg);
    }
  });

  /* ---------------- 技能：贝拉的爆裂锤 ---------------- */

  /**
   * 锤子的爆炸结算：范围内按距离衰减掉血，并给一圈冲击波。
   * 小鸟没有血量（damage 内部忽略），只吃冲击波。
   */
  function explodeHammer(hammer) {
    if (hammer.dead) return;
    hammer.dead = true;

    const R = 110;
    const bodies = Composite.allBodies(engine.world);
    for (let i = 0; i < bodies.length; i++) {
      const body = bodies[i];
      if (body.isStatic || body === hammer) continue;

      const d = Vector.magnitude(Vector.sub(body.position, hammer.position));
      if (d > R) continue;

      Entities.damage(body, (1 - d / R) * 46);
      if (body.gameType === 'bird') continue;

      const k = (1 - d / R) * 5;
      const dir = d > 0.01
        ? { x: (body.position.x - hammer.position.x) / d, y: (body.position.y - hammer.position.y) / d }
        : { x: 0, y: -1 };
      Body.setVelocity(body, { x: body.velocity.x + dir.x * k, y: body.velocity.y + dir.y * k });
    }
  }

  /* ---------------- 碾压伤害 ---------------- */

  /**
   * 冲量伤害只能反映"撞击瞬间的速度"，但被结构压住的猪速度接近 0，
   * 永远打不死。这里补一条持续判定：只要有一只明显更重的刚体压在猪上方，
   * 就按质量比持续掉血。这是愤怒的小鸟里"塌方压死猪"的核心手感。
   */
  function applyCrush() {
    const pairs = engine.pairs.list;
    for (let i = 0; i < pairs.length; i++) {
      const pair = pairs[i];
      if (!pair.isActive) continue;

      const a = pair.bodyA;
      const b = pair.bodyB;
      let pig = null;
      let other = null;
      if (a.gameType === 'pig') { pig = a; other = b; }
      else if (b.gameType === 'pig') { pig = b; other = a; }
      if (!pig || pig.dead) continue;
      if (other.isStatic || other.gameType === 'bird') continue;
      // 压在上方的才算
      if (other.position.y >= pig.position.y) continue;

      const ratio = other.mass / pig.mass;
      if (ratio < 3.5) continue;

      Entities.damage(pig, ratio * 0.5);
    }
  }

  /* ---------------- 实体回收 ---------------- */

  function sweepDead() {
    let changed = false;

    for (let i = game.pigs.length - 1; i >= 0; i--) {
      const p = game.pigs[i];
      if (!p.dead) continue;
      Composite.remove(engine.world, p);
      game.pigs.splice(i, 1);
      game.score += 5000;
      changed = true;
    }

    for (let i = game.blocks.length - 1; i >= 0; i--) {
      const b = game.blocks[i];
      if (!b.dead) continue;
      Composite.remove(engine.world, b);
      game.blocks.splice(i, 1);
      game.score += 500;
      changed = true;
    }

    if (changed) syncHud();
  }

  function decayFlashes() {
    for (let i = 0; i < game.blocks.length; i++) Entities.decayFlash(game.blocks[i], 0.07);
    for (let i = 0; i < game.pigs.length; i++) Entities.decayFlash(game.pigs[i], 0.07);
    for (let i = 0; i < game.clones.length; i++) Entities.decayFlash(game.clones[i], 0.07);
    if (game.bird) Entities.decayFlash(game.bird, 0.07);
  }

  /** 锤子的回收：爆掉或飞出边界就从世界里移除 */
  function updateHammer() {
    const hammer = game.hammer;
    if (!hammer) return;
    if (hammer.dead || isOutOfPlay(hammer)) {
      Composite.remove(engine.world, hammer);
      game.hammer = null;
    }
  }

  /** 分身回收：飞出边界即移除（回合推进时也会统一清场） */
  function updateClones() {
    for (let i = game.clones.length - 1; i >= 0; i--) {
      const c = game.clones[i];
      if (c.dead || isOutOfPlay(c)) {
        Composite.remove(engine.world, c);
        game.clones.splice(i, 1);
      }
    }
  }

  function removeClones() {
    for (let i = 0; i < game.clones.length; i++) {
      Composite.remove(engine.world, game.clones[i]);
    }
    game.clones = [];
  }

  /* ---------------- 回合推进 ---------------- */

  function isOutOfPlay(body) {
    const p = body.position;
    return p.x < -160 || p.x > W + 200 || p.y > H + 400;
  }

  function tickSettle(now) {
    if (game.state === 'settling') {
      if (now >= game.timers.settleAt) nextBird();
      return;
    }
    if (game.state !== 'flying') return;

    const b = game.bird;
    const alive = b && !isOutOfPlay(b);
    const speed = b ? Vector.magnitude(b.velocity) : 0;
    const timeout = now - game.timers.launchedAt > game.cfg.maxFlightMs;

    if (!alive || timeout || speed < game.cfg.settleSpeed) {
      game.timers.stillFrames++;
    } else {
      game.timers.stillFrames = 0;
    }

    if (!alive || timeout || game.timers.stillFrames >= game.cfg.settleFrames) {
      game.state = 'settling';
      game.timers.settleAt = now + game.cfg.nextDelayMs;
    }
  }

  function removeBird() {
    if (game.bird) {
      Composite.remove(engine.world, game.bird);
      game.bird = null;
    }
  }

  function nextBird() {
    if (game.state === 'over') return;
    removeBird();
    removeClones();

    if (game.pigs.length === 0) { finish('win'); return; }
    if (game.birdsLeft <= 0) { finish('lose'); return; }
    loadBird();
  }

  function loadBird() {
    // previewBird 描述瞄准时"皮兜里的角色"画在哪，不进物理世界；
    // skin 决定这次出场的是贝拉/嘉然/乃琳中的哪一位
    game.previewBird = { x: game.sling.x, y: game.sling.y, skin: currentSkin() };
    game.pull = { x: 0, y: 0 };
    game.trajectory = [];
    game.state = 'aiming';
    canvas.style.cursor = 'crosshair';
    syncHud();
  }

  // 出场顺序：按已消耗的弹数轮换 贝拉 -> 嘉然 -> 乃琳 -> 贝拉 ...
  function currentSkin() {
    const skins = Entities.BIRD_SKINS;
    return skins[(game.birdsTotal - game.birdsLeft) % skins.length];
  }

  function launch(velocity) {
    if (game.state !== 'aiming' || !game.previewBird) return;

    const p = game.previewBird;
    const body = Entities.createBird(p.x, p.y, p.skin);
    Body.setVelocity(body, velocity);
    Body.setAngularVelocity(body, 0.14);
    Composite.add(engine.world, body);

    game.bird = body;
    game.previewBird = null;
    game.trajectory = [];
    game.pull = { x: 0, y: 0 };
    game.birdsLeft--;

    game.state = 'flying';
    game.timers.launchedAt = performance.now();
    game.timers.stillFrames = 0;
    syncHud();
  }

  /* ---------------- 技能：点按触发 ---------------- */

  /**
   * 贝拉=投掷爆裂锤：掷出锤子砸谁谁炸，本体向上弹开；
   * 嘉然=一分为三横向散开扫射，乃琳=飞矛直线加速。
   * 每次发射只能用一次（skillUsed）。
   */
  function tryUseSkill() {
    const b = game.bird;
    if (game.state !== 'flying' || !b || b.dead || b.skillUsed) return;
    const skill = Entities.BIRD_SKILL[b.skin];
    if (!skill) return;
    b.skillUsed = true;

    if (skill === 'spear') {
      // 飞矛：锁定当前方向，速度直接拉满；取消旋转保持杆式直线弹道
      const v = b.velocity;
      const sp = Math.hypot(v.x, v.y);
      const dir = sp >= 0.5 ? { x: v.x / sp, y: v.y / sp } : { x: 1, y: -0.08 };
      Body.setVelocity(b, { x: dir.x * 30, y: dir.y * 30 });
      Body.setAngularVelocity(b, 0);
      Body.setAngle(b, Math.atan2(dir.y, dir.x));
    } else if (skill === 'split') {
      // 一分为三：沿飞行方向 ±30° 各分出一只同速分身，横向散开扫射
      const v = b.velocity;
      const sp = Math.hypot(v.x, v.y);
      const ang = sp >= 0.5 ? Math.atan2(v.y, v.x) : 0;
      for (let i = -1; i <= 1; i += 2) {
        const a = ang + i * (Math.PI / 6);
        const clone = Entities.createBird(b.position.x, b.position.y, b.skin);
        Body.setVelocity(clone, { x: Math.cos(a) * sp, y: Math.sin(a) * sp });
        Body.setAngularVelocity(clone, 0.1);
        Composite.add(engine.world, clone);
        game.clones.push(clone);
      }
    } else if (skill === 'hammer') {
      const v = b.velocity;
      const hammer = Entities.createHammer(b.position.x, b.position.y + 32);
      Composite.add(engine.world, hammer);
      Body.setVelocity(hammer, { x: v.x * 0.4, y: Math.max(v.y, 0) + 7 });
      Body.setVelocity(b, { x: v.x * 0.55, y: -7.5 });
      game.hammer = hammer;
    }
  }

  function finish(kind) {
    if (game.state === 'over') return;
    game.state = 'over';
    game.result = kind;
    game.previewBird = null;
    if (kind === 'win') game.score += game.birdsLeft * 10000;
    syncHud();
    showBanner(kind);
  }

  function checkOutcome() {
    if (game.state === 'over') return;
    if (game.pigs.length === 0) finish('win');
  }

  /* ---------------- UI ---------------- */

  const elLevel = document.getElementById('hud-level');
  const elBirds = document.getElementById('hud-birds');
  const elPigs = document.getElementById('hud-pigs');
  const elScore = document.getElementById('hud-score');
  const elBanner = document.getElementById('banner');
  const elNext = document.getElementById('btn-next');
  const elRetry = document.getElementById('btn-retry');
  const elMenu = document.getElementById('menu');
  const elMenuHome = document.getElementById('menu-home');
  const elMenuGallery = document.getElementById('menu-gallery');
  const elBannerTitle = elBanner.querySelector('.banner-title');
  const elBannerSub = elBanner.querySelector('.banner-sub');

  function syncHud() {
    elLevel.textContent = game.levelIndex >= 0
      ? (game.levelIndex + 1) + '/' + LEVELS.length
      : '自定义';
    elBirds.textContent = String(game.birdsLeft);
    elPigs.textContent = String(game.pigs.length);
    elScore.textContent = String(game.score);
  }

  function showBanner(kind) {
    elBanner.dataset.kind = kind;
    elBannerTitle.textContent = kind === 'win' ? '过关！' : '挑战失败';
    elBannerSub.textContent = kind === 'win'
      ? '剩余队员 ' + game.birdsLeft + ' 位　最终得分 ' + game.score
      : '还剩 ' + game.pigs.length + ' 只牛没被消灭';
    elNext.textContent = game.levelIndex < LEVELS.length - 1 ? '下一关' : '再玩一遍';
    elNext.classList.toggle('show', kind === 'win');
    elRetry.classList.toggle('show', kind === 'lose');
    elBanner.classList.add('show');
    canvas.style.cursor = 'default';
  }

  function hideBanner() {
    elBanner.classList.remove('show');
    elNext.classList.remove('show');
    elRetry.classList.remove('show');
  }

  /* ---------------- 主菜单 / 图鉴 ---------------- */

  function showMenu() {
    hideBanner();
    elMenuHome.hidden = false;
    elMenuGallery.hidden = true;
    elMenu.classList.add('show');
    canvas.style.cursor = 'default';
  }

  function hideMenu() {
    elMenu.classList.remove('show');
  }

  /** 图鉴头像：在小画布上复用游戏内的角色绘制 */
  function drawPortrait(id, render) {
    const cv = document.getElementById(id);
    const c = cv.getContext('2d');
    c.clearRect(0, 0, cv.width, cv.height);
    c.save();
    c.translate(cv.width / 2, cv.height / 2 + 3);
    render(c);
    c.restore();
  }

  /** 图鉴头像：先矢量绘制占位，贴图加载完成后重绘为素材图 */
  function drawGalleryPortraits() {
    drawPortrait('portrait-bella', function (c) { c.scale(1.6, 1.6); Render.drawBird(c, 0, 'bella'); });
    drawPortrait('portrait-jiaran', function (c) { c.scale(1.6, 1.6); Render.drawBird(c, 0, 'jiaran'); });
    drawPortrait('portrait-nailin', function (c) { c.scale(1.6, 1.6); Render.drawBird(c, 0, 'nailin'); });
    drawPortrait('portrait-niuniu', function (c) {
      c.scale(1.9, 1.9);
      Render.drawPig(c, {
        position: { x: 0, y: 0 }, angle: 0,
        hp: Entities.PIG.hp, maxHp: Entities.PIG.hp, hitFlash: 0
      });
    });
  }

  function buildMenu() {
    // 选关按钮：由 LEVELS 生成，标题 + 关卡名
    const elLevels = document.getElementById('menu-levels');
    LEVELS.forEach(function (lv, i) {
      const b = document.createElement('button');
      b.className = 'lv-btn';
      b.innerHTML = '<b>关' + (i + 1) + '</b><span>' + lv.name + '</span>';
      b.addEventListener('click', function () { hideMenu(); startLevel(i); });
      elLevels.appendChild(b);
    });

    drawGalleryPortraits();
    Render.ready(drawGalleryPortraits);

    document.getElementById('btn-start').addEventListener('click', function () {
      hideMenu();
      startLevel(0);
    });
    document.getElementById('btn-gallery').addEventListener('click', function () {
      elMenuHome.hidden = true;
      elMenuGallery.hidden = false;
    });
    document.getElementById('btn-gallery-back').addEventListener('click', function () {
      elMenuGallery.hidden = true;
      elMenuHome.hidden = false;
    });
    document.getElementById('btn-menu').addEventListener('click', showMenu);
  }

  /* ---------------- 关卡编辑器 ---------------- */

  const EDITOR_KEY = 'rushlj.editorLevel.v1';
  const ED_TOOLS = {
    'pig':        null,
    'wood-col':   { w: 26,  h: 110, material: 'wood'  },
    'wood-beam':  { w: 160, h: 26,  material: 'wood'  },
    'stone-col':  { w: 26,  h: 110, material: 'stone' },
    'stone-beam': { w: 160, h: 26,  material: 'stone' }
  };
  const ED_MAX_BLOCKS = 60;
  const ED_MAX_PIGS = 12;

  const editor = {
    active: false,
    tool: 'pig',
    birds: 4,
    blocks: [],   // {x,y,w,h,material} 已吸附网格的逻辑坐标
    pigs: [],     // {x,y}
    cursor: null, // 悬停预览位置
    dragging: false,
    lastCell: ''
  };

  const elEditor = document.getElementById('editor');
  const elEdToast = document.getElementById('ed-toast');
  let edToastTimer = 0;

  function edToast(msg) {
    elEdToast.textContent = msg;
    elEdToast.classList.add('show');
    clearTimeout(edToastTimer);
    edToastTimer = setTimeout(function () { elEdToast.classList.remove('show'); }, 1600);
  }

  function canvasPos(evt) {
    const r = canvas.getBoundingClientRect();
    return { x: (evt.clientX - r.left) * W / r.width, y: (evt.clientY - r.top) * H / r.height };
  }

  /** 吸附 10px 网格并夹进画布：物件底边不没入地面 */
  function edSnap(p) {
    const t = ED_TOOLS[editor.tool];
    let x = Math.round(p.x / 10) * 10;
    let y = Math.round(p.y / 10) * 10;
    if (t) {
      x = Math.min(Math.max(x, t.w / 2), W - t.w / 2);
      y = Math.min(Math.max(y, t.h / 2), GROUND_Y - t.h / 2);
    } else {
      x = Math.min(Math.max(x, 24), W - 24);
      y = Math.min(Math.max(y, 24), GROUND_Y - 18);
    }
    return { x: x, y: y };
  }

  function edApply(p) {
    const s = edSnap(p);
    if (editor.tool === 'erase') { edErase(s); return; }
    const cell = s.x + ',' + s.y;
    if (cell === editor.lastCell) return; // 拖拽连刷去重
    editor.lastCell = cell;
    if (editor.tool === 'pig') {
      if (editor.pigs.length >= ED_MAX_PIGS) { edToast('牛牛最多 ' + ED_MAX_PIGS + ' 只'); return; }
      editor.pigs.push({ x: s.x, y: s.y });
    } else {
      if (editor.blocks.length >= ED_MAX_BLOCKS) { edToast('方块最多 ' + ED_MAX_BLOCKS + ' 块'); return; }
      const t = ED_TOOLS[editor.tool];
      editor.blocks.push({ x: s.x, y: s.y, w: t.w, h: t.h, material: t.material });
    }
    edStats();
  }

  function edErase(p) {
    for (let i = editor.pigs.length - 1; i >= 0; i--) {
      const q = editor.pigs[i];
      if (Math.abs(q.x - p.x) <= 18 && Math.abs(q.y - p.y) <= 18) {
        editor.pigs.splice(i, 1);
        edStats();
        return;
      }
    }
    for (let i = editor.blocks.length - 1; i >= 0; i--) {
      const b = editor.blocks[i];
      if (Math.abs(b.x - p.x) <= b.w / 2 && Math.abs(b.y - p.y) <= b.h / 2) {
        editor.blocks.splice(i, 1);
        edStats();
        return;
      }
    }
  }

  /** 编辑器场景：拼一个假 game 对象直接复用 Render.draw 的全部绘制能力 */
  function editorScene() {
    const blocks = [];
    for (let i = 0; i < editor.blocks.length; i++) {
      const b = editor.blocks[i];
      blocks.push({ position: { x: b.x, y: b.y }, angle: 0, w: b.w, h: b.h, material: b.material, hitFlash: 0 });
    }
    const pigs = [];
    for (let i = 0; i < editor.pigs.length; i++) {
      const q = editor.pigs[i];
      pigs.push({
        position: { x: q.x, y: q.y }, angle: 0,
        hp: Entities.PIG.hp, maxHp: Entities.PIG.hp, hitFlash: 0
      });
    }
    return {
      W: W, H: H, GROUND_Y: GROUND_Y,
      sling: { x: 200, y: 470 },
      state: 'edit', pull: { x: 0, y: 0 }, trajectory: [],
      previewBird: null, bird: null, clones: [], hammer: null,
      blocks: blocks, pigs: pigs
    };
  }

  /** 编辑器叠层：淡网格点 + 当前工具的放置预览 */
  function drawEditorOverlay(ctx) {
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    for (let gx = 40; gx < W; gx += 40) {
      for (let gy = 40; gy < GROUND_Y; gy += 40) {
        ctx.fillRect(gx - 1, gy - 1, 2, 2);
      }
    }
    const c = editor.cursor;
    if (c) {
      if (editor.tool === 'erase') {
        ctx.strokeStyle = 'rgba(255,120,104,0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(c.x - 10, c.y - 10); ctx.lineTo(c.x + 10, c.y + 10);
        ctx.moveTo(c.x + 10, c.y - 10); ctx.lineTo(c.x - 10, c.y + 10);
        ctx.stroke();
      } else if (editor.tool === 'pig') {
        ctx.fillStyle = 'rgba(150,224,122,0.45)';
        ctx.beginPath();
        ctx.arc(c.x, c.y, 18, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const t = ED_TOOLS[editor.tool];
        ctx.fillStyle = t.material === 'stone' ? 'rgba(150,158,170,0.5)' : 'rgba(168,132,108,0.5)';
        ctx.fillRect(c.x - t.w / 2, c.y - t.h / 2, t.w, t.h);
      }
    }
    ctx.restore();
  }

  function edStats() {
    document.getElementById('ed-stats').textContent =
      '方块 ' + editor.blocks.length + '/' + ED_MAX_BLOCKS + ' · 牛 ' + editor.pigs.length + '/' + ED_MAX_PIGS;
  }

  function refreshEditorUi() {
    document.getElementById('ed-birds').textContent = String(editor.birds);
    edStats();
    const btns = document.querySelectorAll('.ed-tool');
    for (let i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('active', btns[i].dataset.tool === editor.tool);
    }
  }

  function edWriteStorage() {
    try {
      localStorage.setItem(EDITOR_KEY, JSON.stringify({
        birds: editor.birds, blocks: editor.blocks, pigs: editor.pigs
      }));
    } catch (e) { /* 隐私模式下写不进就算了 */ }
  }

  function edReadStorage() {
    try {
      const raw = localStorage.getItem(EDITOR_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!data || !Array.isArray(data.blocks) || !Array.isArray(data.pigs)) return false;
      editor.blocks = data.blocks.slice(0, ED_MAX_BLOCKS);
      editor.pigs = data.pigs.slice(0, ED_MAX_PIGS);
      editor.birds = Math.min(9, Math.max(1, data.birds | 0 || 4));
      return true;
    } catch (e) { return false; }
  }

  function edTest() {
    if (!editor.pigs.length) { edToast('至少放一只牛牛再测试'); return; }
    edWriteStorage();
    closeEditor();
    startCustom({
      name: '自定义',
      birds: editor.birds,
      slingshot: { x: 200, y: 470 },
      blocks: editor.blocks,
      pigs: editor.pigs
    });
  }

  function openEditor() {
    editor.active = true;
    game.state = 'edit';
    game.previewBird = null;
    hideMenu();
    hideBanner();
    document.body.classList.add('editing');
    // 第一次打开时静默恢复上次的作品
    if (!elEditor.dataset.restored) {
      elEditor.dataset.restored = '1';
      if (edReadStorage()) edToast('已恢复上次的作品');
    }
    elEditor.hidden = false;
    refreshEditorUi();
  }

  function closeEditor() {
    editor.active = false;
    elEditor.hidden = true;
    document.body.classList.remove('editing');
    editor.cursor = null;
    editor.dragging = false;
  }

  /* ---------------- 关卡装载 ---------------- */

  function startLevel(index) {
    game.levelIndex = index;
    loadLevel(LEVELS[index]);
  }

  /** 编辑器测试玩：levelIndex 置 -1，重开/下一关等入口会走自定义分支 */
  function startCustom(lv) {
    game.customLevel = lv;
    game.levelIndex = -1;
    loadLevel(lv);
  }

  function loadLevel(lv) {
    Composite.clear(engine.world, true);

    game.pigs = [];
    game.blocks = [];
    game.bird = null;
    game.hammer = null;
    game.previewBird = null;
    game.clones = [];
    game.pull = { x: 0, y: 0 };
    game.trajectory = [];
    game.score = 0;
    game.result = null;
    game.birdsTotal = lv.birds;
    game.birdsLeft = lv.birds;
    game.sling.x = lv.slingshot.x;
    game.sling.y = lv.slingshot.y;
    game.state = 'aiming';
    game.timers.stillFrames = 0;

    for (let i = 0; i < lv.blocks.length; i++) {
      const b = Entities.createBlock(lv.blocks[i]);
      game.blocks.push(b);
      Composite.add(engine.world, b);
    }
    for (let i = 0; i < lv.pigs.length; i++) {
      const p = Entities.createPig(lv.pigs[i].x, lv.pigs[i].y);
      game.pigs.push(p);
      Composite.add(engine.world, p);
    }

    hideBanner();
    loadBird();
  }

  /* ---------------- 帧循环 ---------------- */

  function update(now) {
    Engine.update(engine, STEP);
    applyCrush();
    sweepDead();
    updateHammer();
    updateClones();
    decayFlashes();
    checkOutcome();
    tickSettle(now);
  }

  let lastTime = performance.now();
  let accumulator = 0;

  function frame(now) {
    const delta = Math.min(now - lastTime, 100);
    lastTime = now;

    // 编辑器模式：不走物理，只画静态场景 + 叠层
    if (editor.active) {
      Render.draw(ctx, editorScene());
      drawEditorOverlay(ctx);
      requestAnimationFrame(frame);
      return;
    }

    accumulator += delta;

    let guard = 0;
    while (accumulator >= STEP && guard < 5) {
      update(now);
      accumulator -= STEP;
      guard++;
    }
    if (guard >= 5) accumulator = 0;

    Render.draw(ctx, game);
    requestAnimationFrame(frame);
  }

  /** 重开当前关：自定义关（levelIndex=-1）走 startCustom */
  function restartCurrent() {
    if (game.levelIndex >= 0) startLevel(game.levelIndex);
    else startCustom(game.customLevel);
  }

  /* ---------------- 启动 ---------------- */

  function boot() {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    buildStatics();
    // 支持 index.html#3 直达第 3 关（1 起始，越界/非法回第 1 关）；
    // 带 hash 视为深链直接进游戏，否则先停在主菜单（背景已装载第 1 关当风景）
    const hashLv = parseInt(location.hash.slice(1), 10);
    startLevel(hashLv >= 1 ? Math.min(hashLv - 1, LEVELS.length - 1) : 0);
    Slingshot.init(canvas, game, launch);
    // 飞行中点按画布 = 释放当前角色的技能（瞄准时这里的 state 检查会直接忽略）
    canvas.addEventListener('pointerdown', tryUseSkill);
    buildMenu();
    if (!(hashLv >= 1)) showMenu();

    document.getElementById('btn-restart').addEventListener('click', function () {
      restartCurrent();
    });

    document.getElementById('btn-next').addEventListener('click', function () {
      if (game.levelIndex >= 0) startLevel((game.levelIndex + 1) % LEVELS.length);
      else restartCurrent();
    });

    elRetry.addEventListener('click', function () {
      restartCurrent();
    });

    /* ---- 编辑器事件 ---- */

    document.getElementById('btn-editor').addEventListener('click', openEditor);
    document.getElementById('ed-back').addEventListener('click', function () {
      closeEditor();
      startLevel(0);
      showMenu();
    });
    document.getElementById('ed-test').addEventListener('click', edTest);
    document.getElementById('ed-save').addEventListener('click', function () {
      edWriteStorage();
      edToast('已保存到本地');
    });
    document.getElementById('ed-load').addEventListener('click', function () {
      if (edReadStorage()) { refreshEditorUi(); edToast('已读取存档'); }
      else edToast('还没有存档');
    });
    document.getElementById('ed-clear').addEventListener('click', function () {
      editor.blocks = [];
      editor.pigs = [];
      editor.birds = 4;
      refreshEditorUi();
      edToast('已清空');
    });
    document.getElementById('ed-birds-minus').addEventListener('click', function () {
      editor.birds = Math.max(1, editor.birds - 1);
      refreshEditorUi();
    });
    document.getElementById('ed-birds-plus').addEventListener('click', function () {
      editor.birds = Math.min(9, editor.birds + 1);
      refreshEditorUi();
    });
    const edTools = document.querySelectorAll('.ed-tool');
    for (let i = 0; i < edTools.length; i++) {
      edTools[i].addEventListener('click', function () {
        editor.tool = this.dataset.tool;
        refreshEditorUi();
      });
    }

    // 编辑器画布交互：左键放置/拖拽连刷，右键删除
    canvas.addEventListener('pointerdown', function (evt) {
      if (!editor.active) return;
      if (evt.button === 2) { edApply(canvasPos(evt)); return; }
      editor.dragging = true;
      editor.lastCell = '';
      edApply(canvasPos(evt));
    });
    canvas.addEventListener('pointermove', function (evt) {
      if (!editor.active) return;
      editor.cursor = edSnap(canvasPos(evt));
      if (editor.dragging) edApply(editor.cursor);
    });
    window.addEventListener('pointerup', function () { editor.dragging = false; });
    canvas.addEventListener('contextmenu', function (evt) {
      if (editor.active) evt.preventDefault();
    });

    requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();