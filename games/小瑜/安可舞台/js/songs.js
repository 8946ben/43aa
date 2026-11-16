/* ═══════════ 安可舞台 · 曲目与谱面 ═══════════
 * 三首原创合成曲目。旋律事件同时驱动音乐与谱面，保证音画同步。
 * 乐理 DSL：deg 为音阶级数（7 进位 = 高八度），和弦 = [d, d+2, d+4]。
 */
'use strict';

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];

const SONGS = [
  {
    id: 'nightcruise', title: '夜航星', en: 'NIGHT CRUISE',
    desc: '巡演大巴驶过深夜的枝江，车窗外的星星一颗颗亮起来。温柔的慢板，适合第一次登台的你。',
    bpm: 96, root: 60, scale: MAJOR, color: 'eileen', face: 'eileen',
    phrases: [
      { chords: [0, 0, 5, 5], drums: 'soft', bass: 'root4',
        mel: [[0, 0, 2], [4, 2, 1], [6, 3, 1], [8, 4, 2], [12, 2, 1], [14, 1, 1]] },
      { chords: [0, 5, 3, 4], drums: 'pop', bass: 'root8',
        mel: [[0, 4, 1], [1, 3, .5], [1.5, 2, .5], [2, 0, 1.5], [4, 2, 1], [5, 3, .5], [5.5, 4, .5], [6, 5, 2], [8, 7, 1], [9, 5, .5], [9.5, 4, .5], [10, 3, 1], [11, 2, 1], [12, 1, 1.5], [14, 0, 2]] },
      { chords: [0, 5, 3, 4], drums: 'pop', bass: 'root8',
        mel: [[0, 0, 1], [1, 2, .5], [1.5, 3, .5], [2, 4, 1.5], [4, 5, 1], [5, 4, .5], [5.5, 3, .5], [6, 2, 2], [8, 4, 1], [9, 3, .5], [9.5, 2, .5], [10, 0, 1], [11, 1, 1], [12, 2, 1.5], [14, 0, 2]] },
      { chords: [3, 4, 0, 5], drums: 'drive', bass: 'oct',
        mel: [[0, 5, 1], [1, 4, .5], [1.5, 3, .5], [2, 4, 1], [3, 5, 1], [4, 7, 1.5], [6, 5, .5], [6.5, 4, .5], [7, 3, 1], [8, 2, 1], [9, 3, .5], [9.5, 4, .5], [10, 5, 1.5], [12, 4, 1], [13, 3, 1], [14, 2, 2]] },
      { chords: [0, 4, 5, 3], drums: 'drive', bass: 'oct', arp: true, crash: true,
        mel: [[0, 7, 1.5], [2, 5, .5], [2.5, 4, .5], [3, 5, 1], [4, 4, 1.5], [6, 3, .5], [6.5, 2, .5], [7, 3, 1], [8, 5, 1], [9, 4, .5], [9.5, 3, .5], [10, 2, 1], [11, 0, 1], [12, 2, 1.5], [14, 4, 2]] },
      { chords: [0, 4, 5, 3], drums: 'drive', bass: 'oct', arp: true,
        mel: [[0, 9, 1.5], [2, 7, .5], [2.5, 5, .5], [3, 7, 1], [4, 7, 1.5], [6, 5, .5], [6.5, 4, .5], [7, 5, 1], [8, 7, 1], [9, 5, .5], [9.5, 4, .5], [10, 3, 1], [11, 2, 1], [12, 4, 1.5], [14, 7, 2]] },
      { chords: [0, 0, 0, 0], drums: 'soft', bass: 'root4', crash: true,
        mel: [[0, 2, 2], [4, 1, 1], [6, 0, 1], [8, 0, 4], [12, 7, 3]] },
    ],
  },
  {
    id: 'heartsignal', title: '心动信号', en: 'HEART SIGNAL',
    desc: '直播间弹幕刷成一片粉色海洋，心跳和底鼓踩在同一个拍子上。四踩地板的舞曲节奏，副歌记得跟着挥手！',
    bpm: 128, root: 60, scale: MAJOR, color: 'diana', face: 'diana',
    phrases: [
      { chords: [5, 3, 0, 4], drums: 'four', bass: 'oct', arp: true,
        mel: [[0, 7, .5], [.5, 5, .5], [1, 4, .5], [1.5, 5, .5], [2, 7, 1], [4, 5, .5], [4.5, 4, .5], [5, 3, .5], [5.5, 4, .5], [6, 5, 1], [8, 4, .5], [8.5, 3, .5], [9, 2, .5], [9.5, 3, .5], [10, 4, 1], [12, 2, .5], [12.5, 1, .5], [13, 0, 1.5]] },
      { chords: [5, 3, 0, 4], drums: 'four', bass: 'oct',
        mel: [[0, 0, .5], [.5, 0, .5], [1, 2, .5], [2, 3, 1], [3, 2, .5], [3.5, 0, .5], [4, 4, 1.5], [6, 3, .5], [6.5, 2, .5], [7, 0, 1], [8, 0, .5], [8.5, 2, .5], [9, 3, .5], [9.5, 4, .5], [10, 5, 1.5], [12, 4, .5], [12.5, 3, .5], [13, 2, .5], [13.5, 1, .5], [14, 0, 2]] },
      { chords: [5, 3, 0, 4], drums: 'four', bass: 'oct',
        mel: [[0, 0, .5], [.5, 0, .5], [1, 2, .5], [2, 3, 1], [3, 4, .5], [3.5, 5, .5], [4, 7, 1.5], [6, 5, .5], [6.5, 4, .5], [7, 3, 1], [8, 2, .5], [8.5, 3, .5], [9, 4, .5], [9.5, 5, .5], [10, 4, 1], [11, 3, 1], [12, 2, 1.5], [14, 0, 2]] },
      { chords: [3, 4, 3, 4], drums: 'build', bass: 'root8',
        mel: [[0, 5, 1], [2, 4, 1], [4, 3, 1], [6, 2, 1], [8, 5, 1], [10, 7, 1], [12, 8, .5], [12.5, 7, .5], [13, 5, .5], [13.5, 4, .5], [14, 2, 1], [15, 4, 1]] },
      { chords: [0, 4, 5, 3], drums: 'drive', bass: 'oct', arp: true, crash: true,
        mel: [[0, 7, .5], [.5, 7, .5], [1, 5, .5], [1.5, 4, .5], [2, 5, 1], [3, 7, .5], [3.5, 5, .5], [4, 4, .5], [4.5, 4, .5], [5, 2, .5], [5.5, 4, .5], [6, 5, 1.5], [8, 5, .5], [8.5, 5, .5], [9, 4, .5], [9.5, 3, .5], [10, 4, 1], [11, 2, .5], [11.5, 0, .5], [12, 2, .5], [12.5, 4, .5], [13, 5, 1], [14, 7, 2]] },
      { chords: [0, 4, 5, 3], drums: 'drive', bass: 'oct', arp: true,
        mel: [[0, 9, .5], [.5, 7, .5], [1, 5, .5], [1.5, 7, .5], [2, 9, 1], [3, 7, .5], [3.5, 5, .5], [4, 7, .5], [4.5, 7, .5], [5, 5, .5], [5.5, 4, .5], [6, 5, 1.5], [8, 4, .5], [8.5, 5, .5], [9, 7, .5], [9.5, 5, .5], [10, 4, 1], [11, 3, .5], [11.5, 2, .5], [12, 0, 1], [13, 2, 1], [14, 4, 2]] },
      { chords: [3, 3, 5, 5], drums: 'half', bass: 'root4',
        mel: [[0, 3, 2], [4, 2, 1], [6, 0, 1], [8, 2, 2], [12, 0, 3]] },
      { chords: [0, 4, 5, 3], drums: 'drive', bass: 'oct', arp: true, crash: true,
        mel: [[0, 7, .5], [.5, 9, .5], [1, 7, .5], [1.5, 5, .5], [2, 7, 1], [3, 9, .5], [3.5, 7, .5], [4, 9, 1], [5, 7, .5], [5.5, 5, .5], [6, 4, 1.5], [8, 5, .5], [8.5, 7, .5], [9, 9, .5], [9.5, 7, .5], [10, 5, 1], [11, 4, .5], [11.5, 2, .5], [12, 4, .5], [12.5, 5, .5], [13, 7, 1], [14, 9, 2]] },
      { chords: [0, 0, 0, 0], drums: 'soft', bass: 'root4', crash: true,
        mel: [[0, 7, 1], [2, 5, 1], [4, 4, 1], [6, 2, 1], [8, 0, 4]] },
    ],
  },
  {
    id: 'infiniteencore', title: '无限安可', en: 'INFINITE ENCORE',
    desc: '灯牌暗下去又亮起来，「安可」的喊声一浪高过一浪。160 BPM 的小调终曲，献给不肯散场的夜晚。',
    bpm: 160, root: 57, scale: MINOR, color: 'fiona', face: 'fiona',
    phrases: [
      { chords: [0, 5, 3, 4], drums: 'drive', bass: 'oct', crash: true,
        mel: [[0, 0, .5], [.5, 2, .5], [1, 3, .5], [1.5, 2, .5], [2, 0, .5], [2.5, 2, .5], [3, 3, 1], [4, 4, .5], [4.5, 3, .5], [5, 2, .5], [5.5, 0, .5], [6, 2, 1.5], [8, 0, .5], [8.5, 2, .5], [9, 3, .5], [9.5, 4, .5], [10, 5, 1], [11, 4, .5], [11.5, 3, .5], [12, 2, .5], [12.5, 3, .5], [13, 4, 1], [14, 3, .5], [14.5, 2, .5], [15, 0, 1]] },
      { chords: [0, 5, 3, 4], drums: 'drive', bass: 'oct',
        mel: [[0, 7, 1], [1, 5, .5], [1.5, 4, .5], [2, 3, 1], [3, 4, .5], [3.5, 5, .5], [4, 5, 1.5], [6, 4, .5], [6.5, 3, .5], [7, 2, 1], [8, 0, .5], [8.5, 2, .5], [9, 3, 1], [10, 2, .5], [10.5, 0, .5], [11, 2, 1], [12, 3, 1.5], [14, 2, 2]] },
      { chords: [0, 5, 3, 4], drums: 'drive', bass: 'oct',
        mel: [[0, 0, 1], [1, 2, .5], [1.5, 3, .5], [2, 4, 1], [3, 3, .5], [3.5, 2, .5], [4, 0, 1.5], [6, 2, .5], [6.5, 3, .5], [7, 4, 1], [8, 5, 1], [9, 4, .5], [9.5, 3, .5], [10, 2, 1], [11, 3, 1], [12, 4, 1.5], [14, 7, 2]] },
      { chords: [3, 4, 0, 0], drums: 'drive', bass: 'oct',
        mel: [[0, 3, .5], [.5, 4, .5], [1, 5, 1], [2, 4, .5], [2.5, 3, .5], [3, 2, 1], [4, 2, .5], [4.5, 3, .5], [5, 4, 1], [6, 3, .5], [6.5, 2, .5], [7, 0, 1], [8, 0, .5], [8.5, 2, .5], [9, 3, .5], [9.5, 4, .5], [10, 5, 1], [11, 4, .5], [11.5, 3, .5], [12, 2, 1.5], [14, 0, 2]] },
      { chords: [0, 5, 3, 4], drums: 'drive', bass: 'oct', arp: true, crash: true,
        mel: [[0, 7, 1], [1.5, 5, .5], [2, 4, 1], [3, 3, .5], [3.5, 4, .5], [4, 5, 1.5], [6, 7, .5], [6.5, 5, .5], [7, 4, 1], [8, 3, 1], [9, 4, .5], [9.5, 5, .5], [10, 7, 1.5], [12, 5, .5], [12.5, 4, .5], [13, 3, 1], [14, 2, 2]] },
      { chords: [0, 5, 3, 4], drums: 'drive', bass: 'oct', arp: true,
        mel: [[0, 9, 1], [1.5, 7, .5], [2, 5, 1], [3, 4, .5], [3.5, 5, .5], [4, 7, 1.5], [6, 9, .5], [6.5, 7, .5], [7, 5, 1], [8, 4, 1], [9, 5, .5], [9.5, 7, .5], [10, 9, 1.5], [12, 7, .5], [12.5, 5, .5], [13, 4, 1], [14, 7, 2]] },
      { chords: [0, 0, 5, 5], drums: 'break', bass: 'root4', arp: true,
        mel: [[0, 7, 2], [4, 5, 2], [8, 4, 2], [12, 5, 2]] },
      { chords: [3, 3, 4, 4], drums: 'build', bass: 'root8',
        mel: [[0, 3, .5], [.5, 4, .5], [1, 5, .5], [1.5, 4, .5], [2, 3, 1], [4, 2, .5], [4.5, 3, .5], [5, 4, .5], [5.5, 5, .5], [6, 7, 1], [8, 7, .5], [8.5, 5, .5], [9, 4, .5], [9.5, 3, .5], [10, 2, 1], [12, 4, 1], [13, 5, 1], [14, 7, 1], [15, 9, 1]] },
      { chords: [0, 5, 3, 4], drums: 'drive', bass: 'oct', arp: true, crash: true,
        mel: [[0, 9, 1], [1.5, 7, .5], [2, 5, 1], [3, 4, .5], [3.5, 5, .5], [4, 7, 1.5], [6, 9, .5], [6.5, 7, .5], [7, 5, 1], [8, 4, 1], [9, 5, .5], [9.5, 7, .5], [10, 9, 1.5], [12, 7, .5], [12.5, 5, .5], [13, 4, 1], [14, 7, 2]] },
      { chords: [0, 5, 3, 4], drums: 'drive', bass: 'oct', arp: true,
        mel: [[0, 7, .5], [.5, 9, .5], [1, 7, .5], [1.5, 5, .5], [2, 4, 1], [3, 5, .5], [3.5, 7, .5], [4, 9, 1.5], [6, 7, .5], [6.5, 5, .5], [7, 4, 1], [8, 5, 1], [9, 7, .5], [9.5, 9, .5], [10, 11, 1.5], [12, 9, .5], [12.5, 7, .5], [13, 5, 1], [14, 7, 2]] },
      { chords: [0, 0, 0, 0], drums: 'pop', bass: 'root4', crash: true,
        mel: [[0, 7, 1], [2, 5, 1], [4, 4, 1], [6, 2, 1], [8, 0, 6]] },
    ],
  },
];

