(function () {
  'use strict';
  var UNO = (window.UNO = window.UNO || {});

  // 零音频文件：全部用 WebAudio 实时合成
  var MUTE_KEY = 'asoul-uno-mute-v1';
  var ctx = null;
  var enabled = true;
  try { enabled = localStorage.getItem(MUTE_KEY) !== '1'; } catch (e) { /* 隐私模式忽略 */ }

  function ac() {
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch (e) { ctx = null; }
    return ctx;
  }

  function t0(c) { return c.currentTime; }

  function tone(c, o) {
    var osc = c.createOscillator();
    var gain = c.createGain();
    var start = t0(c) + (o.delay || 0);
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f0, start);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(30, o.f1), start + o.dur);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(o.vol || 0.12, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + o.dur);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(start);
    osc.stop(start + o.dur + 0.03);
  }

  function noise(c, o) {
    var dur = o.dur || 0.12;
    var len = Math.max(1, Math.floor(c.sampleRate * dur));
    var buf = c.createBuffer(1, len, c.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = c.createBufferSource();
    src.buffer = buf;
    var bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = o.freq || 2200;
    bp.Q.value = o.q || 0.7;
    var gain = c.createGain();
    var start = t0(c) + (o.delay || 0);
    gain.gain.setValueAtTime(o.vol || 0.1, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(bp);
    bp.connect(gain);
    gain.connect(c.destination);
    src.start(start);
  }

  var RECIPES = {
    click: function (c) {
      tone(c, { type: 'triangle', f0: 900, f1: 420, dur: 0.07, vol: 0.075 });
      noise(c, { dur: 0.05, freq: 3200, vol: 0.05 });
    },
    draw: function (c) {
      noise(c, { dur: 0.16, freq: 1500, q: 0.5, vol: 0.085 });
      tone(c, { type: 'sine', f0: 320, f1: 220, dur: 0.09, vol: 0.045 });
    },
    down: function (c) {
      tone(c, { type: 'sawtooth', f0: 300, f1: 70, dur: 0.34, vol: 0.09 });
      tone(c, { type: 'sine', f0: 160, f1: 55, dur: 0.4, vol: 0.07, delay: 0.02 });
    },
    win: function (c) {
      [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) {
        tone(c, { type: 'triangle', f0: f, dur: 0.32, vol: 0.085, delay: i * 0.085 });
      });
    },
    lose: function (c) {
      [392, 329.63, 261.63].forEach(function (f, i) {
        tone(c, { type: 'sawtooth', f0: f, f1: f * 0.86, dur: 0.26, vol: 0.07, delay: i * 0.1 });
      });
    },
    bell: function (c) {
      tone(c, { type: 'sine', f0: 1568, dur: 0.42, vol: 0.09 });
      tone(c, { type: 'sine', f0: 2349, dur: 0.32, vol: 0.05, delay: 0.01 });
      tone(c, { type: 'sine', f0: 3136, dur: 0.2, vol: 0.03, delay: 0.02 });
    },
    buzz: function (c) {
      tone(c, { type: 'square', f0: 150, f1: 110, dur: 0.2, vol: 0.06 });
    }
  };

  function play(name) {
    if (!enabled) return;
    var c = ac();
    if (!c) return;
    if (c.state === 'suspended') { try { c.resume(); } catch (e) { /* 忽略 */ } }
    var fn = RECIPES[name];
    if (!fn) return;
    try { fn(c); } catch (e) { /* 某些环境限制音频，静默失败 */ }
  }

  function setEnabled(v) {
    enabled = !!v;
    try { localStorage.setItem(MUTE_KEY, enabled ? '0' : '1'); } catch (e) { /* 忽略 */ }
    return enabled;
  }

  function toggle() { return setEnabled(!enabled); }
  function isEnabled() { return enabled; }

  // 首次用户手势时唤醒 AudioContext（iOS/Safari 需要）
  function unlock() {
    var c = ac();
    if (c && c.state === 'suspended') { try { c.resume(); } catch (e) { /* 忽略 */ } }
  }

  UNO.audio = {
    play: play, toggle: toggle, setEnabled: setEnabled, isEnabled: isEnabled, unlock: unlock
  };
})();
