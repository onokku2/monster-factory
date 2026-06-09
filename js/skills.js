/* skills.js — 技データ（データ駆動）。バトルエンジンは effects を解釈するだけ。
 * gate: 系統度合いの条件。満たさないと選択不可（=度合い条件付きの超必殺技を表現）。
 * effects type: damage / status / buff / heal / drain。 */
(function (MF) {
  "use strict";

  var SKILLS = [
    // ---- 汎用（全モンスターが使える）----
    { id: "u_smash", name: "烈砕撃", sp: 8, gate: {}, fam: null, desc: "強烈な一撃。",
      effects: [{ type: "damage", power: 1.55 }] },
    { id: "u_guardbreak", name: "ガードクラッシュ", sp: 10, gate: {}, fam: null, desc: "守備を下げる打撃。",
      effects: [{ type: "damage", power: 1.2 }, { type: "buff", stat: "defense", mul: 0.8, turns: 3, self: false }] },
    { id: "u_haste", name: "加速", sp: 7, gate: {}, fam: null, desc: "自分の素早さを上げる。",
      effects: [{ type: "buff", stat: "speed", mul: 1.35, turns: 4, self: true }] },
    { id: "u_focus", name: "精神統一", sp: 6, gate: {}, fam: null, desc: "攻撃と信頼(会心)を高める。",
      effects: [{ type: "buff", stat: "attack", mul: 1.25, turns: 4, self: true }, { type: "buff", stat: "trust", mul: 1.4, turns: 4, self: true }] },

    // ---- ドラゴン族（龍化）----
    { id: "d_breath", name: "フレイムブレス", sp: 12, gate: { 龍化: 25 }, fam: "dragon", desc: "炎を吐き火傷させる。",
      effects: [{ type: "damage", power: 1.6, element: "dragon" }, { type: "status", status: "burn", chance: 0.35, turns: 3 }] },
    { id: "d_scale", name: "龍鱗砕き", sp: 16, gate: { 龍化: 45 }, fam: "dragon", desc: "守備を貫く重撃。",
      effects: [{ type: "damage", power: 1.85, element: "dragon", ignoreDefFrac: 0.3 }] },
    { id: "d_ult", name: "アポカリプス・ブレス", sp: 32, gate: { 龍化: 75 }, fam: "dragon", super: true, desc: "【超】全てを灼く龍の終焉。",
      effects: [{ type: "damage", power: 3.2, element: "dragon" }, { type: "status", status: "burn", chance: 0.8, turns: 3 }] },

    // ---- 機械族（機械）----
    { id: "m_laser", name: "ペネトレイトレーザー", sp: 12, gate: { 機械: 25 }, fam: "machine", desc: "守備を無視する光線。",
      effects: [{ type: "damage", power: 1.55, element: "machine", ignoreDefFrac: 0.45 }] },
    { id: "m_drive", name: "オーバードライブ", sp: 14, gate: { 機械: 45 }, fam: "machine", desc: "攻撃と素早さを強化。",
      effects: [{ type: "buff", stat: "attack", mul: 1.4, turns: 4, self: true }, { type: "buff", stat: "speed", mul: 1.3, turns: 4, self: true }] },
    { id: "m_ult", name: "サテライトキャノン", sp: 30, gate: { 機械: 75 }, fam: "machine", super: true, desc: "【超】軌道上からの殲滅砲撃。",
      effects: [{ type: "damage", power: 3.0, element: "machine", ignoreDefFrac: 0.5 }] },

    // ---- 魂蟲族（蠱毒）----
    { id: "i_poison", name: "蠱毒の毒針", sp: 10, gate: { 蠱毒: 20 }, fam: "insect", desc: "猛毒を注入する。",
      effects: [{ type: "damage", power: 1.15, element: "insect" }, { type: "status", status: "poison", chance: 0.7, turns: 4 }] },
    { id: "i_feast", name: "蟲毒の宴", sp: 16, gate: { 蠱毒: 45 }, fam: "insect", desc: "与えたダメージの一部を吸収。",
      effects: [{ type: "drain", power: 1.6, element: "insect", healFrac: 0.5 }] },
    { id: "i_ult", name: "万蟲繚乱", sp: 28, gate: { 蠱毒: 75 }, fam: "insect", super: true, desc: "【超】無数の蟲が喰らい尽くす。",
      effects: [{ type: "damage", power: 2.7, element: "insect" }, { type: "status", status: "poison", chance: 1.0, turns: 5 }] },

    // ---- 古代族（古代）----
    { id: "a_curse", name: "砂塵の呪", sp: 11, gate: { 古代: 25 }, fam: "ancient", desc: "相手の素早さを大きく下げる。",
      effects: [{ type: "damage", power: 1.4, element: "ancient" }, { type: "buff", stat: "speed", mul: 0.7, turns: 3, self: false }] },
    { id: "a_guard", name: "古代の守護", sp: 14, gate: { 古代: 45 }, fam: "ancient", desc: "守備を高め体力を回復。",
      effects: [{ type: "buff", stat: "defense", mul: 1.5, turns: 4, self: true }, { type: "heal", frac: 0.2 }] },
    { id: "a_ult", name: "神代の裁き", sp: 30, gate: { 古代: 75 }, fam: "ancient", super: true, desc: "【超】時を超えし古の制裁。",
      effects: [{ type: "damage", power: 3.0, element: "ancient", ignoreBuffs: true }] },

    // ---- 天使族（神聖）----
    { id: "g_light", name: "聖光弾", sp: 11, gate: { 神聖: 25 }, fam: "angel", desc: "聖なる光で撃つ。",
      effects: [{ type: "damage", power: 1.55, element: "angel" }] },
    { id: "g_heal", name: "聖なる癒し", sp: 16, gate: { 神聖: 45 }, fam: "angel", desc: "体力を回復し状態異常を治す。",
      effects: [{ type: "heal", frac: 0.4 }, { type: "cleanse" }] },
    { id: "g_ult", name: "ラスト・ジャッジメント", sp: 32, gate: { 神聖: 75 }, fam: "angel", super: true, desc: "【超】天よりの最後の審判。",
      effects: [{ type: "buff", stat: "trust", mul: 2.0, turns: 1, self: true }, { type: "damage", power: 3.2, element: "angel" }] }
  ];

  var BY_ID = {};
  SKILLS.forEach(function (s) { BY_ID[s.id] = s; });

  // 度合いを満たしているか（SPは見ない＝レパートリー判定）
  function gateMet(monster, skill) {
    if (!skill.gate) return true;
    for (var k in skill.gate) if ((monster.affinity[k] || 0) < skill.gate[k]) return false;
    return true;
  }
  // 実際に使えるか（度合い + SP）
  function canUse(monster, skill, sp) {
    return gateMet(monster, skill) && sp >= skill.sp;
  }
  // モンスターのレパートリー（度合いで解禁された技一覧）
  function movesetFor(monster) {
    return SKILLS.filter(function (s) { return gateMet(monster, s); });
  }

  MF.SKILLS = SKILLS;
  MF.SKILL_BY_ID = BY_ID;
  MF.Skills = { gateMet: gateMet, canUse: canUse, movesetFor: movesetFor };
})(window.MF = window.MF || {});
