/* ═══════════ 安可舞台 · 主逻辑与渲染（太鼓式单轨） ═══════════
 * 一面太鼓两种鼓点：咚(鼓面 F/J) 与 咔(鼓边 D/K)，大音符需双键/双指齐击。
 */
'use strict';

const MEMBERS = [
  { id: 'bella',  name: '贝拉', color: '#ff8a7a' },
  { id: 'diana',  name: '嘉然', color: '#ff9ecb' },
  { id: 'eileen', name: '乃琳', color: '#7fa8ff' },
  { id: 'fiona',  name: '心宜', color: '#ff4f9a' },
  { id: 'sinuo',  name: '思诺', color: '#a98bff' },
];
const ACTIONS = {
  don: { keys: ['KeyF', 'KeyJ'], color: '#ff7a45', label: '咚', caps: 'F / J', zone: '鼓面' },
  ka:  { keys: ['KeyD', 'KeyK'], color: '#4de3ff', label: '咔', caps: 'D / K', zone: '鼓边' },
};
const JUDGE = {
  P:  { win: .05,  score: 300, text: 'PERFECT', color: '#ffc94d', hype: 1.4 },
  G:  { win: .10,  score: 200, text: 'GREAT',   color: '#6dff9e', hype: 1.0 },
  OK: { win: .15,  score: 100, text: 'GOOD',    color: '#4de3ff', hype: .4 },
  M:  { win: 9,    score: 0,   text: 'MISS',    color: '#ff5470', hype: -7 },
};
const DIFF_NOTE = {
  EZ: '轻松难度 · 正拍「咚」、反拍「咔」，慢慢认识鼓点',
  NM: '标准难度 · 跟随主旋律的完整鼓点流',
  HD: '狂热难度 · 旋律 + 鼓点全收录，crash 处大音符双键齐击',
};
const QUOTES = {
  S: [
    ['bella', '贝拉', '完美演出！这鼓点稳得像是练了十年，安可声都是给你的！'],
    ['diana', '嘉然', '呜呜呜一个魂的手速也太快了，鼓槌都挥出残影了！'],
    ['sinuo', '思诺', '每一槌都落在星星上……这场演出，我会记很久。'],
  ],
  A: [
    ['fiona', '心宜', '超棒的节奏感！最后那段连击，我在台上都听呆了。'],
    ['eileen', '乃琳', '哎呀，差一点点就满分了。不过这样的你，也很耀眼哦。'],
    ['diana', '嘉然', '好吃……啊不是，好打！再来一局肯定能 S！'],
  ],
  B: [
    ['bella', '贝拉', '不错的鼓感！跟着底鼓走，别被旋律带跑啦。'],
    ['eileen', '乃琳', '慢慢来，舞台不会跑掉，我也不会。'],
  ],
  C: [
    ['fiona', '心宜', '没关系！第一次摸鼓都会紧张，把速度调慢一点试试？'],
    ['diana', '嘉然', '加油加油！吃饱了才有力气打鼓，先吃口小蛋糕？'],
  ],
  F: [
    ['acao', '阿草', '阿草都听入迷了……忘记挥鼓槌不是你的错！'],
    ['bella', '贝拉', '别灰心，从 EZ 开始热身，我们陪你练到 S！'],
  ],
};

/* ── 存档 ── */
const SAVE_KEY = 'encoreStage.v1';
let save = { speed: 1.8, offset: 0, volume: 80, muted: false, diff: 'NM', songIdx: 0, bests: {} };
try { Object.assign(save, JSON.parse(localStorage.getItem(SAVE_KEY) || '{}')); } catch (e) {}
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} }

/* ── DOM ── */
const $ = id => document.getElementById(id);
const el = {
  selScreen: $('screen-select'), gameScreen: $('screen-game'), canvas: $('stage'),
  songList: $('song-list'), segDiff: $('seg-diff'), diffNote: $('diff-note'),
  slSpeed: $('sl-speed'), valSpeed: $('val-speed'),
  slOffset: $('sl-offset'), valOffset: $('val-offset'),
  slVolume: $('sl-volume'), valVolume: $('val-volume'),
  slVolumeP: $('sl-volume-p'), valVolumeP: $('val-volume-p'),
  slOffsetP: $('sl-offset-p'), valOffsetP: $('val-offset-p'),
  keyGuide: $('key-guide'), btnStart: $('btn-start'),
  muteSel: $('btn-mute-sel'), muteGame: $('btn-mute-game'), btnPause: $('btn-pause'),
  hudTitle: $('hud-title'), hudDiff: $('hud-diff'), hudProg: $('hud-progress-fill'),
  hudScore: $('hud-score'), hudAcc: $('hud-acc'),
  hypeFill: $('hype-fill'), hypeState: $('hype-state'),
  feverBanner: $('fever-banner'), countdown: $('countdown'),
  ovPause: $('overlay-pause'), pauseSong: $('pause-song'),
  btnResume: $('btn-resume'), btnRestartP: $('btn-restart-p'), btnQuitP: $('btn-quit-p'),
  ovResult: $('overlay-result'), resClear: $('res-clear'), resSong: $('res-song'),
  resRank: $('res-rank'), resScore: $('res-score'), resNew: $('res-newrecord'),
  resAcc: $('res-acc'), resCombo: $('res-combo'), resJudge: $('res-judge'),
  resFace: $('res-quote-face'), resName: $('res-quote-name'), resText: $('res-quote-text'),
  btnRetry: $('btn-retry'), btnBack: $('btn-back'),
};
const ctx = el.canvas.getContext('2d');

