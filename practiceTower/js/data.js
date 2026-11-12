/* ============================================================
 * 加练魔塔 —— 数据层（js/data.js）
 * 楼层字符画 / 怪物图鉴 / 可玩主角 / 道具 / 商店 / 剧情 全部数据驱动。
 * 纯静态、零依赖，普通 <script> 引入，无 ES module。
 * ============================================================ */

'use strict';

/** 全局塔配置 */
const TOWER_CFG = {
  cols: 13,          // 地图列数
  rows: 11,          // 地图行数
  cell: 56,          // 单格像素
  saveKey: 'ptower_save_v2',   // 存档 localStorage 键（v2 起含主角 member，不迁移 v1 旧档）
  startBombs: 2,     // 「炸弹」道具初始数量：直接跳过一场战斗
};

/* ------------------------------------------------------------
 * 可玩主角（默认三人组）。初始数值与专属被动均经三主角全清模拟验证：
 *   贝拉：均衡起步，被动「带头加练」滚雪球，体验最顺
 *   嘉然：1400 血肉盾起步攻低，被动回复×1.5，全程损耗大但稳
 *   乃琳：800 血最脆但攻最高，boss 战吃「威慑」加成，商店有折扣
 * 图片字段存 assets/ 下裸文件名（不含扩展名）。
 * ----------------------------------------------------------- */
const MEMBERS = {
  bella: {
    id: 'bella', name: '贝拉', color: '#DB7D74', role: '队长 · 舞担',
    hp: 1000, atk: 13, def: 13, keyY: 1,
    passives: [
      { name: '带头加练', desc: '每场战斗若预计无损获胜（损血 0），舞力 +1' },
    ],
    imgCard: 'bella_dame',            // 选择卡 / 侧栏头像
    imgTalk: 'bella_tuolajixiashan',  // 标题大立绘
    imgDead: 'bella_leipa',
    imgCrown: 'bella_beijixing',
    imgHeart: 'bella_bixin',
    fans: '贝极星',
    endingLine: '队长认证：这场加练，属于每一个不肯偷懒的今天。',
  },
  diana: {
    id: 'diana', name: '嘉然', color: '#E799B0', role: '吃货 · 治愈担当',
    hp: 1400, atk: 10, def: 10, keyY: 2,
    passives: [
      { name: '能量便当', desc: '能量饮料 / 便当类回复效果 ×1.5；初始额外 1 把黄钥匙' },
    ],
    imgCard: 'diana_ganfan',
    imgTalk: 'diana_ganfan',
    imgDead: 'diana_chuitousangqi',
    imgCrown: 'diana_bixin',
    imgHeart: 'diana_bixin',
    fans: '嘉心糖',
    endingLine: '干饭王认证：吃饱了才有力气加练——这一路，嘉心糖陪你吃完了！',
  },
  eileen: {
    id: 'eileen', name: '乃琳', color: '#576690', role: 'Queen · 坏女人',
    hp: 800, atk: 15, def: 11, keyY: 1,
    passives: [
      { name: '女王折扣', desc: 'Queen 商店所有价格 -20%' },
      { name: '威慑', desc: '对 BOSS 类敌人的每回合伤害 +20%' },
    ],
    imgCard: 'eileen_nuwangdekending',
    imgTalk: 'eileen_nuwangdekending',
    imgDead: 'eileen_guzhang',
    imgCrown: 'eileen_taixihuanle',
    imgHeart: 'eileen_wink',
    fans: '乃淇淋',
    endingLine: 'Queen 认证：本 Queen 偶尔亲自出马，是为了教你——努力不该打折。',
  },
};

/* ------------------------------------------------------------
 * 怪物图鉴：确定性数值战斗（伤害 = 攻-防，回合制，玩家先手）
 * hp/atk/def 与 js/ 目录同级的推演脚本校准，全链路可通关。
 * quip：图鉴一行吐槽。
 * ----------------------------------------------------------- */
