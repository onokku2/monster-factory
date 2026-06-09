/* achievements.js — 実績（条件データ + 進捗評価）。
 * ゲームイベントの集計スナップショットを cond で評価し、解除する。 */
(function (MF) {
  "use strict";

  var ACHV = [
    { id: "first_win", name: "初勝利", desc: "はじめてバトルに勝利する。", cond: function (s) { return s.wins >= 1; } },
    { id: "win_10", name: "歴戦の証", desc: "10回勝利する。", cond: function (s) { return s.wins >= 10; } },
    { id: "win_50", name: "百戦錬磨", desc: "50回勝利する。", cond: function (s) { return s.wins >= 50; } },

    { id: "dex_10", name: "コレクター見習い", desc: "図鑑を10種捕獲。", cond: function (s) { return s.dexCaptured >= 10; } },
    { id: "dex_50", name: "コレクター", desc: "図鑑を50種捕獲。", cond: function (s) { return s.dexCaptured >= 50; } },
    { id: "dex_100", name: "図鑑マスター", desc: "図鑑を100種捕獲。", cond: function (s) { return s.dexCaptured >= 100; } },
    { id: "dex_250", name: "蒐集家", desc: "図鑑を250種捕獲。", cond: function (s) { return s.dexCaptured >= 250; } },
    { id: "dex_500", name: "完全制覇", desc: "全500種を捕獲。", cond: function (s) { return s.dexCaptured >= 500; } },
    { id: "seen_100", name: "見聞を広める", desc: "100種を発見。", cond: function (s) { return s.dexSeen >= 100; } },

    { id: "build_1", name: "創造のはじまり", desc: "改造種を1体つくる。", cond: function (s) { return s.builtCount >= 1; } },
    { id: "build_10", name: "フランケンシュタイン", desc: "改造種を10体つくる。", cond: function (s) { return s.builtCount >= 10; } },

    { id: "train_10", name: "トレーナー", desc: "トレーニングを10回行う。", cond: function (s) { return s.trainCount >= 10; } },
    { id: "train_100", name: "鬼コーチ", desc: "トレーニングを100回行う。", cond: function (s) { return s.trainCount >= 100; } },

    { id: "aff_dragon", name: "龍を統べる者", desc: "龍化を75以上にする。", cond: function (s) { return s.maxAff["龍化"] >= 75; } },
    { id: "aff_machine", name: "機神", desc: "機械を75以上にする。", cond: function (s) { return s.maxAff["機械"] >= 75; } },
    { id: "aff_insect", name: "蟲の王", desc: "蠱毒を75以上にする。", cond: function (s) { return s.maxAff["蠱毒"] >= 75; } },
    { id: "aff_ancient", name: "古を識る者", desc: "古代を75以上にする。", cond: function (s) { return s.maxAff["古代"] >= 75; } },
    { id: "aff_angel", name: "天に選ばれし", desc: "神聖を75以上にする。", cond: function (s) { return s.maxAff["神聖"] >= 75; } },

    { id: "super_used", name: "必殺の一撃", desc: "超必殺技を使う。", cond: function (s) { return s.superUsed >= 1; } },
    { id: "pvp_1", name: "決闘者", desc: "対人戦に1回勝利する。", cond: function (s) { return s.pvpWins >= 1; } },
    { id: "pvp_10", name: "闘技王", desc: "対人戦に10回勝利する。", cond: function (s) { return s.pvpWins >= 10; } },
    { id: "rich", name: "億万長者", desc: "10000G貯める。", cond: function (s) { return s.gold >= 10000; } },
    { id: "rarity_mythic", name: "神話の欠片", desc: "ミシックのパーツを手に入れる。", cond: function (s) { return s.bestRarity >= 5; } },

    { id: "evolve_1", name: "進化のとき", desc: "モンスターを進化させる。", cond: function (s) { return s.evolveCount >= 1; } },
    { id: "evolve_3", name: "進化の探求者", desc: "3回進化させる。", cond: function (s) { return s.evolveCount >= 3; } },
    { id: "level_20", name: "成長期", desc: "レベル20に到達。", cond: function (s) { return s.maxLevel >= 20; } },
    { id: "level_40", name: "熟練の域", desc: "レベル40に到達。", cond: function (s) { return s.maxLevel >= 40; } },
    { id: "stage_10", name: "冒険者", desc: "10ステージ制覇。", cond: function (s) { return s.stagesCleared >= 10; } },
    { id: "stage_all", name: "世界を救いし者", desc: "全30ステージ制覇。", cond: function (s) { return s.stagesCleared >= 30; } },

    { id: "fuse_1", name: "合体生命体", desc: "モンスターを合体させる。", cond: function (s) { return s.fuseCount >= 1; } },
    { id: "fuse_5", name: "生命の錬成", desc: "5回合体させる。", cond: function (s) { return s.fuseCount >= 5; } },

    { id: "shiny_1", name: "色違いとの遭遇", desc: "色違い個体に出会う。", cond: function (s) { return s.dexShiny >= 1; } },
    { id: "shiny_10", name: "光を集める者", desc: "色違いを10種記録する。", cond: function (s) { return s.dexShiny >= 10; } }
  ];

  // 解除チェック。newly = 新規解除された実績の配列。
  function check(snapshot, unlockedSet) {
    var newly = [];
    for (var i = 0; i < ACHV.length; i++) {
      var a = ACHV[i];
      if (!unlockedSet[a.id] && a.cond(snapshot)) { unlockedSet[a.id] = true; newly.push(a); }
    }
    return newly;
  }

  MF.ACHIEVEMENTS = ACHV;
  MF.Achievements = { check: check };
})(window.MF = window.MF || {});