/* ── 游戏状态 ── */
const G = {
  state: 'select', song: null, diff: 'NM', comp: null, notes: [], ni: 0,
  score: 0, combo: 0, maxCombo: 0, counts: { P: 0, G: 0, OK: 0, M: 0 },
  hype: 50, fever: false, feverEnd: 0,
  flash: { don: 0, ka: 0 }, heldKeys: new Set(), touchHeld: { don: 0, ka: 0 },
  pulse: 0, particles: [], popup: null, shake: 0, comboAge: 9,
  songTime: -1, resAnim: null, cdText: '',
};
const held = type => ACTIONS[type].keys.some(k => G.heldKeys.has(k)) || G.touchHeld[type] > 0;

/* ── 画布布局 ── */
let W = 0, H = 0, DPR = 1, L = {};
const faces = {};
let stars = [], crowd = [];

function loadFaces() {
  [...MEMBERS.map(m => m.id), 'acao'].forEach(id => {
    const img = new Image();
    img.src = 'assets/' + id + '.svg';
    faces[id] = img;
  });
}

function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  W = el.canvas.clientWidth || window.innerWidth;
  H = el.canvas.clientHeight || window.innerHeight;
  el.canvas.width = Math.round(W * DPR);
  el.canvas.height = Math.round(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const stageH = Math.max(110, H * .26);
  const bandH = clamp(H * .13, 64, 104);
  L = {
    stageH, cx: W / 2, stageW: Math.min(W * .86, 780),
    bandY: H * .58, bandH, hitX: Math.max(86, W * .22),
  };
  stars = [];
  for (let i = 0; i < 64; i++) {
    stars.push({ x: Math.random() * W, y: Math.random() * stageH * .9, r: Math.random() * 1.4 + .4, ph: Math.random() * 7 });
  }
  crowd = [];
  const rows = H > 500 ? 3 : 2;
  for (let r = 0; r < rows; r++) {
    const n = Math.ceil(W / 46) + 1;
    for (let i = 0; i < n; i++) {
      crowd.push({
        x: (i + (r % 2) * .5) * (W / n) + Math.random() * 12 - 6,
        y: H * .90 + r * H * .035 + Math.random() * 5,
        r: 9 + Math.random() * 5 + r * 2,
        ph: Math.random() * 7,
        c: MEMBERS[(Math.random() * 5) | 0].color,
      });
    }
  }
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.max(0, Math.min(255, Math.round(r * (1 + amt))));
  g = Math.max(0, Math.min(255, Math.round(g * (1 + amt))));
  b = Math.max(0, Math.min(255, Math.round(b * (1 + amt))));
  return `rgb(${r},${g},${b})`;
}
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ── 选曲界面 ── */
function fmtTime(s) { return Math.floor(s / 60) + ':' + String(Math.round(s % 60)).padStart(2, '0'); }

function buildSongCards() {
  el.songList.innerHTML = '';
  SONGS.forEach((s, i) => {
    const counts = noteCounts(s);
    const card = document.createElement('button');
    card.className = 'song-card' + (i === save.songIdx ? ' selected' : '');
    card.style.setProperty('--c', `var(--${s.color})`);
    const cHex = getComputedStyle(document.documentElement).getPropertyValue('--' + s.color).trim() || '#7fa8ff';
    card.innerHTML = `
      <div class="jacket" style="background:
        radial-gradient(90px 70px at 30% 20%, ${hexA(cHex, .55)}, transparent 70%),
        linear-gradient(150deg, ${shade(cHex, -.55)}, #120d26 80%)">
        <span class="j-no">0${i + 1}</span>
        <img src="assets/${s.face}.svg" alt="${s.title}">
        <div class="j-eq"><i></i><i></i><i></i><i></i><i></i></div>
      </div>
      <div class="song-info">
        <h3>${s.title}</h3>
        <div class="s-en">${s.en}</div>
        <div class="s-desc">${s.desc}</div>
        <div class="song-meta">
          <span class="bpm">♪ ${s.bpm} BPM</span>
          <span>${fmtTime(songDuration(s) - 2.5)}</span>
          <span class="note-count">${counts[save.diff]} 鼓点</span>
        </div>
      </div>
      <div class="song-best">
        <div class="best-rank">—</div>
        <div class="best-score"></div>
        <div class="best-label">BEST</div>
      </div>`;
    card.addEventListener('click', () => {
      save.songIdx = i; persist();
      AudioEngine.uiClick();
      refreshSelect();
    });
    el.songList.appendChild(card);
  });
}

function refreshSelect() {
  [...el.songList.children].forEach((card, i) => {
    card.classList.toggle('selected', i === save.songIdx);
    const s = SONGS[i];
    card.querySelector('.note-count').textContent = noteCounts(s)[save.diff] + ' 鼓点';
    const best = save.bests[s.id + '_' + save.diff];
    const rankEl = card.querySelector('.best-rank');
    const scoreEl = card.querySelector('.best-score');
    if (best) {
      rankEl.textContent = best.rank;
      rankEl.classList.add('has');
      scoreEl.textContent = best.score.toLocaleString();
    } else {
      rankEl.textContent = '—';
      rankEl.classList.remove('has');
      scoreEl.textContent = '';
    }
  });
  [...el.segDiff.children].forEach(b => b.classList.toggle('active', b.dataset.diff === save.diff));
  el.diffNote.textContent = DIFF_NOTE[save.diff];
}

function buildKeyGuide() {
  el.keyGuide.innerHTML = Object.values(ACTIONS).map(a =>
    `<div class="key-cap" style="--c:${a.color}"><b>${a.caps}</b><span>${a.label} · ${a.zone}</span></div>`).join('');
}

function syncSettingsUI() {
  el.slSpeed.value = Math.round(save.speed * 10);
  el.valSpeed.textContent = save.speed.toFixed(1) + '×';
  el.slOffset.value = save.offset; el.valOffset.textContent = (save.offset > 0 ? '+' : '') + save.offset + 'ms';
  el.slOffsetP.value = save.offset; el.valOffsetP.textContent = el.valOffset.textContent;
  el.slVolume.value = save.volume; el.valVolume.textContent = save.volume;
  el.slVolumeP.value = save.volume; el.valVolumeP.textContent = save.volume;
  el.muteSel.classList.toggle('muted', save.muted);
  el.muteGame.classList.toggle('muted', save.muted);
  AudioEngine.setVolume(save.volume / 100);
  AudioEngine.setMuted(save.muted);
}

