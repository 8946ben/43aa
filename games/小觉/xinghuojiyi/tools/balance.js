/* ============================================================
 * 平衡性验证 —— tools/balance.js
 * ------------------------------------------------------------
 * 在无头环境里让「机器人玩家」真的打完一整局，用来回答：
 *   • 游戏能从开局正常走到结算吗？（不卡死、不报错）
 *   • 不同打法的胜率是多少？（不能无脑赢，也不能无脑死）
 *   • 三张星图之间有差异吗？
 *
 * 用法：node tools/balance.js [每组局数] [策略名]
 * ============================================================ */
'use strict';
const { createEnv } = require('./harness');

/* ---------------- 机器人策略 ---------------- */
const STRATEGIES = {
  balanced: { label: '均衡型', w: { fuel: 100, ore: 70, turret: 55, ward: 20 }, react: 0.8 },
  economy: { label: '经济流', w: { fuel: 110, ore: 120, turret: 30, ward: 15 }, react: 0.8 },
  turtle: { label: '龟缩型', w: { fuel: 90, ore: 60, turret: 120, ward: 80 }, react: 0.8, nearCore: 320 },
  random: { label: '随机型', w: null, react: 1.6 }
};

function playOne(opts) {
  const env = createEnv();
  const X = env.game();
  const G = X.G;
  const S = STRATEGIES[opts.strategy] || STRATEGIES.balanced;
  const dt = 1 / 30;   // 平衡测试用 30fps，快一倍且不影响结果（逻辑全用 dt 驱动）
  const maxSeconds = opts.maxSeconds || 400;

  X.newRun(opts.constel, opts.seed);

  let reactTimer = 0;
  let frames = 0;

  while (G.state === 'playing' && frames < 60 * maxSeconds) {
    env.step(1, dt);
    frames++;
    reactTimer -= dt;
    if (reactTimer > 0) continue;
    reactTimer = S.react;

    const cands = [];
    for (let i = 0; i < G.nodes.length; i++) {
      const n = G.nodes[i];
      if (n.on) continue;
      if (!env.canLightTest(i)) continue;
      const cost = X.costsOf(n).total;
      if (G.dust < cost) continue;
      if (S.nearCore && Math.hypot(n.x - 480, n.y - 320) > S.nearCore) continue;
      cands.push({ i, n, cost });
    }
    if (!cands.length) continue;

    let best = -1, bestScore = -1e9;
    for (const c of cands) {
      let s;
      if (S.w) {
        s = S.w[c.n.type] || 0;
        const hop = G.hops[c.i];
        if (hop < 1e8) s += Math.min(hop, 3) * 8;
        s -= c.cost * 0.8;
      } else {
        s = Math.random() * 100;
      }
      if (s > bestScore) { bestScore = s; best = c.i; }
    }
    if (best >= 0) X.lightNode(best);
  }

  return {
    state: G.state,
    win: G.coreHp > 0 && G.state === 'result',
    wave: G.wave,
    hp: G.coreHp,
    score: G.score,
    lit: G.litTotal,
    kills: G.kills,
    relics: G.relics.length,
    eaten: G.stats.eaten,
    leaked: G.stats.leaked,
    errors: env.errors.length,
    errorSample: env.errors.slice(0, 2),
    timedOut: frames >= 60 * maxSeconds
  };
}

if (require.main === module) {
  const N = parseInt(process.argv[2] || '12', 10);
  const onlyStrategy = process.argv[3];

  const constels = ['bella', 'diana', 'eileen'];
  const strategies = onlyStrategy ? [onlyStrategy] : Object.keys(STRATEGIES);

  console.log('每组 ' + N + ' 局 · 单局上限 15 分钟游戏时间\n');
  const pad = (s, n) => String(s).padStart(n);
  let totalErrors = 0, totalTimeouts = 0;
  const rows = [];

  for (const cs of constels) {
    for (const st of strategies) {
      const results = [];
      for (let k = 0; k < N; k++) {
        const r = playOne({ strategy: st, constel: cs, seed: 100 + k * 37 });
        results.push(r);
        totalErrors += r.errors;
        if (r.timedOut) totalTimeouts++;
        if (r.errors) console.log('  !! 报错:', st, cs, JSON.stringify(r.errorSample));
      }
      const n = results.length;
      const wins = results.filter(r => r.win).length;
      const avg = f => results.reduce((a, r) => a + f(r), 0) / n;
      const row = {
        key: cs + ' / ' + st,
        win: (wins / n * 100).toFixed(0) + '%',
        wave: avg(r => r.wave).toFixed(2),
        hp: avg(r => r.hp).toFixed(0),
        lit: avg(r => r.lit).toFixed(1),
        kills: avg(r => r.kills).toFixed(0),
        score: avg(r => r.score).toFixed(0),
        eaten: avg(r => r.eaten).toFixed(1),
        leaked: avg(r => r.leaked).toFixed(1)
      };
      rows.push(row);
      console.log(
        row.key.padEnd(16),
        '胜率 ' + pad(row.win, 4),
        '| 波次 ' + pad(row.wave, 4),
        '| 残血 ' + pad(row.hp, 3),
        '| 点亮 ' + pad(row.lit, 4),
        '| 击杀 ' + pad(row.kills, 3),
        '| 被啃 ' + pad(row.eaten, 3),
        '| 漏怪 ' + pad(row.leaked, 3),
        '| 分 ' + pad(row.score, 5)
      );
    }
    console.log('');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('脚本错误总数:', totalErrors, '| 超时未结算:', totalTimeouts);

  const byStrat = {};
  for (const r of rows) {
    const st = r.key.split(' / ')[1];
    (byStrat[st] = byStrat[st] || []).push(parseInt(r.win));
  }
  console.log('\n策略平均胜率:');
  for (const st in byStrat) {
    const a = byStrat[st];
    console.log('  ' + st.padEnd(10), (a.reduce((x, y) => x + y, 0) / a.length).toFixed(0) + '%');
  }
}

module.exports = { playOne, STRATEGIES };