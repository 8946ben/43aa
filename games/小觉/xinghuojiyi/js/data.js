/* ============================================================
 * 《星火机忆 · Spark Engine》 数据配置 —— js/data.js
 * ------------------------------------------------------------
 * 所有数值（星图 / 节点 / 遗物 / 机群 / 波次 / 台词）集中于此，
 * 方便调参与平衡。本文件只放数据与说明文字，不含游戏逻辑。
 *
 * 玩法一句话：地图上一张无向图，你只有一个会走的「火种」，
 * 每回合把它点亮（激活）一个节点：资源节点产出星尘，
 * 生产节点持续产燃料（供给断了就变暗），火力 / 护盾节点
 * 沿连线自动索敌。撑过三波机群算活下来。
 * ============================================================ */
'use strict';

var DATA = (function () {

  /* ---------------- 全局配置 ---------------- */
  var CONF = {
    W: 960, H: 640,          // 内部分辨率
    nodeR: 26,               // 节点半径
    linkDist: 300,           // 自动连边的最大距离
    ringGap: 92,             // 核心周围的「机群生成环」内边界（连线不能横穿这里）
    coreLinkR: 150,          // 核心只连这个半径内的内环节点
    startDust: 13,           // 初始星尘：够连点 3 颗起手
    startFuel: 24,           // 初始燃料（约 24 秒缓冲）
    maxFuel: 60,             // 燃料上限
    coreR: 30,               // 核心半径
    firstWave: 20,           // 开局到第 1 波的秒数（够铺一条链路）
    waveGap: 30,             // 波与波之间的秒数
    maxWaves: 3,             // 三波后结算
    tickEvery: 1.0,          // 资源 / 燃料结算间隔（秒）
    leakDmg: 5,              // 敌弹命中核心的伤害
    litUpCost: 0,            // 未点亮节点首次点亮额外花费（0 = 只付基础造价）
    reviveCost: 2,           // 已熄灭（被啃食）节点的复燃花费
    fuelPerNode: 0.3,        // 每点亮 1 个节点，维持星图每 tick 多耗的燃料
    starveDmg: 0             // 燃料耗尽时核心每 tick 的损耗（0 = 不扣血，只停产）
  };

  /* ---------------- 核心 ---------------- */
  var CORE = {
    x: 480, y: 320,
    name: '信标核心',
    hp: 120,
    shield: 0,               // 护盾（护盾节点提供）
    color: '#FFB347',
    desc: '你唯一的家。它破了，星图就灭了。'
  };

  /* ---------------- 节点类型 ----------------
   * 每类节点的基础数值；所有数值都会随「星图」(constellation) 缩放。
   */
  var NODE_TYPES = {
    /* 星尘源：吸附相连且被供给时，每 tick 产出 dust */
    ore: {
      key: 'ore', name: '星尘源', short: '尘', color: '#8FA8FF',
      cost: 3, hp: 26, dust: 2.0,
      desc: '产出星尘。若燃料耗尽会变暗停产。'
    },
    /* 生产器：吸附相连时每 tick 产出 fuel */
    fuel: {
      key: 'fuel', name: '生产器', short: '产', color: '#7BE0C4',
      cost: 3, hp: 34, fuel: 2.2,
      desc: '把星尘点燃成燃料。吸附到核心即开始工作。'
    },
    /* 火力：吸附相连时自动射击射程内的敌群 */
    turret: {
      key: 'turret', name: '火力', short: '火', color: '#FF8B6B',
      cost: 4, hp: 40, dps: 30, range: 190,
      desc: '自动索敌射击。吸附相连才开火。'
    },
    /* 护盾：吸附相连时为核心提供护盾并缓慢修复 */
    ward: {
      key: 'ward', name: '护盾', short: '盾', color: '#C9A0FF',
      cost: 4, hp: 34, shield: 7, heal: 1.0,
      desc: '为核心补充护盾并缓慢修复。吸附相连才生效。'
    }
  };
  var TYPE_ORDER = ['ore', 'fuel', 'turret', 'ward'];

  /* ---------------- 遗物（点亮时随机附赠，即时生效） ---------------- */
  var RELICS = {
    crit:      { key: 'crit',      name: '折射棱镜', color: '#FFE08A', desc: '火力伤害 +15%' },
    quick:     { key: 'quick',     name: '超频齿轮', color: '#8FE3FF', desc: '火力射速 +20%' },
    harvest:   { key: 'harvest',   name: '丰饶之种', color: '#9CF0B0', desc: '星尘产出 +25%' },
    condenser: { key: 'condenser', name: '冷凝环',   color: '#7BE0C4', desc: '燃料产出 +25%' },
    prism:     { key: 'prism',     name: '远望之瞳', color: '#FFB0D8', desc: '火力射程 +18%' },
    battery:   { key: 'battery',   name: '蓄能池',   color: '#C9A0FF', desc: '全场节点生命 +20%' },
    bloom:     { key: 'bloom',     name: '星火之种', color: '#FFC46B', desc: '立即 +3 星尘 +6 燃料' }
  };
  var RELIC_KEYS = ['crit', 'quick', 'harvest', 'condenser', 'prism', 'battery', 'bloom'];

  /* ---------------- 机群（敌人） ---------------- */
  var ENEMIES = {
    /* 飘虫：慢速直飞，低血，成群 */
    mote: {
      key: 'mote', name: '飘虫', hp: 32, speed: 30, speedJitter: 0.22,
      radius: 9, color: '#9B7BD6', ring: '#D9C6FF', dust: 1, fuel: 2, damage: 7,
      bite: 0, biteEvery: 0
    },
    /* 啃食者：优先扑向最近的节点啃食，血厚一点 */
    chewer: {
      key: 'chewer', name: '啃食者', hp: 58, speed: 28, speedJitter: 0.18,
      radius: 11, color: '#C86A9E', ring: '#FFC8E2', dust: 1, fuel: 3, damage: 10,
      bite: 12, biteEvery: 0.85
    },
    /* 侵蚀体：血厚慢速，直奔核心 */
    brute: {
      key: 'brute', name: '侵蚀体', hp: 180, speed: 18, speedJitter: 0.1,
      radius: 15, color: '#6E4BC9', ring: '#B79BFF', dust: 2, fuel: 5, damage: 16,
      bite: 0, biteEvery: 0
    }
  };

  /* ---------------- 波次 ----------------
   * groups: [{type, weight}] —— 按权重随机抽取生成。
   */
  var WAVES = [
    {
      name: '第一波 · 浮游',
      greet: '星图边缘在响……第一批飘虫想搬走你的灯。',
      duration: 30, spawnMs: 560,
      groups: [
        { type: 'mote', weight: 8 },
        { type: 'chewer', weight: 2 }
      ]
    },
    {
      name: '第二波 · 啃食',
      greet: '它们学会了先啃灯，再吃核心。',
      duration: 32, spawnMs: 450,
      groups: [
        { type: 'mote', weight: 7 },
        { type: 'chewer', weight: 6 },
        { type: 'brute', weight: 2 }
      ]
    },
    {
      name: '第三波 · 星潮',
      greet: '最后一波。把整张星图都点亮吧。',
      duration: 36, spawnMs: 380,
      groups: [
        { type: 'mote', weight: 8 },
        { type: 'chewer', weight: 7 },
        { type: 'brute', weight: 5 }
      ]
    }
  ];

  /* ---------------- 星图（开局三选一） ---------------- */
  var CONSTELLATIONS = [
    {
      key: 'bella', name: '月 ÉCLAIR', owner: '贝拉',
      color: '#DB7D74',
      desc: '贝拉的月光加冕之图：火力更远、更容易看清战场。',
      mods: { oreDust: 1.0, fuelGain: 1.0, turretDps: 1.0, wardShield: 1.0, range: 1.14, nodeHp: 1.0, matchCost: 1.0 },
      hint: '每座火力的射程都很长，适合从远处点名。',
      quote: '「努力闪耀，让月光为我加冕。」'
    },
    {
      key: 'diana', name: '糖霜星云', owner: '嘉然',
      color: '#E799B0',
      desc: '嘉然的甜味星云：星尘更耐烧，燃料点一下就通。',
      mods: { oreDust: 1.28, fuelGain: 1.0, turretDps: 1.0, wardShield: 1.0, range: 1.0, nodeHp: 1.0, matchCost: 0.6 },
      hint: '星尘产出很富裕，点亮节点的花费也更便宜。',
      quote: '「今天也要顿顿解馋！」'
    },
    {
      key: 'eileen', name: '深潮宿命', owner: '乃琳',
      color: '#576690',
      desc: '乃琳的深潮星图：生产器效率极高，火力出手更狠。',
      mods: { oreDust: 1.0, fuelGain: 1.45, turretDps: 1.10, wardShield: 1.0, range: 1.0, nodeHp: 1.20, matchCost: 1.0 },
      hint: '燃料几乎不会断，节点也更耐啃。',
      quote: '「荷尔蒙甜蜜陷阱——开玩笑的。」'
    }
  ];

  /* ---------------- 台词库（气泡） ---------------- */
  var QUOTES = {
    firstLit: ['点起来了。', '灯，亮了。', '这个位置不错。'],
    lit: ['又亮了一颗。', '星图在扩大。'],
    dim: ['供给断了，它暗了。', '没人喂它就会熄。'],
    chewed: ['节点被啃了……', '那边失守了。'],
    eaten: ['它灭了。', '灯被吃掉了。'],
    waveStart: ['开始吧。', '来了。', '别慌，先保供给。'],
    waveClear: ['这波过去了。', '还活着。'],
    hit: ['核心在响。', '别破啊。'],
    win: ['三波都过去了。', '星图保住了。'],
    lose: ['灯……灭了。']
  };

  return {
    CONF: CONF,
    CORE: CORE,
    NODE_TYPES: NODE_TYPES,
    TYPE_ORDER: TYPE_ORDER,
    RELICS: RELICS,
    RELIC_KEYS: RELIC_KEYS,
    ENEMIES: ENEMIES,
    WAVES: WAVES,
    CONSTELLATIONS: CONSTELLATIONS,
    QUOTES: QUOTES
  };
})();