/**
 * 渲染层：全部走 Canvas 2D 手绘，不依赖 Matter 自带的 Debug 渲染器。
 * 逻辑坐标系固定为 1280 x 720，由 main.js 统一做 DPR 缩放。
 */
const Render = (function () {
  const TAU = Math.PI * 2;

  /* ---------------- 工具 ---------------- */

  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.closePath();
  }

  /* ---------------- 精灵贴图 ---------------- */
  /*
   * 角色外观优先使用 assets/ 下的素材图，矢量手绘只作加载失败时的回退。
   * 加载完成（无论成败）后触发 ready 注册的回调，供图鉴等静态画面重绘。
   */

  const SPRITE_SRC = {
    bella: 'assets/bella.png',
    jiaran: 'assets/jiaran.png',
    nailin: 'assets/nailin.png',
    niuniu: 'assets/niuniu.png'
  };
  // 贴图在游戏逻辑坐标里的显示直径（按素材 max(w,h) 归一化）
  const SPRITE_D = { bella: 52, jiaran: 52, nailin: 52, niuniu: 44 };

  const sprites = {};
  const flashTints = {}; // hitFlash 白染离屏缓存
  let readyCbs = [];
  let readySettled = 0;
  let readyFired = false;

  function onSpriteSettled() {
    readySettled++;
    if (readyFired || readySettled < Object.keys(SPRITE_SRC).length) return;
    readyFired = true;
    for (let i = 0; i < readyCbs.length; i++) readyCbs[i]();
    readyCbs = [];
  }

  Object.keys(SPRITE_SRC).forEach(function (key) {
    const img = new Image();
    img.onload = onSpriteSettled;
    img.onerror = onSpriteSettled;
    img.src = SPRITE_SRC[key];
    sprites[key] = img;
  });

  function spriteReady(key) {
    const img = sprites[key];
    return !!(img && img.complete && img.naturalWidth > 0);
  }

  /** 白染版贴图：hitFlash 时叠加，按素材尺寸生成一次并缓存 */
  function tintWhite(key) {
    if (flashTints[key]) return flashTints[key];
    if (!spriteReady(key)) return null;
    const img = sprites[key];
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const c2 = c.getContext('2d');
    c2.drawImage(img, 0, 0);
    c2.globalCompositeOperation = 'source-atop';
    c2.fillStyle = '#FFFFFF';
    c2.fillRect(0, 0, c.width, c.height);
    flashTints[key] = c;
    return c;
  }

  /**
   * 以当前原点为中心画贴图，随调用方的 translate/rotate 摆放。
   * flash ∈ [0,1] 时叠一层白染；未加载完成返回 false，调用方回退矢量。
   */
  function drawSpriteCentered(ctx, key, targetD, flash) {
    if (!spriteReady(key)) return false;
    const img = sprites[key];
    const s = targetD / Math.max(img.naturalWidth, img.naturalHeight);
    const w = img.naturalWidth * s;
    const h = img.naturalHeight * s;
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    if (flash > 0) {
      const tint = tintWhite(key);
      if (tint) {
        ctx.globalAlpha = Math.min(1, flash) * 0.65;
        ctx.drawImage(tint, -w / 2, -h / 2, w, h);
        ctx.globalAlpha = 1;
      }
    }
    return true;
  }

  function ready(fn) {
    if (readyFired) { fn(); return; }
    readyCbs.push(fn);
  }

  /* ---------------- 背景 ---------------- */

  function cloud(ctx, x, y, s) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.80)';
    ctx.beginPath();
    ctx.arc(x, y, 28 * s, 0, TAU);
    ctx.arc(x + 32 * s, y - 14 * s, 36 * s, 0, TAU);
    ctx.arc(x + 72 * s, y + 2 * s, 25 * s, 0, TAU);
    ctx.rect(x, y, 72 * s, 24 * s);
    ctx.fill();
  }

  function hills(ctx, baseY, h, freq, phase) {
    ctx.beginPath();
    ctx.moveTo(-60, baseY);
    for (let x = -60; x <= 1340; x += 20) {
      const k = 0.55 + 0.45 * Math.sin((x / 1340) * Math.PI * freq + phase);
      ctx.lineTo(x, baseY - h * k);
    }
    ctx.lineTo(1340, baseY);
    ctx.closePath();
    ctx.fill();
  }

  function drawSky(ctx, game) {
    const sky = ctx.createLinearGradient(0, 0, 0, game.GROUND_Y);
    sky.addColorStop(0, '#4B9FE1');
    sky.addColorStop(0.55, '#8FCBF0');
    sky.addColorStop(1, '#CFE9F8');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, game.W, game.GROUND_Y);

    ctx.fillStyle = 'rgba(255, 246, 205, 0.22)';
    ctx.beginPath(); ctx.arc(1080, 108, 80, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255, 246, 205, 0.92)';
    ctx.beginPath(); ctx.arc(1080, 108, 46, 0, TAU); ctx.fill();

    cloud(ctx, 150, 118, 1.05);
    cloud(ctx, 590, 74, 0.78);
    cloud(ctx, 880, 186, 0.55);

    ctx.fillStyle = '#9ACB94';
    hills(ctx, game.GROUND_Y, 148, 0.9, 1.0);
    ctx.fillStyle = '#83BB7D';
    hills(ctx, game.GROUND_Y, 94, 1.7, 2.4);
  }

  function drawGround(ctx, game) {
    const y = game.GROUND_Y;
    const g = ctx.createLinearGradient(0, y, 0, game.H);
    g.addColorStop(0, '#5FB85A');
    g.addColorStop(0.12, '#4C9C48');
    g.addColorStop(0.12, '#8C6A43');
    g.addColorStop(1, '#5C432A');
    ctx.fillStyle = g;
    ctx.fillRect(0, y, game.W, game.H - y);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.30)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, y + 1.5);
    ctx.lineTo(game.W, y + 1.5);
    ctx.stroke();
  }

  /* ---------------- 弹弓 ---------------- */

  function pouchPos(game) {
    return game.previewBird || null;
  }

  function drawSlingBack(ctx, game) {
    const s = game.sling;
    const gy = game.GROUND_Y;

    ctx.lineCap = 'round';
    ctx.strokeStyle = '#7A5230';
    ctx.lineWidth = 13;
    ctx.beginPath();
    ctx.moveTo(s.x - 6, gy - 68);
    ctx.lineTo(s.x - 20, s.y + 2);
    ctx.stroke();

    const ball = pouchPos(game);
    if (ball) {
      ctx.strokeStyle = '#3A2A22';
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.moveTo(s.x - 20, s.y + 2);
      ctx.lineTo(ball.x, ball.y);
      ctx.stroke();
    }
  }

  function drawSlingFront(ctx, game) {
    const s = game.sling;
    const gy = game.GROUND_Y;

    ctx.lineCap = 'round';
    ctx.strokeStyle = '#8B5E3C';
    ctx.lineWidth = 20;
    ctx.beginPath();
    ctx.moveTo(s.x, gy);
    ctx.lineTo(s.x, gy - 70);
    ctx.stroke();

    ctx.lineWidth = 13;
    ctx.beginPath();
    ctx.moveTo(s.x + 6, gy - 68);
    ctx.lineTo(s.x + 20, s.y + 2);
    ctx.stroke();

    const ball = pouchPos(game);
    ctx.strokeStyle = '#4A362B';
    ctx.lineWidth = 9;
    ctx.beginPath();
    if (ball) {
      ctx.moveTo(s.x + 20, s.y + 2);
      ctx.lineTo(ball.x, ball.y);
    } else {
      ctx.moveTo(s.x + 20, s.y + 2);
      ctx.lineTo(s.x - 20, s.y + 2);
    }
    ctx.stroke();
  }

  /* ---------------- 我方角色（贝拉 / 嘉然 / 乃琳）---------------- */
  /*
   * 物理上都是 Entities.BIRD 的 r=19 圆形刚体（body.skin 区分外观），
   * 这里负责把它们画成三只毛绒团子。视觉半径比碰撞半径大一圈，
   * 绒球略微溢出碰撞圆，显得更软更饱满。
   * 出场顺序：贝拉 -> 嘉然 -> 乃琳（轮换）。
   */

  const BIRD_R = 23;

  const SKIN_STYLE = {
    bella: {
      plush: '#4A4166', plushLite: '#8B87C8', plushDark: '#37304E',
      face: '#F7F0E6', blush: '#F0A8BC',
      outline: 'rgba(55, 48, 78, 0.5)',
      hairShine: '#8B87C8', streak: '#BCC8F0',
      eyeShadow: '#C9A6DC', eyeInk: '#3A3252',
      mouth: '#D85A5A'
    },
    jiaran: {
      plush: '#A8846C', plushLite: '#C9A98D', plushDark: '#8A6850',
      face: '#F8F1E7', blush: '#F2A0A8',
      outline: 'rgba(110, 82, 62, 0.5)',
      hairShine: '#D9BC9E', streak: '#BCD8F0',
      eyeUp: '#5E96D6', eyeLow: '#A8CEF2', eyeInk: '#3A5E8C',
      bow: '#7AA8E8', bowDark: '#4E7EBE',
      mouth: '#D95757', mouthIn: '#B24545'
    },
    nailin: {
      plush: '#E9E2D6', plushLite: '#F8F5EE', plushDark: '#C6BBA8',
      face: '#F8F2E8', blush: '#F0B098',
      outline: 'rgba(150, 138, 118, 0.55)',
      hairShine: '#FFFFFF', streak: '#C8D8EE',
      eye: '#2E6BC8', eyeInk: '#1E4A94',
      mouth: '#B25858'
    }
  };

  /**
   * 沿边缘向外画绒边。
   * 关键是"不规则"：角度要有抖动、长短要有差异，否则等距等长会读成齿轮锯齿。
   */
  function plushFuzz(ctx, radius, color, count, len, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const h1 = ((i * 2654435761) % 997) / 997;
      const h2 = ((i * 40503 + 12345) % 991) / 991;
      const h3 = ((i * 1103515 + 7) % 983) / 983;
      const a = (i / count) * TAU + (h1 - 0.5) * (TAU / count) * 1.7;
      const l = len * (0.25 + h2 * 1.15);
      const r0 = radius - 2.2 + h3 * 1.4;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      ctx.moveTo(ca * r0, sa * r0);
      ctx.lineTo(ca * (r0 + l), sa * (r0 + l));
    }
    ctx.stroke();
  }

  /** 绒球主体：绒边 + 径向渐变做出布偶的饱满体积 */
  function plushBody(ctx, R, st) {
    plushFuzz(ctx, R, st.plush, 72, 1.6, 1.2);
    const g = ctx.createRadialGradient(-R * 0.34, -R * 0.38, R * 0.10, 0, 0, R * 1.10);
    g.addColorStop(0, st.plushLite);
    g.addColorStop(0.58, st.plush);
    g.addColorStop(1, st.plushDark);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, TAU);
    ctx.fill();
  }

  /** 左上来的柔光，压在细节之后、头饰之前 */
  function drawSheen(ctx, R, alpha) {
    const sheen = ctx.createRadialGradient(-R * 0.42, -R * 0.48, 0, -R * 0.42, -R * 0.48, R * 0.72);
    sheen.addColorStop(0, 'rgba(255,255,255,' + (alpha || 0.28) + ')');
    sheen.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheen;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, TAU);
    ctx.fill();
  }

  /** 参考图同款"///"斜线腮红 */
  function blushLines(ctx, x, y, color, R) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = -1; i <= 1; i++) {
      const ox = i * R * 0.15;
      ctx.moveTo(x + ox - R * 0.10, y + R * 0.10);
      ctx.lineTo(x + ox + R * 0.10, y - R * 0.10);
    }
    ctx.stroke();
  }

  function drawBow(ctx, cx, cy, s, rot, color, dark) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-s * 1.15, -s * 0.95, -s * 1.02, -s * 0.06);
    ctx.quadraticCurveTo(-s * 0.88, s * 0.62, 0, 0);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(s * 0.95, -s * 1.02, s * 0.86, -s * 0.02);
    ctx.quadraticCurveTo(s * 0.74, s * 0.66, 0, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.30, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  /** 贝拉头顶的粉水晶蝴蝶结：两瓣晶体 + 深色描边 + 高光棱线 */
  function drawCrystalBow(ctx, cx, cy, s, rot, ink) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    const g = ctx.createLinearGradient(-s, -s, s, s);
    g.addColorStop(0, '#FBF3F7');
    g.addColorStop(1, '#EBB0D0');
    ctx.fillStyle = g;
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-s * 1.05, -s * 0.85, -s * 0.95, -s * 0.05);
    ctx.quadraticCurveTo(-s * 0.85, s * 0.55, 0, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(s * 0.98, -s * 0.92, s * 0.92, -s * 0.04);
    ctx.quadraticCurveTo(s * 0.82, s * 0.58, 0, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(-s * 0.55, -s * 0.42);
    ctx.lineTo(-s * 0.30, -s * 0.08);
    ctx.moveTo(s * 0.42, -s * 0.46);
    ctx.lineTo(s * 0.62, -s * 0.10);
    ctx.stroke();
    ctx.restore();
  }

  /** 乃琳的黑蝴蝶头饰，带一圈白色光环 */
  function drawButterfly(ctx, cx, cy, s, rot) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 1.55, s * 0.95, -0.45, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = '#2A2A34';
    // 上翅一对
    ctx.beginPath();
    ctx.ellipse(-s * 0.45, -s * 0.30, s * 0.62, s * 0.38, -0.65, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(s * 0.42, -s * 0.28, s * 0.55, s * 0.34, 0.6, 0, TAU);
    ctx.fill();
    // 下翅一对（小）
    ctx.beginPath();
    ctx.ellipse(-s * 0.34, s * 0.32, s * 0.40, s * 0.26, 0.5, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(s * 0.34, s * 0.32, s * 0.36, s * 0.24, -0.5, 0, TAU);
    ctx.fill();
    // 身体
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.12, s * 0.42, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  /* ---- 贝拉：深紫团子，波浪刘海 + 左侧大波浪侧发 + 水晶蝴蝶结，温柔垂眼 ---- */

  function drawBella(ctx, angle, st) {
    const R = BIRD_R;
    ctx.save();
    ctx.rotate(angle);

    plushBody(ctx, R, st);

    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, TAU);
    ctx.clip();

    // 脸
    ctx.fillStyle = st.face;
    ctx.beginPath();
    ctx.ellipse(0, -R * 0.04, R * 0.78, R * 0.62, 0, 0, TAU);
    ctx.fill();

    // 刘海：波浪下缘，留在眼睛上方
    ctx.fillStyle = st.plush;
    ctx.beginPath();
    ctx.moveTo(-R, -R);
    ctx.lineTo(R, -R);
    ctx.lineTo(R, -R * 0.18);
    ctx.quadraticCurveTo(R * 0.68, -R * 0.50, R * 0.38, -R * 0.34);
    ctx.quadraticCurveTo(R * 0.14, -R * 0.24, 0, -R * 0.48);
    ctx.quadraticCurveTo(-R * 0.22, -R * 0.72, -R * 0.52, -R * 0.34);
    ctx.quadraticCurveTo(-R * 0.78, -R * 0.12, -R, -R * 0.34);
    ctx.closePath();
    ctx.fill();

    // 左侧大波浪侧发：沿左脸垂下的宽带
    ctx.beginPath();
    ctx.moveTo(-R, -R * 0.60);
    ctx.quadraticCurveTo(-R * 0.52, -R * 0.34, -R * 0.70, R * 0.06);
    ctx.quadraticCurveTo(-R * 0.84, R * 0.40, -R * 0.58, R * 0.72);
    ctx.lineTo(-R, R * 0.66);
    ctx.closePath();
    ctx.fill();

    // 蓝白挑染细发丝
    ctx.strokeStyle = st.streak;
    ctx.lineWidth = 1.1;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.moveTo(R * 0.32, -R * 0.88);
    ctx.quadraticCurveTo(R * 0.60, -R * 0.60, R * 0.64, -R * 0.28);
    ctx.moveTo(-R * 0.34, -R * 0.94);
    ctx.quadraticCurveTo(-R * 0.10, -R * 0.80, R * 0.08, -R * 0.84);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // 温柔垂眼：紫粉眼影 + 深色上眼线（参考图垂眼很醒目，尺寸要给足）
    const eyeY = R * 0.06;
    const eyeX = R * 0.36;
    for (const s of [-1, 1]) {
      ctx.fillStyle = st.eyeShadow;
      ctx.beginPath();
      ctx.ellipse(s * eyeX, eyeY, R * 0.16, R * 0.20, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = st.eyeInk;
      ctx.lineWidth = 1.7;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(s * eyeX, eyeY + R * 0.08, R * 0.155, Math.PI * 1.08, Math.PI * 1.92);
      ctx.stroke();
    }

    blushLines(ctx, -R * 0.52, R * 0.28, st.blush, R);
    blushLines(ctx, R * 0.52, R * 0.28, st.blush, R);

    // 微张的小嘴
    ctx.fillStyle = st.mouth;
    ctx.beginPath();
    ctx.ellipse(0, R * 0.42, R * 0.10, R * 0.085, 0, 0, TAU);
    ctx.fill();

    drawSheen(ctx, R, 0.26);
    ctx.restore(); // 结束裁剪

    // 头顶水晶蝴蝶结（露在球外）
    drawCrystalBow(ctx, R * 0.02, -R * 0.86, R * 0.26, 0.06, st.eyeInk);

    ctx.strokeStyle = st.outline;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, TAU);
    ctx.stroke();

    ctx.restore();
  }

  /* ---- 嘉然：暖棕团子，头顶呆毛 + 双蓝蝴蝶结，蓝色大圆眼 + 开心大笑 ---- */

  function drawJiaran(ctx, angle, st) {
    const R = BIRD_R;
    ctx.save();
    ctx.rotate(angle);

    plushBody(ctx, R, st);

    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, TAU);
    ctx.clip();

    // 大脸（嘉然脸占比最大）
    ctx.fillStyle = st.face;
    ctx.beginPath();
    ctx.ellipse(0, R * 0.06, R * 0.80, R * 0.66, 0, 0, TAU);
    ctx.fill();

    // 斜分刘海：左右两瓣，中缝浅 V，下缘留在眼睛上方
    ctx.fillStyle = st.plush;
    ctx.beginPath();
    ctx.moveTo(-R, -R);
    ctx.lineTo(R, -R);
    ctx.lineTo(R, -R * 0.12);
    ctx.quadraticCurveTo(R * 0.55, -R * 0.46, R * 0.18, -R * 0.22);
    ctx.quadraticCurveTo(R * 0.02, -R * 0.12, -R * 0.10, -R * 0.24);
    ctx.quadraticCurveTo(-R * 0.45, -R * 0.50, -R, -R * 0.18);
    ctx.closePath();
    ctx.fill();

    // 发丝高光
    ctx.strokeStyle = st.hairShine;
    ctx.lineWidth = 1.2;
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.moveTo(-R * 0.62, -R * 0.72);
    ctx.quadraticCurveTo(-R * 0.30, -R * 0.86, -R * 0.04, -R * 0.76);
    ctx.moveTo(R * 0.28, -R * 0.78);
    ctx.quadraticCurveTo(R * 0.52, -R * 0.66, R * 0.62, -R * 0.40);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // 蓝色大圆眼：上深下浅两段 + 眼线 + 高光
    const eyeY = R * 0.10;
    const eyeX = R * 0.38;
    for (const s of [-1, 1]) {
      ctx.fillStyle = st.eyeLow;
      ctx.beginPath();
      ctx.ellipse(s * eyeX, eyeY, R * 0.17, R * 0.22, 0, 0, TAU);
      ctx.fill();
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(s * eyeX, eyeY, R * 0.17, R * 0.22, 0, 0, TAU);
      ctx.clip();
      ctx.fillStyle = st.eyeUp;
      ctx.fillRect(s * eyeX - R * 0.18, eyeY - R * 0.23, R * 0.36, R * 0.23);
      ctx.restore();
      ctx.strokeStyle = st.eyeInk;
      ctx.lineWidth = 1.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(s * eyeX, eyeY + R * 0.05, R * 0.175, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(s * eyeX + s * R * 0.05, eyeY - R * 0.09, R * 0.05, 0, TAU);
      ctx.fill();
    }

    blushLines(ctx, -R * 0.52, R * 0.30, st.blush, R);
    blushLines(ctx, R * 0.52, R * 0.30, st.blush, R);

    // 开心大笑：大红嘴，内里偏深
    ctx.fillStyle = st.mouth;
    ctx.beginPath();
    ctx.ellipse(0, R * 0.42, R * 0.16, R * 0.12, 0, 0, TAU);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, R * 0.42, R * 0.16, R * 0.12, 0, 0, TAU);
    ctx.clip();
    ctx.fillStyle = st.mouthIn;
    ctx.fillRect(-R * 0.17, R * 0.42, R * 0.34, R * 0.13);
    ctx.restore();

    drawSheen(ctx, R, 0.26);
    ctx.restore(); // 结束裁剪

    // 头顶呆毛：卷出球外的一撮
    ctx.strokeStyle = st.plush;
    ctx.lineWidth = R * 0.17;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, -R * 0.88);
    ctx.quadraticCurveTo(-R * 0.14, -R * 1.26, R * 0.18, -R * 1.28);
    ctx.stroke();
    ctx.strokeStyle = st.streak;
    ctx.lineWidth = R * 0.05;
    ctx.beginPath();
    ctx.moveTo(R * 0.02, -R * 0.98);
    ctx.quadraticCurveTo(-R * 0.06, -R * 1.20, R * 0.14, -R * 1.24);
    ctx.stroke();

    // 两侧蓝蝴蝶结（耳位，向外露出球缘才看得见）
    drawBow(ctx, -R * 0.92, R * 0.26, R * 0.24, 0.35, st.bow, st.bowDark);
    drawBow(ctx, R * 0.92, R * 0.26, R * 0.24, -0.35, st.bow, st.bowDark);

    ctx.strokeStyle = st.outline;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, TAU);
    ctx.stroke();

    ctx.restore();
  }

  /* ---- 乃琳：银白团子，三七分斜刘海 + 黑蝴蝶光环头饰，深蓝眼 + 优雅微笑 ---- */

  function drawNailin(ctx, angle, st) {
    const R = BIRD_R;
    ctx.save();
    ctx.rotate(angle);

    plushBody(ctx, R, st);

    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, TAU);
    ctx.clip();

    // 脸（与银白发相近，靠刘海下缘和眼区分）
    ctx.fillStyle = st.face;
    ctx.beginPath();
    ctx.ellipse(0, R * 0.04, R * 0.76, R * 0.62, 0, 0, TAU);
    ctx.fill();

    // 三七分斜刘海：右额大面积露出，左侧压到眉上（对角线感要强）
    ctx.fillStyle = st.plush;
    ctx.beginPath();
    ctx.moveTo(-R, -R);
    ctx.lineTo(R, -R);
    ctx.lineTo(R, -R * 0.42);
    ctx.quadraticCurveTo(R * 0.30, -R * 0.50, -R * 0.10, -R * 0.12);
    ctx.quadraticCurveTo(-R * 0.50, -R * 0.08, -R, -R * 0.40);
    ctx.closePath();
    ctx.fill();

    // 发缝高光 + 彩虹光泽描线
    ctx.strokeStyle = st.hairShine;
    ctx.lineWidth = 1.3;
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.moveTo(-R * 0.30, -R * 0.86);
    ctx.quadraticCurveTo(R * 0.10, -R * 0.94, R * 0.42, -R * 0.70);
    ctx.stroke();
    ctx.strokeStyle = st.streak;
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.moveTo(-R * 0.52, -R * 0.62);
    ctx.quadraticCurveTo(-R * 0.20, -R * 0.72, R * 0.10, -R * 0.56);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // 深蓝眼
    const eyeY = R * 0.10;
    const eyeX = R * 0.38;
    for (const s of [-1, 1]) {
      ctx.fillStyle = st.eye;
      ctx.beginPath();
      ctx.ellipse(s * eyeX, eyeY, R * 0.155, R * 0.20, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = st.eyeInk;
      ctx.lineWidth = 1.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(s * eyeX, eyeY + R * 0.05, R * 0.16, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(s * eyeX + s * R * 0.045, eyeY - R * 0.08, R * 0.045, 0, TAU);
      ctx.fill();
    }

    blushLines(ctx, -R * 0.52, R * 0.30, st.blush, R);
    blushLines(ctx, R * 0.52, R * 0.30, st.blush, R);

    // 优雅微笑：一条上翘的弧线
    ctx.strokeStyle = st.mouth;
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, R * 0.32, R * 0.12, Math.PI * 0.18, Math.PI * 0.82);
    ctx.stroke();

    drawSheen(ctx, R, 0.20);
    ctx.restore(); // 结束裁剪

    // 左上黑蝴蝶 + 白光环（露在球外一点）
    drawButterfly(ctx, -R * 0.50, -R * 0.62, R * 0.22, -0.35);

    ctx.strokeStyle = st.outline;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, TAU);
    ctx.stroke();

    ctx.restore();
  }

  /* ---------------- 角色分发 ---------------- */

  function drawBird(ctx, angle, skin, flash) {
    ctx.save();
    ctx.rotate(angle);
    const drawn = drawSpriteCentered(ctx, skin, SPRITE_D[skin] || 52, flash || 0);
    ctx.restore();
    if (drawn) return;

    // 矢量回退（素材未就绪或加载失败）
    const st = SKIN_STYLE[skin] || SKIN_STYLE.bella;
    if (skin === 'jiaran') drawJiaran(ctx, angle, st);
    else if (skin === 'nailin') drawNailin(ctx, angle, st);
    else drawBella(ctx, angle, st);
  }

  function drawBirdBody(ctx, game) {
    // 嘉然一分为三的分身（先画，主角色压在最上层）
    const clones = game.clones || [];
    for (let i = 0; i < clones.length; i++) {
      const c = clones[i];
      ctx.save();
      ctx.translate(c.position.x, c.position.y);
      drawBird(ctx, c.angle, c.skin, c.hitFlash);
      ctx.restore();
    }

    const b = game.bird;
    if (!b) return;
    ctx.save();
    ctx.translate(b.position.x, b.position.y);
    drawBird(ctx, b.angle, b.skin, b.hitFlash);
    ctx.restore();
  }

  function drawBirdPreview(ctx, game) {
    const p = game.previewBird;
    if (!p) return;
    ctx.save();
    ctx.translate(p.x, p.y);
    // 地上的影子
    ctx.fillStyle = 'rgba(0, 0, 0, 0.14)';
    ctx.beginPath();
    ctx.ellipse(0, game.GROUND_Y - p.y - 2, 15, 5, 0, 0, TAU);
    ctx.fill();
    drawBird(ctx, 0, p.skin);
    ctx.restore();
  }

  /* ---------------- 牛牛（敌方，原猪位）---------------- */

  /** 受伤划痕：贴图与矢量两条绘制路径共用 */
  function pigScratches(ctx, r, p) {
    const dmg = 1 - Math.max(0, p.hp) / p.maxHp;
    if (dmg <= 0.2) return;
    ctx.strokeStyle = 'rgba(45, 22, 12, 0.72)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-r * 0.82, -r * 0.52); ctx.lineTo(-r * 0.42, -r * 0.10);
    ctx.moveTo(r * 0.72, r * 0.46); ctx.lineTo(r * 0.36, r * 0.76);
    ctx.stroke();
  }

  function drawPig(ctx, p) {
    const r = Entities.PIG.radius;
    ctx.save();
    ctx.translate(p.position.x, p.position.y);
    ctx.rotate(p.angle);
    const drawn = drawSpriteCentered(ctx, 'niuniu', SPRITE_D.niuniu, p.hitFlash || 0);
    if (drawn) pigScratches(ctx, r, p);
    ctx.restore();
    if (drawn) return;
    drawPigVector(ctx, p);
  }

  // 矢量回退版（素材未就绪或加载失败时使用）
  function drawPigVector(ctx, p) {
    const r = Entities.PIG.radius;
    ctx.save();
    ctx.translate(p.position.x, p.position.y);
    ctx.rotate(p.angle);

    // 耳朵：两侧横向伸出的白耳
    ctx.fillStyle = '#FDFCFA';
    ctx.strokeStyle = '#B8B0A2';
    ctx.lineWidth = 1.4;
    for (const s of [-1, 1]) {
      ctx.save();
      ctx.translate(s * r * 0.88, -r * 0.48);
      ctx.rotate(s * 0.30);
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.40, r * 0.25, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#E8D8D0';
      ctx.beginPath();
      ctx.ellipse(s * r * 0.06, 0, r * 0.24, r * 0.14, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#FDFCFA';
      ctx.restore();
    }

    // 头顶两只小圆角（米黄，比头深一档才有对比）
    ctx.fillStyle = '#E9DBBE';
    ctx.strokeStyle = '#B3A17E';
    for (const s of [-1, 1]) {
      ctx.save();
      ctx.translate(s * r * 0.40, -r * 0.94);
      ctx.rotate(s * 0.55);
      ctx.beginPath();
      ctx.moveTo(-r * 0.19, r * 0.16);
      ctx.quadraticCurveTo(-r * 0.24, -r * 0.30, 0, -r * 0.36);
      ctx.quadraticCurveTo(r * 0.24, -r * 0.30, r * 0.19, r * 0.16);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // 头主体：白→浅灰渐变的圆
    const head = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.15, 0, 0, r * 1.12);
    head.addColorStop(0, '#FFFFFF');
    head.addColorStop(1, '#E2DCD2');
    ctx.fillStyle = head;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#B8B0A2';
    ctx.stroke();

    // 眼睛：黑色圆点 + 高光
    ctx.fillStyle = '#26222A';
    ctx.beginPath(); ctx.arc(-r * 0.30, -r * 0.14, r * 0.13, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(r * 0.30, -r * 0.14, r * 0.13, 0, TAU); ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath(); ctx.arc(-r * 0.26, -r * 0.19, r * 0.045, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(r * 0.34, -r * 0.19, r * 0.045, 0, TAU); ctx.fill();

    // 粉色大口鼻
    ctx.fillStyle = '#F3CDC5';
    ctx.strokeStyle = '#DFA9A0';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(0, r * 0.40, r * 0.50, r * 0.37, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#8A5A50';
    ctx.beginPath();
    ctx.ellipse(-r * 0.19, r * 0.40, r * 0.075, r * 0.11, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(r * 0.19, r * 0.40, r * 0.075, r * 0.11, 0, 0, TAU);
    ctx.fill();

    // 受伤痕迹
    pigScratches(ctx, r, p);

    if (p.hitFlash > 0) {
      ctx.globalAlpha = p.hitFlash * 0.55;
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  /* ---------------- 贝拉的锤子 ---------------- */

  function drawHammer(ctx, m) {
    const r = Entities.HAMMER.radius;
    ctx.save();
    ctx.translate(m.position.x, m.position.y);
    ctx.rotate(m.angle * 0.5);

    // 木柄
    ctx.fillStyle = '#8B5E3C';
    roundRect(ctx, -r * 0.28, -r * 0.6, r * 0.56, r * 2.4, r * 0.26);
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = '#5E3F26';
    ctx.stroke();

    // 金属锤头
    const g = ctx.createLinearGradient(0, -r * 1.7, 0, -r * 0.2);
    g.addColorStop(0, '#C2CAD6');
    g.addColorStop(1, '#6A7380');
    ctx.fillStyle = g;
    roundRect(ctx, -r * 1.35, -r * 1.7, r * 2.7, r * 1.5, r * 0.32);
    ctx.fill();
    ctx.strokeStyle = '#49525E';
    ctx.stroke();

    ctx.restore();
  }

  /* ---------------- 方块 ---------------- */

  function drawCracks(ctx, w, h, seed) {
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = ((seed * (i + 3) * 37) % 100) / 100;
      const bx = -w / 2 + w * a;
      const j1 = ((seed * (i + 5) * 17) % 7) - 3;
      const j2 = ((seed * (i + 7) * 23) % 7) - 3;
      ctx.moveTo(bx, -h / 2);
      ctx.lineTo(bx + j1, -h / 6);
      ctx.lineTo(bx + j2, h / 6);
      ctx.lineTo(bx + (j1 - j2) * 0.5, h / 2);
    }
    ctx.stroke();
  }

  function drawBlock(ctx, b) {
    const m = Entities.MATERIALS[b.material] || Entities.MATERIALS.wood;
    const w = b.w;
    const h = b.h;
    const r = Math.min(4, Math.min(w, h) / 3);

    ctx.save();
    ctx.translate(b.position.x, b.position.y);
    ctx.rotate(b.angle);

    roundRect(ctx, -w / 2, -h / 2, w, h, r);
    ctx.fillStyle = m.fill;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = m.edge;
    ctx.stroke();

    // 木纹 / 石纹
    ctx.strokeStyle = m.grain;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    if (w >= h) {
      for (let i = 1; i <= 3; i++) {
        const yy = -h / 2 + (h * i) / 4;
        ctx.moveTo(-w / 2 + 6, yy);
        ctx.lineTo(w / 2 - 6, yy);
      }
    } else {
      for (let i = 1; i <= 3; i++) {
        const xx = -w / 2 + (w * i) / 4;
        ctx.moveTo(xx, -h / 2 + 6);
        ctx.lineTo(xx, h / 2 - 6);
      }
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    // 损伤裂纹
    const dmg = 1 - Math.max(0, b.hp) / b.maxHp;
    if (dmg > 0.02) {
      ctx.globalAlpha = Math.min(0.85, dmg);
      ctx.strokeStyle = 'rgba(22, 16, 10, 0.9)';
      ctx.lineWidth = 2;
      drawCracks(ctx, w, h, b.id);
      ctx.globalAlpha = 1;
    }

    // 命中闪白
    if (b.hitFlash > 0) {
      ctx.globalAlpha = b.hitFlash * 0.45;
      ctx.fillStyle = '#FFFFFF';
      roundRect(ctx, -w / 2, -h / 2, w, h, r);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  /* ---------------- 轨迹与提示 ---------------- */

  function drawTrajectory(ctx, game) {
    const pts = game.trajectory;
    if (!pts || !pts.length) return;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const t = i / pts.length;
      ctx.globalAlpha = 0.85 - t * 0.55;
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(p.x, p.y, i === 0 ? 4.2 : 3.2, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function drawHint(ctx, game) {
    let text = null;
    if (game.state === 'aiming' && game.previewBird) {
      text = '按住并向后拖拽角色，松手发射';
    } else if (
      game.state === 'flying' && game.bird && !game.bird.skillUsed &&
      Entities.BIRD_SKILL[game.bird.skin]
    ) {
      // 有主动技能的角色在飞行中提示点按（贝拉无技能，不提示）
      text = '点按屏幕，释放技能！';
    }
    if (!text) return;

    ctx.font = '500 17px "PingFang SC", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width + 44;

    ctx.fillStyle = 'rgba(10, 16, 26, 0.62)';
    roundRect(ctx, game.W / 2 - w / 2, game.H - 62, w, 40, 20);
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
    ctx.fillText(text, game.W / 2, game.H - 41);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  /* ---------------- 入口 ---------------- */

  function draw(ctx, game) {
    ctx.clearRect(0, 0, game.W, game.H);
    drawSky(ctx, game);
    drawGround(ctx, game);
    drawTrajectory(ctx, game);
    drawSlingBack(ctx, game);

    for (let i = 0; i < game.blocks.length; i++) drawBlock(ctx, game.blocks[i]);
    for (let i = 0; i < game.pigs.length; i++) drawPig(ctx, game.pigs[i]);
    if (game.hammer) drawHammer(ctx, game.hammer);

    drawBirdBody(ctx, game);
    drawBirdPreview(ctx, game);
    drawSlingFront(ctx, game);
    drawHint(ctx, game);
  }

  // drawBird / drawPig 同时供主菜单图鉴的头像绘制复用；
  // ready 供图鉴在贴图加载完成后重绘
  return { draw, drawBird, drawPig, drawSpriteCentered, ready };
})();