/* ── 鼓组（16 步/小节）── */
const DRUMS = {
  soft:  { kick: [0, 8], snare: [], hat: [0, 2, 4, 6, 8, 10, 12, 14], ohat: [] },
  pop:   { kick: [0, 8, 10], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], ohat: [14] },
  four:  { kick: [0, 4, 8, 12], snare: [4, 12], hat: [2, 6, 10, 14], ohat: [] },
  drive: { kick: [0, 3, 8, 11], snare: [4, 12], hat: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], ohat: [14] },
  half:  { kick: [0, 10], snare: [8], hat: [0, 4, 8, 12], ohat: [] },
  break: { kick: [0], snare: [12], hat: [4, 8], ohat: [] },
};

function drumEvents(pattern, t0, spb, out, barInPhrase) {
  const step = spb / 4;
  if (pattern === 'build') {
    const prog = barInPhrase / 4;
    for (let s = 0; s < 16; s++) {
      const isLastBar = barInPhrase === 3;
      if (s % (isLastBar ? 1 : 2) === 0) {
        out.push({ t: t0 + s * step, kind: 'snare', vel: .22 + .7 * (prog + s / 64), step: s, bar: barInPhrase });
      }
    }
    [0, 8].forEach(s => out.push({ t: t0 + s * step, kind: 'kick', vel: .9, step: s, bar: barInPhrase }));
    return;
  }
  const p = DRUMS[pattern] || DRUMS.pop;
  p.kick.forEach(s => out.push({ t: t0 + s * step, kind: 'kick', vel: s % 4 === 0 ? 1 : .8, step: s, bar: barInPhrase }));
  p.snare.forEach(s => out.push({ t: t0 + s * step, kind: 'snare', vel: .85, step: s, bar: barInPhrase }));
  p.hat.forEach(s => out.push({ t: t0 + s * step, kind: 'hat', vel: s % 4 === 0 ? .5 : .3, step: s, bar: barInPhrase }));
  p.ohat.forEach(s => out.push({ t: t0 + s * step, kind: 'ohat', vel: .4, step: s, bar: barInPhrase }));
}

