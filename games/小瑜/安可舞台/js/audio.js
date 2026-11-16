/* ═══════════ 安可舞台 · WebAudio 合成引擎 ═══════════
 * 前瞻调度器驱动整首曲目；暂停 = ctx.suspend()（时钟冻结，音画天然同步）。
 */
'use strict';

const AudioEngine = {
  ctx: null, master: null, musicBus: null, sfxBus: null,
  delay: null, delaySend: null, noiseBuf: null,
  volume: .8, muted: false,
  _sources: new Set(), _timer: null, _queue: null, _qi: 0,
  songStart: 0, song: null, comp: null,

  ensure() {
    if (this._silent) return;
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const c = this.ctx;
    this.master = c.createGain();
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = .004; comp.release.value = .2;
    this.master.connect(comp); comp.connect(c.destination);
    this.musicBus = c.createGain(); this.musicBus.gain.value = .9; this.musicBus.connect(this.master);
    this.sfxBus = c.createGain(); this.sfxBus.gain.value = .9; this.sfxBus.connect(this.master);
    this.delay = c.createDelay(2); this.delay.delayTime.value = .3;
    const fb = c.createGain(); fb.gain.value = .3;
    const wet = c.createGain(); wet.gain.value = .22;
    this.delay.connect(fb); fb.connect(this.delay); this.delay.connect(wet); wet.connect(this.musicBus);
    this.delaySend = c.createGain(); this.delaySend.gain.value = 1; this.delaySend.connect(this.delay);
    const len = c.sampleRate * 2;
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._applyVolume();
  },

  _applyVolume() {
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, .02);
  },
  setVolume(v) { this.volume = v; this._applyVolume(); },
  setMuted(m) { this.muted = m; this._applyVolume(); },

  _track(src) {
    this._sources.add(src);
    src.onended = () => this._sources.delete(src);
  },
  _midi(deg, base) {
    const s = this.song.scale;
    const oct = Math.floor(deg / 7), idx = ((deg % 7) + 7) % 7;
    return base + oct * 12 + s[idx];
  },
  _freq(m) { return 440 * Math.pow(2, (m - 69) / 12); },

  /* ── 乐器 ── */
  _kick(w, vel) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(165, w);
    o.frequency.exponentialRampToValueAtTime(44, w + .11);
    g.gain.setValueAtTime(.95 * vel, w);
    g.gain.exponentialRampToValueAtTime(.001, w + .16);
    o.connect(g); g.connect(this.musicBus);
    o.start(w); o.stop(w + .18); this._track(o);
  },
  _noise(w, vel, dur, filterType, freq, q, bus) {
    const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf; s.loop = true;
    f.type = filterType; f.frequency.value = freq; f.Q.value = q || 1;
    g.gain.setValueAtTime(vel, w);
    g.gain.exponentialRampToValueAtTime(.001, w + dur);
    s.connect(f); f.connect(g); g.connect(bus || this.musicBus);
    s.start(w); s.stop(w + dur + .02); this._track(s);
  },
  _snare(w, vel) {
    this._noise(w, .42 * vel, .13, 'bandpass', 1900, .9);
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = 'triangle'; o.frequency.value = 196;
    g.gain.setValueAtTime(.28 * vel, w);
    g.gain.exponentialRampToValueAtTime(.001, w + .07);
    o.connect(g); g.connect(this.musicBus);
    o.start(w); o.stop(w + .08); this._track(o);
  },
  _hat(w, vel, open) { this._noise(w, .2 * vel, open ? .24 : .045, 'highpass', 7600, 1); },
  _crash(w, vel) { this._noise(w, .26 * vel, 1.3, 'highpass', 5200, .7); },
  _bass(w, midi, dur, vel) {
    const c = this.ctx, o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
    o.type = 'sawtooth'; o.frequency.value = this._freq(midi);
    f.type = 'lowpass'; f.frequency.setValueAtTime(700, w);
    f.frequency.exponentialRampToValueAtTime(220, w + Math.max(.08, dur));
    f.Q.value = 3;
    g.gain.setValueAtTime(0, w);
    g.gain.linearRampToValueAtTime(.34 * vel, w + .008);
    g.gain.setValueAtTime(.34 * vel, w + dur * .7);
    g.gain.exponentialRampToValueAtTime(.001, w + dur + .05);
    o.connect(f); f.connect(g); g.connect(this.musicBus);
    o.start(w); o.stop(w + dur + .08); this._track(o);
  },
  _lead(w, midi, dur, vel) {
    const c = this.ctx, g = c.createGain(), f = c.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.setValueAtTime(2800, w);
    f.frequency.exponentialRampToValueAtTime(1100, w + Math.max(.1, dur));
    f.Q.value = 1.2;
    g.gain.setValueAtTime(0, w);
    g.gain.linearRampToValueAtTime(.15 * vel, w + .012);
    g.gain.setValueAtTime(.15 * vel, w + Math.max(.012, dur * .65));
    g.gain.exponentialRampToValueAtTime(.001, w + dur + .12);
    [-6, 6].forEach(det => {
      const o = c.createOscillator();
      o.type = det < 0 ? 'square' : 'sawtooth';
      o.frequency.value = this._freq(midi); o.detune.value = det;
      o.connect(f); o.start(w); o.stop(w + dur + .16); this._track(o);
    });
    f.connect(g); g.connect(this.musicBus);
    const send = c.createGain(); send.gain.value = .35; g.connect(send); send.connect(this.delaySend);
  },
  _pad(w, midis, dur, vel) {
    const c = this.ctx;
    midis.forEach(m => {
      const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
      o.type = 'triangle'; o.frequency.value = this._freq(m);
      f.type = 'lowpass'; f.frequency.value = 1300;
      g.gain.setValueAtTime(0, w);
      g.gain.linearRampToValueAtTime(.055 * vel, w + .35);
      g.gain.setValueAtTime(.055 * vel, w + dur - .5);
      g.gain.linearRampToValueAtTime(0, w + dur + .3);
      o.connect(f); f.connect(g); g.connect(this.musicBus);
      o.start(w); o.stop(w + dur + .4); this._track(o);
    });
  },
  _arp(w, midi, dur, vel) {
    const c = this.ctx, o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
    o.type = 'square'; o.frequency.value = this._freq(midi);
    f.type = 'lowpass'; f.frequency.value = 3200;
    g.gain.setValueAtTime(.075 * vel, w);
    g.gain.exponentialRampToValueAtTime(.001, w + Math.max(.06, dur));
    o.connect(f); f.connect(g); g.connect(this.musicBus);
    const send = c.createGain(); send.gain.value = .5; g.connect(send); send.connect(this.delaySend);
    o.start(w); o.stop(w + dur + .05); this._track(o);
  },

  _playEvent(ev, w) {
    const song = this.song;
    switch (ev.kind) {
      case 'kick': this._kick(w, ev.vel); break;
      case 'snare': this._snare(w, ev.vel); break;
      case 'hat': this._hat(w, ev.vel, false); break;
      case 'ohat': this._hat(w, ev.vel, true); break;
      case 'crash': this._crash(w, ev.vel); break;
      case 'bass': this._bass(w, this._midi(ev.deg, song.root - 24), ev.dur, ev.vel); break;
      case 'lead': this._lead(w, this._midi(ev.deg, song.root + 12), ev.dur, ev.vel); break;
      case 'arp': this._arp(w, this._midi(ev.deg, song.root + 12), ev.dur, ev.vel); break;
      case 'pad': this._pad(w, ev.degs.map(d => this._midi(d, song.root)), ev.dur, ev.vel); break;
    }
  },

  startSong(song, comp) {
    this.ensure();
    this.stopSong();
    this.song = song; this.comp = comp;
    if (this.ctx) this.delay.delayTime.value = comp.spb * .75;
    this.songStart = this.now() + .6;
    this._queue = comp.events; this._qi = 0;
    if (this.ctx) {
      this._timer = setInterval(() => this._schedule(), 25);
      this._schedule();
    }
  },
  _schedule() {
    if (!this._queue || !this.ctx) return;
    const horizon = this.ctx.currentTime + .2;
    while (this._qi < this._queue.length) {
      const ev = this._queue[this._qi];
      const w = this.songStart + ev.t;
      if (w > horizon) break;
      if (w >= this.ctx.currentTime - .05) this._playEvent(ev, Math.max(w, this.ctx.currentTime + .005));
      this._qi++;
    }
  },
  stopSong() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    this._queue = null; this._qi = 0;
    this._sources.forEach(s => { try { s.stop(); } catch (e) {} });
    this._sources.clear();
  },
  pause() {
    if (this.ctx) { if (this.ctx.state === 'running') this.ctx.suspend(); }
    else if (this._pausedAt == null) this._pausedAt = this.now();
  },
  resume() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); }
    else if (this._pausedAt != null) { this._perfPause = performance.now() / 1000 - this._pausedAt; this._pausedAt = null; }
  },
  _pausedAt: null, _perfPause: 0,
  now() {
    if (this.ctx) return this.ctx.currentTime;
    return this._pausedAt != null ? this._pausedAt : performance.now() / 1000 - this._perfPause;
  },
  songTime() { return this.now() - this.songStart; },

  /* ── 界面/判定音效 ── */
  _blip(freq, dur, vel, type, bus) {
    if (!this.ctx) return;
    const c = this.ctx, w = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(vel, w);
    g.gain.exponentialRampToValueAtTime(.001, w + dur);
    o.connect(g); g.connect(bus || this.sfxBus);
    o.start(w); o.stop(w + dur + .02); this._track(o);
  },
  uiClick() { this.ensure(); this._blip(880, .06, .12, 'triangle'); },
  uiBack() { this.ensure(); this._blip(520, .08, .1, 'triangle'); },
  countdown(final) { this._blip(final ? 1046 : 660, final ? .25 : .09, .18, 'square'); },
  hit(lane, judge) {
    if (!this.ctx || !this.song) return;
    const s = this.song.scale;
    const midi = this.song.root + 24 + s[lane % s.length];
    const f = this._freq(midi);
    const vel = judge === 'P' ? .16 : judge === 'G' ? .12 : .08;
    this._blip(f, .1, vel, 'sine');
    if (judge === 'P') this._blip(f * 2, .07, .06, 'sine');
  },
  miss() {
    if (!this.ctx) return;
    this._noise(this.ctx.currentTime, .1, .12, 'lowpass', 420, 1, this.sfxBus);
  },
  fever() {
    if (!this.ctx) return;
    const c = this.ctx, w = c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(220, w);
    o.frequency.exponentialRampToValueAtTime(1760, w + .45);
    g.gain.setValueAtTime(.12, w);
    g.gain.exponentialRampToValueAtTime(.001, w + .55);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 3000;
    o.connect(f); f.connect(g); g.connect(this.sfxBus);
    o.start(w); o.stop(w + .6); this._track(o);
    [0, 4, 7, 12].forEach((d, i) => this._blip(this._freq(this.song.root + 12 + d), .4, .08, 'triangle'));
  },
  stamp() {
    if (!this.ctx) return;
    this._noise(this.ctx.currentTime, .22, .25, 'bandpass', 2400, .8, this.sfxBus);
    [0, 4, 7].forEach(d => this._blip(this._freq((this.song ? this.song.root : 60) + 12 + d), .5, .09, 'triangle'));
  },
};