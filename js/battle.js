/* battle.js — ターン制コマンドバトル。
 * ロジックと演出を分離：エンジンは state を更新し、UIが再生するイベント列を返す。
 * ダメージは attack/defense の比率型（レベル非依存・ステータス依存）。 */
(function (MF) {
  "use strict";
  var BAL = MF.BAL;
  var clamp = MF.clamp;

  function makeCombatant(monster, side) {
    var f = MF.Stats.finalStats(monster);
    return {
      ref: monster, side: side, name: MF.Monster.displayName(monster),
      family: MF.Stats.dominantFamily(monster),
      affinity: monster.affinity,
      f: f, maxhp: f.hp, hp: f.hp, sp: Math.round(f.sp * 0.6),
      buffs: {}, statuses: [], guard: false, alive: true
    };
  }

  function hasStatus(c, t) { for (var i = 0; i < c.statuses.length; i++) if (c.statuses[i].type === t) return true; return false; }
  function addStatus(c, t, turns, power) {
    for (var i = 0; i < c.statuses.length; i++) if (c.statuses[i].type === t) { c.statuses[i].turns = Math.max(c.statuses[i].turns, turns); return; }
    c.statuses.push({ type: t, turns: turns, power: power || 0 });
  }
  function eff(c, stat) {
    var v = c.f[stat];
    var list = c.buffs[stat];
    if (list) for (var i = 0; i < list.length; i++) v *= list[i].mul;
    if (stat === "attack" && hasStatus(c, "burn")) v *= 0.85;
    if (stat === "speed" && hasStatus(c, "paralyze")) v *= 0.7;
    return v;
  }
  function addBuff(c, stat, mul, turns) {
    if (!c.buffs[stat]) c.buffs[stat] = [];
    c.buffs[stat].push({ mul: mul, turns: turns });
  }

  function typeMul(attFam, defFam) {
    if (MF.TYPE_ADV[attFam] === defFam) return BAL.typeAdvMul;
    if (MF.TYPE_ADV[defFam] === attFam) return BAL.typeDisMul;
    return 1.0;
  }

  function Battle(playerMon, enemyMon, opts) {
    opts = opts || {};
    this.rng = opts.rng || new MF.RNG();
    this.p = makeCombatant(playerMon, "player");
    this.e = makeCombatant(enemyMon, "enemy");
    this.turn = 0;
    this.over = false;
    this.result = null; // {winner, reason}
    this.mode = opts.mode || "wild"; // wild / pvp
  }
  Battle.prototype.opp = function (c) { return c === this.p ? this.e : this.p; };

  // ---- ダメージ計算（核）----
  Battle.prototype.computeDamage = function (att, def, power, o) {
    o = o || {};
    var A = eff(att, "attack");
    var D = (o.ignoreBuffs ? def.f.defense : eff(def, "defense")) * (1 - (o.ignoreDefFrac || 0));
    var base = A * power;
    var dmg = base * (A / (A + D));            // 比率緩和：守備が高いほど減る
    var tm = typeMul(att.family, def.family);
    dmg *= tm;
    var critRate = clamp(BAL.critBase + eff(att, "trust") * BAL.critPerTrust, BAL.critBase, BAL.critCap) + (o.critBonus || 0);
    var crit = this.rng.next() < critRate;
    if (crit) dmg *= BAL.critMult;
    var spread = BAL.spreadLo + this.rng.next() * (BAL.spreadHi - BAL.spreadLo);
    var luckBias = 1 + (eff(att, "luck") - eff(def, "luck")) * BAL.luckPerPoint;
    dmg *= spread * Math.max(0.5, luckBias);
    if (def.guard) dmg *= BAL.guardMul;
    return { value: Math.max(1, Math.round(dmg)), crit: crit, typeMul: tm };
  };

  // 回避判定（直接攻撃のみ）
  Battle.prototype.tryEvade = function (att, def) {
    var ev = clamp((eff(def, "speed") - eff(att, "speed")) * BAL.evadePerSpeed
      + (eff(def, "luck") - eff(att, "luck")) * BAL.evadePerLuck, 0, BAL.evadeCap);
    return this.rng.next() < ev;
  };

  function dealDamage(self, att, def, r, ev) {
    def.hp -= r.value;
    ev.push({ kind: r.crit ? "crit" : "damage", actor: att.side, target: def.side, value: r.value, crit: r.crit, typeMul: r.typeMul });
    if (def.hp <= 0) { def.hp = 0; def.alive = false; ev.push({ kind: "faint", target: def.side }); }
  }

  // 効果1つを適用
  Battle.prototype.applyEffect = function (att, primaryTarget, e, ev) {
    var tgt = (e.self ? att : primaryTarget);
    switch (e.type) {
      case "damage": {
        if (this.tryEvade(att, primaryTarget)) { ev.push({ kind: "miss", actor: att.side, target: primaryTarget.side }); return; }
        var r = this.computeDamage(att, primaryTarget, e.power, e);
        dealDamage(this, att, primaryTarget, r, ev);
        break;
      }
      case "drain": {
        if (this.tryEvade(att, primaryTarget)) { ev.push({ kind: "miss", actor: att.side, target: primaryTarget.side }); return; }
        var rd = this.computeDamage(att, primaryTarget, e.power, e);
        dealDamage(this, att, primaryTarget, rd, ev);
        var heal = Math.round(rd.value * (e.healFrac || 0.5));
        att.hp = Math.min(att.maxhp, att.hp + heal);
        ev.push({ kind: "heal", target: att.side, value: heal });
        break;
      }
      case "status": {
        if (this.rng.next() < (e.chance || 1)) { addStatus(primaryTarget, e.status, e.turns || 3); ev.push({ kind: "status", target: primaryTarget.side, status: e.status }); }
        break;
      }
      case "buff": {
        addBuff(tgt, e.stat, e.mul, e.turns || 3);
        ev.push({ kind: "buff", target: tgt.side, stat: e.stat, up: e.mul >= 1 });
        break;
      }
      case "heal": {
        var amt = e.amount != null ? e.amount : Math.round(tgt.maxhp * (e.frac || 0.3));
        tgt.hp = Math.min(tgt.maxhp, tgt.hp + amt);
        ev.push({ kind: "heal", target: tgt.side, value: amt });
        break;
      }
      case "cleanse": {
        tgt.statuses = []; ev.push({ kind: "cleanse", target: tgt.side });
        break;
      }
    }
  };

  // 1体の行動を実行
  Battle.prototype.act = function (actor, action, ev) {
    if (!actor.alive) return;
    var foe = this.opp(actor);
    // 麻痺で行動不能
    if (hasStatus(actor, "paralyze") && this.rng.next() < 0.3) {
      ev.push({ kind: "info", text: actor.name + " はしびれて動けない！", actor: actor.side });
      return;
    }
    if (action.type === "guard") {
      actor.guard = true;
      actor.sp = Math.min(actor.f.sp, actor.sp + BAL.basicSpGain);
      ev.push({ kind: "guard", actor: actor.side, text: actor.name + " は身を守っている。" });
      return;
    }
    if (action.type === "attack") {
      ev.push({ kind: "act", actor: actor.side, text: actor.name + " の攻撃！" });
      if (this.tryEvade(actor, foe)) { ev.push({ kind: "miss", actor: actor.side, target: foe.side }); }
      else { var r = this.computeDamage(actor, foe, 1.0, {}); dealDamage(this, actor, foe, r, ev); }
      actor.sp = Math.min(actor.f.sp, actor.sp + BAL.basicSpGain);
      return;
    }
    if (action.type === "skill") {
      var sk = MF.SKILL_BY_ID[action.skillId];
      if (!sk || actor.sp < sk.sp) { ev.push({ kind: "info", text: "SPが足りない！", actor: actor.side }); return; }
      actor.sp -= sk.sp;
      ev.push({ kind: sk.super ? "super" : "act", actor: actor.side, skill: sk.name, text: actor.name + " は " + sk.name + " を放った！" });
      for (var i = 0; i < sk.effects.length; i++) {
        this.applyEffect(actor, foe, sk.effects[i], ev);
        if (!foe.alive && sk.effects[i].type === "damage") break;
      }
      return;
    }
  };

  // 状態異常の継続ダメージ・残ターン処理（ターン終了時）
  Battle.prototype.tickEnd = function (c, ev) {
    if (!c.alive) return;
    for (var i = 0; i < c.statuses.length; i++) {
      var st = c.statuses[i];
      if (st.type === "poison") { var d = Math.max(1, Math.round(c.maxhp * 0.07)); c.hp -= d; ev.push({ kind: "dot", target: c.side, value: d, status: "poison" }); }
      if (st.type === "burn") { var b = Math.max(1, Math.round(c.maxhp * 0.05)); c.hp -= b; ev.push({ kind: "dot", target: c.side, value: b, status: "burn" }); }
      st.turns--;
    }
    c.statuses = c.statuses.filter(function (s) { return s.turns > 0; });
    for (var stat in c.buffs) {
      c.buffs[stat] = c.buffs[stat].filter(function (b) { b.turns--; return b.turns > 0; });
      if (!c.buffs[stat].length) delete c.buffs[stat];
    }
    if (c.hp <= 0) { c.hp = 0; c.alive = false; ev.push({ kind: "faint", target: c.side }); }
  };

  // プレイヤーが選べる行動
  Battle.prototype.playerOptions = function () {
    var p = this.p;
    return {
      skills: MF.Skills.movesetFor(p.ref).map(function (s) {
        return { id: s.id, name: s.name, sp: s.sp, usable: p.sp >= s.sp, super: !!s.super, desc: s.desc };
      }),
      sp: p.sp, maxsp: p.f.sp
    };
  };

  // ---- 敵AI（効用ベース）----
  Battle.prototype.aiChoose = function (actor) {
    var foe = this.opp(actor), rng = this.rng, self = this;
    var options = [{ type: "attack" }];
    if (actor.hp < actor.maxhp * 0.45) options.push({ type: "guard" });
    MF.Skills.movesetFor(actor.ref).forEach(function (sk) { if (actor.sp >= sk.sp) options.push({ type: "skill", skillId: sk.id }); });
    var best = options[0], bestScore = -1e9;
    options.forEach(function (op) {
      var score = 0;
      if (op.type === "attack") score = self.estimate(actor, foe, 1.0, {});
      else if (op.type === "guard") score = (actor.hp < actor.maxhp * 0.35 ? 260 : 40);
      else {
        var sk = MF.SKILL_BY_ID[op.skillId];
        var dmgEff = sk.effects.filter(function (e) { return e.type === "damage" || e.type === "drain"; })[0];
        if (dmgEff) {
          score = self.estimate(actor, foe, dmgEff.power, dmgEff);
          if (self.estimate(actor, foe, dmgEff.power, dmgEff) >= foe.hp) score += 1000; // とどめ最優先
        } else {
          var healEff = sk.effects.filter(function (e) { return e.type === "heal"; })[0];
          if (healEff && actor.hp < actor.maxhp * 0.5) score = actor.maxhp * (healEff.frac || 0.3) * 1.4;
          else score = 120; // バフ等
        }
        if (sk.super) score += 60; // 超必殺は気持ち優先
      }
      score *= 0.85 + rng.next() * 0.3; // 揺らぎ
      if (score > bestScore) { bestScore = score; best = op; }
    });
    return best;
  };
  Battle.prototype.estimate = function (att, def, power, o) {
    o = o || {};
    var A = eff(att, "attack"), D = (eff(def, "defense")) * (1 - (o.ignoreDefFrac || 0));
    var base = A * power * (A / (A + D)) * typeMul(att.family, def.family);
    var critRate = clamp(BAL.critBase + eff(att, "trust") * BAL.critPerTrust, BAL.critBase, BAL.critCap);
    return base * (1 + critRate * (BAL.critMult - 1));
  };

  // ---- 1ターン解決 ----
  Battle.prototype.takeTurn = function (playerAction) {
    if (this.over) return { events: [], over: true, result: this.result };
    var ev = [];
    this.turn++;
    ev.push({ kind: "turnstart", turn: this.turn });
    // SP回復
    this.p.sp = Math.min(this.p.f.sp, this.p.sp + BAL.spRegenPerTurn);
    this.e.sp = Math.min(this.e.f.sp, this.e.sp + BAL.spRegenPerTurn);

    // 逃走は即時判定
    if (playerAction.type === "flee") {
      var chance = clamp(0.4 + (eff(this.p, "speed") - eff(this.e, "speed")) * 0.004, 0.15, 0.9);
      if (this.rng.next() < chance) { this.over = true; this.result = { winner: null, reason: "flee" }; ev.push({ kind: "flee", ok: true, text: "うまく逃げ切った！" }); return { events: ev, over: true, result: this.result }; }
      ev.push({ kind: "flee", ok: false, text: "逃げられない！" });
      // 失敗：敵だけ行動
      this.act(this.e, this.aiChoose(this.e), ev);
      this.endOfTurn(ev);
      return { events: ev, over: this.over, result: this.result };
    }

    var enemyAction = this.aiChoose(this.e);
    // ガード意思はターン全体に適用（行動順に依存せず守れる）
    if (playerAction.type === "guard") this.p.guard = true;
    if (enemyAction.type === "guard") this.e.guard = true;
    // 行動順：素早さ（同速は運→乱数）
    var order;
    var ps = eff(this.p, "speed"), es = eff(this.e, "speed");
    if (ps === es) order = this.rng.chance(0.5) ? [this.p, this.e] : [this.e, this.p];
    else order = ps > es ? [this.p, this.e] : [this.e, this.p];

    for (var i = 0; i < order.length; i++) {
      var actor = order[i];
      if (this.checkEnd(ev)) break;
      if (!actor.alive) continue;
      this.act(actor, actor === this.p ? playerAction : enemyAction, ev);
      if (this.checkEnd(ev)) break;
    }
    if (!this.over) this.endOfTurn(ev);
    return { events: ev, over: this.over, result: this.result };
  };

  Battle.prototype.endOfTurn = function (ev) {
    this.tickEnd(this.p, ev);
    this.tickEnd(this.e, ev);
    this.p.guard = false; this.e.guard = false; // ガードはそのターン限り
    this.checkEnd(ev);
  };
  Battle.prototype.checkEnd = function (ev) {
    if (this.over) return true;
    if (!this.p.alive || !this.e.alive) {
      this.over = true;
      var winner = this.p.alive ? "player" : "enemy";
      this.result = { winner: winner, reason: "faint" };
      ev.push({ kind: "end", winner: winner });
      return true;
    }
    return false;
  };

  MF.Battle = Battle;
  MF.battleUtil = { makeCombatant: makeCombatant, eff: eff, typeMul: typeMul };
})(window.MF = window.MF || {});
