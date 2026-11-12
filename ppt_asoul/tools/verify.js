'use strict';
const path = require('path');
const fs = require('fs');
const PW = 'C:/Users/ben/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright-core';
const { chromium } = require(PW);

const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(ROOT, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : ''));
}

(async () => {
  const exe = path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-win64/chrome-headless-shell.exe');
  const browser = await chromium.launch({ headless: true, executablePath: exe });
  const page = await browser.newPage({ viewport: { width: 800, height: 860 } });
  const errors = [];
  const failed = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  page.on('requestfailed', r => failed.push(r.url()));
  page.on('response', r => { if (r.status() >= 400) failed.push(r.url() + ' -> ' + r.status()); });

  await page.goto('file:///' + ROOT.replace(/\\/g, '/') + '/index.html');
  await page.waitForTimeout(800);

  const imgStatus = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('#cards img').forEach(im => out.push({ src: im.src.split('/').pop(), ok: im.complete && im.naturalWidth > 0 }));
    return out;
  });
  check('菜单立绘加载', imgStatus.every(i => i.ok), JSON.stringify(imgStatus));
  await page.waitForFunction(() => window.__dbg.art().box, null, { timeout: 8000 });
  const artStatus = await page.evaluate(() => window.__dbg.art());
  check('生成美术加载', artStatus.grass && artStatus.hedge && artStatus.box, JSON.stringify(artStatus));
  await page.screenshot({ path: path.join(SHOTS, '01-menu.png') });

  // 进入手动模式 + 固定种子
  await page.evaluate(() => { window.__dbg.manual(true); window.__dbg.setSeed(20261107); window.__dbg.freezeEnemies(true); window.__dbg.start('diana'); });
  let s = await page.evaluate(() => window.__dbg.state());
  check('开局状态', s.state === 'playing' && s.level === 0 && s.lives === 3 && s.enemies.length === 3 && s.boxes > 30,
    `state=${s.state} enemies=${s.enemies.length} boxes=${s.boxes}`);

  // 暂停 / 继续 / 返回主页
  await page.keyboard.press('p');
  s = await page.evaluate(() => window.__dbg.state());
  check('P键暂停', s.state === 'pause', `state=${s.state}`);
  const pauseText = await page.evaluate(() => document.getElementById('overlay').innerText);
  check('暂停面板有继续/返回主页', pauseText.includes('继续游戏') && pauseText.includes('返回主页'), pauseText.replace(/\n/g, ' | '));
  await page.screenshot({ path: path.join(SHOTS, '09-pause.png') });
  const tPaused = s.time;
  await page.evaluate(() => { window.__dbg.key('ArrowRight', true); for (let i = 0; i < 10; i++) window.__dbg.tick(50); window.__dbg.key('ArrowRight', false); });
  s = await page.evaluate(() => window.__dbg.state());
  check('暂停时模拟冻结', s.time === tPaused && s.player.x === 72, `time=${s.time} x=${s.player.x}`);
  await page.click('#btn-resume');
  s = await page.evaluate(() => window.__dbg.state());
  check('按钮继续游戏', s.state === 'playing', `state=${s.state}`);
  await page.keyboard.press('Escape');
  s = await page.evaluate(() => window.__dbg.state());
  check('Esc也能暂停', s.state === 'pause', `state=${s.state}`);
  await page.click('#btn-home');
  s = await page.evaluate(() => window.__dbg.state());
  const menuBack = await page.evaluate(() => !document.getElementById('menu').classList.contains('hidden') && document.getElementById('overlay').classList.contains('hidden'));
  check('暂停返回主页', s.state === 'menu' && menuBack, `state=${s.state} menuVisible=${menuBack}`);

  // 主页对局设置控件
  const settings = await page.evaluate(() => {
    const p = document.getElementById('sel-players'), a = document.getElementById('sel-ai'), d = document.getElementById('sel-diff');
    return {
      players: { value: p.value, disabled: p.disabled },
      ai: { value: a.value, options: Array.from(a.options).map(o => o.value) },
      diff: { value: d.value, options: Array.from(d.options).map(o => o.value) },
    };
  });
  check('主页设置:玩家固定1/AI1-8/三档难度',
    settings.players.value === '1' && settings.players.disabled &&
    settings.ai.options.join(',') === '1,2,3,4,5,6,7,8' && settings.ai.value === '3' &&
    settings.diff.options.join(',') === 'easy,medium,hard' && settings.diff.value === 'medium',
    JSON.stringify(settings));
  await page.screenshot({ path: path.join(SHOTS, '01-menu.png') });

  // 重新开局（重设种子保持后续关卡布局确定）
  await page.evaluate(() => { window.__dbg.setSeed(20261107); window.__dbg.start('diana'); });

  // 移动与碰撞
  const x0 = s.player.x;
  await page.evaluate(() => { window.__dbg.key('ArrowRight', true); for (let i = 0; i < 10; i++) window.__dbg.tick(50); window.__dbg.key('ArrowRight', false); });
  s = await page.evaluate(() => window.__dbg.state());
  check('向右移动', s.player.x > x0 + 20, `x ${x0} -> ${s.player.x}`);
  // 一直向右撞墙/箱子，位置应停在地图内且不穿墙
  await page.evaluate(() => { window.__dbg.key('ArrowRight', true); for (let i = 0; i < 30; i++) window.__dbg.tick(50); window.__dbg.key('ArrowRight', false); });
  s = await page.evaluate(() => window.__dbg.state());
  const grid = await page.evaluate(() => window.__dbg.grid());
  const cellV = grid[s.player.cell.cy * 15 + s.player.cell.cx];
  check('碰撞不穿墙', s.player.x < 720 - 20 && cellV === 0, `cell=${JSON.stringify(s.player.cell)} v=${cellV} x=${s.player.x}`);

  // 放泡 -> 爆炸
  await page.evaluate(() => { window.__dbg.teleport(72, 72); window.__dbg.placeBomb(); });
  s = await page.evaluate(() => window.__dbg.state());
  check('放置水泡', s.bombs.length === 1, `bombs=${s.bombs.length}`);
  // 回归：放泡后必须能走出泡格；完全走出后泡应挡住回路
  await page.evaluate(() => { window.__dbg.key('ArrowRight', true); for (let i = 0; i < 8; i++) window.__dbg.tick(50); window.__dbg.key('ArrowRight', false); });
  s = await page.evaluate(() => window.__dbg.state());
  check('放泡后能走出泡格', s.player.cell.cx === 2 && s.player.x > 112, `x=${s.player.x} cell=${JSON.stringify(s.player.cell)}`);
  await page.evaluate(() => { window.__dbg.key('ArrowLeft', true); for (let i = 0; i < 20; i++) window.__dbg.tick(50); window.__dbg.key('ArrowLeft', false); });
  s = await page.evaluate(() => window.__dbg.state());
  check('走出后水泡挡住回路', s.player.x >= 110 && s.player.cell.cx === 2, `x=${s.player.x}`);
  await page.screenshot({ path: path.join(SHOTS, '02-bubble.png') });
  await page.evaluate(() => { window.__dbg.teleport(72, 264); }); // 离开爆炸范围
  await page.evaluate(() => { for (let i = 0; i < 48; i++) window.__dbg.tick(50); }); // 2.4s > 2.2s 引信
  s = await page.evaluate(() => window.__dbg.state());
  check('到时爆炸', s.bombs.length === 0 && (s.flames > 0 || s.boxes < 60), `bombs=${s.bombs.length} flames=${s.flames} boxes=${s.boxes}`);
  await page.evaluate(() => { for (let i = 0; i < 8; i++) window.__dbg.tick(50); }); // 等第一颗水泡的水花完全消散
  await page.evaluate(() => { window.__dbg.teleport(300, 300); window.__dbg.placeBomb(); window.__dbg.teleport(72, 72); window.__dbg.detonate(); });
  await page.screenshot({ path: path.join(SHOTS, '03-explosion.png') });
  await page.evaluate(() => { for (let i = 0; i < 14; i++) window.__dbg.tick(50); }); // 等水花消散

  // 道具拾取
  await page.evaluate(() => {
    const st = window.__dbg.state();
    window.__dbg.spawnItem(st.player.cell.cx, st.player.cell.cy, 'bomb');
    window.__dbg.tick(50);
  });
  s = await page.evaluate(() => window.__dbg.state());
  check('拾取水泡道具', s.player.maxBombs === 2, `maxBombs=${s.player.maxBombs}`);
  await page.evaluate(() => {
    const st = window.__dbg.state();
    window.__dbg.spawnItem(st.player.cell.cx, st.player.cell.cy, 'range');
    window.__dbg.spawnItem(st.player.cell.cx, st.player.cell.cy, 'speed');
    window.__dbg.tick(50);
  });
  s = await page.evaluate(() => window.__dbg.state());
  check('拾取范围/速度道具', s.player.range === 3 && s.player.speedLv === 2, `range=${s.player.range} speed=${s.player.speedLv}`);

  // 锤子：拾取 / 近敲眩晕 / 眩晕禁动 / 到期恢复 / 敌方对称使用
  await page.evaluate(() => {
    const st = window.__dbg.state();
    window.__dbg.spawnItem(st.player.cell.cx, st.player.cell.cy, 'hammer');
    window.__dbg.tick(50);
  });
  s = await page.evaluate(() => window.__dbg.state());
  const hudHam = await page.evaluate(() => document.getElementById('hud-hammer').textContent);
  check('拾取锤子+3次', s.player.hammer === 3 && hudHam === '3', `hammer=${s.player.hammer} hud=${hudHam}`);
  await page.evaluate(() => {
    const st = window.__dbg.state();
    window.__dbg.teleportEnemy(0, st.player.x + 48, st.player.y);
    window.__dbg.swing();
    window.__dbg.tick(100);
  });
  s = await page.evaluate(() => window.__dbg.state());
  check('锤子近敲晕敌人', s.enemies[0].stun > 0 && s.player.hammer === 2, `stun=${s.enemies[0].stun} hammer=${s.player.hammer}`);
  await page.screenshot({ path: path.join(SHOTS, '12-hammer.png') });
  const stunPos = s.enemies[0];
  await page.evaluate(() => { window.__dbg.stepEnemy(0, 50); });
  s = await page.evaluate(() => window.__dbg.state());
  check('眩晕敌人无法行动', s.enemies[0].x === stunPos.x && s.enemies[0].y === stunPos.y, `pos=(${s.enemies[0].x},${s.enemies[0].y})`);
  await page.evaluate(() => { for (let i = 0; i < 64; i++) window.__dbg.tick(50); });
  s = await page.evaluate(() => window.__dbg.state());
  check('眩晕3秒后恢复', s.enemies[0].stun === 0, `stun=${s.enemies[0].stun}`);
  await page.evaluate(() => {
    const st = window.__dbg.state();
    const e = st.enemies[1];
    window.__dbg.spawnItem(Math.floor(e.x / 48), Math.floor(e.y / 48), 'hammer');
    window.__dbg.tick(50);
  });
  s = await page.evaluate(() => window.__dbg.state());
  check('敌人拾取锤子', s.enemies[1].hammer === 3, `enemy hammer=${s.enemies[1].hammer}`);
  const livesHam = s.lives;
  await page.evaluate(() => {
    const st = window.__dbg.state();
    window.__dbg.teleportEnemy(1, st.player.x + 48, st.player.y);
    window.__dbg.noInvuln();
    window.__dbg.stepEnemy(1, 50);
  });
  s = await page.evaluate(() => window.__dbg.state());
  check('敌方锤子敲晕玩家', s.player.stun && s.lives === livesHam && s.enemies[1].hammer === 2,
    `stun=${s.player.stun} lives=${s.lives} eHammer=${s.enemies[1].hammer}`);
  const pxStun = s.player.x;
  await page.evaluate(() => { window.__dbg.key('ArrowRight', true); for (let i = 0; i < 6; i++) window.__dbg.tick(50); window.__dbg.key('ArrowRight', false); });
  s = await page.evaluate(() => window.__dbg.state());
  check('眩晕玩家无法移动', s.player.x === pxStun, `x=${s.player.x}`);
  await page.evaluate(() => { for (let i = 0; i < 64; i++) window.__dbg.tick(50); });

  // 身体接触不再伤害（PvP 规则）：移到空格清无敌，再主动贴上敌人
  await page.evaluate(() => {
    const g = window.__dbg.grid();
    const st = window.__dbg.state();
    let best = null, bestD = -1;
    for (let y = 1; y < 12; y++) for (let x = 1; x < 14; x++) {
      if (g[y * 15 + x] !== 0) continue;
      const px = (x + 0.5) * 48, py = (y + 0.5) * 48;
      const d = Math.min(...st.enemies.map(e => Math.hypot(e.x - px, e.y - py)));
      if (d > bestD) { bestD = d; best = [px, py]; }
    }
    window.__dbg.teleport(best[0], best[1]);
    window.__dbg.noInvuln();
  });
  const livesBefore = (await page.evaluate(() => window.__dbg.state())).lives;
  await page.evaluate(() => {
    const st = window.__dbg.state();
    const e = st.enemies[0];
    window.__dbg.teleport(e.x, e.y);
    window.__dbg.tick(50);
  });
  s = await page.evaluate(() => window.__dbg.state());
  check('身体接触不扣血', s.lives === livesBefore && !s.player.invuln, `lives=${s.lives} invuln=${s.player.invuln}`);

  // 敌人放泡并逃命：传送到有逃路的格强制放泡，单敌步进度过引信
  const placed = await page.evaluate(() => {
    const g = window.__dbg.grid();
    for (let y = 2; y < 12; y++) for (let x = 2; x < 14; x++) {
      if (g[y * 15 + x] === 0 && g[(y - 1) * 15 + x] === 0 && g[(y - 1) * 15 + x - 1] === 0) {
        window.__dbg.teleportEnemy(0, (x + 0.5) * 48, (y + 0.5) * 48);
        return window.__dbg.enemyTryBomb(0, true);
      }
    }
    return false;
  });
  s = await page.evaluate(() => window.__dbg.state());
  check('敌人能放红色水泡', placed && s.bombs.some(b => b.side === 'enemy'), JSON.stringify(s.bombs));
  await page.screenshot({ path: path.join(SHOTS, '04-enemy-bomb.png') });
  await page.evaluate(() => { for (let i = 0; i < 52; i++) { window.__dbg.tick(50); window.__dbg.stepEnemy(0, 50); } });
  s = await page.evaluate(() => window.__dbg.state());
  check('敌人放泡后逃离存活', s.enemies.length === 3 && s.bombs.length === 0, `enemies=${s.enemies.length} bombs=${s.bombs.length}`);

  // 敌方水泡炸伤玩家
  await page.evaluate(() => {
    window.__dbg.teleport(72, 264); // 先离开布泡格，避免占格规则拒放
    window.__dbg.teleportEnemy(0, 120, 72);
    window.__dbg.enemyTryBomb(0, true);
    window.__dbg.teleportEnemy(0, 648, 552); // 移开敌人使其不自爆
    window.__dbg.teleportEnemy(1, 72, 552); // 队友也离开爆炸区（水花不分敌我）
    window.__dbg.teleport(120, 72); // 玩家站进爆炸中心
    window.__dbg.noInvuln();
    window.__dbg.detonate();
    window.__dbg.tick(50);
  });
  s = await page.evaluate(() => window.__dbg.state());
  check('敌方水泡炸伤玩家', s.lives === livesBefore - 1 && s.player.x === 72 && s.player.invuln, `lives=${s.lives} pos=(${s.player.x},${s.player.y})`);

  // 敌人抢道具
  await page.evaluate(() => {
    const st = window.__dbg.state();
    const e = st.enemies[1];
    window.__dbg.spawnItem(Math.floor(e.x / 48), Math.floor(e.y / 48), 'bomb');
    window.__dbg.tick(50);
  });
  s = await page.evaluate(() => window.__dbg.state());
  check('敌人拾取道具变强', s.enemies[1].maxBombs === 2, `enemy maxBombs=${s.enemies[1].maxBombs}`);

  // 占格规则：对方站在该格时不能放泡（避免卡死对手）
  const occBlocked = await page.evaluate(() => {
    const st = window.__dbg.state();
    const e = st.enemies[1];
    const n0 = st.bombs.length;
    window.__dbg.teleport(e.x, e.y);
    window.__dbg.placeBomb();
    const n1 = window.__dbg.state().bombs.length;
    window.__dbg.teleport(72, 264);
    return n1 === n0;
  });
  check('对方占格不能放泡', occBlocked, `blocked=${occBlocked}`);

  // 水花炸死敌人（在敌人左邻格放泡引爆，水花覆盖敌人；占格规则禁止同格放泡）
  await page.evaluate(() => {
    for (let i = 0; i < 8; i++) window.__dbg.tick(50); // 等待放泡冷却（受击给的无敌仍在）
    const st = window.__dbg.state();
    const e = st.enemies[0];
    window.__dbg.teleport(e.x - 48, e.y);
    window.__dbg.placeBomb();
    window.__dbg.detonate();
    window.__dbg.tick(50);
  });
  s = await page.evaluate(() => window.__dbg.state());
  check('水花消灭阿草', s.enemies.length === 2, `enemies=${s.enemies.length} score=${s.score}`);
  await page.screenshot({ path: path.join(SHOTS, '04-playing.png') });

  // 敌人 AI：解冻 3 秒应产生位移
  const beforeAI = s.enemies;
  await page.evaluate(() => {
    window.__dbg.teleport(72, 72);
    window.__dbg.freezeEnemies(false);
    for (let i = 0; i < 60; i++) window.__dbg.tick(50);
    window.__dbg.freezeEnemies(true);
  });
  const afterAI = (await page.evaluate(() => window.__dbg.state())).enemies;
  const moved = afterAI.length === beforeAI.length && afterAI.some((e, i) => Math.hypot(beforeAI[i].x - e.x, beforeAI[i].y - e.y) > 10);
  check('敌人AI移动', moved && afterAI.length === 2, JSON.stringify(afterAI));

  // 通关流程
  await page.evaluate(() => { window.__dbg.clearEnemies(); window.__dbg.tick(50); });
  s = await page.evaluate(() => window.__dbg.state());
  check('清场进入过关', s.state === 'clear', `state=${s.state}`);
  await page.screenshot({ path: path.join(SHOTS, '05-clear.png') });
  await page.evaluate(() => { window.__dbg.key('Enter', true); window.__dbg.key('Enter', false); window.__dbg.tick(50); });
  s = await page.evaluate(() => window.__dbg.state());
  check('进入第2关', s.state === 'playing' && s.level === 1 && s.enemies.length === 3, `level=${s.level} enemies=${s.enemies.length}`);
  await page.evaluate(() => { window.__dbg.clearEnemies(); window.__dbg.tick(50); window.__dbg.key('Enter', true); window.__dbg.key('Enter', false); window.__dbg.tick(50); });
  s = await page.evaluate(() => window.__dbg.state());
  check('进入第3关', s.level === 2 && s.enemies.length === 3, `level=${s.level} enemies=${s.enemies.length}`);
  await page.evaluate(() => { window.__dbg.clearEnemies(); window.__dbg.tick(50); window.__dbg.key('Enter', true); window.__dbg.key('Enter', false); window.__dbg.tick(50); });
  s = await page.evaluate(() => window.__dbg.state());
  check('通关胜利', s.state === 'win', `state=${s.state} score=${s.score}`);
  const winText = await page.evaluate(() => document.getElementById('overlay').innerText);
  check('胜利结算文案', winText.includes('枝江恢复了和平') && winText.includes('再来一局'), winText.replace(/\n/g, ' | ').slice(0, 80));
  await page.screenshot({ path: path.join(SHOTS, '06-win.png') });
  await page.click('#btn-home');
  s = await page.evaluate(() => window.__dbg.state());
  check('胜利结算返回主页', s.state === 'menu', `state=${s.state}`);

  // 失败流程：用敌方水泡炸玩家三次（身体接触已不扣血）
  await page.evaluate(() => { window.__dbg.start('bella'); window.__dbg.freezeEnemies(true); });
  await page.evaluate(() => {
    for (let j = 0; j < 50; j++) window.__dbg.tick(50); // 跳过开局无敌
    for (let i = 0; i < 3; i++) {
      window.__dbg.teleportEnemy(0, 120, 72);
      window.__dbg.enemyTryBomb(0, true);
      window.__dbg.teleportEnemy(0, 648, 552); // 移开敌人使其不自爆
      window.__dbg.teleport(120, 72); // 玩家再站进爆炸中心
      window.__dbg.noInvuln();
      window.__dbg.detonate();
      window.__dbg.tick(50);
      for (let j = 0; j < 55; j++) window.__dbg.tick(50); // 跳过受击无敌
    }
  });
  s = await page.evaluate(() => window.__dbg.state());
  check('三命耗尽游戏结束', s.state === 'over' && s.lives === 0, `state=${s.state} lives=${s.lives}`);
  const overText = await page.evaluate(() => document.getElementById('overlay').innerText);
  check('失败结算文案', overText.includes('被阿草闹翻了') && overText.includes('重新挑战'), overText.replace(/\n/g, ' | ').slice(0, 80));
  await page.screenshot({ path: path.join(SHOTS, '07-gameover.png') });

  // 自定义对局：AI 数量与难度生效
  await page.evaluate(() => { window.__dbg.config(5, 'hard'); window.__dbg.setSeed(7); window.__dbg.start('bella'); window.__dbg.freezeEnemies(true); });
  s = await page.evaluate(() => window.__dbg.state());
  check('困难模式5名AI', s.aiCount === 5 && s.diff === 'hard' && s.enemies.length === 5 &&
    s.enemies.every(e => e.range === 3 && e.maxBombs === 2 && e.speed === 78),
    `enemies=${s.enemies.length} e0=${JSON.stringify(s.enemies[0])}`);
  const hudDiff = await page.evaluate(() => document.getElementById('hud-diff').textContent);
  check('HUD显示当前难度', hudDiff === '困难', `hud-diff=${hudDiff}`);
  await page.screenshot({ path: path.join(SHOTS, '10-hard-5ai.png') });
  await page.evaluate(() => { window.__dbg.clearEnemies(); window.__dbg.tick(50); window.__dbg.key('Enter', true); window.__dbg.key('Enter', false); window.__dbg.tick(50); });
  s = await page.evaluate(() => window.__dbg.state());
  check('自选AI数量跨关保持', s.level === 1 && s.enemies.length === 5, `level=${s.level} enemies=${s.enemies.length}`);
  await page.evaluate(() => { window.__dbg.config(1, 'easy'); window.__dbg.setSeed(9); window.__dbg.start('eileen'); });
  s = await page.evaluate(() => window.__dbg.state());
  check('简单模式1名AI', s.enemies.length === 1 && s.enemies[0].speed === 45 && s.enemies[0].range === 2 && s.enemies[0].maxBombs === 1,
    `e0=${JSON.stringify(s.enemies[0])}`);
  await page.evaluate(() => { window.__dbg.config(8, 'medium'); window.__dbg.setSeed(11); window.__dbg.start('bella'); });
  s = await page.evaluate(() => window.__dbg.state());
  check('最多8名AI同场', s.enemies.length === 8, `enemies=${s.enemies.length}`);
  await page.screenshot({ path: path.join(SHOTS, '11-eight-ai.png') });

  check('无控制台错误', errors.length === 0, errors.slice(0, 3).join(' | '));
  check('无资源加载失败', failed.length === 0, failed.slice(0, 3).join(' | '));

  await browser.close();
  const fails = results.filter(r => !r.ok);
  console.log('\n==== ' + (results.length - fails.length) + '/' + results.length + ' passed ====');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });