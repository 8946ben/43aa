/* ============================================================
 * 《守护五周年 · 应援防线》 数据配置 —— js/data.js
 * ------------------------------------------------------------
 * 所有数值（塔 / 敌人 / 波次 / 地图 / 素材清单）集中于此，
 * 方便调参与平衡。本文件只放数据与说明文字，不含游戏逻辑。
 * ============================================================ */
'use strict';

var DATA = (function () {

  /* ---------------- 全局配置 ---------------- */
  var CONF = {
    canvasW: 960,          // 画布宽
    canvasH: 640,          // 画布高
    startGold: 220,        // 初始应援值（金币）
    startLives: 10,        // 五周年舞台耐久
    firstGap: 10,          // 开局距第 1 波的秒数
    waveGap: 18,           // 波与波之间的间隔秒数
    earlyBonus: 2,         // 提前召唤：每剩余 1 秒奖励的应援值
    sellRate: 0.7          // 卖塔返还 70%
  };

  /* ---------------- 素材清单 ----------------
   * 均为本地文件（file:// 直接可用），已重命名为 ASCII 文件名。
   * flat: true 表示白底 JPG（心宜/思诺官方公式图），
   *       绘制时会先垫成员应援色再圆形裁剪放大裁边。
   */
  var ASSETS = {
    tower_bella:   { src: 'assets/tower_bella.png' },
    tower_diana:   { src: 'assets/tower_diana.png' },
    tower_eileen:  { src: 'assets/tower_eileen.png' },
    tower_fiona:   { src: 'assets/tower_fiona.jpg', flat: true },
    tower_gladys:  { src: 'assets/tower_gladys.jpg', flat: true },
    logo:          { src: 'assets/logo.png' },
    acao_kaixin:   { src: 'assets/acao_kaixin.png' },
    acao_kunrao:   { src: 'assets/acao_kunrao.png' },
    acao_keai:     { src: 'assets/acao_keai.png' },
    res_fail:      { src: 'assets/res_fail.png' },
    menu_bella:    { src: 'assets/menu_bella.png' },
    menu_diana:    { src: 'assets/menu_diana.png' },
    menu_eileen:   { src: 'assets/menu_eileen.png' },
    menu_xindian:  { src: 'assets/menu_xindian.png' },
    fun_tuola:     { src: 'assets/fun_tuola.png' },
    fun_biu:       { src: 'assets/fun_biu.png' },
    fun_mua:       { src: 'assets/fun_mua.png' }
  };

  /* ---------------- 地图路径 ----------------
   * 折线拐点（像素坐标）。敌人从左侧场外出生，
   * 沿蜿蜒路径进攻右侧的「五周年舞台」（终点）。
   */
  var PATH_POINTS = [
    [-40, 130], [170, 130], [170, 400], [400, 400], [400, 170],
    [640, 170], [640, 440], [860, 440], [860, 320]
  ];

  /* 可建空地（14 处，中心坐标，均已避开路径） */
  var BUILD_SPOTS = [
    [70, 64],   [230, 60],  [60, 240],  [60, 430],
    [240, 260], [255, 525], [320, 70],  [480, 60],
    [540, 290], [560, 560], [720, 60],  [780, 300],
    [740, 560], [850, 205]
  ];

  /* ---------------- 应援塔（五人全员） ----------------
   * levels 下标 0/1/2 对应 1/2/3 级；upCosts 为升到 2/3 级的费用。
   * bella   单体速射激光（高频低伤）
   * diana   抛物线蛋糕，范围溅射 + 减速
   * eileen  魅力光环持续伤害 + 周期魅惑定身
   * fiona   短距离高频冲击波（范围近战拦截）
   * gladys  直线穿透音波（贯穿一路，长射程）
   */
  var TOWERS = {
    bella: {
      key: 'bella', name: '贝拉 · 应援棒塔', member: '贝拉 Bella', color: '#DB7D74',
      cost: 80, upCosts: [70, 110],
      desc: '单体速射激光，高频低伤、指哪打哪，是前期最稳的点名输出。',
      quote: '「每人加练一天！」——贝武神说到做到，拖拉机都亲自开下山。',
      levels: [
        { dmg: 6,  interval: 0.50, range: 150 },
        { dmg: 11, interval: 0.42, range: 172 },
        { dmg: 18, interval: 0.34, range: 196 }
      ]
    },
    diana: {
      key: 'diana', name: '嘉然 · 投喂塔', member: '嘉然 Diana', color: '#E799B0',
      cost: 100, upCosts: [85, 130],
      desc: '抛出奶油蛋糕，落点范围溅射，并把敌人"喂撑"而减速，攻控一体。',
      quote: '「顿顿解馋！」——嘉心糖管饱，虚无来了也别想饿着走。',
      levels: [
        { dmg: 14, interval: 1.50, range: 140, splash: 70, slow: 0.70, slowDur: 1.4 },
        { dmg: 24, interval: 1.35, range: 156, splash: 82, slow: 0.62, slowDur: 1.6 },
        { dmg: 40, interval: 1.15, range: 175, splash: 95, slow: 0.55, slowDur: 1.8 }
      ]
    },
    eileen: {
      key: 'eileen', name: '乃琳 · 魅力塔', member: '乃琳 Eileen', color: '#576690',
      cost: 120, upCosts: [100, 150],
      desc: '魅力光环持续灼烧范围内所有敌人，并周期性魅惑定身一小段路。',
      quote: '「荷尔蒙甜蜜陷阱」——坏女人的魅力，先定住再慢慢收账。',
      levels: [
        { dps: 8,  range: 115, charmEvery: 3.5, charmDur: 0.7 },
        { dps: 15, range: 130, charmEvery: 3.5, charmDur: 1.0 },
        { dps: 26, range: 150, charmEvery: 3.5, charmDur: 1.4 }
      ]
    },
    fiona: {
      key: 'fiona', name: '心宜 · 劲舞塔', member: '心宜 Fiona', color: '#C93773',
      cost: 90, upCosts: [75, 115],
      desc: '短距离高频冲击波，对范围内全体造成伤害，近身拦截的堵门利器。',
      quote: '「所有目光看向我！」——动捕杀手一开麦，全场节拍都得跟上。',
      levels: [
        { dmg: 12, interval: 0.90, range: 100 },
        { dmg: 22, interval: 0.78, range: 115 },
        { dmg: 38, interval: 0.62, range: 132 }
      ]
    },
    gladys: {
      key: 'gladys', name: '思诺 · 高音塔', member: '思诺 Gladys', color: '#7252C0',
      cost: 140, upCosts: [115, 175],
      desc: '直线穿透音波，贯穿一路上所有敌人，射程极远，专治密集队形。',
      quote: '「让海听见我的声音！」——枝江邓紫棋的高音，穿透一切杂音。',
      levels: [
        { dmg: 26, interval: 1.60, range: 235 },
        { dmg: 46, interval: 1.45, range: 265 },
        { dmg: 80, interval: 1.25, range: 295 }
      ]
    }
  };

  /* 环形菜单中五座塔的排布顺序（自顶部顺时针） */
  var TOWER_ORDER = ['bella', 'diana', 'eileen', 'fiona', 'gladys'];

  /* ---------------- 敌人（虚无 & 小黑子） ----------------
   * hp    基础血量           speed  基础移速(px/s)
   * gold  击杀掉落应援值      lives  突破舞台时扣掉的耐久
   * r     绘制/索敌半径       sprint 节奏风暴专属：周期性冲刺
   * boss  虚无之主：光环加速周围小怪，对减速/魅惑有抗性
   */
  var ENEMIES = {
    douzi: {
      key: 'douzi', name: '黑子豆豆', hp: 60, speed: 60, gold: 6, lives: 1, r: 13,
      desc: '想吹灭灯牌的小豆豆，成群结队的基础杂兵。'
    },
    gongshou: {
      key: 'gongshou', name: '杠精弓手', hp: 45, speed: 95, gold: 7, lives: 1, r: 12,
      desc: '嘴比腿快，键盘弓连射冷箭，移速很快、血量偏薄。'
    },
    nvgong: {
      key: 'nvgong', name: '数据女工', hp: 26, speed: 72, gold: 4, lives: 1, r: 10,
      desc: '深夜搬砖刷数据的小兵，血薄量大，最考验群体的火力覆盖。'
    },
    fengbao: {
      key: 'fengbao', name: '节奏风暴', hp: 95, speed: 80, gold: 12, lives: 1, r: 12, sprint: true,
      desc: '被节奏带飞的漩涡，会周期性冲刺（速度翻倍），小心被它超车。'
    },
    tanke: {
      key: 'tanke', name: '虚无坦克', hp: 520, speed: 34, gold: 22, lives: 2, r: 18,
      desc: '由"没必要看吧"凝聚成的重型单位，又硬又慢，突破一次撞掉 2 点耐久。'
    },
    boss: {
      key: 'boss', name: '虚无之主', hp: 4200, speed: 30, gold: 200, lives: 3, r: 26, boss: true,
      desc: '第 15 波压轴登场。技能「冷言冷语」：周期性让周围小怪加速冲刺；对减速与魅惑有抗性。'
    }
  };

  /* ---------------- 15 波出怪表（数据驱动） ----------------
   * groups: t=敌人类型  n=数量  iv=出怪间隔(秒)  d=本组开始延迟(秒)  m=血量倍率
   * bonus:  清波奖励应援值
   *
   * 收支设计思路：初始 220 金前两波只够 2 座塔；
   * 中期(4~9 波)击杀+清波奖励足以扩到 4~5 座塔并点起升级；
   * 后期(10~15 波)奖励陡增但多路高压，逼玩家在"补塔覆盖"与
   * "集中升级"之间做取舍。
   */
  var WAVES = [
    { bonus: 30,  groups: [
        { t: 'douzi', n: 8, iv: 1.2, d: 0, m: 1 }
    ] },
    { bonus: 34,  groups: [
        { t: 'douzi', n: 12, iv: 1.0, d: 0, m: 1.1 }
    ] },
    { bonus: 38,  groups: [
        { t: 'douzi', n: 8, iv: 1.0, d: 0, m: 1.1 },
        { t: 'gongshou', n: 5, iv: 1.1, d: 6, m: 1 }
    ] },
    { bonus: 42,  groups: [
        { t: 'nvgong', n: 12, iv: 0.55, d: 0, m: 1.2 }
    ] },
    { bonus: 46,  groups: [
        { t: 'gongshou', n: 8, iv: 0.9, d: 0, m: 1 },
        { t: 'douzi', n: 8, iv: 0.8, d: 4, m: 1.2 }
    ] },
    { bonus: 55,  groups: [
        { t: 'douzi', n: 10, iv: 0.9, d: 0, m: 1.3 },
        { t: 'tanke', n: 1, iv: 1, d: 3, m: 1 }
    ] },
    { bonus: 58,  groups: [
        { t: 'nvgong', n: 14, iv: 0.5, d: 0, m: 1.3 },
        { t: 'gongshou', n: 6, iv: 1.0, d: 5, m: 1.1 }
    ] },
    { bonus: 65,  groups: [
        { t: 'gongshou', n: 8, iv: 0.8, d: 1, m: 1.1 },
        { t: 'tanke', n: 2, iv: 6, d: 2, m: 1.05 }
    ] },
    { bonus: 70,  groups: [
        { t: 'fengbao', n: 6, iv: 1.6, d: 0, m: 1 },
        { t: 'nvgong', n: 10, iv: 0.5, d: 6, m: 1.3 }
    ] },
    { bonus: 80,  groups: [
        { t: 'douzi', n: 12, iv: 0.7, d: 0, m: 1.6 },
        { t: 'tanke', n: 3, iv: 5, d: 3, m: 1.1 }
    ] },
    { bonus: 85,  groups: [
        { t: 'fengbao', n: 8, iv: 1.2, d: 0, m: 1.05 },
        { t: 'gongshou', n: 8, iv: 0.8, d: 4, m: 1.4 }
    ] },
    { bonus: 95,  groups: [
        { t: 'nvgong', n: 16, iv: 0.45, d: 0, m: 1.75 },
        { t: 'tanke', n: 2, iv: 8, d: 2, m: 1.15 }
    ] },
    { bonus: 105, groups: [
        { t: 'fengbao', n: 10, iv: 1.0, d: 0, m: 1.2 },
        { t: 'douzi', n: 10, iv: 0.7, d: 2, m: 2.2 }
    ] },
    { bonus: 120, groups: [
        { t: 'tanke', n: 4, iv: 5, d: 0, m: 1.45 },
        { t: 'gongshou', n: 10, iv: 0.7, d: 2, m: 1.65 },
        { t: 'fengbao', n: 8, iv: 1.2, d: 6, m: 1.35 }
    ] },
    { bonus: 150, groups: [
        { t: 'boss', n: 1, iv: 1, d: 2, m: 1.35 },
        { t: 'fengbao', n: 12, iv: 1.6, d: 4, m: 1.3 },
        { t: 'nvgong', n: 12, iv: 0.6, d: 10, m: 1.5 }
    ] }
  ];

  return {
    CONF: CONF,
    ASSETS: ASSETS,
    PATH_POINTS: PATH_POINTS,
    BUILD_SPOTS: BUILD_SPOTS,
    TOWERS: TOWERS,
    TOWER_ORDER: TOWER_ORDER,
    ENEMIES: ENEMIES,
    WAVES: WAVES
  };
})();
