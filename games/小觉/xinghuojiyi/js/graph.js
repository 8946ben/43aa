/* ============================================================
 * 《星火机忆 · Spark Engine》 星图邻接 —— js/graph.js
 * ------------------------------------------------------------
 * 纯逻辑模块（不碰 DOM / canvas），负责：
 *   • 生成星图节点
 *   • 节点间「吸附」连边（含道路遮挡判定）
 *   • 从核心出发的供给传播（BFS）
 *   • 链路闭合度（用于「链路点亮」奖励）
 *
 * 依赖：js/data.js 必须先引入。
 * 在 Node 下也可直接 require 做无头平衡测试。
 * ============================================================ */
(function (root) {
  'use strict';

  var DIST_FAR = 1e9;

  /* ---------- 小工具 ---------- */
  function dist(ax, ay, bx, by) {
    var dx = ax - bx, dy = ay - by;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /* 点到线段距离（用于「连线是否穿过机群生成环」的判定） */
  function pointSegDist(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay;
    var l2 = dx * dx + dy * dy;
    if (l2 < 1e-6) return dist(px, py, ax, ay);
    var t = ((px - ax) * dx + (py - ay) * dy) / l2;
    t = t < 0 ? 0 : (t > 1 ? 1 : t);
    return dist(px, py, ax + t * dx, ay + t * dy);
  }

  /* ---------- 确定性伪随机（seed 相同则星图相同） ---------- */
  function makeRng(seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      // xorshift32
      s ^= s << 13; s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5;  s >>>= 0;
      return s / 4294967296;
    };
  }

  /* ---------- 星图生成 ----------
   * 规则：
   *  1. 核心在正中，四周 92px 内是「机群生成环」——这里既不放节点，
   *     核心也不直接连到这里以外去（核心只连内环 4 颗，
   *     内环节点对角距离 = 2×104×sin(45°) ≈ 147 < 连边距离，互相连通）。
   *  2. 节点分三环：内环 4 颗（104px，核心的邻居）、
   *     中环 5 颗（244px）、外环 5 颗（368px，贴近四边）。角度抖动，避免网格感。
   *  3. 相邻节点最小间距 MIN_GAP（绘制半径 26 + 26 + 呼吸感）。
   *  4. 类型分布：星尘 / 生产较多（前期要扩），火力 / 护盾稀有。
   *  5. 内环保证 星尘 / 生产 / 火力 各一颗（按离核心从近到远分配）。
   */
  var MIN_GAP = 76;
  var TYPE_POOL = [
    'ore', 'ore', 'ore',
    'fuel', 'fuel', 'fuel',
    'turret', 'turret', 'turret',
    'ward', 'ward'
  ];

  /* 收集已放节点里离 (x,y) 最近的距离 */
  function nearest(nodes, x, y) {
    var best = 1e9;
    for (var i = 0; i < nodes.length; i++) {
      var d = dist(nodes[i].x, nodes[i].y, x, y);
      if (d < best) best = d;
    }
    return best;
  }

  /* 兜底搜索：在环上均匀试 24 个角度，挑离得最开的那个 */
  function fallbackOnRing(cx, cy, radius, nodes) {
    var best = null, bestGap = -1;
    for (var k = 0; k < 24; k++) {
      var a = (Math.PI * 2 * k) / 24;
      var px = clamp(cx + Math.cos(a) * radius, 38, 922);
      var py = clamp(cy + Math.sin(a) * radius, 38, 602);
      var g = nearest(nodes, px, py);
      if (g > bestGap) { bestGap = g; best = { x: px, y: py, ang: a }; }
    }
    return best;
  }

  function generateMap(opt) {
    var D = root.DATA;
    var C = D.CONF;
    var rng = opt && opt.rng ? opt.rng : makeRng(opt && opt.seed ? opt.seed : 12345);
    var cx = D.CORE.x, cy = D.CORE.y;
    // 环形分层：4 / 5 / 5。外环半径按画布高度收，保证不压出屏幕
    var rings = [
      { n: 4, r: 104 },
      { n: 5, r: 225 },
      { n: 5, r: Math.min(330, C.H / 2 - 34) }
    ];
    var nodes = [];
    var idx = 0;

    for (var r = 0; r < rings.length; r++) {
      var n = rings[r].n;
      var radius = rings[r].r;
      var base = rng() * Math.PI * 2;
      for (var i = 0; i < n; i++) {
        var ideal = base + (Math.PI * 2 * i) / n;
        var placed = null;
        // 在理想角度附近抖动；撞车就收窄抖动范围再试
        for (var tryI = 0; tryI < 10 && !placed; tryI++) {
          var jitter = (tryI === 0 ? 0.30 : 0.40 - tryI * 0.042) * (rng() - 0.5) * 2;
          var ang = ideal + jitter;
          var rad = radius + (rng() - 0.5) * 20 * (r > 0 ? 1 : 0.4);
          var px = cx + Math.cos(ang) * rad;
          var py = cy + Math.sin(ang) * rad;
          if (px < 38 || px > C.W - 38 || py < 38 || py > C.H - 38) continue;
          if (nearest(nodes, px, py) >= MIN_GAP) placed = { x: px, y: py, ang: ang };
        }
        // 兜底：理想位置 → 环上最空处 → 强制理想位置（宁可近一点也不出画布）
        if (!placed) placed = fallbackOnRing(cx, cy, radius, nodes);
        nodes.push({
          id: 'n' + idx,
          x: placed.x,
          y: placed.y,
          type: null,
          ring: r,
          seed: rng()
        });
        idx++;
      }
    }

    /* ---- 类型分配 ----
     * 内环最近的三颗指定为 星尘 / 生产 / 火力，保证开局有得点；
     * 剩下的按打乱后的池子分配。
     */
    var innerIdx = [];
    for (var q = 0; q < nodes.length; q++) if (nodes[q].ring === 0) innerIdx.push(q);
    innerIdx.sort(function (a, b) {
      return dist(nodes[a].x, nodes[a].y, cx, cy) - dist(nodes[b].x, nodes[b].y, cx, cy);
    });
    var order = innerIdx.concat();
    for (var q2 = 0; q2 < nodes.length; q2++) {
      if (innerIdx.indexOf(q2) < 0) order.push(q2);
    }
    var pool = TYPE_POOL.slice();
    shuffle(pool, rng);

    /* 开局三颗必须是「星尘源 + 生产器 + 星尘源」：
     * 只有一颗星尘源时，玩家点亮 3 颗就会卡死在个位数星尘上，
     * 从此再也点不动任何东西（曾经有过整张图因此必输）。
     * 火力从第二环再往上补，第一波的敌人靠核心血量与后续扩展应对。 */
    nodes[innerIdx[0]].type = 'ore';
    nodes[innerIdx[1]].type = 'fuel';
    nodes[innerIdx[2]].type = 'ore';
    // 内环第四颗留一个火力，保证开局能开火
    if (innerIdx.length > 3) nodes[innerIdx[3]].type = 'turret';
    var pi = 0;
    for (var j = 0; j < order.length; j++) {
      var ni = order[j];
      if (nodes[ni].type) continue;
      if (pi >= pool.length) pi = 0;
      nodes[ni].type = pool[pi++];
    }

    // 收尾：把节点钳进画布
    for (var k = 0; k < nodes.length; k++) {
      nodes[k].x = clamp(nodes[k].x, 46, C.W - 46);
      nodes[k].y = clamp(nodes[k].y, 46, C.H - 46);
    }

    return { nodes: nodes, rng: rng };
  }

  function shuffle(arr, rng) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  /* ---------- 「两点能否相连」—— 全游戏唯一判定 ----------
   * 渲染连线、供给传播、点击点亮全部走这里，
   * 避免战斗逻辑和画线逻辑各写一份而悄悄漂移（曾经出过一次这个 bug）。
   *
   * 规则：
   *  1. 两点距离不超过 linkDist；
   *  2. 两端都站在生成环之外、且连线会横穿核心时，禁止直连
   *     —— 逼玩家绕核心铺一圈防线。
   *     （内环节点本来就贴着核心，这条不适用于它们，
   *       否则火种点亮第一颗后就再也走不出去了。）
   */
  function canLink(nodes, core, i, j) {
    var C = root.DATA.CONF;
    var a = nodes[i], b = nodes[j];
    if (!a || !b || i === j) return false;
    if (dist(a.x, a.y, b.x, b.y) > C.linkDist) return false;
    var innerR = C.ringGap || 92;
    var da = dist(a.x, a.y, core.x, core.y);
    var db = dist(b.x, b.y, core.x, core.y);
    if (da > innerR * 1.6 && db > innerR * 1.6 &&
        pointSegDist(core.x, core.y, a.x, a.y, b.x, b.y) < innerR) return false;
    return true;
  }

  /* ---------- 连边 ----------
   * 对所有满足 canLink 的点对建「吸附」边。
   */
  function buildLinks(nodes, core) {
    var links = [];
    for (var i = 0; i < nodes.length; i++) {
      for (var j = i + 1; j < nodes.length; j++) {
        if (canLink(nodes, core, i, j)) links.push({ a: i, b: j });
      }
    }
    return links;
  }

  /* 核心只连「内环」节点 —— 生成环是留给机群的走廊，核心不能空越它。
   * 这样核心天然被一圈节点围住，玩家的每一次点亮都是一次防线决策。
   */
  function coreLinks(nodes, core) {
    var C = root.DATA.CONF;
    var R = C.coreLinkR || 150;
    var list = [];
    for (var i = 0; i < nodes.length; i++) {
      if (dist(nodes[i].x, nodes[i].y, core.x, core.y) <= R) list.push(i);
    }
    return list;
  }

  /* ---------- 供给传播（BFS） ----------
   * 从核心出发，只穿过「已点亮 / 正在点亮」的节点。
   * 未点亮的节点是完全的墙：不导电也不挡光。
   */
  function computeSupply(nodes, links, coreAdj) {
    var n = nodes.length;
    var powered = new Array(n);
    for (var i = 0; i < n; i++) powered[i] = false;

    var adj = new Array(n);
    for (var a = 0; a < n; a++) adj[a] = [];
    for (var l = 0; l < links.length; l++) {
      var lk = links[l];
      adj[lk.a].push(lk.b);
      adj[lk.b].push(lk.a);
    }

    var queue = [];
    for (var c = 0; c < coreAdj.length; c++) {
      var ci = coreAdj[c];
      if (nodes[ci].on && !powered[ci]) { powered[ci] = true; queue.push(ci); }
    }
    var head = 0;
    while (head < queue.length) {
      var cur = queue[head++];
      var nb = adj[cur];
      for (var m = 0; m < nb.length; m++) {
        var nx = nb[m];
        if (!powered[nx] && nodes[nx].on) { powered[nx] = true; queue.push(nx); }
      }
    }
    return powered;
  }

  /* ---------- 到核心的图距离（用于「链路点亮」评分） ----------
   * 只数已点亮的跳数；未点亮节点不可通行。
   */
  function hopDistances(nodes, links, coreAdj) {
    var n = nodes.length;
    var d = new Array(n);
    for (var i = 0; i < n; i++) d[i] = DIST_FAR;

    var adj = new Array(n);
    for (var a = 0; a < n; a++) adj[a] = [];
    for (var l = 0; l < links.length; l++) {
      adj[links[l].a].push(links[l].b);
      adj[links[l].b].push(links[l].a);
    }

    var queue = [];
    for (var c = 0; c < coreAdj.length; c++) {
      var ci = coreAdj[c];
      if (nodes[ci].on && d[ci] > 1) { d[ci] = 1; queue.push(ci); }
    }
    var head = 0;
    while (head < queue.length) {
      var cur = queue[head++];
      var nb = adj[cur];
      for (var m = 0; m < nb.length; m++) {
        var nx = nb[m];
        if (nodes[nx].on && d[nx] > d[cur] + 1) { d[nx] = d[cur] + 1; queue.push(nx); }
      }
    }
    return d;
  }

  /* 点亮费用：基础造价 × 星图折扣，未点亮的节点再加「点亮费」 */
  function litCost(node, mods, wasEaten) {
    var C = root.DATA.CONF;
    var type = root.DATA.NODE_TYPES[node.type];
    var base = type.cost * (mods && mods.matchCost ? mods.matchCost : 1);
    if (wasEaten) return Math.max(1, Math.round(base + C.reviveCost));
    return Math.max(1, Math.round(base + C.litUpCost));
  }

  var API = {
    dist: dist,
    pointSegDist: pointSegDist,
    makeRng: makeRng,
    generateMap: generateMap,
    buildLinks: buildLinks,
    canLink: canLink,
    coreLinks: coreLinks,
    computeSupply: computeSupply,
    hopDistances: hopDistances,
    litCost: litCost,
    DIST_FAR: DIST_FAR
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
  } else {
    root.Graph = API;
  }
})(typeof window !== 'undefined' ? window : this);