function bassEvents(pattern, t0, spb, cd, out) {
  const push = (beat, deg, dur, vel) => out.push({ t: t0 + beat * spb, kind: 'bass', deg, dur: dur * spb, vel });
  if (pattern === 'root4') { push(0, cd, 1.8, .9); push(2, cd, 1.8, .7); }
  else if (pattern === 'root8') { for (let i = 0; i < 8; i++) push(i * .5, i === 7 ? cd + 7 : cd, .45, i % 4 === 0 ? .9 : .6); }
  else if (pattern === 'oct') { for (let i = 0; i < 8; i++) push(i * .5, i % 2 ? cd + 7 : cd, .4, i % 4 === 0 ? .9 : .65); }
  else { push(0, cd, .9, .9); push(1, cd + 4, .9, .6); push(2, cd, .9, .8); push(3, cd + 5, .9, .6); }
}

const _compCache = {};
function compileSong(song) {
  if (_compCache[song.id]) return _compCache[song.id];
  const spb = 60 / song.bpm;
  const events = [];
  song.phrases.forEach((ph, pi) => {
    const base = pi * 16 * spb;
    for (let b = 0; b < 4; b++) {
      const t0 = base + b * 4 * spb;
      const cd = ph.chords[b];
      events.push({ t: t0, kind: 'pad', degs: [cd, cd + 2, cd + 4], dur: 4 * spb, vel: .42 });
      bassEvents(ph.bass, t0, spb, cd, events);
      drumEvents(ph.drums, t0, spb, events, b);
      if (ph.arp) {
        const tones = [cd, cd + 2, cd + 4, cd + 7];
        const seq = [0, 1, 2, 3, 2, 1];
        for (let s = 0; s < 16; s++) {
          events.push({ t: t0 + s * spb / 4, kind: 'arp', deg: tones[seq[s % 6]] + 7, dur: spb / 4 * .8, vel: s % 4 === 0 ? .4 : .26 });
        }
      }
    }
    ph.mel.forEach(([bt, d, len]) => events.push({ t: base + bt * spb, kind: 'lead', deg: d, dur: len * spb, vel: 1, beat: bt }));
    if (ph.crash) events.push({ t: base, kind: 'crash', vel: .5 });
  });
  const songEnd = song.phrases.length * 16 * spb;
  events.push({ t: songEnd, kind: 'crash', vel: .6 });
  events.sort((a, b) => a.t - b.t);
  const comp = { events, spb, duration: songEnd + 2.5, songEnd };
  _compCache[song.id] = comp;
  return comp;
}

