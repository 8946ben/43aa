(function () {
  'use strict';
  var UNO = (window.UNO = window.UNO || {});
  var C = UNO.C;
  var ACTION = C.ACTION;
  var game = null;

  var fromRect = null;      // 人类出牌前抢下的手牌位置（供飞牌动画用）
  var fromCardId = null;
  var lastHandScroll = 0;

  function $(sel) { return document.querySelector(sel); }
  function each(nodeList, fn) { Array.prototype.forEach.call(nodeList, fn); }

  function rectOf(el) {
    if (!el) return null;
    var r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }

  var SEAT_SELECTORS = ['#seatTop', '#seatLeft', '#seatRight'];

  function seatEl(idx) {
    if (idx === 0) return $('#handWrap');
    return $(SEAT_SELECTORS[idx - 1]);
  }

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
    var active = game.current() === seatIdx && game.winner === null &&
      game.phase !== 'over' && game.phase !== 'roundover' && game.phase !== 'idle';
    var avatar = seat.sticker
      ? '<div class="avatar" data-sticker="' + seat.sticker + '"></div>'
      : '<div class="avatar avatar-you">你</div>';
    var backs = '';
    var n = Math.min(p.hand.length, 8);
    for (var i = 0; i < n; i++) backs += '<div class="card back mini-back"></div>';

    var extra = '';
    if (game.tournament) {
      extra = '<span class="seat-total">' + game.tournament.totals[seatIdx] + ' 分 · ' +
        game.tournament.wins[seatIdx] + ' 胜</span>';
    }
    return '<div class="seat-inner' + (active ? ' active' : '') + '">' +
      avatar +
      '<div class="seat-meta"><span class="seat-name">' + seat.name + '</span>' +
      '<span class="seat-count">' + p.hand.length + ' 张</span></div>' +
      '<div class="seat-backs">' + backs + '</div>' +
      extra +
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

    var pb = $('#pendingBadge');
    if (game.pending && game.pending.count > 0) {
      pb.hidden = false;
      pb.textContent = '罚牌 x' + game.pending.count;
    } else {
      pb.hidden = true;
    }
  }

  // ---------- 玩家手牌（扇形） ----------
  function renderHand() {
    var hand = game.players[0].hand;
    var canInteract = game.phase === 'human' && game.winner === null;
    var pendingMode = game.pending && game.pending.count > 0;
    var playableIds = {};
    if (canInteract) {
      var list = pendingMode
        ? game.stackableCards(hand)
        : UNO.rules.playable(hand, game.topCard(), game.currentColor);
      list.forEach(function (c) { playableIds[c.id] = true; });
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
    var wrap = $('#handWrap');
    var keepScroll = wrap ? wrap.scrollLeft : 0;
    handEl.innerHTML = html;
    hydrateStickers(handEl);
    if (wrap) wrap.scrollLeft = keepScroll || lastHandScroll;
    $('#handCount').textContent = hand.length;
    each(handEl.querySelectorAll('.card[data-id]'), function (el) {
      el.addEventListener('click', function () {
        var id = el.getAttribute('data-id');
        fromRect = rectOf(el);
        fromCardId = id;
        try { game.playHumanCard(id); } finally { fromCardId = null; }
      });
    });
  }

  // ---------- 控件 / 状态 ----------
  function renderControls() {
    var humanTurn = game.phase === 'human' && game.winner === null;
    var pending = game.pending && game.pending.count > 0;
    $('#btnDraw').disabled = !(humanTurn && !game.humanDrew && !pending);
    $('#btnPass').hidden = !(humanTurn && game.humanDrew && !pending);
    $('#btnAccept').hidden = !(humanTurn && pending);
    if (pending) $('#btnAccept').textContent = '认罚摸 ' + game.pending.count + ' 张';
    $('#btnUno').hidden = !(game.uno && game.uno.active);
    $('#status').textContent = game.message || '';

    var cur = game.current();
    $('#turnInfo').textContent = (game.phase === 'over' || game.phase === 'roundover')
      ? '本局结束'
      : (game.phase === 'idle' ? '' : (game.players[cur].isHuman ? '你的回合' : game.players[cur].name + ' 的回合'));
  }

  // ---------- 应援边缘提示 ----------
  function renderUnoEdge() {
    var on = !!(game.uno && game.uno.active &&
      game.players && game.players[0].hand.length === 1 && game.winner === null);
    $('#unoEdge').classList.toggle('on', on);
    $('#handWrap').classList.toggle('uno-warn', on);
  }

  // ---------- 积分榜 / 记牌器 ----------
  function renderScoreBoard() {
    var bar = $('#subbar');
    var board = $('#scoreBoard');
    var counter = $('#counter');
    var showBoard = !!(game.tournament && game.players && game.phase !== 'idle');
    var showCounter = !!(game.config.counter && game.players && game.phase !== 'idle');

    board.hidden = !showBoard;
    counter.hidden = !showCounter;
    bar.hidden = !(showBoard || showCounter);

    if (showBoard) {
      var rows = game.standings();
      board.innerHTML = rows.map(function (r, i) {
        return '<span class="score-chip' + (r.index === 0 ? ' me' : '') + '">' +
          '<b class="rk">' + (i + 1) + '</b>' +
          '<span class="nm">' + r.name + '</span>' +
          '<b class="pts">' + r.total + '</b>' +
          '<span class="wins">' + r.wins + '胜</span></span>';
      }).join('');
    }
    if (showCounter) {
      var stats = game.colorStats();
      counter.innerHTML = C.COLOR_KEYS.map(function (k) {
        var c = C.COLORS[k];
        return '<span class="c-item"><i class="c-dot" style="background:' + c.hex + '"></i>' +
          c.name + ' <b>' + stats[k] + '</b>/' + C.COLOR_TOTAL + '</span>';
      }).join('');
    }
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

  function rankHTML() {
    var rows = game.standings();
    var tour = !!game.tournament;
    var h = '<table class="rank-table"><thead><tr><th>#</th><th>成员</th>' +
      (tour ? '<th>本局</th><th>累计</th><th>胜局</th>' : '<th>本局</th><th>剩牌</th>') +
      '</tr></thead><tbody>';
    rows.forEach(function (r, i) {
      h += '<tr class="' + (r.index === 0 ? 'me' : '') + '">' +
        '<td class="' + (i === 0 ? 'gold' : '') + '">' + (i === 0 ? '👑' : (i + 1)) + '</td>' +
        '<td class="nm">' + r.name + '</td>' +
        (tour
          ? '<td>' + r.round + '</td><td><b>' + r.total + '</b></td><td>' + r.wins + '</td>'
          : '<td>' + r.round + '</td><td>' + r.cards + '</td>') +
        '</tr>';
    });
    return h + '</tbody></table>';
  }

  function renderOverlays() {
    var idle = game.phase === 'idle';
    $('#startOverlay').hidden = !idle;
    if (idle) {
      $('#recordBrief').innerHTML = recordHTML(game.loadRecord());
      syncSetup(game.config);
    }

    var ended = game.phase === 'over' || game.phase === 'roundover';
    $('#endOverlay').hidden = !ended;
    if (!ended) return;

    var t = game.tournament;
    var humanWon = game.winner === 0;
    var title = '';

    if (game.phase === 'roundover') {
      title = '第 ' + t.round + ' / ' + t.rounds + ' 局结束 · ' + game.players[game.winner].name + ' 获胜';
    } else if (t) {
      var champ = game.standings()[0];
      title = champ.index === 0
        ? '\u{1F389} 你拿下总冠军！'
        : champ.name + ' 拿下总冠军';
    } else {
      title = humanWon ? '\u{1F389} 应援成功，你赢了！' : (game.players[game.winner].name + ' 获胜');
    }
    $('#endTitle').textContent = title;

    var scoreText;
    if (t) {
      scoreText = '本局积分 ' + game.score + ' · 你累计 ' + t.totals[0] + ' 分 · 赛制 ' +
        t.rounds + ' 局（' + t.target + ' 胜制）';
    } else {
      scoreText = '本局积分 ' + game.score + '（胜者得三家手牌点数和）';
    }
    $('#endScore').textContent = scoreText;
    $('#endRank').innerHTML = rankHTML();
    $('#endRecord').innerHTML = recordHTML(game.loadRecord());

    var btn = $('#btnAgain');
    if (game.phase === 'roundover') {
      btn.textContent = '下一局（第 ' + (t.round + 1) + ' 局）';
    } else if (t) {
      btn.textContent = '再来一届';
    } else {
      btn.textContent = '再来一局';
    }
  }

  // ---------- 设置面板 ----------
  function loadSettings() {
    var s = {};
    try { s = JSON.parse(localStorage.getItem(C.SETTINGS_KEY) || '{}') || {}; } catch (e) { s = {}; }
    return s;
  }

  function saveSettings(s) {
    try { localStorage.setItem(C.SETTINGS_KEY, JSON.stringify(s)); } catch (e) { /* 忽略 */ }
  }

  function readSetup() {
    var modeBtn = $('#modeSeg .on');
    var roundsBtn = $('#roundsSeg .on');
    return {
      mode: modeBtn ? modeBtn.getAttribute('data-mode') : 'tournament',
      rounds: roundsBtn ? parseInt(roundsBtn.getAttribute('data-rounds'), 10) : 3,
      stacking: $('#optStack').checked,
      counter: $('#optCounter').checked
    };
  }

  function syncSetup(cfg) {
    if (!cfg) return;
    each($('#modeSeg').querySelectorAll('button'), function (b) {
      b.classList.toggle('on', b.getAttribute('data-mode') === cfg.mode);
    });
    each($('#roundsSeg').querySelectorAll('button'), function (b) {
      b.classList.toggle('on', parseInt(b.getAttribute('data-rounds'), 10) === cfg.rounds);
    });
    $('#roundsRow').style.display = cfg.mode === 'single' ? 'none' : '';
    $('#optStack').checked = !!cfg.stacking;
    $('#optCounter').checked = !!cfg.counter;
  }

  // ---------- 动画 ----------
  function baseCardWidth() {
    var probe = document.querySelector('#hand .card') || document.querySelector('#discardPile .card');
    if (probe && probe.offsetWidth) return probe.offsetWidth;
    var v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cw'));
    return v || 88;
  }

  function fly(html, from, to, rot) {
    var layer = $('#fxLayer');
    if (!layer || !from || !to) return;
    var base = baseCardWidth();
    var el = document.createElement('div');
    el.className = 'fly-card';
    el.innerHTML = html;
    el.style.transform = 'translate3d(' + from.x + 'px,' + from.y + 'px,0) scale(' + (from.w / base) + ')';
    layer.appendChild(el);
    void el.offsetWidth; // 触发一次布局，保证下面的过渡能生效
    el.style.transform = 'translate3d(' + to.x + 'px,' + to.y + 'px,0) scale(' +
      (to.w / base) + ') rotate(' + (rot || 0) + 'deg)';
    el.style.opacity = '0.12';
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 320);
  }

  function fxPlay(e) {
    var from = (fromCardId && fromCardId === e.card.id && fromRect) ? fromRect : rectOf(seatEl(e.p));
    var pile = $('#discardPile');
    var to = rectOf(pile);
    if (!from || !to) return;
    var top = pile.querySelector('.card');
    if (top) {
      top.classList.add('fx-hidden');
      setTimeout(function () { top.classList.remove('fx-hidden'); }, 250);
    }
    var w = Math.min(to.w * 0.9, 96);
    fly(cardHTML(e.card), from, { x: to.x + (to.w - w) / 2, y: to.y + (to.h - w) / 2 - 4, w: w }, -9);
  }

  function fxDraw(e) {
    var from = rectOf($('#drawPile'));
    if (!from) return;
    var target = e.p === 0 ? $('#hand') : seatEl(e.p);
    var box = rectOf(target);
    if (!box) return;
    var n = Math.min(e.n || 0, 4);
    var w = e.p === 0 ? baseCardWidth() : 24;
    for (var i = 0; i < n; i++) {
      (function (i) {
        setTimeout(function () {
          fly('<div class="card back"></div>', from, {
            x: box.x + box.w / 2 - w / 2,
            y: box.y + box.h / 2 - w * 0.7,
            w: w
          }, i % 2 ? 4 : -4);
        }, i * 65);
      })(i);
    }
  }

  function fxHit(e) {
    var host = e.target === 0 ? $('#handWrap') : seatEl(e.target);
    if (!host) return;
    var el = e.target === 0 ? host : host.querySelector('.seat-inner');
    if (!el) return;
    el.classList.remove('flash-red', 'flash-gray');
    void el.offsetWidth; // 强制重排，让动画可重复触发
    el.classList.add(e.kind === 'skip' ? 'flash-gray' : 'flash-red');
    setTimeout(function () { el.classList.remove('flash-red', 'flash-gray'); }, 560);
  }

  // ---------- 语录 toast ----------
  var WHO_COLOR = {
    '贝拉': C.COLORS.red.hex, '嘉然': C.COLORS.pink.hex, '乃琳': C.COLORS.blue.hex,
    '思诺': C.COLORS.purple.hex, '心宜': '#79bfae', '阿草': '#5BA84A'
  };
  var lastQuote = '';

  function showQuote(kind) {
    var pool = C.QUOTES[kind];
    if (!pool || !pool.length) return;
    var q = pool[Math.floor(Math.random() * pool.length)];
    if (pool.length > 1 && q.text === lastQuote) {
      q = pool[(pool.indexOf(q) + 1) % pool.length];
    }
    lastQuote = q.text;
    var layer = $('#toastLayer');
    var el = document.createElement('div');
    el.className = 'quote-toast';
    el.style.setProperty('--quote-color', WHO_COLOR[q.who] || C.COLORS.pink.hex);
    el.innerHTML = '<span class="who">' + q.who + '</span>' + q.text;
    layer.appendChild(el);
    while (layer.children.length > 2) layer.removeChild(layer.firstChild);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 3000);
  }

  // ---------- 事件 -> 音效 / 动画 / 台词 ----------
  function handleEvents(evs) {
    evs.forEach(function (e) {
      switch (e.t) {
        case 'round':
          showQuote('start');
          break;
        case 'play':
          UNO.audio.play('click');
          fxPlay(e);
          if (e.card.type === ACTION.WILD4 && e.p !== 0) showQuote('wild4');
          else if (e.card.color === null && e.p === 0) showQuote('wild');
          break;
        case 'draw':
          if (e.n > 0) { UNO.audio.play('draw'); fxDraw(e); }
          break;
        case 'hit':
          if (e.kind !== 'skip') UNO.audio.play('down');
          fxHit(e);
          break;
        case 'uno':
          UNO.audio.play(e.ok ? 'bell' : 'buzz');
          break;
        case 'win':
          UNO.audio.play(e.winner === 0 ? 'win' : 'lose');
          showQuote(e.winner === 0 ? 'win' : 'lose');
          break;
        default: break;
      }
    });
  }

  // ---------- 渲染入口 ----------
  function render(g, evs) {
    game = g;
    if (!game.players) { // 未开局：只显示开始浮层
      $('#startOverlay').hidden = false;
      $('#endOverlay').hidden = true;
      $('#colorOverlay').hidden = true;
      $('#subbar').hidden = true;
      $('#unoEdge').classList.remove('on');
      $('#recordBrief').innerHTML = recordHTML(game.loadRecord());
      syncSetup(game.config);
      return;
    }
    renderSeats();
    renderCenter();
    renderHand();
    renderControls();
    renderColorOverlay();
    renderScoreBoard();
    renderOverlays();
    renderUnoEdge();
    if (evs && evs.length) handleEvents(evs);
  }

  // ---------- 事件绑定 ----------
  function syncMute() {
    var on = UNO.audio.isEnabled();
    var b = $('#btnMute');
    b.textContent = on ? '🔊' : '🔇';
    b.title = on ? '音效已开（M 键切换）' : '音效已关（M 键切换）';
    b.classList.toggle('muted', !on);
  }

  function init(g) {
    game = g;

    // 读取上次的设置，回填到开始面板
    var saved = loadSettings();
    if (saved.mode || saved.rounds || saved.stacking !== undefined || saved.counter !== undefined) {
      game.config = {
        mode: saved.mode === 'single' ? 'single' : 'tournament',
        rounds: saved.rounds === 5 ? 5 : 3,
        stacking: !!saved.stacking,
        counter: !!saved.counter
      };
    }
    syncSetup(game.config);

    $('#btnStart').addEventListener('click', function () {
      UNO.audio.unlock();
      var cfg = readSetup();
      saveSettings(cfg);
      $('#recordOverlay').hidden = true;
      game.newGame(cfg);
    });
    $('#btnAgain').addEventListener('click', function () {
      $('#recordOverlay').hidden = true;
      if (game.phase === 'roundover') game.nextRound();
      else game.newGame(game.config);
    });
    $('#btnRestart').addEventListener('click', function () {
      $('#recordOverlay').hidden = true;
      game.restart();
    });
    $('#btnDraw').addEventListener('click', function () { game.drawHuman(); });
    $('#drawPile').addEventListener('click', function () { game.drawHuman(); });
    $('#btnPass').addEventListener('click', function () { game.passHuman(); });
    $('#btnAccept').addEventListener('click', function () { game.acceptPenalty(); });
    $('#btnUno').addEventListener('click', function () { game.callUno(); });
    $('#btnRecord').addEventListener('click', function () {
      $('#recordFull').innerHTML = recordHTML(game.loadRecord());
      $('#recordOverlay').hidden = false;
    });
    $('#btnRecordClose').addEventListener('click', function () { $('#recordOverlay').hidden = true; });
    $('#btnMute').addEventListener('click', function () {
      var on = UNO.audio.toggle();
      syncMute();
      if (on) { UNO.audio.unlock(); UNO.audio.play('click'); }
    });

    // 模式 / 赛制切换
    each($('#modeSeg').querySelectorAll('button'), function (b) {
      b.addEventListener('click', function () {
        each($('#modeSeg').querySelectorAll('button'), function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        $('#roundsRow').style.display = b.getAttribute('data-mode') === 'single' ? 'none' : '';
        saveSettings(readSetup());
      });
    });
    each($('#roundsSeg').querySelectorAll('button'), function (b) {
      b.addEventListener('click', function () {
        each($('#roundsSeg').querySelectorAll('button'), function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        saveSettings(readSetup());
      });
    });
    $('#optStack').addEventListener('change', function () { saveSettings(readSetup()); });
    $('#optCounter').addEventListener('change', function () {
      game.config.counter = $('#optCounter').checked;
      saveSettings(readSetup());
      if (game.players) renderScoreBoard();
    });

    // 移动端横滑时记住滚动位置
    $('#handWrap').addEventListener('scroll', function () { lastHandScroll = $('#handWrap').scrollLeft; });

    // 键盘：空格摸牌、U 应援、M 静音
    document.addEventListener('keydown', function (e) {
      if (e.key === ' ' && game.phase === 'human') { e.preventDefault(); game.drawHuman(); }
      if ((e.key === 'u' || e.key === 'U') && game.uno && game.uno.active) game.callUno();
      if (e.key === 'm' || e.key === 'M') { UNO.audio.toggle(); syncMute(); }
    });

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) UNO.audio.unlock();
    });

    syncMute();
  }

  UNO.UI = { init: init, render: render, recordHTML: recordHTML, showQuote: showQuote };
})();
