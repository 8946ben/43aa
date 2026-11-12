/* ============================================================================
   一个魂零食大作战（副题：深夜零食大作战 · 嘉然今天吃什么？）—— 数据配置
   由 game.js 读取的全局数据（经典 script 引入，无模块化）。
   ============================================================================ */

/* ----------------------------------------
 * 可玩角色（默认三人组）：贝拉 / 嘉然 / 乃琳
 * 心宜、思诺仅在通关庆典横幅中客串（见 VICTORY_BANNER）。
 * p 为真实生效的机制参数：
 *   orderBonus    订单内食物得分倍率
 *   comboCap      连击倍率上限
 *   timeBonus     每关额外时长（秒）
 *   swingMult     钩爪摆动速度倍率
 *   acaoStealFreq 阿草偷吃频率倍率（越小偷吃越少）
 *   acaoStunMult  阿草被钩住后的定身（离场）时间倍率
 *   bombMult      汽水罐爆炸时间惩罚倍率
 * ---------------------------------------- */
const CHAR_DEFS = {
  bella: {
    id: 'bella', name: '贝拉', en: 'Bella', title: '队长 · 加练', color: '#DB7D74',
    p: { orderBonus: 1.0, comboCap: 3.0, timeBonus: 10, swingMult: 1.15, acaoStealFreq: 1.0, acaoStunMult: 1.0, bombMult: 1.0 },
    passiveText: ['每关时长 +10 秒', '钩爪摆动速度 +15%'],
    imgs: {
      play: 'bellaJiayou', happy: 'bellaHahaha', excited: 'bellaKanwokeaima',
      dizzy: 'bellaHan', angry: 'bellaBietoulan', boom: 'bellaLeipa',
      sad: 'bellaWoyunle', win: 'bellaBixin'
    },
    quotes: {
      idle: ['每人加练一天！', '努力闪耀！', '贝拉队长，带队干饭！', '今晚也要加练哦~', '跟着队长有肉吃！'],
      stone: ['不会吧，石头？！', '呜…又磕到了！'],
      broccoli: ['不会吧，蔬菜？！', '贝拉拒绝健康陷阱！'],
      boom: ['不会吧！爆炸了！', '呜哇！汽水罐欺负人！'],
      acaoSteal: ['阿草！别偷懒！', '偷吃零食？加练一天！'],
      combo3: ['努力闪耀！', '这波加练不错！'],
      combo5: ['看我可爱吗！这才是实力！', '闪耀吧，贝拉！'],
      orderDone: ['订单完成！队长满意！', '干饭也要带队冲锋！'],
      timeLow: ['不会吧，要没时间了！', '快快快！加练加速！'],
      clear: ['努力闪耀，今晚达标！', '队长验收通过！'],
      fail: ['呜…每人加练一天…', '贝拉队长会再来的！']
    }
  },
  diana: {
    id: 'diana', name: '嘉然', en: 'Diana', title: '吃货', color: '#E799B0',
    p: { orderBonus: 1.2, comboCap: 4.0, timeBonus: 0, swingMult: 1.0, acaoStealFreq: 1.0, acaoStunMult: 1.0, bombMult: 1.0 },
    passiveText: ['订单食物得分 +20%', '连击倍率上限 ×4.0'],
    imgs: {
      play: 'ganfan', happy: 'liukoushui', excited: 'xindong',
      dizzy: 'bengbuzhule', angry: 'qiaoda', boom: 'fanqie',
      sad: 'chuitou', win: 'mua'
    }
    /* 台词直接使用下方 EVENT_QUOTES / IDLE_QUOTES（本作原版台词库） */
  },
  eileen: {
    id: 'eileen', name: '乃琳', en: 'Eileen', title: 'Queen · 控场', color: '#576690',
    p: { orderBonus: 1.0, comboCap: 3.0, timeBonus: 0, swingMult: 1.0, acaoStealFreq: 0.5, acaoStunMult: 2.0, bombMult: 0.5 },
    passiveText: ['阿草偷吃概率减半', '钩住定身 ×2 · 爆炸惩罚减半'],
    imgs: {
      play: 'eileenWink', happy: 'eileenTaixihuanle', excited: 'eileenNuwangdekending',
      dizzy: 'eileenXiaoxile', angry: 'eileenQuzhengzhong', boom: 'eileenJingxiaxiaonailin',
      sad: 'eileenYudaokunnan', win: 'eileenMua'
    },
    quotes: {
      idle: ['荷尔蒙甜蜜陷阱~', '通通打包！', '女王的深夜食堂', '乃琳酱看饿了哦~', '零食们，排队献上来吧~'],
      stone: ['哦？石头，无聊。', '本女王不搬石头。'],
      broccoli: ['蔬菜？退下吧。', '女王的餐桌上没有西兰花。'],
      boom: ['呀！小小汽水罐放肆！', '女王面前也敢爆炸？'],
      acaoSteal: ['取证中！阿草你偷吃？', '通通打包…也不分给你！'],
      combo3: ['甜蜜陷阱生效中~', '连击？女王的日常。'],
      combo5: ['女王的肯定♪', '不错，允许你继续。'],
      orderDone: ['通通打包，订单完成！', '女王的餐桌岂能有缺？'],
      timeLow: ['时间？女王从不着急。', '最后冲刺，通通打包！'],
      clear: ['女王的肯定，今晚满分！', '荷尔蒙甜蜜陷阱，成功！'],
      fail: ['呜…遇到困难了…', '下次…乃琳酱会更强的！']
    }
  }
};
const DEFAULT_CHAR = 'diana'; // 默认主角：嘉然
const CHAR_ORDER = ['bella', 'diana', 'eileen']; // 选人卡显示顺序

