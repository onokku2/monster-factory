/* monster.js — モンスター実体の生成。原種クローン or パーツ合成(改造種)。
 * 同じ buildMonster 経路を通し、強さは parts + growth から導出する。 */
(function (MF) {
  "use strict";
  var TIER_RANK = ["D", "C", "B", "A", "S", "SS"]; // tier 0..5

  function clonePart(p) {
    return { slot: p.slot, variant: p.variant, family: p.family, rarity: p.rarity, seed: p.seed };
  }
  function clonePartsMap(parts) {
    var out = {};
    for (var s in parts) if (parts[s]) out[s] = clonePart(parts[s]);
    return out;
  }

  function rankFromParts(parts) {
    var sum = 0, n = 0;
    for (var s in parts) { if (parts[s] && parts[s].variant !== "none") { sum += (parts[s].rarity || 0); n++; } }
    var avg = n ? sum / n : 0;
    return TIER_RANK[MF.clamp(Math.round(avg), 0, 5)];
  }

  // 共通の組み立て。parts(map) と meta から所持モンスターを作る。
  function build(parts, meta) {
    var seed = meta.spriteSeed != null ? meta.spriteSeed : MF.hashSeed(JSON.stringify(Object.keys(parts).map(function (k) { return parts[k] && parts[k].variant + parts[k].family + parts[k].rarity; })) + (meta.salt || ""));
    var m = {
      id: meta.id || MF.uid("mon"),
      name: meta.name,
      isOriginal: !!meta.isOriginal,
      originSpeciesId: meta.originSpeciesId != null ? meta.originSpeciesId : null,
      parts: parts,
      growth: meta.growth || {},
      trainCount: meta.trainCount || 0,
      level: meta.level || 1,
      exp: meta.exp || 0,
      evoStage: meta.evoStage || 0,
      fav: !!meta.fav,
      spriteSeed: seed,
      spriteKey: meta.spriteKey || ("mon_" + seed)
    };
    m.base = MF.Stats.deriveStats(parts);
    m.affinity = MF.Stats.deriveAffinity(parts);
    m.family = MF.Stats.dominantFamily(m);
    m.rank = meta.rank || rankFromParts(parts);
    m.power = MF.Stats.power(m);
    return m;
  }

  // 原種を所持モンスターとしてクローン（スターター等）
  function fromSpecies(species, opts) {
    opts = opts || {};
    return build(clonePartsMap(species.parts), {
      name: opts.name || species.name,
      isOriginal: true,
      originSpeciesId: species.id,
      rank: species.rank,
      spriteSeed: species.spriteSeed,
      spriteKey: "own_sp" + species.id + "_" + MF.uid("c")
    });
  }

  // パーツ合成（改造種）。partsMap は slot->partInstance（消費はgame側）。
  function fromParts(partsMap, opts) {
    opts = opts || {};
    var parts = clonePartsMap(partsMap);
    var fam = MF.Stats.dominantFamily({ affinity: MF.Stats.deriveAffinity(parts), family: "dragon" });
    var name = opts.name || MF.genCustomName(new MF.RNG(MF.uid("nm")), fam);
    return build(parts, {
      name: name, isOriginal: false, salt: MF.uid("s"),
      spriteKey: "built_" + MF.uid("b")
    });
  }

  // セーブから復元
  function fromSave(o) {
    var m = build(o.parts, {
      id: o.id, name: o.name, isOriginal: o.isOriginal, originSpeciesId: o.originSpeciesId,
      rank: o.rank, growth: o.growth, trainCount: o.trainCount, fav: o.fav,
      level: o.level, exp: o.exp, evoStage: o.evoStage,
      spriteSeed: o.spriteSeed, spriteKey: o.spriteKey
    });
    return m;
  }

  // 進化段階を反映した表示名（称号つき）
  function displayName(m) {
    var stage = m.evoStage || 0;
    if (!stage) return m.name;
    var fam = MF.Stats.dominantFamily(m);
    var titles = (MF.PROG.title[fam]) || ["進化・", "極・"];
    return (titles[stage - 1] || "") + m.name;
  }

  // 1パーツ実体を作る（ドロップ/スターター配布用）
  function makePart(slot, variant, family, rarity) {
    return { slot: slot, variant: variant, family: family, rarity: rarity, seed: MF.hashSeed(slot + variant + family + rarity + MF.uid("p")) };
  }

  MF.Monster = {
    build: build,
    fromSpecies: fromSpecies,
    fromParts: fromParts,
    fromSave: fromSave,
    makePart: makePart,
    clonePart: clonePart,
    clonePartsMap: clonePartsMap,
    rankFromParts: rankFromParts,
    displayName: displayName
  };
})(window.MF = window.MF || {});
