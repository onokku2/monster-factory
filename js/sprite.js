/* sprite.js — パーツ定義から Canvas にドット絵を手続き生成する。
 * 画像アセットを持たず、組み合わせで無限のモンスターを描く中核。
 * 各パーツは自分の系統・レアリティのパレットで描かれ、改造種はキメラ的に混ざる。 */
(function (MF) {
  "use strict";
  var N = MF.BAL.spriteN; // 32
  var clamp = MF.clamp;

  // ---- グリッド操作 ----
  function makeGrid() { return { N: N, data: new Array(N * N).fill(null) }; }
  function inb(x, y) { return x >= 0 && x < N && y >= 0 && y < N; }
  function set(g, x, y, c) { x = Math.round(x); y = Math.round(y); if (inb(x, y)) g.data[y * N + x] = c; }
  function get(g, x, y) { return inb(x, y) ? g.data[y * N + x] : null; }
  function px(g, x, y, c) { set(g, x, y, c); set(g, N - 1 - x, y, c); } // 左右対称
  function hseg(g, cx, y, hw, c) { for (var x = cx - hw; x <= cx + hw; x++) set(g, x, y, c); }
  function rect(g, x, y, w, h, c) { for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) set(g, x + i, y + j, c); }

  // 円/楕円（中心対称なのでミラー不要）。上→明 / 下→暗 の縦シェーディング。
  function blob(g, cx, cy, rx, ry, pal) {
    for (var y = Math.ceil(cy - ry); y <= cy + ry; y++) {
      for (var x = Math.ceil(cx - rx); x <= cx + rx; x++) {
        var nx = (x - cx) / rx, ny = (y - cy) / ry;
        if (nx * nx + ny * ny <= 1) {
          var c = pal.main;
          if (ny < -0.34) c = pal.light; else if (ny > 0.5) c = pal.dark;
          set(g, x, y, c);
        }
      }
    }
  }
  function disc(g, cx, cy, r, c) {
    for (var y = -r; y <= r; y++) for (var x = -r; x <= r; x++) if (x * x + y * y <= r * r) set(g, cx + x, cy + y, c);
  }
  // 円錐/三角（角・牙・尾の節）。up=true で上向きに細る。
  function cone(g, cx, baseY, h, halfW, c, up) {
    for (var j = 0; j < h; j++) {
      var t = h > 1 ? j / (h - 1) : 0;
      var w = Math.round(halfW * (1 - t));
      var y = up ? baseY - j : baseY + j;
      hseg(g, cx, y, w, c);
    }
  }

  // 縁取り：塗りピクセルに隣接する空セルを輪郭色に。背景から浮かせる。
  function outline(g, edge) {
    var out = [];
    for (var y = 0; y < N; y++) for (var x = 0; x < N; x++) {
      if (get(g, x, y)) continue;
      if (get(g, x - 1, y) || get(g, x + 1, y) || get(g, x, y - 1) || get(g, x, y + 1)) out.push([x, y]);
    }
    for (var k = 0; k < out.length; k++) set(g, out[k][0], out[k][1], edge);
  }

  // ---- パレット（系統hue × レアリティ）----
  function hsl(h, s, l) { return "hsl(" + ((h % 360 + 360) % 360) + " " + clamp(s, 0, 100) + "% " + clamp(l, 0, 100) + "%)"; }
  function palette(seedNum, familyId, rarity, shiny) {
    var fam = MF.FAMILY_BY_ID[familyId] || MF.FAMILIES[0];
    var r = new MF.RNG(seedNum);
    var h = Math.round(fam.hue[0] + r.next() * (fam.hue[1] - fam.hue[0]));
    var sat = clamp(48 + rarity * 7, 40, 96);
    var L = 53;
    if (shiny) { h = (h + 155) % 360; sat = clamp(sat + 20, 0, 100); } // 色違い＝色相反転＋鮮やか
    return {
      main: hsl(h, sat, L),
      light: hsl(h, sat - 8, Math.min(84, L + 19)),
      dark: hsl(h, sat, Math.max(20, L - 21)),
      accent: rarity >= 4 ? hsl(h + 168, 86, 62) : hsl(h, sat, L + 9),
      glow: hsl(h + 24, 92, 70),
      hue: h, sat: sat
    };
  }

  // 目を1つ描く
  function eyeAt(g, x, y, r, pal, style) {
    if (style === "sleepy") { hseg(g, x, y, r, "#23203a"); return; }
    disc(g, x, y, r, "#f4f1ff");
    var pc = style === "glow" ? pal.glow : "#241c3a";
    disc(g, x, y, Math.max(1, r - 1), pc);
    set(g, x, y - (r - 1), "#ffffff"); // ハイライト
  }

  // ============ パーツ別 描画関数 ============
  // すべて draw(g, part, pal, rng)。座標系は 32x32、中心 cx≈16。
  var DR = {
    body: {
      round: function (g, p, pal) { blob(g, 16, 19, 8, 8, pal); },
      tall: function (g, p, pal) { blob(g, 16, 18, 6, 10, pal); },
      blocky: function (g, p, pal) {
        for (var y = 11; y <= 28; y++) for (var x = 8; x <= 23; x++) {
          var c = y < 15 ? pal.light : y > 24 ? pal.dark : pal.main; set(g, x, y, c);
        }
      },
      slime: function (g, p, pal) { blob(g, 16, 21, 9, 6, pal); blob(g, 16, 16, 5, 4, pal); },
      hunch: function (g, p, pal) { blob(g, 16, 20, 8, 7, pal); blob(g, 16, 13, 5, 4, pal); }
    },
    skin: { // ボディ上に質感を重ねる
      scale: function (g, p, pal) {
        for (var y = 14; y <= 25; y += 2) for (var x = 11; x <= 16; x += 2) { px(g, x, y, pal.dark); }
      },
      metal: function (g, p, pal) { for (var x = 10; x <= 16; x++) { px(g, x, 15, pal.light); } hseg(g, 16, 22, 6, pal.dark); },
      chitin: function (g, p, pal) { hseg(g, 16, 16, 7, pal.dark); hseg(g, 16, 20, 7, pal.dark); hseg(g, 16, 24, 5, pal.dark); },
      stone: function (g, p, pal) { px(g, 12, 17, pal.dark); px(g, 14, 21, pal.dark); px(g, 11, 23, pal.light); px(g, 13, 14, pal.light); },
      aura: function (g, p, pal) { for (var a = 0; a < 8; a++) { var an = a / 8 * Math.PI * 2; set(g, Math.round(16 + Math.cos(an) * 11), Math.round(19 + Math.sin(an) * 11), pal.glow); } }
    },
    eye: {
      double: function (g, p, pal) { eyeAt(g, 12, 16, 2, pal, "n"); eyeAt(g, 19, 16, 2, pal, "n"); },
      single: function (g, p, pal) { eyeAt(g, 16, 16, 3, pal, "n"); },
      triple: function (g, p, pal) { eyeAt(g, 12, 17, 2, pal, "n"); eyeAt(g, 19, 17, 2, pal, "n"); eyeAt(g, 16, 12, 2, pal, "n"); },
      glow: function (g, p, pal) { eyeAt(g, 12, 16, 2, pal, "glow"); eyeAt(g, 19, 16, 2, pal, "glow"); },
      sleepy: function (g, p, pal) { eyeAt(g, 12, 16, 2, pal, "sleepy"); eyeAt(g, 19, 16, 2, pal, "sleepy"); }
    },
    horn: {
      curved: function (g, p, pal) { for (var j = 0; j < 6; j++) { px(g, 12 - j * 0.4, 11 - j, pal.light); px(g, 12 - j * 0.4, 11 - j + 1 > 11 ? 11 : 12 - j, pal.main); } px(g, 10, 6, pal.accent); },
      straight: function (g, p, pal) { cone(g, 12, 11, 6, 1, pal.light, true); cone(g, 19, 11, 6, 1, pal.light, true); },
      crown: function (g, p, pal) { for (var x = 10; x <= 16; x += 2) px(g, x, 9, pal.accent); hseg(g, 16, 11, 6, pal.dark); },
      ram: function (g, p, pal) { px(g, 11, 11, pal.dark); px(g, 9, 11, pal.main); px(g, 9, 13, pal.main); px(g, 10, 14, pal.light); },
      none: function () {}
    },
    ear: {
      pointy: function (g, p, pal) { cone(g, 9, 13, 4, 1, pal.main, true); px(g, 9, 13, pal.dark); cone(g, 22, 13, 4, 1, pal.main, true); },
      round: function (g, p, pal) { disc(g, 9, 12, 2, pal.main); disc(g, 22, 12, 2, pal.main); },
      long: function (g, p, pal) { cone(g, 10, 14, 7, 1, pal.main, true); cone(g, 21, 14, 7, 1, pal.main, true); },
      fin: function (g, p, pal) { for (var j = 0; j < 4; j++) { px(g, 8 - j, 13 - j, pal.glow); } },
      none: function () {}
    },
    fang: {
      tusk: function (g, p, pal) { cone(g, 13, 23, 3, 1, "#fbf7e8", false); cone(g, 18, 23, 3, 1, "#fbf7e8", false); },
      sabre: function (g, p, pal) { cone(g, 13, 24, 5, 1, "#fbf7e8", false); cone(g, 18, 24, 5, 1, "#fbf7e8", false); },
      pair: function (g, p, pal) { set(g, 14, 22, "#fff"); set(g, 14, 23, "#fff"); set(g, 17, 22, "#fff"); set(g, 17, 23, "#fff"); },
      beak: function (g, p, pal) { cone(g, 16, 24, 4, 2, pal.accent, false); },
      none: function () {}
    },
    arm: {
      normal: function (g, p, pal) { blob(g, 8, 21, 2, 4, pal); blob(g, 23, 21, 2, 4, pal); },
      mech: function (g, p, pal) { rect(g, 5, 19, 3, 6, pal.dark); rect(g, 24, 19, 3, 6, pal.dark); px(g, 6, 19, pal.light); },
      tentacle: function (g, p, pal) { for (var j = 0; j < 7; j++) { px(g, 7 - (j % 2), 19 + j, j % 2 ? pal.dark : pal.main); } },
      blade: function (g, p, pal) { blob(g, 8, 20, 2, 3, pal); cone(g, 7, 24, 5, 1, "#dfe7ff", false); blob(g, 23, 20, 2, 3, pal); cone(g, 24, 24, 5, 1, "#dfe7ff", false); },
      none: function () {}
    },
    leg: {
      digit: function (g, p, pal) { blob(g, 12, 27, 2, 3, pal); blob(g, 19, 27, 2, 3, pal); },
      hoof: function (g, p, pal) { rect(g, 10, 26, 3, 4, pal.main); rect(g, 19, 26, 3, 4, pal.main); hseg(g, 11, 29, 1, pal.dark); hseg(g, 20, 29, 1, pal.dark); },
      mech: function (g, p, pal) { rect(g, 11, 26, 2, 5, pal.dark); rect(g, 19, 26, 2, 5, pal.dark); },
      multi: function (g, p, pal) { for (var x = 9; x <= 16; x += 2) { px(g, x, 27, pal.dark); px(g, x, 28, pal.main); } },
      float: function (g, p, pal) { for (var a = 0; a < 6; a++) set(g, Math.round(13 + a), 29 + (a % 2), pal.glow); }
    },
    wing: {
      feather: function (g, p, pal) { for (var j = 0; j < 8; j++) { px(g, 6 - (j < 4 ? j : 7 - j), 13 + j, pal.light); px(g, 7 - (j < 4 ? j : 7 - j), 13 + j, pal.main); } },
      bat: function (g, p, pal) { for (var j = 0; j < 7; j++) { px(g, 6 - j * 0.3, 13 + j, pal.dark); } px(g, 3, 14, pal.dark); px(g, 4, 18, pal.dark); },
      insect: function (g, p, pal) { blob(g, 5, 16, 3, 5, { main: pal.glow, light: pal.glow, dark: pal.main }); },
      mech: function (g, p, pal) { rect(g, 3, 14, 4, 2, pal.dark); rect(g, 3, 18, 4, 2, pal.dark); rect(g, 25, 14, 4, 2, pal.dark); rect(g, 25, 18, 4, 2, pal.dark); },
      none: function () {}
    },
    claw: {
      sharp: function (g, p, pal) { cone(g, 12, 31, 3, 1, "#eef", false); cone(g, 19, 31, 3, 1, "#eef", false); },
      hook: function (g, p, pal) { px(g, 8, 25, "#eef"); px(g, 7, 26, "#eef"); px(g, 23, 25, "#eef"); },
      talon: function (g, p, pal) { px(g, 11, 30, "#fff"); px(g, 13, 30, "#fff"); px(g, 12, 31, "#fff"); px(g, 18, 30, "#fff"); px(g, 20, 30, "#fff"); },
      none: function () {}
    },
    tail: { // 右側に非対称（px は使わず set）
      long: function (g, p, pal) { for (var j = 0; j < 9; j++) set(g, 24 + Math.round(Math.sin(j / 2) * 2), 24 + j > 31 ? 31 : 24 + j, pal.main); },
      spike: function (g, p, pal) { cone(g, 25, 22, 6, 2, pal.dark, false); set(g, 25, 28, pal.accent); },
      fan: function (g, p, pal) { for (var a = -2; a <= 2; a++) cone(g, 25 + a, 26, 4, 0, pal.glow, false); },
      mech: function (g, p, pal) { rect(g, 24, 23, 2, 7, pal.dark); rect(g, 23, 29, 4, 2, pal.dark); },
      whip: function (g, p, pal) { for (var j = 0; j < 10; j++) set(g, 24 + Math.round(Math.cos(j / 1.6) * 3), 22 + j > 31 ? 31 : 22 + j, pal.main); }
    }
  };
  MF.DRAWS = DR;

  // ---- モンスター1体をグリッドに合成 ----
  function buildGrid(monster) {
    var g = makeGrid();
    var seedBase = monster.spriteSeed != null ? monster.spriteSeed : MF.hashSeed(monster.id || "x");
    for (var i = 0; i < MF.DRAW_ORDER.length; i++) {
      var slot = MF.DRAW_ORDER[i];
      var part = monster.parts[slot];
      if (!part || part.variant === "none") continue;
      var fn = DR[slot] && DR[slot][part.variant];
      if (!fn) continue;
      var pal = palette((part.seed != null ? part.seed : seedBase) ^ (i * 2654435761), part.family, part.rarity || 0, monster.shiny);
      fn(g, part, pal, new MF.RNG(seedBase + i));
    }
    outline(g, "#0d0a16");
    // 進化オーラ（外周の発光リング）。段階が上がるほど派手に。
    var evo = monster.evoStage || 0;
    if (evo >= 1) outline(g, "#ffd24a");
    if (evo >= 2) outline(g, "#7cf0ff");
    return g;
  }

  // グリッド→Canvas（整数倍拡大、補間オフ）。frame で待機/攻撃の微動。
  function renderToCanvas(monster, scale, frame) {
    var g = buildGrid(monster);
    var cv = document.createElement("canvas");
    cv.width = N * scale; cv.height = N * scale;
    var ctx = cv.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    var bob = frame ? Math.round(Math.sin(frame / 18) * 0.5) : 0; // 呼吸の揺れ
    for (var y = 0; y < N; y++) for (var x = 0; x < N; x++) {
      var c = g.data[y * N + x];
      if (c) { ctx.fillStyle = c; ctx.fillRect(x * scale, (y + bob) * scale, scale, scale); }
    }
    return cv;
  }

  // 種族/モンスターのサムネをキャッシュ（同一見た目は描き直さない）
  var cache = {}, cacheCount = 0;
  function thumb(monster, scale) {
    scale = scale || 4;
    var key = (monster.spriteKey || monster.id || "m") + "@" + scale + "e" + (monster.evoStage || 0) + (monster.shiny ? "s" : "");
    if (cache[key]) return cache[key];
    if (cacheCount > 600) { cache = {}; cacheCount = 0; } // 長時間プレイでの無制限増殖を防ぐ
    var cv = renderToCanvas(monster, scale, 0);
    cache[key] = cv; cacheCount++;
    return cv;
  }
  function clearCache() { cache = {}; cacheCount = 0; }

  MF.Sprite = {
    buildGrid: buildGrid,
    renderToCanvas: renderToCanvas,
    thumb: thumb,
    palette: palette,
    clearCache: clearCache,
    N: N
  };
})(window.MF = window.MF || {});