/* ----------------------------------------
 * 物品图鉴（全部 canvas 矢量绘制）
 * r    : 碰撞/绘制半径
 * w    : 重量（越大钩爪拉回越慢）
 * v    : 基础解馋值（西兰花为负=健康陷阱；石头几乎无价值还拖速）
 * bomb : 汽水罐，钩中立即爆炸
 * deep : 偏好出现的深度带 0浅层 1中层 2深层（权重参考）
 * ---------------------------------------- */
const ITEM_DEFS = {
  candy:    { name: '嘉心糖',   r: 13, w: 0.55, v: 160,  deep: 2, hint: '小而珍贵，越深越值钱' },
  chicken:  { name: '炸鸡',     r: 22, w: 1.2,  v: 80,   deep: 0, hint: '顿顿解馋的主食' },
  milktea:  { name: '奶茶',     r: 20, w: 1.45, v: 95,   deep: 1, hint: '深夜快乐水' },
  cake:     { name: '草莓蛋糕', r: 24, w: 1.65, v: 135,  deep: 1, hint: '甜度超标预警' },
  melon:    { name: '西瓜',     r: 32, w: 2.7,  v: 105,  deep: 1, hint: '大只中价，拉得很慢' },
  broccoli: { name: '西兰花',   r: 19, w: 1.25, v: -60,  deep: 0, hint: '健康陷阱！扣解馋值' },
  stone:    { name: '石头',     r: 25, w: 3.3,  v: 10,   deep: 0, hint: '又沉又没用的家伙' },
  soda:     { name: '汽水罐',   r: 17, w: 1.0,  v: 0,    deep: 0, hint: '炸弹！钩中会爆炸并震碎周围', bomb: true },
  hotpot:   { name: '小火锅',   r: 36, w: 3.0,  v: 320,  deep: 2, hint: '周日大宴主角，深层限定' }
};

/* ----------------------------------------
 * 七天关卡（周一 ~ 周日）
 * order  : 今日菜单订单
 * target : 过关所需解馋值
 * time   : 限制时间（秒）
 * density: 场上物品数量
 * swing  : 钩爪摆动角速度（弧度/秒）
 * acao   : 阿草偷吃频率等级（越小越勤快）
 * ---------------------------------------- */
const LEVEL_DEFS = [
  { day: '周一', name: '开工小食',   time: 60, target: 320,  density: 11, swing: 1.30, acao: 13,
    order: [ ['chicken', 2] ] },
  { day: '周二', name: '奶茶时光',   time: 60, target: 460,  density: 13, swing: 1.40, acao: 12,
    order: [ ['milktea', 2], ['candy', 3] ] },
  { day: '周三', name: '甜度超标',   time: 60, target: 560,  density: 14, swing: 1.50, acao: 11,
    order: [ ['cake', 2], ['milktea', 2] ] },
  { day: '周四', name: '深夜放毒',   time: 60, target: 700,  density: 16, swing: 1.60, acao: 10.5,
    order: [ ['chicken', 2], ['milktea', 2], ['cake', 1] ] },
  { day: '周五', name: '干饭暴击',   time: 60, target: 860,  density: 17, swing: 1.70, acao: 10,
    order: [ ['cake', 2], ['candy', 5], ['chicken', 2] ] },
  { day: '周六', name: '囤粮大作战', time: 60, target: 1050, density: 19, swing: 1.80, acao: 9.5,
    order: [ ['milktea', 3], ['cake', 3], ['chicken', 3], ['candy', 4] ] },
  { day: '周日', name: '火锅大宴',   time: 60, target: 1300, density: 21, swing: 1.90, acao: 9,
    order: [ ['hotpot', 2], ['cake', 2], ['chicken', 2], ['milktea', 2] ] }
];

