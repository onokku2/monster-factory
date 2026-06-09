/* config.js — 中央集権の設定/バランス。数値はすべてここに集約し、調整は1か所で。 */
(function (MF) {
  "use strict";

  // 基本ステータス（順序が表示順）
  MF.STAT_KEYS = ["hp", "sp", "attack", "defense", "speed", "trust", "luck"];
  MF.STAT_JP = {
    hp: "HP", sp: "SP", attack: "攻撃", defense: "守備",
    speed: "素早さ", trust: "信頼", luck: "運"
  };
  MF.STAT_DESC = {
    hp: "体力。0で戦闘不能。",
    sp: "技を使うための気力。",
    attack: "与ダメージの源。",
    defense: "被ダメージを緩和。",
    speed: "行動順を決める。",
    trust: "なつき度。クリティカル率が上がる。",
    luck: "運。ダメージの上振れと回避に影響。"
  };

  // 系統（5種）と対応する度合い（affinity）
  MF.AFFINITY_KEYS = ["神聖", "機械", "龍化", "蠱毒", "古代"];
  MF.FAMILIES = [
    { id: "dragon", jp: "ドラゴン族", aff: "龍化", hue: [0, 26], emoji: "🐲" },
    { id: "machine", jp: "機械族", aff: "機械", hue: [200, 218], emoji: "🤖" },
    { id: "insect", jp: "魂蟲族", aff: "蠱毒", hue: [95, 140], emoji: "🐛" },
    { id: "ancient", jp: "古代族", aff: "古代", hue: [30, 42], emoji: "🗿" },
    { id: "angel", jp: "天使族", aff: "神聖", hue: [46, 56], emoji: "👼" }
  ];
  MF.FAMILY_BY_ID = {};
  MF.FAMILY_BY_AFF = {};
  MF.FAMILIES.forEach(function (f) { MF.FAMILY_BY_ID[f.id] = f; MF.FAMILY_BY_AFF[f.aff] = f; });

  // 系統相性（攻撃側が key、value に有利）。5すくみ。
  // ドラゴン→天使→魂蟲→古代→機械→ドラゴン
  MF.TYPE_ADV = { dragon: "angel", angel: "insect", insect: "ancient", ancient: "machine", machine: "dragon" };

  // ランク：割合は仕様どおり。原種500体での厳密な体数も保持。
  MF.RANKS = ["SS", "S", "A", "B", "C", "D"];
  MF.RANK_RATIO = { SS: 0.01, S: 0.05, A: 0.10, B: 0.19, C: 0.25, D: 0.40 };
  MF.RANK_COUNT = { SS: 5, S: 25, A: 50, B: 95, C: 125, D: 200 }; // 合計500
  MF.RANK_TIER = { D: 0, C: 1, B: 2, A: 3, S: 4, SS: 5 }; // 強さ指数（レアリティ窓・報酬に使用）
  MF.RANK_STAT_MULT = { D: 1.0, C: 1.18, B: 1.4, A: 1.7, S: 2.05, SS: 2.5 }; // ランクで総量を底上げ
  MF.RANK_COLOR = { SS: "#ff5d8f", S: "#ffb02e", A: "#b06bff", B: "#3ea6ff", C: "#46d39a", D: "#9aa6b2" };

  // レアリティ（パーツ）
  MF.RARITY = ["コモン", "アンコモン", "レア", "エピック", "レジェンド", "ミシック"];
  MF.RARITY_COLOR = ["#9aa6b2", "#46d39a", "#3ea6ff", "#b06bff", "#ffb02e", "#ff5d8f"];
  MF.RARITY_MULT = [1.0, 1.15, 1.35, 1.6, 1.95, 2.4]; // パーツ寄与の倍率

  // バランス調整定数
  MF.BAL = {
    // ステータス導出（確定値。乱数ばらつきは廃止＝組み立てを戦略に）
    baseSpread: 0,
    // ダメージ式
    critBase: 0.03,
    critPerTrust: 0.004,
    critCap: 0.6,
    critMult: 1.8,
    spreadLo: 0.85, spreadHi: 1.15,  // ダメージ乱数幅
    luckPerPoint: 0.0016,            // 運差→上振れ係数
    typeAdvMul: 1.5, typeDisMul: 0.5,
    guardMul: 0.45,                  // まもる時の被ダメージ倍率
    // SP
    spRegenPerTurn: 4,
    basicSpGain: 5,                  // 通常攻撃でSP回復
    // 命中/回避（運と素早さ差）
    accBase: 1.0,
    evadePerSpeed: 0.0015, evadePerLuck: 0.0012, evadeCap: 0.35,
    // 報酬
    goldByTier: [12, 20, 34, 55, 90, 150],  // tier 0..5
    // トレーニング
    trainGainLo: 3, trainGainHi: 12,
    trainLossLoFrac: 0.2, trainLossHiFrac: 0.6, // 減少 = gain * (0.2〜0.6)、ただし gain 未満
    trainCost: 30,                              // 1回のコスト(G)
    // 合成
    assembleCostPerRarity: [5, 12, 25, 50, 100, 200],
    // 解像度
    spriteN: 32
  };

  // 進行：EXP / レベル / 進化
  MF.PROG = {
    levelCap: 60,
    expBase: 16, expPow: 1.5,        // 次レベルまで = round(expBase * level^expPow)
    lvStatRate: 0.045,               // 1レベルごとの全ステ倍率上昇
    evoBonus: 0.22,                  // 進化1段ごとの全ステ倍率上昇
    expWinBase: 14, expTierMul: 7,   // 勝利EXP = (expWinBase + tier*expTierMul) * stage.expMul
    // 進化条件（段階ごと）: 必要レベル / 最大ステ閾値 / 支配系統度合い閾値
    evo: [
      { level: 12, statMin: 45, affMin: 40 },  // 0 -> 1
      { level: 30, statMin: 80, affMin: 80 }   // 1 -> 2
    ],
    // 段階・系統別の称号（接頭辞）
    title: {
      dragon:  ["竜王・", "神竜・"], machine: ["改・", "極機・"], insect: ["蟲将・", "蟲帝・"],
      ancient: ["古王・", "神代・"], angel:   ["熾天・", "大天使・"]
    },
    // 色違い（シャイニー）
    shinyChance: 0.045,      // 野生出現時の確率
    shinyLevelBonus: 3,      // 色違いはやや強い
    shinyGoldMul: 1.8, shinyExpMul: 1.8, shinyDropBonus: 1 // 報酬と+1レアドロップ
  };

  // ステータス度合い→超必殺の解禁などに使う閾値の上限目安
  MF.AFF_SOFT_CAP = 120;

  MF.uid = (function () { let n = 1; return function (p) { return (p || "id") + "_" + (Date.now().toString(36)) + "_" + (n++).toString(36); }; })();
})(window.MF = window.MF || {});
