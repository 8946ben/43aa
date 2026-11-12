(function () {
  'use strict';
  var UNO = (window.UNO = window.UNO || {});
  var C = UNO.C;
  var ACTION = C.ACTION;
  var SCORE = C.SCORE;

  function isWild(card) { return card.color === null; }

  // 出牌合法性：万能牌随时可出；否则须与「当前有效颜色」或弃牌堆顶的数字/符号匹配
  function matches(card, top, currentColor) {
    if (isWild(card)) return true;
    if (isWild(top)) return card.color === currentColor; // 上一张是万能牌：只认选定的颜色
    if (card.color === currentColor) return true;
    if (card.type === ACTION.NUMBER && top.type === ACTION.NUMBER && card.value === top.value) return true;
    if (card.type !== ACTION.NUMBER && card.type === top.type) return true; // 功能符号匹配（不限颜色）
    return false;
  }

  function playable(hand, top, currentColor) {
    return hand.filter(function (c) { return matches(c, top, currentColor); });
  }

  function scoreCard(card) {
    if (card.type === ACTION.NUMBER) return card.value;
    return SCORE[card.type] || 0;
  }

  function scoreHand(hand) {
    return hand.reduce(function (s, c) { return s + scoreCard(c); }, 0);
  }

  function countColors(hand) {
    var counts = {};
    C.COLOR_KEYS.forEach(function (k) { counts[k] = 0; });
    hand.forEach(function (c) { if (c.color !== null) counts[c.color]++; });
    return counts;
  }

  UNO.rules = {
    isWild: isWild, matches: matches, playable: playable,
    scoreCard: scoreCard, scoreHand: scoreHand, countColors: countColors
  };
})();