/* ── 开局 / 暂停 / 结算 ── */
function startGame() {
  const song = SONGS[save.songIdx];
  G.song = song; G.diff = save.diff;
  G.comp = compileSong(song);
  G.notes = buildChart(song, save.diff).map(n => ({ t: n.t, type: n.type, big: n.big, judged: false, result: null }));
  G.ni = 0; G.score = 0; G.combo = 0; G.maxCombo = 0;
  G.counts = { P: 0, G: 0, OK: 0, M: 0 };
  G.hype = 50; G.fever = false; G.feverEnd = 0;
  G.particles.length = 0; G.popup = null; G.shake = 0; G.comboAge = 9; G.pulse = 0;
  G.flash.don = 0; G.flash.ka = 0;
  G.heldKeys.clear(); G.touchHeld.don = 0; G.touchHeld.ka = 0;
  G.resAnim = null; G.cdText = '';
  el.hudTitle.textContent = song.title;
  el.hudDiff.textContent = save.diff;
  el.hudDiff.className = 'hud-diff ' + save.diff;
  el.pauseSong.textContent = song.title + ' · ' + save.diff;
  el.ovPause.classList.add('hidden');
  el.ovResult.classList.add('hidden');
  el.feverBanner.classList.add('hidden');
  el.selScreen.classList.add('hidden');
  el.gameScreen.classList.remove('hidden');
  resize();
  AudioEngine.ensure();
  AudioEngine.startSong(song, G.comp);
  G.state = 'playing';
}

function togglePause() {
  if (G.state === 'playing') {
    G.state = 'paused';
    AudioEngine.pause();
    el.ovPause.classList.remove('hidden');
  } else if (G.state === 'paused') {
    el.ovPause.classList.add('hidden');
    AudioEngine.resume();
    G.state = 'playing';
  }
}

function quitToSelect() {
  AudioEngine.stopSong();
  AudioEngine.resume();
  G.state = 'select';
  el.ovPause.classList.add('hidden');
  el.ovResult.classList.add('hidden');
  el.gameScreen.classList.add('hidden');
  el.selScreen.classList.remove('hidden');
  refreshSelect();
}

function accuracy() {
  const c = G.counts, judged = c.P + c.G + c.OK + c.M;
  if (!judged) return 1;
  return (c.P + c.G * .66 + c.OK * .33) / judged;
}
function rankOf(acc, miss) {
  if (acc >= .95 && miss === 0) return 'S';
  if (acc >= .9) return 'A';
  if (acc >= .75) return 'B';
  if (acc >= .6) return 'C';
  return 'F';
}

function finish() {
  G.state = 'result';
  AudioEngine.stopSong();
  el.feverBanner.classList.add('hidden');
  el.countdown.classList.add('hidden');
  const acc = accuracy(), rank = rankOf(acc, G.counts.M);
  const fc = G.counts.M === 0 && G.notes.length > 0;
  el.resClear.textContent = fc ? 'FULL COMBO!!' : rank === 'F' ? 'STAGE CLEAR…' : 'STAGE CLEAR';
  el.resClear.className = 'res-clear' + (fc ? ' fc' : rank === 'F' ? ' fail' : '');
  el.resSong.textContent = G.song.title + ' · ' + G.diff + ' · ' + G.song.en;
  el.resRank.textContent = rank;
  el.resRank.className = 'rank r-' + rank;
  el.resAcc.textContent = (acc * 100).toFixed(2) + '%';
  el.resCombo.textContent = G.maxCombo;
  const key = G.song.id + '_' + G.diff;
  const old = save.bests[key];
  const isNew = !old || G.score > old.score;
  if (isNew) {
    save.bests[key] = { score: G.score, rank, acc: +(acc * 100).toFixed(2), combo: G.maxCombo };
    persist();
  }
  el.resNew.classList.toggle('hidden', !isNew);
  const total = Math.max(1, G.notes.length);
  const rows = el.resJudge.querySelectorAll('.jrow');
  const vals = [G.counts.P, G.counts.G, G.counts.OK, G.counts.M];
  rows.forEach((r, i) => {
    r.querySelector('b').textContent = vals[i];
    const bar = r.querySelector('.jbar i');
    bar.style.width = '0%';
    requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.width = (vals[i] / total * 100) + '%'; }));
  });
  const pool = QUOTES[rank];
  const q = pool[(Math.random() * pool.length) | 0];
  el.resFace.src = 'assets/' + q[0] + '.svg';
  el.resName.textContent = q[1];
  el.resText.textContent = q[2];
  G.resAnim = { t0: performance.now(), dur: 900, to: G.score };
  el.resScore.textContent = '0';
  el.ovResult.classList.remove('hidden');
  setTimeout(() => AudioEngine.stamp(), 320);
}

/* ── 判定 ── */
function effTime() { return AudioEngine.songTime() - save.offset / 1000; }

function judge(type) {
  if (G.state !== 'playing') return;
  G.flash[type] = 1;
  G.pulse = 1;
  const t = effTime();
  let best = null, bestDt = Infinity;
  for (let i = G.ni; i < G.notes.length; i++) {
    const n = G.notes[i];
    if (n.t > t + JUDGE.OK.win) break;
    if (n.judged || n.type !== type) continue;
    const dt = Math.abs(n.t - t);
    if (dt < bestDt) { bestDt = dt; best = n; }
  }
  if (!best || bestDt > JUDGE.OK.win) return;
  const kind = bestDt <= JUDGE.P.win ? 'P' : bestDt <= JUDGE.G.win ? 'G' : 'OK';
  best.judged = true; best.result = kind;
  applyJudge(kind, type, best);
}

