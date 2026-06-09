/* stages.js — 30ステージ。6帯×5（各帯の最後はボス）。難易度に幅を持たせる。
 * 敵はステージ帯のランク/系統テーマで抽選し、ステージレベルで強化する。 */
(function (MF) {
  "use strict";

  var BANDS = [
    { tier: 0, fam: "insect",  theme: ["はじまりの草原", "そよ風の丘", "きらめき水辺", "みどりの森", "森の主"] },
    { tier: 1, fam: "ancient", theme: ["岩場の洞窟", "こだまの坑道", "地底湖", "鉱石回廊", "洞窟の王"] },
    { tier: 2, fam: "dragon",  theme: ["灼熱の渓谷", "溶岩洞", "火竜の巣", "紅蓮回廊", "炎竜帝"] },
    { tier: 3, fam: "machine", theme: ["機械都市", "電脳回廊", "鋼鉄工廠", "暴走プラント", "機神コア"] },
    { tier: 4, fam: "insect",  theme: ["蟲毒の樹海", "毒の沼", "腐海の巣", "女王の産室", "蟲毒の女王"] },
    { tier: 5, fam: "angel",   theme: ["天空回廊", "雲海神域", "星詠みの塔", "終焉の祭壇", "創世の竜神"] }
  ];
  var REC = [200, 280, 380, 500, 640, 820]; // 推奨総合力（tier別の目安）

  var LIST = [];
  for (var b = 0; b < BANDS.length; b++) {
    for (var o = 0; o < 5; o++) {
      var boss = o === 4;
      var id = b * 5 + o;
      var fam = (id === 29) ? "dragon" : BANDS[b].fam; // 最終ボスは竜神
      LIST.push({
        id: id, name: (boss ? "【主】" : "") + BANDS[b].theme[o], tier: BANDS[b].tier, boss: boss, family: fam,
        enemyLevel: 1 + BANDS[b].tier * 5 + o * 2 + (boss ? 8 : 0),
        expMul: boss ? 2.2 : 1 + o * 0.12,
        goldMul: boss ? 2.5 : 1 + o * 0.1,
        recPower: Math.round(REC[BANDS[b].tier] * (1 + o * 0.06) * (boss ? 1.25 : 1)),
        desc: boss ? "強大なボスが待ち受ける。" : "野生のモンスターが現れる。"
      });
    }
  }

  function pickSpecies(rng, rank, family) {
    var ids = [];
    for (var i = 0; i < MF.Species.TOTAL; i++) if (MF.Species.rankOf(i) === rank && MF.Species.familyOf(i) === family) ids.push(i);
    if (!ids.length) for (var j = 0; j < MF.Species.TOTAL; j++) if (MF.Species.rankOf(j) === rank) ids.push(j);
    return MF.Species.get(rng.pick(ids));
  }

  // ステージの敵モンスターと元種を生成
  function makeEnemy(stage, rng) {
    var rank = MF.Species.rankForTier(rng, stage.boss ? Math.min(5, stage.tier + 1) : stage.tier);
    var sp = pickSpecies(rng, rank, stage.family);
    var mon = MF.Monster.fromSpecies(sp, {});
    mon.level = stage.enemyLevel;                 // ステージレベルで強化
    if (stage.boss) mon.evoStage = stage.tier >= 4 ? 2 : 1; // ボスは進化体
    // 色違い（シャイニー）：低確率の特別個体
    var shiny = rng.chance(MF.PROG.shinyChance);
    if (shiny) { mon.shiny = true; mon.level += MF.PROG.shinyLevelBonus; }
    mon.power = MF.Stats.power(mon);
    return { monster: mon, species: sp, shiny: shiny };
  }

  MF.Stages = {
    list: LIST,
    get: function (id) { return LIST[id]; },
    count: LIST.length,
    makeEnemy: makeEnemy
  };
})(window.MF = window.MF || {});
