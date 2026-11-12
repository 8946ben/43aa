/* ============================================================
 * 加练魔塔 —— 引擎层（js/game.js）
 * canvas 渲染 / 键盘输入 / 确定性战斗 / 三主角被动 / 自动存档 / WebAudio 音效
 * 依赖 js/data.js，需在其后引入。无 ES module，file:// 直接可玩。
 * ============================================================ */

'use strict';

/* ==================== 字符 → 实体映射 ==================== */
/* 小怪字符（撞上弹战斗确认框） */
const MON_CHAR = {
  a: 'slime', c: 'bat', d: 'sophist', e: 'hater', f: 'dataworker',
  g: 'lazybone', h: 'crawler', i: 'jelly', j: 'nihility', k: 'slothling',
};
/* NPC / 事件字符（撞上触发剧情；守关者先对话再战斗） */
const NPC_CHAR = { Q: 1, W: 1, F: 1, G: 1, N: 1, V: 1, M: 1, T: 1 };

/* ==================== 全局状态 ==================== */
const S = {
  mode: 'title',            // title / play / dead / ending
  overlay: null,            // 当前覆盖层: dialog/battle/anim/shop/book/pause/jump/dead/end
  member: 'bella',          // 当前主角: bella / diana / eileen（MEMBERS 键）
  floor: 1, x: 1, y: 1,     // 玩家位置
  hp: 0, atk: 0, def: 0, coins: 0,
  keys: { y: 0, b: 0, r: 0 },
  bombs: 0,
  shopN: { atk: 0, def: 0, hp: 0 },   // 商店各类购买次数（价格递增）
  floors: {},               // 每层动态状态: { taken:{}, dead:{}, done:{} }
  flags: {},                // 一次性剧情标记
  met: {},                  // 图鉴已遇怪物
  maxFloor: 1,              // 已到达最高层（楼层跳跃用）
  kills: 0, steps: 0,
  log: [],                  // 消息日志
  snap: null,               // 进入当前层时的快照（死亡回档用）
  win: false,
};

const CV_W = 728, CV_H = 640;
const CELL = TOWER_CFG.cell;
const MAP_X = 0, MAP_Y = Math.floor((CV_H - TOWER_CFG.rows * CELL) / 2);

let ctx = null;
let muted = false;
let battleAnimTimer = null;

/* 图片缓存（表情包头像；加载失败自动回退几何绘制） */
const IMG = {};
function loadImg(src) {
  if (!src || IMG[src] !== undefined) return IMG[src];
  const im = new Image();
  im.onerror = () => { IMG[src] = null; };
  im.src = src;
  IMG[src] = im;
  return im;
}
/* 预加载：三主角全部立绘/头像 + 剧情用表情包 */
Object.values(MEMBERS).forEach(m =>
  ['imgCard', 'imgTalk', 'imgDead', 'imgCrown', 'imgHeart'].forEach(k => loadImg('assets/' + m[k] + '.png')));
['bella_hengheng', 'bella_bietoulan', 'bella_buhuiba', 'bella_jiayou',
 'bella_xiaohuahua', 'diana_jiayou', 'diana_liukoushui', 'diana_ganfan',
 'eileen_wink', 'eileen_taixihuanle',
 'acao_gongzuozhong', 'acao_yiwen', 'acao_kaixin', 'asoul_logo',
].forEach(n => loadImg('assets/' + n + '.png'));
loadImg('assets/fiona_gongshi.jpg');
loadImg('assets/sinuo_gongshi.jpg');