function applyJudge(kind, type, note) {
  const j = JUDGE[kind];
  G.counts[kind]++;
  if (kind === 'M') {
    G.combo = 0;
    G.hype = clamp(G.hype + j.hype, 0, 100);
    G.shake = 5;
    AudioEngine.miss();
    G.popup = { text: j.text, color: j.color, age: 0, big: false };
    return;
  }
  G.combo++; G.maxCombo = Math.max(G.maxCombo, G.combo); G.comboAge = 0;
  const bigHit = note && note.big && held(type);
  const comboMult = 1 + Math.min(G.combo, 100) * .01;
  const feverMult = G.fever ? 2 : 1;
  const coldMult = G.hype <= 0 ? .5 : 1;
  G.score += Math.round(j.score * comboMult * feverMult * coldMult * (bigHit ? 2 : 1));
  G.hype = clamp(G.hype + j.hype * (bigHit ? 2 : 1), 0, 100);
  if (G.hype >= 100 && !G.fever) startFever();
  AudioEngine.hit(type === 'don' ? 0 : 3, kind);
  G.popup = { text: j.text + (bigHit ? ' ×2' : ''), color: j.color, age: 0, big: bigHit };
  spawnHitBurst(type, kind, bigHit);
}

function startFever() {
  G.fever = true;
  G.feverEnd = AudioEngine.songTime() + 10;
  el.feverBanner.classList.remove('hidden');
  AudioEngine.fever();
  for (let i = 0; i < 70; i++) {
    G.particles.push({
      x: Math.random() * W, y: -10 - Math.random() * 60,
      vx: (Math.random() - .5) * 60, vy: 90 + Math.random() * 160,
      age: 0, life: 2.4 + Math.random(), size: 3 + Math.random() * 4,
      color: MEMBERS[(Math.random() * 5) | 0].color, grav: 30, confetti: true,
      rot: Math.random() * 7, vr: (Math.random() - .5) * 8,
    });
  }
}

function spawnHitBurst(type, kind, big) {
  const n = (kind === 'P' ? 12 : kind === 'G' ? 8 : 5) * (big ? 2 : 1);
  const x = L.hitX, y = L.bandY;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 120 + Math.random() * 260;
    G.particles.push({
      x: x + Math.cos(a) * L.bandH * .3, y: y + Math.sin(a) * L.bandH * .3,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60,
      age: 0, life: .4 + Math.random() * .35, size: 2 + Math.random() * 3,
      color: kind === 'P' ? '#ffc94d' : ACTIONS[type].color, grav: 420,
    });
  }
  if (G.particles.length > 300) G.particles.splice(0, G.particles.length - 300);
}

/* ── 更新 ── */
function update(dt) {
  if (G.state !== 'playing') return;
  const t = effTime();
  G.songTime = AudioEngine.songTime();
  while (G.ni < G.notes.length && G.notes[G.ni].t < t - JUDGE.OK.win) {
    const n = G.notes[G.ni];
    if (!n.judged) { n.judged = true; n.result = 'M'; applyJudge('M', n.type, n); }
    G.ni++;
  }
  if (G.fever) {
    const left = G.feverEnd - G.songTime;
    G.hype = clamp(left / 10 * 100, 0, 100);
    if (left <= 0) {
      G.fever = false; G.hype = 40;
      el.feverBanner.classList.add('hidden');
    }
  }
  G.flash.don = Math.max(0, G.flash.don - dt * 5);
  G.flash.ka = Math.max(0, G.flash.ka - dt * 5);
  G.pulse = Math.max(0, G.pulse - dt * 4);
  G.shake *= Math.exp(-dt * 7);
  G.comboAge += dt;
  for (let i = G.particles.length - 1; i >= 0; i--) {
    const p = G.particles[i];
    p.age += dt;
    if (p.age >= p.life) { G.particles.splice(i, 1); continue; }
    p.vy += (p.grav || 0) * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.confetti) { p.rot += p.vr * dt; p.vx += Math.sin(p.age * 6 + p.rot) * 20 * dt; }
  }
  if (G.popup) {
    G.popup.age += dt;
    if (G.popup.age > .55) G.popup = null;
  }
  if (G.songTime >= G.comp.duration) finish();
}

/* ── 渲染 ── */
function render(now) {
  ctx.clearRect(0, 0, W, H);
  const t = G.songTime;
  const spb = G.comp ? G.comp.spb : .5;
  const beatPhase = t >= 0 ? (t / spb) % 1 : 0;
  const energy = t >= 0 ? Math.pow(1 - beatPhase, 2) : 0;

  ctx.save();
  if (G.shake > .3) ctx.translate((Math.random() - .5) * G.shake, (Math.random() - .5) * G.shake);

  drawBackground(now);
  drawStage(now, energy, beatPhase);
  drawTaiko(now, t, spb);
  drawCrowd(now);
  drawParticles();
  drawPopup();
  drawCombo();
  ctx.restore();
}

function drawBackground(now) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#1b1240');
  g.addColorStop(.4, '#120c2c');
  g.addColorStop(1, '#0a0718');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  for (const s of stars) {
    ctx.globalAlpha = .25 + .55 * Math.abs(Math.sin(now * .8 + s.ph));
    ctx.fillStyle = '#dfe8ff';
    ctx.fillRect(s.x, s.y, s.r, s.r);
  }
  ctx.restore();
}

function hexA2(col, a) {
  if (col[0] === '#') return hexA(col, a);
  const m = col.match(/hsl\(([\d.]+),\s*(\d+)%,\s*(\d+)%\)/);
  if (m) return `hsla(${m[1]},${m[2]}%,${m[3]}%,${a})`;
  return col;
}

