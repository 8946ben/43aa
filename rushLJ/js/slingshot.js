/**
 * 弹弓：拖拽瞄准 + 松手发射 + 轨迹预测。
 * 瞄准阶段不进物理世界（只渲染预览鸟），发射瞬间才创建刚体，
 * 这样能完全避开 Matter 静态体反复切换带来的抖动问题。
 */
const Slingshot = (function () {
  const { Vector } = Matter;

  let canvasEl = null;
  let G = null;
  let launchCb = null;
  let dragging = false;

  function toLogical(evt) {
    const rect = canvasEl.getBoundingClientRect();
    return {
      x: (evt.clientX - rect.left) * (G.W / rect.width),
      y: (evt.clientY - rect.top) * (G.H / rect.height)
    };
  }

  /** 把指针位置转成"皮兜"位置：以弹弓锚点为圆心、限制最大拉伸半径 */
  function pouchFrom(pointer) {
    const a = G.sling;
    let dx = pointer.x - a.x;
    let dy = pointer.y - a.y;
    const dist = Math.hypot(dx, dy);
    if (dist > G.cfg.maxStretch) {
      const k = G.cfg.maxStretch / dist;
      dx *= k;
      dy *= k;
    }
    return { x: a.x + dx, y: a.y + dy };
  }

  function applyPouch(pos) {
    const bird = G.previewBird;
    bird.x = pos.x;
    bird.y = pos.y;
    G.pull = { x: G.sling.x - pos.x, y: G.sling.y - pos.y };
    G.trajectory = computeTrajectory();
  }

  function resetPouch() {
    const bird = G.previewBird;
    if (!bird) return;
    bird.x = G.sling.x;
    bird.y = G.sling.y;
    G.pull = { x: 0, y: 0 };
    G.trajectory = [];
  }

  /**
   * 用与 Matter 相同的积分方式前推轨迹，保证预测线和真实飞行一致。
   * Matter 的更新顺序：v = v_prev * (1 - frictionAir) + a，然后 p += v
   */
  function computeTrajectory() {
    const bird = G.previewBird;
    const pts = [];
    if (!bird) return pts;

    const g = G.gStep;
    const damp = 1 - Entities.BIRD.frictionAir;
    let vx = G.pull.x * G.cfg.power;
    let vy = G.pull.y * G.cfg.power;
    let x = bird.x;
    let y = bird.y;

    for (let i = 0; i < 150; i++) {
      vx *= damp;
      vy = vy * damp + g;
      x += vx;
      y += vy;
      if (i % 4 === 0) pts.push({ x, y, i });
      if (y > G.GROUND_Y || x > G.W + 120 || x < -120) break;
    }
    return pts;
  }

  function onDown(evt) {
    if (G.state !== 'aiming' || !G.previewBird) return;
    dragging = true;
    canvasEl.style.cursor = 'grabbing';
    applyPouch(pouchFrom(toLogical(evt)));
    evt.preventDefault();
  }

  function onMove(evt) {
    if (!dragging) return;
    applyPouch(pouchFrom(toLogical(evt)));
    evt.preventDefault();
  }

  function onUp() {
    if (!dragging) return;
    dragging = false;
    canvasEl.style.cursor = 'crosshair';

    const pull = Math.hypot(G.pull.x, G.pull.y);
    if (pull < 14) {
      // 几乎没拉动，视作取消，不做无力的发射
      resetPouch();
      return;
    }
    const velocity = { x: G.pull.x * G.cfg.power, y: G.pull.y * G.cfg.power };
    resetPouch();
    launchCb(velocity);
  }

  function init(canvas, game, cb) {
    canvasEl = canvas;
    G = game;
    launchCb = cb;

    canvasEl.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  return { init, computeTrajectory, resetPouch };
})();