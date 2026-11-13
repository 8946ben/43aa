(function () {
  'use strict';
  var UNO = (window.UNO = window.UNO || {});
  var C = UNO.C;
  var ACTION = C.ACTION;
  var COLOR_KEYS = C.COLOR_KEYS;

  function Game(onChange) {
    this.onChange = onChange || function () {};
    this.phase = 'idle';   // idle | human | ai | choosecolor | roundover | over
    this.winner = null;
    this.gen = 0;          // 局代号，作废上一局遗留的 AI 定时器
    this.passStreak = 0;
    this.config = { mode: 'tournament', rounds: 3, stacking: false, counter: false };
    this.tournament = null;
    this.players = null;
    this.roundPoints = [0, 0, 0, 0];
    this.pending = { count: 0, kind: null };
    this.uno = { active: false, timer: null };
    this.evQueue = [];
  }

  Game.prototype.emit = function () {
    var evs = this.evQueue;
    this.evQueue = [];
    this.onChange(this, evs);
  };
  // 事件队列：同一次状态变更里的多个事件（出牌/摸牌/命中）一起交给 UI 做动画
  Game.prototype.ev = function (e) { this.evQueue.push(e); };

  // ---------- 开局 / 赛制 ----------
  Game.prototype.newGame = function (cfg) {
    cfg = cfg || this.config;
    this.config = {
      mode: cfg.mode === 'single' ? 'single' : 'tournament',
      rounds: cfg.rounds === 5 ? 5 : 3,
      stacking: !!cfg.stacking,
      counter: !!cfg.counter
    };
    if (this.config.mode === 'tournament') {
      this.tournament = {
        rounds: this.config.rounds,
        target: Math.ceil(this.config.rounds / 2), // 3 局两胜 / 5 局三胜
        round: 1,
        totals: [0, 0, 0, 0],
        wins: [0, 0, 0, 0],
        played: 0,
        done: false
      };
    } else {
      this.tournament = null;
    }
    this.startRound();
  };

  Game.prototype.start = function (cfg) { this.newGame(cfg); };
  Game.prototype.restart = function () { this.newGame(this.config); };

  Game.prototype.nextRound = function () {
    if (!this.tournament || this.tournament.done) { this.newGame(this.config); return; }
    this.tournament.round += 1;
    this.startRound();
  };

  Game.prototype.startRound = function () {
    this.gen += 1;
    this.clearUno();
    this.evQueue = [];
    var deck = UNO.deck.shuffle(UNO.deck.buildDeck()); // 108
    this.players = C.SEATS.map(function (s, i) {
      return { index: i, name: s.name, isHuman: s.isHuman, hand: [] };
    });
    for (var r = 0; r < 7; r++) {
      for (var p = 0; p < 4; p++) this.players[p].hand.push(deck.pop());
    }
    this.drawPile = deck; // 80
    // 起始弃牌取一张普通数字牌，保证首回合干净
    var idx = -1;
    for (var i = this.drawPile.length - 1; i >= 0; i--) {
      if (this.drawPile[i].color !== null && this.drawPile[i].type === ACTION.NUMBER) { idx = i; break; }
    }
    if (idx < 0) idx = this.drawPile.length - 1;
    var startCard = this.drawPile.splice(idx, 1)[0];
    this.discard = [startCard];
    this.currentColor = startCard.color;

    this.order = [0, 1, 2, 3];
    this.pos = 0;
    this.dir = 1;
    this.winner = null;
    this.score = 0;
    this.roundPoints = [0, 0, 0, 0];
    this.humanDrew = false;
    this.pendingWild = null;
    this.passStreak = 0;
    this.pending = { count: 0, kind: null };
    this.message = '';
    this.ev({ t: 'round', round: this.tournament ? this.tournament.round : 1 });
    this.beginTurn();
  };

  Game.prototype.current = function () { return this.order[this.pos]; };
  Game.prototype.topCard = function () { return this.discard[this.discard.length - 1]; };
  Game.prototype.peekNext = function (n) {
    var idx = ((this.pos + this.dir * n) % 4 + 4) % 4;
    return this.order[idx];
  };
  Game.prototype.advance = function (step) {
    this.pos = ((this.pos + this.dir * step) % 4 + 4) % 4;
  };

  // 摸 1 张：摸牌堆空了就把弃牌堆（留顶牌）洗回来
  Game.prototype.drawOne = function () {
    if (this.drawPile.length === 0) {
      if (this.discard.length <= 1) return null;
      var top = this.discard.pop();
      this.drawPile = UNO.deck.shuffle(this.discard);
      this.discard = [top];
    }
    this.passStreak = 0;
    return this.drawPile.pop();
  };

  Game.prototype.giveCards = function (playerIdx, n) {
    for (var i = 0; i < n; i++) {
      var c = this.drawOne();
      if (c) this.players[playerIdx].hand.push(c);
    }
  };

  Game.prototype.minOpponentCards = function (p) {
    var m = Infinity;
    for (var i = 0; i < 4; i++) if (i !== p) m = Math.min(m, this.players[i].hand.length);
    return m;
  };

  // +2/+4 叠加：返回手里能继续转嫁罚牌的牌
  Game.prototype.stackableCards = function (hand) {
    if (!this.config.stacking || !this.pending || this.pending.count <= 0) return [];
    var kind = this.pending.kind;
    return hand.filter(function (c) {
      if (c.type === ACTION.WILD4) return true;             // +4 能压 +2 / +4
      if (c.type === ACTION.DRAW2) return kind === 'draw2'; // +2 只能压 +2
      return false;
    });
  };

  // ---------- 回合流转 ----------
  Game.prototype.beginTurn = function (note) {
    if (this.winner !== null) return;
    var cur = this.current();
    this.humanDrew = false;
    if (this.pending.count > 0) { this.beginPending(cur); return; }

    if (this.players[cur].isHuman) {
      this.phase = 'human';
      this.message = note ? note + ' · 轮到你出牌' : '轮到你出牌：点手牌打出，或点摸牌堆摸 1 张';
      this.emit();
    } else {
      this.phase = 'ai';
      this.message = (note ? note + ' · ' : '') + this.players[cur].name + ' 思考中…';
      this.emit();
      var self = this, g = this.gen, p = cur;
      setTimeout(function () { self.aiTurn(p, g); }, 650);
    }
  };

  // 身上挂着累计罚牌时的回合
  Game.prototype.beginPending = function (cur) {
    var p = this.players[cur];
    var can = this.stackableCards(p.hand);
    var head = '罚牌 x' + this.pending.count;
    if (p.isHuman) {
      this.phase = 'human';
      this.message = head + '：' + (can.length
        ? '可反打 +2 / +4，或点「认罚」摸 ' + this.pending.count + ' 张'
        : '没有可反打的牌，点「认罚」摸 ' + this.pending.count + ' 张');
      this.emit();
      return;
    }
    this.phase = 'ai';
    this.message = head + ' · ' + p.name + ' 思考中…';
    this.emit();
    var self = this, g = this.gen, idx = cur;
    setTimeout(function () { self.aiPending(idx, g); }, 600);
  };

  Game.prototype.aiPending = function (p, g) {
    if (g !== this.gen) return;
    if (this.winner !== null || this.phase !== 'ai' || this.current() !== p) return;
    var hand = this.players[p].hand;
    var opts = this.stackableCards(hand);
    if (opts.length) {
      var chosen = UNO.ai.choose(opts, hand, this.minOpponentCards(p));
      var color = chosen.color === null ? UNO.ai.chooseColor(hand) : null;
      this.commitPlay(p, chosen, color);
      return;
    }
    this.takePenalty(p);
  };

  // 认罚：摸走全部累计罚牌，本回合被跳过
  Game.prototype.takePenalty = function (p) {
    var n = this.pending.count;
    if (n <= 0) return;
    this.pending = { count: 0, kind: null };
    this.giveCards(p, n);
    this.ev({ t: 'draw', p: p, n: n });
    this.ev({ t: 'hit', target: p, kind: 'penalty' });
    this.advance(1);
    this.beginTurn(this.players[p].name + ' 认罚摸 ' + n + ' 张');
  };

  Game.prototype.aiTurn = function (p, g) {
    if (g !== this.gen) return;                       // 上一局的定时器，作废
    if (this.winner !== null || this.phase !== 'ai' || this.current() !== p) return;
    if (this.pending.count > 0) { this.beginPending(p); return; }
    var hand = this.players[p].hand;
    var top = this.topCard();
    var playable = UNO.rules.playable(hand, top, this.currentColor);
    var chosen = null;

    if (playable.length === 0) {
      var drawn = this.drawOne();
      if (drawn) hand.push(drawn);
      this.ev({ t: 'draw', p: p, n: drawn ? 1 : 0 });
      var again = UNO.rules.playable(hand, top, this.currentColor);
      if (again.length > 0) {
        // 能出则立即出（优先刚摸到的那张）
        chosen = null;
        for (var k = 0; k < again.length; k++) if (drawn && again[k].id === drawn.id) { chosen = again[k]; break; }
        if (!chosen) chosen = UNO.ai.choose(again, hand, this.minOpponentCards(p));
      }
      if (!chosen) {
        if (!drawn) {
          // 牌堆彻底耗尽且无人能出：避免死循环，强制结算
          this.passStreak += 1;
          if (this.passStreak >= 4) { this.forceEnd(); return; }
          this.message = '牌堆已空，' + this.players[p].name + ' 过牌';
        } else {
          this.message = this.players[p].name + ' 摸牌，仍无牌可出';
        }
        this.emit();
        this.advance(1);
        this.beginTurn();
        return;
      }
    } else {
      chosen = UNO.ai.choose(playable, hand, this.minOpponentCards(p));
    }

    var color = chosen.color === null ? UNO.ai.chooseColor(hand) : null;
    this.commitPlay(p, chosen, color);
  };

  // ---------- 出牌 ----------
  Game.prototype.commitPlay = function (p, card, chosenColor) {
    this.passStreak = 0;
    var hand = this.players[p].hand;
    var i = hand.findIndex(function (c) { return c.id === card.id; });
    if (i < 0) return;
    hand.splice(i, 1);
    this.discard.push(card);
    this.currentColor = chosenColor || card.color;
    this.ev({ t: 'play', p: p, card: card, color: this.currentColor });
    this.resolve(p, card);
  };

  // 结算一张已放入弃牌堆的牌：功能效果 -> 应援窗口 -> 胜负 -> 轮转
  Game.prototype.resolve = function (p, card) {
    var target = this.peekNext(1);
    var step = 1;
    var hit = null;
    var stacking = this.config.stacking;

    if (stacking && (card.type === ACTION.DRAW2 || card.type === ACTION.WILD4)) {
      // 叠加模式：罚牌先累计，交给下家决定反打还是认罚
      this.pending.count += card.type === ACTION.DRAW2 ? 2 : 4;
      this.pending.kind = card.type === ACTION.DRAW2 ? 'draw2' : 'wild4';
      hit = card.type === ACTION.DRAW2 ? 'draw2' : 'draw4';
    } else {
      switch (card.type) {
        case ACTION.SKIP: step = 2; hit = 'skip'; break;
        case ACTION.REVERSE: this.dir *= -1; step = 1; break; // 4 人局：反转即反向
        case ACTION.DRAW2:
          this.giveCards(target, 2);
          this.ev({ t: 'draw', p: target, n: 2 });
          step = 2; hit = 'draw2';
          break;
        case ACTION.WILD4:
          this.giveCards(target, 4);
          this.ev({ t: 'draw', p: target, n: 4 });
          step = 2; hit = 'draw4';
          break;
        default: step = 1;
      }
    }
    if (hit) this.ev({ t: 'hit', target: target, kind: hit });

    if (this.players[p].hand.length === 0) {
      // 最后一手是 +2/+4：累计罚牌仍要结算给下家
      if (this.pending.count > 0) {
        this.giveCards(target, this.pending.count);
        this.ev({ t: 'draw', p: target, n: this.pending.count });
        this.pending = { count: 0, kind: null };
      }
      this.win(p);
      return;
    }
    this.advance(step);
    this.beginTurn(this.pending.count > 0 ? '罚牌累计 x' + this.pending.count : '');
    // 应援窗口放在最后，保证提示不被 beginTurn 覆盖（AI 剩 1 张自动应援、免罚）
    if (this.players[p].isHuman) this.checkUno(p);
  };

  // ---------- 玩家操作 ----------
  Game.prototype.playHumanCard = function (cardId) {
    if (this.phase !== 'human' || this.winner !== null) return;
    var card = this.players[0].hand.find(function (c) { return c.id === cardId; });
    if (!card) return;

    if (this.pending.count > 0) {
      // 罚牌未清：只能反打可叠加的牌
      if (this.stackableCards([card]).length === 0) {
        this.message = '罚牌 x' + this.pending.count + '：只能反打 +2 / +4，或点「认罚」';
        this.emit();
        return;
      }
    } else if (!UNO.rules.matches(card, this.topCard(), this.currentColor)) {
      this.message = '这张牌不匹配当前颜色 / 数字 / 符号哦';
      this.emit();
      return;
    }

    if (card.color === null) {
      // 人类打万能牌：先弹选色浮层，再结算
      var hand = this.players[0].hand;
      var i = hand.findIndex(function (c) { return c.id === cardId; });
      hand.splice(i, 1);
      this.discard.push(card);
      this.pendingWild = card;
      this.ev({ t: 'play', p: 0, card: card, color: this.currentColor });
      this.phase = 'choosecolor';
      this.message = '选择变色后的颜色';
      this.emit();
      return;
    }
    this.commitPlay(0, card, null);
  };

  Game.prototype.chooseColor = function (color) {
    if (this.phase !== 'choosecolor' || !this.pendingWild) return;
    if (COLOR_KEYS.indexOf(color) < 0) return;
    var card = this.pendingWild;
    this.pendingWild = null;
    this.currentColor = color;
    this.resolve(0, card);
  };

  Game.prototype.drawHuman = function () {
    if (this.phase !== 'human' || this.winner !== null || this.humanDrew) return;
    if (this.pending.count > 0) { this.message = '罚牌未清：只能反打或认罚'; this.emit(); return; }
    this.humanDrew = true;
    var card = this.drawOne();
    if (card) this.players[0].hand.push(card);
    this.ev({ t: 'draw', p: 0, n: card ? 1 : 0 });
    if (this.players[0].hand.length !== 1) this.clearUno();
    if (!card) { this.forceEnd(); return; } // 牌堆彻底耗尽
    var playable = UNO.rules.playable(this.players[0].hand, this.topCard(), this.currentColor);
    if (playable.length === 0) {
      this.message = '摸到一张仍无牌可出，轮转到下家';
      this.emit();
      this.advance(1);
      this.beginTurn();
    } else {
      this.message = '摸到一张：可立即打出，或点「过牌」';
      this.emit();
    }
  };

  Game.prototype.passHuman = function () {
    if (this.phase !== 'human' || !this.humanDrew || this.winner !== null) return;
    if (this.pending.count > 0) return;
    this.advance(1);
    this.beginTurn();
  };

  // 人类认罚（叠加模式）
  Game.prototype.acceptPenalty = function () {
    if (this.phase !== 'human' || this.winner !== null || this.pending.count <= 0) return;
    this.takePenalty(0);
  };

  // ---------- 「应援！」机制 ----------
  Game.prototype.checkUno = function (p) {
    if (this.winner !== null || this.players[p].hand.length !== 1) { this.clearUno(); return; }
    this.clearUno();
    var self = this;
    this.uno = { active: true, timer: setTimeout(function () { self.unoTimeout(); }, 2000) };
    this.message = '只剩 1 张！2 秒内点「应援！」免罚';
    this.emit();
  };

  Game.prototype.callUno = function () {
    if (!this.uno || !this.uno.active) return;
    this.clearUno();
    this.message = '应援成功！免罚 \u{1F389}';
    this.ev({ t: 'uno', ok: true });
    this.emit();
  };

  Game.prototype.unoTimeout = function () {
    if (!this.uno || !this.uno.active) return;
    this.uno.active = false;
    this.uno.timer = null;
    if (this.winner !== null) return;
    this.giveCards(0, 2);
    this.ev({ t: 'draw', p: 0, n: 2 });
    this.ev({ t: 'uno', ok: false });
    this.message = '忘记应援，罚摸 2 张！';
    this.emit();
  };

  Game.prototype.clearUno = function () {
    if (this.uno && this.uno.timer) clearTimeout(this.uno.timer);
    this.uno = { active: false, timer: null };
  };

  // ---------- 胜负 / 计分 / 战绩 ----------
  Game.prototype.win = function (p) {
    this.winner = p;
    this.clearUno();
    this.phase = 'over';
    this.pending = { count: 0, kind: null };
    var sum = 0;
    for (var i = 0; i < 4; i++) if (i !== p) sum += UNO.rules.scoreHand(this.players[i].hand);
    this.score = sum;
    this.roundPoints = [0, 0, 0, 0];
    this.roundPoints[p] = sum;

    var final = true;
    if (this.tournament) {
      var t = this.tournament;
      t.totals[p] += sum;
      t.wins[p] += 1;
      t.played += 1;
      t.lastWinner = p;
      t.done = t.played >= t.rounds || t.wins[p] >= t.target;
      final = t.done;
      if (!final) this.phase = 'roundover';
    }

    this.message = this.players[p].name + ' 获胜！本局积分 ' + sum;
    this.ev({ t: 'win', winner: p, score: sum, final: final });
    this.saveRecord();
    this.emit();
  };

  Game.prototype.forceEnd = function () {
    var best = 0;
    for (var i = 1; i < 4; i++) if (this.players[i].hand.length < this.players[best].hand.length) best = i;
    this.win(best);
  };

  // 累计积分榜（锦标赛按总积分，单局按本局得分）
  Game.prototype.standings = function () {
    if (!this.players) return [];
    var t = this.tournament;
    var rows = this.players.map(function (pl, i) {
      return {
        index: i,
        name: pl.name,
        total: t ? t.totals[i] : (this.roundPoints[i] || 0),
        wins: t ? t.wins[i] : (this.winner === i ? 1 : 0),
        round: this.roundPoints[i] || 0,
        cards: pl.hand.length
      };
    }, this);
    rows.sort(function (a, b) {
      if (b.total !== a.total) return b.total - a.total;
      if (b.wins !== a.wins) return b.wins - a.wins;
      return a.cards - b.cards;
    });
    return rows;
  };

  // 记牌器：各色已出张数（万能牌不计颜色）
  Game.prototype.colorStats = function () {
    var stats = {};
    C.COLOR_KEYS.forEach(function (k) { stats[k] = 0; });
    (this.discard || []).forEach(function (c) { if (c.color) stats[c.color] += 1; });
    return stats;
  };

  Game.prototype.loadRecord = function () {
    try {
      var raw = localStorage.getItem(C.STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* localStorage 不可用时不报错 */ }
    return { games: 0, wins: 0, best: 0, history: [] };
  };

  Game.prototype.saveRecord = function () {
    var rec = this.loadRecord();
    rec.games = (rec.games || 0) + 1;
    if (this.winner === 0) {
      rec.wins = (rec.wins || 0) + 1;
      if (this.score > (rec.best || 0)) rec.best = this.score;
    }
    rec.history = rec.history || [];
    rec.history.unshift({
      winner: this.winner, name: this.players[this.winner].name,
      score: this.score, win: this.winner === 0,
      mode: this.tournament ? 'tournament' : 'single',
      t: Date.now()
    });
    if (rec.history.length > 10) rec.history.length = 10;
    try { localStorage.setItem(C.STORAGE_KEY, JSON.stringify(rec)); } catch (e) { /* 忽略 */ }
    return rec;
  };

  UNO.Game = Game;
})();
