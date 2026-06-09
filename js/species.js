/* species.js — 原種500体を seed から決定論生成。
 * ランクは厳密な体数(SS5/S25/A50/B95/C125/D200=500)で配分し、仕様の割合を保証。
 * 各原種のパーツは系統テーマに沿って選ばれ、レアリティ帯はランクで上下する。 */
(function (MF) {
  "use strict";
  var TOTAL = 500;

  // レアリティ抽選の重み（centerTier中心の釣鐘）。ドロップでも再利用。
  function rarityWeights(center) {
    var out = [];
    for (var i = 0; i < 6; i++) { var d = i - center; out.push({ item: i, w: Math.max(0.02, Math.exp(-d * d / 2)) }); }
    return out;
  }
  MF.rarityWeights = rarityWeights;

  // 系統ごとの「らしい」バリアント（あれば優先採用）
  var THEME = {
    dragon:  { skin: "scale", tail: "spike", horn: "curved", wing: "bat", fang: "sabre" },
    machine: { skin: "metal", tail: "mech", arm: "mech", leg: "mech", wing: "mech", eye: "glow" },
    insect:  { skin: "chitin", wing: "insect", arm: "tentacle", leg: "multi", eye: "triple" },
    ancient: { skin: "stone", horn: "crown", tail: "fan", body: "blocky", fang: "tusk" },
    angel:   { skin: "aura", wing: "feather", ear: "fin", tail: "fan", eye: "double" }
  };

  // ランク配列（厳密体数）とfamily配列(各100)を固定seedでシャッフルし、idに割当
  var rankAssign = null, familyAssign = null;
  function ensureAssign() {
    if (rankAssign) return;
    var ranks = [];
    MF.RANKS.forEach(function (r) { for (var i = 0; i < MF.RANK_COUNT[r]; i++) ranks.push(r); });
    var fams = [];
    MF.FAMILIES.forEach(function (f, idx) { var n = idx < TOTAL % 5 ? Math.ceil(TOTAL / 5) : Math.floor(TOTAL / 5); for (var i = 0; i < n; i++) fams.push(f.id); });
    rankAssign = new MF.RNG("rank-layout-v1").shuffle(ranks);
    familyAssign = new MF.RNG("family-layout-v1").shuffle(fams);
  }

  function pickVariant(rng, slot, familyId) {
    var def = MF.SLOT_BY_ID[slot];
    var theme = THEME[familyId] && THEME[familyId][slot];
    if (theme && def.variants.indexOf(theme) >= 0 && rng.chance(0.62)) return theme;
    return rng.pick(def.variants);
  }

  function buildParts(rng, familyId, centerTier, seedBase) {
    var parts = {};
    var rw = rarityWeights(centerTier);
    for (var i = 0; i < MF.PART_SLOTS.length; i++) {
      var slot = MF.PART_SLOTS[i].slot;
      var pf = rng.chance(0.85) ? familyId : rng.pick(MF.FAMILIES).id; // 主に同系統、たまに混血
      parts[slot] = {
        slot: slot,
        variant: pickVariant(rng, slot, pf),
        family: pf,
        rarity: rng.weighted(rw),
        seed: MF.hashSeed(seedBase + ":" + slot)
      };
    }
    return parts;
  }

  var cache = {};
  function get(id) {
    if (id < 0 || id >= TOTAL) return null;
    if (cache[id]) return cache[id];
    ensureAssign();
    var seedStr = "species:v1:" + id;
    var rng = new MF.RNG(seedStr);
    var family = familyAssign[id];
    var rank = rankAssign[id];
    var centerTier = MF.RANK_TIER[rank];
    var parts = buildParts(rng, family, centerTier, seedStr);
    var sp = {
      id: id,
      isOriginal: true,
      rank: rank,
      family: family,
      name: MF.genName(rng, family),
      parts: parts,
      spriteSeed: MF.hashSeed(seedStr + ":sprite"),
      spriteKey: "sp" + id
    };
    sp.base = MF.Stats.deriveStats(parts, new MF.RNG(seedStr + ":stat"));
    sp.affinity = MF.Stats.deriveAffinity(parts);
    sp.power = MF.Stats.power({ base: sp.base, growth: {} });
    cache[id] = sp;
    return sp;
  }

  // 指定ランクからランダムに1体（戦闘相手の抽選用）
  function randomByRank(rng, rank) {
    ensureAssign();
    var ids = [];
    for (var i = 0; i < TOTAL; i++) if (rankAssign[i] === rank) ids.push(i);
    return get(rng.pick(ids));
  }
  // 強さ帯（tier中心）から相手ランクを選ぶ
  function rankForTier(rng, tier) {
    tier = MF.clamp(tier, 0, 5);
    var pool = [];
    for (var t = 0; t <= 5; t++) {
      var d = Math.abs(t - tier);
      pool.push({ item: MF.RANKS[5 - t], w: Math.max(0.04, Math.exp(-d * d / 1.6)) }); // RANKS[5-t]: D..SS
    }
    return rng.weighted(pool);
  }

  MF.Species = {
    TOTAL: TOTAL,
    get: get,
    randomByRank: randomByRank,
    rankForTier: rankForTier,
    rankOf: function (id) { ensureAssign(); return rankAssign[id]; },
    familyOf: function (id) { ensureAssign(); return familyAssign[id]; }
  };
})(window.MF = window.MF || {});