/* ----------------------------------------
 * 深度分带：物品按深度分层，越深越值钱
 * ---------------------------------------- */
const DEPTH_BANDS = [
  { y0: 195, y1: 330, label: '浅层' },
  { y0: 330, y1: 480, label: '中层' },
  { y0: 480, y1: 595, label: '深层' }
];

/* 各深度带物品刷新权重（键=物品id） */
const BAND_WEIGHTS = [
  { candy: 2.0, chicken: 3.0, milktea: 1.0, cake: 0.4, melon: 0.4, broccoli: 2.2, stone: 2.0, soda: 1.6, hotpot: 0 },
  { candy: 1.6, chicken: 1.6, milktea: 3.0, cake: 2.2, melon: 2.2, broccoli: 1.6, stone: 1.8, soda: 2.0, hotpot: 0 },
  { candy: 3.0, chicken: 0.8, milktea: 0.8, cake: 3.0, melon: 1.8, broccoli: 1.0, stone: 1.8, soda: 2.4, hotpot: 2.2 }
];

/* ----------------------------------------
 * 嘉然台词气泡（随机弹出 & 事件触发）
 * ---------------------------------------- */
const IDLE_QUOTES = [
  '顿顿解馋！', '今天吃什么？', '嗷呜~', '好吃到转圈圈~',
  '关注嘉然，顿顿解馋！', '嘉心糖在哪里呀~', '深夜放毒时间到！',
  '这个看起来好好吃！', '肚子已经开始唱歌了…', '干饭人，干饭魂！'
];

const EVENT_QUOTES = {
  combo3:    [ '连击达成！转圈圈~', '嗷呜嗷呜！停不下来！' ],
  combo5:    [ '好吃到飞起来啦！！', '这波是干饭暴击！' ],
  stone:     [ '呜…磕到牙了啦！', '石头不能吃哦！！' ],
  broccoli:  [ '健康陷阱！快逃！', '西兰花…嘉然拒绝！' ],
  boom:      [ '嗷呜！爆炸啦！！', '汽水罐惹不起惹不起！' ],
  acaoSteal: [ '阿草！那是我的炸鸡！', '阿草你再吃试试看！', '我的零食——！！' ],
  acaoCaught:[ '抓到你啦，小偷阿草！', '阿草：喵呜…（理直气壮）' ],
  orderDone: [ '订单完成！开饭啦~', '全部凑齐！嘉然最强！' ],
  timeLow:   [ '要、要来不及了！', '快点快点快点！' ],
  clear:     [ '顿顿解馋，今晚达标！', '嗷呜~心满意足！' ],
  fail:      [ '呜…深夜干饭失败了…', '明天…明天一定解馋！' ]
};

/* 胜利庆典（五周年干饭庆典）的应援横幅，客串成员应援色 */
const VICTORY_BANNER = [
  { name: '嘉然 Diana', color: '#E799B0', text: '干饭庆典主厨' },
  { name: '贝拉 Bella', color: '#DB7D74', text: '拉拉队队长' },
  { name: '乃琳 Eileen', color: '#576690', text: '甜品品鉴官' },
  { name: '心宜', color: '#C93773', text: '气氛担当' },
  { name: '思诺', color: '#7252C0', text: '干饭见证人' }
];

/* 深夜地窖蘑菇点缀色（渲染用） */
const MUSHROOM_COLORS = [ '#6ee7d8', '#8f7bff', '#ff9ecf' ];

/* localStorage 键名 */
const LS_BEST_V2 = 'snackclaw_best_v2';       // 按角色的单关最高解馋值 {bella:{score,day}, diana:{...}, eileen:{...}}
const LS_BEST_V1 = 'snackclaw_best_v1';       // 旧版嘉然单角色纪录（仅用于迁移）
const LS_PROGRESS = 'snackclaw_progress_v1';  // 关卡解锁进度（三人共享）{ unlocked: 1~7, char: 'diana' }
