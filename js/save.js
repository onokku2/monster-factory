/* save.js — localStorage への保存/復元。導出可能な値は保存しない（原子的事実のみ）。 */
(function (MF) {
  "use strict";
  var KEY = "monfac.save.v1";

  function serialize(g) {
    return {
      v: 1, t: Date.now(),
      gold: g.gold,
      activeId: g.activeId,
      monsters: g.monsters.map(function (m) {
        return {
          id: m.id, name: m.name, isOriginal: m.isOriginal, originSpeciesId: m.originSpeciesId,
          rank: m.rank, parts: m.parts, growth: m.growth, trainCount: m.trainCount, fav: m.fav,
          level: m.level, exp: m.exp, evoStage: m.evoStage,
          spriteSeed: m.spriteSeed, spriteKey: m.spriteKey
        };
      }),
      inventory: g.inventory,
      dex: { seen: g.dex.seen, captured: g.dex.captured },
      achievements: g.achievements,
      stats: g.stats,
      settings: g.settings,
      stageProgress: g.stageProgress,
      clearedStages: g.clearedStages
    };
  }

  function save(g) {
    try { localStorage.setItem(KEY, JSON.stringify(serialize(g))); return true; }
    catch (e) { return false; }
  }
  function loadRaw() {
    try { var r = localStorage.getItem(KEY); return r ? JSON.parse(r) : null; }
    catch (e) { return null; }
  }
  function wipe() { try { localStorage.removeItem(KEY); } catch (e) {} }
  function exists() { return !!loadRaw(); }

  MF.Save = { save: save, loadRaw: loadRaw, wipe: wipe, exists: exists, KEY: KEY };
})(window.MF = window.MF || {});
