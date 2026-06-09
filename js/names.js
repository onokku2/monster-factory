/* names.js — 系統ごとの音韻でモンスター名を決定論生成。 */
(function (MF) {
  "use strict";
  var SYL = {
    dragon:  { on: ["ガ", "ド", "ヴァ", "グレ", "ザ", "バル", "ドラ", "ギ", "ゴ"], mid: ["ガロ", "ドゥ", "ヴェ", "ザル", "グ"], suf: ["ス", "ガ", "ドン", "ウス", "ザード", "ガルド", "ヴァン"] },
    machine: { on: ["ジ", "メカ", "ギ", "ザイ", "クロ", "ヴォル", "デ"], mid: ["ガロ", "トロ", "ニク", "ザ"], suf: ["X", "ボーグ", "トロン", "ギア", "α", "ゼロ", "MkII"] },
    insect:  { on: ["ヴ", "ジ", "ギチ", "ザザ", "ムシ", "グ", "ベ"], mid: ["リリ", "ザザ", "ガジ", "チ"], suf: ["ム", "ギス", "ーザ", "ント", "バグ", "リス"] },
    ancient: { on: ["オ", "ア", "ウル", "ネフ", "ラー", "イ", "ゾ"], mid: ["メン", "カル", "トト", "ヌ"], suf: ["ラ", "ーメン", "クス", "神", "テプ", "アヌ"] },
    angel:   { on: ["セラ", "ア", "ミ", "ウリ", "ル", "ガブ", "ラフ"], mid: ["フィ", "リエ", "ナ", "エ"], suf: ["エル", "フィム", "リア", "ス", "ナイト", "オン"] }
  };
  // 改造種の接頭辞（プレイヤー作成のモンスターに付く）
  var PREFIX = ["鋼の", "古の", "閃光の", "深淵の", "天翔ける", "猛き", "静寂の", "嵐の", "黄金の", "終焉の", "創世の", "幻影の"];

  function genName(rng, familyId) {
    var t = SYL[familyId] || SYL.dragon;
    var n = rng.pick(t.on);
    if (rng.chance(0.6)) n += rng.pick(t.mid);
    n += rng.pick(t.suf);
    return n;
  }
  function genCustomName(rng, familyId) {
    var p = rng.chance(0.7) ? rng.pick(PREFIX) : "";
    return p + genName(rng, familyId);
  }

  MF.genName = genName;
  MF.genCustomName = genCustomName;
})(window.MF = window.MF || {});
