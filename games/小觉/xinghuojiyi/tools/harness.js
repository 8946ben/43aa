/* ============================================================
 * 无头自测环境 —— tools/harness.js
 * ------------------------------------------------------------
 * 用极简的假 DOM + 假 canvas 在 Node 里跑真正的 js/game.js，
 * 这样可以在没有浏览器的情况下：
 *   • 自动打完整局（机器人策略）
 *   • 检查脚本报错、状态机、经济数值
 *   • 跑平衡性蒙特卡洛
 *
 * 用法：node tools/verify.js
 * ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

/* ---------- 假 canvas 2D 上下文 ---------- */
function makeCtx2d() {
  const noop = () => { };
  const grad = { addColorStop: noop };
  return {
    canvas: null,
    setTransform: noop, save: noop, restore: noop, translate: noop, rotate: noop, scale: noop,
    beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop, arc: noop, arcTo: noop,
    bezierCurveTo: noop, quadraticCurveTo: noop, ellipse: noop, rect: noop, fill: noop,
    stroke: noop, fillRect: noop, strokeRect: noop, clearRect: noop,
    fillText: noop, strokeText: noop, setLineDash: noop,
    measureText: (t) => ({ width: String(t).length * 7 }),
    createRadialGradient: () => grad,
    createLinearGradient: () => grad,
    drawImage: noop,
    imageSmoothingEnabled: true,
    globalAlpha: 1, fillStyle: '#000', strokeStyle: '#000', lineWidth: 1,
    lineDashOffset: 0, font: '', textAlign: 'left', textBaseline: 'alphabetic'
  };
}

/* ---------- 假元素 ---------- */
class FakeEl {
  constructor(tag, id) {
    this.tagName = (tag || 'div').toUpperCase();
    this.id = id || '';
    this.children = [];
    this._text = '';
    this._html = '';
    this.style = {
      _m: {},
      setProperty(k, v) { this._m[k] = v; },
      getPropertyValue(k) { return this._m[k]; }
    };
    this._cls = new Set();
    this._listeners = {};
    this.width = 960; this.height = 640;
    this.classList = {
      _s: this._cls,
      add: (...c) => c.forEach(x => this._cls.add(x)),
      remove: (...c) => c.forEach(x => this._cls.delete(x)),
      contains: (c) => this._cls.has(c),
      toggle: (c) => this._cls.has(c) ? this._cls.delete(c) : this._cls.add(c)
    };
  }
  get className() { return [...this._cls].join(' '); }
  set className(v) { this._cls = new Set(String(v).split(/\s+/).filter(Boolean)); }
  get textContent() { return this._text; }
  set textContent(v) { this._text = String(v); }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = String(v); if (v === '') this.children = []; }
  appendChild(c) { this.children.push(c); return c; }
  addEventListener(t, fn) { (this._listeners[t] = this._listeners[t] || []).push(fn); }
  removeEventListener() { }
  dispatch(t, ev) { (this._listeners[t] || []).forEach(fn => fn(ev || {})); }
  getContext() { const c = makeCtx2d(); c.canvas = this; return c; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 960, height: 640, right: 960, bottom: 640 }; }
  querySelector() { return null; }
  focus() { }
  set disabled(v) { this._disabled = v; }
  get disabled() { return !!this._disabled; }
}

class FakeCanvas extends FakeEl {
  constructor() { super('canvas', 'game'); }
}

