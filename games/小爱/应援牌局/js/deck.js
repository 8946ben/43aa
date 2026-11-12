(function () {
  'use strict';
  var UNO = (window.UNO = window.UNO || {});
  var C = UNO.C;
  var COLOR_KEYS = C.COLOR_KEYS;
  var ACTION = C.ACTION;

  var idSeq = 0;
  function makeCard(color, type, value) {
    return { id: 'c' + (idSeq++), color: color, type: type, value: (value === undefined ? null : value) };
  }

  // 经典 UNO 108 张：4 色 x (0x1 + 1-9x2 + 跳过/反转/+2 各x2) = 100，万能 8
  function buildDeck() {
    idSeq = 0;
    var deck = [];
    COLOR_KEYS.forEach(function (color) {
      deck.push(makeCard(color, ACTION.NUMBER, 0));
      for (var v = 1; v <= 9; v++) {
        deck.push(makeCard(color, ACTION.NUMBER, v));
        deck.push(makeCard(color, ACTION.NUMBER, v));
      }
      [ACTION.SKIP, ACTION.REVERSE, ACTION.DRAW2].forEach(function (t) {
        deck.push(makeCard(color, t));
        deck.push(makeCard(color, t));
      });
    });
    for (var i = 0; i < 4; i++) deck.push(makeCard(null, ACTION.WILD));
    for (var j = 0; j < 4; j++) deck.push(makeCard(null, ACTION.WILD4));
    return deck;
  }

  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  UNO.deck = { buildDeck: buildDeck, shuffle: shuffle, makeCard: makeCard };
})();
