/* ========================================================================
 * 一个魂 · 购物之夜 —— 数据文件
 * 内容：迷宫字符画（3 张）、角色定义（5 人）、关卡数值、打烊礼盒参数。
 * 以 <script> 全局变量方式供 game.js 使用，无任何模块/依赖。
 * ========================================================================
 * 迷宫字符说明：
 *   '#'  墙体            '.'  珠宝豆（小豆，10 分）
 *   'o'  大颗奶油宝石（能量豆，50 分，触发甜蜜陷阱）
 *   ' '  可通行空地（无豆）  'T'  隧道格（走到边界左右传送）
 *   '='  鬼屋门（只有鬼可穿过，玩家不可进入）
 * 三张迷宫均为 21 列 × 23 行，左右镜像对称。
 * ======================================================================== */

'use strict';

/* ---------- 打烊礼盒（原创机制）参数 ---------- */
var GIFT_CONFIG = {
  thresholds: [40, 70, 100], // 每关累计吃豆数达到阈值时，中央刷出礼盒
  score: 500,                // 礼盒分值
  lifetime: 8,               // 礼盒存在时间（秒）
  tile: { c: 10, r: 13 }     // 刷出位置：迷宫中央（鬼屋下方路口）
};

/* ---------- 玩家 / 鬼的基础数值 ---------- */
var TUNING = {
  playerSpeed: 7.3,          // 玩家基础速度（格/秒）
  bellaSpeedMul: 1.08,       // 贝拉被动：+8%
  gladysBoostMul: 1.5,       // 思诺隧道加速倍率
  gladysBoostTime: 1.5,      // 思诺隧道加速时长（秒）
  gladysStunTime: 0.5,       // 思诺声波震慑：鬼僵直时长（秒）
  eileenShield: 1,           // 乃琳每局护身次数
  eileenFrightTime: 3,       // 护身触发的全场恐惧时长（秒）
  dianaFrightBonus: 2,       // 嘉然能量豆延长时间（秒）
  fionaGhostMul: 2,          // 心宜反吃鬼得分倍率
  ghostChainScores: [200, 400, 800, 1600], // 连吃鬼分数
  invincibleAfterDeath: 2,   // 死亡重生后的短暂无敌（秒）
  lives: 3                   // 初始生命
};

/* ---------- 三张手工迷宫（左右对称字符画） ---------- */
var MAZES = [
  {
    name: '第一站 · 商场一层',
    accent: '#4353e0',                 // 墙体霓虹描边色
    tunnelRow: 10,                     // 隧道所在行（左右传送）
    ghostSpeed: 5.9,                   // 鬼基础速度（格/秒）
    frightTime: 7,                     // 能量豆甜蜜陷阱时长（秒）
    releaseTimes: [0, 1.5, 4, 7],      // 四鬼出屋错峰时间（秒）
    rows: [
      '#####################',
      '#.........#.........#',
      '#.###.###.#.###.###.#',
      '#o.................o#',
      '#.###.#.#####.#.###.#',
      '#.....#...#...#.....#',
      '#####.##.....##.#####',
      '####.............####',
      '####.#.##===##.#.####',
      '####.#.#     #.#.####',
      'TT.....#     #.....TT',
      '####.#.#     #.#.####',
      '####.#.#######.#.####',
      '####.............####',
      '#####.##.#.#.##.#####',
      '#.....#.......#.....#',
      '#.###.#.#.#.#.#.###.#',
      '#o.................o#',
      '#.##.####.#.####.##.#',
      '#.........#.........#',
      '#.###.###.#.###.###.#',
      '#...................#',
      '#####################'
    ]
  },
  {
    name: '第二站 · 中庭花园',
    accent: '#9a4fe0',
    tunnelRow: 10,
    ghostSpeed: 6.5,
    frightTime: 5,
    releaseTimes: [0, 1.2, 3.2, 5.6],
    rows: [
      '#####################',
      '#...................#',
      '#.##.###.#.#.###.##.#',
      '#o#...............#o#',
      '#.#.#####.#.#####.#.#',
      '#.#.....#...#.....#.#',
      '#.##.#.........#.##.#',
      '#...................#',
      '####.#.##===##.#.####',
      '####.#.#     #.#.####',
      'TT.....#     #.....TT',
      '####.#.#     #.#.####',
      '####.#.#######.#.####',
      '####.............####',
      '####.####.#.####.####',
      '#......#.....#......#',
      '#.####....#....####.#',
      '#o.................o#',
      '#.###.####.####.###.#',
      '#...................#',
      '#.#.###.##.##.###.#.#',
      '#...................#',
      '#####################'
    ]
  },
  {
    name: '第三站 · 天台货场',
    accent: '#2f9fe0',
    tunnelRow: 10,
    ghostSpeed: 7.1,
    frightTime: 3,
    releaseTimes: [0, 1.0, 2.6, 4.6],
    rows: [
      '#####################',
      '#.........#.........#',
      '#.#####.#.#.#.#####.#',
      '#o..###.#...#.###..o#',
      '#.#.###.......###.#.#',
      '#...####.#.#.####...#',
      '#.######.....######.#',
      '#...................#',
      '####.#.##===##.#.####',
      '####.#.#     #.#.####',
      'TT.....#     #.....TT',
      '####.#.#     #.#.####',
      '####.#.#######.#.####',
      '####.............####',
      '####.#.#######.#.####',
      '#......#..#..#......#',
      '#.###..#.....#..###.#',
      '#o.................o#',
      '#.###.####.####.###.#',
      '#...................#',
      '#.###.###.#.###.###.#',
      '#...................#',
      '#####################'
    ]
  }
];

