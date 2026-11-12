(function () {
  'use strict';
  var UNO = (window.UNO = window.UNO || {});
  var C = UNO.C;
  var ACTION = C.ACTION;
  var game = null;

  function $(sel) { return document.querySelector(sel); }
  function each(nodeList, fn) { Array.prototype.forEach.call(nodeList, fn); }

  // ---------- 贴纸：单文件加载 + 图片加载失败占位 ----------
  function applySticker(img, key) {
    var s = C.STICKERS[key];
    if (!s) return;
    img.onerror = function () {
      img.onerror = null;
      img.style.display = 'none';
      var ph = document.createElement('div');
      ph.className = 'sticker-fallback';
      ph.style.background = s.color;
      ph.textContent = s.emoji;
      ph.title = s.label + '（图片加载失败占位）';
      if (img.parentNode) img.parentNode.appendChild(ph);
    };
    img.src = C.STICKER_DIR + s.file;
  }

  function hydrateStickers(root) {
    each(root.querySelectorAll('[data-sticker]'), function (el) {
      var s = C.STICKERS[el.getAttribute('data-sticker')];
      if (!s) return;
      var img = document.createElement('img');
      img.className = 'sticker-img';
      img.alt = s.label;
      el.innerHTML = '';
      el.appendChild(img);
      applySticker(img, el.getAttribute('data-sticker'));
    });
  }

  function colorToSticker(color) {
    return { red: 'bella', pink: 'diana', blue: 'eileen', purple: 'sinuo' }[color];
  }

  // ---------- 单张牌 ----------
  function cardHTML(card, opts) {
    opts = opts || {};
    var c = card.color ? C.COLORS[card.color] : null;
    var bg = c ? c.hex : '#2b2b33';
    var main, small = '', corner;
    if (card.type === ACTION.NUMBER) {
      main = '<span class="card-num">' + card.value + '</span>';
      corner = String(card.value);
    } else {
      main = '<span class="card-sym">' + C.SYMBOL[card.type] + '</span>';
      small = '<span class="card-tag">' + C.ACTION_LABEL[card.type] + '</span>';
      corner = C.SYMBOL[card.type];
    }
    var deco = '';
    if (card.type === ACTION.WILD) deco = '<span class="card-deco" data-sticker="acao"></span>';
    else if (card.type === ACTION.WILD4) deco = '<span class="card-deco" data-sticker="acao-gold"></span>';
    else if (card.color) deco = '<span class="card-deco" data-sticker="' + colorToSticker(card.color) + '"></span>';

    var cls = 'card face' + (card.color === null ? ' card-wild' : '') +
      (card.type === ACTION.WILD4 ? ' card-wild4' : '') +
      (opts.playable ? ' playable' : '') + (opts.disabled ? ' disabled' : '');
    return '<div class="' + cls + '" style="--card-color:' + bg + '"' +
      (opts.id ? ' data-id="' + card.id + '"' : '') + '>' +
      '<span class="card-corner">' + corner + '</span>' +
      main + small + deco + '</div>';
  }

  // ---------- 对手座位 ----------
  function seatHTML(seatIdx) {
    var seat = C.SEATS[seatIdx];
    var p = game.players[seatIdx];
    var active = game.current() === seatIdx && game.winner === null && game.phase !== 'over';
    var avatar = seat.sticker
      ? '<div class="avatar" data-sticker="' + seat.sticker + '"></div>'
      : '<div class="avatar avatar-you">你</div>';
    var backs = '';
    var n = Math.min(p.hand.length, 8);
    for (var i = 0; i < n; i++) backs += '<div class="card back mini-back"></div>';
    return '<div class="seat-inner' + (active ? ' active' : '') + '">' +
      avatar +
      '<div class="seat-meta"><span class="seat-name">' + seat.name + '</span>' +
      '<span class="seat-count">' + p.hand.length + ' 张</span></div>' +
      '<div class="seat-backs">' + backs + '</div>' +
      (active ? '<span class="turn-dot">● 出牌中</span>' : '') +
      '</div>';
  }

  function renderSeats() {
    ['#seatTop|1', '#seatLeft|2', '#seatRight|3'].forEach(function (pair) {
      var parts = pair.split('|');
      var el = $(parts[0]);
      el.innerHTML = seatHTML(parseInt(parts[1], 10));
      hydrateStickers(el);
    });
  }

  // ---------- 中央牌堆 / HUD ----------
  function renderCenter() {
    var dp = $('#discardPile');
    dp.innerHTML = cardHTML(game.topCard()) + '<span class="pile-label">弃牌堆</span>';
    hydrateStickers(dp);
    $('#drawCount').textContent = game.drawPile.length;
    var cc = C.COLORS[game.currentColor];
    var badge = $('#colorBadge');
    badge.textContent = '当前颜色：' + (cc ? cc.name : '—');
    badge.style.background = cc ? cc.hex : '#666';
  }

  // ---------- 玩家手牌（扇形） ----------
  function renderHand() {
    var hand = game.players[0].hand;
    var canInteract = game.phase === 'human' && game.winner === null;
    var playableIds = {};
    if (canInteract) {
      UNO.rules.playable(hand, game.topCard(), game.currentColor).forEach(function (c) { playableIds[c.id] = true; });
    }
    var mid = (hand.length - 1) / 2;
    var html = '';
    hand.forEach(function (card, i) {
      var isP = !!playableIds[card.id];
      var angle = (i - mid) * 3;
      var lift = Math.abs(i - mid) * 2;
      html += '<div class="hand-slot" style="--angle:' + angle + 'deg; --lift:' + lift + 'px">' +
        cardHTML(card, { id: card.id, playable: isP && canInteract, disabled: canInteract && !isP }) +
        '</div>';
    });
    var handEl = $('#hand');
    handEl.innerHTML = html;
    hydrateStickers(handEl);
    $('#handCount').textContent = hand.length;
    each(handEl.querySelectorAll('.card[data-id]'), function (el) {
      el.addEventListener('click', function () { game.playHumanCard(el.getAttribute('data-id')); });
    });
  }

  // ---------- 控件 / 状态 ----------
  function renderControls() {
    var humanTurn = game.phase === 'human' && game.winner === null;
    $('#btnDraw').disabled = !(humanTurn && !game.humanDrew);
    $('#btnPass').hidden = !(humanTurn && game.humanDrew);
    $('#btnUno').hidden = !(game.uno && game.uno.active);
    $('#status').textContent = game.message || '';
    $('#turnInfo').textContent = game.phase === 'over'
      ? '本局结束'
      : (game.players[game.current()].isHuman ? '你的回合' : game.players[game.current()].name + ' 的回合');
  }

  // ---------- 浮层 ----------
  function recordHTML(rec) {
    if (!rec.games) return '暂无战绩，快来开一局吧';
    var s = '累计 <b>' + rec.games + '</b> 局 · 胜 <b>' + rec.wins + '</b> 局 · 最高积分 <b>' + (rec.best || 0) + '</b>';
    if (rec.history && rec.history.length) {
      s += '<div class="history">最近：' + rec.history.slice(0, 5).map(function (h) {
        return (h.win ? '\u2705' : '\u274C') + ' ' + (h.name || '?') + ' ' + h.score + '分';
      }).join('　') + '</div>';
    }
    return s;
  }

  function renderColorOverlay() {
    var ov = $('#colorOverlay');
    if (game.phase === 'choosecolor') {
      ov.hidden = false;
      $('#colorChoices').innerHTML = C.COLOR_KEYS.map(function (k) {
        var c = C.COLORS[k];
        return '<button class="color-choice" data-color="' + k + '" style="background:' + c.hex + '">' + c.name + '</button>';
      }).join('');
      each($('#colorChoices').querySelectorAll('.color-choice'), function (b) {
        b.addEventListener('click', function () { game.chooseColor(b.getAttribute('data-color')); });
      });
    } else {
      ov.hidden = true;
    }
  }

  function renderOverlays() {
    $('#startOverlay').hidden = !(game.phase === 'idle');
    if (game.phase === 'idle') $('#recordBrief').innerHTML = recordHTML(game.loadRecord());
    if (game.phase === 'over') {
      $('#endOverlay').hidden = false;
      var humanWon = game.winner === 0;
      $('#endTitle').textContent = humanWon ? '\u{1F389} 应援成功，你赢了！' : (game.players[game.winner].name + ' 获胜');
      $('#endScore').textContent = '本局积分 ' + game.score + '（胜者得三家手牌点数和）';
      $('#endRecord').innerHTML = recordHTML(game.loadRecord());
    } else {
      $('#endOverlay').hidden = true;
    }
  }

  function render() {
    if (!game.players) { // 未开局：只显示开始浮层
      $('#startOverlay').hidden = false;
      $('#endOverlay').hidden = true;
      $('#colorOverlay').hidden = true;
      $('#recordBrief').innerHTML = recordHTML(game.loadRecord());
      return;
    }
    renderSeats();
    renderCenter();
    renderHand();
    renderControls();
    renderColorOverlay();
    renderOverlays();
  }

  // ---------- 事件绑定 ----------
  function init(g) {
    game = g;
    $('#btnStart').addEventListener('click', function () { $('#recordOverlay').hidden = true; game.start(); });
    $('#btnAgain').addEventListener('click', function () { $('#recordOverlay').hidden = true; game.start(); });
    $('#btnRestart').addEventListener('click', function () { $('#recordOverlay').hidden = true; game.start(); });
    $('#btnDraw').addEventListener('click', function () { game.drawHuman(); });
    $('#drawPile').addEventListener('click', function () { game.drawHuman(); });
    $('#btnPass').addEventListener('click', function () { game.passHuman(); });
    $('#btnUno').addEventListener('click', function () { game.callUno(); });
    $('#btnRecord').addEventListener('click', function () {
      $('#recordFull').innerHTML = recordHTML(game.loadRecord());
      $('#recordOverlay').hidden = false;
    });
    $('#btnRecordClose').addEventListener('click', function () { $('#recordOverlay').hidden = true; });
    // 键盘：空格摸牌、U 应援
    document.addEventListener('keydown', function (e) {
      if (e.key === ' ' && game.phase === 'human') { e.preventDefault(); game.drawHuman(); }
      if ((e.key === 'u' || e.key === 'U') && game.uno && game.uno.active) game.callUno();
    });
  }

  UNO.UI = { init: init, render: render, recordHTML: recordHTML };
})();
