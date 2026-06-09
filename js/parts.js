/* parts.js — 11パーツ種の定義（データ）。描画はsprite.jsのdrawキーに委譲。
 * slot: 部位ID / jp: 表示名 / mag: ステータス配点の大きさ / roles: ステ配分の比率
 * affFactor: その部位が系統度合いに寄与する係数 / variants: 見た目バリアント */
(function (MF) {
  "use strict";

  // 部位ごとの「性格」。死にステを作らないよう各部位に固有の役割を持たせる。
  MF.PART_SLOTS = [
    { slot: "tail",  jp: "尾",     mag: 14, affFactor: 0.30, roles: { sp: 0.5, luck: 0.3, trust: 0.2 },
      variants: ["long", "spike", "fan", "mech", "whip"] },
    { slot: "wing",  jp: "羽",     mag: 18, affFactor: 0.45, roles: { speed: 0.6, luck: 0.2, sp: 0.2 },
      variants: ["feather", "bat", "insect", "mech", "none"] },
    { slot: "leg",   jp: "足",     mag: 22, affFactor: 0.25, roles: { speed: 0.5, hp: 0.3, defense: 0.2 },
      variants: ["digit", "hoof", "mech", "multi", "float"] },
    { slot: "body",  jp: "ボディ", mag: 40, affFactor: 0.40, roles: { hp: 0.55, defense: 0.35, sp: 0.10 },
      variants: ["round", "tall", "blocky", "slime", "hunch"] },
    { slot: "skin",  jp: "皮膚",   mag: 26, affFactor: 0.55, roles: { defense: 0.5, hp: 0.4, sp: 0.1 },
      variants: ["scale", "metal", "chitin", "stone", "aura"] },
    { slot: "arm",   jp: "腕",     mag: 24, affFactor: 0.30, roles: { attack: 0.5, defense: 0.4, hp: 0.1 },
      variants: ["normal", "mech", "tentacle", "blade", "none"] },
    { slot: "ear",   jp: "耳",     mag: 14, affFactor: 0.25, roles: { speed: 0.5, trust: 0.3, luck: 0.2 },
      variants: ["pointy", "round", "long", "fin", "none"] },
    { slot: "horn",  jp: "角",     mag: 22, affFactor: 0.45, roles: { attack: 0.7, defense: 0.2, sp: 0.1 },
      variants: ["curved", "straight", "crown", "ram", "none"] },
    { slot: "eye",   jp: "目",     mag: 12, affFactor: 0.30, roles: { trust: 0.5, luck: 0.4, sp: 0.1 },
      variants: ["double", "single", "triple", "glow", "sleepy"] },
    { slot: "fang",  jp: "牙",     mag: 18, affFactor: 0.35, roles: { attack: 0.6, speed: 0.3, trust: 0.1 },
      variants: ["tusk", "sabre", "pair", "beak", "none"] },
    { slot: "claw",  jp: "爪",     mag: 20, affFactor: 0.30, roles: { attack: 0.55, luck: 0.3, speed: 0.15 },
      variants: ["sharp", "hook", "talon", "none"] }
  ];

  // 描画順（奥→手前）。renderMonster が参照。
  MF.DRAW_ORDER = ["tail", "wing", "leg", "body", "skin", "arm", "ear", "horn", "eye", "fang", "claw"];

  MF.SLOT_BY_ID = {};
  MF.PART_SLOTS.forEach(function (s) { MF.SLOT_BY_ID[s.slot] = s; });

  // バリアントの表示名（図鑑/組立UI用）
  MF.VARIANT_JP = {
    tail: { long: "ロングテイル", spike: "スパイクテイル", fan: "ファンテイル", mech: "メカテイル", whip: "ウィップテイル" },
    wing: { feather: "翼", bat: "コウモリ翼", insect: "蟲羽", mech: "機械翼", none: "羽なし" },
    leg:  { digit: "獣脚", hoof: "蹄脚", mech: "機械脚", multi: "多脚", float: "浮遊体" },
    body: { round: "丸型", tall: "長身", blocky: "角型", slime: "粘体", hunch: "猫背" },
    skin: { scale: "鱗", metal: "金属", chitin: "甲殻", stone: "石化", aura: "霊気" },
    arm:  { normal: "腕", mech: "機械腕", tentacle: "触手", blade: "刃腕", none: "腕なし" },
    ear:  { pointy: "尖り耳", round: "丸耳", long: "長耳", fin: "ヒレ耳", none: "耳なし" },
    horn: { curved: "曲角", straight: "直角", crown: "王冠角", ram: "巻角", none: "角なし" },
    eye:  { double: "双眼", single: "単眼", triple: "三眼", glow: "発光眼", sleepy: "眠り眼" },
    fang: { tusk: "牙", sabre: "サーベル牙", pair: "対牙", beak: "嘴", none: "牙なし" },
    claw: { sharp: "鋭爪", hook: "鉤爪", talon: "猛禽爪", none: "爪なし" }
  };

  MF.variantJP = function (slot, v) {
    return (MF.VARIANT_JP[slot] && MF.VARIANT_JP[slot][v]) || v;
  };

  // 各バリアントの「固有ステータス」（確定値）。乱数を排し、組み立てを戦略にする。
  // stat単位はパーツ寄与（レアリティで線形に倍化）。負値=トレードオフ（重装甲は遅い等）。
  // 部位の予算と個性：bodyが最大、eye/tail/earは小さいが信頼/運/SPを担う。
  MF.VARIANT_STATS = {
    body: {
      round:  { hp: 13, defense: 6, sp: 1 },
      tall:   { hp: 11, speed: 4, defense: 3, sp: 1 },
      blocky: { hp: 9, defense: 11 },
      slime:  { hp: 16, defense: 2, sp: 2 },
      hunch:  { hp: 10, attack: 5, defense: 4 }
    },
    skin: {
      scale:  { defense: 9, hp: 4, attack: 1 },
      metal:  { defense: 12, hp: 2 },
      chitin: { defense: 7, hp: 6, speed: 1 },
      stone:  { defense: 13, hp: 3, speed: -1 },
      aura:   { defense: 6, sp: 4, trust: 4 }
    },
    arm: {
      normal:   { attack: 7, defense: 4, hp: 1 },
      mech:     { attack: 11, defense: 2 },
      tentacle: { attack: 6, speed: 4, sp: 2 },
      blade:    { attack: 13, defense: -2 },
      none:     {}
    },
    leg: {
      digit: { speed: 7, hp: 3, defense: 1 },
      hoof:  { speed: 6, hp: 5 },
      mech:  { speed: 5, defense: 5, hp: 1 },
      multi: { speed: 10, defense: 1 },
      float: { speed: 7, luck: 4 }
    },
    horn: {
      curved:   { attack: 9, defense: 2 },
      straight: { attack: 12, speed: -1 },
      crown:    { attack: 4, defense: 5, trust: 3 },
      ram:      { attack: 8, hp: 4 },
      none:     {}
    },
    claw: {
      sharp: { attack: 9, luck: 3 },
      hook:  { attack: 7, speed: 4 },
      talon: { attack: 6, luck: 6, trust: 2 },
      none:  {}
    },
    fang: {
      tusk:  { attack: 9, hp: 2 },
      sabre: { attack: 8, speed: 4 },
      pair:  { attack: 5, speed: 5, trust: 1 },
      beak:  { attack: 7, luck: 3 },
      none:  {}
    },
    wing: {
      feather: { speed: 7, trust: 3, sp: 1 },
      bat:     { speed: 6, attack: 4 },
      insect:  { speed: 6, sp: 4 },
      mech:    { speed: 5, defense: 4, sp: 1 },
      none:    {}
    },
    ear: {
      pointy: { speed: 5, trust: 3 },
      round:  { trust: 4, luck: 3, hp: 1 },
      long:   { speed: 7, trust: 1 },
      fin:    { sp: 4, trust: 3, speed: 1 },
      none:   {}
    },
    tail: {
      long:  { sp: 4, luck: 3, speed: 1 },
      spike: { attack: 4, sp: 3, defense: 1 },
      fan:   { sp: 5, trust: 3 },
      mech:  { sp: 4, defense: 4 },
      whip:  { speed: 4, luck: 4, attack: 1 }
    },
    eye: {
      double: { trust: 4, luck: 3 },
      single: { trust: 6, attack: 2 },
      triple: { luck: 5, sp: 3, trust: 1 },
      glow:   { trust: 4, attack: 3, sp: 1 },
      sleepy: { sp: 4, hp: 4 }
    }
  };
  MF.variantStats = function (slot, v) {
    return (MF.VARIANT_STATS[slot] && MF.VARIANT_STATS[slot][v]) || {};
  };
})(window.MF = window.MF || {});