const MONS = {
  slime: {
    name: '拖延症史莱姆', hp: 40, atk: 15, def: 2, coin: 2,
    color: '#8FBF6B', glyph: '拖',
    quip: '「明天再练」是它唯一的人生信条。',
  },
  bat: {
    name: '敷衍蝙蝠', hp: 35, atk: 18, def: 3, coin: 3,
    color: '#B08FD0', glyph: '蝙',
    quip: '动作是有的，力度是没有的。',
  },
  sophist: {
    name: '杠精', hp: 60, atk: 21, def: 6, coin: 5,
    color: '#C97A5A', glyph: '杠',
    quip: '你说跳得好，它偏说「跳了但没完全跳好」。',
  },
  hater: {
    name: '小黑子', hp: 75, atk: 25, def: 9, coin: 8,
    color: '#5A5A66', glyph: '黑',
    quip: '只会打「油」，拿不出一支完整的舞。',
  },
  dataworker: {
    name: '数据女工', hp: 100, atk: 30, def: 12, coin: 10,
    color: '#4E8FC9', glyph: '工',
    quip: '凌晨三点还在打投，是可敬的同类。',
  },
  lazybone: {
    name: '懒筋怪', hp: 120, atk: 32, def: 12, coin: 12,
    color: '#B8A23A', glyph: '懒',
    quip: '寄生在腿上，专治「今日加练」。',
  },
  crawler: {
    name: '阴暗爬行怪', hp: 160, atk: 40, def: 17, coin: 14,
    color: '#6E5A78', glyph: '爬',
    quip: '阴暗地爬行，目的地是练习室。',
  },
  jelly: {
    name: '焦虑水母', hp: 200, atk: 48, def: 21, coin: 18,
    color: '#7AB8C9', glyph: '虑',
    quip: '它一靠近，就开始担心下周的数据。',
  },
  nihility: {
    name: '虚无残影', hp: 240, atk: 55, def: 25, coin: 24,
    color: '#8A8A9A', glyph: '虚',
    quip: '「练了有什么用？」——别信它的邪。',
  },
  slothling: {
    name: '惰怠幼虫', hp: 340, atk: 68, def: 33, coin: 32,
    color: '#9A4E7A', glyph: '幼',
    quip: '魔壬的幼体，孵化于每一次「先歇一会」。',
  },
  /* ---- 守关 / BOSS（hp 为 0 金币；胜利后触发剧情与加成） ---- */
  fiona: {
    name: '心宜', hp: 320, atk: 50, def: 16, coin: 0, boss: 'guard',
    color: '#C93773', glyph: '宜',
    quip: '二期舞担·动捕杀手。赢了她就服你。',
  },
  mirror: {
    name: '镜子里的自己', hp: 460, atk: 62, def: 26, coin: 0, boss: 'mid',
    color: '#3A3A46', glyph: '镜',
    quip: '「躺平不好吗？」——镜子第一次碎得这么响。',
  },
  gladys: {
    name: '思诺', hp: 700, atk: 82, def: 34, coin: 0, boss: 'guard',
    color: '#7252C0', glyph: '诺',
    quip: '枝江邓紫棋的声压，接住了就是同台。',
  },
  slothlord: {
    name: '惰怠魔壬', hp: 1100, atk: 95, def: 62, coin: 0, boss: 'final',
    color: '#4A2E5A', glyph: '惰',
    quip: '拖延症的化身，口号是「每人摸鱼一天」。',
  },
};

/* ------------------------------------------------------------
 * 地面道具（字符 → 效果）。金堆 o 的面额由每层 stack 字段决定。
 * ----------------------------------------------------------- */
const ITEMS = {
  R: { name: '舞蹈秘籍', kind: 'atk', val: 4,  color: '#D85A6A', glyph: '舞',
       msg: '拾取【舞蹈秘籍】：舞力 +4' },
  B: { name: '护膝',     kind: 'def', val: 4,  color: '#5A8FD8', glyph: '护',
       msg: '拾取【护膝】：护体 +4' },
  J: { name: '应援棒',   kind: 'both', val: 2, color: '#DB7D74', glyph: '援',
       msg: '拾取【应援棒】：舞力 +2、护体 +2' },
  s: { name: '能量饮料', kind: 'hp', val: 120, color: '#E8A0A8', glyph: '能',
       msg: '拾取【能量饮料】：体力 +120' },
  L: { name: '大瓶能量饮料', kind: 'hp', val: 300, color: '#D85A5A', glyph: '超',
       msg: '拾取【大瓶能量饮料】：体力 +300' },
  o: { name: '应援金',   kind: 'coin', val: 0, color: '#D8B84A', glyph: '金',
       msg: '拾取【应援金】' },   // val 运行时按层 stack 填
  Y: { name: '黄钥匙',   kind: 'key', val: 1, color: '#D8C05A', glyph: '黄',
       msg: '拾取【黄钥匙】（练习室门禁卡）' },
  Z: { name: '蓝钥匙',   kind: 'key', val: 1, color: '#5A9AD8', glyph: '蓝',
       msg: '拾取【蓝钥匙】（高级门禁卡）' },
  X: { name: '红钥匙',   kind: 'key', val: 1, color: '#D85A5A', glyph: '红',
       msg: '拾取【红钥匙】（核心室门禁卡）' },
};

