(function () {
  'use strict';
  var UNO = (window.UNO = window.UNO || {});
  var C = UNO.C;
  var ACTION = C.ACTION;

  // 3 AI 贪婪策略：
  //  - 优先出与手牌同色最多的牌（维持自己的优势色）
  //  - 功能牌留到对手手牌少时再打
  //  - 万能牌留作最后手段
  function choose(playable, hand, minOpponentCards) {
    var counts = UNO.rules.countColors(hand);
    var best = null, bestScore = -Infinity;
    playable.forEach(function (card) {
      var s;
      if (card.color === null) {
        s = -40;
      } else {
        s = counts[card.color] * 12;
        if (card.type === ACTION.NUMBER) {
          s += 5; // 数字牌略优先，尽量别留高分牌
        } else {
          s += (minOpponentCards <= 2) ? 30 : -20; // 对手快出完时才甩功能牌
        }
      }
      s += Math.random() * 2; // 轻微扰动，避免每局完全一致
      if (s > bestScore) { bestScore = s; best = card; }
    });
    return best || playable[0];
  }

  // 万能牌变色：选自己手牌里最多的颜色
  function chooseColor(hand) {
    var counts = UNO.rules.countColors(hand);
    var best = C.COLOR_KEYS[0], bestN = -1;
    C.COLOR_KEYS.forEach(function (k) {
      if (counts[k] > bestN) { bestN = counts[k]; best = k; }
    });
    return best;
  }

  UNO.ai = { choose: choose, chooseColor: chooseColor };
})();
