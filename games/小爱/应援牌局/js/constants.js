(function () {
  'use strict';
  var UNO = (window.UNO = window.UNO || {});

  // 四成员主题色
  var COLORS = {
    red:    { key: 'red',    name: '贝拉', hex: '#DB7D74' },
    pink:   { key: 'pink',   name: '嘉然', hex: '#E799B0' },
    blue:   { key: 'blue',   name: '乃琳', hex: '#576690' },
    purple: { key: 'purple', name: '思诺', hex: '#7252C0' }
  };
  var COLOR_KEYS = ['red', 'pink', 'blue', 'purple'];

  // 座位：0=玩家(底) 1=阿草(上) 2=嘉然(左) 3=贝拉(右)
  var SEATS = [
    { name: '你',   sticker: null,    isHuman: true },
    { name: '阿草', sticker: 'acao',  isHuman: false },
    { name: '嘉然', sticker: 'diana', isHuman: false },
    { name: '贝拉', sticker: 'bella', isHuman: false }
  ];

  // 表情包贴纸：file 为实际使用的图片；图片加载失败时回退到 emoji + 主题色占位
  // 若要把真实 A-SOUL 表情包放进来，把文件拷到本目录并改这里的 file 名即可
  var STICKER_DIR = 'assets/stickers/';
  var STICKERS = {
    'acao':      { file: 'acao_kaixin.png',      emoji: '\u{1F331}', color: '#5BA84A',       label: '阿草' },
    'acao-gold': { file: 'acao_aixin.png', emoji: '\u2728',    color: '#D4AF37',       label: '阿草' },
    'diana':     { file: 'diana3_ganfan.png',     emoji: '\u{1F380}', color: COLORS.pink.hex,   label: '嘉然' },
    'bella':     { file: 'bella_beijiquan.png',     emoji: '\u{1F3A4}', color: COLORS.red.hex,    label: '贝拉' },
    'eileen':    { file: 'eileen_haohuainuren.png',    emoji: '\u{1F3A7}', color: COLORS.blue.hex,   label: '乃琳' },
    'sinuo':     { file: 'sinuo.svg',     emoji: '\u{1F319}', color: COLORS.purple.hex, label: '思诺' }
  };

  var ACTION = { NUMBER: 'number', SKIP: 'skip', REVERSE: 'reverse', DRAW2: 'draw2', WILD: 'wild', WILD4: 'wild4' };
  var SYMBOL = { skip: '\u2298', reverse: '\u21C4', draw2: '+2', wild: '\u2605', wild4: '+4' };
  var ACTION_LABEL = { skip: '跳过', reverse: '反转', draw2: '+2', wild: '变色', wild4: '+4' };
  var SCORE = { skip: 20, reverse: 20, draw2: 20, wild: 50, wild4: 50 }; // 数字牌按面值，见 rules.scoreCard
  var STORAGE_KEY = 'asoul-uno-record-v1';
  var SETTINGS_KEY = 'asoul-uno-settings-v1';

  // 成员语录 toast（A-SOUL 风格硬编码短句）
  var QUOTES = {
    start: [
      { who: '贝拉', text: '努力闪耀，让月光为我加冕。' },
      { who: '嘉然', text: '干饭人干饭魂，先打完这局再开饭。' },
      { who: '乃琳', text: '别急，牌序理清了再出。' },
      { who: '心宜', text: '心意到了，牌运自然就到。' },
      { who: '思诺', text: '夜色正浓，这一局慢慢陪你。' }
    ],
    wild: [
      { who: '阿草', text: '万能牌在手，颜色由我说了算。' },
      { who: '阿草', text: '摇一摇，换个颜色继续。' },
      { who: '思诺', text: '变数，才是最有趣的部分。' }
    ],
    wild4: [
      { who: '阿草', text: '金光一闪，四张牌请收好。' },
      { who: '贝拉', text: '别慌，这只是热身。' },
      { who: '乃琳', text: '这一步，我算过。' }
    ],
    win: [
      { who: '贝拉', text: '应援成功，谢谢每一个你。' },
      { who: '嘉然', text: '赢啦！可以加一碗饭吗？' },
      { who: '乃琳', text: '意料之中的结果。' }
    ],
    lose: [
      { who: '心宜', text: '没关系，下一局再陪你们闪一次。' },
      { who: '思诺', text: '输赢都记账，下一局再算。' },
      { who: '嘉然', text: '呜……再来一局嘛！' }
    ]
  };

  // 每种颜色总张数：0 一张 + 1~9 各两张 + 跳过/反转/+2 各两张 = 25
  var COLOR_TOTAL = 25;

  UNO.C = {
    COLORS: COLORS, COLOR_KEYS: COLOR_KEYS, SEATS: SEATS,
    STICKERS: STICKERS, STICKER_DIR: STICKER_DIR,
    ACTION: ACTION, SYMBOL: SYMBOL, ACTION_LABEL: ACTION_LABEL,
    SCORE: SCORE, STORAGE_KEY: STORAGE_KEY, SETTINGS_KEY: SETTINGS_KEY,
    QUOTES: QUOTES, COLOR_TOTAL: COLOR_TOTAL
  };
})();