/* ------------------------------------------------------------
 * NPC / 事件字符（地图上占一格，走向它触发）
 * ----------------------------------------------------------- */
const NPCS = {
  Q: { id: 'eileen', name: '乃琳Queen', color: '#576690',
       img: 'assets/eileen_nuwangdekending.png', kind: 'shop' },
  W: { id: 'diana', name: '嘉然', color: '#E799B0',
       img: 'assets/diana_ganfan.png', kind: 'gift' },
  F: { id: 'fiona', name: '心宜', color: '#C93773',
       img: 'assets/fiona_gongshi.jpg', kind: 'guard', mon: 'fiona' },
  G: { id: 'gladys', name: '思诺', color: '#7252C0',
       img: 'assets/sinuo_gongshi.jpg', kind: 'guard', mon: 'gladys' },
  N: { id: 'mirror', name: '镜子里的自己', color: '#3A3A46',
       img: 'assets/bella_hengheng.png', kind: 'guard', mon: 'mirror' },
  V: { id: 'slothlord', name: '惰怠魔壬', color: '#4A2E5A',
       img: '', kind: 'guard', mon: 'slothlord' },   // 魔壬用 canvas 绘制
  M: { id: 'acao', name: '阿草', color: '#8FBF6B',
       img: 'assets/acao_gongzuozhong.png', kind: 'hint' },
  T: { id: 'spotlight', name: '聚光灯', color: '#E8D88A',
       img: '', kind: 'goal' },                       // 天台结局触发点
};

/* ------------------------------------------------------------
 * 商店（3F 乃琳Queen）：价格 = 15 + 已购次数 * 10（递增，经济经推演）
 * ----------------------------------------------------------- */
const SHOP = {
  basePrice: 15, step: 10,
  goods: [
    { id: 'atk', name: '舞力特训',   desc: '舞力 +2',    apply: s => { s.atk += 2; } },
    { id: 'def', name: '护体能训练', desc: '护体 +2',    apply: s => { s.def += 2; } },
    { id: 'hp',  name: '能量补给',   desc: '体力 +400',  apply: s => { s.hp += 400; } },
  ],
};

/* ------------------------------------------------------------
 * 21 层字符画地图（13×11）。字符含义：
 *   # 墙   . 地板   U 上行楼梯   D 下行楼梯
 *   y/b/r 黄/蓝/红门   Y/Z/X 对应钥匙
 *   怪物 a-k   道具 R B J s L   o 应援金(面额=stack)
 *   NPC: Q乃琳商店 W嘉然 F心宜 G思诺 N镜像 V魔壬 M阿草 T聚光灯
 * 每层钥匙与门数量持平、连通性与钥匙闭环均经脚本验证。
 * ----------------------------------------------------------- */