/* ---------- 组装一个假 window ---------- */
function createEnv(opts) {
  opts = opts || {};
  const elements = Object.create(null);
  const errors = [];
  const warnings = [];

  const ensure = (id) => {
    if (!elements[id]) {
      elements[id] = id === 'game' ? new FakeCanvas() : new FakeEl('div', id);
    }
    return elements[id];
  };

  // 预建 index.html 里出现的 id
  [
    'game', 'hud-dust', 'hud-fuel', 'hud-hp', 'hud-score', 'hud-wave', 'hud-lit', 'hud-tip',
    'hud-hint', 'fuel-bar', 'hp-bar', 'shield-bar', 'relic-list', 'relic-bar',
    'ov-menu', 'ov-help', 'ov-pause', 'ov-result',
    'constel-grid', 'btn-pause', 'btn-run', 'btn-mute',
    'btn-resume-run', 'btn-resume-restart', 'btn-resume-menu',
    'btn-again', 'btn-to-menu', 'btn-help', 'btn-help-back',
    'res-title', 'res-sub', 'res-stars', 'res-stats', 'menu-best'
  ].forEach(ensure);

  const body = new FakeEl('body');
  const document = {
    readyState: 'complete',
    body,
    getElementById: (id) => elements[id] || null,
    createElement: (tag) => new FakeEl(tag),
    querySelector: (sel) => { const m = /^#([\w-]+)$/.exec(sel); return m ? (elements[m[1]] || null) : null; },
    addEventListener() { },
    removeEventListener() { }
  };

  const rafQueue = [];
  const window = {
    document,
    devicePixelRatio: 2,
    addEventListener() { },
    removeEventListener() { },
    requestAnimationFrame: (cb) => { rafQueue.push(cb); return rafQueue.length; },
    cancelAnimationFrame() { },
    setTimeout: (fn, ms) => { timers.push({ fn, at: clock + (ms || 0) }); return timers.length; },
    clearTimeout() { },
    AudioContext: null,
    webkitAudioContext: null
  };

  const timers = [];
  let clock = 0;

  const sandbox = {
    window,
    document,
    console: {
      log: (...a) => { if (opts.verbose) console.log(...a); },
      warn: (...a) => warnings.push(a.join(' ')),
      error: (...a) => errors.push(a.join(' '))
    },
    performance: { now: () => clock },
    Math, Date, JSON, Object, Array, String, Number, Boolean, Error, isNaN, parseInt, parseFloat,
    localStorage: {
      _d: {},
      getItem(k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
      setItem(k, v) { this._d[k] = String(v); },
      removeItem(k) { delete this._d[k]; }
    },
    setTimeout: window.setTimeout,
    clearTimeout: window.clearTimeout,
    requestAnimationFrame: window.requestAnimationFrame,
    confirm: () => true,
    alert: () => { }
  };
  sandbox.globalThis = sandbox;
  window.localStorage = sandbox.localStorage;
  window.performance = sandbox.performance;

  sandbox.addEventListener = window.addEventListener.bind(window);
  sandbox.removeEventListener = window.removeEventListener.bind(window);
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);

  const files = ['js/data.js', 'js/graph.js', 'js/game.js'];
  for (const f of files) {
    const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
    try {
      vm.runInContext(code, ctx, { filename: f, displayErrors: true });
    } catch (e) {
      errors.push('[' + f + '] ' + (e && e.stack || e));
    }
  }

  const api = {
    window, ctx, elements,
    canLightTest(i) { const a = sandbox.__XINGHUO__; return !!(a && a.canLight(a.G.nodes[i])); },
    get el() { return elements; },
    errors, warnings,
    /* 推进 n 帧，每帧 dt 秒 */
    step(frames, dt) {
      frames = frames || 1;
      dt = dt === undefined ? 1 / 60 : dt;
      for (let i = 0; i < frames; i++) {
        clock += dt * 1000;
        const cbs = rafQueue.splice(0, rafQueue.length);
        for (const cb of cbs) {
          try { cb(clock); } catch (e) { errors.push('[raf] ' + (e && e.stack || e)); }
        }
        // 处理到期的 setTimeout
        for (let k = timers.length - 1; k >= 0; k--) {
          if (timers[k].at <= clock) {
            const t = timers.splice(k, 1)[0];
            try { t.fn(); } catch (e) { errors.push('[timer] ' + (e && e.stack || e)); }
          }
        }
      }
    },
    advanceSeconds(sec) { this.step(Math.round(sec * 60), 1 / 60); },
    setClock(c) { clock = c; },
    getClock() { return clock; },
    game() { return sandbox.__XINGHUO__ || window.__XINGHUO__; },
    G() { const a = this.game(); return a ? a.G : null; }
  };
  return api;
}

module.exports = { createEnv };