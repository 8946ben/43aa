(function () {
  'use strict';
  var UNO = (window.UNO = window.UNO || {});
  var C = UNO.C;
  var ACTION = C.ACTION;
  var COLOR_KEYS = C.COLOR_KEYS;

  function Game(onChange) {
    this.onChange = onChange || function () {};
    this.phase = 'idle';   // idle | human | ai | choosecolor | over
    this.winner = null;
    this.gen = 0;          // 局代号，作废上一局遗留的 AI 定时器
    this.passStreak = 0;
  }

  Game.prototype.emit = function () { this.onChange(this); };

  // ---------- 开局 / 发牌 ----------
  Game.prototype.start = function () {
    this.gen += 1;
    this.clearUno();
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
    this.humanDrew = false;
    this.pendingWild = null;
    this.passStreak = 0;
    this.message = '';
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

  // ---------- 回合流转 ----------
  Game.prototype.beginTurn = function () {
    if (this.winner !== null) return;
    var cur = this.current();
    this.humanDrew = false;
    if (this.players[cur].isHuman) {
      this.phase = 'human';
      this.message = '轮到你出牌：点手牌打出，或点摸牌堆摸 1 张';
      this.emit();
    } else {
      this.phase = 'ai';
      this.message = this.players[cur].name + ' 思考中…';
      this.emit();
      var self = this, g = this.gen, p = cur;
      setTimeout(function () { self.aiTurn(p, g); }, 650);
    }
  };

  Game.prototype.aiTurn = function (p, g) {
    if (g !== this.gen) return;                       // 上一局的定时器，作废
    if (this.winner !== null || this.phase !== 'ai' || this.current() !== p) return;
    var hand = this.players[p].hand;
    var top = this.topCard();
    var playable = UNO.rules.playable(hand, top, this.currentColor);
    var chosen = null;

    if (playable.length === 0) {
      var drawn = this.drawOne();
      if (drawn) hand.push(drawn);
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
    this.resolve(p, card);
  };

  // 结算一张已放入弃牌堆的牌：功能效果 -> 应援窗口 -> 胜负 -> 轮转
  Game.prototype.resolve = function (p, card) {
    var step = 1;
    switch (card.type) {
      case ACTION.SKIP:  step = 2; break;
      case ACTION.REVERSE: this.dir *= -1; step = 1; break; // 4 人局：反转即反向
      case ACTION.DRAW2: this.giveCards(this.peekNext(1), 2); step = 2; break; // 下家摸 2 且被跳过
      case ACTION.WILD4: this.giveCards(this.peekNext(1), 4); step = 2; break; // 下家摸 4 且被跳过
      default: step = 1;
    }
    // Stage 1 不含 +2/+4 叠加规则，效果立即结算

    if (this.players[p].hand.length === 0) { this.win(p); return; }
    this.advance(step);
    this.beginTurn();
    // 应援窗口放在最后，保证提示不被 beginTurn 覆盖（AI 剩 1 张自动应援、免罚）
    if (this.players[p].isHuman) this.checkUno(p);
  };

  // ---------- 玩家操作 ----------
  Game.prototype.playHumanCard = function (cardId) {
    if (this.phase !== 'human' || this.winner !== null) return;
    var card = this.players[0].hand.find(function (c) { return c.id === cardId; });
    if (!card) return;
    if (!UNO.rules.matches(card, this.topCard(), this.currentColor)) {
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
    this.humanDrew = true;
    var card = this.drawOne();
    if (card) this.players[0].hand.push(card);
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
    this.advance(1);
    this.beginTurn();
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
    this.emit();
  };

  Game.prototype.unoTimeout = function () {
    if (!this.uno || !this.uno.active) return;
    this.uno.active = false;
    this.uno.timer = null;
    if (this.winner !== null) return;
    this.giveCards(0, 2);
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
    var sum = 0;
    for (var i = 0; i < 4; i++) if (i !== p) sum += UNO.rules.scoreHand(this.players[i].hand);
    this.score = sum;
    this.message = this.players[p].name + ' 获胜！本局积分 ' + sum;
    this.saveRecord();
    this.emit();
  };

  Game.prototype.forceEnd = function () {
    var best = 0;
    for (var i = 1; i < 4; i++) if (this.players[i].hand.length < this.players[best].hand.length) best = i;
    this.win(best);
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
      score: this.score, win: this.winner === 0, t: Date.now()
    });
    if (rec.history.length > 10) rec.history.length = 10;
    try { localStorage.setItem(C.STORAGE_KEY, JSON.stringify(rec)); } catch (e) { /* 忽略 */ }
    return rec;
  };

  UNO.Game = Game;
})();