/* ==================== 音效（WebAudio 合成，无外部音频文件） ==================== */
let AC = null;
function audioInit() {
  if (!AC) {
    try { AC = new (window.AudioContext || window.webkitAudioContext)(); }
    catch (e) { AC = null; }
  }
  if (AC && AC.state === 'suspended') AC.resume();
}
function tone(freq, dur, type, vol, delay) {
  if (!AC || muted) return;
  type = type || 'square';
  vol = (vol === undefined ? 0.12 : vol);
  delay = delay || 0;
  const t0 = AC.currentTime + delay;
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g); g.connect(AC.destination);
  o.start(t0); o.stop(t0 + dur + 0.02);
}
function noiseHit(dur, vol, delay) {
  if (!AC || muted) return;
  dur = dur || 0.08; vol = (vol === undefined ? 0.2 : vol); delay = delay || 0;
  const t0 = AC.currentTime + delay;
  const len = Math.max(1, Math.floor(AC.sampleRate * dur));
  const buf = AC.createBuffer(1, len, AC.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = AC.createBufferSource(); src.buffer = buf;
  const g = AC.createGain(); g.gain.value = vol;
  src.connect(g); g.connect(AC.destination);
  src.start(t0);
}
function sfx(name) {
  if (!AC || muted) return;
  switch (name) {
    case 'move':    tone(220, 0.03, 'square', 0.025); break;
    case 'door':    tone(160, 0.12, 'sawtooth', 0.12); tone(110, 0.16, 'sawtooth', 0.10, 0.08); break;
    case 'locked':  tone(90, 0.12, 'square', 0.10); tone(70, 0.12, 'square', 0.10, 0.1); break;
    case 'pickup':  tone(660, 0.07, 'square', 0.10); tone(880, 0.07, 'square', 0.10, 0.06); tone(1320, 0.10, 'square', 0.10, 0.12); break;
    case 'hit':     noiseHit(0.07, 0.16); tone(140, 0.06, 'square', 0.07); break;
    case 'battle':  tone(196, 0.1, 'sawtooth', 0.10); tone(147, 0.14, 'sawtooth', 0.10, 0.09); break;
    case 'win':     tone(523, 0.09, 'square', 0.10); tone(659, 0.09, 'square', 0.10, 0.08); tone(784, 0.09, 'square', 0.10, 0.16); tone(1046, 0.18, 'square', 0.12, 0.24); break;
    case 'lose':    tone(330, 0.16, 'sawtooth', 0.12); tone(262, 0.16, 'sawtooth', 0.12, 0.14); tone(196, 0.28, 'sawtooth', 0.12, 0.28); break;
    case 'levelup': tone(523, 0.07, 'triangle', 0.12); tone(659, 0.07, 'triangle', 0.12, 0.05); tone(784, 0.07, 'triangle', 0.12, 0.10); tone(1046, 0.14, 'triangle', 0.12, 0.15); break;
    case 'bomb':    noiseHit(0.35, 0.3); tone(60, 0.3, 'sawtooth', 0.18); break;
    case 'select':  tone(880, 0.04, 'square', 0.06); break;
    case 'stairs':  tone(392, 0.08, 'triangle', 0.10); tone(523, 0.08, 'triangle', 0.10, 0.07); tone(659, 0.10, 'triangle', 0.10, 0.14); break;
    case 'crown':   [523, 659, 784, 1046, 784, 1046, 1318].forEach((fq, i) => tone(fq, 0.16, 'triangle', 0.12, i * 0.13)); break;
  }
}
/* 轻量 BGM：温和琶音循环（I-V-vi-IV），音量很低，M 键可全静音 */
const BGM_SEQ = [262, 330, 392, 330, 262, 330, 392, 523,
                 220, 262, 330, 262, 220, 262, 330, 440,
                 175, 220, 262, 220, 175, 220, 262, 349,
                 196, 247, 294, 247, 196, 247, 294, 392];
let bgmIdx = 0, bgmTimer = null;
function bgmStart() {
  if (bgmTimer) return;
  bgmTimer = setInterval(() => {
    if (!AC || muted || S.mode !== 'play') return;
    tone(BGM_SEQ[bgmIdx % BGM_SEQ.length], 0.22, 'triangle', 0.035);
    bgmIdx++;
  }, 320);
}
function bgmStop() { if (bgmTimer) { clearInterval(bgmTimer); bgmTimer = null; } }

/* ==================== 存档（localStorage，键 ptower_save_v2，含主角 member） ==================== */
function deepCopy(o) { return JSON.parse(JSON.stringify(o)); }
function save() {
  try {
    const d = {
      v: 2, member: S.member, floor: S.floor, x: S.x, y: S.y,
      hp: S.hp, atk: S.atk, def: S.def, coins: S.coins,
      keys: S.keys, bombs: S.bombs, shopN: S.shopN,
      floors: S.floors, flags: S.flags, met: S.met,
      maxFloor: S.maxFloor, kills: S.kills, steps: S.steps,
      log: S.log.slice(-30), win: S.win, snap: S.snap, ts: Date.now(),
    };
    localStorage.setItem(TOWER_CFG.saveKey, JSON.stringify(d));
  } catch (e) { /* 个别环境禁用 localStorage 时静默降级为不存档 */ }
}
function loadSave() {
  try {
    const raw = localStorage.getItem(TOWER_CFG.saveKey);
    if (!raw) return null;
    const d = JSON.parse(raw);
    // v2 起含主角字段；旧版 v1 存档不做迁移，直接视为无档
    if (!d || d.v !== 2 || !MEMBERS[d.member]) return null;
    return d;
  } catch (e) { return null; }
}
function clearSave() {
  try { localStorage.removeItem(TOWER_CFG.saveKey); } catch (e) { /* 忽略 */ }
}

/* ==================== 楼层动态状态 ==================== */
function floorState(f) {
  if (!S.floors[f]) S.floors[f] = { taken: {}, dead: {}, done: {} };
  return S.floors[f];
}
/** 读取当前格字符；已拾取/已击杀/已完成的实体格视为地板 */
function cellAt(f, r, c) {
  if (r < 0 || c < 0 || r >= TOWER_CFG.rows || c >= TOWER_CFG.cols) return '#';
  const ch = FLOORS[f - 1].map[r][c];
  const st = floorState(f);
  const k = r + ',' + c;
  if (st.taken[k] || st.dead[k] || st.done[k]) return '.';
  return ch;
}
function findStairs(f, ch) {
  const map = FLOORS[f - 1].map;
  for (let r = 0; r < TOWER_CFG.rows; r++)
    for (let c2 = 0; c2 < TOWER_CFG.cols; c2++)
      if (map[r][c2] === ch) return { r, c: c2 };
  return null;
}
function serializeState() {
  return {
    floor: S.floor, x: S.x, y: S.y,
    hp: S.hp, atk: S.atk, def: S.def, coins: S.coins,
    keys: deepCopy(S.keys), bombs: S.bombs, shopN: deepCopy(S.shopN),
    floors: deepCopy(S.floors), flags: deepCopy(S.flags),
    maxFloor: S.maxFloor, kills: S.kills,
  };
}
function restoreState(d) {
  S.floor = d.floor; S.x = d.x; S.y = d.y;
  S.hp = d.hp; S.atk = d.atk; S.def = d.def; S.coins = d.coins;
  S.keys = deepCopy(d.keys); S.bombs = d.bombs; S.shopN = deepCopy(d.shopN);
  S.floors = deepCopy(d.floors); S.flags = deepCopy(d.flags);
  S.maxFloor = d.maxFloor; S.kills = d.kills;
}
/** 进入某层：放到 D 楼梯处，记录层入口快照并自动存档 */
function enterFloor(f) {
  S.floor = f;
  const d = findStairs(f, 'D') || { r: 1, c: 1 };
  S.x = d.c; S.y = d.r;
  if (f > S.maxFloor) S.maxFloor = f;
  S.snap = serializeState();
  logMsg('—— ' + FLOORS[f - 1].name + ' ——');
  sfx('stairs');
  save();
  render();
}
/** 死亡重试：回到本层入口（属性与全塔进度回档到进层时刻） */
function retryFloor() {
  if (S.snap) restoreState(S.snap);
  const d = findStairs(S.floor, 'D') || { r: 1, c: 1 };
  S.x = d.c; S.y = d.r;
  S.snap = serializeState();
  logMsg('中场休息结束，从本层入口继续加练！');
  save(); render();
}

/* ==================== 消息日志 ==================== */
function logMsg(text, cls) {
  S.log.push({ t: text, c: cls || '' });
  if (S.log.length > 40) S.log.shift();
  renderSide();
}

/* ==================== 战斗数学（确定性，玩家先手） ==================== */
function battleCalc(monId) {
  const m = MONS[monId];
  let dp = Math.max(1, S.atk - m.def);
  if (S.member === 'eileen' && m.boss) {
    dp = Math.max(1, Math.floor(dp * 1.2));   // 乃琳被动「威慑」：对 BOSS 伤害 +20%
  }
  const de = Math.max(0, m.atk - S.def);
  const n = Math.ceil(m.hp / dp);
  const loss = de > 0 ? (n - 1) * de : 0;
  return { dp, de, n, loss };
}

/* ==================== 移动与交互 ==================== */
const DIRS = {
  ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
  KeyW: [0, -1], KeyS: [0, 1], KeyA: [-1, 0], KeyD: [1, 0],
};
function tryMove(dx, dy) {
  if (S.mode !== 'play' || S.overlay) return;
  const nr = S.y + dy, nc = S.x + dx;
  if (nr < 0 || nr >= TOWER_CFG.rows || nc < 0 || nc >= TOWER_CFG.cols) return;
  const ch = cellAt(S.floor, nr, nc);
  S.steps++;
  if (ch === '#') return;                                // 撞墙
  if (ch === 'y' || ch === 'b' || ch === 'r') { tryDoor(nr, nc, ch); return; }
  if (NPC_CHAR[ch]) { onNPC(ch, nr, nc); return; }       // NPC / 事件（含守关）
  if (MON_CHAR[ch]) { askBattle(MON_CHAR[ch], nr, nc, null); return; }  // 小怪
  if (ITEMS[ch]) { pickup(nr, nc, ch); return; }
  // 地面 / 楼梯
  S.x = nc; S.y = nr;
  sfx('move');
  if (ch === 'U') { if (S.floor < 21) enterFloor(S.floor + 1); return; }
  if (ch === 'D') { if (S.floor > 1) enterFloor(S.floor - 1); return; }
  render();
}
function tryDoor(r, c, ch) {
  const keyName = { y: 'y', b: 'b', r: 'r' }[ch];
  const keyZh = { y: '黄', b: '蓝', r: '红' }[ch];
  if (S.keys[keyName] > 0) {
    S.keys[keyName]--;
    floorState(S.floor).taken[r + ',' + c] = 1;
    sfx('door');
    logMsg('用' + keyZh + '钥匙打开了门。');
    save(); render();
  } else {
    sfx('locked');
    logMsg('门锁着——需要' + keyZh + '钥匙（练习室门禁卡）！', 'warn');
    render();
  }
}
function pickup(r, c, ch) {
  const def = ITEMS[ch];
  floorState(S.floor).taken[r + ',' + c] = 1;
  if (ch === 'o') {
    const amt = FLOORS[S.floor - 1].stack;
    S.coins += amt;
    logMsg('拾取【应援金】+' + amt + ' 应援金！');
  } else if (def.kind === 'key') {
    const keyName = { Y: 'y', Z: 'b', X: 'r' }[ch];
    S.keys[keyName]++;
    logMsg(def.msg);
  } else if (def.kind === 'atk') { S.atk += def.val; logMsg(def.msg, 'good'); }
  else if (def.kind === 'def') { S.def += def.val; logMsg(def.msg, 'good'); }
  else if (def.kind === 'both') { S.atk += def.val; S.def += def.val; logMsg(def.msg, 'good'); }
  else if (def.kind === 'hp') {
    // 嘉然被动「能量便当」：饮料类回复 ×1.5
    const v = S.member === 'diana' ? Math.floor(def.val * 1.5) : def.val;
    S.hp += v;
    logMsg(def.msg.replace(/体力 \+\d+/, '体力 +' + v) + (S.member === 'diana' ? '（能量便当 ×1.5）' : ''), 'good');
  }
  sfx('pickup');
  save(); render();
}

/* ==================== NPC / 事件 ==================== */
function onNPC(ch, r, c) {
  const npc = NPCS[ch];
  const st = floorState(S.floor);
  const k = r + ',' + c;
  if (npc.kind === 'shop') {
    openShop();
  } else if (npc.kind === 'gift') {
    if (st.done[k]) return;
    playDialog(STORIES.diana, () => {
      // 嘉然被动「能量便当」：便当回复 ×1.5
      const v = S.member === 'diana' ? Math.floor(DIANA_GIFT.hp * 1.5) : DIANA_GIFT.hp;
      S.hp += v;
      st.done[k] = 1;
      sfx('levelup');
      logMsg(DIANA_GIFT.msg.replace(/体力 \+\d+/, '体力 +' + v) + (S.member === 'diana' ? '（能量便当 ×1.5）' : ''), 'good');
      save(); render();
    });
  } else if (npc.kind === 'hint') {
    if (st.done[k]) return;
    const hint = FLOORS[S.floor - 1].hint || '加油呀，一个魂们都看着你呢！';
    playDialog([{ who: '阿草', img: 'assets/acao_gongzuozhong.png', color: '#8FBF6B', text: hint }], () => {
      st.done[k] = 1;
      sfx('select');
      save(); render();
    });
  } else if (npc.kind === 'guard') {
    if (st.dead[k]) return;
    askGuard(npc, r, c, k);
  } else if (npc.kind === 'goal') {
    if (st.dead['1,9']) {
      playDialog(STORIES.goal, () => showEnding());
    } else {
      logMsg('聚光灯没有电——先击败天台上的惰怠魔壬！', 'warn');
      render();
    }
  }
}
/* 守关：剧情 → 战斗确认 → 胜利 → 剧情 + 全属性加成 → 消失 */
function askGuard(npc, r, c, k) {
  const pre = STORIES[npc.mon + 'Pre'];
  const post = STORIES[npc.mon + 'Post'];
  playDialog(pre, () => {
    askBattle(npc.mon, r, c, () => {
      const buff = GUARD_BUFF[npc.mon];
      if (buff) { S.hp += buff.hp; S.atk += buff.atk; S.def += buff.def; }
      sfx('crown');
      playDialog(post, () => {
        logMsg(npc.name + '加入应援！体力+' + buff.hp + ' 舞力+' + buff.atk + ' 护体+' + buff.def, 'good');
        save(); render();
      });
    });
  });
}

/* ==================== 战斗确认框（含预览与炸弹） ==================== */
let pendingBattle = null;   // { mon, r, c, onWin }
function npcImgOf(monId) {
  if (monId === 'fiona') return 'assets/fiona_gongshi.jpg';
  if (monId === 'gladys') return 'assets/sinuo_gongshi.jpg';
  if (monId === 'mirror') return 'assets/bella_hengheng.png';
  return null;
}
function askBattle(monId, r, c, onWin) {
  const m = MONS[monId];
  const my = MEMBERS[S.member];
  S.met[monId] = 1;                       // 登记图鉴
  const cal = battleCalc(monId);
  pendingBattle = { mon: monId, r, c, onWin: onWin || null };
  const deadly = cal.loss >= S.hp;
  const risky = !deadly && cal.loss > S.hp * 0.4;
  const imgSrc = npcImgOf(monId);
  const monFace = imgSrc
    ? `<img class="b-img" src="${imgSrc}" alt="" onerror="this.outerHTML='<div class=\\'mono-face\\' style=\\'background:${m.color}\\'>${m.glyph}</div>'">`
    : `<div class="mono-face" style="background:${m.color}">${m.glyph}</div>`;
  openOverlay('battle', `
    <div class="panel battle-panel">
      <h3>${deadly ? '<span class="red">体力不足——此战必败！</span>' : '战斗预览'}</h3>
      <div class="battle-vs">
        <div class="b-col">
          <div class="b-face">${monFace}</div>
          <div class="b-name" style="color:${m.color}">${m.name}</div>
          <div class="b-stat">体力 ${m.hp} · 舞力 ${m.atk} · 护体 ${m.def}</div>
        </div>
        <div class="b-x">VS</div>
        <div class="b-col">
          <div class="b-face"><canvas class="face-cv" width="72" height="72"></canvas></div>
          <div class="b-name" style="color:${my.color}">${my.name}</div>
          <div class="b-stat">体力 ${S.hp} · 舞力 ${S.atk} · 护体 ${S.def}</div>
        </div>
      </div>
      <div class="battle-calc">
        <div>预计 <b>${cal.n}</b> 回合：每回合${my.name}打 <b>${cal.dp}</b>、被击 <b>${cal.de}</b></div>
        <div>预计损血：<b class="${deadly ? 'red' : risky ? 'warn' : 'good'}">${cal.loss}</b>
          ${deadly ? '' : '→ 战后约剩 <b>' + (S.hp - cal.loss) + '</b> 体力'}</div>
        <div class="quip">「${m.quip}」</div>
      </div>
      <div class="btn-row">
        <button id="bt-fight" class="primary">开战！</button>
        <button id="bt-bomb" ${S.bombs > 0 ? '' : 'disabled'}>用炸弹跳过（剩 ${S.bombs}）</button>
        <button id="bt-cancel">撤退</button>
      </div>
    </div>`);
  document.getElementById('bt-fight').onclick = () => {
    sfx('battle'); closeOverlay(); runBattle(monId, r, c);
  };
  document.getElementById('bt-bomb').onclick = () => {
    if (S.bombs <= 0) return;
    S.bombs--;
    sfx('bomb');
    floorState(S.floor).dead[r + ',' + c] = 1;
    logMsg('轰！【加练炸弹】炸飞了 ' + m.name + '（无伤跳过）', 'good');
    const cb = pendingBattle && pendingBattle.onWin;
    pendingBattle = null;
    closeOverlay();
    if (cb) cb(); else { save(); render(); }
  };
  document.getElementById('bt-cancel').onclick = () => { sfx('select'); closeOverlay(); };
  drawOverlayFaces();
}
function drawOverlayFaces() {
  const my = MEMBERS[S.member];
  document.querySelectorAll('#overlay canvas.face-cv').forEach(cv => {
    drawAvatar(cv.getContext('2d'), 36, 36, 30, 'assets/' + my.imgCard + '.png', my.color, my.name[0]);
  });
}

/* ==================== 战斗演出（确定性，可点击跳过） ==================== */
function runBattle(monId, r, c) {
  const m = MONS[monId];
  const my = MEMBERS[S.member];
  const cal = battleCalc(monId);
  const seq = [];
  let php = S.hp;
  for (let i = 0; i < cal.n; i++) {
    const pdmg = (i < cal.n - 1) ? cal.de : 0;    // 最后回合敌人倒下不再还手
    php -= pdmg;
    seq.push({ ehp: Math.max(0, m.hp - cal.dp * (i + 1)), pdmg, php: Math.max(0, php) });
    if (php <= 0) break;
  }
  const win = php > 0;
  let idx = -1, done = false;
  openOverlay('anim', `
    <div class="panel battle-panel">
      <h3>战斗中…… <span class="dim">（点击画面可跳过）</span></h3>
      <div class="battle-vs">
        <div class="b-col">
          <div class="b-name" style="color:${m.color}">${m.name}</div>
          <div class="bar"><div id="be-bar" class="bar-fill" style="width:100%;background:${m.color}"></div></div>
          <div id="be-hp" class="b-stat">${m.hp}</div>
        </div>
        <div class="b-x">VS</div>
        <div class="b-col">
          <div class="b-name" style="color:${my.color}">${my.name}</div>
          <div class="bar"><div id="bp-bar" class="bar-fill" style="width:100%;background:${my.color}"></div></div>
          <div id="bp-hp" class="b-stat">${S.hp}</div>
        </div>
      </div>
      <div id="battle-log" class="battle-log"></div>
    </div>`);
  const ov = document.getElementById('overlay');
  function finish() {
    if (done) return;
    done = true;
    if (battleAnimTimer) { clearTimeout(battleAnimTimer); battleAnimTimer = null; }
    ov.onclick = null;
    if (win) {
      S.hp = php;                                  // 与预览一致的确定性结算
      if (S.member === 'bella' && cal.loss === 0) {
        S.atk += 1;                                // 贝拉被动「带头加练」：预计无损获胜 → 舞力 +1
        logMsg('【带头加练】预计无损获胜，舞力 +1！', 'good');
      }
      S.coins += m.coin || 0;
      S.kills++;
      floorState(S.floor).dead[r + ',' + c] = 1;
      logMsg('击败了 ' + m.name + '！' + (m.coin ? '获得应援金 +' + m.coin : ''), 'good');
      const cb = pendingBattle && pendingBattle.onWin;
      pendingBattle = null;
      closeOverlay();
      save();
      if (cb) cb(); else { sfx('win'); render(); }
    } else {
      S.hp = 0;
      pendingBattle = null;
      closeOverlay();
      onDeath();
    }
  }
  function step() {
    idx++;
    if (idx >= seq.length) { finish(); return; }
    const fr = seq[idx];
    document.getElementById('be-bar').style.width = Math.max(0, fr.ehp / m.hp * 100) + '%';
    document.getElementById('be-hp').textContent = Math.max(0, Math.round(fr.ehp));
    document.getElementById('bp-bar').style.width = Math.max(0, fr.php / S.hp * 100) + '%';
    document.getElementById('bp-hp').textContent = Math.max(0, Math.round(fr.php));
    const bl = document.getElementById('battle-log');
    if (bl) {
      bl.textContent = fr.pdmg > 0
        ? '第 ' + (idx + 1) + ' 回合：' + my.name + '打出 ' + cal.dp + ' 点舞击，被反击 ' + fr.pdmg + ' 点'
        : '第 ' + (idx + 1) + ' 回合：' + my.name + '打出 ' + cal.dp + ' 点舞击，击倒！';
    }
    sfx('hit');
    battleAnimTimer = setTimeout(step, 100);
  }
  ov.onclick = finish;
  step();
}

/* ==================== 死亡 / 结局 ==================== */
function onDeath() {
  const my = MEMBERS[S.member];
  sfx('lose');
  if (S.snap) restoreState(S.snap);   // 立即回档，保证存档安全（可关页面不丢进度）
  save();
  S.mode = 'dead';
  openOverlay('dead', `
    <div class="panel end-panel">
      <h3>体力归零……</h3>
      <div class="end-face"><img src="assets/${my.imgDead}.png" alt="累趴" onerror="this.style.display='none'"></div>
      <p>${my.name}累趴下了。<br>没关系——加练允许中场休息，<br>本层的进度会回到入口状态，重新来过！</p>
      <div class="btn-row">
        <button id="dd-retry" class="primary">从本层入口重试</button>
        <button id="dd-title">回到标题</button>
      </div>
    </div>`);
  document.getElementById('dd-retry').onclick = () => {
    closeOverlay(); S.mode = 'play'; retryFloor();
  };
  document.getElementById('dd-title').onclick = () => { closeOverlay(); backToTitle(); };
}
function showEnding() {
  const my = MEMBERS[S.member];
  S.mode = 'ending';
  S.win = true;
  sfx('crown');
  save();
  openOverlay('end', `
    <div class="panel end-panel">
      <h3>月光加冕 · 通关！</h3>
      <div class="end-face big"><img src="assets/${my.imgCrown}.png" alt="${my.fans}" onerror="this.style.display='none'"></div>
      <p>21 层聚光灯全部点亮。<br>努力闪耀的人，让月光为她加冕。<br>—— 明天的加练，也一起哦！</p>
      <div class="end-line" style="border-color:${my.color}">${my.endingLine}</div>
      <div class="end-stat">主角 ${my.name} · 击杀 ${S.kills} 只魔物 · 步数 ${S.steps} · 剩余应援金 ${S.coins}</div>
      <div class="btn-row"><button id="ed-title" class="primary">回到标题</button></div>
    </div>`);
  document.getElementById('ed-title').onclick = () => { closeOverlay(); backToTitle(); };
}
function backToTitle() {
  S.mode = 'title';
  bgmStop();
  showTitle();
}

/* ==================== 商店（3F 乃琳Queen，价格递增） ==================== */
function shopPrice(id) {
  const p = SHOP.basePrice + (S.shopN[id] || 0) * SHOP.step;
  return S.member === 'eileen' ? Math.floor(p * 0.8) : p;   // 乃琳被动「女王折扣」：全场 -20%
}
function openShop() {
  sfx('select');
  renderShop();
}
function renderShop() {
  const goods = SHOP.goods.map(g => {
    const p = shopPrice(g.id);
    const afford = S.coins >= p;
    return `<div class="shop-row">
      <div class="shop-name">${g.name}<span class="dim">${g.desc}</span></div>
      <button class="shop-buy ${afford ? 'primary' : ''}" data-g="${g.id}" ${afford ? '' : 'disabled'}>${p} 金币</button>
    </div>`;
  }).join('');
  openOverlay('shop', `
    <div class="panel shop-panel">
      <h3>Queen 商店 <span class="dim">· 应援金 ${S.coins}</span></h3>
      <div class="shop-face"><img src="assets/eileen_nuwangdekending.png" alt="乃琳" onerror="this.style.display='none'">
        <span>「本 Queen 只做良心生意——每次购买，价格都会上涨哦。」</span></div>
      ${goods}
      <div class="btn-row"><button id="shop-close">离开</button></div>
    </div>`);
  document.querySelectorAll('.shop-buy').forEach(btn => {
    btn.onclick = () => {
      const g = SHOP.goods.find(x => x.id === btn.dataset.g);
      const p = shopPrice(g.id);
      if (!g || S.coins < p) return;
      S.coins -= p;
      S.shopN[g.id] = (S.shopN[g.id] || 0) + 1;
      g.apply(S);
      sfx('levelup');
      logMsg('购买【' + g.name + '】：' + g.desc + '（-' + p + ' 应援金）', 'good');
      save();
      renderShop();
      render();
    };
  });
  document.getElementById('shop-close').onclick = () => { sfx('select'); closeOverlay(); };
}

/* ==================== 对话播放 ==================== */
let dialogQueue = null, dialogCb = null;
/** 文案本地化：{me}/{fans} 称谓与 {{crown}}/{{heart}}/{{color}} 主角资源占位 */
function localizeDialog(d) {
  const M = MEMBERS[S.member];
  const rep = s => String(s)
    .replace(/\{me\}/g, M.name)
    .replace(/\{fans\}/g, M.fans)
    .replace(/\{\{crown\}\}/g, M.imgCrown)
    .replace(/\{\{heart\}\}/g, M.imgHeart)
    .replace(/\{\{color\}\}/g, M.color);
  return {
    who: rep(d.who || ''),
    text: rep(d.text || ''),
    img: d.img ? rep(d.img) : '',
    color: d.color ? rep(d.color) : M.color,
  };
}
function playDialog(seq, cb) {
  dialogQueue = seq.map(localizeDialog);
  dialogCb = cb || null;
  showNextDialog();
}
function showNextDialog() {
  if (!dialogQueue || !dialogQueue.length) {
    closeOverlay();
    const cb = dialogCb;
    dialogCb = null; dialogQueue = null;
    if (cb) cb();
    return;
  }
  const d = dialogQueue.shift();
  const im = d.img ? `<img src="${d.img}" alt="" onerror="this.style.display='none'">` : '';
  openOverlay('dialog', `
    <div class="dialog" style="border-top-color:${d.color || '#DB7D74'}">
      <div class="dialog-face" style="border-color:${d.color || '#DB7D74'}">${im}</div>
      <div class="dialog-body">
        <div class="dialog-name" style="color:${d.color || '#DB7D74'}">${d.who}</div>
        <div class="dialog-text">${d.text}</div>
        <div class="dialog-next">点击 / 空格 继续 ▶</div>
      </div>
    </div>`);
  sfx('select');
  document.getElementById('overlay').onclick = showNextDialog;
}

/* ==================== 图鉴 / 暂停 / 楼层跳跃 ==================== */
function openBook() {
  sfx('select');
  const rows = Object.keys(MONS).map(id => {
    const m = MONS[id];
    const known = !!S.met[id];
    return `<div class="book-row ${known ? '' : 'unknown'}">
      <div class="book-glyph" style="background:${m.color}">${known ? m.glyph : '?'}</div>
      <div class="book-info">
        <div class="book-name">${known ? m.name : '？？？'} ${m.boss ? '<span class="tag">BOSS</span>' : ''}</div>
        ${known
          ? `<div class="book-stat">体力 ${m.hp} · 舞力 ${m.atk} · 护体 ${m.def} · 应援金 ${m.coin}</div>
             <div class="book-quip">「${m.quip}」</div>`
          : '<div class="book-quip dim">遭遇后解锁图鉴</div>'}
      </div>
    </div>`;
  }).join('');
  openOverlay('book', `
    <div class="panel book-panel">
      <h3>拖延魔物图鉴</h3>
      <div class="book-list">${rows}</div>
      <div class="btn-row"><button id="book-close" class="primary">关闭</button></div>
    </div>`);
  document.getElementById('book-close').onclick = () => { sfx('select'); closeOverlay(); };
}
function openPause() {
  sfx('select');
  openOverlay('pause', `
    <div class="panel">
      <h3>暂停 · 加练休息室</h3>
      <div class="btn-col">
        <button id="pp-resume" class="primary">继续爬塔</button>
        <button id="pp-jump">楼层跳跃</button>
        <button id="pp-book">魔物图鉴</button>
        <button id="pp-mute">音效：${muted ? '关' : '开'}（M）</button>
        <button id="pp-restart">清档重开</button>
        <button id="pp-title">回到标题</button>
      </div>
    </div>`);
  document.getElementById('pp-resume').onclick = () => { sfx('select'); closeOverlay(); };
  document.getElementById('pp-jump').onclick = openJump;
  document.getElementById('pp-book').onclick = openBook;
  document.getElementById('pp-mute').onclick = () => { toggleMute(); openPause(); };
  document.getElementById('pp-restart').onclick = () => {
    if (confirm('确定清除存档、以当前主角重新开始加练吗？')) { clearSave(); closeOverlay(); newGame(S.member); }
  };
  document.getElementById('pp-title').onclick = () => { closeOverlay(); backToTitle(); };
}
function openJump() {
  sfx('select');
  let rows = '';
  for (let f = 1; f <= S.maxFloor; f++) {
    const cur = f === S.floor;
    rows += `<button class="jump-btn ${cur ? 'cur' : ''}" data-f="${f}" ${cur ? 'disabled' : ''}>
      ${f}F · ${FLOORS[f - 1].name}${cur ? '（当前层）' : ''}</button>`;
  }
  openOverlay('jump', `
    <div class="panel">
      <h3>楼层跳跃 <span class="dim">（已到达的楼层可随时往返，进度保留）</span></h3>
      <div class="jump-list">${rows}</div>
      <div class="btn-row"><button id="jp-close" class="primary">返回</button></div>
    </div>`);
  document.querySelectorAll('.jump-btn').forEach(btn => {
    btn.onclick = () => { sfx('select'); closeOverlay(); enterFloor(parseInt(btn.dataset.f, 10)); };
  });
  document.getElementById('jp-close').onclick = () => { sfx('select'); closeOverlay(); };
}
function toggleMute() {
  muted = !muted;
  logMsg(muted ? '音效已关闭（M）。' : '音效已开启（M）。');
}

/* ==================== 覆盖层管理 ==================== */
function openOverlay(kind, html) {
  S.overlay = kind;
  const ov = document.getElementById('overlay');
  ov.innerHTML = html;
  ov.className = 'ov ov-' + kind;
  ov.style.display = 'flex';
}
function closeOverlay() {
  S.overlay = null;
  const ov = document.getElementById('overlay');
  ov.innerHTML = '';
  ov.style.display = 'none';
  ov.onclick = null;
  ov.className = '';
  render();
}

/* ==================== 绘制 ==================== */
/** 圆形头像：表情包优先；JPG 公式照等比裁圆；失败画色块 + 首字 */
function drawAvatar(c, cx, cy, rad, src, color, glyph) {
  const im = src ? IMG[src] : null;
  const ok = im && im.complete && im.naturalWidth > 0;
  c.save();
  c.beginPath();
  c.arc(cx, cy, rad, 0, Math.PI * 2);
  c.closePath();
  c.clip();
  if (ok) {
    const sc = Math.max(rad * 2 / im.naturalWidth, rad * 2 / im.naturalHeight);
    const w = im.naturalWidth * sc, h = im.naturalHeight * sc;
    c.drawImage(im, cx - w / 2, cy - h / 2, w, h);
  } else {
    c.fillStyle = color;
    c.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
    if (glyph) {
      c.fillStyle = '#fff';
      c.font = 'bold ' + Math.floor(rad) + 'px "Microsoft YaHei", sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(glyph, cx, cy + 1);
    }
  }
  c.restore();
  c.beginPath();
  c.arc(cx, cy, rad, 0, Math.PI * 2);
  c.strokeStyle = color; c.lineWidth = 3;
  c.stroke();
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
function render() {
  if (!ctx || S.mode === 'title') return;
  const c = ctx;
  c.fillStyle = '#241B2E';
  c.fillRect(0, 0, CV_W, CV_H);
  const f = S.floor;
  const st = floorState(f);
  const map = FLOORS[f - 1].map;
  for (let r = 0; r < TOWER_CFG.rows; r++) {
    for (let cc = 0; cc < TOWER_CFG.cols; cc++) {
      drawCell(c, MAP_X + cc * CELL, MAP_Y + r * CELL, map[r][cc], st, r + ',' + cc);
    }
  }
  // 玩家（随所选主角切换头像）
  const my = MEMBERS[S.member];
  drawAvatar(c, MAP_X + S.x * CELL + CELL / 2, MAP_Y + S.y * CELL + CELL / 2,
    CELL * 0.38, 'assets/' + my.imgCard + '.png', my.color, my.name[0]);
  // 层名水印
  c.fillStyle = 'rgba(36,27,46,0.75)';
  c.fillRect(6, 4, 300, 24);
  c.fillStyle = '#F3E9DC';
  c.font = 'bold 15px "Microsoft YaHei", sans-serif';
  c.textAlign = 'left'; c.textBaseline = 'top';
  c.fillText(FLOORS[f - 1].name, 12, 8);
  renderSide();
}
function drawCell(c, px, py, ch, st, k) {
  const dead = !!st.dead[k], taken = !!st.taken[k], done = !!st.done[k];
  // 棋盘格地板
  const rr = Math.floor(py / CELL), ccx = Math.floor(px / CELL);
  c.fillStyle = (rr + ccx) % 2 ? '#F1E7D8' : '#F6EFE4';
  c.fillRect(px, py, CELL, CELL);
  c.strokeStyle = 'rgba(0,0,0,0.05)';
  c.strokeRect(px + 0.5, py + 0.5, CELL - 1, CELL - 1);

  if (ch === '#') {
    c.fillStyle = '#4A3B55';
    c.fillRect(px, py, CELL, CELL);
    c.fillStyle = 'rgba(255,255,255,0.08)';
    c.fillRect(px + 3, py + 3, CELL - 6, 4);
    c.fillStyle = 'rgba(0,0,0,0.18)';
    c.fillRect(px + 3, py + CELL - 9, CELL - 6, 6);
    return;
  }
  if (ch === 'U') { drawStairs(c, px, py, '#E8C84A', '↑'); return; }
  if (ch === 'D') { drawStairs(c, px, py, '#9A8FB8', '↓'); return; }
  if ((ch === 'y' || ch === 'b' || ch === 'r') && !taken) {
    const col = { y: '#D8C05A', b: '#5A9AD8', r: '#D85A5A' }[ch];
    c.fillStyle = col;
    roundRect(c, px + 8, py + 4, CELL - 16, CELL - 8, 6);
    c.fill();
    c.fillStyle = 'rgba(0,0,0,0.25)';
    c.fillRect(px + CELL - 17, py + CELL / 2 - 2, 7, 4);
    c.fillStyle = 'rgba(255,255,255,0.5)';
    c.fillRect(px + 12, py + 10, CELL - 24, 4);
    return;
  }
  if (MON_CHAR[ch] && !dead) {
    const m = MONS[MON_CHAR[ch]];
    c.fillStyle = 'rgba(0,0,0,0.12)';
    roundRect(c, px + 10, py + CELL - 13, CELL - 20, 6, 3); c.fill();
    c.fillStyle = m.color;
    roundRect(c, px + 8, py + 8, CELL - 16, CELL - 18, 10); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.25)';
    roundRect(c, px + 12, py + 12, CELL - 24, 8, 4); c.fill();
    c.fillStyle = '#fff';
    c.font = 'bold 22px "Microsoft YaHei", sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(m.glyph, px + CELL / 2, py + CELL / 2 - 3);
    if (m.boss) {
      c.strokeStyle = m.color; c.lineWidth = 3;
      c.beginPath();
      c.arc(px + CELL / 2, py + CELL / 2, CELL * 0.44, 0, Math.PI * 2);
      c.stroke();
    }
    return;
  }
  if (NPC_CHAR[ch] && !done && !dead) {
    drawNpc(c, px, py, ch);
    return;
  }
  if (ITEMS[ch] && !taken) {
    const it = ITEMS[ch];
    c.fillStyle = it.color;
    c.beginPath();
    c.arc(px + CELL / 2, py + CELL / 2, CELL * 0.30, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = 'rgba(255,255,255,0.35)';
    c.beginPath();
    c.arc(px + CELL / 2 - 5, py + CELL / 2 - 6, 5, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#fff';
    c.font = 'bold 16px "Microsoft YaHei", sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(it.glyph, px + CELL / 2, py + CELL / 2 + 1);
    return;
  }
}
function drawStairs(c, px, py, col, arrow) {
  c.fillStyle = '#D9CFBE';
  c.fillRect(px + 6, py + 6, CELL - 12, CELL - 12);
  c.fillStyle = col;
  for (let i = 0; i < 3; i++) c.fillRect(px + 10 + i * 8, py + CELL - 16 - i * 12, CELL - 24 - i * 8, 8);
  c.font = 'bold 18px sans-serif';
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillStyle = '#3A3040';
  c.fillText(arrow, px + CELL / 2, py + 16);
}
function drawNpc(c, px, py, ch) {
  const npc = NPCS[ch];
  const cx = px + CELL / 2, cy = py + CELL / 2;
  if (ch === 'V') {
    /* 惰怠魔壬：无对应素材，用几何绘制深紫魔王 */
    c.fillStyle = 'rgba(0,0,0,0.2)';
    c.beginPath(); c.ellipse(cx, py + CELL - 10, 19, 5, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#4A2E5A';
    c.beginPath(); c.arc(cx, cy + 4, CELL * 0.36, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.moveTo(cx - 16, cy - 10); c.lineTo(cx - 23, cy - 25); c.lineTo(cx - 7, cy - 17); c.fill();
    c.beginPath(); c.moveTo(cx + 16, cy - 10); c.lineTo(cx + 23, cy - 25); c.lineTo(cx + 7, cy - 17); c.fill();
    c.fillStyle = '#E8D0F0';
    c.font = 'bold 22px "Microsoft YaHei", sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('惰', cx, cy + 2);
    c.strokeStyle = '#B08AD0'; c.lineWidth = 3;
    c.beginPath(); c.arc(cx, cy + 4, CELL * 0.44, 0, Math.PI * 2); c.stroke();
    return;
  }
  if (ch === 'T') {
    /* 天台聚光灯：放射光束 */
    const g = c.createRadialGradient(cx, cy, 4, cx, cy, CELL * 0.62);
    g.addColorStop(0, 'rgba(255,240,180,0.95)');
    g.addColorStop(1, 'rgba(255,240,180,0)');
    c.fillStyle = g;
    c.fillRect(px, py, CELL, CELL);
    c.fillStyle = '#E8D88A';
    c.beginPath(); c.arc(cx, cy, 10, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#B8A84A'; c.lineWidth = 2;
    c.beginPath(); c.arc(cx, cy, 15, 0, Math.PI * 2); c.stroke();
    return;
  }
  const rad = CELL * 0.36;
  drawAvatar(c, cx, cy, rad, npc.img || null, npc.color, npc.name[0]);
  c.strokeStyle = npc.color; c.lineWidth = 2;
  c.beginPath();
  c.arc(cx, cy, rad + 4, 0, Math.PI * 2);
  c.setLineDash([4, 3]);
  c.stroke();
  c.setLineDash([]);
}

/* ==================== 侧栏（DOM） ==================== */
function renderSide() {
  const el = document.getElementById('side');
  if (!el || S.mode === 'title') return;
  const f = S.floor;
  const my = MEMBERS[S.member];
  el.innerHTML = `
    <div class="side-member">
      <img src="assets/${my.imgCard}.png" alt="" onerror="this.style.visibility='hidden'">
      <div class="side-member-info">
        <b style="color:${my.color}">${my.name}</b>
        <span>${my.role}</span>
      </div>
    </div>
    <div class="side-floor">第 ${f} / 21 层</div>
    <div class="side-name">${FLOORS[f - 1].name}</div>
    <div class="side-sec">${my.name} · 加练状态</div>
    <div class="side-hp"><span>体力</span><b>${S.hp}</b></div>
    <div class="side-row"><span>舞力</span><b>${S.atk}</b><span>护体</span><b>${S.def}</b></div>
    <div class="side-row"><span>应援金</span><b>${S.coins}</b><span>炸弹</span><b>${S.bombs}</b></div>
    <div class="side-keys">
      <span class="key k-y">黄 ${S.keys.y}</span>
      <span class="key k-b">蓝 ${S.keys.b}</span>
      <span class="key k-r">红 ${S.keys.r}</span>
    </div>
    <div class="side-btns">
      <button id="side-book">图鉴(1)</button>
      <button id="side-jump">跳跃(2)</button>
      <button id="side-pause">暂停(3)</button>
      <button id="side-mute">音效:${muted ? '关' : '开'}(M)</button>
    </div>
    <div class="side-sec">加练日志</div>
    <div class="side-log">${S.log.slice(-9).map(l =>
      `<div class="log-line ${l.c}">${l.t}</div>`).join('')}</div>`;
  document.getElementById('side-book').onclick = openBook;
  document.getElementById('side-jump').onclick = openJump;
  document.getElementById('side-pause').onclick = openPause;
  document.getElementById('side-mute').onclick = toggleMute;
}

/* ==================== 键盘输入 ==================== */
document.addEventListener('keydown', e => {
  if (e.code === 'KeyM') { toggleMute(); return; }         // 静音全局可用
  if (S.overlay === 'dialog') {
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE') {
      e.preventDefault();
      showNextDialog();
    }
    return;
  }
  if (S.overlay) {
    if (e.code === 'Escape') {
      if (S.overlay === 'battle') { const b = document.getElementById('bt-cancel'); if (b) b.click(); }
      else if (S.overlay !== 'anim' && S.overlay !== 'dead' && S.overlay !== 'end') closeOverlay();
    }
    return;
  }
  if (S.mode !== 'play') return;
  if (DIRS[e.code]) { e.preventDefault(); tryMove(DIRS[e.code][0], DIRS[e.code][1]); return; }
  if (e.code === 'Digit1') openBook();
  if (e.code === 'Digit2') openJump();
  if (e.code === 'Digit3' || e.code === 'Escape') openPause();
});

/* ==================== 标题 / 选主角 / 新游戏 / 继续 ==================== */
let titleSel = 'bella';   // 标题界面当前选中的主角
function showTitle() {
  const ov = document.getElementById('title');
  const hasSave = !!loadSave();
  ov.style.display = 'flex';
  document.getElementById('game-wrap').style.display = 'none';
  const sel = MEMBERS[titleSel] || MEMBERS.bella;
  const cards = Object.values(MEMBERS).map(m => `
    <div class="member-card ${m.id === titleSel ? 'sel' : ''}" data-m="${m.id}" style="--mc:${m.color}">
      <div class="mc-face"><img src="assets/${m.imgCard}.png" alt="${m.name}" onerror="this.style.display='none'"></div>
      <div class="mc-name" style="color:${m.color}">${m.name}<span class="mc-role">${m.role}</span></div>
      <div class="mc-stat">体力 ${m.hp} · 舞力 ${m.atk} · 护体 ${m.def}${m.keyY > 1 ? ' · 黄钥匙 +1' : ''}</div>
      <div class="mc-pass">${m.passives.map(p => `<b>【${p.name}】</b>${p.desc}`).join('<br>')}</div>
    </div>`).join('');
  ov.innerHTML = `
    <div class="title-inner">
      <div class="title-logo"><img src="assets/asoul_logo.png" alt="A-SOUL" onerror="this.style.display='none'"></div>
      <h1>加练魔塔</h1>
      <div class="title-sub">A-SOUL 练习大楼 21 层 · 每人加练一天！！！</div>
      <div class="title-story">练习大楼的 21 层聚光灯一夜熄灭，「惰怠魔壬」把每层变成了摸鱼乐园。<br>
        今夜有人要开始反攻：爬上 21 层天台，点亮聚光灯，让月光为努力的人加冕！</div>
      <div class="title-sec">选择主角（默认三人组）</div>
      <div class="member-cards">${cards}</div>
      <div class="title-face"><img src="assets/${sel.imgTalk}.png" alt="${sel.name}" onerror="this.style.display='none'"></div>
      <div class="title-help">
        方向键 / WASD 移动 · 碰怪先看战斗预览 · 撞门用钥匙 · 1 图鉴 · 2 楼层跳跃 · 3 暂停 · M 静音<br>
        3F 乃琳商店用应援金买属性 · 击败守关队友获全属性加成 · 自动存档，体力归零回本层入口
      </div>
      <div class="title-btns">
        ${hasSave ? '<button id="tt-continue" class="primary">继续爬塔</button>' : ''}
        <button id="tt-new" class="${hasSave ? '' : 'primary'}">新的加练（${sel.name}）</button>
        ${hasSave ? '<button id="tt-jump">楼层跳跃</button>' : ''}
        <button id="tt-mute">音效：${muted ? '关' : '开'}</button>
      </div>
      <div class="title-foot">A-SOUL 同人游戏 · 灵感致敬 4399 经典《魔塔》 · 非商用</div>
    </div>`;
  // 点击卡片切换选中主角（重绘标题，保持选择）
  document.querySelectorAll('.member-card').forEach(card => {
    card.onclick = () => { audioInit(); titleSel = card.dataset.m; sfx('select'); showTitle(); };
  });
  document.getElementById('tt-new').onclick = () => { audioInit(); sfx('select'); newGame(titleSel); };
  if (hasSave) {
    document.getElementById('tt-continue').onclick = () => { audioInit(); sfx('select'); continueGame(); };
    document.getElementById('tt-jump').onclick = () => {
      audioInit(); sfx('select');
      continueGame();
      openJump();
    };
  }
  document.getElementById('tt-mute').onclick = () => { audioInit(); toggleMute(); showTitle(); };
}
function newGame(memberId) {
  const M = MEMBERS[memberId] || MEMBERS.bella;
  S.member = M.id;
  clearSave();
  S.mode = 'play';
  S.overlay = null;
  S.floor = 1; S.x = 1; S.y = 1;
  S.hp = M.hp; S.atk = M.atk; S.def = M.def;      // 三主角差异化初始属性
  S.coins = 0;
  S.keys = { y: M.keyY, b: 0, r: 0 };             // 嘉然 keyY=2（被动：额外 1 把黄钥匙）
  S.bombs = TOWER_CFG.startBombs;
  S.shopN = { atk: 0, def: 0, hp: 0 };
  S.floors = {}; S.flags = {}; S.met = {};
  S.maxFloor = 1; S.kills = 0; S.steps = 0;
  S.log = []; S.win = false; S.snap = null;
  document.getElementById('title').style.display = 'none';
  document.getElementById('game-wrap').style.display = 'flex';
  enterFloor(1);
  bgmStart();
  playDialog(STORIES.intro[S.member], () => {
    logMsg(M.name + '的加练开始！目标：21F 天台舞台。', 'good');
    logMsg('小提示：走向怪物会先弹出战斗预览，量力而行！');
    save();
  });
}
function continueGame() {
  const d = loadSave();
  if (!d) { newGame(titleSel); return; }
  S.member = d.member;          // 读档恢复所选主角
  restoreState(d);
  S.log = d.log || [];
  S.win = !!d.win;
  S.mode = 'play';
  S.snap = d.snap || serializeState();
  document.getElementById('title').style.display = 'none';
  document.getElementById('game-wrap').style.display = 'flex';
  bgmStart();
  logMsg('读档成功——回到 ' + FLOORS[S.floor - 1].name + '（主角：' + MEMBERS[S.member].name + '）。');
  render();
}

/* ==================== 启动 ==================== */
window.addEventListener('DOMContentLoaded', () => {
  const cv = document.getElementById('cv');
  ctx = cv.getContext('2d');
  showTitle();
});
