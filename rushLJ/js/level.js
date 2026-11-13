/**
 * 关卡数据 —— 纯数据驱动。
 * 新增关卡只需往 LEVELS 里追加一个对象，不需要改任何逻辑代码。
 *
 * block: { x, y, w, h, material }  x/y 是矩形中心点
 * pig:   { x, y }                  x/y 是圆心
 * 坐标系：逻辑画布 1280 x 720，地面顶点 y = 660
 *
 * 叠放规则：方块中心 y = 支撑面顶部 - h/2（地面支撑面为 660）
 */
const LEVELS = [
  {
    name: '木头哨塔',
    birds: 3,
    slingshot: { x: 200, y: 470 },
    blocks: [
      // 宽跨度承重石柱（单发打不断两根，必须分次拆）
      { x: 980,  y: 605, w: 26,  h: 110, material: 'stone' },
      { x: 1220, y: 605, w: 26,  h: 110, material: 'stone' },
      // 主横梁
      { x: 1100, y: 537, w: 280, h: 26,  material: 'wood'  },
      // 梁上小屋
      { x: 1060, y: 497, w: 24,  h: 54,  material: 'wood'  },
      { x: 1140, y: 497, w: 24,  h: 54,  material: 'wood'  },
      { x: 1100, y: 457, w: 130, h: 26,  material: 'wood'  }
    ],
    pigs: [
      { x: 1100, y: 426 }, // 塔顶：中高仰角直击
      { x: 1100, y: 506 }, // 梁上小屋：中仰角
      { x: 830,  y: 642 }  // 塔外空地：需要压低力度的平射
    ]
  },

  {
    name: '石墙卫站',
    birds: 3,
    slingshot: { x: 200, y: 470 },
    blocks: [
      // 前排双层石墙：挡住低平弹道，要么砸塌要么高抛越过
      { x: 760,  y: 605, w: 26,  h: 110, material: 'stone' },
      { x: 760,  y: 495, w: 26,  h: 110, material: 'stone' },
      // 石塔
      { x: 1030, y: 605, w: 26,  h: 110, material: 'stone' },
      { x: 1150, y: 605, w: 26,  h: 110, material: 'stone' },
      { x: 1090, y: 537, w: 190, h: 26,  material: 'stone' },
      // 塔顶木屋
      { x: 1050, y: 497, w: 24,  h: 54,  material: 'wood'  },
      { x: 1130, y: 497, w: 24,  h: 54,  material: 'wood'  },
      { x: 1090, y: 457, w: 130, h: 26,  material: 'wood'  }
    ],
    pigs: [
      { x: 1090, y: 426 }, // 屋顶
      { x: 1090, y: 642 }, // 塔内：被石梁与石柱罩住
      { x: 880,  y: 642 }  // 墙后空地：高抛越墙
    ]
  },

  {
    name: '双子木桥',
    birds: 3,
    slingshot: { x: 200, y: 470 },
    blocks: [
      // 左右两座木塔
      { x: 815,  y: 605, w: 26,  h: 110, material: 'wood' },
      { x: 885,  y: 605, w: 26,  h: 110, material: 'wood' },
      { x: 1115, y: 605, w: 26,  h: 110, material: 'wood' },
      { x: 1185, y: 605, w: 26,  h: 110, material: 'wood' },
      // 大桥面板
      { x: 1000, y: 537, w: 400, h: 26,  material: 'wood' },
      // 桥上小屋
      { x: 930,  y: 497, w: 22,  h: 54,  material: 'wood' },
      { x: 1030, y: 497, w: 22,  h: 54,  material: 'wood' },
      { x: 980,  y: 457, w: 130, h: 26,  material: 'wood' }
    ],
    pigs: [
      { x: 980,  y: 426 }, // 屋顶
      { x: 960,  y: 506 }, // 桥面
      { x: 1060, y: 642 }  // 桥下：要塌桥才压得到
    ]
  },

  {
    name: '石板地窖',
    birds: 3,
    slingshot: { x: 200, y: 470 },
    blocks: [
      // 地窖：两根石柱架一块石板，双猪藏在板下
      // 直接打不到，只能打断石柱或砸碎石板让顶塌下来压猪
      { x: 1010, y: 605, w: 26,  h: 110, material: 'stone' },
      { x: 1190, y: 605, w: 26,  h: 110, material: 'stone' },
      { x: 1100, y: 537, w: 220, h: 26,  material: 'stone' }
    ],
    pigs: [
      { x: 1060, y: 642 }, // 板下左
      { x: 1140, y: 642 }, // 板下右
      { x: 860,  y: 642 }  // 地窖前空地
    ]
  },

  {
    name: '牛牛堡垒',
    birds: 4,
    slingshot: { x: 200, y: 470 },
    blocks: [
      // 前排护墙
      { x: 700,  y: 605, w: 26,  h: 110, material: 'stone' },
      // 木制主塔（两层）
      { x: 900,  y: 605, w: 26,  h: 110, material: 'wood' },
      { x: 1000, y: 605, w: 26,  h: 110, material: 'wood' },
      { x: 950,  y: 537, w: 170, h: 26,  material: 'wood' },
      { x: 905,  y: 497, w: 24,  h: 54,  material: 'wood' },
      { x: 995,  y: 497, w: 24,  h: 54,  material: 'wood' },
      { x: 950,  y: 457, w: 130, h: 26,  material: 'wood' },
      // 右侧石堡
      { x: 1130, y: 605, w: 26,  h: 110, material: 'stone' },
      { x: 1230, y: 605, w: 26,  h: 110, material: 'stone' },
      { x: 1180, y: 537, w: 150, h: 26,  material: 'stone' }
    ],
    pigs: [
      { x: 950,  y: 426 }, // 塔顶
      { x: 950,  y: 506 }, // 二层梁上
      { x: 1080, y: 642 }, // 塔与石堡之间空地
      { x: 1180, y: 506 }  // 石堡梁上
    ]
  },

  {
    name: '三连石屋',
    birds: 4,
    slingshot: { x: 200, y: 470 },
    blocks: [
      // 两座并排石屋：整块石板做屋顶，打断任意一根柱子整屋塌压
      { x: 850,  y: 605, w: 26,  h: 110, material: 'stone' },
      { x: 970,  y: 605, w: 26,  h: 110, material: 'stone' },
      { x: 910,  y: 537, w: 160, h: 26,  material: 'stone' },
      { x: 1100, y: 605, w: 26,  h: 110, material: 'stone' },
      { x: 1220, y: 605, w: 26,  h: 110, material: 'stone' },
      { x: 1160, y: 537, w: 160, h: 26,  material: 'stone' },
      // 右屋屋顶上的木制小阁
      { x: 1120, y: 497, w: 24,  h: 54,  material: 'wood'  },
      { x: 1200, y: 497, w: 24,  h: 54,  material: 'wood'  },
      { x: 1160, y: 457, w: 130, h: 26,  material: 'wood'  }
    ],
    pigs: [
      { x: 920,  y: 642 }, // 左屋檐下
      { x: 1160, y: 642 }, // 右屋檐下
      { x: 1160, y: 506 }, // 右屋屋顶（木阁内）
      { x: 760,  y: 642 }  // 阵前空地
    ]
  },

  {
    name: '高塔警哨',
    birds: 4,
    slingshot: { x: 200, y: 470 },
    blocks: [
      // 左侧细高木塔：两节木柱叠出高危哨位，塔顶牛牛一览众山小
      { x: 880,  y: 605, w: 26,  h: 110, material: 'wood'  },
      { x: 880,  y: 495, w: 26,  h: 110, material: 'wood'  },
      { x: 880,  y: 427, w: 90,  h: 26,  material: 'wood'  },
      // 右侧石基双层堡垒
      { x: 1040, y: 605, w: 26,  h: 110, material: 'stone' },
      { x: 1160, y: 605, w: 26,  h: 110, material: 'stone' },
      { x: 1100, y: 537, w: 160, h: 26,  material: 'stone' },
      { x: 1065, y: 497, w: 24,  h: 54,  material: 'wood'  },
      { x: 1135, y: 497, w: 24,  h: 54,  material: 'wood'  },
      { x: 1100, y: 457, w: 130, h: 26,  material: 'wood'  }
    ],
    pigs: [
      { x: 880,  y: 396 }, // 高塔塔顶
      { x: 1100, y: 426 }, // 堡垒屋顶
      { x: 1100, y: 642 }, // 石板下
      { x: 985,  y: 642 }  // 塔与堡垒之间空地
    ]
  },

  {
    name: '牛牛竞技场',
    birds: 5,
    slingshot: { x: 200, y: 470 },
    blocks: [
      // 阵前双石墙，中缝只容一弹穿行
      { x: 700,  y: 605, w: 26,  h: 110, material: 'stone' },
      { x: 760,  y: 605, w: 26,  h: 110, material: 'stone' },
      // 中央三层木堡（一层开放大厅，只立两侧柱）
      { x: 900,  y: 605, w: 26,  h: 110, material: 'wood'  },
      { x: 1100, y: 605, w: 26,  h: 110, material: 'wood'  },
      { x: 1000, y: 537, w: 260, h: 26,  material: 'wood'  },
      { x: 940,  y: 497, w: 24,  h: 54,  material: 'wood'  },
      { x: 1060, y: 497, w: 24,  h: 54,  material: 'wood'  },
      { x: 1000, y: 457, w: 180, h: 26,  material: 'wood'  },
      { x: 970,  y: 417, w: 24,  h: 54,  material: 'wood'  },
      { x: 1030, y: 417, w: 24,  h: 54,  material: 'wood'  },
      { x: 1000, y: 377, w: 110, h: 26,  material: 'wood'  },
      // 右侧石板地窖
      { x: 1180, y: 605, w: 26,  h: 110, material: 'stone' },
      { x: 1260, y: 605, w: 26,  h: 110, material: 'stone' },
      { x: 1220, y: 537, w: 120, h: 26,  material: 'stone' }
    ],
    pigs: [
      { x: 1000, y: 346 }, // 堡顶旗位
      { x: 1000, y: 506 }, // 二层
      { x: 1000, y: 642 }, // 一层（大梁下）
      { x: 1140, y: 642 }, // 堡与地窖之间
      { x: 1220, y: 642 }  // 地窖板下
    ]
  }
];