function drawStage(now, energy, beatPhase) {
  const sh = L.stageH, sw = L.stageW, sx = L.cx - sw / 2;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const spots = [
    { x: W * .16, c: MEMBERS[0].color, ph: 0 },
    { x: W * .5, c: MEMBERS[2].color, ph: 2.1 },
    { x: W * .84, c: MEMBERS[4].color, ph: 4.2 },
  ];
  spots.forEach((s, i) => {
    const sweep = Math.sin(now * (G.fever ? 1.1 : .35) + s.ph) * .38;
    const len = sh * 1.5, half = sh * .34;
    const bx = s.x + Math.tan(sweep) * len;
    const grad = ctx.createLinearGradient(s.x, -10, bx, len);
    const col = G.fever ? `hsl(${(now * 120 + i * 120) % 360},90%,65%)` : s.c;
    grad.addColorStop(0, hexA2(col, .16 + energy * .1));
    grad.addColorStop(1, hexA2(col, 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(s.x - 8, -10); ctx.lineTo(s.x + 8, -10);
    ctx.lineTo(bx + half, len); ctx.lineTo(bx - half, len);
    ctx.closePath(); ctx.fill();
  });
  ctx.restore();

  const by = sh * .1, bh = sh * .6;
  ctx.save();
  roundRect(ctx, sx, by, sw, bh, 10);
  const bg = ctx.createLinearGradient(sx, by, sx, by + bh);
  bg.addColorStop(0, '#241a4d'); bg.addColorStop(1, '#150f30');
  ctx.fillStyle = bg; ctx.fill();
  ctx.strokeStyle = G.fever ? `hsl(${(now * 120) % 360},90%,65%)` : 'rgba(138,164,255,.4)';
  ctx.lineWidth = 1.5; ctx.stroke();
  ctx.clip();
  const bars = 26, bw = sw / bars;
  for (let i = 0; i < bars; i++) {
    const hgt = (0.25 + 0.75 * Math.abs(Math.sin(i * 1.7 + now * 3.2))) * (0.3 + energy * .7) * bh * .5;
    ctx.fillStyle = hexA(MEMBERS[i % 5].color, .5);
    ctx.fillRect(sx + i * bw + 2, by + bh - hgt - 4, bw - 4, hgt);
  }
  if (W >= 560) {
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.font = `900 italic ${Math.min(22, sw * .035)}px "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(G.song ? G.song.en : 'ENCORE STAGE', L.cx, by + bh * .32);
    ctx.font = `${Math.min(12, sw * .02)}px "Microsoft YaHei", sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,.45)';
    ctx.fillText('A-SOUL LIVE · 枝江巡回演唱会', L.cx, by + bh * .52);
  }
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(L.cx, sh * .95, sw * .56, sh * .13, 0, 0, Math.PI * 2);
  const pg = ctx.createRadialGradient(L.cx, sh * .95, 4, L.cx, sh * .95, sw * .56);
  pg.addColorStop(0, '#3a2b6e'); pg.addColorStop(1, '#1c1440');
  ctx.fillStyle = pg; ctx.fill();
  ctx.strokeStyle = hexA('#8aa4ff', .35 + energy * .3);
  ctx.lineWidth = 2; ctx.stroke();
  ctx.restore();

  const dw = Math.min(sw * .16, 92);
  for (let i = 0; i < 5; i++) {
    drawDancer(L.cx + (i - 2) * dw, sh * .9, dw / 92, MEMBERS[i], now, beatPhase, i);
  }
}

function drawDancer(x, y, s, m, now, beatPhase, i) {
  const bounce = (Math.abs(Math.sin((beatPhase + i * .08) * Math.PI)) * 7 + G.pulse * 5) * s * (G.fever ? 1.6 : 1);
  const yy = y - bounce;
  ctx.save();
  ctx.translate(x, yy);
  ctx.scale(s, s);
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.beginPath(); ctx.ellipse(0, bounce + 4, 16, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = shade(m.color, -.25);
  ctx.beginPath();
  ctx.moveTo(-9, -22); ctx.lineTo(9, -22); ctx.lineTo(14, 0); ctx.lineTo(-14, 0);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = m.color;
  ctx.fillRect(-9, -24, 18, 5);
  const wave = Math.sin(now * (G.fever ? 7 : 3.4) + i * 1.3) * .55;
  [-1, 1].forEach(dir => {
    const ax = dir * 9, ay = -20;
    const ang = -Math.PI / 2 + dir * (.7 + wave * dir);
    const hx = ax + Math.cos(ang) * 16, hy = ay + Math.sin(ang) * 16;
    ctx.strokeStyle = '#ffe3da'; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = m.color; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(hx, hy);
    ctx.lineTo(hx + Math.cos(ang) * 12, hy + Math.sin(ang) * 12); ctx.stroke();
    ctx.fillStyle = hexA(m.color, .5);
    ctx.beginPath(); ctx.arc(hx + Math.cos(ang) * 12, hy + Math.sin(ang) * 12, 6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  });
  ctx.fillStyle = '#ffe3da';
  ctx.beginPath(); ctx.arc(0, -36, 13, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = m.color;
  ctx.beginPath(); ctx.arc(0, -38, 13.5, Math.PI * .95, Math.PI * 2.05); ctx.fill();
  ctx.fillRect(-13.5, -38, 4, 12); ctx.fillRect(9.5, -38, 4, 12);
  ctx.fillStyle = '#3a2430';
  ctx.beginPath(); ctx.arc(-4.5, -34, 1.8, 0, Math.PI * 2); ctx.arc(4.5, -34, 1.8, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#c9766c'; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.arc(0, -31, 3.2, .15 * Math.PI, .85 * Math.PI); ctx.stroke();
  ctx.fillStyle = hexA('#ff9d9d', .55);
  ctx.beginPath(); ctx.arc(-8, -31, 2.4, 0, Math.PI * 2); ctx.arc(8, -31, 2.4, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/* ── 太鼓横轨 ── */
function approachTime() { return 2.3 / save.speed; }
function pxPerSec() { return (W - L.hitX + 80) / approachTime(); }

function drawTaiko(now, t, spb) {
  const y = L.bandY, bh = L.bandH, hx = L.hitX, pps = pxPerSec();
  /* 轨道带 */
  ctx.save();
  roundRect(ctx, hx - bh * .8, y - bh / 2, W - hx + bh * .8 + 30, bh, bh / 2);
  const lg = ctx.createLinearGradient(0, y - bh / 2, 0, y + bh / 2);
  lg.addColorStop(0, 'rgba(30,22,64,.92)');
  lg.addColorStop(.5, 'rgba(18,13,40,.92)');
  lg.addColorStop(1, 'rgba(30,22,64,.92)');
  ctx.fillStyle = lg; ctx.fill();
  ctx.strokeStyle = G.fever ? `hsla(${(now * 120) % 360},95%,65%,.8)` : 'rgba(138,164,255,.35)';
  ctx.lineWidth = 2; ctx.stroke();
  ctx.clip();
  /* 节拍刻度 */
  if (t > -1) {
    const beat0 = Math.floor(t / spb);
    for (let b = beat0; b < beat0 + Math.ceil(approachTime() / spb) + 2; b++) {
      const x = hx + (b * spb - t) * pps;
      if (x < hx - bh || x > W + 20) continue;
      ctx.strokeStyle = b % 4 === 0 ? 'rgba(255,255,255,.22)' : 'rgba(255,255,255,.08)';
      ctx.lineWidth = b % 4 === 0 ? 2 : 1;
      ctx.beginPath(); ctx.moveTo(x, y - bh / 2 + 6); ctx.lineTo(x, y + bh / 2 - 6); ctx.stroke();
    }
  }
  /* 判定环 */
  ctx.strokeStyle = 'rgba(255,255,255,.5)';
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(hx, y, bh * .4, 0, Math.PI * 2); ctx.stroke();
  /* 音符 */
  const ap = approachTime();
  for (let i = G.ni; i < G.notes.length; i++) {
    const n = G.notes[i];
    const dt = n.t - t;
    if (dt > ap) break;
    if (n.judged) continue;
    const x = hx + dt * pps;
    if (x < hx - bh * 1.2) continue;
    const r = bh * .3 * (n.big ? 1.42 : 1);
    const col = ACTIONS[n.type].color;
    ctx.save();
    ctx.shadowColor = col; ctx.shadowBlur = n.big ? 22 : 12;
    const ng = ctx.createRadialGradient(x - r * .3, y - r * .35, r * .15, x, y, r);
    if (n.type === 'don') {
      ng.addColorStop(0, '#ffd9c0'); ng.addColorStop(.55, col); ng.addColorStop(1, '#c93a1e');
    } else {
      ng.addColorStop(0, '#e6fbff'); ng.addColorStop(.55, col); ng.addColorStop(1, '#177f9e');
    }
    ctx.fillStyle = ng;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,.9)';
    ctx.lineWidth = n.big ? 3.5 : 2.5;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    if (n.big) {
      ctx.strokeStyle = hexA('#ffc94d', .9);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, r + 5, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.95)';
      ctx.font = `900 ${r * .8}px "Microsoft YaHei", sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('双', x, y + 1);
      ctx.textBaseline = 'alphabetic';
    }
    ctx.restore();
  }
  ctx.restore();

  /* 太鼓本体 */
  const R = bh * .68;
  ctx.save();
  ctx.translate(hx, y);
  const sc = 1 + G.flash.don * .05 + G.pulse * .02;
  ctx.scale(sc, sc);
  ctx.fillStyle = 'rgba(0,0,0,.4)';
  ctx.beginPath(); ctx.ellipse(0, R * .8, R * 1.05, R * .22, 0, 0, Math.PI * 2); ctx.fill();
  const rim = ctx.createRadialGradient(-R * .3, -R * .3, R * .2, 0, 0, R);
  rim.addColorStop(0, '#b07a4a'); rim.addColorStop(1, '#5f3d22');
  ctx.fillStyle = rim;
  ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
  if (G.flash.ka > 0) {
    ctx.strokeStyle = hexA('#4de3ff', G.flash.ka * .9);
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(0, 0, R - 3, 0, Math.PI * 2); ctx.stroke();
  }
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2;
    ctx.fillStyle = '#e8d7b0';
    ctx.beginPath(); ctx.arc(Math.cos(a) * R * .88, Math.sin(a) * R * .88, 2.6, 0, Math.PI * 2); ctx.fill();
  }
  const face = ctx.createRadialGradient(-R * .2, -R * .25, R * .1, 0, 0, R * .72);
  face.addColorStop(0, '#fff6e8'); face.addColorStop(1, '#f0d9b8');
  ctx.fillStyle = face;
  ctx.beginPath(); ctx.arc(0, 0, R * .72, 0, Math.PI * 2); ctx.fill();
  if (G.flash.don > 0) {
    ctx.fillStyle = hexA('#ff7a45', G.flash.don * .55);
    ctx.beginPath(); ctx.arc(0, 0, R * .72, 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(120,80,40,.5)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, R * .72, 0, Math.PI * 2); ctx.stroke();
  /* 鼓面纹：三巴 */
  ctx.fillStyle = 'rgba(201,55,115,.75)';
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * Math.PI * 2 + now * .2;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * R * .3, Math.sin(a) * R * .3, R * .16, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  /* 鼓槌 */
  [[-1, 'don'], [1, 'ka']].forEach(([dir, type]) => {
    const f = G.flash[type];
    const rest = -1.05, strike = -.25;
    const ang = lerp(rest, strike, f) * dir;
    const px = clamp(hx + dir * R * 1.15, 12, W - 12), py = y - R * 1.5;
    const tx = px + Math.sin(ang) * R * 1.5 * dir, ty = py + Math.cos(ang) * R * 1.5;
    ctx.save();
    ctx.strokeStyle = '#e8d7b0'; ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(tx, ty); ctx.stroke();
    ctx.strokeStyle = hexA(ACTIONS[type].color, .35 + f * .6); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(tx, ty); ctx.stroke();
    ctx.restore();
  });

  /* 键位提示（鼓下方） */
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = `900 ${Math.max(12, bh * .18)}px "Microsoft YaHei", sans-serif`;
  ctx.fillStyle = hexA('#ff7a45', .95);
  ctx.fillText('咚 F/J', Math.max(hx - R * 1.1, 34), y + R + Math.max(18, bh * .3));
  ctx.fillStyle = hexA('#4de3ff', .95);
  ctx.fillText('咔 D/K', Math.min(hx + R * 1.1, W - 34), y + R + Math.max(18, bh * .3));
  ctx.restore();
}

function drawCrowd(now) {
  ctx.save();
  for (const c of crowd) {
    ctx.fillStyle = '#070512';
    ctx.beginPath(); ctx.arc(c.x, c.y + 14, c.r, Math.PI, 0); ctx.fill();
    const wave = Math.sin(now * (G.fever ? 5 : 2.2) + c.ph) * .5;
    const tx = c.x + c.r * .8 + wave * 8, ty = c.y - c.r * .9 - Math.abs(wave) * 6;
    ctx.strokeStyle = 'rgba(20,14,40,.9)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(c.x + c.r * .5, c.y + 6); ctx.lineTo(tx, ty); ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = hexA(c.c, .8);
    ctx.beginPath(); ctx.arc(tx, ty, 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = hexA(c.c, .22);
    ctx.beginPath(); ctx.arc(tx, ty, 6, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();
}

function drawParticles() {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const p of G.particles) {
    const k = 1 - p.age / p.life;
    if (p.confetti) {
      ctx.save();
      ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.globalAlpha = k;
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    } else {
      ctx.globalAlpha = k;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * k, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}

function drawPopup() {
  if (!G.popup) return;
  const p = G.popup;
  const k = p.age / .55;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.globalAlpha = 1 - k * k;
  ctx.font = `900 italic ${Math.max(18, L.bandH * (p.big ? .34 : .26))}px "Microsoft YaHei", sans-serif`;
  ctx.fillStyle = p.color;
  ctx.shadowColor = p.color; ctx.shadowBlur = 12;
  ctx.fillText(p.text, L.hitX, L.bandY - L.bandH * .95 - k * 30);
  ctx.restore();
}

function drawCombo() {
  if (G.combo < 3) return;
  const punch = 1 + .3 * Math.exp(-G.comboAge * 9);
  ctx.save();
  ctx.translate(W * .62, L.bandY - L.bandH * 1.25);
  ctx.scale(punch, punch);
  ctx.textAlign = 'center';
  ctx.font = `900 italic ${Math.min(52, W * .07)}px "Microsoft YaHei", sans-serif`;
  ctx.fillStyle = G.fever ? '#ffc94d' : '#ffffff';
  ctx.shadowColor = G.fever ? '#ffc94d' : '#8aa4ff';
  ctx.shadowBlur = 18;
  ctx.fillText(G.combo, 0, 0);
  ctx.font = `900 ${Math.min(14, W * .02)}px "Microsoft YaHei", sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,.75)';
  ctx.shadowBlur = 6;
  ctx.fillText('COMBO', 0, 20);
  ctx.restore();
}

/* ── HUD ── */
function updateHUD() {
  if (G.state !== 'playing' && G.state !== 'paused') return;
  el.hudScore.textContent = G.score.toLocaleString();
  el.hudAcc.textContent = (accuracy() * 100).toFixed(2) + '%';
  const prog = G.comp ? clamp(G.songTime / G.comp.songEnd, 0, 1) : 0;
  el.hudProg.style.width = (prog * 100) + '%';
  el.hypeFill.style.width = G.hype + '%';
  const st = el.hypeState;
  if (G.fever) { st.textContent = 'ENCORE!'; st.className = 'hype-state hot'; }
  else if (G.hype <= 0) { st.textContent = '冷场…'; st.className = 'hype-state cold'; }
  else if (G.hype >= 75) { st.textContent = '沸腾'; st.className = 'hype-state hot'; }
  else { st.textContent = 'READY'; st.className = 'hype-state'; }
  const t = G.songTime;
  let cd = '';
  if (t < .8) cd = 'READY';
  else if (t < 1.5) cd = 'GO!';
  if (cd !== G.cdText) {
    G.cdText = cd;
    if (cd) {
      el.countdown.textContent = cd;
      el.countdown.classList.remove('hidden', 'tick');
      void el.countdown.offsetWidth;
      el.countdown.classList.add('tick');
      AudioEngine.countdown(cd === 'GO!');
    } else el.countdown.classList.add('hidden');
  }
}

/* ── 主循环 ── */
let lastFrame = performance.now();
function loop(nowMs) {
  requestAnimationFrame(loop);
  const now = nowMs / 1000;
  const dt = Math.min(.05, (nowMs - lastFrame) / 1000);
  lastFrame = nowMs;
  if (G.state === 'playing') update(dt);
  if (G.state === 'playing' || G.state === 'paused' || G.state === 'result') {
    render(now);
    updateHUD();
  }
  if (G.state === 'result' && G.resAnim) {
    const k = clamp((nowMs - G.resAnim.t0) / G.resAnim.dur, 0, 1);
    const eased = 1 - Math.pow(1 - k, 3);
    el.resScore.textContent = Math.round(G.resAnim.to * eased).toLocaleString();
    if (k >= 1) G.resAnim = null;
  }
}

/* ── 输入 ── */
const KEY_ACTION = {};
Object.entries(ACTIONS).forEach(([type, a]) => a.keys.forEach(k => KEY_ACTION[k] = type));

window.addEventListener('keydown', e => {
  if (e.repeat) return;
  if (e.code === 'KeyM') { toggleMute(); return; }
  if (G.state === 'select') {
    if (e.code === 'Enter') { e.preventDefault(); startGame(); }
    return;
  }
  if (e.code === 'KeyP' || e.code === 'Escape') {
    e.preventDefault();
    if (G.state === 'result') { if (e.code === 'Escape') quitToSelect(); return; }
    togglePause();
    return;
  }
  if (e.code === 'KeyR') {
    e.preventDefault();
    if (G.state === 'playing' || G.state === 'paused' || G.state === 'result') startGame();
    return;
  }
  if (G.state === 'playing' && e.code in KEY_ACTION) {
    e.preventDefault();
    G.heldKeys.add(e.code);
    judge(KEY_ACTION[e.code]);
  }
});
window.addEventListener('keyup', e => { G.heldKeys.delete(e.code); });

const activePointers = new Map();
el.canvas.addEventListener('pointerdown', e => {
  if (G.state !== 'playing') return;
  e.preventDefault();
  const rect = el.canvas.getBoundingClientRect();
  const type = (e.clientX - rect.left) < rect.width / 2 ? 'don' : 'ka';
  activePointers.set(e.pointerId, type);
  G.touchHeld[type]++;
  judge(type);
});
function releasePointer(e) {
  const type = activePointers.get(e.pointerId);
  if (type) { G.touchHeld[type] = Math.max(0, G.touchHeld[type] - 1); activePointers.delete(e.pointerId); }
}
el.canvas.addEventListener('pointerup', releasePointer);
el.canvas.addEventListener('pointercancel', releasePointer);
el.canvas.addEventListener('contextmenu', e => e.preventDefault());

document.addEventListener('visibilitychange', () => {
  if (document.hidden && G.state === 'playing') togglePause();
});
window.addEventListener('blur', () => { if (G.state === 'playing') togglePause(); });
window.addEventListener('resize', () => { if (G.state !== 'select') resize(); });

/* ── 控件 ── */
function toggleMute() {
  save.muted = !save.muted; persist();
  AudioEngine.ensure();
  syncSettingsUI();
}
el.muteSel.addEventListener('click', toggleMute);
el.muteGame.addEventListener('click', toggleMute);
el.btnPause.addEventListener('click', () => { if (G.state === 'playing' || G.state === 'paused') togglePause(); });
el.btnStart.addEventListener('click', () => { AudioEngine.uiClick(); startGame(); });
el.btnResume.addEventListener('click', () => { AudioEngine.uiClick(); togglePause(); });
el.btnRestartP.addEventListener('click', () => { AudioEngine.uiClick(); startGame(); });
el.btnQuitP.addEventListener('click', () => { AudioEngine.uiBack(); quitToSelect(); });
el.btnRetry.addEventListener('click', () => { AudioEngine.uiClick(); startGame(); });
el.btnBack.addEventListener('click', () => { AudioEngine.uiBack(); quitToSelect(); });

[...el.segDiff.children].forEach(b => b.addEventListener('click', () => {
  save.diff = b.dataset.diff; persist();
  AudioEngine.uiClick();
  refreshSelect();
}));

el.slSpeed.addEventListener('input', () => {
  save.speed = +el.slSpeed.value / 10; persist();
  el.valSpeed.textContent = save.speed.toFixed(1) + '×';
});
function bindOffset(slider) {
  slider.addEventListener('input', () => {
    save.offset = +slider.value; persist();
    const txt = (save.offset > 0 ? '+' : '') + save.offset + 'ms';
    el.valOffset.textContent = txt; el.valOffsetP.textContent = txt;
    el.slOffset.value = save.offset; el.slOffsetP.value = save.offset;
  });
}
bindOffset(el.slOffset); bindOffset(el.slOffsetP);
function bindVolume(slider) {
  slider.addEventListener('input', () => {
    save.volume = +slider.value; persist();
    el.valVolume.textContent = save.volume; el.valVolumeP.textContent = save.volume;
    el.slVolume.value = save.volume; el.slVolumeP.value = save.volume;
    AudioEngine.ensure();
    AudioEngine.setVolume(save.volume / 100);
  });
}
bindVolume(el.slVolume); bindVolume(el.slVolumeP);

/* ── 启动 ── */
loadFaces();
buildSongCards();
buildKeyGuide();
syncSettingsUI();
refreshSelect();
resize();
requestAnimationFrame(loop);

/* 调试/测试入口 */
window.ENCORE = { G, AudioEngine, SONGS, MEMBERS, ACTIONS, buildChart, compileSong, startGame, judge, save, render, update, resize, accuracy, rankOf };

/* 调试参数：?auto=1&song=0&diff=EZ&play=1（自动开局 / 自动演奏演示） */
const qp = new URLSearchParams(location.search);
if (qp.has('silent')) AudioEngine._silent = true;
if (qp.has('auto')) {
  save.songIdx = clamp(parseInt(qp.get('song') || '0', 10) || 0, 0, SONGS.length - 1);
  if (['EZ', 'NM', 'HD'].includes(qp.get('diff'))) save.diff = qp.get('diff');
  startGame();
  if (qp.has('play')) {
    setInterval(() => {
      if (G.state !== 'playing') return;
      const t = AudioEngine.songTime() - save.offset / 1000;
      for (let i = G.ni; i < G.notes.length; i++) {
        const n = G.notes[i];
        if (n.t > t + .02) break;
        if (!n.judged && Math.abs(n.t - t) <= .045) {
          if (n.big) { G.heldKeys.add('KeyF'); G.heldKeys.add('KeyJ'); G.heldKeys.add('KeyD'); G.heldKeys.add('KeyK'); }
          judge(n.type);
          if (n.big) setTimeout(() => G.heldKeys.clear(), 60);
        }
      }
    }, 8);
  }
}