const FLOORS = [
  { name: '1F 练习大楼大厅', stack: 3, map: [
    '#############',
    '#D.a...s.o.U#',
    '#.####y####.#',
    '#.#a.....c#.#',
    '#.#.......#.#',
    '#.#..R....#.#',
    '#.#.......#.#',
    '#.#c...s..#.#',
    '#.#########.#',
    '#Y...a..o...#',
    '#############',
  ]},
  { name: '2F 镜面墙练习室', stack: 3, map: [
    '#############',
    '#D.c.....d.U#',
    '#.#...#...#.#',
    '#.#a..#..o#.#',
    '#.#.Y.#...#.#',
    '#.y...#..y#.#',
    '#.#s.a#..c#.#',
    '#.#...#...#.#',
    '#.#...#...#.#',
    '#YB....d..o.#',
    '#############',
  ]},
  { name: '3F Queen 商店层', stack: 4, map: [
    '#############',
    '#D.c..Q....U#',
    '#.#...#...#.#',
    '#.#c..#..d#.#',
    '#.#...#...#.#',
    '#.y...#..y#.#',
    '#.#s..#.R.#.#',
    '#.#d.s#...#.#',
    '#.#..Y#...#.#',
    '#Y..o.c.d.o.#',
    '#############',
  ]},
  { name: '4F 休息区', stack: 5, map: [
    '#############',
    '#D.d.....g.U#',
    '#.#...#...#.#',
    '#.#d..#..e#.#',
    '#.#...#y..#.#',
    '#.y...#..b#.#',
    '#.#...#.B.#.#',
    '#.#e..#...#.#',
    '#.#...#.Y.#.#',
    '#Y.L..Z.oo..#',
    '#############',
  ]},
  { name: '5F 嘉然的补给点', stack: 5, map: [
    '#############',
    '#D.c..W.e..U#',
    '#.#...#...#.#',
    '#.#c..#..g#.#',
    '#.#...#...#.#',
    '#.y...#..y#.#',
    '#.#R..#.g.#.#',
    '#.#e..#...#.#',
    '#.#...#.Y.#.#',
    '#Y.......oo.#',
    '#############',
  ]},
  { name: '6F 数据机房', stack: 6, map: [
    '#############',
    '#D.e.f....eU#',
    '#.#...#...#.#',
    '#.#f..#..e#.#',
    '#.#...#y..#.#',
    '#.y...#..b#.#',
    '#.#...#.B.#.#',
    '#.#d..#.s.#.#',
    '#.#...#.Y.#.#',
    '#Y.s..Z.oo..#',
    '#############',
  ]},
  { name: '7F 舞蹈室·守关心宜', stack: 0, hint: '前面的红门后是二期舞担心宜！她可是动捕杀手，先攒够舞力和护体再来挑战。', map: [
    '#############',
    '#D.e....rF.U#',
    '#.#...#...#.#',
    '#.#e..#f.g#.#',
    '#.#...#...#.#',
    '#.y.f.#..y#.#',
    '#.#...#.Y.#.#',
    '#.#...#...#.#',
    '#.#s..#...#.#',
    '#Y..L...XMs.#',
    '#############',
  ]},
  { name: '8F 器材库', stack: 7, map: [
    '#############',
    '#D.f.....h.U#',
    '#.#...#...#.#',
    '#.#h..#.g.#.#',
    '#.#...#y..#.#',
    '#.y...#..y#.#',
    '#.#R..#.L.#.#',
    '#.#g..#.f.#.#',
    '#.#...#.Y.#.#',
    '#Y..s.Y.oo..#',
    '#############',
  ]},
  { name: '9F 声乐区', stack: 8, map: [
    '#############',
    '#D.h...f.h.U#',
    '#.#...#...#.#',
    '#.#h..#..i#.#',
    '#.#...#y..#.#',
    '#.y...#..b#.#',
    '#.#R..#Lo.#.#',
    '#.#R..#bB.#.#',
    '#.#f..#.Z.#.#',
    '#Y.L..ZY.o..#',
    '#############',
  ]},
  { name: '10F 镜中世界·中boss', stack: 0, hint: '镜子里的那个「你」总说「练这么狠干什么」。别被她吓到——她的舞力其实没有你坚定。', map: [
    '#############',
    '#D.i....rN.U#',
    '#.#...#...#.#',
    '#.#j..#..h#.#',
    '#.#...#...#.#',
    '#.y.i.#y..b.#',
    '#.#...#.L.#.#',
    '#.#...#.Y.#.#',
    '#.#s..#...#.#',
    '#YML..s.ZX..#',
    '#############',
  ]},
  { name: '11F 顶灯坏了一半', stack: 10, map: [
    '#############',
    '#D.i...j.g.U#',
    '#.#...#...#.#',
    '#.#i..#..j#.#',
    '#.#...#y..#.#',
    '#.y...#..y#.#',
    '#.#R..#.B.#.#',
    '#.#g..#bL.#.#',
    '#.#...#.Y.#.#',
    '#Y.Z.LY.oo..#',
    '#############',
  ]},
  { name: '12F 拖延走廊', stack: 10, map: [
    '#############',
    '#D.j...i.h.U#',
    '#.#...#...#.#',
    '#.#h..#.oi#.#',
    '#.#...#y..#.#',
    '#.y...#..b#.#',
    '#.#J..#.L.#.#',
    '#.#j..#bL.#.#',
    '#.#...#.Z.#.#',
    '#Y..Z.Yi.o..#',
    '#############',
  ]},
  { name: '13F 焦虑自习室', stack: 12, map: [
    '#############',
    '#D.j...i.j.U#',
    '#.#...#...#.#',
    '#.#i..#.hi#.#',
    '#.#...#y..#.#',
    '#.y...#..b#.#',
    '#.#R..#.Bo#.#',
    '#.#j..#b..r.#',
    '#.#s..#.Z.#.#',
    '#Y.sX.ZYLo..#',
    '#############',
  ]},
  { name: '14F 声乐室·守关思诺', stack: 0, hint: '思诺姐的声压（攻击）和台风（防御）都很高。多备些护膝和血量，或回 3F 找乃琳补充装备。', map: [
    '#############',
    '#D.j....rG.U#',
    '#.#...#...#.#',
    '#.#j..#..i#.#',
    '#.#...#...#.#',
    '#.y.f.#..y#.#',
    '#.#...#.L.#.#',
    '#.#j..#.Y.#.#',
    '#.#s..#..i#.#',
    '#YML.....X..#',
    '#############',
  ]},
  { name: '15F 后台通道', stack: 13, map: [
    '#############',
    '#D.j...j.k.U#',
    '#.#...#...#.#',
    '#.#j..#..k#.#',
    '#.#...#y..y.#',
    '#.y...#.Y..#.',
    '#.#R..#.Bo#.#',
    '#.#i..#.L.#.#',
    '#.#...#.Y.y.#',
    '#Y....Yi.o..#',
    '#############',
  ]},
  { name: '16F 应援墙', stack: 13, map: [
    '#############',
    '#D.k...j.j.U#',
    '#.#...#...#.#',
    '#.#j..#Y.k#.#',
    '#.#...#y..#.#',
    '#.y...#..b#.#',
    '#.#J..#.Lo#.#',
    '#.#i..#b..#.#',
    '#.#...#yi.#.#',
    '#Y.Z..ZY.o..#',
    '#############',
  ]},
  { name: '17F 老练习室', stack: 14, map: [
    '#############',
    '#D.j...k.j.U#',
    '#.#...y...#.#',
    '#.#j..#..k#.#',
    '#.#...#yi..#.',
    '#.y...#..Yb.#',
    '#.#R..#.Zo#.#',
    '#.#j..#b..r.#',
    '#.#s..#.ki#.#',
    '#Y.sX.ZYBo..#',
    '#############',
  ]},
  { name: '18F 通风层', stack: 14, map: [
    '#############',
    '#D.j...k.k.U#',
    '#.#...#.Y.#.#',
    '#.#j..#..k#.#',
    '#.#...#yY.y.#',
    '#.y...#iY..#.',
    '#.#R..#.Bo#.#',
    '#.#i..#yL.#.#',
    '#.#...#.Y..#.',
    '#..j....i.o.#',
    '#############',
  ]},
  { name: '19F 尘封的天梯', stack: 15, map: [
    '#############',
    '#D.j...h.k.U#',
    '#.#...y.Y.#.#',
    '#.#j..#J.k#.#',
    '#.#...#yj.b.#',
    '#.y...#..Y.#.',
    '#.#R..#.Zo#.#',
    '#.#j..#b..r.#',
    '#.#h..#.k.#.#',
    '#Y..X.Zk.oL.#',
    '#############',
  ]},
  { name: '20F 顶楼前厅', stack: 15, hint: '顶楼就在上面了……惰怠魔壬把聚光灯的电源全占了。带齐应援棒和能量饮料，最后一波加练！', map: [
    '#############',
    '#D.j...j.k.U#',
    '#.#...y#.Z.#.',
    '#.#j..#L.k#.#',
    '#.#...#yBi.#.',
    '#.y...#.YYb.#',
    '#.#Rj.#.Yo#.#',
    '#.#j..#bL.r.#',
    '#.#s..y#.ki.#',
    '#Y.sX.ZkiMo.#',
    '#############',
  ]},
  { name: '21F 天台舞台', stack: 0, map: [
    '#############',
    '#D.j....rV.T#',
    '#.#...#...#.#',
    '#.#j..#..k#.#',
    '#.#...#...#.#',
    '#.y.k.#..r..#',
    '#.#...#.L.#.#',
    '#.#k..#.X.#.#',
    '#.#s..#..j#.#',
    '#.Y..s....X.#',
    '#############',
  ]},
];

