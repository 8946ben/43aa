(function () {
  'use strict';
  var UNO = window.UNO;
  // onChange 只负责触发重绘；UI 通过 init 持有同一个 game 实例
  var game = new UNO.Game(function () { UNO.UI.render(); });
  UNO.UI.init(game);
  UNO.UI.render(); // phase='idle'：显示开始浮层
})();
