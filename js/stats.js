/* stats.js — パーツからステータス/系統度合いを導出。
 * 設計の核：base はパーツの「固有・確定ステータス」(VARIANT_STATS)から算出（乱数なし＝組み立てが戦略）。
 * 最終値 = (base + 育成growth) × レベル/進化の成長倍率。 */
(function (MF) {
  "use strict";

  // パーツ集合(map slot->part)からステータスを算出（確定値）。
  function deriveStats(parts /*, rng は使わない */) {
    var s = { hp: 0, sp: 0, attack: 0, defense: 0, speed: 0, trust: 0, luck: 0 };
    for (var slot in parts) {
      var part = parts[slot];
      if (!part || part.variant === "none") continue;
      var vs = MF.variantStats(slot, part.variant);
      var mult = MF.RARITY_MULT[part.rarity || 0] || 1;
      for (var k in vs) s[k] += vs[k] * mult;
    }
    // HP/SP は底上げして桁感を出す（戦闘が一撃で終わらないように）
    s.hp = Math.round(s.hp * 2.0 + 36);
    s.sp = Math.round(s.sp * 1.2 + 18);
    for (var i = 0; i < MF.STAT_KEYS.length; i++) {
      var key = MF.STAT_KEYS[i];
      if (key === "hp" || key === "sp") continue;
      s[key] = Math.max(1, Math.round(s[key]));
    }
    return s;
  }

  // レベル/進化による成長倍率
  function growthMult(monster) {
    var lvl = monster.level || 1, evo = monster.evoStage || 0;
    return 1 + (lvl - 1) * MF.PROG.lvStatRate + evo * MF.PROG.evoBonus;
  }

  // 系統度合い（5系統）。同系統パーツを集めるほど伸び、超必殺技の解禁条件になる。
  function deriveAffinity(parts) {
    var a = { 神聖: 0, 機械: 0, 龍化: 0, 蠱毒: 0, 古代: 0 };
    for (var slot in parts) {
      var part = parts[slot];
      if (!part || part.variant === "none" || !part.family) continue;
      var fam = MF.FAMILY_BY_ID[part.family];
      var def = MF.SLOT_BY_ID[slot];
      if (!fam || !def) continue;
      a[fam.aff] += def.mag * def.affFactor * (0.6 + (part.rarity || 0) * 0.12);
    }
    for (var key in a) a[key] = Math.round(a[key]);
    return a;
  }

  // 最終ステータス = (base(パーツ) + growth(育成)) × 成長倍率(レベル/進化)。下限を保護。
  function finalStats(monster) {
    var base = monster.base, g = monster.growth || {}, m = growthMult(monster);
    var out = {};
    for (var i = 0; i < MF.STAT_KEYS.length; i++) {
      var k = MF.STAT_KEYS[i];
      var lo = (k === "hp") ? 10 : (k === "sp") ? 0 : 1;
      out[k] = Math.max(lo, Math.round(((base[k] || 0) + (g[k] || 0)) * m));
    }
    return out;
  }

  // 支配系統（最も度合いが高い系統のfamilyId）。相性判定や見た目に使う。
  function dominantFamily(monster) {
    var a = monster.affinity, best = null, bv = -1;
    for (var aff in a) { if (a[aff] > bv) { bv = a[aff]; best = aff; } }
    var fam = MF.FAMILY_BY_AFF[best];
    return fam ? fam.id : (monster.family || "dragon");
  }

  // 総合力（マッチング・推奨帯の指標）
  function power(monster) {
    var s = finalStats(monster);
    return Math.round(s.hp * 0.5 + s.sp * 0.5 + s.attack * 1.2 + s.defense * 1.0 + s.speed * 0.9 + s.trust * 0.7 + s.luck * 0.7);
  }

  // 支配系統の度合い値（進化条件に使用）
  function dominantAffinityValue(monster) {
    var a = monster.affinity, bv = 0;
    for (var aff in a) if (a[aff] > bv) bv = a[aff];
    return bv;
  }

  MF.Stats = {
    deriveStats: deriveStats,
    deriveAffinity: deriveAffinity,
    finalStats: finalStats,
    dominantFamily: dominantFamily,
    dominantAffinityValue: dominantAffinityValue,
    growthMult: growthMult,
    power: power
  };
})(window.MF = window.MF || {});