/* ------------------------------------------------------------
 * 剧情对话。每段是 {who, img, color, text} 数组。
 * 文案占位符（播放时按所选主角替换）：
 *   {me}   = 主角名（贝拉/嘉然/乃琳）
 *   {fans} = 主角粉丝团名
 *   {{xxx}} = 主角立绘占位（crown/heart → MEMBERS[m].imgCrown/imgHeart）
 * intro 按主角各写一版口吻。
 * ----------------------------------------------------------- */
const STORIES = {
  intro: {
    bella: [
      { who: '旁白', color: '#999', text: '练习大楼的 21 层聚光灯，一夜之间全部熄灭了。' },
      { who: '阿草', img: 'assets/acao_yiwen.png', color: '#8FBF6B',
        text: '贝拉！大楼被「惰怠魔壬」占领了！它把每层都变成了摸鱼乐园……' },
      { who: '贝拉', img: 'assets/bella_tuolajixiashan.png', color: '#DB7D74',
        text: '拖延症吗？正好——每人加练一天，今晚就从它开始！' },
      { who: '贝拉', img: 'assets/bella_jiayou.png', color: '#DB7D74',
        text: '爬上 21 层天台，点亮聚光灯。努力闪耀的人，要让月光为她加冕！' },
    ],
    diana: [
      { who: '旁白', color: '#999', text: '练习大楼的 21 层聚光灯，一夜之间全部熄灭了。' },
      { who: '阿草', img: 'assets/acao_yiwen.png', color: '#8FBF6B',
        text: '嘉然！大楼被「惰怠魔壬」占领了！它把每层都变成了摸鱼乐园……' },
      { who: '嘉然', img: 'assets/diana_ganfan.png', color: '#E799B0',
        text: '什么？连加练的地方都要抢？这我可忍不了——先干饭，再战斗！' },
      { who: '嘉然', img: 'assets/diana_jiayou.png', color: '#E799B0',
        text: '能量便当已装填！爬上 21 层天台，点亮聚光灯，然然第一个不服！' },
    ],
    eileen: [
      { who: '旁白', color: '#999', text: '练习大楼的 21 层聚光灯，一夜之间全部熄灭了。' },
      { who: '阿草', img: 'assets/acao_yiwen.png', color: '#8FBF6B',
        text: '乃琳姐！大楼被「惰怠魔壬」占领了！它把每层都变成了摸鱼乐园……' },
      { who: '乃琳', img: 'assets/eileen_nuwangdekending.png', color: '#576690',
        text: '哦呀……敢在本 Queen 的大楼里散播懒惰？胆子不小嘛。' },
      { who: '乃琳', img: 'assets/eileen_wink.png', color: '#576690',
        text: '那就由本 Queen 亲自示范——什么叫从不打折的努力。天台见。' },
    ],
  },
  eileen: [
    { who: '乃琳Queen', img: 'assets/eileen_nuwangdekending.png', color: '#576690',
      text: '哦呀，这不是{me}吗？' },
    { who: '乃琳Queen', img: 'assets/eileen_wink.png', color: '#576690',
      text: '爬塔也别忘了装备管理哦。本 Queen 的商店对你随时开放——用应援金换实力。' },
    { who: '乃琳Queen', img: 'assets/eileen_taixihuanle.png', color: '#576690',
      text: '女王大开恩典，童叟无欺。要来点什么？' },
  ],
  diana: [
    { who: '嘉然', img: 'assets/diana_ganfan.png', color: '#E799B0',
      text: '{me}！练了这么久，先干饭！' },
    { who: '嘉然', img: 'assets/diana_liukoushui.png', color: '#E799B0',
      text: '这是嘉心糖特供的能量便当，吃完体力 +400！剩下的路，然然为你应援！' },
    { who: '{me}', img: 'assets/{{heart}}.png', color: '{{color}}',
      text: '谢谢你然然……这份便当我会连嘉心糖的心意一起带上天台的！' },
  ],
  fionaPre: [
    { who: '心宜', img: 'assets/fiona_gongshi.jpg', color: '#C93773',
      text: '7F 守关人，心宜，检查检查——' },
    { who: '心宜', img: 'assets/fiona_gongshi.jpg', color: '#C93773',
      text: '{me}，听说你要爬上天台。想过去？先接住我的三连转体！' },
  ],
  fionaPost: [
    { who: '心宜', img: 'assets/fiona_gongshi.jpg', color: '#C93773',
      text: '好厉害……这就是你的即战力吗，我服了！' },
    { who: '心宜', img: 'assets/fiona_gongshi.jpg', color: '#C93773',
      text: '二期的心宜正式加入应援团！全属性小幅提升（体力 +300 / 舞力 +3 / 护体 +3）！' },
  ],
  mirrorPre: [
    { who: '镜子里的自己', img: 'assets/bella_hengheng.png', color: '#3A3A46',
      text: '何必呢？练这么狠干什么，躺平不好吗？' },
    { who: '{me}', img: 'assets/bella_bietoulan.png', color: '{{color}}',
      text: '躺平的「我」……抱歉，今天的加练一天都不会少！' },
  ],
  mirrorPost: [
    { who: '镜子里的自己', img: 'assets/bella_leipa.png', color: '#3A3A46',
      text: '可恶……你的努力居然这么耀眼……我把舞力和护体都给你。' },
    { who: '{me}', img: 'assets/bella_jiayou.png', color: '{{color}}',
      text: '谢谢「我」。接下来，也不会再犹豫了！（体力 +400 / 舞力 +4 / 护体 +4）' },
  ],
  gladysPre: [
    { who: '思诺', img: 'assets/sinuo_gongshi.jpg', color: '#7252C0',
      text: '14F 声乐室守关，思诺。' },
    { who: '思诺', img: 'assets/sinuo_gongshi.jpg', color: '#7252C0',
      text: '要用这支舞爬上天台的话——先接住我的高音声压吧。' },
  ],
  gladysPost: [
    { who: '思诺', img: 'assets/sinuo_gongshi.jpg', color: '#7252C0',
      text: '舞步和决心都很完整。枝江邓紫棋为你应援！' },
    { who: '思诺', img: 'assets/sinuo_gongshi.jpg', color: '#7252C0',
      text: '全体属性强化！（体力 +500 / 舞力 +5 / 护体 +5）天台见。' },
  ],
  slothlordPre: [
    { who: '惰怠魔壬', color: '#B08AD0',
      text: '……又来一个不长夜的。何必呢？明天再练，明天再爬，多好。' },
    { who: '惰怠魔壬', color: '#B08AD0',
      text: '我这魔壬，就是你们的「先歇一会」「明天再说」喂大的！' },
    { who: '{me}', img: 'assets/bella_buhuiba.png', color: '{{color}}',
      text: '不会吧不会吧，都 2xxx 年了还有人信「明天再说」？' },
    { who: '{me}', img: 'assets/bella_jiayou.png', color: '{{color}}',
      text: '每人加练一天——就从今晚，从你开始！' },
  ],
  slothlordPost: [
    { who: '惰怠魔壬', color: '#B08AD0',
      text: '不……不可能……「今天的事今天做完」居然这么强……' },
    { who: '阿草', img: 'assets/acao_kaixin.png', color: '#8FBF6B',
      text: '魔壬消散了！聚光灯的电源恢复了，快上天台点亮它！' },
  ],
  goal: [
    { who: '旁白', color: '#999', text: '{me}走上天台，合上闸刀。21 层聚光灯，逐层亮起。' },
    { who: '{me}', img: 'assets/{{crown}}.png', color: '{{color}}',
      text: '——努力闪耀的人，让月光为她加冕。' },
    { who: '{fans}', color: '{{color}}',
      text: '「{me}辛苦了！」「{fans}永远应援！」……楼下传来一个魂们的欢呼。' },
    { who: '{me}', img: 'assets/{{heart}}.png', color: '{{color}}',
      text: '谢谢大家。明天的加练，也一起哦！' },
  ],
  death: [
    { who: '旁白', color: '#999', text: '{me}累趴下了……但没有关系，加练允许中场休息。' },
  ],
};

/* 5F 嘉然送的便当（一次性） */
const DIANA_GIFT = { hp: 400, msg: '吃下【嘉心糖能量便当】：体力 +400！' };

/* 守关胜利加成 */
const GUARD_BUFF = {
  fiona:    { hp: 300, atk: 3, def: 3 },
  mirror:   { hp: 400, atk: 4, def: 4 },
  gladys:   { hp: 500, atk: 5, def: 5 },
};
