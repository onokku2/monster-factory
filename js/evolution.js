/* evolution.js — 経験値・レベルアップ・進化。
 * 進化条件＝レベル ＋ 一定以上のステータス ＋ 支配系統の度合い（＝進化前の系統への到達）。 */
(function (MF) {
  "use strict";
  var P = MF.PROG;

  function expToNext(level) { return Math.round(P.expBase * Math.pow(level, P.expPow)); }

  // EXP付与＝レベルアップ処理。{gained, from, to, leveled} を返す。
  function addExp(monster, amount) {
    var from = monster.level || 1;
    monster.level = monster.level || 1;
    monster.exp = (monster.exp || 0) + amount;
    while (monster.level < P.levelCap && monster.exp >= expToNext(monster.level)) {
      monster.exp -= expToNext(monster.level);
      monster.level++;
    }
    if (monster.level >= P.levelCap) monster.exp = 0;
    monster.power = MF.Stats.power(monster);
    return { gained: amount, from: from, to: monster.level, leveled: monster.level > from };
  }

  // 次段階の進化条件と達成状況。stage>=2は不可。
  function evolveInfo(monster) {
    var stage = monster.evoStage || 0;
    if (stage >= P.evo.length) return null;
    var req = P.evo[stage];
    var f = MF.Stats.finalStats(monster);
    var statMax = Math.max(f.attack, f.defense, f.speed, f.trust, f.luck);
    var aff = MF.Stats.dominantAffinityValue(monster);
    var cond = {
      level: { need: req.level, have: monster.level || 1, ok: (monster.level || 1) >= req.level },
      stat: { need: req.statMin, have: statMax, ok: statMax >= req.statMin },
      aff: { need: req.affMin, have: aff, ok: aff >= req.affMin, family: MF.Stats.dominantFamily(monster) }
    };
    cond.ready = cond.level.ok && cond.stat.ok && cond.aff.ok;
    cond.nextStage = stage + 1;
    return cond;
  }
  function canEvolve(monster) { var i = evolveInfo(monster); return !!(i && i.ready); }

  // 進化実行。倍率が上がり、称号・オーラが付く。
  function evolve(monster) {
    if (!canEvolve(monster)) return { ok: false };
    monster.evoStage = (monster.evoStage || 0) + 1;
    monster.spriteKey = (monster.spriteKey || "mon") + "_e" + monster.evoStage; // キャッシュ更新
    monster.power = MF.Stats.power(monster);
    return { ok: true, stage: monster.evoStage, name: MF.Monster.displayName(monster) };
  }

  MF.Evolution = { expToNext: expToNext, addExp: addExp, evolveInfo: evolveInfo, canEvolve: canEvolve, evolve: evolve };
})(window.MF = window.MF || {});