/* ── 谱面：太鼓式单轨，由旋律/鼓事件确定性生成 ──
 * don=鼓面（正拍/主旋律重音），ka=鼓边（反拍/军鼓），crash=大音符。
 */
const _chartCache = {};
function buildChart(song, diff) {
  const key = song.id + '_' + diff;
  if (_chartCache[key]) return _chartCache[key];
  const comp = compileSong(song);
  const cand = [];
  comp.events.forEach(e => {
    if (e.kind === 'lead') {
      if (diff === 'EZ' && e.beat % 1 !== 0) return;
      cand.push({ t: e.t, type: e.beat % 1 === 0 ? 'don' : 'ka' });
    } else if (e.kind === 'snare' && e.step % 4 === 0) {
      cand.push({ t: e.t, type: 'ka' });
    } else if (diff === 'HD' && e.kind === 'hat' && e.step % 2 === 0) {
      cand.push({ t: e.t, type: (e.step / 2) % 2 === 0 ? 'don' : 'ka' });
    } else if (e.kind === 'crash') {
      cand.push({ t: e.t, type: 'don', big: true });
    }
  });
  cand.sort((a, b) => a.t - b.t);

  const minGap = diff === 'EZ' ? .3 : diff === 'NM' ? .18 : .12;
  const notes = [];
  let lastT = -9;
  const endLimit = comp.songEnd - 1.2;
  for (const c of cand) {
    if (c.t < 1.8 || c.t > endLimit) continue;
    const gap = c.big || (notes.length && notes[notes.length - 1].big) ? Math.max(minGap, .32) : minGap;
    if (c.t - lastT < gap) continue;
    lastT = c.t;
    notes.push({ t: c.t, type: c.type, big: !!c.big });
  }
  _chartCache[key] = notes;
  return notes;
}

function songDuration(song) { return compileSong(song).duration; }
function noteCounts(song) {
  return { EZ: buildChart(song, 'EZ').length, NM: buildChart(song, 'NM').length, HD: buildChart(song, 'HD').length };
}