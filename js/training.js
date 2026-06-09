/* training.js — 6種のトレーニング。複数ステUP＋トレードオフでDOWN。
 * 確定ステの土台に「育成で形を作る」層。各メニューに固有アニメ(anim)を持つ。 */
(function (MF) {
  "use strict";

  // delta: 正=上昇 / 負=下降。HP/SPは大きめ、戦闘ステは控えめ。
  MF.TRAININGS = [
    { id: "run",      jp: "ランニング",   emoji: "🏃", anim: "run",      delta: { hp: 10, speed: 5, sp: -4, defense: -4 },
      up: "HP・素早さ", down: "SP・守備" },
    { id: "meditate", jp: "瞑想",         emoji: "🧘", anim: "meditate", delta: { sp: 9, trust: 5, attack: -4, defense: -4 },
      up: "SP・信頼", down: "攻撃・守備" },
    { id: "muscle",   jp: "筋トレ",       emoji: "💪", anim: "muscle",   delta: { attack: 6, defense: 6, sp: -4, luck: -3 },
      up: "攻撃・守備", down: "SP・運" },
    { id: "spar",     jp: "スパーリング", emoji: "🥊", anim: "spar",     delta: { defense: 6, trust: 5, speed: -4, luck: -3 },
      up: "守備・信頼", down: "素早さ・運" },
    { id: "meal",     jp: "ごはん",       emoji: "🍖", anim: "meal",     delta: { trust: 6, luck: 6, attack: -4, speed: -4 },
      up: "信頼・運", down: "攻撃・素早さ" },
    { id: "lottery",  jp: "くじ引き",     emoji: "🎰", anim: "lottery",  delta: { luck: 6, hp: 9, sp: 6, trust: -5 },
      up: "運・HP・SP", down: "信頼" }
  ];
  MF.TRAINING_BY_ID = {};
  MF.TRAININGS.forEach(function (t) { MF.TRAINING_BY_ID[t.id] = t; });

  function train(monster, trainingId, rng) {
    rng = rng || new MF.RNG();
    var t = MF.TRAINING_BY_ID[trainingId];
    if (!t) return null;
    monster.growth = monster.growth || {};
    var changes = [];
    for (var stat in t.delta) {
      var d = t.delta[stat];
      // ±20%の振れ（くじ引きの運は当たり大）
      var jit = (stat === "luck" && t.id === "lottery") ? (0.5 + rng.next() * 1.8) : (0.8 + rng.next() * 0.4);
      var amt = Math.round(d * jit);
      if (amt === 0) amt = d > 0 ? 1 : -1;
      monster.growth[stat] = (monster.growth[stat] || 0) + amt;
      changes.push({ stat: stat, statJp: MF.STAT_JP[stat], amt: amt });
    }
    monster.trainCount = (monster.trainCount || 0) + 1;
    monster.power = MF.Stats.power(monster);
    return { training: t, changes: changes };
  }

  MF.Training = { train: train };
})(window.MF = window.MF || {});
