/* game.js — 中央コントローラ。状態保持と全システムの結節点。
 * コアループ：バトル→ドロップ→図鑑/育成/合成→次の小目標→もう1回。 */
(function (MF) {
  "use strict";
  var BAL = MF.BAL;

  var Game = {
    rng: new MF.RNG(),
    gold: 0,
    monsters: [],
    activeId: null,
    inventory: [],
    dex: { seen: {}, captured: {} },
    achievements: { unlocked: {} },
    stats: null,
    settings: null,
    currentBattle: null,
    currentEnemySpecies: null,
    currentMode: "wild",
    onAchievement: null // UIが差し込むコールバック
  };

  function freshStats() {
    return { wins: 0, losses: 0, battles: 0, builtCount: 0, trainCount: 0, dropCount: 0, pvpWins: 0, pvpBattles: 0, superUsed: 0, bestRarity: 0, evolveCount: 0, maxLevel: 1, stagesCleared: 0, fuseCount: 0 };
  }
  function freshSettings() { return { battleSpeed: 1, sfx: true }; }
  // セーブ読込/新規開始の前（タイトル画面）でもSFXや速度設定を参照できるよう、起動時から実体を持たせる。
  // nullのままだと「はじめる」のクリック音で新規プレイヤーが即クラッシュする
  Game.settings = freshSettings();
  Game.stats = freshStats();

  // ---- 初期化 ----
  // 戻り値: 'loaded'（続き）/ 'needstarter'（新規＝スターター選択へ）
  Game.init = function () {
    var raw = MF.Save.loadRaw();
    if (raw) { this.loadFrom(raw); this.ready = true; return "loaded"; }
    this.ready = false; return "needstarter";
  };
  Game.hasSave = function () { return MF.Save.exists(); };

  // スターター候補3種（ドラゴン/機械/天使のD帯原種）
  Game.starterOptions = function () {
    var fams = ["dragon", "machine", "angel"], out = [];
    fams.forEach(function (f) {
      for (var i = 0; i < MF.Species.TOTAL; i++) {
        if (MF.Species.rankOf(i) === "D" && MF.Species.familyOf(i) === f) { out.push(MF.Species.get(i)); break; }
      }
    });
    return out;
  };

  Game.newGame = function (starterSpeciesId) {
    this.gold = 250;
    this.monsters = [];
    this.inventory = [];
    this.dex = { seen: {}, captured: {}, shiny: {} };
    this.achievements = { unlocked: {} };
    this.stats = freshStats();
    this.settings = freshSettings();
    this.stageProgress = 0;       // 解放済み最大ステージ index
    this.clearedStages = {};

    var sp = MF.Species.get(starterSpeciesId != null ? starterSpeciesId : this.starterOptions()[0].id);
    var starter = MF.Monster.fromSpecies(sp, {});
    starter.fav = true;
    this.monsters.push(starter);
    this.activeId = starter.id;
    this.markDex(sp.id, true);

    // 実験用の初期パーツを配布
    for (var k = 0; k < 18; k++) this.addPart(this.randomPart(this.rng, 0));
    this.ready = true;
    MF.Save.save(this);
  };

  Game.loadFrom = function (raw) {
    this.gold = raw.gold || 0;
    this.monsters = (raw.monsters || []).map(function (m) { return MF.Monster.fromSave(m); });
    this.activeId = raw.activeId;
    this.inventory = raw.inventory || [];
    this.dex = raw.dex || { seen: {}, captured: {}, shiny: {} };
    if (!this.dex.seen) this.dex.seen = {};
    if (!this.dex.captured) this.dex.captured = {};
    if (!this.dex.shiny) this.dex.shiny = {};
    this.achievements = raw.achievements || { unlocked: {} };
    if (!this.achievements.unlocked) this.achievements.unlocked = {};
    this.stats = Object.assign(freshStats(), raw.stats || {});
    this.settings = Object.assign(freshSettings(), raw.settings || {});
    this.stageProgress = raw.stageProgress || 0;
    this.clearedStages = raw.clearedStages || {};
    if (!this.getActive() && this.monsters[0]) this.activeId = this.monsters[0].id;
  };

  Game.save = function () { return MF.Save.save(this); };

  // ---- パーツ/インベントリ ----
  Game.randomPart = function (rng, centerTier) {
    var slotDef = rng.pick(MF.PART_SLOTS);
    var variants = slotDef.variants.filter(function (v) { return v !== "none"; });
    var fam = rng.pick(MF.FAMILIES).id;
    var rarity = rng.weighted(MF.rarityWeights(centerTier));
    return MF.Monster.makePart(slotDef.slot, rng.pick(variants), fam, rarity);
  };
  Game.addPart = function (part) {
    part.pid = part.pid || MF.uid("pt");
    this.inventory.push(part);
    if ((part.rarity || 0) > this.stats.bestRarity) this.stats.bestRarity = part.rarity || 0;
    return part;
  };
  Game.removePart = function (pid) {
    var i = this.inventory.findIndex(function (p) { return p.pid === pid; });
    if (i >= 0) return this.inventory.splice(i, 1)[0];
    return null;
  };
  Game.partsBySlot = function (slot) { return this.inventory.filter(function (p) { return p.slot === slot; }); };

  // ---- モンスター ----
  Game.getActive = function () { var id = this.activeId, list = this.monsters; for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; };
  Game.getMonster = function (id) { for (var i = 0; i < this.monsters.length; i++) if (this.monsters[i].id === id) return this.monsters[i]; return null; };
  Game.setActive = function (id) { if (this.getMonster(id)) { this.activeId = id; this.save(); } };

  // 合成（改造種作成）。selected: {slot: part}（pidつき）
  Game.assembleCost = function (selected) {
    var c = 0; for (var s in selected) if (selected[s]) c += BAL.assembleCostPerRarity[selected[s].rarity || 0]; return c;
  };
  Game.assemble = function (selected, name) {
    var slots = Object.keys(selected).filter(function (s) { return selected[s]; });
    if (slots.length < 3) return { ok: false, msg: "最低3パーツ必要です。" };
    var cost = this.assembleCost(selected);
    if (this.gold < cost) return { ok: false, msg: "Gが足りません（必要 " + cost + "G）。" };
    // パーツ消費
    for (var i = 0; i < slots.length; i++) this.removePart(selected[slots[i]].pid);
    this.gold -= cost;
    var partsMap = {};
    for (var j = 0; j < slots.length; j++) partsMap[slots[j]] = selected[slots[j]];
    var mon = MF.Monster.fromParts(partsMap, { name: name && name.trim() ? name.trim() : null });
    this.monsters.push(mon);
    this.stats.builtCount++;
    this.refreshMaxAff();
    this.save();
    return { ok: true, monster: mon, newly: this.checkAchievements() };
  };
  // モンスターを解体してパーツを戻す
  Game.release = function (id) {
    if (this.monsters.length <= 1) return { ok: false, msg: "最後の1体は解体できません。" };
    var m = this.getMonster(id);
    if (!m) return { ok: false, msg: "対象がいません。" };
    for (var s in m.parts) { if (m.parts[s] && m.parts[s].variant !== "none") this.addPart(MF.Monster.clonePart(m.parts[s])); }
    this.monsters = this.monsters.filter(function (x) { return x.id !== id; });
    if (this.activeId === id) this.activeId = this.monsters[0].id;
    this.save();
    return { ok: true };
  };

  // パーツ融合（製造）：同部位3個 → +1レアの1個。死蔵解消＆運に依らない頂点到達。
  Game.fuseCost = function (pids) {
    var parts = pids.map(function (id) { return this.inventory.find(function (p) { return p.pid === id; }); }, this).filter(Boolean);
    if (parts.length !== 3) return 0;
    var maxR = Math.max.apply(null, parts.map(function (p) { return p.rarity || 0; }));
    return BAL.assembleCostPerRarity[Math.min(5, maxR + 1)];
  };
  Game.fuse = function (pids) {
    if (pids.length !== 3) return { ok: false, msg: "同じ部位のパーツを3個選んでください。" };
    var parts = pids.map(function (id) { return this.inventory.find(function (p) { return p.pid === id; }); }, this);
    if (parts.some(function (p) { return !p; })) return { ok: false, msg: "パーツが見つかりません。" };
    var slot = parts[0].slot;
    if (!parts.every(function (p) { return p.slot === slot; })) return { ok: false, msg: "同じ部位のパーツを選んでください。" };
    var maxR = Math.max.apply(null, parts.map(function (p) { return p.rarity || 0; }));
    var resR = Math.min(5, maxR + 1);
    var cost = BAL.assembleCostPerRarity[resR];
    if (this.gold < cost) return { ok: false, msg: "Gが足りません（必要 " + cost + "G）。" };
    var variant = this.rng.pick(parts).variant;
    var family = this.rng.pick(parts).family;
    pids.forEach(function (id) { this.removePart(id); }, this);
    this.gold -= cost;
    var np = MF.Monster.makePart(slot, variant, family, resR);
    this.addPart(np);
    this.save();
    return { ok: true, part: np, newly: this.checkAchievements() };
  };

  // トレーニング（trainingId: run/meditate/muscle/spar/meal/lottery）
  Game.train = function (id, trainingId) {
    var m = this.getMonster(id);
    if (!m) return { ok: false, msg: "対象がいません。" };
    if (this.gold < BAL.trainCost) return { ok: false, msg: "Gが足りません（必要 " + BAL.trainCost + "G）。" };
    this.gold -= BAL.trainCost;
    var res = MF.Training.train(m, trainingId, this.rng);
    this.stats.trainCount++;
    this.refreshMaxAff();
    this.save();
    return { ok: true, res: res, newly: this.checkAchievements() };
  };

  // 進化
  Game.evolve = function (id) {
    var m = this.getMonster(id);
    if (!m) return { ok: false, msg: "対象がいません。" };
    var r = MF.Evolution.evolve(m);
    if (!r.ok) return { ok: false, msg: "進化条件を満たしていません。" };
    this.stats.evolveCount++;
    this.refreshMaxAff();
    this.save();
    return { ok: true, stage: r.stage, name: r.name, monster: m, newly: this.checkAchievements() };
  };

  // ---- モンスター合体（2体→1体）----
  function partStatSum(p) { var v = MF.variantStats(p.slot, p.variant), t = 0; for (var k in v) t += Math.abs(v[k]); return t; }
  function betterPart(a, b) {
    if (!a || a.variant === "none") return b;
    if (!b || b.variant === "none") return a;
    var ra = a.rarity || 0, rb = b.rarity || 0;
    if (ra !== rb) return ra > rb ? a : b;
    return partStatSum(a) >= partStatSum(b) ? a : b;
  }
  function blendName(a, b) {
    var n1 = a.name || "", n2 = b.name || "";
    var name = n1.slice(0, Math.max(1, Math.ceil(n1.length / 2))) + n2.slice(Math.floor(n2.length / 2));
    return name.slice(0, 9);
  }
  // 合体結果（消費せずプレビュー）。親IDシードで決定論的＝プレビュー＝結果。
  Game.fusionPreview = function (id1, id2) {
    var p1 = this.getMonster(id1), p2 = this.getMonster(id2);
    if (!p1 || !p2 || p1 === p2) return null;
    var parts = {};
    for (var i = 0; i < MF.PART_SLOTS.length; i++) {
      var slot = MF.PART_SLOTS[i].slot;
      var best = betterPart(p1.parts[slot], p2.parts[slot]);
      if (best && best.variant !== "none") parts[slot] = MF.Monster.clonePart(best);
    }
    // 育成値継承：高い方 + 低い方の40%
    var growth = {};
    for (var s = 0; s < MF.STAT_KEYS.length; s++) {
      var k = MF.STAT_KEYS[s], g1 = (p1.growth && p1.growth[k]) || 0, g2 = (p2.growth && p2.growth[k]) || 0;
      var hi = Math.abs(g1) >= Math.abs(g2) ? g1 : g2, lo = hi === g1 ? g2 : g1;
      growth[k] = Math.round(hi + lo * 0.4);
    }
    // 合体ボーナス：1部位を+1レア（親IDシードで決定論的）
    var rng = new MF.RNG("fuse:" + id1 + ":" + id2);
    var slots = Object.keys(parts);
    var boostSlot = slots.length ? rng.pick(slots) : null;
    if (boostSlot) parts[boostSlot].rarity = Math.min(5, (parts[boostSlot].rarity || 0) + 1);
    var child = MF.Monster.build(parts, {
      name: blendName(p1, p2), growth: growth,
      level: Math.max(p1.level || 1, p2.level || 1), exp: 0, evoStage: 0,
      spriteKey: "fuse_" + id1 + "_" + id2
    });
    var costSum = 0; for (var c in parts) costSum += (parts[c].rarity || 0);
    return { child: child, cost: 120 + costSum * 15, boostSlot: boostSlot, p1: p1, p2: p2 };
  };
  Game.fuseMonsters = function (id1, id2) {
    if (this.monsters.length < 2) return { ok: false, msg: "素材が2体必要です。" };
    var pv = this.fusionPreview(id1, id2);
    if (!pv) return { ok: false, msg: "別々の2体を選んでください。" };
    if (this.gold < pv.cost) return { ok: false, msg: "Gが足りません（必要 " + pv.cost + "G）。" };
    this.gold -= pv.cost;
    this.monsters = this.monsters.filter(function (m) { return m.id !== id1 && m.id !== id2; });
    this.monsters.push(pv.child);
    this.activeId = pv.child.id;            // 合体体を編成
    this.stats.fuseCount++;
    if (pv.child.level > this.stats.maxLevel) this.stats.maxLevel = pv.child.level;
    this.refreshMaxAff();
    this.save();
    return { ok: true, child: pv.child, newly: this.checkAchievements() };
  };

  // ---- 図鑑 ----
  Game.markDex = function (speciesId, captured) {
    this.dex.seen[speciesId] = true;
    if (captured) this.dex.captured[speciesId] = true;
  };
  Game.markDexShiny = function (speciesId) { if (!this.dex.shiny) this.dex.shiny = {}; this.dex.shiny[speciesId] = true; };
  Game.dexCounts = function () {
    return { seen: Object.keys(this.dex.seen).length, captured: Object.keys(this.dex.captured).length, shiny: Object.keys(this.dex.shiny || {}).length, total: MF.Species.TOTAL };
  };

  // ---- バトル生成 ----
  Game.tierOf = function (m) { return MF.clamp(MF.RANK_TIER[m.rank] != null ? MF.RANK_TIER[m.rank] : 1, 0, 5); };
  Game.startWild = function (diff) {
    var active = this.getActive();
    var tier = MF.clamp(this.tierOf(active) + (diff || 0), 0, 5);
    var rank = MF.Species.rankForTier(this.rng, tier);
    var sp = MF.Species.randomByRank(this.rng, rank);
    this.markDex(sp.id, false);
    var enemy = MF.Monster.fromSpecies(sp, {});
    this.currentEnemySpecies = sp;
    this.currentMode = "wild";
    this.currentBattle = new MF.Battle(active, enemy, { rng: this.rng, mode: "wild" });
    return this.currentBattle;
  };

  // ステージ挑戦
  Game.stageUnlocked = function (id) { return id <= (this.stageProgress || 0); };
  Game.startStage = function (stageId) {
    var stage = MF.Stages.get(stageId);
    if (!stage || !this.stageUnlocked(stageId)) return null;
    var active = this.getActive();
    var e = MF.Stages.makeEnemy(stage, this.rng);
    this.currentStage = stage;
    this.currentEnemySpecies = e.species;
    this.currentEnemyShiny = e.shiny;
    this.currentMode = "stage";
    this.markDex(e.species.id, false);
    this.currentBattle = new MF.Battle(active, e.monster, { rng: this.rng, mode: "stage" });
    return this.currentBattle;
  };

  // 対人戦（非同期/AI）：同程度の力の改造種を自動生成
  Game.startPvp = function () {
    var active = this.getActive();
    var tier = this.tierOf(active);
    var opp = this.makePvpOpponent(tier);
    this.currentEnemySpecies = null;
    this.currentMode = "pvp";
    this.currentBattle = new MF.Battle(active, opp, { rng: this.rng, mode: "pvp" });
    return this.currentBattle;
  };
  Game.makePvpOpponent = function (tier) {
    var rng = this.rng;
    var fam = rng.pick(MF.FAMILIES).id;
    var partsMap = {};
    for (var i = 0; i < MF.PART_SLOTS.length; i++) {
      var slot = MF.PART_SLOTS[i].slot;
      var pf = rng.chance(0.8) ? fam : rng.pick(MF.FAMILIES).id;
      var variants = MF.SLOT_BY_ID[slot].variants.filter(function (v) { return v !== "none"; });
      partsMap[slot] = MF.Monster.makePart(slot, rng.pick(variants), pf, rng.weighted(MF.rarityWeights(tier)));
    }
    var mon = MF.Monster.fromParts(partsMap, { name: MF.genCustomName(rng, fam) });
    return mon;
  };

  Game.noteSuper = function () { this.stats.superUsed++; };

  // バトル終了処理。報酬・EXP・ドロップ・図鑑・実績・ステージ解放を確定。
  Game.endBattle = function (battle) {
    var out = { gold: 0, drop: null, exp: 0, level: null, evoReady: false, stageCleared: false, unlockedNext: null, shiny: false, newly: [], mode: this.currentMode };
    var shiny = this.currentMode === "stage" && this.currentEnemyShiny;
    this.stats.battles++;
    var win = battle.result && battle.result.winner === "player";
    var lose = battle.result && battle.result.winner === "enemy";
    var active = this.getActive();

    if (this.currentMode === "pvp") {
      this.stats.pvpBattles++;
      if (win) {
        this.stats.pvpWins++;
        out.gold = 30 + this.tierOf(active) * 20; this.gold += out.gold;
        out.exp = 20 + this.tierOf(active) * 8;
      }
    } else {
      // stage（旧wild互換）
      var sp = this.currentEnemySpecies;
      var stage = this.currentStage;
      var tier = stage ? stage.tier : (sp ? MF.RANK_TIER[sp.rank] : 0);
      if (win) {
        this.stats.wins++;
        var goldMul = (stage ? stage.goldMul : 1) * (shiny ? MF.PROG.shinyGoldMul : 1);
        out.gold = Math.round(BAL.goldByTier[tier] * goldMul);
        this.gold += out.gold;
        out.exp = Math.round((MF.PROG.expWinBase + tier * MF.PROG.expTierMul) * (stage ? stage.expMul : 1) * (shiny ? MF.PROG.shinyExpMul : 1));
        // ドロップ：倒した原種のパーツから1個（レアリティは敵帯で再抽選、ボス/色違いは+1帯）
        if (sp) {
          var slots = Object.keys(sp.parts).filter(function (s) { return sp.parts[s].variant !== "none"; });
          var slot = this.rng.pick(slots);
          var src = sp.parts[slot];
          var dropTier = tier + (stage && stage.boss ? 1 : 0) + (shiny ? MF.PROG.shinyDropBonus : 0);
          var rarity = this.rng.weighted(MF.rarityWeights(dropTier));
          var drop = MF.Monster.makePart(slot, src.variant, src.family, rarity);
          this.addPart(drop);
          this.stats.dropCount++;
          this.markDex(sp.id, true);
          if (shiny) { this.markDexShiny(sp.id); out.shiny = true; }
          out.drop = drop;
        }
        // ステージクリア＆次解放
        if (stage) {
          if (!this.clearedStages[stage.id]) this.stats.stagesCleared++;
          this.clearedStages[stage.id] = true;
          out.stageCleared = true;
          if (stage.id + 1 < MF.Stages.count && stage.id >= (this.stageProgress || 0)) {
            this.stageProgress = stage.id + 1;
            out.unlockedNext = stage.id + 1;
          }
        }
      } else if (lose) {
        this.stats.losses++;
        out.exp = Math.round((MF.PROG.expWinBase + tier * MF.PROG.expTierMul) * 0.3); // 敗北でも少しEXP
      }
    }

    // EXP付与＆レベルアップ
    if (out.exp > 0 && active) {
      var lv = MF.Evolution.addExp(active, out.exp);
      out.level = lv;
      if (active.level > this.stats.maxLevel) this.stats.maxLevel = active.level;
      out.evoReady = MF.Evolution.canEvolve(active);
    }

    this.refreshMaxAff();
    out.newly = this.checkAchievements();
    this.currentBattle = null;
    this.save();
    return out;
  };

  // ---- 実績 ----
  Game.refreshMaxAff = function () {
    var max = { 神聖: 0, 機械: 0, 龍化: 0, 蠱毒: 0, 古代: 0 };
    for (var i = 0; i < this.monsters.length; i++) {
      var a = this.monsters[i].affinity;
      for (var k in max) if ((a[k] || 0) > max[k]) max[k] = a[k] || 0;
    }
    this._maxAff = max;
  };
  Game.snapshot = function () {
    if (!this._maxAff) this.refreshMaxAff();
    var c = this.dexCounts();
    return {
      wins: this.stats.wins, losses: this.stats.losses, battles: this.stats.battles,
      builtCount: this.stats.builtCount, trainCount: this.stats.trainCount, dropCount: this.stats.dropCount,
      pvpWins: this.stats.pvpWins, superUsed: this.stats.superUsed, bestRarity: this.stats.bestRarity,
      evolveCount: this.stats.evolveCount, maxLevel: this.stats.maxLevel, stagesCleared: this.stats.stagesCleared, fuseCount: this.stats.fuseCount,
      dexSeen: c.seen, dexCaptured: c.captured, dexShiny: c.shiny, gold: this.gold, maxAff: this._maxAff
    };
  };
  Game.checkAchievements = function () {
    var newly = MF.Achievements.check(this.snapshot(), this.achievements.unlocked);
    if (newly.length && this.onAchievement) for (var i = 0; i < newly.length; i++) this.onAchievement(newly[i]);
    return newly;
  };

  // セーブ消去（スターター選択へ誘導するため newGame は呼ばない）
  Game.resetAll = function () { MF.Save.wipe(); MF.Sprite.clearCache(); this.monsters = []; this.activeId = null; this.ready = false; };

  MF.Game = Game;
})(window.MF = window.MF || {});