/* ---------- 可选角色定义 ----------
 * unlockAt：累计总分达到后解锁（0 = 默认可选）。
 * img    ：菜单卡片头像（表情包或公式照）。
 * bubble ：过场气泡用图。win/lose：结算立绘。
 * style  ：canvas 矢量 Q 版造型的发型差异标记。
 */
var CHARACTERS = [
  {
    id: 'bella', name: '贝拉', en: 'Bella',
    color: '#DB7D74', hair: '#c96b62',
    role: '队长 · 舞担',
    quote: '每人加练一天！',
    passive: '移动速度 +8%（舞担身法）',
    unlockAt: 0,
    img: 'assets/bella_ok.png',
    bubble: 'assets/bella_jiayou.png',
    winImg: 'assets/bella_ok.png',
    loseImg: 'assets/bella_tuolajixiashan.png',
    style: { ahoge: true, pin: true }
  },
  {
    id: 'diana', name: '嘉然', en: 'Diana',
    color: '#E799B0', hair: '#e78ba4',
    role: '吃货担当',
    quote: '顿顿解馋，通通打包！',
    passive: '能量豆持续时间 +2 秒（吃货专注）',
    unlockAt: 0,
    img: 'assets/diana_xindong.png',
    bubble: 'assets/diana_ganfan.png',
    winImg: 'assets/diana_liukoushui.png',
    loseImg: 'assets/diana_bengbuzhule.png',
    style: { buns: true }
  },
  {
    id: 'eileen', name: '乃琳', en: 'Eileen',
    color: '#576690', hair: '#4a5980',
    role: '御姐 Queen',
    quote: '荷尔蒙甜蜜陷阱，等你来临',
    passive: '每局 1 次「甜蜜陷阱护身」：被抓瞬间自动消耗，全场鬼恐惧 3 秒',
    unlockAt: 0,
    img: 'assets/eileen_nuwangdekending.png',
    bubble: 'assets/eileen_haohuainuren.png',
    winImg: 'assets/eileen_wink.png',
    loseImg: 'assets/eileen_xiaohuli.png',
    style: { long: true }
  },
  {
    id: 'fiona', name: '心宜', en: 'Fiona',
    color: '#C93773', hair: '#b52f64',
    role: '二期 · 元气担当',
    quote: '所有目光看向我！',
    passive: '反吃鬼得分 ×2（动捕杀手）',
    unlockAt: 8000,
    img: 'assets/fiona_official.jpg',
    bubble: 'assets/fiona_official.jpg',
    winImg: 'assets/fiona_official.jpg',
    loseImg: 'assets/fiona_official.jpg',
    style: { tails: true }
  },
  {
    id: 'gladys', name: '思诺', en: 'Gladys',
    color: '#7252C0', hair: '#6146a8',
    role: '二期 · 声乐担当',
    quote: '让海听见我的声音',
    passive: '穿越隧道时 1.5 秒加速，且鬼僵直 0.5 秒（声波震慑）',
    unlockAt: 15000,
    img: 'assets/sinuo_official.jpg',
    bubble: 'assets/sinuo_official.jpg',
    winImg: 'assets/sinuo_official.jpg',
    loseImg: 'assets/sinuo_official.jpg',
    style: { long: true, band: true }
  }
];

/* ---------- 鬼（小黑子 ×3 + 阿草）定义 ----------
 * personality: chase=直线追击 / ambush=埋伏截击(预测玩家前方4格) /
 *              random=随机游走 / patrol=巡逻(玩家靠近时凑热闹加速)
 */
var GHOSTS_DEF = [
  { id: 'A', name: '小黑子A', kind: 'bazi', color: '#5f7057', personality: 'chase' },
  { id: 'B', name: '小黑子B', kind: 'bazi', color: '#74896d', personality: 'ambush' },
  { id: 'C', name: '小黑子C', kind: 'bazi', color: '#48584a', personality: 'random' },
  { id: 'acao', name: '阿草', kind: 'ferret', color: '#f5f1e8', personality: 'patrol' }
];

/* 阿草巡逻路线（四角），三张迷宫中这些格子均可通行 */
var PATROL_POINTS = [
  { c: 1, r: 1 }, { c: 19, r: 1 }, { c: 19, r: 21 }, { c: 1, r: 21 }
];

/* 玩家出生点（鬼屋下方中央路口，三张迷宫一致） */
var PLAYER_START = { c: 10, r: 13 };

/* 鬼屋参数：门上沿外等待格 / 屋内中心（三张迷宫一致） */
var HOUSE = {
  doorOut: { c: 10, r: 7 },   // 出屋后的落脚格（门上方）
  eyesTarget: { c: 10, r: 7 },// 眼睛状态回屋的寻路目标
  centerX: 10,                // 屋内水平对齐列
  centerY: 10                 // 屋内中心行
};
