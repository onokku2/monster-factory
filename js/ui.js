/* ui.js — 画面・描画・演出・入力。ロジック(engine)と分離し、イベント列を再生する。 */
(function (MF) {
  "use strict";
  var G = MF.Game, S = MF.Sprite, St = MF.Stats;

  // ---------- 小道具 ----------
  function $(id) { return document.getElementById(id); }
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === "class") n.className = attrs[k];
      else if (k === "html") n.innerHTML = attrs[k];
      else if (k === "text") n.textContent = attrs[k];
      else if (k === "onclick") n.addEventListener("click", attrs[k]);
      else if (k === "onchange") n.addEventListener("change", attrs[k]);
      else if (k === "style") n.setAttribute("style", attrs[k]);
      else if (typeof attrs[k] === "boolean") n[k] = attrs[k]; // disabled等は属性でなくプロパティで
      else n.setAttribute(k, attrs[k]);
    }
    if (kids) (Array.isArray(kids) ? kids : [kids]).forEach(function (c) { if (c != null) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return n;
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms / ((G.settings && G.settings.battleSpeed) || 1)); }); }
  function rankBadge(rank) { return el("span", { class: "badge", style: "background:" + MF.RANK_COLOR[rank] }, rank); }
  function famTag(famId) { var f = MF.FAMILY_BY_ID[famId]; return el("span", { class: "fam" }, f.emoji + f.jp); }
  function rarTag(r) { return el("span", { class: "rar", style: "color:" + MF.RARITY_COLOR[r] }, MF.RARITY[r]); }

  function spriteCanvas(monster, scale) {
    var cv = S.thumb(monster, scale || 4);
    var wrap = el("div", { class: "sprite" });
    var c = cv.cloneNode(false); c.getContext("2d").drawImage(cv, 0, 0); // 表示用コピー
    wrap.appendChild(c);
    return wrap;
  }

  // ---------- SFX（WebAudioで合成、アセット不要）----------
  var actx = null;
  function ac() {
    if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
    if (actx && actx.state === "suspended") { try { actx.resume(); } catch (e) {} } // iOSはジェスチャ後にresume必要
    return actx;
  }
  function beep(type) {
    if (!G.settings || !G.settings.sfx) return; var c = ac(); if (!c) return; // settings未初期化でも音を鳴らさないだけで落とさない
    var o = c.createOscillator(), g = c.createGain(); o.connect(g); g.connect(c.destination);
    var t = c.currentTime, conf = {
      hit: [220, "square", 0.09], crit: [520, "sawtooth", 0.16], heal: [660, "sine", 0.18],
      super: [120, "sawtooth", 0.5], click: [440, "triangle", 0.05], win: [720, "sine", 0.3],
      lose: [150, "sine", 0.4], drop: [880, "triangle", 0.12], status: [180, "square", 0.12]
    }[type] || [330, "square", 0.08];
    o.type = conf[1]; o.frequency.setValueAtTime(conf[0], t);
    if (type === "super") o.frequency.exponentialRampToValueAtTime(conf[0] * 4, t + conf[2]);
    if (type === "win") o.frequency.setValueAtTime(conf[0] * 1.5, t + 0.12);
    g.gain.setValueAtTime(0.18, t); g.gain.exponentialRampToValueAtTime(0.001, t + conf[2]);
    o.start(t); o.stop(t + conf[2] + 0.02);
  }

  // ---------- トースト & 実績 ----------
  function toast(msg, cls) {
    var t = el("div", { class: "toast " + (cls || "") }, msg);
    $("toasts").appendChild(t);
    setTimeout(function () { t.classList.add("show"); }, 10);
    setTimeout(function () { t.classList.remove("show"); setTimeout(function () { t.remove(); }, 400); }, 2600);
  }
  G.onAchievement = function (a) { beep("win"); toast("🏆 実績解除：" + a.name, "achv"); };

  // ---------- PWA インストール導線 ----------
  var deferredInstall = null;
  window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); deferredInstall = e; });
  function isStandalone() { return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true; }
  function isiOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent); }
  async function promptInstall() {
    if (deferredInstall) {
      deferredInstall.prompt();
      try { await deferredInstall.userChoice; } catch (e) {}
      deferredInstall = null;
      toast("インストールを進めてね");
    } else if (isiOS()) {
      toast("共有ボタン →「ホーム画面に追加」でアプリ化できます");
    } else {
      toast("ブラウザのメニューから「ホーム画面に追加 / インストール」を選んでね");
    }
  }

  // ---------- 画面ルータ ----------
  var screens = {};
  var current = null, rafId = null;
  function go(name, params) {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    if (current && screens[current] && screens[current].exit) screens[current].exit();
    current = name;
    var app = $("app"); clear(app);
    screens[name].enter(app, params || {});
  }
  MF.UI = { go: go, toast: toast };

  // 上部バー
  function topbar(active) {
    var c = G.dexCounts();
    var bar = el("div", { class: "topbar" }, [
      el("div", { class: "brand", onclick: function () { go("home"); } }, "🧬 モンスターファクトリー"),
      el("div", { class: "tb-right" }, [
        el("span", { class: "gold" }, "💰 " + G.gold + "G"),
        el("span", { class: "dexc" }, "📖 " + c.captured + "/" + c.total)
      ])
    ]);
    return bar;
  }

  // ステータス表示（バー付き）
  function statBars(stats, max) {
    max = max || 0;
    if (!max) for (var k in stats) if (k !== "hp" && k !== "sp") max = Math.max(max, stats[k]);
    var box = el("div", { class: "stats" });
    MF.STAT_KEYS.forEach(function (key) {
      var v = stats[key];
      var ref = (key === "hp") ? Math.max(200, v) : (key === "sp") ? Math.max(80, v) : max;
      var row = el("div", { class: "stat-row" }, [
        el("span", { class: "sname" }, MF.STAT_JP[key]),
        el("span", { class: "sval" }, "" + v),
        el("div", { class: "sbar" }, el("i", { style: "width:" + Math.round(MF.clamp(v / ref, 0, 1) * 100) + "%" }))
      ]);
      box.appendChild(row);
    });
    return box;
  }

  // 系統度合い表示（解禁マーカー付き）
  function affBars(aff) {
    var box = el("div", { class: "affs" });
    MF.AFFINITY_KEYS.forEach(function (a) {
      var fam = MF.FAMILY_BY_AFF[a];
      var v = aff[a] || 0;
      var pct = Math.round(MF.clamp(v / MF.AFF_SOFT_CAP, 0, 1) * 100);
      var bar = el("div", { class: "abar" }, [
        el("i", { style: "width:" + pct + "%;background:hsl(" + fam.hue[0] + ",70%,55%)" }),
        el("u", { class: "mk" + (v >= 25 ? " on" : ""), style: "left:" + (25 / MF.AFF_SOFT_CAP * 100) + "%" }),
        el("u", { class: "mk" + (v >= 45 ? " on" : ""), style: "left:" + (45 / MF.AFF_SOFT_CAP * 100) + "%" }),
        el("u", { class: "mk sup" + (v >= 75 ? " on" : ""), style: "left:" + (75 / MF.AFF_SOFT_CAP * 100) + "%" })
      ]);
      box.appendChild(el("div", { class: "aff-row" }, [el("span", { class: "aname" }, a), el("span", { class: "aval" }, "" + v), bar]));
    });
    return box;
  }

  // レベル/EXPバー
  function levelBar(m) {
    var need = MF.Evolution.expToNext(m.level || 1);
    var pct = Math.round(MF.clamp((m.exp || 0) / need, 0, 1) * 100);
    var capped = (m.level || 1) >= MF.PROG.levelCap;
    return el("div", { class: "lvbar" }, [
      el("span", { class: "lv" }, "Lv." + (m.level || 1)),
      el("div", { class: "xp" }, el("i", { style: "width:" + (capped ? 100 : pct) + "%" })),
      el("span", { class: "xptx" }, capped ? "MAX" : ((m.exp || 0) + "/" + need))
    ]);
  }
  function evoStars(m) {
    var s = m.evoStage || 0; if (!s) return null;
    return el("span", { class: "evo-star" }, s >= 2 ? "✦✦" : "✦");
  }

  // モンスターカード
  function monsterCard(m, opts) {
    opts = opts || {};
    var f = St.finalStats(m);
    var card = el("div", { class: "mcard" + (opts.active ? " active" : "") + (m.evoStage ? " evo" : "") }, [
      el("div", { class: "mc-head" }, [
        spriteCanvas(m, opts.scale || 5),
        el("div", { class: "mc-meta" }, [
          el("div", { class: "mc-name" }, [m.fav ? el("span", { class: "fav" }, "★") : null, MF.Monster.displayName(m), evoStars(m)]),
          el("div", { class: "mc-sub" }, [rankBadge(m.rank), famTag(St.dominantFamily(m)), m.isOriginal ? el("span", { class: "tag-orig" }, "原種") : el("span", { class: "tag-mod" }, "改造種")]),
          levelBar(m),
          el("div", { class: "mc-power" }, "総合力 " + St.power(m))
        ])
      ])
    ]);
    if (opts.full) { card.appendChild(statBars(f)); card.appendChild(affBars(m.affinity)); }
    return card;
  }

  // ================= タイトル =================
  screens.title = {
    enter: function (app) {
      var has = MF.Save.exists();
      app.appendChild(el("div", { class: "title-scr" }, [
        el("h1", { class: "logo" }, "MONSTER FACTORY"),
        el("p", { class: "logo-jp" }, "モンスターファクトリー"),
        el("p", { class: "tagline" }, "パーツを集め、組み、鍛え、戦え。"),
        el("div", { class: "title-btns" }, [
          el("button", { class: "btn big", onclick: function () { ac(); beep("click"); go(has ? "home" : "starter"); } }, has ? "▶ つづきから" : "▶ はじめる"),
          has ? el("button", { class: "btn ghost", onclick: function () { if (confirm("セーブを消して最初から始めますか？")) { G.resetAll(); beep("click"); go("starter"); } } }, "新しく始める") : null
        ]),
        el("p", { class: "hint" }, "全500種の原種・5系統・無限の改造種。30ステージ・育成・進化・対人戦。")
      ]));
    }
  };

  // ================= スターター選択 =================
  screens.starter = {
    enter: function (app) {
      var opts = G.starterOptions();
      var wrap = el("div", { class: "wrap starter-scr" }, [
        el("h2", null, "🥚 あいぼうを選ぼう"),
        el("p", { class: "muted" }, "最初のモンスターを3種から選択。系統で戦い方も進化先も変わる。")
      ]);
      var grid = el("div", { class: "starter-grid" });
      opts.forEach(function (sp) {
        var mon = MF.Monster.fromSpecies(sp, {});
        var fam = MF.FAMILY_BY_ID[sp.family];
        grid.appendChild(el("div", { class: "starter-card", onclick: function () {
          beep("win"); G.newGame(sp.id); toast(fam.jp + "の " + sp.name + " に決定！", "achv"); go("home");
        } }, [ monsterCard(mon, { full: true, scale: 6 }), el("div", { class: "starter-pick" }, "▶ このコにする") ]));
      });
      wrap.appendChild(grid);
      app.appendChild(wrap);
    }
  };

  // ================= ホーム =================
  function nextGoalHint() {
    var c = G.dexCounts();
    if (G.stats.battles === 0) return "まずは「冒険」で野生モンスターと戦ってみよう。";
    if (G.inventory.length >= 6 && G.stats.builtCount === 0) return "パーツが集まってきた。「組立」で改造種を作ろう！";
    if (c.captured < 10) return "「冒険」で原種を倒してパーツ図鑑を埋めよう。";
    var active = G.getActive();
    var maxAff = 0, an = ""; for (var k in active.affinity) if (active.affinity[k] > maxAff) { maxAff = active.affinity[k]; an = k; }
    if (maxAff < 75) return an + "を75まで上げると超必殺技が解禁される（同系統パーツを集めて組もう）。";
    if (G.stats.pvpWins === 0) return "強くなった編成で「対人戦」に挑戦してみよう。";
    return "図鑑コンプリートを目指そう！ 現在 " + c.captured + "/" + c.total + "。";
  }
  screens.home = {
    enter: function (app) {
      app.appendChild(topbar());
      var active = G.getActive();
      var wrap = el("div", { class: "home" });
      wrap.appendChild(el("div", { class: "panel hero" }, [
        el("h2", null, "あいぼう"),
        monsterCard(active, { active: true, full: true, scale: 7 })
      ]));
      var menu = el("div", { class: "menu-grid" });
      [["⚔️ 冒険", function () { go("stages"); }, "30ステージに挑戦"],
       ["🏆 対人戦", function () { startBattle(G.startPvp(), "pvp"); }, "改造種同士のAI対戦"],
       ["🐾 牧場", function () { go("ranch"); }, "編成・お気に入り・解体"],
       ["🔧 組立", function () { go("assemble"); }, "パーツから改造種を作る"],
       ["🧪 融合", function () { go("fuse"); }, "余りパーツを高レアに製造"],
       ["🧬 合体", function () { go("fusion"); }, "2体を1体に合成・継承"],
       ["💪 トレーニング", function () { go("training"); }, "ステータスを鍛える"],
       ["📖 図鑑", function () { go("dex"); }, "原種500種コレクション"],
       ["🎖 実績", function () { go("achievements"); }, "やり込みの記録"],
       ["⚙️ 設定", function () { go("settings"); }, "倍速・音・データ"]
      ].forEach(function (it) {
        menu.appendChild(el("button", { class: "menu-btn", onclick: function () { beep("click"); it[1](); } }, [
          el("div", { class: "mb-title" }, it[0]), el("div", { class: "mb-sub" }, it[2])
        ]));
      });
      wrap.appendChild(menu);
      wrap.appendChild(el("div", { class: "panel goal" }, [el("span", { class: "goal-i" }, "🎯 次の目標"), el("span", null, nextGoalHint())]));
      app.appendChild(wrap);
    }
  };

  // 冒険：30ステージ選択
  screens.stages = {
    enter: function (app) {
      app.appendChild(topbar());
      var myPow = St.power(G.getActive());
      var wrap = el("div", { class: "wrap" }, [
        el("h2", null, "⚔️ ステージ"),
        el("p", { class: "muted" }, "クリアで次が解放。ボス【主】を倒すと帯が進む。あいぼう総合力 " + myPow)
      ]);
      var grid = el("div", { class: "stage-grid" });
      MF.Stages.list.forEach(function (st) {
        var unlocked = G.stageUnlocked(st.id), cleared = !!G.clearedStages[st.id];
        var tough = st.recPower > myPow * 1.15;
        var cell = el("button", { class: "stage-cell" + (st.boss ? " boss" : "") + (unlocked ? "" : " locked") + (cleared ? " cleared" : ""), disabled: !unlocked, onclick: function () {
          if (!unlocked) return; beep("click"); startBattle(G.startStage(st.id), "stage");
        } }, [
          el("div", { class: "st-no" }, (cleared ? "✓ " : "") + "S" + (st.id + 1)),
          el("div", { class: "st-name" }, unlocked ? st.name : "？？？"),
          unlocked ? el("div", { class: "st-info" }, [
            el("span", { style: "color:" + (tough ? "#ff8a8a" : "#9aa6b2") }, "推奨 " + st.recPower),
            el("span", { class: "st-mul" }, "EXP×" + st.expMul.toFixed(1))
          ]) : el("div", { class: "st-lock" }, "🔒")
        ]);
        grid.appendChild(cell);
      });
      wrap.appendChild(grid);
      wrap.appendChild(el("button", { class: "btn ghost", onclick: function () { go("home"); } }, "← 戻る"));
      app.appendChild(wrap);
    }
  };

  // ================= バトル =================
  var scene = null;
  function startBattle(battle, mode) { go("battle", { battle: battle, mode: mode }); }

  screens.battle = {
    enter: function (app, p) {
      var battle = p.battle, mode = p.mode;
      scene = {
        battle: battle, mode: mode, busy: false,
        gridP: S.buildGrid(battle.p.ref), gridE: S.buildGrid(battle.e.ref),
        hp: { player: battle.p.maxhp, enemy: battle.e.maxhp },
        hpGhost: { player: battle.p.maxhp, enemy: battle.e.maxhp },
        _hpTarget: { player: battle.p.maxhp, enemy: battle.e.maxhp },
        shake: 0, flash: { player: 0, enemy: 0 }, lunge: { player: 0, enemy: 0 }, faint: { player: 0, enemy: 0 },
        frame: 0, screenFlash: 0
      };
      var root = el("div", { class: "battle" });
      var sceneEl = el("div", { class: "bt-scene", id: "btScene" }, [
        el("canvas", { id: "btBg", width: 480, height: 250 }),
        unitBlock("enemy", battle.e),
        unitBlock("player", battle.p),
        el("div", { class: "bt-cutin", id: "btCutin" }),
        el("div", { class: "bt-sflash", id: "btSflash" }),
        el("div", { class: "fx-layer", id: "fxLayer" })
      ]);
      root.appendChild(sceneEl);
      root.appendChild(el("div", { class: "bt-log", id: "btLog" }));
      root.appendChild(el("div", { class: "bt-cmd", id: "btCmd" }));
      app.appendChild(root);
      drawBg();
      renderCommands();
      if (mode === "pvp") log("対戦相手が現れた！");
      else if (battle.e.ref.shiny) { log("✨ 色違いの " + battle.e.name + " が現れた！レアだ！"); beep("win"); scene.screenFlash = 0.5; }
      else log("野生の " + battle.e.name + " が現れた！");
      loop();
    },
    exit: function () { scene = null; }
  };

  function unitBlock(side, c) {
    return el("div", { class: "bt-unit " + side + (c.ref.shiny ? " shiny" : "") }, [
      el("div", { class: "bt-info " + side }, [
        el("div", { class: "bi-name" }, [(c.ref.shiny ? "✨" : "") + c.name, " ", rankBadge(c.ref.rank)]),
        el("div", { class: "bi-bar hp" }, [el("i", { class: "ghost", id: "hpg_" + side }), el("i", { id: "hp_" + side }), el("span", { class: "bi-num", id: "hpn_" + side })]),
        el("div", { class: "bi-bar sp" }, [el("i", { id: "sp_" + side }), el("span", { class: "bi-num", id: "spn_" + side })]),
        el("div", { class: "bi-st", id: "st_" + side })
      ]),
      el("canvas", { class: "bt-sprite", id: "spr_" + side, width: S.N * 6, height: S.N * 6 })
    ]);
  }

  function drawBg() {
    var cv = $("btBg"); if (!cv) return; var x = cv.getContext("2d");
    var g = x.createLinearGradient(0, 0, 0, 250);
    g.addColorStop(0, "#241b3a"); g.addColorStop(1, "#0e0a1c");
    x.fillStyle = g; x.fillRect(0, 0, 480, 250);
    x.fillStyle = "rgba(255,255,255,.05)";
    for (var i = 0; i < 40; i++) x.fillRect((i * 97) % 480, (i * 53) % 180, 2, 2);
    x.fillStyle = "rgba(0,0,0,.25)"; x.beginPath(); x.ellipse(360, 210, 70, 14, 0, 0, 7); x.fill(); x.beginPath(); x.ellipse(120, 235, 80, 16, 0, 0, 7); x.fill();
  }

  function drawUnitSprite(side) {
    var cv = $("spr_" + side); if (!cv) return; var ctx = cv.getContext("2d"); ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, cv.width, cv.height);
    var grid = side === "player" ? scene.gridP : scene.gridE, N = S.N, scl = 6;
    var bob = Math.round(Math.sin(scene.frame / 20 + (side === "enemy" ? 2 : 0)) * 1);
    var faint = scene.faint[side];
    var flash = scene.flash[side] > 0.5;
    ctx.save();
    if (faint > 0) { ctx.globalAlpha = Math.max(0, 1 - faint); ctx.translate(0, faint * 30); }
    for (var y = 0; y < N; y++) for (var x = 0; x < N; x++) {
      var col = grid.data[y * N + x]; if (!col) continue;
      ctx.fillStyle = flash ? "#ffffff" : col;
      ctx.fillRect(x * scl, (y + bob) * scl, scl, scl);
    }
    ctx.restore();
  }

  function loop() {
    if (!scene) return;
    scene.frame++;
    updateBars();
    // shake & flash decay
    var sc = $("btScene");
    if (sc) {
      if (scene.shake > 0.4) { sc.style.transform = "translate(" + ((Math.random() - .5) * scene.shake) + "px," + ((Math.random() - .5) * scene.shake) + "px)"; scene.shake *= 0.86; }
      else { sc.style.transform = ""; scene.shake = 0; }
    }
    scene.flash.player *= 0.8; scene.flash.enemy *= 0.8; scene.faint.player = Math.min(1, scene.faint.player + (scene.faint.player > 0 ? 0.03 : 0)); scene.faint.enemy = Math.min(1, scene.faint.enemy + (scene.faint.enemy > 0 ? 0.03 : 0));
    var sf = $("btSflash"); if (sf) { sf.style.opacity = scene.screenFlash; scene.screenFlash *= 0.85; }
    drawUnitSprite("player"); drawUnitSprite("enemy");
    rafId = requestAnimationFrame(loop);
  }

  // HPバーは目標値へ滑らかに（per-eventの値で再構成）
  function cmb(side) { return scene.battle[side === "player" ? "p" : "e"]; }
  function curTgt(side) { return scene._hpTarget[side]; }
  function setHpTarget(side, v) { scene._hpTarget[side] = MF.clamp(v, 0, cmb(side).maxhp); }
  function updateBars() {
    ["player", "enemy"].forEach(function (s) {
      var c = cmb(s);
      var target = scene._hpTarget[s];
      scene.hp[s] += (target - scene.hp[s]) * 0.22;
      if (Math.abs(target - scene.hp[s]) < 0.6) scene.hp[s] = target;
      // 残像バー（被ダメージが遅れて追従）
      scene.hpGhost[s] += (scene.hp[s] - scene.hpGhost[s]) * 0.07;
      if (Math.abs(scene.hp[s] - scene.hpGhost[s]) < 0.6) scene.hpGhost[s] = scene.hp[s];
      var hpEl = $("hp_" + s), hpn = $("hpn_" + s), hpg = $("hpg_" + s);
      if (hpEl) { var pct = scene.hp[s] / c.maxhp * 100; hpEl.style.width = pct + "%"; hpEl.style.background = pct < 25 ? "#ff5d6c" : pct < 55 ? "#ffb02e" : "#46d39a"; }
      if (hpg) hpg.style.width = (scene.hpGhost[s] / c.maxhp * 100) + "%";
      if (hpn) hpn.textContent = Math.ceil(scene.hp[s]) + "/" + c.maxhp;
      var spEl = $("sp_" + s), spn = $("spn_" + s);
      if (spEl) spEl.style.width = (c.sp / c.f.sp * 100) + "%";
      if (spn) spn.textContent = c.sp + "/" + c.f.sp;
      var stEl = $("st_" + s);
      if (stEl) { clear(stEl); c.statuses.forEach(function (st) { stEl.appendChild(el("span", { class: "stchip " + st.type }, stIcon(st.type) + st.turns)); }); }
    });
  }
  function stIcon(t) { return ({ poison: "☠", burn: "🔥", paralyze: "⚡", seal: "🔒" })[t] || "●"; }

  function log(msg) {
    var l = $("btLog"); if (!l) return;
    l.appendChild(el("div", { class: "logline" }, msg));
    l.scrollTop = l.scrollHeight;
    while (l.children.length > 40) l.removeChild(l.firstChild);
  }

  function fxText(side, text, opts) {
    opts = opts || {};
    var layer = $("fxLayer"); if (!layer) return;
    var unit = document.querySelector(".bt-unit." + side + " .bt-sprite");
    var sceneEl = $("btScene"); if (!unit || !sceneEl) return;
    var ur = unit.getBoundingClientRect(), sr = sceneEl.getBoundingClientRect();
    var x = ur.left - sr.left + ur.width / 2 + (Math.random() - .5) * 20;
    var y = ur.top - sr.top + ur.height / 3;
    var t = el("div", { class: "fxnum " + (opts.cls || ""), style: "left:" + x + "px;top:" + y + "px" }, text);
    layer.appendChild(t);
    setTimeout(function () { t.remove(); }, 1100);
  }

  async function cutin(name) {
    var c = $("btCutin"); if (!c) return;
    c.innerHTML = ""; c.appendChild(el("div", { class: "ci-bar" }, name));
    c.classList.add("show"); scene.screenFlash = 0.4; beep("super");
    await wait(700);
    c.classList.remove("show");
    await wait(120);
  }

  function renderCommands() {
    var cmd = $("btCmd"); if (!cmd) return; clear(cmd);
    if (scene.battle.over) return;
    var main = el("div", { class: "cmd-main" });
    main.appendChild(el("button", { class: "cbtn atk", onclick: function () { doAction({ type: "attack" }); } }, "たたかう"));
    main.appendChild(el("button", { class: "cbtn skl", onclick: showSkills } , "とくぎ"));
    main.appendChild(el("button", { class: "cbtn grd", onclick: function () { doAction({ type: "guard" }); } }, "まもる"));
    if (scene.mode === "pvp") main.appendChild(el("button", { class: "cbtn flee", onclick: function () { if (confirm("降参しますか？")) forfeit(); } }, "降参"));
    else main.appendChild(el("button", { class: "cbtn flee", onclick: function () { doAction({ type: "flee" }); } }, "にげる"));
    cmd.appendChild(main);
  }
  function showSkills() {
    beep("click");
    var cmd = $("btCmd"); clear(cmd);
    var p = scene.battle.p;
    var opts = scene.battle.playerOptions();
    var box = el("div", { class: "skill-list" });
    opts.skills.forEach(function (sk) {
      box.appendChild(el("button", { class: "sbtn" + (sk.super ? " super" : "") + (sk.usable ? "" : " dis"), onclick: function () { if (sk.usable) doAction({ type: "skill", skillId: sk.id }); else beep("status"); } }, [
        el("span", { class: "sk-n" }, (sk.super ? "★" : "") + sk.name),
        el("span", { class: "sk-sp" }, "SP" + sk.sp),
        el("span", { class: "sk-d" }, sk.desc)
      ]));
    });
    // 未解禁の超必殺（同系統）をモチベ表示
    var fam = St.dominantFamily(p.ref);
    MF.SKILLS.forEach(function (s) {
      if (s.super && s.fam === fam && !MF.Skills.gateMet(p.ref, s)) {
        var need = []; for (var k in s.gate) need.push(k + s.gate[k]);
        box.appendChild(el("div", { class: "sbtn locked" }, [el("span", { class: "sk-n" }, "🔒 " + s.name), el("span", { class: "sk-d" }, "解禁条件：" + need.join(" "))]));
      }
    });
    var cmd2 = el("div", { class: "skill-wrap" }, [box, el("button", { class: "btn ghost sm", onclick: renderCommands }, "← 戻る")]);
    cmd.appendChild(cmd2);
  }

  function forfeit() {
    scene.battle.over = true; scene.battle.result = { winner: "enemy", reason: "forfeit" };
    finishBattle();
  }

  async function doAction(action) {
    if (scene.busy || scene.battle.over) return;
    scene.busy = true; clear($("btCmd"));
    var r = scene.battle.takeTurn(action);
    await playEvents(r.events);
    scene.busy = false;
    if (scene.battle.over) finishBattle();
    else renderCommands();
  }

  async function playEvents(events) {
    for (var i = 0; i < events.length; i++) {
      var e = events[i];
      var actSide = e.actor, tgt = e.target;
      switch (e.kind) {
        case "turnstart": break;
        case "act": log(e.text); if (actSide) lunge(actSide); await wait(260); break;
        case "super": if (actSide === "player") G.noteSuper(); log(e.text); await cutin(e.skill); lunge(actSide); await wait(120); break;
        case "guard": log(e.text); await wait(220); break;
        case "info": log(e.text); await wait(260); break;
        case "miss": fxText(tgt, "MISS", { cls: "miss" }); log("しかし外れた！"); await wait(260); break;
        case "damage":
        case "crit": {
          setHpTarget(tgt, curTgt(tgt) - e.value);
          scene.flash[tgt] = 1; scene.shake = e.crit ? 15 : 7 + Math.min(8, e.value / 24);
          if (e.crit) scene.screenFlash = 0.5;
          fxImpact(tgt, e.crit); recoil(tgt);            // アタックエフェクト＋エネミーリアクション
          fxText(tgt, "" + e.value, { cls: e.crit ? "crit" : "dmg" });
          beep(e.crit ? "crit" : "hit");
          if (e.crit) log("会心の一撃！");
          if (e.typeMul > 1) log("効果は抜群だ！"); else if (e.typeMul < 1) log("効果はいまひとつだ…");
          await wait(e.crit ? 110 : 55); // ヒットストップ（強打ほど長い）
          await wait(280);
          break;
        }
        case "dot": {
          setHpTarget(tgt, curTgt(tgt) - e.value);
          fxText(tgt, "" + e.value, { cls: e.status === "burn" ? "burn" : "poison" });
          log((tgt === "player" ? "味方" : "相手") + "は" + (e.status === "burn" ? "火傷" : "毒") + "のダメージ！");
          beep("status"); await wait(360); break;
        }
        case "heal": {
          setHpTarget(tgt, curTgt(tgt) + e.value);
          fxText(tgt, "+" + e.value, { cls: "heal" }); beep("heal"); log("HPが回復した。"); await wait(320); break;
        }
        case "status": fxText(tgt, stIcon(e.status), { cls: "status" }); log((tgt === "player" ? "味方" : "相手") + "は" + statusName(e.status) + "になった！"); beep("status"); await wait(320); break;
        case "buff": log((tgt === "player" ? "味方" : "相手") + "の" + MF.STAT_JP[e.stat] + "が" + (e.up ? "上がった" : "下がった") + "！"); await wait(280); break;
        case "cleanse": log("状態異常が回復した。"); await wait(240); break;
        case "faint": scene.faint[tgt] = 0.001; log((tgt === "player" ? "味方" : "相手") + "は倒れた！"); await wait(500); break;
        case "flee": log(e.text); await wait(300); break;
        case "end": break;
      }
    }
    // SP等の最終同期
    setHpTarget("player", scene.battle.p.hp); setHpTarget("enemy", scene.battle.e.hp);
  }
  function statusName(t) { return ({ poison: "毒", burn: "火傷", paralyze: "麻痺", seal: "封印" })[t] || t; }
  function lunge(side) { scene.lunge[side] = 1; var u = document.querySelector(".bt-unit." + side); if (u) { u.classList.add("lunge"); setTimeout(function () { u.classList.remove("lunge"); }, 260); } }
  // エネミーリアクション（被弾でのけぞる）
  function recoil(side) {
    var u = document.querySelector(".bt-unit." + side);
    if (!u) return; u.classList.remove("recoil"); void u.offsetWidth; u.classList.add("recoil");
    setTimeout(function () { u.classList.remove("recoil"); }, 320);
  }
  // アタックエフェクト（斬撃＋衝撃）
  function fxImpact(side, big) {
    var layer = $("fxLayer"); if (!layer) return;
    var unit = document.querySelector(".bt-unit." + side + " .bt-sprite"), sceneEl = $("btScene");
    if (!unit || !sceneEl) return;
    var ur = unit.getBoundingClientRect(), sr = sceneEl.getBoundingClientRect();
    var x = ur.left - sr.left + ur.width / 2, y = ur.top - sr.top + ur.height / 2;
    var imp = el("div", { class: "impact" + (big ? " big" : ""), style: "left:" + x + "px;top:" + y + "px" });
    var slash = el("div", { class: "slash", style: "left:" + x + "px;top:" + y + "px;transform:translate(-50%,-50%) rotate(" + (Math.random() * 80 - 40) + "deg)" });
    layer.appendChild(imp); layer.appendChild(slash);
    setTimeout(function () { imp.remove(); slash.remove(); }, 440);
  }

  function finishBattle() {
    var battle = scene.battle;
    if (battle.result && battle.result.winner === "player") beep("win"); else if (battle.result && battle.result.winner === "enemy") beep("lose");
    var out = G.endBattle(battle);
    setTimeout(function () { showResult(battle, out); }, 600);
  }

  function showResult(battle, out) {
    var r = battle.result || {};
    var stage = G.currentStage;
    var app = $("app");
    var card = el("div", { class: "result-overlay" });
    var title = r.winner === "player" ? "🎉 勝利！" : r.winner === "enemy" ? "💀 敗北…" : "🏃 逃走";
    var body = el("div", { class: "result-card" }, [el("h2", { class: r.winner === "player" ? "win" : "lose" }, title)]);
    if (out.stageCleared && stage) body.appendChild(el("p", { class: "stage-clear" }, "「" + stage.name + "」クリア！"));
    if (out.shiny) body.appendChild(el("p", { class: "shiny-line" }, "✨ 色違いを撃破！ 報酬アップ＆高レアドロップ！"));
    if (out.gold) body.appendChild(el("p", null, "💰 " + out.gold + "G 獲得"));
    // EXP / レベルアップ
    if (out.exp) {
      var line = "⭐ EXP +" + out.exp;
      if (out.level && out.level.leveled) line += "　→　Lv." + out.level.from + " から Lv." + out.level.to + " に！";
      body.appendChild(el("p", { class: out.level && out.level.leveled ? "lvup" : "" }, line));
      if (out.level && out.level.leveled) beep("win");
    }
    if (out.unlockedNext != null) body.appendChild(el("p", { class: "unlock" }, "🔓 新ステージ「" + MF.Stages.get(out.unlockedNext).name + "」解放！"));
    if (out.drop) {
      beep("drop");
      var d = out.drop;
      body.appendChild(el("div", { class: "drop" }, [
        el("p", { class: "drop-h" }, "✨ パーツ入手！"),
        el("div", { class: "drop-row" }, [el("span", null, MF.SLOT_BY_ID[d.slot].jp + "：" + MF.variantJP(d.slot, d.variant)), rarTag(d.rarity), famTag(d.family)])
      ]));
    }
    if (r.winner === "enemy") body.appendChild(el("p", { class: "muted" }, "あいぼうは気絶した…（ペナルティなし）"));
    // 進化可能なら誘導
    if (out.evoReady) {
      body.appendChild(el("button", { class: "btn evo-btn", onclick: function () { card.remove(); startEvolve(G.activeId, function () { go("home"); }); } }, "✨ あいぼうが進化できる！"));
    }
    var btns = el("div", { class: "result-btns" });
    if (scene.mode === "stage" && stage) {
      btns.appendChild(el("button", { class: "btn ghost sm", onclick: function () { beep("click"); startBattle(G.startStage(stage.id), "stage"); } }, "再挑戦"));
      if (G.stageUnlocked(stage.id + 1) && stage.id + 1 < MF.Stages.count)
        btns.appendChild(el("button", { class: "btn", onclick: function () { beep("click"); startBattle(G.startStage(stage.id + 1), "stage"); } }, "次のステージ▶"));
      btns.appendChild(el("button", { class: "btn ghost sm", onclick: function () { beep("click"); go("stages"); } }, "ステージ選択"));
    } else if (scene.mode === "pvp") {
      btns.appendChild(el("button", { class: "btn", onclick: function () { beep("click"); startBattle(G.startPvp(), "pvp"); } }, "もう一戦"));
    }
    btns.appendChild(el("button", { class: "btn ghost", onclick: function () { beep("click"); go("home"); } }, "拠点へ"));
    body.appendChild(btns);
    card.appendChild(body);
    app.appendChild(card);
  }

  // 進化演出
  function startEvolve(monsterId, done) {
    var m = G.getMonster(monsterId); if (!m) { done && done(); return; }
    var oldName = MF.Monster.displayName(m);
    var ov = el("div", { class: "evo-overlay" });
    var stageEl = el("div", { class: "evo-stage" }, [
      spriteCanvas(m, 7),
      el("div", { class: "evo-flash" }),
      el("div", { class: "evo-text" }, oldName + " は…")
    ]);
    ov.appendChild(stageEl); $("app").appendChild(ov);
    beep("super");
    setTimeout(function () { ov.classList.add("charge"); }, 50);
    setTimeout(function () { ov.classList.add("burst"); beep("win"); }, 1100);
    setTimeout(function () {
      var r = G.evolve(monsterId);
      ov.classList.remove("charge", "burst");
      clear(stageEl);
      stageEl.appendChild(spriteCanvas(m, 7));
      stageEl.appendChild(el("div", { class: "evo-text big" }, "✨ " + (r.name || MF.Monster.displayName(m)) + " に進化した！"));
      stageEl.appendChild(el("button", { class: "btn", onclick: function () { ov.remove(); done && done(); } }, "やった！"));
      if (r.newly && r.newly.length) for (var i = 0; i < r.newly.length; i++) toast("🏆 実績解除：" + r.newly[i].name, "achv");
    }, 1500);
  }

  // ================= 牧場（編成・解体）=================
  screens.ranch = {
    enter: function (app) {
      app.appendChild(topbar());
      var wrap = el("div", { class: "wrap" }, [el("h2", null, "🐾 牧場"), el("p", { class: "muted" }, "あいぼうを選んだり、改造種を解体してパーツに戻せる。所持 " + G.monsters.length + " 体")]);
      var grid = el("div", { class: "mon-grid" });
      G.monsters.slice().sort(function (a, b) { return St.power(b) - St.power(a); }).forEach(function (m) {
        var card = monsterCard(m, { active: m.id === G.activeId, scale: 5 });
        var btns = el("div", { class: "card-btns" }, [
          el("button", { class: "btn sm" + (m.id === G.activeId ? " on" : ""), onclick: function () { G.setActive(m.id); beep("click"); go("ranch"); } }, m.id === G.activeId ? "編成中" : "編成する"),
          el("button", { class: "btn sm ghost", onclick: function () { detail(m); } }, "詳細"),
          el("button", { class: "btn sm danger", onclick: function () { if (confirm(m.name + " を解体してパーツに戻しますか？")) { var r = G.release(m.id); if (!r.ok) toast(r.msg); else { beep("drop"); go("ranch"); } } } }, "解体")
        ]);
        card.appendChild(btns);
        grid.appendChild(card);
      });
      wrap.appendChild(grid);
      wrap.appendChild(el("button", { class: "btn ghost", onclick: function () { go("home"); } }, "← 戻る"));
      app.appendChild(wrap);
    }
  };
  function detail(m) {
    var ov = el("div", { class: "result-overlay", onclick: function (e) { if (e.target === ov) ov.remove(); } });
    var parts = el("div", { class: "part-detail" });
    MF.PART_SLOTS.forEach(function (sd) {
      var p = m.parts[sd.slot];
      parts.appendChild(el("div", { class: "pd-row" }, [
        el("span", { class: "pd-slot" }, sd.jp),
        p && p.variant !== "none" ? el("span", null, [MF.variantJP(sd.slot, p.variant) + " ", rarTag(p.rarity), famTag(p.family)]) : el("span", { class: "muted" }, "なし")
      ]));
    });
    var c = el("div", { class: "result-card wide" }, [
      el("h2", null, MF.Monster.displayName(m)), monsterCard(m, { full: true, scale: 6 }),
      evoSection(m, ov),
      el("h3", null, "パーツ構成"), parts,
      el("button", { class: "btn", onclick: function () { ov.remove(); } }, "閉じる")
    ]);
    ov.appendChild(c); $("app").appendChild(ov);
  }

  function evoSection(m, ov) {
    var info = MF.Evolution.evolveInfo(m);
    if (!info) return el("p", { class: "muted sm" }, "最終形態に到達している。");
    function cond(label, c) {
      return el("div", { class: "evo-cond" + (c.ok ? " ok" : "") }, [el("span", null, (c.ok ? "✓ " : "・ ") + label), el("b", null, c.have + " / " + c.need)]);
    }
    var box = el("div", { class: "evo-box" }, [
      el("div", { class: "evo-h" }, "⚡ 進化条件（次の段階）"),
      cond("レベル", info.level),
      cond("最大ステータス", info.stat),
      cond(MF.FAMILY_BY_ID[info.aff.family].jp + "の度合い", info.aff)
    ]);
    if (info.ready) box.appendChild(el("button", { class: "btn evo-btn", onclick: function () { ov.remove(); startEvolve(m.id, function () { go("ranch"); }); } }, "✨ 進化する！"));
    else box.appendChild(el("p", { class: "muted sm" }, "全条件を満たすと進化できる。"));
    return box;
  }

  // ================= 合体（2体→1体）=================
  var fusionSel = [];
  screens.fusion = {
    enter: function (app) {
      fusionSel = fusionSel.filter(function (id) { return G.getMonster(id); });
      app.appendChild(topbar());
      var wrap = el("div", { class: "wrap" }, [
        el("h2", null, "🧬 モンスター合体"),
        el("p", { class: "muted" }, "2体を素材に、各部位の最良パーツと育成値を継承した1体を生む。1部位は+1レアの合体ボーナス。レベルは高い方を引継ぐ。※素材2体は消費される。")
      ]);
      wrap.appendChild(el("div", { class: "fusion-preview", id: "fusionPrev" }));
      if (G.monsters.length < 2) wrap.appendChild(el("p", { class: "muted" }, "合体には2体以上のモンスターが必要です（牧場で組立／対戦して増やそう）。"));
      var grid = el("div", { class: "fusion-grid" });
      G.monsters.forEach(function (m) {
        var idx = fusionSel.indexOf(m.id);
        grid.appendChild(el("div", { class: "fusion-card" + (idx >= 0 ? " sel" : ""), onclick: function () {
          var i = fusionSel.indexOf(m.id);
          if (i >= 0) fusionSel.splice(i, 1);
          else { if (fusionSel.length >= 2) { beep("status"); toast("素材は2体まで"); return; } fusionSel.push(m.id); }
          beep("click"); go("fusion");
        } }, [idx >= 0 ? el("div", { class: "fusion-tag" }, idx === 0 ? "素材A" : "素材B") : null, monsterCard(m, { scale: 4 })]));
      });
      wrap.appendChild(grid);
      wrap.appendChild(el("button", { class: "btn ghost", onclick: function () { go("home"); } }, "← 戻る"));
      app.appendChild(wrap);
      renderFusionPreview();
    }
  };
  function renderFusionPreview() {
    var box = $("fusionPrev"); if (!box) return; clear(box);
    if (fusionSel.length < 2) {
      box.appendChild(el("p", { class: "muted" }, "素材を2体選ぶと、ここに合体結果が表示されます（あと " + (2 - fusionSel.length) + " 体）。"));
      return;
    }
    var pv = G.fusionPreview(fusionSel[0], fusionSel[1]);
    if (!pv) { box.appendChild(el("p", { class: "muted" }, "別々の2体を選んでください。")); return; }
    box.appendChild(el("div", { class: "fusion-arrow" }, [
      el("div", { class: "fusion-parents" }, [el("span", null, MF.Monster.displayName(pv.p1)), el("span", { class: "plus" }, "＋"), el("span", null, MF.Monster.displayName(pv.p2))]),
      el("span", { class: "fa-arr" }, "⬇")
    ]));
    box.appendChild(monsterCard(pv.child, { full: true, scale: 6 }));
    box.appendChild(el("p", { class: "muted sm" }, "⭐ " + MF.SLOT_BY_ID[pv.boostSlot].jp + " に +1レアの合体ボーナス。"));
    box.appendChild(el("div", { class: "fusion-cost" }, "費用 " + pv.cost + "G ／ 所持 " + G.gold + "G"));
    box.appendChild(el("button", { class: "btn", disabled: G.gold < pv.cost, onclick: function () {
      var r = G.fuseMonsters(fusionSel[0], fusionSel[1]);
      if (!r.ok) { toast(r.msg); return; }
      fusionSel = [];
      beep("win"); toast("🧬 " + MF.Monster.displayName(r.child) + " が誕生した！", "achv");
      go("ranch");
    } }, "🧬 合体する！"));
  }

  // ================= 組立（合成）=================
  var asmSel = {};
  screens.assemble = {
    enter: function (app) {
      asmSel = {};
      app.appendChild(topbar());
      var wrap = el("div", { class: "wrap" }, [el("h2", null, "🔧 組立 ― 改造種を作る"), el("p", { class: "muted" }, "各部位にパーツを割り当てて新しいモンスターを生み出す（最低3部位）。同系統で固めると度合いが上がり超必殺技が解禁される。")]);
      var layout = el("div", { class: "asm-layout" });
      // 左：スロット選択
      var slots = el("div", { class: "asm-slots" });
      MF.PART_SLOTS.forEach(function (sd) {
        var row = el("div", { class: "asm-row", id: "asm_" + sd.slot });
        renderAsmRow(row, sd);
        slots.appendChild(row);
      });
      // 右：プレビュー
      var preview = el("div", { class: "asm-preview", id: "asmPrev" });
      layout.appendChild(slots); layout.appendChild(preview);
      wrap.appendChild(layout);
      var foot = el("div", { class: "asm-foot" }, [
        el("input", { id: "asmName", placeholder: "名前（空欄で自動命名）", maxlength: 12 }),
        el("button", { class: "btn", id: "asmGo", onclick: doAssemble }, "組み立てる"),
        el("button", { class: "btn ghost", onclick: function () { go("home"); } }, "← 戻る")
      ]);
      wrap.appendChild(foot);
      app.appendChild(wrap);
      updateAsmPreview();
    }
  };
  function renderAsmRow(row, sd) {
    clear(row);
    var pool = G.partsBySlot(sd.slot);
    row.appendChild(el("span", { class: "asm-slot-name" }, sd.jp));
    var sel = asmSel[sd.slot];
    var chips = el("div", { class: "asm-chips" });
    if (!pool.length) chips.appendChild(el("span", { class: "muted sm" }, "手持ちなし"));
    pool.forEach(function (p) {
      chips.appendChild(el("button", { class: "pchip" + (sel && sel.pid === p.pid ? " on" : ""), style: "border-color:" + MF.RARITY_COLOR[p.rarity], onclick: function () {
        if (sel && sel.pid === p.pid) delete asmSel[sd.slot]; else asmSel[sd.slot] = p;
        renderAsmRow(row, sd); updateAsmPreview(); beep("click");
      } }, [el("span", null, MF.variantJP(sd.slot, p.variant)), el("small", { style: "color:" + MF.RARITY_COLOR[p.rarity] }, MF.RARITY[p.rarity][0]), el("small", { class: "fam-dot" }, MF.FAMILY_BY_ID[p.family].emoji)]));
    });
    row.appendChild(chips);
  }
  function updateAsmPreview() {
    var prev = $("asmPrev"); if (!prev) return; clear(prev);
    var slots = Object.keys(asmSel).filter(function (s) { return asmSel[s]; });
    if (slots.length < 1) { prev.appendChild(el("p", { class: "muted" }, "パーツを選ぶとプレビューが表示されます。")); $("asmGo").disabled = true; return; }
    var partsMap = {}; slots.forEach(function (s) { partsMap[s] = asmSel[s]; });
    var ghost = MF.Monster.fromParts(partsMap, { name: "プレビュー" });
    var cost = G.assembleCost(asmSel);
    prev.appendChild(monsterCard(ghost, { full: true, scale: 7 }));
    prev.appendChild(el("div", { class: "asm-cost" }, "費用 " + cost + "G ／ 所持 " + G.gold + "G"));
    $("asmGo").disabled = slots.length < 3 || G.gold < cost;
  }
  function doAssemble() {
    var name = $("asmName").value;
    var r = G.assemble(asmSel, name);
    if (!r.ok) { toast(r.msg); return; }
    beep("win"); toast("✨ " + r.monster.name + " が誕生した！", "achv");
    go("ranch");
  }

  // ================= 融合（製造）=================
  var fuseSel = [];
  function fuseSlotLocked() {
    if (!fuseSel.length) return null;
    var p = G.inventory.find(function (x) { return x.pid === fuseSel[0]; });
    return p ? p.slot : null;
  }
  screens.fuse = {
    enter: function (app) {
      fuseSel = fuseSel.filter(function (id) { return G.inventory.find(function (p) { return p.pid === id; }); });
      app.appendChild(topbar());
      var wrap = el("div", { class: "wrap" }, [
        el("h2", null, "🧪 パーツ融合 ― 工場の製造ライン"),
        el("p", { class: "muted" }, "同じ部位のパーツを3個投入すると、レアリティが1つ上のパーツを1個製造できる（最高ミシック）。余ったパーツを資源に変え、運に頼らず頂点を目指せる。")
      ]);
      // 結果プレビュー
      var lock = fuseSlotLocked();
      var preview = el("div", { class: "fuse-result", id: "fuseRes" });
      wrap.appendChild(preview);
      // インベントリ（部位ごと）
      var inv = el("div", { class: "fuse-inv" });
      MF.PART_SLOTS.forEach(function (sd) {
        var pool = G.partsBySlot(sd.slot).sort(function (a, b) { return (b.rarity || 0) - (a.rarity || 0); });
        if (!pool.length) return;
        var dim = lock && lock !== sd.slot;
        var group = el("div", { class: "fuse-group" + (dim ? " dim" : "") }, [el("div", { class: "fuse-glabel" }, sd.jp)]);
        var chips = el("div", { class: "asm-chips" });
        pool.forEach(function (p) {
          var sel = fuseSel.indexOf(p.pid) >= 0;
          var disabled = (dim || (fuseSel.length >= 3 && !sel));
          chips.appendChild(el("button", { class: "pchip" + (sel ? " on" : "") + (disabled ? " off" : ""), style: "border-color:" + MF.RARITY_COLOR[p.rarity], onclick: function () {
            if (sel) fuseSel = fuseSel.filter(function (id) { return id !== p.pid; });
            else { if (disabled) { beep("status"); return; } fuseSel.push(p.pid); }
            beep("click"); go("fuse");
          } }, [el("span", null, MF.variantJP(sd.slot, p.variant)), el("small", { style: "color:" + MF.RARITY_COLOR[p.rarity] }, MF.RARITY[p.rarity]), el("small", { class: "fam-dot" }, MF.FAMILY_BY_ID[p.family].emoji)]));
        });
        group.appendChild(chips);
        inv.appendChild(group);
      });
      if (!inv.children.length) inv.appendChild(el("p", { class: "muted" }, "パーツがありません。冒険で集めよう。"));
      wrap.appendChild(inv);
      wrap.appendChild(el("button", { class: "btn ghost", onclick: function () { go("home"); } }, "← 戻る"));
      app.appendChild(wrap);
      renderFuseResult();
    },
    exit: function () {}
  };
  function renderFuseResult() {
    var box = $("fuseRes"); if (!box) return; clear(box);
    var parts = fuseSel.map(function (id) { return G.inventory.find(function (p) { return p.pid === id; }); }).filter(Boolean);
    if (parts.length < 3) {
      box.appendChild(el("p", { class: "muted" }, "同じ部位のパーツを3個選ぶと、ここに製造結果が出ます（あと " + (3 - parts.length) + " 個）。"));
      return;
    }
    var slot = parts[0].slot;
    var maxR = Math.max.apply(null, parts.map(function (p) { return p.rarity || 0; }));
    var resR = Math.min(5, maxR + 1);
    var cost = G.fuseCost(fuseSel);
    box.appendChild(el("div", { class: "fuse-arrow" }, [
      el("div", { class: "fuse-in" }, parts.map(function (p) { return el("span", { class: "rar", style: "color:" + MF.RARITY_COLOR[p.rarity] }, MF.RARITY[p.rarity][0]); })),
      el("span", { class: "fa-arr" }, "→"),
      el("div", { class: "fuse-out" }, [el("b", { style: "color:" + MF.RARITY_COLOR[resR] }, MF.SLOT_BY_ID[slot].jp + "・" + MF.RARITY[resR])])
    ]));
    box.appendChild(el("p", { class: "muted sm" }, "見た目・系統は素材のいずれかを継承（ランダム）。費用 " + cost + "G ／ 所持 " + G.gold + "G"));
    box.appendChild(el("button", { class: "btn", disabled: G.gold < cost, onclick: function () {
      var r = G.fuse(fuseSel.slice());
      if (!r.ok) { toast(r.msg); return; }
      fuseSel = [];
      beep("win"); toast("🧪 " + MF.SLOT_BY_ID[r.part.slot].jp + "（" + MF.RARITY[r.part.rarity] + "）を製造！", "achv");
      go("fuse");
    } }, "製造する"));
  }

  // ================= トレーニング =================
  var trainSel = null;
  screens.training = {
    enter: function (app) {
      trainSel = trainSel && G.getMonster(trainSel) ? trainSel : G.activeId;
      app.appendChild(topbar());
      var wrap = el("div", { class: "wrap" }, [el("h2", null, "💪 トレーニング"), el("p", { class: "muted" }, "メニューごとに複数のステータスが上がり、トレードオフで一部が下がる（1回 " + MF.BAL.trainCost + "G）。理想の形を作ろう。")]);
      var picker = el("div", { class: "train-picker" });
      G.monsters.forEach(function (mm) {
        picker.appendChild(el("button", { class: "btn sm" + (mm.id === trainSel ? " on" : ""), onclick: function () { trainSel = mm.id; go("training"); } }, MF.Monster.displayName(mm)));
      });
      wrap.appendChild(picker);
      var m = G.getMonster(trainSel);
      var area = el("div", { class: "train-area" }, [monsterCard(m, { full: true, scale: 6 })]);
      var menu = el("div", { class: "train-menu" });
      MF.TRAININGS.forEach(function (t) {
        menu.appendChild(el("button", { class: "btn train-btn", onclick: function () {
          if (G.gold < MF.BAL.trainCost) { toast("Gが足りません（必要 " + MF.BAL.trainCost + "G）。"); return; }
          playTrainAnim(m, t, function () {
            var r = G.train(trainSel, t.id);
            if (!r.ok) { toast(r.msg); return; }
            beep("heal");
            toast(t.emoji + t.jp + "：" + r.res.changes.map(function (c) { return c.statJp + (c.amt >= 0 ? "+" : "") + c.amt; }).join(" / "));
            go("training");
          });
        } }, [el("b", null, t.emoji + " " + t.jp), el("small", { class: "tup" }, "▲ " + t.up), el("small", { class: "tdn" }, "▼ " + t.down)]));
      });
      area.appendChild(menu);
      wrap.appendChild(area);
      wrap.appendChild(el("button", { class: "btn ghost", onclick: function () { go("home"); } }, "← 戻る"));
      app.appendChild(wrap);
    }
  };

  // トレーニング・アニメーション
  function playTrainAnim(m, t, done) {
    var ov = el("div", { class: "train-overlay" });
    var stage = el("div", { class: "train-stage anim-" + t.anim }, [spriteCanvas(m, 7)]);
    var label = el("div", { class: "train-label" }, t.emoji + " " + t.jp + "！");
    ov.appendChild(stage); ov.appendChild(label); $("app").appendChild(ov);
    beep("click");
    var fx = { run: "💨", meditate: "✨", muscle: "🔥", spar: "💢", meal: "🍖", lottery: "🎲" }[t.anim] || "✨";
    for (var i = 0; i < 7; i++) {
      (function (k) {
        setTimeout(function () {
          var e = el("div", { class: "train-fx", style: "left:" + (15 + Math.random() * 70) + "%;top:" + (25 + Math.random() * 45) + "%" }, fx);
          stage.appendChild(e); setTimeout(function () { e.remove(); }, 800);
        }, k * 130);
      })(i);
    }
    setTimeout(function () { ov.remove(); done && done(); }, 1250);
  }

  // ================= 図鑑 =================
  var dexFilter = { fam: "all", rank: "all", show: "all" };
  screens.dex = {
    enter: function (app) {
      app.appendChild(topbar());
      var c = G.dexCounts();
      var wrap = el("div", { class: "wrap" }, [el("h2", null, "📖 図鑑"), el("p", { class: "muted" }, "発見 " + c.seen + " ／ 捕獲 " + c.captured + " ／ ✨色違い " + c.shiny + " ／ 全 " + c.total)]);
      // フィルタ
      var filt = el("div", { class: "dex-filter" });
      filt.appendChild(filterSel("系統", [["all", "全系統"]].concat(MF.FAMILIES.map(function (f) { return [f.id, f.jp]; })), dexFilter.fam, function (v) { dexFilter.fam = v; go("dex"); }));
      filt.appendChild(filterSel("ランク", [["all", "全ランク"]].concat(MF.RANKS.map(function (r) { return [r, r]; })), dexFilter.rank, function (v) { dexFilter.rank = v; go("dex"); }));
      filt.appendChild(filterSel("表示", [["all", "すべて"], ["seen", "発見済み"], ["captured", "捕獲済み"]], dexFilter.show, function (v) { dexFilter.show = v; go("dex"); }));
      wrap.appendChild(filt);
      var grid = el("div", { class: "dex-grid" });
      for (var id = 0; id < MF.Species.TOTAL; id++) {
        if (dexFilter.fam !== "all" && MF.Species.familyOf(id) !== dexFilter.fam) continue;
        if (dexFilter.rank !== "all" && MF.Species.rankOf(id) !== dexFilter.rank) continue;
        var seen = !!G.dex.seen[id], cap = !!G.dex.captured[id];
        if (dexFilter.show === "seen" && !seen) continue;
        if (dexFilter.show === "captured" && !cap) continue;
        grid.appendChild(dexCell(id, seen, cap));
      }
      wrap.appendChild(grid);
      wrap.appendChild(el("button", { class: "btn ghost", onclick: function () { go("home"); } }, "← 戻る"));
      app.appendChild(wrap);
    }
  };
  function filterSel(label, opts, val, onch) {
    var s = el("select", { onchange: function (e) { beep("click"); onch(e.target.value); } });
    opts.forEach(function (o) { var op = el("option", { value: o[0] }, o[1]); if (o[0] === val) op.selected = true; s.appendChild(op); });
    return el("label", { class: "fsel" }, [label, s]);
  }
  function dexCell(id, seen, cap) {
    var cell = el("div", { class: "dex-cell" + (cap ? " cap" : seen ? " seen" : " unknown") });
    if (seen) {
      var sp = MF.Species.get(id);
      if (G.dex.shiny && G.dex.shiny[id]) cell.appendChild(el("div", { class: "dx-shiny" }, "✨"));
      cell.appendChild(spriteCanvas(sp, 3));
      cell.appendChild(el("div", { class: "dx-no" }, "No." + (id + 1)));
      cell.appendChild(el("div", { class: "dx-name" }, cap ? sp.name : "？？？"));
      cell.appendChild(el("div", { class: "dx-sub" }, [rankBadge(sp.rank), el("span", { class: "fam-dot" }, MF.FAMILY_BY_ID[sp.family].emoji)]));
      cell.addEventListener("click", function () { beep("click"); dexDetail(id); });
    } else {
      cell.appendChild(el("div", { class: "dx-silh" }, "?"));
      cell.appendChild(el("div", { class: "dx-no" }, "No." + (id + 1)));
    }
    return cell;
  }
  function dexDetail(id) {
    var sp = MF.Species.get(id), cap = !!G.dex.captured[id];
    var ov = el("div", { class: "result-overlay", onclick: function (e) { if (e.target === ov) ov.remove(); } });
    var pseudo = { parts: sp.parts, base: sp.base, growth: {}, affinity: sp.affinity, rank: sp.rank, name: cap ? sp.name : "？？？", isOriginal: true, spriteKey: sp.spriteKey, spriteSeed: sp.spriteSeed, id: sp.id };
    var c = el("div", { class: "result-card wide" }, [
      el("h2", null, "No." + (id + 1) + " " + (cap ? sp.name : "？？？")),
      monsterCard(pseudo, { full: true, scale: 7 }),
      el("p", { class: "muted" }, cap ? "捕獲済み（このパーツをドロップで入手できる）" : "未捕獲：倒してパーツを手に入れよう。"),
      el("button", { class: "btn", onclick: function () { ov.remove(); } }, "閉じる")
    ]);
    ov.appendChild(c); $("app").appendChild(ov);
  }

  // ================= 実績 =================
  screens.achievements = {
    enter: function (app) {
      app.appendChild(topbar());
      var got = Object.keys(G.achievements.unlocked).length;
      var wrap = el("div", { class: "wrap" }, [el("h2", null, "🎖 実績"), el("p", { class: "muted" }, got + " / " + MF.ACHIEVEMENTS.length + " 解除")]);
      var grid = el("div", { class: "achv-grid" });
      MF.ACHIEVEMENTS.forEach(function (a) {
        var on = !!G.achievements.unlocked[a.id];
        grid.appendChild(el("div", { class: "achv" + (on ? " on" : "") }, [
          el("div", { class: "achv-ic" }, on ? "🏆" : "🔒"),
          el("div", null, [el("div", { class: "achv-n" }, a.name), el("div", { class: "achv-d" }, a.desc)])
        ]));
      });
      wrap.appendChild(grid);
      wrap.appendChild(el("button", { class: "btn ghost", onclick: function () { go("home"); } }, "← 戻る"));
      app.appendChild(wrap);
    }
  };

  // ================= 設定 =================
  screens.settings = {
    enter: function (app) {
      app.appendChild(topbar());
      var wrap = el("div", { class: "wrap" }, [el("h2", null, "⚙️ 設定")]);
      if (!isStandalone()) {
        wrap.appendChild(el("div", { class: "set-row" }, [
          el("span", null, "📲 ホーム画面に追加"),
          el("button", { class: "btn sm", onclick: function () { beep("click"); promptInstall(); } }, "アプリ化")
        ]));
      }
      wrap.appendChild(el("div", { class: "set-row" }, [
        el("span", null, "戦闘速度"),
        el("button", { class: "btn sm", onclick: function () { G.settings.battleSpeed = G.settings.battleSpeed === 1 ? 2 : G.settings.battleSpeed === 2 ? 3 : 1; G.save(); go("settings"); } }, "×" + G.settings.battleSpeed)
      ]));
      wrap.appendChild(el("div", { class: "set-row" }, [
        el("span", null, "効果音"),
        el("button", { class: "btn sm", onclick: function () { G.settings.sfx = !G.settings.sfx; G.save(); beep("click"); go("settings"); } }, G.settings.sfx ? "ON" : "OFF")
      ]));
      wrap.appendChild(el("div", { class: "set-row" }, [
        el("span", null, "セーブデータ"),
        el("button", { class: "btn sm danger", onclick: function () { if (confirm("全データを削除して最初から始めますか？")) { G.resetAll(); toast("データを初期化しました"); go("title"); } } }, "初期化")
      ]));
      wrap.appendChild(el("p", { class: "muted" }, "進行は自動保存されます（ブラウザのローカル保存）。"));
      wrap.appendChild(el("button", { class: "btn ghost", onclick: function () { go("home"); } }, "← 戻る"));
      app.appendChild(wrap);
    }
  };

  // ---------- ブート ----------
  function boot() {
    G.init();
    go("title");
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})(window.MF = window.MF || {});
